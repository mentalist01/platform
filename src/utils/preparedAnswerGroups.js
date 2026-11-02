// Public structure only: the private answer key stays in task.answers.
export function normalizePreparedAnswerGroups(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  let total = 0;
  for (const [index, row] of value.entries()) {
    if (!row || row.number !== 19 + index || !Array.isArray(row.counts) || row.counts.length > 6
      || row.counts.some(count => !Number.isInteger(count) || count < 1 || count > 10)) return null;
    total += row.counts.reduce((sum, count) => sum + count, 0);
  }
  return total >= 1 && total <= 50 ? value.map(row => ({number: row.number, counts: [...row.counts]})) : null;
}

export function preparedAnswerGroups(task) {
  const config = normalizePreparedAnswerGroups(task?.answerGroups);
  let offset = 0;
  if (config) return config.flatMap(row => row.counts.map((count, part) => {
    const group = {key: `${row.number}:${part}`, number: row.number, part, count,
      label: `№${row.number}${row.counts.length > 1 ? ` · ${'абвгде'[part]}` : ''}`,
      indices: Array.from({length: count}, (_, index) => offset + index)};
    offset += count;
    return group;
  }));
  return Array.from({length: task?.answers?.length || task?.answerCount || 1}, (_, index) =>
    ({key: String(index), label: `Вопрос ${index + 1}`, indices: [index], count: 1}));
}

export function remapPreparedGroupAnswers(before, after, values) {
  const count = after.answers?.length || preparedAnswerGroups(after).flatMap(group => group.indices).length;
  if (!before.answerGroups || !after.answerGroups) {
    if (values.slice(count).some(value => String(value ?? '').trim())) throw Error('Новые поля не вмещают заполненные ответы. Сначала очистите лишние ответы.');
    return Array.from({length: count}, (_, index) => values[index] || '');
  }
  const old = preparedAnswerGroups(before), next = preparedAnswerGroups(after), used = new Set();
  const result = Array(count).fill('');
  for (const group of next) {
    const previous = old.find(row => row.key === group.key);
    group.indices.forEach((index, position) => {
      const from = previous?.indices[position];
      if (from !== undefined) {result[index] = values[from] || ''; used.add(from);}
    });
  }
  if (values.some((value, index) => !used.has(index) && String(value ?? '').trim())) {
    throw Error('В убираемом подпункте есть ответы. Сначала очистите их: остальные ответы сохранятся на своих местах.');
  }
  return result;
}

export function configurePreparedGameAnswers(task, value) {
  const answerGroups = normalizePreparedAnswerGroups(value);
  if (!answerGroups) throw Error('Выберите до 6 подпунктов на номер, до 10 чисел в ответе и до 50 полей всего.');
  const count = answerGroups.reduce((sum, row) => sum + row.counts.reduce((a, b) => a + b, 0), 0);
  const next = {...task, answerGroups, answerMode: 'independent', answerTable: undefined,
    answerCountOverride: count, answers: Array(count).fill(''), format: task.format === 'fields' ? 'exact' : task.format || 'exact'};
  next.answers = remapPreparedGroupAnswers(task, next, task.answers || []);
  return next;
}

export function enablePreparedGameAnswers(task) {
  if (normalizePreparedAnswerGroups(task.answerGroups)) return configurePreparedGameAnswers(task,task.answerGroups);
  const counts = [Math.max(1, Math.min(10, (task.answers?.length || 4) - 3))];
  let remaining = Math.max(0, (task.answers?.length || 0) - 3 - counts[0]);
  while (remaining > 0) {counts.push(Math.min(10, remaining)); remaining -= counts.at(-1);}
  return configurePreparedGameAnswers(task, [{number: 19, counts: [1]}, {number: 20, counts: [2]}, {number: 21, counts}]);
}

export function preparedGroupResultsAfterEdit(task, previous, values, results = []) {
  const next = Array.from({length: values.length}, (_, index) => results[index] || null);
  for (const group of preparedAnswerGroups(task)) {
    if (group.indices.some(index => previous[index] !== values[index])) group.indices.forEach(index => {next[index] = null;});
  }
  return next;
}

// Game answers are integers; commas/semicolons copied from an answer key delimit cells.
export const splitPreparedGamePaste = text => String(text ?? '').trim().split(/[\s,;]+/u).filter(Boolean);
