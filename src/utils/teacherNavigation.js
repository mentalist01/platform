const SECTIONS = [
  { id: 'nav-schedule', label: 'Расписание', description: 'Занятия, группы и встречи', views: ['schedule', 'teacher-calendar', 'groups', 'meetings'] },
  { id: 'lesson', label: 'Урок', description: 'Звонок, доска и совместный код', views: ['call', 'board', 'collab'] },
  { id: 'nav-students', label: 'Ученики', description: 'Список, оценки и чаты', views: ['teacher-students', 'progress', 'rating', 'teacher-comms'] },
  { id: 'nav-materials', label: 'Материалы', description: 'Тесты, конспекты и записи', views: ['python', 'teacher', 'notes', 'recording'] },
  { id: 'nav-management', label: 'Управление', description: 'Финансы и настройки', views: ['finance', 'teacher-settings'] },
];

export const getTeacherNavigationGroup = view => SECTIONS.find(section => section.views.includes(view))?.id;

export const buildTeacherNavigation = nav => SECTIONS.map(section => {
  const routes = section.views.map(id => nav.find(item => item.id === id)).filter(Boolean);
  return { id: section.id, label: section.label, description: section.description, routes, children: section.id === 'lesson' ? [] : routes };
});

const SEARCH_WORDS = {
  schedule: 'график занятия уроки',
  'teacher-calendar': 'календарь все ученики',
  groups: 'мини группа групповые занятия',
  meetings: 'созвон приглашение ссылка гости',
  call: 'урок звонок созвон видео микрофон камера',
  board: 'урок рисование страницы',
  collab: 'урок программирование редактор',
  'teacher-students': 'ученик ученица ученики',
  progress: 'результаты прогресс домашняя работа дз',
  rating: 'баллы',
  'teacher-comms': 'чат переписка сообщения уведомления',
  python: 'питон программирование задачи',
  teacher: 'тест пробник задания экзамен',
  notes: 'конспект материалы файлы',
  recording: 'запись записи архив видео пульт приложение скачать',
  finance: 'оплата оплатить платеж платежи баланс деньги',
  'teacher-settings': 'настройки учетная запись аккаунт преподаватель',
};
const normalizeSearch = value => String(value || '').toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const searchTeacherNavigation = (groups, query) => {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  const words = normalized.split(' ');
  return groups.flatMap(group => (group.routes || group.children).flatMap(item => {
    const title = normalizeSearch(item.label);
    const keywords = normalizeSearch(SEARCH_WORDS[item.id]);
    const section = normalizeSearch(group.label);
    const availableWords = `${title} ${keywords} ${section}`.split(' ');
    if (!words.every(word => availableWords.some(candidate => candidate.startsWith(word)))) return [];
    const score = title === normalized ? 100 : title.startsWith(normalized) ? 80 : title.includes(normalized) ? 60 : keywords.includes(normalized) ? 40 : 20;
    return [{ ...item, groupId: group.id, groupLabel: group.label, score }];
  })).sort((a, b) => b.score - a.score);
};
