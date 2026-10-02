'use strict';
const { app, BrowserWindow, WebContentsView, Menu, session, dialog, shell, desktopCapturer, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const policy = require('./policy.cjs');
const TITLE = 'IVAN100 Учитель';
const SHELL_PAGE = path.join(__dirname, 'ui/shell.html');
const PICKER_PAGE = path.join(__dirname, 'ui/sharing.html');
const icon = path.join(__dirname, 'assets/icon.png');
let mainWindow, platformView, recorderWindow, platformSession;
let state = { version: app.getVersion(), page: 'loading', recorderReady: false, download: '' };
let settings = {}, recorderOpening = null;
const pickers = new Map();
const configuredSessions = new Set();
const ownedWebContents = new Set();
let workDisplay;
function windowPlacement(width, height) {
  if (!workDisplay) return { width, height };
  const area = workDisplay.workArea;
  return { x: area.x + 24, y: area.y + 24, width: Math.min(width, area.width - 48), height: Math.min(height, area.height - 48) };
}

app.setName(TITLE);
app.setAppUserModelId('ru.ivan100.teacher');
// Development and tests use a separate profile; never borrow a browser login.
app.setPath('userData', path.join(app.getPath('appData'), app.isPackaged ? 'IVAN100 Teacher' : 'IVAN100 Teacher Dev'));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(start).catch(() => { dialog.showErrorBox(TITLE, 'Не удалось запустить приложение. Попробуйте открыть его снова.'); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { for (const entry of pickers.values()) entry.window.close(); });

function settingsFile() { return path.join(app.getPath('userData'), 'preferences.json'); }
function saveSettings() {
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch { /* An unwritable profile must not crash a lesson. */ }
}
function updateState(changes) {
  state = { ...state, ...changes };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shell:state-update', state);
}
function validShell(event) {
  return mainWindow && event.sender === mainWindow.webContents && event.senderFrame === event.sender.mainFrame && policy.isLocalPage(event.senderFrame.url, SHELL_PAGE);
}
function pickerFor(event) {
  const entry = pickers.get(event.sender.id);
  return entry && event.senderFrame === event.sender.mainFrame && policy.isLocalPage(event.senderFrame.url, PICKER_PAGE) ? entry : null;
}
function trustedRequester(contents, requestUrl, isMainFrame) {
  return contents && !contents.isDestroyed() && ownedWebContents.has(contents.id) && policy.canRequestPermission(contents.getURL(), requestUrl, isMainFrame);
}
function ownedPlatform(contents) {
  return !!contents && !contents.isDestroyed() && ownedWebContents.has(contents.id) && policy.isPlatform(contents.getURL());
}
function updateBounds() {
  if (!mainWindow || !platformView) return;
  const [width, height] = mainWindow.getContentSize();
  const offset = mainWindow.isFullScreen() ? 0 : 64;
  platformView.setBounds({ x: 0, y: offset, width, height: Math.max(0, height - offset) });
}
async function loadCabinet(url = policy.PLATFORM_URL) {
  if (!platformView || platformView.webContents.isDestroyed()) return;
  updateState({ page: 'loading' }); platformView.setVisible(false);
  try { await platformView.webContents.loadURL(url); } catch { updateState({ page: 'error' }); }
}

function guardWebContents(contents, kind) {
  ownedWebContents.add(contents.id);
  contents.once('destroyed', () => ownedWebContents.delete(contents.id));
  const allowed = url => kind === 'recorder' ? policy.isRecorder(url) : policy.isPlatform(url) || policy.isPlatformBlob(url);
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('will-navigate', (event, url) => { if (!allowed(url)) event.preventDefault(); });
  contents.on('will-redirect', (event, url) => { if (!allowed(url)) event.preventDefault(); });
  contents.on('will-frame-navigate', event => {
    if (event.isMainFrame && !allowed(event.url)) { event.preventDefault(); void openLink(event.url); }
  });
  contents.setWindowOpenHandler(({ url }) => { void openLink(url); return { action: 'deny' }; });
  contents.on('page-title-updated', event => event.preventDefault());
}
async function openLink(url) {
  const type = policy.classifyNavigation(url);
  if (type === 'recorder') return openRecorder(new URL(url).pathname + new URL(url).hash);
  if (type === 'platform') {
    const child = new BrowserWindow({ title: TITLE, ...windowPlacement(1180, 820), icon, autoHideMenuBar: true, webPreferences: { session: platformSession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    guardWebContents(child.webContents, 'platform');
    await child.loadURL(url).catch(() => dialog.showMessageBox(child, { message: 'Не удалось открыть страницу. Проверьте интернет.', buttons: ['Закрыть'] }));
    return;
  }
  if (type === 'external') await shell.openExternal(url).catch(() => {});
}

function configurePlatformSession(ses) {
  if (configuredSessions.has(ses)) return;
  configuredSessions.add(ses);
  ses.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (permission === 'fullscreen') return ownedPlatform(contents);
    if (!trustedRequester(contents, details.requestingUrl || origin, details.isMainFrame)) return false;
    if (['fullscreen', 'clipboard-sanitized-write', 'display-capture', 'speaker-selection'].includes(permission)) return true;
    if (permission === 'media') {
      const key = details.mediaType === 'video' ? 'video' : details.mediaType === 'audio' ? 'audio' : null;
      return key ? settings[key] === true : settings.audio === true && settings.video === true;
    }
    return permission === 'notifications' && settings.notifications === true;
  });
  ses.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (permission === 'fullscreen') return callback(ownedPlatform(contents));
    if (!trustedRequester(contents, details.requestingUrl, details.isMainFrame)) return callback(false);
    if (['fullscreen', 'clipboard-sanitized-write', 'display-capture', 'speaker-selection'].includes(permission)) return callback(true);
    const types = permission === 'media' ? details.mediaTypes?.filter(t => ['audio', 'video'].includes(t)) : permission === 'notifications' ? ['notifications'] : [];
    if (!types?.length) return callback(false);
    if (types.every(type => settings[type] === true)) return callback(true);
    const labels = types.map(type => ({ audio: 'микрофон', video: 'камеру', notifications: 'уведомления Windows' })[type]).join(' и ');
    try {
      const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(contents) || mainWindow, { title: TITLE, type: 'question', message: `Разрешить платформе использовать ${labels}?`, detail: 'Разрешение действует только для ivan100.ru в этом приложении. Его можно сбросить в меню «Приложение».', buttons: ['Разрешить', 'Сейчас не разрешать'], defaultId: 0, cancelId: 1, noLink: true });
      if (!trustedRequester(contents, details.requestingUrl, details.isMainFrame)) return callback(false);
      if (result.response === 0) { types.forEach(type => { settings[type] = true; }); saveSettings(); }
      callback(result.response === 0);
    } catch { callback(false); }
  });
  ses.setDisplayMediaRequestHandler((request, callback) => {
    const contents = request.frame && require('electron').webContents.fromFrame(request.frame);
    if (!request.userGesture || !request.videoRequested || !request.frame || request.frame !== request.frame.top || !trustedRequester(contents, request.securityOrigin, true)) return callback({});
    void createSharingPicker(request, callback).catch(() => callback({}));
  });
  ses.on('will-download', (_event, item, contents) => {
    if (!ownedWebContents.has(contents?.id)) { item.cancel(); return; }
    item.setSaveDialogOptions({ title: 'Сохранить файл', defaultPath: path.join(app.getPath('downloads'), policy.safeDownloadName(item.getFilename())) });
    item.on('updated', (_event, status) => {
      const total = item.getTotalBytes();
      if (status === 'progressing' && total > 0) {
        const fraction = item.getReceivedBytes() / total;
        mainWindow?.setProgressBar(fraction); updateState({ download: `Скачивание ${Math.round(fraction * 100)}%` });
      }
    });
    item.once('done', (_event, result) => { mainWindow?.setProgressBar(-1); updateState({ download: result === 'completed' ? 'Файл сохранён' : result === 'cancelled' ? '' : 'Скачивание прервано' }); });
  });
}

function recorderIsOnline() {
  return new Promise(resolve => {
    const request = http.get(policy.RECORDER_URL, response => { response.resume(); resolve(response.statusCode === 200); });
    request.setTimeout(1200, () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}
async function ensureRecorder() {
  if (await recorderIsOnline()) { updateState({ recorderReady: true }); return true; }
  const starter = path.join(app.getPath('home'), 'Ivan100Recorder', 'app', 'background.vbs');
  if (!fs.existsSync(starter)) return false;
  // Only the already installed helper; never execute a path supplied by a website.
  const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe'), [starter], { windowsHide: true, detached: true, stdio: 'ignore' });
  child.on('error', () => {}); child.unref();
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (await recorderIsOnline()) { updateState({ recorderReady: true }); return true; }
  }
  return false;
}
async function openRecorder(route = '/') {
  if (recorderOpening) return recorderOpening;
  recorderOpening = (async () => {
    if (!await ensureRecorder()) {
      updateState({ recorderReady: false });
      const { response } = await dialog.showMessageBox(mainWindow, { title: 'Пульт записи', message: 'Пульт пока недоступен на этом компьютере', detail: 'Скачайте помощник в разделе «Запись уроков» и пройдите мастер настройки. Установленные записи и настройки сохранятся.', buttons: ['Открыть установку и инструкцию', 'Позже'], defaultId: 0, cancelId: 1, noLink: true });
      if (response === 0) await openLink('https://ivan100.ru/?desktop=teacher&view=recording');
      return;
    }
    const url = new URL(route.startsWith('/') ? route : '/', policy.RECORDER_URL).href;
    if (!policy.isRecorder(url)) return;
    if (!recorderWindow || recorderWindow.isDestroyed()) {
      const helperSession = session.fromPartition('persist:recorder');
      const helperPermission = (contents, permission, url) => !!contents && ownedWebContents.has(contents.id) && policy.isRecorder(contents.getURL()) && policy.isRecorder(url) && ['clipboard-sanitized-write', 'fileSystem'].includes(permission);
      helperSession.setPermissionCheckHandler((contents, permission, origin, details) => helperPermission(contents, permission, details.requestingUrl || origin));
      helperSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(helperPermission(contents, permission, details.requestingUrl)));
      recorderWindow = new BrowserWindow({ title: 'IVAN100 — Пульт записи', ...windowPlacement(1300, 880), icon, autoHideMenuBar: true, webPreferences: { session: helperSession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      guardWebContents(recorderWindow.webContents, 'recorder');
      recorderWindow.on('closed', () => { recorderWindow = null; });
    }
    if (recorderWindow.isMinimized()) recorderWindow.restore();
    recorderWindow.show(); recorderWindow.focus();
    await recorderWindow.loadURL(url).catch(() => dialog.showMessageBox(recorderWindow, { message: 'Пульт не отвечает. Откройте ярлык «IVAN100 - Запись уроков» и повторите попытку.', buttons: ['ОК'] }));
  })();
  try { await recorderOpening; } finally { recorderOpening = null; }
}

async function createSharingPicker(request, callback) {
  const window = new BrowserWindow({ title: 'Что показать участникам?', parent: mainWindow, modal: true, ...windowPlacement(900, 670), minWidth: 650, minHeight: 500, icon, autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'sharing-preload.cjs'), partition: 'sharing-picker' } });
  window.setMenu(null);
  const entry = { window, request, sources: [], callback, finished: false };
  entry.finish = value => {
    if (entry.finished) return; entry.finished = true; pickers.delete(window.webContents.id);
    try { callback(value); } catch { /* Requesting page was closed while choosing. */ }
    if (!window.isDestroyed()) window.close();
  };
  pickers.set(window.webContents.id, entry);
  window.on('closed', () => entry.finish({}));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  await window.loadFile(PICKER_PAGE);
}
ipcMain.handle('sharing:list', async event => {
  const entry = pickerFor(event); if (!entry) throw new Error('Недоступно');
  entry.sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
  return { audioRequested: entry.request.audioRequested, sources: entry.sources.map(source => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL(), kind: source.id.startsWith('screen:') ? 'screen' : 'window' })) };
});
ipcMain.handle('sharing:choose', (event, sourceId, withAudio) => {
  const entry = pickerFor(event); if (!entry) throw new Error('Недоступно');
  const result = policy.sharingResult({ sources: entry.sources, sourceId, withAudio: withAudio === true, request: entry.request });
  entry.finish(result);
});
ipcMain.handle('sharing:cancel', event => { pickerFor(event)?.finish({}); });
ipcMain.handle('shell:state', event => { if (!validShell(event)) throw new Error('Недоступно'); return state; });
ipcMain.handle('shell:action', async (event, action) => {
  if (!validShell(event)) throw new Error('Недоступно');
  if (action === 'cabinet') { platformView.webContents.focus(); return; }
  if (action === 'recorder') return openRecorder('/');
  if (action === 'archive') return openRecorder('/archive');
  if (action === 'recording-settings') return openLink('https://ivan100.ru/?desktop=teacher&view=recording');
  if (action === 'retry') return loadCabinet();
  if (action === 'help-open') { platformView.setVisible(false); return; }
  if (action === 'help-close') { platformView.setVisible(state.page === 'ready'); return; }
});

async function start() {
  if (!app.isPackaged && process.argv.includes('--secondary-display')) {
    workDisplay = screen.getAllDisplays().find(display => display.id !== screen.getPrimaryDisplay().id);
    console.log(workDisplay ? '[QA] App opens on the secondary display.' : '[QA] Only one display is available.');
  }
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};
  platformSession = session.fromPartition('persist:teacher'); configurePlatformSession(platformSession);
  for (const name of ['shell', 'sharing-picker']) {
    const localSession = session.fromPartition(name);
    localSession.setPermissionCheckHandler(() => false);
    localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  }
  const bounds = settings.bounds || {};
  mainWindow = new BrowserWindow({ title: TITLE, ...windowPlacement(Math.max(960, Math.min(bounds.width || 1440, 2400)), Math.max(640, Math.min(bounds.height || 960, 1600))), minWidth: 800, minHeight: 600, icon, backgroundColor: '#f7f7fd', autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs'), partition: 'shell' } });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.on('resize', updateBounds); mainWindow.on('enter-full-screen', updateBounds); mainWindow.on('leave-full-screen', updateBounds);
  mainWindow.on('close', () => { if (!mainWindow.isMaximized()) settings.bounds = mainWindow.getBounds(); settings.maximized = mainWindow.isMaximized(); saveSettings(); });
  mainWindow.on('closed', () => { if (!platformView.webContents.isDestroyed()) platformView.webContents.close(); mainWindow = null; app.quit(); });
  platformView = new WebContentsView({ webPreferences: { session: platformSession, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true } });
  if (!app.isPackaged) {
    platformView.webContents.on('console-message', event => { if (event.level === 'error') console.error('[cabinet]', event.message.slice(0, 300)); });
    platformView.webContents.on('did-fail-load', (_event, code, description, _url, main) => { if (main) console.error('[cabinet load]', code, description); });
  }
  guardWebContents(platformView.webContents, 'platform');
  platformView.setBackgroundColor('#f7f7fd'); platformView.setVisible(false);
  mainWindow.contentView.addChildView(platformView); updateBounds();
  platformView.webContents.on('did-finish-load', () => { platformView.setVisible(true); updateState({ page: 'ready' }); platformView.webContents.focus(); });
  platformView.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => { if (isMainFrame && code !== -3) { platformView.setVisible(false); updateState({ page: 'error' }); } });
  platformView.webContents.on('render-process-gone', () => { platformView.setVisible(false); updateState({ page: 'error' }); });
  platformView.webContents.on('enter-html-full-screen', () => { mainWindow.setFullScreen(true); });
  platformView.webContents.on('leave-html-full-screen', () => { mainWindow.setFullScreen(false); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Приложение', submenu: [
      { label: 'Открыть кабинет', accelerator: 'Ctrl+1', click: () => platformView.webContents.focus() },
      { label: 'Пульт записи', accelerator: 'Ctrl+2', click: () => void openRecorder('/') },
      { label: 'Архив и теория', accelerator: 'Ctrl+3', click: () => void openRecorder('/archive') },
      { label: 'Установка пульта', click: () => void openLink('https://ivan100.ru/?desktop=teacher&view=recording') },
      { type: 'separator' },
      { label: 'Открыть текущую страницу в браузере', click: () => { const url = platformView.webContents.getURL(); if (policy.isPlatform(url)) void shell.openExternal(url); } },
      { label: 'Сбросить разрешения камеры и микрофона', click: () => { delete settings.audio; delete settings.video; saveSettings(); void dialog.showMessageBox(mainWindow, { message: 'Разрешения сброшены', detail: 'Уже начатый звонок продолжит работать. При следующем запросе приложение снова спросит разрешение.', buttons: ['ОК'] }); } },
      { type: 'separator' }, { role: 'quit', label: 'Выйти из приложения' }
    ] },
    { label: 'Правка', submenu: [{ role: 'undo', label: 'Отменить' }, { role: 'redo', label: 'Повторить' }, { type: 'separator' }, { role: 'cut', label: 'Вырезать' }, { role: 'copy', label: 'Копировать' }, { role: 'paste', label: 'Вставить' }, { role: 'selectAll', label: 'Выделить всё' }] },
    { label: 'Вид', submenu: [{ label: 'Обновить кабинет', accelerator: 'Ctrl+R', click: () => platformView.webContents.reload() }, { role: 'resetZoom', label: 'Масштаб 100%' }, { role: 'zoomIn', label: 'Увеличить' }, { role: 'zoomOut', label: 'Уменьшить' }, { role: 'togglefullscreen', label: 'Полный экран' }, ...(!app.isPackaged ? [
      { label: 'Диагностика кабинета', accelerator: 'Ctrl+Shift+I', click: () => platformView.webContents.toggleDevTools() },
      { label: 'Проверить окно демонстрации', accelerator: 'Ctrl+Shift+D', click: () => void createSharingPicker({ frame: platformView.webContents.mainFrame, videoRequested: true, audioRequested: true }, () => {}).catch(() => {}) }
    ] : [])] },
    { label: 'Справка', submenu: [{ label: 'Как пользоваться приложением', click: () => mainWindow.webContents.send('shell:show-help') }, { label: 'О приложении', click: () => void dialog.showMessageBox(mainWindow, { title: TITLE, message: `${TITLE} · ${app.getVersion()}`, detail: 'Приложение преподавателя для Windows. Кабинет обновляется вместе с ivan100.ru. Пульт записи устанавливается отдельно и хранит видео на вашем компьютере.', buttons: ['ОК'] }) }] }
  ]));
  await mainWindow.loadFile(SHELL_PAGE);
  if (settings.maximized) mainWindow.maximize();
  void loadCabinet();
  void recorderIsOnline().then(ready => updateState({ recorderReady: ready }));
}
