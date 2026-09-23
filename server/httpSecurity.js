const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isTrustedBrowserOrigin(req, allowedOrigins = []) {
  const raw = req.headers?.origin;
  if (!raw) return req.headers?.['sec-fetch-site'] !== 'cross-site';
  if (allowedOrigins.includes(raw)) return true;
  try {
    const origin = new URL(raw);
    const protocol = req.protocol || String(req.headers?.['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http'));
    return ['https:', 'http:'].includes(origin.protocol) && origin.origin === raw
      && origin.origin === `${protocol}://${req.headers.host}`;
  } catch { return false; }
}

export const browserRequestGuard = (allowedOrigins) => (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "base-uri 'self'; frame-ancestors 'self'");
  if (!SAFE_METHODS.has(req.method) && !isTrustedBrowserOrigin(req, allowedOrigins)) {
    return res.status(403).json({ error: 'Выполните действие на сайте платформы.' });
  }
  return next();
};

export function secureUploadedResponse(res, storageName) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  if (/\.(?:html?|svgz?|xhtml|xml|mhtml?|shtml|js|mjs)$/i.test(storageName)) res.attachment(storageName);
}
