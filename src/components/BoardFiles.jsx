import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, Download, LoaderCircle } from 'lucide-react';
import { api } from '../services/api.js';
import FileDownloadLink from './FileDownloadLink.jsx';
import { BOARD_FILE_MAX_BYTES, BOARD_FILE_WIDTH, BOARD_FILE_HEIGHT } from '../utils/boardFile.js';
import './BoardFiles.css';

// This component owns upload/drop listeners so changing boards cancels placement,
// without cancelling a completed upload or touching the other board's content.
export function BoardFileUpload(props) {
  const latest = useRef(props); latest.current = props;
  const input = useRef(null), busy = useRef(false), mounted = useRef(true);
  const [uploading, setUploading] = useState(false), [dragging, setDragging] = useState(false);
  const upload = async (files, point) => {
    const c = latest.current, doc = c.doc.current, items = c.yItems.current;
    if (c.readOnly || !doc || !items || busy.current || !files.length) return;
    busy.current = true; setUploading(true); c.error('');
    const destination = point || c.point();
    try {
      for (const [index, file] of files.entries()) {
        if (file.size > BOARD_FILE_MAX_BYTES) throw new Error(`«${file.name}» больше 64 МБ`);
        const capacity = c.capacity([{ type: 'file', name: file.name, sizeBytes: file.size }]);
        if (!capacity.ok) throw new Error(capacity.error);
        const stored = await api.uploadBoardFile(file, c.studentId, { lessonId: c.lessonId, roomId: c.roomId });
        if (!mounted.current || latest.current.roomId !== c.roomId || latest.current.readOnly || c.doc.current !== doc) return;
        const entry = {
          id: crypto.randomUUID(), type: 'file', authorId: c.userId,
          assetId: stored.id, assetUrl: stored.url, name: stored.name, sizeBytes: stored.sizeBytes,
          x: destination.x - BOARD_FILE_WIDTH / 2 + index * 24,
          y: destination.y - BOARD_FILE_HEIGHT / 2 + index * (BOARD_FILE_HEIGHT + 16),
          width: BOARD_FILE_WIDTH, height: BOARD_FILE_HEIGHT,
        };
        const finalCapacity = c.capacity([entry]);
        if (!finalCapacity.ok) throw new Error(finalCapacity.error);
        c.undo.current?.stopCapturing();
        doc.transact(() => items.push([entry]), c.origin.current);
        c.undo.current?.stopCapturing(); c.select(entry);
      }
    } catch (error) {
      if (mounted.current && latest.current.roomId === c.roomId) c.error(error.message || 'Не удалось прикрепить файл');
    } finally { busy.current = false; if (mounted.current) setUploading(false); }
  };
  const uploadRef = useRef(upload); uploadRef.current = upload;
  useEffect(() => {
    mounted.current = true;
    const root = props.surface.current;
    const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');
    const over = event => {
      if (!hasFiles(event) || latest.current.readOnly) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true);
    };
    const leave = event => { if (!root?.contains(event.relatedTarget)) setDragging(false); };
    const drop = event => {
      if (!hasFiles(event) || latest.current.readOnly) return;
      event.preventDefault(); event.stopPropagation(); setDragging(false);
      const c = latest.current, rect = root.getBoundingClientRect();
      void uploadRef.current(Array.from(event.dataTransfer.files), {
        x: (event.clientX - rect.left) / c.zoom + c.offset.x,
        y: (event.clientY - rect.top) / c.zoom + c.offset.y,
      });
    };
    root?.addEventListener('dragover', over); root?.addEventListener('dragleave', leave); root?.addEventListener('drop', drop);
    return () => {
      mounted.current = false;
      root?.removeEventListener('dragover', over); root?.removeEventListener('dragleave', leave); root?.removeEventListener('drop', drop);
    };
  }, [props.surface]);
  return <>
    <button type="button" className="board-tool-rail__button" title="Прикрепить файл (до 64 МБ)" aria-label="Прикрепить файл" disabled={uploading || props.readOnly} onClick={() => input.current?.click()}>
      {uploading ? <LoaderCircle size={20} className="animate-spin"/> : <Paperclip size={20}/>}
    </button>
    <input ref={input} type="file" multiple hidden aria-label="Файлы для доски" onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ''; }}/>
    {uploading && props.surface.current && createPortal(<div className="board-file-notice" role="status">Прикрепляем файл…</div>, props.surface.current)}
    {dragging && props.surface.current && createPortal(<div className="board-file-drop-hint">Отпустите файл, чтобы прикрепить к доске<span>Любой формат · до 64 МБ</span></div>, props.surface.current)}
  </>;
}

export function BoardFileDownloads({ items, offset, zoom, preview = item => item }) {
  return <div className="board-file-downloads" aria-label="Файлы на доске">
    {items.filter(item => item.type === 'file').map(item => {
      const display = preview(item);
      return <div key={item.id} className="board-file-download" style={{
        left: (display.x - offset.x) * zoom, top: (display.y - offset.y) * zoom,
        width: BOARD_FILE_WIDTH, height: BOARD_FILE_HEIGHT,
        transform: `scale(${zoom * display.width / BOARD_FILE_WIDTH}, ${zoom * display.height / BOARD_FILE_HEIGHT})`,
      }}>
        <FileDownloadLink className="board-file-download-button" href={item.assetUrl} download={item.name} title={`Скачать ${item.name}`} aria-label={`Скачать ${item.name}`} onPointerDown={event => event.stopPropagation()}>
          <Download size={13}/> Скачать
        </FileDownloadLink>
      </div>;
    })}
  </div>;
}
