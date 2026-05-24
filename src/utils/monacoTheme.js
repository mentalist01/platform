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
      { token: 'comment', foreground: 'A7F3D0', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'D8B4FE', fontStyle: 'bold' },
      { token: 'number', foreground: 'FDBA74' },
      { token: 'string', foreground: 'FEF08A' },
      { token: 'type.identifier', foreground: 'BAE6FD' },
      { token: 'identifier', foreground: 'DCEBFF' },
      { token: 'delimiter', foreground: 'F1F5F9' },
      { token: 'operator', foreground: 'A5B4FC' },
      { token: 'function', foreground: '6EE7B7', fontStyle: 'bold' },
      { token: 'regexp', foreground: 'FBCFE8' },
    ],
    colors: {
      'editor.background': '#061022',
      'editor.foreground': '#edf4ff',
      'editor.lineHighlightBackground': '#12315f66',
      'editorLineNumber.foreground': '#8aa0c6',
      'editorLineNumber.activeForeground': '#ffffff',
      'editorCursor.foreground': '#38bdf8',
      'editor.selectionBackground': '#7c3aed73',
      'editor.inactiveSelectionBackground': '#4755698c',
      'editor.wordHighlightBackground': '#22d3ee38',
      'editor.wordHighlightStrongBackground': '#c084fc42',
      'editorBracketMatch.background': '#22d3ee38',
      'editorBracketMatch.border': '#22d3ee99',
      'editorWhitespace.foreground': '#475569',
      'editorIndentGuide.background1': '#33415599',
      'editorIndentGuide.activeBackground1': '#64748bd9',
      'editorSuggestWidget.background': '#0b152b',
      'editorSuggestWidget.border': '#334155',
      'editorSuggestWidget.foreground': '#edf4ff',
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
