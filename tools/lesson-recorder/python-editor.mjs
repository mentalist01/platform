const context = window.recorderEditorContext;
const style = document.createElement('style');
style.textContent = `
.python-editor[hidden],.python-editor [hidden]{display:none!important}.python-editor{margin-top:24px;overflow:hidden;border:1px solid #51416f;background:linear-gradient(135deg,#211b35,#121a29);border-radius:22px;color:#e9edf8;box-shadow:0 12px 35px #06091330}.pe-header{padding:22px 24px;border-bottom:1px solid #ffffff12;display:flex;align-items:center;gap:16px;flex-wrap:wrap}.pe-header h2{font-size:21px;margin:5px 0}.pe-header>div{flex:1;min-width:190px}.pe-header p{font-size:12px;margin:0}.python-editor button{font:600 12px Segoe UI,sans-serif;white-space:nowrap;transition:background .15s,border-color .15s}.python-editor button:focus-visible,.python-editor input:focus-visible{outline:2px solid #bba2ff;outline-offset:3px}.pe-project{max-width:300px;min-width:0}.pe-workspace{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:0}.pe-view{padding:22px;min-width:0}.pe-player{width:100%;aspect-ratio:16/9;background:#080b13;border:1px solid #ffffff0d;border-radius:14px;display:block}.pe-empty{aspect-ratio:16/9;display:grid;place-items:center;text-align:center;color:#94a0b7;background:radial-gradient(ellipse at top,#3a2854,#080c14);border-radius:14px;padding:32px}.pe-empty strong{display:block;font-size:17px;color:#e4d8ff;margin-bottom:10px}.pe-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}.pe-tools button{padding:8px 11px}.pe-status{color:#abb4cc;font-size:12px;line-height:1.6;margin-top:10px}.pe-inspector{padding:22px;border-left:1px solid #ffffff12;background:#ffffff03}.pe-inspector h3{font-size:14px;margin:0 0 15px}.pe-inspector label{font-size:11px;color:#aab4ca;display:block;margin:10px 0 5px}.pe-inspector input{width:100%;padding:9px;min-width:0}.pe-inspector .pe-tools button{flex:1}.pe-timeline{border-top:1px solid #ffffff12;padding:18px 22px 22px;position:relative}.pe-track-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}.pe-track-tools strong{flex:1;font-size:13px}.pe-track-tools input{width:100px}.pe-track-scroll{overflow-x:auto;overflow-y:hidden;overscroll-behavior:contain;padding-bottom:12px;scrollbar-color:#8261c1 #121826}.pe-ruler,.pe-track{display:flex;gap:4px;min-width:100%}.pe-ruler>span{flex:none;font-size:10px;color:#8e9ab1;position:relative;height:20px;border-left:1px solid #667085;padding-left:5px}.pe-track>button{position:relative;flex:none;height:76px;min-width:72px;overflow:hidden;text-align:left;padding:12px;border:1px solid #725095;border-radius:9px;background:linear-gradient(130deg,#45305f,#342847);color:#f5edff}.pe-track>button[aria-selected=true]{border-color:#cdaaff;box-shadow:inset 0 0 0 1px #cdaaff;background:linear-gradient(130deg,#7051a0,#423059)}.pe-track>button small{display:block;font-size:11px;margin-top:8px;opacity:.75}.pe-track>button:after{content:'';position:absolute;left:0;right:0;bottom:0;height:12px;background:repeating-linear-gradient(90deg,#b094d833 0 2px,transparent 2px 6px)}.pe-track .pe-recording{background:linear-gradient(130deg,#692f4b,#3c2637);border-color:#e57996;animation:pe-live 2s ease-in-out infinite}.pe-track .pe-recording:after{background:repeating-linear-gradient(90deg,#eaa0b833 0 2px,transparent 2px 6px)}.pe-cursor{position:absolute;top:0;bottom:0;width:2px;background:#f1ddff;pointer-events:none;box-shadow:0 0 8px #d9acff}.pe-footer{padding:15px 22px;border-top:1px solid #ffffff12;display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:#131822}.pe-footer p{font-size:12px;flex:1;margin:0}.pe-footer button{background:linear-gradient(100deg,#8855dc,#ad4bd0);border-color:#b46eee;color:#fff;padding:12px 17px}.pe-menu{position:fixed;z-index:1000;padding:7px;display:grid;gap:3px;width:230px;max-height:calc(100dvh - 24px);overflow:auto;background:#242033eF;backdrop-filter:blur(16px);border:1px solid #8670a966;border-radius:12px;box-shadow:0 16px 50px #0008}.pe-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:10px}.pe-menu button:hover{background:#9f72e333}.pe-error{color:#ffb3c5}.pe-save-note{font-size:11px;color:#8994a9;padding:0 22px 15px}@keyframes pe-live{50%{border-color:#ffa2bd}}@media(prefers-reduced-motion:reduce){.pe-recording{animation:none!important}}@media(max-width:720px){.pe-workspace{grid-template-columns:1fr}.pe-inspector{border-left:0;border-top:1px solid #ffffff12}.pe-header,.pe-view,.pe-inspector,.pe-timeline{padding:16px}.pe-project{width:100%;max-width:none}.pe-footer button{width:100%}.pe-header>div{min-width:0}}`;
document.head.append(style);
style.textContent += '.python-editor .pe-header{margin:0}.python-editor .pe-player{margin:0}.python-editor .pe-track strong{font-size:11px;white-space:nowrap}body:has(.python-editor--focus) main>:not(.python-editor){visibility:hidden}';
style.textContent += `
.pe-focus-button{margin-left:auto}.python-editor--focus{position:fixed;inset:12px;z-index:50;display:flex;flex-direction:column;max-height:calc(100dvh - 24px);margin:0}.python-editor--focus .pe-header{padding:12px 18px;flex:none}.python-editor--focus .pe-header h2{font-size:18px}.python-editor--focus .pe-workspace{flex:1;min-height:0}.python-editor--focus .pe-view{display:flex;flex-direction:column;min-height:0;padding:14px}.python-editor--focus .pe-player,.python-editor--focus .pe-empty{flex:1;min-height:0;aspect-ratio:auto;object-fit:contain}.python-editor--focus .pe-inspector{overflow-y:auto;padding:14px}.python-editor--focus .pe-inspector h3{margin-bottom:8px}.python-editor--focus .pe-inspector label{margin-top:7px}.python-editor--focus .pe-inspector input{padding:6px}.python-editor--focus .pe-inspector .pe-tools{margin-top:6px}.python-editor--focus .pe-timeline{padding:12px 18px;flex:none}.python-editor--focus .pe-track-tools{margin-bottom:8px}.python-editor--focus .pe-track>button{height:62px}.python-editor--focus .pe-footer{padding:10px 18px;flex:none}.python-editor--focus .pe-save-note{padding-bottom:8px}body:has(.python-editor--focus){overflow:hidden}body:has(.python-editor--focus) #python-transport{display:none!important}@media(max-width:720px){.python-editor--focus{inset:0;max-height:100dvh;border-radius:0;overflow-y:auto}.python-editor--focus .pe-workspace{flex:none;min-height:420px}.python-editor--focus .pe-view{min-height:320px}.python-editor--focus .pe-inspector{max-height:280px}.python-editor--focus .pe-header p{display:none}.python-editor--focus .pe-footer{position:sticky;bottom:0}.python-editor--focus .pe-project{width:auto;flex:1}}`;
const editor = document.createElement('section'); editor.className = 'python-editor'; editor.hidden = true; editor.tabIndex = 0; editor.setAttribute('aria-label', 'Монтажная студия Python');
style.textContent += '@media(max-width:720px){.python-editor--focus .pe-header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.python-editor--focus .pe-header>div{grid-column:1/-1}.python-editor--focus .pe-header .brand{font-size:10px;letter-spacing:1px}.python-editor--focus .pe-header h2{margin:4px 0;font-size:17px}.python-editor--focus .pe-project{width:100%;max-width:100%}.python-editor--focus .pe-focus-button{margin:0}}';
editor.innerHTML = `<header class="pe-header"><div><span class="brand">PYTHON / МОНТАЖНАЯ СТУДИЯ</span><h2>От дубля к готовому уроку</h2><p>Записывайте, убирайте лишнее и собирайте видео. Исходник остаётся на компьютере.</p></div><select class="pe-project" aria-label="Проект монтажа Python"></select></header>
<div class="pe-workspace"><div class="pe-view"><video class="pe-player" controls playsinline hidden aria-label="Предпросмотр монтажа"></video><div class="pe-empty"><div><strong>Ваш урок складывается из дублей</strong>Пауза завершает фрагмент. Выберите его в ленте, чтобы просмотреть или изменить.</div></div><div class="pe-tools"><button data-op="preview">▶ Посмотреть фрагмент</button><button data-op="preview-all">Посмотреть весь монтаж</button><button data-op="pause">Ⅱ Пауза</button><button data-op="retake">↻ Переснять последний дубль</button></div><div class="pe-status" role="status"></div></div>
<aside class="pe-inspector"><h3>Выбранный фрагмент</h3><div class="pe-selection">Выберите фрагмент в ленте</div><label>Место разделения · секунды от начала фрагмента</label><input data-field="point" type="number" min="0" step="0.01" aria-label="Место разделения"><div class="pe-tools"><button data-op="split">✂ Разделить</button></div><label>Оставить от · секунды</label><input data-field="in" type="number" min="0" step="0.01" aria-label="Начало обрезки"><label>До · секунды</label><input data-field="out" type="number" min="0" step="0.01" aria-label="Конец обрезки"><div class="pe-tools"><button data-op="trim">Обрезать</button><button data-op="delete">Удалить</button></div><div class="pe-tools"><button data-op="move-left">← Раньше</button><button data-op="move-right">Позже →</button></div><div class="pe-tools"><button data-op="duplicate">Копия</button><button data-op="join">Объединить справа</button></div></aside></div>
<div class="pe-timeline"><div class="pe-track-tools"><strong>Видео + микрофон</strong><button data-op="undo">↶ Отменить</button><label>Масштаб <input type="range" min="2" max="60" value="8" aria-label="Масштаб ленты"></label><span class="pe-duration"></span></div><div class="pe-track-scroll"><div class="pe-ruler"></div><div class="pe-track" role="listbox" aria-label="Фрагменты видео"></div></div></div><div class="pe-save-note">Монтаж сохраняется автоматически. Delete — убрать фрагмент, Ctrl+Z — отменить. Правая кнопка — действия.</div><footer class="pe-footer"><p>После завершения записи проверьте изображение и звук. Отправится только собранное видео.</p><button data-op="publish">Выложить в изучение Python</button></footer>`;
document.querySelector('#mock-review').before(editor);
const focusButton = document.createElement('button'); focusButton.type = 'button'; focusButton.className = 'pe-focus-button'; focusButton.textContent = 'Развернуть редактор';
const inertBefore=new Map();
focusButton.onclick = () => {
  const expanded = editor.classList.toggle('python-editor--focus');
  focusButton.textContent = expanded ? 'Свернуть редактор' : 'Развернуть редактор';
  if(expanded){editor.setAttribute('role','dialog');editor.setAttribute('aria-modal','true');for(const child of editor.parentElement.children){if(child!==editor){inertBefore.set(child,child.inert);child.inert=true;}}}
  else{editor.removeAttribute('role');editor.removeAttribute('aria-modal');for(const[child,inert]of inertBefore)child.inert=inert;inertBefore.clear();}
};
findHeader().append(focusButton);
function findHeader() { return editor.querySelector('.pe-header'); }
const stopButton = document.createElement('button'); stopButton.type = 'button'; stopButton.dataset.op = 'stop'; stopButton.textContent = 'Завершить запись'; editor.querySelector('.pe-tools').append(stopButton);
let projectId = '', selectedId = '', busy = false, videoUrl = '', previewClip = '', previewRevision = -1, signature = '', scale = 8, menu;
const find = selector => editor.querySelector(selector);
const field = name => find(`[data-field="${name}"]`);
const clock = seconds => { const n = Math.max(0, seconds || 0); return `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, '0')}`; };
const job = () => context.state()?.jobs.find(item => item.id === projectId);
const selection = () => job()?.pythonTimeline.clips.find(clip => clip.id === selectedId);
const notify = (text, failure = false) => { find('.pe-status').textContent = text; find('.pe-status').classList.toggle('pe-error', failure); };
const discardPreview = () => { find('video').pause(); if (videoUrl) URL.revokeObjectURL(videoUrl); videoUrl = ''; previewClip = ''; find('video').removeAttribute('src'); find('video').hidden = true; find('.pe-empty').hidden = false; };
const act = async operation => {
  if (busy) return; busy = true; render();
  try { await operation(); } catch (error) { notify(error.message, true); }
  finally { busy = false; await context.refresh(); render(); }
};
async function edit(action, extra = {}) {
  const current = job(); await context.request('/python/editor/edit', { id: current.id, revision: current.pythonTimeline.revision, action, clipId: selectedId, ...extra });
  discardPreview(); signature = ''; await context.refresh(); render(); notify('Монтаж сохранён. Исходник не изменён.');
}
function select(id) { selectedId = id; discardPreview(); signature = ''; render(); find('.pe-track button[aria-selected="true"]')?.focus({preventScroll:true}); }
async function preview(all = false) {
  const current = job(); notify('Готовим предпросмотр…');
  const response = await context.request('/python/editor/preview', { id: current.id, revision: current.pythonTimeline.revision, ...(all ? {} : { clipId: selectedId }) });
  const res = await fetch(`/python/editor/video/${response.previewId}`, { headers: { 'X-Recorder-Key': context.key } });
  if (!res.ok) throw Error('Предпросмотр недоступен. Попробуйте снова.');
  const bytes = await res.blob(); discardPreview(); videoUrl = URL.createObjectURL(bytes);
  previewClip = all ? '' : selectedId; previewRevision = response.revision;
  find('.pe-player').src = videoUrl; find('.pe-player').hidden = false; find('.pe-empty').hidden = true;
  notify(all ? 'Предпросмотр всего монтажа. Проверьте звук и стыки.' : 'Фрагмент готов к просмотру. Остановите воспроизведение в месте разреза.');
}
function render() {
  const state = context.state(); if (!state) return;
  const projects = state.jobs.filter(item => item.pythonTimeline);
  editor.hidden = !projects.length; if (!projects.length) return;
  const active = projects.find(item => ['starting', 'recording', 'stopping'].includes(item.status));
  if (active && active.id !== projectId || !projects.some(item => item.id === projectId)) { projectId = active?.id || projects[0].id; selectedId = ''; signature = ''; discardPreview(); }
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
  const waiting = busy || Boolean(state.editorBusy) || Boolean(state.updater?.busy) || Boolean(state.uploadingId);
  const locked = waiting || timeline.approved;
  if (!timeline.clips.some(clip => clip.id === selectedId)) selectedId = timeline.clips.at(-1)?.id || '';
  const selected = selection();
  const nextSignature = JSON.stringify([projectId, timeline.revision, selectedId, scale, timeline.clips]);
  if (nextSignature !== signature) {
    signature = nextSignature;
    const track = find('.pe-track'), ruler = find('.pe-ruler'); track.replaceChildren(); ruler.replaceChildren();
    let position = 0;
    timeline.clips.forEach((clip, index) => {
      const width = Math.max(72, (clip.end - clip.start) * scale);
      const mark = document.createElement('span'); mark.style.width = `${width}px`; mark.textContent = clock(position); ruler.append(mark);
      const button = document.createElement('button'); button.type = 'button'; button.style.width = `${width}px`; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(clip.id === selectedId)); button.setAttribute('aria-label', `Фрагмент ${index + 1}, ${clock(clip.end - clip.start)}`);
      const title = document.createElement('strong'); title.textContent = `Клип ${index + 1}`; const duration = document.createElement('small'); duration.textContent = clock(clip.end - clip.start); button.append(title, duration);
      button.onclick = () => select(clip.id); button.oncontextmenu = event => { event.preventDefault(); select(clip.id); showMenu(event.clientX, event.clientY); }; track.append(button); position += clip.end - clip.start;
    });
    if (selected) {
      find('.pe-selection').textContent = `Фрагмент ${timeline.clips.findIndex(clip => clip.id === selectedId) + 1} · ${clock(selected.end - selected.start)}`;
      field('point').value = ((selected.end - selected.start) / 2).toFixed(2); field('in').value = '0'; field('out').value = (selected.end - selected.start).toFixed(2);
    } else find('.pe-selection').textContent = 'Поставьте запись на паузу, чтобы закончить первый дубль';
  }
  find('.pe-track .pe-recording')?.remove();
  if (isActive && !state.obs?.outputPaused) {
    const recording = document.createElement('button'); recording.type = 'button'; recording.className = 'pe-recording'; recording.style.width = `${Math.max(120, (timeline.sourceEnd - (timeline.openStart || 0)) * scale)}px`; recording.textContent = '● Новый дубль'; recording.onclick = () => notify('Текущий дубль сначала поставьте на паузу.'); find('.pe-track').append(recording);
  }
  find('.pe-duration').textContent = `Итого ${clock(timeline.clips.reduce((sum, clip) => sum + clip.end - clip.start, 0))}`;
  editor.querySelectorAll('[data-op]').forEach(button => { const op = button.dataset.op; button.disabled = locked || (!selected && !['undo', 'pause', 'retake', 'publish', 'preview-all'].includes(op)); });
  find('[data-op=undo]').disabled = locked || !timeline.canUndo;
  find('[data-op=pause]').disabled = locked || !isActive; find('[data-op=pause]').textContent = state.obs?.outputPaused ? '▶ Продолжить запись' : 'Ⅱ Пауза';
  find('[data-op=retake]').disabled = locked || !isActive;
  find('[data-op=stop]').disabled = locked || !isActive;
  find('[data-op=publish]').disabled = locked || anyActive || !current.file || !timeline.clips.length || !timeline.finalized;
  find('[data-op=preview-all]').disabled = waiting || !timeline.clips.length || isActive && !state.obs?.outputPaused;
  find('[data-op=preview]').disabled = waiting || !selected || isActive && !state.obs?.outputPaused;
  const index=timeline.clips.findIndex(clip=>clip.id===selectedId), after=timeline.clips[index+1];
  find('[data-op=move-left]').disabled=locked||index<=0;
  find('[data-op=move-right]').disabled=locked||index<0||index>=timeline.clips.length-1;
  find('[data-op=join]').disabled=locked||!selected||!after||Math.abs(selected.end-after.start)>.001;
  editor.querySelectorAll('[data-field]').forEach(input=>{input.disabled=locked||!selected;});
  if (previewRevision !== -1 && previewRevision !== timeline.revision && videoUrl) notify('Лента изменилась. Подготовьте новый предпросмотр перед проверкой.');
}
async function operation(op) {
  const current = job(), selected = selection();
  if (op === 'preview' || op === 'preview-all') return preview(op === 'preview-all');
  if (op === 'pause') return context.request('/material/pause', { id: current.id, paused: !context.state().obs?.outputPaused });
  if (op === 'stop') { await context.request('/material/stop', { id: current.id }); notify('Запись завершена. Просмотрите монтаж и нажмите «Выложить в изучение Python».'); return; }
  if (op === 'retake') {
    if (!context.state().obs?.outputPaused) await context.request('/material/pause', { id: current.id, paused: true });
    await context.refresh(); selectedId = job().pythonTimeline.clips.at(-1)?.id || '';
    if (selectedId) await edit('delete');
    await context.request('/material/pause', { id: current.id, paused: false }); notify('Неудачный последний дубль убран из монтажа. Записываем новый. Ctrl+Z вернёт прежний.'); return;
  }
  if (op === 'publish') { await context.request('/python/editor/publish', { id: current.id, revision: current.pythonTimeline.revision }); notify('Собираем итоговое видео и отправляем в теорию Python.'); return; }
  if (op === 'split') return edit('split', { at: selected.start + Number(field('point').value) });
  if (op === 'trim') return edit('trim', { start: selected.start + Number(field('in').value), end: selected.start + Number(field('out').value) });
  if (op === 'move-left' || op === 'move-right') return edit('move', { direction: op === 'move-left' ? -1 : 1 });
  return edit(op);
}
editor.querySelectorAll('[data-op]').forEach(button => button.onclick = () => void act(() => operation(button.dataset.op)));
find('select').onchange = event => { projectId = event.target.value; select(''); };
find('[type=range]').oninput = event => { scale = Number(event.target.value); signature = ''; render(); };
find('video').ontimeupdate = () => { if (previewClip === selectedId && selection()) field('point').value = Math.min(selection().end - selection().start, find('video').currentTime).toFixed(2); };
editor.addEventListener('keydown', event => {
  if(event.key==='Tab'&&editor.classList.contains('python-editor--focus')){
    const controls=[...editor.querySelectorAll('button,input,select,video')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
  }
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.ctrlKey && event.key.toLowerCase() === 'z') { event.preventDefault(); void act(() => operation('undo')); }
  else if (event.key === 'Delete' && selectedId) { event.preventDefault(); void act(() => operation('delete')); }
});
function showMenu(x, y) {
  menu?.remove(); menu = document.createElement('div'); menu.className = 'pe-menu'; menu.setAttribute('role', 'menu');
  for (const [op, label] of [['preview', 'Посмотреть'], ['split', 'Разделить в выбранной точке'], ['duplicate', 'Создать копию'], ['join', 'Объединить с правой частью'], ['move-left', 'Переместить раньше'], ['move-right', 'Переместить позже'], ['delete', 'Удалить из монтажа'], ['undo', 'Отменить действие']]) {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = label; button.onclick = () => { menu.remove(); void act(() => operation(op)); }; menu.append(button);
  }
  document.body.append(menu); menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 240))}px`; menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
}
document.addEventListener('pointerdown', event => { if (menu && !menu.contains(event.target)) menu.remove(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') menu?.remove(); });
window.addEventListener('pagehide', () => { if (videoUrl) URL.revokeObjectURL(videoUrl); });
render(); setInterval(render, 1000);
