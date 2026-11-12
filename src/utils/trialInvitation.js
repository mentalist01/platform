export const DEFAULT_TRIAL_INVITATION = 'Привет, начинаем через час, вот ссылка на занятие: {ссылка}';

export function trialLessonMeetingUrl(entry) {
  if (!entry?.trialBookingId) return '';
  try { return normalizeTrialMeetingUrl(entry.meetingUrl || ''); } catch { return ''; }
}

export function studentAccessMessage(code) {
  return `ivan100.ru\nКод доступа: ${String(code || '').trim()}`;
}

export function normalizeTrialMeetingUrl(value) {
  if (typeof value !== 'string') throw Error('Вставьте ссылку на занятие.');
  const input = value.trim();
  if (!input) return '';
  if (input.length > 2048 || /\s|[\u0000-\u001f\u007f]/u.test(input)) throw Error('Проверьте ссылку на занятие.');
  let url;
  try { url = new URL(input); } catch { throw Error('Вставьте полную ссылку, начиная с https://.'); }
  if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password) throw Error('Для занятия нужна ссылка https:// без логина и пароля в адресе.');
  return url.href;
}

export function normalizeTrialInvitationTemplate(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw Error('Введите текст шаблона до 4000 символов.');
  if (!value.includes('{ссылка}')) throw Error('Добавьте {ссылка} в текст — сюда подставится ссылка выбранного пробного.');
  return value.trim();
}

export function trialInvitationMessage(template, meetingUrl) {
  if (!meetingUrl) return '';
  return normalizeTrialInvitationTemplate(template || DEFAULT_TRIAL_INVITATION).split('{ссылка}').join(normalizeTrialMeetingUrl(meetingUrl));
}
