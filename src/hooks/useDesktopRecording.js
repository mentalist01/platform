import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { createLessonRefreshGate } from '../utils/lessonRefreshGate.js';

export default function useDesktopRecording({ user, active, studentId, learningLessonId, audioMode }) {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [checkedAt, setCheckedAt] = useState(0);
  const jobRef = useRef(null);
  const refresh = useCallback(async () => {
    const value = await api.desktopRecording(); setSettings(value); setCheckedAt(Date.now()); return value;
  }, []);
  useEffect(() => {
    setSettings(null); setCheckedAt(0); jobRef.current = null; setJobId('');
    let cancelled = false;
    const refreshGate = createLessonRefreshGate();
    const poll = (options) => refreshGate(async () => {
      try {
        const value = await api.desktopRecording();
        if (!cancelled) { setSettings(value); setCheckedAt(Date.now()); }
      } catch {
        // The next poll can recover when the server responds again.
      }
    }, options);
    const refreshVisibleTab = () => {
      if (document.visibilityState === 'visible') void poll({ urgent: true });
    };
    const refreshOnActivation = user.role === 'teacher' && window.teacherDesktop?.isDesktop;
    if (refreshOnActivation) {
      window.addEventListener('focus', refreshVisibleTab);
      document.addEventListener('visibilitychange', refreshVisibleTab);
    }
    void poll();
    const timer = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (refreshOnActivation) {
        window.removeEventListener('focus', refreshVisibleTab);
        document.removeEventListener('visibilitychange', refreshVisibleTab);
      }
    };
  }, [user.id, user.role]);
  const enabled = settings?.enabled === true;
  const endPrompt=settings?.devices?.some(device=>device.online&&device.endControlVersion===1)===true;
  useEffect(() => {
    if (!enabled || user.role !== 'teacher') return undefined;
    let cancelled = false; let busy = false;
    const transitionFrom = jobRef.current?.id;
    let first = true;
    const synchronize = async () => {
      if (busy) return; busy = true;
      try {
        if (active && (studentId || learningLessonId)) {
          const job = await api.desktopRecording('start', { studentId, learningLessonId, audioMode, endPrompt, transitionFrom: first ? transitionFrom : undefined });
          first = false;
          if (!cancelled) { jobRef.current = job; setJobId(job.id); }
        } else if (jobRef.current) {
          await api.desktopRecording('stop', { id: jobRef.current.id });
          if (!cancelled) setJobId('');
        }
        if (!cancelled) setError('');
      } catch (failure) { if (!cancelled) setError(failure.message); }
      finally { busy = false; }
    };
    void synchronize(); const timer = setInterval(synchronize, 4000);
    // Navigation/refresh must not end the server's lesson or the OBS recording.
    return () => { cancelled = true; clearInterval(timer); };
  }, [active, audioMode, enabled, endPrompt, learningLessonId, studentId, user.role]);
  return { enabled, jobId, settings, error, refresh, checkedAt };
}
