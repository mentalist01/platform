import { apiFetch } from './api';

export async function getMonthlyMockReview(examId, month = '') {
  const response = await apiFetch(`/api/mock-exams/${encodeURIComponent(examId)}/monthly-review${month ? `?month=${encodeURIComponent(month)}` : ''}`);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Не удалось проверить видеоразбор');
  return value;
}

export async function surrenderMonthlyMockReview(examId, month) {
  const response = await apiFetch(`/api/mock-exams/${encodeURIComponent(examId)}/monthly-review/surrender`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, confirm: true }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Не удалось открыть разбор. Попробуйте ещё раз.');
  return value;
}
