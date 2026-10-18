import {getMonthlyMockMonth} from '../src/utils/monthlyMockExam.js';
import {monthlyAssignedMonths,getMonthlyMockAttemptPolicy,getBestMonthlyMockAttempt,getMonthlyAttemptRecords} from '../src/utils/monthlyMockAttemptPolicy.js';

export function monthlyAttemptContext(data,exams,exam,student,requestedMonth=''){
  const now=Date.now(),currentMonth=getMonthlyMockMonth(now);
  const months=monthlyAssignedMonths(exam,student.teacherId);
  const month=requestedMonth|| (months.includes(currentMonth)?currentMonth:[...months].filter(value=>value<currentMonth
    &&getMonthlyAttemptRecords(data,exam,student.teacherId,value).length>0).sort().at(-1));
  if(!month)return null;
  const options={studentData:data,exams,exam,teacherId:student.teacherId,studentCreatedAt:student.createdAt,month,now};
  const policy=getMonthlyMockAttemptPolicy(options);
  return {policy,best:getBestMonthlyMockAttempt({...options,policy})};
}

export function monthlyQuotaError(context,{restart=false,newAttempt=false}={}){
  if(!context)return null;
  const policy=context.policy;
  if(policy.surrendered)return {code:'MOCK_ATTEMPTS_SURRENDERED',error:'Вы отказались от оставшихся попыток и открыли разбор. Доступен только просмотр; лучший завершённый результат сохранён.'};
  if(policy.archived)return {code:'MOCK_HISTORY_READ_ONLY',error:'Этот пробник находится в истории. Доступен только просмотр.'};
  if((restart||newAttempt)&&policy.usedAttempts>=policy.maxAttempts)return {
    code:'MOCK_ATTEMPTS_EXHAUSTED',error:`Все попытки использованы (${policy.maxAttempts} из ${policy.maxAttempts}). Сохранён лучший результат.`,
  };
  return null;
}
