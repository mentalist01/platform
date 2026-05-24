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
      { token: 'keyword', foreground: 'E879F9', fontStyle: 'bold' },
      { token: 'number', foreground: 'FDBA74', fontStyle: 'bold' },
      { token: 'string', foreground: 'FDE047', fontStyle: 'bold' },
      { token: 'type.identifier', foreground: '7DD3FC', fontStyle: 'bold' },
      { token: 'identifier', foreground: 'F8FAFC', fontStyle: 'bold' },
      { token: 'delimiter', foreground: 'FFFFFF', fontStyle: 'bold' },
      { token: 'operator', foreground: '93C5FD', fontStyle: 'bold' },
      { token: 'function', foreground: '6EE7B7', fontStyle: 'bold' },
      { token: 'regexp', foreground: 'F9A8D4', fontStyle: 'bold' },
    ],
    colors: {
      'editor.background': '#020617',
      'editor.foreground': '#f8fbff',
      'editor.lineHighlightBackground': '#1e3a8a6b',
      'editorLineNumber.foreground': '#a6b4d0',
      'editorLineNumber.activeForeground': '#ffffff',
      'editorCursor.foreground': '#67e8f9',
      'editor.selectionBackground': '#8b5cf68a',
      'editor.inactiveSelectionBackground': '#64748b99',
      'editor.wordHighlightBackground': '#22d3ee4a',
      'editor.wordHighlightStrongBackground': '#e879f94a',
      'editorBracketMatch.background': '#22d3ee4a',
      'editorBracketMatch.border': '#67e8f9cc',
      'editorWhitespace.foreground': '#64748b',
      'editorIndentGuide.background1': '#475569b3',
      'editorIndentGuide.activeBackground1': '#94a3b8e6',
      'editorSuggestWidget.background': '#061022',
      'editorSuggestWidget.border': '#475569',
      'editorSuggestWidget.foreground': '#f8fbff',
      'editorSuggestWidget.selectedBackground': '#24324f',
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
