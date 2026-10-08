import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import os from 'node:os';

export async function privateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error('Папка помощника недоступна или принадлежит другому пользователю.');
  return directory;
}
export const ipcDirectory = () => path.join(os.tmpdir(), `ivan100-workbook-${process.getuid()}`);
export function processMayBeAlive(pid, probe = process.kill) {
  if (!Number.isSafeInteger(pid) || pid < 1) return true;
  try { probe(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}
export async function send(directory, command, timeout = 10000) {
  const infoFile = path.join(directory, 'service.json');
  const stat = await fs.lstat(infoFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 4096) throw new Error('Недействительная локальная сессия.');
  const info = JSON.parse(await fs.readFile(infoFile, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(info.secret)) throw new Error('Недействительная локальная сессия.');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(path.join(directory, 'helper.sock'));
    let buffer = '', answered = false; const timer = setTimeout(() => { socket.destroy(); reject(new Error('Помощник не ответил. Откройте работу снова.')); }, timeout);
    socket.once('connect', () => socket.write(JSON.stringify({ secret: info.secret, ...command }) + '\n'));
    socket.on('data', part => { buffer += part; if (buffer.length > 65536) { socket.destroy(); reject(new Error('Некорректный ответ помощника.')); return; }
      if (buffer.includes('\n')) { answered = true; try { const response = JSON.parse(buffer.split('\n')[0]); response.error ? reject(new Error(response.error)) : resolve(response.result); } catch (error) { reject(error); } socket.end(); } });
    socket.once('error', reject); socket.once('close', () => { clearTimeout(timer); if (!answered) reject(new Error('Локальный канал помощника закрыт.')); });
  });
}
export async function serve(directory, handler) {
  await privateDirectory(directory);
  const socketFile = path.join(directory, 'helper.sock');
  const old = await fs.lstat(socketFile).catch(() => null);
  if (old) {
    if (!old.isSocket() || old.uid !== process.getuid()) throw new Error('Недействительный локальный канал.');
    try { await send(directory, { action: 'status' }, 1000); return null; }
    catch {
      if (Date.now() - old.ctimeMs < 3000) return null;
      // A slow status response is not proof that its daemon died. Never steal
      // an active/uncertain channel while another process may be saving files.
      try {
        const infoFile = path.join(directory, 'service.json'); const infoStat = await fs.lstat(infoFile);
        if (!infoStat.isFile() || infoStat.isSymbolicLink() || infoStat.uid !== process.getuid() || (infoStat.mode & 0o077) || infoStat.size > 4096) return null;
        const info = JSON.parse(await fs.readFile(infoFile, 'utf8'));
        if (processMayBeAlive(info.pid)) return null;
      } catch { return null; }
      await fs.unlink(socketFile);
    }
  }
  const secret = crypto.randomBytes(32).toString('hex');
  const server = net.createServer(socket => {
    socket.setTimeout(10000, () => socket.destroy()); let buffer = ''; let done = false;
    socket.on('data', chunk => {
      if (done) return; buffer += chunk; if (buffer.length > 8192) { socket.destroy(); return; }
      if (!buffer.includes('\n')) return; done = true;
      let command;
      try { command = JSON.parse(buffer.split('\n')[0]); if (typeof command.secret !== 'string' || command.secret.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(command.secret), Buffer.from(secret))) throw new Error('Нет доступа к локальному помощнику.'); }
      catch { socket.end(JSON.stringify({ error: 'Нет доступа к локальному помощнику.' }) + '\n'); return; }
      Promise.resolve().then(() => handler(command)).then(result => socket.end(JSON.stringify({ result }) + '\n'), error => socket.end(JSON.stringify({ error: error.message }) + '\n'));
    });
    socket.on('error', () => {});
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketFile, resolve); }); }
  catch (error) { if (error.code === 'EADDRINUSE') return null; throw error; }
  await fs.chmod(socketFile, 0o600);
  const infoFile = path.join(directory, 'service.json');
  const temporary = infoFile + '.' + crypto.randomUUID();
  await fs.writeFile(temporary, JSON.stringify({ pid: process.pid, secret }), { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, infoFile);
  return { server, async close() { server.close(); await fs.unlink(infoFile).catch(() => {}); await fs.unlink(socketFile).catch(() => {}); } };
}
