import test from 'node:test';
import assert from 'node:assert/strict';

import { getProgressTopicStatus } from './progressTopicStatus.js';

test('новая тема без попыток не попадает в зону внимания', () => {
  assert.deepEqual(
    getProgressTopicStatus({ progress: 0, practiceKey: 'new' }),
    { key: 'neutral', label: 'Не начато' },
  );
});

test('нехватка данных показывается нейтрально', () => {
  for (const practiceKey of ['unknown', 'unavailable']) {
    assert.deepEqual(
      getProgressTopicStatus({ progress: 0, practiceKey }),
      { key: 'neutral', label: 'Недостаточно данных' },
    );
  }
});

test('неудачная практика остаётся в зоне внимания', () => {
  assert.deepEqual(
    getProgressTopicStatus({ progress: 0, practiceKey: 'below' }),
    { key: 'focus', label: 'Зона внимания' },
  );
});

test('пороги статусов прогресса не изменились', () => {
  assert.equal(getProgressTopicStatus({ progress: 40 }).key, 'practice');
  assert.equal(getProgressTopicStatus({ progress: 60 }).key, 'active');
  assert.equal(getProgressTopicStatus({ progress: 85 }).key, 'strong');
});
