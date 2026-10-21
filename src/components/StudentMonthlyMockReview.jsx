import { useEffect, useId, useState } from 'react';
import { LockKeyhole, PlayCircle } from 'lucide-react';
import { getMonthlyMockReview, surrenderMonthlyMockReview } from '../services/monthlyMockReview';
import { getRutubeEmbedUrl, getRutubeWatchUrl } from '../utils/learningGroups';
import RutubeViewingHelp from './RutubeViewingHelp';
import './MonthlyMockReview.css';

export default function StudentMonthlyMockReview({ examId, month, title, initialReview, refreshKey, onResolved }) {
  const [loaded, setLoaded] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lockedHintId=useId();
  const key = `${examId}:${month}`;
  const review = loaded?.key === key ? loaded.value : initialReview;
  useEffect(() => {
    setLoaded(null); setExpanded(false); setConfirming(false); setError('');
    if (initialReview !== undefined || !examId || !month) return undefined;
    let disposed = false;
    getMonthlyMockReview(examId, month).then(value => { if (!disposed) setLoaded({ key, value }); }).catch(() => {});
    return () => { disposed = true; };
  }, [key, initialReview, examId, month, refreshKey]);
  if (!review?.hasReviewVideo) return null;
  const url = review.reviewVideoUrl;
  return <div className="student-monthly-mock__review">
    <div className="student-monthly-mock__review-heading">{url ? <PlayCircle size={20} /> : <LockKeyhole size={20} />}Видеоразбор пробника</div>
    {url ? <>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Скрыть видеоразбор' : 'Смотреть видеоразбор'}</button>
      {expanded && <><iframe src={getRutubeEmbedUrl(url)} title={`Видеоразбор · ${title}`} allow="clipboard-write; autoplay" allowFullScreen loading="lazy" /><a href={getRutubeWatchUrl(url)} target="_blank" rel="noreferrer">Открыть на Rutube</a><RutubeViewingHelp /></>}
    </> : <>
      <span className="monthly-review-locked" tabIndex={0} role="button" aria-disabled="true" aria-label="Видеоразбор пока закрыт" aria-describedby={lockedHintId}>
        <button type="button" disabled tabIndex={-1}><LockKeyhole size={16} aria-hidden="true"/>Смотреть видеоразбор</button>
        <span id={lockedHintId} role="tooltip" className="monthly-review-locked__hint">Видеоразбор откроется после завершения всех попыток пробника.</span>
      </span>
      <p>Разбор уже записан. Он откроется, когда вы завершите все попытки. Можно отказаться от оставшихся попыток и посмотреть его сейчас.</p>
      {review.canSurrender && (!confirming ? <button type="button" onClick={() => setConfirming(true)}>Сдаться и посмотреть разбор</button> : <div className="monthly-review-confirm" role="group" aria-label="Подтверждение сдачи пробника">
        <strong>Закрыть оставшиеся попытки?</strong>
        <p>После открытия разбора решать этот пробник больше нельзя. Лучший завершённый результат сохранится. Незавершённая попытка не станет новым результатом.</p>
        <div className="monthly-review-editor__actions">
          <button type="button" disabled={busy} onClick={async () => {
            setBusy(true); setError('');
            try { const value = await surrenderMonthlyMockReview(examId, month); setLoaded({ key, value }); setExpanded(true); setConfirming(false); onResolved?.(); }
            catch (failure) { setError(failure.message); }
            finally { setBusy(false); }
          }}>{busy ? 'Открываем разбор…' : 'Закрыть попытки и открыть разбор'}</button>
          <button type="button" className="monthly-review-cancel" disabled={busy} onClick={() => setConfirming(false)}>Продолжить решать</button>
        </div>
      </div>)}
      {error && <p role="alert" className="monthly-review-editor__error">{error}</p>}
    </>}
  </div>;
}
