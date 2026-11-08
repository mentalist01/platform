'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {TeacherTheoryWindows,isTeacherTheoryUrl}=require('../teacher-theory-window.cjs');
const url='https://ivan100.ru/teacher-theory?set=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('only an exact platform notes URL is accepted',()=>{
  assert.equal(isTeacherTheoryUrl(url),true);
  for(const value of [url.replace('ivan100.ru','evil.test'),url+'&set=bbbb',url+'#token',url+'&token=secret',url.replace('/teacher-theory','/student-view'),url.replace('https:','http:')])assert.equal(isTeacherTheoryUrl(value),false);
});
test('notes use a separate protected window and the platform session; protection precedes any page or visible frame',async()=>{
  const events=[],windows=[];class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.getURL=()=>url;windows.push(this);events.push('create');}
    setContentProtection(value){this.protected=value;events.push('protect');}isContentProtected(){return this.protected;}isDestroyed(){return false;}isMinimized(){return false;}
    async loadURL(value){assert.equal(this.protected,true);assert.equal(value,url);events.push('load');}showInactive(){events.push('blank-show');}show(){events.push('show');}focus(){events.push('focus');}destroy(){events.push('destroy');}
  }
  const session={},manager=new TeacherTheoryWindows({BrowserWindow:Window,session:()=>session,preload:'preload.cjs',placement:()=>({x:1920,y:20,width:800,height:700}),guard:()=>events.push('guard'),settle:async()=>events.push('compose')});
  assert.deepEqual(await manager.open(url),{opened:true,protected:true});
  assert.deepEqual(events,['create','protect','guard','blank-show','compose','load','show','focus']);
  assert.equal(windows[0].options.show,false);assert.equal(windows[0].options.webPreferences.session,session);assert.equal(windows[0].options.webPreferences.nodeIntegration,false);
  assert.equal(manager.protectedContents(windows[0].webContents),true);
  await manager.open(url);assert.equal(windows.length,1);
  let blocked=false;windows[0].webContents.emit('will-navigate',{preventDefault(){blocked=true;}},'https://evil.test');assert.equal(blocked,true);
});
test('failure to protect never loads or shows private text',async()=>{
  let destroyed=false;class Window{constructor(){this.webContents={};}setContentProtection(){}isContentProtected(){return false;}destroy(){destroyed=true;}loadURL(){throw Error('Must not load');}show(){throw Error('Must not show');}}
  const manager=new TeacherTheoryWindows({BrowserWindow:Window,session:()=>({}),placement:()=>({})});await assert.rejects(manager.open(url),/защиту/);assert.equal(destroyed,true);
});
