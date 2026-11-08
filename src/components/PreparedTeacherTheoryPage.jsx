import {useCallback,useEffect,useRef,useState} from 'react';
import {BookOpen,Check,Edit3,Lock,Minus,Plus,Save} from 'lucide-react';
import {preparedRequest} from '../services/preparedLessonTasks.js';
import {cleanTeacherTheory,plainTeacherTheory} from '../utils/teacherTheoryPaste.js';
import {TEACHER_THEORY_LIMIT} from '../utils/teacherTheoryFormat.js';
import './PreparedTeacherTheoryPage.css';

export default function PreparedTeacherTheoryPage(){
  const id=new URLSearchParams(location.search).get('set')||'';
  const endpoint=`/api/lesson-task-sets/${encodeURIComponent(id)}/teacher-theory`;
  const editor=useRef(null),version=useRef(0),saved=useRef(''),timer=useRef(null),sending=useRef(false),conflict=useRef(false),mounted=useRef(true),loadSequence=useRef(0);
  const [data,setData]=useState(null),[error,setError]=useState(''),[status,setStatus]=useState('loading'),[editing,setEditing]=useState(false),[scale,setScale]=useState(1),[draft,setDraft]=useState(null);
  const user=(()=>{try{return JSON.parse(localStorage.getItem('ege_user_session'))?.id||'';}catch{return '';}})();
  const draftKey=`teacher-theory-draft:${user}:${id}`;
  const keepDraft=()=>{try{localStorage.setItem(draftKey,editor.current.innerHTML);}catch{/* Server saving remains available. */}};
  const save=async()=>{
    clearTimeout(timer.current);
    if(!editor.current||sending.current||conflict.current)return;
    const html=editor.current.innerHTML;if(html===saved.current)return;
    if(new TextEncoder().encode(html).length>TEACHER_THEORY_LIMIT){setError('Текст слишком большой. Разделите его на несколько наборов.');return;}
    sending.current=true;setStatus('saving');setError('');
    try{
      const result=await preparedRequest(endpoint,{html,version:version.current},'PUT');
      version.current=result.version;saved.current=html;
      if(mounted.current){setStatus(editor.current?.innerHTML===html?'saved':'dirty');if(editor.current?.innerHTML!==html)timer.current=setTimeout(()=>void save(),700);else try{localStorage.removeItem(draftKey);}catch{/* optional recovery */}}
    }catch(error){if(error.status===409)conflict.current=true;if(mounted.current){setError(error.message);setStatus('error');}}
    finally{sending.current=false;}
  };
  const change=()=>{keepDraft();setStatus('dirty');clearTimeout(timer.current);timer.current=setTimeout(()=>void save(),900);};
  const load=useCallback(async()=>{
    const sequence=++loadSequence.current;
    setError('');
    try{
      const result=await preparedRequest(endpoint);if(!mounted.current||sequence!==loadSequence.current)return;
      result.html=cleanTeacherTheory(result.html);version.current=result.version;saved.current=result.html;conflict.current=false;
      setData(result);setEditing(!result.html);setStatus('saved');document.title=`Текст учителя · ${result.name}`;
      try{const copy=localStorage.getItem(draftKey);setDraft(copy&&copy!==result.html?copy:null);}catch{/* optional recovery */}
    }catch(error){if(mounted.current){setError(error.message);setStatus('error');}}
  },[endpoint,draftKey]);
  useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;clearTimeout(timer.current);};},[load]);
  useEffect(()=>{if(data&&editor.current)editor.current.innerHTML=data.html;},[data]);
  useEffect(()=>{
    const unload=event=>{if(editor.current&&editor.current.innerHTML!==saved.current){event.preventDefault();event.returnValue='';}};
    const retry=()=>{if(editor.current?.innerHTML!==saved.current)void save();};
    window.addEventListener('beforeunload',unload);window.addEventListener('online',retry);
    return()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('online',retry);};
  });
  const command=(name,value)=>{editor.current.focus();document.execCommand(name,false,value);change();};
  const paste=event=>{
    event.preventDefault();const html=event.clipboardData.getData('text/html'),text=event.clipboardData.getData('text/plain');
    document.execCommand('insertHTML',false,html?cleanTeacherTheory(html):plainTeacherTheory(text));change();
  };
  const protectedWindow=window.teacherDesktop?.teacherTheoryProtected===true;
  return <main className="teacher-theory-page">
    <header className="teacher-theory-heading"><div><small><Lock size={12}/>Личное окно преподавателя</small><h1>{data?.name||'Текст учителя'}</h1></div>
      <span className={`teacher-theory-save is-${status}`} role="status">{status==='saving'?'Сохраняем…':status==='dirty'?'Есть изменения':status==='saved'?<><Check size={14}/>Сохранено</>:status==='loading'?'Загружаем…':'Не сохранено'}</span>
    </header>
    <div className="teacher-theory-controls">
      <button type="button" disabled={!data} onClick={()=>{if(editing)void save();setEditing(!editing);}}>{editing?<BookOpen size={16}/>:<Edit3 size={16}/>} {editing?'Читать':'Редактировать'}</button>
      {editing&&<button type="button" disabled={status==='saving'||!data||conflict.current} onClick={()=>void save()}><Save size={16}/>Сохранить</button>}
      <div className="teacher-theory-zoom"><button type="button" aria-label="Уменьшить текст" disabled={scale<=.8} onClick={()=>setScale(Math.max(.8,scale-.1))}><Minus size={15}/></button><output>{Math.round(scale*100)}%</output><button type="button" aria-label="Увеличить текст" disabled={scale>=2} onClick={()=>setScale(Math.min(2,scale+.1))}><Plus size={15}/></button></div>
    </div>
    <p className="teacher-theory-privacy">{protectedWindow?'Окно защищено от захвата в Windows. Доска продолжает записываться.':'Держите это окно на втором мониторе. Демонстрируйте и записывайте окно урока или другой экран.'}</p>
    {error&&<div className="teacher-theory-error" role="alert">{error}{conflict.current&&<button type="button" onClick={()=>void load()}>Загрузить сохранённую версию</button>}{!data&&<button type="button" onClick={()=>void load()}>Повторить</button>}</div>}
    {draft&&<div className="teacher-theory-recovery">Есть текст, который не успел сохраниться.<button type="button" onClick={()=>{editor.current.innerHTML=cleanTeacherTheory(draft);setDraft(null);setEditing(true);change();}}>Восстановить черновик</button><button type="button" onClick={()=>{setDraft(null);try{localStorage.removeItem(draftKey);}catch{}}}>Оставить сохранённый</button></div>}
    {data&&<>
      {editing&&<div className="teacher-theory-toolbar" role="toolbar" aria-label="Форматирование текста" onMouseDown={event=>{if(event.target.closest('button'))event.preventDefault();}}>
        {[['bold','Жирный','Ж'],['italic','Курсив','К'],['underline','Подчёркнутый','Ч'],['insertUnorderedList','Маркированный список','• Список'],['insertOrderedList','Нумерованный список','1. Список']].map(([cmd,title,label])=><button type="button" key={cmd} title={title} aria-label={title} onClick={()=>command(cmd)}>{label}</button>)}
        <button type="button" onClick={()=>command('formatBlock','h2')}>Заголовок</button><button type="button" onClick={()=>command('formatBlock','p')}>Текст</button><button type="button" onClick={()=>command('formatBlock','pre')}>Код</button>
      </div>}
      <article className={`teacher-theory-paper${editing?' is-editing':''}`} style={{'--reading-scale':scale}}>
        <div ref={editor} className="teacher-theory-content" role="textbox" aria-label="Текстовая теория для преподавателя" aria-multiline="true" aria-readonly={!editing} contentEditable={editing} suppressContentEditableWarning onInput={change} onPaste={paste} onDrop={event=>event.preventDefault()} onClick={event=>{const link=event.target.closest('a');if(link){event.preventDefault();if(!editing)window.open(link.href,'_blank','noopener,noreferrer');}}} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void save();}}}/>
      </article>
      {editing&&<small className="teacher-theory-hint">Вставьте текст из ChatGPT через Ctrl+V. Заголовки, списки, таблицы и код сохранятся. Изменения сохраняются автоматически.</small>}
    </>}
  </main>;
}
