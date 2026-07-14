import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';

const writeCodeToClipboard = async (code) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(code);
    return;
  }
  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable');
  const textarea = document.createElement('textarea');
  textarea.value = code;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy failed');
};

const ChatCodeBlock = ({ code, language = 'python' }) => {
  const normalizedCode = String(code || '').replace(/\r\n?/g, '\n').trimEnd();
  const normalizedLanguage = String(language || 'python').trim().toLowerCase() === 'python' ? 'python' : 'text';
  const [copyState, setCopyState] = useState('idle');
  const resetTimerRef = useRef(null);
  const highlightedCode = useMemo(() => {
    if (!normalizedCode) return '';
    const grammar = normalizedLanguage === 'python'
      ? Prism.languages.python
      : (Prism.languages.plain || Prism.languages.plaintext || Prism.languages.python);
    return Prism.highlight(normalizedCode, grammar, normalizedLanguage);
  }, [normalizedCode, normalizedLanguage]);

  useEffect(() => () => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
  }, []);

  if (!normalizedCode) return null;

  const handleCopy = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await writeCodeToClipboard(normalizedCode);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopyState('idle'), 1800);
  };

  const lineCount = normalizedCode.split('\n').length;
  return (
    <section
      className="chat-code-block"
      aria-label={`Код ${normalizedLanguage === 'python' ? 'Python' : ''}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <header className="chat-code-block__header">
        <span className="chat-code-block__language">
          <span className="chat-code-block__language-dot" aria-hidden="true" />
          {normalizedLanguage === 'python' ? 'Python' : 'Код'}
        </span>
        <span className="chat-code-block__meta">{lineCount} {lineCount === 1 ? 'строка' : 'строк'}</span>
        <button
          type="button"
          className={`chat-code-block__copy ${copyState === 'copied' ? 'is-copied' : ''}`}
          onClick={handleCopy}
          aria-label={copyState === 'copied' ? 'Код скопирован' : 'Скопировать код'}
          title={copyState === 'copied' ? 'Скопировано' : 'Скопировать код'}
        >
          {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
          <span>{copyState === 'copied' ? 'Скопировано' : (copyState === 'error' ? 'Не удалось' : 'Копировать')}</span>
        </button>
      </header>
      <pre className="chat-code-block__pre" tabIndex={0}>
        <code
          className={`language-${normalizedLanguage}`}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </section>
  );
};

export default ChatCodeBlock;
