import { LockKeyhole } from 'lucide-react';
import { weekdayIndex } from '../utils/groupAvailability';
import './TrialCalendarSlots.css';
const minute=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
export default function TrialSlotDay({plan,date,dayStartMinutes,hourHeight,onOpen,onDragStart,onDragEnd,dragging}){
  if(!plan)return null;
  const slots=plan.slots.filter(slot=>slot.day===weekdayIndex(date)&&date>=slot.repeatFrom);
  const cards=slots.map(slot=>({...slot,booking:plan.bookings.find(row=>row.slotId===slot.id&&row.date===date)}));
  for(const booking of plan.bookings.filter(row=>row.date===date&&row.studentIds.length&&!slots.some(slot=>slot.id===row.slotId)))cards.push({id:booking.slotId,time:booking.time,durationMinutes:booking.durationMinutes,booking});
  return cards.map(slot=>{
    const names=slot.booking?.participants?.map(p=>p.name) || [];
    return <button key={slot.id} type="button" draggable={!!onDragStart} className={`trial-slot-grid ${names.length?'has-people':''}`} style={{top:(minute(slot.time)-dayStartMinutes)/60*hourHeight,height:Math.max(27,slot.durationMinutes/60*hourHeight-3)}}
      onDragStart={event=>onDragStart?.(event,{id:`trial-reserve-${slot.id}`,trialSlotId:slot.id,date,time:slot.time,startMinutes:minute(slot.time),durationMinutes:slot.durationMinutes})} onDragEnd={onDragEnd}
      onClick={event=>{event.stopPropagation();if(!dragging)onOpen({slotId:slot.id,date});}} onDragOver={event=>{if(!dragging){event.preventDefault();event.stopPropagation();}}} onDrop={event=>{if(!dragging){event.preventDefault();event.stopPropagation();onOpen({slotId:slot.id,date});}}}
      aria-label={`Пробное ${date} ${slot.time}: ${names.length?names.join(', '):'никого нет'}`} title={`${slot.time} · ${slot.durationMinutes} мин · ${names.length?names.join(', '):'Никого нет — только резерв'}`}>
      <span><LockKeyhole size={11}/><strong>{names.length?`Пробное · ${names.length} уч.`:'Пробное · никого нет'}</strong></span><small>{slot.time} · {names.length?names.join(', '):'Добавить участника'}</small>
    </button>;
  });
}
