import React, { useEffect, useRef, useState } from 'react';
import { getRutubeEmbedUrl, getRutubeWatchUrl } from '../utils/learningGroups';
import { formatChapterTime, normalizeVideoChapters } from '../utils/videoChapters';
import { chapterPlayerUrl, createChapterSeek } from '../utils/rutubeChapterSeek.js';

export default function RutubeChapterPlayer({ url, chapters, title, className = '', loading, sendCommand }) {
  const embedUrl = getRutubeEmbedUrl(url);
  const frame = useRef(null), seeker = useRef(null);
  const [start, setStart] = useState(null);
  const [selection, setSelection] = useState(null), [pending, setPending] = useState(null);
  const [fallbackSelection, setFallbackSelection] = useState(null);
  const selectedTime = selection?.url === embedUrl ? selection.time : null;
  const pendingTime = pending?.url === embedUrl ? pending.time : null;
  const items = normalizeVideoChapters(chapters);
  useEffect(() => {
    const controller = createChapterSeek(message => sendCommand ? sendCommand(message)
      : frame.current?.contentWindow?.postMessage(JSON.stringify(message), 'https://rutube.ru'),
      time => setPending(time === null ? null : { url: embedUrl, time }), time => {
        setFallbackSelection({ url: embedUrl, time });
        setStart(previous => ({ url: embedUrl, time, revision: (previous?.revision || 0) + 1 }));
      });
    seeker.current = controller;
    const receive = (event) => {
      if (event.origin !== 'https://rutube.ru' || event.source !== frame.current?.contentWindow) return;
      let message;
      try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (message && typeof message.type === 'string') seeker.current.receive(message);
    };
    window.addEventListener('message', receive);
    return () => { controller.dispose(); window.removeEventListener('message', receive); seeker.current = null; };
  }, [embedUrl, sendCommand]);
  if (!embedUrl) return null;
  const src = chapterPlayerUrl(embedUrl, start?.url === embedUrl ? start.time : null);
  const jump = (time) => {
    setFallbackSelection(null);
    setSelection({ url: embedUrl, time });
    if (!seeker.current?.select(time)) setStart(previous => ({ url: embedUrl, time, revision: (previous?.revision || 0) + 1 }));
  };
  const directWatch = new URL(getRutubeWatchUrl(embedUrl));
  if (selectedTime !== null) directWatch.searchParams.set('t', String(selectedTime));
  return (
    <div className={`w-full ${className}`}>
      <div className="aspect-video overflow-hidden rounded-2xl border border-purple-100 bg-black">
        <iframe key={`${embedUrl}:${start?.url === embedUrl ? start.revision || 0 : 0}`} ref={frame} title={title} src={src} className="h-full w-full" allow="clipboard-write; autoplay" allowFullScreen loading={loading} />
      </div>
      {items.length > 0 && (
        <nav aria-label="Тайм-коды видео" className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-violet-200 bg-violet-50 p-3 text-slate-800">
          <h4 className="mb-2 text-sm font-bold">В этом видео</h4>
          <p className="mb-2 text-xs text-slate-500">Нажмите на время или название, чтобы начать просмотр с этого места.</p>
          {pendingTime !== null && <p role="status" className="mb-2 text-xs font-semibold text-violet-700">{fallbackSelection?.url === embedUrl && fallbackSelection.time === pendingTime
            ? `Плеер не ответил на перемотку. Фрагмент открыт заново с ${formatChapterTime(pendingTime)}. Если видео на паузе, нажмите ▶.`
            : `Выбрано ${formatChapterTime(pendingTime)}. После загрузки или рекламы видео продолжится с этого места. Если автозапуск заблокирован, нажмите ▶ в плеере.`}</p>}
          {selectedTime !== null && <a href={directWatch.toString()} target="_blank" rel="noreferrer" className="mb-2 inline-block text-xs text-violet-700 underline">Открыть с {formatChapterTime(selectedTime)} на Rutube</a>}
          {items.map(item => (
            <button key={item.time} type="button" aria-pressed={selectedTime === item.time} onClick={() => jump(item.time)} className={`flex w-full items-start gap-3 rounded-lg border px-2 py-2 text-left text-sm hover:bg-violet-100 focus-visible:outline-violet-500 ${selectedTime === item.time ? 'border-violet-400 bg-violet-100' : 'border-violet-100 bg-white'}`}>
              <span className="shrink-0 font-mono font-semibold text-violet-700">{formatChapterTime(item.time)}</span><span>{item.title}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
