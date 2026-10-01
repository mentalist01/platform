import {buildLessonTopicOccurrenceKey,normalizeLessonTopicRecord,resolveLessonTopicsForOccurrences,zonedLessonDateTimeToUtcMs} from './lessonTopics.js';

export function recorderLessonTopic(teacherId,job,payload,{students,lessons,read,write,files,now=new Date().toISOString()}) {
  const fail=(message,status)=>{throw Object.assign(new Error(message),{status});};
  if (!job || job.teacherId!==teacherId) fail('Запись урока не найдена',404);
  let occurrence=job.occurrence;
  let lesson=null;
  if(occurrence?.lessonId){
    lesson=lessons.find(item=>item.id===occurrence.lessonId && item.teacherId===teacherId);
    if(!lesson)fail('Занятие не найдено',404);
  }
  const ids=lesson ? lesson.participantIds : [occurrence?.studentId];
  const own=students.filter(student=>ids?.includes(student.id) && student.teacherId===teacherId && !student.deletedAt);
  if(!own.length)fail('Ученик не найден',404);
  const startMs=occurrence?.startMs || zonedLessonDateTimeToUtcMs(occurrence?.dayKey,occurrence?.time);
  const durationMinutes=Number(occurrence?.durationMinutes)||Number(lesson?.durationMinutes)||60;
  const occurrences=own.map(student=>({...occurrence,studentId:student.id,startMs,endMs:startMs+durationMinutes*60000,durationMinutes,
    key:buildLessonTopicOccurrenceKey({...occurrence,studentId:student.id,durationMinutes})}));
  if(occurrences.some(item=>!item.key || !Number.isFinite(item.startMs)))fail('Не удалось определить занятие',409);
  const store=read();store.transcriptTopics ||= {};
  const resolved=()=>resolveLessonTopicsForOccurrences({occurrences,manualTopics:store.topics,transcriptTopics:store.transcriptTopics,activities:store.activities,files});
  let topics=resolved(),changed=false;
  const text=String(payload?.text || '').trim();
  // Calendar-imported subjects are often just the group name. They do not
  // describe the material taught and must not suppress transcript inference.
  const groupTopic = lesson?.source!=='google-calendar' ? String(lesson?.topic || '').trim() : '';
  if(text.length>320)fail('Тема слишком длинная',400);
  if(text){
    if(!['transcript','teacher'].includes(payload.source))fail('Неизвестный источник темы',400);
    for(const item of occurrences){
      const current=topics[item.key];
      if(payload.source==='transcript' && (current?.source==='teacher' || current?.source==='notes' || groupTopic))continue;
      const target=payload.source==='teacher'?store.topics:store.transcriptTopics;
      if(target[item.key]?.text===text)continue;
      target[item.key]=normalizeLessonTopicRecord({...item,teacherId,text,createdAt:target[item.key]?.createdAt || now,updatedAt:now,updatedById:teacherId});changed=true;
    }
    if(changed){write(store);topics=resolved();}
  }
  // All members retain their own manual/note-derived topic. Select the most
  // authoritative shared label without overwriting their lesson history.
  const priority={teacher:3,notes:2,transcript:1};
  const topic=[...Object.values(topics),...(groupTopic ? [{text:groupTopic,source:'teacher'}] : [])].sort((a,b)=>(priority[b.source]||0)-(priority[a.source]||0))[0];
  return {topic:topic || null};
}
