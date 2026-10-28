// Counters describe transport, never the contents of a conversation. Silence
// alone is not a failure: recovery needs fresh evidence of outgoing packets.
export function createAudioReceiveWatchdog({staleMs=12000}={}) {
  let remote=null,remoteProgressAt=0,remoteProgressStart=0;
  let previous=null,receivedAt=0,playedAt=0;
  return {
    remote(sample,now=Date.now()) {
      if(!sample||!Number.isSafeInteger(sample.packets)||sample.packets<0||sample.packets>1e15)return;
      const changed=!remote||sample.epoch!==remote.epoch||sample.packets<remote.packets;
      if(changed||!sample.enabled){remoteProgressAt=0;remoteProgressStart=0;}
      else if(sample.packets>remote.packets){
        if(!remoteProgressAt||now-remoteProgressAt>staleMs)remoteProgressStart=now;
        remoteProgressAt=now;
      }
      remote={...sample,at:now};
    },
    sample({now=Date.now(),connected,packets=0,time=null,volume=1,blocked=false}) {
      if(!connected){previous=null;receivedAt=now;playedAt=now;return null;}
      if(!previous||packets<previous.packets){receivedAt=now;playedAt=now;}
      if(previous&&packets>previous.packets)receivedAt=now;
      if(Number.isFinite(time)&&previous&&Number.isFinite(previous.time)&&time<previous.time)playedAt=now;
      if(Number.isFinite(time)&&previous&&time>previous.time)playedAt=now;
      previous={packets,time:Number.isFinite(time)?time:null};
      // Includes a first play() which never starts despite incoming RTP.
      if(!blocked&&volume>0&&Number.isFinite(time)&&now-receivedAt<5000&&now-playedAt>=staleMs)return 'playback-stalled';
      if(!remote?.enabled||now-remote.at>staleMs||!remoteProgressAt||now-remoteProgressAt>staleMs)return null;
      if(remoteProgressStart&&now-remoteProgressStart>=staleMs&&now-receivedAt>=staleMs)return 'receive-stalled';
      return null;
    },
  };
}

// Keep one player for the current stream. A late play() rejection from a
// removed participant must not show an error in a new channel.
export function createRemoteAudioPlayback({node,stream,onState=()=>{},retryMs=3000}) {
  let disposed=false,pending=false,blocked=false,state='',version=0;
  const tracks=new Map();
  const report=(next,code='')=>{if(!disposed&&next!==state){state=next;onState({status:next,code});}};
  const live=()=>stream?.getAudioTracks?.().some(track=>track.readyState==='live');
  const retry=async({rebind=false}={})=>{
    if(disposed||!live())return false;
    if(pending&&!rebind)return false;
    const generation=++version;pending=true;
    try{
      if(rebind){node.pause();node.srcObject=null;}
      if(node.srcObject!==stream){node.srcObject=stream;}
      await node.play();
      if(disposed||generation!==version)return false;
      blocked=false;report('playing');return true;
    }catch(error){
      if(disposed||generation!==version)return false;
      if(error?.name==='AbortError')return false;
      blocked=error?.name==='NotAllowedError';
      report(blocked?'blocked':'playback-error',error?.name||'MediaError');return false;
    }finally{if(generation===version)pending=false;}
  };
  const playing=()=>{blocked=false;report('playing');};
  const error=()=>report('playback-error','MediaError');
  const bind=track=>{
    if(track?.kind!=='audio'||tracks.has(track))return;
    const resume=()=>{if(!blocked)void retry();};
    track.addEventListener?.('unmute',resume);tracks.set(track,resume);
  };
  const add=event=>{bind(event.track);if(!blocked)void retry();};
  node.addEventListener('playing',playing);node.addEventListener('error',error);
  stream?.getAudioTracks?.().forEach(bind);stream?.addEventListener?.('addtrack',add);
  node.srcObject=stream||null;
  void retry();
  const timer=setInterval(()=>{if(!blocked&&!pending&&live()&&(node.paused||node.ended))void retry();},retryMs);
  return {retry,dispose(){
    disposed=true;version++;clearInterval(timer);
    node.removeEventListener('playing',playing);node.removeEventListener('error',error);
    stream?.removeEventListener?.('addtrack',add);
    for(const [track,resume]of tracks)track.removeEventListener?.('unmute',resume);
    if(node.srcObject===stream){node.pause();node.srcObject=null;}
  }};
}

export function createAudioRecoveryBudget({cooldownMs=30000,maxAttempts=2}={}) {
  const attempts=new Map();
  return {
    take(id,now=Date.now(),manual=false){
      const previous=attempts.get(id);
      if(previous&&now-previous.at<(manual?3000:cooldownMs))return false;
      if(!manual&&previous?.count>=maxAttempts)return false;
      attempts.set(id,{at:now,count:manual?0:(previous?.count||0)+1});return true;
    },
    clear(){attempts.clear();},
  };
}
