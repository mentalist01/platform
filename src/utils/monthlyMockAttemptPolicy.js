import {getMonthlyMockMonth,normalizeMonthlyMockAssignments,getMonthlyMockPeriod} from './monthlyMockExam.js';
import {getMockSecondaryScoreFromSolved,getMockSecondaryScoreFromPrimary} from './mockExamScore.js';

const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finish=attempt=>attempt.finishedAt||attempt.timerFinishedAt||(attempt.status==='finished'?attempt.updatedAt:'');
export const monthlyAssignedMonths=(exam,teacherId)=>normalizeMonthlyMockAssignments(exam?.monthlyAssignments)[teacherId]
  ||exam?.monthlyAssignedMonths||[];
export function mockAttemptMonth(attempt,exam,teacherId){
  if(attempt?.monthlyMockMonth&&getMonthlyMockPeriod(attempt.monthlyMockMonth))return attempt.monthlyMockMonth;
  const date=attempt?.timerStartedAt||attempt?.modeLockedAt||finish(attempt||{})||attempt?.updatedAt;
  if(!Number.isFinite(Date.parse(date)))return '';
  const month=getMonthlyMockMonth(Date.parse(date));
  return [exam,attempt?.examSnapshot,attempt?.attemptSnapshot?.examSnapshot].some(candidate=>monthlyAssignedMonths(candidate,teacherId).includes(month))?month:'';
}
export function getMonthlyAttemptRecords(data={},exam,teacherId,month){
  const results=(data.mockAttemptResults||[]).filter(item=>String(item.examId)===String(exam.id))
    .map(item=>({...item.attemptSnapshot,...item}));
  const current=data.mockAttempts?.[exam.id];
  if(record(current)){
    const index=results.findIndex(item=>item.attemptId&&item.attemptId===current.attemptId);
    // An active continuation cannot overwrite an already frozen result.
    if(index<0)results.push(current);else if(finish(current))results[index]={...results[index],...current};
  }
  return results.filter(item=>mockAttemptMonth(item,exam,teacherId)===month
    && !(item.targetTaskKeys?.length&&Object.keys(item.tasks||item.examSnapshot?.tasks||exam.tasks||{}).some(key=>!item.targetTaskKeys.includes(key))));
}
export function getMonthlyMockAttemptPolicy({studentData={},exams=[],exam,teacherId='',month=getMonthlyMockMonth(),studentCreatedAt='',now=Date.now()}={}){
  if(!exam)return null;
  const records=getMonthlyAttemptRecords(studentData,exam,teacherId,month);
  const pinned=records.find(item=>Number(item.monthlyMockOrdinal)>0)?.monthlyMockOrdinal;
  const joined=Number.isFinite(Date.parse(studentCreatedAt))?getMonthlyMockMonth(Date.parse(studentCreatedAt)):'';
  const months=new Set([month]);
  for(const candidate of exams)for(const value of monthlyAssignedMonths(candidate,teacherId)){
    if(value<=month&&(!joined||value>=joined)&&!studentData.monthlyMockExemptions?.[value])months.add(value);
  }
  for(const item of [...(studentData.mockAttemptResults||[]),...Object.values(studentData.mockAttempts||{})]){
    const value=mockAttemptMonth({...item.attemptSnapshot,...item},exams.find(e=>e.id===item.examId)||item.examSnapshot,teacherId);
    if(value&&value<=month&&(!joined||value>=joined))months.add(value);
  }
  const ordinal=Number(pinned)||[...months].sort().indexOf(month)+1,maxAttempts=ordinal<=4?3:1;
  const usedAttempts=Math.max(0,...records.map(item=>Number(item.attemptNumber)||1));
  const current=studentData.mockAttempts?.[exam.id];
  const active=Boolean(current&&records.includes(current)&&!finish(current)&&
    (current.attemptId||current.timerStartedAt||Object.keys(current.answers||{}).length));
  const archived=month<getMonthlyMockMonth(now);
  return {month,ordinal,maxAttempts,usedAttempts,remainingAttempts:Math.max(0,maxAttempts-usedAttempts),active,archived,
    canRestart:!archived&&!active&&usedAttempts>0&&usedAttempts<maxAttempts};
}
export function getMonthlyAttemptScore(attempt,exam){
  if(!attempt||!finish(attempt))return null;
  if(record(attempt.solved)){
    const tasks=attempt.tasks||attempt.examSnapshot?.tasks||exam?.tasks;
    const solved=tasks&&Object.keys(tasks).length?Object.fromEntries(Object.keys(tasks).map(key=>[key,attempt.solved[key]])):attempt.solved;
    return getMockSecondaryScoreFromSolved(solved);
  }
  if(attempt.secondaryScore!=null&&String(attempt.secondaryScore).trim()!==''&&Number.isFinite(Number(attempt.secondaryScore)))return Math.max(0,Math.min(100,Number(attempt.secondaryScore)));
  return attempt.primaryScore!=null?getMockSecondaryScoreFromPrimary(attempt.primaryScore):null;
}
export function getBestMonthlyMockAttempt(options){
  const policy=options.policy||getMonthlyMockAttemptPolicy(options);
  if(!policy)return null;
  return getMonthlyAttemptRecords(options.studentData,options.exam,options.teacherId,policy.month)
    .filter(item=>(Number(item.attemptNumber)||1)<=policy.maxAttempts)
    .map(attempt=>({attempt,score:getMonthlyAttemptScore(attempt,options.exam)}))
    .filter(item=>item.score!==null)
    .sort((a,b)=>b.score-a.score||String(finish(a.attempt)).localeCompare(String(finish(b.attempt))))[0]||null;
}
