import { normalizeTelemostUrl } from './telemost.js';

export function studentLessonVenue(student) {
  const telemost = student?.lessonVenue === 'telemost';
  const url = normalizeTelemostUrl(student?.telemostUrl);
  return {
    telemost,
    label: telemost ? 'Занимаемся в Телемосте' : 'Занимаемся на платформе',
    joinLabel: telemost ? (url ? 'Открыть Телемост' : 'Настроить Телемост') : 'Войти в урок на платформе',
    url,
  };
}
