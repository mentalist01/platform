import './SummonAudiencePicker.css';

export default function SummonAudiencePicker({participants,value,onChange,label,disabled=false}){
  const missing=value&&!participants.some(student=>student.id===value);
  return <select className="lesson-summon-audience" aria-label={label} title={label}
    disabled={disabled} value={value} onChange={event=>onChange(event.target.value)}
    onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
    <option value="">Все ученики</option>
    {missing&&<option value={value} disabled>Ученик недоступен</option>}
    {participants.map(student=><option key={student.id} value={student.id}>{student.name}</option>)}
  </select>;
}
