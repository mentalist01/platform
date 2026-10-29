import {useState} from 'react';
import {Minimize2,RefreshCcw,Volume2} from 'lucide-react';
import './CallAudioRecoveryNotice.css';

export default function CallAudioRecoveryNotice({peers=[],states={},onRecover,dark=false,compact=false}) {
  const [collapsed,setCollapsed]=useState(compact);
  const affected=peers.filter(peer=>['blocked','playback-error','receive-stalled','playback-stalled','recovering','recovery-exhausted'].includes(states[peer.peerId]?.status));
  if(!affected.length)return null;
  const names=affected.map(peer=>peer.title).join(', ');
  return <aside className={`call-audio-notice${dark?' is-dark':''}${compact?' is-compact':''}${collapsed?' is-collapsed':''}`} aria-live="polite" data-no-panel-drag onPointerDown={e=>e.stopPropagation()}>
    {collapsed?<button className="call-audio-notice-toggle" type="button" aria-expanded="false" aria-label={`Раскрыть проверку звука: ${names}`} title={`Проверка звука: ${names}`} onClick={()=>setCollapsed(false)}><Volume2 size={18}/><span>{affected.length}</span></button>:<>
      <header><strong><Volume2 size={16}/>Нужна проверка звука</strong><button className="call-audio-notice-minimize" type="button" aria-expanded="true" aria-label="Свернуть подсказку о звуке" title="Свернуть" onClick={()=>setCollapsed(true)}><Minimize2 size={15}/></button></header>
      {affected.map(peer=>{const status=states[peer.peerId].status,recovering=status==='recovering';return <div key={peer.peerId}><span><b>{peer.title}</b><small>{status==='blocked'?'Браузер не запустил звук':recovering?'Восстанавливаем связь…':status==='recovery-exhausted'?'Автовосстановление не помогло':'Звук может не доходить'}</small></span><button type="button" disabled={recovering} onClick={()=>onRecover(peer.peerId)}><RefreshCcw size={14}/>{status==='blocked'?'Включить звук':'Восстановить'}</button></div>;})}
    </>}
  </aside>;
}
