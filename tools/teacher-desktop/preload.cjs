'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('teacherApp', Object.freeze({
  action: action => ipcRenderer.invoke('shell:action', action),
  state: () => ipcRenderer.invoke('shell:state'),
  onState: callback => { ipcRenderer.on('shell:state-update', (_event, value) => callback(value)); },
  onHelp: callback => { ipcRenderer.on('shell:show-help', () => callback()); }
}));
