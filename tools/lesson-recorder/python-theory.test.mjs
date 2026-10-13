import assert from 'node:assert/strict';
import test from 'node:test';
import { startPythonTheory, continuePythonTheory, publishPythonTheory } from './python-theory.mjs';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {createTimeline} from './python-timeline.mjs';
const catalog = { teacherId: 't1', tasks: [{ number: 101, title: 'Ввод', subsections: [{ id: '__default__', title: 'Вся тема', existingUrl: '' }] }] };
const payload = { taskNumber: 101, subsectionId: '__default__', expectedUrl: '', title: 'Ввод данных' };
const captureConfig = { mode: 'window', window: 'python-editor', mic: 'python-mic' };

test('continuation keeps the old source, edit history, topic and take numbers and cannot fork or restart a sent draft',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'python-continue-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const id=crypto.randomUUID(),file=path.join(root,`lesson-${id}.mkv`);fs.writeFileSync(file,'existing footage');
 const timeline={...createTimeline(),sourceEnd:1537.766,openStart:null,finalized:true,takeCount:47,clips:[{id:'edited',start:20,end:25,takeNumber:3}],history:[{clips:[],knownIds:['edited']}],revision:9};
 const parent={id,title:'Цикл for',status:'saved',file,pythonTimeline:timeline,pythonTheory:{teacherId:'t1',taskNumber:101,subsectionId:'__default__'}};
 const state={jobs:{[id]:parent}},engine={state,active:()=>null,start:async job=>{state.jobs[job.id]=job;}};
 const before=JSON.stringify(parent);const nextId=await continuePythonTheory({engine,payload:{id,revision:9},captureConfig});
 const next=state.jobs[nextId];assert.notEqual(nextId,id);assert.equal(next.pythonCaptureOffset,1537.766);assert.equal(next.pythonTimeline.openStart,1537.766);assert.equal(next.pythonTimeline.finalized,false);
 assert.deepEqual(next.pythonTimeline.clips,timeline.clips);assert.deepEqual(next.pythonTimeline.history,timeline.history);assert.equal(next.pythonTimeline.takeCount,47);assert.deepEqual(next.pythonTheory,parent.pythonTheory);
 assert.equal(JSON.stringify(parent),before);assert.equal(fs.readFileSync(file,'utf8'),'existing footage');
 await assert.rejects(continuePythonTheory({engine,payload:{id,revision:9},captureConfig}),/продолжение/);
 delete state.jobs[nextId];await assert.rejects(continuePythonTheory({engine,payload:{id,revision:8},captureConfig}),/изменился/);
 parent.pythonTimeline.approved=true;await assert.rejects(continuePythonTheory({engine,payload:{id,revision:9},captureConfig}),/черновик/);parent.pythonTimeline.approved=false;
 fs.unlinkSync(file);await assert.rejects(continuePythonTheory({engine,payload:{id,revision:9},captureConfig}),/исходник/);
});
test('preflight binds an independent recording to the selected teacher and topic', async () => {
  let started; const engine = { active: () => null, start: async job => { started = job; } };
  await startPythonTheory({ api: async () => catalog, engine, payload, captureConfig, now: () => 100 });
  assert.equal(started.local, true); assert.equal(started.audioMode, 'teacher');
  assert.equal(started.pythonTheory.teacherId, 't1'); assert.equal(started.cutoffAt, 10800100);
  assert.equal(started.occurrence, undefined);
  assert.equal(started.captureProfile, 'python');
  assert.equal(started.captureConfig.window, 'python-editor');
  assert.equal(started.captureConfig.mic, 'python-mic');
  assert.notEqual(started.captureConfig, captureConfig);
  await assert.rejects(startPythonTheory({ api: async () => { throw Error('offline'); }, engine, payload }), /offline/);
});
test('Python cannot start by silently borrowing ordinary lesson windows or microphone', async () => {
  const engine = { active: () => null, start: async () => assert.fail('must not start') };
  for (const selected of [undefined, {}, { mode: 'window', window: 'editor' }]) {
    await assert.rejects(startPythonTheory({ api: async () => catalog, engine, payload, captureConfig: selected }), /Выберите/);
  }
});
test('preflight will not overwrite a changed video or start over an active capture', async () => {
  const engine = { active: () => null, start: async () => assert.fail('must not start') };
  await assert.rejects(startPythonTheory({ api: async () => catalog, engine, payload: { ...payload, expectedUrl: 'old' } }), /изменился/);
  await assert.rejects(startPythonTheory({ engine: { active: () => ({}) }, payload }), /завершите/);
});
test('processing waits; lost attach response retries same recording without uploading again', async () => {
  const job = { id: 'stable-id', title: 'Урок', url: 'private-link', pythonTheory: { teacherId: 't1', taskNumber: 101 } };
  let calls = 0; const save = () => {};
  const api = async (_route, body) => { assert.equal(body.recordingId, 'stable-id'); if (++calls === 1) throw Error('offline'); return { created: false }; };
  await publishPythonTheory(job, { api, ready: async () => false, save });
  assert.equal(calls, 0); assert.equal(job.status, 'processing');
  await assert.rejects(publishPythonTheory(job, { api, ready: async () => true, save }), /offline/);
  await publishPythonTheory(job, { api, ready: async () => true, save });
  assert.equal(calls, 2); assert.equal(job.status, 'ready');
});
