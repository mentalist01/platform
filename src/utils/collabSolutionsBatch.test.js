import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { DEFAULT_COLLAB_CODE_PAGE_ID, MAX_COLLAB_SOLUTIONS, createEmptyCollabSolution, createCollabCodePage,
  createNumberedCollabSolutions, planNumberedCollabSolutions, listCollabPageSolutions, listCollabSolutions,
  getCollabSolutionChannels, reorderCollabSolutions, deleteCollabSolution } from './collabSolutions.js';

const ids = (...values) => { let index = 0; return () => values[index++]; };

test('consecutive ranges include both ends and require a matching count', () => {
  assert.deepEqual(planNumberedCollabSolutions({ from: '4', to: '7', count: '4' }), ['4','5','6','7']);
  assert.deepEqual(planNumberedCollabSolutions({ from: 4, to: 10, count: 7 }), ['4','5','6','7','8','9','10']);
  assert.throws(() => planNumberedCollabSolutions({ from: 4, to: 10, count: 4 }), /нужно вкладок: 7/);
  assert.deepEqual(planNumberedCollabSolutions({ from: 0, to: 0, count: 1 }), ['0']);
  for (const from of ['', -1, 1.5, '1e3', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => planNumberedCollabSolutions({ from, to: 10, count: 1 }), /целые/);
  }
  assert.throws(() => planNumberedCollabSolutions({ from: 8, to: 4, count: 5 }), /не меньше/);
});

test('batch is one Yjs update, ordered on a peer and after persistence, with independent empty content', () => {
  const teacher = new Y.Doc(), pupil = new Y.Doc();
  const main = getCollabSolutionChannels(teacher);
  main.codeText.insert(0, 'print("не копировать")'); main.testFileText.insert(0,'42'); main.runMap.set('output','42');
  createEmptyCollabSolution(teacher, { id: 'previous', name: 'Предыдущий' });
  reorderCollabSolutions(teacher, ['previous', 'main']);
  Y.applyUpdate(pupil, Y.encodeStateAsUpdate(teacher));
  const updates = [];
  teacher.on('update', (update, origin) => { updates.push(origin); Y.applyUpdate(pupil, update); });
  const added = createNumberedCollabSolutions(teacher, { from: 4, to: 7, count: 4, idFactory: ids('z','m','a','b'), createdAt: 123 });
  assert.deepEqual(updates, ['collab-solutions:create-batch']);
  assert.deepEqual(added.map(row => row.name), ['4','5','6','7']);
  const expected=['Предыдущий','Основной код','4','5','6','7'];
  assert.deepEqual(listCollabSolutions(pupil).map(row=>row.name), expected);
  const restored=new Y.Doc(); Y.applyUpdate(restored,Y.encodeStateAsUpdate(teacher));
  assert.deepEqual(listCollabSolutions(restored).map(row=>row.name), expected);
  for (const solution of added) {
    const channels=getCollabSolutionChannels(pupil,solution.id);
    assert.equal(channels.codeText.toString(),''); assert.equal(channels.testFileText.toString(),'');
    assert.equal(channels.runMap.get('output'),''); assert.equal(channels.runMap.get('running'),false);
  }
  getCollabSolutionChannels(pupil, added[0].id).codeText.insert(0,'print(4)');
  assert.equal(getCollabSolutionChannels(pupil,added[1].id).codeText.toString(),'');
  assert.equal(main.codeText.toString(),'print("не копировать")');
});

test('existing names reject the whole batch without overwriting a solution', () => {
  const doc=new Y.Doc(); createEmptyCollabSolution(doc,{id:'existing',name:'6'});
  getCollabSolutionChannels(doc,'existing').codeText.insert(0,'saved');
  const before=Y.encodeStateAsUpdate(doc);
  assert.throws(()=>createNumberedCollabSolutions(doc,{from:4,to:7,count:4}),/уже есть вкладки: 6/);
  assert.deepEqual(Y.encodeStateAsUpdate(doc),before);
  assert.equal(getCollabSolutionChannels(doc,'existing').codeText.toString(),'saved');
});

test('page capacity is checked before creating any tabs, including the main tab', () => {
  const doc=new Y.Doc();
  for(let n=1;n<MAX_COLLAB_SOLUTIONS-2;n++)createEmptyCollabSolution(doc,{id:`old-${n}`,name:`Старый ${n}`});
  const before=Y.encodeStateAsUpdate(doc);
  assert.throws(()=>createNumberedCollabSolutions(doc,{from:4,to:7,count:4}),/ещё 2 вкладки/);
  assert.deepEqual(Y.encodeStateAsUpdate(doc),before);
  createNumberedCollabSolutions(doc,{from:4,to:5,count:2});
  assert.equal(listCollabSolutions(doc).length,20);
  assert.throws(()=>createNumberedCollabSolutions(doc,{from:6,to:6,count:1}),/ещё 0/);
});

test('invalid and occupied IDs cannot leave a partial batch', () => {
  const doc=new Y.Doc(); createEmptyCollabSolution(doc,{id:'taken',name:'Старый'});
  for(const values of [['free','taken'],['repeat','repeat'],['free','wrong:id'],['free','main']]) {
    const before=Y.encodeStateAsUpdate(doc);
    assert.throws(()=>createNumberedCollabSolutions(doc,{from:4,to:5,count:2,idFactory:ids(...values)}));
    assert.deepEqual(Y.encodeStateAsUpdate(doc),before);
  }
  getCollabSolutionChannels(doc,'orphan').codeText.insert(0,'unpublished');
  const before=Y.encodeStateAsUpdate(doc);
  assert.throws(()=>createNumberedCollabSolutions(doc,{from:4,to:5,count:2,idFactory:ids('free','orphan')}),/уже существуют/);
  assert.deepEqual(Y.encodeStateAsUpdate(doc),before);
});

test('batches belong to the selected page and preserve the order and content of other pages', () => {
  const doc=new Y.Doc(); createEmptyCollabSolution(doc,{id:'old-four',name:'4'});
  const page=createCollabCodePage(doc,{id:'second',name:'Другая страница'});
  const firstBefore=listCollabPageSolutions(doc,DEFAULT_COLLAB_CODE_PAGE_ID);
  const added=createNumberedCollabSolutions(doc,{from:4,to:7,count:4,pageId:page.id});
  assert.deepEqual(listCollabPageSolutions(doc,DEFAULT_COLLAB_CODE_PAGE_ID),firstBefore);
  assert.deepEqual(listCollabPageSolutions(doc,page.id).map(row=>row.name),['Основной код','4','5','6','7']);
  deleteCollabSolution(doc,added[0].id);
  createNumberedCollabSolutions(doc,{from:4,to:4,count:1,pageId:page.id});
  assert.equal(listCollabPageSolutions(doc,page.id).length,5);
  assert.throws(()=>createNumberedCollabSolutions(doc,{from:8,to:9,count:2,pageId:'missing'}),/не найдена/);
});
