export const MESSAGE_TEMPLATE_CATEGORIES = { trial: 'После пробного', review: 'Просьба об отзыве', other: 'Другое' };
export const MESSAGE_TEMPLATE_VARIABLES = ['имя', 'группа', 'расписание', 'дни группы', 'занятия'];
export const MESSAGE_GROUP_TOPIC_MIN_SOLVES = 7;
export const currentReviewMonth = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit' }).format(new Date());

// This is the student-facing payload. Teacher-only names and progress must never
// be assembled from the row's rendered text (including during manual copying).
export function buildGroupSchedulesText(groups = [], selectedIds = []) {
  const selected = new Set(selectedIds);
  return groups.filter(group => selected.has(group.id) && group.scheduleText)
    .map(group => group.scheduleText).join('\n\n');
}

export const DEFAULT_MESSAGE_TEMPLATES = [
  { id: 'after-trial', name: 'Догнать группу после пробного', category: 'trial', attachAvailability: true,
    body: 'Расписываю всё подробно: по поводу подключения - заниматься будем на платформе. Я тебе перед стартом всё подробно покажу и расскажу, как там подключаться. Твоё основное расписание в группе — {{расписание}} — остаётся за тобой. Но так как ребята уже успели пройти пару тем по Питону чуть дальше, давай сначала проведём с тобой несколько занятий один на один (по стоимости всё будет как в группе, без доплат). Спокойно разберём эти темы в твоём темпе, и как только поравняемся с ребятами - сразу перейдёшь к ним на {{дни группы}}. Скидываю картинкой свои свободные окна: посмотри, какие дни и время тебе подойдут на первое время?' },
  { id: 'review-after-report', name: 'Отзыв после отчёта', category: 'review', attachAvailability: false,
    body: 'Всегда пожалуйста, стараюсь держать вас в курсе! Буду очень признателен, если при случае оставите короткий отзыв о наших занятиях прямо на сайте Профи.ру — это очень поможет моей анкете.' },
  { id: 'review-after-feedback', name: 'Перенести тёплые слова в отзыв', category: 'review', attachAvailability: false,
    body: 'Большое спасибо за тёплые слова! А можете, пожалуйста, скопировать их в отзыв на самом сайте Профи.ру? Для моей анкеты это сейчас огромная поддержка.' },
];

export function fillMessageTemplate(body, values = {}) {
  return String(body || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (placeholder, key) =>
    Object.hasOwn(values, key) && String(values[key] ?? '').trim() ? String(values[key]).trim() : placeholder);
}

export function missingMessageVariables(text) {
  return [...new Set([...String(text || '').matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(match => match[1]))];
}
