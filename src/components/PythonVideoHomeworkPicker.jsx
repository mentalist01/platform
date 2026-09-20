import { useMemo, useState } from 'react';
import { Plus, Trash2, Video } from 'lucide-react';
import { api } from '../services/api';
import { getPythonVideoMaterials } from '../utils/pythonVideoMaterials';

const fieldClass = 'w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500';
const newQuestion = () => ({ id: crypto.randomUUID(), question: '', answer: '' });

export default function PythonVideoHomeworkPicker({ tasks, testsDb, levelId, disabled, onCreated, onBusyChange }) {
  const videos = useMemo(() => getPythonVideoMaterials(tasks, testsDb, levelId), [tasks, testsDb, levelId]);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = search.trim().toLocaleLowerCase('ru-RU');
  const matches = videos.filter((video) => video.title.toLocaleLowerCase('ru-RU').includes(query));
  const save = async () => {
    if (busy || !draft) return;
    setBusy(true); onBusyChange?.(true); setError('');
    try {
      const result = await api.createLearningMaterial({
        title: draft.title.trim(), url: draft.url, kind: 'video', visibility: 'group',
        quizQuestions: draft.questions.map((q) => ({ ...q, question: q.question.trim(), answer: q.answer.trim() })),
      });
      onCreated(result.material);
      setDraft(null); setExpanded(false);
    } catch (e) {
      setError(e?.message || 'Не удалось сохранить видео с мини-тестом.');
    } finally { setBusy(false); onBusyChange?.(false); }
  };
  return <div className="mb-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
    <button type="button" disabled={disabled || busy} onClick={() => setExpanded(!expanded)}
      aria-expanded={expanded} className="flex items-center gap-2 text-sm font-bold text-violet-700 disabled:opacity-50">
      <Video size={17} /> Видео из «Изучения Python» + мини-тест
    </button>
    {expanded && <div className="mt-3 space-y-3">
      {!draft ? <>
        <p className="text-xs text-slate-600">Выберите ролик и составьте отдельные вопросы к нему. Видео с тестом сохранится в библиотеке и добавится в эту домашку.</p>
        <input aria-label="Поиск видео Python" type="search" className={fieldClass} placeholder="Найти тему или ролик…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-52 space-y-1 overflow-auto">
          {matches.map((video) => <button type="button" key={video.id} disabled={disabled}
            onClick={() => { setDraft({ ...video, questions: [newQuestion()] }); setError(''); }}
            className="block w-full rounded-lg bg-white px-3 py-2 text-left text-sm font-semibold text-violet-800 hover:bg-violet-100">{video.title}</button>)}
          {!matches.length && <p className="text-xs text-slate-500">{videos.length ? 'Ничего не найдено.' : 'В темах Python пока нет видео Rutube.'}</p>}
        </div>
      </> : <>
        <label className="block text-xs font-bold text-slate-700">Название видео
          <input className={`${fieldClass} mt-1`} value={draft.title} disabled={busy} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <a href={draft.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-violet-700 underline">Посмотреть выбранный ролик</a>
        <p className="text-xs text-slate-600">Ученик посмотрит видео и ответит на эти вопросы. Ответы используются для автоматической проверки.</p>
        {draft.questions.map((question, index) => <fieldset key={question.id} disabled={busy} className="space-y-2 rounded-xl border border-violet-100 bg-white p-3">
          <legend className="px-1 text-xs font-bold text-violet-700">Вопрос {index + 1}</legend>
          <textarea aria-label={`Вопрос ${index + 1}`} className={fieldClass} rows={2} value={question.question} placeholder="Вопрос к ролику"
            onChange={(e) => setDraft({ ...draft, questions: draft.questions.map((q) => q.id === question.id ? { ...q, question: e.target.value } : q) })} />
          <input aria-label={`Правильный ответ ${index + 1}`} className={fieldClass} value={question.answer} placeholder="Правильный ответ"
            onChange={(e) => setDraft({ ...draft, questions: draft.questions.map((q) => q.id === question.id ? { ...q, answer: e.target.value } : q) })} />
          {draft.questions.length > 1 && <button type="button" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((q) => q.id !== question.id) })}
            className="flex items-center gap-1 text-xs text-rose-600"><Trash2 size={13} /> Удалить вопрос</button>}
        </fieldset>)}
        <button type="button" disabled={busy} onClick={() => setDraft({ ...draft, questions: [...draft.questions, newQuestion()] })}
          className="flex items-center gap-1 text-xs font-bold text-violet-700"><Plus size={14} /> Ещё вопрос</button>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={disabled || busy || !draft.title.trim() || draft.questions.some((q) => !q.question.trim() || !q.answer.trim())}
            className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Сохраняем…' : 'Добавить видео с тестом в домашку'}</button>
          <button type="button" disabled={busy} onClick={() => { setDraft(null); setError(''); }} className="px-2 py-2 text-xs text-slate-600">Другой ролик</button>
        </div>
      </>}
    </div>}
  </div>;
}
