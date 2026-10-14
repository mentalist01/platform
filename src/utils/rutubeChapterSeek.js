export function chapterPlayerUrl(embedUrl, time) {
  const src = new URL(embedUrl);
  if (Number.isFinite(time) && time >= 0) {
    src.searchParams.set('t', String(time));
    src.searchParams.set('autoplay', 'true');
  }
  return src.toString();
}

// Keep the requested chapter until the content, rather than an advertisement,
// reports playing at the selected time. A ready player may not yet be playable.
export function createChapterSeek(send, changed = () => {}, fallback = () => {}, clock = {
  schedule: (fn, delay) => setTimeout(fn, delay), cancel: timer => clearTimeout(timer),
}) {
  let pending = null, ready = false, advert = false, atTarget = false, playing = false, playAttempts = 0, seekSent = false, seekComplete = false;
  let timer = null, fallbackUsed = false;
  const cancelFallback = () => { if (timer !== null) clock.cancel(timer); timer = null; };
  const armFallback = () => {
    if (pending === null || advert || atTarget || fallbackUsed || timer !== null) return;
    timer = clock.schedule(() => {
      timer = null;
      if (pending === null || advert || atTarget || fallbackUsed) return;
      fallbackUsed = true; ready = false; seekSent = false; seekComplete = false;
      fallback(pending);
    }, 2200);
  };
  const apply = (autoplay = true) => {
    if (!ready || advert || pending === null) return;
    if (!atTarget && !seekSent) { seekSent = true; send({ type: 'player:setCurrentTime', data: { time: pending } }); }
    // Repeated play commands can restart the advertisement sequence.
    if (autoplay && atTarget && seekComplete && playAttempts < 2) { playAttempts++; send({ type: 'player:play', data: {} }); }
  };
  const complete = () => {
    if (pending !== null && !advert && atTarget && playing) { pending = null; changed(null); }
  };
  return {
    dispose: cancelFallback,
    reset() { cancelFallback(); pending = null; ready = false; advert = false; atTarget = false; playing = false; playAttempts = 0; seekSent = false; seekComplete = false; fallbackUsed = false; changed(null); },
    select(time) {
      cancelFallback(); pending = time; atTarget = false; playing = false; playAttempts = 0; seekSent = false; seekComplete = false;
      // A cold player is already opened with ?t= by the component. Only a
      // seemingly ready player needs a timeout for an ignored API command.
      fallbackUsed = !ready; changed(time); apply(); if (ready) armFallback(); return ready;
    },
    receive(message) {
      if (message.type === 'player:ready') { ready = true; apply(); }
      if (message.type === 'player:adStart' || (message.type === 'player:rollState' && message.data?.state === 'play')) { cancelFallback(); advert = true; playing = false; atTarget = false; seekSent = false; seekComplete = false; }
      if (message.type === 'player:adEnd' || (message.type === 'player:rollState' && message.data?.state === 'complete')) { advert = false; apply(false); armFallback(); }
      if (message.type === 'player:canPlay') { seekComplete = true; apply(); }
      if (message.type === 'player:playStart') { advert = false; apply(false); armFallback(); }
      if (message.type === 'player:currentTime' && pending !== null && !advert) {
        atTarget = Math.abs(Number(message.data?.time) - pending) <= 3;
        if (atTarget) cancelFallback();
        if (atTarget && seekComplete && !playing) apply();
        complete();
      }
      if (message.type === 'player:changeState') {
        const state = message.data?.state;
        playing = ['play', 'playing'].includes(state);
        if (state === 'seeked') { seekComplete = true; apply(); }
        complete();
      }
    },
  };
}
