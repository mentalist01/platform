import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import test from 'node:test';
import { createStudentAccessCodeStore, registerStudentAccessCodes } from './studentAccessCodes.js';

const hash = code => createHash('sha256').update(code).digest('hex');
function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'student-code-vault-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return { dataDir, store: createStudentAccessCodeStore({ dataDir }), student: { id: 'pupil', teacherId: 'teacher', codeHash: hash('123456') } };
}

test('verified codes survive restart encrypted and are invalidated by credential changes', t => {
  const { dataDir, store, student } = fixture(t);
  assert.equal(store.get(student), null);
  store.remember(student, '123456');
  assert.equal(createStudentAccessCodeStore({ dataDir }).get(student), '123456');
  const contents = fs.readFileSync(path.join(dataDir, 'student-access-codes.json'), 'utf8');
  assert.equal(contents.includes('123456'), false);
  store.remember(student, '123456');
  assert.equal(fs.readFileSync(path.join(dataDir, 'student-access-codes.json'), 'utf8'), contents, 'A repeated login need not rewrite the vault');
  const changed = { ...student, codeHash: hash('654321') };
  assert.equal(store.get(changed), null, 'Never show the old code after reset');
  store.remember(changed, '654321');
  assert.equal(store.get(changed), '654321');
  assert.equal(store.get(student), null);
});

test('a code record cannot be moved to another pupil and a missing key is never silently replaced', t => {
  const { dataDir, store, student } = fixture(t);
  store.remember(student, '123456');
  const filename = path.join(dataDir, 'student-access-codes.json');
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  data.codes.other = data.codes.pupil;
  fs.writeFileSync(filename, JSON.stringify(data));
  assert.throws(() => store.get({ ...student, id: 'other' }));
  fs.unlinkSync(path.join(dataDir, 'student-access-codes.key'));
  assert.throws(() => store.get(student));
  assert.throws(() => store.remember({ id: 'new', codeHash: hash('654321') }, '654321'));
  assert.equal(fs.existsSync(path.join(dataDir, 'student-access-codes.key')), false);
});

test('only the owner teacher or admin can view or save a current student code', async t => {
  const { dataDir, store, student } = fixture(t);
  const students = [student, { id: 'deleted', teacherId: 'teacher', deletedAt: '2026-11-01', codeHash: hash('222222') }];
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role: req.headers['x-role'], id: req.headers['x-user'] }; next(); });
  registerStudentAccessCodes(app, { students: () => students, store, normalize: value => value.trim(), verify: async (code, stored) => hash(code) === stored });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = (id = 'pupil', role = 'teacher', user = 'teacher', code) => fetch(`http://127.0.0.1:${server.address().port}/api/students/${id}/access-code`, {
    method: code === undefined ? 'GET' : 'PUT', headers: { 'x-role': role, 'x-user': user, 'Content-Type': 'application/json' },
    ...(code === undefined ? {} : { body: JSON.stringify({ code }) }),
  });
  assert.deepEqual(await (await request()).json(), { available: false }, 'Unknown hashes are not reversed or reset');
  assert.equal((await request('pupil', 'student', 'pupil')).status, 403);
  assert.equal((await request('pupil', 'parent', 'parent:pupil', '123456')).status, 403);
  assert.equal((await request('pupil', 'teacher', 'someone-else')).status, 404);
  assert.equal((await request('pupil', 'teacher', 'someone-else', '123456')).status, 404);
  assert.equal((await request('deleted')).status, 404);
  assert.equal((await request('pupil', 'teacher', 'teacher', 'bad-code')).status, 400);
  assert.equal(fs.existsSync(path.join(dataDir, 'student-access-codes.json')), false);
  const saved = await request('pupil', 'teacher', 'teacher', ' 123456 ');
  assert.equal(saved.status, 200); assert.match(saved.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await saved.json(), { available: true, code: '123456' });
  assert.deepEqual(await (await request()).json(), { available: true, code: '123456' });
  assert.deepEqual(await (await request('pupil', 'admin', 'admin')).json(), { available: true, code: '123456' });
  students[0] = { ...student, codeHash: hash('654321') };
  assert.deepEqual(await (await request()).json(), { available: false });
  fs.writeFileSync(path.join(dataDir, 'student-access-codes.json'), 'broken');
  const failure = await request();
  assert.equal(failure.status, 503);
  assert.equal(JSON.stringify(await failure.json()).includes('123456'), false);
});
