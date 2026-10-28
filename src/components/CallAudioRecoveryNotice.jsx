import {RefreshCcw,Volume2} from 'lucide-react';
import './CallAudioRecoveryNotice.css';

export default function CallAudioRecoveryNotice({peers=[],states={},onRecover,dark=false,compact=false}) {
  const affected=peers.filter(peer=>['blocked','playback-error','receive-stalled','playback-stalled','recovering','recovery-exhausted'].includes(states[peer.peerId]?.status));
  if(!affected.length)return null;
  return <aside className={`call-audio-notice${dark?' is-dark':''}${compact?' is-compact':''}`} role="status" aria-live="polite" data-no-panel-drag onPointerDown={e=>e.stopPropagation()}>
    <strong><Volume2 size={16}/>Нужна проверка звука</strong>
    {affected.map(peer=>{const status=states[peer.peerId].status,recovering=status==='recovering';return <div key={peer.peerId}><span><b>{peer.title}</b><small>{status==='blocked'?'Браузер не запустил звук':recovering?'Восстанавливаем связь…':status==='recovery-exhausted'?'Автовосстановление не помогло':'Звук может не доходить'}</small></span><button type="button" disabled={recovering} onClick={()=>onRecover(peer.peerId)}><RefreshCcw size={14}/>{status==='blocked'?'Включить звук':'Восстановить'}</button></div>;})}
  </aside>;
}
