import React, { useState } from 'react';
import { Download, Monitor, X } from 'lucide-react';
import { teacherDesktopDownload, teacherDesktopVersion } from '../utils/teacherDesktop';

export default function TeacherDesktopNotice({ teacherId, onDetails }) {
  const key = `teacher-desktop-notice:${teacherId}:${teacherDesktopVersion}`;
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(key) === 'dismissed'; } catch { return false; } });
  const inApp = new URLSearchParams(window.location.search).get('desktop') === 'teacher' || window.teacherDesktop?.isDesktop;
  if (dismissed || window.teacherDesktop?.autoUpdates || window.teacherDesktop?.version === teacherDesktopVersion) return null;
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(key, 'dismissed'); } catch { /* Device storage is optional. */ } };
  return <aside className="relative mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-violet-200 bg-white/90 p-5 shadow-sm" aria-label="Приложение преподавателя">
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-600"><Monitor size={23} /></div>
    <div className="min-w-0 flex-1 pr-6"><p className="font-bold text-slate-900">{inApp ? 'Доступно обновление приложения' : 'IVAN100 теперь в приложении для Windows'}</p><p className="mt-1 text-sm leading-5 text-slate-500">Кабинет и пульт в одном месте. Сохранённые коды преподавателей и удобные загрузки.</p></div>
    <div className="flex flex-wrap items-center gap-3"><a href={teacherDesktopDownload} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"><Download size={16} />{inApp ? 'Скачать обновление' : 'Скачать приложение'}</a><button onClick={onDetails} className="text-sm font-semibold text-violet-600 hover:text-violet-800">Подробнее</button></div>
    <button onClick={dismiss} aria-label="Скрыть предложение скачать приложение" title="Не сейчас" className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={17} /></button>
  </aside>;
}
