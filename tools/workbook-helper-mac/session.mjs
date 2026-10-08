import fs from 'node:fs';
import path from 'node:path';
import { hash, ApiError } from './api.mjs';
import { MAX_WORKBOOK, solutionName } from './protocol.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
export async function stableSnapshot(file, { delay = 650, timeout = 30000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const before = await fs.promises.lstat(file);
      if (!before.isFile() || before.isSymbolicLink()) throw new ApiError('Вместо таблицы обнаружена ссылка или папка.', 422);
      if (before.size > MAX_WORKBOOK) throw new ApiError('Файл превышает 64 МБ.', 413);
      await sleep(delay);
      const settled = await fs.promises.lstat(file); if (stamp(before) !== stamp(settled)) continue;
      const handle = await fs.promises.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      let bytes;
      try {
        if (stamp(await handle.stat()) !== stamp(settled)) continue;
        const parts = []; let length = 0; const chunk = Buffer.alloc(65536);
        for (;;) { const { bytesRead } = await handle.read(chunk, 0, chunk.length, null); if (!bytesRead) break;
          length += bytesRead; if (length > MAX_WORKBOOK) throw new ApiError('Файл превышает 64 МБ.', 413);
          parts.push(Buffer.from(chunk.subarray(0, bytesRead))); }
        bytes = Buffer.concat(parts, length);
      } finally { await handle.close(); }
      if (bytes.length > MAX_WORKBOOK) throw new ApiError('Файл превышает 64 МБ.', 413);
      if (stamp(await fs.promises.lstat(file)) !== stamp(settled)) continue;
      return { bytes, contentHash: hash(bytes) };
    } catch (error) { if (error instanceof ApiError) throw error; await sleep(Math.min(450, delay)); }
  }
  throw new ApiError('Таблица ещё сохраняется. Повторю отправку позже.');
}

export class WorkbookSession {
  constructor({ api, grant, file, initialHash, requestName, onStatus = () => {}, debounce = 1500, snapshotDelay = 650, poll = 5000, retryDelays = [2000, 5000, 15000, 30000, 60000] }) {
    Object.assign(this, { api, grant, file, requestName, onStatus, debounce, snapshotDelay, retryDelays });
    this.initialHash = initialHash; this.revision = grant.revision; this.requiresName = grant.requiresName; this.pendingName = '';
    this.closed = false; this.busy = false; this.dirty = false; this.status = 'Слежу за сохранениями'; this.timer = null;
    this.cancelledHash = ''; this.retryAt = 0; this.previousPaths = new Set([path.resolve(file)]);
    this.directory = path.dirname(file); this.extension = path.extname(file).toLowerCase();
    this.watcher = fs.watch(this.directory, (_event, name) => {
      const changed = name?.toString();
      if (!changed || changed === path.basename(this.file)) this.signal();
      else if (!changed.startsWith('.') && !changed.startsWith('~$') && path.extname(changed).toLowerCase() === this.extension) void this.adoptCandidate(changed);
    });
    this.watcher.on('error', () => this.publish('Проверяю сохранения по таймеру')); this.watcher.unref?.();
    this.poller = setInterval(() => { this.signal(); void this.scanCandidates(); }, poll); this.poller.unref();
    this.publish(this.status);
  }
  publish(message) { this.status = message; this.onStatus(message); }
  signal() { if (this.closed) return; this.dirty = true; clearTimeout(this.timer); this.timer = setTimeout(() => { void this.synchronize(); }, this.debounce); this.timer.unref?.(); }
  async adoptCandidate(name) {
    try {
      // Each launched workbook has its own folder. Save As can therefore adopt
      // a same-format file there without confusing another student's work.
      const target = path.resolve(this.directory, name); if (path.dirname(target) !== this.directory || this.previousPaths.has(target)) return;
      const stat = await fs.promises.lstat(target); if (!stat.isFile() || stat.isSymbolicLink()) return;
      const entries = (await fs.promises.readdir(this.directory)).filter(v => !v.startsWith('.') && !v.startsWith('~$') && path.extname(v).toLowerCase() === this.extension && !this.previousPaths.has(path.resolve(this.directory, v)));
      if (entries.length !== 1) { this.publish('В папке несколько копий. Продолжайте сохранять исходную таблицу или откройте работу заново.'); return; }
      this.previousPaths.add(target); this.file = target; this.signal();
    } catch { /* Temporary office files can disappear before their rename. */ }
  }
  async scanCandidates() {
    if (this.closed) return;
    try {
      const entries = (await fs.promises.readdir(this.directory)).filter(name => !name.startsWith('.') && !name.startsWith('~$') && path.extname(name).toLowerCase() === this.extension && !this.previousPaths.has(path.resolve(this.directory, name)));
      if (entries.length === 1) await this.adoptCandidate(entries[0]);
    } catch { /* Directory temporarily unavailable: keep the original binding. */ }
  }
  async synchronize() {
    if (this.closed || this.busy || this.retryAt > Date.now()) return;
    this.busy = true; this.dirty = false;
    try {
      if (Date.parse(this.grant.expiresAt) <= Date.now()) throw new ApiError('Срок доступа истёк. Откройте работу с сайта снова.', 401);
      const snapshot = await stableSnapshot(this.file, { delay: this.snapshotDelay });
      if (this.closed || snapshot.contentHash === this.initialHash || snapshot.contentHash === this.cancelledHash) return;
      if (this.requiresName && !this.pendingName) {
        const name = await this.requestName(this.grant.solutionName); if (!name) { this.cancelledHash = snapshot.contentHash; this.publish('Название не выбрано; отправка отложена до следующего сохранения.'); return; }
        this.pendingName = solutionName(name);
      }
      let receipt;
      for (let attempt = 0; ; attempt++) {
        if (this.closed) return;
        this.publish(attempt ? 'Нет связи. Повторяю отправку…' : 'Сохраняю на платформе…');
        try { receipt = await this.api.upload(this.grant, snapshot, this.revision, this.pendingName); break; }
        catch (error) {
          if (!error.transient || attempt >= this.retryDelays.length) throw error;
          await sleep(Math.max(error.retryAfter || 0, this.retryDelays[attempt]));
        }
      }
      this.initialHash = snapshot.contentHash; this.revision = String(receipt.revision); this.requiresName = false; this.pendingName = ''; this.cancelledHash = ''; this.retryAt = 0;
      if (receipt.solutionName) this.grant.solutionName = receipt.solutionName;
      this.publish('Сохранено на платформе');
    } catch (error) {
      this.publish(error.message);
      if (error instanceof ApiError && !error.transient) this.close();
      else if (!this.closed) { this.retryAt = Date.now() + 60000; clearTimeout(this.timer); this.timer = setTimeout(() => { void this.synchronize(); }, 60000); this.timer.unref?.(); }
    } finally { this.busy = false; if (this.dirty && !this.closed) this.signal(); }
  }
  retry() { this.cancelledHash = ''; this.retryAt = 0; this.signal(); }
  close() { this.closed = true; clearTimeout(this.timer); clearInterval(this.poller); this.watcher.close(); }
}
