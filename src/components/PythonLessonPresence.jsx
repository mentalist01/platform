import {ArrowUpRight, LocateFixed, MapPin, Check, LoaderCircle} from 'lucide-react';
import {pythonPresenceDisplay} from '../utils/pythonLessonPresence.js';
import './PythonLessonPresence.css';

export function PythonPeerMarker({peer}) {
  if (!peer) return null;
  const name=peer.name || (peer.role==='teacher'?'Учитель':'Ученик');
  const label=`${name} сейчас здесь`;
  return <span className="python-peer-marker" data-role={peer.role} role="img" aria-label={label} title={label}>
    {Array.from(name.trim())[0]?.toLocaleUpperCase('ru-RU') || '•'}
  </span>;
}

export default function PythonLessonPresence({presence, teacher=false, name, canSummon=false, editorPeerPresent=false}) {
  if (!presence) return null;
  const {peer, connected, phase}=presence;
  const display=pythonPresenceDisplay({peer,connected,editorPeerPresent,teacher});
  const navigable=peer?.location?.taskNumber && !peer.location.groupMode && peer.location.view==='python';
  const message={waiting:'Ждём открытия задачи…',confirmed:'Ученик открыл вашу задачу',unconfirmed:'Открытие не подтверждено. Можно позвать ещё раз.'}[phase];
  return <div className="python-lesson-presence" aria-label={teacher?'Где сейчас ученик':'Где сейчас учитель'}>
    <span className="python-lesson-presence__pin" data-online={display.online}><MapPin size={17}/></span>
    <div className="python-lesson-presence__place"><span><i data-online={display.online}/>{teacher?name || peer?.name || 'Ученик':'Учитель'}{peer?' сейчас':editorPeerPresent?' · в комнате':''}</span>
      <strong title={display.refreshNeeded?'Участник подключён к редактору, но данные о его местоположении пока не получены. Обновите страницу платформы у этого участника.':undefined}>{display.label}</strong></div>
    <div className="python-lesson-presence__actions">
      {navigable && <button type="button" onClick={presence.goToPeer}><ArrowUpRight size={15}/>{teacher?'К ученику':'К учителю'}</button>}
      {teacher && <button type="button" className="python-lesson-presence__summon" disabled={!connected || !peer || !canSummon || phase==='waiting'}
        title={!canSummon?'Сначала откройте задачу, к которой хотите позвать ученика':display.refreshNeeded?'Для призыва попросите ученика обновить страницу платформы':!peer?'Ждём подключения местоположения ученика':'Открыть ученику вашу тему и задачу из любого раздела'} onClick={presence.summon}>
        {phase==='waiting'?<LoaderCircle size={15} className="animate-spin"/>:<LocateFixed size={15}/>}Позвать к себе</button>}
    </div>
    {message && <span className="python-lesson-presence__receipt" role="status">{phase==='confirmed' && <Check size={13}/>} {message}</span>}
  </div>;
}
