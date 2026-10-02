'use strict';
const help = document.getElementById('help');
const updates = document.getElementById('updates');
async function showUpdates() { if (help.open) help.close(); await window.teacherApp.action('help-open'); if (!updates.open) updates.showModal(); }
updates.addEventListener('close', () => { if (!help.open) window.teacherApp.action('help-close'); });
window.teacherApp.onUpdates(showUpdates);
async function showHelp() { if (updates.open) updates.close(); await window.teacherApp.action('help-open'); if (!help.open) help.showModal(); }
help.addEventListener('close', () => { if (!updates.open) window.teacherApp.action('help-close'); });
window.teacherApp.onHelp(showHelp);
document.getElementById('brand').addEventListener('click', event => { event.preventDefault(); window.teacherApp.action('cabinet'); });
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
  if (button.dataset.action === 'help') { await showHelp(); return; }
  if (button.dataset.action === 'updates') { await showUpdates(); return; }
  if (button.dataset.action === 'recording-settings') help.close();
  button.disabled = true;
  try { await window.teacherApp.action(button.dataset.action); } finally { button.disabled = false; }
}));
function render(state) {
  document.getElementById('version').textContent = `Версия ${state.version}`;
  document.getElementById('recorder-dot').classList.toggle('ready', state.recorderReady);
  document.getElementById('download').textContent = state.download || (state.downloadCount ? `· ${state.downloadCount}` : '');
  document.getElementById('overlay').hidden = state.page === 'ready';
  document.getElementById('heading').textContent = state.page === 'error' ? 'Не удалось открыть кабинет' : 'Открываем ваш кабинет';
  document.getElementById('message').textContent = state.page === 'error' ? 'Проверьте подключение к интернету и попробуйте снова. Пульт и записи на компьютере доступны отдельно.' : 'Расписание, ученики и уроки — в одном окне.';
  document.getElementById('loading').hidden = state.page === 'error';
  document.getElementById('error-actions').hidden = state.page !== 'error';
  const update = state.update || { status: 'idle' };
  const messages = {
    idle: ['Автоматическое обновление включено', 'Новые версии проверяются при запуске и каждые 6 часов.'],
    checking: ['Проверяем новую версию', 'Можно продолжать работать в кабинете.'],
    current: ['У вас последняя версия', 'Приложение проверит обновления позже.'],
    available: ['Есть новая версия', 'Готовим загрузку обновления.'],
    waiting: ['Загрузим после урока', 'Пульт занят или в приложении воспроизводится звук. Обновление подождёт.'],
    downloading: ['Скачиваем обновление', `${update.percent || 0}% · Приложение продолжает работать.`],
    ready: ['Обновление готово', `Версия ${update.version} установится при обычном закрытии приложения. Если пульт занят, установка отложится.`],
    error: ['Сейчас не удалось обновиться', 'Рабочая версия сохранена. Проверьте интернет — приложение попробует позже.'],
    development: ['Режим разработки', 'Автоматические обновления работают в установленном приложении.']
  };
  const [title, message] = messages[update.status] || messages.idle;
  document.getElementById('update-title').textContent = title;
  document.getElementById('update-message').textContent = message;
  document.getElementById('update-version').textContent = `Установлена версия ${state.version}`;
  document.getElementById('update-badge').textContent = update.status === 'ready' ? '●' : update.status === 'downloading' ? `${update.percent || 0}%` : '';
  document.getElementById('updates-button').title = title;
  document.getElementById('update-progress').hidden = update.status !== 'downloading';
  document.getElementById('update-progress').value = update.percent || 0;
  document.getElementById('check-updates').disabled = ['checking', 'downloading', 'ready', 'development'].includes(update.status);
}
window.teacherApp.onState(render);
window.teacherApp.state().then(render);
