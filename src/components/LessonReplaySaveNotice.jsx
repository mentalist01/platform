import { useState } from 'react';

export default function LessonReplaySaveNotice({ role, error, onRetry, onDownload }) {
  const [retrying, setRetrying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  if (role !== 'teacher' || !error) return null;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError('');
    try { await onDownload(); }
    catch { setDownloadError('Не удалось собрать резервную копию. Данные остаются в браузере; попробуйте ещё раз.'); }
    finally { setDownloading(false); }
  };

  return (
    <details className="lesson-replay-save-notice mx-3 my-1.5 min-h-0 shrink-0 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-950" style={{ maxHeight: '30%' }}>
      <summary className="cursor-pointer px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">
        <span role="status">Запись урока: требуется сохранение</span>
        <span className="ml-2 font-normal underline underline-offset-2">Подробнее</span>
      </summary>
      <div className="border-t border-amber-200 px-3 py-2">
        <p>{error}</p>
        {downloadError && <p role="alert">{downloadError}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void retry()} disabled={retrying} className="rounded-lg border border-amber-400 px-3 py-2 font-semibold disabled:opacity-60">
            {retrying ? 'Сохраняем…' : 'Повторить сохранение'}
          </button>
          <button type="button" onClick={() => void download()} disabled={downloading} className="rounded-lg border border-amber-400 px-3 py-2 font-semibold disabled:opacity-60">
            {downloading ? 'Готовим копию…' : 'Скачать резервную копию'}
          </button>
        </div>
      </div>
    </details>
  );
}
