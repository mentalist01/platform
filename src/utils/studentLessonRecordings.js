export const lessonRecordingTopic = lesson => String(lesson?.topic?.text || lesson?.subject || 'Индивидуальное занятие').trim();

export function matchLessonRecording(lesson, query) {
  const words=String(query||'').trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
  const text=[lessonRecordingTopic(lesson),lesson?.dayKey,lesson?.time,...(lesson?.topic?.taskNumbers||[])].join(' ').toLocaleLowerCase('ru');
  return words.every(word=>text.includes(word));
}

export function lessonRecordingState(recording) {
  if(recording?.available)return {label:'Можно смотреть',tone:'ready'};
  if(['saved','uploading','processing'].includes(recording?.status))return {label:'Готовится к просмотру',tone:'pending'};
  if(recording?.status==='recording')return {label:'Урок записывается',tone:'pending'};
  if(recording?.status==='archive')return {label:'Архив занятия',tone:'archive'};
  return {label:'Запись пока не опубликована',tone:'unavailable'};
}

export function recordingMonthGroups(items) {
  const groups=new Map();
  for(const lesson of items){
    const key=String(lesson.dayKey||'').slice(0,7);
    if(!groups.has(key))groups.set(key,{key,label:/^\d{4}-\d{2}$/.test(key)?new Date(key+'-15T12:00:00Z').toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'Europe/Moscow'}):'Прошедшие занятия',items:[]});
    groups.get(key).items.push(lesson);
  }
  return [...groups.values()];
}
