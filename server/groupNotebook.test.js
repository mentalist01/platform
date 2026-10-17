import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';const Y=createRequire(import.meta.url)('yjs');
import {createGroupNotebook} from './groupNotebook.js';
import {groupNotebookBoard,groupNotebookCode} from '../src/utils/groupNotebook.js';
import {boardPagesList,boardPageRoom} from '../src/utils/boardPages.js';
import {createCollabCodePage,getCollabSolutionChannels} from '../src/utils/collabSolutions.js';
const copy=doc=>{const d=new Y.Doc();if(doc)Y.applyUpdate(d,Y.encodeStateAsUpdate(doc));return d;};
function fixture(){
 const source=new Map(),target=new Map(),saved=new Map(),backups=new Map(),grants=[];
 const get=room=>{if(!source.has(room))source.set(room,new Y.Doc());return source.get(room);};
 const lessons=[{id:'lesson-one',startAt:'2026-10-07T17:00:00Z',status:'completed',participantIds:['a','b']},{id:'lesson-two',startAt:'2026-10-09T17:00:00Z',status:'completed',participantIds:['a','b']},{id:'lesson-three',startAt:'2026-10-16T17:00:00Z',status:'completed',participantIds:['a','b']}];
 get('board-lesson-lesson-one~pages').getMap('pages').set('main',{title:'Задание 7'});
 get('board-lesson-lesson-one~pages').getMap('pages').set('board-page-2',{title:'Пустая сохранённая страница',createdAt:2});
 get('board-lesson-lesson-one').getArray('items').push([{id:'image',type:'image',assetId:'old-image',x:15,y:18},{id:'drawing',type:'path',points:[{x:1,y:2}]}]);
 get('board-lesson-lesson-one~student~a').getArray('items').push([{id:'private-drawing',text:'A'}]);
 getCollabSolutionChannels(get('collab-lesson-lesson-one'),'main').codeText.insert(0,'print(7)');
 const code=get('collab-lesson-lesson-one'),page=createCollabCodePage(code,{id:'code-only-page',name:'Цикл for'});getCollabSolutionChannels(code,page.mainSolutionId).codeText.insert(0,'for i in range(3):\n    print(i)');
 get('board-lesson-lesson-two').getArray('items').push([{id:'different-drawing',text:'9 October'}]);
 getCollabSolutionChannels(get('collab-lesson-lesson-two'),'main').codeText.insert(0,'print(9)');
 for(const owner of ['a','b']){const c=getCollabSolutionChannels(get('collab-lesson-lesson-two~student~'+owner),'main');c.codeText.insert(0,'private '+owner);c.testFileText.insert(0,'input '+owner);c.runMap.set('output','result '+owner);c.runMap.set('status','running');}
 getCollabSolutionChannels(get('collab-lesson-lesson-three~student~a'),'main').codeText.insert(0,'last lesson Python');
 const deps={lessons:()=>lessons,readSource:async room=>copy(source.get(room)),loadTarget:async room=>{if(!target.has(room)){const doc=new Y.Doc();if(saved.has(room))Y.applyUpdate(doc,saved.get(room));target.set(room,doc);}return target.get(room);},saveTarget:async(room,doc)=>saved.set(room,Y.encodeStateAsUpdate(doc)),backupSource:async(g,room,doc)=>{if(!backups.has(room))backups.set(room,Y.encodeStateAsUpdate(doc));},grantAssets:async(g,ids)=>grants.push(...ids)};
 return{source,target,saved,backups,grants,deps,lessons,notebook:createGroupNotebook(deps)};
}
test('permanent group notebook restores drawings, code-only pages, personal work and last Python lesson without editing sources',async()=>{
 const f=fixture(),before=new Map([...f.source].map(([r,d])=>[r,Buffer.from(Y.encodeStateAsUpdate(d))]));
 const book=await f.notebook.ensure({id:'g'}),pages=boardPagesList(book.getMap('pages'));
 assert.equal(pages.length,5);assert.ok(pages.some(p=>p.title==='Цикл for · 07.10'));assert.ok(pages.some(p=>p.title==='Пустая сохранённая страница · 07.10'));
 const first=pages.find(p=>p.title==='Задание 7 · 07.10');
 assert.deepEqual(f.target.get(boardPageRoom(groupNotebookBoard('g'),first.id)).getArray('items').toJSON(),f.source.get('board-lesson-lesson-one').getArray('items').toJSON());
 assert.equal(f.target.get(boardPageRoom(groupNotebookBoard('g'),first.id,'a')).getArray('items').get(0).id,'private-drawing');
 const codes=owner=>[...f.target.get(groupNotebookCode('g',owner)).getMap('codeSolutions').keys()].map(id=>getCollabSolutionChannels(f.target.get(groupNotebookCode('g',owner)),id));
 assert.ok(codes('').some(c=>c.codeText.toString()==='print(7)'));assert.ok(codes('').some(c=>c.codeText.toString()==='print(9)'));
 assert.ok(codes('a').some(c=>c.codeText.toString()==='last lesson Python'));
 assert.ok(!codes('').some(c=>c.codeText.toString().includes('private')));
 const a=codes('a').find(c=>c.codeText.toString()==='private a');assert.equal(a.testFileText.toString(),'input a');assert.equal(a.runMap.get('output'),'result a');assert.equal(a.runMap.get('running'),false);
 assert.ok(!codes('a').some(c=>c.codeText.toString()==='private b'));
 for(const[r,b]of before)assert.deepEqual(Buffer.from(Y.encodeStateAsUpdate(f.source.get(r))),b,'unchanged '+r);
 assert.ok(f.grants.includes('old-image'));
});
test('import retries after partial storage failure and after server restart without duplicate pages, strokes or code',async()=>{
 const f=fixture(),save=f.deps.saveTarget;let fail=true;
 f.deps.saveTarget=async(room,doc,kind)=>{if(fail&&kind==='code'){fail=false;throw Error('disk interrupted');}await save(room,doc,kind);};
 const notebook=createGroupNotebook(f.deps);await assert.rejects(notebook.ensure({id:'g'}),/disk interrupted/);
 const book=await notebook.ensure({id:'g'}),count=boardPagesList(book.getMap('pages')).length;
 const state=new Map([...f.saved].map(([r,b])=>[r,Buffer.from(b)]));f.target.clear();
 const restarted=createGroupNotebook({...f.deps,saveTarget:save});assert.equal(boardPagesList((await restarted.ensure({id:'g'})).getMap('pages')).length,count);
 for(const[r,b]of state)if(!r.endsWith('~pages'))assert.deepEqual(Buffer.from(f.saved.get(r)),b,'unchanged imported '+r);
 const copied=[...f.saved].filter(([r])=>r.startsWith('board-group-g~page~')).flatMap(([,bytes])=>{const d=new Y.Doc();Y.applyUpdate(d,bytes);return d.getArray('items').toArray();});assert.equal(copied.filter(i=>i.id==='image').length,1);
});
test('multiple lesson requests share a single import and preserve new permanent pages on later imports',async()=>{
 const f=fixture();const [one,two]=await Promise.all([f.notebook.ensure({id:'g'}),f.notebook.ensure({id:'g'})]);assert.equal(one,two);
 one.getMap('pages').set('new-group-page',{title:'Новая работа',createdAt:Date.now()});await f.deps.saveTarget('board-group-g~pages',one);
 await f.notebook.ensure({id:'g'});assert.ok(boardPagesList(one.getMap('pages')).some(p=>p.id==='new-group-page'));
});
