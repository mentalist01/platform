import {WebSocketServer} from 'ws';
import {liveDigest} from './workbookLiveState.js';
import {parseWorkbookHelperAuthorization} from './workbookHelper.js';
import {randomUUID} from 'node:crypto';

// Only transient presence and revision hints travel here. Document commands
// retain the existing durable, idempotent HTTP journal and conflict checks.
export function createWorkbookLiveEvents({session,presence,store}){
  const path='/workbook-helper/v1/live/events',wss=new WebSocketServer({noServer:true,maxPayload:24*1024,perMessageDeflate:false});
  const clients=new Map();
  const send=(ws,value)=>{if(ws.readyState===1){if(ws.bufferedAmount>128*1024){ws.close(1013,'Slow receiver');return;}ws.send(JSON.stringify(value));}};
  const peers=key=>{for(const [ws,c]of clients)if(c.key===key)send(ws,{type:'presence',...presence.read(key,c.auth,store.now())});};
  const close=ws=>{const c=clients.get(ws);if(!c)return;clients.delete(ws);if(![...clients.values()].some(other=>other.id===c.id)&&store.data.sessions[c.id])store.data.sessions[c.id].lastSeenAt=0;presence.exchange(c.key,c.presenceId,c.auth,null,store.now());peers(c.key);};
  wss.on('connection',(ws,req,context)=>{
    const key=context.mode.key,id=liveDigest(parseWorkbookHelperAuthorization(req.headers.authorization)),auth=context.entry.auth;
    if(clients.size>=512||[...clients.values()].filter(c=>c.key===key).length>=32||[...clients.values()].filter(c=>c.id===id).length>=2){ws.close(1013,'Connection limit');return;}
    const c={key,id,presenceId:randomUUID(),auth,req,busy:false,start:store.now(),count:0,alive:true};clients.set(ws,c);
    const state=store.liveWorkbooks.read(key).state;
    send(ws,{type:'ready',revision:state?.revision||0,checkpointRevision:state?.checkpointRevision||0,...presence.read(key,auth,store.now())});
    ws.on('pong',()=>{c.alive=true;});
    ws.on('message',async(bytes,binary)=>{
      const now=store.now();if(now-c.start>=1000){c.start=now;c.count=0;}
      if(binary||++c.count>20){ws.close(1008,'Message limit');return;}
      if(c.busy)return; // Transient frames can be skipped instead of queuing stale typing.
      c.busy=true;
      try{
        const frame=JSON.parse(bytes.toString());if(frame.type!=='presence')throw Error('Unsupported message');
        const current=await session(req);if(!current||current.mode.key!==key)throw Error('Session ended');
        presence.exchange(key,c.presenceId,auth,frame.selection,store.now(),frame.draft);peers(key);
      }catch{ws.close(1008,'Invalid or expired session');}
      finally{c.busy=false;}
    });
    ws.on('error',()=>close(ws));ws.on('close',()=>close(ws));
  });
  const timer=setInterval(()=>{for(const [ws,c]of clients){if(!c.alive){ws.terminate();continue;}c.alive=false;ws.ping();void session(c.req).then(current=>{if(!current||current.mode.key!==c.key)ws.close(1008,'Session ended');}).catch(()=>ws.close(1008,'Session ended'));}},5000);timer.unref();
  wss.on('close',()=>clearInterval(timer));
  return {path,
    hasConnections(key){return [...clients.values()].some(client=>client.key===key);},
    async upgrade(req,socket,head){
      try{const context=await session(req);if(!context)throw Error('Unauthorized');if(!socket.destroyed)wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req,context));}
      catch{if(!socket.destroyed)socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');}
    },
    changed(key){const state=store.liveWorkbooks.read(key).state;for(const [ws,c]of clients)if(c.key===key)send(ws,{type:'changed',revision:state?.revision||0,checkpointRevision:state?.checkpointRevision||0});},
    presenceChanged:peers,
    close(){for(const ws of clients.keys())ws.terminate();wss.close();},
  };
}
