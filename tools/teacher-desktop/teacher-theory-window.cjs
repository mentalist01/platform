'use strict';
function isTeacherTheoryUrl(value){
  try{const url=new URL(value);return url.origin==='https://ivan100.ru'&&!url.username&&!url.password&&url.pathname==='/teacher-theory'&&!url.hash
    &&[...url.searchParams.keys()].length===1&&/^[a-f0-9-]{36}$/.test(url.searchParams.get('set')||'');}catch{return false;}
}
class TeacherTheoryWindows{
  constructor({BrowserWindow,session,preload,icon,placement,guard,settle=()=>new Promise(resolve=>setTimeout(resolve,150))}){
    Object.assign(this,{BrowserWindow,session,preload,icon,placement,guard,settle});this.windows=new Map();
  }
  protectedContents(contents){return [...this.windows.values()].some(window=>!window.isDestroyed()&&window.webContents===contents&&window.isContentProtected());}
  async open(url){
    if(!isTeacherTheoryUrl(url))throw Error('Некорректная ссылка текстовой теории');
    const existing=this.windows.get(url);
    if(existing&&!existing.isDestroyed()){if(existing.isMinimized())existing.restore();existing.show();existing.focus();return {opened:true,protected:true};}
    const window=new this.BrowserWindow({title:'IVAN100 · Текст учителя',...this.placement(),show:false,minWidth:480,minHeight:420,icon:this.icon,backgroundColor:'#f7f5fb',autoHideMenuBar:true,
      webPreferences:{session:this.session(),sandbox:true,contextIsolation:true,nodeIntegration:false,preload:this.preload}});
    try{
      window.setContentProtection(true);
      if(!window.isContentProtected())throw Error('Не удалось включить защиту окна от захвата');
      this.windows.set(url,window);this.guard(window.webContents,'platform');
      window.webContents.on('will-navigate',(event,next)=>{if(next!==url)event.preventDefault();});
      window.on('closed',()=>{if(this.windows.get(url)===window)this.windows.delete(url);});
      // Let Windows compose the protected, still blank window before loading
      // any personal text. The lesson window keeps focus during this step.
      window.showInactive();
      await this.settle();
      await window.loadURL(url);
      if(!window.isDestroyed()){window.show();window.focus();}
      return {opened:true,protected:true};
    }catch(error){this.windows.delete(url);window.destroy();throw error;}
  }
}
module.exports={TeacherTheoryWindows,isTeacherTheoryUrl};
