'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const PLATFORM_URL = 'https://ivan100.ru/?desktop=teacher';
const RECORDER_URL = 'http://127.0.0.1:18765/';

function parsed(value) {
  try { const url = new URL(value); return url.username || url.password ? null : url; } catch { return null; }
}
function isPlatform(value) { return parsed(value)?.origin === 'https://ivan100.ru'; }
function isRecorder(value) {
  const url = parsed(value);
  return url?.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '18765';
}
function isPlatformBlob(value) { return String(value).startsWith('blob:') && isPlatform(String(value).slice(5)); }
function isUploadedFile(value) { const url = parsed(value); return isPlatform(value) && /^\/uploads\/[^/]+$/.test(url.pathname); }
function isExternal(value) {
  const url = parsed(value);
  if (!url || !['https:', 'http:'].includes(url.protocol)) return false;
  // Local services must never be opened by an arbitrary remote link.
  const host = url.hostname.toLowerCase();
  return !/^(localhost|.*\.localhost|.*\.local|127(?:\.\d+){3}|0\.0\.0\.0|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2}|169\.254(?:\.\d+){2}|\[.*\])$/.test(host);
}
function classifyNavigation(value) {
  if (isWorkbookHelper(value)) return 'workbook-helper';
  if (isPlatform(value) || isPlatformBlob(value)) return 'platform';
  if (isRecorder(value)) return 'recorder';
  return isExternal(value) ? 'external' : 'blocked';
}
function isWorkbookHelper(value) {
  if (typeof value !== 'string' || value.length > 4096) return false;
  const url = parsed(value);
  if (!url || url.protocol !== 'ivan-ege:' || url.hostname !== 'workbook' || url.port || url.pathname !== '/open' || url.hash) return false;
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 2 || !keys.includes('origin') || !keys.includes('ticket')) return false;
  const origin = parsed(url.searchParams.get('origin'));
  return Boolean(origin && isPlatform(origin.href) && origin.pathname === '/' && !origin.search && !origin.hash
    && /^[a-zA-Z0-9_.~-]{16,512}$/.test(url.searchParams.get('ticket') || ''));
}
function isLocalPage(value, filename) {
  return value?.split(/[?#]/, 1)[0] === pathToFileURL(path.resolve(filename)).href;
}
function canRequestPermission(topUrl, requestedUrl, isMainFrame) {
  return isPlatform(topUrl) && isPlatform(requestedUrl) && isMainFrame === true;
}
function safeDownloadName(value) {
  let name = String(value || 'Файл').split(/[\\/]/).pop().replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 180);
  if (!name || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `Файл-${name || 'скачивание'}`;
  return name;
}
function browserUserAgent(value) {
  const match = String(value).match(/^(Mozilla\/5\.0 .+?AppleWebKit\/[\d.]+ \(KHTML, like Gecko\)).*?\b(Chrome\/[\d.]+)\b.*?\b(Safari\/[\d.]+)\b/);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : String(value);
}
function canDownload(topUrl, initiatorOrigin) {
  return (isPlatform(topUrl) || isPlatformBlob(topUrl)) && isPlatform(initiatorOrigin);
}
function sharingResult({ sources, sourceId, withAudio, request }) {
  // Electron frame properties may throw after the requesting page is closed.
  try { if (!request.videoRequested || !request.frame || request.frame !== request.frame.top) return {}; } catch { return {}; }
  if (sourceId === 'platform-tab') return { video: request.frame, ...(withAudio && request.audioRequested ? { audio: request.frame } : {}) };
  const source = sources.find(item => item.id === sourceId);
  if (!source) return {};
  return { video: source, ...(withAudio && request.audioRequested ? { audio: 'loopback' } : {}) };
}
module.exports = { PLATFORM_URL, RECORDER_URL, isPlatform, isRecorder, isPlatformBlob, isUploadedFile, isExternal, isWorkbookHelper, classifyNavigation, isLocalPage, canRequestPermission, safeDownloadName, browserUserAgent, canDownload, sharingResult };
