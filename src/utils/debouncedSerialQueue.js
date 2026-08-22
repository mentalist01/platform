const noop = () => {};

/**
 * Debounces writes per key while keeping already-started writes serialized.
 * A later immediate write can therefore never finish before an older write and
 * then be overwritten by it.
 */
export const createDebouncedSerialQueue = ({
  persist,
  delayMs = 350,
  setTimer = (callback, timeout) => setTimeout(callback, timeout),
  clearTimer = (timerId) => clearTimeout(timerId),
  onError = noop,
} = {}) => {
  if (typeof persist !== 'function') {
    throw new TypeError('persist must be a function');
  }

  const pendingByKey = new Map();
  const chainByKey = new Map();

  const enqueue = (key, value) => {
    const normalizedKey = String(key || '');
    if (!normalizedKey) return Promise.resolve(null);
    const previous = chainByKey.get(normalizedKey) || Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => persist(value, normalizedKey));
    chainByKey.set(normalizedKey, current);
    current.then(
      () => {
        if (chainByKey.get(normalizedKey) === current) chainByKey.delete(normalizedKey);
      },
      (error) => {
        if (chainByKey.get(normalizedKey) === current) chainByKey.delete(normalizedKey);
        onError(error, value, normalizedKey);
      }
    );
    return current;
  };

  const cancel = (key) => {
    const normalizedKey = String(key || '');
    const pending = pendingByKey.get(normalizedKey);
    if (!pending) return null;
    clearTimer(pending.timerId);
    pendingByKey.delete(normalizedKey);
    return pending.value;
  };

  const schedule = (key, value) => {
    const normalizedKey = String(key || '');
    if (!normalizedKey) return;
    cancel(normalizedKey);
    const timerId = setTimer(() => {
      const pending = pendingByKey.get(normalizedKey);
      if (!pending || pending.timerId !== timerId) return;
      pendingByKey.delete(normalizedKey);
      void enqueue(normalizedKey, pending.value).catch(noop);
    }, Math.max(0, Number(delayMs) || 0));
    pendingByKey.set(normalizedKey, { timerId, value });
  };

  const flush = (key) => {
    const normalizedKey = String(key || '');
    const value = cancel(normalizedKey);
    return value === null ? (chainByKey.get(normalizedKey) || Promise.resolve(null)) : enqueue(normalizedKey, value);
  };

  const flushWhere = (predicate = () => true) => {
    const keys = Array.from(pendingByKey.keys()).filter((key) => predicate(key));
    return keys.map((key) => flush(key));
  };

  const flushAll = () => flushWhere();

  return {
    schedule,
    enqueue,
    cancel,
    flush,
    flushWhere,
    flushAll,
    hasPending: (key) => pendingByKey.has(String(key || '')),
  };
};
