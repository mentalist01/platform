import { CheckCircle2, CircleDashed, Users } from 'lucide-react';
import './PythonGroupProgress.css';

export function PythonGroupQuestionProgress({ status, compact = false }) {
  if (!status) return null;
  const Icon = status.state === 'complete' ? CheckCircle2 : status.state === 'partial' ? Users : CircleDashed;
  return <span className={`python-group-question-progress is-${status.state}${compact ? ' is-compact' : ''}`} title={`${status.label}. ${status.detail}`}>
    <span className="python-group-question-progress__count"><Icon size={compact ? 11 : 14}/>{status.label}</span>
    {(status.state !== 'new' || !compact) && <span className="python-group-question-progress__names">{status.detail}</span>}
  </span>;
}

export function PythonGroupTopicProgress({ topic, loading }) {
  if (!topic) return <p className="python-group-topic-progress__hint">{loading ? 'Загружаем прогресс группы…' : 'Прогресс группы недоступен'}</p>;
  return <div className="python-group-topic-progress">
    <div><span>Решено в группе</span><strong>{topic.coveredCount} / {topic.totalQuestions}</strong></div>
    <div className="python-group-topic-progress__track" role="progressbar" aria-label="Задачи, решённые хотя бы одним учеником" aria-valuemin={0} aria-valuemax={100} aria-valuenow={topic.percent}><i style={{ width: `${topic.percent}%` }}/></div>
    <small>Решил хотя бы один ученик · {topic.percent}%</small>
    <span className="python-group-topic-progress__complete"><CheckCircle2 size={12}/>Все ученики решили: {topic.completedCount} / {topic.totalQuestions}</span>
  </div>;
}
