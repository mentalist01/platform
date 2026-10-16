// Close the server lesson before stopping capture, so a concurrent recorder
// poll cannot start the same lesson again. Never stop another lesson's job.
export async function finishGroupLesson({transport,groupId,lessonId,beforeFinish}) {
  if (!groupId || !lessonId) throw new Error('Не удалось определить занятие. Обновите страницу.');
  await beforeFinish?.();
  let lesson;
  try {
    const result=await transport.updateLearningGroupLesson(groupId,lessonId,{status:'completed'});
    lesson=result.lesson || result;
  } catch (error) {
    // The scheduled lifecycle sweep or another teacher tab may have finished
    // it already. Retrying must still finish this lesson's recording.
    const latest=await transport.getLearningGroupLesson(groupId,lessonId).catch(()=>null);
    lesson=latest?.lesson || latest;
    if (!['completed','cancelled'].includes(lesson?.status)) throw error;
  }
  if (!['completed','cancelled'].includes(lesson?.status)) throw new Error('Не удалось завершить занятие. Повторите попытку.');
  const settings=await transport.desktopRecording();
  const jobs=Array.isArray(settings?.jobs) ? settings.jobs : [];
  for (const job of jobs) {
    if (job.occurrence?.lessonId !== lessonId || job.desired !== 'record') continue;
    await transport.desktopRecording('stop',{id:job.id,endRecording:true});
  }
  return lesson;
}

export function canFinishGroupLesson(lesson) {
  if (!lesson?.groupId || !lesson.lessonId || lesson.readOnly || lesson.notStarted) return false;
  if (['completed','cancelled'].includes(lesson.status)) return false;
  const start=Date.parse(lesson.startsAt || lesson.startAt);
  return lesson.status === 'active' || (Number.isFinite(start) && start <= Date.now());
}
