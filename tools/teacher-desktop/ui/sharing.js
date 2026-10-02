'use strict';
let sources = [], kind = 'platform', selected = 'platform-tab', audioRequested = false;
const container = document.getElementById('sources');
function render() {
  container.replaceChildren();
  const visible = kind === 'platform' ? [{ id: 'platform-tab', name: 'Кабинет IVAN100', kind: 'platform' }] : sources.filter(source => source.kind === kind);
  visible.forEach(source => {
    const button = document.createElement('button'); button.className = `source${selected === source.id ? ' selected' : ''}`;
    button.setAttribute('role', 'listitem'); button.setAttribute('aria-label', source.name); button.setAttribute('aria-pressed', String(selected === source.id));
    if (source.thumbnail) { const image = document.createElement('img'); image.src = source.thumbnail; image.alt = ''; button.append(image); }
    else { const placeholder = document.createElement('div'); placeholder.className = 'placeholder'; placeholder.textContent = 'IVAN100'; button.append(placeholder); }
    const label = document.createElement('span'); label.textContent = source.name; button.append(label);
    button.addEventListener('click', () => { selected = source.id; render(); }); container.append(button);
  });
  if (!visible.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Откройте нужное окно и обновите список.'; container.append(empty); }
  document.getElementById('choose').disabled = !visible.some(source => source.id === selected);
  document.getElementById('audio-label').hidden = !audioRequested;
  document.getElementById('audio-hint').textContent = kind === 'platform' ? 'Только звук кабинета' : 'Звук всего компьютера, включая уведомления';
}
async function refresh() {
  const button = document.getElementById('refresh'); button.disabled = true;
  try { const result = await window.sharingPicker.list(); sources = result.sources; audioRequested = result.audioRequested; document.getElementById('error').textContent = ''; render(); }
  catch { document.getElementById('error').textContent = 'Не удалось получить окна. Попробуйте обновить список.'; }
  finally { button.disabled = false; }
}
document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => {
  kind = button.dataset.kind; selected = kind === 'platform' ? 'platform-tab' : null;
  document.querySelectorAll('[data-kind]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button))); render();
}));
document.getElementById('refresh').addEventListener('click', refresh);
document.getElementById('cancel').addEventListener('click', () => window.sharingPicker.cancel());
document.getElementById('choose').addEventListener('click', async () => { document.getElementById('choose').disabled = true; await window.sharingPicker.choose(selected, document.getElementById('audio').checked); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') window.sharingPicker.cancel(); });
render(); refresh();
