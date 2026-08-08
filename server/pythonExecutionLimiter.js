export class BoundedExecutionSlots {
  constructor({ maxConcurrent = 1, maxQueued = 0 } = {}) {
    this.maxConcurrent = Math.max(1, Math.floor(Number(maxConcurrent) || 1));
    this.maxQueued = Math.max(0, Math.floor(Number(maxQueued) || 0));
    this.activeCount = 0;
    this.queue = [];
  }

  acquire(waitTimeoutMs = 0) {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount += 1;
      return Promise.resolve(true);
    }
    if (this.queue.length >= this.maxQueued) return Promise.resolve(false);
    return new Promise((resolve) => {
      const entry = { resolve, timeoutId: null };
      const normalizedWaitTimeoutMs = Math.max(0, Math.floor(Number(waitTimeoutMs) || 0));
      if (normalizedWaitTimeoutMs > 0) {
        entry.timeoutId = setTimeout(() => {
          const index = this.queue.indexOf(entry);
          if (index === -1) return;
          this.queue.splice(index, 1);
          resolve(false);
        }, normalizedWaitTimeoutMs);
      }
      this.queue.push(entry);
    });
  }

  release() {
    if (this.activeCount > 0) this.activeCount -= 1;
    const next = this.queue.shift();
    if (next && typeof next.resolve === 'function') {
      if (next.timeoutId) clearTimeout(next.timeoutId);
      this.activeCount += 1;
      next.resolve(true);
    }
  }

  get queuedCount() {
    return this.queue.length;
  }
}

export class SlidingWindowRateLimiter {
  constructor({ limit = 1, windowMs = 60_000, maxKeys = 10_000 } = {}) {
    this.limit = Math.max(1, Math.floor(Number(limit) || 1));
    this.windowMs = Math.max(1_000, Math.floor(Number(windowMs) || 60_000));
    this.maxKeys = Math.max(100, Math.floor(Number(maxKeys) || 10_000));
    this.entries = new Map();
  }

  consume(key, nowMs = Date.now()) {
    const normalizedKey = typeof key === 'string' ? key.trim() : String(key ?? '').trim();
    if (!normalizedKey) return { allowed: false, retryAfterMs: this.windowMs };
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const cutoff = now - this.windowMs;
    const live = (this.entries.get(normalizedKey) || []).filter((timestamp) => timestamp > cutoff);
    if (live.length >= this.limit) {
      this.entries.set(normalizedKey, live);
      return {
        allowed: false,
        retryAfterMs: Math.max(1, live[0] + this.windowMs - now),
      };
    }
    live.push(now);
    this.entries.set(normalizedKey, live);
    if (this.entries.size > this.maxKeys) this.prune(now);
    return { allowed: true, remaining: Math.max(0, this.limit - live.length) };
  }

  prune(nowMs = Date.now()) {
    const cutoff = Number(nowMs) - this.windowMs;
    this.entries.forEach((timestamps, key) => {
      const live = timestamps.filter((timestamp) => timestamp > cutoff);
      if (live.length > 0) this.entries.set(key, live);
      else this.entries.delete(key);
    });
    while (this.entries.size > this.maxKeys) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey === 'undefined') break;
      this.entries.delete(oldestKey);
    }
  }
}
