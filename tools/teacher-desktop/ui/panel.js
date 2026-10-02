'use strict';
let current;
const api = window.teacherPanel;
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function button(text, action, id, title) { const node = element('button', text); if (title) node.title = title; node.onclick = () => run(action, id); return node; }
async function run(action, id) {
  document.getElementById('error').hidden = true;
  try { await api.action(action, id); } catch (error) { const node = document.getElementById('error'); node.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''); node.hidden = false; }
}
function size(bytes) { return bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)} ГБ` : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} МБ` : `${Math.ceil(bytes / 1024)} КБ`; }
function render(state) {
  current = state;
  const accounts = state.kind === 'accounts';
  document.getElementById('title').textContent = accounts ? 'Сохранённые входы' : 'Загрузки';
  document.getElementById('subtitle').textContent = accounts ? 'Выберите преподавателя, чтобы подставить код.' : 'Сохранено в «Загрузки» · файлы можно перетаскивать';
  const list = document.getElementById('list'); list.replaceChildren();
  const entries = accounts ? state.accounts.entries : state.downloads;
  if (!entries.length) list.append(element('p', accounts ? 'После успешного входа код преподавателя появится здесь. Коды хранятся в зашифрованном виде на этом компьютере.' : 'Скачанные картинки и документы появятся здесь. Перетащите готовый файл на доску или в другое приложение.', 'empty'));
  if (accounts && !state.accounts.available) list.append(element('p', 'Windows не разрешила шифрование. Сохранение кодов недоступно.', 'empty'));
  for (const entry of entries) {
    const row = element('div', undefined, `row${accounts ? ' account' : ''}`);
    row.append(element('div', accounts ? entry.label.slice(0, 1).toUpperCase() : '↓', 'glyph'));
    const details = element('div', undefined, 'details'); const actions = element('div', undefined, 'actions');
    if (accounts) {
      const choose = button(entry.label, 'choose', entry.id); choose.className = 'choose'; details.append(choose, element('p', 'Код защищён Windows', 'meta'));
      actions.append(button('×', 'remove', entry.id, 'Удалить сохранённый вход'));
    } else {
      details.append(element('div', entry.name, 'filename'));
      const completed = entry.state === 'completed', percent = entry.total ? Math.min(100, Math.round(entry.bytes / entry.total * 100)) : 0;
      details.append(element('p', completed ? `${size(entry.bytes)} · готово` : entry.state === 'progressing' ? `${size(entry.bytes)}${entry.total ? ` из ${size(entry.total)} · ${percent}%` : ''}` : entry.state === 'cancelled' ? 'Отменено' : 'Скачивание прервано', 'meta'));
      if (completed) {
        row.draggable = true; row.title = 'Перетащите файл на доску или в другое приложение';
        row.addEventListener('dragstart', event => { event.preventDefault(); api.drag(entry.id); });
        actions.append(button('Открыть', 'open', entry.id), button('▣', 'show', entry.id, 'Показать в папке'));
      } else if (entry.state === 'progressing') { const track = element('div', undefined, 'progress'), fill = element('span'); fill.style.width = `${percent}%`; track.append(fill); details.append(track); }
    }
    row.append(details, actions); list.append(row);
  }
  const footer = document.getElementById('footer'); footer.replaceChildren();
  if (!accounts) footer.append(button('Папка «Загрузки»', 'folder'), button('Очистить список', 'clear'));
  else footer.append(element('p', 'Подстановка доступна на странице входа. Удаление убирает только сохранённый код.'));
}
document.querySelector('[data-action=close]').onclick = () => run('close');
document.addEventListener('keydown', event => { if (event.key === 'Escape') run('close'); });
api.onState(render); api.state().then(render);
