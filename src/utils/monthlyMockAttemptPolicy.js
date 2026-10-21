import {getMonthlyMockMonth,normalizeMonthlyMockAssignments,getMonthlyMockPeriod} from './monthlyMockExam.js';
import {getMockSecondaryScoreFromSolved,getMockSecondaryScoreFromPrimary} from './mockExamScore.js';
import {isAssignedMockAttempt} from './mockExamAssignment.js';

const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finish=attempt=>attempt.finishedAt||attempt.timerFinishedAt||(attempt.status==='finished'?attempt.updatedAt:'');
export const monthlyAssignedMonths=(exam,teacherId)=>normalizeMonthlyMockAssignments(exam?.monthlyAssignments)[teacherId]
  ||exam?.monthlyAssignedMonths||[];
export function normalizeMonthlyMockSurrenders(value){
  const entries=new Map();
  for(const item of Array.isArray(value)?value:[]){
    if(!record(item)||typeof item.examId!=='string'||!item.examId||typeof item.teacherId!=='string'||!item.teacherId
      ||!getMonthlyMockPeriod(item.month)||!Number.isFinite(Date.parse(item.surrenderedAt)))continue;
    const key=JSON.stringify([item.teacherId,item.examId,item.month]);
    if(!entries.has(key))entries.set(key,{teacherId:item.teacherId,examId:item.examId,month:item.month,surrenderedAt:item.surrenderedAt});
  }
  return [...entries.values()];
}
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
  for(const item of [...(studentData.mockAttemptResults||[]),...Object.entries(studentData.mockAttempts||{}).map(([examId,attempt])=>({...attempt,examId}))]){
    const attempt={...item.attemptSnapshot,...item};
    const candidate=exams.find(e=>e.id===item.examId)||item.examSnapshot;
    let value=mockAttemptMonth(attempt,candidate,teacherId);
    // Before monthly designations existed, completed teacher-assigned full
    // mocks already represented the pupil's monthly benchmark. Count one per
    // month; self-practice and selected homework questions do not consume it.
    const keys=Object.keys(attempt.tasks||attempt.examSnapshot?.tasks||candidate?.tasks||{});
    const whole=keys.length>0&&(!attempt.targetTaskKeys?.length||keys.every(key=>attempt.targetTaskKeys.includes(key)));
    if(!value&&whole&&Number.isFinite(Date.parse(finish(attempt)))&&isAssignedMockAttempt({examId:item.examId,exam:candidate,attempt,studentData,teacherId}))value=getMonthlyMockMonth(Date.parse(finish(attempt)));
    if(value&&value<=month&&(!joined||value>=joined))months.add(value);
  }
  const ordinal=Number(pinned)||[...months].sort().indexOf(month)+1,maxAttempts=ordinal<=4?3:1;
  const usedAttempts=Math.max(0,...records.map(item=>Number(item.attemptNumber)||1));
  const current=studentData.mockAttempts?.[exam.id];
  const active=Boolean(current&&records.includes(current)&&!finish(current)&&
    (current.attemptId||current.timerStartedAt||Object.keys(current.answers||{}).length));
  const archived=month<getMonthlyMockMonth(now);
  const surrendered=normalizeMonthlyMockSurrenders(studentData.monthlyMockSurrenders).some(item=>
    item.teacherId===teacherId&&item.examId===exam.id&&item.month===month&&Date.parse(item.surrenderedAt)<=now);
  const exhausted=!active&&usedAttempts>=maxAttempts&&records.some(item=>
    (Number(item.attemptNumber)||1)===maxAttempts&&Number.isFinite(Date.parse(finish(item)))&&Date.parse(finish(item))<=now);
  const perfect=records.some(item=>(Number(item.attemptNumber)||1)<=maxAttempts
    &&Number.isFinite(Date.parse(finish(item)))&&Date.parse(finish(item))<=now&&getMonthlyAttemptScore(item,exam)===100);
  // Old forfeits remain read-only because their answer review was already opened.
  // New completions close early only for a saved perfect result.
  const closed=surrendered||perfect;
  return {month,ordinal,maxAttempts,usedAttempts,remainingAttempts:closed?0:Math.max(0,maxAttempts-usedAttempts),active:active&&!closed,archived,surrendered,perfect,reviewUnlocked:closed||exhausted,
    canRestart:!closed&&!archived&&!active&&usedAttempts>0&&usedAttempts<maxAttempts};
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
