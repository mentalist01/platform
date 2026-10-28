const clean = (value, max) => String(value || '').replace(/[\r\n\t]+/g, ' ').slice(0, max);

// Only startup metadata belongs here, never raw logs, bearer links or cell data.
export function workbookFallbackDiagnostic(input = {}, now = Date.now()) {
  return {
    at: new Date(now).toISOString(),
    version: /^\d+(?:\.\d+){2,3}$/.test(input.version || '') ? input.version : 'unknown',
    engine: ['excel', 'calc', 'auto'].includes(input.engine) ? input.engine : 'unknown',
    code: /^0x[\da-f]{8}$/i.test(input.code || '') ? input.code.toUpperCase() : '',
    stage: clean(input.stage, 100).replace(/(?:[A-Za-z]:\\|https?:\/\/|ticket=|token=).*$/i, '[redacted]'),
    summary: clean(input.summary, 500).replace(/(?:[A-Za-z]:\\|https?:\/\/|ticket=|token=).*$/i, '[redacted]'),
    kind: clean(input.kind, 80).replace(/[^\w.]/g, ''),
  };
}
