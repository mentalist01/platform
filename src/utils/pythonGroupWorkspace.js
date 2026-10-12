const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;
export const PYTHON_GROUP_TASK_CONTROL='pythonGroupTask';
export const PYTHON_INDIVIDUAL_TASK_CONTROL='pythonIndividualTask';
export const pythonGroupCodeBase=id=>ID.test(id||'')?`py-group:${id}`:'';
export const pythonGroupBoardRoom=id=>ID.test(id||'')?`board-python-group-${id}`:'';
export function livePythonGroupTask(command,peers,teacherId,groupId) {
  if(!command?.id||command.teacherId!==teacherId||command.groupId!==groupId||typeof command.open!=='boolean')return null;
  if(command.open&&(!Number.isFinite(Number(command.taskNumber))||!Number.isInteger(command.questionIndex)||command.questionIndex<0))return null;
  return !command.open||peers.some(peer=>peer?.pythonGroupTask?.id===command.id&&peer.pythonGroupTask.userId===teacherId)?command:null;
}

export function pythonLessonTaskControl(groupId) {
  return groupId ? PYTHON_GROUP_TASK_CONTROL : PYTHON_INDIVIDUAL_TASK_CONTROL;
}

export function pythonLessonTeacherPresent(command, peers, teacherId, groupId='') {
  const key = pythonLessonTaskControl(groupId);
  return Boolean(command?.active !== false && command?.id && peers.some(peer => (
    peer?.[key]?.id === command.id && peer[key].userId === teacherId
  )));
}

export function livePythonLessonTask(command, peers, {teacherId, studentId, groupId=''}) {
  if (groupId) return livePythonGroupTask(command, peers, teacherId, groupId);
  if (!command?.id || command.teacherId !== teacherId || command.studentId !== studentId
    || command.groupId || typeof command.open !== 'boolean') return null;
  if (command.open && (!Number.isFinite(Number(command.taskNumber))
    || !Number.isInteger(command.questionIndex) || command.questionIndex < 0)) return null;
  return !command.open || pythonLessonTeacherPresent(command, peers, teacherId) ? command : null;
}
