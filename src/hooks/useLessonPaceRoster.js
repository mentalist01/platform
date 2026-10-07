import { useEffect, useState } from 'react';
import { lessonPaceApi } from '../services/lessonPaceApi';

export function useLessonPaceRoster({ teacherId, enabled, transport = lessonPaceApi }) {
  const [state, setState] = useState({ teacherId: '', rows: [], error: '', loaded: false });
  useEffect(() => {
    if (!enabled || !teacherId) return;
    let alive = true, busy = false;
    const refresh = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const data = await transport.getStudentPaceRoster();
        if (alive) setState({ teacherId, rows: data.students, error: '', loaded: true });
      } catch (cause) {
        if (alive) setState(previous => ({ ...(previous.teacherId === teacherId ? previous : { rows: [], loaded: false }),
          teacherId, error: cause.message || 'Оценки темпа недоступны' }));
      } finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false; clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [teacherId, enabled, transport]);
  return state.teacherId === teacherId ? state : { rows: [], error: '', loaded: false };
}
