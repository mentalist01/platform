// Use persisted progress as the source of truth, never the client's test summary.
export function watchPythonSolvedProgress({ studentId, load, subscribe, onSnapshot, onError = () => {} }) {
  let stopped = false, loading = false, queued = false;
  const refresh = async () => {
    if (stopped) return;
    if (loading) { queued = true; return; }
    loading = true;
    do {
      queued = false;
      try {
        const payload = await load();
        // An update arrived while this older request was in flight. Read again.
        if (!stopped && !queued) onSnapshot(payload);
      } catch (error) { if (!stopped && !queued) onError(error); }
    } while (!stopped && queued);
    loading = false;
  };
  const unsubscribe = subscribe(event => {
    if (event.type === 'ready') { void refresh(); return; }
    try {
      const payload = JSON.parse(event.data);
      if (payload?.scope === 'homework-progress' && payload.studentId === studentId) void refresh();
    } catch { /* Ignore other stream messages. */ }
  }, { events: ['schedule-sync', 'ready'] });
  void refresh();
  return { refresh, stop: () => { stopped = true; unsubscribe(); } };
}
