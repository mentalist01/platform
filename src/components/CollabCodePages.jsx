import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { MAX_BOARD_PAGES } from '../utils/boardPages.js';
import {lessonCodePageId,lessonBoardPageId} from '../utils/lessonPageSelection.js';
import {useLessonPages} from '../hooks/useLessonPages.js';
import {lessonPageTree,lessonPageParentChoices} from '../utils/lessonPageTree.js';
import './CollabCodePages.css';

const suggestedName = pages => {
  const names = new Set(pages.map(page => page.name.toLocaleLowerCase('ru')));
  let number = 2;
  while (names.has(`страница ${number}`)) number++;
  return `Страница ${number}`;
};

export default function CollabCodePages({ pages:codePages, activeId, onSelect, roomId,role,userId,
  disabled = false, readOnly = false, dark = false, peers = [] }) {
  const common=useLessonPages(roomId,role,userId);
  const sharedSelected=common.selected,selectShared=common.select;
  const pages=lessonPageTree(common.pages.map(page=>({id:lessonCodePageId(page.id),name:page.title,...(page.parentId?{parentId:lessonCodePageId(page.parentId)}:{}),count:codePages.find(p=>p.id===lessonCodePageId(page.id))?.count||1})));
  const previousActive=useRef(null),requested=useRef(null);
  const [deletedPage,setDeletedPage]=useState(null);
  useEffect(()=>{
    if(disabled||!pages.length){previousActive.current=null;return;}
    const selected=lessonCodePageId(sharedSelected);
    if(previousActive.current&&previousActive.current!==activeId){
      previousActive.current=activeId;
      if(requested.current===activeId)requested.current=null;
      else if(pages.some(p=>p.id===activeId)){selectShared(lessonBoardPageId(activeId));return;}
    }
    previousActive.current=activeId;
    if(selected!==activeId&&codePages.some(p=>p.id===selected)&&requested.current!==selected){requested.current=selected;onSelect(selected);}
  },[activeId,disabled,pages,codePages,sharedSelected,selectShared,onSelect]);
  const create=async name=>{const result=await common.change({action:'create',name,parentId:parentId?lessonBoardPageId(parentId):''});common.select(result.id);};
  const rename=(id,name)=>common.change({action:'update',id:lessonBoardPageId(id),name,parentId:parentId?lessonBoardPageId(parentId):''});
  const remove=async id=>{const page=pages.find(p=>p.id===id);await common.change({action:'delete',id:lessonBoardPageId(id)});setDeletedPage(page);};
  const [open, setOpen] = useState(false), [form, setForm] = useState(null);
  const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [parentId,setParentId]=useState('');
  const inputId = useId();
  const current = pages.find(page => page.id === lessonCodePageId(common.selected)) || pages[0];
  const editable = !disabled && !readOnly && !busy && common.connected && common.canEdit;
  const edit = (kind, page = current) => {
    setOpen(true); setError(''); setForm({ kind, page });
    setName(kind === 'create' ? suggestedName(pages) : page.name);
    setParentId(kind==='create'?'':page.parentId||'');
  };
  const choose = id => { common.select(lessonBoardPageId(id));setOpen(false); setForm(null); setError(''); };
  const save = async event => {
    event.preventDefault();
    if (!editable || !form || (form.kind !== 'delete' && !name.trim())) return;
    setBusy(true); setError('');
    try {
      if (form.kind === 'create') await create(name.trim());
      else if (form.kind === 'rename') await rename(form.page.id, name.trim());
      else await remove(form.page.id);
      setForm(null); setOpen(false);
    } catch (cause) { setError(cause.message || 'Не удалось изменить страницу'); }
    finally { setBusy(false); }
  };
  if (!current) return <div role={common.error?'alert':'status'}>{common.error||'Подключаем страницы занятия…'}</div>;
  return <div className={`collab-code-pages${dark ? ' collab-code-pages--dark' : ''}`}>
    <div className="collab-code-pages__bar">
      <button type="button" className="collab-code-pages__current" aria-label={`Страницы кода: ${current.name}`}
        aria-expanded={open} onClick={() => { setOpen(!open); setForm(null); setError(''); }} disabled={busy} title="Страница содержит доску и свой набор вкладок кода">
        <Layers size={16}/><strong>{current.name}</strong><small>{pages.findIndex(page => page.id === current.id) + 1}/{pages.length}</small><ChevronDown size={14}/>
      </button>
      <span className="collab-code-pages__count">Вкладок: {current.count || 1}</span>
      {!readOnly && common.canEdit && <button type="button" className="collab-code-pages__create" disabled={!editable || pages.length >= MAX_BOARD_PAGES}
        onClick={() => edit('create')} aria-label="Создать страницу кода"><Plus size={16}/><span>Новая страница</span></button>}
    </div>
    {open && <section className="collab-code-pages__panel" aria-label="Страницы кода">
      <div className="collab-code-pages__heading"><div><strong>Страницы занятия</strong><p>Одна страница — доска и свой набор вкладок кода.</p></div>
        <button type="button" aria-label="Закрыть страницы кода" onClick={() => { setOpen(false); setForm(null); }}><X size={16}/></button></div>
      <nav aria-label="Выбрать страницу кода" className="collab-code-pages__list">{pages.map((page, index) => {
        const viewers = peers.filter(peer => peer.pageId === page.id);
        return <div key={page.id} style={{marginLeft:page.depth*20}} className={`collab-code-pages__item${page.id === activeId ? ' is-active' : ''}`}>
          <button type="button" onClick={() => choose(page.id)} disabled={disabled || busy} aria-current={page.id === activeId ? 'page' : undefined}>
            <span className="collab-code-pages__number">{page.depth?'↳':index+1}</span><span><strong>{page.name}</strong><small>Вкладок: {page.count || 1}{viewers.length ? ` · ${viewers.map(peer => peer.name).join(', ')}` : ''}</small></span>
          </button>
          {!readOnly && common.canEdit && <><button type="button" disabled={!editable} onClick={() => edit('rename', page)} aria-label={`Переименовать страницу ${page.name}`}><Pencil size={14}/></button>
            <button type="button" disabled={!editable || pages.length<=1} onClick={() => edit('delete', page)}
              aria-label={`Удалить страницу ${page.name}`} title="Убрать страницу с доской и кодом; можно восстановить"><Trash2 size={14}/></button>{!page.depth&&<button type="button" disabled={!editable} onClick={()=>{edit('create',page);setParentId(page.id);}} aria-label={`Добавить подстраницу в ${page.name}`}><Plus size={14}/></button>}</>}
        </div>;
      })}</nav>
      {form && <form className="collab-code-pages__form" onSubmit={save}>
        {form.kind === 'delete' ? <p>Убрать страницу «{form.page.name}» с доской и всеми вкладками кода у участников? После удаления можно восстановить страницу.</p>
          : <><label htmlFor={inputId}>Название страницы</label><input id={inputId} key={`${form.kind}:${form.page.id}`} autoFocus
            value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={!editable}
            onFocus={event => event.target.select()} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setForm(null); } }}/><label>Внутри страницы<select aria-label="Родительская страница кода" value={parentId} disabled={!editable||(form.kind!=='create'&&pages.some(page=>page.parentId===form.page.id))} onChange={event=>setParentId(event.target.value)}><option value="">Основная страница</option>{lessonPageParentChoices(pages,form.kind==='create'?'':form.page.id).map(page=><option key={page.id} value={page.id}>{page.name}</option>)}</select></label></>}
        <div><button type="button" onClick={() => setForm(null)} disabled={busy}>Отмена</button>
          <button type="submit" className={form.kind === 'delete' ? 'is-danger' : 'is-primary'} disabled={!editable || (form.kind !== 'delete' && !name.trim())}>
            {busy ? 'Сохраняем…' : form.kind === 'create' ? 'Создать страницу' : form.kind === 'delete' ? 'Удалить страницу' : 'Сохранить название'}</button></div>
      </form>}
      {error && <p role="alert" className="collab-code-pages__error">{error}</p>}
    </section>}
    {common.error&&<p role="alert">{common.error}</p>}
    {deletedPage&&<div className="collab-solutions__notice" role="status">Страница «{deletedPage.name}» с доской и кодом убрана. <button type="button" disabled={!editable} onClick={async()=>{try{await common.change({action:'restore',id:lessonBoardPageId(deletedPage.id)});common.select(lessonBoardPageId(deletedPage.id));setDeletedPage(null);}catch(cause){setError(cause.message);}}}>Восстановить страницу</button></div>}
    {!open&&error&&<p role="alert">{error}</p>}
  </div>;
}
