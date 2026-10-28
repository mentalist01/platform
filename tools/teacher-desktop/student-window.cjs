'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

function isStudentWindowUrl(value) {
  try {
    const url=new URL(value),params=new URLSearchParams(url.hash.slice(1));
    return url.origin==='https://ivan100.ru'&&!url.username&&!url.password&&url.pathname==='/student-view'
      &&!url.search&&[...params.keys()].length===1&&/^svh_[a-f0-9]{64}$/.test(params.get('handoff')||'');
  }catch{return false;}
}

async function openStudentWindow(url,{app,shell,launch=spawn,exists=fs.existsSync}) {
  if(!isStudentWindowUrl(url))throw Error('Некорректная ссылка входа за ученика.');
  let browser;try{browser=await app.getApplicationInfoForProtocol('https://ivan100.ru');}catch{/* Use the registered URL handler below. */}
  const executable=browser?.path;
  const name=path.basename(String(executable||'')).toLowerCase();
  const flags=name==='firefox.exe'?['-new-window']:['chrome.exe','msedge.exe','brave.exe','browser.exe','opera.exe','vivaldi.exe'].includes(name)?['--new-window']:null;
  if(flags&&path.isAbsolute(executable)&&exists(executable)) {
    await new Promise((resolve,reject)=>{
      const child=launch(executable,[...flags,url],{detached:true,stdio:'ignore',windowsHide:true,shell:false});
      child.once('error',()=>reject(Error('Не удалось открыть браузер. Проверьте браузер по умолчанию в Windows.')));
      child.once('spawn',()=>{child.unref();resolve();});
    });
    return {opened:true,newWindow:true};
  }
  await shell.openExternal(url);
  return {opened:true,newWindow:false};
}
module.exports={isStudentWindowUrl,openStudentWindow};
