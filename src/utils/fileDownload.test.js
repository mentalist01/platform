import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadAuthenticatedFile } from './fileDownload.js';

const environment = () => {
  const link = { clicked: false, removed: false, click() { this.clicked = true; }, remove() { this.removed = true; } };
  const blobs = [], timers = [], revoked = [];
  return {
    link, blobs, timers, revoked,
    documentRef: { createElement: () => link, body: { appendChild: () => {} } },
    urlApi: { createObjectURL: blob => { blobs.push(blob); return 'blob:download-fixture'; }, revokeObjectURL: url => revoked.push(url) },
    schedule: (callback, delay) => timers.push({ callback, delay }),
  };
};

test('authenticated downloads preserve exact spreadsheet bytes, student scope, Unicode filename and Safari download lifetime', async () => {
  const fixture = environment(), bytes = new Uint8Array([0x50, 0x4b, 0, 255, 31]);
  const requested = [];
  await downloadAuthenticatedFile({
    url: '/uploads/table.xlsx?studentId=fixture-student', name: 'Задание 9 — решение.xlsx',
    fetchFile: async url => { requested.push(url); return new Response(bytes, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }); },
    ...fixture,
  });
  assert.equal(requested[0], '/uploads/table.xlsx?studentId=fixture-student&download=1');
  assert.deepEqual([...new Uint8Array(await fixture.blobs[0].arrayBuffer())], [...bytes]);
  assert.equal(fixture.link.download, 'Задание 9 — решение.xlsx');
  assert.equal(fixture.link.href, 'blob:download-fixture');
  assert.equal(fixture.link.clicked, true);assert.equal(fixture.link.removed, true);
  assert.deepEqual(fixture.revoked, []);assert.equal(fixture.timers[0].delay, 60_000);
  fixture.timers[0].callback();assert.deepEqual(fixture.revoked, ['blob:download-fixture']);
});

test('a rejected authenticated download never saves an error response as an Excel file', async () => {
  const fixture = environment();
  await assert.rejects(downloadAuthenticatedFile({ url: '/uploads/private.xls', name: '9.xls', fetchFile: async () => new Response('Forbidden', { status: 403 }), ...fixture }), /403/);
  assert.equal(fixture.link.clicked, false);assert.deepEqual(fixture.blobs, []);assert.deepEqual(fixture.timers, []);
});

test('download names retain their extension and remove paths or control characters', async () => {
  const fixture = environment();
  await downloadAuthenticatedFile({ url: '/uploads/source.xls', name: '../\u0000решение.xls', fetchFile: async () => new Response('workbook'), ...fixture });
  assert.equal(fixture.link.download, 'решение.xls');
});
