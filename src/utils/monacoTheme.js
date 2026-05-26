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
      { token: 'keyword', foreground: 'D8B4FE', fontStyle: 'bold' },
      { token: 'number', foreground: 'FDBA74' },
      { token: 'string', foreground: 'FDE68A' },
      { token: 'type.identifier', foreground: '7DD3FC' },
      { token: 'identifier', foreground: 'E2E8F0' },
      { token: 'delimiter', foreground: 'CBD5E1' },
      { token: 'operator', foreground: '93C5FD' },
      { token: 'function', foreground: '6EE7B7', fontStyle: 'bold' },
      { token: 'regexp', foreground: 'F9A8D4' },
    ],
    colors: {
      'editor.background': '#111827',
      'editor.foreground': '#e8eef8',
      'editor.lineHighlightBackground': '#2b3f644d',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#e8eef8',
      'editorCursor.foreground': '#67e8f9',
      'editor.selectionBackground': '#7c3aed66',
      'editor.inactiveSelectionBackground': '#64748b5f',
      'editor.wordHighlightBackground': '#22d3ee33',
      'editor.wordHighlightStrongBackground': '#d8b4fe35',
      'editorBracketMatch.background': '#22d3ee30',
      'editorBracketMatch.border': '#67e8f9a8',
      'editorWhitespace.foreground': '#64748b99',
      'editorIndentGuide.background1': '#52617a80',
      'editorIndentGuide.activeBackground1': '#94a3b8bf',
      'editorSuggestWidget.background': '#1a2538',
      'editorSuggestWidget.border': '#52617a',
      'editorSuggestWidget.foreground': '#e8eef8',
      'editorSuggestWidget.selectedBackground': '#2b3f64',
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
      { token: 'identifier', foreground: '1e3a8a' },
      { token: 'delimiter', foreground: '1e40af' },
      { token: 'operator', foreground: '4f46e5' },
      { token: 'function', foreground: '0d9488' },
      { token: 'regexp', foreground: 'db2777' },
    ],
    colors: {
      'editor.background': '#f8fbff',
      'editor.foreground': '#1e3a8a',
      'editor.lineHighlightBackground': '#eaf2ff',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#1e3a8a',
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
      'editorSuggestWidget.foreground': '#1e3a8a',
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
