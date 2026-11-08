import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {COMBINATION_LOCK_CARD,parseCombinationLock,lockExample,lockWord,lockDigits,normalizeLockParams,normalizeLockState,visitLockIndex,turnLockWheel} from './combinationLock.js';
import {interactiveTheoryDefinition,normalizeTheoryItems} from './interactiveTheoryCatalog.js';
import {interactiveTheoryState,updateInteractiveTheory} from './interactiveTheoryState.js';

test('one, two and three for loops produce the exact Python nested-loop order',()=>{
  for (const count of [1,2,3]) {
    const model=parseCombinationLock(lockExample(count));
    assert.equal(model.wheels.length,count);assert.equal(model.total,2**count);
    const expected=count===1?['А','Б']:count===2?['АА','АБ','БА','ББ']:['ААА','ААБ','АБА','АББ','БАА','БАБ','ББА','БББ'];
    assert.deepEqual(Array.from({length:model.total},(_,i)=>lockWord(model,i)),expected);
  }
  const three=parseCombinationLock('for x1 in "АБВ":\n    for x2 in "АБВ":\n        for x3 in "АБВ":\n            print(x1 + x2 + x3)');
  assert.equal(three.total,27);assert.equal(lockWord(three,26),'ВВВ');
});

test('each wheel has its own literal alphabet, named alphabets and digit ranges work without evaluation',()=>{
  const model=parseCombinationLock('letters = "ABC" # input alphabet\nfor a in letters:\n    for b in ["X", "Y"]:\n        for c in range(1, 4):\n            print(a + b + str(c))');
  assert.equal(model.total,18);assert.deepEqual(model.wheels.map(w=>w.symbols),[['A','B','C'],['X','Y'],['1','2','3']]);
  assert.equal(lockWord(model,0),'AX1');assert.equal(lockWord(model,2),'AX3');assert.equal(lockWord(model,3),'AY1');assert.equal(lockWord(model,17),'CY3');
  assert.deepEqual(lockDigits(model,8),[1,0,2]);
  assert.deepEqual(parseCombinationLock('for x in ("А", "Б"):\n    pass').wheels[0].symbols,['А','Б']);
  assert.deepEqual(parseCombinationLock('for x in "А", "Б":\n    pass').wheels[0].symbols,['А','Б']);
  assert.deepEqual(parseCombinationLock('for x in range(3, 0, -1):\n    pass').wheels[0].symbols,['3','2','1']);
});

test('manual wheel turns do not carry; a next step carries, and revisits do not inflate coverage',()=>{
  let state=normalizeLockState({},normalizeLockParams());
  state=turnLockWheel(state,1,1);assert.equal(state.index,1);assert.deepEqual(state.visited,[0,1]);
  const next=visitLockIndex(state,state.index+1);assert.equal(lockWord(parseCombinationLock(next.code),next.index),'БА');
  state=turnLockWheel(state,1,1);assert.equal(state.index,0);assert.deepEqual(state.visited,[0,1]);
  state=turnLockWheel(state,0,-1);assert.equal(state.index,2);
  state=visitLockIndex(state,3);assert.deepEqual(state.visited,[0,1,2,3]);
  state=visitLockIndex(state,3);assert.equal(state.visited.length,4);
});

test('incomplete, unrelated, too large and dependent Python cannot silently produce a misleading lock',()=>{
  const invalid=[
    'for a in "AB":', 'for a in "AB":\nfor b in "AB":\n    pass',
    'for a in "AB":\n    pass\nfor b in "AB":\n    pass',
    'for a in "AB":\n    for a in "AB":\n        pass',
    'for a in open("/private"):\n    pass', 'for a in __import__("os").listdir():\n    pass',
    'for a in "AAB":\n    pass', 'for a in "ABCDEFGHIJK":\n    pass',
    'for a in range(100):\n    pass', 'for a in range(3, 0, 0):\n    pass',
    'for a in "":\n    pass', lockExample(4),
    'for a in "AB":\n    for b in a:\n        pass',
    'a="AB"\nfor a in a:\n    for b in a:\n        pass',
  ];
  for(const code of invalid)assert.throws(()=>parseCombinationLock(code),undefined,code);
  const valid={code:lockExample(1),index:1,visited:[-1,0,1,1,3,'1',null]};
  assert.deepEqual(normalizeLockState(valid),{code:valid.code,index:1,visited:[0,1]});
  assert.equal(normalizeLockState({code:'broken',index:-2,visited:['bad']}).code,lockExample());
  const item=normalizeTheoryItems([{id:'lock',kind:'interactive',typeId:COMBINATION_LOCK_CARD,params:{code:lockExample(3),script:'ignored'}}])[0];
  assert.deepEqual(item.params,{code:lockExample(3)});
});

test('code, wheel positions and coverage synchronize through the existing board and stay isolated per card',()=>{
  const teacher=new Y.Doc(),pupil=new Y.Doc(),card={id:'lock1',interactive:{typeId:COMBINATION_LOCK_CARD,params:{code:lockExample(2)}}};
  const definition=interactiveTheoryDefinition(COMBINATION_LOCK_CARD);
  assert.equal(definition.width,720);assert.equal(definition.height,870);
  updateInteractiveTheory(teacher,card,visitLockIndex(interactiveTheoryState(teacher,card),2));
  Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  assert.deepEqual(interactiveTheoryState(pupil,card).visited,[0,2]);
  updateInteractiveTheory(teacher,card,{code:lockExample(3),index:0,visited:[0]});
  Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  assert.equal(parseCombinationLock(interactiveTheoryState(pupil,card).code).wheels.length,3);
  assert.equal(parseCombinationLock(interactiveTheoryState(pupil,{...card,id:'lock2'}).code).wheels.length,2);
  assert.equal(updateInteractiveTheory(pupil,card,{index:5},{readOnly:true}),false);
  updateInteractiveTheory(pupil,card,turnLockWheel(interactiveTheoryState(pupil,card),2,1));
  Y.applyUpdate(teacher,Y.encodeStateAsUpdate(pupil));
  assert.deepEqual(interactiveTheoryState(teacher,card),interactiveTheoryState(pupil,card));
  updateInteractiveTheory(teacher,card,{}, {reset:true});Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  assert.deepEqual(interactiveTheoryState(pupil,card),definition.reset(card.interactive.params));
  teacher.destroy();pupil.destroy();
});
