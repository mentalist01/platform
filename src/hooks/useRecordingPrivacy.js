import { useCallback, useEffect, useRef, useState } from 'react';
import { PRIVATE_TEACHER_VIEWS, setRecordingPrivacy, afterRecordingSafePaint } from '../utils/recordingPrivacy';

export default function useRecordingPrivacy(view, role) {
  const supported = role === 'teacher' && Boolean(window.teacherDesktop?.setRecordingPrivacy);
  const [ready, setReady] = useState(() => !supported || !PRIVATE_TEACHER_VIEWS.has(view));
  const [error, setError] = useState('');
  const generation = useRef(0);
  const requestedView = useRef(view);
  const protect = useCallback(async reason => {
    try { await setRecordingPrivacy(reason, true); setError(''); return true; }
    catch { setError('Раздел пока не открыт: не удалось скрыть его в записи. Проверьте подключение пульта к OBS и повторите.'); return false; }
  }, []);
  const navigate = useCallback(async (next, commit) => {
    const token = ++generation.current;
    requestedView.current = next;
    if (supported && PRIVATE_TEACHER_VIEWS.has(next) && !await protect('platform')) return;
    if (token !== generation.current) return;
    setReady(true); setError(''); commit(next);
    if (supported && !PRIVATE_TEACHER_VIEWS.has(next)) afterRecordingSafePaint(() => {
      if (token === generation.current && !PRIVATE_TEACHER_VIEWS.has(requestedView.current)) void setRecordingPrivacy('platform', false).catch(() => setError('Не удалось вернуть изображение урока в запись. Проверьте OBS.'));
    });
  }, [protect, supported]);
  useEffect(() => {
    if (!supported) return undefined;
    if (PRIVATE_TEACHER_VIEWS.has(view)) {
      let cancelled = false;
      void setRecordingPrivacy('platform', true).then(() => { if (!cancelled) { setReady(true); setError(''); } }).catch(() => {
        if (!cancelled) setError('Не удалось скрыть раздел в записи. Проверьте подключение пульта к OBS и откройте раздел снова.');
      });
      return () => { cancelled = true; };
    }
    return afterRecordingSafePaint(() => {
      if (!PRIVATE_TEACHER_VIEWS.has(requestedView.current)) void setRecordingPrivacy('platform', false).catch(() => setError('Не удалось вернуть изображение урока в запись. Проверьте OBS.'));
    });
  }, [view, supported]);
  return { ready, error, navigate, protect };
}
