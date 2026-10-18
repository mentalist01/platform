import { AVAILABILITY_DAY_NAMES, availabilitySlots } from '../utils/groupAvailability.js';

export default function StudentAvailabilitySummary({ answers = [] }) {
  return <section className="placement-full-availability" aria-label="Всё свободное время ученика">
    <header><h3>Свободное время ученика</h3><span>Москва · UTC+3</span></header>
    <p>Все сохранённые варианты, в том числе без совпадений с группами. Каждый интервал — отдельный вариант начала занятия.</p>
    {answers.filter(value => value.answer).map(value => {
      const slots = availabilitySlots(value.config).filter(slot => ['yes', 'maybe'].includes(value.answer.choices?.[slot.id]));
      return <details key={value.durationMinutes} open className="placement-duration">
        <summary>Занятие {value.durationMinutes} мин <span>· {slots.length} вариантов</span></summary>
        {!slots.length ? <p>Анкета сохранена без отметок времени.</p> : AVAILABILITY_DAY_NAMES.map((name, day) => {
          const selected = slots.filter(slot => slot.day === day);
          return <div key={day} className="placement-availability-day"><strong>{name}</strong>
            <div>{!selected.length ? <span className="placement-unmarked">Не отмечено</span> : selected.map(slot => {
              const choice = value.answer.choices[slot.id];
              return <span key={slot.id} className={`placement-time-mark mark-${choice}`}><b>{slot.time}–{slot.end}</b><small>{choice === 'yes' ? 'Удобно' : 'Могу подстроиться'}</small></span>;
            })}</div></div>;
        })}
      </details>;
    })}
  </section>;
}
