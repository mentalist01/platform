import {ArrowUpRight, LocateFixed, MapPin, Check, LoaderCircle} from 'lucide-react';
import {pythonLocationLabel} from '../utils/pythonLessonPresence.js';
import './PythonLessonPresence.css';

export default function PythonLessonPresence({presence, teacher=false, name, canSummon=false}) {
  if (!presence) return null;
  const {peer, connected, phase}=presence;
  const navigable=peer?.location?.taskNumber && !peer.location.groupMode && peer.location.view==='python';
  const message={waiting:'Ждём открытия задачи…',confirmed:'Ученик открыл вашу задачу',unconfirmed:'Открытие не подтверждено. Можно позвать ещё раз.'}[phase];
  return <div className="python-lesson-presence" aria-label={teacher?'Где сейчас ученик':'Где сейчас учитель'}>
    <span className="python-lesson-presence__pin" data-online={Boolean(peer)}><MapPin size={17}/></span>
    <div className="python-lesson-presence__place"><span><i data-online={Boolean(peer)}/>{teacher?name || peer?.name || 'Ученик':'Учитель'}{peer?' сейчас':''}</span>
      <strong>{!connected?'Подключаемся…':pythonLocationLabel(peer?.location,peer?.role)}</strong></div>
    <div className="python-lesson-presence__actions">
      {navigable && <button type="button" onClick={presence.goToPeer}><ArrowUpRight size={15}/>{teacher?'К ученику':'К учителю'}</button>}
      {teacher && <button type="button" className="python-lesson-presence__summon" disabled={!connected || !peer || !canSummon || phase==='waiting'}
        title={!canSummon?'Сначала откройте задачу, к которой хотите позвать ученика':!peer?'Ученик должен открыть платформу':'Открыть ученику вашу тему и задачу из любого раздела'} onClick={presence.summon}>
        {phase==='waiting'?<LoaderCircle size={15} className="animate-spin"/>:<LocateFixed size={15}/>}Позвать к себе</button>}
    </div>
    {message && <span className="python-lesson-presence__receipt" role="status">{phase==='confirmed' && <Check size={13}/>} {message}</span>}
  </div>;
}
