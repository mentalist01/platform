import { useEffect, useState } from 'react';
import { Clipboard, Code2 } from 'lucide-react';
import { api } from '../services/api.js';
import './SavedGroupCode.css';

const stamp = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});

export default function SavedGroupCode({groupId,pageId,solutionId,dark}) {
  const [versions,setVersions] = useState([]);
  const [offset,setOffset] = useState(0);
  const [more,setMore] = useState(null);
  const [selected,setSelected] = useState('');
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [copyStatus,setCopyStatus] = useState('');
  useEffect(()=>{
    let current=true;
    api.getLearningGroupCodeWork(groupId,pageId,solutionId,offset).then(result=>{
      if(!current)return;
      setVersions(previous=>offset?[...previous,...result.versions]:result.versions);
      setMore(result.nextOffset);
    }).catch(()=>{
      if(current)setError('Не удалось загрузить сохранённый код.');
    }).finally(()=>{
      if(current)setBusy(false);
    });
    return()=>{current=false;};
  },[attempt,groupId,offset,pageId,solutionId]);
  if(!versions.length&&!error)return null;
  const options=versions.flatMap(version=>version.entries.map((entry,index)=>({
    ...entry,key:version.id+':'+index,
    label:version.date&&Number.isFinite(Date.parse(version.date))?stamp.format(new Date(version.date))+(version.entries.length>1?' · '+entry.name:''):'Ранее сохранённый · '+entry.name,
  })));
  const active=options.find(entry=>entry.key===selected)||options[0];
  const load=change=>{setBusy(true);setError('');change();};
  const copy=async()=>{
    try{await navigator.clipboard.writeText(active.text);setCopyStatus('Скопировано');}
    catch{setCopyStatus('Не удалось скопировать');}
  };
  return <details className="saved-group-code" data-theme={dark?'dark':'light'}>
    <summary><Code2 size={15} aria-hidden="true"/>Сохранённый код</summary>
    <div className="saved-group-code__panel">
      {error&&<p role="alert">{error} <button type="button" onClick={()=>load(()=>setAttempt(value=>value+1))}>Повторить</button></p>}
      {active&&<>
        <div className="saved-group-code__tools">
          {options.length>1?<select aria-label="Версия кода" value={active.key} onChange={event=>{setSelected(event.target.value);setCopyStatus('');}}>
            {options.map(entry=><option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>:<span>{active.label}</span>}
          <button type="button" onClick={()=>void copy()}><Clipboard size={14}/>{copyStatus||'Скопировать'}</button>
        </div>
        <pre tabIndex={0} aria-label="Сохранённый текст кода">{active.text||'Пустой код'}</pre>
      </>}
      {more!==null&&<button type="button" disabled={busy} onClick={()=>load(()=>setOffset(more))}>{busy?'Загружаем…':'Более ранние решения'}</button>}
    </div>
  </details>;
}
