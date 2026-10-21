import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {getMonthlyMockMonth} from '../src/utils/monthlyMockExam.js';

const url='https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=FictionalReview';

test('review stays secret until all attempts end and the retired surrender action never changes progress',{timeout:60000},async()=>{
  const month=getMonthlyMockMonth(),tasks=Object.fromEntries(['1','4','10','11'].map(key=>[key,{question:key,answer:key}]));
  const f=await createGroupHomeworkFixture(undefined,write=>write('mock-exams',[
    {id:'monthly',title:'Пробник',tasks,access:{all:true,mode:'timer'},monthlyAssignments:{'teacher-a':[month]},monthlyReviewVideos:{'teacher-a':{url}}},
  ]));
  const a=f.tokens['student-a'];
  const send=(body,status=200)=>f.request('/api/mock-exams/attempt',a,{examId:'monthly',mode:'timer',...body},'PUT',status);
  const review=()=>f.request('/api/mock-exams/monthly/monthly-review?month='+month,a);
  try{
    for(let number=1;number<=3;number++){
      await send({startOnly:true,...(number>1?{restartTimerExam:true}:{})});
      const locked=await review();assert.equal(locked.reviewVideoUrl,undefined);assert.equal(Object.hasOwn(locked,'canSurrender'),false);
      const before=fs.readFileSync(path.join(f.data,'progress.json'),'utf8');
      const response=await f.request('/api/mock-exams/monthly/monthly-review/surrender',a,{month,confirm:true},'POST',410);
      assert.equal(response.code,'MOCK_SURRENDER_DISABLED');assert.equal(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'),before);
      await send({finishTimerExam:true,answers:{1:'1',4:'4',10:'10',11:number===2?'11':'wrong'}});
      assert.equal((await review()).reviewVideoUrl,number===3?url:undefined);
      const card=await f.request('/api/monthly-mock-status',a);assert.equal(card.assignment.reviewVideoUrl,number===3?url:undefined);
    }
    const card=await f.request('/api/monthly-mock-status',a);assert.equal(card.rows[0].score,27);
    const progress=JSON.stringify(await f.request('/api/progress?studentId=student-a',a));
    assert.ok(!progress.includes('FictionalReview'),'private URL stays out of saved exam snapshots');
  }finally{await f.stop();}
});

test('100 on the first or second completed attempt closes retries and unlocks review in both modes',{timeout:60000},async()=>{
  const month=getMonthlyMockMonth(),counts={17:2,18:2,20:2,25:20,26:2,27:4};
  const answers=Object.fromEntries(Array.from({length:27},(_,i)=>[String(i+1),counts[i+1]?Array.from({length:counts[i+1]},()=>String(i+1)):String(i+1)]));
  const tasks=Object.fromEntries(Object.entries(answers).map(([key,answer])=>[key,{question:key,...(Array.isArray(answer)?{answers:answer}:{answer})}]));
  for(const mode of ['timer','classic']){
    const f=await createGroupHomeworkFixture(undefined,write=>write('mock-exams',[
      {id:'monthly',title:'Пробник',tasks,access:{all:true,mode},monthlyAssignments:{'teacher-a':[month]},monthlyReviewVideos:{'teacher-a':{url}}},
    ]));
    const send=(token,body,status=200)=>f.request('/api/mock-exams/attempt',token,{examId:'monthly',mode,...body},'PUT',status);
    const finish=mode==='timer'?{finishTimerExam:true}:{finishAttempt:true};
    try{
      for(const id of ['student-a','student-b']){
        const token=f.tokens[id];await send(token,{startOnly:true});
        if(id==='student-b'){
          const nearly=await send(token,{...finish,answers:{...answers,27:'wrong'}});
          assert.equal(nearly.monthlyPolicy.perfect,false);assert.equal(nearly.monthlyPolicy.canRestart,true);
          assert.equal((await f.request('/api/mock-exams/monthly/monthly-review?month='+month,token)).reviewVideoUrl,undefined);
          await send(token,{startOnly:true,restartTimerExam:true});
        }
        const result=await send(token,{...finish,answers});
        assert.equal(result.monthlyPolicy.perfect,true);assert.equal(result.monthlyPolicy.remainingAttempts,0);assert.equal(result.monthlyPolicy.canRestart,false);
        assert.equal(result.monthlyPolicy.usedAttempts,id==='student-a'?1:2);
        const stored=()=>JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'))[id];
        const before=stored();
        const repeated=await send(token,{...finish,answers:{1:'wrong'}});
        assert.equal(repeated.idempotent,true);assert.equal(repeated.monthlyPolicy.perfect,true);
        for(const body of [{startOnly:true,restartTimerExam:true},{startOnly:true},{resumeTimerExam:true},{saveTimerProgress:true,answers:{1:'wrong'}}]){
          assert.equal((await send(token,body,409)).code,'MOCK_ALREADY_PERFECT');
        }
        assert.deepEqual(stored(),before,'neither retries nor a repeated finish may change the saved score, rewards or history');
        const attempt=await f.request('/api/mock-exams/attempt?examId=monthly',token);assert.equal(attempt.readOnly,true);assert.equal(attempt.monthlyPolicy.perfect,true);
        assert.equal((await f.request('/api/mock-exams',token)).find(e=>e.id==='monthly').readOnly,true);
        const review=await f.request('/api/mock-exams/monthly/monthly-review?month='+month,token);assert.equal(review.reviewVideoUrl,url);
        const card=await f.request('/api/monthly-mock-status',token);assert.equal(card.assignment.reviewVideoUrl,url);assert.equal(card.rows[0].score,100);assert.equal(card.rows[0].attemptPolicy.remainingAttempts,0);
        const report=await f.request('/api/student-month-report?studentId='+id+'&month='+month,f.tokens['teacher-a']);assert.equal(report.metrics.mocks.latestScore,100);
      }
    }finally{await f.stop();}
  }
});
