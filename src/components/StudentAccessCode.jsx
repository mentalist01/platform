import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, X } from 'lucide-react';
import { preparedRequest } from '../services/preparedLessonTasks.js';
import { copyParentMessage } from '../utils/studentParentContact.js';
import './StudentAccessCode.css';

export default function StudentAccessCode({ student }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false), [known, setKnown] = useState('');
  const [error, setError] = useState(''), [copied, setCopied] = useState(false);
  const endpoint = `/api/students/${encodeURIComponent(student.id)}/access-code`;
  const load = async copying => {
    if (busy) return;
    setBusy(true); setError(''); setCopied(false);
    try {
      const result = await preparedRequest(endpoint);
      setMissing(!result.available);
      if (result.available) {
        if (copying) { await copyParentMessage(result.code); setCopied(true); }
        else setCode(result.code);
      } else setCode('');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const save = async event => {
    event.preventDefault();
    if (busy || !known.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await preparedRequest(endpoint, { code: known }, 'PUT');
      setCode(result.code); setKnown(''); setMissing(false);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <div className="student-access-code">
    <div className="student-access-code__row">
      <span><KeyRound size={12} />Код: <code>{code || (student.codeHint ? `••••${student.codeHint}` : 'скрыт')}</code></span>
      <button type="button" disabled={busy} onClick={() => code ? (setCode(''), setCopied(false)) : void load(false)}>
        {code ? <EyeOff size={13} /> : <Eye size={13} />}{code ? 'Скрыть' : busy ? 'Загружаем…' : 'Показать'}
      </button>
      <button type="button" disabled={busy} onClick={() => void load(true)}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Скопирован' : 'Копировать'}</button>
    </div>
    {missing && <div className="student-access-code__missing">
      <button type="button" className="student-access-code__close" aria-label="Закрыть подсказку о коде" onClick={() => setMissing(false)}><X size={14} /></button>
      <p>Старый код пока не сохранён для просмотра. Он появится после следующего входа ученика. Если знаете код, сохраните его здесь.</p>
      <form onSubmit={save}><input aria-label={'Известный код: ' + student.name} value={known} onChange={event => setKnown(event.target.value)} maxLength={128} autoComplete="off" placeholder="Код ученика" disabled={busy} />
        <button type="submit" disabled={busy || !known.trim()}>Сохранить код</button></form>
      <small>Проверим код. Доступ ученика не изменится.</small>
    </div>}
    {error && <p className="student-access-code__error" role="alert">{error}</p>}
    {copied && <span className="sr-only" role="status">Код ученика скопирован</span>}
  </div>;
}
