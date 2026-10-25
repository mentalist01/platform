export function preparedSetParts(set) {
  const parts=[];let number=Number(set.partNumber)||1;
  for(const [index,task]of (set.tasks||[]).entries()) {
    if(index&&task.startsPart===true)number++;
    let part=parts.at(-1);
    if(!part||part.partNumber!==number){part={partNumber:number,taskIds:[],firstIndex:index};parts.push(part);}
    part.taskIds.push(task.id);
  }
  return parts;
}
export function preparedPartTaskNumber(set,partNumber) {
  const number=Number(set.taskNumber);
  return [19,20,21].includes(number)&&preparedSetParts(set).length>1?number+Number(partNumber)-(Number(set.partNumber)||1):number;
}
export function preparedSetPartTasks(set,partNumber) {
  if(partNumber===undefined)return set.tasks;
  const part=preparedSetParts(set).find(part=>part.partNumber===Number(partNumber));
  const ids=new Set(part?.taskIds||[]);return set.tasks.filter(task=>ids.has(task.id));
}
export function preparedTaskPartNumber(set,index) {
  return (Number(set.partNumber)||1)+set.tasks.slice(1,index+1).filter(task=>task.startsPart===true).length;
}
