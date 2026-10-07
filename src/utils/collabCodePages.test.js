import assert from 'node:assert/strict';
import test from 'node:test';
import * as Y from 'yjs';
import { DEFAULT_COLLAB_CODE_PAGE_ID as FIRST, MAX_COLLAB_CODE_PAGES, MAX_COLLAB_SOLUTIONS,
  COLLAB_CODE_PAGES_KEY, createCollabCodePage, deleteCollabCodePage, restoreCollabCodePage,
  renameCollabCodePage, listCollabCodePages, listCollabPageSolutions, getCollabSolutionPageId,
  createEmptyCollabSolution, createCollabSolution, getCollabSolutionChannels, renameCollabSolution,
  deleteCollabSolution, restoreCollabSolution, reorderCollabSolutions, resolveCollabPageSelection,
  getCollabSolutionSnapshot, normalizeCollabCodeDocument } from './collabSolutions.js';

const copy = source => { const doc = new Y.Doc(); Y.applyUpdate(doc, Y.encodeStateAsUpdate(source)); return doc; };
const sync = (a, b) => { const left = Y.encodeStateAsUpdate(a), right = Y.encodeStateAsUpdate(b); Y.applyUpdate(a, right); Y.applyUpdate(b, left); };
const seed = () => {
  const doc = new Y.Doc(), main = getCollabSolutionChannels(doc);
  main.codeText.insert(0, 'print("main")'); main.runMap.set('stdinDraft', 'main input');
  main.runMap.set('output', 'main output'); main.runMap.set('customFiles', [{ id: 'main-file', content: '42' }]);
  for (const id of ['8', '9', '10', '11']) {
    createEmptyCollabSolution(doc, { id, name: id, createdAt: Number(id) });
    getCollabSolutionChannels(doc, id).codeText.insert(0, `print(${id})`);
  }
  return doc;
};

test('legacy stack becomes the virtual first page without rewriting any code, files or run state', () => {
  const doc = seed(), before = Y.encodeStateAsUpdate(doc);
  assert.equal(listCollabCodePages(doc)[0].mainSolutionId, 'main');
  assert.deepEqual(listCollabPageSolutions(doc).map(row => row.id), ['main', '8', '9', '10', '11']);
  assert.deepEqual(Y.encodeStateAsUpdate(doc), before);
});

test('new pages atomically publish a blank main and have independent stacks even with identical tab names', () => {
  const doc = seed(), before = getCollabSolutionSnapshot(doc, 'main');
  doc.getMap(COLLAB_CODE_PAGES_KEY).observe(() => {
    assert.equal(listCollabPageSolutions(doc, 'second').length, 1);
    assert.equal(getCollabSolutionChannels(doc, 'page-second').runMap.get('status'), 'idle');
  });
  const page = createCollabCodePage(doc, { id: 'second', name: ' Второй урок ' });
  assert.equal(page.name, 'Второй урок');
  const main = getCollabSolutionChannels(doc, page.mainSolutionId);
  assert.equal(main.codeText.toString(), ''); assert.equal(main.testFileText.toString(), '');
  assert.equal(main.runMap.get('stdinDraft'), ''); assert.equal(main.runMap.get('output'), '');
  assert.deepEqual(main.runMap.get('customFiles'), []); assert.deepEqual(main.runMap.get('debugBreakpoints'), []);
  createEmptyCollabSolution(doc, { id: 'second-8', name: '8', pageId: page.id });
  getCollabSolutionChannels(doc, 'second-8').codeText.insert(0, 'print("second 8")');
  assert.equal(getCollabSolutionChannels(doc, '8').codeText.toString(), 'print(8)');
  assert.deepEqual(getCollabSolutionSnapshot(doc, 'main'), before);
  assert.equal(listCollabPageSolutions(doc, FIRST).length, 5); assert.equal(listCollabPageSolutions(doc, page.id).length, 2);
});

test('rename, clone, notes snapshots and LF repair preserve the owning page', () => {
  const doc = seed(), page = createCollabCodePage(doc, { id: 'second', name: 'Повторение' });
  const main = getCollabSolutionChannels(doc, page.mainSolutionId);
  main.codeText.insert(0, 'x = 1\r\nprint(x)'); main.runMap.set('output', '1');
  createCollabSolution(doc, { id: 'copy', sourceId: page.mainSolutionId, name: 'Копия' });
  renameCollabSolution(doc, 'copy', 'Решение'); renameCollabCodePage(doc, 'second', '  Второй урок  ');
  assert.equal(getCollabSolutionPageId(doc, 'copy'), 'second');
  assert.equal(getCollabSolutionSnapshot(doc, 'copy').code, 'x = 1\nprint(x)');
  assert.deepEqual(normalizeCollabCodeDocument(doc), [page.mainSolutionId]);
  assert.equal(listCollabCodePages(doc)[1].name, 'Второй урок');
  assert.equal(getCollabSolutionChannels(doc, 'main').codeText.toString(), 'print("main")');
});

test('reordering one page does not reorder another and rejects foreign/partial lists', () => {
  const doc = seed(), page = createCollabCodePage(doc, { id: 'second', name: 'Второй урок' });
  createEmptyCollabSolution(doc, { id: 'a', name: '8', pageId: 'second' });
  createEmptyCollabSolution(doc, { id: 'b', name: '9', pageId: 'second' });
  reorderCollabSolutions(doc, ['b', page.mainSolutionId, 'a'], page.id);
  assert.deepEqual(listCollabPageSolutions(doc, page.id).map(row => row.id), ['b', page.mainSolutionId, 'a']);
  assert.deepEqual(listCollabPageSolutions(doc, FIRST).map(row => row.id), ['main', '8', '9', '10', '11']);
  assert.throws(() => reorderCollabSolutions(doc, ['b', 'main', 'a'], page.id), /порядок/);
  assert.throws(() => reorderCollabSolutions(doc, ['b', 'a'], page.id), /порядок/);
});

test('offline page creation and edits converge; each page keeps its code/input/files/output after binary reload', () => {
  const left = seed(), right = copy(left);
  const a = createCollabCodePage(left, { id: 'teacher-page', name: 'Урок 2', createdAt: 10 });
  const b = createCollabCodePage(right, { id: 'student-page', name: 'Черновики', createdAt: 10 });
  for (const [doc, page] of [[left, a], [right, b]]) {
    const channels = getCollabSolutionChannels(doc, page.mainSolutionId);
    channels.codeText.insert(0, page.id); channels.testFileText.insert(0, `file ${page.id}`);
    channels.runMap.set('stdinDraft', page.id); channels.runMap.set('output', `output ${page.id}`);
  }
  sync(left, right);
  assert.deepEqual(listCollabCodePages(left), listCollabCodePages(right));
  for (const doc of [left, right, copy(left)]) for (const page of [a, b]) {
    const channels = getCollabSolutionChannels(doc, page.mainSolutionId);
    assert.equal(channels.codeText.toString(), page.id); assert.equal(channels.testFileText.toString(), `file ${page.id}`);
    assert.equal(channels.runMap.get('stdinDraft'), page.id); assert.equal(channels.runMap.get('output'), `output ${page.id}`);
  }
});

test('page deletion wins over offline rename and retains late edits for restoring the whole stack', () => {
  const left = seed(); createCollabCodePage(left, { id: 'second', name: 'Второй урок' });
  createEmptyCollabSolution(left, { id: 's8', name: '8', pageId: 'second' });
  const right = copy(left);
  deleteCollabCodePage(left, 'second'); renameCollabCodePage(right, 'second', 'Переименовано');
  getCollabSolutionChannels(right, 's8').codeText.insert(0, '# late edit');
  sync(left, right);
  for (const doc of [left, right, copy(left)]) assert.equal(listCollabCodePages(doc).length, 1);
  restoreCollabCodePage(left, 'second'); sync(left, right);
  assert.equal(listCollabCodePages(right)[1].name, 'Переименовано');
  assert.equal(listCollabPageSolutions(right, 'second').length, 2);
  assert.equal(getCollabSolutionChannels(right, 's8').codeText.toString(), '# late edit');
  assert.throws(() => deleteCollabCodePage(left, FIRST), /Первую/);
  assert.throws(() => deleteCollabSolution(left, 'page-second'), /Основную/);
});

test('individual tab deletion and undo remain inside their own page', () => {
  const doc = seed(); createCollabCodePage(doc, { id: 'second', name: 'Второй урок' });
  createEmptyCollabSolution(doc, { id: 's8', name: '8', pageId: 'second' });
  deleteCollabSolution(doc, 's8'); assert.equal(listCollabPageSolutions(doc, 'second').length, 1);
  restoreCollabSolution(doc, 's8'); assert.equal(getCollabSolutionPageId(doc, 's8'), 'second');
  deleteCollabCodePage(doc, 'second'); assert.throws(() => restoreCollabSolution(doc, 's8'), /Страница/);
});

test('selection restores only known pages and tabs, with a page-local main fallback after deletion', () => {
  const doc = seed(); createCollabCodePage(doc, { id: 'second', name: 'Второй урок' });
  createEmptyCollabSolution(doc, { id: 's8', name: '8', pageId: 'second' });
  const saved = { pageId: 'second', solutionId: 's8', byPage: { [FIRST]: '9', second: 's8' } };
  assert.deepEqual(resolveCollabPageSelection(doc, saved), { pageId: 'second', solutionId: 's8' });
  deleteCollabSolution(doc, 's8'); assert.equal(resolveCollabPageSelection(doc, saved).solutionId, 'page-second');
  assert.equal(resolveCollabPageSelection(doc, { pageId: 'second', solutionId: '8' }).solutionId, 'page-second');
  deleteCollabCodePage(doc, 'second'); assert.deepEqual(resolveCollabPageSelection(doc, saved), { pageId: FIRST, solutionId: '9' });
  assert.deepEqual(resolveCollabPageSelection(doc, null), { pageId: FIRST, solutionId: 'main' });
});

test('a full first stack does not block a new page; both page and per-page tab limits are enforced', () => {
  const doc = new Y.Doc();
  for (let n = 1; n < MAX_COLLAB_SOLUTIONS; n++) createEmptyCollabSolution(doc, { id: `first-${n}`, name: String(n) });
  const second = createCollabCodePage(doc, { id: 'second', name: 'Второй урок' });
  assert.equal(listCollabPageSolutions(doc, second.id).length, 1);
  assert.throws(() => createEmptyCollabSolution(doc, { id: 'extra', name: 'Лишняя' }), /не больше 20/);
  for (let n = 2; n < MAX_COLLAB_CODE_PAGES; n++) createCollabCodePage(doc, { id: `p${n}`, name: String(n) });
  assert.throws(() => createCollabCodePage(doc, { id: 'extra-page', name: 'Лишняя' }), /не больше 20/);
  deleteCollabCodePage(doc, 'p2'); createCollabCodePage(doc, { id: 'replacement', name: 'Новая' });
  assert.throws(() => restoreCollabCodePage(doc, 'p2'), /не больше 20/);
});

test('invalid creation or orphaned page channels never overwrite previous content', () => {
  const doc = seed(), before = Y.encodeStateAsUpdate(doc);
  for (const options of [{ id: FIRST, name: 'Первый' }, { id: 'bad:id', name: 'Второй' }, { id: 'new', name: '' }, { id: 'new', name: 'x'.repeat(81) }]) {
    assert.throws(() => createCollabCodePage(doc, options));
  }
  assert.deepEqual(Y.encodeStateAsUpdate(doc), before);
  getCollabSolutionChannels(doc, 'page-orphan').codeText.insert(0, 'orphan code');
  assert.throws(() => createCollabCodePage(doc, { id: 'orphan', name: 'Новый' }), /уже существуют/);
  assert.equal(getCollabSolutionChannels(doc, 'page-orphan').codeText.toString(), 'orphan code');
  assert.throws(() => createEmptyCollabSolution(doc, { id: 'bad-page-tab', name: '8', pageId: 'missing' }), /Страница/);
});
