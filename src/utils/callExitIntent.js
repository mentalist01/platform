// Leaving a transport is not ending a lesson: the teacher may be moving to
// Telemost. Only an explicit lesson finish can stop its recorder immediately.
export const shouldEndRecordingOnCallExit = ({ action, role, isGroupLesson, meetingId }) => (
  action === 'finish-lesson' && role === 'teacher' && !isGroupLesson && !meetingId
);
