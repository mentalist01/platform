import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

const levelName = level => ({ basic: 'Обязательный', advanced: 'Продвинутый', expert: 'Сложный' }[level] || level);

export default function GroupHomeworkCancellationPanel({ groupId, assignmentId }) {
  const [catalog, setCatalog] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState({});
  const load = async () => {
    const value = await api.getLearningGroupHomeworkCancellations(groupId, assignmentId);
    setCatalog(value); setSelected({}); return value;
  };
  useEffect(() => {
    let active = true;
    api.getLearningGroupHomeworkCancellations(groupId, assignmentId)
      .then(value => { if (active) { setCatalog(value); setSelected({}); } })
      .catch(failure => { if (active) setError(failure.message || 'Не удалось загрузить задания'); });
    return () => { active = false; };
  }, [groupId, assignmentId]);
  const change = async operation => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); await load(); }
    catch (failure) { setError(failure.message || 'Не удалось изменить домашку'); }
    finally { setBusy(false); }
  };
  const cancel = (task, all) => change(async () => {
    const key = `${task.taskNumber}|${task.levelId}`;
    await api.cancelLearningGroupHomeworkTargets(groupId, assignmentId, { taskNumber: task.taskNumber,
      levelId: task.levelId, ...(all ? { all: true } : { targetQuestionIds: selected[key] || [] }) });
    setNotice('Убрано у всей группы. Эти старые номера больше не переносятся.');
  });
  return <details className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm">
    <summary className="cursor-pointer font-bold text-rose-800">Убрать задания у всей группы</summary>
    <p className="mt-2 text-xs leading-relaxed text-slate-600">Новые и перенесённые номера этой домашки. Удаление применяется сразу ко всем ученикам. Целое задание убирается во всех уровнях. Ответы сохраняются; убранные номера не вызывают новых списаний жизней. Позже их можно задать заново новой домашкой.</p>
    {error && <div role="alert" className="mt-2 text-sm text-red-700">{error} <button type="button" disabled={busy}
      className="underline" onClick={() => void change(async () => {})}>Повторить</button></div>}
    {notice && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{notice}</p>}
    {!catalog && !error && <p className="mt-2 text-xs text-slate-500">Загружаем номера…</p>}
    <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
      {catalog?.tasks?.map(task => {
        const key = `${task.taskNumber}|${task.levelId}`, checked = selected[key] || [];
        const available = task.questions.filter(question => !question.cancelled);
        return <section key={key} className="rounded-lg border border-rose-100 bg-white p-3">
          <div className="font-bold text-slate-800">Задание {task.taskNumber} · {levelName(task.levelId)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{task.questions.map(question => <label key={question.id}
            className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs ${question.cancelled ? 'border-slate-100 text-slate-400 line-through' : 'border-violet-200 text-violet-800'}`}>
            <input type="checkbox" disabled={busy || question.cancelled} checked={checked.includes(question.id)}
              aria-label={`Убрать номер ${question.number}, задание ${task.taskNumber}, ${levelName(task.levelId)}`}
              onChange={event => setSelected(current => ({ ...current, [key]: event.target.checked
                ? [...(current[key] || []), question.id] : (current[key] || []).filter(id => id !== question.id) }))} />
            №{question.number}
          </label>)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !checked.length} onClick={() => void cancel(task, false)}
              className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-40">Убрать выбранные номера</button>
            <button type="button" disabled={busy || !available.length} onClick={() => void cancel(task, true)}
              className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
              title="Все уровни этого задания" aria-label={`Убрать задание ${task.taskNumber} целиком, ${levelName(task.levelId)}`}>Убрать задание целиком</button>
          </div>
        </section>;
      })}
      {catalog && !catalog.tasks?.length && <p className="text-xs text-slate-500">В этой домашке нет номеров ЕГЭ.</p>}
    </div>
    {catalog?.cancellations?.length > 0 && <div className="mt-3 space-y-2 border-t border-rose-200 pt-3">
      <p className="text-xs font-bold text-slate-600">Можно отменить удаление</p>
      {catalog.cancellations.map(record => <div key={record.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
        <span>Задание {record.taskNumber} · {levelName(record.levelId)} · №{record.targetQuestions.join(', ')}</span>
        <button type="button" disabled={busy} className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 font-bold text-violet-700"
          onClick={() => void change(async () => { await api.restoreLearningGroupHomeworkCancellation(groupId, assignmentId, record.id);
            setNotice('Отмена снята. Номера снова доступны в этой выдаче.'); })}>Вернуть</button>
      </div>)}
    </div>}
  </details>;
}
