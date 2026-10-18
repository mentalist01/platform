import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, Clock3, Pencil, Plus, X } from 'lucide-react';
import './CalendarEventEditor.css';

const minutes = value => /^\d{2}:\d{2}$/.test(value || '') ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
const clock = value => Number.isFinite(value) && value >= 0 && value <= 1440
  ? `${String(Math.floor(value % 1440 / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` : '';

export default function CalendarEventEditor({ mode = 'create', draft, onChange, onClose, onSubmit, busy, error,
  ownerOptions = [], ownerError = '', ownerLabel = '', anchor = null, onFindSlot }) {
  const editing = mode === 'update', titleId = useId(), form = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const width = Math.min(430, window.innerWidth - 24), height = form.current?.getBoundingClientRect().height || 560;
      const left = !anchor || window.innerWidth < 720 ? (window.innerWidth - width) / 2
        : anchor.right + width + 12 <= window.innerWidth - 12 ? anchor.right + 12 : Math.max(12, anchor.left - width - 12);
      const top = !anchor || window.innerWidth < 720 ? Math.max(12, (window.innerHeight - height) / 2)
        : Math.max(12, Math.min(anchor.top - 40, window.innerHeight - height - 12));
      setPosition({ left, top, width });
    };
    place(); window.addEventListener('resize', place);
    const observer = new ResizeObserver(place); if (form.current) observer.observe(form.current);
    return () => { window.removeEventListener('resize', place); observer.disconnect(); };
  }, [anchor]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    form.current?.querySelector('input')?.focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const end = clock(minutes(draft.time) + Number(draft.durationMinutes));
  const change = patch => onChange(previous => ({ ...previous, ...patch }));
  const keyDown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...form.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<div className="calendar-event-editor-backdrop" onClick={() => { if (!busy) onClose(); }}>
    <form ref={form} role="dialog" aria-modal="true" aria-labelledby={titleId} className="calendar-event-editor"
      style={position || {visibility:'hidden'}} onKeyDown={keyDown} onClick={event => event.stopPropagation()}
      onSubmit={event => { event.preventDefault(); onSubmit(event); }}>
      <header><span className="calendar-event-editor__icon">{editing ? <Pencil size={20} /> : <Plus size={22} />}</span>
        <div><h2 id={titleId}>{editing ? 'Изменить событие' : 'Новое событие'}</h2><p>{editing ? ownerLabel || 'Google Calendar' : 'В выбранном времени календаря'}</p></div>
        <button type="button" aria-label="Закрыть редактор события" disabled={busy} onClick={onClose}><X size={19} /></button>
      </header>
      <div className="calendar-event-editor__body">
        <fieldset disabled={busy}>
          <label>Название<input type="text" value={draft.title} maxLength={500} required={editing}
            placeholder="Название занятия или встречи" onChange={event => change({title:event.target.value})} /></label>
          {!editing && <div className="calendar-event-editor__row">
            <label>Для кого<select value={draft.studentId} onChange={event => change({studentId:event.target.value})}>
              {ownerOptions.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}
            </select></label>
            <label>Повтор<select value={draft.repeatMode} onChange={event => change({repeatMode:event.target.value})}><option value="once">Один раз</option><option value="weekly">Каждую неделю</option></select></label>
          </div>}
          {ownerError && <p className="calendar-event-editor__warning">Не удалось загрузить группы. {ownerError}</p>}
          <label><span><CalendarDays size={14} />Дата</span><input type="date" required value={draft.dateKey} onChange={event => change({dateKey:event.target.value})} /></label>
          <div className="calendar-event-editor__row">
            <label><span><Clock3 size={14} />Начало</span><input type="time" required step={60} value={draft.time} onChange={event => change({time:event.target.value})} /></label>
            <label>Окончание<input type="time" required step={60} value={end} onChange={event => {
              let finish = minutes(event.target.value); if (finish === 0 && minutes(draft.time) > 0) finish = 1440;
              change({durationMinutes:finish - minutes(draft.time)});
            }} /></label>
          </div>
          <p className="calendar-event-editor__hint">По Москве · {Number(draft.durationMinutes) > 0 ? `${draft.durationMinutes} мин` : 'Окончание должно быть позже начала'}{editing ? ' · меняется только это занятие' : ''}</p>
          <label>Описание<textarea rows={3} maxLength={6000} value={draft.note || ''} placeholder="Например, что планируем разобрать"
            onChange={event => change({note:event.target.value})} /></label>
          {!editing && onFindSlot && <button type="button" className="calendar-event-editor__find" onClick={onFindSlot}>Найти ближайшее свободное время</button>}
        </fieldset>
        {error && <p role="alert" className="calendar-event-editor__error">{error}</p>}
      </div>
      <footer><p><Check size={14} />{busy ? 'Сохраняем в Google Calendar…' : 'Сохраним в платформе и Google Calendar'}</p>
        <div><button type="button" disabled={busy} onClick={onClose}>Отмена</button><button type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
      </footer>
    </form>
  </div>, document.body);
}
