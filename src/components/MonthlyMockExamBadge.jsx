import React from 'react';
import { CheckCircle2, Clock3, CircleMinus, BookOpen } from 'lucide-react';
import './MonthlyMockExamStatus.css';

export default function MonthlyMockExamBadge({ row, period, error, onClick }) {
  const status = row?.status || 'unknown';
  const Icon = status === 'completed' ? CheckCircle2 : status === 'exempt' ? CircleMinus : status === 'unknown' ? BookOpen : Clock3;
  const label = { completed: 'Пройден', in_progress: 'Начат', pending: 'Не пройден', exempt: 'Не требуется', unknown: error ? 'Нет данных' : 'Проверяем…' }[status];
  const month = period?.label || 'этот месяц';
  return <button type="button" className="monthly-mock-badge" data-status={error ? 'unknown' : status} onClick={onClick}
    aria-label={`Пробник за ${month}: ${label}${error ? '. Данные не обновлены' : ''}`}
    title={`Пробник за ${month}. ${error ? 'Не удалось обновить данные. ' : ''}Нужен хотя бы один завершённый пробник.`}>
    <Icon size={14} aria-hidden="true" />
    <span>Пробник · {month.split(' ')[0]}</span><strong>{label}</strong>
    {error && row && <span>· не обновлён</span>}
  </button>;
}
