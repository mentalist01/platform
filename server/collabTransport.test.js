import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {collabTransportOptions} from './collabTransport.js';

for(const compression of [true,false])test(`Yjs-sized states preserve bytes/order with deflate ${compression}`,async()=>{
  const server=createServer(),wss=new WebSocketServer(collabTransportOptions);
  server.on('upgrade',(req,socket,head)=>wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req)));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const connected=once(wss,'connection'),client=new WebSocket(`ws://127.0.0.1:${server.address().port}`,{perMessageDeflate:compression});
  let peer;
  try{
    [peer]=await connected;await once(client,'open');
    assert.equal(Boolean(client.extensions.includes('permessage-deflate')),compression);
    const payload=Buffer.from('board-state:0123456789'.repeat(30000)),messages=[];
    const received=new Promise(resolve=>client.on('message',message=>{messages.push(message);if(messages.length===3)resolve();}));
    const start=client._socket.bytesRead;
    peer.send(payload);peer.send('cursor');peer.send(payload);
    await received;
    assert.deepEqual(messages,[payload,Buffer.from('cursor'),payload]);
    const transferred=client._socket.bytesRead-start;
    if(compression)assert.ok(transferred<payload.length/10,`compressed transfer was ${transferred} bytes`);
    else assert.ok(transferred>=payload.length*2);
  }finally{
    client.terminate();peer?.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));
  }
});
