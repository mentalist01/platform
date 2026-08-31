export const REPLAY_FULLSCREEN_TIMEOUT_MS = 1500;

// Fullscreen promises and events are not delivered consistently by embedded
// browsers. Keep one mode for both the copy UI and its viewport-sized layout.
export const createLessonReplayFullscreenController = ({
  element,
  document: doc,
  onModeChange,
  schedule = setTimeout,
  cancel = clearTimeout,
}) => {
  let mode = 'inline';
  let wanted = false;
  let disposed = false;
  let generation = 0;
  let timer = null;
  const nativeElement = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;
  const ownsFullscreen = () => {
    const current = nativeElement();
    return Boolean(current && (current === element || element.contains?.(current)));
  };
  const clearTimer = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const setMode = (next) => {
    if (disposed || next === mode) return;
    mode = next;
    onModeChange(next);
  };
  const exitNative = () => {
    if (!ownsFullscreen()) return Promise.resolve();
    try {
      return Promise.resolve((doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const sync = () => {
    if (disposed) return;
    if (ownsFullscreen()) {
      clearTimer();
      if (wanted) setMode('native');
      else void exitNative().catch(() => {
        // If exit is rejected, keep the UI consistent with the real viewport.
        if (!disposed && ownsFullscreen()) {
          wanted = true;
          setMode('native');
        }
      });
    } else if (mode === 'native') {
      wanted = false;
      generation += 1;
      clearTimer();
      setMode('inline');
    }
  };
  const fallback = (requestGeneration) => {
    if (disposed || !wanted || requestGeneration !== generation) return;
    clearTimer();
    setMode(ownsFullscreen() ? 'native' : 'fallback');
  };
  const onError = (event) => {
    if (event?.target && event.target !== doc && event.target !== element) return;
    if (mode === 'pending') fallback(generation);
  };
  const close = () => {
    if (disposed) return;
    wanted = false;
    generation += 1;
    clearTimer();
    if (!ownsFullscreen()) {
      setMode('inline');
      return;
    }
    void exitNative().then(() => {
      if (disposed || wanted) return;
      // An exit without an event must also reconcile React state.
      if (ownsFullscreen()) {
        wanted = true;
        setMode('native');
      } else setMode('inline');
    }).catch(() => {
      if (!disposed && ownsFullscreen()) {
        wanted = true;
        setMode('native');
      }
    });
  };
  const open = () => {
    if (disposed || wanted) return;
    wanted = true;
    const requestGeneration = ++generation;
    setMode('pending');
    timer = schedule(() => fallback(requestGeneration), REPLAY_FULLSCREEN_TIMEOUT_MS);
    const requestNative = () => {
      if (disposed || !wanted || requestGeneration !== generation) return;
      const request = element.requestFullscreen || element.webkitRequestFullscreen;
      if (!request) {
        fallback(requestGeneration);
        return;
      }
      try {
        const result = request.call(element, { navigationUI: 'hide' });
        // Legacy WebKit returns undefined: keep waiting for its event/timeout.
        if (result && typeof result.then === 'function') {
          void Promise.resolve(result).then(() => {
            if (disposed || !wanted) {
              void exitNative().catch(() => {});
              return;
            }
            fallback(requestGeneration);
          }).catch(() => fallback(requestGeneration));
        } else sync();
      } catch {
        fallback(requestGeneration);
      }
    };
    if (nativeElement() && !ownsFullscreen()) {
      try {
        void Promise.resolve((doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc))
          .then(requestNative).catch(() => fallback(requestGeneration));
      } catch {
        fallback(requestGeneration);
      }
    } else requestNative();
  };

  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('webkitfullscreenchange', sync);
  doc.addEventListener('fullscreenerror', onError);
  doc.addEventListener('webkitfullscreenerror', onError);
  // Some embedded browsers resize the viewport on Escape without delivering
  // fullscreenchange. Reconcile on viewport/focus changes as well, without polling.
  doc.defaultView?.addEventListener('resize', sync);
  doc.defaultView?.addEventListener('focus', sync);
  doc.addEventListener('visibilitychange', sync);
  return {
    toggle: () => { if (wanted || mode !== 'inline') close(); else open(); },
    close,
    dispose: () => {
      disposed = true;
      wanted = false;
      generation += 1;
      clearTimer();
      doc.removeEventListener('fullscreenchange', sync);
      doc.removeEventListener('webkitfullscreenchange', sync);
      doc.removeEventListener('fullscreenerror', onError);
      doc.removeEventListener('webkitfullscreenerror', onError);
      doc.defaultView?.removeEventListener('resize', sync);
      doc.defaultView?.removeEventListener('focus', sync);
      doc.removeEventListener('visibilitychange', sync);
      void exitNative().catch(() => {});
    },
  };
};
