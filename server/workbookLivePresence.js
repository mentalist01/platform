import {liveDigest,LIVE_WORKBOOK_LIMITS} from './workbookLiveState.js';

const fail=message=>{throw Object.assign(Error(message),{status:400});};
const text=(value,limit)=>typeof value==='string'&&value.length>0&&value.length<=limit&&!/[\u0000-\u001f]/.test(value);
const cell=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isInteger)&&value[0]>=0&&value[0]<LIVE_WORKBOOK_LIMITS.rows&&value[1]>=0&&value[1]<LIVE_WORKBOOK_LIMITS.columns;
const range=value=>Array.isArray(value)&&value.length===4&&cell(value.slice(0,2))&&cell(value.slice(2))&&value[0]<=value[2]&&value[1]<=value[3];
export function normalizeWorkbookPresence(value){
  if(value===null)return null;
  if(!value||!text(value.sheetName,31)||!Array.isArray(value.ranges)||value.ranges.length>16||!value.ranges.every(range)||!Array.isArray(value.objects)||value.objects.length>16||!cell(value.activeCell))fail('Некорректное выделение таблицы');
  const objects=value.objects.map(object=>{
    if(!object||!text(object.name,120)||!text(object.kind,32))fail('Некорректное выделение объекта');
    return {name:object.name,kind:object.kind};
  });
  return {sheetName:value.sheetName,activeCell:[...value.activeCell],ranges:value.ranges.map(row=>[...row]),objects};
}

// Cursor positions are transient, scoped to a workbook epoch and authenticated
// participant. They never touch the workbook journal, saved files or undo stack.
export class WorkbookLivePresence{
  constructor({ttl=8000,maxRooms=1000}={}){this.ttl=ttl;this.maxRooms=maxRooms;this.rooms=new Map();}
  exchange(key,session,auth,value,now=Date.now()){
    const selection=normalizeWorkbookPresence(value),actorId=liveDigest(`${auth.role}:${auth.id}`);
    for(const [id,room]of this.rooms){for(const [actor,entry]of room)if(entry.expires<=now)room.delete(actor);if(!room.size)this.rooms.delete(id);}
    let room=this.rooms.get(key);
    if(selection){
      if(!room){if(this.rooms.size>=this.maxRooms)throw Object.assign(Error('Слишком много активных таблиц'),{status:429});room=new Map();this.rooms.set(key,room);}
      if(!room.has(actorId)&&room.size>=32)throw Object.assign(Error('Слишком много участников таблицы'),{status:429});
      const isTeacher=['teacher','admin'].includes(auth.role);
      const name=String(auth.name|| (isTeacher?'Преподаватель':'Ученик')).replace(/[\u0000-\u001f]/g,'').slice(0,80);
      room.set(actorId,{actorId,session,name,color:isTeacher?'#8b5cf6':'#0d9488',selection,expires:now+this.ttl});
    }else if(room?.get(actorId)?.session===session)room.delete(actorId);
    return {ttl:this.ttl,peers:[...(room?.values()||[])].filter(entry=>entry.actorId!==actorId).map(({session,expires,...entry})=>structuredClone(entry))};
  }
}
