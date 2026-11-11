import {buildPythonSubsectionModel, getPythonTaskEntry} from './pythonSubsections.js';

export const PYTHON_PRESENCE = 'pythonLessonPresence';
export const PYTHON_SUMMON = 'pythonLessonSummon';
const text = value => typeof value === 'string' ? value.slice(0, 200) : '';
const VIEWS = {python:'Изучение Python', homework:'Домашка', schedule:'Расписание', board:'Доска', collab:'Совместный код', call:'Звонок', notes:'Конспекты', review:'Задания', groups:'Группы и записи', progress:'Успеваемость'};

export function pythonPresenceLocation({task, questionIndex, testsDb, levelId, groupMode=false}) {
  if (groupMode) return {view:'python', groupMode:true};
  if (!task) return {view:'python', topicTitle:'Выбирает тему'};
  if (!Number.isInteger(questionIndex)) return {view:'python', topicTitle:task.title};
  const model = buildPythonSubsectionModel(getPythonTaskEntry(testsDb, task.number), levelId);
  const index = Number.isInteger(questionIndex) ? questionIndex : 0;
  const question = model.questions[index];
  const subsection = model.subsections.find(section => section.questionIndexes.includes(index));
  return {view:'python', taskNumber:task.number, topicTitle:task.title,
    ...(question ? {questionIndex:index, questionId:String(question.id ?? index), questionTitle:question.title || `Задача ${index + 1}`,
      questionNumber:(subsection?.questionIndexes.indexOf(index) ?? index) + 1,
      subsectionTitle:subsection?.isDefault ? '' : subsection?.title || ''} : {})};
}

export function normalizePythonLocation(value, view='python') {
  const location = {view:text(view), groupMode:value?.groupMode === true};
  if (view !== 'python' || location.groupMode) return location;
  location.topicTitle = text(value?.topicTitle) || 'Выбирает тему';
  const number = value?.taskNumber;
  if (Number.isSafeInteger(number) && number > 0 && Number.isInteger(value?.questionIndex) && value.questionIndex >= 0) {
    Object.assign(location, {taskNumber:number, questionIndex:value.questionIndex, questionId:text(value.questionId),
      questionTitle:text(value.questionTitle), subsectionTitle:text(value.subsectionTitle), questionNumber:Math.max(1, Number(value.questionNumber) || value.questionIndex + 1)});
  }
  return location;
}

export function pythonLocationLabel(location, role='') {
  if (!location) return 'Местоположение пока недоступно';
  if (location.view !== 'python') return location.view === 'schedule' && role === 'student' ? 'Домашка' : VIEWS[location.view] || 'В другом разделе платформы';
  if (location.groupMode) return 'На групповом уроке Python';
  return [location.topicTitle || 'Выбирает тему', location.subsectionTitle,
    Number.isInteger(location.questionIndex) ? `№${location.questionNumber || location.questionIndex + 1} · ${location.questionTitle}` : ''].filter(Boolean).join(' → ');
}

// Older pages still join the editor, but do not publish dashboard location.
// Another window of the same teacher must not count as a pupil connection.
export function hasPythonEditorPeer(states, {role, clientId}) {
  const counterpart = role === 'teacher' ? 'student' : role === 'student' ? 'teacher' : '';
  return Boolean(counterpart) && Array.from(states).some(([id, state]) => id !== clientId && state?.user?.role === counterpart);
}

export function pythonPresenceDisplay({peer, connected, editorPeerPresent=false, teacher=false}) {
  const refreshNeeded = !peer && editorPeerPresent;
  return {online:Boolean(peer) || editorPeerPresent, refreshNeeded,
    label:peer ? pythonLocationLabel(peer.location,peer.role) : refreshNeeded
      ? teacher ? 'Попросите ученика обновить страницу' : 'Попросите учителя обновить страницу'
      : connected ? pythonLocationLabel(null) : 'Подключаемся…'};
}

export function pythonPeerTaskPosition(peer, taskNumber, model) {
  const location=peer?.location;
  if (location?.view !== 'python' || location.groupMode || location.taskNumber !== taskNumber) return null;
  const questionIndex=location.questionId
    ? model.questions.findIndex((question,index)=>String(question.id ?? index)===location.questionId)
    : location.questionIndex;
  if (!Number.isInteger(questionIndex) || !model.questions[questionIndex]) return null;
  return {questionIndex,subsectionId:model.subsections.find(section=>section.questionIndexes.includes(questionIndex))?.id};
}

export function selectPythonPeer(states, {userId, role}) {
  return Array.from(states, ([clientId, state]) => {
    const value=state?.[PYTHON_PRESENCE];
    if (!value || value.userId !== userId || value.role !== role || !value.location) return null;
    return {clientId,userId,role,name:text(value.name),location:normalizePythonLocation(value.location,value.location.view),
      focused:value.focused === true,visible:value.visible === true,activityAt:Number(value.activityAt) || 0,appliedId:text(value.appliedId)};
  }).filter(Boolean)
    .sort((a,b) => Number(b.focused) - Number(a.focused) || Number(b.visible) - Number(a.visible) || (b.activityAt || 0) - (a.activityAt || 0))[0] || null;
}

export function pythonSummonTarget(command, {teacherId, studentId, clientId, peers}) {
  if (!command?.id || command.teacherId !== teacherId || command.studentId !== studentId || command.clientId !== clientId) return null;
  if (!Array.from(peers.values()).some(state => state?.[PYTHON_PRESENCE]?.userId === teacherId
    && state[PYTHON_PRESENCE].role === 'teacher' && state[PYTHON_PRESENCE].summonId === command.id)) return null;
  const target = normalizePythonLocation(command.location);
  return target.taskNumber && !target.groupMode ? target : null;
}

export function samePythonTask(a, b) {
  return a?.view === 'python' && !a.groupMode && a.taskNumber === b?.taskNumber
    && (a.questionId && b.questionId ? a.questionId === b.questionId : a.questionIndex === b?.questionIndex);
}
