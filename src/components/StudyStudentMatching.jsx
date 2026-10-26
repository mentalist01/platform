import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,RefreshCcw,Search,Users,X} from 'lucide-react';
import {studyMatchProfiles,matchStudyStudents} from '../utils/studyMatching.js';
import {activeStudyGroupMembers} from '../utils/studySubjects.js';
import {studyStudentLabel,searchStudyStudents} from '../utils/studyStudentSearch.js';
import {loadStudyProgress} from '../services/studentStudyProgress.js';
import {createStudyMatchGroup} from '../services/studyMatching.js';
import './StudyStudentMatching.css';

function StudyMatchGroupDraft({teacherId,members,onClose,onCreated}) {
  const [name,setName]=useState(()=>`${members.length===2?'Пара':'Группа'} · ${members.map(profile=>profile.student.nickname||profile.student.name).join(' + ')}`.slice(0,100));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const dialog=useRef(null);
  useEffect(()=>{const previous=document.activeElement;dialog.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
  const save=async event=>{event.preventDefault();if(busy||!name.trim())return;setBusy(true);setError('');try{const result=await createStudyMatchGroup(teacherId,name.trim(),members.map(profile=>profile.student.id));await onCreated(result.group);onClose();}catch(cause){setError(cause.message);}finally{setBusy(false);}};
  return createPortal(<div className="student-study-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><section ref={dialog} className="student-study-dialog study-match-draft" role="dialog" aria-modal="true" aria-label="Создать группу из выбранных учеников" tabIndex={-1} onKeyDown={event=>{
    if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}
    if(event.key==='Tab'){const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }}><header><div><small>ПОДБОР ПО ПЛАНУ</small><h2>Состав группы</h2></div><button type="button" disabled={busy} aria-label="Закрыть создание группы" onClick={onClose}><X size={20}/></button></header>
    <form onSubmit={save}><label>Название группы<input aria-label="Название подбираемой группы" value={name} maxLength={100} disabled={busy} onChange={event=>setName(event.target.value)}/></label><div className="study-match-members">{members.map(profile=><div key={profile.student.id}><strong>{studyStudentLabel(profile.student)}</strong><span>{profile.known?profile.label:profile.reason}</span></div>)}</div>
      <p className="student-study-hint">Создадим группу в разделе «Мини-группы». Индивидуальные занятия сохранятся до её старта. Расписание и начало занятий настроите там.</p>
      {error&&<p role="alert" className="student-study-error">{error}</p>}<div className="student-study-actions"><button type="button" disabled={busy} onClick={onClose}>Отмена</button><button type="submit" className="student-study-primary" disabled={busy||!name.trim()}><Users size={16}/>{busy?'Создаём…':'Создать группу'}</button></div>
    </form>
  </section></div>,document.body);
}

export default function StudyStudentMatching({teacherId,students,groups,plan,records,loading,onInspect,onGroupsChanged}) {
  const [selection,setSelection]=useState(null),[query,setQuery]=useState(''),[size,setSize]=useState(2),[tolerance,setTolerance]=useState(0),[draft,setDraft]=useState(null),[notice,setNotice]=useState('');
  const profiles=useMemo(()=>studyMatchProfiles(plan,records,students,groups),[plan,records,students,groups]);
  const selected=selection||new Set(profiles.filter(profile=>profile.known).map(profile=>profile.student.id));
  const result=matchStudyStudents(profiles,{selectedIds:[...selected],maxSize:size,tolerance}),chosen=profiles.filter(profile=>selected.has(profile.student.id));
  const visibleIds=new Set(searchStudyStudents(profiles.map(profile=>profile.student),query).map(student=>student.id));
  const reserved=id=>groups.find(group=>!['active','completed'].includes(group.status)&&activeStudyGroupMembers(group).includes(id));
  const canCreate=members=>members.length>=2&&members.length<=8&&members.every(member=>!reserved(member.student.id));
  const toggle=id=>{const next=new Set(selected);if(next.has(id))next.delete(id);else next.add(id);setSelection(next);};
  const created=async group=>{setNotice(`«${group.name}» готова к настройке в разделе «Мини-группы».`);try{await onGroupsChanged?.();await loadStudyProgress(teacherId,true);}catch{/* Group is already saved; a later refresh will load it. */}};
  const profileRow=profile=><div className="study-match-person" key={profile.student.id}><label><input type="checkbox" aria-label={`Выбрать для подбора: ${studyStudentLabel(profile.student)}`} checked={selected.has(profile.student.id)} onChange={()=>toggle(profile.student.id)}/><span><strong>{studyStudentLabel(profile.student)}</strong><small>{profile.known?profile.label:profile.reason}</small>{reserved(profile.student.id)&&<small>Уже готовится: {reserved(profile.student.id).name}</small>}</span></label><button type="button" onClick={()=>onInspect(profile.student.id)}>Доска</button></div>;
  return <section className="study-matching" aria-label="Подбор учеников по плану"><header><div><Users size={21}/><h2>Подбор по этапам плана</h2></div><button type="button" disabled={loading} onClick={()=>{void loadStudyProgress(teacherId,true);void onGroupsChanged?.();}}><RefreshCcw size={14}/>Обновить</button></header>
    <p className="study-matching-note">Сравниваем текущую тему и часть. Это ориентир по маршруту; темп и самостоятельность ученика оцениваете вы.</p>
    <div className="study-match-layout"><div className="study-match-roster"><div className="study-match-search"><Search size={15}/><input aria-label="Поиск учеников для подбора" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Найти индивидуального ученика"/></div><div className="study-match-selection"><span>Выбрано {chosen.length} из {profiles.length}</span><button type="button" onClick={()=>setSelection(new Set(profiles.filter(profile=>profile.known).map(profile=>profile.student.id)))}>С отмеченной темой</button><button type="button" onClick={()=>setSelection(new Set())}>Снять всё</button></div><div className="study-match-scroll">{profiles.filter(profile=>visibleIds.has(profile.student.id)).map(profileRow)}{!profiles.length&&<p>Индивидуальных учеников пока нет. Участники активных групп в подбор не входят.</p>}</div><button type="button" className="study-match-create" disabled={!canCreate(chosen)||loading} onClick={()=>setDraft(chosen)}>Создать группу из выбранных ({chosen.length})</button><small>От 2 до 8 человек. Ученики в уже подготовленной группе доступны для сравнения; состав меняется в «Мини-группах».</small></div>
      <div className="study-match-results"><div className="study-match-options"><label>Состав<select aria-label="Размер подбираемых групп" value={size} onChange={event=>setSize(Number(event.target.value))}><option value={2}>Пары</option><option value={3}>Группы до 3 человек</option><option value={4}>Группы до 4 человек</option><option value={6}>Группы до 6 человек</option><option value={8}>Группы до 8 человек</option></select></label><label>Близость этапов<select aria-label="Близость этапов для подбора" value={tolerance} onChange={event=>setTolerance(Number(event.target.value))}><option value={0}>Одинаковая тема и часть</option><option value={1}>Можно соседние этапы</option></select></label></div>
        <div className="study-match-summary" role="status">{loading?'Обновляем отметки…':`Вариантов: ${result.groups.length} · подобрано учеников: ${result.covered}`}</div>
        {result.groups.map((suggestion,index)=><article className={`study-match-suggestion ${suggestion.spread?'is-near':''}`} key={suggestion.members.map(profile=>profile.student.id).join(':')}><header><strong>{size===2?'Пара':'Группа'} {index+1}</strong><span><Check size={13}/>{suggestion.reason}</span></header><div className="study-match-members">{suggestion.members.map(profile=><div key={profile.student.id}><button type="button" onClick={()=>onInspect(profile.student.id)}>{studyStudentLabel(profile.student)}</button><span>{profile.label}{profile.record?.current?.taskTitle?` · последняя задача ${profile.record.current.taskTitle}`:''}</span><small>{profile.updatedAt?`Отметка: ${new Date(profile.updatedAt).toLocaleDateString('ru-RU')}`:'Дата отметки не указана'} · пройдено частей: {Object.keys(profile.record?.completed||{}).length}</small></div>)}</div><button type="button" disabled={!canCreate(suggestion.members)||loading} title={!canCreate(suggestion.members)?'Участники уже есть в подготовленной группе. Измените состав в «Мини-группах».':undefined} onClick={()=>setDraft(suggestion.members)}>Выбрать этот состав</button></article>)}
        {!result.groups.length&&!loading&&<p className="study-match-empty">{chosen.filter(profile=>profile.known).length<2?'Выберите минимум двух учеников с отмеченной темой.':'Совпадений нет. Можно разрешить соседние этапы или отметить актуальные темы на досках.'}</p>}
        {result.unmatched.length>0&&<p className="study-match-unmatched">Пока без пары: {result.unmatched.map(profile=>studyStudentLabel(profile.student)).join(', ')}.</p>}
        {profiles.some(profile=>!profile.known)&&<details className="study-match-unknown"><summary>Нужно уточнить этап · {profiles.filter(profile=>!profile.known).length}</summary><p>Откройте доску и отметьте тему — ученик появится в подборе.</p>{profiles.filter(profile=>!profile.known).map(profile=><button key={profile.student.id} type="button" onClick={()=>onInspect(profile.student.id)}>{studyStudentLabel(profile.student)} · {profile.reason}</button>)}</details>}
      </div>
    </div>{notice&&<p className="study-match-success" role="status"><Check size={16}/>{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Скрыть сообщение"><X size={14}/></button></p>}
    {draft&&<StudyMatchGroupDraft teacherId={teacherId} members={draft} onClose={()=>setDraft(null)} onCreated={created}/>}
  </section>;
}
