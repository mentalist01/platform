import {useCallback,useEffect,useRef,useState} from 'react';
import {PanelLeft,Plus,ChevronLeft,ChevronRight,ChevronDown,X,Pencil,Users,Trash2} from 'lucide-react';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {getStoredAuthToken} from '../services/api.js';
import {MAX_BOARD_PAGES,boardPageBookRoom,boardPageRoom,boardPagesList,boardPageSummonTarget,boardPageInitialState,deleteBoardPage,boardPageAfterChange} from '../utils/boardPages.js';
import './BoardPagesWorkspace.css';
import BoardSelectionClipboard from './BoardSelectionClipboard.jsx';

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
  const base=group ? `board-lesson-${lessonId}` : (teacherId && (teacher?activeStudentId:userId) ? `board-${teacherId}-${teacher?activeStudentId:userId}` : null);
  const bookRoom=boardPageBookRoom(base);
  const storageKey=bookRoom ? `board-page:${bookRoom}:${role}:${userId}` : '';
  const [initialPage]=useState(()=>{try{return boardPageInitialState(window.localStorage.getItem(storageKey));}catch{return boardPageInitialState(null);}});
  const [pages,setPages]=useState(initialPage.pages);
  const [pageId,setPageId]=useState(initialPage.pageId),[studentId,setStudentId]=useState('');
  const boardStudentId=group && (teacher ? (canvasProps.participantIds || []).includes(studentId) : studentId===userId) ? studentId : '';
  const [open,setOpen]=useState(false),[connected,setConnected]=useState(false),[peers,setPeers]=useState([]);
  const [editing,setEditing]=useState(''),[title,setTitle]=useState(''),[error,setError]=useState(''),[navigation,setNavigation]=useState(null);
  const [notice,setNotice]=useState('');
  const [deleting,setDeleting]=useState(null);
  const knownPages=useRef(initialPage.pages);
  const runtime=useRef(null),lastCommand=useRef(''),local=useRef({pageId,studentId});
  useEffect(()=>{local.current={pageId,studentId:boardStudentId};},[pageId,boardStudentId]);
  const publish=useCallback(()=>runtime.current?.provider.awareness.setLocalStateField('boardPage',{
    userId,name:userName || (teacher?'Учитель':'Ученик'),role:teacher?'teacher':'student',...local.current,
  }),[userId,userName,teacher]);
  useEffect(()=>{
    if (!bookRoom) return undefined;
    let disposed=false,cleanup;
    const start=async()=>{
      const {Y,WebsocketProvider}=await loadYjsRuntime();if(disposed)return;
      const doc=new Y.Doc(),provider=new WebsocketProvider(getCollabWsUrl(),bookRoom,doc,{params:{_auth:getStoredAuthToken() || ''},disableBc:true});
      const map=doc.getMap('pages'),control=doc.getMap('pageControl');
      runtime.current={doc,provider,map,control};
      const update=()=>{
        // Keep the remembered canvas while the initially empty manifest syncs.
        // Validating before sync opened page 1 before the intended canvas.
        if(!provider.synced)return;
        const previous=knownPages.current,next=boardPagesList(map);knownPages.current=next;setPages(next);
        setPageId(current=>boardPageAfterChange(previous,next,current));
        setEditing(current=>next.some(p=>p.id===current)?current:'');
        setDeleting(current=>current && next.some(p=>p.id===current.id)?current:null);
      };
      const controls=()=>{
        const command=control.get('summon');if(teacher || command?.id===lastCommand.current)return;
        const target=boardPageSummonTarget(command,userId,boardPagesList(map));if(!target)return;
        lastCommand.current=target.id;setPageId(target.pageId);setStudentId(target.studentId);setNavigation(target);
        setNotice('Учитель переместил вас на свою страницу и к своему месту');
      };
      const presence=()=>setPeers(Array.from(provider.awareness.getStates().entries())
        .filter(([client])=>client!==doc.clientID).map(([client,state])=>({...state?.boardPage,client}))
        .filter(peer=>peer.userId && peer.pageId && peer.userId!==userId));
      const status=()=>setConnected(provider.wsconnected && provider.synced);
      const sync=()=>{status();update();controls();publish();};
      map.observe(update);control.observe(controls);provider.awareness.on('change',presence);
      provider.on('status',status);provider.on('sync',sync);update();publish();
      cleanup=()=>{map.unobserve(update);control.unobserve(controls);provider.awareness.off('change',presence);provider.off('status',status);provider.off('sync',sync);provider.destroy();doc.destroy();runtime.current=null;};
      if(disposed)cleanup();
    };
    void start().catch(e=>{if(!disposed)setError(e.message || 'Не удалось подключить страницы');});
    return()=>{disposed=true;cleanup?.();};
  },[bookRoom,storageKey,teacher,userId,publish]);
  useEffect(()=>{publish();try{if(storageKey && runtime.current?.provider.synced)window.localStorage.setItem(storageKey,pageId);}catch{/* Storage is optional. */}},[pageId,boardStudentId,storageKey,publish]);
  useEffect(()=>{if(!notice)return undefined;const timer=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(timer);},[notice]);
  const choose=next=>{setNavigation(null);setPageId(next);setEditing('');setDeleting(null);setNotice('');};
  const toggle=()=>setOpen(current=>!current);
  const create=()=>{
    if(!teacher || readOnly || !connected || pages.length>=MAX_BOARD_PAGES)return;
    const next=id();runtime.current.map.set(next,{title:`Страница ${pages.length+1}`,createdAt:Date.now()});choose(next);setOpen(true);
  };
  const rename=()=>{const value=title.trim().slice(0,80);if(value && teacher && !readOnly && connected && boardPagesList(runtime.current.map).some(p=>p.id===editing)){const old=runtime.current.map.get(editing)||{createdAt:0};runtime.current.map.set(editing,{...old,title:value});}setEditing('');};
  const remove=()=>{
    if(!teacher || readOnly || !connected || !deleting || !runtime.current)return;
    if(deleteBoardPage(runtime.current.map,deleting.id)){setNavigation(null);setNotice('Страница удалена');}
    setDeleting(null);
  };
  const summon=useCallback(viewport=>{if(!teacher || readOnly || !connected)return;runtime.current.control.set('summon',{id:id(),ts:Date.now(),pageId,studentId:boardStudentId,...viewport});},[teacher,readOnly,connected,pageId,boardStudentId]);
  const page=pages.find(p=>p.id===pageId)||pages[0],index=pages.findIndex(p=>p.id===pageId);
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
    {uniquePeers.length>0 && <details className="board-pages-peers"><summary aria-label="Участники на страницах" title={uniquePeers.map(label).join('\n')}>
      <span className="board-pages-avatars" aria-hidden="true">{uniquePeers.slice(0,3).map(peer=><span className={`board-pages-avatar ${together(peer)?'is-together':''}`} key={peer.userId}>{initials(peer)}</span>)}</span>
      {uniquePeers.length===1 ? <><span className="board-pages-peer-name">{uniquePeers[0].name || 'Участник'}</span><span className={`board-pages-peer-state ${together(uniquePeers[0])?'is-together':''}`}>{peerStatus(uniquePeers[0])}</span></> : <span className="board-pages-peer-name">{samePlaceCount===uniquePeers.length?`${samePlaceCount} с вами`:`${uniquePeers.length} онлайн`}</span>}
      <ChevronDown size={13}/>
    </summary><div className="board-pages-peers__list"><div className="board-pages-peers__caption"><Users size={14}/>Кто где находится</div>{uniquePeers.map(peer=><div className="board-pages-peer" key={peer.userId} title={label(peer)}><span className={`board-pages-avatar ${together(peer)?'is-together':''}`}>{initials(peer)}</span><span><strong>{peer.name || 'Участник'}</strong><small>{pages.find(page=>page.id===peer.pageId)?.title || 'Страница'}{group?` · ${peer.studentId?'личная доска':'общая доска'}`:''}</small></span><i className={together(peer)?'is-together':''} aria-label={peerStatus(peer)}/></div>)}</div></details>}
    {notice && <span role="status" className="board-pages-notice">{notice}</span>}
  </div>;
  const panel=open ? <aside className={`board-pages-panel ${canvasProps.embedded?'is-embedded':''}`} aria-label="Страницы доски"><div className="board-pages-panel__head"><span><PanelLeft size={17}/><strong>Страницы</strong><small>{pages.length}</small></span><button type="button" onClick={toggle} aria-label="Свернуть страницы"><X size={17}/></button></div>
    {teacher && !readOnly && <button type="button" onClick={create} disabled={!connected || pages.length>=MAX_BOARD_PAGES} className="board-pages-create"><Plus size={17}/>Новая страница</button>}
    {error && <p role="alert">{error}</p>}
    <nav className="board-pages-list" aria-label="Выбор страницы">{pages.map((p,i)=><div className={`board-pages-row ${p.id===pageId?'is-active':''}`} key={p.id}>{editing===p.id ? <input aria-label="Название страницы" maxLength={80} value={title} autoFocus onChange={e=>setTitle(e.target.value)} onBlur={rename} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();rename();}if(e.key==='Escape')setEditing('');}}/> : <><button type="button" onClick={()=>choose(p.id)} aria-current={p.id===pageId?'page':undefined} title={p.title}><span className="board-pages-number">{i+1}</span><span>{p.title}</span></button>{teacher && !readOnly && <><button type="button" className="board-pages-rename" disabled={!connected} aria-label={`Переименовать ${p.title}`} onClick={()=>{setTitle(p.title);setEditing(p.id);}}><Pencil size={13}/></button><button type="button" className="board-pages-delete" disabled={!connected || pages.length<=1} aria-label={`Удалить ${p.title}`} title={pages.length<=1?'На доске должна остаться хотя бы одна страница':'Удалить страницу'} onClick={()=>setDeleting(p)}><Trash2 size={14}/></button></>}</>}{uniquePeers.some(peer=>peer.pageId===p.id) && <small><span className="board-pages-dot"/>{uniquePeers.filter(peer=>peer.pageId===p.id).map(peer=>peer.name || 'Участник').join(', ')}</small>}</div>)}</nav>
    {deleting && <div className="board-pages-delete-confirm" role="alertdialog" aria-label="Удалить страницу?" onKeyDown={e=>{if(e.key==='Escape')setDeleting(null);}}><strong>Удалить страницу?</strong><p>«{deleting.title}» исчезнет с доски у всех участников.{group?' Общая и личные доски этой страницы будут убраны.':''}</p><div><button type="button" autoFocus onClick={()=>setDeleting(null)}>Отмена</button><button type="button" disabled={!connected} className="board-pages-delete-confirm__submit" onClick={remove}>Удалить</button></div></div>}
    <footer><button type="button" disabled={index<=0} onClick={()=>choose(pages[index-1].id)} aria-label="Предыдущая страница"><ChevronLeft size={18}/></button><span>{index+1} / {pages.length}</span><button type="button" disabled={index>=pages.length-1} onClick={()=>choose(pages[index+1].id)} aria-label="Следующая страница"><ChevronRight size={18}/></button></footer>
  </aside> : null;
  return <Canvas {...canvasProps} pages={{liveRoomId:boardPageRoom(base,pageId,boardStudentId),pageId,boardStudentId,selectWindow:next=>{setStudentId(next);setNavigation(null);},summon,navigation,header,panel,clipboard:props=><BoardSelectionClipboard {...props} key={base}/>}}/>;
}
