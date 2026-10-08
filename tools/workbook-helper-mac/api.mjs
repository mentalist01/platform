import crypto from 'node:crypto';
import { MAX_TEXT, MAX_WORKBOOK, shaPattern, validateGrant } from './protocol.mjs';

export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export class ApiError extends Error {
  constructor(message, status = 0, retryAfter = 0) { super(message); this.status = status; this.transient = !status || [408, 425, 429].includes(status) || status >= 500; this.retryAfter = retryAfter; }
}
export class WorkbookApi {
  constructor(origin, { fetchImpl = fetch } = {}) { this.origin = origin; this.fetchImpl = fetchImpl; }
  async request(route, options = {}, token = '', timeout = 120000) {
    let response;
    try {
      response = await this.fetchImpl(this.origin + '/workbook-helper/v1/' + route, { ...options, redirect: 'manual',
        signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'IvanEgeWorkbookHelper/1.3.2 (macOS)', ...(token ? { Authorization: `Workbook ${token}` } : {}), ...options.headers } });
    } catch { throw new ApiError('Нет связи с платформой. Файл сохранён на компьютере.'); }
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new ApiError('Платформа перенаправила запрос. Откройте работу заново.', 403); }
    if (!response.ok) {
      await response.body?.cancel();
      const messages = { 401: 'Срок доступа истёк. Откройте таблицу с платформы снова.', 403: 'Доступ к таблице отключён.',
        409: 'На платформе уже есть новая версия. Ваша локальная копия сохранена; откройте работу с сайта снова.', 410: 'Таблица больше недоступна.', 413: 'Файл превышает 64 МБ.', 429: 'Платформа временно ограничила загрузку. Повторю позже.' };
      throw new ApiError(messages[response.status] || `Ошибка платформы: ${response.status}. Локальная копия сохранена.`, response.status,
        Math.min(120000, Math.max(0, Number(response.headers.get('retry-after')) || 0) * 1000));
    }
    return response;
  }
  async exchange(ticket) {
    const response = await this.request('exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) }, '', 30000);
    return validateGrant(this.origin, JSON.parse((await this.read(response, 32768)).toString('utf8')));
  }
  async read(response, limit) {
    const size = Number(response.headers.get('content-length'));
    if (size > limit) { await response.body?.cancel(); throw new ApiError('Файл больше допустимого размера.', 413); }
    const parts = []; let total = 0;
    const reader = response.body.getReader();
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength;
        if (total > limit) { await reader.cancel(); throw new ApiError('Файл больше допустимого размера.', 413); } parts.push(Buffer.from(value)); }
    } finally { reader.releaseLock(); }
    return Buffer.concat(parts);
  }
  async download(grant, sourceText = false) {
    const response = await this.request(sourceText ? 'source-text' : 'content', { headers: { 'X-Workbook-Key': grant.workbookKey } }, grant.token);
    const bytes = await this.read(response, sourceText ? MAX_TEXT : MAX_WORKBOOK);
    const contentHash = response.headers.get(sourceText ? 'X-Source-Text-Content-Hash' : 'X-Workbook-Content-Hash') || (sourceText ? grant.sourceText.contentHash : grant.contentHash);
    if (!shaPattern.test(contentHash) || hash(bytes) !== contentHash.toLowerCase()
      || (sourceText && contentHash.toLowerCase() !== grant.sourceText.contentHash)) throw new ApiError('Контрольная сумма файла не совпала. Файл не открыт.', 422);
    const revision = sourceText ? '' : response.headers.get('X-Workbook-Revision') || grant.revision;
    if (!sourceText && !/^\d+$/.test(revision)) throw new ApiError('Некорректная версия файла.', 422);
    return { bytes, contentHash: contentHash.toLowerCase(), revision };
  }
  async upload(grant, snapshot, revision, name = '') {
    const body = new FormData(); body.append('file', new Blob([snapshot.bytes], { type: 'application/octet-stream' }), grant.fileName);
    body.append('revision', revision); body.append('contentHash', snapshot.contentHash); if (name) body.append('solutionName', name);
    const response = await this.request('content', { method: 'PUT', headers: { 'X-Workbook-Key': grant.workbookKey,
      'X-Content-SHA256': snapshot.contentHash, 'X-Workbook-Revision': revision }, body }, grant.token);
    const receipt = JSON.parse((await this.read(response, 65536)).toString('utf8'));
    if (!/^\d+$/.test(String(receipt.revision)) || receipt.contentHash !== snapshot.contentHash) throw new ApiError('Не удалось подтвердить сохранение. Локальная копия сохранена.', 422);
    return receipt;
  }
}
