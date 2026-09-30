import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Video } from 'lucide-react';
import { api } from '../services/api';

const field = 'w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500';
const length = seconds => seconds > 0 ? `${Math.ceil(seconds / 60)} мин` : 'Весь урок';

export default function LessonRecordingHomeworkPicker({ teacherId, studentId, materials, disabled, onCreated, onBusyChange }) {
  const [open, setOpen] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError('');
    api.lessonRecordingLibrary('', { teacherId }).then(result => { if (!cancelled) setRecordings(result.recordings || []); })
      .catch(e => { if (!cancelled) setError(e?.message || 'Не удалось загрузить записи.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, teacherId, revision]);
  const prepared = (materials || []).filter(material => material.kind === 'video'
    && (material.recordingSource || material.id?.startsWith('recorder-'))
    && !recordings.some(recording => recording.url === material.url));
  const entries = [...recordings, ...prepared.map(material => ({ id: material.id, title: material.title,
    durationSeconds: material.durationSeconds, url: material.url, material }))];
  const matches = entries.filter(entry => `${entry.title} ${entry.date || ''}`.toLocaleLowerCase('ru-RU')
    .includes(search.trim().toLocaleLowerCase('ru-RU')));
  const archiveUrl = `http://127.0.0.1:18765/archive?${new URLSearchParams({ homework: '1', q: search,
    ...(studentId ? { studentId } : {}) })}`;
  const add = async () => {
    if (!draft || busy || disabled) return;
    setBusy(true); onBusyChange?.(true); setError('');
    try {
      const material = draft.entry.material || (await api.lessonRecordingLibrary(draft.entry.id, { teacherId, title: draft.title.trim() })).material;
      onCreated(material); setDraft(null); setOpen(false);
    } catch (e) { setError(e?.message || 'Не удалось добавить запись.'); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  return <section className="mb-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
    <button type="button" disabled={disabled || busy} aria-expanded={open} onClick={() => setOpen(!open)}
      className="flex items-center gap-2 text-sm font-bold text-violet-700 disabled:opacity-50"><Video size={17} /> Записи занятий</button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-xs text-slate-600">Добавьте весь урок из своих записей или найдите объяснение по расшифровке в пульте. Ученик получит обычное видео в этой домашке.</p>
      <div className="flex gap-2"><input aria-label="Поиск записей для домашки" type="search" className={field}
        placeholder="Задание 3, тема, имя или дата…" value={search} onChange={event => setSearch(event.target.value)} />
        <button type="button" aria-label="Обновить записи" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} /></button></div>
      <a href={archiveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-bold text-violet-700 underline"><ExternalLink size={14} /> Найти по расшифровке в пульте / выбрать фрагмент</a>
      <p className="text-[11px] text-slate-500">Пульт должен быть запущен на этом компьютере. После подготовки видео нажмите в нём «Задать в домашку».</p>
      {loading && <p role="status" className="flex gap-2 text-xs text-slate-600"><Loader2 size={15} className="animate-spin" /> Загружаем записи…</p>}
      {!draft && <div className="max-h-60 space-y-2 overflow-auto">
        {matches.map(entry => <button type="button" key={entry.id} disabled={disabled || busy} onClick={() => setDraft({ entry,
          title: search.trim() || `Запись урока${entry.date ? ` · ${entry.date}` : ''}` })}
          className="block w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-left hover:bg-violet-100 disabled:opacity-50">
          <strong className="block text-sm text-violet-900">{entry.title}</strong>
          <span className="text-xs text-slate-500">{entry.material?.recordingSource?.startsWith('archive:') ? 'Подготовленный материал' : 'Урок целиком'} · {length(entry.durationSeconds)}{entry.date ? ` · ${entry.date}` : ''}</span>
        </button>)}
        {!loading && !matches.length && <p className="text-xs text-slate-500">{entries.length ? 'По названию не найдено. Попробуйте поиск по расшифровке в пульте.' : 'Готовых записей пока нет. Подготовьте урок в архиве пульта.'}</p>}
      </div>}
      {draft && <div className="space-y-3 rounded-xl border border-violet-200 bg-white p-3">
        <p className="text-xs font-bold text-slate-700">{draft.entry.title} · {length(draft.entry.durationSeconds)}</p>
        <a href={draft.entry.url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-700 underline">Посмотреть запись перед назначением</a>
        {!draft.entry.material && <label className="block text-xs font-bold text-slate-700">Название для ученика<input maxLength={100} className={`${field} mt-1`} value={draft.title} disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || busy || (!draft.entry.material && !draft.title.trim())}
          onClick={add} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Добавляем…' : 'Добавить запись в домашку'}</button>
          <button type="button" disabled={busy} onClick={() => setDraft(null)} className="px-2 py-2 text-xs text-slate-600">Другая запись</button></div>
      </div>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>}
  </section>;
}
