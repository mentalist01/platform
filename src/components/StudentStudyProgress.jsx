import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Map,ArrowRight,Check,Link2,X} from 'lucide-react';
import useStudentStudyProgress from '../hooks/useStudentStudyProgress.js';
import {usePreparedLesson} from '../hooks/usePreparedLesson.js';
import {changeStudyProgress,continueStudentStudy,getStudyProgress,loadStudyProgress} from '../services/studentStudyProgress.js';
import {requestLessonPages} from '../services/lessonPages.js';
import {studyProgressLabel,studyTopic,studyPartKey,studyPartCount} from '../utils/studentStudyProgress.js';
import './StudentStudyProgress.css';

export function StudentStudyBadge({teacherId,studentId,showEmpty=true}) {
  const {records,plan,error,loading}=useStudentStudyProgress(teacherId),record=records[studentId];
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[editing,setEditing]=useState(false);
  if(!teacherId||!studentId||(!record&&!loading&&!error)||(!record?.current&&!showEmpty))return null;
  return <div className={`student-study-badge ${record?.current?.completed?'is-completed':''}`} onClick={event=>event.stopPropagation()}>
    <Map size={16}/><div><small>{record?.current?.completed?'Этап завершён':'Сейчас проходим'}</small><strong>{loading&&!record?'Загружаем маршрут…':studyProgressLabel(record?.current,plan)}</strong></div>
    {record?.current&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);setMessage('');try{await continueStudentStudy(teacherId,studentId);}catch(error){setMessage(error.message);}finally{setBusy(false);}}}>{busy?'Открываем…':'Продолжить'}<ArrowRight size={14}/></button>}
    <button type="button" onClick={()=>setEditing(true)} aria-label="Отметить этап ученика">{record?.current?'Изменить':'Отметить тему'}</button>
    {editing&&<StudentStudyDialog teacherId={teacherId} studentId={studentId} onClose={()=>setEditing(false)}/>}
    {error&&<button type="button" onClick={()=>void loadStudyProgress(teacherId,true)}>Повторить загрузку</button>}
    {(message||error)&&<span role="alert" className="student-study-error">{message||error}</span>}
  </div>;
}

export function StudentStudyDialog({teacherId,studentId,pageId='',blockId='',partNumber=1,onClose,onSelectPage}) {
  const [data,setData]=useState(null),[selectedPage,setSelectedPage]=useState(pageId),[topic,setTopic]=useState(blockId),[part,setPart]=useState(partNumber);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[createPage,setCreatePage]=useState(false),[pageName,setPageName]=useState('');
  const dialog=useRef(null),controls=useRef({onClose,busy});controls.current={onClose,busy};
  useEffect(()=>{
    let disposed=false;
    void getStudyProgress(teacherId,studentId).then(result=>{
      if(disposed)return;setData(result);
      const currentPage=result.pages.find(page=>page.id===pageId)||result.pages.find(page=>result.record.links[page.id]?.blockId===blockId)||result.pages.find(page=>page.id===result.record.current?.pageId);
      if(currentPage){setSelectedPage(currentPage.id);const link=result.record.links[currentPage.id]||currentPage.suggestion;if(!blockId&&link){setTopic(link.blockId);setPart(link.partNumber);}}
      if(!blockId&&!currentPage)setTopic(result.next?.blockId||result.plan.order[0]||'');
    }).catch(error=>{if(!disposed)setMessage(error.message);});
    return()=>{disposed=true;};
  },[teacherId,studentId,pageId,blockId]);
  useEffect(()=>{const previous=document.activeElement;dialog.current?.focus();const key=event=>{if(event.key==='Escape'&&!controls.current.busy)controls.current.onClose();if(event.key==='Tab'){const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};},[]);
  const action=async(kind,wholeTopic=false)=>{
    if(busy||!data)return;setBusy(true);setMessage('');
    try{
      let target=selectedPage;
      if(createPage&&kind!=='complete') {
        const title=pageName.trim()||`${topic} · ${data.plan.blocks[topic].parts[part-1]||`Часть ${part}`}`;
        const result=await requestLessonPages(`board-${teacherId}-${studentId}~pages`,{action:'create',name:title});target=result.id;setSelectedPage(target);setCreatePage(false);
      }
      const result=await changeStudyProgress(teacherId,studentId,{action:kind,pageId:kind==='complete'?data.record.current.pageId:target,blockId:topic,partNumber:part,wholeTopic});
      setData(result);
      if(kind==='current'){onSelectPage?.(target);setMessage('Текущая тема сохранена. Задачи на этой странице будут запоминаться автоматически.');}
      else if(kind==='link')setMessage('Страница связана с темой. Текущий этап ученика не изменился.');
      else setMessage(result.next?'Этап завершён. Можно выбрать следующий шаг.':'Этап завершён. Дальнейших шагов в маршруте нет.');
    }catch(error){setMessage(error.message);void getStudyProgress(teacherId,studentId).then(setData).catch(()=>{});}finally{setBusy(false);}
  };
  const choosePage=value=>{setSelectedPage(value);const link=data.record.links[value]||data.pages.find(page=>page.id===value)?.suggestion;if(link){setTopic(link.blockId);setPart(link.partNumber);}};
  const current=data?.record.current,count=topic?studyPartCount(data?.plan,data?.record,topic):1;
  const useNext=()=>{const next=data.next;if(!next)return;setTopic(next.blockId);setPart(next.partNumber);const page=data.pages.find(page=>{const link=data.record.links[page.id]||page.suggestion;return link?.blockId===next.blockId&&link.partNumber===next.partNumber;});setCreatePage(!page);setSelectedPage(page?.id||'');setPageName('');setMessage('Выберите страницу для следующего этапа и нажмите «Сейчас проходим».');};
  return createPortal(<div className="student-study-backdrop" onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget&&!busy)onClose();}}><section className="student-study-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label="Маршрут ученика" tabIndex={-1}>
    <header><div><small>ПЛАН ПОДГОТОВКИ</small><h2>Где остановились</h2></div><button type="button" disabled={busy} onClick={onClose} aria-label="Закрыть маршрут"><X size={20}/></button></header>
    {data?<><div className="student-study-current"><Map size={20}/><div><small>{current?.completed?'Этап завершён':'Сейчас проходим'}</small><strong>{studyProgressLabel(current,data.plan)}</strong>{current&&<span>{current.pageTitle}{current.pageMissing?' · страница убрана':''}</span>}</div></div>
      <div className="student-study-fields"><label>Тема<select aria-label="Тема маршрута" value={topic} disabled={busy} onChange={event=>{setTopic(event.target.value);setPart(1);}}><option value="" disabled>Выберите тему</option>{data.plan.order.map(id=><option key={id} value={id}>№{id} · {data.plan.blocks[id].title}</option>)}</select></label>
      <label>Часть<select aria-label="Часть маршрута" value={part} disabled={busy} onChange={event=>setPart(Number(event.target.value))}>{Array.from({length:Math.max(count,part,20)},(_,i)=><option key={i} value={i+1}>{data.plan.blocks[topic]?.parts[i]||`Часть ${i+1}`}{data.record.completed[studyPartKey(topic,i+1)]?' · пройдена':''}</option>)}</select></label>
      <label>Страница доски<select aria-label="Страница доски" disabled={busy||createPage} value={selectedPage} onChange={event=>choosePage(event.target.value)}><option value="">Выберите существующую страницу</option>{data.pages.map(page=><option key={page.id} value={page.id}>{page.parentId?'↳ ':''}{page.title}</option>)}</select></label>
      <label className="student-study-checkbox"><input type="checkbox" disabled={busy} checked={createPage} onChange={event=>setCreatePage(event.target.checked)}/>Создать новую страницу для этого этапа</label>
      {createPage&&<label>Название новой страницы<input aria-label="Название новой страницы" value={pageName} maxLength={80} disabled={busy} onChange={event=>setPageName(event.target.value)} placeholder={`${topic} · ${data.plan.blocks[topic]?.parts[part-1]||`Часть ${part}`}`}/></label>}</div>
      <p className="student-study-hint">Открытие другой страницы для повторения не меняет текущую тему. Общий порядок тем настраивается на холсте плана.</p>
      <div className="student-study-actions"><button type="button" disabled={busy||!topic||(!selectedPage&&!createPage)} onClick={()=>void action('link')}><Link2 size={15}/>Связать страницу</button><button type="button" className="student-study-primary" disabled={busy||!topic||(!selectedPage&&!createPage)} onClick={()=>void action('current')}>{busy?'Сохраняем…':'Сейчас проходим'}<ArrowRight size={16}/></button></div>
      {current&&<div className="student-study-completion">{!current.completed&&<><button type="button" disabled={busy} onClick={()=>void action('complete')}><Check size={15}/>Завершить текущую часть</button>{studyPartCount(data.plan,data.record,current.blockId)>1&&<button type="button" disabled={busy} onClick={()=>void action('complete',true)}>Вся тема пройдена</button>}</>}{current.completed&&data.next&&<button type="button" disabled={busy} onClick={useNext}>Следующий этап: №{data.next.blockId}, часть {data.next.partNumber}<ArrowRight size={15}/></button>}</div>}
    </>:<p>{message?'':'Загружаем страницы и маршрут…'}</p>}
    {message&&<p className="student-study-message" role="status">{message}</p>}
  </section></div>,document.body);
}

export function StudentStudyBoardControl({teacherId,studentId,pageId,room,onSelectPage}) {
  const {records,plan}=useStudentStudyProgress(teacherId),record=records[studentId];
  const context=usePreparedLesson(room),selected=context.run?.cards.find(card=>card.id===context.selectedId);
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const current=record?.current,position=selected?studyTopic(selected.taskNumber,selected.partNumber):null;
  const valid=current&&!current.completed&&current.pageId===pageId&&position?.blockId===current.blockId&&position.partNumber===current.partNumber;
  const runId=context.run?.id,cardId=selected?.id;
  useEffect(()=>{
    if(!valid||!runId||!cardId||current.cardId===cardId&&current.runId===runId)return;
    let active=true;
    void changeStudyProgress(teacherId,studentId,{action:'position',pageId,runId,cardId}).then(()=>{if(active)setError('');}).catch(error=>{if(active)setError(error.message);});
    return()=>{active=false;};
  },[valid,runId,cardId,current?.cardId,current?.runId,teacherId,studentId,pageId]);
  return <><button type="button" className={`student-study-board-trigger ${current?.pageId===pageId?'is-current':''}`} aria-label={current?.pageId===pageId?'Текущий этап ученика':'Связать страницу с планом'} title={`${studyProgressLabel(current,plan)}${error?` · ${error}`:''}`} onClick={()=>setOpen(true)}><Map size={15}/><span>{error?'Не сохранено':current?.pageId===pageId?`№${current.blockId}`:'План'}</span></button>{open&&<StudentStudyDialog teacherId={teacherId} studentId={studentId} pageId={pageId} blockId={record?.links[pageId]?.blockId||position?.blockId||''} partNumber={record?.links[pageId]?.partNumber||position?.partNumber||1} onClose={()=>setOpen(false)} onSelectPage={onSelectPage}/>}</>;
}
