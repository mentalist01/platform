'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const policy = require('./policy.cjs');
const { safeDownloadName } = policy;

// Main-process downloads have no web initiator. Accept only the exact request
// made from our own image menu or file action, once, while its page is still open.
class NativeDownloadRequests {
  constructor(isOwnedPlatform) { this.isOwnedPlatform = isOwnedPlatform; this.pending = []; }
  request(contents, value, { name, headers } = {}) {
    if (!this.isOwnedPlatform(contents)) throw new Error('Откройте изображение на платформе.');
    const url = new URL(value).href;
    if (!policy.isPlatform(url) && !policy.isPlatformBlob(url) && !policy.isExternal(url) && !/^data:image\//i.test(url)) throw new Error('Этот адрес изображения недоступен для скачивания.');
    const page = contents.getURL();
    const request = { id: contents.id, page, url, name, expires: Date.now() + 30000 };
    this.pending = this.pending.filter(entry => entry.expires > Date.now());
    this.pending.push(request);
    try { contents.downloadURL(url, headers ? { headers } : undefined); }
    catch (error) { this.pending = this.pending.filter(entry => entry !== request); throw error; }
  }
  async file(contents, value, name, token) {
    if (!this.isOwnedPlatform(contents) || !policy.isUploadedFile(value)) throw new Error('Этот файл недоступен для скачивания.');
    const page = contents.getURL(), headers = {};
    if (typeof token === 'string' && token) {
      if (token.length > 8192 || /[\r\n]/.test(token)) throw new Error('Войдите в аккаунт снова.');
      headers.Authorization = `Bearer ${token}`;
      headers['X-Ege-Auth-Token'] = token;
    }
    // The API session can still be valid after its browser cookie expires.
    // Authenticate without adding the login token to a URL or download history.
    const response = await contents.session.fetch(value, { method: 'HEAD', headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(response.status === 401 ? 'Войдите в аккаунт снова и повторите скачивание.' : 'Файл недоступен. Обновите список материалов и повторите.');
    if (this.isOwnedPlatform(contents) && contents.getURL() === page) this.request(contents, value, { name, headers });
  }
  consume(contents, item) {
    this.pending = this.pending.filter(entry => entry.expires > Date.now());
    if (!this.isOwnedPlatform(contents) || !['', 'https://ivan100.ru'].includes(item.getInitiatorOrigin())) return null;
    const url = item.getURLChain()[0] || item.getURL();
    const index = this.pending.findIndex(entry => entry.id === contents.id && entry.page === contents.getURL() && entry.url === url);
    if (index < 0) return null;
    return this.pending.splice(index, 1)[0];
  }
}

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
  add(item, name) {
    const file = reserveDownload(this.directory, name || item.getFilename());
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
module.exports = { Downloads, NativeDownloadRequests, reserveDownload, inside };
