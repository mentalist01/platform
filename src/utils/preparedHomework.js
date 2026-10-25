const clean=(value,max=160)=>String(value??'').trim().slice(0,max);
export const isPreparedHomeworkGoal=goal=>goal?.type==='prepared';
export function normalizePreparedHomeworkGoal(goal){
  if(!isPreparedHomeworkGoal(goal)||!/^[a-f0-9-]{36}$/.test(goal.preparedId||''))return null;
  const taskNumber=Number(goal.taskNumber),partNumber=Number(goal.partNumber)||1;
  if(!Number.isInteger(taskNumber)||taskNumber<1||taskNumber>27||!Number.isInteger(partNumber)||partNumber<1||partNumber>20)return null;
  return {type:'prepared',preparedId:goal.preparedId,title:clean(goal.title,120)||'Задача с урока',taskNumber,partNumber,assignmentTier:goal.assignmentTier==='optional'?'optional':'required',...(goal.preparedResult?{preparedResult:goal.preparedResult}:{})};
}
export function preparedHomeworkProgress(goal){
  const completedAt=Date.parse(goal?.preparedResult?.completedAt),done=Number.isFinite(completedAt);
  return {totalCount:1,solvedCount:done?1:0,pendingCount:done?0:1,completedAt:done?new Date(completedAt).toISOString():null};
}
export const preparedHomeworkLabel=goal=>`Дорешать с урока · ЕГЭ №${goal.taskNumber} · ${goal.title}`;
