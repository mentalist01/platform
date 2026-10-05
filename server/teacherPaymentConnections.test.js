import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TeacherPaymentConnections } from './teacherPaymentConnections.js';

test('personal keys, pinned legacy migration, rotation, persistence and fail-closed storage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'payment-keys-unit-'));
  const options = { file: path.join(root, 'keys.json'), legacySecret: 'old-key', legacyTeacherId: 'owner', writeJson: (file, data) => fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 }) };
  try {
    const store = new TeacherPaymentConnections(options);
    assert.equal(store.settings('owner').configured, false);
    assert.equal(fs.existsSync(options.file), false, 'GET must not create credentials');
    assert.equal(store.authenticate('old-key').teacherId, 'owner');
    assert.equal(store.authenticate('old-key', 'second').status, 403);
    const owner = store.ensure('owner');
    const second = store.ensure('second');
    assert.notEqual(owner.secret, second.secret);
    assert.equal(store.ensure('owner').secret, owner.secret, 'creation retry is idempotent');
    assert.equal(store.authenticate(second.secret).teacherId, 'second');
    assert.equal(store.authenticate(second.secret, 'owner').status, 403);
    assert.equal(store.authenticate('').status, 401);
    assert.equal(store.authenticate('wrong').status, 401);
    store.record(store.authenticate(second.secret), { status: 'connected', reason: 'phone' });
    assert.equal(store.settings('owner').legacyActive, true, 'another teacher does not disable owner migration');
    const originalContext = store.authenticate(owner.secret);
    const rotated = store.ensure('owner', { rotate: true });
    assert.notEqual(rotated.secret, owner.secret);
    assert.equal(store.authenticate(owner.secret).status, 401);
    store.record(originalContext, { status: 'connected' });
    assert.equal(store.settings('owner').lastRequestAt, '', 'stale in-flight key cannot activate rotated key');
    store.record(store.authenticate(rotated.secret), { status: 'connected', reason: 'phone' });
    const restarted = new TeacherPaymentConnections(options);
    assert.equal(restarted.authenticate('old-key').status, 401);
    assert.equal(restarted.authenticate(rotated.secret).teacherId, 'owner');
    assert.equal(restarted.settings('owner').legacyActive, false);
    assert.ok(restarted.settings('owner').legacyDisabledAt);
    fs.writeFileSync(options.file, '{broken');
    assert.throws(() => restarted.authenticate('old-key'), /настройки/);
    assert.throws(() => restarted.ensure('owner'), /настройки/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a shared key without a pinned recipient fails closed', () => {
  const store = new TeacherPaymentConnections({ file: path.join(os.tmpdir(), `missing-payment-key-${Date.now()}`), writeJson: () => {}, legacySecret: 'old-key' });
  assert.equal(store.authenticate('old-key').status, 401);
});
