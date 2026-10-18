// The library loads small project summaries on demand; polling the recorder
// never needs every old timeline, history or source file.
export function createPythonLibrary({editor,context,onOpen}) {
  const mockStudio=context.kind==='mock-review';
  const label=mockStudio?'Черновики разборов пробников':'Черновики Python';
  const button=document.createElement('button');button.type='button';button.textContent='Черновики';
  editor.querySelector('.pe-project').after(button);
  const css=document.createElement('style');css.textContent=`
  .pe-library{width:min(860px,calc(100vw - 32px));max-height:85dvh;box-sizing:border-box;background:#1b1d30;color:#edf0ff;border:1px solid #786091;border-radius:20px;padding:24px;overflow:auto}
  .pe-library::backdrop{background:#080a16a8}.pe-library header{display:flex;align-items:center;justify-content:space-between;gap:12px}.pe-library h2{margin:0;font-size:22px}.pe-library p{color:#abb7cc;font-size:13px;line-height:1.6}
  .pe-library nav{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 12px}.pe-library nav button[aria-pressed=true]{background:#6d48a0}.pe-library input{width:100%;box-sizing:border-box;margin-bottom:12px}
  .pe-library-list{display:grid;gap:10px}.pe-library article{padding:16px;border:1px solid #43465d;border-radius:12px;background:#24263b}.pe-library article strong{font-size:15px;overflow-wrap:anywhere}.pe-library article p{margin:6px 0 12px}.pe-library-actions{display:flex;gap:8px;flex-wrap:wrap}.pe-library-actions button{padding:9px 12px}.pe-library [role=status]{min-height:24px;color:#c9b2ff;font-size:13px;margin-top:16px}
  `;document.head.append(css);
  const dialog=document.createElement('dialog');dialog.className='pe-library';dialog.setAttribute('aria-label',label);
  dialog.innerHTML='<header><h2>Черновики Python</h2><button type="button" aria-label="Закрыть список черновиков">✕</button></header><p>Монтаж сохраняется автоматически на этом компьютере. Здесь видны все проекты. Удалённые черновики можно восстановить из корзины; исходные видео сохраняются.</p><nav aria-label="Список проектов"><button type="button" data-view="draft">Черновики</button><button type="button" data-view="published">Отправленные</button><button type="button" data-view="trash">Корзина</button><button type="button" data-refresh>Обновить</button></nav><input type="search" aria-label="Поиск черновика" placeholder="Название или дата"><div class="pe-library-list"></div><div role="status" aria-live="polite"></div>';
  dialog.querySelector('h2').textContent=label;
  editor.append(dialog);
  let projects=[],view='draft',working=false,renameId='';
  const status=message=>{dialog.querySelector('[role=status]').textContent=message;};
  const name=project=>project.name||`${project.title||'Запись Python'} · ${new Date(project.createdAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}`;
  const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  const locked=()=>working||context.state()?.jobs.some(job=>['starting','recording','stopping','uploading'].includes(job.status))||context.state()?.preparingUpload||context.state()?.updater?.busy;
  async function load(){projects=(await context.request(mockStudio?'/mock-review/projects':'/python/projects')).projects;render();}
  async function action(project,action,extra={}) {
    working=true;render();status('Сохраняем…');
    try{await context.request('/python/project/manage',{id:project.id,revision:project.revision,action,...extra});renameId='';await context.refresh();await load();status(action==='archive'?'Черновик в корзине. Его можно восстановить.':action==='restore'?'Черновик восстановлен.':action==='rename'?'Название сохранено.':'Черновик сохранён.');}
    catch(error){status(error.message);}
    finally{working=false;render();}
  }
  function render(){
    dialog.querySelectorAll('[data-view]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.view===view)));
    const query=dialog.querySelector('input[type=search]').value.trim().toLowerCase();
    const list=dialog.querySelector('.pe-library-list');list.replaceChildren();
    for(const project of projects.filter(p=>(view==='trash'?p.archivedAt:view==='published'?!p.archivedAt&&p.approved:!p.archivedAt&&!p.approved)&&name(p).toLowerCase().includes(query))){
      const card=document.createElement('article'),title=document.createElement('strong'),detail=document.createElement('p'),actions=document.createElement('div');
      title.textContent=name(project);detail.textContent=`${new Date(project.createdAt).toLocaleString('ru-RU')} · ${project.clips} фрагм. · Готовое видео ${clock(project.duration)}${project.speed!==1?` · ${project.speed}×`:''}${project.approved?project.published?' · Опубликовано':' · Отправка / проверка':''}`;
      actions.className='pe-library-actions';card.append(title,detail,actions);list.append(card);
      function control(label,callback){const el=document.createElement('button');el.type='button';el.textContent=label;el.disabled=Boolean(locked());el.onclick=callback;actions.append(el);return el;}
      if(view==='trash'){control('Восстановить',()=>void action(project,'restore'));continue;}
      if(renameId===project.id){
        const input=document.createElement('input');input.type='text';input.maxLength=100;input.value=name(project);input.setAttribute('aria-label','Новое название черновика');actions.before(input);
        control('Сохранить название',()=>void action(project,'rename',{name:input.value}));control('Отмена',()=>{renameId='';render();});input.focus();
      }else{
        control('Открыть',async()=>{working=true;render();try{await context.request('/python/project/open',{id:project.id});await context.refresh();await onOpen(project.id);dialog.close();}catch(error){status(error.message);}finally{working=false;render();}});
        control('Переименовать',()=>{renameId=project.id;render();});
        control('Сохранить',()=>void action(project,'save'));
        if(!project.approved)control('Удалить',()=>void action(project,'archive'));
      }
    }
    if(!list.children.length){const p=document.createElement('p');p.textContent='Здесь пока нет проектов.';list.append(p);}
  }
  dialog.querySelector('header button').onclick=()=>dialog.close();
  dialog.querySelector('input[type=search]').oninput=render;
  dialog.querySelectorAll('[data-view]').forEach(item=>{item.onclick=()=>{view=item.dataset.view;renameId='';status('');render();};});
  dialog.querySelector('[data-refresh]').onclick=()=>void load().catch(error=>status(error.message));
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  button.onclick=async()=>{dialog.showModal();status('Загружаем список…');try{await load();status('');}catch(error){status(error.message);}};
  return button;
}
