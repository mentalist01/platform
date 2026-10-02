'use strict';
const help = document.getElementById('help');
async function showHelp() { await window.teacherApp.action('help-open'); if (!help.open) help.showModal(); }
help.addEventListener('close', () => window.teacherApp.action('help-close'));
window.teacherApp.onHelp(showHelp);
document.getElementById('brand').addEventListener('click', event => { event.preventDefault(); window.teacherApp.action('cabinet'); });
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
  if (button.dataset.action === 'help') { await showHelp(); return; }
  if (button.dataset.action === 'recording-settings') help.close();
  button.disabled = true;
  try { await window.teacherApp.action(button.dataset.action); } finally { button.disabled = false; }
}));
function render(state) {
  document.getElementById('version').textContent = `Версия ${state.version}`;
  document.getElementById('recorder-dot').classList.toggle('ready', state.recorderReady);
  document.getElementById('download').textContent = state.download || '';
  document.getElementById('overlay').hidden = state.page === 'ready';
  document.getElementById('heading').textContent = state.page === 'error' ? 'Не удалось открыть кабинет' : 'Открываем ваш кабинет';
  document.getElementById('message').textContent = state.page === 'error' ? 'Проверьте подключение к интернету и попробуйте снова. Пульт и записи на компьютере доступны отдельно.' : 'Расписание, ученики и уроки — в одном окне.';
  document.getElementById('loading').hidden = state.page === 'error';
  document.getElementById('error-actions').hidden = state.page !== 'error';
}
window.teacherApp.onState(render);
window.teacherApp.state().then(render);
