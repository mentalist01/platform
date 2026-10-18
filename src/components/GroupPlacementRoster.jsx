import { useEffect, useState } from 'react';
import { Check, Clock3, RefreshCw, Search } from 'lucide-react';
import { api } from '../services/api';
import './GroupPlacementRoster.css';

export default function GroupPlacementRoster({ selectedId, onSelect, transport = api, refreshKey = 0 }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [scope, setScope] = useState('seeking'), [state, setState] = useState('all'), [query, setQuery] = useState('');
  useEffect(() => {
    let disposed = false, inFlight = false;
    const load = async () => {
      if (inFlight) return; inFlight = true; setBusy(true);
      try { const next = await transport.teacherGroupPlacement(); if (!disposed) { setData(next); setError(''); } }
      catch (failure) { if (!disposed) setError(failure.message || 'Не удалось загрузить ответы учеников.'); }
      finally { inFlight = false; if (!disposed) setBusy(false); }
    };
    const update = () => { if (!document.hidden) void load(); };
    void load(); const timer = setInterval(update, 30_000);
    window.addEventListener('focus', update); window.addEventListener('learning-groups-changed', update);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('learning-groups-changed', update); };
  }, [transport, refreshKey, revision]);
  const all = data?.students || [];
  const seeking = all.filter(row => !row.groups.length && (row.seekingGroup || row.answerState !== 'pending'));
  const candidates = scope === 'seeking' ? seeking : all.filter(row => !row.groups.length);
  const ready = candidates.filter(row => row.answerState === 'answered').length;
  const visible = candidates.filter(row => (state === 'all' || state === 'answered' && row.answerState === 'answered' || state === 'pending' && row.answerState !== 'answered')
    && `${row.name} ${row.nickname}`.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')))
    .sort((a, b) => Number(a.answerState === 'answered') - Number(b.answerState === 'answered') || a.name.localeCompare(b.name, 'ru'));
  return <section className="placement-roster" aria-label="Ученики для подбора группы">
    <header><div><h3>Кому подбираем группу</h3><p>Откройте ученика, чтобы посмотреть всё его время и примерить к группам ниже.</p></div><button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} />{busy ? 'Обновляем…' : 'Обновить ответы'}</button></header>
    <div className="placement-roster__tools"><label className="placement-roster__search"><Search size={16} /><input aria-label="Поиск учеников для подбора группы" placeholder="Имя или второе имя" value={query} onChange={event => setQuery(event.target.value)} /></label><label>Список<select value={scope} onChange={event => setScope(event.target.value)}><option value="seeking">Подбираем группу ({seeking.length})</option><option value="ungrouped">Все ученики без группы ({all.filter(row => !row.groups.length).length})</option></select></label></div>
    <div className="placement-roster__filters">{[['all', 'Все', candidates.length], ['answered', 'Выбрали время', ready], ['pending', 'Ждём время', candidates.length - ready]].map(([value, label, count]) => <button type="button" key={value} aria-pressed={state === value} onClick={() => setState(value)}>{label}<b>{data ? count : '—'}</b></button>)}</div>
    {error && <p role="alert" className="placement-roster__error">{error}{data ? ' Показаны последние загруженные ответы.' : ''}</p>}
    {!data && busy && <p role="status">Проверяем, кто уже выбрал время…</p>}
    {data && !visible.length && <p className="placement-roster__empty">{query || state !== 'all' ? 'По этим условиям учеников нет.' : scope === 'seeking' ? 'Пока никто не ожидает подбора. Откройте список «Все ученики без группы», выберите нового ученика и включите «Подбираем группу».' : 'Все ученики уже состоят в группах.'}</p>}
    <div className="placement-roster__grid">{visible.map(row => <button type="button" key={row.studentId} aria-pressed={selectedId === row.studentId} className="placement-roster__pupil" onClick={() => onSelect(row.studentId)}><span className="placement-roster__name">{row.name}{row.nickname && <small>{row.nickname}</small>}</span><span className={`placement-roster__state is-${row.answerState}`}>{row.answerState === 'answered' ? <Check size={14} /> : <Clock3 size={14} />}{row.answerState === 'answered' ? 'Время выбрано' : row.answerState === 'empty' ? 'Нет отмеченных вариантов' : 'Ещё не выбрал время'}</span><span className="placement-roster__details">{row.answerState === 'answered' ? `${row.slotCount} вариантов · ${row.durations.map(value => `${value} мин`).join(', ')}` : 'Нужно заполнить анкету свободного времени'}</span>{row.updatedAt && <small className="placement-roster__updated">Обновлено {new Date(row.updatedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</small>}<span className="placement-roster__open">{selectedId === row.studentId ? 'Открыт ниже' : 'Посмотреть и примерить →'}</span></button>)}</div>
  </section>;
}
