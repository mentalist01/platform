import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { atomicJson, readJson } from './storage.mjs';

export function validateBundle(bytes, release) {
  if (!/^[a-f0-9]{64}$/.test(release?.id || '') || release.sha256 !== release.id
    || bytes.length !== release.bytes || bytes.length > 8 * 1024 * 1024
    || crypto.createHash('sha256').update(bytes).digest('hex') !== release.sha256) throw new Error('Проверка обновления не пройдена. Пульт не изменён.');
  const bundle = JSON.parse(bytes.toString('utf8'));
  if (bundle.version !== release.version || !bundle.files || typeof bundle.files !== 'object') throw new Error('Неверный пакет обновления');
  for (const [name, content] of Object.entries(bundle.files)) {
    if (!/^[a-zA-Z0-9_-]+\.(mjs|json|html|ps1|vbs|md|cmd|py|txt)$/.test(name) || typeof content !== 'string'
      || ['state.json', 'runtime.json'].includes(name)) throw new Error('Недопустимый файл обновления');
  }
  for (const name of ['app.mjs', 'updater.mjs', 'update-worker.mjs', 'package.json', 'package-lock.json']) {
    if (!bundle.files[name]) throw new Error(`В обновлении нет ${name}`);
  }
  return bundle;
}

const run = (exe, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(exe, args, { cwd, windowsHide: true, stdio: 'ignore' });
  const timer = setTimeout(() => { child.kill(); reject(new Error('Подготовка обновления заняла слишком много времени')); }, 180000);
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Не удалось подготовить обновление. Рабочая версия сохранена.')); });
});

export class RecorderUpdater {
  constructor({ directory, here, config, assertIdle, shutdown, report, platform = process.platform }) {
    Object.assign(this, { directory, here, config, assertIdle, shutdown, report, platform });
    this.installed = readJson(path.join(here, 'release.json'), { version: '1.1.0', id: '' });
    this.statusFile = path.join(directory, 'update-status.json');
    this.state = readJson(this.statusFile, {});
    this.busy = false;
    if (this.state.status === 'preparing' || (this.state.status === 'restarting' && this.state.releaseId !== this.installed.id)) this.setState({ ...this.state, status: 'error', error: 'Обновление прервалось. Рабочая версия сохранена; повторите установку.' });
  }
  setState(value) { this.state = value; atomicJson(this.statusFile, value); }
  info(busy = false) {
    if (this.state.status === 'restarting') this.state = readJson(this.statusFile, this.state);
    return { updaterVersion: this.platform === 'win32' ? 1 : 0, version: this.installed.version, releaseId: this.installed.id, busy: busy || this.busy, update: this.state };
  }
  async install(request) {
    if (!request || this.busy || request.id === this.state.id) return;
    if (!/^[a-f0-9-]{36}$/.test(request.id) || Date.now() - request.requestedAt > 10 * 60_000) return;
    this.busy = true;
    this.setState({ id: request.id, releaseId: request.release?.id, status: 'preparing', error: '' });
    try {
      if (this.platform !== 'win32') throw new Error('Автообновление доступно на Windows');
      await this.assertIdle();
      if (path.resolve(this.here) !== path.join(path.resolve(this.directory), 'app')) throw new Error('Запустите установленный пульт через ярлык Windows');
      await this.report(this.info());
      const base = new URL(this.config().platformUrl);
      if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Для обновления нужен HTTPS-адрес платформы');
      const url = new URL('/api/desktop-recorder/release', base);
      url.searchParams.set('id', request.release.id);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.config().token}` }, redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('Не удалось скачать обновление. Повторите установку позже.');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) throw new Error('Пакет обновления слишком большой');
        chunks.push(chunk);
      }
      const bundle = validateBundle(Buffer.concat(chunks), request.release);
      const task = path.join(this.directory, 'updates', request.id);
      const candidate = path.join(task, 'candidate');
      fs.mkdirSync(candidate, { recursive: true });
      for (const [name, content] of Object.entries(bundle.files)) fs.writeFileSync(path.join(candidate, name), name.endsWith('.ps1') ? '\uFEFF' + content : content);
      atomicJson(path.join(candidate, 'release.json'), request.release);
      for (const name of ['runtime.json', 'start.vbs']) if (fs.existsSync(path.join(this.here, name))) fs.copyFileSync(path.join(this.here, name), path.join(candidate, name));
      fs.copyFileSync(process.execPath, path.join(candidate, 'node.exe'));
      const sameLock = fs.readFileSync(path.join(this.here, 'package-lock.json'), 'utf8').replace(/\r\n/g, '\n') === bundle.files['package-lock.json'];
      if (sameLock && fs.existsSync(path.join(this.here, 'node_modules'))) fs.cpSync(path.join(this.here, 'node_modules'), path.join(candidate, 'node_modules'), { recursive: true });
      else {
        const runtime = readJson(path.join(this.here, 'runtime.json'), {});
        const directories = [runtime.node && path.dirname(runtime.node), ...String(process.env.PATH || '').split(path.delimiter)].filter(Boolean);
        const npm = directories.map(dir => path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js')).find(file => fs.existsSync(file));
        if (!npm) throw new Error('Не найден npm для новых зависимостей. Переустановите помощник из архива.');
        await run(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], candidate);
      }
      await run(process.execPath, ['--check', path.join(candidate, 'app.mjs')], candidate);
      await run(process.execPath, ['--input-type=module', '-e', "await import('playwright')"], candidate);
      await this.assertIdle();
      fs.copyFileSync(path.join(this.here, 'update-worker.mjs'), path.join(task, 'worker.mjs'));
      fs.copyFileSync(process.execPath, path.join(task, 'runner.exe'));
      this.setState({ ...this.state, status: 'restarting' });
      await this.report(this.info());
      const child = spawn(path.join(task, 'runner.exe'), [path.join(task, 'worker.mjs'), this.directory, task, String(process.pid)], { detached: true, stdio: 'ignore', windowsHide: true });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
      await this.shutdown();
    } catch (error) {
      this.setState({ ...this.state, status: 'error', error: String(error.message).slice(0, 240) });
      this.busy = false;
      await this.report(this.info()).catch(() => {});
    }
  }
}
