const ENTITY_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;
export const PYTHON_EXPLANATION_CONTROL = 'pythonExplanation';
export function pythonExplanationBoardRoom(teacherId, studentId) {
  return ENTITY_ID.test(teacherId || '') && ENTITY_ID.test(studentId || '')
    ? `board-python-${teacherId}-${studentId}` : '';
}
// The teacher-writable manifest carries commands. Live presence prevents a
// saved command from opening yesterday's explanation when a pupil returns.
export function livePythonExplanation(command, peers, teacherId, studentId) {
  if (!command?.id || typeof command.open !== 'boolean'
    || command.teacherId !== teacherId || command.studentId !== studentId) return null;
  if (!command.open) return command;
  return peers.some(peer => peer?.pythonExplanation?.id === command.id
    && peer.pythonExplanation.userId === teacherId && peer.pythonExplanation.open === true)
    ? command : null;
}
