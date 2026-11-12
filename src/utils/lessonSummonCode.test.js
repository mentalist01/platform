import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { boardPageSummonTarget } from './boardPages.js';
import { normalizeSummonCode, lessonSummonCodeRoom, readTeacherSummonCode, summonedCodeSelection, rememberSummonedCode } from './lessonSummonCode.js';
import { createEmptyCollabSolution, getCollabSolutionChannels, resolveCollabPageSelection } from './collabSolutions.js';
import {lessonPageSelectionKey,readLessonPageSelection,writeScopedLessonPageSelection} from './lessonPageSelection.js';

const bookRoom='board-teacher-pupil~pages', room='collab-teacher-pupil';
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};};
const command=(patch={})=>({id:'summon-1',ts:Date.now(),pageId:'main',studentId:'',zoom:1,offset:{x:120,y:240},view:'collab',code:{solutionId:'task-9'},...patch});

test('summon carries the exact current teacher tab and code workspace, with legacy board commands intact',()=>{
  const current={room,pageId:'page-main',solutionId:'task-9'};
  assert.deepEqual(readTeacherSummonCode({bookRoom,pageId:'main',role:'teacher',userId:'teacher',current}),{solutionId:'task-9'});
  const target=boardPageSummonTarget(command(),'pupil',[{id:'main'}]);
  assert.equal(target.view,'collab');assert.equal(target.code.solutionId,'task-9');
  const legacy=boardPageSummonTarget(command({code:undefined,view:undefined}),'pupil',[{id:'main'}]);
  assert.equal('code' in legacy,false);assert.equal('view' in legacy,false);
});

test('board-only teacher navigation recalls the tab on that page, not another page or window',()=>{
  const s=storage();s.setItem(`collab-code-pages:${room}:teacher:teacher`,JSON.stringify({pageId:'page-other',solutionId:'wrong',byPage:{'page-main':'task-9'}}));
  const input={bookRoom,pageId:'main',role:'teacher',userId:'teacher',storage:s};
  assert.deepEqual(readTeacherSummonCode(input),{solutionId:'task-9'});
  assert.equal(readTeacherSummonCode({...input,pageId:'page-missing'}),null);
  assert.equal(readTeacherSummonCode({...input,role:'student'}),null);
});

test('group summons never route everyone to a private code room',()=>{
  const groupBook='board-group-math~pages';
  assert.equal(lessonSummonCodeRoom(groupBook),'collab-group-math');
  assert.equal(lessonSummonCodeRoom(groupBook,'anna'),'collab-group-math~student~anna');
  assert.equal(readTeacherSummonCode({bookRoom:groupBook,pageId:'main',role:'teacher',userId:'teacher',storage:storage(),
    current:{room:'collab-group-math~student~anna',pageId:'page-main',solutionId:'private'}}),null);
  const privateCommand=command({studentId:'anna'});
  assert.equal(boardPageSummonTarget(privateCommand,'boris',[{id:'main'}]),null);
  assert.equal(summonedCodeSelection(privateCommand,groupBook,'boris'),null);
  assert.equal(summonedCodeSelection(privateCommand,groupBook,'anna').room,'collab-group-math~student~anna');
});

test('cold editor loads restore the summoned tab and keep other saved page choices',()=>{
  const s=storage();s.setItem(`collab-code-pages:${room}:student:pupil`,JSON.stringify({byPage:{'page-other':'old-tab'}}));
  const target=boardPageSummonTarget(command(),'pupil',[{id:'main'}]);
  rememberSummonedCode(target,bookRoom,'pupil',s);
  const saved=JSON.parse(s.getItem(`collab-code-pages:${room}:student:pupil`));
  assert.equal(saved.byPage['page-other'],'old-tab');assert.equal(saved.byPage['page-main'],'task-9');
  const doc=new Y.Doc();createEmptyCollabSolution(doc,{id:'task-9',name:'9'});
  getCollabSolutionChannels(doc,'task-9').codeText.insert(0,'print(9)');
  assert.equal(resolveCollabPageSelection(doc,saved).solutionId,'task-9');
  assert.equal(getCollabSolutionChannels(doc,'task-9').codeText.toString(),'print(9)','Summoning selects a channel without copying code');
  doc.destroy();
});

test('invalid code targets are ignored without breaking the board summon',()=>{
  for(const value of [null,{}, {solutionId:'../other'},{solutionId:'x'.repeat(101)},{solutionId:9}])assert.equal(normalizeSummonCode(value),null);
  for(const value of ['collab-foreign~pages','board-test~page~other~pages','board-test~student~other~pages'])assert.equal(lessonSummonCodeRoom(value),'');
  const target=boardPageSummonTarget(command({code:{solutionId:'../other'}}),'pupil',[{id:'main'}]);
  assert.equal(target.pageId,'main');assert.equal('code' in target,false);
  assert.doesNotThrow(()=>rememberSummonedCode(command(),bookRoom,'pupil',{getItem(){throw Error('disabled')}}));
});

test('code-only and board-only summons preserve the other pane across pages and cold loads',()=>{
  const s=storage(),scope={book:bookRoom,role:'student',userId:'pupil'};
  writeScopedLessonPageSelection(scope,'page-first-01',s,null);
  const codeTarget=boardPageSummonTarget(command({scope:'code',pageId:'page-second-02',zoom:undefined,offset:undefined}),'pupil',[{id:'page-second-02'}]);
  assert.equal(codeTarget.scope,'code');assert.equal(codeTarget.view,'collab');
  rememberSummonedCode(codeTarget,bookRoom,'pupil',s);
  assert.equal(readLessonPageSelection(lessonPageSelectionKey(bookRoom,'student','pupil'),'main',s),'page-first-01','Code summon keeps the board page');
  assert.equal(readLessonPageSelection(lessonPageSelectionKey(bookRoom,'student','pupil','code'),'main',s),'page-second-02');
  const boardTarget=boardPageSummonTarget(command({scope:'board',pageId:'page-third-03'}),'pupil',[{id:'page-third-03'}]);
  assert.equal('code' in boardTarget,false,'Board-only intent cannot carry a code switch');
  rememberSummonedCode(boardTarget,bookRoom,'pupil',s);
  writeScopedLessonPageSelection({...scope,only:true},boardTarget.pageId,s,null);
  assert.equal(readLessonPageSelection(lessonPageSelectionKey(bookRoom,'student','pupil'),'main',s),'page-third-03');
  assert.equal(readLessonPageSelection(lessonPageSelectionKey(bookRoom,'student','pupil','code'),'main',s),'page-second-02','Board summon keeps the code page');
  writeScopedLessonPageSelection({...scope,scope:'code'},'page-manual-04',s,null);
  assert.equal(readLessonPageSelection(lessonPageSelectionKey(bookRoom,'student','pupil'),'main',s),'page-manual-04','Ordinary navigation still opens the paired board and code');
});

test('separate command channels retain both destinations and private code recipients stay scoped',()=>{
  const doc=new Y.Doc(),control=doc.getMap('pageControl'),pages=[{id:'main'}];
  control.set('summon',command({scope:'board'}));
  control.set('summonCode',command({scope:'code',id:'code-private',studentId:'anna',zoom:undefined,offset:undefined}));
  assert.equal(boardPageSummonTarget(control.get('summon'),'boris',pages).scope,'board');
  assert.equal(boardPageSummonTarget(control.get('summonCode'),'boris',pages),null);
  const target=boardPageSummonTarget(control.get('summonCode'),'anna',pages);
  assert.equal(summonedCodeSelection(target,'board-group-test~pages','anna').room,'collab-group-test~student~anna');
  assert.equal(boardPageSummonTarget(command({scope:'code',code:null}),'anna',pages),null);
  doc.destroy();
});
