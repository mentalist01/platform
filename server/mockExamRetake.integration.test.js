import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {getMonthlyMockMonth} from '../src/utils/monthlyMockExam.js';

for(const mode of ['timer','classic'])test(`${mode}: retries carry only correct tasks, persist them and keep independent history/rewards`,{timeout:60000},async()=>{
 const tasks={1:{question:'Первый',answer:'01'},4:{question:'Четвёртый',answer:'4'},17:{question:'Два ответа',answers:['7','12']},25:{question:'Таблица с пустым хвостом',answerRows:2,answerColumns:2,answers:['10','20','','']},26:{question:'Последний',answers:['2','3']}};
 const exam={id:'monthly',title:'Пробник',tasks,access:{all:true,mode},monthlyAssignments:{'teacher-a':[getMonthlyMockMonth()]}};
 const f=await createGroupHomeworkFixture(undefined,write=>write('mock-exams',[exam]));
 const send=(body,status=200)=>f.request('/api/mock-exams/attempt',f.tokens['student-a'],{examId:exam.id,mode,...body},'PUT',status);
 const read=()=>f.request('/api/mock-exams/attempt?examId=monthly',f.tokens['student-a']);
 const progress=()=>JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'))['student-a'];
 const finish={finishAttempt:true,...(mode==='timer'?{finishTimerExam:true}:{})};
 try{
   const first=await send({startOnly:true});
   const finished=await send({...finish,answers:{1:'01',4:'wrong',17:['7','12'],25:['10','20','',''],26:['2','wrong']}});
   assert.equal(finished.solved[1],true);assert.equal(finished.solved[17],true);assert.equal(finished.solved[25],true);
   const before=progress();
   const second=await send({startOnly:true,restartTimerExam:true,answers:{4:'4'},carriedTaskKeys:['4']});
   assert.notEqual(second.attemptId,first.attemptId);assert.equal(second.attemptNumber,2);
   assert.deepEqual(second.carriedTaskKeys,['1','17','25']);assert.equal(second.answers[1],'01');assert.deepEqual(second.answers[17],['7','12']);assert.deepEqual(second.answers[25],finished.answers[25]);
   assert.equal(second.answers[4],'');assert.deepEqual(second.answers[26],['','']);
   assert.equal(Object.hasOwn(second.examSnapshot.tasks[4],'answer'),false);
   const reloaded=await read();assert.deepEqual(reloaded.carriedTaskKeys,second.carriedTaskKeys);assert.equal(reloaded.solved[1],true);
   if(mode==='timer'){
     assert.deepEqual(reloaded.solved,{'1':true,'17':true,'25':true});
     await send({startOnly:true,restartTimerExam:true},409);
   }
   const saved=await send({answers:{1:'wrong',4:'4',17:['',''],25:['','','',''],26:['2','wrong']},...(mode==='timer'?{saveTimerProgress:true}:{})});
   assert.equal(saved.answers[1],'01');assert.deepEqual(saved.answers[17],['7','12']);
   if(mode==='timer'){assert.equal(saved.solved[4],undefined);assert.equal((await read()).solved[4],undefined,'new timer answers are not revealed early');}
   await send(finish);
   const third=await send({startOnly:true,restartTimerExam:true});
   assert.equal(third.attemptNumber,3);assert.deepEqual(third.carriedTaskKeys,['1','4','17','25']);assert.equal(third.answers[4],'4');assert.deepEqual(third.answers[26],['','']);
   const after=progress();assert.equal(after.xpTotal,before.xpTotal);assert.equal(after.coinsTotal,before.coinsTotal);
   const history=after.mockAttemptResults.filter(row=>row.examId===exam.id);assert.equal(history.length,2);
   assert.equal(history[0].answers[4],'wrong');assert.equal(history[1].answers[4],'4');
 }finally{await f.stop();}
});

test('replaced questions and teacher overrides do not leak into different tasks on retry',{timeout:60000},async()=>{
 const exam={id:'monthly',title:'Пробник',tasks:{1:{question:'Старый',answer:'1'},4:{question:'Тот же',answer:'4'},17:{question:'Два',answers:['2','3']}},access:{all:true,mode:'classic'},monthlyAssignments:{'teacher-a':[getMonthlyMockMonth()]}};
 const f=await createGroupHomeworkFixture(undefined,write=>write('mock-exams',[exam]));
 const send=body=>f.request('/api/mock-exams/attempt',f.tokens['student-a'],{examId:exam.id,mode:'classic',...body},'PUT');
 try{
   const first=await send({finishAttempt:true,answers:{1:'1',4:'4',17:['wrong','wrong']}});
   await f.request('/api/mock-exams/attempt/task-result',f.tokens['teacher-a'],{studentId:'student-a',examId:exam.id,attemptId:first.attemptId,taskKey:'17'},'PATCH');
   await f.request('/api/mock-exams/monthly',f.tokens['teacher-a'],{title:exam.title,tasks:{...exam.tasks,1:{question:'Новое условие',answer:'1'}}},'PATCH');
   const retry=await send({startOnly:true,restartTimerExam:true});
   assert.equal(retry.answers[1],'');assert.equal(retry.solved[1],false);assert.equal(retry.answers[4],'4');
   assert.deepEqual(retry.answers[17],['wrong','wrong']);assert.equal(retry.solved[17],true,'teacher-approved unchanged task is retained');
   assert.equal(retry.resultOverrides[17].correct,true);
 }finally{await f.stop();}
});
