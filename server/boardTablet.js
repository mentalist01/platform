import crypto from 'node:crypto';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { normalizeTabletStroke, TABLET_WS_PATH } from '../src/utils/boardTablet.js';

const key = () => crypto.randomBytes(24).toString('base64url');
const send = (ws, value) => {
  if (ws?.readyState !== 1 || ws.bufferedAmount > 2_000_000) return false;
  ws.send(JSON.stringify(value));
  return true;
};
const boundedSet = (map, id, value, limit = 1024) => {
  map.set(id, value);
  if (map.size > limit) map.delete(map.keys().next().value);
};

// Capability access is deliberately separate from authentication: the QR
// grants pen input and a viewport image, never the user's account or Y.Doc.
export const createBoardTabletService = ({ authorize, now = Date.now, pairingMs = 600_000, sessionMs = 14_400_000, hostGraceMs = 45_000 } = {}) => {
  const sessions = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_100_000, perMessageDeflate: false });
  const valid = (session) => Boolean(session && now() < session.expiresAt
    && (session.paired || now() < session.pairBy) && authorize(session.auth, session.roomId, session.authToken));
  const revoke = (session, reason = 'Подключение завершено. Откройте новый QR-код на компьютере.') => {
    if (!session) return;
    sessions.delete(session.id);
    for (const ws of [session.host, session.pen]) {
      send(ws, { type: 'ended', message: reason });
      ws?.close(1000, 'Session ended');
    }
  };
  const presence = (session) => {
    const payload = { type: 'presence', host: session.host?.readyState === 1, pen: session.pen?.readyState === 1 };
    send(session.host, payload);
    send(session.pen, payload);
  };
  const create = (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const roomId = req.body?.roomId;
    if (typeof roomId !== 'string' || roomId.length > 760 || !roomId.startsWith('board-')
      || !authorize(req.auth, roomId, req.authToken)) return res.status(403).json({ error: 'Эта доска недоступна для рисования.' });
    const owned = [...sessions.values()].filter((s) => s.auth.id === req.auth.id && s.auth.role === req.auth.role);
    for (const old of owned.filter((s) => s.roomId === roomId)) revoke(old);
    if (sessions.size >= 500 || owned.filter((s) => s.roomId !== roomId).length >= 3) {
      return res.status(429).json({ error: 'Сначала отключите телефон от другой доски.' });
    }
    const session = { id: key(), hostKey: key(), penKey: key(), auth: req.auth, authToken: req.authToken,
      roomId, expiresAt: now() + sessionMs, pairBy: now() + pairingMs, hostGoneAt: now(),
      host: null, pen: null, paired: false, deviceId: '', frame: null, results: new Map() };
    sessions.set(session.id, session);
    const localHosts = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(req.hostname)
      ? Object.values(os.networkInterfaces()).flat().filter((entry) => entry.family === 'IPv4' && !entry.internal
        && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address))
        .map((entry) => entry.address).sort((a, b) => Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')))
      : [];
    return res.json({ id: session.id, hostKey: session.hostKey, penKey: session.penKey, pairBy: session.pairBy, localHosts });
  };
  const remove = (req, res) => {
    const session = sessions.get(req.params.id);
    if (session && (session.auth.id !== req.auth.id || session.auth.role !== req.auth.role)) return res.status(403).json({ error: 'Нет доступа.' });
    revoke(session);
    return res.json({ ok: true });
  };

  wss.on('connection', (ws) => {
    let session;
    let side;
    let windowStart = now();
    let count = 0;
    let bytes = 0;
    let alive = true;
    const authTimer = setTimeout(() => ws.close(1008, 'Pairing required'), 5000);
    authTimer.unref?.();
    ws.on('pong', () => { alive = true; });
    ws.tabletHeartbeat = () => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    };
    ws.on('error', () => {});
    ws.on('message', (raw, binary) => {
      if (binary) return ws.close(1008, 'JSON required');
      if (now() - windowStart >= 1000) { windowStart = now(); count = 0; bytes = 0; }
      count += 1;
      bytes += raw.length;
      if (count > 80 || bytes > (side === 'host' ? 4_000_000 : 2_000_000)) return ws.close(1008, 'Rate limit');
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return ws.close(1008, 'Invalid JSON'); }
      if (!message || typeof message !== 'object') return;
      if (!session) {
        const candidate = sessions.get(message.id);
        side = message.side;
        if (message.type !== 'join' || !['host', 'pen'].includes(side) || !valid(candidate)
          || message.key !== (side === 'host' ? candidate.hostKey : candidate.penKey)) {
          send(ws, { type: 'ended', message: 'QR-код недействителен или устарел. Создайте новый на компьютере.' });
          return ws.close(1008, 'Invalid pairing');
        }
        if (side === 'pen') {
          if (!/^[\w-]{16,80}$/.test(message.deviceId || '') || (candidate.deviceId && candidate.deviceId !== message.deviceId)) {
            send(ws, { type: 'ended', message: 'К этой доске уже подключён другой телефон.' });
            return ws.close(1008, 'Device already paired');
          }
          candidate.deviceId = message.deviceId;
          candidate.paired = true;
        }
        session = candidate;
        session[side]?.close(4001, 'Connection replaced');
        session[side] = ws;
        if (side === 'host') session.hostGoneAt = null;
        clearTimeout(authTimer);
        send(ws, { type: 'ready', expiresAt: session.expiresAt });
        presence(session);
        if (side === 'pen' && session.frame) send(ws, session.frame);
        return;
      }
      if (!sessions.has(session.id) || !valid(session)) return revoke(session);
      if (session[side] !== ws) return;
      if (message.type === 'ping') return send(ws, { type: 'pong' });
      if (side === 'host') {
        if (message.type === 'revoke') return revoke(session);
        if (message.type === 'frame' && /^[\w-]{1,80}$/.test(message.id || '')
          && Number.isFinite(message.width) && message.width > 0 && message.width <= 10_000
          && Number.isFinite(message.height) && message.height > 0 && message.height <= 10_000
          && typeof message.image === 'string' && message.image.length <= 1_000_000
          && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(message.image)) {
          session.frame = { type: 'frame', id: message.id, width: message.width, height: message.height, image: message.image };
          return send(session.pen, session.frame);
        }
        if (message.type === 'ack' && /^[\w-]{1,80}$/.test(message.id || '')) {
          const result = { type: 'ack', id: message.id, ok: message.ok === true, error: String(message.error || '').slice(0, 200) };
          boundedSet(session.results, message.id, result);
          return send(session.pen, result);
        }
        return;
      }
      if (message.type === 'preview-clear') return send(session.host, { type: 'preview-clear' });
      if (message.type === 'stroke' || message.type === 'preview') {
        const stroke = normalizeTabletStroke(message.stroke);
        if (!stroke) return ws.close(1008, 'Invalid stroke');
        if (message.type === 'stroke' && session.results.has(stroke.id)) return send(ws, session.results.get(stroke.id));
        return send(session.host, { type: message.type, stroke });
      }
      if (message.type === 'undo' && /^[\w-]{1,80}$/.test(message.id || '') && /^[\w-]{1,80}$/.test(message.strokeId || '')) {
        if (session.results.has(message.id)) return send(ws, session.results.get(message.id));
        return send(session.host, { type: 'undo', id: message.id, strokeId: message.strokeId });
      }
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (!session || session[side] !== ws) return;
      session[side] = null;
      if (side === 'host') session.hostGoneAt = now();
      else send(session.host, { type: 'preview-clear' });
      presence(session);
    });
  });
  const sweep = () => {
    for (const session of sessions.values()) {
      if (!valid(session) || (session.hostGoneAt !== null && now() - session.hostGoneAt > hostGraceMs)) revoke(session);
    }
  };
  const sweepTimer = setInterval(sweep, 5000);
  const heartbeat = setInterval(() => { for (const ws of wss.clients) ws.tabletHeartbeat?.(); }, 15_000);
  sweepTimer.unref?.();
  heartbeat.unref?.();
  return { create, remove, sweep, path: TABLET_WS_PATH,
    upgrade: (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws)),
    close: () => {
      clearInterval(sweepTimer); clearInterval(heartbeat);
      for (const s of sessions.values()) revoke(s);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
};
