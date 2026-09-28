import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, X } from 'lucide-react';
import './LessonReschedule.css';
export function ScheduleDialog({title,onClose,children,footer}) {
  const ref=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';ref.current?.focus();
    return ()=>{document.body.style.overflow=overflow;previous?.focus?.();};
  },[]);
  return createPortal(<div className="lr-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section className="lr-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onKeyDown={e=>{
    if(e.key==='Escape')onClose();
    if(e.key==='Tab'){const items=[...ref.current.querySelectorAll('button:not([disabled]),input,select,textarea,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }}><header className="lr-header"><span className="lr-icon"><CalendarClock size={24}/></span><div><span className="lr-eyebrow">РАСПИСАНИЕ · МОСКОВСКОЕ ВРЕМЯ</span><h2>{title}</h2></div><button className="lr-close" onClick={onClose} aria-label="Закрыть окно"><X size={21}/></button></header><div className="lr-content">{children}</div>{footer&&<footer className="lr-footer">{footer}</footer>}</section></div>,document.body);
}

