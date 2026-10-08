import { clamp, timelineLayout, clipAtTime, timeToPixel, pixelToTime, snapTime, trimmedRange, cursorEdit } from './python-editor-time.mjs';
import { SourceTimelinePlayer } from './python-playback.mjs';
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
emptyHelp.innerHTML = '<strong>Запишите первый дубль</strong><p>Выберите экран, микрофон и тему справа. Нажмите «Начать запись» здесь же. Пауза добавит готовый дубль в ленту.</p>';
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
  if (!context.state()?.jobs.some(item => ['starting','recording','stopping'].includes(item.status))) void prepareRecording();
};
context.openEditor = () => document.querySelector('#python-open-editor').click();
findHeader().append(focusButton);
const prepareButton = document.createElement('button'); prepareButton.type = 'button'; prepareButton.dataset.op = 'prepare'; prepareButton.textContent = '+ Новая запись'; focusButton.before(prepareButton);
const startButton = document.createElement('button'); startButton.type = 'button'; startButton.dataset.op = 'start'; startButton.className = 'pe-record-button'; startButton.textContent = '● Начать запись'; editor.querySelector('.pe-record-tools').prepend(startButton);
const fragmentTools = document.createElement('div'); fragmentTools.className = 'pe-fragment'; fragmentTools.append(...editor.querySelector('.pe-inspector').childNodes); editor.querySelector('.pe-inspector').append(fragmentTools);
const preparation = document.createElement('div'); preparation.className = 'pe-preparation'; preparation.hidden = true;
preparation.innerHTML = '<h3>Экран, звук и тема урока</h3><p class="pe-preparation-note">Запуск создаст новый проект. Ранее записанные уроки сохранятся.</p>';
preparation.append(document.querySelector('#python-source-controls'), document.querySelector('#python-lesson-controls'));
editor.querySelector('.pe-inspector').prepend(preparation);
const inspectorTabs = document.createElement('nav'); inspectorTabs.className = 'pe-inspector-tabs'; inspectorTabs.setAttribute('aria-label','Инструменты студии');
inspectorTabs.innerHTML = '<button type="button" aria-pressed="false">Запись</button><button type="button" aria-pressed="true">Фрагмент</button>';
editor.querySelector('.pe-inspector').prepend(inspectorTabs);
// Reuse the original controls and their handlers: there is only one set of recording settings.
document.querySelector('#python-recorder .python-studio').hidden = true;
document.querySelector('#python-recorder .python-panel-body > .caption:last-child').hidden = true;
document.querySelector('#python-recorder .python-panel-body > .divider').hidden = true;
document.querySelector('#python-recorder .python-panel-body > h2').hidden = true;
document.querySelector('#python-recorder .python-panel-body > h2 + p').hidden = true;
const launchNote = document.querySelector('#python-open-editor').parentElement.querySelector('p');
launchNote.textContent = 'Всё в монтажной студии: экран и микрофон, начало записи, дубли, монтаж и публикация урока.';
document.querySelector('#python-start').hidden = true;
document.querySelector('#python-inline-pause').style.display = 'none';
document.querySelector('#python-inline-stop').style.display = 'none';
context.ownsPythonPreview = true;
style.textContent += '.python-studio[hidden]{display:none!important}';
style.textContent += `
.python-editor .pe-inspector{display:flex;flex-direction:column;min-width:0}.pe-inspector-tabs{display:flex;gap:5px;margin-bottom:14px;flex:none}.pe-inspector-tabs button{flex:1;padding:8px}.pe-inspector-tabs button[aria-pressed=true]{background:#554173;border-color:#a781dc}.pe-preparation{min-width:0}.pe-preparation p,.pe-preparation .caption{font-size:11px;margin:7px 0;line-height:1.5}.pe-preparation .setup{display:block;padding:0}.pe-preparation select,.pe-preparation input{padding:8px;font-size:12px}.pe-preparation label{font-size:11px;margin:10px 0 5px}.pe-preparation .python-scenes{gap:5px}.pe-preparation .python-scenes button{font-size:10px;padding:10px 3px;white-space:normal}.pe-preparation h2{font-size:13px;margin:14px 0 8px}.pe-preparation button{font-size:11px;padding:8px;white-space:normal}.pe-preparation #python-refresh{margin-top:15px}.pe-preparation .row{margin:0!important}.pe-preparation .wizard-note{padding:8px;font-size:11px}.pe-preparation-note{color:#acb6ce}.pe-record-tools [data-op=start]{background:linear-gradient(100deg,#7151cb,#9460da);border-color:#b78eed}.pe-fragment--empty label,.pe-fragment--empty [data-field],.pe-fragment--empty .pe-tools{display:none}.pe-fragment--empty .pe-selection{line-height:1.7;color:#aab4ca}.python-editor--empty .pe-inspector{opacity:1}.python-editor--focus .pe-preparation{overflow-y:auto;overscroll-behavior:contain}.pe-record-tools{min-height:38px}@media(max-width:720px){.python-editor--focus .pe-inspector{max-height:350px}.pe-inspector-tabs{position:sticky;top:0;background:#1c2030;padding-bottom:5px;z-index:1}.pe-preparation .setup{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pe-preparation .python-scenes button{font-size:12px}.python-editor .pe-header [data-op=prepare]{white-space:normal}.pe-preparation select{font-size:12px}}
`;
function findHeader() { return editor.querySelector('.pe-header'); }
const stopButton = document.createElement('button'); stopButton.type = 'button'; stopButton.dataset.op = 'stop'; stopButton.textContent = 'Завершить запись'; editor.querySelector('.pe-tools').append(stopButton);
const quickTools = document.createElement('div'); quickTools.className = 'pe-tools pe-quick-tools';
quickTools.innerHTML = '<button data-op="cut-cursor" title="S">✂ Разрез по курсору · S</button><button data-op="trim-start" title="Q">Убрать до курсора · Q</button><button data-op="trim-end" title="W">Убрать после курсора · W</button>';
editor.querySelector('.pe-selection').after(quickTools);
const precision = document.createElement('details'); precision.className = 'pe-precision'; precision.innerHTML = '<summary>Точные границы · секунды</summary>';
const firstLabel = editor.querySelector('.pe-fragment label'), lastGroup = editor.querySelector('[data-op=trim]').parentElement;
const deleteTools = document.createElement('div'); deleteTools.className = 'pe-tools'; deleteTools.append(editor.querySelector('[data-op=delete]')); quickTools.after(deleteTools);
firstLabel.before(precision);
for (let node = firstLabel; node;) { const next = node.nextSibling; precision.append(node); if (node === lastGroup) break; node = next; }
const restoreButton = document.createElement('button'); restoreButton.type = 'button'; restoreButton.dataset.op = 'restore-source'; restoreButton.textContent = 'Добавить исходную запись в ленту'; restoreButton.hidden = true; editor.querySelector('.pe-play-tools').append(restoreButton);
const retryButton = document.createElement('button'); retryButton.type = 'button'; retryButton.dataset.op = 'retry-upload'; retryButton.textContent = 'Повторить загрузку'; retryButton.hidden = true; editor.querySelector('.pe-footer').append(retryButton);
editor.querySelector('.pe-footer p').innerHTML = '<strong class="pe-publish-target"></strong><span class="pe-publish-summary"></span><span class="pe-publish-state" role="status"></span>';
editor.querySelector('.pe-save-note').textContent = 'Автосохранение · F8 — завершить дубль / следующий, F9 — переснять. Двойной клик — просмотр, пробел — воспроизведение. S — разрез, Q / W — убрать до / после курсора. Ctrl+Z — отмена. Клавиши работают в этом редакторе.';
style.textContent += '.pe-quick-tools{margin:12px 0;display:grid;grid-template-columns:1fr}.pe-quick-tools button{white-space:normal}.pe-publish-target,.pe-publish-summary,.pe-publish-state{display:block;line-height:1.5}.pe-publish-target{color:#eadbff}.pe-publish-summary{color:#aab4ca}.pe-publish-state{color:#93d7bc}.pe-publish-state[data-error=true]{color:#ffb3c5}.pe-track>button:hover{border-color:#c6a3f7}.pe-footer p{min-width:170px}.pe-precision{margin-top:16px;border-top:1px solid #ffffff18;padding-top:12px}.pe-precision summary{font-size:12px;color:#b7a4d7;cursor:pointer}.pe-inspector--empty .pe-precision{display:none}';
style.textContent += `
.pe-monitor{position:relative;aspect-ratio:16/9;overflow:hidden;min-height:180px;background:#080b13;border:1px solid #7f63ac33;border-radius:14px}.pe-monitor .pe-player,.pe-monitor .pe-empty,.pe-live-image,.pe-live-empty{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;box-sizing:border-box;object-fit:contain}.pe-live-empty{display:grid;place-items:center;padding:30px;color:#b9a9d6;text-align:center}.pe-live-label{position:absolute;top:12px;left:12px;padding:7px 10px;background:#15101bde;border:1px solid #ffffff24;border-radius:9px;font-size:11px;color:#ede4ff;pointer-events:none}.pe-session{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12px;min-height:23px}.pe-session-title{color:#f0d8e3}.pe-session-detail{color:#aab4ca;flex:1}.pe-session[data-paused=true] .pe-session-title{color:#d3bcff}.pe-mic{display:flex;align-items:center;gap:7px;color:#94a0b7;font-size:11px}.pe-mic-track{width:68px;height:5px;overflow:hidden;background:#303749;border-radius:5px}.pe-mic-track i{display:block;height:100%;width:0;background:#73d5b1;border-radius:5px}.python-editor .pe-record-button{background:linear-gradient(100deg,#8a4ed1,#a63e84);border-color:#c388ec;color:#fff;padding:11px 16px;font-size:13px}.pe-record-button:disabled{cursor:wait}.pe-play-tools{border-top:1px solid #ffffff0c;padding-top:8px}.python-editor--focus .pe-monitor{flex:1;min-height:100px;aspect-ratio:auto}.pe-inspector--empty label,.pe-inspector--empty [data-field],.pe-inspector--empty .pe-tools{display:none}.pe-inspector--empty .pe-selection{line-height:1.7;color:#aab4ca}.pe-recording strong,.pe-recording small{display:block}@media(max-width:720px){.python-editor--focus .pe-monitor{flex:auto;min-height:200px;aspect-ratio:16/9}.pe-record-tools{gap:6px}.python-editor .pe-record-tools button{white-space:normal;flex:1;padding:10px 8px}.pe-inspector--empty{max-height:100px!important}.pe-session-detail{flex-basis:100%}.pe-mic{margin-left:auto}}
`;
const fitButton = document.createElement('button'); fitButton.type = 'button'; fitButton.dataset.op = 'fit'; fitButton.textContent = 'Вся лента'; findTrackTools().querySelector('label').before(fitButton);
const newTrack = document.createElement('div'); newTrack.className = 'pe-track-placeholder'; newTrack.hidden = true; newTrack.textContent = 'Новая запись: каждая пауза добавит готовый дубль в эту ленту.'; editor.querySelector('.pe-track-scroll').before(newTrack);
function findTrackTools(){return editor.querySelector('.pe-track-tools');}
editor.querySelector('[aria-label="Масштаб ленты"]').max='200';
let projectId = '', selectedId = '', busy = false, videoUrl = '', previewClip = '', previewRevision = -1, signature = '', scale = 8, menu;
let playhead = 0, layout = [], snapping = true, gesture = null, inspectorSignature = '';
let previewGeneration = 0;
let reviewedRevision = -1;
let liveWanted = true, liveBusy = false, editorVisible = false, transition = null, transitionError = null;
let preparing = false, preparingBusy = false, startPending = false, preflightLease = false, autoPrepared = false;
let warmedSource = '';
const thumbnails = new Map();
const find = selector => editor.querySelector(selector);
const field = name => find(`[data-field="${name}"]`);
const clock = seconds => { const n = Math.max(0, seconds || 0); return `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, '0')}`; };
const job = () => context.state()?.jobs.find(item => item.id === projectId);
const selection = () => job()?.pythonTimeline.clips.find(clip => clip.id === selectedId);
const totalTime = () => layout.at(-1) ? layout.at(-1).time + layout.at(-1).duration : 0;
const notify = (text, failure = false) => { find('.pe-status').textContent = text; find('.pe-status').classList.toggle('pe-error', failure); };
const sourceCache = new Map();
async function playbackSource(at) {
  const current = job(), slot = Math.floor(at / 30);
  const key = `${current.id}:${slot}:${Math.min((slot + 1) * 30, current.pythonTimeline.sourceEnd)}`;
  if (!sourceCache.has(key)) {
    const pending = context.request('/python/editor/source', {id:current.id,revision:current.pythonTimeline.revision,at}).then(result => {
      if (!result.videoUrl?.startsWith('/python/editor/video/')) throw Error('Исходник недоступен');
      return result;
    }).catch(error => { sourceCache.delete(key); throw error; });
    sourceCache.set(key,pending);
    while (sourceCache.size > 4) sourceCache.delete(sourceCache.keys().next().value);
  }
  return sourceCache.get(key);
}
const player = new SourceTimelinePlayer(find('video'), playbackSource,
  seconds => { if (videoUrl && previewRevision === job()?.pythonTimeline.revision) setPlayhead(seconds + (previewClip ? layout.find(item=>item.id===previewClip)?.time || 0 : 0),false,false); },
  text => {sourceCache.clear();warmedSource='';discardPreview();render();notify(text,true);});
const playbackTools = document.createElement('div'); playbackTools.className='pe-tools pe-playback-controls'; playbackTools.hidden=true;
playbackTools.innerHTML='<button type="button" aria-label="Воспроизведение монтажа">▶ Воспроизвести</button><button type="button" aria-label="Звук предпросмотра">♫ Звук включён</button><select aria-label="Скорость просмотра"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="1.5">1,5×</option><option value="2">2×</option></select>';
style.textContent += '.python-editor .pe-playback-controls{flex:none}.python-editor .pe-playback-controls select{width:80px;padding:7px;font-size:12px}.python-editor--focus .pe-view{overflow-y:auto}.python-editor--focus .pe-playback-controls{margin-top:6px}.python-editor--focus .pe-view .pe-monitor{min-height:100px}';
find('.pe-play-tools').append(playbackTools);
style.textContent += '.python-editor .pe-playback-controls{display:contents}.python-editor .pe-play-tools{flex:none}';
playbackTools.children[0].onclick=()=>{if(player.playing)player.pause();else void player.play().catch(error=>notify(error.message,true));};
playbackTools.children[1].onclick=()=>{const muted=!player.active.muted;for(const video of player.videos)video.muted=muted;playbackTools.children[1].textContent=muted?'♫ Без звука':'♫ Звук включён';};
playbackTools.children[2].onchange=event=>{for(const video of player.videos)video.defaultPlaybackRate=video.playbackRate=Number(event.target.value);};
const discardPreview = () => { previewGeneration++; player.stop(); videoUrl = ''; previewClip = ''; liveWanted = true; for(const video of player.videos)video.hidden=true; find('.pe-empty').hidden = false; playbackTools.hidden=true; };
function showSettings(shown) {
  preparation.hidden = !shown; fragmentTools.hidden = shown;
  [...inspectorTabs.children].forEach((button, index) => button.setAttribute('aria-pressed',String(index === (shown ? 0 : 1))));
}
async function prepareRecording() {
  preparing = true; discardPreview(); showSettings(true); render();
  if (preparingBusy) return;
  preparingBusy = true;
  try { await context.preparePython(); }
  catch (error) { notify(error.message, true); }
  finally { preparingBusy = false; render(); void livePreview(); }
}
inspectorTabs.children[0].onclick = () => { showSettings(true); if (!context.state()?.jobs.some(item => ['starting','recording','stopping'].includes(item.status))) void prepareRecording(); };
inspectorTabs.children[1].onclick = () => { preparing = false; showSettings(false); render(); };
function renderPreparation(state) {
  const capture = state.jobs.some(item => ['starting','recording','stopping'].includes(item.status)) || state.obs?.outputActive;
  const waiting = busy || preparingBusy || startPending || context.panelBusy?.() || state.materialControlBusy || state.editorBusy || state.updater?.busy || state.uploadingId || state.preparingUpload;
  startButton.hidden = Boolean(capture);
  startButton.textContent = startPending ? 'Запускаем запись…' : preparing ? '● Начать запись' : '● Новая запись';
  startButton.disabled = Boolean(waiting || capture || preparing && context.pythonStartReason());
  prepareButton.disabled = Boolean(waiting || capture);
  inspectorTabs.children[1].disabled = !job();
  find('.pe-project').disabled = Boolean(capture || startPending || !state.jobs.some(item => item.pythonTimeline));
  newTrack.hidden = !preparing;
  find('.pe-track-scroll').hidden = preparing;
  find('.pe-track-tools').hidden = preparing;
  find('.pe-play-tools').hidden = preparing;
  find('.pe-record-tools').hidden = Boolean(capture) && job()?.status !== 'recording';
  for (const op of ['pause','retake','stop']) find(`[data-op=${op}]`).hidden = job()?.status !== 'recording';
  find('[data-op=publish]').hidden = preparing;
  if (preparing) {
    editor.querySelectorAll('[data-op]').forEach(button => { if (!['start','prepare'].includes(button.dataset.op)) button.disabled = true; });
    editor.querySelectorAll('[data-field]').forEach(control => { control.disabled = true; });
    retryButton.hidden = true;
    find('.pe-publish-target').textContent = 'Подготовка новой записи Python';
    find('.pe-publish-summary').textContent = 'Нажмите «Начать запись» под предпросмотром. Предыдущие проекты сохранены в списке сверху.';
    find('.pe-publish-state').textContent = '';
  }
  for (const id of ['python-platform','python-window','python-screen']) {
    const control = document.getElementById(id);
    const mode = state.config.pythonCapture?.mode || 'window';
    const applicable = ({'python-platform':'platform','python-window':'window','python-screen':'screen'})[id] === mode;
    control.hidden = !applicable; document.querySelector(`label[for=${id}]`).hidden = !applicable;
  }
  if (startPending) notify('Запускаем запись и ждём подтверждения OBS. Повторно нажимать не нужно.');
}
function releasePreflight() {
  if (!preflightLease) return;
  preflightLease = false; void context.request('/python/preview',{active:false}).catch(()=>{});
}
async function livePreview() {
  const current = job();
  const state = context.state();
  const active = current?.status === 'recording';
  const ready = preparing && state && !state.jobs.some(item => ['starting','recording','stopping'].includes(item.status)) && !state.obs?.outputActive;
  if (document.hidden || !editorVisible || !liveWanted || !active && !ready) { releasePreflight(); return; }
  if (liveBusy || context.pausePending?.() || context.panelBusy?.()) return;
  const owner = active ? current.id : 'preparation';
  const source = JSON.stringify(state.config.pythonCapture);
  liveBusy = true;
  try {
    if (ready) preflightLease = true;
    const result = await context.request(active ? `/python/editor/live?id=${encodeURIComponent(current.id)}` : '/python/preview', active ? undefined : {active:true});
    if (!liveWanted || source !== JSON.stringify(context.state().config.pythonCapture) || active && (job()?.id !== current.id || job()?.status !== 'recording') || ready && (!preparing || context.state().jobs.some(item => ['starting','recording','stopping'].includes(item.status)))) return;
    find('.pe-live-image').dataset.project = owner; find('.pe-live-image').dataset.source = source; find('.pe-live-image').src = result.image; find('.pe-live-image').hidden = false; find('.pe-live-empty').hidden = true;
  } catch (error) {
    if (!liveWanted || context.pausePending?.() || active && job()?.id !== current.id) return;
    find('.pe-live-image').removeAttribute('src'); find('.pe-live-image').hidden = true; find('.pe-live-empty').hidden = false;
    find('.pe-live-empty').textContent = `Предпросмотр временно недоступен. ${error.message}`;
  } finally { liveBusy = false; }
}
new IntersectionObserver(entries => { editorVisible = entries[0].isIntersecting; if (editorVisible) void livePreview(); else releasePreflight(); }).observe(editor);
document.addEventListener('visibilitychange', () => { if (document.hidden) releasePreflight(); else void livePreview(); });
setInterval(livePreview, 1000);
function renderMonitor(current, state) {
  const active = current?.status === 'recording' && state.jobs.some(item => item.id === current.id && item.pythonTheory);
  const ready = preparing && !state.jobs.some(item => ['starting','recording','stopping'].includes(item.status)) && !state.obs?.outputActive;
  const live = (active || ready) && liveWanted;
  if (find('.pe-live-image').dataset.project !== (active ? current.id : 'preparation') || find('.pe-live-image').dataset.source !== JSON.stringify(state.config.pythonCapture)) find('.pe-live-image').removeAttribute('src');
  find('.pe-live-image').hidden = !live || !find('.pe-live-image').hasAttribute('src');
  find('.pe-live-empty').hidden = !live || find('.pe-live-image').hasAttribute('src');
  find('.pe-live-label').hidden = !live;
  find('.pe-player').hidden = live || !videoUrl || !player.source;
  find('.pe-empty').hidden = live || Boolean(videoUrl && player.source);
  find('.pe-seek').hidden = live;
  playbackTools.hidden = live || !videoUrl;
  playbackTools.children[0].textContent = player.playing ? 'Ⅱ Пауза просмотра' : '▶ Воспроизвести';
  find('[data-op=live]').hidden = !active || liveWanted;
  find('.pe-live-label').textContent = active ? state.obs?.outputPaused ? 'Экран записи · пауза' : '● Экран записи' : 'Предпросмотр · запись ещё не начата';
  const timeline = current?.pythonTimeline;
  const count = timeline?.takeCount ?? timeline?.clips.length ?? 0;
  const paused = Boolean(state.obs?.outputPaused);
  const pending = transition || context.pausePending?.();
  find('.pe-session').dataset.paused = String(paused);
  find('.pe-session-title').textContent = startPending ? 'Запускаем запись…' : pending ? pending.paused ? 'Завершаем дубль…' : 'Начинаем следующий дубль…' : active ? paused ? 'Запись на паузе' : `● Дубль ${count + 1} · ${clock(Math.max(0, timeline.sourceEnd - (timeline.openStart ?? timeline.sourceEnd)))}` : ready ? 'Подготовка новой записи' : current ? 'Монтаж записи' : 'Подготовка записи';
  find('.pe-session-detail').textContent = startPending || pending ? 'Ждём подтверждения OBS. Повторно нажимать не нужно.' : active ? paused ? 'Дубль добавлен в ленту. Проверьте его или запишите следующий.' : '«Завершить дубль» остановит изображение и звук и добавит фрагмент в ленту.' : ready ? 'Выберите экран, микрофон и тему справа. Запуск — здесь, под предпросмотром.' : current ? 'Выберите фрагмент, проверьте монтаж и выложите готовое видео.' : 'Настройте источники и начните запись Python.';
  const meter = state.obs?.meters?.find(item => item.inputName === 'IVAN100 Python: микрофон');
  const level = Math.max(0, ...(meter?.inputLevelsMul || []).flat());
  find('.pe-mic').hidden = !active && !ready;
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
async function makeThumbnails(url, clips, sourceOffset, generation) {
  const decoder=document.createElement('video'); decoder.muted=true; decoder.preload='auto';
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const paint=canvas.getContext('2d');
  try{
    await videoEvent(decoder,'loadeddata',()=>{decoder.src=url;decoder.load();});
    // Decode a bounded number of small frames, never a whole video into memory.
    for(const clip of clips.slice(0,32)){
      if(generation!==previewGeneration)return;
      const duration=clip.end-clip.start,at=Math.min(decoder.duration-.04,clip.start+sourceOffset+Math.min(.1,duration/2));
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
function select(id) { selectedId = id; preparing = false; showSettings(false); if (previewClip && previewClip !== id) discardPreview(); render(); find('.pe-track button[aria-selected="true"]')?.focus({preventScroll:true}); }
const seek = document.createElement('div'); seek.className = 'pe-seek';
seek.innerHTML = '<input type="range" min="0" max="0" value="0" step="0.01" aria-label="Курсор монтажа"><output aria-live="off">0:00.0 / 0:00.0</output>';
find('.pe-tools').before(seek);
function setPlayhead(seconds, seekVideo = true, choose = true, updatePoint = true) {
  playhead = clamp(seconds, 0, totalTime());
  const item = clipAtTime(layout, playhead);
  if (choose && item && selectedId !== item.id) select(item.id);
  if (seekVideo && videoUrl && previewRevision === job()?.pythonTimeline.revision) {
    const secondsInPreview = previewClip ? playhead - layout.find(part => part.id === previewClip)?.time : playhead;
    if (Number.isFinite(secondsInPreview) && secondsInPreview >= 0 && (!previewClip || secondsInPreview <= selection()?.end - selection()?.start)) void player.seek(secondsInPreview,player.playing).catch(error=>notify(error.message,true));
  }
  find('.pe-cursor').style.left = `${timeToPixel(layout, playhead)}px`;
  find('.pe-cursor').hidden = !layout.length;
  find('.pe-seek input').max = String(totalTime()); find('.pe-seek input').value = String(playhead);
  find('.pe-seek output').textContent = `${clock(playhead)} / ${clock(totalTime())}`;
  if (updatePoint && item && item.id === selectedId && document.activeElement !== field('point')) field('point').value = (playhead - item.time).toFixed(2);
  const state = context.state();
  const locked = busy || job()?.pythonTimeline.approved || state?.materialControlBusy || context.pausePending?.() || state?.editorBusy || state?.updater?.busy || state?.uploadingId;
  for (const [op, action] of [['cut-cursor','split'],['trim-start','trim-start'],['trim-end','trim-end']]) find(`[data-op=${op}]`).disabled = Boolean(locked) || !cursorEdit(layout, playhead, action);
}
find('.pe-seek input').oninput = event => setPlayhead(Number(event.target.value));
async function preview(all = false, play = true) {
  const startedAt = performance.now();
  const current = job(), requested = structuredClone(selection()), requestedClips = structuredClone(current.pythonTimeline.clips);
  if (!all && !requested) return;
  const offset = all ? playhead : clamp(playhead - (layout.find(part => part.id === requested.id)?.time || 0), 0, requested.end - requested.start);
  if (videoUrl && previewRevision === current.pythonTimeline.revision && previewClip === (all ? '' : requested.id)) {
    liveWanted = false; renderMonitor(current, context.state()); await player.seek(offset,play); editor.dataset.playbackStartMs=(performance.now()-startedAt).toFixed(1); return;
  }
  notify('Открываем исходную запись…');
  const generation = ++previewGeneration;
  player.configure(all?requestedClips:[requested]); videoUrl='source';
  liveWanted = false;
  previewClip = all ? '' : requested.id; previewRevision = current.pythonTimeline.revision;
  renderMonitor(current, context.state());
  await player.seek(offset,play);
  if(generation!==previewGeneration || job()?.id!==current.id || job()?.pythonTimeline.revision!==previewRevision || !player.source)return;
  videoUrl=player.source.videoUrl; if(all)reviewedRevision=previewRevision;
  renderMonitor(current,context.state());
  editor.dataset.playbackStartMs=(performance.now()-startedAt).toFixed(1);
  notify(all ? 'Предпросмотр всего монтажа. Проверьте звук и стыки.' : 'Фрагмент готов к просмотру. Остановите воспроизведение в месте разреза.');
  playbackTools.hidden=false;
  void makeThumbnails(videoUrl,(all?requestedClips:[requested]).filter(clip=>clip.start>=player.source.sourceStart&&clip.start<player.source.sourceEnd),player.source.offset,previewGeneration);
}
function render() {
  const state = context.state();
  if (!state) { editor.querySelectorAll('[data-op],[data-field]').forEach(control => { control.disabled = true; }); find('.pe-status').dataset.loading = 'true'; notify('Подключаемся к пульту…'); return; }
  if (find('.pe-status').dataset.loading) { delete find('.pe-status').dataset.loading; notify(''); }
  if (gesture) return;
  const projects = state.jobs.filter(item => item.pythonTimeline);
  editor.classList.toggle('python-editor--empty', !projects.length);
  emptyHelp.hidden = Boolean(projects.length);
  find('.pe-empty').firstElementChild.hidden = !projects.length;
  find('.pe-seek input').disabled = !projects.length;
  find('[aria-label="Масштаб ленты"]').disabled = !projects.length;
  find('.pe-project').disabled = !projects.length;
  if (!projects.length) {
    if (projectId || videoUrl) discardPreview();
    projectId = ''; selectedId = ''; signature = ''; inspectorSignature = ''; layout = []; playhead = 0;
    find('.pe-project').dataset.options = '';
    find('.pe-project').replaceChildren(new Option('Новая запись Python', ''));
    editor.querySelectorAll('[data-op], [data-field]').forEach(control => { control.disabled = true; });
    find('.pe-selection').textContent = 'Фрагменты появятся после первой паузы';
    find('.pe-ruler').replaceChildren();
    find('.pe-track').innerHTML = '<div class="pe-track-placeholder">Здесь будут фрагменты вашего урока</div>';
    find('.pe-duration').textContent = 'Итого 0:00.0';
    find('.pe-cursor').hidden = true;
    find('.pe-seek input').value = '0'; find('.pe-seek output').textContent = '0:00.0 / 0:00.0';
    find('.pe-fragment').classList.add('pe-fragment--empty');
    find('.pe-publish-target').textContent = 'Запись → дубли → монтаж → публикация';
    find('.pe-publish-summary').textContent = 'Каждая пауза добавляет фрагмент. Продолжение начинает следующий.';
    find('.pe-publish-state').textContent = '';
    retryButton.hidden = true; restoreButton.hidden = true;
    renderMonitor(null, state); renderPreparation(state);
    if (!autoPrepared) { autoPrepared = true; void prepareRecording(); }
    return;
  }
  const active = projects.find(item => ['starting', 'recording', 'stopping'].includes(item.status));
  if (active && active.id !== projectId || !projects.some(item => item.id === projectId)) { projectId = active?.id || projects[0].id; selectedId = ''; signature = ''; playhead = 0; reviewedRevision = -1; discardPreview(); if (active) { preparing = false; showSettings(false); } }
  const selectProject = find('.pe-project');
  const options = String(preparing) + projects.map(item => `${item.id}:${item.title}:${item.status}:${Boolean(item.pythonTimeline.approved)}`).join('|');
  if (selectProject.dataset.options !== options) {
      selectProject.replaceChildren(...(preparing ? [new Option('Новая запись Python', '')] : []), ...projects.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title + (item.pythonTimeline.approved ? item.status==='ready'?' · опубликовано':item.status==='error'?' · ошибка отправки':' · сборка / отправка' : item.status === 'recording' ? ' · запись' : ' · черновик'); return option; }));
    selectProject.dataset.options = options;
  }
  selectProject.value = preparing ? '' : projectId;
  const current = job(), timeline = current.pythonTimeline;
  find('.pe-empty').firstElementChild.innerHTML = timeline.clips.length ? '<strong>Выберите фрагмент в ленте</strong>Двойной клик по фрагменту — просмотр. Для разреза или обрезки поставьте курсор на нужное место.' : '<strong>В ленте пока нет фрагментов</strong>' + (timeline.finalized ? 'Исходник сохранён. Можно добавить всю запись в ленту или отменить удаление.' : 'Завершите первый дубль кнопкой паузы — он появится здесь.');
  const anyActive = state.jobs.some(item => ["starting","recording","stopping"].includes(item.status));
  const isActive = current.status === 'recording' && active?.id === current.id;
  find('.pe-record-tools').hidden = !isActive;
  const waiting = busy || Boolean(context.pausePending?.()) || Boolean(state.materialControlBusy) || Boolean(state.editorBusy) || Boolean(state.updater?.busy) || Boolean(state.uploadingId);
  const locked = waiting || timeline.approved;
  layout = timelineLayout(timeline.clips, scale);
  if (!timeline.clips.some(clip => clip.id === selectedId)) selectedId = clipAtTime(layout,playhead)?.id || '';
  const selected = selection();
  find('.pe-fragment').classList.toggle('pe-fragment--empty', !selected);
  if (transitionError?.id === current.id && state.obs?.outputActive && state.obs.outputPaused === transitionError.paused && (transitionError.paused ? timeline.openStart === null : timeline.openStart !== null)) { transitionError = null; notify('OBS подтвердил состояние записи.'); }
  const nextSignature = JSON.stringify([projectId, timeline.revision, scale, timeline.clips]);
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
      button.title = 'Двойной клик — просмотреть. Перетащите — переместить. Потяните за край — обрезать.';
      button.oncontextmenu = event => { event.preventDefault(); const rect=button.getBoundingClientRect(); select(clip.id); setPlayhead(time + clamp((event.clientX-rect.left)/width,0,1)*(clip.end-clip.start)); showMenu(event.clientX, event.clientY); }; track.append(button);
    });
  }
  find('.pe-track').querySelectorAll('[data-clip-id]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.clipId === selectedId)));
    if (selected) {
      find('.pe-selection').textContent = `Фрагмент ${timeline.clips.findIndex(clip => clip.id === selectedId) + 1} · ${clock(selected.end - selected.start)}`;
      const nextInspector=JSON.stringify([projectId,selectedId,selected.start,selected.end]);
      if(inspectorSignature!==nextInspector){inspectorSignature=nextInspector;field('point').value = ((selected.end - selected.start) / 2).toFixed(2); field('in').value = '0'; field('out').value = (selected.end - selected.start).toFixed(2);}
    } else find('.pe-selection').textContent = isActive ? 'Нажмите «Завершить дубль». Готовый фрагмент появится в ленте, и здесь откроются инструменты его редактирования.' : 'Выберите фрагмент в ленте, чтобы обрезать, разделить или удалить его.';
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
  for (const [op, action] of [['cut-cursor', 'split'], ['trim-start', 'trim-start'], ['trim-end', 'trim-end']]) find(`[data-op=${op}]`).disabled = locked || !cursorEdit(layout, playhead, action);
  restoreButton.hidden = Boolean(timeline.clips.length) || !timeline.finalized || timeline.approved;
  restoreButton.disabled = locked || anyActive || !current.file || !timeline.finalized || timeline.sourceEnd < .04;
  retryButton.hidden = !timeline.approved || current.status !== 'error';
  retryButton.disabled = waiting || anyActive;
  const target = current.pythonTheory;
  find('.pe-publish-target').textContent = target ? `Изучение Python → ${target.taskTitle || current.title} → ${target.subsectionTitle || 'Вся тема'}` : current.title;
  find('.pe-publish-summary').textContent = `${timeline.clips.length} фрагм. · Итог ${clock(totalTime())} · Исходник ${clock(timeline.sourceEnd)}`;
  const published = current.status === 'ready';
  const failed = timeline.approved && current.status === 'error';
  const uploading = timeline.approved && !published && !failed;
  find('.pe-publish-state').dataset.error = String(failed);
  find('.pe-publish-state').textContent = published ? 'Опубликовано: урок доступен ученикам в выбранном подразделе.' : failed ? `Загрузка не завершена: ${current.error || 'повторите отправку'}. Исходник и монтаж сохранены.` : uploading ? state.editorBusy === current.id ? '1/3 · Собираем итоговое видео…' : current.status === 'uploading' ? '2/3 · Загружаем в RuTube…' : current.status === 'processing' ? '3/3 · Обработка видео и прикрепление к теме…' : 'Отправка принята. Подготовка видео…' : reviewedRevision === timeline.revision ? 'Предпросмотр этого монтажа подготовлен. Проверьте изображение и звук перед отправкой.' : 'Перед отправкой просмотрите весь монтаж и проверьте звук.';
  find('[data-op=publish]').textContent = published ? '✓ Опубликовано' : uploading ? 'Идёт отправка…' : 'Выложить в изучение Python';
  const index=timeline.clips.findIndex(clip=>clip.id===selectedId), after=timeline.clips[index+1];
  find('[data-op=move-left]').disabled=locked||index<=0;
  find('[data-op=move-right]').disabled=locked||index<0||index>=timeline.clips.length-1;
  find('[data-op=join]').disabled=locked||!selected||!after||Math.abs(selected.end-after.start)>.001;
  editor.querySelectorAll('[data-field]').forEach(input=>{input.disabled=locked||!selected;});
  if (previewRevision !== -1 && previewRevision !== timeline.revision && videoUrl) { discardPreview(); notify('Лента изменилась. Нажмите воспроизведение — исходник уже подготовлен.'); }
  setPlayhead(playhead, false, false, false);
  renderMonitor(current, state);
  renderPreparation(state);
  const last = timeline.clips.at(-1);
  if (editorVisible && !preparing && (!anyActive || isActive && state.obs?.outputPaused)) {
    const key = last ? `${current.id}:${timeline.sourceEnd}` : '';
    if (key && key !== warmedSource && !busy && !state.editorBusy && !timeline.approved) {
      warmedSource = key; void playbackSource(last.start).catch(()=>{});
    }
  }
}
async function setPaused(current, paused) {
  if (!paused) discardPreview();
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
  if (op === 'prepare') return prepareRecording();
  if (op === 'start') {
    if (!preparing) return prepareRecording();
    startPending = true; discardPreview(); render();
    try {
      const started = await context.startPython();
      await context.refresh();
      projectId = started.id || context.state().jobs.find(item => item.pythonTimeline && ['starting','recording','stopping'].includes(item.status))?.id || projectId;
      selectedId = ''; signature = ''; inspectorSignature = ''; playhead = 0; reviewedRevision = -1;
      preparing = false; showSettings(false); render(); void livePreview();
      notify('Запись началась. «Завершить дубль» добавит первый фрагмент в ленту.');
    } finally { startPending = false; }
    return;
  }
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
  if (op === 'retry-upload') { await context.request('/upload', { id: current.id }); notify('Повторная отправка завершена.'); return; }
  if (['cut-cursor', 'trim-start', 'trim-end'].includes(op)) {
    const action = op === 'cut-cursor' ? 'split' : op;
    const args = cursorEdit(layout, playhead, action); if (!args) return;
    const nextPlayhead = action === 'trim-start' ? layout.find(item => item.id === args.clipId).time : playhead;
    await edit(action === 'split' ? 'split' : 'trim', args); setPlayhead(nextPlayhead, false); return;
  }
  if (op === 'restore-source') { await edit(op); playhead = 0; setPlayhead(0, false); notify('Вся исходная запись добавлена в ленту. Ctrl+Z вернёт прежний монтаж.'); return; }
  if (op === 'split') return edit('split', { at: selected.start + Number(field('point').value) });
  if (op === 'trim') return edit('trim', { start: selected.start + Number(field('in').value), end: selected.start + Number(field('out').value) });
  if (op === 'move-left' || op === 'move-right') return edit('move', { direction: op === 'move-left' ? -1 : 1 });
  return edit(op);
}
const invoke = op => { if (!find(`[data-op="${op}"]`)?.disabled) void act(() => operation(op)); };
editor.querySelectorAll('[data-op]').forEach(button => button.onclick = () => invoke(button.dataset.op));
find('.pe-project').onchange = event => { if (!event.target.value) { void prepareRecording(); return; } projectId = event.target.value; playhead = 0; reviewedRevision = -1; discardPreview(); select(''); };
find('[aria-label="Масштаб ленты"]').oninput = event => { scale = Number(event.target.value); signature = ''; render(); };
editor.addEventListener('keydown', event => {
  if (event.key === 'Escape' && editor.classList.contains('python-editor--focus')) {
    event.preventDefault(); focusButton.click(); return;
  }
  if(event.key==='Tab'&&editor.classList.contains('python-editor--focus')){
    const controls=[...editor.querySelectorAll('button,input,select,video')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
  }
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || preparing || !job()) return;
  const key = event.key.toLowerCase();
  const shortcut = ({KeyS:'s',KeyQ:'q',KeyW:'w',KeyZ:'z',KeyY:'y'})[event.code] || ({'ы':'s','й':'q','ц':'w','я':'z','н':'y'})[key] || key;
  if (event.repeat && ['f8', 'f9', 's', 'q', 'w', ' '].includes(shortcut)) { event.preventDefault(); return; }
  if (event.key === 'F8' || event.key === 'F9') { event.preventDefault(); invoke(event.key === 'F8' ? 'pause' : 'retake'); }
  else if (event.ctrlKey && shortcut === 'z') { event.preventDefault(); invoke(event.shiftKey ? 'redo' : 'undo'); }
  else if (event.ctrlKey && shortcut === 'y') { event.preventDefault(); invoke('redo'); }
  else if (event.key === 'Delete' && selectedId) { event.preventDefault(); invoke('delete'); }
  else if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key) && event.target.tagName !== 'VIDEO') { event.preventDefault(); setPlayhead(event.key==='Home'?0:event.key==='End'?totalTime():playhead+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?1:1/30)); }
  else if (!event.ctrlKey && !event.altKey && ['s','q','w'].includes(shortcut)) { event.preventDefault(); invoke(({s:'cut-cursor',q:'trim-start',w:'trim-end'})[shortcut]); }
  else if (event.code === 'Space' && (event.target.tagName !== 'BUTTON' || event.target.getAttribute('role') === 'option') && event.target.tagName !== 'VIDEO') { event.preventDefault(); if(videoUrl&&!liveWanted){if(player.playing)player.pause();else void player.play().catch(error=>notify(error.message,true));}else if(!find('[data-op=preview]').disabled)void act(()=>preview(false,true)); }
});
const trackContent = find('.pe-track-content');
const trackPixel = event => event.clientX - trackContent.getBoundingClientRect().left;
trackContent.addEventListener('dblclick', event => {
  const bounds = find('.pe-track').getBoundingClientRect(), pixel = trackPixel(event);
  if (event.clientY < bounds.top || event.clientY > bounds.bottom) return;
  const item = layout.find(part => pixel >= part.x && pixel <= part.x + part.width);
  if (!item) return;
  select(item.id); setPlayhead(pixelToTime(layout, pixel));
  if (!find('[data-op=preview]').disabled) void act(() => preview(false, true));
});
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
  for (const [op, label] of [['preview', 'Посмотреть'], ['cut-cursor', 'Разделить по курсору · S'], ['trim-start', 'Убрать до курсора · Q'], ['trim-end', 'Убрать после курсора · W'], ['duplicate', 'Создать копию'], ['join', 'Объединить с правой частью'], ['move-left', 'Переместить раньше'], ['move-right', 'Переместить позже'], ['delete', 'Удалить из монтажа'], ['undo', 'Отменить действие'], ['redo','Вернуть действие']]) {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = label; button.disabled=find(`[data-op="${op}"]`)?.disabled; button.onclick = () => { menu.remove(); invoke(op); }; menu.append(button);
  }
  document.body.append(menu); menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 240))}px`; menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
}
document.addEventListener('pointerdown', event => { if (menu && !menu.contains(event.target)) menu.remove(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') menu?.remove(); });
render(); setInterval(render, 1000);
