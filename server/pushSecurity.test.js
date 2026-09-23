import test from 'node:test';
import assert from 'node:assert/strict';
import { isBrowserPushEndpoint, browserPushTransport } from './pushSecurity.js';

test('push endpoints accept browser vendors and reject arbitrary URLs and misleading suffixes', () => {
  for (const url of ['https://fcm.googleapis.com/fcm/send/example', 'https://updates.push.services.mozilla.com/wpush/v2/example', 'https://web.push.apple.com/example', 'https://wns2.notify.windows.com/example']) assert.equal(isBrowserPushEndpoint(url), true);
  for (const url of ['http://fcm.googleapis.com/test', 'https://user:pass@fcm.googleapis.com/test', 'https://127.0.0.1/', 'https://fcm.googleapis.com.evil.example/', 'https://evil.example/', 'https://fcm.googleapis.com:5175/']) assert.equal(isBrowserPushEndpoint(url), false);
});

test('push transport blocks private DNS results and pins approved addresses', async () => {
  await assert.rejects(browserPushTransport('https://fcm.googleapis.com/example', { lookup: async () => [{ address: '127.0.0.1', family: 4 }] }));
  const transport = await browserPushTransport('https://fcm.googleapis.com/example', { lookup: async () => [{ address: '8.8.8.8', family: 4 }] });
  assert.equal(transport.timeout, 10000);
  transport.agent.options.lookup('fcm.googleapis.com', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
  transport.agent.destroy();
});
