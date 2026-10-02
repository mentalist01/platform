'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('teacherApp', Object.freeze({
  action: (action, value) => ipcRenderer.invoke('shell:action', action, value),
  state: () => ipcRenderer.invoke('shell:state'),
  onState: callback => { ipcRenderer.on('shell:state-update', (_event, value) => callback(value)); },
  onHelp: callback => { ipcRenderer.on('shell:show-help', () => callback()); },
  onUpdates: callback => { ipcRenderer.on('shell:show-updates', () => callback()); }
}));
