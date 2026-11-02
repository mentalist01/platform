import test from 'node:test';import assert from 'node:assert/strict';import * as Y from 'yjs';
import {projectPreparedCode} from './preparedCodeProjection.js';
import {createEmptyCollabSolution,getCollabSolutionChannels,listCollabSolutions,getCollabSolutionPageId,COLLAB_SOLUTIONS_MAP_KEY,COLLAB_SOLUTIONS_ORDER_KEY,COLLAB_SOLUTIONS_DELETED_KEY,reorderCollabSolutions} from '../src/utils/collabSolutions.js';
test('prepared tasks join the native editor without replacing old code, files or tabs; imports are idempotent',()=>{
 const doc=new Y.Doc();createEmptyCollabSolution(doc,{id:'old-tab',name:'Раньше'});
 const old=getCollabSolutionChannels(doc,'old-tab');old.codeText.insert(0,'print("old")');old.runMap.set('customFiles',[{name:'old.txt',content:'keep'}]);
 const before=old.runMap.toJSON(),run={id:'run-1',room:'board-t-s~page~page-test',createdAt:'2026-10-24T10:00:00Z',tasks:[{title:'0'},{title:'1'}],cards:[0,1].map(index=>({index,id:'card-'+index,codeId:'prepared-'+String(index).padStart(8,'0')+'-0000-0000-0000-000000000000',code:{text:index?'':'print(17)',output:index?'':'17',input:''}}))};
 projectPreparedCode(doc,run);
 const channel=getCollabSolutionChannels(doc,run.cards[0].codeId);assert.equal(channel.codeText.toString(),'print(17)');assert.equal(channel.runMap.get('output'),'17');
 assert.equal(getCollabSolutionChannels(doc,run.cards[1].codeId).codeText.toString(),'');
 assert.equal(getCollabSolutionPageId(doc,run.cards[0].codeId),'page-test');
 channel.codeText.insert(channel.codeText.length,'\nprint(18)');projectPreparedCode(doc,run);
 assert.equal(channel.codeText.toString(),'print(17)\nprint(18)');assert.equal(old.codeText.toString(),'print("old")');assert.deepEqual(old.runMap.toJSON(),before);
 assert.deepEqual(listCollabSolutions(doc).filter(row=>row.id.startsWith('prepared-')).map(row=>row.name),['0','1']);assert.equal(listCollabSolutions(doc).filter(row=>row.id===run.cards[0].codeId).length,1);
 doc.destroy();
});

test('legacy tabs are repaired into set blocks, retaining code, files, names and within-set order',()=>{
 const doc=new Y.Doc(),run={id:'run-two-sets',setId:'first',name:'5 прогой',room:'board-t-s',createdAt:'2026-11-02T10:00Z',
   tasks:[...Array.from({length:18},(_,i)=>({title:String(i+1)})),{title:'1',sourceSetId:'second',sourceSetName:'5 сложные'}]};
 run.cards=run.tasks.map((_,index)=>({index,id:`card-${index}`,codeId:`prepared-${String(index).padStart(8,'0')}-0000-0000-0000-000000000000`,code:{text:`print(${index})`}}));
 createEmptyCollabSolution(doc,{id:'notes',name:'Мои заметки'});
 const catalog=doc.getMap(COLLAB_SOLUTIONS_MAP_KEY),links=doc.getMap('preparedCodeLinks');
 for(const card of run.cards){
   catalog.set(card.codeId,{id:card.codeId,name:run.tasks[card.index].title,createdAt:card.index===18?7.5:card.index+1});
   links.set(card.codeId,{runId:run.id,cardId:card.id});
   getCollabSolutionChannels(doc,card.codeId).codeText.insert(0,`print('live-${card.index}')`);
 }
 const kept=getCollabSolutionChannels(doc,run.cards[18].codeId);kept.runMap.set('customFiles',[{name:'file.txt',content:'keep'}]);
 assert.equal(listCollabSolutions(doc)[8].id,run.cards[18].codeId,'reproduce the second set between tasks 7 and 8');
 const oldOrder=listCollabSolutions(doc).map(row=>row.id);doc.getArray(COLLAB_SOLUTIONS_ORDER_KEY).insert(0,oldOrder);
 projectPreparedCode(doc,run);
 const rows=listCollabSolutions(doc),prepared=rows.filter(row=>row.preparedGroup);
 assert.deepEqual(prepared.map(row=>row.id),run.cards.map(card=>card.codeId));
 assert.deepEqual(prepared.map(row=>row.preparedGroup.name),[...Array(18).fill('5 прогой'),'5 сложные']);
 assert.equal(kept.codeText.toString(),"print('live-18')");assert.deepEqual(kept.runMap.get('customFiles'),[{name:'file.txt',content:'keep'}]);
 const reordered=rows.map(row=>row.id);[reordered[1],reordered[2]]=[reordered[2],reordered[1]];reorderCollabSolutions(doc,reordered);
 assert.deepEqual(listCollabSolutions(doc).filter(row=>row.preparedGroup).slice(0,2).map(row=>row.name),['2','1']);
 const id=run.cards[4].codeId;catalog.set(id,{...catalog.get(id),name:'Переименовано'});doc.getMap(COLLAB_SOLUTIONS_DELETED_KEY).set(id,true);
 const before=Y.encodeStateAsUpdate(doc);projectPreparedCode(doc,run);
 assert.deepEqual(Y.encodeStateAsUpdate(doc),before,'repeat recovery must not publish any Yjs writes');
 assert.equal(catalog.get(id).name,'Переименовано');assert.ok(!listCollabSolutions(doc).some(row=>row.id===id));
 assert.ok(listCollabSolutions(doc).some(row=>row.id==='notes'));doc.destroy();
});
