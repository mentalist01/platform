import React from 'react';
import { getRutubeEmbedUrl, getRutubeWatchUrl } from '../utils/learningGroups';

export default function RutubeLessonRecording({ replay }) {
  const embed = getRutubeEmbedUrl(replay?.video?.embedUrl);
  const watch = getRutubeWatchUrl(replay?.video?.url);
  const labels = { waiting: 'Запись ожидает запуска на компьютере учителя.', recording: 'Урок записывается.', saved: 'Запись сохранена. Готовим видео для просмотра.', uploading: 'Видео загружается в Rutube.', processing: 'Rutube обрабатывает видео.', error: 'Запись пока не опубликована. Учитель проверяет загрузку.' };
  return <section className="my-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" aria-label="Видеозапись урока">
    <h3 className="px-4 py-3 font-bold">Видеозапись урока</h3>
    {replay?.available && embed ? <>
      <iframe src={embed} title="Запись урока на Rutube" className="aspect-video w-full border-0" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
      <a className="block p-4 text-sm text-violet-700 underline" href={watch} target="_blank" rel="noreferrer">Открыть на Rutube</a>
    </> : <p className="px-4 pb-4 text-sm text-slate-600" role="status">{labels[replay?.status] || 'Видео готовится к публикации.'}</p>}
  </section>;
}
