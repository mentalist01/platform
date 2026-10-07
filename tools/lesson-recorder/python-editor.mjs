import { clamp, timelineLayout, clipAtTime, timeToPixel, pixelToTime, snapTime, trimmedRange } from './python-editor-time.mjs';
const context = window.recorderEditorContext;
const style = document.createElement('style');
style.textContent = `
.python-editor[hidden],.python-editor [hidden]{display:none!important}.python-editor{margin-top:24px;overflow:hidden;border:1px solid #51416f;background:linear-gradient(135deg,#211b35,#121a29);border-radius:22px;color:#e9edf8;box-shadow:0 12px 35px #06091330}.pe-header{padding:22px 24px;border-bottom:1px solid #ffffff12;display:flex;align-items:center;gap:16px;flex-wrap:wrap}.pe-header h2{font-size:21px;margin:5px 0}.pe-header>div{flex:1;min-width:190px}.pe-header p{font-size:12px;margin:0}.python-editor button{font:600 12px Segoe UI,sans-serif;white-space:nowrap;transition:background .15s,border-color .15s}.python-editor button:focus-visible,.python-editor input:focus-visible{outline:2px solid #bba2ff;outline-offset:3px}.pe-project{max-width:300px;min-width:0}.pe-workspace{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:0}.pe-view{padding:22px;min-width:0}.pe-player{width:100%;aspect-ratio:16/9;background:#080b13;border:1px solid #ffffff0d;border-radius:14px;display:block}.pe-empty{aspect-ratio:16/9;display:grid;place-items:center;text-align:center;color:#94a0b7;background:radial-gradient(ellipse at top,#3a2854,#080c14);border-radius:14px;padding:32px}.pe-empty strong{display:block;font-size:17px;color:#e4d8ff;margin-bottom:10px}.pe-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}.pe-tools button{padding:8px 11px}.pe-status{color:#abb4cc;font-size:12px;line-height:1.6;margin-top:10px}.pe-inspector{padding:22px;border-left:1px solid #ffffff12;background:#ffffff03}.pe-inspector h3{font-size:14px;margin:0 0 15px}.pe-inspector label{font-size:11px;color:#aab4ca;display:block;margin:10px 0 5px}.pe-inspector input{width:100%;padding:9px;min-width:0}.pe-inspector .pe-tools button{flex:1}.pe-timeline{border-top:1px solid #ffffff12;padding:18px 22px 22px;position:relative}.pe-track-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}.pe-track-tools strong{flex:1;font-size:13px}.pe-track-tools input{width:100px}.pe-track-scroll{overflow-x:auto;overflow-y:hidden;overscroll-behavior:contain;padding-bottom:12px;scrollbar-color:#8261c1 #121826}.pe-ruler,.pe-track{display:flex;gap:4px;min-width:100%}.pe-ruler>span{flex:none;font-size:10px;color:#8e9ab1;position:relative;height:20px;border-left:1px solid #667085;padding-left:5px}.pe-track>button{position:relative;flex:none;height:76px;min-width:72px;overflow:hidden;text-align:left;padding:12px;border:1px solid #725095;border-radius:9px;background:linear-gradient(130deg,#45305f,#342847);color:#f5edff}.pe-track>button[aria-selected=true]{border-color:#cdaaff;box-shadow:inset 0 0 0 1px #cdaaff;background:linear-gradient(130deg,#7051a0,#423059)}.pe-track>button small{display:block;font-size:11px;margin-top:8px;opacity:.75}.pe-track>button:after{content:'';position:absolute;left:0;right:0;bottom:0;height:12px;background:repeating-linear-gradient(90deg,#b094d833 0 2px,transparent 2px 6px)}.pe-track .pe-recording{background:linear-gradient(130deg,#692f4b,#3c2637);border-color:#e57996;animation:pe-live 2s ease-in-out infinite}.pe-track .pe-recording:after{background:repeating-linear-gradient(90deg,#eaa0b833 0 2px,transparent 2px 6px)}.pe-cursor{position:absolute;top:0;bottom:0;width:2px;background:#f1ddff;pointer-events:none;box-shadow:0 0 8px #d9acff}.pe-footer{padding:15px 22px;border-top:1px solid #ffffff12;display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:#131822}.pe-footer p{font-size:12px;flex:1;margin:0}.pe-footer button{background:linear-gradient(100deg,#8855dc,#ad4bd0);border-color:#b46eee;color:#fff;padding:12px 17px}.pe-menu{position:fixed;z-index:1000;padding:7px;display:grid;gap:3px;width:230px;max-height:calc(100dvh - 24px);overflow:auto;background:#242033eF;backdrop-filter:blur(16px);border:1px solid #8670a966;border-radius:12px;box-shadow:0 16px 50px #0008}.pe-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:10px}.pe-menu button:hover{background:#9f72e333}.pe-error{color:#ffb3c5}.pe-save-note{font-size:11px;color:#8994a9;padding:0 22px 15px}@keyframes pe-live{50%{border-color:#ffa2bd}}@media(prefers-reduced-motion:reduce){.pe-recording{animation:none!important}}@media(max-width:720px){.pe-workspace{grid-template-columns:1fr}.pe-inspector{border-left:0;border-top:1px solid #ffffff12}.pe-header,.pe-view,.pe-inspector,.pe-timeline{padding:16px}.pe-project{width:100%;max-width:none}.pe-footer button{width:100%}.pe-header>div{min-width:0}}`;
document.head.append(style);
style.textContent += '.python-editor .pe-header{margin:0}.python-editor .pe-player{margin:0}.python-editor .pe-track strong{font-size:11px;white-space:nowrap}body:has(.python-editor--focus) main>:not(.python-editor){visibility:hidden}';
style.textContent += `
.pe-focus-button{margin-left:auto}.python-editor--focus{position:fixed;inset:12px;z-index:50;display:flex;flex-direction:column;max-height:calc(100dvh - 24px);margin:0}.python-editor--focus .pe-header{padding:12px 18px;flex:none}.python-editor--focus .pe-header h2{font-size:18px}.python-editor--focus .pe-workspace{flex:1;min-height:0}.python-editor--focus .pe-view{display:flex;flex-direction:column;min-height:0;padding:14px}.python-editor--focus .pe-player,.python-editor--focus .pe-empty{flex:1;min-height:0;aspect-ratio:auto;object-fit:contain}.python-editor--focus .pe-inspector{overflow-y:auto;padding:14px}.python-editor--focus .pe-inspector h3{margin-bottom:8px}.python-editor--focus .pe-inspector label{margin-top:7px}.python-editor--focus .pe-inspector input{padding:6px}.python-editor--focus .pe-inspector .pe-tools{margin-top:6px}.python-editor--focus .pe-timeline{padding:12px 18px;flex:none}.python-editor--focus .pe-track-tools{margin-bottom:8px}.python-editor--focus .pe-track>button{height:62px}.python-editor--focus .pe-footer{padding:10px 18px;flex:none}.python-editor--focus .pe-save-note{padding-bottom:8px}body:has(.python-editor--focus){overflow:hidden}body:has(.python-editor--focus) #python-transport{display:none!important}@media(max-width:720px){.python-editor--focus{inset:0;max-height:100dvh;border-radius:0;overflow-y:auto}.python-editor--focus .pe-workspace{flex:none;min-height:420px}.python-editor--focus .pe-view{min-height:320px}.python-editor--focus .pe-inspector{max-height:280px}.python-editor--focus .pe-header p{display:none}.python-editor--focus .pe-footer{position:sticky;bottom:0}.python-editor--focus .pe-project{width:auto;flex:1}}`;
const editor = document.createElement('section'); editor.className = 'python-editor'; editor.id = 'python-editor'; editor.tabIndex = 0; editor.setAttribute('aria-label', 'Монтажная студия Python');
style.textContent += '@media(max-width:720px){.python-editor--focus .pe-header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.python-editor--focus .pe-header>div{grid-column:1/-1}.python-editor--focus .pe-header .brand{font-size:10px;letter-spacing:1px}.python-editor--focus .pe-header h2{margin:4px 0;font-size:17px}.python-editor--focus .pe-project{width:100%;max-width:100%}.python-editor--focus .pe-focus-button{margin:0}}';
style.textContent += `
.pe-track-content{position:relative;width:max-content;min-width:100%;touch-action:pan-y}.pe-ruler{cursor:col-resize;touch-action:none}.pe-track>button{touch-action:pan-y;cursor:grab;min-width:40px;padding:10px 12px}.pe-track>button:after{display:none}.pe-track>button.pe-dragging{opacity:.45;cursor:grabbing}.pe-track>button strong,.pe-track>button small{pointer-events:none}.pe-trim-handle{position:absolute;top:0;bottom:0;width:10px;background:#cfb0ff40;cursor:ew-resize;touch-action:none;opacity:0}.pe-trim-handle[data-edge=in]{left:0;border-right:1px solid #dcbeff66}.pe-trim-handle[data-edge=out]{right:0;border-left:1px solid #dcbeff66}.pe-track>button[aria-selected=true] .pe-trim-handle,.pe-track>button:hover .pe-trim-handle{opacity:1}.pe-cursor{top:0;bottom:0;z-index:4}.pe-cursor:before{content:'';position:absolute;top:0;left:-4px;width:10px;height:10px;background:#e9c7ff;clip-path:polygon(0 0,100% 0,100% 60%,50% 100%,0 60%)}.pe-drop-marker{position:absolute;top:20px;bottom:0;width:3px;background:#9cffe1;z-index:5;pointer-events:none}.pe-gesture-note{font-size:11px;color:#cebcf0;min-height:16px;margin-top:8px}.pe-seek{display:flex;gap:12px;align-items:center;margin-top:12px}.pe-seek input{flex:1;min-width:60px;accent-color:#bc91ff}.pe-seek output{font:12px Consolas,monospace;white-space:nowrap}.pe-track-tools button[aria-pressed=true]{background:#67508f;border-color:#bc96ec}.pe-trim-ghost{position:absolute;top:20px;height:76px;background:#b89be733;border:1px solid #d2b6ff;border-radius:9px;pointer-events:none;z-index:3}.python-editor--focus .pe-trim-ghost{height:62px}.pe-track-scroll{scroll-behavior:auto}.pe-track-tools .pe-duration{font:12px Consolas,monospace}@media(max-width:720px){.pe-track-tools{gap:6px}.pe-track-tools strong{flex-basis:100%}.pe-seek{flex-wrap:wrap}.pe-seek output{font-size:11px}}`;
style.textContent += `.python-editor input[type=range]{height:18px;padding:0;margin:0;background:transparent;border:0}.pe-track-tools label{display:flex;align-items:center;gap:8px;margin:0}.python-editor .pe-footer{margin:0}.python-editor--focus .pe-header p{display:none}.python-editor--focus .pe-header h2{margin:3px 0;line-height:1.3}.python-editor--focus .pe-header .brand{font-size:11px;letter-spacing:1.5px}.python-editor--focus .pe-seek{margin-top:8px}.python-editor--focus .pe-view>.pe-tools{margin-top:8px}.python-editor--focus .pe-status{margin-top:8px;font-size:11px}@media(max-height:650px) and (min-width:721px){.python-editor--focus .pe-header{padding:8px 18px}.python-editor--focus .pe-track>button,.python-editor--focus .pe-trim-ghost{height:45px}.python-editor--focus .pe-gesture-note,.python-editor--focus .pe-save-note{display:none}.python-editor--focus .pe-footer{padding:6px 18px}}`;
editor.innerHTML = `<header class="pe-header"><div><span class="brand">PYTHON / МОНТАЖНАЯ СТУДИЯ</span><h2>От дубля к готовому уроку</h2><p>Записывайте, убирайте лишнее и собирайте видео. Исходник остаётся на компьютере.</p></div><select class="pe-project" aria-label="Проект монтажа Python"></select></header>
<div class="pe-workspace"><div class="pe-view"><div class="pe-monitor"><img class="pe-live-image" alt="Живой предпросмотр экрана записи Python" hidden><div class="pe-live-empty" hidden>Подключаем предпросмотр OBS…</div><span class="pe-live-label" hidden>Экран записи</span><video class="pe-player" controls playsinline hidden aria-label="Предпросмотр монтажа"></video><div class="pe-empty"><div><strong>Выберите фрагмент в ленте</strong>Нажмите «Посмотреть фрагмент», чтобы проверить изображение и звук.</div></div></div><div class="pe-session" role="status"><strong class="pe-session-title"></strong><span class="pe-session-detail"></span><span class="pe-mic" hidden><span>Микрофон</span><span class="pe-mic-track"><i></i></span></span></div><div class="pe-tools pe-record-tools"><button data-op="pause" class="pe-record-button">Ⅱ Завершить дубль · пауза</button><button data-op="retake">↻ Переснять последний дубль</button></div><div class="pe-tools pe-play-tools"><button data-op="live" hidden>↩ Экран записи</button><button data-op="preview">▶ Посмотреть фрагмент</button><button data-op="preview-all">Посмотреть весь монтаж</button></div><div class="pe-status" role="status"></div></div>
<aside class="pe-inspector"><h3>Выбранный фрагмент</h3><div class="pe-selection">Выберите фрагмент в ленте</div><label>Место разделения · секунды от начала фрагмента</label><input data-field="point" type="number" min="0" step="0.01" aria-label="Место разделения"><div class="pe-tools"><button data-op="split">✂ Разделить</button></div><label>Оставить от · секунды</label><input data-field="in" type="number" min="0" step="0.01" aria-label="Начало обрезки"><label>До · секунды</label><input data-field="out" type="number" min="0" step="0.01" aria-label="Конец обрезки"><div class="pe-tools"><button data-op="trim">Обрезать</button><button data-op="delete">Удалить</button></div><div class="pe-tools"><button data-op="move-left">← Раньше</button><button data-op="move-right">Позже →</button></div><div class="pe-tools"><button data-op="duplicate">Копия</button><button data-op="join">Объединить справа</button></div></aside></div>
<div class="pe-timeline"><div class="pe-track-tools"><strong>Видео + микрофон</strong><button data-op="undo">↶ Отменить</button><button data-op="redo">↷ Вернуть</button><button data-op="snap" aria-pressed="true">Привязка</button><label>Масштаб <input type="range" min="2" max="60" value="8" aria-label="Масштаб ленты"></label><span class="pe-duration"></span></div><div class="pe-track-scroll"><div class="pe-track-content"><div class="pe-ruler"></div><div class="pe-track" role="listbox" aria-label="Фрагменты видео"></div><div class="pe-cursor"></div><div class="pe-drop-marker" hidden></div><div class="pe-trim-ghost" hidden></div></div></div><div class="pe-gesture-note">Перетащите клип, чтобы изменить порядок. Потяните за его край, чтобы обрезать.</div></div><div class="pe-save-note">Монтаж сохраняется автоматически. Delete — убрать, Ctrl+Z — отменить, Ctrl+Shift+Z — вернуть. ← / → — курсор, S — разрез. Правая кнопка — действия.</div><footer class="pe-footer"><p>После завершения записи проверьте изображение и звук. Отправится только собранное видео.</p><button data-op="publish">Выложить в изучение Python</button></footer>`;
document.querySelector('#mock-review').before(editor);
const emptyHelp = document.createElement('div');
emptyHelp.className = 'pe-get-started';
emptyHelp.innerHTML = '<strong>Начните с записи урока Python</strong><p>Выберите тему, монитор и микрофон в студии записи. Новая запись появится здесь автоматически. Каждая пауза завершает дубль — его можно обрезать, разделить или удалить.</p><button type="button">Настроить запись Python</button>';
editor.querySelector('.pe-empty').append(emptyHelp);
style.textContent += '.pe-get-started p{max-width:470px;margin:10px auto 18px;line-height:1.7}.pe-get-started button{padding:12px 18px;border-color:#a986e6;background:#7045b0;color:#fff}.pe-track-placeholder{padding:20px;color:#aab4ca;font-size:13px;min-height:76px;border:1px dashed #725095;border-radius:9px;width:100%;box-sizing:border-box}.python-editor--empty .pe-inspector{opacity:.55}.python-editor--empty .pe-footer p{color:#aab4ca}';
const focusButton = document.createElement('button'); focusButton.type = 'button'; focusButton.className = 'pe-focus-button'; focusButton.textContent = 'Развернуть редактор';
const inertBefore=new Map();
let returnFocus;
function setExpanded(expanded) {
  editor.classList.toggle('python-editor--focus', expanded);
  focusButton.textContent = expanded ? 'Свернуть редактор' : 'Развернуть редактор';
  if(expanded){editor.setAttribute('role','dialog');editor.setAttribute('aria-modal','true');for(const child of editor.parentElement.children){if(child!==editor){inertBefore.set(child,child.inert);child.inert=true;}}}
  else{editor.removeAttribute('role');editor.removeAttribute('aria-modal');for(const[child,inert]of inertBefore)child.inert=inert;inertBefore.clear();}
}
focusButton.onclick = () => {
  const expanded = !editor.classList.contains('python-editor--focus');
  setExpanded(expanded);
  if (!expanded) { returnFocus?.focus({preventScroll:true}); returnFocus = null; }
};
document.querySelector('#python-open-editor').onclick = event => {
  returnFocus = event.currentTarget; setExpanded(true); editor.focus({preventScroll:true});
};
context.openEditor = () => document.querySelector('#python-open-editor').click();
emptyHelp.querySelector('button').onclick = () => {
  setExpanded(false); const studio = document.querySelector('#python-recorder'); studio.open = true;
  studio.scrollIntoView({block:'start'}); document.querySelector('#python-refresh').focus({preventScroll:true});
};
findHeader().append(focusButton);
function findHeader() { return editor.querySelector('.pe-header'); }
const stopButton = document.createElement('button'); stopButton.type = 'button'; stopButton.dataset.op = 'stop'; stopButton.textContent = 'Завершить запись'; editor.querySelector('.pe-tools').append(stopButton);
style.textContent += `
.pe-monitor{position:relative;aspect-ratio:16/9;overflow:hidden;min-height:180px;background:#080b13;border:1px solid #7f63ac33;border-radius:14px}.pe-monitor .pe-player,.pe-monitor .pe-empty,.pe-live-image,.pe-live-empty{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;box-sizing:border-box;object-fit:contain}.pe-live-empty{display:grid;place-items:center;padding:30px;color:#b9a9d6;text-align:center}.pe-live-label{position:absolute;top:12px;left:12px;padding:7px 10px;background:#15101bde;border:1px solid #ffffff24;border-radius:9px;font-size:11px;color:#ede4ff;pointer-events:none}.pe-session{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12px;min-height:23px}.pe-session-title{color:#f0d8e3}.pe-session-detail{color:#aab4ca;flex:1}.pe-session[data-paused=true] .pe-session-title{color:#d3bcff}.pe-mic{display:flex;align-items:center;gap:7px;color:#94a0b7;font-size:11px}.pe-mic-track{width:68px;height:5px;overflow:hidden;background:#303749;border-radius:5px}.pe-mic-track i{display:block;height:100%;width:0;background:#73d5b1;border-radius:5px}.python-editor .pe-record-button{background:linear-gradient(100deg,#8a4ed1,#a63e84);border-color:#c388ec;color:#fff;padding:11px 16px;font-size:13px}.pe-record-button:disabled{cursor:wait}.pe-play-tools{border-top:1px solid #ffffff0c;padding-top:8px}.python-editor--focus .pe-monitor{flex:1;min-height:100px;aspect-ratio:auto}.pe-inspector--empty label,.pe-inspector--empty [data-field],.pe-inspector--empty .pe-tools{display:none}.pe-inspector--empty .pe-selection{line-height:1.7;color:#aab4ca}.pe-recording strong,.pe-recording small{display:block}@media(max-width:720px){.python-editor--focus .pe-monitor{flex:auto;min-height:200px;aspect-ratio:16/9}.pe-record-tools{gap:6px}.python-editor .pe-record-tools button{white-space:normal;flex:1;padding:10px 8px}.pe-inspector--empty{max-height:100px!important}.pe-session-detail{flex-basis:100%}.pe-mic{margin-left:auto}}
`;
const fitButton = document.createElement('button'); fitButton.type = 'button'; fitButton.dataset.op = 'fit'; fitButton.textContent = 'Вся лента'; findTrackTools().querySelector('label').before(fitButton);
function findTrackTools(){return editor.querySelector('.pe-track-tools');}
editor.querySelector('[aria-label="Масштаб ленты"]').max='200';
let projectId = '', selectedId = '', busy = false, videoUrl = '', previewClip = '', previewRevision = -1, signature = '', scale = 8, menu;
let playhead = 0, layout = [], snapping = true, gesture = null, inspectorSignature = '';
let previewGeneration = 0;
let liveWanted = true, liveBusy = false, editorVisible = false, transition = null, transitionError = null;
const thumbnails = new Map();
const find = selector => editor.querySelector(selector);
const field = name => find(`[data-field="${name}"]`);
const clock = seconds => { const n = Math.max(0, seconds || 0); return `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, '0')}`; };
const job = () => context.state()?.jobs.find(item => item.id === projectId);
const selection = () => job()?.pythonTimeline.clips.find(clip => clip.id === selectedId);
const totalTime = () => layout.at(-1) ? layout.at(-1).time + layout.at(-1).duration : 0;
const notify = (text, failure = false) => { find('.pe-status').textContent = text; find('.pe-status').classList.toggle('pe-error', failure); };
const discardPreview = () => { previewGeneration++; find('video').pause(); if (videoUrl) URL.revokeObjectURL(videoUrl); videoUrl = ''; previewClip = ''; liveWanted = true; find('video').removeAttribute('src'); find('video').hidden = true; find('.pe-empty').hidden = false; };
async function livePreview() {
  const current = job();
  if (liveBusy || document.hidden || !editorVisible || !liveWanted || current?.status !== 'recording' || context.pausePending?.()) return;
  liveBusy = true;
  try {
    const result = await context.request(`/python/editor/live?id=${encodeURIComponent(current.id)}`);
    if (job()?.id !== current.id || job()?.status !== 'recording' || !liveWanted) return;
    find('.pe-live-image').dataset.project = current.id; find('.pe-live-image').src = result.image; find('.pe-live-image').hidden = false; find('.pe-live-empty').hidden = true;
  } catch (error) {
    if (job()?.id !== current.id || !liveWanted || context.pausePending?.()) return;
    find('.pe-live-image').removeAttribute('src'); find('.pe-live-image').hidden = true; find('.pe-live-empty').hidden = false;
    find('.pe-live-empty').textContent = `Предпросмотр временно недоступен. ${error.message}`;
  } finally { liveBusy = false; }
}
new IntersectionObserver(entries => { editorVisible = entries[0].isIntersecting; if (editorVisible) void livePreview(); }).observe(editor);
setInterval(livePreview, 1000);
function renderMonitor(current, state) {
  const active = current?.status === 'recording' && state.jobs.some(item => item.id === current.id && item.pythonTheory);
  const live = active && liveWanted;
  if (find('.pe-live-image').dataset.project !== current?.id) find('.pe-live-image').removeAttribute('src');
  find('.pe-live-image').hidden = !live || !find('.pe-live-image').hasAttribute('src');
  find('.pe-live-empty').hidden = !live || find('.pe-live-image').hasAttribute('src');
  find('.pe-live-label').hidden = !live;
  find('.pe-player').hidden = live || !videoUrl;
  find('.pe-empty').hidden = live || Boolean(videoUrl);
  find('.pe-seek').hidden = live;
  find('[data-op=live]').hidden = !active || liveWanted;
  const timeline = current?.pythonTimeline;
  const count = timeline?.takeCount ?? timeline?.clips.length ?? 0;
  const paused = Boolean(state.obs?.outputPaused);
  const pending = transition || context.pausePending?.();
  find('.pe-session').dataset.paused = String(paused);
  find('.pe-session-title').textContent = pending ? pending.paused ? 'Завершаем дубль…' : 'Начинаем следующий дубль…' : active ? paused ? 'Запись на паузе' : `● Дубль ${count + 1} · ${clock(Math.max(0, timeline.sourceEnd - (timeline.openStart ?? timeline.sourceEnd)))}` : current ? 'Монтаж записи' : 'Подготовка записи';
  find('.pe-session-detail').textContent = pending ? 'Ждём подтверждения OBS. Повторно нажимать не нужно.' : active ? paused ? 'Дубль добавлен в ленту. Проверьте его или запишите следующий.' : '«Завершить дубль» остановит изображение и звук и добавит фрагмент в ленту.' : current ? 'Выберите фрагмент, проверьте монтаж и выложите готовое видео.' : 'Настройте источники и начните запись Python.';
  const meter = state.obs?.meters?.find(item => item.inputName === 'IVAN100 Python: микрофон');
  const level = Math.max(0, ...(meter?.inputLevelsMul || []).flat());
  find('.pe-mic').hidden = !active;
  find('.pe-mic i').style.width = `${Math.min(100, Math.max(0, 100 + 20 * Math.log10(level || .00001)) * 1.5)}%`;
}
const thumbnailKey = clip => `${projectId}:${clip.id}:${clip.start}:${clip.end}`;
function paintThumbnail(button, clip) {
  const url = thumbnails.get(thumbnailKey(clip));
  if(url){button.style.backgroundImage=`linear-gradient(0deg,#1d112cdd,#1d112c55),url("${url}")`;button.style.backgroundSize='cover';button.style.backgroundPosition='center';}
}
function videoEvent(video, event, change) {
  return new Promise((resolve,reject)=>{
    const finish=error=>{clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',fail);error?reject(error):resolve();};
    const ok=()=>finish(),fail=()=>finish(Error('Thumbnail decoder unavailable'));
    const timer=setTimeout(fail,5000);video.addEventListener(event,ok);video.addEventListener('error',fail);change();
  });
}
async function makeThumbnails(url, clips, all, generation) {
  const decoder=document.createElement('video'); decoder.muted=true; decoder.preload='auto';
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const paint=canvas.getContext('2d');
  try{
    await videoEvent(decoder,'loadeddata',()=>{decoder.src=url;decoder.load();});
    let offset=0;
    // Decode a bounded number of small frames, never a whole video into memory.
    for(const clip of clips.slice(0,32)){
      if(generation!==previewGeneration)return;
      const duration=clip.end-clip.start,at=Math.min(decoder.duration-.04,(all?offset:0)+Math.min(.1,duration/2));offset+=duration;
      if(Math.abs(decoder.currentTime-at)>.001)await videoEvent(decoder,'seeked',()=>{decoder.currentTime=Math.max(0,at);});
      if(generation!==previewGeneration)return;
      paint.drawImage(decoder,0,0,160,90); thumbnails.set(thumbnailKey(clip),canvas.toDataURL('image/jpeg',.65));
      while(thumbnails.size>128)thumbnails.delete(thumbnails.keys().next().value);
      const button=find(`[data-clip-id="${clip.id}"]`);if(button)paintThumbnail(button,clip);
    }
  }catch{/* A missing thumbnail must never prevent playback, editing or recording. */}
  finally{decoder.removeAttribute('src');decoder.load();}
}
const act = async operation => {
  if (busy) return; busy = true; notify(''); render();
  try { await operation(); } catch (error) { notify(error.message, true); }
  finally { busy = false; await context.refresh(); render(); }
};
async function edit(action, extra = {}) {
  const current = job(); await context.request('/python/editor/edit', { id: current.id, revision: current.pythonTimeline.revision, action, clipId: selectedId, ...extra });
  discardPreview(); signature = ''; await context.refresh(); render(); notify('Монтаж сохранён. Исходник не изменён.');
}
function select(id) { selectedId = id; if (previewClip && previewClip !== id) discardPreview(); signature = ''; render(); find('.pe-track button[aria-selected="true"]')?.focus({preventScroll:true}); }
const seek = document.createElement('div'); seek.className = 'pe-seek';
seek.innerHTML = '<input type="range" min="0" max="0" value="0" step="0.01" aria-label="Курсор монтажа"><output aria-live="off">0:00.0 / 0:00.0</output>';
find('.pe-tools').before(seek);
function setPlayhead(seconds, seekVideo = true, choose = true, updatePoint = true) {
  playhead = clamp(seconds, 0, totalTime());
  const item = clipAtTime(layout, playhead);
  if (choose && item && selectedId !== item.id) select(item.id);
  if (seekVideo && videoUrl && previewRevision === job()?.pythonTimeline.revision) {
    const secondsInPreview = previewClip ? playhead - layout.find(part => part.id === previewClip)?.time : playhead;
    if (Number.isFinite(secondsInPreview) && secondsInPreview >= 0 && (!previewClip || secondsInPreview <= selection()?.end - selection()?.start)) find('video').currentTime = secondsInPreview;
  }
  find('.pe-cursor').style.left = `${timeToPixel(layout, playhead)}px`;
  find('.pe-cursor').hidden = !layout.length;
  find('.pe-seek input').max = String(totalTime()); find('.pe-seek input').value = String(playhead);
  find('.pe-seek output').textContent = `${clock(playhead)} / ${clock(totalTime())}`;
  if (updatePoint && item && item.id === selectedId && document.activeElement !== field('point')) field('point').value = (playhead - item.time).toFixed(2);
}
find('.pe-seek input').oninput = event => setPlayhead(Number(event.target.value));
async function preview(all = false) {
  const current = job(), requested = structuredClone(selection()), requestedClips = structuredClone(current.pythonTimeline.clips); notify('Готовим предпросмотр…');
  const response = await context.request('/python/editor/preview', { id: current.id, revision: current.pythonTimeline.revision, ...(all ? {} : { clipId: requested.id }) });
  const res = await fetch(`/python/editor/video/${response.previewId}`, { headers: { 'X-Recorder-Key': context.key } });
  if (!res.ok) throw Error('Предпросмотр недоступен. Попробуйте снова.');
  const bytes = await res.blob(); discardPreview(); videoUrl = URL.createObjectURL(bytes);
  liveWanted = false;
  previewClip = all ? '' : requested.id; previewRevision = response.revision;
  find('.pe-player').src = videoUrl; renderMonitor(current, context.state());
  const offset = all ? playhead : clamp(playhead - (layout.find(part => part.id === requested.id)?.time || 0), 0, requested.end - requested.start);
  find('video').onloadedmetadata = () => { find('video').currentTime = Math.min(offset, find('video').duration); };
  notify(all ? 'Предпросмотр всего монтажа. Проверьте звук и стыки.' : 'Фрагмент готов к просмотру. Остановите воспроизведение в месте разреза.');
  void makeThumbnails(videoUrl,all?requestedClips:[requested],all,previewGeneration);
}
function render() {
  const state = context.state(); if (!state) return;
  if (gesture) return;
  const projects = state.jobs.filter(item => item.pythonTimeline);
  editor.classList.toggle('python-editor--empty', !projects.length);
  emptyHelp.hidden = Boolean(projects.length);
  find('.pe-empty').firstElementChild.hidden = !projects.length;
  find('.pe-seek input').disabled = !projects.length;
  find('[aria-label="Масштаб ленты"]').disabled = !projects.length;
  find('select').disabled = !projects.length;
  if (!projects.length) {
    if (projectId || videoUrl) discardPreview();
    projectId = ''; selectedId = ''; signature = ''; inspectorSignature = ''; layout = []; playhead = 0;
    find('select').dataset.options = '';
    find('select').replaceChildren(new Option('Пока нет монтажных проектов', ''));
    editor.querySelectorAll('[data-op], [data-field]').forEach(control => { control.disabled = true; });
    find('.pe-selection').textContent = 'Фрагменты появятся после первой паузы';
    find('.pe-ruler').replaceChildren();
    find('.pe-track').innerHTML = '<div class="pe-track-placeholder">Здесь будут фрагменты вашего урока</div>';
    find('.pe-duration').textContent = 'Итого 0:00.0';
    find('.pe-cursor').hidden = true;
    find('.pe-seek input').value = '0'; find('.pe-seek output').textContent = '0:00.0 / 0:00.0';
    find('.pe-inspector').classList.add('pe-inspector--empty'); renderMonitor(null, state);
    return;
  }
  const active = projects.find(item => ['starting', 'recording', 'stopping'].includes(item.status));
  if (active && active.id !== projectId || !projects.some(item => item.id === projectId)) { projectId = active?.id || projects[0].id; selectedId = ''; signature = ''; playhead = 0; discardPreview(); }
  const selectProject = find('select');
  const options = projects.map(item => `${item.id}:${item.title}:${item.status}`).join('|');
  if (selectProject.dataset.options !== options) {
      selectProject.replaceChildren(...projects.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title + (item.pythonTimeline.approved ? item.status==='ready'?' · опубликовано':item.status==='error'?' · ошибка отправки':' · сборка / отправка' : item.status === 'recording' ? ' · запись' : ' · черновик'); return option; }));
    selectProject.dataset.options = options;
  }
  selectProject.value = projectId;
  const current = job(), timeline = current.pythonTimeline;
  const anyActive = state.jobs.some(item => ["starting","recording","stopping"].includes(item.status));
  const isActive = current.status === 'recording' && active?.id === current.id;
  const waiting = busy || Boolean(context.pausePending?.()) || Boolean(state.materialControlBusy) || Boolean(state.editorBusy) || Boolean(state.updater?.busy) || Boolean(state.uploadingId);
  const locked = waiting || timeline.approved;
  layout = timelineLayout(timeline.clips, scale);
  if (!timeline.clips.some(clip => clip.id === selectedId)) selectedId = clipAtTime(layout,playhead)?.id || '';
  const selected = selection();
  find('.pe-inspector').classList.toggle('pe-inspector--empty', !selected);
  if (transitionError?.id === current.id && state.obs?.outputActive && state.obs.outputPaused === transitionError.paused && (transitionError.paused ? timeline.openStart === null : timeline.openStart !== null)) { transitionError = null; notify('OBS подтвердил состояние записи.'); }
  const nextSignature = JSON.stringify([projectId, timeline.revision, selectedId, scale, timeline.clips]);
  if (nextSignature !== signature) {
    signature = nextSignature;
    const track = find('.pe-track'), ruler = find('.pe-ruler'); track.replaceChildren(); ruler.replaceChildren();
    timeline.clips.forEach((clip, index) => {
      const { width, time } = layout[index];
      const mark = document.createElement('span'); mark.style.width = `${width}px`; mark.textContent = clock(time); ruler.append(mark);
      const button = document.createElement('button'); button.type = 'button'; button.style.width = `${width}px`; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(clip.id === selectedId)); button.setAttribute('aria-label', `Фрагмент ${index + 1}, ${clock(clip.end - clip.start)}`);
      button.dataset.clipId = clip.id;
      const title = document.createElement('strong'); title.textContent = clip.takeNumber ? `Дубль ${clip.takeNumber}` : `Фрагмент ${index + 1}`; const duration = document.createElement('small'); duration.textContent = clock(clip.end - clip.start); button.append(title, duration);
      paintThumbnail(button,clip);
      for (const edge of ['in','out']) { const handle = document.createElement('span'); handle.className = 'pe-trim-handle'; handle.dataset.edge = edge; handle.setAttribute('aria-hidden','true'); button.append(handle); }
      button.onclick = event => { const rect=button.getBoundingClientRect(); select(clip.id); setPlayhead(time + clamp((event.clientX-rect.left)/width,0,1)*(clip.end-clip.start)); };
      button.oncontextmenu = event => { event.preventDefault(); const rect=button.getBoundingClientRect(); select(clip.id); setPlayhead(time + clamp((event.clientX-rect.left)/width,0,1)*(clip.end-clip.start)); showMenu(event.clientX, event.clientY); }; track.append(button);
    });
    if (selected) {
      find('.pe-selection').textContent = `Фрагмент ${timeline.clips.findIndex(clip => clip.id === selectedId) + 1} · ${clock(selected.end - selected.start)}`;
      const nextInspector=JSON.stringify([projectId,selectedId,selected.start,selected.end]);
      if(inspectorSignature!==nextInspector){inspectorSignature=nextInspector;field('point').value = ((selected.end - selected.start) / 2).toFixed(2); field('in').value = '0'; field('out').value = (selected.end - selected.start).toFixed(2);}
    } else find('.pe-selection').textContent = isActive ? 'Нажмите «Завершить дубль». Готовый фрагмент появится в ленте, и здесь откроются инструменты его редактирования.' : 'Выберите фрагмент в ленте, чтобы обрезать, разделить или удалить его.';
  }
  find('.pe-track .pe-recording')?.remove();
  if (isActive && !state.obs?.outputPaused) {
    const recording = document.createElement('button'); recording.type = 'button'; recording.className = 'pe-recording'; recording.style.width = `${Math.max(140, (timeline.sourceEnd - (timeline.openStart || 0)) * scale)}px`; const title = document.createElement('strong'); title.textContent = `● Дубль ${(timeline.takeCount ?? timeline.clips.length) + 1}`; const duration = document.createElement('small'); duration.textContent = `${clock(timeline.sourceEnd - (timeline.openStart ?? timeline.sourceEnd))} · записывается`; recording.append(title,duration); recording.onclick = () => notify('Нажмите «Завершить дубль», чтобы добавить этот фрагмент в ленту.'); find('.pe-track').append(recording);
  }
  find('.pe-duration').textContent = `Итого ${clock(timeline.clips.reduce((sum, clip) => sum + clip.end - clip.start, 0))}`;
  editor.querySelectorAll('[data-op]').forEach(button => { const op = button.dataset.op; button.disabled = locked || (!selected && !['undo', 'redo', 'snap', 'fit', 'pause', 'retake', 'publish', 'preview-all', 'live'].includes(op)); });
  find('[data-op=undo]').disabled = locked || !timeline.canUndo;
  find('[data-op=redo]').disabled = locked || !timeline.canRedo;
  find('[data-op=snap]').disabled = waiting;
  find('[data-op=fit]').disabled = waiting || !layout.length;
  const pending = transition || context.pausePending?.();
  find('[data-op=pause]').disabled = locked || !isActive || !state.obs?.outputActive; find('[data-op=pause]').textContent = pending ? pending.paused ? 'Завершаем дубль…' : 'Начинаем следующий дубль…' : state.obs?.outputPaused ? '▶ Записать следующий дубль' : 'Ⅱ Завершить дубль · пауза';
  find('[data-op=retake]').disabled = locked || !isActive || !state.obs?.outputActive || state.obs.outputPaused && !timeline.clips.length;
  find('[data-op=retake]').title = 'Убрать последний записанный дубль из монтажа и начать его заново. Исходник сохранится; Ctrl+Z вернёт дубль.';
  find('[data-op=stop]').disabled = locked || !isActive || !state.obs?.outputActive;
  find('[data-op=live]').disabled = waiting || !isActive;
  find('[data-op=publish]').disabled = locked || anyActive || !current.file || !timeline.clips.length || !timeline.finalized;
  find('[data-op=preview-all]').disabled = waiting || !timeline.clips.length || isActive && !state.obs?.outputPaused;
  find('[data-op=preview]').disabled = waiting || !selected || isActive && !state.obs?.outputPaused;
  const index=timeline.clips.findIndex(clip=>clip.id===selectedId), after=timeline.clips[index+1];
  find('[data-op=move-left]').disabled=locked||index<=0;
  find('[data-op=move-right]').disabled=locked||index<0||index>=timeline.clips.length-1;
  find('[data-op=join]').disabled=locked||!selected||!after||Math.abs(selected.end-after.start)>.001;
  editor.querySelectorAll('[data-field]').forEach(input=>{input.disabled=locked||!selected;});
  if (previewRevision !== -1 && previewRevision !== timeline.revision && videoUrl) notify('Лента изменилась. Подготовьте новый предпросмотр перед проверкой.');
  setPlayhead(playhead, false, false, false);
  renderMonitor(current, state);
}
async function setPaused(current, paused) {
  transition = { id: current.id, paused }; transitionError = null; render();
  try {
    await context.pause(current.id, paused);
    discardPreview();
    if (paused) selectedId = job()?.pythonTimeline.clips.at(-1)?.id || '';
    notify(paused ? 'Дубль завершён и добавлен в ленту. Можно просмотреть, изменить или переснять его.' : 'Записываем следующий дубль.');
  } catch (error) { transitionError = transition; throw error; }
  finally { transition = null; render(); }
}
async function operation(op) {
  if (!job()) return;
  const current = job(), selected = selection();
  if (op === 'fit') { scale=clamp((find('.pe-track-scroll').clientWidth-4*layout.length)/totalTime(),2,200); find('[aria-label="Масштаб ленты"]').value=String(scale); signature='';render();return; }
  if (op === 'snap') { snapping = !snapping; find('[data-op=snap]').setAttribute('aria-pressed',String(snapping)); return; }
  if (op === 'preview' || op === 'preview-all') return preview(op === 'preview-all');
  if (op === 'live') { discardPreview(); render(); void livePreview(); return; }
  if (op === 'pause') return setPaused(current, !context.state().obs?.outputPaused);
  if (op === 'stop') { await context.request('/material/stop', { id: current.id }); notify('Запись завершена. Просмотрите монтаж и нажмите «Выложить в изучение Python».'); return; }
  if (op === 'retake') {
    if (!context.state().obs?.outputPaused) await setPaused(current, true);
    await context.refresh(); selectedId = job().pythonTimeline.clips.at(-1)?.id || '';
    if (selectedId) await edit('retake');
    await setPaused(current, false); notify('Неудачный последний дубль убран из монтажа. Записываем новый. Ctrl+Z вернёт прежний.'); return;
  }
  if (op === 'publish') { await context.request('/python/editor/publish', { id: current.id, revision: current.pythonTimeline.revision }); notify('Собираем итоговое видео и отправляем в теорию Python.'); return; }
  if (op === 'split') return edit('split', { at: selected.start + Number(field('point').value) });
  if (op === 'trim') return edit('trim', { start: selected.start + Number(field('in').value), end: selected.start + Number(field('out').value) });
  if (op === 'move-left' || op === 'move-right') return edit('move', { direction: op === 'move-left' ? -1 : 1 });
  return edit(op);
}
editor.querySelectorAll('[data-op]').forEach(button => button.onclick = () => void act(() => operation(button.dataset.op)));
find('select').onchange = event => { projectId = event.target.value; playhead = 0; discardPreview(); select(''); };
find('[aria-label="Масштаб ленты"]').oninput = event => { scale = Number(event.target.value); signature = ''; render(); };
find('video').ontimeupdate = () => { if (videoUrl && previewRevision === job()?.pythonTimeline.revision) setPlayhead(find('video').currentTime + (previewClip ? layout.find(item=>item.id===previewClip)?.time || 0 : 0), false, false); };
editor.addEventListener('keydown', event => {
  if (event.key === 'Escape' && editor.classList.contains('python-editor--focus')) {
    event.preventDefault(); focusButton.click(); return;
  }
  if(event.key==='Tab'&&editor.classList.contains('python-editor--focus')){
    const controls=[...editor.querySelectorAll('button,input,select,video')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
  }
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || !job()) return;
  if (event.ctrlKey && event.key.toLowerCase() === 'z') { event.preventDefault(); void act(() => operation(event.shiftKey ? 'redo' : 'undo')); }
  else if (event.ctrlKey && event.key.toLowerCase() === 'y') { event.preventDefault(); void act(() => operation('redo')); }
  else if (event.key === 'Delete' && selectedId) { event.preventDefault(); void act(() => operation('delete')); }
  else if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key) && event.target.tagName !== 'VIDEO') { event.preventDefault(); setPlayhead(event.key==='Home'?0:event.key==='End'?totalTime():playhead+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?1:1/30)); }
  else if (!event.ctrlKey && event.key.toLowerCase() === 's' && !find('[data-op=split]').disabled) { event.preventDefault(); setPlayhead(playhead,false,true); void act(()=>operation('split')); }
  else if (event.code === 'Space' && videoUrl && event.target.tagName !== 'BUTTON') { event.preventDefault(); if(find('video').paused)void find('video').play().catch(()=>{});else find('video').pause(); }
});
const trackContent = find('.pe-track-content');
const trackPixel = event => event.clientX - trackContent.getBoundingClientRect().left;
const snappedPlayhead = (pixel, enabled) => {
  const seconds = pixelToTime(layout, pixel), item = clipAtTime(layout, seconds);
  return snapTime(seconds, [0,...layout.map(part=>part.time),totalTime()], item ? 8*item.duration/item.width : 0, enabled);
};
trackContent.addEventListener('pointerdown', event => {
  if(event.button!==0 || gesture || busy) return;
  if(event.target.closest('.pe-ruler')) {
    event.preventDefault(); gesture={kind:'seek',pointer:event.pointerId}; trackContent.setPointerCapture(event.pointerId);
    setPlayhead(snappedPlayhead(trackPixel(event),snapping&&!event.altKey)); return;
  }
  const button=event.target.closest('[data-clip-id]'); if(!button) return;
  const item=layout.find(part=>part.id===button.dataset.clipId);
  const locked=job().pythonTimeline.approved || context.state().editorBusy || context.state().updater?.busy || context.state().uploadingId;
  if(locked) return;
  event.preventDefault();
  gesture={kind:event.target.dataset.edge?'trim':'move',edge:event.target.dataset.edge,item,revision:job().pythonTimeline.revision,project:projectId,pointer:event.pointerId,origin:trackPixel(event),moved:false,button};
  trackContent.setPointerCapture(event.pointerId);
});
trackContent.addEventListener('pointermove', event => {
  if(!gesture || event.pointerId!==gesture.pointer) return;
  if(gesture.kind==='seek'){setPlayhead(snappedPlayhead(trackPixel(event),snapping&&!event.altKey));return;}
  const scroll=find('.pe-track-scroll'), rect=scroll.getBoundingClientRect();
  if(event.clientX<rect.left+25)scroll.scrollLeft-=12;
  else if(event.clientX>rect.right-25)scroll.scrollLeft+=12;
  const pixel=trackPixel(event), delta=pixel-gesture.origin;
  if(Math.abs(delta)<4&&!gesture.moved) return;
  gesture.moved=true; gesture.button.classList.add('pe-dragging');
  if(gesture.kind==='move') {
    const others=layout.filter(item=>item.id!==gesture.item.id), before=others.find(item=>pixel<item.x+item.width/2);
    gesture.beforeId=before?.id||null;
    const marker=find('.pe-drop-marker'); marker.hidden=false; marker.style.left=`${before?.x ?? (layout.at(-1).x+layout.at(-1).width)}px`;
    find('.pe-gesture-note').textContent=before?'Отпустите, чтобы вставить перед этим клипом':'Отпустите, чтобы поставить в конец ленты';
  } else {
    const item=gesture.item, units=item.duration/item.width, edge=gesture.edge;
    const raw=item[edge==='in'?'start':'end']+delta*units;
    const snapped=snapTime(raw,[item.start,item.end,item.start+playhead-item.time],8*units,snapping&&!event.altKey);
    gesture.range=trimmedRange(item,edge,snapped-item[edge==='in'?'start':'end']);
    const ghost=find('.pe-trim-ghost'); ghost.hidden=false;
    ghost.style.left=`${item.x+(gesture.range.start-item.start)/units}px`; ghost.style.width=`${(gesture.range.end-gesture.range.start)/units}px`;
    find('.pe-gesture-note').textContent=`Оставить ${clock(gesture.range.start-item.start)} — ${clock(gesture.range.end-item.start)} · ${clock(gesture.range.end-gesture.range.start)}. Alt — без привязки.`;
  }
});
function endGesture(event, cancelled=false) {
  if(!gesture||event.pointerId!==gesture.pointer)return;
  const done=gesture; gesture=null;
  if(trackContent.hasPointerCapture(done.pointer))trackContent.releasePointerCapture(done.pointer);
  done.button?.classList.remove('pe-dragging'); find('.pe-drop-marker').hidden=true; find('.pe-trim-ghost').hidden=true;
  find('.pe-gesture-note').textContent='Перетащите клип, чтобы изменить порядок. Потяните за его край, чтобы обрезать.';
  if(cancelled){render();return;}
  if(done.kind==='seek'){render();return;}
  if(done.project!==projectId){render();return;}
  selectedId=done.item.id;
  if(!done.moved){select(done.item.id);setPlayhead(pixelToTime(layout,trackPixel(event)));return;}
  if(done.kind==='trim'&&done.range&&(done.range.start!==done.item.start||done.range.end!==done.item.end))void act(()=>edit('trim',{clipId:done.item.id,revision:done.revision,...done.range}));
  else if(done.kind==='move')void act(()=>edit('reorder',{clipId:done.item.id,revision:done.revision,beforeId:done.beforeId}));
  else render();
}
trackContent.addEventListener('pointerup',event=>endGesture(event));
trackContent.addEventListener('pointercancel',event=>endGesture(event,true));
trackContent.addEventListener('lostpointercapture',event=>endGesture(event,true));
function showMenu(x, y) {
  menu?.remove(); menu = document.createElement('div'); menu.className = 'pe-menu'; menu.setAttribute('role', 'menu');
  for (const [op, label] of [['preview', 'Посмотреть'], ['split', 'Разделить в выбранной точке'], ['duplicate', 'Создать копию'], ['join', 'Объединить с правой частью'], ['move-left', 'Переместить раньше'], ['move-right', 'Переместить позже'], ['delete', 'Удалить из монтажа'], ['undo', 'Отменить действие'], ['redo','Вернуть действие']]) {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = label; button.disabled=find(`[data-op="${op}"]`)?.disabled; button.onclick = () => { menu.remove(); void act(() => operation(op)); }; menu.append(button);
  }
  document.body.append(menu); menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 240))}px`; menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
}
document.addEventListener('pointerdown', event => { if (menu && !menu.contains(event.target)) menu.remove(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') menu?.remove(); });
window.addEventListener('pagehide', () => { if (videoUrl) URL.revokeObjectURL(videoUrl); });
render(); setInterval(render, 1000);
