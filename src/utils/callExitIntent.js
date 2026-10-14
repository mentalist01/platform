// Individual transport handoffs preserve recording. An intentional group
// hangup ends capture; channel changes and reconnection do not use this intent.
export const shouldEndRecordingOnCallExit = ({ action, role, isGroupLesson, meetingId }) => (
  role === 'teacher' && !meetingId && (action === 'finish-lesson' || (isGroupLesson && action === 'leave'))
);
