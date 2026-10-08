import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ffmpeg = process.platform === 'win32' ? 'C:/ProgramData/chocolatey/bin/ffmpeg.exe' : 'ffmpeg';
const hasFfmpeg = (() => { try { execFileSync(ffmpeg, ['-version'], { windowsHide: true, stdio: 'ignore' }); return true; } catch { return false; } })();

// Run the actual service and panel against a synthetic OBS RPC transport and
// a fictional platform. No real OBS, devices, payments, uploads or lessons.
async function fixture({ queueEnabled = false, pauseDelayMs = 0, mediaFixture = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan100-python-studio-'));
  const app = path.join(root, 'fixture-app'); fs.mkdirSync(app);
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const name of fs.readdirSync(here)) if (/\.(mjs|html|ps1|json)$/.test(name) && !name.includes('.test.')) fs.copyFileSync(path.join(here, name), path.join(app, name));
  if (process.argv.includes('--serve') || mediaFixture) {
    execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=s=640x360:r=30:d=24','-f','lavfi','-i','sine=frequency=440:duration=24','-c:v','libx264','-preset','ultrafast','-c:a','aac',path.join(root,'fixture.mkv')],{windowsHide:true});
    fs.writeFileSync(path.join(app,'runtime.json'),JSON.stringify({ffmpeg}));
  }
  const listener = http.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const platform = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.endsWith('/python/catalog') ? { teacherId: 'fictional-teacher', tasks: [{ number: 101, title: 'Цикл for', subsections: [{ id: '__default__', title: 'Вся тема', existingUrl: '' }] }] } : { enabled: false, jobs: [] }));
  });
  await new Promise(resolve => platform.listen(0, '127.0.0.1', resolve));
  const ordinary = { token: 'fictional-token', platformUrl: `http://127.0.0.1:${platform.address().port}`, platform: 'lesson-platform', telemost: 'lesson-call', mic: 'lesson-mic', program: 'lesson-editor', screen: 'lesson-monitor', configured: true, recordDirectory: path.join(root, 'fake-video'), autoUpload: false };
  fs.mkdirSync(ordinary.recordDirectory); fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ config: ordinary, jobs: {} }));
  const seed=process.argv.find(arg=>arg.startsWith('--seed='))?.slice(7);
  if(seed){const previous=JSON.parse(fs.readFileSync(seed));const jobs=Object.fromEntries(Object.entries(previous.jobs).map(([id,job])=>{const file=path.join(ordinary.recordDirectory,`lesson-${id}.mkv`);fs.copyFileSync(path.join(root,'fixture.mkv'),file);return[id,{...job,file}];}));fs.writeFileSync(path.join(root,'state.json'),JSON.stringify({config:{...previous.config,recordDirectory:ordinary.recordDirectory,platformUrl:ordinary.platformUrl},jobs}));}
  fs.writeFileSync(path.join(app, 'release.json'), JSON.stringify({ version: JSON.parse(fs.readFileSync(path.join(app, 'package.json'))).version, id: 'a'.repeat(64) }));
  fs.writeFileSync(path.join(app, 'obs-fixture.mjs'), `
import fs from 'node:fs';import path from 'node:path';
import {ObsClient as Base,SCENES,INPUTS,PYTHON_SCENES,PYTHON_INPUTS} from './obs.mjs';
export {SCENES,INPUTS,PYTHON_SCENES};
export class ObsClient extends Base {
  constructor(){super();this.connected=true;this.output=false;this.paused=false;this.owner='';this.scene=SCENES.platform;this.events=[];this.settings={};this.scenes=new Map(Object.values(SCENES).map(name=>[name,[]]));this.inputs=new Set(Object.values(INPUTS));this.closed=false;}
  async launch(){} async assertCollection(){} async setRecordDirectory(){}
  async choices(){const item=(v,n)=>({itemEnabled:true,itemValue:v,itemName:n});return {platform:[item('lesson-platform','[IVAN100-Teacher.exe]: Обычный урок'),item('lesson-editor','[Code.exe]: Обычный редактор'),item('python-platform','[chrome.exe]: Теория Python'),...(!this.closed?[item('python-editor','[Code.exe]: Циклы Python'),item('second-editor','[python.exe]: Другой редактор')]:[])],telemost:[item('lesson-platform','Платформа'),item('lesson-call','Звонок')],mic:[item('lesson-mic','Микрофон уроков'),item('python-mic','Микрофон Python')],screen:[item('lesson-monitor','Монитор уроков'),item('python-monitor','Монитор Python')]};}
  async call(type,p={}){
    this.events.push([type,p]);if(this.events.length>2000)this.events.shift();
    if(type==='GetSceneCollectionList')return {currentSceneCollectionName:'IVAN100 Lessons',sceneCollections:['IVAN100 Lessons']};
    if(type==='GetProfileList')return {currentProfileName:'IVAN100 Lessons',profiles:['IVAN100 Lessons']};
    if(type==='GetRecordStatus')return {outputActive:this.output,outputPaused:this.paused,outputTimecode:'00:00:'+String(this.seconds??12).padStart(2,'0')+'.000'};
    if(type==='GetStreamStatus')return {outputActive:false};
    if(type==='GetCurrentProgramScene')return {currentProgramSceneName:this.scene};
    if(type==='SetCurrentProgramScene')this.scene=p.sceneName;
    if(type==='GetProfileParameter')return {parameterValue:this.owner};
    if(type==='SetProfileParameter'&&p.parameterName==='FilenameFormatting')this.owner=p.parameterValue;
    if(type==='GetSceneList')return {scenes:[...this.scenes.keys()].map(sceneName=>({sceneName}))};
    if(type==='CreateScene')this.scenes.set(p.sceneName,[]);
    if(type==='GetInputList')return {inputs:[...this.inputs].map(inputName=>({inputName}))};
    if(type==='CreateInput'){this.inputs.add(p.inputName);this.scenes.get(p.sceneName).push({sourceName:p.inputName});}
    if(type==='GetSceneItemList')return {sceneItems:this.scenes.get(p.sceneName)||[]};
    if(type==='CreateSceneItem')this.scenes.get(p.sceneName).push({sourceName:p.sourceName});
    if(type==='SetInputSettings')this.settings[p.inputName]={...this.settings[p.inputName],...p.inputSettings};
    if(type==='GetSceneItemId')return {sceneItemId:1};
    if(type==='GetVideoSettings')return {baseWidth:1920,baseHeight:1080};
    if(type==='StartRecord'){this.paused=false;const template=path.join(process.env.IVAN100_RECORDER_HOME,'fixture.mkv');if(fs.existsSync(template))fs.copyFileSync(template,path.join(process.env.IVAN100_RECORDER_HOME,'fake-video',this.owner+'.mkv'));setTimeout(()=>{this.output=true;},450);}
    if(type==='PauseRecord')setTimeout(()=>{this.paused=true;},${pauseDelayMs});
    if(type==='ResumeRecord')setTimeout(()=>{this.paused=false;},${pauseDelayMs});
    if(type==='StopRecord'){setTimeout(()=>{this.output=false;},450);const file=path.join(process.env.IVAN100_RECORDER_HOME,'fake-video',this.owner+'.mkv');if(!fs.existsSync(file))fs.writeFileSync(file,'synthetic capture');return {outputPath:file};}
    if(type==='GetSourceScreenshot'){
      if(!this.scenes.has(p.sourceName))throw Error('Выберите источники Python');
      const title=p.sourceName.includes('Python')?'PYTHON / '+(this.settings[PYTHON_INPUTS.window]?.window||'preview'):'LESSON / original window';
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#0b1020"/><text x="35" y="55" font-family="Arial" font-size="17" fill="#bc9fff">'+title+'</text><text x="35" y="155" font-family="monospace" font-size="26" fill="#e7e3ff">for number in range(5):</text><text x="65" y="198" font-family="monospace" font-size="26" fill="#80d7bd">print(number)</text><text x="35" y="320" font-family="Arial" font-size="15" fill="#8492ab">Synthetic QA preview</text></svg>';
      return {imageData:'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')};
    }
    return {};
  }
}
`);
  let source = fs.readFileSync(path.join(app, 'app.mjs'), 'utf8').replaceAll('18765', String(port)).replace("from './obs.mjs'", "from './obs-fixture.mjs'");
  if(process.argv.includes('--serve'))source=source.replaceAll("frame-ancestors 'none'","frame-ancestors 'self'");
  source = source.replace('void archive.detectPython().catch(() => {});', '/* QA: no dependency probes. */');
  if (!queueEnabled) source = source.replace('void queue();', '/* QA: no automatic uploads. */').replace('if (!job.url) await uploader.upload(job, save);', 'throw Error("QA: соединение прервано");');
  source = source.replace('const finalizePython = async job => {', 'editMedia.duration=async()=>24; const finalizePython = async job => {');
  const qaRoutes = `
    if(req.url==='/qa/narrow'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<iframe title="Монтаж в узком окне" src="/" style="width:390px;height:760px;border:0"></iframe>');}
    if(req.url==='/qa/events')return json(res,200,{events:obs.events,settings:obs.settings,scene:obs.scene,owner:obs.owner});
    if(req.url==='/qa/closed'){obs.closed=true;pythonSourceChoices=await obs.choices();return json(res,200,{});}
    if(req.url==='/qa/lesson'){await serialize(()=>engine.start({id:crypto.randomUUID(),title:'Тест обычного урока',local:true,manual:true,cutoffAt:Date.now()+3600000}));obsStatus=await obs.status();return json(res,200,{});}
    if(req.url==='/qa/lost'){obs.output=false;obsStatus=await obs.status();return json(res,200,{});}
    if(req.url==='/qa/time'){const payload=await body(req);obs.seconds=payload.seconds;obsStatus=await obs.status();return json(res,200,{});}
  `;
  source = source.replace("if (req.method === 'GET' && req.url === '/health')", qaRoutes + "if (req.method === 'GET' && req.url === '/health')");
  const toolbar = "<main><div class=\"row\"><button onclick=\"fetch('/qa/lesson',{method:'POST'}).then(()=>refresh())\">QA: обычный урок</button><button onclick=\"fetch('/qa/closed',{method:'POST'}).then(()=>choices()).then(()=>refresh())\">QA: закрыть редактор</button></div>";
  source = source.replace(".replace('__LOCAL_KEY__', localKey)", ".replace('__LOCAL_KEY__', localKey).replace('<main>', " + JSON.stringify(toolbar) + ")");
  fs.writeFileSync(path.join(app, 'app.mjs'), source);
  const child = spawn(process.execPath, [path.join(app, 'app.mjs')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, IVAN100_RECORDER_HOME: root } });
  let log = ''; child.stdout.on('data', value => log += value); child.stderr.on('data', value => log += value);
  const base = `http://127.0.0.1:${port}`;
  let key;
  for (let i = 0; i < 60; i++) { try { const html = await (await fetch(base)).text(); key = html.match(/const key='([^']+)'/)?.[1]; if (key) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  if (!key) { child.kill(); platform.close(); throw Error(log); }
  const request = async (route, payload) => {
    const response = await fetch(base + route, { headers: { 'X-Recorder-Key': key, 'Content-Type': 'application/json' }, ...(payload === undefined ? {} : { method: 'POST', body: JSON.stringify(payload) }) });
    return { status: response.status, value: await response.json() };
  };
  const close = async () => { child.kill(); await new Promise(resolve => child.once('exit', resolve)); await new Promise(resolve => platform.close(resolve)); if(!process.argv.includes('--keep'))fs.rmSync(root, { recursive: true, force: true }); };
  return { base, root, request, ordinary, close };
}
if (process.argv.includes('--serve')) {
  const qa = await fixture(); console.log(JSON.stringify({ base: qa.base, root: qa.root }));
  process.on('SIGINT', () => { void qa.close().then(() => process.exit(0)); });
} else {
  test('real preview API streams scoped media ranges, reuses unchanged cuts and cannot expose recorder controls', { skip: !hasFfmpeg && 'FFmpeg is not installed on this host; real media is tested on the recorder workstation' }, async t => {
    const f = await fixture({mediaFixture:true}); t.after(f.close);
    await f.request('/python/configure',{mode:'screen',screen:'python-monitor',mic:'python-mic'});
    await f.request('/python/start',{taskNumber:101,subsectionId:'__default__',expectedUrl:'',title:'QA потоковый просмотр'});
    const id=(await f.request('/state')).value.jobs[0].id;
    await f.request('/qa/time',{seconds:2});await f.request('/material/pause',{id,paused:true});
    const project=async()=>(await f.request('/state')).value.jobs.find(j=>j.id===id);
    const first=await project();
    const preview=await f.request('/python/editor/preview',{id,revision:first.pythonTimeline.revision,clipId:first.pythonTimeline.clips[0].id});
    assert.equal(preview.status,200);const {videoUrl,previewId}=preview.value;assert.ok(videoUrl.includes(previewId));
    assert.equal((await fetch(f.base+videoUrl.split('?')[0])).status,403);
    assert.equal((await fetch(f.base+videoUrl+'bad')).status,403);
    assert.equal((await fetch(f.base+videoUrl,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    const video=await fetch(f.base+videoUrl,{headers:{Range:'bytes=0-63'}});assert.equal(video.status,206);assert.equal((await video.arrayBuffer()).byteLength,64);
    const access=new URL(videoUrl,f.base).searchParams.get('access');assert.equal((await fetch(f.base+'/state?access='+access)).status,403);
    assert.equal((await fetch(f.base+'/python/editor/edit?access='+access,{method:'POST',body:'{}'})).status,403);
    const second=await f.request('/python/editor/preview',{id,revision:first.pythonTimeline.revision,clipId:first.pythonTimeline.clips[0].id});assert.equal(second.value.previewId,previewId);
    await f.request('/python/editor/edit',{id,revision:first.pythonTimeline.revision,action:'trim',clipId:first.pythonTimeline.clips[0].id,start:.5,end:1.5});
    const edited=await project();const third=await f.request('/python/editor/preview',{id,revision:edited.pythonTimeline.revision,clipId:edited.pythonTimeline.clips[0].id});assert.notEqual(third.value.previewId,previewId);
    assert.equal((await f.request('/python/editor/edit',{id,revision:edited.pythonTimeline.revision,action:'restore-source'})).status,400,'Live source cannot replace the timeline');
    await f.request('/material/stop',{id});const stopped=await project();
    assert.equal((await f.request('/python/editor/edit',{id,revision:stopped.pythonTimeline.revision,action:'restore-source'})).status,200);
    const restored=await project();assert.equal(restored.pythonTimeline.clips[0].start,0);assert.equal(restored.pythonTimeline.approved,false);
    assert.equal(restored.url,undefined);assert.equal((await f.request('/upload',{id})).status,400,'Restoration does not approve upload');
  });
  test('real service confirms delayed pause/resume, returns take boundaries and offers only the owned read-only recording preview', async t => {
    const f = await fixture({pauseDelayMs:700}); t.after(f.close);
    await f.request('/python/configure',{mode:'screen',screen:'python-monitor',mic:'python-mic'});
    await f.request('/python/start',{taskNumber:101,subsectionId:'__default__',expectedUrl:'',title:'Дубли Python'});
    const id=(await f.request('/state')).value.jobs[0].id;
    const before=(await f.request('/qa/events')).value;
    const preview=await f.request(`/python/editor/live?id=${id}`);assert.equal(preview.status,200);assert.match(preview.value.image,/^data:image/);
    assert.equal((await f.request('/python/editor/live?id=other')).status,400);
    assert.equal((await fetch(f.base+`/python/editor/live?id=${id}`)).status,403);
    const after=(await f.request('/qa/events')).value;
    assert.equal(after.scene,before.scene);assert.equal(after.owner,before.owner);
    assert.equal(after.events.filter(([type])=>type==='SetCurrentProgramScene').length,before.events.filter(([type])=>type==='SetCurrentProgramScene').length);
    assert.ok(after.events.some(([type,p])=>type==='GetSourceScreenshot'&&p.sourceName==='IVAN100 Python — Экран'&&p.imageWidth===960));
    await f.request('/qa/time',{seconds:20});
    const pausing=f.request('/material/pause',{id,paused:true});await new Promise(r=>setTimeout(r,150));
    assert.equal((await f.request('/state')).value.materialControlBusy,true);
    const paused=await pausing;assert.equal(paused.status,200);assert.equal(paused.value.recording.outputPaused,true);
    assert.deepEqual(paused.value.pythonTimeline.clips.map(c=>[c.start,c.end,c.takeNumber]),[[0,20,1]]);
    assert.equal(paused.value.pythonTimeline.history,undefined);
    const resumed=await f.request('/material/pause',{id,paused:false});assert.equal(resumed.status,200);assert.equal(resumed.value.recording.outputPaused,false);
    await f.request('/qa/time',{seconds:28});
    const second=await f.request('/material/pause',{id,paused:true});
    assert.deepEqual(second.value.pythonTimeline.clips.map(c=>[c.start,c.end,c.takeNumber]),[[0,20,1],[20,28,2]]);
    const events=(await f.request('/qa/events')).value.events;
    assert.equal(events.filter(([type])=>type==='PauseRecord').length,2);assert.equal(events.filter(([type])=>type==='ResumeRecord').length,1);
    await f.request('/material/stop',{id});assert.equal((await f.request(`/python/editor/live?id=${id}`)).status,400);
  });
  test('live Python montage API persists edits and prevents every publication path before approval', async t => {
    const f = await fixture({ queueEnabled: true }); t.after(f.close);
    const capture={mode:'screen',screen:'python-monitor',mic:'python-mic'};
    await f.request('/python/configure',capture);
    await f.request('/python/start',{taskNumber:101,subsectionId:'__default__',expectedUrl:'',title:'Монтаж Python'});
    let current=(await f.request('/state')).value; const id=current.jobs[0].id;
    await f.request('/qa/time',{seconds:12}); await f.request('/material/pause',{id,paused:true});
    current=(await f.request('/state')).value;
    assert.equal(current.jobs[0].pythonTimeline.clips.length,1);
    const clip=current.jobs[0].pythonTimeline.clips[0];
    const edit=async(action,extra={})=>{const state=(await f.request('/state')).value.jobs.find(j=>j.id===id);return f.request('/python/editor/edit',{id,revision:state.pythonTimeline.revision,clipId:clip.id,action,...extra});};
    assert.equal((await edit('split',{at:6})).status,200);
    assert.equal((await edit('trim',{start:1,end:5})).status,200);
    assert.equal((await f.request('/python/editor/edit',{id,revision:-1,clipId:clip.id,action:'delete'})).status,400);
    assert.equal((await edit('undo')).status,200);
    current=(await f.request('/state')).value.jobs.find(j=>j.id===id);
    assert.equal(current.pythonTimeline.canRedo,true); assert.equal(current.pythonTimeline.future,undefined);
    assert.equal((await edit('redo')).status,200); assert.equal((await edit('undo')).status,200);
    const second=current.pythonTimeline.clips[1].id;
    assert.equal((await edit('reorder',{clipId:second,beforeId:clip.id})).status,200);
    assert.equal((await f.request('/state')).value.jobs.find(j=>j.id===id).pythonTimeline.clips[0].id,second);
    assert.equal((await edit('undo')).status,200);
    assert.equal((await f.request('/python/editor/publish',{id,revision:3})).status,400,'Live capture cannot publish');
    await f.request('/material/pause',{id,paused:false}); await f.request('/qa/time',{seconds:24}); await f.request('/material/pause',{id,paused:true});
    await f.request('/material/stop',{id});
    await new Promise(resolve=>setTimeout(resolve,1100));
    current=(await f.request('/state')).value.jobs.find(j=>j.id===id);
    assert.equal(current.pythonTimeline.clips.length,3);
    assert.equal(current.pythonTimeline.finalized,true); assert.equal(current.pythonTimeline.approved,false);
    assert.equal(current.status,'saved'); assert.equal(current.mp4,undefined); assert.equal(current.url,undefined);
    assert.equal((await f.request('/upload',{id})).status,400);
    assert.equal((await f.request('/attach',{id,url:'https://rutube.ru/video/private/'+'a'.repeat(32)+'/?p=fixture'})).status,400);
    assert.equal((await fetch(f.base+'/python/editor/edit',{method:'POST',body:JSON.stringify({id,action:'delete'})})).status,403);
    assert.equal((await f.request('/python/editor/edit',{id:'other-id',revision:current.pythonTimeline.revision,action:'delete',clipId:clip.id})).status,400);
    const disk=JSON.parse(fs.readFileSync(path.join(f.root,'state.json')));
    assert.equal(disk.jobs[id].pythonTimeline.clips.length,3); assert.ok(disk.jobs[id].pythonTimeline.history.length);
    assert.equal((await f.request('/python/editor/publish',{id,revision:current.pythonTimeline.revision})).status,200);
    assert.equal((await f.request('/state')).value.jobs.find(j=>j.id===id).pythonTimeline.approved,true);
    assert.equal((await edit('delete')).status,400,'Approved montage frozen');
  });
  test('actual API uses Python settings for capture, keeps one output through pause/switch/stop, then restores ordinary lesson sources', async t => {
    const f = await fixture(); t.after(f.close);
    await f.request('/choices');
    assert.equal((await f.request('/state')).value.pythonReady, false);
    const capture = { mode: 'window', platform: 'python-platform', window: 'python-editor', screen: 'python-monitor', mic: 'python-mic' };
    assert.equal((await f.request('/python/configure', capture)).status, 200);
    const configured = (await f.request('/state')).value;
    assert.equal(configured.pythonReady, true);
    assert.deepEqual({ ...configured.config, pythonCapture: undefined, token: f.ordinary.token }, { ...f.ordinary, pythonCapture: undefined });
    assert.equal((await f.request('/qa/events')).value.scene, 'IVAN100 — Платформа', 'Preview setup does not switch the lesson');
    assert.equal((await f.request('/python/preview')).status, 200);
    assert.equal((await f.request('/python/preview', {active:true})).status,200);
    assert.equal((await f.request('/qa/events')).value.scene, 'IVAN100 Python — Редактор');
    assert.equal((await f.request('/python/preview', {active:false})).status,200);
    assert.equal((await f.request('/qa/events')).value.scene, 'IVAN100 — Платформа');
    assert.equal((await f.request('/python/start', { taskNumber: 101, subsectionId: '__default__', expectedUrl: '', title: 'Тест Python' })).status, 200);
    let current = (await f.request('/state')).value; const id = current.jobs[0].id;
    assert.equal(current.jobs[0].captureProfile, 'python'); assert.equal(current.obs.scene, 'IVAN100 Python — Редактор');
    assert.equal(current.jobs[0].status, 'recording'); assert.equal(current.obs.outputActive, true);
    assert.equal((await f.request('/python/preview', {active:true})).status,200,'Delayed OBS start must retain the Python preview and binding');
    for (const route of ['/scene', '/program', '/auto-follow', '/auto-office', '/fallback']) assert.equal((await f.request(route, { mode: 'platform', window: 'lesson-editor', enabled: true })).status, 400);
    assert.equal((await f.request('/material/pause', { id, paused: true })).value.recording.outputPaused, true);
    assert.equal((await f.request('/python/configure', { window: 'second-editor' })).status, 200);
    assert.equal((await f.request('/python/configure', { mode: 'screen' })).status, 200);
    current = (await f.request('/state')).value; assert.equal(current.obs.outputPaused, true); assert.equal(current.jobs.length, 1); assert.equal(current.jobs[0].id, id);
    assert.equal((await f.request('/material/stop', { id: 'stale-id' })).status, 400);
    assert.equal((await f.request('/material/pause', { id, paused: false })).value.recording.outputPaused, false);
    assert.equal((await f.request('/material/stop', { id })).status, 200);
    assert.equal((await f.request('/state')).value.obs.outputActive, false, 'Stop must confirm inactivity before the ordinary lesson starts');
    assert.equal((await f.request('/qa/lesson', {})).status, 200);
    current = (await f.request('/state')).value; assert.equal(current.obs.scene, 'IVAN100 — Платформа'); assert.equal(current.config.platform, 'lesson-platform');
    assert.equal((await f.request('/python/configure', { window: 'python-editor' })).status, 400);
    assert.equal((await f.request('/python/preview', {active:true})).status,400,'A normal lesson must not be redirected by the Python preview');
    assert.equal((await f.request('/material/stop', { id })).status, 400, 'Stale Python finish must not stop the ordinary lesson');
    const rpc = (await f.request('/qa/events')).value;
    assert.equal(rpc.settings['IVAN100: платформа'].window, 'lesson-platform'); assert.equal(rpc.settings['IVAN100: микрофон'].device_id, 'lesson-mic');
    assert.equal(rpc.events.filter(([type]) => type === 'StartRecord').length, 2);
    assert.equal(rpc.events.filter(([type]) => type === 'StopRecord').length, 1);
  });
}
