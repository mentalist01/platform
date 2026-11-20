import {BookOpen, Clock3, Users, Wifi, WifiOff} from 'lucide-react';
import './PythonLessonToolbar.css';
import PythonLessonPresence from './PythonLessonPresence';

const lessonTimeFormat = new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});

export function PythonLessonEndTime({timing}) {
  if (!timing) return null;
  const {mode,endAt} = timing;
  return <span className="python-lesson-end-time">
    <Clock3 size={14} aria-hidden="true"/>
    {mode === 'manual' ? 'Урок продолжается' : <>
      {mode === 'overtime' ? 'По расписанию до' : 'Урок до'} <time dateTime={new Date(endAt).toISOString()}>{lessonTimeFormat.format(endAt)} МСК</time>
    </>}
  </span>;
}

export default function PythonLessonToolbar({teacher=false, name, connected, followingTeacher=false, tasks=[], taskNumber, onSelectTask, peerCount=0, presence=null, canSummon=false, editorPeerPresent=false, timing}) {
  return <div className="python-lesson-toolbar" aria-label="Совместный урок Python">
    <div className="python-lesson-toolbar__identity"><Users size={17}/><strong>{name || 'Изучение Python'}</strong>
      <span>{teacher || followingTeacher ? 'Совместное решение' : 'Решение задач'}</span></div>
    <div className="python-lesson-toolbar__status" role="status">
      {connected ? <Wifi size={14}/> : <WifiOff size={14}/>}
      <span>{followingTeacher ? 'Следуем за преподавателем' : teacher ? 'Задачу выбираете вы' : 'Вы выбираете задачу'}</span>
      {peerCount > 0 && <span>· {peerCount + 1} в редакторе</span>}
    </div>
    <PythonLessonEndTime timing={timing}/>
    {onSelectTask && !followingTeacher && <label className="python-lesson-toolbar__topic"><BookOpen size={16}/><span>Сменить тему</span>
      <select aria-label="Сменить тему урока Python" value={String(taskNumber)} onChange={event => onSelectTask(Number(event.target.value))}>
        {tasks.map(task => <option key={task.number} value={String(task.number)}>{task.title}</option>)}
      </select></label>}
    {presence && <PythonLessonPresence presence={presence} teacher={teacher} name={name} canSummon={canSummon} editorPeerPresent={editorPeerPresent}/>}
  </div>;
}
