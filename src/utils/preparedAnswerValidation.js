export const preparedAllowsEmptyAnswers = (task,taskNumber) => Number(taskNumber)===25
  && task?.answerMode!=='independent' && task?.format!=='manual';

// The standard №25 answer table has two columns stored column-first. Empty
// rows are expected padding; a row with only one value is an unfinished key.
export function preparedExpectedAnswerIssues(task,taskNumber) {
  const answers=(task?.answers?.length?task.answers:['']).map(value=>String(value??'').trim());
  if(task?.format==='manual')return {missing:[],invalidNumber:false,allowEmpty:false};
  const allowEmpty=preparedAllowsEmptyAnswers(task,taskNumber),missing=[];
  if(allowEmpty&&answers.length===20){
    for(let row=0;row<10;row++){
      if(Boolean(answers[row])!==Boolean(answers[row+10]))missing.push(answers[row]?row+10:row);
    }
    if(!answers.some(Boolean))missing.push(0,10);
  }else if(allowEmpty){
    if(!answers.some(Boolean))missing.push(0);
  }else answers.forEach((value,index)=>{if(!value)missing.push(index);});
  const invalidNumber=task?.format==='number'&&answers.some(value=>!(allowEmpty&&!value)&&!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value));
  return {missing,invalidNumber,allowEmpty};
}
