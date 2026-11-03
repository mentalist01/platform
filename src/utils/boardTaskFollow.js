// Inspect only inserted Yjs values, not every object on each drawing frame.
// Initial sync/reconnect and replacing an existing task are not new insertions.
export function incomingBoardTask(delta,previous,{synced,local,role,teacherId,readOnly,sandbox}){
  if(!synced||local!==false||role!=='student'||!teacherId||readOnly||sandbox||!Array.isArray(delta))return null;
  return delta.flatMap(change=>Array.isArray(change.insert)?change.insert:[]).filter(item=>
    item?.type==='task'&&item.authorId===teacherId&&item.id&&!previous.some(old=>old.id===item.id)&&
    ['x','y','width','height'].every(key=>Number.isFinite(item[key]))&&item.width>0&&item.height>0
  ).at(-1)||null;
}
