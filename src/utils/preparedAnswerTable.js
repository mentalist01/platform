export const MAX_PREPARED_ANSWER_CELLS = 50;
export const MAX_PREPARED_ANSWER_COLUMNS = 10;

export function normalizePreparedAnswerTable(value) {
  if (!value || typeof value !== 'object') return null;
  const {rows, columns} = value;
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1
    || columns > MAX_PREPARED_ANSWER_COLUMNS || rows * columns > MAX_PREPARED_ANSWER_CELLS) return null;
  return {rows, columns};
}

export function preparedAnswerLayout(task) {
  const count = task?.answers?.length || task?.answerCount || 1;
  const table = normalizePreparedAnswerTable(task?.answerTable);
  if (table && table.rows * table.columns === count) return {...table, explicit: true};
  const columns = Math.min(2, count);
  return {rows: Math.ceil(count / columns), columns, explicit: false};
}

// Old 20-cell answers are stored by column. Explicit tables are always stored
// by row, regardless of their dimensions, including tables with 20 cells.
export function preparedAnswerIndices(task) {
  const count = task?.answers?.length || task?.answerCount || 1;
  if (count === 20 && task.answerMode !== 'independent' && !preparedAnswerLayout(task).explicit) {
    return Array.from({length: 10}, (_, row) => [row, row + 10]).flat();
  }
  return Array.from({length: count}, (_, index) => index);
}

export function reshapePreparedAnswers(task, rows, columns) {
  const table = normalizePreparedAnswerTable({rows, columns});
  if (!table) throw Error('Укажите целые размеры таблицы: до 10 столбцов и 50 ячеек всего.');
  const ordered = preparedAnswerIndices(task).map(index => String(task.answers[index] ?? ''));
  const count = rows * columns;
  if (ordered.slice(count).some(value => value.trim())) {
    throw Error('Новая таблица не вмещает заполненные ответы. Увеличьте её размер или сначала очистите лишние ячейки.');
  }
  return {...task, answerTable: table, answerCountOverride: count,
    answers: Array.from({length: count}, (_, index) => ordered[index] ?? ''),
    format: task.answerMode === 'independent' || ['manual', 'number'].includes(task.format)
      ? task.format : count > 1 ? 'fields' : 'exact'};
}

export function preparedAnswerTableChanged(before, after) {
  return JSON.stringify(before.answerTable || null) !== JSON.stringify(after.answerTable || null);
}
