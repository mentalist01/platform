import React, { useState } from 'react';
import { parseVideoChapters, VIDEO_CHAPTERS_PROMPT } from '../utils/videoChapters';

export default function VideoChaptersEditor({ value, onChange, disabled }) {
  const [copied, setCopied] = useState('');
  let error = '', count = 0;
  try { count = parseVideoChapters(value).length; } catch (failure) { error = failure.message; }
  return (
    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-4 text-slate-800">
      <label className="block text-sm font-semibold" htmlFor="python-video-chapters">Тайм-коды видео</label>
      <p className="text-xs leading-relaxed text-slate-600">Впишите вручную или вставьте список от нейросети. Используйте время готового видео после монтажа и ускорения.</p>
      <textarea id="python-video-chapters" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} rows={6} placeholder={'00:00 О чём урок\n02:15 Как работает range()\n08:40 Разбор первой задачи'} className="w-full rounded-lg border border-violet-200 bg-white p-3 font-mono text-sm outline-none focus:border-violet-500" />
      <p role="status" className={`text-xs ${error ? 'text-red-600' : 'text-slate-600'}`}>{error || (count ? `Пунктов: ${count}. Появятся у ученика после сохранения теории.` : 'Необязательно. Пустое поле уберёт оглавление.')}</p>
      <button type="button" disabled={disabled} onClick={async () => {
        try { await navigator.clipboard.writeText(VIDEO_CHAPTERS_PROMPT); setCopied('Запрос скопирован. Вставьте его в нейросеть вместе с расшифровкой.'); }
        catch { setCopied('Не удалось скопировать. Запрос можно выделить ниже.'); }
      }} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700">Скопировать запрос для нейросети</button>
      {copied && <p role="status" className="text-xs text-violet-700">{copied}</p>}
      <details className="text-xs"><summary className="cursor-pointer text-violet-700">Показать запрос для нейросети</summary><pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 leading-relaxed">{VIDEO_CHAPTERS_PROMPT}</pre></details>
    </div>
  );
}
