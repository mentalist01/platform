import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createLiveState,applyLiveBatch,liveResponse,liveDigest} from './workbookLiveState.js';

// Per-document durable records. An append+fsync precedes every receipt. Periodic
// atomic snapshots bound replay cost. A torn final line is safely discarded.
export class WorkbookLiveStore{
  constructor(directory){this.directory=directory;fs.mkdirSync(directory,{recursive:true});this.rooms=new Map();this.tails=new Map();}
  key(runId,cardId,assetId){return liveDigest(`${runId}\0${cardId}\0${assetId}`);}
  paths(key){if(!/^[0-9a-f]{64}$/.test(key))throw Error('Invalid live workbook key');return {snapshot:path.join(this.directory,key+'.json'),journal:path.join(this.directory,key+'.jsonl')};}
  lock(key,fn){const pending=(this.tails.get(key)||Promise.resolve()).then(fn),tail=pending.catch(()=>{});this.tails.set(key,tail);tail.finally(()=>{if(this.tails.get(key)===tail)this.tails.delete(key);});return pending;}
  read(key){
    if(this.rooms.has(key)){const room=this.rooms.get(key);this.rooms.delete(key);this.rooms.set(key,room);return room;}
    const files=this.paths(key),snapshot=fs.existsSync(files.snapshot)?JSON.parse(fs.readFileSync(files.snapshot,'utf8')):null;let state=snapshot?.state||null,sequence=snapshot?.sequence||0,count=0;
    if(fs.existsSync(files.journal)){
      const bytes=fs.readFileSync(files.journal),last=bytes.lastIndexOf(10);
      if(last!==bytes.length-1)fs.truncateSync(files.journal,Math.max(0,last+1));
      for(const line of bytes.subarray(0,last+1).toString('utf8').split('\n').filter(Boolean)){
        const record=JSON.parse(line),{hash,...data}=record;if(liveDigest(data)!==hash)throw Error('Повреждён журнал совместной таблицы');
        if(record.sequence<=sequence)continue;
        if(record.sequence!==sequence+1)throw Error('Разрыв журнала совместной таблицы');
        if(record.type==='seed')state=record.state;
        else if(record.type==='checkpoint'){if(state)state.checkpointRevision=record.revision;}
        else{if(!state||record.previous!==state.revision)throw Error('Разрыв журнала совместной таблицы');state=applyLiveBatch(state,record.actor,record.input,record.at).state;}
        count++;sequence=record.sequence;
      }
    }
    this.rooms.set(key,{state,count,sequence});
    // Idle documents are durable on disk. Bound RAM without evicting a room
    // whose serialized write/checkpoint is still running.
    if(this.rooms.size>12)for(const old of this.rooms.keys()){if(old!==key&&!this.tails.has(old))this.rooms.delete(old);if(this.rooms.size<=12)break;}
    return this.rooms.get(key);
  }
  append(key,data){const files=this.paths(key),record={...data,hash:liveDigest(data)},fd=fs.openSync(files.journal,'a',0o600);try{fs.writeFileSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  compact(key,room){
    const files=this.paths(key);if(room.count<100&&(!fs.existsSync(files.journal)||fs.statSync(files.journal).size<8*1024*1024))return;
    const temporary=files.snapshot+'.'+crypto.randomUUID()+'.tmp',fd=fs.openSync(temporary,'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify({state:room.state,sequence:room.sequence}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temporary,files.snapshot);fs.writeFileSync(files.journal,'',{mode:0o600});room.count=0;
  }
  response(key,since){return liveResponse(this.read(key).state,since);}
  async initialize(key,book,sourceHash){return this.lock(key,()=>{
    const room=this.read(key);if(room.state)return liveResponse(room.state);
    const state=createLiveState(book,sourceHash);this.append(key,{type:'seed',revision:0,state,sequence:room.sequence+1});room.sequence++;room.state=state;room.count++;return liveResponse(state);
  });}
  async submit(key,actor,input,since,now=Date.now()){return this.lock(key,()=>{
    const room=this.read(key),result=applyLiveBatch(room.state,actor,input,now);
    if(!result.duplicate&&!result.conflict){this.append(key,{type:'command',revision:result.state.revision,previous:room.state.revision,actor,input,at:now,sequence:room.sequence+1});room.sequence++;room.state=result.state;room.count++;this.compact(key,room);}
    return {...liveResponse(room.state,since),receipt:result.receipt};
  });}
  async checkpoint(key,revision,save){return this.lock(key,async()=>{
    const room=this.read(key);if(!room.state||room.state.revision!==revision)throw Object.assign(new Error('В таблице появились новые правки. Повторю сохранение общей версии.'),{status:409});
    const result=await save();this.append(key,{type:'checkpoint',revision,sequence:room.sequence+1});room.sequence++;room.state.checkpointRevision=revision;return result;
  });}
}
