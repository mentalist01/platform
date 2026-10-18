import {useEffect,useState} from 'react';
import {BookOpen,CheckCircle2,Clock3,ListChecks,RefreshCcw} from 'lucide-react';
import {api} from '../services/api';
import {getMonthlyMockMonth,getMonthlyMockPeriod,MONTHLY_MOCK_TIME_ZONE} from '../utils/monthlyMockExam';
import {getTeacherMonthlyMockView} from '../utils/teacherMonthlyMock.js';
import {mockAttemptLabel} from '../utils/mockExamAttemptView.js';
import './StudentMonthlyMockHomework.css';
import './TeacherMonthlyMockHomework.css';

const labels={loading:'Проверяем…',unavailable:'Нет данных',unassigned:'Не назначен',scheduled:'Ещё не опубликован',completed:'Пройден',pending:'Не начат',in_progress:'В процессе',exempt:'Необязателен'};
const plural=new Intl.PluralRules('ru');
const taskCountLabel=count=>`${count} ${{one:'задание',few:'задания',many:'заданий',other:'задания'}[plural.select(count)]}`;
const date=value=>new Date(value).toLocaleString('ru-RU',{timeZone:MONTHLY_MOCK_TIME_ZONE,day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});

export function TeacherMonthlyMockCard({data,error,studentId,studentName='',busy=false,onRefresh}){
  const {status,row,assignment,score}=getTeacherMonthlyMockView(data,studentId);
  const completed=status==='completed';
  const period=data?.period||getMonthlyMockPeriod(getMonthlyMockMonth());
  const description=completed?(score===null?'Пробник завершён. Баллы в сохранённой записи отсутствуют.':'Итоговый результат завершённого пробника этого месяца.')
    :status==='in_progress'?'Ученик ещё решает. Итоговые баллы появятся после завершения пробника.'
    :status==='scheduled'?`Пробник откроется ученику ${date(assignment.publishesAt)} по Москве.`
    :status==='exempt'?'Ученик освобождён от обязательного прохождения в этом месяце.'
    :status==='pending'?'Ученик ещё не начал решать пробник этого месяца.'
    :status==='unassigned'?'Пробник месяца для этого ученика пока не назначен.'
    :status==='unavailable'?'Нет данных о пробнике выбранного ученика.'
    :'Загружаем статус и результат выбранного ученика.';
  return <section className="student-monthly-mock teacher-monthly-mock" aria-label="Пробник месяца ученика" data-status={status} aria-busy={busy}>
    <header className="student-monthly-mock__header">
      <span className="student-monthly-mock__icon"><BookOpen size={22} aria-hidden="true"/></span>
      <div><h3>Пробник месяца</h3><p>{period.label}{studentName?` · ${studentName}`:''}</p></div>
      <span className="student-monthly-mock__status">{completed?<CheckCircle2 size={15}/>:<Clock3 size={15}/>}<span>{labels[status]||'Нет данных'}</span></span>
      <button type="button" className="teacher-monthly-mock__refresh" onClick={onRefresh} disabled={busy} aria-label="Обновить результат пробника"><RefreshCcw size={15} className={busy?'animate-spin':''}/><span>Обновить</span></button>
    </header>
    {error&&<p className="teacher-monthly-mock__error" role="status">Не удалось обновить пробник.{data?' Показаны последние полученные данные.':' Нажмите «Обновить», чтобы повторить.'}</p>}
    <div className="student-monthly-mock__body">
      <div className="student-monthly-mock__description">
        <span className="student-monthly-mock__eyebrow">{completed?`Лучший результат · ${mockAttemptLabel(row).toLowerCase()}`:'Статус прохождения'}</span>
        <h4>{assignment?.title||(status==='loading'?'Проверяем пробник…':status==='unassigned'?'Пробник пока не назначен':'Пробник месяца ученика')}</h4>
        <p>{description}</p>
        {row?.attemptPolicy && <p><strong>Пробник №{row.attemptPolicy.ordinal} · использовано {row.attemptPolicy.usedAttempts} из {row.attemptPolicy.maxAttempts} попыток</strong><br/>В отчёте и статистике учитывается лучший результат.</p>}
        {assignment&&<div className="student-monthly-mock__facts"><span><ListChecks size={16}/>{taskCountLabel(assignment.taskCount)}</span><span><Clock3 size={16}/>{assignment.mode==='classic'?'Без таймера':'С таймером'}</span></div>}
      </div>
      <div className="student-monthly-mock__action-panel teacher-monthly-mock__result">
        {score!==null?<><span className="teacher-monthly-mock__result-label">Итоговый балл</span><output aria-label="Результат пробника"><strong>{score}</strong><span>из 100 баллов</span></output></>
          :<><span className="teacher-monthly-mock__result-icon">{completed?<CheckCircle2 size={28}/>:<Clock3 size={28}/>}</span><strong>{completed?'Баллы не сохранены':status==='loading'?'Проверяем…':'Результата пока нет'}</strong></>}
        {completed&&row?.completion?.finishedAt&&<p className="teacher-monthly-mock__finished">Завершён {date(row.completion.finishedAt)} · МСК</p>}
        {completed&&row.attemptNumber>1&&typeof row.firstAttempt?.score==='number'&&<p className="teacher-monthly-mock__first-result">Первая попытка — <strong>{row.firstAttempt.score} из 100</strong>{row.firstAttempt.finishedAt?` · ${date(row.firstAttempt.finishedAt)} МСК`:''}</p>}
      </div>
    </div>
  </section>;
}

export default function TeacherMonthlyMockHomework({teacherId,studentId,studentName,refreshKey}){
  const [result,setResult]=useState(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
  const requestKey=`${teacherId}:${studentId}`;
  useEffect(()=>{
    if(!teacherId||!studentId)return undefined;
    let disposed=false,pending=false;
    const load=async()=>{
      if(pending)return;
      pending=true;setBusy(true);
      try{
        const data=await api.getMonthlyMockStatus('',{studentId});
        if(!disposed)setResult({key:requestKey,data,error:false});
      }catch{
        if(!disposed)setResult(previous=>({key:requestKey,data:previous?.key===requestKey?previous.data:null,error:true}));
      }finally{pending=false;if(!disposed)setBusy(false);}
    };
    const visible=()=>{if(document.visibilityState!=='hidden')void load();};
    void load();const timer=window.setInterval(visible,30_000);
    window.addEventListener('focus',visible);window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
    return()=>{disposed=true;window.clearInterval(timer);window.removeEventListener('focus',visible);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);};
  },[teacherId,studentId,requestKey,refreshKey,revision]);
  const current=result?.key===requestKey?result:null;
  return <TeacherMonthlyMockCard data={current?.data} error={current?.error} studentId={studentId} studentName={studentName} busy={busy} onRefresh={()=>setRevision(value=>value+1)}/>;
}
