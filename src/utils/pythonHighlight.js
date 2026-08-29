import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';

export const highlightPython = (code) => (
  Prism.highlight(String(code || ''), Prism.languages.python, 'python')
);

export const highlightCode = (code, language = 'python') => {
  const normalizedLanguage = String(language || 'python').trim().toLowerCase() === 'python'
    ? 'python'
    : 'text';
  const grammar = normalizedLanguage === 'python'
    ? Prism.languages.python
    : (Prism.languages.plain || Prism.languages.plaintext || Prism.languages.python);
  return Prism.highlight(String(code || ''), grammar, normalizedLanguage);
};
