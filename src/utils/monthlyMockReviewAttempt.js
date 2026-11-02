import {getMockAttemptViews} from './mockExamAttemptView.js';

// The score card identifies a completed attempt, not whichever retry is current.
export function monthlyMockReviewAttempt(exams,current,completion){
  const exam=exams.find(exam=>String(exam.id)===String(completion?.examId));
  if(!exam)throw Error('Пробник больше недоступен. Обновите результат.');
  const views=getMockAttemptViews(exam,current);
  const selected=views.find(view=>completion.attemptId
    ?String(view.attempt.attemptId||'')===String(completion.attemptId)
    :Date.parse(view.attempt.finishedAt||view.attempt.timerFinishedAt||view.attempt.updatedAt)===Date.parse(completion.finishedAt));
  if(!selected)throw Error('Сохранённая попытка не найдена. Другую попытку вместо неё не показываем.');
  return {selected,views:views.filter(view=>view.attempt.finishedAt||view.attempt.timerFinishedAt||view.attempt.status==='finished')};
}

export function mockReviewTaskStatus(attempt,key){
  if(attempt?.solved?.[key])return 'correct';
  const raw=attempt?.answers?.[key],values=Array.isArray(raw)?raw:[raw];
  return values.some(value=>String(value??'').trim())?'incorrect':'unanswered';
}
