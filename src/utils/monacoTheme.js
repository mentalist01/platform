import { THEME_DARK, normalizeTheme } from './theme';

export const MONACO_THEME_COLORFUL_DARK = 'platform-colorful-dark';
export const MONACO_THEME_COLORFUL_LIGHT = 'platform-colorful-light';

let monacoThemeRegistered = false;

export const ensureMonacoColorTheme = (monaco) => {
  if (!monaco?.editor) return;
  if (monacoThemeRegistered) return;

  monaco.editor.defineTheme(MONACO_THEME_COLORFUL_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '86EFAC', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C084FC' },
      { token: 'number', foreground: 'FB923C' },
      { token: 'string', foreground: 'FDE047' },
      { token: 'type.identifier', foreground: '7DD3FC' },
      { token: 'identifier', foreground: 'BFDBFE' },
      { token: 'delimiter', foreground: 'E2E8F0' },
      { token: 'operator', foreground: '818CF8' },
      { token: 'function', foreground: '34D399' },
      { token: 'regexp', foreground: 'F9A8D4' },
    ],
    colors: {
      'editor.background': '#050d1f',
      'editor.foreground': '#dbe7ff',
      'editor.lineHighlightBackground': '#0f1f42',
      'editorLineNumber.foreground': '#637194',
      'editorLineNumber.activeForeground': '#f8fafc',
      'editorCursor.foreground': '#38bdf8',
      'editor.selectionBackground': '#6366f15a',
      'editor.inactiveSelectionBackground': '#33415580',
      'editor.wordHighlightBackground': '#14b8a633',
      'editor.wordHighlightStrongBackground': '#a78bfa33',
      'editorBracketMatch.background': '#22d3ee2b',
      'editorBracketMatch.border': '#22d3ee99',
      'editorWhitespace.foreground': '#334155',
      'editorIndentGuide.background1': '#1e293b88',
      'editorIndentGuide.activeBackground1': '#475569bb',
      'editorSuggestWidget.background': '#0b152b',
      'editorSuggestWidget.border': '#334155',
      'editorSuggestWidget.foreground': '#dbe7ff',
      'editorSuggestWidget.selectedBackground': '#1f2a44',
    },
  });

  monaco.editor.defineTheme(MONACO_THEME_COLORFUL_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '059669', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7c3aed' },
      { token: 'number', foreground: 'ea580c' },
      { token: 'string', foreground: 'ca8a04' },
      { token: 'type.identifier', foreground: '0284c7' },
      { token: 'identifier', foreground: '1e293b' },
      { token: 'delimiter', foreground: '334155' },
      { token: 'operator', foreground: '4f46e5' },
      { token: 'function', foreground: '0d9488' },
      { token: 'regexp', foreground: 'db2777' },
    ],
    colors: {
      'editor.background': '#f8fbff',
      'editor.foreground': '#0f172a',
      'editor.lineHighlightBackground': '#eaf2ff',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#1e293b',
      'editorCursor.foreground': '#0284c7',
      'editor.selectionBackground': '#93c5fd66',
      'editor.inactiveSelectionBackground': '#cbd5e166',
      'editor.wordHighlightBackground': '#99f6e433',
      'editor.wordHighlightStrongBackground': '#c4b5fd44',
      'editorBracketMatch.background': '#67e8f944',
      'editorBracketMatch.border': '#0891b2aa',
      'editorWhitespace.foreground': '#cbd5e1',
      'editorIndentGuide.background1': '#e2e8f0',
      'editorIndentGuide.activeBackground1': '#94a3b8',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#cbd5e1',
      'editorSuggestWidget.foreground': '#0f172a',
      'editorSuggestWidget.selectedBackground': '#e2e8f0',
    },
  });

  monacoThemeRegistered = true;
};

export const resolveMonacoColorTheme = (theme = '') => {
  const fallbackTheme = typeof document !== 'undefined'
    ? String(document.documentElement?.getAttribute('data-theme') || '')
    : '';
  const normalized = normalizeTheme(String(theme || fallbackTheme));
  return normalized === THEME_DARK ? MONACO_THEME_COLORFUL_DARK : MONACO_THEME_COLORFUL_LIGHT;
};
