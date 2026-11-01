'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('detachedTab',Object.freeze({
  state:()=>ipcRenderer.invoke('detached:state'),
  action:action=>ipcRenderer.invoke('detached:action',action),
  onState:callback=>ipcRenderer.on('detached:state-update',(_event,state)=>callback(state))
}));
