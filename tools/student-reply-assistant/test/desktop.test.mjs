import test from 'node:test';
import assert from 'node:assert/strict';
import {startDesktop} from '../desktop.mjs';
import {AssistantRunner} from '../runner.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('desktop startup refuses a second instance and does not require plaintext credentials',async t=>{
  const stateDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'reply-desktop-'));
  t.after(()=>fs.rmSync(stateDirectory,{recursive:true,force:true}));
  const config={telegramOwnerId:null,allowedChatIds:[],autoDraft:false,debounceMs:1000,maxFileBytes:1024,codexThreadId:'test'};
  const runner=new AssistantRunner(config,{inboxFile:path.join(stateDirectory,'inbox.json')});
  const first=await startDesktop({port:0,tokenLoader:async()=>null,stateDirectory,runner});
  try {
    assert.match(first.runner.status,/подключить Telegram/);
    assert.equal(await startDesktop({port:first.server.address().port,tokenLoader:async()=>{throw Error('must not be called');},stateDirectory,runner}),null);
  } finally {await first.close();}
});
