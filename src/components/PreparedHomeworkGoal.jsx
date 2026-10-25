import {openPreparedHomework} from '../services/preparedHomework.js';
import {ArrowUpRight,BookOpen,CheckCircle2} from 'lucide-react';
import {preparedHomeworkProgress,preparedHomeworkLabel} from '../utils/preparedHomework.js';

export default function PreparedHomeworkGoal({goal,studentId,role='student',disabled=false}){
  const complete=preparedHomeworkProgress(goal).solvedCount>0;
  return <article className={`prepared-homework-goal${complete?' is-complete':''}`}>
    <span className="prepared-homework-goal-icon">{complete?<CheckCircle2 size={23}/>:<BookOpen size={23}/>}</span>
    <div><small>{complete?'Выполнено':goal.preparedResult?.attempts?'В процессе':'Не выполнено'}{goal.assignmentTier==='optional'?' · Дополнительно':''}</small><strong>{preparedHomeworkLabel(goal)}</strong><p>Условие, файлы и начатое решение — всё внутри.</p></div>
    <button type="button" disabled={disabled||role==='parent'} onClick={()=>openPreparedHomework(goal,studentId)}>{role==='teacher'?'Посмотреть решение':complete?'Открыть решение':'Продолжить решение'}<ArrowUpRight size={16}/></button>
  </article>;
}
