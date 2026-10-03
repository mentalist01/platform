'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// The remote cabinet can save a successful login or open the local chooser.
// It cannot enumerate, decrypt or delete saved credentials or access local files.
if (process.isMainFrame && location.origin === 'https://ivan100.ru') {
  const appInfo = ipcRenderer.sendSync('teacher:app-info');
  const downloadFile = (url, name) => {
    let token = '';
    try { token = JSON.parse(localStorage.getItem('ege_user_session'))?.authToken || ''; } catch { /* Cookie-only login. */ }
    return ipcRenderer.invoke('teacher:download', url, name, token);
  };
  contextBridge.exposeInMainWorld('teacherDesktop', Object.freeze({
    isDesktop: true,
    version: appInfo.version || '',
    autoUpdates: appInfo.autoUpdates === true,
    setRecordingPrivacy: (reason, hidden) => ipcRenderer.invoke('teacher:recording-privacy', reason, hidden),
    rememberTeacherCode: (code, label, account) => ipcRenderer.invoke('teacher:remember', code, label, String(account)),
    showSavedLogins: () => ipcRenderer.invoke('teacher:chooser')
  }));
  ipcRenderer.on('teacher:fill', (_event, code) => {
    const input = document.querySelector('input[data-teacher-desktop-code]');
    if (!input || typeof code !== 'string' || location.origin !== 'https://ivan100.ru') return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, code);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  });
  // Keep authenticated attachment downloads inside the app, including links that
  // request a new tab. Generated report blobs retain Chromium's normal download.
  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (!link || event.defaultPrevented) return;
    let url;
    try { url = new URL(link.href); } catch { return; }
    if (url.origin !== location.origin || !/^\/uploads\/[^/]+$/.test(url.pathname)
      || (!link.hasAttribute('download') && url.searchParams.get('download') !== '1')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void downloadFile(url.href, link.download).catch(() => {}); // Main process shows the error.
  }, true);
}
