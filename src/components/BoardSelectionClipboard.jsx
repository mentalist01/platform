import { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { api, authenticatedUploadsFetch } from '../services/api.js';
import { cloneBoardFragment, fragmentBounds, readBoardFragment, saveBoardFragment } from '../utils/boardFragmentClipboard.js';
import './BoardSelectionClipboard.css';
import { useBoardSelectionResize } from './BoardSelectionResize.jsx';
import { useBoardAlignment } from './BoardAlignmentGuides.jsx';
import { fitBoardFragmentToViewport } from '../utils/boardSelectionResize.js';
import { selectionMovePreview } from '../utils/boardAlignment.js';

const editable = target => target?.isContentEditable || Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
export default function BoardSelectionClipboard(props) {
  const latest = useRef(props); latest.current = props;
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false), mounted = useRef(true);
  const { refs, target, view } = props;
  const resize = useBoardSelectionResize(props), alignment = useBoardAlignment(props);

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
          if (mounted.current) setNotice('Нажмите Ctrl+C, затем вставьте фрагмент через Ctrl+V.');
        });
      }
      setNotice('Выделение скопировано');
    } catch (error) { setNotice(error.message || 'Не удалось скопировать выделение'); }
  };

  const paste = async payload => {
    const c = latest.current, doc = c.refs.doc.current, yItems = c.refs.yItems.current;
    if (!payload || c.target.readOnly || !doc || !yItems || busyRef.current) return;
    const destination = c.point();
    busyRef.current = true; setNotice('Вставляем фрагмент…'); c.error('');
    try {
      const entries = fitBoardFragmentToViewport(cloneBoardFragment(payload, destination, c.target.userId), c.view);
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
          const stored = await api.uploadBoardAsset(file, c.target.studentId, { lessonId: c.target.lessonId, roomId: c.target.roomId });
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
      const placed = alignment.place(entries);
      c.refs.undo.current?.stopCapturing();
      doc.transact(() => yItems.push(placed), c.refs.origin.current);
      c.refs.undo.current?.stopCapturing();
      c.select(placed.map(item => item.id), fragmentBounds(placed), placed.length === 1 && placed[0].type === 'image' ? placed[0].id : null);
      setNotice('Фрагмент вставлен');
    } catch (error) { if (mounted.current) { setNotice(''); c.error(error.message || 'Не удалось вставить фрагмент'); } }
    finally { busyRef.current = false; }
  };

  useEffect(() => {
    mounted.current = true;
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
    return () => {
      mounted.current = false;
      window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste, true);
    };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
  refs.actions.current = { copy, paste, snap: alignment.snap, place: entry => alignment.place([entry])[0],
    moveImage: (id,x,y,free) => { const item=latest.current.refs.items.current.find(item=>item.id===id); if(!item)return{x,y}; const delta=alignment.snap({box:{...item,x,y},ids:[id],free}); return{x:x+delta.dx,y:y+delta.dy}; },
    preview: (item, drag, pending, imageDrag) => resize.preview(item) || selectionMovePreview(item,drag,pending,imageDrag) };

  if (target.readOnly) return null;
  const selected = Boolean(view.ids.length && view.box && (view.ids.length > 1 || !view.imageId));
  const left = view.box ? Math.max(64, Math.min(view.width - 288, (view.box.x - view.offset.x) * view.zoom)) : 0;
  const top = view.box ? Math.max(58, Math.min(view.height - 130, (view.box.y - view.offset.y) * view.zoom - 42)) : 0;
  return <>
    {selected && <div className="board-fragment-copy" style={{ left, top }} role="toolbar" aria-label="Действия с выделением" onPointerDown={event => event.stopPropagation()}><button type="button" onClick={() => copy()} aria-label="Копировать выделенное" title="Копировать выделенное (Ctrl+C)"><Copy size={16}/><span>Копировать выделенное</span></button>{resize.buttons}</div>}
    {resize.handles}{alignment.layer}
    {notice && <div className="board-fragment-notice" role="status">{notice}</div>}
  </>;
}
