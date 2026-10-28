'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {EventEmitter}=require('node:events');
const {isStudentWindowUrl,openStudentWindow}=require('../student-window.cjs');
const url='https://ivan100.ru/student-view#handoff=svh_'+'a'.repeat(64);
test('only a short-lived pupil handoff can cross the desktop/browser bridge',()=>{
  assert.equal(isStudentWindowUrl(url),true);
  for(const wrong of [url.replace('https:','http:'),url.replace('ivan100.ru','evil.example'),url.replace('/student-view','/uploads/x.exe'),url.replace('#','?'),url+'&another=x',url.replace('svh_','sv_'),url.replace('https://','https://user@'),url.replace('/student-view','/student-view/'),url.replace('a'.repeat(64),'short')])assert.equal(isStudentWindowUrl(wrong),false,wrong);
});
test('supported browsers receive a new-window argument without a command shell',async()=>{
  for(const name of ['chrome.exe','msedge.exe','firefox.exe','brave.exe','browser.exe']){
    let call;
    const result=await openStudentWindow(url,{app:{getApplicationInfoForProtocol:async()=>({path:path.resolve(name)})},shell:{openExternal:()=>assert.fail('Should launch a dedicated browser window')},exists:()=>true,launch:(...args)=>{call=args;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});
    assert.equal(result.newWindow,true);assert.deepEqual(call[1],[name==='firefox.exe'?'-new-window':'--new-window',url]);assert.equal(call[2].shell,false);assert.equal(call[2].windowsHide,true);
  }
});
test('unknown handlers use Windows URL registration and invalid URLs never launch',async()=>{
  let received;
  const options={app:{getApplicationInfoForProtocol:async()=>({path:path.resolve('unrecognized.exe')})},shell:{openExternal:async value=>{received=value}},launch:()=>assert.fail('Arbitrary executable arguments must not run')};
  assert.equal((await openStudentWindow(url,options)).newWindow,false);assert.equal(received,url);
  await assert.rejects(openStudentWindow('file:///private.txt',options),/Некорректная/);
});
