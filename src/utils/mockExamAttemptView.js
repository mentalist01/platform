import {resolveMockExamForAttempt} from './mockExamVersioning.js';

const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
export const mockAttemptLabel=attempt=>Number(attempt?.attemptNumber)>1
  ?`Повторная попытка №${Number(attempt.attemptNumber)}`
  :attempt?.isFirstAttempt===true||Number(attempt?.attemptNumber)===1?'Первая попытка':'Текущая попытка';

// A result card and its analysis must refer to the same attempt. Historical
// answers and exam versions are selectable, never silently substituted.
export function getMockAttemptViews(exam,current={},fallbackHistory=[]){
  const history=Array.isArray(current.attemptHistory)?current.attemptHistory
    :current.firstAttempt?[current.firstAttempt]:fallbackHistory;
  const results=history.filter(result=>record(result)&&String(result.examId)===String(exam.id));
  const views=[];
  const add=(attempt,result=null)=>{
    if(!record(attempt))return;
    const key=String(attempt.attemptId||result?.attemptId||attempt.finishedAt||attempt.updatedAt||'current');
    if(views.some(view=>view.key===key))return;
    const resolvedExam=resolveMockExamForAttempt(exam,attempt,result);
    views.push({key,exam:resolvedExam,attempt:{...attempt,examSnapshot:resolvedExam},label:mockAttemptLabel(attempt)});
  };
  if(record(current.bestAttempt))add(current.bestAttempt);
  if(current.attemptId||current.timerStartedAt||Object.keys(current.answers||{}).length){
    add(current,results.find(result=>result.attemptId===current.attemptId));
  }
  results.forEach(result=>add({...result.attemptSnapshot,...result},result));
  if(!views.length)add(current);
  return views;
}
