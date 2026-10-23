import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, FileSpreadsheet, Folder, Layers, X } from 'lucide-react';
import { api } from '../services/api';
import './WorkbookParts.css';

function PartDialog({ title, onClose, children, busy = false }) {
  const titleId = useId(), panel = useRef(null), close = useRef(onClose), busyRef = useRef(busy);
  useEffect(()=>{close.current=onClose;busyRef.current=busy;},[onClose,busy]);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector('button')?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); if (!busyRef.current) close.current(); }
      if (event.key !== 'Tab') return;
      const buttons = [...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown',onKey);
    return () => { document.removeEventListener('keydown',onKey); if (previous?.isConnected) previous.focus(); };
  },[]);
  return createPortal(<div className="workbook-parts-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="workbook-parts-dialog">
      <header><span className="workbook-parts-icon"><Layers size={23}/></span><button type="button" aria-label="Закрыть выбор части" onClick={onClose} disabled={busy}><X size={20}/></button></header>
      <h2 id={titleId}>{title}</h2>{children}
    </section>
  </div>,document.body);
}

export function WorkbookPartSettings({ taskNumber }) {
  const [count,setCount] = useState(1),[draft,setDraft] = useState(1),[open,setOpen] = useState(false),[busy,setBusy] = useState(false),[error,setError] = useState(''),[loaded,setLoaded] = useState(false),[retry,setRetry]=useState(0);
  useEffect(() => {
    let active = true; setLoaded(false);setError('');
    api.getWorkbookParts(taskNumber).then(result => {if(active){setCount(result.count);setLoaded(true);}}).catch(error => {if(active)setError(error.message);});
    return () => {active=false;};
  },[taskNumber,retry]);
  const save = async () => {
    setBusy(true);setError('');
    try {
      const result = await api.setWorkbookParts(taskNumber,Number(draft));
      setCount(result.count);setOpen(false);
      window.dispatchEvent(new Event('workbook-parts-changed'));
    } catch(error) {setError(error.message);} finally {setBusy(false);}
  };
  return <div className="workbook-parts-settings">
    <button type="button" className="workbook-parts-settings-button" disabled={!loaded} onClick={() => {setDraft(count);setOpen(true);}}><Layers size={16}/>Части задания{loaded && <span>{count}</span>}</button>
    {error && !open && <small role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Повторить</button></small>}
    {open && <PartDialog title={`Части задания ${taskNumber}`} onClose={() => setOpen(false)} busy={busy}>
      <p className="workbook-parts-description">Сколько частей в этом задании? Настройка действует для всех ваших учеников.</p>
      <label className="workbook-parts-count">Количество частей<select value={draft} onChange={event=>setDraft(event.target.value)} disabled={busy}>{Array.from({length:12},(_,index)=><option key={index+1} value={index+1}>{index+1}</option>)}</select></label>
      <div className="workbook-parts-example"><Folder size={18}/><div><strong>Решённые задания</strong><span>{Number(draft) > 1 ? Array.from({length:Number(draft)},(_,index)=>`Часть ${index+1}`).join(' · ') : 'Сохранение сразу в папку, без выбора части'}</span></div></div>
      <p className="workbook-parts-footnote">Папки создаются при сохранении файлов. Существующие файлы и папки сохранятся при изменении количества частей.</p>
      {error && <p role="alert" className="workbook-parts-error">{error}</p>}
      <footer><button type="button" onClick={()=>setOpen(false)} disabled={busy}>Отмена</button><button type="button" className="workbook-parts-primary" onClick={save} disabled={busy}>{busy?'Сохраняем…':'Сохранить'}</button></footer>
    </PartDialog>}
  </div>;
}

export default function PendingWorkbookParts({ user }) {
  const [items,setItems] = useState([]),[busy,setBusy] = useState(false),[error,setError] = useState('');
  const [dismissed,setDismissed] = useState(()=>new Set());
  const running = useRef(false),alive = useRef(true),resolved = useRef(new Set());
  const refresh = useCallback(async () => {
    if (running.current || document.visibilityState !== 'visible') return;
    running.current = true;
    try {
      const result = await api.getPendingWorkbookParts();
      const pending = [];
      for(const item of result.items || []) {
        if(item.count === 1) {
          await api.chooseWorkbookPart(item.id,1);
          window.dispatchEvent(new CustomEvent('workbook-parts-assigned',{detail:{studentId:item.studentId}}));
        } else pending.push(item);
      }
      if(alive.current)setItems(pending.filter(item=>!resolved.current.has(item.id)));
    } catch { /* A failed refresh never interferes with saving in the helper. */ }
    finally {running.current=false;}
  },[]);
  useEffect(() => {
    alive.current=true;void refresh();
    const onFocus=()=>void refresh(),timer=window.setInterval(onFocus,15000);
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);window.addEventListener('workbook-parts-changed',onFocus);
    return()=>{alive.current=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);window.removeEventListener('workbook-parts-changed',onFocus);};
  },[refresh]);
  const item = items.find(entry=>!dismissed.has(entry.id));
  const choose = async part => {
    setBusy(true);setError('');
    try {
      await api.chooseWorkbookPart(item.id,part);
      resolved.current.add(item.id);
      setItems(current=>current.filter(entry=>entry.id!==item.id));
      window.dispatchEvent(new CustomEvent('workbook-parts-assigned',{detail:{studentId:item.studentId}}));
    } catch(error) {setError(error.message);void refresh();} finally {setBusy(false);}
  };
  const postpone=()=>{setDismissed(current=>new Set([...current,item.id]));setError('');};
  return <>
    {!item && items.length > 0 && <button type="button" className="workbook-parts-pending" onClick={()=>setDismissed(new Set())}><FileSpreadsheet size={19}/><span>Выбрать часть<span>Сохранено файлов: {items.length}</span></span><ChevronRight size={17}/></button>}
    {item && <PartDialog title="Куда сохранить таблицу?" onClose={postpone} busy={busy}>
      <div className="workbook-parts-file"><FileSpreadsheet size={24}/><div><strong>{item.name}</strong><span>Задание {item.taskNumber}{user.role==='teacher'?` · ${item.studentName}`:''}</span></div></div>
      <div className="workbook-parts-options">{Array.from({length:item.count},(_,index)=><button type="button" key={index+1} disabled={busy} onClick={()=>void choose(index+1)}><Folder size={21}/><span>Часть {index+1}</span><ChevronRight size={17}/></button>)}</div>
      <p className="workbook-parts-safe"><Check size={16}/><span>Файл уже сохранён. Следующие сохранения будут обновлять его в выбранной части.</span></p>
      {error && <p role="alert" className="workbook-parts-error">{error}</p>}
      <footer><button type="button" onClick={postpone} disabled={busy}>Выбрать позже</button></footer>
    </PartDialog>}
  </>;
}
