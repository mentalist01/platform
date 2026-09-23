import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { isPublicAddress, resolvePublicCalendarTarget, fetchPublicCalendar } from './publicCalendarFetch.js';

test('calendar requests reject private IPv4/IPv6, credentials and mixed DNS answers', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.1.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2002:7f00:1::']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  await assert.rejects(resolvePublicCalendarTarget('http://127.0.0.1/calendar'));
  await assert.rejects(resolvePublicCalendarTarget('https://user:pass@example.com/calendar'));
  await assert.rejects(resolvePublicCalendarTarget('https://calendar.example/calendar', { lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }] }));
});

test('calendar fetching enforces streamed size and validates redirect destinations', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://169.254.169.254/' }); res.end(); }
    else if (req.url === '/large') { res.write('a'.repeat(50)); res.end('b'.repeat(50)); }
    else { res.setHeader('etag', 'fixture'); res.end('BEGIN:VCALENDAR'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const options = { maxBytes: 60, allowLoopback: true, signal: AbortSignal.timeout(3000) };
  assert.equal(await (await fetchPublicCalendar(base, options)).text(), 'BEGIN:VCALENDAR');
  await assert.rejects(fetchPublicCalendar(base + '/large', options), /слишком большой/);
  await assert.rejects(fetchPublicCalendar(base + '/redirect', options), /публичному/);
});
