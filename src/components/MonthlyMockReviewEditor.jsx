import { useEffect, useRef, useState } from 'react';
import { PlayCircle, Video } from 'lucide-react';
import { api } from '../services/api';
import { getMonthlyMockReview } from '../services/monthlyMockReview';
import { getMonthlyMockMonth } from '../utils/monthlyMockExam';
import './MonthlyMockReview.css';

export default function MonthlyMockReviewEditor({ exam, onSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState(exam.monthlyReviewVideoUrl || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(onSaved);
  useEffect(() => { savedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { setUrl(exam.monthlyReviewVideoUrl || ''); setSaved(false); }, [exam.id, exam.monthlyReviewVideoUrl]);
  const dirty = url !== (exam.monthlyReviewVideoUrl || '');
  useEffect(() => {
    if (!expanded || dirty) return undefined;
    let disposed = false;
    const refresh = async () => {
      try { const value = await getMonthlyMockReview(exam.id); if (!disposed) savedRef.current({ id: exam.id, monthlyReviewVideoUrl: value.url }); }
      catch { /* The saved link remains visible if the network is unavailable. */ }
    };
    const timer = setInterval(refresh, 6000);
    window.addEventListener('focus', refresh);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [expanded, dirty, exam.id]);
  const assigned = (exam.monthlyAssignedMonths || []).includes(getMonthlyMockMonth());
  return <div className="monthly-review-editor">
    <button type="button" className="monthly-review-editor__toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <Video size={15} />{exam.monthlyReviewVideoUrl ? 'Видеоразбор прикреплён' : 'Добавить видеоразбор'}
    </button>
    {expanded && <div className="monthly-review-editor__body">
      <p>Ученик сможет посмотреть видео после завершения этого пробника.</p>
      <label>Ссылка на видеоразбор Rutube<input type="url" placeholder="https://rutube.ru/video/..." value={url} maxLength={3000} disabled={busy} onChange={event => { setUrl(event.target.value); setSaved(false); }} /></label>
      <div className="monthly-review-editor__actions">
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError(''); setSaved(false);
          try { const value = await api.updateMockExam(exam.id, { monthlyReviewVideoUrl: url }); onSaved(value); setUrl(value.monthlyReviewVideoUrl || ''); setSaved(true); }
          catch (failure) { setError(failure.message || 'Не удалось сохранить разбор'); }
          finally { setBusy(false); }
        }}>{busy ? 'Сохраняем…' : 'Сохранить ссылку'}</button>
        {assigned && <a href={`http://127.0.0.1:18765/?mockReview=${encodeURIComponent(exam.id)}#mock-review`} target="_blank" rel="noreferrer"><PlayCircle size={15} />Записать разбор в пульте</a>}
      </div>
      {!assigned && <small>Для записи через пульт отметьте этот вариант как пробник текущего месяца.</small>}
      <small>В пульте можно ставить запись на паузу. После завершения и загрузки в Rutube видео прикрепится автоматически. Для закрытого видео сохраняйте ключ ?p= в ссылке.</small>
      {error && <p role="alert" className="monthly-review-editor__error">{error}</p>}
      {saved && <p role="status">Ссылка сохранена.</p>}
    </div>}
  </div>;
}
