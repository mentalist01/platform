import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RtcAudioDiagnostics,normalizeRtcAudioDiagnostic} from './rtcAudioDiagnostics.js';

test('diagnostic input has no free text, credentials, SDP, addresses or participant identity supplied by clients',()=>{
  assert.deepEqual(normalizeRtcAudioDiagnostic({event:'blocked',code:'NotAllowedError',reason:'manual',volume:4,token:'secret',sdp:'private',observerId:'forged',message:'private text'}),{event:'blocked',code:'NotAllowedError',reason:'manual',volume:1});
  assert.equal(normalizeRtcAudioDiagnostic({event:'anything',message:'arbitrary'}),null);
});

test('journal is bounded, rate limited, survives restart and expires old records',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rtc-audio-journal-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let now=Date.parse('2026-10-28T12:00:00Z');const file=path.join(root,'events.json'),client={clientId:'ws-a',roomId:'rtc:lesson:test:general',auth:{id:'teacher',role:'teacher'}},peer={auth:{id:'student',role:'student'}};
  const log=new RtcAudioDiagnostics({file,now:()=>now,maxRecords:3});
  for(let i=0;i<24;i++)assert.equal(log.record({client,peer,event:{event:'recovering',observerId:'forged'}}),true);
  assert.equal(log.record({client,peer,event:{event:'blocked'}}),false);assert.equal(log.rows.length,3);log.flush();
  const rows=JSON.parse(fs.readFileSync(file));assert.equal(rows[0].observerId,'teacher');assert.ok(!JSON.stringify(rows).includes('forged'));
  const restarted=new RtcAudioDiagnostics({file,now:()=>now,maxRecords:3});assert.equal(restarted.rows.length,3);
  now+=8*86400000;restarted.record({client,peer,event:{event:'playing'}});restarted.flush();assert.equal(restarted.rows.length,1);
});
