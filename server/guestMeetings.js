import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DAY = 24 * 60 * 60 * 1000;
const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');
// Strip control characters from names before storing or displaying them.
// eslint-disable-next-line no-control-regex
const safeText = (value, limit) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const meetingRoomId = (id) => `rtc:meeting:${id}`;
export const parseMeetingRoomId = (value) => {
  const match = /^rtc:meeting:([a-f0-9-]{36})$/.exec(String(value || ''));
  return match ? { roomId: match[0], meetingId: match[1], targetType: 'meeting', legacy: false } : null;
};

export const createGuestMeetingStore = ({ filePath, now = Date.now }) => {
  const read = () => {
    if (!fs.existsSync(filePath)) return { meetings: [], guests: [] };
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(value.meetings) || !Array.isArray(value.guests)) throw new Error('Некорректное хранилище встреч');
    return value;
  };
  const save = (state) => {
    const cutoff = now() - 30 * DAY;
    state.meetings = state.meetings.filter((m) => Date.parse(m.expiresAt) > cutoff);
    const ids = new Set(state.meetings.map((m) => m.id));
    state.guests = state.guests.filter((g) => ids.has(g.meetingId) && Date.parse(g.expiresAt) > now());
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, filePath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  };
  const isOpen = (m) => Boolean(m && !m.closedAt && Date.parse(m.expiresAt) > now());
  const requireOpen = (state, id) => {
    const meeting = state.meetings.find((m) => m.id === id);
    if (!meeting) fail('Встреча не найдена', 404);
    if (!isOpen(meeting)) fail('Встреча завершена. Попросите преподавателя прислать новую ссылку.', 410);
    return meeting;
  };
  const publicMeeting = (m) => ({
    id: m.id, title: m.title, hostName: m.hostName, roomId: meetingRoomId(m.id),
    maxParticipants: m.maxParticipants, createdAt: m.createdAt, expiresAt: m.expiresAt,
    closedAt: m.closedAt, locked: m.locked, open: isOpen(m),
  });
  const guestAuth = (g) => ({ id: g.id, name: g.name, role: 'guest', meetingId: g.meetingId });
  return {
    create(teacher, title) {
      const state = read();
      if (state.meetings.filter((m) => m.teacherId === teacher.id && isOpen(m)).length >= 10) {
        fail('Завершите одну из открытых встреч, чтобы создать новую.', 409);
      }
      const meeting = {
        id: crypto.randomUUID(), teacherId: teacher.id, hostName: safeText(teacher.name, 80) || 'Преподаватель',
        title: safeText(title, 120) || 'Пробное занятие', maxParticipants: 20,
        createdAt: new Date(now()).toISOString(), expiresAt: new Date(now() + DAY).toISOString(), closedAt: '', locked: false,
      };
      state.meetings.push(meeting);
      save(state);
      return publicMeeting(meeting);
    },
    list(teacherId) {
      return read().meetings.filter((m) => m.teacherId === teacherId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map(publicMeeting);
    },
    get(id) { return publicMeeting(requireOpen(read(), id)); },
    owned(id, teacherId) {
      const m = read().meetings.find((entry) => entry.id === id);
      if (!m) fail('Встреча не найдена', 404);
      if (m.teacherId !== teacherId) fail('Нет доступа к этой встрече', 403);
      return publicMeeting(m);
    },
    join(id, { name, resumeToken } = {}) {
      const state = read();
      const meeting = requireOpen(state, id);
      if (resumeToken) {
        const guest = state.guests.find((g) => g.tokenHash === hashToken(resumeToken) && g.meetingId === id);
        if (!guest || guest.revokedAt || Date.parse(guest.expiresAt) <= now()) fail('Вход больше недоступен. Обратитесь к преподавателю.', 403);
        return { meeting: publicMeeting(meeting), user: guestAuth(guest), token: resumeToken };
      }
      if (meeting.locked) fail('Преподаватель закрыл вход для новых участников.', 403);
      const guestName = safeText(name, 80);
      if (!guestName) fail('Введите ваше имя');
      if (state.guests.filter((g) => g.meetingId === id && Date.parse(g.expiresAt) > now()).length >= 400) {
        fail('Слишком много входов в эту встречу. Обратитесь к преподавателю.', 429);
      }
      const token = crypto.randomBytes(32).toString('base64url');
      const guest = { id: crypto.randomUUID(), meetingId: id, name: guestName, tokenHash: hashToken(token),
        expiresAt: meeting.expiresAt, revokedAt: '' };
      state.guests.push(guest);
      save(state);
      return { meeting: publicMeeting(meeting), user: guestAuth(guest), token };
    },
    resolveToken(token) {
      if (!token || String(token).length > 100) return null;
      const state = read();
      const guest = state.guests.find((g) => g.tokenHash === hashToken(token));
      return guest && !guest.revokedAt && Date.parse(guest.expiresAt) > now()
        && isOpen(state.meetings.find((m) => m.id === guest.meetingId)) ? guestAuth(guest) : null;
    },
    accessError(auth, meetingId) {
      const state = read();
      const meeting = state.meetings.find((m) => m.id === meetingId);
      if (!isOpen(meeting)) return 'Встреча завершена';
      if (auth?.role === 'teacher' && auth.id === meeting.teacherId) return '';
      if (auth?.role === 'guest' && auth.meetingId === meetingId) {
        const guest = state.guests.find((g) => g.id === auth.id && g.meetingId === meetingId);
        if (guest && !guest.revokedAt && Date.parse(guest.expiresAt) > now()) return '';
      }
      return 'Нет доступа к этой встрече';
    },
    control(id, teacherId, action, guestId) {
      const state = read();
      const meeting = requireOpen(state, id);
      if (meeting.teacherId !== teacherId) fail('Нет доступа к этой встрече', 403);
      if (action === 'close') meeting.closedAt = new Date(now()).toISOString();
      else if (action === 'lock') meeting.locked = true;
      else if (action === 'unlock') meeting.locked = false;
      else if (action === 'remove' || action === 'mute') {
        const guest = state.guests.find((g) => g.id === guestId && g.meetingId === id && !g.revokedAt);
        if (!guest) fail('Участник не найден', 404);
        if (action === 'remove') guest.revokedAt = new Date(now()).toISOString();
      } else fail('Неизвестное действие');
      save(state);
      return publicMeeting(meeting);
    },
  };
};

export const registerGuestMeetingRoutes = (app, store, { publicRoutes, resolveNormalAuth, participants, control }) => {
  const handle = (fn) => (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { fn(req, res); } catch (error) {
      if (!error.status) console.error('[guest-meetings]', error.message);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Не удалось сохранить встречу. Попробуйте ещё раз.' });
    }
  };
  const teacher = (req) => {
    if (req.auth?.role !== 'teacher') fail('Доступно только преподавателю', 403);
    return req.auth;
  };
  if (publicRoutes) {
    const attempts = new Map();
    app.get('/api/guest-meetings/:id', handle((req, res) => res.json({ meeting: store.get(req.params.id) })));
    app.post('/api/guest-meetings/:id/join', handle((req, res) => {
      const time = Date.now();
      for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
      const key = req.ip;
      const attempt = attempts.get(key) || { count: 0, until: time + 60_000 };
      attempt.count += 1;
      attempts.set(key, attempt);
      if (attempt.count > 40) fail('Слишком много попыток входа. Подождите минуту.', 429);
      res.json(store.join(req.params.id, req.body));
    }));
    app.get('/api/guest-meetings/:id/presence', handle((req, res) => {
      const token = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''))?.[1];
      const auth = store.resolveToken(token) || resolveNormalAuth(req);
      const error = store.accessError(auth, req.params.id);
      if (error) fail(error, 403);
      res.json({ roomId: meetingRoomId(req.params.id), participants: participants(req.params.id) });
    }));
    return;
  }
  app.get('/api/teacher-meetings', handle((req, res) => res.json({ meetings: store.list(teacher(req).id) })));
  app.post('/api/teacher-meetings', handle((req, res) => res.status(201).json({ meeting: store.create(teacher(req), req.body?.title) })));
  app.post('/api/teacher-meetings/:id/control', handle((req, res) => {
    const meeting = store.control(req.params.id, teacher(req).id, req.body?.action, req.body?.guestId);
    control(req.params.id, req.body?.action, req.body?.guestId);
    res.json({ meeting });
  }));
};
