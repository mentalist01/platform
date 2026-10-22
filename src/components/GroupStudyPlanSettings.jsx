import React, { useState } from 'react';
import { CalendarDays, Check, Code2, BookOpen, Save } from 'lucide-react';
import { LEARNING_GROUP_WEEKDAYS } from '../utils/learningGroups';
import { groupLessonStudyTrack, groupStudySchedule, normalizeGroupStudyPlan } from '../utils/groupStudyPlan';

export default function GroupStudyPlanSettings({ group, onSave, busy = false }) {
  const saved = normalizeGroupStudyPlan(group.studyPlan);
  const schedule = groupStudySchedule(group);
  const days = [...new Set(schedule.map(entry => entry.weekdayKey))];
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState(saved?.mode || 'split');
  const [pythonWeekday, setPythonWeekday] = useState(saved?.pythonWeekday || days[1] || days[0] || '');
  const dayLabel = key => LEARNING_GROUP_WEEKDAYS.find(day => day.value === key)?.label || key;
  const valid = days.length > 0 && (mode === 'ege-only' || (days.length === 2 && days.includes(pythonWeekday)));
  return <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Режим обучения группы">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-600"><CalendarDays size={20} /></span>
        <div><h3 className="font-black text-slate-900">Режим обучения</h3>
          <p className="mt-0.5 text-sm text-slate-500">{saved ? saved.mode === 'split' ? 'Один день — ЕГЭ, второй — Python' : 'Все занятия — задания ЕГЭ' : 'Выберите направления занятий и правило срока домашки'}</p>
        </div>
      </div>
      <button type="button" onClick={() => setEditing(!editing)} disabled={busy} className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-bold text-violet-700 disabled:opacity-50">{editing ? 'Свернуть' : saved ? 'Изменить режим' : 'Настроить режим'}</button>
    </div>
    {!editing && saved && <div className="mt-3 flex flex-wrap gap-2">{schedule.map(entry => <span key={entry.id} className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800">{dayLabel(entry.weekdayKey)}, {entry.time} · {groupLessonStudyTrack(group, entry) === 'python' ? 'Python' : 'ЕГЭ'}</span>)}</div>}
    {!editing && saved?.mode === 'split' && (days.length !== 2 || !days.includes(saved.pythonWeekday)) && <p role="status" className="mt-3 text-sm text-amber-800">Расписание изменилось. Нажмите «Изменить режим» и снова выберите день Python.</p>}
    {editing && <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Выберите режим обучения">
        {[{ id: 'split', title: 'ЕГЭ + Python', text: 'Домашка к следующему занятию своего направления' }, { id: 'ege-only', title: 'Только ЕГЭ', text: 'Домашка к ближайшему занятию группы' }].map(({ id, title, text }) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)} disabled={busy} className={`flex items-start gap-3 rounded-xl border p-4 text-left ${mode === id ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-300' : 'border-slate-200 bg-white'}`}>
          {id === 'split' ? <Code2 size={20} className="mt-0.5 shrink-0 text-violet-600" /> : <BookOpen size={20} className="mt-0.5 shrink-0 text-violet-600" />}<span className="flex-1"><strong className="block text-sm text-slate-900">{title}</strong><span className="mt-1 block text-xs leading-relaxed text-slate-500">{text}</span></span>{mode === id && <Check size={18} className="text-violet-600" />}
        </button>)}
      </div>
      {mode === 'split' && days.length === 2 && <label className="block text-sm font-bold text-slate-800">День Python
        <select aria-label="День Python" value={pythonWeekday} disabled={busy} onChange={event => setPythonWeekday(event.target.value)} className="mt-2 block w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 sm:max-w-md">
          {days.map(day => <option value={day} key={day}>{dayLabel(day)} · {schedule.filter(entry => entry.weekdayKey === day).map(entry => entry.time).join(', ')}</option>)}
        </select><span className="mt-2 block text-xs font-normal text-slate-500">{dayLabel(days.find(day => day !== pythonWeekday))} — задания ЕГЭ.</span>
      </label>}
      {!valid && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{days.length === 0 ? 'Сначала утвердите еженедельное расписание группы.' : 'Для режима ЕГЭ + Python нужны два разных дня в еженедельном расписании.'}</p>}
      <p className="text-xs leading-relaxed text-slate-500">Настройка применяется к новой домашке. Уже выданные работы, их сроки, даты занятий и оплаты сохраняются.</p>
      <button type="button" disabled={busy || !valid} onClick={async () => { const result = await onSave({ mode, pythonWeekday: mode === 'split' ? pythonWeekday : '' }); if (result) setEditing(false); }} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save size={16} />{busy ? 'Сохраняем…' : 'Сохранить режим'}</button>
    </div>}
  </section>;
}
