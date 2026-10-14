import test from 'node:test';
import assert from 'node:assert/strict';
import { homeworkResources } from './homeworkResources.js';
import { hasHomeworkResources } from './homeworkResourcePresence.js';

const now = Date.parse('2026-10-14T12:00:00+03:00');
const video = { id: 'video', kind: 'video', title: 'Разбор задания 7', url: 'https://rutube.ru/video/abc-123/', quizQuestions: [{ id: 'q', question: 'Вопрос' }] };
const entry = { id: 'hw', dueAt: '2026-10-14T20:00:00+03:00', learningMaterials: [video] };

test('assigned lesson videos are visible even without tasks and completed tasks cannot hide them', () => {
  assert.equal(hasHomeworkResources([entry], now), true);
  const resources = homeworkResources([entry], {}, now);
  assert.equal(resources.length, 1);
  assert.equal(resources[0].title, video.title);
  assert.equal(resources[0].hasQuestions, true);
  assert.equal(resources[0].available, true);
});

test('concurrent homework resources retain their own deadlines; expired and closed assignments disappear', () => {
  const entries = [entry, { ...entry, id: 'old', dueAt: '2026-10-13T20:00:00+03:00' },
    { ...entry, id: 'closed', learningAssignmentStatus: 'closed' }, { ...entry, id: 'second', dueAt: '2026-10-16T20:00:00+03:00' }];
  const resources = homeworkResources(entries, {}, now);
  assert.deepEqual(resources.map(resource => resource.id), ['hw:video:video', 'second:video:video']);
  assert.equal(resources[1].dueAt, entries[3].dueAt);
  assert.equal(hasHomeworkResources([entry], Date.parse(entry.dueAt)), false);
});

test('selected Python theory and chapters survive summary projection and missing theory stays explicit', () => {
  const goal = { taskNumber: 101, levelId: 'python', pythonTheorySubsectionId: '__default__', pythonTheoryType: 'rutube' };
  const homework = { ...entry, learningMaterials: [], goals: [goal] };
  const tests = { 101: { pythonTheory: { type: 'rutube', content: video.url, chapters: [{ time: 0, title: 'Начало' }, { time: 80, title: 'Пример' }] } } };
  assert.equal(hasHomeworkResources([homework], now), true);
  const result = homeworkResources([homework], tests, now)[0];
  assert.equal(result.available, true);
  assert.equal(result.chapters[1].title, 'Пример');
  assert.equal(homeworkResources([homework], {}, now)[0].available, false);
  assert.equal(hasHomeworkResources([{ ...entry, learningMaterials: [], goals: [{ taskNumber: 7 }] }], now), false, 'do not invent unassigned videos');
});
