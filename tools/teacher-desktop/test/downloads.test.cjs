'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NativeDownloadRequests } = require('../downloads.cjs');
const { imageContextMenu } = require('../image-context-menu.cjs');
const policy = require('../policy.cjs');

function fixture() {
  const calls = [], contents = { id: 1, page: 'https://ivan100.ru/', getURL() { return this.page; }, downloadURL: (...args) => calls.push(args) };
  const requests = new NativeDownloadRequests(c => c === contents && policy.isPlatform(c.page));
  const item = (url, origin = '') => ({ getURL: () => url, getURLChain: () => [url], getInitiatorOrigin: () => origin });
  return { calls, contents, requests, item };
}
test('native downloads require an exact one-use request from the still-open platform page', () => {
  const { calls, contents, requests, item } = fixture(), url = 'https://ivan100.ru/uploads/image.png';
  assert.equal(requests.consume(contents, item(url)), null);
  requests.request(contents, url);
  assert.equal(calls[0][0], url);
  assert.equal(requests.consume(contents, item(url, 'https://rutube.ru')), null);
  assert.equal(requests.consume(contents, item(url + '?other')), null);
  assert.equal(requests.consume(contents, item(url)).url, url);
  assert.equal(requests.consume(contents, item(url)), null);
  requests.request(contents, url); contents.page += '?changed';
  assert.equal(requests.consume(contents, item(url)), null);
  assert.throws(() => requests.request(contents, 'file:///C:/private.png'));
  assert.throws(() => requests.request(contents, 'http://127.0.0.1/private.png'));
});
test('protected files authenticate using headers and preserve the requested filename', async () => {
  const { calls, contents, requests, item } = fixture(), url = 'https://ivan100.ru/uploads/table.xlsx?studentId=fixture';
  let head;
  contents.session = { fetch: async (value, options) => { head = [value, options]; return { ok: true }; } };
  await requests.file(contents, url, 'Агротовары.xlsx', 'FAKE-SESSION');
  assert.equal(head[0], url); assert.equal(head[1].method, 'HEAD'); assert.equal(head[1].redirect, 'error');
  assert.deepEqual(calls[0], [url, { headers: { Authorization: 'Bearer FAKE-SESSION', 'X-Ege-Auth-Token': 'FAKE-SESSION' } }]);
  assert.equal(requests.consume(contents, item(url, 'https://ivan100.ru')).name, 'Агротовары.xlsx');
  assert.ok(!url.includes('FAKE-SESSION'));
  for (const invalid of ['https://other.example/table.xlsx', 'http://127.0.0.1/file', 'https://ivan100.ru/api/settings', 'file:///C:/table.xlsx']) {
    await assert.rejects(requests.file(contents, invalid, 'table.xlsx', 'FAKE'), /недоступен/);
  }
});
test('failed access or navigating during access verification does not start a download', async () => {
  const { calls, contents, requests } = fixture(), url = 'https://ivan100.ru/uploads/table.xlsx';
  contents.session = { fetch: async () => ({ ok: false, status: 401 }) };
  await assert.rejects(requests.file(contents, url, '', ''), /Войдите/);
  assert.equal(calls.length, 0);
  contents.session.fetch = async () => { contents.page += '?next'; return { ok: true }; };
  await requests.file(contents, url, '', ''); assert.equal(calls.length, 0);
});
test('loaded platform images offer copy and download, while embeds cannot request native downloads', () => {
  const { contents } = fixture(), copies = [], saved = [];
  contents.isDestroyed = () => false; contents.copyImageAt = (...coords) => copies.push(coords);
  const params = { mediaType: 'image', hasImageContents: true, x: 8, y: 12, srcURL: 'https://ivan100.ru/uploads/image.png' };
  const menu = imageContextMenu(contents, params, (...args) => saved.push(args));
  assert.deepEqual(menu.map(item => item.label), ['Копировать изображение', 'Скачать изображение']);
  menu[0].click(); menu[1].click(); assert.deepEqual(copies, [[8, 12]]); assert.deepEqual(saved, [[contents, params.srcURL]]);
  assert.equal(imageContextMenu(contents, { ...params, frameURL: 'https://rutube.ru/' }, () => {}).length, 1);
  assert.equal(imageContextMenu(contents, { ...params, hasImageContents: false }, () => {}).length, 0);
  contents.page += '?changed'; menu[1].click(); assert.equal(saved.length, 1);
});
