import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { SCENES, INPUTS } from './obs.mjs';

export class ForegroundWindowReader {
  start() {
    if (this.child || Date.now() < (this.retryAt || 0)) return;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', fileURLToPath(new URL('./foreground-window.ps1', import.meta.url)), '-RecorderProcessId', String(process.pid)],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => { try { this.value = JSON.parse(line); this.receivedAt = Date.now(); } catch { /* incomplete output */ } });
    const ended = () => { lines.close(); if (this.child === child) { this.child = null; this.value = null; this.retryAt = Date.now() + 10000; } };
    child.on('error', ended); child.on('exit', ended);
  }
  current() { return Date.now() - (this.receivedAt || 0) < 3000 ? this.value : null; }
  stop() { const child = this.child; this.child = null; this.value = null; child?.kill(); }
}

export function focusedSource(items, foreground, platform) {
  if (!foreground?.title || !foreground.exe) return null;
  const matches = items.filter(item => item.itemEnabled
    && item.itemName === `[${foreground.exe}]: ${foreground.title}`);
  if (matches.length !== 1) return null;
  if (matches[0].itemValue === platform) return { mode: 'platform', item: matches[0] };
  // Document windows only: excludes LibreOffice dialogs and the start centre.
  if (/^soffice\.(bin|exe)$/i.test(foreground.exe) && /\s[-–—]\sLibreOffice (?:Calc|Writer|Impress|Draw|Math|Base)$/.test(foreground.title)) {
    return { mode: 'office', item: matches[0] };
  }
  return null;
}

export class OfficeFollower {
  constructor({ obs, reader, config, shareActive }) { Object.assign(this, { obs, reader, config, shareActive }); this.message = ''; this.selected = ''; }
  async tick() {
    if (!this.config().autoOffice) { this.reader.stop(); this.message = ''; return; }
    this.reader.start();
    // Explicit screen sharing and manual scene choices have priority.
    const scene = (await this.obs.call('GetCurrentProgramScene')).currentProgramSceneName;
    if (this.shareActive() || scene === SCENES.share) { this.message = 'Сейчас запись следует демонстрации в звонке на платформе.'; return; }
    if (![SCENES.platform, SCENES.office].includes(scene)) { this.message = 'Сейчас выбран ручной источник. Нажмите «Платформа», чтобы вернуть автоматическое переключение.'; return; }
    const items = (await this.obs.call('GetInputPropertiesListPropertyItems', { inputName: INPUTS.platform, propertyName: 'window' })).propertyItems;
    const foreground = this.reader.current();
    const next = focusedSource(items, foreground, this.config().platform);
    if (next?.mode === 'office') {
      if (this.selected !== next.item.itemValue || scene !== SCENES.office) {
        await this.obs.select('office', next.item.itemValue); this.selected = next.item.itemValue;
      }
      this.message = `В записи: ${foreground.title}`;
    } else if (next?.mode === 'platform' || (scene === SCENES.office && !items.some(i => i.itemEnabled && i.itemValue === this.selected))) {
      if (scene === SCENES.office) await this.obs.select('platform');
      this.message = 'В записи платформа. Перейдите в документ LibreOffice — запись переключится сама.';
    } else if (!foreground) {
      // Do not leave an indefinitely frozen document if the watcher failed.
      if (scene === SCENES.office) await this.obs.select('platform');
      this.message = 'Подключаем автоматическое переключение LibreOffice…';
    } else if (scene === SCENES.platform) {
      this.message = 'Автоматически: платформа ↔ документ LibreOffice. Остальные приложения не подхватываются.';
    }
  }
}
