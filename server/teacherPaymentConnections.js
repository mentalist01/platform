import crypto from 'node:crypto';
import fs from 'node:fs';

const text = value => String(value || '').trim();
const equal = (a, b) => {
  const left = crypto.createHash('sha256').update(text(a)).digest();
  const right = crypto.createHash('sha256').update(text(b)).digest();
  return Boolean(text(a) && text(b) && crypto.timingSafeEqual(left, right));
};

export class TeacherPaymentConnections {
  constructor({ file, writeJson, legacySecret = '', legacyTeacherId = '' }) {
    this.file = file;
    this.writeJson = writeJson;
    this.legacySecret = text(legacySecret);
    this.legacyTeacherId = text(legacyTeacherId);
  }

  read() {
    let db;
    try {
      db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Не удалось прочитать настройки автооплаты.');
      db = { teachers: {}, legacy: { enabled: Boolean(this.legacySecret && this.legacyTeacherId), teacherId: this.legacyTeacherId } };
    }
    if (!db || typeof db.teachers !== 'object' || Array.isArray(db.teachers) || !db.teachers || typeof db.legacy !== 'object' || !db.legacy) {
      throw new Error('Некорректные настройки автооплаты.');
    }
    return db;
  }

  save(db) {
    this.writeJson(this.file, db, { mode: 0o600 });
  }

  ensure(teacherId, { rotate = false } = {}) {
    const id = text(teacherId);
    if (!id) throw new Error('Не найден преподаватель.');
    const db = this.read();
    if (!db.teachers[id]?.secret || rotate) {
      db.teachers[id] = {
        secret: `pay_${crypto.randomBytes(32).toString('base64url')}`,
        keyId: crypto.randomBytes(12).toString('hex'),
        createdAt: new Date().toISOString(),
        lastRequestAt: '', lastStatus: '', lastReason: '',
      };
      this.save(db);
    }
    return this.settings(id);
  }

  settings(teacherId) {
    const id = text(teacherId);
    const db = this.read();
    const entry = db.teachers[id];
    return {
      teacherId: id,
      configured: Boolean(entry?.secret),
      secret: entry?.secret || '',
      keyId: entry?.keyId || '',
      createdAt: entry?.createdAt || '',
      lastRequestAt: entry?.lastRequestAt || '',
      lastStatus: entry?.lastStatus || '',
      lastReason: entry?.lastReason || '',
      legacyActive: Boolean(db.legacy.enabled && db.legacy.teacherId === id && this.legacySecret),
      legacyDisabledAt: db.legacy.teacherId === id ? (db.legacy.disabledAt || '') : '',
    };
  }

  authenticate(secret, requestedTeacherId = '') {
    const db = this.read();
    const requested = text(requestedTeacherId);
    const match = Object.entries(db.teachers).find(([, entry]) => equal(entry?.secret, secret));
    if (match) {
      if (requested && requested !== match[0]) return { ok: false, status: 403, error: 'Ключ оплаты принадлежит другому преподавателю.' };
      return { ok: true, teacherId: match[0], requestedTeacherId: requested, authMode: 'personal-key', keyId: match[1].keyId };
    }
    if (db.legacy.enabled && db.legacy.teacherId && equal(this.legacySecret, secret)) {
      if (requested && requested !== db.legacy.teacherId) return { ok: false, status: 403, error: 'Для этого преподавателя нужен личный ключ оплаты.' };
      return { ok: true, teacherId: db.legacy.teacherId, requestedTeacherId: requested, authMode: 'legacy-key', keyId: '' };
    }
    return { ok: false, status: 401, error: 'Неверный или отключённый ключ оплаты.' };
  }

  record(context, result) {
    if (context.authMode !== 'personal-key') return;
    const db = this.read();
    const entry = db.teachers[context.teacherId];
    if (!entry || entry.keyId !== context.keyId) return;
    const now = new Date().toISOString();
    entry.lastRequestAt = now;
    entry.lastStatus = text(result.status);
    entry.lastReason = text(result.reason).slice(0, 500);
    // Receiving the first personal-key request completes the phone migration.
    if (db.legacy.enabled && db.legacy.teacherId === context.teacherId) {
      db.legacy.enabled = false;
      db.legacy.disabledAt = now;
    }
    this.save(db);
  }
}
