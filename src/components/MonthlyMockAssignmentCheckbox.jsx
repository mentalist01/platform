import { getMonthlyMockMonth, getMonthlyMockPeriod } from '../utils/monthlyMockExam';

export default function MonthlyMockAssignmentCheckbox({ checked, disabled, onChange, hint, publicationDay = 1, onPublicationDayChange }) {
  const period = getMonthlyMockPeriod(getMonthlyMockMonth());
  const lastDay = Math.round((period.endMs - period.startMs) / 86_400_000);
  return <div className="monthly-mock-assignment">
    <label>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span>Пробник месяца · {period.label}</span>
    </label>
    {checked && onPublicationDayChange && <div className="monthly-mock-assignment__publication">
      <label>
        <span>Публиковать с</span>
        <select aria-label="День публикации пробника месяца" value={publicationDay} disabled={disabled}
          onChange={event => onPublicationDayChange(Number(event.target.value))}>
          {Array.from({ length: lastDay }, (_, index) => index + 1).map(day => <option key={day} value={day}>{day} числа</option>)}
        </select>
      </label>
      <small>С 00:00 по Москве. До этого дня пробник скрыт от ваших учеников и недоступен для решения.</small>
    </div>}
    {hint && <small>{hint}</small>}
  </div>;
}
