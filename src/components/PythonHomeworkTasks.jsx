import React, { useMemo } from 'react';
import { ArrowUpRight, Check, Code2 } from 'lucide-react';
import { pythonHomeworkSections } from '../utils/pythonHomeworkSections';
import './PythonHomeworkTasks.css';

export default function PythonHomeworkTasks({ taskEntry, levelId = 'python', items = [], onOpenQuestion }) {
  const sections = useMemo(() => pythonHomeworkSections(taskEntry, levelId, items), [taskEntry, levelId, items]);
  if (!sections.length) return null;
  return <div className="python-homework-tasks" aria-label="Задачи Python по подразделам" tabIndex={0}>
    {sections.map(section => <section className="python-homework-tasks__section" key={section.id} aria-label={section.title}>
      <header className="python-homework-tasks__heading">
        <span className="python-homework-tasks__title"><Code2 size={18} aria-hidden="true" /><strong>{section.title}</strong></span>
        <span className={`python-homework-tasks__count ${section.completed === section.items.length ? 'is-complete' : ''}`}>
          {section.completed === section.items.length && <Check size={14} aria-hidden="true" />}
          {section.completed} из {section.items.length} выполнено
        </span>
      </header>
      <div className="python-homework-tasks__list">
        {section.items.map(item => {
          const Tag = onOpenQuestion ? 'button' : 'div';
          return <Tag key={item.questionId || item.num} type={onOpenQuestion ? 'button' : undefined}
            className={`python-homework-tasks__item ${item.solved ? 'is-solved' : ''}`}
            onClick={onOpenQuestion ? () => onOpenQuestion(item.num) : undefined}
            aria-label={onOpenQuestion ? `Открыть задачу №${item.num}: ${item.title}${item.solved ? ' — выполнено' : ''}` : undefined}>
            <b className="python-homework-tasks__number">№{item.num}</b><span>{item.title}</span>
            {item.solved ? <Check className="python-homework-tasks__status" size={18} aria-label="Выполнено" />
              : onOpenQuestion && <ArrowUpRight className="python-homework-tasks__open" size={16} aria-hidden="true" />}
          </Tag>;
        })}
      </div>
    </section>)}
  </div>;
}
