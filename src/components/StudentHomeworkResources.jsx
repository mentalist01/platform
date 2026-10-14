import React, { useState } from 'react';
import { BookOpen, Video } from 'lucide-react';
import { homeworkResources } from '../utils/homeworkResources.js';
import { getRutubeWatchUrl } from '../utils/learningGroups.js';
import RutubeChapterPlayer from './RutubeChapterPlayer.jsx';
const TheoryRecordingPlayer = React.lazy(() => import('./TheoryRecordingPlayer.jsx'));

export default function StudentHomeworkResources({ entries, tests, onOpenHomework }) {
  const [opened, setOpened] = useState('');
  const resources = homeworkResources(entries, tests);
  if (!resources.length) return null;
  return <section aria-label="Материалы к домашней работе" className="mb-4 space-y-3">
    <h4 className="text-sm font-black text-violet-700">Что посмотреть и изучить к домашке</h4>
    {resources.map(resource => <article key={resource.id} className="overflow-hidden rounded-2xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {['rutube', 'recording'].includes(resource.type) ? <Video size={22} className="shrink-0 text-violet-600" /> : <BookOpen size={22} className="shrink-0 text-violet-600" />}
          <div><strong className="block text-sm text-slate-900">{resource.title}</strong><span className="text-xs text-slate-500">{resource.hasQuestions ? 'Посмотрите видео и ответьте на вопросы' : 'Сначала изучите материал, затем решайте задания'}</span>
            {resource.dueAt && <span className="block text-xs text-slate-500">До {new Date(resource.dueAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        </div>
        <button type="button" disabled={!resource.available} aria-expanded={opened === resource.id} onClick={() => setOpened(opened === resource.id ? '' : resource.id)} className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 disabled:opacity-50">
          {!resource.available ? 'Материал недоступен' : opened === resource.id ? 'Свернуть материал' : ['rutube', 'recording'].includes(resource.type) ? 'Смотреть видео' : 'Изучить теорию'}
        </button>
      </div>
      {resource.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{resource.description}</p>}
      {opened === resource.id && resource.available && <div className="mt-4">
        {resource.type === 'rutube' ? <><RutubeChapterPlayer url={resource.content} chapters={resource.chapters} title={resource.title} loading="lazy" /><a href={getRutubeWatchUrl(resource.content)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-violet-700 underline">Открыть на Rutube</a></>
          : resource.type === 'recording' ? <React.Suspense fallback={<p>Открываем видео…</p>}><div className="h-[500px]"><TheoryRecordingPlayer recording={resource.content} experience="study" title={resource.title} className="h-full" /></div></React.Suspense>
            : resource.type === 'gdoc' ? <iframe src={resource.content} title={resource.title} className="h-[500px] w-full rounded-xl border border-violet-200 bg-white" />
              : <p className="whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-7 text-slate-700">{resource.content}</p>}
      </div>}
      {resource.hasQuestions && <button type="button" onClick={onOpenHomework} className="mt-3 text-sm font-bold text-violet-700 underline">Ответить на вопросы к видео в «Сегодня»</button>}
    </article>)}
  </section>;
}
