import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MacAdapter } from './mac.mjs';
import { WorkbookController } from './controller.mjs';
import { parseLaunch } from './protocol.mjs';
import { privateDirectory, ipcDirectory, send, serve } from './ipc.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const adapter = new MacAdapter();
async function main() {
  if (process.platform !== 'darwin') throw new Error('Эта версия помощника предназначена для macOS.');
  const ipc = await privateDirectory(ipcDirectory());
  const directory = path.join(os.homedir(), 'Documents', 'Иван на сотку', 'Решения');
  if (process.argv[2] === '--daemon') {
    const controller = new WorkbookController({ directory, adapter });
    let channel; let idleSince = Date.now(); let shuttingDown = false;
    const stop = async () => {
      if (shuttingDown) return; shuttingDown = true;
      await controller.flush().catch(() => {});
      const deadline = Date.now() + 120000;
      while ([...controller.sessions.values()].some(session => session.busy) && Date.now() < deadline) await sleep(100);
      controller.close(); await channel?.close(); process.exit(0);
    };
    channel = await serve(ipc, command => {
      if (shuttingDown) throw new Error('Помощник завершает сохранение. Подождите.');
      if (command.action === 'status') return controller.statuses();
      if (command.action === 'retry') { controller.retry(); return true; }
      if (command.action === 'stop') { setTimeout(() => { void stop(); }, 50); return true; }
      if (command.action === 'launch') {
        parseLaunch(command.url);
        void controller.launch(command.url).catch(error => adapter.message(error.message));
        return true;
      }
      throw new Error('Неизвестная команда.');
    });
    if (!channel) return;
    setInterval(() => {
      for (const session of controller.sessions.values()) if (!session.closed && Date.parse(session.grant.expiresAt) <= Date.now()) { session.publish('Срок доступа истёк. Откройте работу с сайта снова.'); session.close(); }
      if ([...controller.sessions.values()].some(session => !session.closed)) idleSince = Date.now();
      else if (Date.now() - idleSince > 300000) void stop();
    }, 30000);
    process.once('SIGTERM', () => { void stop(); }); process.once('SIGINT', () => { void stop(); });
    return;
  }
  if (process.argv[2] === '--launch') parseLaunch(process.argv[3]);
  else if (!['--show-status', '--check-idle'].includes(process.argv[2])) throw new Error('Неизвестная команда.');
  let items;
  try { items = await send(ipc, { action: 'status' }); }
  catch {
    if (process.argv[2] === '--check-idle') return;
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--daemon'], { detached: true, stdio: 'ignore' }); child.unref();
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) { try { items = await send(ipc, { action: 'status' }, 500); break; } catch { await sleep(200); } }
    if (!items) throw new Error('Не удалось запустить помощник. Откройте приложение «IVAN100 Таблицы» ещё раз.');
  }
  if (process.argv[2] === '--check-idle') {
    if (items.some(item => !item.closed)) throw new Error('Закройте работы через приложение «IVAN100 Таблицы» перед обновлением. Все локальные файлы сохранятся.');
    await send(ipc, { action: 'stop' }); await sleep(500); return;
  }
  if (process.argv[2] === '--launch') { await send(ipc, { action: 'launch', url: process.argv[3] }); return; }
  const action = await adapter.status(items);
  if (action === 'Повторить') await send(ipc, { action: 'retry' });
  else if (action === 'Остановить') await send(ipc, { action: 'stop' });
  else if (action === 'Папка решений') { await fs.mkdir(directory, { recursive: true, mode: 0o700 }); await adapter.reveal(directory); }
}
main().catch(async error => { await adapter.message(error.message).catch(() => {}); process.exitCode = 1; });
