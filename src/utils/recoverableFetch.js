const DEFAULT_READ_TIMEOUT_MS = 20_000;

// Finite API responses only: streams and downloads retain their native body.
// Retry reads, never writes: a lost POST response may already have been saved.
export const recoverableFetch = async (url, init = {}, {
  timeoutMs = String(init.method || 'GET').toUpperCase() === 'GET' ? DEFAULT_READ_TIMEOUT_MS : 0,
  timeoutMessage = 'Нет ответа от сервера. Проверьте соединение и попробуйте ещё раз.',
  canRetry = () => true,
  retryDelayMs = 1000,
} = {}) => {
  const isRead = ['GET', 'HEAD'].includes(String(init.method || 'GET').toUpperCase());
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort(init.signal.reason);
    if (init.signal?.aborted) abort();
    else init.signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs) : null;
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      // Keep the deadline until the entire JSON response has arrived. Clearing
      // it at the headers left homework/test loaders stuck on a partial body.
      if (response.body && /\bjson\b/i.test(response.headers.get('content-type') || '')) {
        const body = await response.arrayBuffer();
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      return response;
    } catch (error) {
      const retryable = timedOut || error instanceof TypeError;
      if (!isRead || attempt >= 1 || init.signal?.aborted || !retryable || !canRetry()) {
        if (timedOut) throw new Error(timeoutMessage);
        throw error;
      }
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
    }
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    init.signal?.throwIfAborted();
    if (!canRetry()) throw new Error('Аккаунт изменился во время запроса. Повторите действие.');
  }
};
