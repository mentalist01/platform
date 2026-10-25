import {studyPlanStages} from './studyPlanStages.js';
import {STUDY_PLAN_IDS} from './egeStudyPlan.js';

export const studyPartKey=(blockId,partNumber=1)=>`${blockId}:${partNumber}`;
export function studyTopic(taskNumber,partNumber=1) {
  const number=String(taskNumber),games=['19','20','21'].includes(number);
  const blockId=games?'19–21':number;
  return STUDY_PLAN_IDS.includes(blockId)?{blockId,partNumber:games?Number(number)-18:Math.max(1,Math.min(20,Number(partNumber)||1))}:null;
}
export function studyPageSuggestion(page,pages=[]) {
  if(!page)return null;
  const match=page.title.match(/^\s*(?:задани[ея]\s*(?:№\s*)?)?(\d{1,2})(?=$|\s|[._·—–-])/i);
  const parent=pages.find(row=>row.id===page.parentId);
  const topic=match?studyTopic(match[1]):parent?studyPageSuggestion(parent):null;
  const part=page.title.match(/част[ьиь]\s*(\d+)/i);
  return topic?{...topic,...(part?{partNumber:Math.max(1,Math.min(20,Number(part[1])))}:{})}:null;
}
export function studyPartCount(plan,record,blockId) {
  return Math.max(1,plan?.blocks?.[blockId]?.parts?.length||0,...Object.values(record?.links||{}).filter(link=>link.blockId===blockId).map(link=>link.partNumber),record?.current?.blockId===blockId?record.current.partNumber:1);
}
export function studyBlockStatus(plan,record,blockId,stage=null) {
  if(!record)return 'future';
  const split=plan.stages&&studyPlanStages(plan).filter(row=>row.blockId===blockId).length>1;
  const from=split&&stage?stage.fromPart:1,to=split&&stage?stage.toPart:studyPartCount(plan,record,blockId);
  if(Array.from({length:to-from+1},(_,i)=>record.completed?.[studyPartKey(blockId,from+i)]).every(Boolean))return 'completed';
  return record.current?.blockId===blockId&&!record.current.completed&&record.current.partNumber>=from&&record.current.partNumber<=to?'current':'future';
}
export function studyRouteParts(plan,record) {
  const stages=studyPlanStages(plan);
  return stages.flatMap(stage=>Array.from({length:(plan.stages&&stages.filter(row=>row.blockId===stage.blockId).length>1?stage.toPart:studyPartCount(plan,record,stage.blockId))-stage.fromPart+1},(_,i)=>({blockId:stage.blockId,partNumber:stage.fromPart+i})));
}
export function nextStudyStep(plan,record) {
  const route=studyRouteParts(plan,record),current=record.current;
  const index=current?route.findIndex(step=>step.blockId===current.blockId&&step.partNumber===current.partNumber):-1;
  return route.slice(index+1).find(step=>!record.completed?.[studyPartKey(step.blockId,step.partNumber)])||null;
}
export function studyProgressLabel(current,plan) {
  if(!current)return 'Тема пока не отмечена';
  const part=plan?.blocks?.[current.blockId]?.parts?.[current.partNumber-1]||`Часть ${current.partNumber}`;
  const block=plan?.blocks?.[current.blockId],showPart=(block?.parts?.length||0)>0||current.partNumber>1;
  return `№${current.blockId}${block?.title?` · ${block.title}`:''}${showPart?` · ${part}`:''}${current.kind==='theory'?' · теория':current.taskTitle?` · задача ${current.taskTitle}`:''}`;
}
