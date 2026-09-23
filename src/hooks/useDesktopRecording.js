import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export default function useDesktopRecording({ user, active, studentId, learningLessonId }) {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const jobRef = useRef(null);
  const refresh = useCallback(async () => {
    const value = await api.desktopRecording(); setSettings(value); return value;
  }, []);
  useEffect(() => {
    setSettings(null); jobRef.current = null; setJobId('');
    let cancelled = false;
    const poll = () => api.desktopRecording().then((value) => { if (!cancelled) setSettings(value); }).catch(() => {});
    void poll(); const timer = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user.id, user.role]);
  const enabled = settings?.enabled === true;
  useEffect(() => {
    if (!enabled || user.role !== 'teacher') return undefined;
    let cancelled = false; let busy = false;
    const transitionFrom = jobRef.current?.id || '';
    let first = true;
    const synchronize = async () => {
      if (busy) return; busy = true;
      try {
        if (active && (studentId || learningLessonId)) {
          const job = await api.desktopRecording('start', { studentId, learningLessonId, ...(first ? { transitionFrom } : {}) });
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
  }, [active, enabled, learningLessonId, studentId, user.role]);
  return { enabled, jobId, settings, error, refresh };
}
