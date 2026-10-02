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
function isExternal(value) {
  const url = parsed(value);
  if (!url || !['https:', 'http:'].includes(url.protocol)) return false;
  // Local services must never be opened by an arbitrary remote link.
  const host = url.hostname.toLowerCase();
  return !/^(localhost|.*\.localhost|.*\.local|127(?:\.\d+){3}|0\.0\.0\.0|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2}|169\.254(?:\.\d+){2}|\[.*\])$/.test(host);
}
function classifyNavigation(value) {
  if (isPlatform(value) || isPlatformBlob(value)) return 'platform';
  if (isRecorder(value)) return 'recorder';
  return isExternal(value) ? 'external' : 'blocked';
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
function sharingResult({ sources, sourceId, withAudio, request }) {
  // Electron frame properties may throw after the requesting page is closed.
  try { if (!request.videoRequested || !request.frame || request.frame !== request.frame.top) return {}; } catch { return {}; }
  if (sourceId === 'platform-tab') return { video: request.frame, ...(withAudio && request.audioRequested ? { audio: request.frame } : {}) };
  const source = sources.find(item => item.id === sourceId);
  if (!source) return {};
  return { video: source, ...(withAudio && request.audioRequested ? { audio: 'loopback' } : {}) };
}
module.exports = { PLATFORM_URL, RECORDER_URL, isPlatform, isRecorder, isPlatformBlob, isExternal, classifyNavigation, isLocalPage, canRequestPermission, safeDownloadName, sharingResult };
