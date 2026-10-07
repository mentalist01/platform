import { useId, useState } from 'react';
import { ChevronDown, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { DEFAULT_COLLAB_CODE_PAGE_ID, MAX_COLLAB_CODE_PAGES } from '../utils/collabSolutions';
import './CollabCodePages.css';

const suggestedName = pages => {
  const names = new Set(pages.map(page => page.name.toLocaleLowerCase('ru')));
  let number = 2;
  while (names.has(`страница ${number}`)) number++;
  return `Страница ${number}`;
};

export default function CollabCodePages({ pages, activeId, onSelect, onCreate, onRename, onDelete,
  disabled = false, readOnly = false, dark = false, peers = [] }) {
  const [open, setOpen] = useState(false), [form, setForm] = useState(null);
  const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const inputId = useId();
  const current = pages.find(page => page.id === activeId) || pages[0];
  const editable = !disabled && !readOnly && !busy;
  const edit = (kind, page = current) => {
    setOpen(true); setError(''); setForm({ kind, page });
    setName(kind === 'create' ? suggestedName(pages) : page.name);
  };
  const choose = id => { onSelect(id); setOpen(false); setForm(null); setError(''); };
  const save = async event => {
    event.preventDefault();
    if (!editable || !form || (form.kind !== 'delete' && !name.trim())) return;
    setBusy(true); setError('');
    try {
      if (form.kind === 'create') await onCreate(name.trim());
      else if (form.kind === 'rename') await onRename(form.page.id, name.trim());
      else await onDelete(form.page.id);
      setForm(null); setOpen(false);
    } catch (cause) { setError(cause.message || 'Не удалось изменить страницу'); }
    finally { setBusy(false); }
  };
  if (!current) return null;
  return <div className={`collab-code-pages${dark ? ' collab-code-pages--dark' : ''}`}>
    <div className="collab-code-pages__bar">
      <button type="button" className="collab-code-pages__current" aria-label={`Страницы кода: ${current.name}`}
        aria-expanded={open} onClick={() => { setOpen(!open); setForm(null); setError(''); }} disabled={busy} title="Каждая страница хранит свой набор вкладок с кодом">
        <Layers size={16}/><strong>{current.name}</strong><small>{pages.findIndex(page => page.id === current.id) + 1}/{pages.length}</small><ChevronDown size={14}/>
      </button>
      <span className="collab-code-pages__count">Вкладок: {current.count || 1}</span>
      {!readOnly && <button type="button" className="collab-code-pages__create" disabled={!editable || pages.length >= MAX_COLLAB_CODE_PAGES}
        onClick={() => edit('create')} aria-label="Создать страницу кода"><Plus size={16}/><span>Новая страница</span></button>}
    </div>
    {open && <section className="collab-code-pages__panel" aria-label="Страницы кода">
      <div className="collab-code-pages__heading"><div><strong>Страницы кода</strong><p>На каждой странице — свой набор вкладок.</p></div>
        <button type="button" aria-label="Закрыть страницы кода" onClick={() => { setOpen(false); setForm(null); }}><X size={16}/></button></div>
      <nav aria-label="Выбрать страницу кода" className="collab-code-pages__list">{pages.map((page, index) => {
        const viewers = peers.filter(peer => peer.pageId === page.id);
        return <div key={page.id} className={`collab-code-pages__item${page.id === activeId ? ' is-active' : ''}`}>
          <button type="button" onClick={() => choose(page.id)} disabled={disabled || busy} aria-current={page.id === activeId ? 'page' : undefined}>
            <span className="collab-code-pages__number">{index + 1}</span><span><strong>{page.name}</strong><small>Вкладок: {page.count || 1}{viewers.length ? ` · ${viewers.map(peer => peer.name).join(', ')}` : ''}</small></span>
          </button>
          {!readOnly && <><button type="button" disabled={!editable} onClick={() => edit('rename', page)} aria-label={`Переименовать страницу ${page.name}`}><Pencil size={14}/></button>
            <button type="button" disabled={!editable || page.id === DEFAULT_COLLAB_CODE_PAGE_ID} onClick={() => edit('delete', page)}
              aria-label={`Удалить страницу ${page.name}`} title={page.id === DEFAULT_COLLAB_CODE_PAGE_ID ? 'Первая страница сохраняет прежние коды' : 'Удалить страницу со всеми вкладками'}><Trash2 size={14}/></button></>}
        </div>;
      })}</nav>
      {form && <form className="collab-code-pages__form" onSubmit={save}>
        {form.kind === 'delete' ? <p>Убрать страницу «{form.page.name}» и все её вкладки у участников? После удаления можно восстановить страницу.</p>
          : <><label htmlFor={inputId}>Название страницы</label><input id={inputId} key={`${form.kind}:${form.page.id}`} autoFocus
            value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={!editable}
            onFocus={event => event.target.select()} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setForm(null); } }}/></>}
        <div><button type="button" onClick={() => setForm(null)} disabled={busy}>Отмена</button>
          <button type="submit" className={form.kind === 'delete' ? 'is-danger' : 'is-primary'} disabled={!editable || (form.kind !== 'delete' && !name.trim())}>
            {busy ? 'Сохраняем…' : form.kind === 'create' ? 'Создать страницу' : form.kind === 'delete' ? 'Удалить страницу' : 'Сохранить название'}</button></div>
      </form>}
      {error && <p role="alert" className="collab-code-pages__error">{error}</p>}
    </section>}
  </div>;
}
