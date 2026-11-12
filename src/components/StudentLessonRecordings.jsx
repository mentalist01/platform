import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Video,Play,ArrowUpRight,ChevronDown,CalendarDays,Clock3,Search,RefreshCw,Film,BookOpen} from 'lucide-react';
import {api} from '../services/api.js';
import StudentLessonDetailModal from './StudentLessonDetailModal.jsx';
import {lessonRecordingTopic,lessonRecordingState,recordingMonthGroups} from '../utils/studentLessonRecordings.js';
import './StudentLessonRecordings.css';

const dateLabel=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||'')?new Date(day+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'short',timeZone:'Europe/Moscow'}):'Занятие';
const lessonCountLabel=count=>count%10===1&&count%100!==11?'занятие':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'занятия':'занятий';
export default function StudentLessonRecordings({userId,transport=api.getStudentLessonRecordings,detailTransport=api.getLessonHistoryDetail}){
  const [query,setQuery]=useState(''),[search,setSearch]=useState('');
  const [data,setData]=useState({items:[],total:0,hasMore:false,nextOffset:0});
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState('');
  const requestId=useRef(0),detailId=useRef(0);
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),300);return()=>clearTimeout(timer);},[query]);
  const load=useCallback(async(offset=0)=>{
    const id=++requestId.current;setLoading(true);setError('');
    try{const result=await transport(userId,{offset,limit:12,query:search});if(id!==requestId.current)return;
      setData(old=>({...result,items:offset?[...new Map([...old.items,...result.items].map(item=>[item.key,item])).values()]:result.items}));
    }catch(cause){if(id===requestId.current)setError(cause.message||'Не удалось загрузить записи');}
    finally{if(id===requestId.current)setLoading(false);}
  },[userId,search,transport]);
  useEffect(()=>{setData({items:[],total:0,hasMore:false,nextOffset:0});void load();return()=>{requestId.current++;};},[load]);
  useEffect(()=>()=>{detailId.current++;},[userId]);
  const open=async lesson=>{
    const id=++detailId.current;setSelected(lesson);setDetail(null);setDetailError('');setDetailLoading(true);
    try{const result=await detailTransport(userId,lesson.key);if(id===detailId.current)setDetail(result);}
    catch(cause){if(id===detailId.current)setDetailError(cause.message||'Не удалось открыть запись');}
    finally{if(id===detailId.current)setDetailLoading(false);}
  };
  const close=()=>{detailId.current++;setSelected(null);setDetail(null);};
  const groups=useMemo(()=>recordingMonthGroups(data.items),[data.items]);
  return <section className="student-recordings" aria-labelledby="student-recordings-title">
    <header className="student-recordings__hero"><div className="student-recordings__hero-icon"><Film size={29}/></div><div><span className="student-recordings__eyebrow">ТВОЯ БИБЛИОТЕКА УРОКОВ</span><h1 id="student-recordings-title">Записи занятий</h1><p>Вернись к объяснению. Вспомни главное. Разберись в своём темпе.</p></div><span className="student-recordings__count"><Video size={17}/>{data.total} {lessonCountLabel(data.total)}</span></header>
    <div className="student-recordings__tools"><label><Search size={18}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Найти тему или дату занятия" aria-label="Поиск по записям занятий"/></label><button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16} className={loading?'is-spinning':''}/>Обновить</button></div>
    {error&&<div className="student-recordings__error" role="alert">{error}<button onClick={()=>void load()}>Повторить</button></div>}
    {loading&&!data.items.length?<div className="student-recordings__grid" aria-label="Загружаем записи" role="status">{[0,1,2].map(i=><div className="student-recordings__skeleton" key={i}/>)}</div>:!data.items.length&&!error?<div className="student-recordings__empty"><Film size={38}/><h2>{search?'Занятия не найдены':'Здесь будут твои уроки'}</h2><p>{search?'Попробуй другую тему или дату.':'После занятия здесь появится карточка с датой и темой, а опубликованную запись можно будет посмотреть.'}</p></div>:groups.map(group=><section className="student-recordings__month" key={group.key}><h2>{group.label}<span>{group.items.length}</span></h2><div className="student-recordings__grid">{group.items.map((lesson,index)=>{
      const state=lessonRecordingState(lesson.recording),ready=state.tone==='ready';
      return <button type="button" className={`student-recordings__card is-${state.tone}`} key={lesson.key} onClick={()=>void open(lesson)} style={{'--recording-hue':String((index%4)*24)}} aria-label={`${ready?'Смотреть запись':'Открыть занятие'}: ${lessonRecordingTopic(lesson)}, ${dateLabel(lesson.dayKey)}`}>
        <div className="student-recordings__cover"><span className="student-recordings__cover-label"><BookOpen size={14}/>{lesson.trialBookingId?'Пробное занятие':'Индивидуальный урок'}</span><span className="student-recordings__day">{String(lesson.dayKey||'').slice(-2)}</span><span className="student-recordings__play">{ready?<Play size={28} fill="currentColor"/>:<Video size={28}/>}</span><span className="student-recordings__cover-footer"><Clock3 size={13}/>{lesson.durationMinutes||60} мин<span>{lesson.time} · МСК</span></span></div>
        <div className="student-recordings__body"><span className="student-recordings__date"><CalendarDays size={14}/>{dateLabel(lesson.dayKey)}</span><h3>{lessonRecordingTopic(lesson)}</h3><footer><span className={`student-recordings__state is-${state.tone}`}><i/>{state.label}</span><ArrowUpRight size={19}/></footer></div>
      </button>;
    })}</div></section>)}
    {data.hasMore&&<button type="button" className="student-recordings__more" disabled={loading} aria-busy={loading} onClick={()=>void load(data.nextOffset)}>{loading?<RefreshCw size={18} className="is-spinning"/>:<ChevronDown size={18}/>}<span>{loading?'Загружаем…':'Показать ещё занятия'}</span></button>}
    {selected&&<StudentLessonDetailModal open lesson={detail?.lesson||selected} materials={detail?.materials||[]} replay={detail?.replay||null} studentId={userId} topicText={lessonRecordingTopic(detail?.lesson||selected)} loading={detailLoading} error={detailError} onClose={close} onRetry={()=>void open(selected)}/>}
  </section>;
}
