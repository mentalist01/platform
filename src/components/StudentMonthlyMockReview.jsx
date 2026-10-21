import { useEffect, useId, useState } from 'react';
import { LockKeyhole, PlayCircle } from 'lucide-react';
import { getMonthlyMockReview } from '../services/monthlyMockReview';
import { getRutubeEmbedUrl, getRutubeWatchUrl } from '../utils/learningGroups';
import RutubeViewingHelp from './RutubeViewingHelp';
import './MonthlyMockReview.css';

export default function StudentMonthlyMockReview({ examId, month, title, initialReview, refreshKey }) {
  const [loaded, setLoaded] = useState(null);
  const [expandedKey, setExpandedKey] = useState('');
  const lockedHintId=useId();
  const key = `${examId}:${month}`;
  const loadKey = `${key}:${refreshKey ?? ''}`;
  const review = initialReview !== undefined ? initialReview : loaded?.key === loadKey ? loaded.value : null;
  useEffect(() => {
    if (initialReview !== undefined || !examId || !month) return undefined;
    let disposed = false;
    getMonthlyMockReview(examId, month).then(value => { if (!disposed) setLoaded({ key:loadKey, value }); }).catch(() => {});
    return () => { disposed = true; };
  }, [loadKey, initialReview, examId, month]);
  if (!review?.hasReviewVideo) return null;
  const url = review.reviewVideoUrl;
  const expanded = Boolean(url) && expandedKey === `${key}:${url}`;
  return <div className="student-monthly-mock__review">
    <div className="student-monthly-mock__review-heading">{url ? <PlayCircle size={20} /> : <LockKeyhole size={20} />}Видеоразбор пробника</div>
    {url ? <>
      <button type="button" aria-expanded={expanded} onClick={() => setExpandedKey(expanded ? '' : `${key}:${url}`)}>{expanded ? 'Скрыть видеоразбор' : 'Смотреть видеоразбор'}</button>
      {expanded && <><iframe src={getRutubeEmbedUrl(url)} title={`Видеоразбор · ${title}`} allow="clipboard-write; autoplay" allowFullScreen loading="lazy" /><a href={getRutubeWatchUrl(url)} target="_blank" rel="noreferrer">Открыть на Rutube</a><RutubeViewingHelp /></>}
    </> : <>
      <span className="monthly-review-locked" tabIndex={0} role="button" aria-disabled="true" aria-label="Видеоразбор пока закрыт" aria-describedby={lockedHintId}>
        <button type="button" disabled tabIndex={-1}><LockKeyhole size={16} aria-hidden="true"/>Смотреть видеоразбор</button>
        <span id={lockedHintId} role="tooltip" className="monthly-review-locked__hint">Видеоразбор откроется после завершения всех попыток пробника или сразу после результата 100 баллов.</span>
      </span>
      <p>Разбор уже записан. Он откроется после завершения всех попыток. При результате 100 баллов разбор откроется сразу — остальные попытки проходить не нужно.</p>
    </>}
  </div>;
}
