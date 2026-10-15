import React, { useMemo } from 'react';
import { Check, Code2 } from 'lucide-react';
import { pythonHomeworkSections } from '../utils/pythonHomeworkSections';
import './PythonHomeworkTasks.css';

export default function PythonHomeworkTasks({ taskEntry, levelId = 'python', items = [], onOpenQuestion }) {
  const sections = useMemo(() => pythonHomeworkSections(taskEntry, levelId, items), [taskEntry, levelId, items]);
  if (!sections.length) return null;
  return <div className="python-homework-tasks" aria-label="Задачи Python по подразделам" tabIndex={0}>
    {sections.map(section => <section className="python-homework-tasks__section" key={section.id} aria-label={section.title}>
      <header><span><Code2 size={15} /><strong>{section.title}</strong></span><small>{section.completed} из {section.items.length} выполнено</small></header>
      <div className="python-homework-tasks__list">
        {section.items.map(item => {
          const Tag = onOpenQuestion ? 'button' : 'div';
          return <Tag key={item.questionId || item.num} type={onOpenQuestion ? 'button' : undefined}
            className={`python-homework-tasks__item ${item.solved ? 'is-solved' : ''}`}
            onClick={onOpenQuestion ? () => onOpenQuestion(item.num) : undefined}
            aria-label={onOpenQuestion ? `Открыть задачу №${item.num}: ${item.title}` : undefined}>
            <b>№{item.num}</b><span>{item.title}</span>{item.solved && <Check size={14} aria-label="Выполнено" />}
          </Tag>;
        })}
      </div>
    </section>)}
  </div>;
}
