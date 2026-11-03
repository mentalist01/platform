import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
test('teacher copies the exact historical mock task with files, private answers and existing board content intact',{timeout:60000},async()=>{
  const finishedAt='2026-10-31T12:00:00Z',original={id:'monthly',title:'Сохранённый пробник',access:{all:true},tasks:{17:{question:'Посчитайте пары < 10',answers:['1','2'],acceptedAnswerVariants:[['3','4']],files:[{name:'17.txt',storageName:'mock-17.txt',url:'/uploads/mock-17.txt'}]}}};
  const f=await createGroupHomeworkFixture(undefined,write=>{write('mock-exams',[{...original,tasks:{17:{question:'Новое условие',answers:['9','9']}}}]);write('progress',{'student-a':{mockAttempts:{monthly:{attemptId:'retry',status:'active'}},mockAttemptResults:[{examId:'monthly',attemptId:'first',status:'finished',finishedAt,examSnapshot:original,answers:{17:['0','0']},solved:{17:false}}]}});});
  try{
    fs.writeFileSync(path.join(f.root,'uploads','mock-17.txt'),'1\n2\n3\n');
    const room=`board-group-${f.groupId}`,source={examId:'monthly',studentId:'student-a',attemptId:'first',finishedAt,taskKey:'17'},input={room,source,x:100,y:150};
    await f.request('/api/lesson-task-mock-import',f.tokens['student-a'],input,'POST',403);
    await f.request('/api/lesson-task-mock-import',f.tokens['teacher-b'],input,'POST',403);
    const first=await f.request('/api/lesson-task-mock-import',f.tokens['teacher-a'],input),card=first.run.cards[0];
    assert.equal(card.answerCount,2);assert.deepEqual(card.referenceAnswers,['1','2']);assert.equal(card.attachments[0].name,'17.txt');assert.equal(card.attachments[0].runtimeName,'17.txt');
    const sourceBytes=await fetch(f.base+card.attachments[0].url,{headers:{Authorization:'Bearer '+f.tokens['teacher-a']}}).then(r=>r.text());assert.equal(sourceBytes,'1\n2\n3\n');
    const pupil=await f.request('/api/lesson-task-run?room='+room,f.tokens['student-a']);assert.equal('referenceAnswers' in pupil.run.cards[0],false);assert.equal(JSON.stringify(pupil).includes('mockAnswerVariants'),false);
    const second=await f.request('/api/lesson-task-mock-import',f.tokens['teacher-a'],{...input,x:900,y:300});assert.equal(second.run.id,first.run.id);assert.equal(second.run.cards.length,2);assert.equal(second.run.cards[0].anchorId,card.anchorId);
    assert.ok(second.run.version>first.run.version+1,'The pasted card has a revision after the queue-only append');
    const inserted=await f.request('/api/lesson-task-run?room='+room,f.tokens['student-a']);assert.equal(inserted.run.theoryFocus.cardId,second.run.cards[1].id);assert.ok(inserted.run.theoryFocus.revision>pupil.run.theoryFocus.revision);
    const live=await f.request('/api/lesson-task-runs/'+first.run.id+'/action',f.tokens['student-a'],{action:'answer',cardId:card.id,revision:0,answers:['3','4']});
    const checked=await f.request('/api/lesson-task-runs/'+first.run.id+'/action',f.tokens['student-a'],{action:'check',cardId:card.id,revision:live.run.cards[0].answerRevision});assert.equal(checked.run.cards[0].status,'solved');
    await f.request('/api/lesson-task-mock-import',f.tokens['teacher-a'],{...input,source:{...source,attemptId:'missing'}},'POST',409);
    assert.equal((await f.request('/api/lesson-task-sets',f.tokens['teacher-a'])).sets.length,0,'Pasted mock tasks do not pollute the teacher library');
  }finally{await f.stop();}
});
