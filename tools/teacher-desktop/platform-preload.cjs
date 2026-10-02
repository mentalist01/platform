'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// The remote cabinet can save a successful login or open the local chooser.
// It cannot enumerate, decrypt or delete saved credentials or access local files.
if (process.isMainFrame && location.origin === 'https://ivan100.ru') {
  const appInfo = ipcRenderer.sendSync('teacher:app-info');
  contextBridge.exposeInMainWorld('teacherDesktop', Object.freeze({
    isDesktop: true,
    version: appInfo.version || '',
    autoUpdates: appInfo.autoUpdates === true,
    rememberTeacherCode: (code, label, account) => ipcRenderer.invoke('teacher:remember', code, label, String(account)),
    showSavedLogins: () => ipcRenderer.invoke('teacher:chooser')
  }));
  ipcRenderer.on('teacher:fill', (_event, code) => {
    const input = document.querySelector('input[data-teacher-desktop-code]');
    if (!input || typeof code !== 'string' || location.origin !== 'https://ivan100.ru') return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, code);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  });
}
