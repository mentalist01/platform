import { useMemo } from 'react';
import { AlertCircle, ArrowUpRight } from 'lucide-react';
import { summarizeCollabRunError } from '../utils/collabRunError';
import './CollabEditorFeedback.css';

export default function CollabRunError({ error, onRevealLine }) {
  const summary = useMemo(() => summarizeCollabRunError(error), [error]);
  if (!summary) return null;
  return (
    <section className="collab-run-error" aria-label="Ошибка запуска">
      <div className="collab-run-error__heading">
        <AlertCircle size={17} aria-hidden="true" />
        <strong>{summary.title}</strong>
        {summary.lineNumber && onRevealLine && (
          <button type="button" onClick={() => onRevealLine(summary.lineNumber)} title="Перейти к строке в текущем коде">
            Строка {summary.lineNumber}<ArrowUpRight size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {summary.detail && <p className="collab-run-error__message">{summary.detail}</p>}
      <details className="collab-run-error__details">
        <summary>Полный текст ошибки</summary>
        <pre>{error}</pre>
      </details>
    </section>
  );
}
