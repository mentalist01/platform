const list = value => Array.isArray(value) ? value : [];
export function normalizeMockCompletionEvents(value) {
  const seen = new Set();
  return list(value).filter(event => {
    if (!event?.attemptId || !event.examId || !Number.isFinite(Date.parse(event.finishedAt)) || seen.has(event.attemptId)) return false;
    seen.add(event.attemptId);return true;
  }).map(event => ({attemptId:String(event.attemptId),examId:String(event.examId),examTitle:String(event.examTitle || '').slice(0,200),
    finishedAt:event.finishedAt,secondaryScore:Math.max(0,Math.min(100,Number(event.secondaryScore)||0))})).slice(-200);
}
export function mockCompletionNotifications(data,studentId,exams,scoreFor) {
  const events = new Map();
  const add = event => {
    if (!event?.attemptId || !event.examId || !Number.isFinite(Date.parse(event.finishedAt))) return;
    const previous=events.get(String(event.attemptId));
    events.set(String(event.attemptId),{id:`mock-completed:${studentId}:${event.attemptId}`,source:'mock-exam-completed',
      mockExamId:String(event.examId),mockExamTitle:event.examTitle || event.examSnapshot?.title || previous?.mockExamTitle || exams.find(exam=>String(exam.id)===String(event.examId))?.title || 'Пробник',
      secondaryScore:Number.isFinite(Number(event.secondaryScore)) ? Number(event.secondaryScore) : scoreFor(event.solved),solvedAt:event.finishedAt});
  };
  // Read historical finished attempts as well as new completion events. Partial
  // answers never become notifications and a retry has the same attempt ID.
  normalizeMockCompletionEvents(data.mockCompletionEvents).forEach(add);
  for(const [examId,attempt] of Object.entries(data.mockAttempts || {})) {
    if(attempt.finishedAt || attempt.timerFinishedAt) add({...attempt,examId,finishedAt:attempt.finishedAt || attempt.timerFinishedAt});
  }
  list(data.mockAttemptResults).forEach(add);
  return [...events.values()];
}
