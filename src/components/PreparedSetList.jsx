import {useRef, useState} from 'react';
import {Search, X, Plus, GripVertical, ArrowUp, ArrowDown, Share2} from 'lucide-react';
import {filterPreparedSets, movePreparedSet} from '../utils/preparedSetLibrary.js';

const taskPlural = new Intl.PluralRules('ru');
const taskNoun = count => ({one:'задание',few:'задания',many:'заданий',other:'задания'}[taskPlural.select(count)]);

export default function PreparedSetList({sets, query, setQuery, loading, busy, onCreate, onEdit, onChoose, onReorder, onShare, activeRun}) {
  const [dragId, setDragId] = useState(''), [drop, setDrop] = useState(null);
  const list = useRef(null), pointer = useRef(null);
  const visible = filterPreparedSets(sets, query);
  const move = (id, target, after) => {
    const next = movePreparedSet(sets, id, target, after);
    if (next !== sets && !busy) void onReorder(next);
    setDragId('');setDrop(null);
  };
  const nudge = (id, direction) => {
    const index = sets.findIndex(set => set.id === id), target = sets[index + direction];
    if (target) move(id, target.id, direction > 0);
  };
  const pointerMove = e => {
    const state = pointer.current;
    if (!state || Math.hypot(e.clientX-state.x,e.clientY-state.y)<5 && !state.active) return;
    state.active=true;setDragId(state.id);
    const row=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-set-id]');
    if(row && list.current?.contains(row) && row.dataset.setId!==state.id){const box=row.getBoundingClientRect();state.drop={id:row.dataset.setId,after:e.clientY>box.top+box.height/2};}
    else state.drop=null;
    setDrop(state.drop);
    const box=list.current.getBoundingClientRect();
    if(e.clientY<box.top+25)list.current.scrollTop-=15;
    if(e.clientY>box.bottom-25)list.current.scrollTop+=15;
  };
  const finishPointer = e => {
    const state=pointer.current;pointer.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    if(state?.active&&state.drop)move(state.id,state.drop.id,state.drop.after);
    else {setDragId('');setDrop(null);}
  };
  return <div className="prepared-library-list-view">
    {activeRun&&<div className="prepared-queue-summary"><strong>Наборов на этой странице: {activeRun.sources?.length||1}</strong><div>{(activeRun.sources||[{id:activeRun.setId,name:activeRun.name,total:activeRun.total}]).map((source,index)=><span key={source.id}><b>{index+1}</b>{source.name}<small>{source.total} {taskNoun(source.total)}</small></span>)}</div><p>«Добавить следом» продолжит очередь. Уже добавленные задачи и решения останутся на доске.</p></div>}
    <div className="prepared-library-list-tools">
      <label className="prepared-set-search"><Search size={18}/><input aria-label="Поиск по наборам" placeholder="Найти набор: название, № ЕГЭ или часть" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button type="button" aria-label="Очистить поиск наборов" onClick={() => setQuery('')}><X size={15}/></button>}</label>
      <button type="button" className="prepared-primary" disabled={busy || loading} onClick={onCreate}><Plus size={17}/>Создать набор</button>
    </div>
    <div className="prepared-list-caption"><span>{query.trim() ? `Найдено ${visible.length} из ${sets.length}` : `Наборов: ${sets.length}`}</span><span role="status">{busy ? 'Сохраняем порядок…' : 'Перетаскивайте за ⋮⋮, чтобы изменить порядок'}</span></div>
    <div className="prepared-set-list" aria-label="Наборы заданий" ref={list}>
      {loading && <p className="prepared-muted" role="status">Загружаем наборы…</p>}
      {visible.map(set => <article key={set.id} data-set-id={set.id} className={`${dragId === set.id ? 'is-dragging ' : ''}${drop?.id === set.id ? drop.after ? 'drop-after' : 'drop-before' : ''}`}>
        <div className="prepared-set-order-controls"><button type="button" className="prepared-set-grip" disabled={busy} aria-label={`Переместить набор ${set.name || 'Без названия'}`} title="Перетащите или используйте стрелки вверх и вниз" onKeyDown={e => {if (['ArrowUp','ArrowDown'].includes(e.key)) {e.preventDefault();nudge(set.id, e.key === 'ArrowUp' ? -1 : 1);}}} onPointerDown={e=>{if(busy||e.button!==0)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);pointer.current={id:set.id,x:e.clientX,y:e.clientY,active:false,drop:null};}} onPointerMove={pointerMove} onPointerUp={finishPointer} onPointerCancel={()=>{pointer.current=null;setDragId('');setDrop(null);}}><GripVertical size={19}/></button><div><button type="button" aria-label={`Поднять набор ${set.name}`} disabled={busy || sets[0]?.id === set.id} onClick={() => nudge(set.id, -1)}><ArrowUp size={12}/></button><button type="button" aria-label={`Опустить набор ${set.name}`} disabled={busy || sets.at(-1)?.id === set.id} onClick={() => nudge(set.id, 1)}><ArrowDown size={12}/></button></div></div>
        <div className="prepared-set-description"><strong>{set.name || 'Без названия'}{set.draft && <em>Черновик</em>}</strong><small>ЕГЭ №{set.taskNumber} · часть {set.partNumber} · {set.tasks.length} {taskNoun(set.tasks.length)}</small></div>
        <div className="prepared-set-actions">{onShare&&<button type="button" disabled={busy} onClick={()=>onShare(set)}><Share2 size={14}/>Поделиться</button>}<button type="button" disabled={busy} onClick={() => onEdit(set)}>Изменить</button>{onChoose && <><button type="button" className="prepared-primary" disabled={busy || set.draft || Boolean(activeRun&&(activeRun.sources||[{id:activeRun.setId}]).some(source=>source.id===set.id))} onClick={() => onChoose(set, false)}>{activeRun?(activeRun.sources||[{id:activeRun.setId}]).some(source=>source.id===set.id)?'В очереди':'Добавить следом':'На эту страницу'}</button><button type="button" disabled={busy || set.draft} onClick={() => onChoose(set, true)}>На новую страницу</button></>}</div>
      </article>)}
      {!loading && !visible.length && <div className="prepared-set-empty"><Search size={25}/><strong>{sets.length ? 'Наборы не найдены' : 'Наборов пока нет'}</strong><p>{sets.length ? 'Попробуйте другое название или номер ЕГЭ.' : 'Создайте первый набор — он сохранится для следующих уроков.'}</p>{query && <button type="button" onClick={() => setQuery('')}>Показать все наборы</button>}</div>}
    </div>
  </div>;
}
