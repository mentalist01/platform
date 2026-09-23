import https from 'node:https';
import { resolvePublicCalendarTarget } from './publicCalendarFetch.js';

// Browser push subscriptions must point at a browser vendor, not an arbitrary
// URL supplied by an account. Validate stored subscriptions again before send.
export function isBrowserPushEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    return ['fcm.googleapis.com', 'android.googleapis.com', 'web.push.apple.com', 'push.services.mozilla.com', 'notify.windows.com']
      .some((host) => url.hostname === host || (['push.services.mozilla.com', 'notify.windows.com'].includes(host) && url.hostname.endsWith('.' + host)));
  } catch { return false; }
}

export async function browserPushTransport(endpoint, { lookup } = {}) {
  if (!isBrowserPushEndpoint(endpoint)) throw new Error('Unsupported browser push endpoint');
  const { records } = await resolvePublicCalendarTarget(endpoint, { lookup });
  const agent = new https.Agent({ keepAlive: false, maxSockets: 1,
    lookup: (_hostname, options, callback) => options?.all ? callback(null, records) : callback(null, records[0].address, records[0].family),
  });
  return { agent, timeout: 10000 };
}
