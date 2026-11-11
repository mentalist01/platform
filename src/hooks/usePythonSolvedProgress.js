import { useEffect, useLayoutEffect, useRef } from 'react';
import { api } from '../services/api.js';
import { subscribeScheduleSync } from '../services/scheduleSync.js';
import { watchPythonSolvedProgress } from '../utils/pythonSolvedProgressSync.js';

export default function usePythonSolvedProgress({
  studentId, taskNumber, levelId, catalog, resetKey, persistence = api, live = true, onSnapshot,
}) {
  const callback = useRef(onSnapshot);
  useLayoutEffect(() => { callback.current = onSnapshot; }, [onSnapshot]);
  useEffect(() => {
    if (!studentId || !taskNumber || !levelId) return undefined;
    const sync = watchPythonSolvedProgress({
      studentId,
      load: () => persistence.getSolvedQuestions(studentId, taskNumber, levelId, { includeCode: true }),
      subscribe: live ? subscribeScheduleSync : () => () => {},
      onSnapshot: payload => callback.current(payload),
    });
    const restore = () => { if (!document.hidden) void sync.refresh(); };
    window.addEventListener('focus', restore);
    document.addEventListener('visibilitychange', restore);
    return () => {
      sync.stop();
      window.removeEventListener('focus', restore);
      document.removeEventListener('visibilitychange', restore);
    };
  }, [studentId, taskNumber, levelId, catalog, resetKey, persistence, live]);
}
