import {useState} from 'react';
import {Trash2,Undo2} from 'lucide-react';

export default function PreparedQueueSummary({run,busy,onRemove,onRestore}){
  const [confirmId,setConfirmId]=useState('');
  const sources=run.sources??[{id:run.setId,name:run.name,total:run.total}];
  const source=sources.find(row=>row.id===confirmId);
  return <section className="prepared-queue-summary" aria-label="Наборы на этой странице">
    <strong>Наборов на этой странице: {sources.length}</strong>
    {sources.length>0&&<div className="prepared-queue-rows">{sources.map((row,index)=><div className="prepared-queue-row" key={row.id}>
      <b>{index+1}</b><span><strong>{row.name}</strong><small>Задач: {row.total}</small></span>
      {onRemove&&<button type="button" disabled={busy} aria-label={`Убрать со страницы: ${row.name}`} onClick={()=>setConfirmId(row.id)}><Trash2 size={15}/>Убрать</button>}
    </div>)}</div>}
    {source&&<div className="prepared-queue-confirm" role="group" aria-label="Подтверждение удаления набора со страницы">
      <strong>Убрать «{source.name}» со страницы?</strong><p>Карточки и связанные вкладки кода скроются. Набор останется в библиотеке, записи на доске — на месте. Удаление можно отменить здесь.</p>
      <button type="button" disabled={busy} onClick={()=>setConfirmId('')}>Оставить</button>
      <button type="button" disabled={busy} onClick={()=>void onRemove(source.id).then(()=>setConfirmId(''))}>Убрать со страницы</button>
    </div>}
    {(run.removedSets||[]).length>0&&onRestore&&<div className="prepared-queue-removed"><strong>Убрано со страницы</strong>{run.removedSets.map(row=><div className="prepared-queue-row" key={row.id}><span>{row.name}</span><button type="button" disabled={busy} aria-label={`Вернуть на страницу: ${row.name}`} onClick={()=>void onRestore(row.id)}><Undo2 size={14}/>Вернуть</button></div>)}</div>}
    <p>{sources.length?'«Добавить следом» продолжит очередь.':'Выберите нужный набор и нажмите «На эту страницу».'}</p>
  </section>;
}
