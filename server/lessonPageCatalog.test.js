import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {boardPagesList} from '../src/utils/boardPages.js';
import {createCollabCodePage,createEmptyCollabSolution,getCollabSolutionChannels,listCollabCodePages,listCollabPageSolutions,resolveCollabPageSelection} from '../src/utils/collabSolutions.js';
import {importLegacyCodePages,projectLessonPages,mutateLessonPage,lessonPageRooms,createLessonPageCatalog} from './lessonPageCatalog.js';

test('matching board/code pages share identity and keep original code, input, run state and canvas rooms',()=>{
  const book=new Y.Doc(),doc=new Y.Doc();book.getMap('pages').set('board-page-2',{title:'Урок 2',createdAt:2});
  const page=createCollabCodePage(doc,{id:'old-code-page',name:'Урок 2'});
  createEmptyCollabSolution(doc,{id:'task-8',name:'8',pageId:page.id});
  const code=getCollabSolutionChannels(doc,'task-8');code.codeText.insert(0,'print(8)');code.testFileText.insert(0,'input');code.runMap.set('output','8');
  importLegacyCodePages(book,doc,'collab-t-a');projectLessonPages(book,doc,'board-t-a~pages');
  assert.deepEqual(boardPagesList(book.getMap('pages')).map(p=>p.id),['main','board-page-2']);
  assert.deepEqual(listCollabCodePages(doc).map(p=>p.id),['page-main','board-page-2']);
  assert.equal(listCollabCodePages(doc)[1].mainSolutionId,page.mainSolutionId);
  assert.equal(listCollabPageSolutions(doc,'board-page-2')[1].id,'task-8');
  assert.equal(resolveCollabPageSelection(doc,{pageId:'old-code-page',solutionId:'task-8'}).solutionId,'task-8');
  assert.equal(code.codeText.toString(),'print(8)');assert.equal(code.testFileText.toString(),'input');assert.equal(code.runMap.get('output'),'8');
  const before=Y.encodeStateAsUpdate(doc);importLegacyCodePages(book,doc,'collab-t-a');projectLessonPages(book,doc,'board-t-a~pages');
  assert.deepEqual(Y.encodeStateAsUpdate(doc),before,'Repeated projection is a no-op');
});
test('group pupils keep different private code on the same lesson page',()=>{
  const book=new Y.Doc(),a=new Y.Doc(),b=new Y.Doc();
  for(const [doc,id,text] of [[a,'a-page-2','print("a")'],[b,'b-page-2','print("b")']]){
    const page=createCollabCodePage(doc,{id,name:'Задание 8'});getCollabSolutionChannels(doc,page.mainSolutionId).codeText.insert(0,text);
    importLegacyCodePages(book,doc,id);projectLessonPages(book,doc,'board-lesson-x~pages');
  }
  projectLessonPages(book,a,'board-lesson-x~pages');
  assert.equal(boardPagesList(book.getMap('pages')).length,2);
  assert.equal(listCollabCodePages(a)[1].id,listCollabCodePages(b)[1].id);
  assert.equal(getCollabSolutionChannels(a,listCollabCodePages(a)[1].mainSolutionId).codeText.toString(),'print("a")');
  assert.equal(getCollabSolutionChannels(b,listCollabCodePages(b)[1].mainSolutionId).codeText.toString(),'print("b")');
});
test('duplicate titles in one old code book cannot collapse its separate stacks',()=>{
  const book=new Y.Doc(),doc=new Y.Doc();
  createCollabCodePage(doc,{id:'old-page-1',name:'Задание'});createCollabCodePage(doc,{id:'old-page-2',name:'Задание'});
  importLegacyCodePages(book,doc,'collab-t-a');projectLessonPages(book,doc,'board-t-a~pages');
  assert.equal(boardPagesList(book.getMap('pages')).length,3);assert.equal(listCollabCodePages(doc).length,3);
});
test('delete and restore both the original first page and another page preserve content and names',()=>{
  const book=new Y.Doc(),doc=new Y.Doc();const id=mutateLessonPage(book,{action:'create',name:'Урок 2'});
  importLegacyCodePages(book,doc,'c');projectLessonPages(book,doc,'board-t-a~pages');
  getCollabSolutionChannels(doc,'main').codeText.insert(0,'original');
  mutateLessonPage(book,{action:'delete',id:'main'});projectLessonPages(book,doc,'board-t-a~pages');
  assert.deepEqual(listCollabCodePages(doc).map(p=>p.id),[id]);
  assert.throws(()=>mutateLessonPage(book,{action:'delete',id}),/остаться/);
  mutateLessonPage(book,{action:'restore',id:'main'});mutateLessonPage(book,{action:'rename',id,name:'Объяснение'});
  mutateLessonPage(book,{action:'delete',id});projectLessonPages(book,doc,'board-t-a~pages');
  assert.equal(listCollabCodePages(doc).length,1);mutateLessonPage(book,{action:'restore',id});projectLessonPages(book,doc,'board-t-a~pages');
  assert.equal(listCollabCodePages(doc)[1].name,'Объяснение');assert.equal(getCollabSolutionChannels(doc,'main').codeText.toString(),'original');
});
test('short legacy code IDs get safe board IDs and persistence restores their original channels',()=>{
  const book=new Y.Doc(),doc=new Y.Doc();const page=createCollabCodePage(doc,{id:'two',name:'Код 2'});
  getCollabSolutionChannels(doc,page.mainSolutionId).codeText.insert(0,'saved');importLegacyCodePages(book,doc,'collab-t-a');projectLessonPages(book,doc,'board-t-a~pages');
  const restored=new Y.Doc();Y.applyUpdate(restored,Y.encodeStateAsUpdate(doc));const p=listCollabCodePages(restored)[1];
  assert.match(p.id,/^code-/);assert.equal(getCollabSolutionChannels(restored,p.mainSolutionId).codeText.toString(),'saved');
});
test('all existing board pages beyond the former 20-code-page limit remain available',()=>{
  const book=new Y.Doc(),doc=new Y.Doc();for(let n=2;n<=30;n++)book.getMap('pages').set('board-page-'+n,{title:'Страница '+n,createdAt:n});
  importLegacyCodePages(book,doc,'collab-t-a');projectLessonPages(book,doc,'board-t-a~pages');assert.equal(listCollabCodePages(doc).length,30);
});
test('room scopes separate lessons, pupil private code and independent Python explanation boards',()=>{
  assert.equal(lessonPageRooms({kind:'python-board',targetType:'student'}),null);
  assert.deepEqual(lessonPageRooms({kind:'collab-private',targetType:'lesson',roomId:'collab-lesson-x~student~a',session:{id:'x',participantIds:['a','b']}}),{
    book:'board-lesson-x~pages',codes:['collab-lesson-x','collab-lesson-x~student~a','collab-lesson-x~student~b'],codeRoom:'collab-lesson-x~student~a'});
});
test('repeated room preparations reuse the catalog without re-reading all private code',async()=>{
  const book=new Y.Doc(),docs=new Map([['collab-t-a',new Y.Doc()]]);let reads=0;
  const service=createLessonPageCatalog({loadBook:async()=>book,loadCode:async room=>{reads++;return {doc:docs.get(room),active:true};},saveCode:async()=>{},releaseCode:()=>{}});
  const scope={book:'board-t-a~pages',codes:['collab-t-a']};await service.ensure(scope);const before=reads;await service.ensure(scope);await service.ensure(scope);assert.equal(reads,before);
  const {id}=await service.change(scope,{action:'create',name:'Новая'});assert.equal(listCollabCodePages(docs.get('collab-t-a'))[1].id,id);
});
