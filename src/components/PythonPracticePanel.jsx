import React, { useState } from 'react';
import { ArrowUpRight, CheckCircle, Clock3, RefreshCcw } from 'lucide-react';
import { isPythonReviewDue } from '../utils/pythonTaskPractice';

export function PythonPracticeBadge({ indicator }) {
  if (!indicator || indicator.key === 'new') return null;
  const due = isPythonReviewDue(indicator);
  const Icon = due ? RefreshCcw : indicator.key === 'current' ? CheckCircle : Clock3;
  return <span title={indicator.title} aria-label={indicator.ariaLabel} className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-4 ${due ? 'bg-amber-50 text-amber-800' : indicator.key === 'current' ? 'bg-emerald-50 text-emerald-800' : 'bg-violet-50 text-violet-700'}`}><Icon size={14} className="mt-0.5 shrink-0" /><span><strong className="block font-semibold">{indicator.label}</strong>{indicator.detail && <span className="mt-0.5 block opacity-80">{indicator.detail}</span>}</span></span>;
}

export default function PythonPracticePanel({ items = [], role, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const due = items.filter(item => isPythonReviewDue(item.indicator));
  if (!due.length) return null;
  return <section aria-label="Повторение Python" className="my-5 overflow-hidden rounded-[24px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200"><RefreshCcw size={21} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">Вспомнить и закрепить</p><h3 className="text-lg font-extrabold text-slate-900">Пора повторить Python</h3></div></div><span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-bold text-violet-700">Тем для повторения: {due.length}</span></div>
    <p className="px-5 text-sm leading-5 text-slate-500">{role === 'teacher' ? 'Знакомые темы, которые ученику пора освежить.' : 'Вернитесь к знакомым задачам и напишите решение заново.'} Уверенные ответы увеличивают интервал до следующего повторения.</p>
    <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">{(expanded ? due : due.slice(0, 3)).map(({ task, indicator }) => <button key={task.id} type="button" onClick={() => onOpen(task)} className="group rounded-2xl border border-violet-100 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"><div className="flex items-start justify-between gap-2"><strong className="text-sm text-slate-900">{task.title}</strong><ArrowUpRight size={17} className="shrink-0 text-violet-500 transition group-hover:translate-x-0.5" /></div><p className="mt-2 text-xs leading-4 text-amber-700">{indicator.label}</p><span className="mt-3 inline-block text-xs font-bold text-violet-600">{role === 'teacher' ? 'Посмотреть попытки' : indicator.currentCount > 0 ? 'Продолжить повторение' : 'Повторить тему'}</span></button>)}</div>
    {due.length > 3 && <button type="button" onClick={() => setExpanded(!expanded)} className="mx-5 mb-4 text-sm font-semibold text-violet-600">{expanded ? 'Свернуть' : `Показать все темы (${due.length})`}</button>}
  </section>;
}
