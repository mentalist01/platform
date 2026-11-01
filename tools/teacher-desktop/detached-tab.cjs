'use strict';

// Reparent the existing WebContentsView. Never recreate/load its page: calls,
// drafts, editor state and tab-local selection stay in that same renderer.
class DetachedTab {
  constructor({window,tab,tabs,onDisposed=()=>{}}){
    Object.assign(this,{window,tab,tabs,onDisposed});this.disposed=false;
    tab.onDetachedState=()=>this.render();tab.onDetachedFocus=()=>{if(window.isMinimized())window.restore();window.show();window.focus();};
    tab.onDetachedRemoved=()=>this.dispose();
    window.contentView.addChildView(tab.view);
    for(const event of ['resize','enter-full-screen','leave-full-screen'])window.on(event,()=>this.render());
    window.on('close',event=>{if(!this.disposed){event.preventDefault();tabs.close(tab.id);}});
    this.render();
  }
  state(){return {title:this.tab.title,page:this.tab.page,audible:!this.tab.view.webContents.isDestroyed()&&this.tab.view.webContents.isCurrentlyAudible()};}
  render(){
    if(this.disposed||this.window.isDestroyed())return;
    const [width,height]=this.window.getContentSize(),offset=this.window.isFullScreen()?0:38;
    this.tab.view.setBounds({x:0,y:offset,width,height:Math.max(0,height-offset)});
    this.tab.view.setVisible(this.tab.page==='ready');
    this.window.setTitle('IVAN100 · '+this.tab.title+' · отдельное окно');
    this.window.webContents.send('detached:state-update',this.state());
  }
  async returnToTabs(){
    if(this.disposed)return;
    this.window.contentView.removeChildView(this.tab.view);
    try{await this.tabs.restoreTab(this.tab);}catch(error){if(this.tab.detached)this.window.contentView.addChildView(this.tab.view);throw error;}
    this.dispose();
  }
  reload(){return this.tabs.reload(this.tab.id);}
  close(){return this.tabs.close(this.tab.id);}
  dispose(){
    if(this.disposed)return;this.disposed=true;
    this.tab.onDetachedState=null;this.tab.onDetachedFocus=null;this.tab.onDetachedRemoved=null;
    try{this.window.contentView.removeChildView(this.tab.view);}catch{}
    this.onDisposed();if(!this.window.isDestroyed())this.window.destroy();
  }
}
module.exports={DetachedTab};
