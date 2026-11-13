import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

const keyOf = (connection, chat) => createHash('sha256').update(`${connection}:${chat}`).digest('hex').slice(0, 24);
const messageText = value => typeof value === 'string' ? value : '';
export const flattenExportText = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(v => typeof v === 'string' ? v : messageText(v?.text)).join('') : '';
// The owner and active business connection are checked separately at every
// boundary. This flag covers private chats only, never groups or other owners.
export const chatAllowed = (config, chatId) => config.allPrivateChats === true || config.allowedChatIds.includes(chatId);

export class Inbox {
  constructor(filename, config, now = () => Date.now()) {
    this.filename = filename; this.config = config; this.now = now;
    this.data = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {version: 1, offset: 0, connections: {}, peers: {}, cases: {}, seen: []};
    if (this.data.version !== 1) throw Error('Unsupported inbox version');
  }
  save() {
    fs.mkdirSync(path.dirname(this.filename), {recursive: true});
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), {mode: 0o600});
    fs.renameSync(temporary, this.filename);
  }
  ingest(update) {
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) throw Error('Invalid update');
    if (this.data.seen.includes(update.update_id)) return false;
    this.apply(update);
    this.data.seen = [...this.data.seen, update.update_id].slice(-2000);
    this.data.offset = Math.max(this.data.offset, update.update_id + 1);
    this.save(); return true;
  }
  apply(update) {
    const connection = update.business_connection;
    if (connection?.id && Number.isSafeInteger(connection.user?.id)) {
      this.data.connections[connection.id] = {id: connection.id, ownerId: connection.user.id, name: [connection.user.first_name, connection.user.last_name].filter(Boolean).join(' '), enabled: connection.is_enabled === true};
      return;
    }
    const deleted = update.deleted_business_messages;
    const message = update.business_message || update.edited_business_message;
    const connectionId = deleted?.business_connection_id || message?.business_connection_id;
    const conn = this.data.connections[connectionId];
    if (!conn?.enabled || !this.config.telegramOwnerId || conn.ownerId !== this.config.telegramOwnerId) return;
    const chat = deleted?.chat || message?.chat;
    if (chat?.type !== 'private' || !Number.isSafeInteger(chat.id)) return;
    this.data.peers[String(chat.id)] = {id: chat.id, name: [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || String(chat.id)};
    // Discovery stores names and ids only; unselected chats never enter a model prompt.
    if (!chatAllowed(this.config,chat.id)) return;
    const key = keyOf(connectionId, chat.id), existing = this.data.cases[key];
    if (deleted) {
      if (!existing) return;
      existing.messages = existing.messages.filter(m => !deleted.message_ids.includes(m.id));
      this.invalidate(existing); existing.status = existing.messages.some(m => !m.outgoing) ? 'pending' : 'empty';
      return;
    }
    if (!Number.isSafeInteger(message?.message_id) || !Number.isSafeInteger(message.from?.id)) return;
    const outgoing = message.from.id === this.config.telegramOwnerId;
    if (!outgoing && (message.from.id !== chat.id || message.from.is_bot)) return;
    if (outgoing && !existing) return;
    const item = existing || {key, connectionId, chatId: chat.id, name: this.config.studentNames?.[String(chat.id)] || this.data.peers[String(chat.id)].name, revision: 0, messages: [], draft: null, status: 'pending'};
    const file = message.document || message.voice || message.photo?.at(-1);
    const kind = message.document ? 'document' : message.voice ? 'voice' : file ? 'image' : null;
    const normalized = {id: message.message_id, outgoing, date: message.date, text: messageText(message.text || message.caption).slice(0, 16000), replyTo: message.reply_to_message?.message_id || null,
      file: file?.file_id ? {id: file.file_id, name: message.document?.file_name || (kind === 'voice' ? 'voice.ogg' : 'photo.jpg'), bytes: file.file_size || null, mime: file.mime_type || (kind === 'image' ? 'image/jpeg' : 'audio/ogg'), kind} : null};
    item.messages = [...item.messages.filter(m => m.id !== normalized.id), normalized].sort((a, b) => a.id - b.id).slice(-40);
    this.invalidate(item); item.status = item.messages.at(-1)?.outgoing ? 'answered' : 'pending';
    this.data.cases[key] = item;
  }
  invalidate(item) {
    item.revision++; item.draft = null; item.error = null;
    item.updatedAt = this.now(); item.readyAt = this.now() + this.config.debounceMs;
  }
  ready() {
    return Object.values(this.data.cases).filter(c => c.status === 'pending' && c.readyAt <= this.now() && chatAllowed(this.config,c.chatId) && this.data.connections[c.connectionId]?.enabled && this.data.connections[c.connectionId]?.ownerId === this.config.telegramOwnerId).sort((a,b)=>a.readyAt-b.readyAt)[0];
  }
  finish(key, revision, draft) {
    const item = this.data.cases[key];
    if (!item || item.revision !== revision || item.status !== 'pending' || !chatAllowed(this.config,item.chatId) || !this.data.connections[item.connectionId]?.enabled || this.data.connections[item.connectionId]?.ownerId !== this.config.telegramOwnerId) return false;
    item.draft = draft; item.status = 'draft'; this.save(); return true;
  }
  fail(key, revision, reason) {
    const item = this.data.cases[key];
    if (!item || item.revision !== revision) return;
    item.error = reason; item.readyAt = this.now() + 60000; this.save();
  }
}

export function styleExamples(exported, ownerId, limit = 100) {
  if (exported.type !== 'personal_chat' || !Array.isArray(exported.messages)) throw Error('Export one selected personal chat as JSON');
  const examples = []; let incoming = [], lastIncomingTime = null, answerRun = null, lastAnswerTime = null;
  for (const message of exported.messages) {
    if (message.type !== 'message') continue;
    const text = flattenExportText(message.text).trim();
    const parsedTime = Number(message.date_unixtime) * 1000 || Date.parse(message.date);
    const time = Number.isFinite(parsedTime) ? parsedTime : null;
    if (message.from_id === `user${ownerId}`) {
      // Do not label a new conversation days later as a reply to an old “OK”.
      // Forwarded boilerplate and access codes are not samples of Ivan's style.
      const usable = text && !message.forwarded_from && !message.via_bot && !/код\s*(?:для\s*платформы|доступа|входа)|https?:\/\/\S+|\+7[\d\s()-]{9,}/i.test(text);
      if (usable && incoming.length && (time===null || lastIncomingTime===null || time-lastIncomingTime<=86400000)) {
        answerRun = {question: incoming.join('\n').slice(0,4000), answer: text.slice(0,4000)};
        examples.push(answerRun);
      } else if (usable && answerRun && time!==null && lastAnswerTime!==null && time-lastAnswerTime<=900000) {
        answerRun.answer = (answerRun.answer+'\n'+text).slice(0,4000);
      } else answerRun = null;
      lastAnswerTime = time;
      incoming = [];
    } else {
      answerRun = null;
      if (text) {incoming.push(text);lastIncomingTime=time;}
      else incoming = [];
    }
  }
  return examples.slice(-limit);
}
