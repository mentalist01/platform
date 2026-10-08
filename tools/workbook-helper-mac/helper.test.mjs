import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { parseLaunch, safeFileName, solutionName, validateGrant } from './protocol.mjs';
import { hash, ApiError, WorkbookApi } from './api.mjs';
import { WorkbookSession, stableSnapshot } from './session.mjs';
import { WorkbookController } from './controller.mjs';
import { workbookHelperMacPackage, MAC_PACKAGE_NAME, NODE_RUNTIME, crc32 } from './package.mjs';
import { processMayBeAlive } from './ipc.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const launch = (origin = 'https://ivan100.ru', ticket = 'abcdefghijklmnop') => `ivan-ege://workbook/open?origin=${encodeURIComponent(origin)}&ticket=${ticket}`;
const grant = (origin = 'https://ivan100.ru') => ({ origin, token: 'scoped-token-abcdefghijklmnop', workbookKey: 'workbook-student-a-task9', fileName: '9.xls', revision: '0', contentHash: hash(Buffer.from('initial workbook')), expiresAt: new Date(Date.now() + 3600000).toISOString(), requiresName: true });
const until = async (condition, timeout = 3000) => { const limit = Date.now() + timeout; while (!condition()) { if (Date.now() > limit) throw new Error('Condition timed out'); await delay(10); } };
async function directory(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ivan100-mac-test-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
async function fakePlatform(t, options = {}) {
  const received = []; let uploads = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk); const bytes = Buffer.concat(chunks);
    received.push({ route: req.url, headers: req.headers, body: bytes.toString('utf8') });
    if (req.url.endsWith('/exchange')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...grant(), ...(options.sourceText ? { sourceText: { fileName: '26.txt', contentHash: hash(Buffer.from('text source')), sizeBytes: 11 } } : {}) })); return; }
    assert.equal(req.headers.authorization, `Workbook ${grant().token}`); assert.equal(req.headers['x-workbook-key'], grant().workbookKey);
    if (req.method === 'GET') { const content = req.url.endsWith('source-text') ? Buffer.from(options.wrongSource ? 'bad' : 'text source') : Buffer.from('initial workbook');
      res.setHeader(req.url.endsWith('source-text') ? 'X-Source-Text-Content-Hash' : 'X-Workbook-Content-Hash', req.url.endsWith('source-text') ? hash(Buffer.from('text source')) : hash(content)); res.setHeader('X-Workbook-Revision', '4'); res.end(content); return; }
    uploads++;
    if (options.putStatus && (options.alwaysFail || uploads === 1)) { res.statusCode = options.putStatus; res.end(); return; }
    const revision = bytes.toString().match(/name="revision"\r\n\r\n([^\r]+)/)?.[1];
    assert.equal(req.headers['x-workbook-revision'], revision);
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ revision: String(Number(revision) + 1), contentHash: req.headers['x-content-sha256'], solutionName: 'Моё решение.xls' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { origin: `http://127.0.0.1:${server.address().port}`, received, uploads: () => uploads };
}

test('launch accepts only the approved production origin and explicit test loopback', () => {
  assert.deepEqual(parseLaunch(launch()), { origin: 'https://ivan100.ru', ticket: 'abcdefghijklmnop' });
  for (const origin of ['http://ivan100.ru', 'https://ivan100.ru.evil.test', 'https://ivan100.ru:444', 'https://user:pass@ivan100.ru', 'https://ivan100.ru/path', 'https://ivan100.ru/?x=1', 'https://ivan100.ru/#x', 'http://127.0.0.1:1234']) assert.throws(() => parseLaunch(launch(origin)));
  assert.equal(parseLaunch(launch('http://127.0.0.1:1234'), { allowLoopback: true }).origin, 'http://127.0.0.1:1234');
  assert.throws(() => parseLaunch(launch() + '&TICKET=abcdefghijklmnop')); assert.throws(() => parseLaunch(launch().replace('/open?', '/delete?'))); assert.throws(() => parseLaunch(launch().replace('abcdefghijklmnop', 'short')));
});
test('daemon ownership retains live or uncertain PIDs and permits replacement only after ESRCH', () => {
  let checked;
  assert.equal(processMayBeAlive(123, (pid, signal) => { checked = [pid, signal]; }), true); assert.deepEqual(checked, [123, 0]);
  assert.equal(processMayBeAlive(123, () => { const error = new Error('dead'); error.code = 'ESRCH'; throw error; }), false);
  for (const code of ['EPERM', 'EACCES', 'EIO']) assert.equal(processMayBeAlive(123, () => { const error = new Error('unknown'); error.code = code; throw error; }), true);
  for (const pid of [-1, 0, NaN, '123', undefined]) assert.equal(processMayBeAlive(pid, () => { throw new Error('invalid PID must not be probed'); }), true);
});
test('file and explicit solution name validation rejects executable/hidden/path names', () => {
  assert.equal(safeFileName('../Папка/9.XLS'), '9.xls'); assert.equal(solutionName('  Решение   9.xls '), 'Решение 9');
  for (const file of ['9.exe', '.hidden.xls', '9.xls.zip', '']) assert.throws(() => safeFileName(file));
  for (const name of ['../escape', 'CON', 'foo.', '', 'a'.repeat(101)]) assert.throws(() => solutionName(name));
  assert.throws(() => validateGrant('https://ivan100.ru', { ...grant(), revision: 'NaN' }));
  assert.throws(() => validateGrant('https://ivan100.ru', { ...grant(), sourceText: { fileName: '26.exe', contentHash: grant().contentHash, sizeBytes: 11 } }));
});
test('ZIP contains executable installer, pinned runtime SHA, genuine AppleEvent app and verified payload', async () => {
  assert.equal(MAC_PACKAGE_NAME, 'IVAN100-WorkbookHelper-Mac-0.1.0.zip');
  const zip = workbookHelperMacPackage(); assert.deepEqual(zip, workbookHelperMacPackage()); const files = new Map(); let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const length = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26); const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const bytes = zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + length); assert.equal(crc32(bytes), zip.readUInt32LE(offset + 14)); assert.equal(zip.readUInt16LE(offset + 6), 0x800); files.set(name, bytes); offset += 30 + nameLength + length;
  }
  let executable = false;
  while (zip.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = zip.readUInt16LE(offset + 28); const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name === 'Установить.command') { assert.equal(zip.readUInt16LE(offset + 4) >> 8, 3); executable = ((zip.readUInt32LE(offset + 38) >>> 16) & 0o111) === 0o111; }
    offset += 46 + nameLength;
  }
  assert.equal(executable, true);
  for (const line of files.get('payload/SHA256SUMS').toString().trim().split('\n')) { const [sha, name] = line.split('  '); assert.equal(hash(files.get('payload/' + name)), sha); }
  const installer = files.get('Установить.command').toString(); assert.ok(installer.startsWith('#!/bin/bash\n')); assert.ok(!installer.includes('\r'));
  for (const bytes of files.values()) { assert.ok(!bytes.toString().startsWith('\uFEFF')); assert.ok(!bytes.includes(13)); }
  assert.ok(installer.includes(NODE_RUNTIME.version)); assert.ok(installer.includes(NODE_RUNTIME.arm64)); assert.ok(installer.includes(NODE_RUNTIME.x64));
  assert.match(installer, /ACTUAL_SHA.*shasum/s); assert.match(installer, /osacompile/); assert.match(installer, /codesign --force --sign -/); assert.match(installer, /CFBundleURLSchemes:0 string ivan-ege/);
  assert.doesNotMatch(installer, /xattr.*(-d|-c)|spctl.*--master-disable|curl.*\s-k\s/);
  assert.match(files.get('payload/helper.applescript').toString(), /on open location theURL/); assert.match(files.get('payload/mac.mjs').toString(), /com.apple.quarantine/);
});
test('API refuses redirects and verifies download hashes before opening', async () => {
  const api = new WorkbookApi('https://ivan100.ru', { fetchImpl: async (_url, options) => { assert.equal(options.redirect, 'manual'); return new Response('', { status: 302, headers: { Location: 'https://evil.test' } }); } });
  await assert.rejects(api.exchange('abcdefghijklmnop'), error => error.status === 403);
  const bad = new WorkbookApi('https://ivan100.ru', { fetchImpl: async () => new Response('wrong bytes', { headers: { 'X-Workbook-Content-Hash': grant().contentHash } }) });
  await assert.rejects(bad.download(grant()), error => error.status === 422);
});
test('download, atomic Cmd+S and first explicit name upload use scoped token, hash and GET revision', async t => {
  const platform = await fakePlatform(t); const directoryPath = await directory(t); const actions = [];
  const controller = new WorkbookController({ directory: directoryPath, allowLoopback: true,
    adapter: { quarantine: async file => actions.push(['quarantine', file]), openWorkbook: async file => actions.push(['open', file]), requestName: async () => 'Моё решение', notify: async () => {}, reveal: async () => {}, message: async () => {} },
    sessionOptions: { debounce: 5, snapshotDelay: 5, poll: 40 } }); t.after(() => controller.close());
  const session = await controller.launch(launch(platform.origin)); assert.equal(session.revision, '4'); assert.deepEqual(actions.map(item => item[0]), ['quarantine', 'open']);
  await delay(80); assert.equal(platform.uploads(), 0);
  const pending = path.join(path.dirname(session.file), '.temporary'); await fs.writeFile(pending, 'edited workbook'); await fs.rename(pending, session.file);
  await until(() => session.revision === '5'); assert.equal(platform.uploads(), 1);
  const put = platform.received.find(entry => entry.headers['x-content-sha256']); assert.match(put.body, /name="solutionName"\r\n\r\nМоё решение/); assert.match(put.body, /filename="9.xls"/); assert.equal(put.headers['x-content-sha256'], hash(Buffer.from('edited workbook')));
  await delay(100); assert.equal(platform.uploads(), 1); assert.equal(session.grant.solutionName, 'Моё решение.xls');
});
test('quarantine failure preserves local copy and reveals it without opening', async t => {
  const platform = await fakePlatform(t); const dir = await directory(t); const actions = [];
  const controller = new WorkbookController({ directory: dir, allowLoopback: true, adapter: {
    quarantine: async () => { throw new Error('xattr failed'); }, reveal: async file => actions.push(['reveal', file]), message: async message => actions.push(['message', message]), openWorkbook: async () => actions.push(['open']), requestName: async () => 'solution' } });
  t.after(() => controller.close()); const session = await controller.launch(launch(platform.origin)); assert.deepEqual(actions.map(item => item[0]), ['reveal', 'message']); assert.equal((await fs.readFile(session.file)).toString(), 'initial workbook');
});
test('source-text integrity failure prevents both workbook and text opening', async t => {
  const platform = await fakePlatform(t, { sourceText: true, wrongSource: true }); let opened = false;
  const controller = new WorkbookController({ directory: await directory(t), allowLoopback: true, adapter: { quarantine: async () => {}, openWorkbook: async () => { opened = true; }, openText: async () => { opened = true; } } }); t.after(() => controller.close());
  await assert.rejects(controller.launch(launch(platform.origin)), error => error.status === 422); assert.equal(opened, false);
});
test('autosave retries one transient upload with identical payload, then stops on revision conflict', async t => {
  const platform = await fakePlatform(t, { putStatus: 503 }); const dir = await directory(t); const api = new WorkbookApi(platform.origin); const g = await api.exchange('abcdefghijklmnop'); const file = path.join(dir, g.fileName); await fs.writeFile(file, 'edited');
  const session = new WorkbookSession({ api, grant: g, file, initialHash: g.contentHash, requestName: async () => 'Retry', snapshotDelay: 1, debounce: 500, poll: 10000, retryDelays: [1] }); t.after(() => session.close());
  await session.synchronize(); assert.equal(platform.uploads(), 2); const puts = platform.received.filter(entry => entry.headers['x-content-sha256']); assert.equal(puts[0].headers['x-content-sha256'], puts[1].headers['x-content-sha256']); assert.equal(puts[0].headers['x-workbook-revision'], puts[1].headers['x-workbook-revision']);
  session.api = { upload: async () => { throw new ApiError('На платформе уже есть новая версия.', 409); } }; await fs.writeFile(file, 'new changes'); await session.synchronize(); assert.equal(session.closed, true); assert.equal((await fs.readFile(file)).toString(), 'new changes');
});
test('cancelled name prompt is suppressed until content changes or explicit retry', async t => {
  const dir = await directory(t); const g = grant(); const file = path.join(dir, g.fileName); await fs.writeFile(file, 'changed'); let prompts = 0, uploads = 0;
  const session = new WorkbookSession({ api: { upload: async () => { uploads++; } }, grant: g, file, initialHash: g.contentHash, requestName: async () => { prompts++; return null; }, snapshotDelay: 1, poll: 10000, debounce: 1000 }); t.after(() => session.close());
  await session.synchronize(); await session.synchronize(); assert.equal(prompts, 1); assert.equal(uploads, 0);
  await fs.writeFile(file, 'changed again'); await session.synchronize(); assert.equal(prompts, 2); session.retry(); await session.synchronize(); assert.equal(prompts, 3);
});
test('Save As stays inside separate work folder and retains original upload identity', async t => {
  const dir = await directory(t); const g = grant(); const file = path.join(dir, g.fileName); await fs.writeFile(file, 'initial workbook'); let fileName;
  const session = new WorkbookSession({ api: { upload: async (receivedGrant, snapshot) => { fileName = receivedGrant.fileName; return { revision: '1', contentHash: snapshot.contentHash }; } }, grant: g, file, initialHash: g.contentHash, requestName: async () => 'Copy', snapshotDelay: 1, poll: 10000, debounce: 500 }); t.after(() => session.close());
  const copy = path.join(dir, 'Моё.xls'); await fs.writeFile(copy, 'save as'); await session.scanCandidates(); assert.equal(session.file, copy); await session.synchronize(); assert.equal(fileName, '9.xls');
  await session.adoptCandidate('9.xls'); assert.equal(session.file, copy); await session.adoptCandidate('../outside.xls'); assert.equal(session.file, copy);
});
test('stable snapshots enforce 64 MiB before allocation and read final bytes', async t => {
  const dir = await directory(t), file = path.join(dir, '9.xls'); const handle = await fs.open(file, 'w'); await handle.truncate(64 * 1024 * 1024 + 1); await handle.close();
  await assert.rejects(stableSnapshot(file, { delay: 1 }), error => error.status === 413); await fs.writeFile(file, 'stable'); assert.equal((await stableSnapshot(file, { delay: 1 })).contentHash, hash(Buffer.from('stable')));
});
