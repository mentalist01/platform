import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  COLLAB_SOLUTIONS_MAP_KEY,
  DEFAULT_COLLAB_SOLUTION_ID,
  MAX_COLLAB_SOLUTIONS,
  createCollabSolution,
  getCollabSolutionChannels,
  listCollabSolutions,
  renameCollabSolution,
} from './collabSolutions.js';

const copyDoc = (source) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(source));
  return doc;
};

const syncDocs = (left, right) => {
  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate);
  Y.applyUpdate(right, leftUpdate);
};

const seedLegacyDocument = () => {
  const doc = new Y.Doc();
  doc.getText('monaco').insert(0, 'print("привет 🐍")\r\nprint(42)\r');
  doc.getText('collab-test-file').insert(0, '10 20\r\n30');
  const run = doc.getMap('collabRun');
  const initialRun = {
    input: '5\n8',
    output: 'привет 🐍\n42\n',
    error: '',
    status: 'done',
    author: 'Учитель',
    ts: 123,
    taskFilesSelectedIds: ['17.txt', '26.txt'],
    taskFilesCategory: 'testing',
    taskFilesTaskNumber: '17',
    debugBreakpoints: [1, 2],
    customFiles: [{ name: 'input.txt', content: '100' }],
  };
  for (const [key, value] of Object.entries(initialRun)) run.set(key, value);
  return doc;
};

test('main is virtual and preserves legacy text, input file, and run channels', () => {
  const doc = seedLegacyDocument();
  const before = Y.encodeStateAsUpdate(doc);
  const channels = getCollabSolutionChannels(doc);
  assert.equal(channels.codeText, doc.getText('monaco'));
  assert.equal(channels.testFileText, doc.getText('collab-test-file'));
  assert.equal(channels.runMap, doc.getMap('collabRun'));
  assert.deepEqual(listCollabSolutions(doc), [{ id: 'main', name: 'Решение ученика', createdAt: 0 }]);
  assert.equal(doc.getMap(COLLAB_SOLUTIONS_MAP_KEY).size, 0);
  assert.deepEqual(Y.encodeStateAsUpdate(doc), before);
});

test('channels can be selected before metadata arrives during first sync', () => {
  const source = seedLegacyDocument();
  createCollabSolution(source, { id: 'saved-tab', name: 'Сохранённый вариант' });
  const loading = new Y.Doc();
  const pendingChannels = getCollabSolutionChannels(loading, 'saved-tab');
  assert.equal(pendingChannels.codeText.toString(), '');
  assert.equal(loading.getMap(COLLAB_SOLUTIONS_MAP_KEY).size, 0);
  Y.applyUpdate(loading, Y.encodeStateAsUpdate(source));
  assert.equal(pendingChannels.codeText.toString(), 'print("привет 🐍")\nprint(42)\n');
  assert.equal(getCollabSolutionChannels(loading, 'saved-tab').codeText, pendingChannels.codeText);
});

test('cloning atomically copies code, selected files, last input and output with isolated state', () => {
  const doc = seedLegacyDocument();
  const main = getCollabSolutionChannels(doc);
  main.runMap.set('status', 'running');
  main.runMap.set('debugActive', true);
  main.runMap.set('debugPlaying', true);
  main.runMap.set('debugTrace', [{ line: 1 }]);
  main.runMap.set('debugStepIndex', 0);
  main.runMap.set('saveNoticeId', 'source-note');
  main.runMap.set('saveNoticePath', 'Конспекты / Урок');
  let published = 0;
  doc.getMap(COLLAB_SOLUTIONS_MAP_KEY).observe(() => {
    published += 1;
    const clone = getCollabSolutionChannels(doc, 'copy');
    assert.equal(clone.codeText.toString(), 'print("привет 🐍")\nprint(42)\n');
    assert.equal(clone.testFileText.toString(), '10 20\r\n30');
    assert.equal(clone.runMap.get('output'), 'привет 🐍\n42\n');
  });
  assert.deepEqual(createCollabSolution(doc, { id: 'copy', name: '  Мой вариант  ', createdAt: 100 }), {
    id: 'copy', name: 'Мой вариант', createdAt: 100,
  });
  assert.equal(published, 1);
  const clone = getCollabSolutionChannels(doc, 'copy');
  assert.equal(clone.runMap.get('input'), '5\n8');
  assert.equal(clone.runMap.get('stdinDraft'), '5\n8');
  assert.deepEqual(clone.runMap.get('taskFilesSelectedIds'), ['17.txt', '26.txt']);
  assert.notEqual(clone.runMap.get('taskFilesSelectedIds'), main.runMap.get('taskFilesSelectedIds'));
  assert.notEqual(clone.runMap.get('customFiles')[0], main.runMap.get('customFiles')[0]);
  assert.equal(clone.runMap.get('status'), 'idle');
  assert.equal(clone.runMap.get('running'), false);
  assert.equal(clone.runMap.get('debugActive'), false);
  assert.equal(clone.runMap.get('debugPlaying'), false);
  assert.deepEqual(clone.runMap.get('debugTrace'), []);
  assert.equal(clone.runMap.get('debugStepIndex'), -1);
  assert.equal(clone.runMap.has('saveNoticeId'), false);
  assert.equal(clone.runMap.has('saveNoticePath'), false);
  assert.equal(main.runMap.get('saveNoticeId'), 'source-note');
  clone.codeText.insert(0, '# второй вариант\n');
  clone.testFileText.insert(0, '99\n');
  clone.runMap.set('input', '999');
  clone.runMap.set('output', 'other output');
  clone.runMap.set('taskFilesSelectedIds', ['other.txt']);
  assert.equal(main.codeText.toString(), 'print("привет 🐍")\r\nprint(42)\r');
  assert.equal(main.testFileText.toString(), '10 20\r\n30');
  assert.equal(main.runMap.get('input'), '5\n8');
  assert.equal(main.runMap.get('output'), 'привет 🐍\n42\n');
  assert.deepEqual(main.runMap.get('taskFilesSelectedIds'), ['17.txt', '26.txt']);
});

test('clone of an empty legacy run fills file and draft defaults without changing main', () => {
  const doc = new Y.Doc();
  createCollabSolution(doc, { id: 'empty', name: 'Пустой' });
  const run = getCollabSolutionChannels(doc, 'empty').runMap;
  assert.equal(run.get('auxPanelMode'), 'input');
  assert.deepEqual(run.get('taskFilesSelectedIds'), []);
  assert.equal(run.get('taskFilesTaskNumber'), '');
  assert.equal(run.get('taskFilesCategory'), 'class');
  assert.equal(run.get('taskFilesPanelOpen'), false);
  assert.equal(run.get('stdinDraft'), '');
  assert.equal(getCollabSolutionChannels(doc).runMap.size, 0);
  run.set('input', 'previous run');
  run.set('stdinDraft', '');
  createCollabSolution(doc, { id: 'third', sourceId: 'empty', name: 'Следующий' });
  assert.equal(getCollabSolutionChannels(doc, 'third').runMap.get('stdinDraft'), '');
  assert.equal(getCollabSolutionChannels(doc, 'third').runMap.get('input'), 'previous run');
});

test('invalid and duplicate creation cannot change existing content', () => {
  const doc = seedLegacyDocument();
  createCollabSolution(doc, { id: 'copy', name: 'Копия' });
  const before = Y.encodeStateAsUpdate(doc);
  for (const request of [
    { id: DEFAULT_COLLAB_SOLUTION_ID, name: 'Перезаписать' },
    { id: 'copy', name: 'Снова' },
    { id: 'new', name: '  ' },
    { id: 'new', name: 'x'.repeat(81) },
    { id: 'new', name: 'Копия', sourceId: 'missing' },
    { id: 'bad:id', name: 'Копия' },
  ]) assert.throws(() => createCollabSolution(doc, request));
  assert.deepEqual(Y.encodeStateAsUpdate(doc), before);
  const orphan = getCollabSolutionChannels(doc, 'orphan');
  orphan.codeText.insert(0, 'existing data');
  assert.throws(() => createCollabSolution(doc, { id: 'orphan', name: 'Копия' }), /уже существуют/);
  assert.equal(orphan.codeText.toString(), 'existing data');
});

test('limit counts the virtual main and rename retains ordering and document content', () => {
  const doc = seedLegacyDocument();
  for (let i = 1; i < MAX_COLLAB_SOLUTIONS; i += 1) {
    createCollabSolution(doc, { id: `copy-${i}`, name: `Копия ${i}`, createdAt: i });
  }
  assert.equal(listCollabSolutions(doc).length, 20);
  assert.throws(() => createCollabSolution(doc, { name: 'Лишняя', id: 'extra' }), /не больше 20/);
  renameCollabSolution(doc, 'main', 'Первое решение');
  renameCollabSolution(doc, 'copy-2', 'Второй способ');
  assert.deepEqual(listCollabSolutions(doc).slice(0, 3), [
    { id: 'main', name: 'Первое решение', createdAt: 0 },
    { id: 'copy-1', name: 'Копия 1', createdAt: 1 },
    { id: 'copy-2', name: 'Второй способ', createdAt: 2 },
  ]);
  assert.throws(() => renameCollabSolution(doc, 'copy-2', ' '), /Введите/);
  assert.throws(() => renameCollabSolution(doc, 'missing', 'Имя'), /не найдено/);
  assert.equal(getCollabSolutionChannels(doc).runMap.get('output'), 'привет 🐍\n42\n');
});

test('two disconnected clients clone main without duplicating legacy initialization', () => {
  const left = seedLegacyDocument();
  const right = copyDoc(left);
  const original = getCollabSolutionChannels(left).codeText.toString();
  createCollabSolution(left, { id: 'teacher-copy', name: 'Учитель', createdAt: 5 });
  createCollabSolution(right, { id: 'student-copy', name: 'Ученик', createdAt: 5 });
  syncDocs(left, right);
  assert.deepEqual(listCollabSolutions(left), listCollabSolutions(right));
  assert.equal(listCollabSolutions(left).length, 3);
  assert.equal(getCollabSolutionChannels(left).codeText.toString(), original);
  assert.equal(getCollabSolutionChannels(right).codeText.toString(), original);
  for (const id of ['teacher-copy', 'student-copy']) {
    assert.equal(getCollabSolutionChannels(left, id).codeText.toString(), original.replace(/\r\n?/g, '\n'));
    assert.equal(getCollabSolutionChannels(right, id).codeText.toString(), original.replace(/\r\n?/g, '\n'));
  }
});

test('offline edits merge within one tab and remain isolated across other tabs', () => {
  const left = seedLegacyDocument();
  createCollabSolution(left, { id: 'copy', name: 'Вариант', createdAt: 1 });
  const right = copyDoc(left);
  const leftMain = getCollabSolutionChannels(left);
  const rightMain = getCollabSolutionChannels(right);
  const leftCopy = getCollabSolutionChannels(left, 'copy');
  const rightCopy = getCollabSolutionChannels(right, 'copy');
  leftMain.codeText.insert(0, '# учитель\n');
  rightMain.codeText.insert(rightMain.codeText.length, '# ученик\n');
  leftCopy.codeText.insert(0, '# другая вкладка\n');
  rightCopy.testFileText.insert(0, '88\n');
  leftCopy.runMap.set('output', 'clone result');
  rightMain.runMap.set('output', 'main result');
  syncDocs(left, right);
  assert.equal(leftMain.codeText.toString(), rightMain.codeText.toString());
  assert.match(leftMain.codeText.toString(), /^# учитель\n/);
  assert.match(leftMain.codeText.toString(), /# ученик\n$/);
  assert.equal(leftCopy.codeText.toString(), rightCopy.codeText.toString());
  assert.match(leftCopy.codeText.toString(), /^# другая вкладка\n/);
  assert.doesNotMatch(leftCopy.codeText.toString(), /# учитель|# ученик/);
  assert.equal(leftCopy.testFileText.toString(), '88\n10 20\r\n30');
  assert.equal(leftMain.testFileText.toString(), '10 20\r\n30');
  assert.equal(rightCopy.runMap.get('output'), 'clone result');
  assert.equal(leftMain.runMap.get('output'), 'main result');
});

test('all versions and renamed main survive binary persistence and reload', () => {
  const source = seedLegacyDocument();
  renameCollabSolution(source, 'main', 'Перебор');
  createCollabSolution(source, { id: 'second', name: 'Формула', createdAt: 200 });
  getCollabSolutionChannels(source, 'second').codeText.insert(0, '# формула\n');
  createCollabSolution(source, { sourceId: 'second', id: 'third', name: 'Черновик', createdAt: 100 });
  const reloaded = copyDoc(source);
  assert.deepEqual(listCollabSolutions(reloaded), listCollabSolutions(source));
  assert.deepEqual(listCollabSolutions(reloaded).map(({ id }) => id), ['main', 'third', 'second']);
  for (const { id } of listCollabSolutions(source)) {
    const original = getCollabSolutionChannels(source, id);
    const restored = getCollabSolutionChannels(reloaded, id);
    assert.equal(restored.codeText.toString(), original.codeText.toString());
    assert.equal(restored.testFileText.toString(), original.testFileText.toString());
    assert.deepEqual(restored.runMap.toJSON(), original.runMap.toJSON());
  }
});
