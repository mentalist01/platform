import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('teacher sees current group Python results, live solves and membership changes without private data',async()=>{
  const f=await createGroupHomeworkFixture(undefined,write=>{
    write('tests',{101:{python:['first','second','both','none'].map(id=>({id,question:'Выведите 1',answer:'1',tests:[{input:'',output:'1'}]}))}});
    write('progress',{'student-a':{notes:'private note',solvedByTask:{101:{python:{solved:['first','both'],codeById:{first:'private code'}}}}},
      'student-b':{solvedByTask:{101:{python:{solved:['second','both']}}}}});
  });
  try{
    const route=`/api/learning-groups/${f.groupId}/python-progress`,teacher=f.tokens['teacher-a'];
    const {progress}=await f.request(route,teacher);
    assert.equal(progress.groupId,f.groupId);assert.equal(progress.memberCount,2);
    assert.deepEqual([progress.topics[101].coveredCount,progress.topics[101].completedCount,progress.topics[101].percent],[3,1,75]);
    assert.equal(progress.topics[101].questions.first.solvedCount,1);
    assert.equal(progress.topics[101].questions.both.solvedCount,2);
    assert.equal(JSON.stringify(progress).includes('private'),false);
    for(const token of [f.tokens['teacher-b'],f.tokens['student-a'],f.tokens['student-c'],''])await f.request(route,token,undefined,'GET',token?403:401);
    await f.request('/api/progress/solve',f.tokens['student-b'],{studentId:'student-b',taskNumber:101,levelId:'python',questionId:'first',code:'print(1)',pythonResults:[{input:'',output:'1',error:''}],totalQuestions:4,levelMax:100});
    assert.equal((await f.request(route,teacher)).progress.topics[101].questions.first.solvedCount,2);
    await f.request(`/api/learning-groups/${f.groupId}/members/student-b`,teacher,undefined,'DELETE');
    const changed=(await f.request(route,teacher)).progress;
    assert.equal(changed.memberCount,1);assert.equal(changed.topics[101].questions.first.totalCount,1);
    assert.equal(changed.topics[101].questions.second.solvedCount,0);
  }finally{await f.stop();}
});
