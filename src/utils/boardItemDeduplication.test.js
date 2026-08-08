import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  findDuplicateBoardItemIndexes,
  repairDuplicateBoardItems,
} from './boardItemDeduplication.js';

test('keeps the last board item for every duplicate id', () => {
  assert.deepEqual(findDuplicateBoardItemIndexes([
    { id: 'image-1', x: 0 },
    { id: 'shape-1', x: 0 },
    { id: 'image-1', x: 10 },
    { id: '' },
    { id: 'shape-1', x: 20 },
  ]), [1, 0]);
});

test('repairs duplicate ids produced by concurrent Yjs replacements', () => {
  const seed = new Y.Doc();
  seed.getArray('items').push([{ id: 'image-1', type: 'image', x: 0, y: 0 }]);
  const initialUpdate = Y.encodeStateAsUpdate(seed);
  const teacher = new Y.Doc();
  const student = new Y.Doc();
  Y.applyUpdate(teacher, initialUpdate);
  Y.applyUpdate(student, initialUpdate);

  let teacherMove;
  let studentMove;
  teacher.on('update', (update, origin) => {
    if (origin === 'teacher-move') teacherMove = update;
  });
  student.on('update', (update, origin) => {
    if (origin === 'student-move') studentMove = update;
  });

  const replacePosition = (doc, x, origin) => {
    doc.transact(() => {
      const items = doc.getArray('items');
      const current = items.get(0);
      items.delete(0, 1);
      items.insert(0, [{ ...current, x }]);
    }, origin);
  };
  replacePosition(teacher, 10, 'teacher-move');
  replacePosition(student, 20, 'student-move');

  const attachRepair = (doc) => {
    const items = doc.getArray('items');
    const repairOrigin = Symbol('board-duplicate-repair');
    items.observe(() => {
      repairDuplicateBoardItems(items, { doc, origin: repairOrigin });
    });
  };
  attachRepair(teacher);
  attachRepair(student);

  Y.applyUpdate(teacher, studentMove);
  Y.applyUpdate(student, teacherMove);
  Y.applyUpdate(teacher, Y.encodeStateAsUpdate(student));
  Y.applyUpdate(student, Y.encodeStateAsUpdate(teacher));

  const teacherItems = teacher.getArray('items').toArray();
  const studentItems = student.getArray('items').toArray();
  assert.equal(teacherItems.length, 1);
  assert.equal(studentItems.length, 1);
  assert.deepEqual(teacherItems, studentItems);
  assert.equal(teacherItems[0].id, 'image-1');
});

test('repairs duplicates already present in a stored board', () => {
  const doc = new Y.Doc();
  const items = doc.getArray('items');
  items.push([
    { id: 'text-1', type: 'text', text: 'old' },
    { id: 'text-1', type: 'text', text: 'current' },
    { id: 'shape-1', type: 'shape' },
  ]);

  assert.equal(repairDuplicateBoardItems(items, { doc }), 1);
  assert.deepEqual(items.toArray(), [
    { id: 'text-1', type: 'text', text: 'current' },
    { id: 'shape-1', type: 'shape' },
  ]);
});
