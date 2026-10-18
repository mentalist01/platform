const PHONE_FORMAT = /^\+?[\d ()\-\u00a0\u202f]+$/u;

function telegramPhoneUrl(phone) {
  let digits = phone.replace(/[^\d]/g, '');
  if (!phone.startsWith('+')) {
    if (!/^[78]\d{10}$/.test(digits)) throw new Error('Укажите телефон с кодом страны, например +7 (999) 000-00-00.');
    if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new Error('Проверьте номер телефона и код страны.');
  return `https://t.me/+${digits}`;
}

function normalizeContact(value = {}, person = 'родителя') {
  const name = String(value?.name || '').trim();
  let url = String(value?.url || '').trim();
  if (name.length > 80) throw new Error(`Подпись контакта ${person} должна быть не длиннее 80 символов.`);
  if (!url && !name) return { name: '', url: '' };
  if (!url) throw new Error(`Укажите ссылку на контакт ${person}.`);
  if (/^[/\\]/.test(url)) throw new Error(`Введите полную ссылку на контакт ${person}.`);
  if (url.length > 2048 || [...url].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error(`Проверьте ссылку на контакт ${person}.`);
  // Only phone formatting is removed; spaces in other URLs remain invalid.
  const telegramPhone = url.match(/^(?:https?:\/\/)?t\.me\/(\+[\d ()\-\u00a0\u202f]+)\/?([?#].*)?$/iu);
  if (telegramPhone) url = telegramPhoneUrl(telegramPhone[1]) + (telegramPhone[2] || '');
  else if (PHONE_FORMAT.test(url)) url = telegramPhoneUrl(url);
  if (/\s/u.test(url)) throw new Error(`Проверьте ссылку на контакт ${person}.`);
  if (/^@[a-zA-Z0-9_]{5,32}$/.test(url)) url = `https://t.me/${url.slice(1)}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Введите полную ссылку, например https://t.me/username.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname.includes('.') || parsed.username || parsed.password) {
    throw new Error(`Используйте ссылку http:// или https:// на контакт ${person}.`);
  }
  return { name, url: parsed.href };
}

export const normalizeStudentParentContact = value => normalizeContact(value, 'родителя');
export const normalizeStudentContact = value => normalizeContact(value, 'ученика');

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
