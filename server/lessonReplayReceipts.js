import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Session receipts survive a process restart. Recovery still requires both the
// same authenticated actor and current access to the original lesson.
export function createLessonReplayReceipts(directory) {
  const fileFor = (key) => path.join(directory, `${crypto.createHash('sha256').update(key).digest('hex')}.json`);
  const write = (key, session) => {
    fs.mkdirSync(directory, { recursive: true });
    const file = fileFor(key);
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(session)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  };
  const read = (key, auth) => {
    try {
      const session = JSON.parse(fs.readFileSync(fileFor(key), 'utf8'));
      return session.actorId === String(auth?.id || '').trim()
        && session.actorRole === String(auth?.role || '').trim() ? session : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  return {
    save(session) {
      write(`session:${session.id}`, session);
      if (session.clientSessionId) write(`client:${session.actorRole}:${session.actorId}:${session.clientSessionId}`, session);
    },
    bySession: (id, auth) => read(`session:${id}`, auth),
    byClient: (id, auth) => read(`client:${auth?.role}:${auth?.id}:${id}`, auth),
  };
}
