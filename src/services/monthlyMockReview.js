import { apiFetch } from './api';

export async function getMonthlyMockReview(examId) {
  const response = await apiFetch(`/api/mock-exams/${encodeURIComponent(examId)}/monthly-review`);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Не удалось проверить видеоразбор');
  return value;
}
