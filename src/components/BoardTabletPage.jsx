import React, { useEffect, useRef, useState } from 'react';
import { Smartphone, Undo2, PenLine, Maximize, Minimize, X, Wifi, WifiOff } from 'lucide-react';
import { getCollabWsUrl } from '../utils/runtimeUrls.js';
import { readTabletLink, tabletId, tabletSocketUrl, tabletFrameState, tabletInkForFrame, TABLET_COLORS, TABLET_MAX_POINTS } from '../utils/boardTablet.js';
import { connectBoardTablet } from '../utils/boardTabletSocket.js';
import './BoardTablet.css';

const deviceId = (sessionId) => {
  const storageKey = `board-tablet-device-${sessionId}`;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return stored;
    const id = tabletId(); localStorage.setItem(storageKey, id); return id;
  } catch { return tabletId(); }
};

export default function BoardTabletPage() {
  const [state, setState] = useState('connecting');
  const [host, setHost] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [error, setError] = useState('');
  const [color, setColor] = useState(TABLET_COLORS[0]);
  const [width, setWidth] = useState(3);
  const [penOnly, setPenOnly] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const settings = useRef({ color, width, penOnly });
  const undo = useRef(() => {});
  useEffect(() => { settings.current = { color, width, penOnly }; }, [color, width, penOnly]);

  useEffect(() => {
    const onFullscreen = () => {
      setImmersive(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
      setToolsOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') { setImmersive(false); setToolsOpen(false); } };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const toggleFullscreen = async () => {
    setToolsOpen(false);
    if (immersive) {
      setImmersive(false);
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        try { await exit?.call(document); } catch { /* The normal controls remain available. */ }
      }
      return;
    }
    setImmersive(true);
    const page = pageRef.current;
    const enter = page.requestFullscreen || page.webkitRequestFullscreen;
    try {
      if (!enter) throw new Error('Fullscreen unavailable');
      await enter.call(page, { navigationUI: 'hide' });
    } catch { setError('Панели скрыты. Этот браузер не разрешил убрать адресную строку.'); }
  };

  useEffect(() => {
    const link = readTabletLink(window.location.hash);
    if (!link) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let disposed = false;
    let connected = false;
    let hostPresent = false;
    let current = null;
    let latest = null;
    let frameSequence = 0;
    let appliedSequence = 0;
    let active = null;
    let previewAt = 0;
    let raf = 0;
    const pending = new Map();
    const ink = new Map();
    const history = [];
    const updatePending = () => { setPendingCount(pending.size); setCanUndo(history.length > 0 && pending.size === 0); };
    const fit = () => {
      if (!current) return null;
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / current.width, rect.height / current.height);
      return { left: (rect.width - current.width * scale) / 2, top: (rect.height - current.height * scale) / 2,
        width: current.width * scale, height: current.height * scale, scale, rect };
    };
    const drawInk = (stroke, area) => {
      const points = stroke.points;
      if (!points.length) return;
      ctx.lineWidth = stroke.width * area.scale;
      ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const point = (p) => ({ x: area.left + p.x * area.width, y: area.top + p.y * area.height });
      const first = point(points[0]);
      if (points.length === 1) {
        ctx.beginPath(); ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return;
      }
      ctx.beginPath(); ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i += 1) {
        const p = point(points[i]); ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    };
    const paint = () => {
      raf = 0;
      if (disposed) return;
      if (!active && latest) current = latest;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * ratio));
      const h = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = '#e8eaf0'; ctx.fillRect(0, 0, rect.width, rect.height);
      const area = fit();
      if (!area) return;
      ctx.drawImage(current.bitmap, area.left, area.top, area.width, area.height);
      ctx.save(); ctx.beginPath(); ctx.rect(area.left, area.top, area.width, area.height); ctx.clip();
      for (const [id, entry] of ink) {
        if (Number.isSafeInteger(entry.revision) && current.revision >= entry.revision) {
          ink.delete(id);
          continue;
        }
        const stroke = tabletInkForFrame(entry, current);
        if (stroke) drawInk(stroke, area);
      }
      if (active) drawInk(active.stroke, area);
      ctx.restore();
    };
    const repaint = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const retryPending = () => {
      if (connected && hostPresent) for (const message of pending.values()) client.send(message);
    };
    const enqueue = (message) => {
      const id = message.type === 'stroke' ? message.stroke.id : message.id;
      pending.set(id, message); updatePending();
      if (connected && hostPresent) client.send(message);
    };
    const client = connectBoardTablet({
      url: tabletSocketUrl(getCollabWsUrl()), credentials: { type: 'join', side: 'pen', ...link, deviceId: deviceId(link.id) },
      onState: (next) => {
        connected = next === 'connected'; setState(next);
        if (!connected) { hostPresent = false; setHost(false); }
        if (next === 'ended') setError('Подключение закрыто. Откройте новый QR-код на компьютере.');
      },
      onMessage: (message) => {
        if (message.type === 'ended') setError(message.message);
        if (message.type === 'presence') { hostPresent = message.host; setHost(message.host); retryPending(); }
        if (message.type === 'frame') {
          if (!tabletFrameState(message)) {
            setError('Обновите страницу с доской на компьютере (Ctrl+F5) и создайте новый QR-код.');
            return;
          }
          const sequence = ++frameSequence;
          const bitmap = new Image();
          bitmap.onload = () => {
            if (disposed || sequence < appliedSequence) return;
            appliedSequence = sequence;
            latest = { ...message, bitmap };
            setHasFrame(true); repaint();
          };
          bitmap.src = message.image;
        }
        if (message.type === 'ack') {
          const operation = pending.get(message.id);
          if (!operation) return;
          pending.delete(message.id);
          if (operation.type === 'stroke') {
            const entry = ink.get(message.id);
            if (message.ok) { if (entry) entry.revision = message.revision; history.push(message.id); }
            else ink.delete(message.id);
          } else if (message.ok) {
            const index = history.indexOf(operation.strokeId);
            if (index >= 0) history.splice(index, 1);
            ink.delete(operation.strokeId);
          }
          if (!message.ok) setError(message.error || 'Не удалось передать штрих. Повторите его.');
          updatePending(); repaint();
        }
      },
    });
    const pointAt = (event, area) => ({
      x: Math.min(1, Math.max(0, (event.clientX - area.rect.left - area.left) / area.width)),
      y: Math.min(1, Math.max(0, (event.clientY - area.rect.top - area.top) / area.height)),
    });
    const down = (event) => {
      if (active || !connected || !hostPresent || !current || pending.size >= 20 || event.button > 0) return;
      if (settings.current.penOnly && event.pointerType !== 'pen') return;
      const area = fit();
      const x = event.clientX - area.rect.left - area.left;
      const y = event.clientY - area.rect.top - area.top;
      if (x < 0 || x > area.width || y < 0 || y > area.height) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      active = { pointerId: event.pointerId, frame: { width: current.width, height: current.height, view: current.view },
        stroke: { id: tabletId(), frameId: current.id,
        color: settings.current.color, width: settings.current.width, points: [pointAt(event, area)] } };
      setError(''); repaint();
    };
    const move = (event) => {
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      const area = fit();
      const events = event.getCoalescedEvents?.() || [event];
      for (const sample of (events.length ? events : [event])) {
        const point = pointAt(sample, area);
        const points = active.stroke.points;
        const previous = points[points.length - 1];
        if (Math.hypot((point.x - previous.x) * area.width, (point.y - previous.y) * area.height) < 0.65) continue;
        if (points.length >= TABLET_MAX_POINTS) active.stroke.points = points.filter((_, index) => index % 2 === 0 || index === points.length - 1);
        active.stroke.points.push(point);
      }
      if (Date.now() - previewAt > 65) { client.send({ type: 'preview', stroke: active.stroke }); previewAt = Date.now(); }
      repaint();
    };
    const up = (event) => {
      if (!active || active.pointerId !== event.pointerId) return;
      if (event.type === 'pointerup') move(event);
      const stroke = active.stroke;
      ink.set(stroke.id, { stroke, frame: active.frame, revision: null });
      active = null;
      enqueue({ type: 'stroke', stroke });
      client.send({ type: 'preview-clear' });
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      repaint();
    };
    const observer = new ResizeObserver(repaint);
    observer.observe(canvas);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    const resendTimer = setInterval(retryPending, 2000);
    undo.current = () => {
      if (pending.size || !history.length || !connected || !hostPresent) return;
      enqueue({ type: 'undo', id: tabletId(), strokeId: history[history.length - 1] });
    };
    repaint();
    return () => {
      disposed = true; observer.disconnect(); cancelAnimationFrame(raf); clearInterval(resendTimer); client.close();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
    };
  }, []);

  const ready = state === 'connected' && host;
  const invalid = !readTabletLink(window.location.hash);
  return <main ref={pageRef} className={`tablet-page${immersive ? ' is-immersive' : ''}`}>
    <header className="tablet-page-header">
      <div className="tablet-page-title"><Smartphone size={19} /><strong>Планшет для доски</strong></div>
      <span className={`tablet-connection ${ready ? 'is-ready' : ''}`} role="status">
        {ready ? <Wifi size={16} /> : <WifiOff size={16} />}
        {invalid ? 'Неверная ссылка' : state === 'ended' ? 'Отключён' : ready ? pendingCount ? `Передаём: ${pendingCount}` : 'Подключён' : 'Ждём компьютер…'}
      </span>
    </header>
    <div id="tablet-tools" className="tablet-tools" hidden={immersive && !toolsOpen} role="toolbar" aria-label="Инструменты рисования">
      <PenLine size={18} />
      <div className="tablet-colors">{TABLET_COLORS.map((value, i) => <button key={value} className="tablet-swatch" style={{ '--ink': value }}
        aria-label={['Фиолетовый', 'Чёрный', 'Красный', 'Зелёный', 'Синий'][i]} aria-pressed={color === value} onClick={() => setColor(value)} />)}</div>
      <select aria-label="Толщина пера" value={width} onChange={(event) => setWidth(Number(event.target.value))}>
        <option value={3}>Тонко</option><option value={5}>Средне</option><option value={9}>Толсто</option>
      </select>
      <button className="tablet-icon-button" disabled={!canUndo || !ready} aria-label="Отменить мой последний штрих" onClick={() => undo.current()}><Undo2 size={21} /></button>
      {!immersive && <button className="tablet-icon-button tablet-fullscreen" aria-label="На весь экран" onClick={toggleFullscreen}><Maximize size={19} /></button>}
      <label className="tablet-pen-only"><input type="checkbox" checked={penOnly} onChange={(event) => setPenOnly(event.target.checked)} /> Только стилус</label>
    </div>
    {immersive && <div className="tablet-floating-tools">
      <button className="tablet-icon-button" aria-label={toolsOpen ? 'Скрыть инструменты' : 'Показать инструменты'}
        aria-expanded={toolsOpen} aria-controls="tablet-tools" onClick={() => setToolsOpen((open) => !open)}>
        {toolsOpen ? <X size={20} /> : <PenLine size={20} />}
      </button>
      <button className="tablet-icon-button" aria-label="Выйти из полного экрана" onClick={toggleFullscreen}><Minimize size={20} /></button>
    </div>}
    <div className="tablet-stage">
      <canvas ref={canvasRef} aria-label="Рисуйте здесь пальцем или стилусом" />
      {(!hasFrame || !ready) && <div className="tablet-stage-message">
        <Smartphone size={32} />
        <strong>{invalid ? 'Нужен новый QR-код' : state === 'ended' ? 'Подключение завершено' : !ready ? 'Ждём соединения с доской' : 'Загружаем доску…'}</strong>
        <span>{invalid || state === 'ended' ? 'Откройте «Телефон как планшет» на компьютере и отсканируйте QR-код.' : 'Оставьте доску открытой на компьютере.'}</span>
      </div>}
    </div>
    <footer className="tablet-page-footer">
      {error ? <span role="alert" className="tablet-error">{error}</span> : <span>Пишите на светлом поле. Поверните телефон горизонтально — места станет больше.</span>}
    </footer>
    {immersive && (error || !ready || pendingCount > 0) && <div className={`tablet-floating-status${error ? ' tablet-error' : ''}`} role="status">
      {error || (!ready ? 'Ждём соединения с доской…' : `Передаём: ${pendingCount}`)}
    </div>}
  </main>;
}
