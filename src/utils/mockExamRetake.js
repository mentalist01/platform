import {areMockExamTasksEqual} from './mockExamVersioning.js';

export const getMockCarriedTaskKeys = attempt => Array.isArray(attempt?.carriedTaskKeys)
  ? [...new Set(attempt.carriedTaskKeys.filter(key=>typeof key==='string'))] : [];

// Only server-graded, unchanged tasks from this completed attempt qualify.
// Copy the pupil's accepted answer (including alternate variants), never the key.
export function buildMockRetakeCarry(exam,previousExam,previousAttempt) {
  const answers={},resultOverrides={};
  for(const [key,question] of Object.entries(exam?.tasks||{})){
    const value=previousAttempt?.answers?.[key];
    if(previousAttempt?.solved?.[key]!==true||!areMockExamTasksEqual({[key]:question},{[key]:previousExam?.tasks?.[key]}))continue;
    if(!(Array.isArray(value)?value:[value]).some(entry=>String(entry??'').trim()))continue;
    answers[key]=Array.isArray(value)?[...value]:value;
    if(previousAttempt.resultOverrides?.[key]?.correct===true)resultOverrides[key]={...previousAttempt.resultOverrides[key]};
  }
  return {answers,carriedTaskKeys:Object.keys(answers),resultOverrides};
}

export function getMockCarriedSolved(attempt) {
  return Object.fromEntries(getMockCarriedTaskKeys(attempt).map(key=>[key,true]));
}
