import { Plus, X } from 'lucide-react';
import { MAX_STUDENT_CONTACTS } from '../utils/studentParentContact';

export default function StudentContactFields({value,onChange,busy=false,kind='student',showName=true}){
  const person=kind==='parent'?'родителя':'ученика',rows=value.contacts.length?value.contacts:[{label:'',value:'',channel:'auto'}];
  const change=(index,patch)=>onChange({...value,contacts:rows.map((row,i)=>i===index?{...row,...patch}:row)});
  return <div className="student-contact-fields">
    {showName&&<label>{kind==='parent'?'Имя родителя':'Подпись ученика'}<input value={value.name} disabled={busy} maxLength={80} autoComplete="off" onChange={event=>onChange({...value,name:event.target.value})}/></label>}
    {rows.map((row,index)=><div className="student-contact-fields__row" key={index}>
      <label className="student-contact-fields__channel">Открывать в<select aria-label={`Открывать контакт ${person} ${index+1} в`} value={row.channel || 'auto'} disabled={busy} onChange={event=>change(index,{channel:event.target.value})}><option value="auto">Выберите…</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="link">Другая ссылка</option></select></label>
      <label>Название · необязательно<input aria-label={`Название контакта ${person} ${index+1}`} value={row.label} disabled={busy} maxLength={60} placeholder="Телефон, Telegram, VK…" onChange={event=>change(index,{label:event.target.value})}/></label>
      <label>Телефон, @username или ссылка<input aria-label={`Контакт ${person} ${index+1}`} value={row.value} disabled={busy} maxLength={2048} autoComplete="off" placeholder="+7 (999) 000-00-00, @username или ссылка" onChange={event=>change(index,{value:event.target.value})}/></label>
      <button type="button" aria-label={`Убрать контакт ${person} ${index+1}`} disabled={busy} onClick={()=>onChange({...value,contacts:rows.length===1?[{label:'',value:'',channel:'auto'}]:rows.filter((_,i)=>i!==index)})}><X size={14}/></button>
    </div>)}
    {rows.length<MAX_STUDENT_CONTACTS&&<button type="button" className="student-contact-fields__add" disabled={busy} onClick={()=>onChange({...value,contacts:[...rows,{label:'',value:'',channel:'auto'}]})}><Plus size={14}/>Добавить ещё контакт {person}</button>}
    <details><summary>Заметка {kind==='parent'?'о родителе':'об ученике'}{value.notes?' · есть запись':''}</summary><textarea aria-label={`Заметка ${kind==='parent'?'о родителе':'об ученике'}`} rows={3} value={value.notes} disabled={busy} maxLength={2000} placeholder="Как удобнее связаться и другие важные детали" onChange={event=>onChange({...value,notes:event.target.value})}/></details>
  </div>;
}
