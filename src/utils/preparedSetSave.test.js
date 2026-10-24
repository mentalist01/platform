import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePreparedSetSave} from './preparedSetSave.js';

test('late autosave acknowledgement preserves newer text, added tasks, reordering and file settings',()=>{
  const task={id:'one',title:'1',answers:['old'],images:['image'],attachments:[{sourceFileId:'source',runtimeName:'old.txt'}]};
  const submitted={id:'set',name:'Old name',tasks:[task]},saved={...submitted,version:2,teacherId:'teacher',tasks:[{...task,attachments:[{...task.attachments[0],assetId:'copied-file'}]}]};
  const added={id:'new',title:'2',answers:[''],images:[],attachments:[]};
  const current={...submitted,name:'New name',tasks:[added,{...task,title:'Renamed',answers:['new'],attachments:[{sourceFileId:'source',runtimeName:'renamed.txt'}]}]};
  const merged=mergePreparedSetSave(current,submitted,saved);
  assert.equal(merged.version,2);assert.equal(merged.name,'New name');assert.deepEqual(merged.tasks.map(t=>t.id),['new','one']);
  assert.deepEqual(merged.tasks[1].answers,['new']);assert.equal(merged.tasks[1].attachments[0].assetId,'copied-file');assert.equal(merged.tasks[1].attachments[0].runtimeName,'renamed.txt');
  assert.equal(current.tasks[1].attachments[0].assetId,undefined,'The local input object is not mutated');
});

test('unchanged editor adopts canonical save; a task deleted during save is never resurrected',()=>{
  const submitted={id:'set',tasks:[{id:'one',attachments:[]},{id:'two',attachments:[]}]},saved={...submitted,version:2};
  assert.equal(mergePreparedSetSave(submitted,submitted,saved),saved);
  assert.deepEqual(mergePreparedSetSave({...submitted,tasks:[submitted.tasks[0]]},submitted,saved).tasks.map(t=>t.id),['one']);
});
