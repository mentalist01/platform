import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

export default function usePythonGroupProgress(groupId, enabled) {
  const [state, setState] = useState({ groupId: '', data: null, error: '', loading: false });
  const refreshRef = useRef(null);
  const refresh = useCallback(() => refreshRef.current?.(), []);
  useEffect(() => {
    if (!enabled || !groupId) { refreshRef.current = null; return undefined; }
    let disposed = false, inFlight = false;
    setState({ groupId, data: null, error: '', loading: true });
    const load = async () => {
      if (disposed || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const payload = await api.getLearningGroupPythonProgress(groupId);
        if (!disposed) setState({ groupId, data: payload.progress, error: '', loading: false });
      } catch (error) {
        if (!disposed) setState(previous => ({ ...previous, groupId, loading: false, error: error.message || 'Не удалось обновить прогресс группы' }));
      } finally { inFlight = false; }
    };
    refreshRef.current = load;
    void load();
    const timer = window.setInterval(load, 10_000);
    window.addEventListener('focus', load);
    window.addEventListener('learning-groups-changed', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      disposed = true; refreshRef.current = null; window.clearInterval(timer);
      window.removeEventListener('focus', load); window.removeEventListener('learning-groups-changed', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [groupId, enabled]);
  return { data: enabled && state.groupId === groupId ? state.data : null,
    error: enabled && state.groupId === groupId ? state.error : '',
    loading: enabled && (state.groupId !== groupId || state.loading), refresh };
}
