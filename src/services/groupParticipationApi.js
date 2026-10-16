import {requestLearningGroupJson} from './api.js';
const endpoint = (...parts) => `/api/learning-groups/${parts.map(encodeURIComponent).join('/')}`;
export const groupParticipationApi = {
  saveLearningGroupHomeworkTrack: (groupId,studentId,body) => requestLearningGroupJson(endpoint(groupId,'members',studentId,'homework-track'),{method:'PUT',body}),
  getLearningGroupParticipation: groupId => requestLearningGroupJson(endpoint(groupId,'participation')),
  saveLearningGroupParticipation: (groupId,studentId,body) => requestLearningGroupJson(endpoint(groupId,'members',studentId,'participation'),{method:'PUT',body}),
  reviewLearningGroupParticipation: (groupId,studentId,body) => requestLearningGroupJson(endpoint(groupId,'members',studentId,'participation','review'),{method:'POST',body}),
  saveLearningLessonParticipation: (groupId,lessonId,body) => requestLearningGroupJson(endpoint(groupId,'lessons',lessonId,'participation'),{method:'PUT',body}),
};
