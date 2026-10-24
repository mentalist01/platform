import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedQueueSync} from './preparedQueueSync.js';
test('six-task set extends a one-task lesson without replacing or reordering earlier work',()=>{
  const original={id:'one',title:'1',answers:['original'],attachments:[{assetId:'saved-solution-source'}]};
  const latest=[{...original,answers:['changed']},...Array.from({length:5},(_,i)=>({id:'new-'+i,title:String(i+2),answers:[String(i)]}))];
  const update=preparedQueueSync([original],latest);assert.equal(update.tasks.length,6);assert.equal(update.added,5);assert.equal(update.tasks[0],original);assert.deepEqual(update.tasks[0].answers,['original']);
  assert.equal(preparedQueueSync(update.tasks,latest).added,0);update.tasks[1].answers[0]='lesson-local';assert.equal(latest[1].answers[0],'0');
  assert.deepEqual(preparedQueueSync(update.tasks,[...latest].reverse()).tasks.map(task=>task.id),update.tasks.map(task=>task.id));
});
