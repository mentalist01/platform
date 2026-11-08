export const LESSON_END_QUESTION_MS=3*60_000;
export function formatLessonEndRemaining(milliseconds){
  const seconds=Math.max(0,Math.ceil(milliseconds/1000));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
export const LESSON_MANUAL_LEASE_MS=10*60_000;
export const lessonControl=job=>job?.endControl?.version===1?job.endControl:null;
export function lessonEndDeadline(job){
  const control=lessonControl(job);
  if(control?.mode==='manual')return job.cutoffAt;
  if(control?.mode==='timed')return Math.min(job.cutoffAt,control.untilMs);
  const end=job?.occurrence?.endMs;
  return Number.isFinite(end)&&end>0?Math.min(job.cutoffAt,end):job?.cutoffAt;
}
export function lessonEndPhase(job,now=Date.now()){
  const control=lessonControl(job);
  if(!control)return null;
  if(job.desired!=='record')return 'ended';
  if(control.mode==='manual')return 'manual';
  const end=lessonEndDeadline(job);
  return now>=end?'ended':now>=end-LESSON_END_QUESTION_MS?'question':null;
}
export function changeLessonEnd(job,input,now){
  const control=lessonControl(job);
  const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
  if(!control||job.desired!=='record'||!['waiting','recording'].includes(job.status)||lessonEndDeadline(job)<=now)fail(409,'Занятие уже завершено');
  if(!Number.isInteger(input.revision)||input.revision!==control.revision)fail(409,'Режим урока изменён в другом окне. Повторите действие.');
  if(input.mode==='manual')return {...control,mode:'manual',revision:control.revision+1};
  if(input.mode!=='timed'||![5,10,15,30].includes(input.minutes))fail(400,'Выберите продолжение на 5, 10, 15 или 30 минут');
  const end=control.mode==='manual'?now:lessonEndDeadline(job);
  return {...control,mode:'timed',untilMs:Math.max(now,end)+input.minutes*60_000,revision:control.revision+1};
}
