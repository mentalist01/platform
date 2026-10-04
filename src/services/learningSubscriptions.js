import { requestLearningGroupJson } from './api';

const base = '/api/learning-subscriptions';
export const subscriptionApi = {
  list: () => requestLearningGroupJson(base),
  create: body => requestLearningGroupJson(base, { method: 'POST', body }),
  tariff: (id, body) => requestLearningGroupJson(`${base}/tariffs/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  action: (id, action, body = {}) => requestLearningGroupJson(`${base}/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }),
  individual: (studentId, price, month) => requestLearningGroupJson(`/api/teacher-finance/students/${encodeURIComponent(studentId)}`, { method: 'PATCH', body: { month, pricingMode: 'perLesson', lessonPrice: price } }),
};
