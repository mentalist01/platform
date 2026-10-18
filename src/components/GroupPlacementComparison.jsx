import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api.js';
import { AVAILABILITY_DAYS, AVAILABILITY_DAY_NAMES } from '../utils/groupAvailability.js';
import { buildPlacementComparison, comparisonDurations, PLACEMENT_CHOICE_LABELS } from '../utils/groupPlacementComparison.js';
import './GroupPlacementComparison.css';

export default function GroupPlacementComparison({ student, answers, group, onClose, transport = api }) {
  const dialog = useRef(null);
  const [snapshot, setSnapshot] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [selectedDuration, setDuration] = useState(null), [selectedDay, setDay] = useState(null), [onlyCommon, setOnlyCommon] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => { element.close(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    transport.groupAvailability(group.id).then(result => { if (!cancelled) { setSnapshot(result); setError(''); } })
      .catch(failure => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [group.id, transport, revision]);
  const durations = comparisonDurations(group, snapshot, answers);
  const duration = durations.includes(selectedDuration) ? selectedDuration : durations[0];
  const model = buildPlacementComparison({ student, answers, group, snapshot, duration });
  const days = [...new Set(model.rows.map(row => row.day))];
  const day = days.includes(selectedDay) ? selectedDay : days[0];
  const commonRows = model.rows.filter(row => row.common && !row.blocked);
  const visible = model.rows.filter(row => row.day === day && (!onlyCommon || row.common && !row.blocked));
  return createPortal(<dialog ref={dialog} className="placement-comparison" aria-labelledby="placement-comparison-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="placement-comparison__header"><div><span className="placement-comparison__eyebrow">ПРИМЕРКА РАСПИСАНИЯ</span><h2 id="placement-comparison-title">{student.name} + {group.name}</h2><p>Сравниваем отметки. Состав группы и расписание не меняются.</p></div><button type="button" autoFocus onClick={onClose} aria-label="Закрыть сравнение"><X size={21} /></button></header>
    <div className="placement-comparison__body">
      {!snapshot ? <div className="placement-comparison__notice" role={error ? 'alert' : 'status'}>{error || 'Загружаем отметки участников…'}{error && <button type="button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} />Повторить</button>}</div> : <>
        <div className="placement-comparison__toolbar"><div><CalendarDays size={20} /><strong>{commonRows.length} общих вариантов</strong><span>Москва · UTC+3</span></div><label>Занятие<select value={duration} disabled={durations.length < 2} onChange={event => setDuration(Number(event.target.value))}>{durations.map(value => <option key={value} value={value}>{value} минут</option>)}</select></label></div>
        {snapshot.calendarError && <p className="placement-comparison__warning">Календарь преподавателя не удалось проверить. Совпадения отметок показаны, но занятость преподавателя нужно уточнить.</p>}
        {!snapshot.poll && <p className="placement-comparison__warning">У группы пока нет анкеты участников. Можно посмотреть время ученика и установленное расписание; сравнение с остальными появится после заполнения анкеты группы.</p>}
        {snapshot.poll && !model.columns.slice(1).length && <p className="placement-comparison__notice">В группе пока нет других участников с анкетой. Ниже — время выбранного ученика.</p>}
        {model.missingOwn && <p className="placement-comparison__warning">У ученика нет сохранённых отметок для занятия {duration} минут. Более короткие или длинные занятия не считаем совпадением.</p>}
        <p className="placement-comparison__explanation">Слева — личная анкета ученика, дальше — ответы участников группы. Общее время выделено зелёным. «Не спрашивали» означает, что этого интервала не было в анкете.</p>
        <label className="placement-comparison__filter"><input type="checkbox" checked={onlyCommon} onChange={event => setOnlyCommon(event.target.checked)} />Только совпадения всех участников</label>
        <nav className="placement-comparison__days" aria-label="Дни сравнения">{AVAILABILITY_DAYS.map((name, index) => <button type="button" key={name} disabled={!days.includes(index)} aria-pressed={day === index} onClick={() => setDay(index)}>{name}<small>{model.rows.filter(row => row.day === index && row.common && !row.blocked).length}</small></button>)}</nav>
        {!visible.length ? <p className="placement-comparison__notice">{onlyCommon ? 'В этот день пока нет общего времени. Снимите фильтр, чтобы увидеть различия.' : 'Пока нет выбранных вариантов для сравнения.'}</p> : <div className="placement-comparison__table" tabIndex={0} aria-label={`Время · ${AVAILABILITY_DAY_NAMES[day]}`}><table><caption className="sr-only">{AVAILABILITY_DAY_NAMES[day]} · занятие {duration} минут</caption><thead><tr><th scope="col">Время</th>{model.columns.map(member => <th scope="col" key={member.id} className={member.candidate ? 'candidate' : ''}>{member.name}<small>{member.candidate ? 'Подбираем группу' : 'Участник группы'}</small></th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id} className={row.common && !row.blocked ? 'is-common' : ''}><th scope="row"><strong>{row.time}–{row.end}</strong>{row.scheduled && <small>Расписание группы</small>}{row.blocked ? <small className="busy">Преподаватель занят</small> : row.common && <small>{row.flexible ? 'Общее · подстроиться' : 'Удобно всем'}</small>}</th>{row.choices.map((choice, i) => <td key={model.columns[i].id} className={model.columns[i].candidate ? 'candidate' : ''}><span className={`placement-vote vote-${choice}`}>{PLACEMENT_CHOICE_LABELS[choice]}</span></td>)}</tr>)}</tbody></table></div>}
        <p className="placement-comparison__explanation">«Нет ответа» и «Не выбрано» не считаются согласием. Показаны все интервалы, выбранные хотя бы одним человеком, и занятия установленного расписания.</p>
      </>}
    </div><footer className="placement-comparison__footer"><span>Только просмотр</span><button type="button" onClick={onClose}>Закрыть примерку</button></footer>
  </dialog>, document.body);
}
