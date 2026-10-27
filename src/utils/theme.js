import { clearCallResume } from './callResume.js';
import { clearLessonFallback } from './lessonFallback.js';
import { isStudentViewTab, removeStoredAuthUser } from './authSessionStorage.js';
export { USER_SESSION_KEY } from './authSessionStorage.js';
export const THEME_STORAGE_KEY = 'ege_theme';
export const THEME_LIGHT = 'light';
export const THEME_DARK = 'dark';

export const normalizeTheme = (value) => (
  String(value || '').trim().toLowerCase() === THEME_DARK ? THEME_DARK : THEME_LIGHT
);

export const getPreferredTheme = () => {
  return THEME_LIGHT;
};

export const clearStoredSession = () => {
  clearCallResume();
  if (isStudentViewTab()) { removeStoredAuthUser(); return; }
  if (typeof localStorage === 'undefined') return;
  clearLessonFallback(localStorage);
  try {
    localStorage.removeItem(USER_SESSION_KEY);
  } catch {}
};
