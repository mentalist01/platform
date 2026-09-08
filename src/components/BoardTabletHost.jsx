import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Smartphone, X, Copy, Unplug, Check } from 'lucide-react';
import { api } from '../services/api.js';
import { getCollabWsUrl, getConfiguredApiBaseUrl, isNativeAppRuntime } from '../utils/runtimeUrls.js';
import { tabletId, tabletJoinOrigin, tabletSocketUrl, tabletStrokeToBoard } from '../utils/boardTablet.js';
import { connectBoardTablet } from '../utils/boardTabletSocket.js';
import './BoardTablet.css';

const linkOrigin = () => isNativeAppRuntime() ? getConfiguredApiBaseUrl() : window.location.origin;

export default function BoardTabletHost({ roomId, connected, authorId, getFrame, onStroke, onUndo, onPreview }) {
  const [session, setSession] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState('disconnected');
  const [paired, setPaired] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [localHost, setLocalHost] = useState('');
  const handlers = useRef({ getFrame, onStroke, onUndo, onPreview, connected });
  const alive = useRef(true);
  const clientRef = useRef(null);
  useEffect(() => { handlers.current = { getFrame, onStroke, onUndo, onPreview, connected }; });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const joinUrl = session ? `${tabletJoinOrigin(linkOrigin(), localHost)}/#tablet=${session.id}.${session.penKey}` : '';

  const start = async () => {
    setOpen(true);
    if (session || busy) return;
    setBusy(true); setError(''); setQr(''); setPaired(false);
    try {
      const next = await api.createBoardTablet(roomId);
      if (!alive.current) { await api.disconnectBoardTablet(next.id); return; }
      setLocalHost(next.localHosts?.[0] || ''); setCopied(false); setSession(next);
    } catch (err) { if (alive.current) setError(err.message); }
    finally { if (alive.current) setBusy(false); }
  };
  useEffect(() => {
    if (!joinUrl) return undefined;
    let cancelled = false;
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(joinUrl, { width: 320, margin: 4, errorCorrectionLevel: 'M' }))
      .then((url) => { if (!cancelled) setQr(url); })
      .catch(() => { if (!cancelled) setError('Не удалось построить QR-код. Можно скопировать ссылку.'); });
    return () => { cancelled = true; };
  }, [joinUrl]);

  useEffect(() => {
    if (!session) return undefined;
    const frames = new Map();
    const results = new Map();
    const ownStrokes = new Set();
    let hasPen = false;
    let lastImage = '';
    let lastView = '';
    let previewUntil = 0;
    const rememberResult = (id, result) => {
      results.set(id, result);
      if (results.size > 2048) results.delete(results.keys().next().value);
      client.send(result);
    };
    const capture = () => {
      if (!hasPen || !handlers.current.connected) return;
      try {
        const frame = handlers.current.getFrame();
        if (!frame?.canvas || !frame.width || !frame.height) return;
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1200 / frame.width, 1000 / frame.height);
        canvas.width = Math.max(1, Math.round(frame.width * scale));
        canvas.height = Math.max(1, Math.round(frame.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(frame.canvas, 0, 0, canvas.width, canvas.height);
        const image = canvas.toDataURL('image/jpeg', 0.78);
        const view = JSON.stringify([frame.x, frame.y, frame.width, frame.height, frame.zoom]);
        if (image === lastImage && view === lastView) return;
        const id = tabletId();
        if (!client.send({ type: 'frame', id, width: frame.width, height: frame.height, image })) return;
        frames.set(id, { x: frame.x, y: frame.y, width: frame.width, height: frame.height, zoom: frame.zoom });
        if (frames.size > 240) frames.delete(frames.keys().next().value);
        lastImage = image; lastView = view;
      } catch { setError('Не удалось показать доску на телефоне. Попробуйте подключить его заново.'); }
    };
    const client = connectBoardTablet({
      url: tabletSocketUrl(getCollabWsUrl()),
      credentials: { side: 'host', id: session.id, key: session.hostKey },
      onState: setState,
      onMessage: (message) => {
        if (message.type === 'ended') setError(message.message);
        if (message.type === 'presence') {
          hasPen = message.pen; setPaired(hasPen);
          lastImage = ''; lastView = '';
          if (!hasPen) handlers.current.onPreview(null);
          capture();
        }
        if (message.type === 'preview-clear') handlers.current.onPreview(null);
        if (message.type === 'stroke' || message.type === 'preview') {
          const stroke = message.stroke;
          if (message.type === 'stroke' && results.has(stroke.id)) { client.send(results.get(stroke.id)); return; }
          const frame = frames.get(stroke.frameId);
          if (!frame || !handlers.current.connected) {
            if (message.type === 'stroke') rememberResult(stroke.id, { type: 'ack', id: stroke.id, ok: false,
              error: 'Доска переподключается. Дождитесь её обновления и повторите штрих.' });
            return;
          }
          const item = tabletStrokeToBoard(stroke, frame, authorId);
          if (message.type === 'preview') {
            previewUntil = Date.now() + 3000;
            handlers.current.onPreview(item);
          } else {
            try {
              handlers.current.onStroke(item);
              ownStrokes.add(stroke.id);
              handlers.current.onPreview(null);
              rememberResult(stroke.id, { type: 'ack', id: stroke.id, ok: true });
              lastImage = '';
            } catch (err) {
              handlers.current.onPreview(null);
              rememberResult(stroke.id, { type: 'ack', id: stroke.id, ok: false, error: err.message });
            }
          }
        }
        if (message.type === 'undo') {
          if (results.has(message.id)) { client.send(results.get(message.id)); return; }
          try {
            if (!handlers.current.connected) throw new Error('Дождитесь подключения доски.');
            if (ownStrokes.has(message.strokeId)) handlers.current.onUndo(`tablet-${message.strokeId}`);
            ownStrokes.delete(message.strokeId);
            rememberResult(message.id, { type: 'ack', id: message.id, ok: true });
            lastImage = '';
          } catch (err) { rememberResult(message.id, { type: 'ack', id: message.id, ok: false, error: err.message }); }
        }
      },
    });
    clientRef.current = client;
    const timer = setInterval(() => {
      capture();
      if (previewUntil && Date.now() > previewUntil) { previewUntil = 0; handlers.current.onPreview(null); }
    }, 400);
    return () => {
      clearInterval(timer);
      client.send({ type: 'revoke' }); client.close(); clientRef.current = null;
      handlers.current.onPreview(null);
      api.disconnectBoardTablet(session.id).catch(() => {});
    };
  }, [session, authorId]);

  const disconnect = () => { setSession(null); setPaired(false); setState('disconnected'); setOpen(false); };
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    document.addEventListener('keydown', close, true);
    return () => document.removeEventListener('keydown', close, true);
  }, [open]);

  return <>
    <button type="button" className={`board-bottom-controls__button ${paired ? 'tablet-is-connected' : ''}`}
      disabled={!connected && !session} onClick={start} aria-label="Телефон как планшет" data-tooltip="Телефон как планшет">
      <Smartphone size={19} />
    </button>
    {open && createPortal(<div className="tablet-dialog-backdrop" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="tablet-title" className="tablet-dialog">
        <button autoFocus className="tablet-icon-button tablet-dialog-close" aria-label="Закрыть окно подключения" onClick={() => setOpen(false)}><X size={20} /></button>
        <div className="tablet-eyebrow"><Smartphone size={18} /> Рисование с телефона</div>
        <h2 id="tablet-title">Телефон как планшет</h2>
        <p>Отсканируйте QR-код камерой телефона. Рисуйте пальцем или стилусом — штрихи появятся здесь.</p>
        {qr && state !== 'ended' && <img className="tablet-qr" src={qr} alt="QR-код подключения телефона к текущей доске" />}
        {busy && <p role="status">Создаём подключение…</p>}
        {session && state !== 'ended' && <div className={`tablet-status ${paired ? 'is-ready' : ''}`} role="status">
          {paired ? <><Check size={18} /> Телефон подключён. Можно закрыть это окно.</> : state === 'connected' ? 'Ждём телефон · QR-код действует 10 минут' : 'Подключаемся к серверу…'}
        </div>}
        {error && <p className="tablet-error" role="alert">{error}</p>}
        {session?.localHosts?.length > 1 && <label className="tablet-network-select">Сеть компьютера
          <select aria-label="Сеть для подключения телефона" value={localHost} onChange={(event) => setLocalHost(event.target.value)}>
            {session.localHosts.map((address) => <option key={address} value={address}>{address}</option>)}
          </select>
        </label>}
        {localHost && <p className="tablet-hint">Для локального теста подключите телефон к Wi-Fi того же роутера, что и компьютер.</p>}
        {joinUrl && state !== 'ended' && <button className="tablet-secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(joinUrl); setCopied(true); } catch { setError('Выделите и скопируйте ссылку в поле ниже или отсканируйте QR-код.'); }
        }}><Copy size={16} /> {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button>}
        {joinUrl && state !== 'ended' && <input className="tablet-link" aria-label="Ссылка для телефона" value={joinUrl} readOnly onFocus={(event) => event.target.select()} />}
        <p className="tablet-hint">На телефоне видна та же область доски. Для большего поля поверните телефон горизонтально. Установка приложения не нужна.</p>
        {session ? <button className="tablet-disconnect" onClick={disconnect}><Unplug size={16} /> {state === 'ended' ? 'Закрыть подключение' : 'Отключить телефон'}</button>
          : !busy && <button className="tablet-primary" onClick={start}>Попробовать снова</button>}
      </section>
    </div>, document.fullscreenElement || document.body)}
  </>;
}
