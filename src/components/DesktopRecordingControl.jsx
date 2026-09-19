import React, { useState } from 'react';
import { api } from '../services/api';

export default function DesktopRecordingControl({ recorder }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const settings = recorder.settings;
  const device = settings?.devices?.[0];
  const action = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); await recorder.refresh(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const status = { waiting: 'Ожидаем OBS', recording: 'Идёт запись', saved: 'Сохранено на компьютере', uploading: 'Загрузка в Rutube', processing: 'Обработка в Rutube', ready: 'Видео готово', error: 'Нужно действие в пульте' };
  const job = settings?.jobs?.[0];
  return <div className="fixed left-3 bottom-4 z-[1345] max-w-[calc(100vw-1.5rem)] text-sm">
    {open && <section className="mb-2 w-80 rounded-2xl border bg-white p-4 shadow-xl" aria-label="Настройка записи на компьютере">
      <strong>Запись на компьютере</strong>
      <p className="my-2 text-xs text-slate-600">OBS снимает выбранное окно, микрофон и звук Телемоста. После урока видео появится здесь через Rutube.</p>
      <p className="my-2 text-xs">{device?.online ? (device.ready ? 'Пульт подключён, OBS настроен' : 'Пульт подключён: настройте OBS') : 'Пульт не подключён'}</p>
      <button disabled={busy} className="rounded border px-3 py-2" onClick={() => action(async () => setCode((await api.desktopRecording('pair', {})).code))}>Получить код подключения</button>
      {code && <label className="mt-2 block text-xs">Вставьте код в пульт на компьютере (действует 5 минут)<input className="my-1 w-full rounded border p-2" readOnly value={code} onFocus={(event) => event.target.select()} /></label>}
      <label className="my-3 flex items-center gap-2"><input type="checkbox" checked={recorder.enabled} disabled={busy || !settings} onChange={(event) => action(() => api.desktopRecording('settings', { enabled: event.target.checked }, 'PUT'))} />Записывать уроки через OBS</label>
      {job && <p className="text-xs">{status[job.status] || job.status}</p>}
      <a className="mt-3 block text-violet-700 underline" href="http://127.0.0.1:18765" target="_blank" rel="noreferrer">Открыть пульт записи</a>
      {(error || recorder.error) && <p role="alert" className="mt-2 text-xs text-rose-700">{error || recorder.error}</p>}
    </section>}
    <button className="rounded-xl border bg-white px-3 py-2 font-semibold shadow-lg" onClick={() => setOpen(!open)}>
      {recorder.enabled ? `● ${device?.online ? (status[job?.status] || 'Запись на ПК') : 'Пульт не подключён'}` : 'Запись на ПК'}
    </button>
  </div>;
}
