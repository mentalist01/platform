import React from 'react';
import { ArrowDownLeft, Check, Flag } from 'lucide-react';
import './PythonHomeworkRuntime.css';

export default function PythonHomeworkBadge({ complete = false, compact = false, animate = false }) {
  const Icon = complete ? Check : compact ? Flag : ArrowDownLeft;
  return <span className={`python-homework-badge${complete ? ' is-complete' : ''}${animate && !complete ? ' is-animated' : ''}`}>
    <Icon size={compact ? 11 : 13} aria-hidden="true" />
    {compact ? 'Из ДЗ' : 'Из домашки'}
    {complete && <span className="sr-only"> · выполнено</span>}
  </span>;
}
