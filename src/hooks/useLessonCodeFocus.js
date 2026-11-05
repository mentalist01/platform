import { useCallback, useEffect, useState } from 'react';
import { preparedRequest } from '../services/preparedLessonTasks.js';

export const LESSON_CODE_FOCUS_EVENT = 'platform:lesson-code-focus';

export function useLessonCodeFocus(studentId) {
  const [records, setRecords] = useState({});
  const current = records[studentId];
  const focus = current?.focus || null;
  const accept = useCallback(next => setRecords(previous => ({ ...previous, [studentId]: { focus: next } })), [studentId]);

  useEffect(() => {
    if (!studentId) return;
    let request, retry;
    const refresh = () => {
      window.clearTimeout(retry);
      request?.abort();
      const controller = new AbortController();
      request = controller;
      preparedRequest('/api/lesson-code-focus?studentId=' + encodeURIComponent(studentId), undefined, 'GET', controller.signal)
        .then(result => { if (!controller.signal.aborted) accept(result.focus); })
        .catch(() => { if (!controller.signal.aborted) retry = window.setTimeout(refresh, 5000); });
    };
    const onSignal = event => {
      if (!event.detail) refresh();
      else if (event.detail.studentId === studentId) {
        window.clearTimeout(retry);
        request?.abort();
        accept(event.detail.focus);
      }
    };
    refresh();
    window.addEventListener(LESSON_CODE_FOCUS_EVENT, onSignal);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(retry);
      request?.abort();
      window.removeEventListener(LESSON_CODE_FOCUS_EVENT, onSignal);
      window.removeEventListener('focus', refresh);
    };
  }, [accept, studentId]);

  useEffect(() => {
    if (!focus) return;
    const delay = Math.max(0, focus.expiresAt - Date.now());
    const timer = window.setTimeout(() => accept(null), delay);
    return () => window.clearTimeout(timer);
  }, [accept, focus]);

  return { focus, ready: !studentId || Boolean(current), accept };
}
