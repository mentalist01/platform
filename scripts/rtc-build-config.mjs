export function validateRtcBuildConfig(env) {
  let servers;
  try { servers = JSON.parse(env.VITE_RTC_ICE_SERVERS || '[]'); }
  catch { throw Error('[build] VITE_RTC_ICE_SERVERS must contain a valid JSON array'); }
  if (!Array.isArray(servers)) throw Error('[build] VITE_RTC_ICE_SERVERS must contain a JSON array');
  const turn = servers.filter(server => server && (Array.isArray(server.urls) ? server.urls : [server.urls])
    .some(url => typeof url === 'string' && /^turns?:/i.test(url.trim())));
  if (!turn.length || turn.some(server => !String(server.username || '').trim() || !String(server.credential || '').trim())) {
    throw Error('[build] Production calls require an authenticated TURN configuration. Do not publish a STUN-only client.');
  }
  const policy = String(env.VITE_RTC_ICE_TRANSPORT_POLICY || 'all').trim();
  if (!['all', 'relay'].includes(policy)) throw Error('[build] Invalid RTC ICE transport policy');
  return { servers, policy };
}

export function verifyRtcBuildBundle(source, env) {
  const { servers, policy } = validateRtcBuildConfig(env);
  for (const server of servers) for (const url of Array.isArray(server.urls) ? server.urls : [server.urls]) {
    if (typeof url === 'string' && /^turns?:/i.test(url) && !source.includes(url)) {
      throw Error('[build] The call bundle lost its configured TURN endpoint');
    }
  }
  if (policy === 'relay' && !source.includes('VITE_RTC_ICE_TRANSPORT_POLICY:"relay"')) {
    throw Error('[build] The call bundle lost mandatory TURN relay');
  }
}
