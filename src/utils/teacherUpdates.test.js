import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { availableTeacherUpdates, compareDesktopVersions, readTeacherUpdates, acknowledgeTeacherUpdates, unreadTeacherUpdates, teacherUpdatesStorageKey } from './teacherUpdates.js';
import { validateTeacherUpdateCatalog, validateTeacherUpdateHistory } from '../../scripts/check-teacher-update-notes.mjs';
const releasedCatalog = JSON.parse(fs.readFileSync(new URL('../data/teacherUpdates.json', import.meta.url)));
const catalog = {
  cabinet: [{ id: 'cabinet-initial', date: '2026-10-05', title: 'Cabinet fixture', changes: ['Initial cabinet change'] }],
  desktop: ['0.1.8', '0.1.7'].map(version => ({ id: `desktop-${version}`, version, date: '2026-10-05', title: `Desktop ${version}`, changes: [`Change in ${version}`] })),
};
const actor = { role: 'teacher', teacherId: 'fixture-teacher', desktop: { isDesktop: true, version: '0.1.8' } };
const store = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; };

test('only authenticated teachers inside the desktop application receive changes', () => {
  assert.equal(availableTeacherUpdates(catalog, actor).length, 3);
  for (const role of ['student', 'admin', 'parent', undefined]) assert.deepEqual(availableTeacherUpdates(catalog, { ...actor, role }), []);
  for (const desktop of [undefined, {}, { isDesktop: false }, { version: '0.1.8' }]) assert.deepEqual(availableTeacherUpdates(catalog, { ...actor, desktop }), []);
  assert.deepEqual(availableTeacherUpdates(catalog, { ...actor, teacherId: '' }), []);
});
test('a downloaded or future native version is not announced before installation', () => {
  const extended = { ...catalog, desktop: [{ id: 'desktop-0.1.9', version: '0.1.9' }, ...catalog.desktop] };
  assert.deepEqual(availableTeacherUpdates(extended, { ...actor, desktop: { isDesktop: true, version: '0.1.7' } }).map(release => release.id), [catalog.cabinet[0].id, 'desktop-0.1.7']);
  assert.ok(!availableTeacherUpdates(extended, actor).some(release => release.id === 'desktop-0.1.9'));
  assert.deepEqual(availableTeacherUpdates(catalog, { ...actor, desktop: { isDesktop: true, version: 'unknown' } }).map(release => release.id), [catalog.cabinet[0].id]);
});
test('version comparisons use numeric components', () => {
  assert.equal(compareDesktopVersions('0.1.10', '0.1.8'), 1);
  assert.equal(compareDesktopVersions('0.1.8', '0.1.8'), 0);
  assert.equal(compareDesktopVersions('0.1.8', '0.2.0'), -1);
  for (const value of ['', '0.1', '0.1.8-beta', null]) assert.equal(compareDesktopVersions(value, '0.1.8'), null);
});
test('closing remembers exactly the releases displayed, including across reloads', () => {
  const storage = store(), id = 'ack-fixture';
  const releases = availableTeacherUpdates(catalog, actor);
  acknowledgeTeacherUpdates(id, releases.slice(0, 1), storage);
  assert.deepEqual(unreadTeacherUpdates(releases, readTeacherUpdates(id, storage)), releases.slice(1));
  acknowledgeTeacherUpdates(id, releases.slice(1), storage);
  assert.deepEqual(unreadTeacherUpdates(releases, JSON.parse(storage.getItem(teacherUpdatesStorageKey(id)))), []);
});
test('missed releases accumulate without losing new cabinet updates on the same app version', () => {
  const releases = availableTeacherUpdates(catalog, actor);
  const newer = { id: 'cabinet-next', changes: ['New cabinet feature'] };
  assert.deepEqual(unreadTeacherUpdates([newer, ...releases], [releases[1].id]), [newer, releases[0], releases[2]]);
  assert.deepEqual(unreadTeacherUpdates([newer, ...releases], releases.map(release => release.id)), [newer]);
});
test('read state is separate for each teacher on a device', () => {
  const storage = store(), releases = availableTeacherUpdates(catalog, actor);
  acknowledgeTeacherUpdates('teacher-a', releases, storage);
  assert.deepEqual(unreadTeacherUpdates(releases, readTeacherUpdates('teacher-a', storage)), []);
  assert.deepEqual(unreadTeacherUpdates(releases, readTeacherUpdates('teacher-b', storage)), releases);
});
test('broken or unavailable storage never blocks the cabinet', () => {
  assert.deepEqual(readTeacherUpdates('broken-json', { getItem: () => '{' }), []);
  assert.deepEqual(readTeacherUpdates('broken-shape', { getItem: () => '{"secret":"unrelated"}' }), []);
  assert.deepEqual(readTeacherUpdates('broken-items', { getItem: () => '[null,{},1,"cabinet-ok"]' }), ['cabinet-ok']);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const releases = availableTeacherUpdates(catalog, actor);
  acknowledgeTeacherUpdates('blocked-device', releases, blocked);
  assert.deepEqual(unreadTeacherUpdates(releases, readTeacherUpdates('blocked-device', blocked)), []);
});
test('the release catalog includes this desktop version and non-empty unique changes', () => {
  const version = JSON.parse(fs.readFileSync(new URL('../../tools/teacher-desktop/package.json', import.meta.url))).version;
  validateTeacherUpdateCatalog(releasedCatalog, version);
  validateTeacherUpdateCatalog(catalog, actor.desktop.version);
  assert.throws(() => validateTeacherUpdateCatalog({ ...catalog, cabinet: [] }, actor.desktop.version));
  assert.throws(() => validateTeacherUpdateCatalog({ ...catalog, cabinet: [{ ...catalog.cabinet[0], changes: [] }] }, actor.desktop.version));
  assert.throws(() => validateTeacherUpdateCatalog({ ...catalog, cabinet: [catalog.cabinet[0], catalog.cabinet[0]] }, actor.desktop.version));
  assert.throws(() => validateTeacherUpdateCatalog(catalog, '99.0.0'));
});
test('each release has a new id and preserves already published lists', () => {
  const next = { ...catalog, cabinet: [{ id: 'cabinet-next', changes: ['New feature'] }, ...catalog.cabinet] };
  validateTeacherUpdateHistory(next, catalog);
  assert.throws(() => validateTeacherUpdateHistory(catalog, catalog));
  assert.throws(() => validateTeacherUpdateHistory({ ...next, desktop: [] }, catalog));
  assert.throws(() => validateTeacherUpdateHistory({ ...next, cabinet: [next.cabinet[0], { ...catalog.cabinet[0], changes: ['Rewritten history'] }] }, catalog));
});
