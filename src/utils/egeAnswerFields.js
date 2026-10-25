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
  if (number === 20) return 2;
  if (number === 19) return 1;
  return getAnswerCountForTask(number);
};

export function preparedAnswerTask(task, taskNumber) {
  const raw = (Array.isArray(task.answers) ? task.answers : [task.answer ?? '']).map(value => String(value ?? ''));
  const table = normalizePreparedAnswerTable(task.answerTable);
  const override = table ? table.rows * table.columns : Number(task.answerCountOverride);
  const count = Number.isInteger(override) && override >= 1 && override <= 50
    ? override : Math.max(getAnswerCountForTask(taskNumber), Math.min(50, raw.length));
  const independent = task.answerMode === 'independent';
  const split = !independent && raw.length === 1 && count > 1 ? raw[0].trim().split(/\s+/u) : raw;
  const values = split.length === count ? split : raw;
  const format = independent && task.format === 'fields' ? 'exact' : !independent && count > 1 && !['manual', 'number'].includes(task.format) ? 'fields' : task.format || 'exact';
  return {...task, format, answers: Array.from({length: count}, (_, index) => values[index] ?? '')};
}

// Only unambiguous legacy pairs/vectors are migrated. An incomplete or unusual
// answer is left untouched for the teacher rather than guessed or discarded.
export function splitLegacyPreparedAnswer(task, taskNumber) {
  if (task.answerMode === 'independent' || task.format === 'manual' || Number(task.answerCountOverride) === 1 || task.answers?.length !== 1) return null;
  const table = normalizePreparedAnswerTable(task.answerTable);
  const override = table ? table.rows * table.columns : Number(task.answerCountOverride);
  const count = Number.isInteger(override) && override >= 1 && override <= 50 ? override : getAnswerCountForTask(taskNumber), values = String(task.answers[0]).trim().split(/\s+/u);
  return count > 1 && values.length === count ? {...task, format: 'fields', answers: values} : null;
}
