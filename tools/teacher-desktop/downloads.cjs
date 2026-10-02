'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeDownloadName } = require('./policy.cjs');

function inside(directory, file) { const relative = path.relative(directory, file); return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.dirname(relative) === '.'; }
function reserveDownload(directory, filename) {
  fs.mkdirSync(directory, { recursive: true });
  const name = safeDownloadName(filename), ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  for (let number = 0; number < 10000; number++) {
    const file = path.join(directory, number ? `${stem} (${number})${ext}` : name);
    try { fs.closeSync(fs.openSync(file, 'wx')); return file; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('Не удалось выбрать имя файла.');
}
class Downloads {
  constructor(directory, history, notify = () => {}) {
    this.directory = directory; this.history = history; this.notify = notify; this.entries = [];
    try { const data = JSON.parse(fs.readFileSync(history, 'utf8')); if (Array.isArray(data)) this.entries = data.filter(e => e.state === 'completed' && typeof e.id === 'string' && typeof e.file === 'string' && inside(directory, e.file)).slice(0, 50); } catch { /* First run. */ }
  }
  existing(id) {
    const entry = this.entries.find(e => e.id === id && e.state === 'completed');
    if (!entry || !inside(this.directory, entry.file)) throw new Error('Файл ещё не скачан.');
    try { const info = fs.lstatSync(entry.file); if (!info.isFile() || info.isSymbolicLink()) throw new Error(); } catch { throw new Error('Файл перемещён или удалён.'); }
    return entry.file;
  }
  list() { return this.entries.slice(0, 50).map(({ id, name, state, bytes, total, created }) => ({ id, name, state, bytes, total, created })); }
  save() {
    try { fs.mkdirSync(path.dirname(this.history), { recursive: true }); fs.writeFileSync(this.history, JSON.stringify(this.entries.filter(e => e.state === 'completed').slice(0, 50))); } catch { /* Downloads still work without history. */ }
  }
  add(item) {
    const file = reserveDownload(this.directory, item.getFilename());
    const entry = { id: crypto.randomUUID(), name: path.basename(file), file, state: 'progressing', bytes: 0, total: item.getTotalBytes(), created: Date.now() };
    this.entries.unshift(entry); item.setSavePath(file); this.notify(true);
    let last = 0;
    item.on('updated', (_event, state) => {
      entry.state = state; entry.bytes = item.getReceivedBytes(); entry.total = item.getTotalBytes();
      if (Date.now() - last > 180) { last = Date.now(); this.notify(false); }
    });
    item.once('done', (_event, state) => {
      entry.state = state; entry.bytes = item.getReceivedBytes(); entry.total = item.getTotalBytes();
      // This path was reserved exclusively for this DownloadItem; preserve completed files.
      if (state !== 'completed') { try { fs.unlinkSync(file); } catch { /* DownloadItem may have removed it. */ } }
      this.save(); this.notify(false);
    });
    return entry;
  }
  clear() { this.entries = this.entries.filter(e => e.state === 'progressing'); this.save(); this.notify(false); }
}
module.exports = { Downloads, reserveDownload, inside };
