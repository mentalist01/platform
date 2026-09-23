import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';

const blocked = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(address, prefix);
const globalV6 = new net.BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new net.BlockList();
blockedV6.addSubnet('2001::', 32, 'ipv6'); // Teredo embeds IPv4 addresses.
blockedV6.addSubnet('2002::', 16, 'ipv6'); // 6to4 embeds IPv4 addresses.

export const isPublicAddress = (address) => net.isIP(address) === 4 ? !blocked.check(address)
  : net.isIP(address) === 6 && globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');

export async function resolvePublicCalendarTarget(value, { lookup = dns.lookup, allowLoopback = false } = {}) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Некорректная ссылка календаря.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const records = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(({ address }) => !isPublicAddress(address)
    && !(allowLoopback && ['127.0.0.1', '::1'].includes(address)))) throw new Error('Календарь должен быть доступен по публичному интернет-адресу.');
  return { url, records };
}

// Resolve once and pin the socket to those addresses; validate every redirect.
// Reading is bounded before buffering, including responses without Content-Length.
export async function fetchPublicCalendar(value, { headers = {}, signal, maxBytes, allowLoopback = false }, redirects = 0) {
  const { url, records } = await resolvePublicCalendarTarget(value, { allowLoopback });
  if (signal?.aborted) throw signal.reason || new Error('Запрос отменён');
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      headers, signal,
      lookup: (_hostname, options, callback) => options?.all
        ? callback(null, records) : callback(null, records[0].address, records[0].family),
    }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.destroy();
        if (redirects >= 3) return reject(new Error('Слишком много перенаправлений календаря.'));
        fetchPublicCalendar(new URL(response.headers.location, url).href, { headers, signal, maxBytes, allowLoopback }, redirects + 1).then(resolve, reject);
        return;
      }
      const failSize = () => { response.destroy(); request.destroy(); reject(new Error('Файл Google Calendar слишком большой.')); };
      if (Number(response.headers['content-length']) > maxBytes) return failSize();
      let size = 0; const chunks = [];
      response.on('data', (chunk) => { size += chunk.length; if (size > maxBytes) failSize(); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve({ status, ok: status >= 200 && status < 300,
        headers: new Headers(Object.entries(response.headers).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])),
        text: async () => Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject); request.end();
  });
}
