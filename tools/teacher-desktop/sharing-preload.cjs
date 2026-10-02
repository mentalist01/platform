'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sharingPicker', Object.freeze({
  list: () => ipcRenderer.invoke('sharing:list'),
  choose: (sourceId, withAudio) => ipcRenderer.invoke('sharing:choose', sourceId, withAudio === true),
  cancel: () => ipcRenderer.invoke('sharing:cancel')
}));
