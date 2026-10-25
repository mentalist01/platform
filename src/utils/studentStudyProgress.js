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
export function studyBlockStatus(plan,record,blockId) {
  if(!record)return 'future';
  const count=studyPartCount(plan,record,blockId);
  if(Array.from({length:count},(_,i)=>record.completed?.[studyPartKey(blockId,i+1)]).every(Boolean))return 'completed';
  return record.current?.blockId===blockId&&!record.current.completed?'current':'future';
}
export function nextStudyStep(plan,record) {
  const current=record.current;
  if(!current)return plan.order.length?{blockId:plan.order[0],partNumber:1}:null;
  const count=studyPartCount(plan,record,current.blockId);
  for(let part=current.partNumber+1;part<=count;part++)if(!record.completed?.[studyPartKey(current.blockId,part)])return {blockId:current.blockId,partNumber:part};
  const index=plan.order.indexOf(current.blockId);
  for(const blockId of plan.order.slice(index<0?0:index+1)) {
    const parts=studyPartCount(plan,record,blockId);
    for(let part=1;part<=parts;part++)if(!record.completed?.[studyPartKey(blockId,part)])return {blockId,partNumber:part};
  }
  return null;
}
export function studyProgressLabel(current,plan) {
  if(!current)return 'Тема пока не отмечена';
  const part=plan?.blocks?.[current.blockId]?.parts?.[current.partNumber-1]||`Часть ${current.partNumber}`;
  const block=plan?.blocks?.[current.blockId],showPart=(block?.parts?.length||0)>0||current.partNumber>1;
  return `№${current.blockId}${block?.title?` · ${block.title}`:''}${showPart?` · ${part}`:''}${current.kind==='theory'?' · теория':current.taskTitle?` · задача ${current.taskTitle}`:''}`;
}
