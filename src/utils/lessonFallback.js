import { normalizeTelemostUrl } from './telemost.js';

export const FALLBACK_STORAGE_KEY = 'ivan100-lesson-fallback-v1';
export const FALLBACK_TTL = 24 * 60 * 60_000;
export function fallbackLinks(value) {
  return (Array.isArray(value) ? value : []).flatMap(item => {
    const url = normalizeTelemostUrl(item?.url);
    return url && typeof item?.id === 'string' ? [{ id: item.id.slice(0, 150),
      name: String(item.name || 'Занятие').slice(0, 120), url }] : [];
  }).slice(0, 500);
}
export function readLessonFallback(storage, owner, now = Date.now()) {
  try {
    const saved = JSON.parse(storage.getItem(FALLBACK_STORAGE_KEY));
    if (saved?.owner !== owner || !Number.isFinite(saved.savedAt)
      || now < saved.savedAt || now - saved.savedAt > FALLBACK_TTL) return [];
    return fallbackLinks(saved.links);
  } catch { return []; }
}
export function saveLessonFallback(storage, owner, links, now = Date.now()) {
  try { storage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify({ owner, savedAt: now, links: fallbackLinks(links) })); } catch { /* Private mode may deny storage. */ }
}
export function clearLessonFallback(storage) {
  try { storage.removeItem(FALLBACK_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
}
