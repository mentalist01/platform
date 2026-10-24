import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Save,BookOpen,ArrowRight} from 'lucide-react';
import {preparedRequest} from '../services/preparedLessonTasks.js';
import {USER_SESSION_KEY} from '../utils/theme.js';
import {preparedAnswerTask} from '../utils/egeAnswerFields.js';
import {nextPreparedTaskTitle,preparedTaskIssues} from '../utils/preparedSetLibrary.js';
import {usePreparedSetAutosave} from '../hooks/usePreparedSetAutosave.js';
import PreparedSetList from './PreparedSetList.jsx';
import PreparedTaskEditor from './PreparedTaskEditor.jsx';
import './PreparedLessonTasks.css';

const blankTask=(number,title='1')=>preparedAnswerTask({id:crypto.randomUUID(),title,format:'exact',answers:[''],images:[],attachments:[]},number);
export default function PreparedTaskLibrary({taskNumber=3,dark=false,onChoose,onSaved,activeRun,label='Задания к уроку'}) {
  const [open,setOpen]=useState(false),[sets,setSets]=useState([]),[edit,setEdit]=useState(null),[selected,setSelected]=useState(0),[files,setFiles]=useState([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[crop,setCrop]=useState(null),[partCount,setPartCount]=useState(1);
  const [query,setQuery]=useState(''),[orderVersion,setOrderVersion]=useState(0),[validationTaskId,setValidationTaskId]=useState('');
  const [savedSnapshot,setSavedSnapshot]=useState(''),[savedNotice,setSavedNotice]=useState(''),[localDraft,setLocalDraft]=useState(null);
  const uploadRef=useRef(null),editorRef=useRef(null),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const identity=(()=>{try{return JSON.parse(localStorage.getItem(USER_SESSION_KEY)||'null')?.id||'';}catch{return '';}})();
  const draftKey=identity?`prepared-library-draft:${identity}:${activeRun?.id||taskNumber}`:'';
  const dirty=Boolean(edit&&JSON.stringify(edit)!==savedSnapshot);
  const {begin,persist,status:saveStatus,saveError}=usePreparedSetAutosave({edit,savedSnapshot,setEdit,setSavedSnapshot,setSets});
  const current=edit?.tasks[selected];
  const openEditor=value=>{
    value={...value,id:value.id||crypto.randomUUID(),version:value.version||0,tasks:value.tasks.map(task=>({...task,id:task.id||crypto.randomUUID()}))};
    begin(value);setSavedSnapshot(value.version?JSON.stringify(value):'');setEdit(value);setSelected(0);setCrop(null);setValidationTaskId('');setError('');setSavedNotice('');
  };
  useEffect(()=>{if(!open||!draftKey)return;try{const draft=JSON.parse(localStorage.getItem(draftKey)||'null');if(draft?.edit?.tasks?.length)setLocalDraft(draft);}catch{/* Optional recovery copy */}},[open,draftKey]);
  useEffect(()=>{if(!dirty||!draftKey)return;const draft={edit,savedSnapshot,at:Date.now()};try{localStorage.setItem(draftKey,JSON.stringify(draft));setLocalDraft(draft);}catch{/* Server save remains available */}},[edit,dirty,draftKey,savedSnapshot]);
  useEffect(()=>{if(edit&&!dirty&&draftKey){try{localStorage.removeItem(draftKey);}catch{/* Optional recovery copy */}setLocalDraft(null);}},[edit,dirty,draftKey]);
  const load=async()=>{const result=await preparedRequest('/api/lesson-task-sets');if(alive.current){setSets(result.sets);setOrderVersion(result.orderVersion||0);}};
  useEffect(()=>{
    if(!open)return;const abort=new AbortController();setLoading(true);
    Promise.all([preparedRequest('/api/lesson-task-sets',undefined,'GET',abort.signal),preparedRequest('/api/lesson-task-sources',undefined,'GET',abort.signal)])
      .then(([a,b])=>{if(!abort.signal.aborted){setSets(a.sets);setOrderVersion(a.orderVersion||0);setFiles(b.files);}})
      .catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[open]);
  const editingTaskNumber=edit?.taskNumber;
  useEffect(()=>{if(!editingTaskNumber)return;const abort=new AbortController();preparedRequest(`/api/workbook-parts/${editingTaskNumber}`,undefined,'GET',abort.signal).then(data=>setPartCount(data.count)).catch(()=>setPartCount(1));return()=>abort.abort();},[editingTaskNumber]);
  const execute=async action=>{if(busy)return;setBusy(true);setError('');try{return await action();}catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}};
  const changeTask=patch=>{setSavedNotice('');setEdit(old=>({...old,tasks:old.tasks.map((task,i)=>i===selected?{...task,...patch}:task)}));};
  const focusIssues=(task,issues)=>{
    setValidationTaskId(task.id);
    requestAnimationFrame(()=>{
      const control=issues.images?uploadRef.current?.parentElement.querySelector('button'):editorRef.current?.querySelector(`[data-answer-index="${issues.missing[0]??0}"]`);
      control?.focus({preventScroll:true});control?.scrollIntoView({block:'nearest'});
    });
  };
  const allowForward=()=>{if(busy||!current)return false;const issues=preparedTaskIssues(current);if(!issues.valid){focusIssues(current,issues);return false;}return true;};
  const navigate=index=>{if(busy||index===selected||index>selected&&!allowForward())return;setSelected(index);setCrop(null);setError('');};
  const add=()=>{if(!allowForward()||edit.tasks.length>=100)return;setEdit({...edit,tasks:[...edit.tasks,blankTask(edit.taskNumber,nextPreparedTaskTitle(edit.tasks.at(-1),edit.tasks.length))]});setSelected(edit.tasks.length);setCrop(null);setSavedNotice('');};
  const move=direction=>{const target=selected+direction;if(busy||!edit||target<0||target>=edit.tasks.length)return;const tasks=[...edit.tasks];[tasks[selected],tasks[target]]=[tasks[target],tasks[selected]];setEdit({...edit,tasks});setSelected(target);setCrop(null);};
  const remove=()=>{if(!window.confirm('Убрать эту задачу из набора? Сохранённые уроки останутся.'))return;setEdit({...edit,tasks:edit.tasks.filter((_,i)=>i!==selected)});setSelected(Math.max(0,selected-1));setCrop(null);};
  const upload=async incoming=>{
    if(!edit||busy||!incoming.length)return;const destination=current.id;
    return execute(async()=>{
      if(incoming.some(file=>!file.type.startsWith('image/')))throw Error('Выберите изображения условия');
      if(current.images.length+incoming.length>8)throw Error('В задачу можно добавить до 8 изображений.');
      const ids=[];
      for(const file of incoming){const form=new FormData();form.append('file',file);const asset=await preparedRequest('/api/lesson-task-images',form);ids.push(asset.id);}
      setEdit(old=>({...old,tasks:old.tasks.map(task=>task.id===destination?{...task,images:[...task.images,...ids]}:task)}));return ids;
    });
  };
  const applyCrop=()=>void execute(async()=>{const asset=await preparedRequest(`/api/lesson-task-images/${crop.id}/crop`,crop);changeTask({images:current.images.map(id=>id===crop.id?asset.id:id)});setCrop(null);});
  const save=sync=>{
    if(!edit.name.trim()){setError('Укажите название набора.');editorRef.current?.querySelector('[aria-label="Название набора"]')?.focus();return;}
    const invalid=edit.tasks.findIndex(task=>!preparedTaskIssues(task).valid);
    if(invalid!==-1){setSelected(invalid);setCrop(null);focusIssues(edit.tasks[invalid],preparedTaskIssues(edit.tasks[invalid]));return;}
    void execute(async()=>{
      const set=await persist(false);if(!set)return;
      try{await onSaved?.(set,sync);}catch(e){setSavedNotice('Набор сохранён. Подключение к уроку не завершено.');throw e;}
      await load();setSavedNotice(sync?'Сохранено и подключено к уроку':'Набор сохранён');
    });
  };
  const reorder=next=>execute(async()=>{
    setSets(next);
    try{const result=await preparedRequest('/api/lesson-task-set-order',{ids:next.map(set=>set.id),version:orderVersion},'PUT');setSets(result.sets);setOrderVersion(result.orderVersion);}
    catch(e){try{await load();}catch{setSets(sets);}throw e;}
  });
  const footer=<footer><span role="status">{saveStatus==='saving'?'Сохраняем…':saveStatus==='conflict'?'Конфликт версий · есть копия на устройстве':dirty?'Изменения сохраняются':savedNotice||(edit?.draft?'Черновик сохранён':'Сохранено на сервере')}</span><button type="button" disabled={busy} onClick={()=>void execute(async()=>{await persist(true);setEdit(null);setCrop(null);})}>К списку</button><button type="button" disabled={busy} onClick={()=>save(false)}><Save size={16}/>Сохранить набор</button>{activeRun?.setId===edit?.id&&<button type="button" disabled={busy} onClick={()=>save(true)}>Обновить урок</button>}<button type="button" className="prepared-primary" disabled={busy||selected===edit?.tasks.length-1&&edit?.tasks.length>=100} onClick={()=>selected<edit.tasks.length-1?navigate(selected+1):add()}>{selected<edit?.tasks.length-1?'Следующая задача':'Добавить задачу'}<ArrowRight size={15}/></button></footer>;
  const modal=open&&createPortal(<div className={`prepared-dialog-backdrop${dark?' prepared-dark':''}`} onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}><section className={`prepared-dialog prepared-library-dialog${edit?' is-editing':''}`} role="dialog" aria-modal="true" aria-label={edit?'Редактор набора заданий':'Задания к уроку'} onKeyDown={e=>{if(e.key==='Escape'&&!busy){if(crop)setCrop(null);else setOpen(false);}}}>
    <header><div><small>Подготовка преподавателя</small><h2>{edit?'Подготовить набор':'Задания к уроку'}</h2></div><button type="button" aria-label="Закрыть подготовку" disabled={busy} onClick={()=>setOpen(false)}><X size={20}/></button></header>
    {error&&<p role="alert" className="prepared-error">{error}</p>}{saveError&&edit&&<p role="alert" className="prepared-error">{saveError} Черновик остаётся на устройстве.</p>}
    {!edit?<>{savedNotice&&<p role="status" className="prepared-saved-notice">{savedNotice}</p>}{localDraft&&<div className="prepared-draft-notice"><strong>Есть несохранённый набор на этом устройстве</strong><button type="button" onClick={()=>{openEditor(localDraft.edit);setSavedSnapshot(localDraft.savedSnapshot||'');}}>Продолжить черновик</button></div>}<PreparedSetList sets={sets} query={query} setQuery={setQuery} loading={loading} busy={busy} onCreate={()=>openEditor({name:'',taskNumber:Number(taskNumber)||3,partNumber:1,tasks:[blankTask(Number(taskNumber)||3)]})} onEdit={set=>openEditor({...structuredClone(set),tasks:set.tasks.map(task=>preparedAnswerTask(task,set.taskNumber))})} onChoose={onChoose?(set,newPage)=>{onChoose(set,newPage);setOpen(false);}:undefined} onReorder={reorder}/></>:<PreparedTaskEditor key={current?.id} edit={edit} setEdit={setEdit} selected={selected} current={current} busy={busy} files={files} partCount={partCount} dirty={dirty} crop={crop} setCrop={setCrop} uploadRef={uploadRef} editorRef={editorRef} onUpload={upload} onCrop={applyCrop} onNavigate={navigate} onAdd={add} onMove={move} onRemove={remove} changeTask={changeTask} setError={setError} validationTaskId={validationTaskId} footer={footer}/>}
  </section></div>,document.fullscreenElement||document.body);
  return <><button type="button" className="prepared-library-trigger" onClick={()=>{setOpen(true);setError('');}}><BookOpen size={16}/>{label}</button>{modal}</>;
}
