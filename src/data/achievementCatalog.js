import { CLASSIC_TASK_SLOT_NUMBERS, DEFAULT_CLASSIC_TASK_TITLES } from './classicTaskCatalog.js';

export const ACHIEVEMENT_CATEGORIES = [
  { id: 'ege', title: 'Задачи ЕГЭ', icon: 'target' },
  { id: 'python', title: 'Python', icon: 'code' },
  { id: 'mocks', title: 'Пробники', icon: 'trophy' },
  { id: 'practice', title: 'Регулярность', icon: 'flame' },
  { id: 'growth', title: 'Прогресс', icon: 'sparkles' },
];
export const ACHIEVEMENT_RARITIES = {
  bronze: { title: 'Бронза', color: '#a67b58' },
  silver: { title: 'Серебро', color: '#8495ad' },
  gold: { title: 'Золото', color: '#d2a52b' },
  diamond: { title: 'Алмаз', color: '#7971ce' },
};
export const ACHIEVEMENT_RARITY_ORDER = ['diamond', 'gold', 'silver', 'bronze'];
export const ACHIEVEMENT_PYTHON_TOPICS = [
  [101, 'Ввод и вывод', 'Ввод и вывод · 5 задач'], [102, 'Переменные', 'Переменные · 5 задач'],
  [103, 'Условия', 'Условия · 5 задач'], [104, 'Вычисления', 'Вычисления · 5 задач'],
  [105, 'Цикл for', 'Цикл for · 5 задач'], [106, 'Строки', 'Строки · 5 задач'],
  [107, 'Цикл while', 'Цикл while · 5 задач'], [108, 'Списки', 'Списки · 5 задач'],
  [109, 'Кортежи', 'Кортежи · 5 задач'], [110, 'Функции и рекурсия', 'Функции и рекурсия · 5 задач'],
  [111, 'Двумерные массивы', 'Двумерные массивы · 5 задач'],
];
const rarityAt = (index, count) => index === count - 1 ? 'diamond' : index >= count * .55 ? 'gold' : index > 0 ? 'silver' : 'bronze';
const series = (prefix, category, metric, thresholds, titles, describe) => thresholds.map((target, index) => ({
  id: `${prefix}-${target}`, category, metric, target, title: titles[index],
  description: describe(target), rarity: rarityAt(index, thresholds.length),
}));
const definitions = [
  ...series('ege-solves', 'ege', 'egeSolved', [1, 10, 25, 50, 100, 250, 500, 1000],
    ['Первая задача ЕГЭ', '10 задач ЕГЭ', '25 задач ЕГЭ', '50 задач ЕГЭ', '100 задач ЕГЭ', '250 задач ЕГЭ', '500 задач ЕГЭ', '1000 задач ЕГЭ'], n => `Верно решить ${n === 1 ? 'первую задачу' : `${n} разных задач`} ЕГЭ вне пробников.`),
  ...CLASSIC_TASK_SLOT_NUMBERS.flatMap(number => [5, 25].map((target, index) => ({
    id: `ege-task-${number}-${target}`, category: 'ege', metric: `egeTask:${number}`, target,
    title: `№${number === 19 ? '19–21' : number} · ${target} решений`,
    description: `${DEFAULT_CLASSIC_TASK_TITLES[number]}: верно решить ${target} разных задач.`,
    rarity: index ? 'gold' : 'bronze',
  }))),
  ...series('python-solves', 'python', 'pythonSolved', [1, 10, 25, 50, 100, 250, 500],
    ['Первая задача Python', '10 задач Python', '25 задач Python', '50 задач Python', '100 задач Python', '250 задач Python', '500 задач Python'], n => `Решить ${n === 1 ? 'первую задачу' : `${n} разных задач`} Python с успешной проверкой.`),
  ...ACHIEVEMENT_PYTHON_TOPICS.flatMap(([id, name, title]) => [
    { id: `python-topic-${id}`, category: 'python', metric: `pythonTopic:${id}`, target: 5, title, description: `${name}: решить 5 разных задач.`, rarity: 'bronze' },
    { id: `python-complete-${id}`, category: 'python', metric: `pythonComplete:${id}`, target: 1, title: `${name} · все задачи`, description: 'Пройти проверку во всех задачах этой темы Python.', rarity: 'gold' },
  ]),
  ...series('mock-count', 'mocks', 'mockCount', [1, 3, 5, 10], ['Первый пробник', '3 пробника', '5 пробников', '10 пробников'], n => `Завершить ${n === 1 ? 'первый пробник' : n === 3 ? '3 разных пробника' : `${n} разных пробников`}. Повторные попытки не учитываются.`),
  ...series('mock-score', 'mocks', 'mockBest', [40, 60, 70, 80, 88, 90, 95, 100], [40, 60, 70, 80, 88, 90, 95, 100].map(n => `Пробник на ${n} баллов`), n => `Набрать не меньше ${n} баллов в завершённом пробнике.`),
  ...series('mock-growth', 'growth', 'mockGrowth', [10, 20, 30, 50], [10, 20, 30, 50].map(n => `+${n} баллов`), n => `Набрать на ${n} баллов больше, чем в первом пробнике. Учитывается результат другого пробника.`),
  ...series('active-days', 'practice', 'activeDays', [1, 3, 7, 14, 30, 60, 100], ['Первый день практики', '3 дня практики', '7 дней практики', '14 дней практики', '30 дней практики', '60 дней практики', '100 дней практики'], n => `${n === 1 ? 'В один день' : n === 3 ? 'В 3 разных дня' : `В ${n} разных дней`} решить новую задачу или завершить пробник. Можно с перерывами.`),
  ...series('streak', 'practice', 'streakBest', [3, 7, 14, 30], ['3 дня подряд', '7 дней подряд', '14 дней подряд', '30 дней подряд'], n => `Достичь серии из ${n} дней практики.`),
  ...series('corrections', 'growth', 'corrected', [1, 5, 10, 25, 50], ['Первая исправленная ошибка', '5 исправленных ошибок', '10 исправленных ошибок', '25 исправленных ошибок', '50 исправленных ошибок'], n => `Верно решить ${n === 1 ? 'задачу, в которой' : `${n} разных задач, в которых`} раньше был неверный ответ.`),
  ...series('homeworks', 'growth', 'homeworkCompleted', [1, 5, 10, 25], ['Первая домашка в срок', '5 домашних работ в срок', '10 домашних работ в срок', '25 домашних работ в срок'], n => `Получить ${n === 1 ? 'первую награду' : `${n} наград`} за полностью выполненную к сроку домашнюю работу.`),
  ...series('ege-breadth', 'ege', 'egeBreadth', [5, 10, 20], [5, 10, 20].map(n => `${n} типов задач ЕГЭ`), n => `Решить хотя бы по одной задаче ${n} разных типов ЕГЭ.`),
  ...series('python-breadth', 'python', 'pythonBreadth', [3, 7, 11], ['3 темы Python', '7 тем Python', '11 тем Python'], n => `Решить хотя бы по одной задаче в ${n} основных темах Python.`),
  ...series('mixed-days', 'practice', 'mixedDays', [1, 5, 10], ['ЕГЭ и Python за день', 'ЕГЭ и Python · 5 дней', 'ЕГЭ и Python · 10 дней'], n => `${n === 1 ? 'В один день' : `В ${n} разных дней`} решить новую задачу ЕГЭ и новую задачу Python.`),
];

// Each number is the total entitlement for a chain, not an extra payout.
const XP_STEPS = {
  egeSolved: [50, 100, 200, 250, 400, 700, 1000, 1500],
  pythonSolved: [50, 100, 150, 250, 400, 650, 1000],
  mockCount: [200, 350, 600, 1000],
  mockBest: [100, 200, 300, 500, 700, 850, 1000, 1500],
  mockGrowth: [150, 300, 500, 800],
  activeDays: [25, 50, 150, 250, 500, 750, 1000],
  streakBest: [75, 150, 300, 600],
  corrected: [25, 50, 100, 200, 350],
  homeworkCompleted: [100, 200, 400, 700],
  egeBreadth: [100, 200, 400],
  pythonBreadth: [100, 250, 500],
  mixedDays: [50, 100, 200],
};
export const ACHIEVEMENT_CATALOG = definitions.map(item => {
  const chain = definitions.filter(entry => entry.metric === item.metric).sort((a, b) => a.target - b.target);
  const amounts = item.metric.startsWith('egeTask:') ? [75, 250]
    : item.metric.startsWith('pythonTopic:') ? [75]
      : item.metric.startsWith('pythonComplete:') ? [350] : XP_STEPS[item.metric];
  return { ...item, rewardChain: item.metric, xpReward: 3 * amounts[chain.findIndex(entry => entry.id === item.id)] };
});
