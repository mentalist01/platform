import {normalizePreparedCardCamera} from './preparedCardCamera.js';

export function normalizePreparedTheoryDisplay(value){
  if(value==null)return null;
  if(typeof value!=='object'||Array.isArray(value))throw Error('Укажите настройки появления листа');
  const placement=value.placement||'auto',focus=value.focus||'next',scalePercent=Number(value.scalePercent??100);
  if(!['auto','below','right'].includes(placement)||!['next','single','pair','block','range'].includes(focus))throw Error('Выберите расположение и вид листа теории');
  const nextCards=focus==='range'?Number(value.nextCards??3):null;
  if(nextCards!==null&&(!Number.isInteger(nextCards)||nextCards<1||nextCards>7))throw Error('Выберите от 1 до 7 следующих листов');
  if(!Number.isInteger(scalePercent)||scalePercent<25||scalePercent>200)throw Error('Размер листа должен быть от 25 до 200%');
  if(value.relativeTo!=null&&typeof value.relativeTo!=='string')throw Error('Выберите опорный лист теории');
  const relativeTo=value.relativeTo?.trim()||'';
  let offset;
  if(value.offset!=null){
    const gap=Number(value.offset.gap),align=Number(value.offset.align);
    if(typeof value.offset!=='object'||Array.isArray(value.offset)||!Number.isFinite(gap)||gap<32||gap>4000||!Number.isFinite(align)||Math.abs(align)>4000)throw Error('Положение листа выходит за границы конструктора');
    offset={gap:Math.round(gap),align:Math.round(align)};
  }
  const camera=normalizePreparedCardCamera(value.camera);
  return placement==='auto'&&focus==='next'&&scalePercent===100&&!relativeTo&&!offset&&!camera?null:{placement,focus,...(camera?{camera}:{}),...(nextCards!==null?{nextCards}:{}),...(scalePercent!==100?{scalePercent}:{}),...(relativeTo?{relativeTo}:{}),...(offset?{offset}:{})};
}

// A camera choice applies to the following automatic steps in the same theory
// block until the shot ends or another explicit choice takes over.
export function preparedTheoryCameraRange(sequence,index){
  const current=sequence[index];
  if(current?.kind!=='theory')return null;
  const inBlock=card=>card?.kind==='theory'&&card.sourceSetId===current.sourceSetId
    &&(card.theoryBefore||'')===(current.theoryBefore||'');
  let start=index,end=index;
  while(inBlock(sequence[start-1]))start--;
  while(inBlock(sequence[end+1]))end++;
  for(let i=index;i>=start;i--){
    const card=sequence[i],setting=card.boardDisplay||card.theoryDisplay;
    if(setting?.camera)return null;
    switch(setting?.focus){
      case 'block':return start===end?null:{from:start,to:end};
      case 'range':{
        const to=Math.min(i+(setting.nextCards??3),end);
        return index<=to&&i<to?{from:i,to}:null;
      }
      case 'single':
      case 'pair':return null;
    }
  }
  return null;
}

// References use image identities, so moving/cropping/copying a sheet does not
// silently redirect another sheet to a different page number. Deleted, later
// or differently placed references fall back to the preceding available sheet.
export function normalizePreparedTheoryDisplays(images,display={},placements={},firstTaskId=''){
  const before=id=>placements[id]===firstTaskId?'':placements[id]||'';
  return Object.fromEntries(images.flatMap((id,index)=>{
    let setting=normalizePreparedTheoryDisplay(display?.[id]);
    if(setting?.relativeTo&&!images.slice(0,index).some(target=>target===setting.relativeTo&&before(target)===before(id))){
      const rest={...setting};delete rest.relativeTo;delete rest.offset;
      setting=normalizePreparedTheoryDisplay(rest);
    }
    return setting?[[id,setting]]:[];
  }));
}

export function preparedTheoryFrame(current,previous){
  if(!current||!previous||![current,previous].every(box=>['x','y','width','height'].every(key=>Number.isFinite(box[key]))&&box.width>0&&box.height>0))return null;
  const x=Math.min(current.x,previous.x),y=Math.min(current.y,previous.y);
  return {x,y,width:Math.max(current.x+current.width,previous.x+previous.width)-x,height:Math.max(current.y+current.height,previous.y+previous.height)-y};
}
