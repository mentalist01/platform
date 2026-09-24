// HTTP/1.1 has a small per-origin connection pool shared by browser tabs.
// All schedule consumers in a tab must reuse the same long-lived request.
export const createScheduleSyncChannel = ({ getConnection, createSource }) => {
  const connections = new Map();
  return (listener) => {
    const { key, url } = getConnection();
    let entry = connections.get(key);
    if (!entry) {
      const source = createSource(url);
      if (!source) return () => {};
      entry = { source, subscribers: 0 };
      connections.set(key, entry);
    }
    // Separate wrappers let two consumers safely subscribe the same callback.
    const handleEvent = (event) => listener(event);
    entry.subscribers += 1;
    entry.source.addEventListener('schedule-sync', handleEvent);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      entry.source.removeEventListener('schedule-sync', handleEvent);
      entry.subscribers -= 1;
      if (entry.subscribers === 0) {
        entry.source.close();
        connections.delete(key);
      }
    };
  };
};
