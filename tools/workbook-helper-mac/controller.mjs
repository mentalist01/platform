import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { WorkbookApi } from './api.mjs';
import { parseLaunch } from './protocol.mjs';
import { WorkbookSession } from './session.mjs';

export class WorkbookController {
  constructor({ directory, adapter, allowLoopback = false, fetchImpl = fetch, sessionOptions = {} }) {
    Object.assign(this, { directory, adapter, allowLoopback, fetchImpl, sessionOptions });
    this.sessions = new Map(); this.queue = Promise.resolve();
  }
  launch(raw) {
    // Keep URL events in order: ticket exchange is one-use and name prompts may
    // remain open while the user selects another workbook in their browser.
    const pending = this.queue.then(() => this.open(raw)); this.queue = pending.catch(() => {}); return pending;
  }
  async open(raw) {
    const { origin, ticket } = parseLaunch(raw, { allowLoopback: this.allowLoopback });
    const api = new WorkbookApi(origin, { fetchImpl: this.fetchImpl });
    const grant = await api.exchange(ticket);
    const key = origin + '\n' + grant.workbookKey;
    const existing = this.sessions.get(key);
    if (existing && !existing.closed && existing.revision === grant.revision && existing.initialHash === grant.contentHash) {
      existing.grant = grant; existing.retry(); await this.openSafe(existing.file); return existing;
    }
    if (existing) {
      existing.close();
      // An earlier PUT may already be committed. Wait for its receipt before
      // downloading the current server version for the replacement session.
      const deadline = Date.now() + 125000;
      while (existing.busy && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      if (existing.busy) throw new Error('Предыдущее сохранение ещё выполняется. Повторите открытие позже.');
    }
    const downloaded = await api.download(grant);
    grant.revision = downloaded.revision; grant.contentHash = downloaded.contentHash;
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const folder = path.join(this.directory, crypto.randomUUID());
    await fs.mkdir(folder, { mode: 0o700 });
    const file = path.join(folder, grant.fileName);
    await fs.writeFile(file, downloaded.bytes, { flag: 'wx', mode: 0o600 });
    let sourceFile = '';
    if (grant.sourceText) {
      // Hash failure prevents opening either material; keep the local table so
      // an interrupted download never discards a previously saved solution.
      const source = await api.download(grant, true);
      const sourceDir = path.join(folder, 'Условие'); await fs.mkdir(sourceDir, { mode: 0o700 });
      sourceFile = path.join(sourceDir, grant.sourceText.fileName);
      await fs.writeFile(sourceFile, source.bytes, { flag: 'wx', mode: 0o600 });
    }
    const session = new WorkbookSession({ ...this.sessionOptions, api, grant, file, initialHash: downloaded.contentHash,
      requestName: initial => this.adapter.requestName(initial), onStatus: message => {
        if (/уже есть новая версия|отключён|истёк|больше недоступна/.test(message)) void this.adapter.notify(message);
      } });
    this.sessions.set(key, session);
    await this.openSafe(file);
    if (sourceFile) await this.openSafe(sourceFile, true);
    return session;
  }
  async openSafe(file, text = false) {
    try { await this.adapter.quarantine(file); }
    catch { await this.adapter.reveal(file); await this.adapter.message('Таблица сохранена локально. macOS не смогла установить защитную метку; автоматическое открытие отменено.'); return false; }
    if (text) await this.adapter.openText(file); else await this.adapter.openWorkbook(file);
    return true;
  }
  statuses() { return [...this.sessions.values()].map(session => ({ name: session.grant.solutionName || session.grant.fileName, status: session.status, closed: session.closed })); }
  retry() { for (const session of this.sessions.values()) if (!session.closed) session.retry(); }
  async flush() { await this.queue; await Promise.all([...this.sessions.values()].filter(session => !session.closed).map(session => session.synchronize())); }
  close() { for (const session of this.sessions.values()) session.close(); }
}
