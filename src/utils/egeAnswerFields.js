import {normalizePreparedAnswerGroups} from './preparedAnswerGroups.js';
import {getMockTaskRuleNumber} from './mockTaskIdentity.js';
import {normalizePreparedAnswerTable} from './preparedAnswerTable.js';

// The question bank combines game theory, while mocks split it into slots.
export const getAnswerCountForTask = taskNumber => {
  const number = Number(taskNumber);
  if (number === 19 || number === 27) return 4;
  if (number === 25) return 20;
  if ([17, 18, 26].includes(number)) return 2;
  return 1;
};

export const getMockAnswerCountForTask = (taskNumber, question) => {
  const number = getMockTaskRuleNumber(taskNumber, question);
  const table = normalizePreparedAnswerTable(question?.answerTable);
  const override = table ? table.rows * table.columns : Number(question?.answerCountOverride);
  // №25 must not reveal the number of matching results through its input count.
  // Keep twelve pairs even when an imported key contains only five filled rows.
  if (number === 25) return Number.isInteger(override) && override > 24 && override <= 50
    ? Math.ceil(override / 2) * 2 : 24;
  if (Number.isInteger(override) && override >= 1 && override <= 50) return override;
  if (number === 20) return 2;
  if (number === 19) return 1;
  return getAnswerCountForTask(number);
};

export const isMockAnswerTableTask = (taskNumber, question) => getMockTaskRuleNumber(taskNumber, question) === 25;

export function preparedAnswerTask(task, taskNumber) {
  const raw = (Array.isArray(task.answers) ? task.answers : [task.answer ?? '']).map(value => String(value ?? ''));
  const table = normalizePreparedAnswerTable(task.answerTable);
  const groups = normalizePreparedAnswerGroups(task.answerGroups);
  const override = groups ? groups.reduce((sum, row) => sum + row.counts.reduce((a,b) => a+b,0),0) : table ? table.rows * table.columns : Number(task.answerCountOverride);
  const count = Number.isInteger(override) && override >= 1 && override <= 50
    ? override : Math.max(getAnswerCountForTask(taskNumber), Math.min(50, raw.length));
  const independent = task.answerMode === 'independent' || Boolean(groups);
  const split = !independent && raw.length === 1 && count > 1 ? raw[0].trim().split(/\s+/u) : raw;
  const values = split.length === count ? split : raw;
  const format = independent && task.format === 'fields' ? 'exact' : !independent && count > 1 && !['manual', 'number'].includes(task.format) ? 'fields' : task.format || 'exact';
  return {...task, ...(groups?{answerMode:'independent',answerGroups:groups,answerCountOverride:count}:{}), format, answers: Array.from({length: count}, (_, index) => values[index] ?? '')};
}

// Only unambiguous legacy pairs/vectors are migrated. An incomplete or unusual
// answer is left untouched for the teacher rather than guessed or discarded.
export function splitLegacyPreparedAnswer(task, taskNumber) {
  if (task.answerGroups || task.answerMode === 'independent' || task.format === 'manual' || Number(task.answerCountOverride) === 1 || task.answers?.length !== 1) return null;
  const table = normalizePreparedAnswerTable(task.answerTable);
  const override = table ? table.rows * table.columns : Number(task.answerCountOverride);
  const count = Number.isInteger(override) && override >= 1 && override <= 50 ? override : getAnswerCountForTask(taskNumber), values = String(task.answers[0]).trim().split(/\s+/u);
  return count > 1 && values.length === count ? {...task, format: 'fields', answers: values} : null;
}
