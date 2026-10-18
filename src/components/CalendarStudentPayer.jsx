import { Wallet } from 'lucide-react';
import { normalizePaymentSenderKey } from '../utils/paymentSenderLinks.js';
import './CalendarStudentPayer.css';

export default function CalendarStudentPayer({ studentId, senders, compact = false }) {
  const names = new Map();
  for (const link of senders.links) {
    if (String(link?.studentId || '').trim() !== String(studentId) || link.missingStudent) continue;
    const name = String(link.senderName || '').trim();
    const key = normalizePaymentSenderKey(name);
    if (key && !names.has(key)) names.set(key, name);
  }
  const values = [...names.values()];
  return <div className={`calendar-student-payer${compact ? ' calendar-student-payer--compact' : ''}`}
    aria-label="Плательщик за ученика" aria-live="polite" aria-busy={senders.status === 'loading'}>
    <Wallet size={compact ? 12 : 16} aria-hidden="true" />
    <div className="calendar-student-payer__text">
      {senders.status === 'loading' ? <span className="calendar-student-payer__hint">Загружаем плательщика…</span>
        : senders.status === 'error' ? <>
          <span className="calendar-student-payer__hint">Не удалось загрузить плательщика.</span>{' '}
          <button type="button" onClick={senders.retry}>Повторить</button>
        </> : values.length ? <><span>{values.length > 1 ? 'Плательщики' : 'Платит'}: </span><strong>{values.join(', ')}</strong></>
          : <span className="calendar-student-payer__hint">Плательщик не указан</span>}
    </div>
  </div>;
}
