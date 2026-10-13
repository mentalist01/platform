import React, { useEffect, useRef, useState } from 'react';
import { getRutubeEmbedUrl } from '../utils/learningGroups';
import { formatChapterTime, normalizeVideoChapters } from '../utils/videoChapters';

export default function RutubeChapterPlayer({ url, chapters, title, className = '', loading }) {
  const embedUrl = getRutubeEmbedUrl(url);
  const frame = useRef(null), ready = useRef(false), pending = useRef(null);
  const [start, setStart] = useState(null);
  const items = normalizeVideoChapters(chapters);
  useEffect(() => {
    ready.current = false;
    pending.current = null;
  }, [embedUrl]);
  useEffect(() => {
    const receive = (event) => {
      if (event.origin !== 'https://rutube.ru' || event.source !== frame.current?.contentWindow) return;
      let message;
      try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (message?.type !== 'player:ready') return;
      ready.current = true;
      if (pending.current !== null) {
        frame.current.contentWindow.postMessage(JSON.stringify({ type: 'player:setCurrentTime', data: { time: pending.current } }), 'https://rutube.ru');
        frame.current.contentWindow.postMessage(JSON.stringify({ type: 'player:play', data: {} }), 'https://rutube.ru');
        pending.current = null;
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  if (!embedUrl) return null;
  const src = new URL(embedUrl);
  if (start?.url === embedUrl) { src.searchParams.set('t', String(start.time)); src.searchParams.set('autoplay', '1'); }
  const jump = (time) => {
    if (ready.current && frame.current?.contentWindow) {
      frame.current.contentWindow.postMessage(JSON.stringify({ type: 'player:setCurrentTime', data: { time } }), 'https://rutube.ru');
      frame.current.contentWindow.postMessage(JSON.stringify({ type: 'player:play', data: {} }), 'https://rutube.ru');
    } else {
      pending.current = time;
      setStart({url:embedUrl,time});
    }
  };
  return (
    <div className={`w-full ${className}`}>
      <div className="aspect-video overflow-hidden rounded-2xl border border-purple-100 bg-black">
        <iframe ref={frame} title={title} src={src.toString()} className="h-full w-full" allow="clipboard-write; autoplay" allowFullScreen loading={loading} />
      </div>
      {items.length > 0 && (
        <nav aria-label="Тайм-коды видео" className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-violet-200 bg-violet-50 p-3 text-slate-800">
          <h4 className="mb-2 text-sm font-bold">В этом видео</h4>
          {items.map(item => (
            <button key={item.time} type="button" onClick={() => jump(item.time)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-violet-100 focus-visible:outline-violet-500">
              <span className="shrink-0 font-mono font-semibold text-violet-700">{formatChapterTime(item.time)}</span><span>{item.title}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
