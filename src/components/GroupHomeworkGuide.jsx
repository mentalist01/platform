import { ArrowDown, CalendarDays, Sparkles } from 'lucide-react';
import { homeworkStudyTrackLabel } from '../utils/concurrentHomework.js';
import './GroupHomeworkGuide.css';

const lessonDate = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
});

export default function GroupHomeworkGuide({ priority, onOpen }) {
  const { entries, start, track } = priority;
  const entry = entries[0];
  const direction = homeworkStudyTrackLabel(track || entry?.studyTrack);
  const deadline = Date.parse(entry?.dueAt);
  const timeLabel = start
    ? `${lessonDate.format(start)} МСК`
    : `Сдать до ${lessonDate.format(deadline)} МСК`;
  const label = start ? 'К ближайшему групповому уроку' : 'Ближайший срок сдачи';

  if (!entry) return <aside className="group-homework-guide group-homework-guide--empty" aria-label={label}>
    <CalendarDays size={23} aria-hidden="true" />
    <div><small>{direction} · {timeLabel}</small><strong>К ближайшему уроку домашка пока не назначена</strong></div>
  </aside>;

  return <button type="button" className="group-homework-guide" onClick={onOpen}>
    <span className="group-homework-guide__arrow" aria-hidden="true"><ArrowDown size={34} strokeWidth={2.4} /></span>
    <span className="group-homework-guide__copy">
      <span className="group-homework-guide__eyebrow"><Sparkles size={13} aria-hidden="true" />{label}</span>
      <strong>{direction ? `Домашка · ${direction}` : entry.learningAssignmentTitle || 'Домашка мини-группы'}</strong>
      <span className="group-homework-guide__date">{timeLabel}{entries.length > 1 && ` · работ к уроку: ${entries.length}`}</span>
    </span>
    <span className="group-homework-guide__action">К заданиям <ArrowDown size={15} aria-hidden="true" /></span>
  </button>;
}

export function GroupHomeworkTrace() {
  return <svg className="group-homework-guide__trace" aria-hidden="true">
    <rect className="group-homework-guide__trace-base" x="2" y="2" rx="26" />
    <rect className="group-homework-guide__trace-spark" x="2" y="2" rx="26" pathLength="100" />
  </svg>;
}
