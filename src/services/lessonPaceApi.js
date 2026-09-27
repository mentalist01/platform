import { requestLearningGroupJson } from './api.js';
const endpoint = (groupId, lessonId) => `/api/learning-groups/${encodeURIComponent(groupId)}/lessons/${encodeURIComponent(lessonId)}/pace`;
export const lessonPaceApi = {
  getPendingLessonPace: () => requestLearningGroupJson('/api/learning-lesson-feedback/pending'),
  saveLessonPace: (groupId, lessonId, value) => requestLearningGroupJson(endpoint(groupId, lessonId), { method: 'PUT', body: { value } }),
  getLessonPace: (groupId, lessonId) => requestLearningGroupJson(endpoint(groupId, lessonId)),
};
