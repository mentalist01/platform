import { useEffect, useRef, useState } from 'react';
import { Copy, ClipboardPaste } from 'lucide-react';
import { api, authenticatedUploadsFetch } from '../services/api.js';
import { BOARD_FRAGMENT_STORAGE, cloneBoardFragment, fragmentBounds, readBoardFragment, saveBoardFragment } from '../utils/boardFragmentClipboard.js';
import './BoardSelectionClipboard.css';

const editable = target => target?.isContentEditable || Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
export default function BoardSelectionClipboard(props) {
  const latest = useRef(props); latest.current = props;
  const [available, setAvailable] = useState(() => Boolean(readBoardFragment(null, props.target.userId)));
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const busyRef = useRef(false), mounted = useRef(true);
  const { refs, target, view } = props;

  const copy = event => {
    const c = latest.current;
    if (c.target.readOnly || (event && (editable(event.target) || !c.allowed(event)))) return;
    const ids = c.refs.selected.current.length ? c.refs.selected.current : [c.view.imageId];
    const items = c.refs.items.current.filter(item => ids.includes(item.id));
    if (!items.length) return;
    try {
      const marker = saveBoardFragment({ version: 1, items }, c.target.userId);
      if (event?.clipboardData) {
        event.clipboardData.setData('text/plain', marker); event.preventDefault();
      } else {
        void navigator.clipboard?.writeText?.(marker)?.catch(() => {
          if (mounted.current) setNotice('Фрагмент сохранён. Используйте кнопку «Вставить фрагмент».');
        });
      }
      setAvailable(true); setNotice('Выделение скопировано');
    } catch (error) { setNotice(error.message || 'Не удалось скопировать выделение'); }
  };

  const paste = async payload => {
    const c = latest.current, doc = c.refs.doc.current, yItems = c.refs.yItems.current;
    if (!payload || c.target.readOnly || !doc || !yItems || busyRef.current) return;
    const destination = c.point();
    busyRef.current = true; setBusy(true); setNotice(''); c.error('');
    try {
      const entries = cloneBoardFragment(payload, destination, c.target.userId);
      const initial = c.capacity(entries); if (!initial.ok) throw new Error(initial.error);
      const uploads = new Map();
      const transfer = async image => {
        const source = image.assetUrl || image.dataUrl;
        if (!source) throw new Error('Не найдено изображение фрагмента');
        if (!uploads.has(source)) uploads.set(source, (async () => {
          const response = source.startsWith('data:') ? await fetch(source) : await authenticatedUploadsFetch(source);
          if (!response.ok) throw new Error('Не удалось загрузить изображение исходной доски');
          const blob = await response.blob();
          if (!blob.type.startsWith('image/') || blob.size > 10 * 1024 * 1024) throw new Error('Изображение фрагмента недоступно или больше 10 МБ');
          const file = new File([blob], 'board-fragment', { type: blob.type });
          // Upload grants access to the destination student/lesson. The server deduplicates the file by its hash.
          const stored = await api.uploadBoardAsset(file, c.target.studentId, { lessonId: c.target.lessonId });
          if (!stored?.id || !stored?.url) throw new Error('Не удалось перенести изображение');
          return { assetId: stored.id, assetUrl: stored.url };
        })());
        const stored = await uploads.get(source);
        delete image.dataUrl; Object.assign(image, stored);
      };
      for (const entry of c.target.sandbox ? [] : entries) {
        if (entry.type === 'image') await transfer(entry);
        if (entry.type === 'task') for (const image of entry.screenshots) await transfer(image);
      }
      if (!mounted.current || latest.current.target.readOnly || latest.current.target.roomId !== c.target.roomId || c.refs.doc.current !== doc) return;
      const capacity = c.capacity(entries); if (!capacity.ok) throw new Error(capacity.error);
      c.refs.undo.current?.stopCapturing();
      doc.transact(() => yItems.push(entries), c.refs.origin.current);
      c.refs.undo.current?.stopCapturing();
      c.select(entries.map(item => item.id), fragmentBounds(entries), entries.length === 1 && entries[0].type === 'image' ? entries[0].id : null);
      setNotice('Фрагмент вставлен');
    } catch (error) { if (mounted.current) c.error(error.message || 'Не удалось вставить фрагмент'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };

  useEffect(() => {
    mounted.current = true;
    const update = () => setAvailable(Boolean(readBoardFragment(null, latest.current.target.userId)));
    const onStorage = event => { if (event.key === BOARD_FRAGMENT_STORAGE) update(); };
    const onCopy = event => latest.current.refs.actions.current?.copy(event);
    const onPaste = event => {
      const c = latest.current;
      if (c.target.readOnly || editable(event.target) || !c.allowed(event)) return;
      const payload = readBoardFragment(event.clipboardData?.getData('text/plain') || '', c.target.userId);
      if (!payload) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void c.refs.actions.current?.paste(payload);
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('paste', onPaste, true);
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(update, 60000);
    return () => {
      mounted.current = false;
      window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste, true);
      window.removeEventListener('storage', onStorage); window.clearInterval(timer);
    };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { setAvailable(Boolean(readBoardFragment(null, target.userId))); }, [target.userId]);
  refs.actions.current = { copy, paste };

  if (target.readOnly) return null;
  const selected = Boolean(view.ids.length && view.box && (view.ids.length > 1 || !view.imageId));
  const left = view.box ? Math.max(64, Math.min(view.width - 218, (view.box.x - view.offset.x) * view.zoom)) : 0;
  const top = view.box ? Math.max(58, Math.min(view.height - 130, (view.box.y - view.offset.y) * view.zoom - 42)) : 0;
  return <>
    {selected && <div className="board-fragment-copy" style={{ left, top }} onPointerDown={event => event.stopPropagation()}><button type="button" onClick={() => copy()} aria-label="Копировать выделенное" title="Копировать выделенное (Ctrl+C)"><Copy size={16}/><span>Копировать выделенное</span></button></div>}
    {available && <button type="button" className="board-fragment-paste" disabled={busy} onPointerDown={event => event.stopPropagation()} onClick={() => { void paste(readBoardFragment(null, target.userId)); }} aria-label="Вставить фрагмент" title="Наведите курсор на нужное место и нажмите Ctrl+V"><ClipboardPaste size={16}/><span>{busy ? 'Вставляем…' : 'Вставить фрагмент'}</span></button>}
    {notice && <div className="board-fragment-notice" role="status">{notice}</div>}
  </>;
}
