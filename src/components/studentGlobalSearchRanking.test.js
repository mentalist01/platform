import test from 'node:test';
import assert from 'node:assert/strict';
import { rankStudentSearch } from './studentGlobalSearchRanking.js';

const action = (id, title, intents, searchText = `${title} ${intents.join(' ')}`) => ({
  id,
  group: 'commands',
  title,
  intentPhrases: intents,
  searchText,
});

const ACTIONS = [
  action('progress', 'Успеваемость и задания', ['успеваемость', 'прогресс', 'задание', 'задания', 'домашка', 'дз']),
  action('testing', 'Перейти к тестированию', ['тестирование', 'тесты'], 'тестирование тесты практика задание задача'),
  action('board', 'Доска', ['доска', 'открыть доску', 'перейти на доску']),
  action('collab', 'Совместный код', ['совместный код', 'редактор кода', 'перейти в код']),
  action(
    'lesson',
    'Подключиться к уроку',
    [
      'урок', 'занятие', 'войти на урок', 'звонок', 'звонка', 'созвон', 'позвонить',
      'начать урок', 'войти в звонок', 'присоединиться к звонку', 'учитель звонит',
      'комната урока',
    ],
    'урок занятие подключиться комната звонок звонка созвон видеозвонок позвонить учитель'
  ),
];

const material = (id, title, score = 9_999) => ({
  id,
  group: 'notes',
  title,
  searchText: `${title} задание доска код урок`,
  serverScore: score,
});

test('keeps the primary assignment action above asynchronous materials', () => {
  const ranked = rankStudentSearch({
    query: 'задание',
    actionItems: ACTIONS,
    materialItems: [material('note-1', 'Задание из конспекта')],
  });
  assert.equal(ranked.ordered[0].id, 'progress');
  assert.equal(ranked.ordered[0].presentationTier, 'hero');
  assert.equal(ranked.ordered.at(-1).id, 'note-1');
});

test('understands Russian forms, navigation phrases and a small typo', () => {
  const cases = [
    ['задания', 'progress'],
    ['заданее', 'progress'],
    ['перейти на доску', 'board'],
    ['открыть доску', 'board'],
    ['перейти в код', 'collab'],
    ['редактор кода', 'collab'],
    ['войти на урок', 'lesson'],
    ['занятие', 'lesson'],
  ];
  cases.forEach(([query, expectedId]) => {
    const ranked = rankStudentSearch({ query, actionItems: ACTIONS });
    assert.equal(ranked.actions[0]?.id, expectedId, query);
  });
});

test('predicts the lesson action from the beginning of a word', () => {
  const cases = [
    'у', 'ур', 'уро', 'урок', 'уроки', 'зв', 'зво', 'звон', 'звонок', 'звонка',
    'званок', 'соз', 'созвон', 'позвонить', 'начать урок', 'войти в звонок',
    'присоединиться к звонку', 'учитель звонит', 'комната урока',
  ];
  cases.forEach((query) => {
    const ranked = rankStudentSearch({ query, actionItems: ACTIONS });
    assert.equal(ranked.actions[0]?.id, 'lesson', query);
  });
  assert.equal(rankStudentSearch({ query: 'ур', actionItems: ACTIONS }).actions[0]?.presentationTier, 'feature');
  assert.equal(rankStudentSearch({ query: 'уро', actionItems: ACTIONS }).actions[0]?.presentationTier, 'hero');
  assert.equal(rankStudentSearch({ query: 'урок', actionItems: ACTIONS }).actions[0]?.presentationTier, 'hero');
});

test('uses independent limits so server results cannot evict actions', () => {
  const materials = Array.from({ length: 40 }, (_, index) => material(`note-${index}`, `Задание ${index}`));
  const ranked = rankStudentSearch({
    query: 'задание',
    actionItems: ACTIONS,
    materialItems: materials,
    actionLimit: 3,
    materialLimit: 7,
  });
  assert.ok(ranked.actions.length > 0);
  assert.equal(ranked.materials.length, 7);
  assert.deepEqual(ranked.ordered.slice(0, ranked.actions.length), ranked.actions);
});

test('trusts a server result when the backend matched fields outside the returned snippet', () => {
  const ranked = rankStudentSearch({
    query: 'черепаха functools',
    actionItems: ACTIONS,
    materialItems: [{
      id: 'server-note',
      group: 'notes',
      title: 'Черепаха',
      searchText: 'Черепаха · конспект',
      serverResult: true,
      serverScore: 920,
    }],
  });
  assert.equal(ranked.materials[0]?.id, 'server-note');
});
