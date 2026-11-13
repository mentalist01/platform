import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const maxCommandAge = 5 * 60_000;
const replyWindow = 24 * 60 * 60_000;
const safeId = /^[a-f0-9]{24}$/;
const normalize = value => value.normalize('NFKC').toLowerCase().replaceAll('ё', 'е').trim();
const hash = value => createHash('sha256').update(value).digest('hex');

function readRows(transcript, threadId) {
  const fd = fs.openSync(transcript, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(Math.min(size, 128 * 1024));
    fs.readSync(fd, head, 0, head.length, 0);
    const header = JSON.parse(head.toString('utf8').split('\n', 1)[0]);
    if (header.type !== 'session_meta' || header.payload?.id !== threadId) return [];
    const tail = Buffer.alloc(Math.min(size, 8 * 1024 * 1024));
    fs.readSync(fd, tail, 0, tail.length, size - tail.length);
    return tail.toString('utf8').split('\n').slice(size > tail.length ? 1 : 0).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } finally {
    fs.closeSync(fd);
  }
}

function turnOf(message) {
  return message.internal_chat_message_metadata_passthrough?.turn_id;
}

function messageText(message) {
  return message.content?.map(item => item.text ?? '').join('\n') || '';
}

export function replyText(draft) {
  if (typeof draft !== 'string') return '';
  const result = /^(?:\*\*)?Ответ для отправки(?:\*\*)?:[ \t]*(?:\*\*)?([\s\S]+?)^(?:\*\*)?Для тебя(?:\*\*)?:/im.exec(draft);
  return result?.[1].trim() || '';
}

function aliases(item, identity) {
  const names = [item.name, ...(identity?.status === 'matched' ? identity.matches.map(match =>
    match.role === 'student' ? match.studentName : match.contactName) : [])].filter(Boolean);
  const result = new Set(item.telegramUsername ? ['@' + normalize(item.telegramUsername)] : []);
  for (const name of names) {
    const full = normalize(name);
    result.add(full);
    const first = full.split(/\s+/, 1)[0];
    result.add(first);
    if (/[йь]$/u.test(first)) result.add(first.slice(0, -1) + 'ю');
    else if (/[ая]$/u.test(first)) result.add(first.slice(0, -1) + 'е');
    else if (/[бвгджзклмнпрстфхцчшщ]$/u.test(first)) result.add(first + 'у');
  }
  return result;
}

function queuedCase(message, jobsDirectory, threadId) {
  const text = messageText(message);
  if (!text.startsWith('Новое обращение для подготовки черновика.')) return null;
  const id = text.match(/(?:^|[\\/])([a-f0-9]{64})[\\/]+request\.json\b/)?.[1];
  if (!id) return null;
  try {
    const request = JSON.parse(fs.readFileSync(path.join(jobsDirectory, id, 'request.json'), 'utf8'));
    if (request.requestId !== id || request.threadId !== threadId) return null;
    return JSON.parse(request.prompt.slice(request.prompt.indexOf('{'), request.prompt.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

export function resolveApproval({transcript, threadId, jobsDirectory, cases, now = Date.now()}) {
  let rows;
  try { rows = readRows(transcript, threadId); }
  catch { return {status: 'approval_unavailable'}; }
  const started = rows.findLastIndex(row => row.payload?.type === 'task_started');
  const turn = rows[started]?.payload;
  if (turn?.turn_attribution?.turn_trigger !== 'composer' || turn.turn_id !== turn.root_turn_id) {
    return {status: 'no_approval'};
  }
  const recent = rows.slice(started + 1);
  if (recent.some(row => row.payload?.type === 'task_complete' && row.payload.turn_id === turn.turn_id)) {
    return {status: 'no_approval'};
  }
  const input = recent.findLast(row => row.payload?.role === 'user' && turnOf(row.payload) === turn.turn_id);
  const age = now - Date.parse(input?.timestamp);
  const meta = input?.payload.internal_chat_message_metadata_passthrough;
  const command = input && /^отправь(?:\s+ответ)?\s+(@[a-z0-9_]{5,32}|[\p{L}\p{N}][\p{L}\p{N} _.-]{0,79})[.!]?$/iu.exec(messageText(input.payload).trim());
  if (!Number.isFinite(age) || age < -10_000 || age > maxCommandAge || !command ||
      meta?.content_item_metadata?.length !== 1 || meta.content_item_metadata[0]?.provenance?.type !== 'user' ||
      meta.content_item_kinds?.[0] !== 'user.text' || !input.payload.id) {
    return {status: 'no_approval'};
  }

  const recipient = normalize(command[1].replace(/[.!]+$/, ''));
  const preceding = rows.slice(0, started);
  const queueTurns = new Set(preceding.filter(row => row.payload?.turn_attribution?.turn_trigger === 'queue')
    .map(row => row.payload.turn_id));
  const queueByTurn = new Map(preceding.filter(row => row.payload?.role === 'user' && queueTurns.has(turnOf(row.payload)))
    .map(row => [turnOf(row.payload), row.payload]));
  const namedCases = new Set(Object.values(cases).filter(item => aliases(item).has(recipient)).map(item => item.key));
  const candidates = new Map();
  const checked = new Set();
  let newerUnboundDraft = false;
  for (const row of preceding.toReversed()) {
    const message = row.payload;
    if (message?.role !== 'assistant' || message.phase !== 'final_answer') continue;
    const queued = queueByTurn.get(turnOf(message));
    const job = queued && queuedCase(queued, jobsDirectory, threadId);
    if (!safeId.test(job?.caseId || '')) {
      if (replyText(messageText(message))) newerUnboundDraft = true;
      continue;
    }
    const item = cases[job.caseId];
    if (!item || checked.has(item.key)) continue;
    checked.add(item.key);
    if (!aliases(item, job.platformIdentity).has(recipient)) continue;
    namedCases.add(item.key);
    const text = replyText(item.draft);
    if (item.revision !== job.revision || !text || replyText(messageText(message)) !== text) continue;
    candidates.set(item.key, {item, text, approvalId: hash(input.payload.id), newerUnboundDraft});
  }
  if (namedCases.size > 1) return {status: 'ambiguous_recipient'};
  if (candidates.size === 0) return {status: 'no_current_draft'};
  const {newerUnboundDraft: changed, ...candidate} = candidates.values().next().value;
  return changed ? {status: 'draft_changed'} : {status: 'approved', ...candidate};
}

export class ApprovedReplies {
  constructor(runner, {transcript, jobsDirectory, now = Date.now} = {}) {
    this.runner = runner;
    this.transcript = transcript;
    this.jobsDirectory = jobsDirectory;
    this.now = now;
  }

  async send() {
    const {runner} = this;
    if (!runner.controller || !this.transcript) return {status: 'disabled'};
    if (this.sending) return {status: 'sending'};
    this.sending = true;
    try { return await this.sendOnce(); }
    finally { this.sending = false; }
  }

  async sendOnce() {
    const {runner} = this;
    const {config, inbox, reader} = runner;
    const approved = resolveApproval({
      transcript: this.transcript, jobsDirectory: this.jobsDirectory,
      threadId: config.codexThreadId, cases: this.allowedCases(), now: this.now(),
    });
    if (approved.status !== 'approved') return {status: approved.status};
    const {item, text, approvalId} = approved;
    const {key, revision, connectionId, chatId, name} = item;
    const previous = item.replyDelivery;
    if (previous?.state === 'sent' && previous.revision === revision) return {status: 'already_sent', name};
    if (previous?.state === 'sending' || (previous?.state === 'uncertain' && previous.revision === revision)) return {status: 'uncertain', name};
    if (previous?.approvalId === approvalId) return {status: 'rejected', name};
    const current = () => inbox.data.cases[key]?.revision === revision &&
      inbox.data.cases[key]?.status === 'draft' && runner.canProcess(inbox.data.cases[key]);
    if (!current()) return {status: 'no_current_draft'};
    if (text.length > 4096) return {status: 'too_long', name};
    const lastIncoming = item.messages.findLast(message => !message.outgoing);
    if (!lastIncoming?.date || this.now() - lastIncoming.date * 1000 >= replyWindow) {
      return {status: 'reply_window_closed', name};
    }

    let connection;
    try { connection = await reader.getBusinessConnection(connectionId); }
    catch { return {status: 'connection_unavailable', name}; }
    if (connection?.id !== connectionId || connection.user?.id !== config.telegramOwnerId || connection.is_enabled !== true) {
      return {status: 'connection_unavailable', name};
    }
    if ((connection.rights?.can_reply ?? connection.can_reply) !== true) {
      return {status: 'reply_permission_missing', name};
    }
    if (!current() || !runner.controller) return {status: 'no_current_draft'};
    if (runner.lastPollAt == null || this.now() - runner.lastPollAt > 65_000 ||
        runner.status.startsWith('Приём временно')) return {status: 'receiver_not_synced', name};
    const latest = resolveApproval({
      transcript: this.transcript, jobsDirectory: this.jobsDirectory,
      threadId: config.codexThreadId, cases: this.allowedCases(), now: this.now(),
    });
    if (latest.status !== 'approved' || latest.approvalId !== approvalId || latest.item.key !== key ||
        latest.item.revision !== revision || latest.text !== text) return {status: 'no_approval'};

    const delivery = {state: 'sending', approvalId, revision, at: this.now()};
    item.replyDelivery = delivery;
    inbox.save();
    let sent;
    try { sent = await reader.sendApprovedReply({connectionId, chatId, text}); }
    catch (error) {
      delivery.state = error.telegramRejected ? 'rejected' : 'uncertain';
      inbox.save();
      return {status: delivery.state, name};
    }
    delivery.state = 'sent';
    delivery.messageId = sent.message_id;
    inbox.apply({business_message: {
      business_connection_id: connectionId, message_id: sent.message_id,
      date: sent.date, chat: sent.chat, from: {id: config.telegramOwnerId}, text,
    }});
    inbox.save();
    return {status: 'sent', name, messageId: sent.message_id};
  }

  allowedCases() {
    return Object.fromEntries(Object.entries(this.runner.inbox.data.cases)
      .filter(([, item]) => this.runner.canProcess(item)));
  }
}
