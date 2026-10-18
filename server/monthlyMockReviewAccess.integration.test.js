import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { getMonthlyMockMonth, getMonthlyMockPeriod } from '../src/utils/monthlyMockExam.js';

test('review stays secret through retakes; surrender is durable, scoped and preserves the best completed result', {timeout:60000}, async () => {
  const month=getMonthlyMockMonth(),past=getMonthlyMockMonth(getMonthlyMockPeriod(month).startMs-1000);
  const url='https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=FictionalReview';
  const tasks=Object.fromEntries(['1','4','10','11'].map(key=>[key,{question:key,answer:key}]));
  const f=await createGroupHomeworkFixture(undefined,write=>{
    write('mock-exams',[
      {id:'monthly',title:'Пробник',tasks,access:{all:true,mode:'timer'},monthlyAssignments:{'teacher-a':[month]},monthlyReviewVideos:{'teacher-a':{url}}},
      {id:'past',title:'Архив без разбора',tasks,access:{all:true,mode:'timer'},monthlyAssignments:{'teacher-a':[past]}},
    ]);
  });
  const a=f.tokens['student-a'],b=f.tokens['student-b'];
  const send=(token,body,status=200)=>f.request('/api/mock-exams/attempt',token,{examId:'monthly',mode:'timer',...body},'PUT',status);
  const review=token=>f.request('/api/mock-exams/monthly/monthly-review?month='+month,token);
  const surrender=(token,body={month,confirm:true},status=200)=>f.request('/api/mock-exams/monthly/monthly-review/surrender',token,body,'POST',status);
  try {
    for(let number=1;number<=3;number++){
      await send(a,{startOnly:true,...(number>1?{restartTimerExam:true}:{})});
      assert.equal((await review(a)).reviewVideoUrl,undefined,'active last attempt cannot unlock');
      await send(a,{finishTimerExam:true,answers:{1:'1',4:'4',10:'10',11:number===2?'11':'wrong'}});
      assert.equal((await review(a)).reviewVideoUrl,number===3?url:undefined);
      const card=await f.request('/api/monthly-mock-status',a);
      assert.equal(card.assignment.reviewVideoUrl,number===3?url:undefined);
    }
    await send(b,{startOnly:true});await send(b,{finishTimerExam:true,answers:{1:'1',4:'4',10:'10'}});
    await send(b,{startOnly:true,restartTimerExam:true});await send(b,{saveTimerProgress:true,answers:{1:'wrong'}});
    const stored=()=>JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'))['student-b'];
    const before=stored();
    await surrender(b,{month,confirm:false},400);
    await surrender(b,{month,confirm:true,studentId:'student-a'},403);
    await surrender(f.tokens['teacher-a'],undefined,403);
    await surrender(f.tokens['student-c'],undefined,403);
    const result=await surrender(b);
    assert.equal(result.reviewVideoUrl,url);assert.equal(result.attemptPolicy.surrendered,true);assert.equal(result.attemptPolicy.remainingAttempts,0);
    for(const body of [{startOnly:true,restartTimerExam:true},{resumeTimerExam:true},{finishTimerExam:true},{saveTimerProgress:true,answers:{11:'11'}}]){
      assert.equal((await send(b,body,409)).code,'MOCK_ATTEMPTS_SURRENDERED');
    }
    const after=stored();assert.deepEqual(after.mockAttempts,before.mockAttempts);assert.deepEqual(after.mockAttemptResults,before.mockAttemptResults);
    await surrender(b);assert.equal(stored().monthlyMockSurrenders.length,1,'retry is idempotent');
    const attempt=await f.request('/api/mock-exams/attempt?examId=monthly',b);
    assert.equal(attempt.readOnly,true);assert.equal(attempt.attemptNumber,1,'unfinished second attempt cannot replace best');
    const card=await f.request('/api/monthly-mock-status',b);assert.equal(card.rows[0].score,20);assert.equal(card.assignment.reviewVideoUrl,url);
    const progress=JSON.stringify(await f.request('/api/progress?studentId=student-b',b));
    assert.ok(!progress.includes('FictionalReview'),'private URL is not leaked through exam snapshots');
    await f.request('/api/mock-exams/past/monthly-review/surrender',b,{month:past,confirm:true},'POST',409);
    assert.equal(stored().monthlyMockSurrenders.length,1,'missing video does not forfeit attempts');
  } finally { await f.stop(); }
});
