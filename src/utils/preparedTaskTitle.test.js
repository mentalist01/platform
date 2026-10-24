import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedTaskTitle,preparedTaskCodeName} from './preparedTaskTitle.js';

test('teacher titles stand alone and remain unchanged when tasks move', () => {
  assert.equal(preparedTaskTitle({title: '0'}, 0), '0');
  assert.equal(preparedTaskTitle({title: '4'}, 8), '4');
  assert.equal(preparedTaskTitle({title: '  Остатки  '}, 2), 'Остатки');
  assert.equal(preparedTaskTitle({title: ''}, 2), 'Задача 3');
  assert.equal(preparedTaskTitle({}, 0), 'Задача 1');
  assert.equal(preparedTaskCodeName({title:'0',index:4}),'0.py');
  assert.equal(preparedTaskCodeName({title:'1.py'}),'1.py');
  assert.equal(preparedTaskCodeName({title:'',index:2}),'Задача 3.py');
});
