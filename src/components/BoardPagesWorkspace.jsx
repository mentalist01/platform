import {useCallback,useEffect,useRef,useState} from 'react';
import {PanelLeft,Plus,ChevronLeft,ChevronRight,ChevronDown,X,Pencil,Users,Trash2} from 'lucide-react';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {getStoredAuthToken} from '../services/api.js';
import {MAX_BOARD_PAGES,boardPageBookRoom,boardPageRoom,boardPagesList,boardPageSummonTarget,boardPageInitialState,boardPageAfterChange} from '../utils/boardPages.js';
import './BoardPagesWorkspace.css';
import BoardSelectionClipboard from './BoardSelectionClipboard.jsx';
import {useLessonPageSelection} from '../hooks/useLessonPageSelection.js';
import {groupNotebookBoard} from '../utils/groupNotebook.js';
import {lessonPageTree,lessonPageParentChoices} from '../utils/lessonPageTree.js';
import {requestLessonPages} from '../services/lessonPages.js';
import {boardCommandNow,observeLiveBoardCommand} from '../utils/boardCommandClock.js';

const id = () => crypto.randomUUID();
export default function BoardPagesWorkspace(props) {
  const {Canvas,...canvasProps}=props;
  return canvasProps.sandbox?.id
    ? <Canvas {...canvasProps} pages={{clipboard:props=><BoardSelectionClipboard {...props} key={canvasProps.sandbox.id}/>}}/>
    : <PagedBoardWorkspace {...props}/>;
}
function PagedBoardWorkspace(props) {
  const {Canvas,...canvasProps}=props;
  const {role,userId,userName,teacherId,lessonId,groupId,activeStudentId,readOnly}=canvasProps;
  const teacher=role==='teacher' || role==='admin';
  const group=Boolean(lessonId && groupId);
  const base=group ? groupNotebookBoard(groupId) : (teacherId && (teacher?activeStudentId:userId) ? `board-${teacherId}-${teacher?activeStudentId:userId}` : null);
  const bookRoom=boardPageBookRoom(base);
  const storageKey=bookRoom ? `board-page:${bookRoom}:${role}:${userId}` : '';
  const [initialPage]=useState(()=>{try{return boardPageInitialState(window.localStorage.getItem(storageKey));}catch{return boardPageInitialState(null);}});
  const [pages,setPages]=useState(initialPage.pages);
  const [catalogReady,setCatalogReady]=useState(!group),[retry,setRetry]=useState(0);
  const [pageId,setPageId]=useLessonPageSelection(bookRoom,role,userId,initialPage.pageId);
  const [studentId,setStudentId]=useState('');
  const boardStudentId=group && (teacher ? (canvasProps.participantIds || []).includes(studentId) : studentId===userId) ? studentId : '';
  const [open,setOpen]=useState(false),[connected,setConnected]=useState(false),[peers,setPeers]=useState([]);
  const [parentId,setParentId]=useState('');
  const [editing,setEditing]=useState(''),[title,setTitle]=useState(''),[error,setError]=useState(''),[navigation,setNavigation]=useState(null);
  const [notice,setNotice]=useState('');
  const [summonState,setSummonState]=useState({phase:'idle'});
  const [channelReady,setChannelReady]=useState(false);
  const [deleting,setDeleting]=useState(null);
  const [pageActionBusy,setPageActionBusy]=useState(false),[deletedPage,setDeletedPage]=useState(null);
  const knownPages=useRef(initialPage.pages);
  const runtime=useRef(null),lastCommand=useRef(''),local=useRef({pageId,studentId}),summonDelivery=useRef(null),lastApplied=useRef('');
  useEffect(()=>{local.current={pageId,studentId:boardStudentId};},[pageId,boardStudentId]);
  const publish=useCallback(()=>runtime.current?.provider.awareness.setLocalStateField('boardPage',{
    userId,name:userName || (teacher?'Учитель':'Ученик'),role:teacher?'teacher':'student',...local.current,summonApplied:lastApplied.current,
  }),[userId,userName,teacher]);
  useEffect(()=>{
    if (!bookRoom) return undefined;
    let disposed=false,cleanup;
    const start=async()=>{
      const [{Y,WebsocketProvider},{createBoardSummonDelivery},catalog]=await Promise.all([loadYjsRuntime(),import('../utils/boardSummonDelivery.js'),requestLessonPages(bookRoom)]);if(disposed)return;
      if(group && catalog?.pages?.length){knownPages.current=catalog.pages;setPages(catalog.pages);setPageId(current=>catalog.pages.some(p=>p.id===current)?current:catalog.defaultPageId||catalog.pages[0].id);}
      setCatalogReady(true);
      const doc=new Y.Doc(),provider=new WebsocketProvider(getCollabWsUrl(),bookRoom,doc,{params:{_auth:getStoredAuthToken() || ''},disableBc:true});
      const map=doc.getMap('pages'),control=doc.getMap('pageControl');
      runtime.current={doc,provider,map,control};
      const delivery=createBoardSummonDelivery({isReady:()=>provider.wsconnected && provider.synced && provider.ws?.readyState===1,send:command=>control.set('summon',command),onState:setSummonState,now:boardCommandNow});
      summonDelivery.current=delivery;
      setChannelReady(true);
      const update=()=>{
        // Keep the remembered canvas while the initially empty manifest syncs.
        // Validating before sync opened page 1 before the intended canvas.
        if(!provider.synced)return;
        const previous=knownPages.current,next=boardPagesList(map);knownPages.current=next;setPages(next);
        setPageId(current=>boardPageAfterChange(previous,next,current));
        setEditing(current=>next.some(p=>p.id===current)?current:'');
        setDeleting(current=>current && next.some(p=>p.id===current.id)?current:null);
        // The command can arrive before its newly created page is synced.
        // Re-check it when the manifest catches up instead of losing the click.
        controls();
      };
      const controls=()=>{
        const command=control.get('summon');if(teacher || command?.id===lastCommand.current)return;
        const target=boardPageSummonTarget(command,userId,boardPagesList(map));if(!target)return;
        lastCommand.current=target.id;setPageId(target.pageId);setStudentId(target.studentId);setNavigation(target);
        setNotice('Учитель переместил вас на свою страницу и к своему месту');
      };
      const presence=()=>{const next=Array.from(provider.awareness.getStates().entries())
        .filter(([client])=>client!==doc.clientID).map(([client,state])=>({...state?.boardPage,client}))
        .filter(peer=>peer.userId && peer.pageId && peer.userId!==userId);setPeers(next);
        for(const peer of next)delivery.acknowledge(peer.userId,peer.summonApplied);
      };
      const status=()=>setConnected(provider.wsconnected && provider.synced);
      const sync=()=>{status();update();controls();publish();delivery.flush();};
      const liveControls=()=>{if(!teacher && provider.synced)observeLiveBoardCommand(control.get('summon'));controls();};
      map.observe(update);control.observe(liveControls);provider.awareness.on('change',presence);
      provider.on('status',status);provider.on('sync',sync);update();publish();
      cleanup=()=>{delivery.dispose();summonDelivery.current=null;setChannelReady(false);map.unobserve(update);control.unobserve(liveControls);provider.awareness.off('change',presence);provider.off('status',status);provider.off('sync',sync);provider.destroy();doc.destroy();runtime.current=null;};
      if(disposed)cleanup();
    };
    void start().catch(e=>{if(!disposed)setError(e.message || 'Не удалось подключить страницы');});
    return()=>{disposed=true;cleanup?.();};
  },[bookRoom,storageKey,teacher,userId,publish,setPageId,group,retry]);
  useEffect(()=>{publish();try{if(storageKey && runtime.current?.provider.synced)window.localStorage.setItem(storageKey,pageId);}catch{/* Storage is optional. */}},[pageId,boardStudentId,storageKey,publish]);
  useEffect(()=>{summonDelivery.current?.cancel();},[pageId,boardStudentId]);
  useEffect(()=>{if(!notice)return undefined;const timer=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{
    if(!['queued','waiting','confirmed','sent'].includes(summonState.phase))return undefined;
    const delay=summonState.phase==='queued'?30_000:(summonState.phase==='waiting'?5000:3500);
    const timer=setTimeout(()=>{
      if(['queued','waiting'].includes(summonState.phase))summonDelivery.current?.timeout();
      else setSummonState({phase:'idle'});
    },delay);
    return()=>clearTimeout(timer);
  },[summonState.phase,summonState.id]);
  const choose=next=>{summonDelivery.current?.cancel();setNavigation(null);setPageId(next);setEditing('');setDeleting(null);setNotice('');};
  const toggle=()=>setOpen(current=>!current);
  const changePage=async input=>{
    if(!teacher||readOnly||!connected||pageActionBusy)return null;
    setPageActionBusy(true);setError('');
    try{return await requestLessonPages(bookRoom,input);}catch(cause){setError(cause.message);return null;}finally{setPageActionBusy(false);}
  };
  const create=async(parentId='')=>{if(pages.length>=MAX_BOARD_PAGES)return;const result=await changePage({action:'create',name:parentId?'Новая часть':`Страница ${pages.length+1}`,parentId});if(result){choose(result.id);setOpen(true);if(parentId){setTitle('Новая часть');setParentId(parentId);setEditing(result.id);}}};
  const rename=async()=>{const value=title.trim().slice(0,80);if(value&&await changePage({action:'update',id:editing,name:value,parentId}))setEditing('');};
  const remove=async()=>{
    if(!deleting)return;const removed=deleting;
    if(await changePage({action:'delete',id:removed.id})){summonDelivery.current?.cancel();setNavigation(null);setDeletedPage(removed);setNotice('Страница с доской и кодом убрана');setDeleting(null);}
  };
  const summon=useCallback(viewport=>{if(!teacher || readOnly)return;
    const targetIds=group?(boardStudentId?[boardStudentId]:(canvasProps.participantIds || [])):[activeStudentId];
    summonDelivery.current?.request({id:id(),pageId,studentId:boardStudentId,...viewport},targetIds);
  },[teacher,readOnly,pageId,boardStudentId,group,canvasProps.participantIds,activeStudentId]);
  const acknowledgeNavigation=useCallback(command=>{
    if(teacher || !command?.id || command.id!==lastCommand.current
      || command.pageId!==pageId || command.studentId!==boardStudentId)return false;
    if(command.id===lastApplied.current)return true;
    // The canvas has applied the viewport and synced the destination room.
    // Background tabs may suspend animation frames; delivery must not wait for paint.
    lastApplied.current=command.id;publish();return true;
  },[teacher,publish,pageId,boardStudentId]);
  const summonMessage={queued:'Восстанавливаем связь — призыв отправится автоматически',waiting:group && !boardStudentId?'Призыв отправлен — ждём перемещения учеников':'Призыв отправлен — ждём перемещения ученика',sent:'Призыв отправлен',confirmed:group && !boardStudentId?'Ученики перемещены к вам':'Ученик перемещён к вам',expired:'Связь не восстановилась. Повторите призыв после подключения',unconfirmed:group && !boardStudentId?'Не удалось проверить перемещение всех учеников. Проверьте, открыты ли у них доски и есть ли связь':'Нет ответа от доски ученика. Проверьте, открыта ли она и есть ли связь'}[summonState.phase];
  const displayPages=lessonPageTree(pages),page=pages.find(p=>p.id===pageId)||pages[0],index=displayPages.findIndex(p=>p.id===pageId);
  const uniquePeers=Array.from(new Map(peers.map(p=>[p.userId,p])).values());
  const label=p=>`${p.name || 'Участник'} — ${pages.find(page=>page.id===p.pageId)?.title || 'Страница'}${group ? (p.studentId?' · личная доска':' · общая доска') : ''}`;
  const together=p=>p.pageId===pageId && (!group || String(p.studentId || '')===boardStudentId);
  const peerStatus=p=>together(p)?'С вами':(p.pageId===pageId?'Другая доска':`Стр. ${pages.findIndex(page=>page.id===p.pageId)+1 || '—'}`);
  const samePlaceCount=uniquePeers.filter(together).length;
  const initials=p=>String(p.name || 'У').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('');
  const header=<div className="board-pages-heading" onPointerDown={e=>e.stopPropagation()}>
    <button type="button" onClick={toggle} className={`board-pages-current ${open?'is-active':''}`} aria-label={`Выбор страницы: ${page.title}`} aria-expanded={open} title={page.title}>
      <PanelLeft size={16}/><span className="board-pages-current__title">{page.title}</span><span className="board-pages-current__count">{index+1}/{pages.length}</span><ChevronDown size={14}/>
    </button>
    <div className="board-prepared-slot"/>
    {uniquePeers.length>0 && <details className="board-pages-peers"><summary aria-label="Участники на страницах" title={uniquePeers.map(label).join('\n')}>
      <span className="board-pages-avatars" aria-hidden="true">{uniquePeers.slice(0,3).map(peer=><span className={`board-pages-avatar ${together(peer)?'is-together':''}`} key={peer.userId}>{initials(peer)}</span>)}</span>
      {uniquePeers.length===1 ? <><span className="board-pages-peer-name">{uniquePeers[0].name || 'Участник'}</span><span className={`board-pages-peer-state ${together(uniquePeers[0])?'is-together':''}`}>{peerStatus(uniquePeers[0])}</span></> : <span className="board-pages-peer-name">{samePlaceCount===uniquePeers.length?`${samePlaceCount} с вами`:`${uniquePeers.length} онлайн`}</span>}
      <ChevronDown size={13}/>
    </summary><div className="board-pages-peers__list"><div className="board-pages-peers__caption"><Users size={14}/>Кто где находится</div>{uniquePeers.map(peer=><div className="board-pages-peer" key={peer.userId} title={label(peer)}><span className={`board-pages-avatar ${together(peer)?'is-together':''}`}>{initials(peer)}</span><span><strong>{peer.name || 'Участник'}</strong><small>{pages.find(page=>page.id===peer.pageId)?.title || 'Страница'}{group?` · ${peer.studentId?'личная доска':'общая доска'}`:''}</small></span><i className={together(peer)?'is-together':''} aria-label={peerStatus(peer)}/></div>)}</div></details>}
    {(summonMessage || notice) && <span role="status" data-summon-phase={teacher?summonState.phase:undefined} data-summon-elapsed-ms={teacher?summonState.elapsedMs:undefined} className="board-pages-notice">{summonMessage || notice}</span>}
  </div>;
  const panel=open ? <aside className={`board-pages-panel ${canvasProps.embedded?'is-embedded':''}`} aria-label="Страницы доски"><div className="board-pages-panel__head"><span><PanelLeft size={17}/><strong>Страницы</strong><small>{pages.length}</small></span><button type="button" onClick={toggle} aria-label="Свернуть страницы"><X size={17}/></button></div>
    {teacher && !readOnly && <button type="button" onClick={()=>void create()} disabled={!connected || pageActionBusy || pages.length>=MAX_BOARD_PAGES} className="board-pages-create"><Plus size={17}/>Новая страница</button>}
    {error && <p role="alert">{error}</p>}
    <nav className="board-pages-list" aria-label="Выбор страницы">{displayPages.map((p,i)=><div style={{marginLeft:p.depth*16}} className={`board-pages-row ${p.id===pageId?'is-active':''}`} key={p.id}><><button type="button" onClick={()=>choose(p.id)} aria-current={p.id===pageId?'page':undefined} title={p.title}><span className="board-pages-number">{p.depth?'↳':i+1}</span><span>{p.title}</span></button>{teacher && !readOnly && <><button type="button" className="board-pages-rename" disabled={!connected} aria-label={`Переименовать ${p.title}`} onClick={()=>{setTitle(p.title);setParentId(p.parentId||'');setEditing(p.id);}}><Pencil size={13}/></button>{!p.depth&&<button type="button" className="board-pages-rename" disabled={!connected||pageActionBusy} aria-label={`Добавить подстраницу в ${p.title}`} onClick={()=>void create(p.id)}><Plus size={14}/></button>}<button type="button" className="board-pages-delete" disabled={!connected || pages.length<=1} aria-label={`Удалить ${p.title}`} title={pages.length<=1?'На доске должна остаться хотя бы одна страница':'Удалить страницу'} onClick={()=>setDeleting(p)}><Trash2 size={14}/></button></>}</>{uniquePeers.some(peer=>peer.pageId===p.id) && <small><span className="board-pages-dot"/>{uniquePeers.filter(peer=>peer.pageId===p.id).map(peer=>peer.name || 'Участник').join(', ')}</small>}</div>)}</nav>
    {editing&&<form className="board-page-edit-form" onSubmit={event=>{event.preventDefault();void rename();}}><label>Название страницы<input aria-label="Название страницы" value={title} maxLength={80} onChange={event=>setTitle(event.target.value)} required/></label><label>Внутри страницы<select aria-label="Родительская страница доски" value={parentId} onChange={event=>setParentId(event.target.value)} disabled={pages.some(page=>page.parentId===editing)}><option value="">Основная страница</option>{lessonPageParentChoices(pages,editing).map(page=><option key={page.id} value={page.id}>{page.title}</option>)}</select></label><div><button type="button" onClick={()=>setEditing('')}>Отмена</button><button type="submit" disabled={!connected||pageActionBusy||!title.trim()}>Сохранить</button></div></form>}
    {deleting && <div className="board-pages-delete-confirm" role="alertdialog" aria-label="Удалить страницу?" onKeyDown={e=>{if(e.key==='Escape')setDeleting(null);}}><strong>Убрать страницу?</strong><p>«{deleting.title}» с доской и кодом будет убрана у участников. Её можно восстановить.{group?' Личные работы сохраняются.':''}</p><div><button type="button" autoFocus onClick={()=>setDeleting(null)}>Отмена</button><button type="button" disabled={!connected||pageActionBusy} className="board-pages-delete-confirm__submit" onClick={remove}>Убрать страницу</button></div></div>}
    {deletedPage&&<div className="board-pages-delete-confirm" role="status">Страница «{deletedPage.title}» убрана. <button type="button" disabled={!connected||pageActionBusy} onClick={async()=>{if(await changePage({action:'restore',id:deletedPage.id})){choose(deletedPage.id);setDeletedPage(null);}}}>Восстановить страницу</button></div>}
    <footer><button type="button" disabled={index<=0} onClick={()=>choose(displayPages[index-1].id)} aria-label="Предыдущая страница"><ChevronLeft size={18}/></button><span>{index+1} / {pages.length}</span><button type="button" disabled={index>=pages.length-1} onClick={()=>choose(displayPages[index+1].id)} aria-label="Следующая страница"><ChevronRight size={18}/></button></footer>
  </aside> : null;
  if(group&&!catalogReady)return <div className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-2xl border border-violet-100 bg-white p-6 text-center" role="status"><PanelLeft size={24} className="text-violet-600"/><strong>{error?'Не удалось открыть тетрадь группы':'Открываем страницы группы…'}</strong>{error?<><p role="alert" className="text-sm text-rose-700">{error}</p><button type="button" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white" onClick={()=>{setError('');setRetry(n=>n+1);}}>Повторить подключение</button></>:<p className="text-sm text-slate-500">Загружаем сохранённые страницы и записи на доске.</p>}</div>;
  return <Canvas {...canvasProps} pages={{liveRoomId:boardPageRoom(base,pageId,boardStudentId),pageId,boardStudentId,selectPage:choose,selectWindow:next=>{summonDelivery.current?.cancel();setStudentId(next);setNavigation(null);},summon,canSummon:teacher && !readOnly && channelReady,navigation,summonNotice:!teacher && Boolean(notice),acknowledgeNavigation,header,panel,clipboard:props=><BoardSelectionClipboard {...props} key={base}/>}}/>;
}
