// The live room identifies a permanent group notebook or a legacy lesson.
// Neither may inherit the teacher's last individual pupil picker.
export const resolveBoardAssetTarget = (studentId, { lessonId = '', roomId = '' } = {}) => {
  const room = String(roomId || '').trim();
  if(room.startsWith('board-group-'))return {studentId:'',lessonId:''};
  const roomLesson = room.startsWith('board-lesson-') ? room.slice(13).split('~')[0] : '';
  const lesson = roomLesson || String(lessonId || '').trim();
  return { studentId: lesson ? '' : String(studentId || '').trim(), lessonId: lesson };
};
