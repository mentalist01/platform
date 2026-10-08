import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const JOURNAL = 'group-member-transfer.transaction.json';
const FILES = new Set(['learning-groups.json', 'group-availability.json']);

function syncDirectory(directory) {
  let fd;
  try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
  catch (error) { if (!['EINVAL', 'EPERM', 'EISDIR', 'ENOTSUP'].includes(error.code)) throw error; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function writeDurable(file, contents) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
    syncDirectory(directory);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function restore(directory, entry, direction) {
  const file = path.join(directory, entry.name);
  const contents = entry[direction];
  if (contents === null) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    syncDirectory(directory);
  } else writeDurable(file, contents);
}

// Recovery runs before either store is loaded. A crash during the synchronous
// commit finishes the durable intent; a failed commit recovers its rollback.
export function recoverGroupTransferTransaction(directory) {
  const journalFile = path.join(directory, JOURNAL);
  if (!fs.existsSync(journalFile)) return false;
  const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
  if (journal.version !== 1 || !['commit', 'rollback'].includes(journal.state)
    || !Array.isArray(journal.entries) || journal.entries.length !== FILES.size
    || new Set(journal.entries.map(entry => entry.name)).size !== FILES.size
    || journal.entries.some(entry => !FILES.has(entry.name)
      || typeof entry.after !== 'string' || (entry.before !== null && typeof entry.before !== 'string'))) {
    throw new Error('Invalid group transfer recovery journal');
  }
  for (const entry of journal.entries) restore(directory, entry, journal.state === 'rollback' ? 'before' : 'after');
  fs.unlinkSync(journalFile); syncDirectory(directory);
  return true;
}

export function commitGroupTransferTransaction(directory, groups, availability, options = {}) {
  recoverGroupTransferTransaction(directory);
  const journalFile = path.join(directory, JOURNAL);
  const entries = [['learning-groups.json', groups], ['group-availability.json', availability]].map(([name, value]) => {
    const file = path.join(directory, name);
    return { name, before: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, after: JSON.stringify(value) };
  });
  const journal = { version: 1, state: 'commit', entries };
  writeDurable(journalFile, JSON.stringify(journal));
  try {
    for (const entry of entries) {
      restore(directory, entry, 'after');
      options.afterWrite?.(entry.name);
    }
    fs.unlinkSync(journalFile); syncDirectory(directory);
  } catch (error) {
    // Journal the rollback decision first, so a second crash cannot turn an
    // acknowledged failure into a transfer on the next startup.
    writeDurable(journalFile, JSON.stringify({ ...journal, state: 'rollback' }));
    recoverGroupTransferTransaction(directory);
    throw error;
  }
}
