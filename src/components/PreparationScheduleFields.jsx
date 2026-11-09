import { buildPreparationSchedule } from '../utils/preparationSchedule.js';
import { AVAILABILITY_DAY_NAMES } from '../utils/groupAvailability.js';

export default function PreparationScheduleFields({ value, onChange, disabled }) {
  let preview = [], error = '';
  try { preview = buildPreparationSchedule(value).lessons; } catch (failure) { error = failure.message; }
  const change = patch => onChange({ ...value, ...patch });
  return <fieldset className="group-preparation__schedule" disabled={disabled}>
    <legend>Расписание предподготовки · Москва</legend>
    <div className="group-preparation__schedule-settings">
      <label>Максимум занятий<input required type="number" min="1" max="50" value={value.count} onChange={event => change({ count: event.target.value })} /></label>
      <label>Начиная с<input required type="date" value={value.startDate} onChange={event => change({ startDate: event.target.value })} /></label>
      <label>Длительность, минут<input required type="number" min="15" max="180" value={value.durationMinutes} onChange={event => change({ durationMinutes: event.target.value })} /></label>
    </div>
    {value.slots.map((slot, index) => <div className="group-preparation__schedule-slot" key={index}>
      <select aria-label={`День занятия ${index + 1}`} value={slot.day} onChange={event => change({ slots: value.slots.map((item, i) => i === index ? { ...item, day: Number(event.target.value) } : item) })}>
        {AVAILABILITY_DAY_NAMES.map((day, i) => <option key={i} value={i}>{day}</option>)}
      </select>
      <input required aria-label={`Время занятия ${index + 1}`} type="time" value={slot.time} onChange={event => change({ slots: value.slots.map((item, i) => i === index ? { ...item, time: event.target.value } : item) })} />
      <button type="button" disabled={value.slots.length === 1} onClick={() => change({ slots: value.slots.filter((_, i) => i !== index) })}>Убрать</button>
    </div>)}
    <button type="button" disabled={value.slots.length >= 7} onClick={() => change({ slots: [...value.slots, { day: [0, 1, 2, 3, 4, 5, 6].find(day => !value.slots.some(slot => slot.day === day)), time: '16:00' }] })}>+ Ещё день</button>
    {error ? <p role="alert">{error}</p> : <details><summary>Занятий в плане: {preview.length} · посмотреть даты</summary>
      <ol>{preview.map(lesson => <li key={lesson.date}>{new Date(`${lesson.date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })} · {lesson.time}</li>)}</ol>
    </details>}
    <small>При сохранении появятся только эти разовые занятия — на платформе и в Google Calendar. При досрочном переходе в группу оставшиеся отменятся.</small>
  </fieldset>;
}
