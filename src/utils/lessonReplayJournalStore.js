const DATABASE = 'ege-lesson-replay-outbox-v1';

export function createLessonReplayJournalStore(indexedDB = globalThis.indexedDB) {
  let opening;
  const open = () => {
    if (!indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('sessions', { keyPath: 'key' }).createIndex('owner', 'owner');
          const records = db.createObjectStore('records', { keyPath: 'key' });
          records.createIndex('session', 'sessionKey');
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Local replay database is blocked'));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opening = null; };
          resolve(db);
        };
      }).catch((error) => { opening = null; throw error; });
    }
    return opening;
  };
  const transaction = async (names, mode, operation) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      // Resolve on commit, never on an individual put's success.
      let tx;
      try { tx = db.transaction(names, mode, { durability: 'strict' }); }
      catch { tx = db.transaction(names, mode); }
      let result;
      tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Local replay write aborted'));
      try { result = operation(tx); } catch (error) { tx.abort(); reject(error); }
    });
  };
  return {
    save: (session, record) => transaction(['sessions', 'records'], 'readwrite', (tx) => {
      tx.objectStore('sessions').put(session);
      if (record) tx.objectStore('records').put(record);
    }),
    sessions: (owner) => transaction(['sessions'], 'readonly', (tx) => {
      const request = tx.objectStore('sessions').index('owner').getAll(owner);
      return () => request.result;
    }),
    records: (sessionKey, { all = false } = {}) => transaction(['records'], 'readonly', (tx) => {
      const index = tx.objectStore('records').index('session');
      const request = all ? index.getAll(sessionKey) : index.getAll(sessionKey, 48);
      return () => request.result;
    }),
    acknowledgeEvents: (sessionKey, ids) => transaction(['records'], 'readwrite', (tx) => {
      const wanted = new Set(ids);
      const request = tx.objectStore('records').index('session').openCursor(sessionKey);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || !wanted.size) return;
        if (cursor.value.kind === 'event' && wanted.has(cursor.value.id)) cursor.delete();
        cursor.continue();
      };
    }),
    acknowledge: (keys) => transaction(['records'], 'readwrite', (tx) => {
      keys.forEach((key) => tx.objectStore('records').delete(key));
    }),
    removeEmptySession: (key) => transaction(['sessions', 'records'], 'readwrite', (tx) => {
      const request = tx.objectStore('records').index('session').count(key);
      request.onsuccess = () => { if (request.result === 0) tx.objectStore('sessions').delete(key); };
    }),
    removeSession: (key) => transaction(['sessions', 'records'], 'readwrite', (tx) => {
      tx.objectStore('sessions').delete(key);
      const request = tx.objectStore('records').index('session').openCursor(key);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
    }),
  };
}
