export const PYODIDE_VERSION = '0.29.4';
// A matching runtime on our own origin keeps classroom execution independent
// of the pupil's access to a third-party CDN. Keep a version-matched fallback.
// Resolve the public directory at runtime instead of importing it as an asset.
const moduleUrl = import.meta.url;
export const PYODIDE_INDEX_URL = new URL(`/vendor/pyodide/${PYODIDE_VERSION}/`, moduleUrl).href;
export const PYODIDE_FALLBACK_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
