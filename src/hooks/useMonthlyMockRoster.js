import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

// One request for the entire roster, never one request per student card.
export function useMonthlyMockRoster({ teacherId, enabled, refreshKey }) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled || !teacherId) return undefined;
    let disposed = false;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await api.getMonthlyMockStatus('');
        if (!disposed) setResult({ teacherId, data });
      } catch {
        if (!disposed) setResult(previous => ({ teacherId, data: previous?.teacherId === teacherId ? previous.data : null, error: true }));
      } finally { pending = false; }
    };
    const visible = () => { if (document.visibilityState !== 'hidden') void load(); };
    void load();
    const timer = setInterval(visible, 30_000);
    window.addEventListener('focus', visible);
    window.addEventListener('online', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('focus', visible);
      window.removeEventListener('online', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [teacherId, enabled, refreshKey, revision]);
  return { ...(result?.teacherId === teacherId ? result : {}), refresh };
}
