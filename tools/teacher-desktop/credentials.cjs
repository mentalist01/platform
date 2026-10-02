'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

class TeacherCredentials {
  constructor(file, encryption) {
    this.file = file; this.encryption = encryption; this.entries = [];
    try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); if (Array.isArray(data)) this.entries = data.filter(e => typeof e.id === 'string' && typeof e.account === 'string' && typeof e.cipher === 'string').slice(0, 20); } catch { /* First run or an unreadable profile. */ }
  }
  available() { return this.encryption.isEncryptionAvailable(); }
  list() { return { available: this.available(), entries: this.entries.map(({ id, label, used }) => ({ id, label, used })) }; }
  write() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.next`, JSON.stringify(this.entries), { mode: 0o600 });
    fs.renameSync(`${this.file}.next`, this.file);
  }
  remember(code, label, account) {
    if (!this.available()) throw new Error('Windows не разрешила зашифровать код. Вход продолжит работать без сохранения.');
    if (typeof code !== 'string' || !code.trim() || code.length > 512 || typeof account !== 'string' || !account || account.length > 128) throw new Error('Не удалось сохранить вход.');
    const previous = this.entries.find(e => e.account === account);
    const entry = { id: previous?.id || crypto.randomUUID(), account, label: String(label || 'Преподаватель').slice(0, 100), cipher: this.encryption.encryptString(code.trim()).toString('base64'), used: Date.now() };
    this.entries = [entry, ...this.entries.filter(e => e.account !== account)].slice(0, 20); this.write();
  }
  code(id) {
    const entry = this.entries.find(e => e.id === id);
    if (!entry || !this.available()) throw new Error('Сохранённый код недоступен. Введите его заново.');
    try { return this.encryption.decryptString(Buffer.from(entry.cipher, 'base64')); } catch { throw new Error('Windows не смогла расшифровать код. Введите его заново.'); }
  }
  remove(id) { this.entries = this.entries.filter(e => e.id !== id); this.write(); }
}
module.exports = { TeacherCredentials };
