import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {authorizeLearningCollabUpgrade} from '../../server/learningLessonAccess.js';
import {boardPagesList,boardPageRoom,boardPageBookRoom,parseBoardPageRoom,boardPageSummonTarget,boardPageInitialState,deleteBoardPage,boardPageAfterChange} from './boardPages.js';

test('remembered pages can open directly before the manifest sync without accepting malformed room IDs',()=>{
  const state=boardPageInitialState('page-test-02');
  assert.equal(state.pageId,'page-test-02');
  assert.equal(state.pages.find(page=>page.id===state.pageId)?.title,'Страница');
  assert.equal(boardPageRoom('board-teacher-student',state.pageId),'board-teacher-student~page~page-test-02');
  for(const value of [null,undefined,'main','../secret','page~page~other','short',42])assert.equal(boardPageInitialState(value).pageId,'main');
});

test('page rooms preserve legacy first-page names and private window ownership',()=>{
  const base='board-lesson-lesson-a',page='page-test-02';
  assert.equal(boardPageRoom(base,'main'),'board-lesson-lesson-a');
  assert.equal(boardPageRoom(base,'main','student-a'),'board-lesson-lesson-a~student~student-a');
  assert.deepEqual(parseBoardPageRoom(boardPageRoom(base,page,'student-a')),{baseRoomId:'board-lesson-lesson-a~student~student-a',book:false,pageId:page});
  assert.deepEqual(parseBoardPageRoom(boardPageBookRoom(base)),{baseRoomId:base,book:true,pageId:''});
  for(const room of ['board-a~page~../secret','board-a~page~page-test-02~page~page-other','board-a~student~a~pages','board-a~pages~pages'])assert.equal(parseBoardPageRoom(room),null);
  const teacher={id:'teacher-a',role:'teacher'},a={id:'student-a',role:'student',teacherId:'teacher-a'},b={...a,id:'student-b'};
  const group={id:'g',teacherId:'teacher-a',status:'active',members:['student-a','student-b'].map(studentId=>({studentId,status:'active'}))};
  const lesson={id:'lesson-a',groupId:'g',teacherId:'teacher-a',participantIds:['student-a','student-b'],startAt:new Date().toISOString(),durationMinutes:60,status:'active'};
  const access=(room,auth)=>authorizeLearningCollabUpgrade({requestUrl:'/collab/'+encodeURIComponent(room),auth,sessions:[lesson],groups:[group],students:[]});
  assert.equal(access(boardPageRoom(base,page,'student-a'),a).allowed,true);
  assert.equal(access(boardPageRoom(base,page,'student-a'),b).allowed,false);
  assert.equal(access(boardPageRoom(base,page,'student-a'),teacher).allowed,true);
  assert.equal(access(boardPageBookRoom(base),a).readOnly,true,'Students cannot send a teacher summon or change the page manifest');
  assert.equal(access(boardPageBookRoom(base),teacher).readOnly,false);
});
test('metadata is compact, ordered and never contains page canvases',()=>{
  const doc=new Y.Doc(),map=doc.getMap('pages');
  for(let i=1;i<100;i++)map.set('page-'+String(i).padStart(8,'0'),{title:'Страница '+(i+1),createdAt:i});
  const list=boardPagesList(map);
  assert.equal(list.length,100);assert.equal(list[0].id,'main');assert.equal(list.at(-1).title,'Страница 100');
  assert.ok(Y.encodeStateAsUpdate(doc).byteLength<20000,'One hundred page titles occupy less than 20 KiB');
  doc.destroy();
});
test('deleting shared pages synchronizes, moves viewers to a neighbor and preserves the last page',()=>{
  const a=new Y.Doc(),b=new Y.Doc(),map=a.getMap('pages');
  map.set('page-test-02',{title:'Теория',createdAt:1});map.set('page-test-03',{title:'Задание',createdAt:2});
  const before=boardPagesList(map);
  assert.equal(deleteBoardPage(map,'page-test-02'),true);
  Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
  const next=boardPagesList(b.getMap('pages'));
  assert.deepEqual(next.map(p=>p.id),['main','page-test-03']);
  assert.equal(boardPageAfterChange(before,next,'page-test-02'),'page-test-03');
  assert.equal(boardPageAfterChange(before,next,'main'),'main');
  assert.equal(deleteBoardPage(map,'main'),true);
  Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
  assert.deepEqual(boardPagesList(b.getMap('pages')).map(p=>p.id),['page-test-03']);
  assert.equal(deleteBoardPage(map,'page-test-03'),false);
  assert.equal(deleteBoardPage(map,'main'),false);
  assert.equal(boardPageSummonTarget({id:'old',ts:Date.now(),pageId:'main'},'student',boardPagesList(map)),null);
  a.destroy();b.destroy();
});
test('summons move everyone to a shared window or only the owner to a private one and ignore stale commands',()=>{
  const now=Date.now(),pages=[{id:'main'},{id:'page-test-02'}],command={id:'summon',ts:now,pageId:'page-test-02',zoom:1.25,offset:{x:120,y:200}};
  assert.equal(boardPageSummonTarget(command,'a',pages,now).pageId,'page-test-02');
  assert.equal(boardPageSummonTarget({...command,studentId:'a'},'b',pages,now),null);
  assert.equal(boardPageSummonTarget({...command,studentId:'a'},'a',pages,now).studentId,'a');
  assert.equal(boardPageSummonTarget({...command,ts:now-16000},'a',pages,now),null);
  assert.equal(boardPageSummonTarget({...command,pageId:'missing'},'a',pages,now),null);
});
