import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_LEARNING_TARIFFS = Object.freeze([
  { id: 'individual', title: 'Индивидуальный', kind: 'individual', price: 2900, lessonCount: 1, consultationCount: 0, consultationMinutes: 0 },
  { id: 'recordings', title: 'По записям', kind: 'recordings', price: 1900, lessonCount: 8, consultationCount: 0, consultationMinutes: 0 },
  { id: 'group-main', title: 'Основной', kind: 'group', price: 9600, lessonCount: 8, consultationCount: 0, consultationMinutes: 0 },
  { id: 'group-plus', title: 'С личными консультациями', kind: 'group', price: 13600, lessonCount: 8, consultationCount: 2, consultationMinutes: 20 },
]);
const text = value => String(value || '').trim();
const cents = value => Math.round(Number(value) * 100);
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
const fail = (error, status = 400) => { throw Object.assign(new Error(error), { status }); };
const money = value => {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 10_000_000) fail('Укажите положительную стоимость');
  return cents(value) / 100;
};
export const subscriptionDay = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date(value));
export const subscriptionEndOfDay = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value))
  && iso(`${value}T12:00:00+03:00`) && subscriptionDay(`${value}T12:00:00+03:00`) === value ? iso(`${value}T23:59:59.999+03:00`) : '';

export function subscriptionBlockState(block, lessons, now = Date.now()) {
  const byId = new Map(lessons.map(lesson => [lesson.id, lesson]));
  const covered = block.lessonIds.map(id => byId.get(id)).filter(Boolean);
  const conducted = covered.filter(lesson => lesson.status === 'completed'
    && (block.tariff.kind !== 'recordings' || lesson.recordingAvailable !== false));
  const remaining = Math.max(0, block.tariff.lessonCount - conducted.length);
  const lastEnd = Math.max(0, ...covered.filter(lesson => lesson.status !== 'cancelled').map(lesson =>
    Date.parse(lesson.startAt) + (Number(lesson.durationMinutes) || 60) * 60_000));
  // A teacher's cancellation or reschedule cannot shorten a paid block.
  const endsAt = new Date(Math.max(Date.parse(block.accessUntil), lastEnd ? Date.parse(subscriptionEndOfDay(subscriptionDay(lastEnd))) : 0)).toISOString();
  const expired = remaining === 0 && now > Date.parse(endsAt);
  const paid = Boolean(block.payment);
  const startsLater = Date.parse(block.startsAt) > now;
  const status = block.cancelledAt ? 'cancelled' : !paid ? 'awaiting_payment' : expired ? 'expired' : startsLater ? 'scheduled' : 'active';
  return { ...block, endsAt, status, completed: conducted.length, remaining,
    consultationUsed: block.consultations.filter(entry => !entry.cancelledAt).length,
    renewalNeeded: paid && !block.cancelledAt && (remaining <= 2 || now > Date.parse(endsAt)),
    lessons: covered.map(({ id, startAt, status, topic }) => ({ id, startAt, status, topic })) };
}

// Each purchase has an immutable price and stable lesson identities. Reconciliation
// only fills missing slots, including replacement lessons after cancellation.
export function bindSubscriptionLessons(blocks, lessons) {
  const byId = new Map(lessons.map(lesson => [lesson.id, lesson]));
  let changed = false;
  const scopes = new Map();
  for (const block of blocks.filter(entry => !entry.cancelledAt).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.createdAt.localeCompare(b.createdAt))) {
    const key = `${block.teacherId}\n${block.studentId}\n${block.groupId}`;
    const used = scopes.get(key) || new Set();
    const reserved = new Set(blocks.filter(other => other.id !== block.id && !other.cancelledAt
      && other.teacherId === block.teacherId && other.studentId === block.studentId && other.groupId === block.groupId)
      .flatMap(other => other.lessonIds));
    const retained = block.lessonIds.filter(id => byId.has(id) && byId.get(id).status !== 'cancelled');
    const candidates = lessons.filter(lesson => lesson.teacherId === block.teacherId && lesson.groupId === block.groupId
      && !reserved.has(lesson.id) && lesson.status !== 'cancelled' && Date.parse(lesson.startAt) >= Date.parse(block.startsAt))
      .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
    const ids = [...retained, ...candidates.map(lesson => lesson.id)].filter((id, index, all) => !used.has(id) && all.indexOf(id) === index).slice(0, block.tariff.lessonCount);
    if (JSON.stringify(ids) !== JSON.stringify(block.lessonIds)) { block.lessonIds = ids; changed = true; }
    ids.forEach(id => used.add(id));
    scopes.set(key, used);
  }
  return changed;
}

export function subscriptionOccurrence(blocks, lessons, studentId, occurrence) {
  const source = occurrence?.event || occurrence?.entry || occurrence || {};
  const groupId = occurrence?.groupId || source.groupId;
  if (!groupId) return null;
  const day = occurrence.dayKey || occurrence.date || source.date;
  const clock = occurrence.time || source.time;
  const lessonId = occurrence.lessonId || source.lessonId;
  const lesson = lessons.find(entry => entry.groupId === groupId && (lessonId ? entry.id === lessonId
    : subscriptionDay(entry.startAt) === day && new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(entry.startAt)) === clock));
  if (!lesson) return null;
  const block = blocks.find(entry => !entry.cancelledAt && entry.studentId === studentId && entry.groupId === groupId && entry.lessonIds.includes(lesson.id));
  if (!block) return null;
  const total = cents(block.tariff.price);
  const ordinal = block.lessonIds.indexOf(lesson.id);
  const lessonCents = Math.floor(total / block.tariff.lessonCount) + (ordinal < total % block.tariff.lessonCount ? 1 : 0);
  return { block, lesson, lessonPrice: lessonCents / 100 };
}

export function subscriptionAccess(blocks, studentId, groupId, lessons, { live = false, lessonId = '', now = Date.now() } = {}) {
  const purchases = blocks.filter(block => block.studentId === studentId && block.groupId === groupId && !block.cancelledAt);
  if (!purchases.length) return { allowed: true, legacy: true };
  const states = purchases.map(block => subscriptionBlockState(block, lessons, now));
  let available = states.filter(block => ['active', 'scheduled'].includes(block.status));
  if (!available.length) return { allowed: false, error: 'Продлите абонемент: оплаченный доступ к этой группе закончился.' };
  if (live) available = available.filter(block => block.tariff.kind === 'group');
  if (!available.length) return { allowed: false, error: 'В тариф «По записям» живые занятия не входят.' };
  if (lessonId && !available.some(block => block.lessonIds.includes(lessonId))) return { allowed: false, error: 'Это занятие не входит в оплаченный блок.' };
  return { allowed: true, legacy: false };
}

export class LearningSubscriptionStore {
  constructor(file, { now = Date.now, id = crypto.randomUUID } = {}) { this.file = file; this.now = now; this.id = id; }
  read() {
    if (!fs.existsSync(this.file)) return { version: 1, tariffs: {}, blocks: [] };
    const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.blocks) || !value.tariffs) fail('Не удалось прочитать абонементы', 503);
    return value;
  }
  save(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  reconcile(lessons) {
    const data = this.read();
    if (bindSubscriptionLessons(data.blocks, lessons)) this.save(data);
    return data;
  }
  tariffs(teacherId, data = this.read()) { return data.tariffs[teacherId] || DEFAULT_LEARNING_TARIFFS.map(entry => ({ ...entry })); }
  updateTariff(teacherId, id, payload) {
    const data = this.read(); const tariffs = this.tariffs(teacherId, data);
    const tariff = tariffs.find(entry => entry.id === id);
    if (!tariff) fail('Тариф не найден', 404);
    if (!text(payload.title) || text(payload.title).length > 100) fail('Укажите название тарифа до 100 символов');
    Object.assign(tariff, { title: text(payload.title), price: money(payload.price) });
    data.tariffs[teacherId] = tariffs;
    this.save(data); return tariff;
  }
  create(teacherId, payload, { students, groups, lessons, individualPrices = {}, isAlreadyPaid }) {
    const data = this.reconcile(lessons);
    const student = students.find(entry => entry.id === payload.studentId && entry.teacherId === teacherId && !entry.deletedAt);
    const group = groups.find(entry => entry.id === payload.groupId && entry.teacherId === teacherId && !entry.deletedAt && entry.status !== 'completed');
    if (!student || !group) fail('Ученик или группа не найдены', 404);
    if (!group.members?.some(member => member.studentId === student.id && member.status === 'active')) fail('Сначала добавьте ученика в эту группу');
    const tariff = this.tariffs(teacherId, data).find(entry => entry.id === payload.tariffId);
    if (!tariff || tariff.kind === 'individual') fail('Для абонемента выберите групповой тариф или записи');
    const startsAt = iso(payload.startsAt);
    const accessUntil = subscriptionEndOfDay(payload.accessUntil);
    if (!startsAt || !accessUntil || Date.parse(accessUntil) < Date.parse(startsAt)) fail('Укажите начало блока и срок доступа');
    if (Date.parse(startsAt) < this.now() - 24 * 60 * 60_000) fail('Новый блок можно начать с сегодняшнего дня или будущего занятия');
    const existing = data.blocks.filter(block => block.teacherId === teacherId && block.studentId === student.id && block.groupId === group.id && !block.cancelledAt);
    if (existing.some(block => !block.payment)) fail('Сначала оплатите или отмените уже созданный блок', 409);
    const latest = existing.sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
    if (latest && (latest.lessonIds.length < latest.tariff.lessonCount || latest.lessonIds.some(id => Date.parse(lessons.find(lesson => lesson.id === id)?.startAt) >= Date.parse(startsAt)))) fail('Следующий блок должен начинаться после занятий предыдущего блока', 409);
    const legacyPrice = Number(group.pricePerLesson);
    const keepCurrentPrice = payload.keepCurrentPrice === true && tariff.id === 'group-main';
    if (keepCurrentPrice && !(legacyPrice > 0)) fail('У группы не указана действующая ставка');
    const price = money(payload.price ?? (keepCurrentPrice ? legacyPrice * tariff.lessonCount : tariff.price));
    const at = new Date(this.now()).toISOString();
    const block = { id: this.id(), teacherId, studentId: student.id, groupId: group.id, groupName: group.name || group.title || 'Мини-группа',
      tariff: { ...tariff, price, ...(keepCurrentPrice ? { title: `${tariff.title} · прежние условия` } : {}) },
      startsAt, accessUntil, createdAt: at, lessonIds: [], payment: null, consultations: [], renewalRequestedAt: '', cancelledAt: '',
      agreedLessonPrice: keepCurrentPrice ? legacyPrice : null, individualPriceAtCreation: individualPrices[student.id] || null };
    data.blocks.push(block); bindSubscriptionLessons(data.blocks, lessons);
    if (isAlreadyPaid && block.lessonIds.some(id => isAlreadyPaid(student.id, id))) fail('В выбранном блоке есть уже оплаченные поурочно занятия. Выберите начало после них.', 409);
    this.save(data); return block;
  }
  change(teacherId, id, action, payload = {}, lessons = [], isAlreadyPaid) {
    const data = this.reconcile(lessons);
    const block = data.blocks.find(entry => entry.id === id && entry.teacherId === teacherId);
    if (!block) fail('Абонемент не найден', 404);
    if (block.cancelledAt) fail('Абонемент отменён', 409);
    const at = new Date(this.now()).toISOString();
    if (action === 'pay') {
      if (block.payment) return block; // Retries never create a second receipt.
      if (isAlreadyPaid && block.lessonIds.some(lessonId => isAlreadyPaid(block.studentId, lessonId))) fail('В блоке есть поурочная оплата. Сначала проверьте её в поурочном учёте, чтобы не записать деньги дважды.', 409);
      const receivedAt = payload.receivedAt ? iso(payload.receivedAt) : at;
      if (!receivedAt) fail('Укажите корректную дату оплаты');
      if (Date.parse(receivedAt) > this.now()) fail('Дата оплаты не может быть в будущем');
      if (cents(payload.amount) !== cents(block.tariff.price)) fail('Для активации нужна полная оплата блока');
      block.payment = { id: this.id(), amount: block.tariff.price, receivedAt, recordedAt: at, recordedBy: teacherId, note: text(payload.note).slice(0, 500) };
    } else if (action === 'cancel') {
      if (block.payment) fail('Оплаченный блок нельзя удалить: сохраните его для истории расчётов', 409);
      block.cancelledAt = at;
    } else if (action === 'consultation') {
      const state = subscriptionBlockState(block, lessons, this.now());
      if (!block.payment || !['active', 'scheduled'].includes(state.status)) fail('Консультации доступны в оплаченном действующем блоке', 409);
      const requestId = text(payload.requestId);
      if (!requestId || requestId.length > 100) fail('Не указан идентификатор консультации');
      if (block.consultations.some(entry => entry.requestId === requestId)) return block;
      if (state.consultationUsed >= block.tariff.consultationCount) fail('Все консультации этого блока уже использованы', 409);
      const heldAt = iso(payload.heldAt);
      if (!heldAt || Date.parse(heldAt) > this.now() || Date.parse(heldAt) < Date.parse(block.startsAt)) fail('Укажите дату проведённой консультации в этом блоке');
      block.consultations.push({ id: this.id(), requestId, heldAt, minutes: block.tariff.consultationMinutes, recordedAt: at, cancelledAt: '' });
    } else if (action === 'undo-consultation') {
      const entry = block.consultations.find(item => item.id === payload.consultationId);
      if (!entry) fail('Консультация не найдена', 404);
      entry.cancelledAt ||= at;
    } else fail('Неизвестное действие');
    this.save(data); return block;
  }
  requestRenewal(studentId, id) {
    const data = this.read(); const block = data.blocks.find(entry => entry.id === id && entry.studentId === studentId && !entry.cancelledAt);
    if (!block) fail('Абонемент не найден', 404);
    block.renewalRequestedAt ||= new Date(this.now()).toISOString(); this.save(data);
  }
}

export function registerLearningSubscriptionRoutes(app, store, options) {
  const route = fn => (req, res, next) => { try { return fn(req, res); } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); return next(error); } };
  const teacher = req => { if (req.auth?.role !== 'teacher') fail('Доступно только преподавателю', 403); return req.auth.id; };
  const snapshot = teacherId => {
    const context = options.context(teacherId); const data = store.reconcile(context.lessons);
    return { tariffs: store.tariffs(teacherId, data), students: context.students.map(({ id, name, nickname }) => ({ id, name: nickname || name, individualPrice: context.individualPrices[id] || null })),
      groups: context.groups.filter(group => !group.deletedAt).map(({ id, name, title, members, pricePerLesson, status }) => ({ id, name: name || title, members, pricePerLesson, status })),
      lessons: context.lessons.map(({ id, groupId, startAt, status, topic }) => ({ id, groupId, startAt, status, topic })),
      blocks: data.blocks.filter(block => block.teacherId === teacherId).map(block => subscriptionBlockState(block, context.lessons, store.now())) };
  };
  app.get('/api/learning-subscriptions', route((req, res) => {
    if (req.auth?.role === 'teacher') return res.json(snapshot(teacher(req)));
    const id = req.auth?.role === 'parent' ? req.auth.studentId : req.auth?.id;
    if (!['student', 'parent'].includes(req.auth?.role)) fail('Недостаточно прав', 403);
    const student = options.student(id); if (!student || student.deletedAt) fail('Ученик не найден', 404);
    const context = options.context(student.teacherId); const data = store.reconcile(context.lessons);
    res.json({ blocks: data.blocks.filter(block => block.studentId === id && block.teacherId === student.teacherId && !block.cancelledAt)
      .map(block => { const { teacherId: _teacher, studentId: _student, individualPriceAtCreation: _price, payment, ...view } = subscriptionBlockState(block, context.lessons, store.now());
        return { ...view, payment: payment ? { amount: payment.amount, receivedAt: payment.receivedAt } : null }; }) });
  }));
  app.patch('/api/learning-subscriptions/tariffs/:id', route((req, res) => { const id = teacher(req); store.updateTariff(id, req.params.id, req.body || {}); res.json(snapshot(id)); }));
  app.post('/api/learning-subscriptions', route((req, res) => { const id = teacher(req); store.create(id, req.body || {}, options.context(id)); res.status(201).json(snapshot(id)); }));
  app.post('/api/learning-subscriptions/:id/renewal-request', route((req, res) => {
    if (req.auth?.role !== 'student') fail('Доступно только ученику', 403);
    store.requestRenewal(req.auth.id, req.params.id); res.json({ ok: true });
  }));
  app.post('/api/learning-subscriptions/:id/:action', route((req, res) => { const id = teacher(req); const context = options.context(id); store.change(id, req.params.id, req.params.action, req.body || {}, context.lessons, context.isAlreadyPaid); res.json(snapshot(id)); }));
}
