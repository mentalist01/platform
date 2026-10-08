import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { PythonEditMedia, sendPreview } from './python-edit-media.mjs';
import http from 'node:http';
const ffmpeg = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'C:/ProgramData/chocolatey/bin/ffmpeg.exe' : 'ffmpeg');
let available = true; try { execFileSync(ffmpeg, ['-version'], { windowsHide: true, stdio: 'ignore' }); } catch { available = false; }
const run = args => execFileSync(ffmpeg, ['-hide_banner','-loglevel','error', ...args], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });

test('restart removes only generated source playback cache and preserves recordings and exported edits', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan100-source-cache-restart-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, crypto.randomUUID()); fs.mkdirSync(folder);
  const cache = [`source-${crypto.randomUUID()}.mp4`, `source-${crypto.randomUUID()}.mp4.part.mp4`];
  const preserved = ['lesson-original.mkv', 'montage.mp4', 'source-my-video.mp4', 'preview-saved.mp4'];
  for (const name of [...cache, ...preserved]) fs.writeFileSync(path.join(folder, name), name);
  new PythonEditMedia({ root });
  for (const name of cache) assert.equal(fs.existsSync(path.join(folder, name)), false);
  for (const name of preserved) assert.equal(fs.readFileSync(path.join(folder, name), 'utf8'), name);
});

test('streaming previews serve exact byte ranges including seek/suffix, and reject malformed requests', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan100-video-range-')),file=path.join(root,'preview.mp4');
  const bytes=Buffer.from(Array.from({length:1024},(_,i)=>i%256));fs.writeFileSync(file,bytes);
  const server=http.createServer((req,res)=>sendPreview(req,res,{file}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const [range,start,end]of [['bytes=12-31',12,31],['bytes=1000-',1000,1023],['bytes=-10',1014,1023],['bytes=1000-9999',1000,1023]]){
    const r=await fetch(base,{headers:{Range:range}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/1024`);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(start,end+1));
  }
  for(const range of ['bytes=1024-','bytes=50-40','bytes=0-2,5-8','bytes=-0','garbage','bytes=-','bytes=99999999999999999-']){const r=await fetch(base,{headers:{Range:range}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */1024');await r.arrayBuffer();}
  const full=await fetch(base);assert.equal(full.status,200);assert.equal(full.headers.get('accept-ranges'),'bytes');assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);
});

test('identical range previews reuse a bounded LRU without new renders; changed ranges and missing cache are rebuilt',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan100-preview-cache-')),id=crypto.randomUUID(),file=path.join(root,`lesson-${id}.mkv`);fs.writeFileSync(file,'source');
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const media=new PythonEditMedia({root:path.join(root,'cache')});let renders=0;media.render=async(_job,_clips,_dir,out)=>{renders++;fs.writeFileSync(out,'preview');};
  const job={id,file,pythonTimeline:{revision:1}},clips=[{start:0,end:4}];
  const first=await media.preview(job,clips,root);job.pythonTimeline.revision++;
  assert.equal(await media.preview(job,[{...clips[0],id:'split-id'}],root),first);assert.equal(renders,1);assert.match(media.previews.get(first).access,/^[a-f0-9]{48}$/);
  fs.unlinkSync(media.previews.get(first).file);assert.notEqual(await media.preview(job,clips,root),first);assert.equal(renders,2);
  for(let n=5;n<9;n++)await media.preview(job,[{start:0,end:n}],root);
  assert.equal(media.previews.size,3);assert.equal(fs.readFileSync(file,'utf8'),'source');
});
test('preview reads already written frames from an unfinished MKV without stopping its writer', {timeout:30000,skip:!available&&'ffmpeg unavailable'}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan100-open-mkv-'));
  const id=crypto.randomUUID(),file=path.join(root,`lesson-${id}.mkv`);
  const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-re','-f','lavfi','-i','testsrc2=s=320x180:r=30:d=60','-c:v','libx264','-preset','ultrafast','-g','30',file],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let errors='';child.stderr.on('data',chunk=>errors+=chunk);
  t.after(async()=>{if(child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.stdin.write('q\n');await Promise.race([done,new Promise(resolve=>setTimeout(resolve,2000))]);if(child.exitCode===null)child.kill();}fs.rmSync(root,{recursive:true,force:true});});
  await new Promise(resolve=>setTimeout(resolve,6500));
  assert.equal(child.exitCode,null,errors);
  const media=new PythonEditMedia({ffmpeg,root:path.join(root,'cache')});
  const job={id,file,pythonTimeline:{revision:1,sourceEnd:6,clips:[{start:0,end:2}]}};
  const previewId=await media.preview(job,job.pythonTimeline.clips,root);
  assert.ok(fs.statSync(media.previews.get(previewId).file).size>1000);
  assert.equal(child.exitCode,null,'Reading preview never stops the source writer');
  const source = await media.playbackSource(job, 1, root);
  assert.ok(fs.statSync(source.file).size > 1000);
  assert.equal(child.exitCode,null,'Stream-copy playback never stops the source writer');
});

test('source playback keeps exact picture/audio across chunk boundaries and reuses media after edits and additional takes', {timeout:60000,skip:!available&&'ffmpeg unavailable'}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan100-source-playback-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const id=crypto.randomUUID(),file=path.join(root,`lesson-${id}.mkv`);
  run(['-y','-f','lavfi','-i','color=red:s=320x180:r=30:d=24','-f','lavfi','-i','color=blue:s=320x180:r=30:d=24','-f','lavfi','-i','color=lime:s=320x180:r=30:d=24',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=24','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=24','-f','lavfi','-i','sine=frequency=1320:sample_rate=48000:duration=24',
    '-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a][4:a][5:a]concat=n=3:v=0:a=1[a]','-map','[v]','-map','[a]','-c:v','libx264','-g','60','-c:a','aac',file]);
  const before=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const media=new PythonEditMedia({ffmpeg,root:path.join(root,'cache')}),job={id,file,pythonTimeline:{revision:1,sourceEnd:65,clips:[]}};
  const started=performance.now();
  const [first,duplicate]=await Promise.all([media.playbackSource(job,10,root),media.playbackSource(job,10,root)]);
  assert.equal(first.id,duplicate.id,'Concurrent playback requests share one preparation');
  const coldMs=performance.now()-started;
  for(const at of [.5,24.5,30.5,48.5,60.5]){
    const source=await media.playbackSource(job,at,root);
    const pixel=[...run(['-seek_timestamp','1','-ss',String(at+source.offset),'-i',source.file,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])];
    const channel=at<24?0:at<48?2:1;assert.ok(pixel[channel]>150&&pixel.every((value,index)=>index===channel||value<50),`${at}: ${pixel}`);
    const audio=run(['-seek_timestamp','1','-ss',String(at+source.offset),'-i',source.file,'-t','0.1','-vn','-f','s16le','-ac','1','-ar','48000','pipe:1']);
    let changes=0;for(let i=1;i<audio.length/2;i++)if((audio.readInt16LE(i*2)>=0)!==(audio.readInt16LE((i-1)*2)>=0))changes++;
    const frequency=changes/2/(audio.length/2/48000),expected=at<24?440:at<48?880:1320;
    assert.ok(Math.abs(frequency-expected)<40,`${at}: audio ${frequency}`);
  }
  job.pythonTimeline.revision=12;job.pythonTimeline.sourceEnd=72;
  const warmStart=performance.now(), reused=await media.playbackSource(job,12,root),warmMs=performance.now()-warmStart;
  assert.equal(reused.id,first.id,'Edits and later takes reuse completed source windows');
  const extended=await media.playbackSource(job,66,root);assert.equal(extended.sourceEnd,72);
  const stale=[...media.previews.values()].find(item=>item.sourceEnd===65);assert.ok(stale);
  assert.equal(media.work,null,'Playback does not lock editing/recording');
  assert.equal(media.sourceWork.size,0);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before);
  await assert.rejects(media.playbackSource(job,-1,root),/фрагмент/);
  t.diagnostic(JSON.stringify({coldSourceMs:Math.round(coldMs),cachedAfterEditMs:+warmMs.toFixed(2)}));
});
test('actual ffmpeg montage keeps exact colored frames, audio and original source after cuts/reorder', { timeout: 60000, skip: !available && 'ffmpeg unavailable' }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan100-edit-media-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const id = crypto.randomUUID(), file = path.join(root, `lesson-${id}.mkv`);
  run(['-y','-f','lavfi','-i','color=red:s=320x180:r=30:d=1','-f','lavfi','-i','color=blue:s=320x180:r=30:d=1','-f','lavfi','-i','color=lime:s=320x180:r=30:d=1',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=1','-f','lavfi','-i','sine=frequency=1320:sample_rate=48000:duration=1',
    '-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a][4:a][5:a]concat=n=3:v=0:a=1[a]', '-map','[v]','-map','[a]', '-c:v','libx264','-g','90','-c:a','aac',file]);
  const before = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const media = new PythonEditMedia({ ffmpeg, root: path.join(root, 'cache') });
  const job = { id, file, pythonTimeline: { revision: 3, sourceEnd: 3, clips: [{start:2.2,end:2.8},{start:.7,end:1.3}] } };
  assert.ok(Math.abs(await media.duration(job,root)-3)<.1);
  const output = path.join(root,'edited.mp4');
  await media.exclusive(job,()=>media.render(job,job.pythonTimeline.clips,root,output));
  const probe = JSON.parse(execFileSync(ffmpeg.replace(/ffmpeg(\.exe)?$/,'ffprobe$1'), ['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',output], { windowsHide:true }));
  assert.ok(Math.abs(Number(probe.format.duration)-1.2)<.15, probe.format.duration);
  assert.deepEqual(probe.streams.map(stream=>stream.codec_type),['video','audio']);
  const pixel = at => [...run(['-ss',String(at),'-i',output,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])];
  const green=pixel(.2),red=pixel(.75),blue=pixel(1.05);
  assert.ok(green[1]>150 && green[0]<50 && green[2]<50,green);
  assert.ok(red[0]>150 && red[1]<50 && red[2]<50,red);
  assert.ok(blue[2]>150 && blue[0]<50 && blue[1]<50,blue);
  const audio=run(['-i',output,'-vn','-f','s16le','-ac','1','pipe:1']);
  assert.ok(audio.length>100000); assert.ok(audio.some(value=>value>0));
  const frequency=at=>{const first=Math.floor(at*48000),last=first+4800;let changes=0;for(let i=first+1;i<last;i++)if((audio.readInt16LE(i*2)>=0)!==(audio.readInt16LE((i-1)*2)>=0))changes++;return changes/2/.1;};
  assert.ok(Math.abs(frequency(.15)-1320)<40,'Green video has green source audio');
  assert.ok(Math.abs(frequency(.75)-440)<40,'Red video has red source audio');
  assert.ok(Math.abs(frequency(1.03)-880)<40,'Blue video has blue source audio');
  const previewId=await media.preview(job,[job.pythonTimeline.clips[1]],root);
  assert.ok(fs.existsSync(media.previews.get(previewId).file)); assert.equal(media.work,null);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before);
  const busy=media.exclusive(job,async()=>{await new Promise(resolve=>setTimeout(resolve,100));});
  await assert.rejects(media.exclusive(job,async()=>{}),/Дождитесь/); await busy;
  await assert.rejects(media.render(job,[{start:-1,end:1}],root,path.join(root,'bad.mp4')),/границы/);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before);
});
