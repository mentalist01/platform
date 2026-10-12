import {BookOpen, Users, Wifi, WifiOff} from 'lucide-react';
import './PythonLessonToolbar.css';

export default function PythonLessonToolbar({teacher=false, name, connected, followingTeacher=false, tasks=[], taskNumber, onSelectTask, peerCount=0}) {
  return <div className="python-lesson-toolbar" aria-label="Совместный урок Python">
    <div className="python-lesson-toolbar__identity"><Users size={17}/><strong>{name || 'Изучение Python'}</strong>
      <span>{teacher || followingTeacher ? 'Совместное решение' : 'Решение задач'}</span></div>
    <div className="python-lesson-toolbar__status" role="status">
      {connected ? <Wifi size={14}/> : <WifiOff size={14}/>}
      <span>{followingTeacher ? 'Следуем за преподавателем' : teacher ? 'Задачу выбираете вы' : 'Вы выбираете задачу'}</span>
      {peerCount > 0 && <span>· {peerCount + 1} в редакторе</span>}
    </div>
    {onSelectTask && !followingTeacher && <label className="python-lesson-toolbar__topic"><BookOpen size={16}/><span>Сменить тему</span>
      <select aria-label="Сменить тему урока Python" value={String(taskNumber)} onChange={event => onSelectTask(Number(event.target.value))}>
        {tasks.map(task => <option key={task.number} value={String(task.number)}>{task.title}</option>)}
      </select></label>}
  </div>;
}
