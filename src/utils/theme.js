export const USER_SESSION_KEY = 'ege_user_session';
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
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(USER_SESSION_KEY);
  } catch {}
};
