import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedFileSync} from './preparedFileSync.js';
test('explicit file updates add missing inputs by stable task identity and retain saved solutions source', () => {
  const tasks=[{id:'a',images:['old'],answers:['007'],attachments:[{assetId:'saved',sourceFileId:'source',runtime:true}]}];
  const incoming=[{id:'b',attachments:[{assetId:'wrong'}]},{id:'a',images:['new'],answers:['999'],attachments:[{assetId:'replacement',sourceFileId:'source',runtime:false,runtimeName:'old.txt'},{assetId:'input',name:'17.txt',runtime:true}]}];
  const result=preparedFileSync(tasks,incoming);
  assert.equal(result.changed,1);assert.deepEqual(result.tasks[0].answers,['007']);assert.deepEqual(result.tasks[0].images,['old']);
  assert.equal(result.tasks[0].attachments[0].assetId,'saved');assert.equal(result.tasks[0].attachments[0].runtime,false);
  assert.equal(result.tasks[0].attachments[1].assetId,'input');assert.equal(tasks[0].attachments.length,1);
  assert.equal(preparedFileSync(result.tasks,incoming).changed,0);
});
