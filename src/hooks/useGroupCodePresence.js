import { useEffect, useState } from 'react';
import { apiFetch, parseJsonResponse } from '../services/api.js';

export default function useGroupCodePresence({ enabled, groupId, lessonId }) {
  const [presence, setPresence] = useState(null);
  useEffect(() => {
    setPresence(null);
    if (!enabled || !groupId || !lessonId) return undefined;
    let disposed = false, timer, pending = false;
    const controller = new AbortController();
    const poll = async () => {
      if (disposed || pending || document.hidden) return;
      pending = true;
      try {
        const response = await apiFetch(`/api/learning-groups/${encodeURIComponent(groupId)}/lessons/${encodeURIComponent(lessonId)}/code-presence`, { signal: controller.signal });
        if (!response.ok) throw new Error('Presence unavailable');
        const data = await parseJsonResponse(response);
        if (!disposed) setPresence({ ...data, unavailable: false });
      } catch {
        if (!disposed) setPresence(current => ({ ...current, unavailable: true }));
      } finally { pending = false; }
    };
    poll();
    timer = window.setInterval(poll, 2500);
    document.addEventListener('visibilitychange', poll);
    window.addEventListener('focus', poll);
    window.addEventListener('online', poll);
    return () => {
      disposed = true; controller.abort(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
      window.removeEventListener('focus', poll); window.removeEventListener('online', poll);
    };
  }, [enabled, groupId, lessonId]);
  return presence;
}
