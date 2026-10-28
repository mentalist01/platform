'use strict';
const {isPlatform,PLATFORM_URL}=require('./policy.cjs');

class PlatformTabs {
  constructor({createView,attach,detach,onState,onActive,privacy,afterPaint=async()=>{},maxTabs=12}) {
    Object.assign(this,{createView,attach,detach,onState,onActive,privacy,afterPaint,maxTabs});
    this.tabs=[];this.activeId='';this.queue=Promise.resolve();this.appliedPrivacy=new Set();this.overlay=false;
  }
  get active(){return this.tabs.find(tab=>tab.id===this.activeId)||null;}
  forContents(contents){return this.tabs.find(tab=>tab.view.webContents===contents)||null;}
  emit(){this.onState({tabs:this.tabs.map(tab=>({id:tab.id,title:tab.title,page:tab.page,audible:!tab.view.webContents.isDestroyed()&&tab.view.webContents.isCurrentlyAudible()})),activeTabId:this.activeId,page:this.active?.page||'loading'});}
  enqueue(action){const result=this.queue.catch(()=>{}).then(action);this.queue=result;return result;}
  async add(url=PLATFORM_URL+'&view=progress') {
    if(!isPlatform(url)||new URL(url).protocol!=='https:')throw Error('Во вкладках доступна только платформа ivan100.ru.');
    if(this.tabs.length>=this.maxTabs)throw Error('Открыто 12 вкладок. Закройте одну из них перед добавлением новой.');
    const view=this.createView(),contents=view.webContents;
    const tab={id:String(contents.id),view,title:'Платформа',page:'loading',privateReasons:new Set(['platform'])};
    this.tabs.push(tab);this.attach(view);view.setVisible(false);if(this.bounds)view.setBounds(this.bounds);
    contents.on('page-title-updated',(_event,title)=>{if(!tab.customTitle){tab.title=String(title||'Платформа').slice(0,100);this.emit();}});
    contents.on('did-finish-load',()=>{tab.page='ready';if(this.active===tab){this.showActive();if(!this.overlay)contents.focus();}this.emit();});
    const failed=()=>{tab.page='error';if(this.active===tab)this.showActive();this.emit();};
    contents.on('did-fail-load',(_event,code,_description,_url,main)=>{if(main&&code!==-3)failed();});
    contents.on('render-process-gone',failed);
    for(const name of ['media-started-playing','media-paused'])contents.on(name,()=>this.emit());
    contents.once('destroyed',()=>this.removed(tab));
    this.emit();
    try{await this.activate(tab.id);}catch(error){tab.page='error';this.emit();throw error;}
    void this.load(tab,url);
    return tab.id;
  }
  async load(tab,url) {
    tab.page='loading';tab.customTitle=false;tab.privateReasons.add('platform');this.showActive();this.emit();
    try{await this.setPrivacy(tab.view.webContents,'platform',true);await tab.view.webContents.loadURL(url);}
    catch{if(this.tabs.includes(tab)){tab.page='error';this.showActive();this.emit();}}
  }
  scope(tab,reason){return `platform-tab-${tab.id}-${reason}`;}
  async addPrivacy(tab) {
    for(const reason of tab.privateReasons){const key=this.scope(tab,reason);if(!this.appliedPrivacy.has(key)){await this.privacy(key,true);this.appliedPrivacy.add(key);}}
  }
  async clearOtherPrivacy(tab) {
    const desired=new Set([...tab.privateReasons].map(reason=>this.scope(tab,reason)));
    for(const key of [...this.appliedPrivacy])if(!desired.has(key)){await this.privacy(key,false);this.appliedPrivacy.delete(key);}
  }
  async syncPrivacy(tab){await this.addPrivacy(tab);await this.clearOtherPrivacy(tab);}
  activate(id) {
    return this.enqueue(async()=>{
      const tab=this.tabs.find(value=>value.id===String(id));if(!tab)return false;
      // Mask the target before displaying it. Keep the previous tab's mask until
      // the new public view has painted, so switching cannot expose finances.
      await this.addPrivacy(tab);
      this.activeId=tab.id;this.onActive(tab.view);this.showActive();this.emit();
      if(tab.page==='ready'&&!tab.privateReasons.size&&!this.overlay)await this.afterPaint(tab.view.webContents);
      await this.clearOtherPrivacy(tab);
      if(tab.page==='ready'&&!this.overlay)tab.view.webContents.focus();
      return true;
    });
  }
  setPrivacy(contents,reason,hidden) {
    const tab=this.forContents(contents);if(!tab)return null;
    if(hidden)tab.privateReasons.add(reason);else tab.privateReasons.delete(reason);
    if(this.active!==tab)return Promise.resolve({hidden,inactive:true});
    return this.enqueue(()=>this.active===tab?this.syncPrivacy(tab):undefined).then(()=>({hidden}));
  }
  showActive(){for(const tab of this.tabs)if(!tab.view.webContents.isDestroyed())tab.view.setVisible(tab.id===this.activeId&&tab.page==='ready'&&!this.overlay);}
  setOverlay(hidden){this.overlay=hidden;this.showActive();}
  setBounds(bounds){this.bounds=bounds;for(const tab of this.tabs)if(!tab.view.webContents.isDestroyed())tab.view.setBounds(bounds);}
  setTitle(contents,title){const tab=this.forContents(contents);if(!tab||typeof title!=='string')return;tab.title=title.trim().replace(/[\r\n\t]/g,' ').slice(0,100)||'Платформа';tab.customTitle=true;this.emit();}
  async reload() {
    const tab=this.active;if(!tab)return;
    tab.privateReasons.add('platform');tab.page='loading';tab.customTitle=false;this.showActive();this.emit();
    await this.setPrivacy(tab.view.webContents,'platform',true);
    tab.view.webContents.reload();
  }
  close(id=this.activeId){const tab=this.tabs.find(value=>value.id===String(id));if(!tab||this.tabs.length<2)return false;tab.view.webContents.close({waitForBeforeUnload:true});return true;}
  removed(tab){
    const index=this.tabs.indexOf(tab);if(index<0)return;
    this.tabs.splice(index,1);this.detach(tab.view);
    if(this.closing)return;
    if(tab.id===this.activeId){this.activeId='';const next=this.tabs[Math.min(index,this.tabs.length-1)];if(next)void this.activate(next.id).catch(()=>this.emit());}
    else{this.emit();}
  }
  step(offset){const index=this.tabs.findIndex(tab=>tab.id===this.activeId);const tab=this.tabs[(index+offset+this.tabs.length)%this.tabs.length];return tab?this.activate(tab.id):Promise.resolve(false);}
  destroy(){this.closing=true;for(const tab of [...this.tabs])if(!tab.view.webContents.isDestroyed())tab.view.webContents.close();this.tabs=[];}
}
module.exports={PlatformTabs};
