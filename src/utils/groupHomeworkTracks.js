export const normalizeGroupHomeworkTrack = value => ['ege', 'python'].includes(value) ? value : 'all';
export const groupHomeworkTrackLabel = value => ({ege:'Только ЕГЭ', python:'Только Python', all:'ЕГЭ и Python'})[normalizeGroupHomeworkTrack(value)];

// Use the saved direction and concrete tasks, never infer enrollment from a
// missed lesson, a deadline, or the wording of a teacher's free-form note.
export function groupHomeworkTracks(homework = {}) {
  const source = homework?.homework || homework || {};
  const tracks = new Set();
  if (['ege', 'python'].includes(source.studyTrack)) tracks.add(source.studyTrack);
  const goals = Array.isArray(source.goals) ? source.goals : [];
  for (const goal of goals) {
    if (!goal || typeof goal !== 'object') continue;
    if (goal.type === 'mock' || goal.mockExamId) tracks.add('ege');
    else if (Number(goal.taskNumber) > 0) tracks.add(Number(goal.taskNumber) >= 100 ? 'python' : 'ege');
  }
  if (!goals.length && Number(source.taskNumber) > 0) tracks.add(Number(source.taskNumber) >= 100 ? 'python' : 'ege');
  return [...tracks];
}

export function isGroupHomeworkTrackAllowed(homework, member) {
  const track = normalizeGroupHomeworkTrack(member?.homeworkStudyTrack);
  return track === 'all' || groupHomeworkTracks(homework).every(value => value === track);
}

export function groupHomeworkRecipients(group, homework, ids) {
  return ids.filter(id => isGroupHomeworkTrackAllowed(homework, group.members?.find(member => member.studentId === id)));
}
