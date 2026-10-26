import http from 'node:http';
import crypto from 'node:crypto';
import { CellRoom } from './sync.mjs';

// The prototype relay is strictly loopback. It has independent random scoped
// tokens and cannot read platform authentication, files, or financial data.
export async function createRelay(addresses, actors = ['teacher', 'pupil']) {
  const room = new CellRoom(addresses);
  const tokens = Object.fromEntries(actors.map(actor => [actor, crypto.randomBytes(32).toString('base64url')]));
  const byToken = new Map(Object.entries(tokens).map(([actor, token]) => [`Bearer ${token}`, actor]));
  let transferredBytes = 0, requests = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const actor = byToken.get(req.headers.authorization);
    if (!actor) { res.writeHead(401).end('{}'); return; }
    if (req.method !== 'POST' || req.url !== '/sync' || req.headers.origin) { res.writeHead(404).end('{}'); return; }
    try {
      let body = '';
      for await (const bytes of req) { body += bytes; if (body.length > 128 * 1024) throw Error('Batch too large'); }
      const { operations } = JSON.parse(body);
      const response = JSON.stringify(room.submit(actor, operations));
      requests++; transferredBytes += Buffer.byteLength(body) + Buffer.byteLength(response);
      res.end(response);
    } catch (error) { res.writeHead(400).end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/sync`;
  return {
    room, url,
    exchange: actor => async operations => {
      const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${tokens[actor]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operations }), signal: AbortSignal.timeout(8000) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Relay request failed');
      return result;
    },
    metrics: () => ({ requests, transferredBytes }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
