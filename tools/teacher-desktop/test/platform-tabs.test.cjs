'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {PlatformTabs}=require('../platform-tabs.cjs');

function fixture(){
  let next=0;const views=[],events=[],states=[],detached=[];
  const tabs=new PlatformTabs({
    createView:()=>{
      const contents=Object.assign(new EventEmitter(),{id:++next,destroyed:false,loads:0,reloads:0,state:{},isDestroyed(){return this.destroyed},isCurrentlyAudible(){return this.audible===true},focus(){},async loadURL(url){this.url=url;this.loads++;this.emit('did-finish-load')},reload(){this.reloads++;this.emit('did-finish-load')},close(){this.destroyed=true;this.emit('destroyed')}});
      const view={webContents:contents,setBounds(){},setVisible(value){this.visible=value;events.push(['visible',String(contents.id),value])}};views.push(view);return view;
    },attach(){},detach:view=>detached.push(view),onState:state=>states.push(state),onActive(){},
    privacy:async(reason,hidden)=>{events.push(['privacy',reason,hidden]);},afterPaint:async contents=>{events.push(['paint',String(contents.id)]);},
  });
  const settle=async()=>{await new Promise(setImmediate);await tabs.queue;};
  const add=async()=>{const id=await tabs.add();await settle();await tabs.setPrivacy(tabs.tabs.find(tab=>tab.id===id).view.webContents,'platform',false);return id;};
  return {tabs,views,events,states,detached,settle,add};
}
test('tab switches keep the original document, call and WebContents alive; reload affects only the active tab',async()=>{
  const f=fixture(),one=await f.add();const original=f.views[0];original.webContents.state={board:'saved strokes',code:'print(1)',call:'connected'};
  const two=await f.add();assert.equal(original.visible,false);assert.equal(original.webContents.destroyed,false);
  await f.tabs.activate(one);assert.equal(original.visible,true);assert.deepEqual(original.webContents.state,{board:'saved strokes',code:'print(1)',call:'connected'});
  await f.tabs.activate(two);await f.tabs.reload();assert.equal(f.views[1].webContents.reloads,1);assert.equal(original.webContents.reloads,0);assert.equal(original.webContents.loads,1);
  f.tabs.setOverlay(true);assert.equal(f.views.some(view=>view.visible),false);f.tabs.setOverlay(false);assert.equal(f.views[1].visible,true);
});
test('private background pages do not mask a lesson, but become masked before being displayed',async()=>{
  const f=fixture(),one=await f.add(),two=await f.add();await f.tabs.activate(one);f.events.length=0;
  await f.tabs.setPrivacy(f.views[1].webContents,'account',true);assert.deepEqual(f.events,[]);
  await f.tabs.activate(two);
  const mask=f.events.findIndex(event=>event[0]==='privacy'&&event[1]===`platform-tab-${two}-account`&&event[2]);
  const show=f.events.findIndex(event=>event[0]==='visible'&&event[1]===two&&event[2]);assert.ok(mask>=0&&mask<show);
  f.events.length=0;await f.tabs.activate(one);
  const paint=f.events.findIndex(event=>event[0]==='paint'&&event[1]===one);
  const reveal=f.events.findIndex(event=>event[0]==='privacy'&&event[1]===`platform-tab-${two}-account`&&!event[2]);assert.ok(paint>=0&&reveal>paint);
});
test('closing a background tab does not navigate the lesson and the last tab stays open',async()=>{
  const f=fixture(),one=await f.add(),two=await f.add();assert.equal(f.tabs.close(one),true);await f.settle();
  assert.equal(f.tabs.activeId,two);assert.equal(f.views[1].webContents.loads,1);assert.equal(f.detached.length,1);assert.equal(f.tabs.close(two),false);
  await assert.rejects(f.tabs.add('file:///private.txt'),/ivan100/);
  f.tabs.maxTabs=1;await assert.rejects(f.tabs.add(),/12/);
});
test('the title and audio indicator belong to their own tab',async()=>{
  const f=fixture();await f.add();await f.add();f.tabs.setTitle(f.views[0].webContents,'Доска · Данил');f.views[0].webContents.audible=true;f.views[0].webContents.emit('media-started-playing');
  const snapshot=f.states.at(-1);assert.equal(snapshot.tabs[0].title,'Доска · Данил');assert.equal(snapshot.tabs[0].audible,true);assert.equal(snapshot.tabs[1].audible,false);
});

test('a fresh public tab reconciles a persisted OBS mask even without in-memory ownership',async()=>{
  const f=fixture();let masked=true;
  f.tabs.privacy=async(reason,hidden)=>{masked=hidden;f.events.push(['privacy',reason,hidden]);};
  const id=await f.add();
  // The OBS process can restart after the loading mask was applied. Its filter
  // survives, while the desktop no longer has a matching appliedPrivacy key.
  f.tabs.appliedPrivacy.clear();masked=true;f.events.length=0;
  await f.tabs.setPrivacy(f.views[0].webContents,'platform',false);
  assert.equal(masked,false);
  assert.ok(f.events.some(event=>event[0]==='privacy'&&event[1]===`platform-tab-${id}-platform`&&!event[2]));
});

test('public reconciliation waits for a ready active tab and never clears private panels',async()=>{
  const f=fixture(),one=await f.add(),two=await f.add();await f.tabs.activate(one);
  f.events.length=0;
  await f.tabs.setPrivacy(f.views[1].webContents,'platform',false);
  assert.deepEqual(f.events,[]);
  f.tabs.active.page='loading';await f.tabs.setPrivacy(f.views[0].webContents,'platform',false);
  assert.ok(!f.events.some(event=>event[0]==='privacy'&&!event[2]));
  f.tabs.active.page='ready';await f.tabs.setPrivacy(f.views[0].webContents,'account',true);f.events.length=0;
  await f.tabs.setPrivacy(f.views[0].webContents,'platform',false);
  assert.ok(!f.events.some(event=>event[0]==='privacy'&&!event[2]));
  assert.equal(f.tabs.activeId,one);assert.notEqual(one,two);
});
