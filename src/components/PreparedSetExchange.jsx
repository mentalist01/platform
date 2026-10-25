import {useEffect,useState} from 'react';
import {ArrowLeft,Search,Share2,Copy,Check} from 'lucide-react';
import {preparedAssetUrl,preparedRequest} from '../services/preparedLessonTasks.js';

export default function PreparedSetExchange({ownSet,onBack,onCopied,onShared}){
  const [catalog,setCatalog]=useState(null),[sharing,setSharing]=useState(null),[recipients,setRecipients]=useState([]);
  const [query,setQuery]=useState(''),[preview,setPreview]=useState(null),[taskIndex,setTaskIndex]=useState(0);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[opening,setOpening]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    Promise.all([preparedRequest('/api/lesson-task-set-exchange',undefined,'GET',controller.signal),ownSet?preparedRequest(`/api/lesson-task-sets/${ownSet.id}/sharing`,undefined,'GET',controller.signal):null])
      .then(([data,settings])=>{setCatalog(data);setSharing(settings);setRecipients(settings?.recipientIds||[]);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[ownSet]);
  const publish=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{await preparedRequest(`/api/lesson-task-sets/${ownSet.id}/sharing`,{version:sharing.version,recipientIds:recipients},'PUT');onShared(recipients.length?`Доступ к набору «${ownSet.name}» сохранён`:'Доступ к набору закрыт');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const openPreview=async id=>{
    if(busy||opening)return;setOpening(id);setError('');
    try{setPreview(await preparedRequest(`/api/lesson-task-exchange/${id}`));setTaskIndex(0);}catch(e){setError(e.message);}
    finally{setOpening('');}
  };
  const copy=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{const result=await preparedRequest(`/api/lesson-task-exchange/${preview.set.id}/copy`,{version:preview.version});await onCopied(result);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const term=query.trim().toLocaleLowerCase('ru'),visible=catalog?.sets.filter(set=>`${set.name} ${set.authorName} №${set.taskNumber} часть ${set.partNumber}`.toLocaleLowerCase('ru').includes(term))||[];
  const task=preview?.set.tasks[taskIndex];
  return <div className="prepared-exchange">
    <div className="prepared-exchange-heading"><button type="button" disabled={busy||Boolean(opening)} onClick={()=>preview?setPreview(null):onBack()}><ArrowLeft size={16}/>{preview?'Доступные наборы':'Мои наборы'}</button><strong>{ownSet?`Поделиться · ${ownSet.name}`:preview?preview.set.name:'Доступные мне'}</strong></div>
    {error&&<p className="prepared-error" role="alert">{error}</p>}
    {!catalog&&!error&&<p role="status">Загружаем…</p>}
    {ownSet&&catalog&&<>
      <p className="prepared-muted">Выбранные преподаватели увидят сохранённую версию набора и смогут добавить себе копию с условиями, ответами и файлами.</p>
      <div className="prepared-share-recipients">{catalog.teachers.map(person=><label key={person.id}><input type="checkbox" checked={recipients.includes(person.id)} disabled={busy} onChange={e=>setRecipients(old=>e.target.checked?[...old,person.id]:old.filter(id=>id!==person.id))}/><span>{person.name}</span></label>)}{!catalog.teachers.length&&<p>Других преподавателей пока нет.</p>}</div>
      <p className="prepared-muted">Изменения в твоём редакторе не публикуются автоматически. Чтобы передать новую версию, снова нажми «Сохранить доступ».</p>
      <p className="prepared-muted">Снятие отметки закрывает просмотр. Копии, которые преподаватель уже добавил себе, останутся у него.</p>
      {sharing?.publishedAt&&<small className="prepared-muted">Опубликована версия {sharing.publishedSetVersion} · {new Date(sharing.publishedAt).toLocaleString('ru-RU')}</small>}
      {ownSet.draft&&<p className="prepared-error">Это черновик. Сначала заполни условия и ответы и сохрани набор. Пока можно только закрыть доступ всем.</p>}
      <div className="prepared-exchange-footer"><button type="button" disabled={busy||!sharing||ownSet.draft&&recipients.length>0} className="prepared-primary" onClick={()=>void publish()}><Share2 size={16}/>{busy?'Сохраняем…':'Сохранить доступ'}</button>{recipients.length>0&&<button type="button" disabled={busy} onClick={()=>setRecipients([])}>Снять все отметки</button>}</div>
    </>}
    {!ownSet&&catalog&&!preview&&<>
      <label className="prepared-set-search"><Search size={18}/><input aria-label="Поиск доступных наборов" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название, автор или номер ЕГЭ"/></label>
      <div className="prepared-set-list prepared-exchange-list">{visible.map(set=><article key={set.id}><div className="prepared-set-description"><strong>{set.name}</strong><small>{set.authorName} · ЕГЭ №{set.taskNumber} · часть {set.partNumber} · задач: {set.taskCount}</small>{set.copyId&&<small><Check size={12}/> Копия уже в твоих наборах</small>}</div><button type="button" disabled={busy||Boolean(opening)} onClick={()=>void openPreview(set.id)}>{opening===set.id?'Открываем…':'Посмотреть'}</button></article>)}</div>
      {!visible.length&&<p className="prepared-muted">{catalog.sets.length?'Наборы не найдены.':'Когда другой преподаватель откроет тебе доступ, его наборы появятся здесь.'}</p>}
    </>}
    {preview&&<>
      <p className="prepared-muted">Автор: {preview.authorName}. Копия будет в «Моих наборах»; её можно менять независимо от оригинала.</p>
      <div className="prepared-exchange-preview"><nav aria-label="Задачи общего набора">{preview.set.tasks.map((item,index)=><button type="button" key={item.id} aria-pressed={taskIndex===index} onClick={()=>setTaskIndex(index)}>{item.title||`Задача ${index+1}`}</button>)}</nav><div className="prepared-exchange-condition"><div className="prepared-exchange-reference"><strong>Правильные ответы</strong><span>{task.answers.join(' · ')||'Проверка преподавателем'}</span>{task.difficult&&<small>Сложная задача</small>}{task.answerMode==='independent'&&<small>Вопросы проверяются отдельно</small>}</div>{task.imageFiles.map(file=><img key={file.id} src={preparedAssetUrl(file.url)} alt={`Условие ${task.title||taskIndex+1}`}/>)}{task.attachments.map(file=><a key={file.id} href={preparedAssetUrl(file.url)} download={file.name}>{file.name}{file.runtime!==false?` · Python: ${file.runtimeName||file.name}`:''}</a>)}</div></div>
      <div className="prepared-exchange-footer"><button type="button" className="prepared-primary" disabled={busy} onClick={()=>void copy()}><Copy size={16}/>{busy?'Копируем…':'Добавить себе копию'}</button></div>
    </>}
  </div>;
}
