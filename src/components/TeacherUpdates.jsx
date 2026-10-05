import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import catalog from '../data/teacherUpdates.json';
import { acknowledgeTeacherUpdates, availableTeacherUpdates, readTeacherUpdates, teacherUpdatesStorageKey, unreadTeacherUpdates } from '../utils/teacherUpdates';
import './TeacherUpdates.css';

const deviceStore = () => { try { return window.localStorage; } catch { return undefined; } };
function UpdatesDialog({ releases, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal();
    return () => { element.close(); if (previous?.isConnected) previous.focus?.(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="teacher-updates-dialog" aria-labelledby="teacher-updates-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    } }}>
    <header><span className="teacher-updates-icon"><Sparkles size={25} /></span><div><p className="teacher-updates-eyebrow">IVAN100 · ДЛЯ ПРЕПОДАВАТЕЛЯ</p><h2 id="teacher-updates-title">Что нового</h2></div>
      <button type="button" className="teacher-updates-close" onClick={onClose} aria-label="Закрыть список изменений"><X size={21} /></button></header>
    <p className="teacher-updates-intro">Изменения приложения и кабинета. Ваши входы, настройки и учебные данные сохранены.</p>
    <div className="teacher-updates-content">{releases.map(release => <section key={release.id}><h3>{release.title}</h3><ul>{release.changes.map(change => <li key={change}>{change}</li>)}</ul></section>)}</div>
    <footer><button type="button" className="teacher-updates-done" onClick={onClose}>Понятно</button></footer>
  </dialog>, document.body);
}

export default function TeacherUpdates({ role, teacherId, paused = false }) {
  const desktop = window.teacherDesktop;
  const releases = useMemo(() => availableTeacherUpdates(catalog, { role, teacherId, desktop }), [role, teacherId, desktop]);
  const [seen, setSeen] = useState(() => readTeacherUpdates(teacherId, deviceStore()));
  const [manualOpen, setManualOpen] = useState(false);
  const unread = useMemo(() => unreadTeacherUpdates(releases, seen), [releases, seen]);
  const opened = paused ? null : unread.length ? unread : manualOpen ? releases : null;
  useEffect(() => {
    const synchronize = event => { if (event.key === teacherUpdatesStorageKey(teacherId)) setSeen(readTeacherUpdates(teacherId, deviceStore())); };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, [teacherId]);
  if (!releases.length) return null;
  const dismiss = () => {
    setSeen(acknowledgeTeacherUpdates(teacherId, opened || [], deviceStore()));
    setManualOpen(false);
  };
  return <>
    {!paused && <div className="teacher-updates-entry"><button type="button" onClick={() => setManualOpen(true)}><Sparkles size={15} /> Что нового</button></div>}
    {opened && !paused && <UpdatesDialog releases={opened} onClose={dismiss} />}
  </>;
}
