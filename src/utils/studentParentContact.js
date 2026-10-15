export function normalizeStudentParentContact(value = {}) {
  const name = String(value?.name || '').trim();
  let url = String(value?.url || '').trim();
  if (name.length > 80) throw new Error('Имя родителя должно быть не длиннее 80 символов.');
  if (!url && !name) return { name: '', url: '' };
  if (!url) throw new Error('Укажите ссылку на контакт родителя.');
  if (/^[/\\]/.test(url)) throw new Error('Введите полную ссылку на контакт родителя.');
  if (url.length > 2048 || /\s/u.test(url) || [...url].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('Проверьте ссылку на контакт родителя.');
  if (/^@[a-zA-Z0-9_]{5,32}$/.test(url)) url = `https://t.me/${url.slice(1)}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Введите полную ссылку, например https://t.me/username.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname.includes('.') || parsed.username || parsed.password) {
    throw new Error('Используйте ссылку http:// или https:// на контакт родителя.');
  }
  return { name, url: parsed.href };
}

export async function copyParentMessage(text, navigatorRef = globalThis.navigator, documentRef = globalThis.document) {
  if (!String(text || '').trim()) return;
  if (navigatorRef?.clipboard?.writeText) {
    try { await navigatorRef.clipboard.writeText(text); return; } catch { /* Older desktop runtimes need the selection fallback. */ }
  }
  const field = documentRef.createElement('textarea');
  const previouslyFocused = documentRef.activeElement;
  field.value = text;
  field.style.position = 'fixed'; field.style.opacity = '0';
  documentRef.body.appendChild(field); field.focus(); field.select();
  try { if (!documentRef.execCommand('copy')) throw new Error('Не удалось скопировать текст. Выделите и скопируйте его вручную.'); }
  finally { field.remove(); previouslyFocused?.focus?.({ preventScroll: true }); }
}
