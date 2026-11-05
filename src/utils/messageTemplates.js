export const MESSAGE_TEMPLATE_CATEGORIES = { trial: 'После пробного', review: 'Просьба об отзыве', other: 'Другое' };
export const MESSAGE_TEMPLATE_VARIABLES = ['имя', 'группа', 'расписание', 'занятия'];
export const currentReviewMonth = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit' }).format(new Date());

export const DEFAULT_MESSAGE_TEMPLATES = [
  { id: 'after-trial', name: 'Догнать группу после пробного', category: 'trial', attachAvailability: true,
    body: '{{имя}}, расписываю подробнее, как будем заниматься. Занятия будут на платформе — перед стартом всё покажу и расскажу, как подключаться.\n\nПредлагаю присоединиться к группе «{{группа}}». Расписание группы — {{расписание}}. Ребята уже немного продвинулись в Python, поэтому сначала предлагаю {{занятия}} индивидуальных занятия, чтобы догнать группу. После этого можно будет перейти в группу.\n\nПрикрепляю свободное время для дополнительных занятий. Посмотри, какие дни и время тебе подходят.' },
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
