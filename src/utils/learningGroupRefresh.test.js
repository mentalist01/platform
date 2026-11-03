import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeLearningGroupSummaries} from './learningGroupRefresh.js';

test('summary refresh updates group metadata while preserving the mounted homework and lesson panels',()=>{
  const assignments=[{id:'python',title:'Домашняя работа · Python'}],lessons=[{id:'today'}],materials=[{id:'file'}],progress={completed:2};
  const previous={id:'three',name:'Группа 3',homeworkDetailsLoaded:true,assignments,lessons,materials,progress,replayStorage:{status:'ready'}};
  let current=[previous];
  for(let n=0;n<4;n++){
    current=mergeLearningGroupSummaries(current,[{id:'three',name:'Группа 3 · обновлено',memberCount:4,assignments:[],lessons:[],materials:[],progress:null}]);
    assert.equal(current[0].assignments,assignments);assert.equal(current[0].lessons,lessons);assert.equal(current[0].materials,materials);assert.equal(current[0].progress,progress);
    assert.equal(current[0].name,'Группа 3 · обновлено');assert.equal(current[0].memberCount,4);assert.equal(current[0].homeworkDetailsLoaded,true);
  }
});

test('removed groups stay removed and new/unloaded groups never inherit another group homework',()=>{
  const old={id:'three',homeworkDetailsLoaded:true,assignments:[{id:'private-work'}]};
  const summary={id:'two',assignments:[]};
  assert.deepEqual(mergeLearningGroupSummaries([old],[summary]),[summary]);
  assert.equal(mergeLearningGroupSummaries([{id:'two',assignments:[1]}],[summary])[0],summary);
  assert.deepEqual(mergeLearningGroupSummaries([old],[]),[]);
});
