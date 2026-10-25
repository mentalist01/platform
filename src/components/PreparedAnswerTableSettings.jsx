import {useState} from 'react';
import {preparedAnswerLayout, reshapePreparedAnswers} from '../utils/preparedAnswerTable.js';

export default function PreparedAnswerTableSettings({task, busy, onChange, onError}) {
  const layout = preparedAnswerLayout(task);
  const [rows, setRows] = useState(String(layout.rows));
  const [columns, setColumns] = useState(String(layout.columns));
  const unchanged = Number(rows) === layout.rows && Number(columns) === layout.columns
    && Number(rows) * Number(columns) === task.answers.length;
  const apply = () => {
    try {onChange(reshapePreparedAnswers(task, Number(rows), Number(columns))); onError('');}
    catch (error) {onError(error.message);}
  };
  return <div className="prepared-table-settings" role="group" aria-label="Размер таблицы ответа">
    <div><label>Строки<input aria-label="Строки ответа" type="number" min="1" max="50" step="1" value={rows} disabled={busy} onChange={event => {setRows(event.target.value); onError('');}} onKeyDown={event => {if(event.key==='Enter'){event.preventDefault();apply();}}}/></label>
      <span aria-hidden="true">×</span>
      <label>Столбцы<input aria-label="Столбцы ответа" type="number" min="1" max="10" step="1" value={columns} disabled={busy} onChange={event => {setColumns(event.target.value); onError('');}} onKeyDown={event => {if(event.key==='Enter'){event.preventDefault();apply();}}}/></label>
      <button type="button" disabled={busy || unchanged} onClick={apply}>Применить размер</button></div>
    <small>До 50 ячеек. Вставка заполняет таблицу слева направо, по строкам.</small>
  </div>;
}
