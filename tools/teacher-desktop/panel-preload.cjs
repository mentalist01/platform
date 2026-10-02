'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('teacherPanel', Object.freeze({
  state: () => ipcRenderer.invoke('panel:state'),
  action: (action, id) => ipcRenderer.invoke('panel:action', action, id),
  drag: id => ipcRenderer.send('panel:drag', id),
  onState: callback => ipcRenderer.on('panel:update', (_event, state) => callback(state))
}));
