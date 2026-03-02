export const MONACO_THEME_COLORFUL_DARK = 'platform-colorful-dark';

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

  monacoThemeRegistered = true;
};
