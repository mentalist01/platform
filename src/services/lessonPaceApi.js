import { requestLearningGroupJson } from './api.js';
const endpoint = (groupId, lessonId) => groupId
  ? `/api/learning-groups/${encodeURIComponent(groupId)}/lessons/${encodeURIComponent(lessonId)}/pace`
  : `/api/individual-lessons/${encodeURIComponent(lessonId)}/pace`;
export const lessonPaceApi = {
  getPendingLessonPace: () => requestLearningGroupJson('/api/learning-lesson-feedback/pending'),
  saveLessonPace: (groupId, lessonId, value) => requestLearningGroupJson(endpoint(groupId, lessonId), { method: 'PUT', body: { value } }),
  getLessonPace: (groupId, lessonId) => requestLearningGroupJson(`/api/learning-groups/${encodeURIComponent(groupId)}/lessons/${encodeURIComponent(lessonId)}/pace`),
  getStudentPaceRoster: () => requestLearningGroupJson('/api/lesson-pace/students'),
  getStudentPaceHistory: (studentId, offset = 0) => requestLearningGroupJson(`/api/lesson-pace/students/${encodeURIComponent(studentId)}?offset=${offset}`),
};
