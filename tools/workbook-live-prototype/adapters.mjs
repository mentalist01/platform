import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';

export class OfficeAdapter {
  constructor(executable, args, options = {}) {
    this.child = spawn(executable, args, { ...options, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.pending = new Map(); this.sequence = 0; this.stderr = '';
    this.ready = new Promise((resolve, reject) => { this.onReady = resolve; this.onFailure = reject; });
    this.closed = new Promise(resolve => { this.onClosed = resolve; });
    this.child.stderr.on('data', bytes => { this.stderr += bytes; });
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', code => { this.fail(Error(`Office adapter exited (${code}): ${this.stderr.slice(-2000)}`)); this.onClosed(code); });
    createInterface({ input: this.child.stdout }).on('line', line => {
      try {
        const data = JSON.parse(line);
        if (data.ready) { this.onReady(data); return; }
        const pending = this.pending.get(data.id);
        if (!pending) return;
        clearTimeout(pending.timer); this.pending.delete(data.id);
        if (data.error) pending.reject(Error(data.error)); else pending.resolve(data.result);
      } catch (error) { this.fail(Error(`Invalid adapter output: ${error.message}`)); }
    });
  }
  fail(error) {
    this.onFailure(error);
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
  }
  async request(command) {
    await this.ready;
    const id = ++this.sequence;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Office adapter request timed out')); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...command, id }) + '\n');
    });
  }
  async close() {
    if (this.child.exitCode !== null) return;
    this.child.stdin.end(JSON.stringify({ type: 'close' }) + '\n');
    const timer = setTimeout(() => this.child.kill(), 12000);
    try { await this.closed; } finally { clearTimeout(timer); }
  }
}

export async function openOfficePair({ directory, addresses, visible = false }) {
  const calcDirectory = process.env.LIBREOFFICE_PROGRAM || 'C:/Program Files/LibreOffice/program';
  const root = path.resolve(import.meta.dirname);
  const dll = path.join(root, 'excel/bin/Release/net9.0-windows/WorkbookLiveExcel.dll');
  const args = ['--addresses', addresses.join(','), ...(visible ? ['--visible'] : [])];
  const calc = new OfficeAdapter(path.join(calcDirectory, 'python.exe'), [path.join(root, 'adapter-calc.py'), '--soffice', path.join(calcDirectory, 'soffice.exe'), '--profile', path.join(directory, 'calc-profile'), ...args], { cwd: calcDirectory });
  const excel = new OfficeAdapter('dotnet', [dll, ...args], { cwd: root });
  try {
    await Promise.all([calc.ready, excel.ready]);
    return { calc, excel, close: async () => { await Promise.all([calc.close(), excel.close()]); } };
  } catch (error) { await Promise.all([calc.close(), excel.close()]); throw error; }
}
