import {useId,useRef,useState} from 'react';
import {ChevronDown,Search,Users,X} from 'lucide-react';
import {searchStudyStudents,studyStudentLabel} from '../utils/studyStudentSearch.js';

export default function StudyStudentPicker({students,studentId,onSelect,loading=false}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
  const listId=useId(),input=useRef(null),results=searchStudyStudents(students,query);
  const selected=students.find(student=>student.id===studentId);
  const choose=id=>{setOpen(false);onSelect(id);};
  return <div className="study-pupil-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <label htmlFor={`${listId}-search`}>Найти ученика или группу и посмотреть доску</label>
    <div className="study-pupil-search"><Search size={17}/><input ref={input} id={`${listId}-search`} role="combobox" aria-label="Поиск ученика или группы в плане" disabled={loading} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open&&results[active]?`${listId}-${active}`:undefined} value={query} placeholder={selected?studyStudentLabel(selected):loading?'Загружаем учеников и группы…':'Имя ученика или название группы'} onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setActive(0);setOpen(true);}} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();setOpen(false);}
      if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setOpen(true);setActive(value=>Math.max(0,Math.min(results.length-1,value+(event.key==='ArrowDown'?1:-1))));}
      if(event.key==='Enter'&&open&&results[active]){event.preventDefault();choose(results[active].id);}
    }}/>{query&&<button type="button" aria-label="Очистить поиск учеников" onClick={()=>{setQuery('');setActive(0);setOpen(true);input.current?.focus();}}><X size={15}/></button>}<button type="button" aria-label="Показать учеников и группы" disabled={loading} onClick={()=>{setOpen(!open);input.current?.focus();}}><ChevronDown size={16}/></button></div>
    {open&&<div className="study-pupil-results"><button type="button" className="study-pupil-general" onClick={()=>choose('')}>Общий план преподавателя</button><div id={listId} role="listbox" aria-label="Ученики и группы">{results.length?results.map((student,index)=><button type="button" role="option" aria-selected={student.id===studentId} id={`${listId}-${index}`} key={student.id} className={index===active?'is-highlighted':''} onMouseEnter={()=>setActive(index)} onClick={()=>choose(student.id)}><span className="study-pupil-initial">{student.kind==='group'?<Users size={15}/>:(student.nickname||student.name||'У')[0]}</span><span>{studyStudentLabel(student)}</span><small>{student.kind==='group'?`${student.participantIds.length} уч. · общая доска`:'Открыть доску →'}</small></button>):<p role="status">Ученики и группы не найдены</p>}</div></div>}
  </div>;
}
