import {getMockSecondaryScoreFromPrimary, getMockSecondaryScoreFromSolved} from '../src/utils/mockExamProgress.js';

const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const timestamp=value=>typeof value==='string'?Date.parse(value):NaN;
const score=value=>value!=null&&String(value).trim()!==''&&Number.isFinite(Number(value))
  ?Math.max(0,Math.min(100,Math.round(Number(value)))):null;
const finishedAt=attempt=>attempt?.finishedAt||attempt?.timerFinishedAt
  ||(attempt?.status==='finished'||!attempt?.status?attempt?.updatedAt:'');

// Resolve the exact completed attempt. An unfinished retry must never replace
// the result, and a missing legacy score is different from a real zero.
export function getMonthlyMockCompletionScore(studentData={},completion){
  if(!completion)return null;
  if(completion.manualId){
    const manual=(studentData.mocks||[]).find((item,index)=>(String(item.id||'')||`${index}:${timestamp(item.date||item.createdAt)}`)===completion.manualId);
    return manual?score(manual.score):null;
  }
  const matches=raw=>{
    if(!record(raw))return false;
    if(completion.attemptId&&String(raw.attemptId||'')!==completion.attemptId)return false;
    return timestamp(finishedAt(raw))===timestamp(completion.finishedAt);
  };
  const current=studentData.mockAttempts?.[completion.examId];
  const history=(Array.isArray(studentData.mockAttemptResults)?studentData.mockAttemptResults:[])
    .filter(raw=>String(raw?.examId||'')===completion.examId)
    .map(raw=>({...raw.attemptSnapshot,...raw})).find(matches);
  for(const attempt of [matches(current)?current:null,history]){
    if(!attempt)continue;
    if(record(attempt.solved))return getMockSecondaryScoreFromSolved(attempt.solved);
    const secondary=score(attempt.secondaryScore);
    if(secondary!==null)return secondary;
    if(score(attempt.primaryScore)!==null)return getMockSecondaryScoreFromPrimary(attempt.primaryScore);
  }
  return null;
}
