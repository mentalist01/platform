import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {createLessonPageCatalog} from './lessonPageCatalog.js';
import {getCollabSolutionChannels,listCollabCodePages} from '../src/utils/collabSolutions.js';

test('simultaneous board, task and code requests share one cold catalog initialization',async()=>{
  const book=new Y.Doc(),code=new Y.Doc();let reads=0,saves=0,release;
  const blocked=new Promise(resolve=>{release=resolve;});
  const service=createLessonPageCatalog({loadBook:async()=>book,
    loadCode:async()=>{reads++;await blocked;return {doc:code,active:true};},
    saveCode:async()=>{saves++;},releaseCode:()=>{}});
  const scope={book:'board-t-a~pages',codes:['collab-t-a']};
  const pending=Array.from({length:8},()=>service.ensure(scope));
  release();
  const books=await Promise.all(pending);
  assert.equal(reads,1,'Cold code must not be decoded once per incoming request');
  assert.equal(saves,1);
  assert.ok(books.every(value=>value===book));
  await service.ensure({...scope,codeRoom:'collab-t-a'});
  assert.equal(reads,1,'A live observed code doc must not be loaded again');
  book.destroy();code.destroy();
});

test('failed shared initialization can be retried without losing saved code',async()=>{
  const book=new Y.Doc(),code=new Y.Doc();getCollabSolutionChannels(code,'main').codeText.insert(0,'saved');
  let fail=true,reads=0;
  const service=createLessonPageCatalog({loadBook:async()=>book,loadCode:async()=>{
    reads++;if(fail)throw Error('Storage temporarily unavailable');return {doc:code,active:true};
  },saveCode:async()=>{},releaseCode:()=>{}});
  const scope={book:'board-t-a~pages',codes:['collab-t-a']};
  const results=await Promise.allSettled(Array.from({length:5},()=>service.ensure(scope)));
  assert.ok(results.every(result=>result.status==='rejected'));
  assert.equal(reads,1);
  fail=false;await service.ensure(scope);
  assert.equal(reads,2);assert.equal(getCollabSolutionChannels(code,'main').codeText.toString(),'saved');
  book.destroy();code.destroy();
});

test('a new group participant arriving during initialization receives their own code projection',async()=>{
  const book=new Y.Doc(),a=new Y.Doc(),b=new Y.Doc();let release,started;
  const blocked=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  let first=true;
  const docs=new Map([['collab-a',a],['collab-b',b]]);
  const service=createLessonPageCatalog({loadBook:async()=>book,loadCode:async room=>{
    if(first){first=false;started();await blocked;}return {doc:docs.get(room),active:true};
  },saveCode:async()=>{},releaseCode:()=>{}});
  const initial=service.ensure({book:'board-group-g~pages',codes:['collab-a']});await entered;
  const changed=service.ensure({book:'board-group-g~pages',codes:['collab-a','collab-b']});
  release();await Promise.all([initial,changed]);
  assert.equal(b.getMap('lessonPages').get('bookRoom'),'board-group-g~pages');
  const {id}=await service.change({book:'board-group-g~pages',codes:['collab-a','collab-b']},{action:'create',name:'Оба участника'});
  assert.ok(listCollabCodePages(a).some(page=>page.id===id));
  assert.ok(listCollabCodePages(b).some(page=>page.id===id));
  book.destroy();a.destroy();b.destroy();
});

test('simultaneous activation of a previously closed code room loads and projects it only once',async()=>{
  const book=new Y.Doc(),code=new Y.Doc();let live=false,reads=0,release;
  const blocked=new Promise(resolve=>{release=resolve;});
  const service=createLessonPageCatalog({loadBook:async()=>book,loadCode:async()=>{
    reads++;if(live)await blocked;return {doc:live?code:new Y.Doc(),active:live};
  },saveCode:async()=>{},releaseCode:doc=>doc.destroy()});
  const scope={book:'board-t-a~pages',codes:['collab-t-a']};await service.ensure(scope);
  live=true;const pending=Array.from({length:6},()=>service.ensure({...scope,codeRoom:'collab-t-a'}));
  release();await Promise.all(pending);
  assert.equal(reads,2);await service.ensure({...scope,codeRoom:'collab-t-a'});assert.equal(reads,2);
  book.destroy();code.destroy();
});
