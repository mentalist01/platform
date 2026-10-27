export const USER_SESSION_KEY = 'ege_user_session';
export const STUDENT_VIEW_SESSION_KEY = 'ege_student_view_session';
export const isStudentViewTab = () => typeof window !== 'undefined'
  && /^\/student-view\/?$/.test(window.location.pathname);

// A missing/expired pupil session must never fall back to the teacher cookie
// or localStorage identity. The path also keeps this boundary across reloads.
export const getAuthSessionStorage = () => {
  try { return isStudentViewTab() ? globalThis.sessionStorage : globalThis.localStorage; }
  catch { return null; }
};
export const getAuthSessionKey = () => isStudentViewTab() ? STUDENT_VIEW_SESSION_KEY : USER_SESSION_KEY;
export function readStoredAuthUser() {
  try { return JSON.parse(getAuthSessionStorage()?.getItem(getAuthSessionKey()) || 'null'); }
  catch { return null; }
}
export function writeStoredAuthUser(user) {
  const storage = getAuthSessionStorage();
  if (!storage) throw new Error('Разрешите хранение данных в этой вкладке, чтобы открыть кабинет.');
  storage.setItem(getAuthSessionKey(), JSON.stringify(user));
}
export function removeStoredAuthUser() {
  try { getAuthSessionStorage()?.removeItem(getAuthSessionKey()); } catch { /* Browser storage may be disabled. */ }
}
export const getStudentViewToken = () => {
  if (!isStudentViewTab()) return '';
  const user = readStoredAuthUser();
  const token = String(user?.authToken || user?.token || '');
  return token.startsWith('sv_') ? token : '';
};

// Embedded pictures/downloads and EventSource cannot send Authorization.
// Never attach this scoped token to external origins (e.g. signed S3 URLs).
export function withStudentViewAuth(value) {
  const token = getStudentViewToken();
  if (!token || !value) return value;
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin || !/^\/(api|uploads)\//.test(url.pathname)) return value;
    url.searchParams.set('_auth', token);
    return url.toString();
  } catch { return value; }
}
