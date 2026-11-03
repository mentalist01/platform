export function normalizePreparedTheoryDisplay(value){
  if(value==null)return null;
  if(typeof value!=='object'||Array.isArray(value))throw Error('Укажите настройки появления листа');
  const placement=value.placement||'auto',focus=value.focus||'next';
  if(!['auto','below','right'].includes(placement)||!['next','pair'].includes(focus))throw Error('Выберите расположение и вид листа теории');
  return placement==='auto'&&focus==='next'?null:{placement,focus};
}

export function preparedTheoryFrame(current,previous){
  if(!current||!previous||![current,previous].every(box=>['x','y','width','height'].every(key=>Number.isFinite(box[key]))&&box.width>0&&box.height>0))return null;
  const x=Math.min(current.x,previous.x),y=Math.min(current.y,previous.y);
  return {x,y,width:Math.max(current.x+current.width,previous.x+previous.width)-x,height:Math.max(current.y+current.height,previous.y+previous.height)-y};
}
