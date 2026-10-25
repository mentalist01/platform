import {preparedSetParts} from './preparedSetParts.js';
const normalized = value => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function filterPreparedSets(sets, query) {
  let remaining = normalized(query);
  const part = remaining.match(/(?:^|\s)(?:часть|ч)\s*(\d+)(?=\s|$)/);
  const number = remaining.match(/(?:^|\s)(?:егэ|задание|номер)\s*(\d+)(?=\s|$)/);
  if (part) remaining = remaining.replace(part[0], ' ');
  if (number) remaining = remaining.replace(number[0], ' ');
  const words = remaining.split(/\s+/).filter(Boolean);
  return sets.filter(set => {
    const parts=preparedSetParts(set).map(part=>part.partNumber);
    if (part && !(parts.length?parts:[Number(set.partNumber)]).includes(Number(part[1])) || number && Number(number[1]) !== Number(set.taskNumber)) return false;
    const text = normalized(`${set.name} ЕГЭ ${set.taskNumber} задание ${set.taskNumber} часть ${set.partNumber} ${set.draft ? 'черновик' : ''}`);
    return words.every(word => text.includes(word));
  });
}

export function movePreparedSet(sets, sourceId, targetId, after = false) {
  if (sourceId === targetId || !sets.some(set => set.id === sourceId) || !sets.some(set => set.id === targetId)) return sets;
  const result = sets.filter(set => set.id !== sourceId);
  result.splice(result.findIndex(set => set.id === targetId) + Number(after), 0, sets.find(set => set.id === sourceId));
  return result.every((set, index) => set.id === sets[index].id) ? sets : result;
}

// Saving an existing set never changes the teacher's chosen list order.
export function upsertPreparedSet(sets, value) {
  return sets.some(set => set.id === value.id) ? sets.map(set => set.id === value.id ? value : set) : [...sets, value];
}

export function nextPreparedTaskTitle(previous, index) {
  const title = String(previous?.title ?? '').trim();
  if (/^\d+$/.test(title)) {
    const next = String(BigInt(title) + 1n).padStart(title.length, '0');
    if (next.length <= 120) return next;
  }
  return String(index + 1);
}

export function preparedTaskIssues(task,taskNumber) {
  const images = !task?.images?.length;
  const {missing,invalidNumber} = preparedExpectedAnswerIssues(task,taskNumber);
  return {images, missing, invalidNumber, valid: !images && !missing.length && !invalidNumber};
}
import {preparedExpectedAnswerIssues} from './preparedAnswerValidation.js';
