import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedTheoryFollowTarget} from './preparedTheoryFollow.js';

const before={id:'lesson',teacherCardId:'sheet-1',cards:[{id:'sheet-1',kind:'theory'}]},after={...before,teacherCardId:'sheet-2',cards:[...before.cards,{id:'sheet-2',kind:'theory'}],theoryFocus:{cardId:'sheet-2',revision:1}};
test('an explicit next-sheet event selects the same sheet for every student and retains an independent view for teachers',()=>{
  assert.deepEqual(preparedTheoryFollowTarget(before,after),{selectedId:'sheet-2',theoryFollowRevision:1});
  assert.equal(preparedTheoryFollowTarget(before,{...after,canManage:true}),null);
  assert.equal(preparedTheoryFollowTarget(before,{...after,readOnly:true}),null);
  assert.equal(preparedTheoryFollowTarget(before,{...after,homework:true}),null);
});
test('layout and data refreshes, local preview, initial loading and old navigation do not pull the camera',()=>{
  assert.equal(preparedTheoryFollowTarget(after,{...after,version:100}),null);
  assert.equal(preparedTheoryFollowTarget(before,{...before,version:100}),null);
  assert.equal(preparedTheoryFollowTarget(null,after),null);
  assert.equal(preparedTheoryFollowTarget({...before,id:'other'},after),null);
  assert.equal(preparedTheoryFollowTarget(before,{...after,theoryFocus:{cardId:'missing',revision:1}}),null);
  assert.equal(preparedTheoryFollowTarget(after,{...after,theoryFocus:{cardId:'sheet-2',revision:-1}}),null);
});
test('repeating the teacher navigation refocuses the same sheet; the last sheet can lead into the first question',()=>{
  assert.deepEqual(preparedTheoryFollowTarget(after,{...after,theoryFocus:{cardId:'sheet-2',revision:2}}),{selectedId:'sheet-2',theoryFollowRevision:2});
  const question={...after,teacherCardId:'question',cards:[...after.cards,{id:'question',kind:'task'}],theoryFocus:{cardId:'question',revision:2}};
  assert.deepEqual(preparedTheoryFollowTarget(after,question),{selectedId:'question',theoryFollowRevision:2});
});
