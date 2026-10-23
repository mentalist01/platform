import { CLASSIC_TASK_SLOT_NUMBERS, DEFAULT_CLASSIC_TASK_TITLES } from './classicTaskCatalog.js';

export const ACHIEVEMENT_CATEGORIES = [
  { id: 'ege', title: 'Задачи ЕГЭ', icon: 'target' },
  { id: 'python', title: 'Python', icon: 'code' },
  { id: 'mocks', title: 'Пробники', icon: 'trophy' },
  { id: 'practice', title: 'Регулярность', icon: 'flame' },
  { id: 'growth', title: 'Работа над собой', icon: 'sparkles' },
];
export const ACHIEVEMENT_RARITIES = {
  bronze: { title: 'Бронза', color: '#b77c51' },
  silver: { title: 'Серебро', color: '#7186a5' },
  gold: { title: 'Золото', color: '#d39728' },
  diamond: { title: 'Алмаз', color: '#7c59e8' },
};
export const ACHIEVEMENT_PYTHON_TOPICS = [
  [101, 'Ввод и вывод', 'Первая программа'], [102, 'Переменные', 'Всё под контролем'],
  [103, 'Условия', 'Есть условие!'], [104, 'Вычисления', 'Точный расчёт'],
  [105, 'Цикл for', 'В своём цикле'], [106, 'Строки', 'Между строк'],
  [107, 'Цикл while', 'Пока всё получается'], [108, 'Списки', 'Всё по списку'],
  [109, 'Кортежи', 'Надёжная связка'], [110, 'Функции и рекурсия', 'Вызов принят'],
  [111, 'Двумерные массивы', 'Другое измерение'],
];
const rarityAt = (index, count) => index === count - 1 ? 'diamond' : index >= count * .55 ? 'gold' : index > 0 ? 'silver' : 'bronze';
const series = (prefix, category, metric, thresholds, titles, describe) => thresholds.map((target, index) => ({
  id: `${prefix}-${target}`, category, metric, target, title: titles[index],
  description: describe(target), rarity: rarityAt(index, thresholds.length),
}));
export const ACHIEVEMENT_CATALOG = [
  ...series('ege-solves', 'ege', 'egeSolved', [1, 10, 25, 50, 100, 250, 500, 1000],
    ['Первый ответ', 'В десятку', 'Разгон взят', 'Полсотни решений', 'Первая сотня', 'Большая практика', 'Полтысячи', 'Тысяча возможностей'], n => `Верно решить ${n === 1 ? "первую задачу" : `${n} разных задач`} ЕГЭ вне пробников.`),
  ...CLASSIC_TASK_SLOT_NUMBERS.flatMap(number => [5, 25].map((target, index) => ({
    id: `ege-task-${number}-${target}`, category: 'ege', metric: `egeTask:${number}`, target,
    title: `${index ? 'Мастер' : 'Знакомство'} №${number === 19 ? '19–21' : number}`,
    description: `${DEFAULT_CLASSIC_TASK_TITLES[number]}: верно решить ${target} разных задач.`,
    rarity: index ? 'gold' : 'bronze',
  }))),
  ...series('python-solves', 'python', 'pythonSolved', [1, 10, 25, 50, 100, 250, 500],
    ['Hello, Python!', 'Код набирает силу', 'Двадцать пять программ', 'Программист в деле', 'Сотня программ', 'Код — мой инструмент', 'Большой Python'], n => `Решить ${n === 1 ? "первую задачу" : `${n} разных задач`} Python с успешной проверкой.`),
  ...ACHIEVEMENT_PYTHON_TOPICS.flatMap(([id, name, title]) => [
    { id: `python-topic-${id}`, category: 'python', metric: `pythonTopic:${id}`, target: 5, title, description: `${name}: решить 5 разных задач.`, rarity: 'bronze' },
    { id: `python-complete-${id}`, category: 'python', metric: `pythonComplete:${id}`, target: 1, title: `${name}: тема пройдена`, description: 'Решить все задачи этой темы Python. Все решения должны пройти проверку.', rarity: 'gold' },
  ]),
  ...series('mock-count', 'mocks', 'mockCount', [1, 3, 5, 10], ['Первая репетиция', 'Уже знакомый формат', 'Пять репетиций', 'Экзамен как дома'], n => `Завершить ${n === 1 ? "первый пробник" : n === 3 ? "3 разных пробника" : `${n} разных пробников`}. Повторные попытки одного пробника считаются один раз.`),
  ...series('mock-score', 'mocks', 'mockBest', [40, 60, 70, 80, 88, 90, 95, 100], ['Первые высоты', 'Уверенный шаг', 'Семьдесят!', 'Высокий полёт', 'Две восьмёрки', 'Девяносто!', 'Почти вершина', 'Сто из ста'], n => `Набрать не меньше ${n} баллов в завершённом пробнике.`),
  ...series('mock-growth', 'growth', 'mockGrowth', [10, 20, 30, 50], ['Видимый рост', 'Рывок вперёд', 'Совсем другой уровень', 'Большая перемена'], n => `Поднять результат на ${n} баллов относительно первого завершённого пробника в одном из следующих пробников.`),
  ...series('active-days', 'practice', 'activeDays', [1, 3, 7, 14, 30, 60, 100], ['День с пользой', 'Три шага', 'Семь дней практики', 'Две недели в копилке', 'Тридцать полезных дней', 'Дистанция пройдена', 'Сто дней роста'], n => `Практиковаться ${n === 1 ? "один день" : n === 3 ? "в 3 разных дня" : `в ${n} разных дней`}: засчитывается верное решение новой задачи или завершение пробника. Дни могут идти с перерывами.`),
  ...series('streak', 'practice', 'streakBest', [3, 7, 14, 30], ['Вошёл в ритм', 'Неделя в ритме', 'Устойчивый ритм', 'Месяц в ритме'], n => `Достичь серии практики ${n} дней по правилам серии платформы. Полученная награда остаётся после перерыва.`),
  ...series('corrections', 'growth', 'corrected', [1, 5, 10, 25, 50], ['Ошибка — это шаг', 'Нашёл и исправил', 'Работа над ошибками', 'Не отступаю', 'Опыт через практику'], n => `Верно решить ${n === 1 ? "задачу, в которой" : `${n} разных задач, в которых`} раньше был неверный ответ. Повторные ошибки награду не ускоряют.`),
  ...series('homeworks', 'growth', 'homeworkCompleted', [1, 5, 10, 25], ['Сделано вовремя', 'Пять готовых работ', 'Надёжный результат', 'Домашка под контролем'], n => `Получить ${n === 1 ? "первую награду" : `${n} наград`} платформы за полностью выполненную к сроку домашнюю работу.`),
  ...series('ege-breadth', 'ege', 'egeBreadth', [5, 10, 20], ['Расширяю кругозор', 'Десять направлений', 'ЕГЭ со всех сторон'], n => `Решить хотя бы по одной задаче ${n} разных типов ЕГЭ.`),
  ...series('python-breadth', 'python', 'pythonBreadth', [3, 7, 11], ['Три темы Python', 'Связываю знания', 'Python со всех сторон'], n => `Решить хотя бы по одной задаче в ${n} основных темах Python.`),
  ...series('mixed-days', 'practice', 'mixedDays', [1, 5, 10], ['И код, и логика', 'Два инструмента', 'Универсальный подход'], n => `В ${n === 1 ? "один день" : `${n} разных дней`} решить новую задачу ЕГЭ и новую задачу Python.`),
];
