import test from 'node:test';import assert from 'node:assert/strict';import * as Y from 'yjs';
import {projectPreparedCode} from './preparedCodeProjection.js';
import {createEmptyCollabSolution,getCollabSolutionChannels,listCollabSolutions,getCollabSolutionPageId} from '../src/utils/collabSolutions.js';
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
