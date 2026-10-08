import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { solutionName } from './protocol.mjs';

const run = promisify(execFile);
export async function apple(script, args = []) {
  const result = await run('/usr/bin/osascript', ['-e', script, '--', ...args.map(String)], { timeout: 300000, maxBuffer: 16384 });
  return result.stdout.trim();
}
export class MacAdapter {
  constructor() { this.promptQueue = Promise.resolve(); }
  requestName(initial = '') {
    const pending = this.promptQueue.then(() => this.showName(initial)); this.promptQueue = pending.catch(() => {}); return pending;
  }
  async showName(initial = '') {
    let message = 'Введите название решения. После сохранения оно появится под этим заданием на платформе.';
    for (;;) {
      let name;
      try { name = await apple('on run argv\nset answer to display dialog (item 1 of argv) default answer (item 2 of argv) with title "IVAN100 · Решение" buttons {"Позже", "Сохранить"} default button "Сохранить" cancel button "Позже"\nreturn text returned of answer\nend run', [message, initial]); }
      catch (error) { if (String(error.stderr).includes('-128')) return null; throw new Error('Не удалось показать окно названия. Файл сохранён локально.'); }
      try { return solutionName(name); } catch (error) { message = error.message; initial = name; }
    }
  }
  async quarantine(file) {
    const marker = `0083;${Math.floor(Date.now() / 1000).toString(16)};IVAN100WorkbookHelper;${crypto.randomUUID()}`;
    await run('/usr/bin/xattr', ['-w', 'com.apple.quarantine', marker, file]);
    const result = await run('/usr/bin/xattr', ['-p', 'com.apple.quarantine', file]);
    if (result.stdout.trim() !== marker) throw new Error('Не удалось проверить защитную метку загруженного файла.');
  }
  async openWorkbook(file) {
    const apps = ['/Applications/LibreOffice.app', path.join(os.homedir(), 'Applications/LibreOffice.app'), '/Applications/Microsoft Excel.app', path.join(os.homedir(), 'Applications/Microsoft Excel.app')];
    for (const app of apps) {
      if (await fs.stat(app).then(v => v.isDirectory()).catch(() => false)) { await run('/usr/bin/open', ['-a', app, file]); return; }
    }
    await this.reveal(file);
    await this.message('Таблица скачана. Установите LibreOffice или Microsoft Excel, затем откройте таблицу из показанной папки.');
  }
  async openText(file) { await run('/usr/bin/open', ['-a', 'TextEdit', file]); }
  async reveal(file) { await run('/usr/bin/open', ['-R', file]); }
  async message(message) {
    await apple('on run argv\ndisplay dialog (item 1 of argv) with title "IVAN100 · Таблицы" buttons {"Понятно"} default button "Понятно"\nend run', [message]);
  }
  async notify(message) {
    await apple('on run argv\ndisplay notification (item 1 of argv) with title "IVAN100 · Таблицы"\nend run', [message]).catch(() => {});
  }
  async status(items) {
    const text = items.length ? items.map(item => `${item.name}\n${item.status}${item.closed ? '\nАвтосохранение остановлено; откройте работу с сайта снова.' : ''}`).join('\n\n') : 'Нет открытых работ. Нажмите «Решать» или «Открыть в LibreOffice» на ivan100.ru.\n\nТестовая версия macOS 0.1.0.';
    try {
      return await apple('on run argv\nset answer to display dialog (item 1 of argv) with title "IVAN100 · Таблицы" buttons {"Остановить", "Повторить", "Папка решений"} default button "Папка решений"\nreturn button returned of answer\nend run', [text]);
    } catch { return ''; }
  }
}
