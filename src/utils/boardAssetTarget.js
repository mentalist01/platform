// A group board belongs to its lesson, never to the teacher's last pupil picker.
// The live room also identifies the scope when a board changes during a call.
export const resolveBoardAssetTarget = (studentId, { lessonId = '', roomId = '' } = {}) => {
  const room = String(roomId || '').trim();
  const roomLesson = room.startsWith('board-lesson-') ? room.slice(13).split('~')[0] : '';
  const lesson = roomLesson || String(lessonId || '').trim();
  return { studentId: lesson ? '' : String(studentId || '').trim(), lessonId: lesson };
};
