const PHONE_FORMAT = /^\+?[\d ()\-\u00a0\u202f]+$/u;

function phoneDigits(phone) {
  let digits = phone.replace(/[^\d]/g, '');
  if (!phone.startsWith('+')) {
    if (!/^[78]\d{10}$/.test(digits)) throw new Error('Укажите телефон с кодом страны, например +7 (999) 000-00-00.');
    if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new Error('Проверьте номер телефона и код страны.');
  return digits;
}

export function studentContactChannel(value = {}) {
  const link = String(value.url || value.value || '').trim();
  if (/^(?:https?:\/\/)?(?:wa\.me|(?:api\.|web\.)?whatsapp\.com)(?:\/|$)/i.test(link)) return 'whatsapp';
  if (/^(?:https?:\/\/)?(?:t\.me|telegram\.me)(?:\/|$)/i.test(link) || /^@/.test(link)) return 'telegram';
  return link && !PHONE_FORMAT.test(link) ? 'link' : 'auto';
}

function phoneContactUrl(phone, channel = 'telegram') {
  const digits = phoneDigits(phone);
  if (channel === 'whatsapp') return `https://wa.me/${digits}`;
  if (channel === 'telegram') return `https://t.me/+${digits}`;
  throw new Error('Для номера телефона выберите Telegram или WhatsApp в поле «Открывать в».');
}

function normalizeContactLink(value = {}, person = 'родителя') {
  const name = String(value?.name || '').trim();
  let url = String(value?.url || '').trim();
  const channel = value.channel;
  if (channel !== undefined && !['auto', 'telegram', 'whatsapp', 'link'].includes(channel)) throw new Error('Выберите, где открывать контакт.');
  if (name.length > 80) throw new Error(`Подпись контакта ${person} должна быть не длиннее 80 символов.`);
  if (!url && !name) return { name: '', url: '' };
  if (!url) throw new Error(`Укажите ссылку на контакт ${person}.`);
  if (/^[/\\]/.test(url)) throw new Error(`Введите полную ссылку на контакт ${person}.`);
  if (url.length > 2048 || [...url].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error(`Проверьте ссылку на контакт ${person}.`);
  // Only phone formatting is removed; spaces in other URLs remain invalid.
  const telegramPhone = url.match(/^(?:https?:\/\/)?t\.me\/(\+[\d ()\-\u00a0\u202f]+)\/?([?#].*)?$/iu);
  const whatsappPhone = url.match(/^(?:https?:\/\/)?wa\.me\/(\+?\d+)\/?([?#].*)?$/iu);
  if (telegramPhone || whatsappPhone) {
    const phone = telegramPhone || whatsappPhone;
    const selected = ['telegram', 'whatsapp'].includes(channel) ? channel : telegramPhone ? 'telegram' : 'whatsapp';
    url = phoneContactUrl(whatsappPhone ? `+${phone[1].replace(/^\+/, '')}` : phone[1], selected) + (phone[2] || '');
  } else if (PHONE_FORMAT.test(url)) url = phoneContactUrl(url, channel);
  if (/\s/u.test(url)) throw new Error(`Проверьте ссылку на контакт ${person}.`);
  if (/^@[a-zA-Z0-9_]{5,32}$/.test(url)) url = `https://t.me/${url.slice(1)}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Введите полную ссылку, например https://t.me/username.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname.includes('.') || parsed.username || parsed.password) {
    throw new Error(`Используйте ссылку http:// или https:// на контакт ${person}.`);
  }
  if (channel === 'whatsapp' && !['wa.me', 'api.whatsapp.com', 'web.whatsapp.com', 'whatsapp.com'].includes(parsed.hostname)) throw new Error('Для WhatsApp укажите номер телефона или ссылку WhatsApp.');
  if (channel === 'telegram' && !['t.me', 'telegram.me'].includes(parsed.hostname)) throw new Error('Для Telegram укажите номер телефона, @username или ссылку Telegram.');
  return { name, url: parsed.href };
}

export const MAX_STUDENT_CONTACTS = 10;
export function studentContactDraft(value = {}) {
  return {name:value?.name || '',contacts:Array.isArray(value?.contacts)
    ?value.contacts.map(contact=>({label:contact.label || '',value:contact.value || contact.url || '',channel:studentContactChannel(contact)}))
    :[{label:'',value:value?.url || '',channel:studentContactChannel(value)}],notes:value?.notes || ''};
}
export function studentContactLinks(value = {}) {
  return Array.isArray(value?.contacts)?value.contacts:value?.url?[{label:'',value:value.url,url:value.url}]:[];
}
function normalizeContact(value = {}, person = 'родителя') {
  if (!Object.hasOwn(value || {},'contacts')) return normalizeContactLink(value,person);
  if (!Array.isArray(value.contacts) || value.contacts.length>MAX_STUDENT_CONTACTS) throw new Error(`Можно сохранить до ${MAX_STUDENT_CONTACTS} контактов ${person}.`);
  const name=String(value.name || '').trim(),notes=String(value.notes || '').trim();
  if(name.length>80)throw new Error(`Имя или подпись ${person} должна быть не длиннее 80 символов.`);
  if(notes.length>2000)throw new Error('Заметка должна быть не длиннее 2000 символов.');
  const contacts=value.contacts.flatMap(contact=>{
    if(!contact || typeof contact!=='object' || Array.isArray(contact))throw new Error('Проверьте контакт.');
    const label=String(contact.label || '').trim(),raw=String(contact.value ?? contact.url ?? '').trim();
    if(label.length>60)throw new Error('Название контакта должно быть не длиннее 60 символов.');
    if(!raw){if(label)throw new Error(`Укажите телефон или ссылку для «${label}».`);return [];}
    // Canonical phone links keep their messenger when loaded and normalized again.
    // The original phone formatting remains in `value` for editing and copying.
    let channel = contact.channel;
    if (channel === undefined && PHONE_FORMAT.test(raw) && contact.url) {
      const saved = String(contact.url).match(/^https:\/\/(?:wa\.me\/|t\.me\/\+)([1-9]\d{7,14})\/?$/);
      if (saved && saved[1] === phoneDigits(raw)) channel = studentContactChannel(contact);
    }
    const {url}=normalizeContactLink({url:raw,channel},person);
    return [{label,value:raw,url}];
  });
  return {name,url:contacts[0]?.url || '',contacts,notes};
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
