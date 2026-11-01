'use strict';
function render(state){document.getElementById('title').textContent=state.title;document.getElementById('status').textContent=state.page==='error'?'Не удалось открыть страницу. Попробуйте обновить.':state.page==='ready'?'':'Открываем вкладку…';}
window.detachedTab.onState(render);window.detachedTab.state().then(render).catch(()=>{});
document.getElementById('reload').addEventListener('click',()=>window.detachedTab.action('reload'));
document.getElementById('return').addEventListener('click',()=>window.detachedTab.action('return'));
