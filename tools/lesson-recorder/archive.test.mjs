import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { LessonArchive, byteRange, clipRange } from './archive.mjs';
import { searchArchive } from './archive-search.mjs';

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-archive-test-'));
  const recordings = path.join(root, 'recordings'); fs.mkdirSync(recordings);
  const archive = new LessonArchive({ directory: root, recordDirectory: () => recordings, ...options });
  clearInterval(archive.timer);
  t.after(() => { archive.close(); const resolved = fs.realpathSync(root); assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir())); assert.match(path.basename(resolved), /^ivan-archive-test-/); fs.rmSync(resolved, { recursive: true, force: true }); });
  return { archive, root, recordings };
}
test('catalog excludes active lessons, test files and duplicate recorder MKV/MP4; rescan retains progress', async t => {
  const jobs = []; const f = fixture(t, { jobs: () => jobs });
  for (const [id, status, local] of [['a', 'ready', false], ['b', 'recording', false], ['c', 'saved', true]]) {
    const file = path.join(f.recordings, `${id}.mkv`), mp4 = path.join(f.recordings, `${id}.mp4`);
    fs.writeFileSync(file, 'original'); fs.writeFileSync(mp4, 'converted'); jobs.push({ id, title: id, status, local, file, mp4 });
  }
  fs.writeFileSync(path.join(f.recordings, 'old.mp4'), 'old');
  fs.mkdirSync(path.join(f.recordings, 'Теория')); fs.writeFileSync(path.join(f.recordings, 'Теория', 'clip.mp4'), 'clip');
  await f.archive.scan(); assert.equal(f.archive.data.items.length, 2);
  const item = f.archive.data.items.find(i => i.jobId === 'a'); item.processed = 120; item.duration = 900; item.status = 'done'; f.archive.save();
  await f.archive.scan(); assert.equal(item.processed, 120); assert.equal(item.status, 'done');
  fs.appendFileSync(item.file, 'changed'); await f.archive.scan(); assert.equal(item.processed, 0); assert.equal(item.duration, 0); assert.equal(item.status, 'new');
});
test('search finds sound explanations through Russian word forms and returns video timestamps', () => {
  const transcript = [{ start: 61, end: 80, text: 'Частота дискретизации измеряется в герцах. Глубина кодирования звука — количество бит.' }, { start: 92, end: 103, text: 'В формуле учитываем число каналов: стерео это два канала.' }, { start: 800, end: 810, text: 'Вернёмся к таблице.' }];
  const results = searchArchive([{ id: 'a', title: 'Урок', duration: 1000 }], () => transcript, 'задание 7 кодирование звука');
  assert.equal(results.length, 1); assert.equal(results[0].start, 46); assert.equal(results[0].end, 128); assert.equal(results[0].explanation, true);
  assert.deepEqual(results[0].tags, ['Звук']); assert.match(results[0].text, /герцах/);
  assert.equal(searchArchive([{ id: 'a', duration: 1000 }], () => transcript, 'звук', 'Изображения').length, 0);
});
test('search accepts task numbers and spoken Russian ordinals without matching unrelated numeric values', () => {
  const items = [{ id: 'a', duration: 2000 }];
  const transcript = [{ start: 30, end: 35, text: 'У нас 16 задание. Начинаем рекурсию.' }, { start: 900, end: 920, text: 'Двадцать седьмое задание разберём дальше.' }, { start: 1200, end: 1210, text: 'В ответе получится 16.' }];
  for (const query of ['задание 16', 'шестнадцатое задание', '16']) {
    const results = searchArchive(items, () => transcript, query);
    assert.equal(results.length, 1, query); assert.equal(results[0].start, 15, query);
  }
  const results = searchArchive(items, () => transcript, 'задание 27');
  assert.equal(results.length, 1); assert.equal(results[0].start, 885);
});

test('media byte ranges support browser seeking, clamp ends and reject invalid ranges', () => {
  assert.deepEqual(byteRange('bytes=10-19', 100), { start: 10, end: 19, status: 206 });
  assert.deepEqual(byteRange('bytes=-20', 100), { start: 80, end: 99, status: 206 });
  assert.deepEqual(byteRange('bytes=50-999', 100), { start: 50, end: 99, status: 206 });
  for (const r of ['bytes=100-', 'bytes=10-1', 'bytes=-0', 'bytes=0-10,20-30', 'bytes=-']) assert.equal(byteRange(r, 100), null);
  for (const [a,b] of [[null, 10], [0, NaN], [-1, 1], [10, 10], [0, 2001]]) assert.throws(() => clipRange(a, b, 2000));
});
test('local API requires its key, streams only registered files and reports invalid export instead of accepting it', async t => {
  const f = fixture(t); const source = path.join(f.recordings, 'test.mp4'); fs.writeFileSync(source, '0123456789'); await f.archive.scan();
  const item = f.archive.data.items[0]; item.duration = 60;
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  const body = async req => { let text = ''; for await (const c of req) text += c; return JSON.parse(text); };
  const server = http.createServer(async (req, res) => { try { await f.archive.handle(req, res, { key: 'test-key', json, body }); } catch (e) { json(res, 400, { error: e.message }); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/archive/state')).status, 403);
  const response = await fetch(base + `/archive/media?id=${item.id}&key=test-key`, { headers: { Range: 'bytes=3-6' } });
  assert.equal(response.status, 206); assert.equal(await response.text(), '3456');
  assert.equal((await fetch(base + '/archive/media?id=../../state.json&key=test-key')).status, 400);
  const invalid = await fetch(base + '/archive/export', { method: 'POST', headers: { 'X-Recorder-Key': 'test-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, start: 20, end: 10 }) });
  assert.equal(invalid.status, 400); assert.equal(f.archive.data.clips.length, 0); assert.equal(fs.readFileSync(source, 'utf8'), '0123456789');
});
test('pausing keeps queued work and a lesson blocks transcription before any process starts', async t => {
  const f = fixture(t, { isBusy: () => true }); fs.writeFileSync(path.join(f.recordings, 'lesson.mp4'), 'source'); await f.archive.scan();
  f.archive.enqueue([f.archive.data.items[0].id]); await f.archive.tick(); assert.equal(f.archive.work, null); assert.equal(f.archive.blocked, true);
  f.archive.pause(); assert.equal(f.archive.data.paused, true); assert.equal(f.archive.data.queue.length, 1);
});
test('completed chunks resume with absolute timestamps and a cancelled chunk is not saved twice', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.recordings, 'lesson.mp4'), 'source'); await f.archive.scan();
  const item = f.archive.data.items[0]; item.duration = 610; item.model = 'base';
  f.archive.transcriber = { exe: 'python', args: [] }; let cancelled = false;
  f.archive.command = async (_exe, _args, options = {}) => {
    if (options.onLine) {
      options.onLine({ start: 3, end: 8, text: 'Частота дискретизации звука.' });
      if (cancelled) { f.archive.pause(); throw Error('stopped'); }
      options.onLine({ done: true });
    }
    return '';
  };
  f.archive.data.queue = [item.id]; f.archive.data.paused = false;
  await f.archive.tick(); assert.equal(item.processed, 300); assert.equal(f.archive.transcript(item.id).segments[0].start, 3);
  cancelled = true; await f.archive.tick(); assert.equal(item.processed, 300); assert.equal(f.archive.transcript(item.id).segments.length, 1);
  cancelled = false; f.archive.data.paused = false; await f.archive.tick();
  assert.equal(item.processed, 600); assert.deepEqual(f.archive.transcript(item.id).segments.map(s => s.start), [3,303]);
  await f.archive.tick(); assert.equal(item.status, 'done'); assert.equal(item.processed, 610); assert.deepEqual(f.archive.data.queue, []);
});

test('an unreadable catalog is preserved for recovery without preventing recorder startup', t => {
  const f = fixture(t); f.archive.close();
  const broken = '{"items": [broken JSON'; fs.writeFileSync(f.archive.file, broken);
  const recovered = new LessonArchive({ directory: f.root, recordDirectory: () => f.recordings });
  t.after(() => recovered.close());
  assert.deepEqual(recovered.data.items, []); assert.equal(recovered.data.paused, true);
  assert.equal(recovered.data.warnings.length, 1);
  const backup = fs.readdirSync(recovered.root).find(name => name.startsWith('index.json.unreadable-'));
  assert.equal(fs.readFileSync(path.join(recovered.root, backup), 'utf8'), broken);
});

test('a background catalog write failure pauses the archive instead of rejecting outside its worker', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.recordings, 'lesson.mp4'), 'source'); await f.archive.scan();
  f.archive.data.queue = [f.archive.data.items[0].id]; f.archive.data.paused = false;
  f.archive.save = () => { throw Error('disk full'); };
  await f.archive.runTick();
  assert.equal(f.archive.error, 'disk full'); assert.equal(f.archive.data.paused, true); assert.equal(f.archive.work, null);
  assert.equal(f.archive.child, null); assert.equal(f.archive.data.queue.length, 1);
});

test('one action exports then publishes a named material, waits for Rutube, and retains it across restart', async t => {
  let account = 'teacher1'; let uploads = 0; let checks = 0;
  const url = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Test_Key';
  const options = { prepareMaterial: async () => ({ teacherId: account }), materialPublisher: {
    upload: async clip => { uploads++; clip.url = url; }, ready: async () => ++checks > 1,
    attach: async payload => { assert.equal(payload.title, 'Задание 7: звук / теория'); return { material: { id: 'saved-material' } }; },
  } };
  const f = fixture(t, options); fs.writeFileSync(path.join(f.recordings, 'lesson.mp4'), 'source'); await f.archive.scan();
  const item = f.archive.data.items[0]; item.duration = 90;
  f.archive.command = async (_exe, args) => { fs.writeFileSync(args.at(-1), 'test clip'); return ''; };
  const clip = await f.archive.createMaterial({ id: item.id, start: 5, end: 25, title: 'Задание 7: звук / теория' });
  assert.equal(clip.title, 'Задание 7: звук / теория'); assert.equal(clip.materialStatus, 'queued'); assert.equal(f.archive.data.paused, true);
  await f.archive.tick(); assert.equal(clip.materialStatus, 'processing'); assert.equal(uploads, 1); f.archive.close();
  const restarted = new LessonArchive({ directory: f.root, recordDirectory: () => f.recordings, ...options }); clearInterval(restarted.timer); t.after(() => restarted.close());
  const resumed = restarted.data.clips[0]; resumed.nextPublishAt = 0;
  account = 'teacher2'; await restarted.tick(); assert.equal(resumed.materialStatus, 'error'); assert.equal(uploads, 1);
  account = 'teacher1'; resumed.materialStatus = 'queued'; await restarted.tick();
  assert.equal(resumed.materialStatus, 'done'); assert.equal(resumed.materialId, 'saved-material'); assert.equal(uploads, 1);
  assert.equal(fs.readFileSync(item.file, 'utf8'), 'source');
});

test('unavailable platform rejects material creation before a clip is exported or uploaded', async t => {
  const f = fixture(t, { prepareMaterial: async () => { throw Error('Platform offline'); }, materialPublisher: {} });
  fs.writeFileSync(path.join(f.recordings, 'lesson.mp4'), 'source'); await f.archive.scan();
  const item = f.archive.data.items[0]; item.duration = 100;
  await assert.rejects(f.archive.createMaterial({ id: item.id, start: 1, end: 3, title: 'Theory' }), /offline/);
  assert.equal(f.archive.data.clips.length, 0); assert.equal(f.archive.submitting, false); assert.equal(f.archive.work, null);
});
