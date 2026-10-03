import { getMonthlyMockMonth, getMonthlyMockPeriod } from '../utils/monthlyMockExam';

export default function MonthlyMockAssignmentCheckbox({ checked, disabled, onChange, hint }) {
  const period = getMonthlyMockPeriod(getMonthlyMockMonth());
  return <div className="monthly-mock-assignment">
    <label>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span>Пробник месяца · {period.label}</span>
    </label>
    {hint && <small>{hint}</small>}
  </div>;
}
