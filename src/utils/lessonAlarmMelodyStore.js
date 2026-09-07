const openDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('ivan100-lesson-alarm', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('melodies');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function accessAlarmMelody(userId, value) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const write = arguments.length > 1;
      const transaction = db.transaction('melodies', write ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('melodies');
      const request = write ? (value ? store.put(value, userId) : store.delete(userId)) : store.get(userId);
      transaction.oncomplete = () => resolve(write ? value : request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Хранилище мелодий недоступно'));
    });
  } finally { db.close(); }
}
