import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { api } from '../services/api.js';
import GroupAvailability from './GroupAvailability.jsx';
import './GroupPlacementComparison.css';

export default function GroupPlacementComparison({ student, answers, group, onClose, transport = api }) {
  const dialog = useRef(null);
  useLayoutEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element.showModal();
    return () => { element.close(); previous?.focus?.(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="placement-grid-comparison" aria-labelledby="placement-grid-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><span>ПРИМЕРКА В ОБЩЕЙ СЕТКЕ</span><h2 id="placement-grid-title">{student.name} + {group.name}</h2><p>Временно добавили отметки ученика к ответам группы. Состав и расписание не меняются.</p></div><button type="button" autoFocus aria-label="Закрыть примерку" onClick={onClose}><X size={21} /></button></header>
    <div className="placement-grid-comparison__body"><GroupAvailability groupId={group.id} isTeacher transport={transport.groupAvailability} previewCandidate={{ student, answers }} /></div>
  </dialog>, document.body);
}
