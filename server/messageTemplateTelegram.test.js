import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import { createMessageTemplateTelegram } from './messageTemplateTelegram.js';
import { registerMessageTemplates } from './messageTemplates.js';

test('Telegram videos are imported by the verified owner and sent once to a verified student', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-telegram-'));
  const app = express();
  app.use(express.json());
  const botToken = '123456789:example_fixture_token_not_a_real_secret';
  const requests = [];
  let hook;
  const students = () => [{ id: 'pupil', teacherId: 't' }, { id: 'unrelated', teacherId: 'u' }];
  const telegram = createMessageTemplateTelegram({
    dataDir, publicUrl: 'https://example.com', students,
    request: async (token, method, body) => {
      assert.equal(token, botToken);
      requests.push({ method, body });
      if (method === 'getMe') return { id: 123456789, is_bot: true, username: 'example_bot' };
      if (method === 'getWebhookInfo') return { url: hook?.url || '' };
      if (method === 'setWebhook') hook = body;
      return true;
    },
  });
  telegram.registerWebhook(app);
  app.use((req, _res, next) => {
    req.auth = { id: req.get('x-test-id') || 't', role: req.get('x-test-role') || 'teacher' };
    next();
  });
  registerMessageTemplates(app, { dataDir, students, telegram });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { force: true, recursive: true });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const api = '/api/message-templates/telegram';
  async function call(route, method = 'GET', body, headers = {}) {
    const response = await fetch(base + route, {
      method, headers: { 'content-type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, ...(response.headers.get('content-type')?.includes('application/json') ? await response.json() : {}) };
  }
  const status = () => call(api + '?studentId=pupil');
  const update = (id, content, secret = hook.secret_token) => call(new URL(hook.url).pathname, 'POST', {
    message: { from: { id, first_name: 'Fixture', username: 'fixture_' + id }, chat: { id, type: 'private' }, ...content },
  }, { 'X-Telegram-Bot-Api-Secret-Token': secret });
  const createInvite = async target => new URL((await call(api + '/invite', 'POST', { target })).url).searchParams.get('start');
  assert.equal((await call(api, 'PUT', { token: botToken }, { 'x-test-role': 'student' })).status, 403);
  assert.equal((await call(api, 'PUT', { token: botToken })).connected, true);
  assert.equal((await call(api, 'PUT', { token: botToken }, { 'x-test-id': 'u' })).status, 409);
  assert.ok(!fs.readFileSync(path.join(dataDir, 'teacher-message-template-telegram.json'), 'utf8').includes(botToken));
  assert.equal((await call(api + '/invite', 'POST', { target: 'unrelated' })).status, 404);

  const ownerCode = await createInvite('owner');
  assert.equal((await update(10, { text: '/start ' + ownerCode }, 'wrong')).status, 404);
  assert.equal((await status()).ownerCandidate, null);
  await update(10, { text: '/start ' + ownerCode });
  const owner = (await status()).ownerCandidate;
  assert.equal(owner.username, 'fixture_10');
  await update(90, { text: '/start ' + ownerCode });
  assert.equal((await status()).ownerCandidate.revision, owner.revision);
  assert.equal((await call(api + '/recipient', 'PUT', { target: 'owner', revision: owner.revision })).linked, true);
  assert.equal((await call(api + '/import', 'POST', {})).status, 200);
  const video = { file_id: 'telegram-video-id', file_unique_id: 'unique-id', file_name: 'Как войти в урок.mp4' };
  await update(11, { video });
  assert.deepEqual((await status()).videos, []);
  await update(10, { video });
  const [imported] = (await status()).videos;
  assert.equal(imported.name, video.file_name);
  assert.equal(imported.fileId, undefined);
  assert.equal((await status()).lastVideoId, imported.id);
  const template = {
    name: 'Вход в урок', body: 'Вот как подключиться', category: 'other',
    attachAvailability: false, telegramVideoId: imported.id, revision: '',
  };
  const templatePath = '/api/message-templates/instructions';
  assert.equal((await call(templatePath, 'PUT', template, { 'x-test-id': 'u' })).status, 400);
  const saved = (await call(templatePath, 'PUT', template)).template;
  const studentCode = await createInvite('pupil');
  await update(11, { text: '/start ' + studentCode });
  const recipient = (await status()).studentCandidate;
  const send = {
    studentId: 'pupil', recipientRevision: recipient.revision,
    templateId: saved.id, templateRevision: saved.revision, caption: template.body, requestId: randomUUID(),
  };
  assert.equal((await call(api + '/send', 'POST', send)).status, 409);
  assert.equal((await call(api + '/recipient', 'PUT', { target: 'pupil', revision: recipient.revision })).linked, true);
  assert.equal((await call(api + '/send', 'POST', { ...send, studentId: 'unrelated' })).status, 404);
  assert.equal((await call(api + '/send', 'POST', { ...send, caption: 'Привет, {{имя}}' })).status, 400);
  assert.equal((await call(api + '/send', 'POST', send)).sent, true);
  assert.equal((await call(api + '/send', 'POST', send)).sent, true);
  assert.deepEqual(requests.filter(item => item.method === 'sendVideo'), [{
    method: 'sendVideo', body: { chat_id: 11, video: video.file_id, caption: template.body },
  }]);
  assert.equal((await call(api + '/recipient', 'DELETE', { target: 'pupil' })).linked, false);
  assert.equal((await call(api + '/send', 'POST', { ...send, requestId: randomUUID() })).status, 409);
  assert.equal((await call(api, 'DELETE', {})).connected, false);
});
