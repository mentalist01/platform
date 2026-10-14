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
export function createChapterSeek(send, changed = () => {}) {
  let pending = null, ready = false, advert = false, atTarget = false, playing = false, playAttempts = 0, seekSent = false, seekComplete = false;
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
    reset() { pending = null; ready = false; advert = false; atTarget = false; playing = false; playAttempts = 0; seekSent = false; seekComplete = false; changed(null); },
    select(time) { pending = time; atTarget = false; playing = false; playAttempts = 0; seekSent = false; seekComplete = false; changed(time); apply(); return ready; },
    receive(message) {
      if (message.type === 'player:ready') { ready = true; apply(); }
      if (message.type === 'player:adStart') { advert = true; playing = false; atTarget = false; seekSent = false; seekComplete = false; }
      if (message.type === 'player:adEnd') { advert = false; apply(false); }
      if (message.type === 'player:canPlay') { seekComplete = true; apply(); }
      if (message.type === 'player:playStart') apply(false);
      if (message.type === 'player:currentTime' && pending !== null && !advert) {
        atTarget = Math.abs(Number(message.data?.time) - pending) <= 3;
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
