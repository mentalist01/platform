// Derive the button's destination from the actual saved URL, never its label.
export function contactDestination(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['https:', 'http:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  if (['wa.me', 'whatsapp.com', 'api.whatsapp.com', 'web.whatsapp.com'].includes(host)) {
    return {id: 'whatsapp', name: 'WhatsApp'};
  }
  if (['t.me', 'telegram.me', 'telegram.org', 'web.telegram.org'].includes(host)) {
    return {id: 'telegram', name: 'Telegram'};
  }
  return null;
}
