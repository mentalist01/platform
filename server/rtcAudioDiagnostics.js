import fs from 'node:fs';
import path from 'node:path';

const events=new Set(['blocked','playback-error','playing','receive-stalled','playback-stalled','recovering','recovery-exhausted','connection-state']);
const reasons=new Set(['manual','receive-stalled','playback-stalled','connection-timeout','connected','connecting','disconnected','failed','closed','new']);
const errors=new Set(['NotAllowedError','NotSupportedError','InvalidStateError','NotReadableError','MediaError']);
export function normalizeRtcAudioDiagnostic(value) {
  if(!value||!events.has(value.event))return null;
  return {event:value.event,...(reasons.has(value.reason)?{reason:value.reason}:{}),...(errors.has(value.code)?{code:value.code}:{}),
    ...(Number.isFinite(value.volume)?{volume:Math.max(0,Math.min(1,value.volume))}:{}),
    ...(Number.isFinite(value.packets)?{packets:Math.max(0,Math.min(1e15,Math.trunc(value.packets)))}:{})};
}

// A bounded local journal of failures and recovery. No voice, SDP, candidate
// addresses, names, browser tokens or free-form client text are accepted.
export class RtcAudioDiagnostics {
  constructor({file,now=Date.now,maxRecords=2000,retentionMs=7*86400000,onError=()=>{}}) {
    Object.assign(this,{file,now,maxRecords,retentionMs,onError});this.rates=new Map();this.timer=null;
    try{const data=JSON.parse(fs.readFileSync(file,'utf8'));this.rows=Array.isArray(data)?data.filter(row=>now()-Date.parse(row.at)<retentionMs).slice(-maxRecords):[];}catch{this.rows=[];}
  }
  record({client,peer,event}) {
    const value=normalizeRtcAudioDiagnostic(event);
    if(!value||!client?.roomId||!client.auth?.id||!peer?.auth?.id)return false;
    const now=this.now(),key=client.clientId,rate=this.rates.get(key);
    if(rate&&now-rate.start<60000&&rate.count>=24)return false;
    this.rates.set(key,rate&&now-rate.start<60000?{...rate,count:rate.count+1}:{start:now,count:1});
    for(const [id,entry]of this.rates)if(now-entry.start>60000)this.rates.delete(id);
    this.rows=this.rows.filter(row=>now-Date.parse(row.at)<this.retentionMs).slice(-(this.maxRecords-1));
    this.rows.push({at:new Date(now).toISOString(),roomId:client.roomId,observerId:client.auth.id,observerRole:client.auth.role,peerId:peer.auth.id,peerRole:peer.auth.role,...value});
    if(!this.timer){this.timer=setTimeout(()=>this.flush(),1000);this.timer.unref?.();}
    return true;
  }
  flush() {
    clearTimeout(this.timer);this.timer=null;
    try{fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.rows),{mode:0o600});fs.renameSync(temp,this.file);}catch(error){this.onError(error);}
  }
}
