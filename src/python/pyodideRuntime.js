export const PYODIDE_VERSION = '0.29.4';
// A matching runtime on our own origin keeps classroom execution independent
// of the pupil's access to a third-party CDN. Keep a version-matched fallback.
export const PYODIDE_INDEX_URL = new URL(`/vendor/pyodide/${PYODIDE_VERSION}/`, import.meta.url).href;
export const PYODIDE_FALLBACK_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
