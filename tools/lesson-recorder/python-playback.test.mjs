import test from 'node:test';import assert from 'node:assert/strict';
import {SourceTimelinePlayer,playbackPosition} from './python-playback.mjs';
class Video extends EventTarget {
  constructor(){super();this.hidden=true;this.paused=true;this.duration=100;this.readyState=1;this.volume=.6;this.playbackRate=1;this.muted=false;this.time=0;this.playCalls=0;}
  cloneNode(){return new Video();}after(){}before(){}getAttribute(name){return this[name]||null;}
  load(){queueMicrotask(()=>this.dispatchEvent(new Event('loadedmetadata')));}
  set currentTime(value){this.time=value;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}get currentTime(){return this.time;}
  async play(){this.playCalls++;this.paused=false;}pause(){this.paused=true;}
}
const flushed=()=>new Promise(resolve=>setImmediate(resolve));
test('virtual playback maps reordered, split and duplicate clips to their original positions',()=>{
  const clips=[{start:60,end:62},{start:10,end:11},{start:10,end:11}];
  assert.deepEqual(playbackPosition(clips,.5),{index:0,time:0,source:60.5});
  assert.deepEqual(playbackPosition(clips,2.5),{index:1,time:2,source:10.5});
  assert.deepEqual(playbackPosition(clips,3.5),{index:2,time:3,source:10.5});
  assert.equal(playbackPosition([],0),null);
});
test('playback preloads the next source, advances through reordered clips and stops at the montage end',async t=>{
  const previousRaf=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  t.after(()=>{globalThis.requestAnimationFrame=previousRaf;globalThis.cancelAnimationFrame=previousCancel;});
  const times=[],errors=[],requests=[];
  const player=new SourceTimelinePlayer(new Video(),async at=>{requests.push(at);const slot=Math.floor(at/30);return{videoUrl:'source-'+slot,offset:-slot*30,sourceEnd:(slot+1)*30};},at=>times.push(at),error=>errors.push(error));
  player.configure([{start:60,end:62},{start:10,end:11}]);await player.seek(0,true);await flushed();
  assert.equal(player.active.currentTime,0);assert.ok(requests.includes(10),'Next source is loaded before the cut');
  player.active.currentTime=2;player.tick();await flushed();
  assert.equal(player.active.currentTime,10);assert.equal(player.playing,true);assert.equal(player.active.volume,.6);
  player.active.currentTime=11;player.tick();assert.equal(player.playing,false);assert.equal(times.at(-1),3);assert.deepEqual(errors,[]);
});
test('a seek crossing a media-window boundary stays in the same clip and cancelled requests cannot replace a new montage',async t=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};t.after(()=>{delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;});
  const player=new SourceTimelinePlayer(new Video(),async at=>({videoUrl:'source-'+Math.floor(at/30),offset:-Math.floor(at/30)*30,sourceEnd:(Math.floor(at/30)+1)*30}),()=>{},assert.fail);
  player.configure([{start:29,end:32}]);await player.seek(.5,true);await flushed();player.active.currentTime=30;player.tick();await flushed();
  assert.equal(player.index,0);assert.equal(player.active.currentTime,0);assert.equal(player.clipTime,0);
  let release;player.resolveSource=()=>new Promise(resolve=>release=resolve);const pending=player.seek(2);player.configure([{start:5,end:6}]);release({videoUrl:'stale',offset:0,sourceEnd:30});await pending;
  assert.notEqual(player.active.getAttribute('src'),'stale');assert.equal(player.clips[0].start,5);
});

test('restarting playback at the montage end cannot resume media after the project changes',async()=>{
  let release;
  const video=new Video(),player=new SourceTimelinePlayer(video,()=>new Promise(resolve=>release=resolve),()=>{},assert.fail);
  player.configure([{start:10,end:12}]);player.time=2;
  const restart=player.play();await flushed();
  player.configure([{start:60,end:62}]);
  release({videoUrl:'old-source',offset:0,sourceEnd:30});await restart;
  assert.equal(player.playing,false);assert.equal(video.playCalls,0);
  assert.ok(player.videos.every(element=>element.paused));
  assert.deepEqual(player.clips,[{start:60,end:62}]);
});

test('same-URL seeks wait for pending metadata and only the latest seek moves the cursor',async()=>{
  const video=new Video();video.duration=NaN;video.readyState=0;
  let loads=0;video.load=()=>{loads++;};
  const player=new SourceTimelinePlayer(video,async()=>({videoUrl:'pending-source',offset:-26,sourceEnd:60}),()=>{},assert.fail);
  player.configure([{start:30,end:35}]);
  const first=player.seek(0);await flushed();
  let finished=false;
  const latest=player.seek(.75).then(()=>{finished=true;});await flushed();
  assert.equal(loads,1,'A seek to the same loading URL must not restart its request');
  assert.equal(finished,false);assert.equal(video.currentTime,0);
  video.duration=34;video.readyState=1;video.dispatchEvent(new Event('loadedmetadata'));
  await Promise.all([first,latest]);
  assert.equal(video.currentTime,4.75);assert.equal(player.time,.75);assert.equal(player.loading,false);
});
