import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { decryptGoogleCalendarTokens, encryptGoogleCalendarTokens } from './googleCalendarWriteback.js';
import { missingMessageVariables } from '../src/utils/messageTemplates.js';

const api = '/api/message-templates/telegram';
const webhook = '/api/message-template-telegram/webhook/';
const day = 86400000;
const digest = value => createHash('sha256').update(value).digest('hex');
const randomCode = () => randomBytes(24).toString('base64url');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

async function telegramRequest(token, method, body = {}) {
  let response;
  try {
    const multipart = body instanceof FormData;
    response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST',
      ...(multipart ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000),
      redirect: 'error',
    });
    const data = await response.json();
    if (response.ok && data.ok) return data.result;
  } catch {
    fail('Telegram не подтвердил действие. Проверьте чат перед повторной отправкой.', 502);
  }
  if (method === 'getMe' && [401, 404].includes(response.status)) fail('Telegram не принял токен бота.');
  if (response.status === 403) fail('Бот не может написать получателю. Проверьте, что бот запущен и не заблокирован.', 409);
  if (response.status === 429) fail('Telegram временно ограничил запросы. Попробуйте чуть позже.', 429);
  fail('Telegram отклонил запрос. Проверьте настройки бота и видео.', 502);
}

const publicChat = chat => ({ name: chat.name, username: chat.username, revision: chat.revision });

export function createMessageTemplateTelegram({ dataDir, secret, publicUrl, students, reservedTokens = [], request = telegramRequest }) {
  const filename = path.join(dataDir, 'teacher-message-template-telegram.json');
  const read = () => {
    if (!fs.existsSync(filename)) return {};
    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (data.version !== 1 || !data.teachers || typeof data.teachers !== 'object' || Array.isArray(data.teachers)) throw Error('Invalid Telegram storage');
    return data.teachers;
  };
  const write = (teacherId, record) => {
    const data = read();
    data[teacherId] = record;
    const temporary = filename + '.' + randomUUID() + '.tmp';
    fs.mkdirSync(dataDir, { recursive: true });
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, teachers: data }), { mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  };
  const keyFile = path.join(dataDir, 'teacher-message-template-telegram.key');
  let signingKey = secret && createHmac('sha256', secret).update('message-template-telegram-v1').digest('hex');
  const readKey = (create = false) => {
    if (signingKey) return signingKey;
    if (!fs.existsSync(keyFile)) {
      if (!create) return '';
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(keyFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    }
    signingKey = fs.readFileSync(keyFile, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(signingKey)) throw Error('Invalid Telegram signing key');
    return signingKey;
  };
  const hookSecret = hookId => createHmac('sha256', readKey()).update(hookId).digest('base64url');
  const endpoint = hookId => new URL(webhook + hookId, publicUrl).href;
  const tokenOf = bot => decryptGoogleCalendarTokens(bot.encryptedToken, readKey()).accessToken;
  const ownedStudent = (teacherId, id) => students().some(student => student.id === id && student.teacherId === teacherId && !student.deletedAt);
  const botFor = id => {
    const bot = read()[id];
    if (!bot?.active) fail('Сначала подключите Telegram-бота.', 409);
    return bot;
  };
  const configInFlight = new Set();
  const sendsInFlight = new Set();

  function registerWebhook(app) {
    app.post(webhook + ':hookId', (req, res) => {
      const { hookId } = req.params;
      if (!/^[\w-]{32}$/.test(hookId) || !readKey()) return res.sendStatus(404);
      const header = Buffer.from(req.get('X-Telegram-Bot-Api-Secret-Token') || '');
      const expected = Buffer.from(hookSecret(hookId));
      if (header.length !== expected.length || !timingSafeEqual(header, expected)) return res.sendStatus(404);
      const match = Object.entries(read()).find(([, bot]) => bot.hookId === hookId);
      if (!match?.[1].active) return res.sendStatus(503);
      const [teacherId, bot] = match;
      const message = req.body?.message;
      if (message?.chat?.type !== 'private' || !Number.isSafeInteger(message.from?.id)
        || message.from.id <= 0 || message.chat.id !== message.from.id || message.from.is_bot) return res.sendStatus(200);
      const chatId = message.chat.id;
      const code = /^\/start ([\w-]{32})$/.exec(message.text || '')?.[1];
      if (code) {
        const key = digest(code);
        const invite = bot.invites[key];
        if (!invite || invite.expiresAt <= Date.now()) return res.sendStatus(200);
        delete bot.invites[key];
        const chat = {
          chatId,
          name: [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').slice(0, 128),
          username: String(message.from.username || '').slice(0, 64),
          revision: randomUUID(),
        };
        if (invite.target === 'owner') bot.ownerCandidate = chat;
        else if (ownedStudent(teacherId, invite.target)) bot.candidates[invite.target] = chat;
        write(teacherId, bot);
      } else if (bot.owner?.chatId === chatId && bot.importUntil > Date.now()) {
        const file = message.video || (String(message.document?.mime_type || '').startsWith('video/') ? message.document : null);
        if (file?.file_id && !message.has_protected_content && bot.videos.length < 100) {
          bot.importUntil = 0;
          const existing = bot.videos.find(video => video.uniqueId === file.file_unique_id && video.kind === (message.video ? 'video' : 'document'));
          if (!existing) {
            bot.videos.push({
              id: randomUUID(), fileId: file.file_id, uniqueId: file.file_unique_id,
              kind: message.video ? 'video' : 'document',
              name: String(file.file_name || message.caption || 'Видео из Telegram').trim().slice(0, 100) || 'Видео из Telegram',
              duration: Number(file.duration) || 0,
            });
          }
          bot.lastVideoId = existing?.id || bot.videos.at(-1).id;
          write(teacherId, bot);
        }
      }
      return res.sendStatus(200);
    });
  }

  function register(app, getTemplate) {
    const route = handler => async (req, res) => {
      res.setHeader('Cache-Control', 'private, no-store');
      if (req.auth?.role !== 'teacher') return res.status(403).json({ error: 'Отправка шаблонов доступна преподавателю.' });
      try { res.json(await handler(req, req.auth.id)); }
      catch (error) {
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Не удалось выполнить действие с Telegram. Попробуйте ещё раз.' });
      }
    };
    const config = handler => route(async (req, id) => {
      if (configInFlight.has(id) || sendsInFlight.has(id)) fail('Дождитесь завершения текущего действия с ботом.', 409);
      configInFlight.add(id);
      try { return await handler(req, id); }
      finally { configInFlight.delete(id); }
    });
    const target = (id, studentId) => {
      if (studentId === 'owner') return studentId;
      if (!ownedStudent(id, studentId)) fail('Ученик не найден.', 404);
      return studentId;
    };

    app.get(api, route((req, id) => {
      const bot = read()[id];
      const studentId = req.query.studentId ? target(id, req.query.studentId) : '';
      if (!bot?.active) return { connected: false };
      return {
        connected: true, username: bot.username,
        owner: bot.owner && publicChat(bot.owner), ownerCandidate: bot.ownerCandidate && publicChat(bot.ownerCandidate),
        student: bot.students[studentId] && publicChat(bot.students[studentId]),
        studentCandidate: bot.candidates[studentId] && publicChat(bot.candidates[studentId]),
        videos: bot.videos.map(({ id: videoId, name, duration }) => ({ id: videoId, name, duration })),
        importId: bot.importId, lastVideoId: bot.lastVideoId, waitingForVideo: bot.importUntil > Date.now(),
      };
    }));
    app.put(api, config(async (req, id) => {
      const token = String(req.body?.token || '').trim();
      if (!/^\d{5,20}:[\w-]{25,100}$/.test(token)) fail('Вставьте токен, выданный @BotFather.');
      if (!publicUrl?.startsWith('https://')) fail('На сервере не настроено подключение Telegram.', 503);
      const botId = token.split(':')[0];
      if (reservedTokens.some(value => value?.split(':')[0] === botId)) fail('Этот бот уже используется платформой. Создайте отдельного бота для шаблонов.', 409);
      const info = await request(token, 'getMe');
      if (!info?.is_bot || String(info.id) !== botId || !/^[a-zA-Z0-9_]{5,64}$/.test(info.username)) fail('Не удалось определить Telegram-бота.');
      const { url } = await request(token, 'getWebhookInfo');
      const data = read();
      const previous = data[id];
      if (previous?.active && previous.botId !== botId) fail('Сначала отключите текущего бота.', 409);
      if (Object.entries(data).some(([owner, bot]) => owner !== id && bot.botId === botId)) fail('Этот бот уже подключён к другому кабинету.', 409);
      const sameBot = previous?.botId === botId;
      if (url && (!sameBot || url !== endpoint(previous.hookId))) fail('Этот бот уже подключён к другому сервису. Используйте отдельного бота.', 409);
      const hookId = sameBot ? previous.hookId : randomCode();
      const next = sameBot ? previous : { videos: [], students: {}, candidates: {}, invites: {}, importUntil: 0 };
      // Persist the reservation first so a failed webhook request can be safely retried.
      write(id, { ...next, botId, hookId, username: info.username,
        encryptedToken: encryptGoogleCalendarTokens({ accessToken: token }, readKey(true)) });
      await request(token, 'setWebhook', {
        url: endpoint(hookId), secret_token: hookSecret(hookId), allowed_updates: ['message'], max_connections: 2,
      });
      write(id, { ...read()[id], active: true });
      return { connected: true, username: info.username };
    }));
    app.delete(api, config(async (_req, id) => {
      const bot = read()[id];
      if (!bot?.encryptedToken) return { connected: false };
      const token = tokenOf(bot);
      const { url } = await request(token, 'getWebhookInfo');
      if (url === endpoint(bot.hookId)) await request(token, 'deleteWebhook');
      write(id, { ...read()[id], active: false, encryptedToken: '', invites: {}, candidates: {}, ownerCandidate: null, importUntil: 0 });
      return { connected: false };
    }));
    app.post(api + '/invite', route((req, id) => {
      const destination = target(id, req.body?.target);
      const bot = botFor(id), code = randomCode(), now = Date.now();
      bot.invites = Object.fromEntries(Object.entries(bot.invites)
        .filter(([, invite]) => invite.expiresAt > now && invite.target !== destination).slice(-99));
      bot.invites[digest(code)] = { target: destination, expiresAt: now + day };
      if (destination === 'owner') bot.ownerCandidate = null;
      else delete bot.candidates[destination];
      write(id, bot);
      return { url: 'https://t.me/' + bot.username + '?start=' + code };
    }));
    app.put(api + '/recipient', route((req, id) => {
      const destination = target(id, req.body?.target);
      const bot = botFor(id);
      const pending = destination === 'owner' ? bot.ownerCandidate : bot.candidates[destination];
      if (!pending || pending.revision !== req.body.revision) fail('Заявка на привязку изменилась. Обновите статус.', 409);
      if (destination === 'owner') {
        bot.owner = pending;
        bot.ownerCandidate = null;
        bot.importUntil = 0;
      } else {
        if (Object.entries(bot.students).some(([studentId, chat]) => studentId !== destination && chat.chatId === pending.chatId && ownedStudent(id, studentId))) {
          fail('Этот Telegram уже привязан к другому ученику.', 409);
        }
        bot.students[destination] = pending;
        delete bot.candidates[destination];
      }
      write(id, bot);
      return { linked: true };
    }));
    app.delete(api + '/recipient', route((req, id) => {
      const destination = target(id, req.body?.target);
      const bot = botFor(id);
      if (destination === 'owner') {
        bot.owner = null;
        bot.ownerCandidate = null;
        bot.importUntil = 0;
      } else {
        delete bot.students[destination];
        delete bot.candidates[destination];
      }
      bot.invites = Object.fromEntries(Object.entries(bot.invites).filter(([, invite]) => invite.target !== destination));
      write(id, bot);
      return { linked: false };
    }));
    app.post(api + '/import', route((_req, id) => {
      const bot = botFor(id);
      if (!bot.owner) fail('Сначала привяжите свой Telegram.', 409);
      if (bot.videos.length >= 100) fail('Можно сохранить до 100 видео.');
      bot.importUntil = Date.now() + 15 * 60000;
      bot.importId = randomUUID();
      bot.lastVideoId = '';
      write(id, bot);
      return { url: 'https://t.me/' + bot.username, importId: bot.importId };
    }));
    app.post(api + '/send', route(async (req, id) => {
      const { studentId, recipientRevision, templateId, templateRevision, requestId, caption, availabilityPng } = req.body || {};
      if (!ownedStudent(id, studentId)) fail('Ученик не найден.', 404);
      if (!/^[a-f0-9-]{36}$/.test(requestId || '')) fail('Некорректный запрос отправки.');
      const bot = botFor(id);
      const hash = digest(JSON.stringify([studentId, recipientRevision, templateId, templateRevision, caption, availabilityPng]));
      const last = bot.deliveries?.[requestId];
      if (last) {
        if (hash !== last.hash || !last.sent) fail('Telegram ещё не подтвердил эту отправку. Проверьте чат.', 409);
        return { sent: true };
      }
      if (configInFlight.has(id) || sendsInFlight.has(id)) fail('Дождитесь завершения текущего действия с ботом.', 409);
      const recipient = bot.students[studentId];
      if (!recipient || recipient.revision !== recipientRevision) fail('Проверьте привязку Telegram ученика.', 409);
      const template = getTemplate(id, templateId);
      const video = bot.videos.find(item => item.id === template?.telegramVideoId);
      if (!video || template.revision !== templateRevision) fail('Сохраните или обновите шаблон с видео.', 409);
      if (typeof caption !== 'string' || !caption.trim() || caption.length > 1024 || missingMessageVariables(caption).length) {
        fail('Подготовьте подпись к видео длиной до 1024 символов.');
      }
      let method = video.kind === 'video' ? 'sendVideo' : 'sendDocument';
      let body = { chat_id: recipient.chatId, [video.kind]: video.fileId, caption };
      if (availabilityPng) {
        if (typeof availabilityPng !== 'string' || availabilityPng.length > 2000000 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(availabilityPng)) fail('Не удалось подготовить картинку расписания.');
        const bytes = Buffer.from(availabilityPng, 'base64');
        if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('Для расписания нужна картинка PNG.');
        method = 'sendMediaGroup';
        body = new FormData();
        body.set('chat_id', String(recipient.chatId));
        body.set('media', JSON.stringify([
          { type: video.kind, media: video.fileId, caption },
          { type: video.kind === 'video' ? 'photo' : 'document', media: 'attach://availability' },
        ]));
        body.set('availability', new Blob([bytes], { type: 'image/png' }), 'availability.png');
      }
      const token = tokenOf(bot);
      const now = Date.now();
      bot.deliveries = Object.fromEntries(Object.entries(bot.deliveries || {}).filter(([, item]) => item.at > now - day).slice(-199));
      if (Object.values(bot.deliveries).some(item => item.at > now - 1000)) fail('Подождите секунду перед следующей отправкой.', 429);
      bot.deliveries[requestId] = { at: now, hash, sent: false };
      write(id, bot);
      sendsInFlight.add(id);
      try {
        await request(token, method, body);
        const latest = read()[id];
        latest.deliveries[requestId].sent = true;
        write(id, latest);
        return { sent: true };
      } finally { sendsInFlight.delete(id); }
    }));
  }

  return { registerWebhook, register, hasVideo: (teacherId, id) => Boolean(read()[teacherId]?.videos.some(video => video.id === id)) };
}
