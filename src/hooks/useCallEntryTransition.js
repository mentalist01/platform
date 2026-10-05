import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Only an explicit entry animates. RTC acknowledgements, retries and media
// acquisition keep their normal timing; the visual never owns connection state.
export function useCallEntryTransition(status, inlineRef, floatingRef) {
  const pending = useRef(null);
  const cleanup = useRef(() => {});
  const prepare = useCallback(() => {
    cleanup.current();
    pending.current = null;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = inlineRef.current || floatingRef.current;
    const preview = root?.querySelector('.call-prejoin-preview-media');
    if (!preview || !preview.animate) return;
    const avatar = preview.querySelector('.call-media-placeholder > div');
    const video = preview.querySelector('video');
    let frame = null;
    if (video?.videoWidth && video.readyState >= 2 && getComputedStyle(video).visibility !== 'hidden') {
      try {
        frame = document.createElement('canvas');
        frame.width = video.videoWidth;
        frame.height = video.videoHeight;
        frame.getContext('2d').drawImage(video, 0, 0);
      } catch { frame = null; }
    }
    pending.current = {
      root, rect: preview.getBoundingClientRect(), frame,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      background: getComputedStyle(preview.parentElement).backgroundImage,
      avatar: avatar?.cloneNode(true), avatarRect: avatar?.getBoundingClientRect(),
    };
  }, [inlineRef, floatingRef]);

  useLayoutEffect(() => {
    if (status === 'connecting') { cleanup.current(); return; }
    const snapshot = pending.current;
    pending.current = null;
    cleanup.current();
    if (status !== 'connected' || !snapshot || !snapshot.root.isConnected
      || snapshot.viewport.width !== window.innerWidth || snapshot.viewport.height !== window.innerHeight
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { root } = snapshot;
    const stage = root.querySelector('.call-media-stage');
    if (!stage) return;
    const bounds = root.getBoundingClientRect();
    const target = stage.getBoundingClientRect();
    if (!target.width || !target.height || !snapshot.rect.width || !snapshot.rect.height) return;
    const layer = document.createElement('div');
    layer.className = 'call-entry-transition';
    layer.setAttribute('aria-hidden', 'true');
    const surface = document.createElement('div');
    surface.className = 'call-entry-transition__surface';
    const origin = { left: bounds.left + root.clientLeft, top: bounds.top + root.clientTop };
    Object.assign(surface.style, { left: `${target.left - origin.left}px`, top: `${target.top - origin.top}px`, width: `${target.width}px`, height: `${target.height}px`, backgroundImage: snapshot.background });
    const light = document.createElement('div');
    light.className = 'call-entry-transition__light';
    light.style.backgroundImage = getComputedStyle(stage).backgroundImage;
    surface.append(light);
    layer.append(surface);
    const animations = [];
    const duration = 860;
    const easing = 'cubic-bezier(.22, 1, .36, 1)';
    const transformFrom = (from, to) => `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    root.append(layer);
    root.dataset.callEntry = 'active';
    animations.push(surface.animate([
      { transform: transformFrom(snapshot.rect, target), opacity: 1 },
      { transform: 'none', opacity: 1, offset: .65 },
      { transform: 'none', opacity: 0 },
    ], { duration, easing, fill: 'both' }));
    animations.push(light.animate([{ opacity: 0 }, { opacity: 1, offset: .74 }, { opacity: 1 }], { duration, easing, fill: 'both' }));
    const destination = root.querySelector('[data-self="true"] .call-avatar-card');
    const mediaDestination = root.querySelector('[data-self="true"] .call-media-tile--stage');
    const visual = snapshot.frame ? document.createElement('canvas') : (destination && snapshot.avatar?.cloneNode(true));
    if (snapshot.frame) {
      visual.width = snapshot.frame.width;
      visual.height = snapshot.frame.height;
      visual.getContext('2d').drawImage(snapshot.frame, 0, 0);
    }
    const visualTarget = snapshot.frame ? mediaDestination : destination;
    if (visual && visualTarget) {
      const end = visualTarget.getBoundingClientRect();
      const from = snapshot.frame ? snapshot.rect : snapshot.avatarRect;
      visual.className = 'call-entry-transition__portrait';
      Object.assign(visual.style, { left: `${end.left - origin.left}px`, top: `${end.top - origin.top}px`, width: `${end.width}px`, height: `${end.height}px`, borderRadius: getComputedStyle(visualTarget).borderRadius, fontSize: getComputedStyle(visualTarget).fontSize });
      layer.append(visual);
      animations.push(visual.animate([
        { transform: transformFrom(from, end), opacity: 1 },
        { transform: 'none', opacity: 1, offset: .74 },
        { transform: 'none', opacity: 0 },
      ], { duration, easing, fill: 'both' }));
    }
    let timer;
    let observer;
    const finish = () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', finish);
      observer?.disconnect();
      animations.forEach(animation => animation.cancel());
      layer.remove();
      delete root.dataset.callEntry;
      cleanup.current = () => {};
    };
    cleanup.current = finish;
    window.addEventListener('resize', finish, { once: true });
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        const current = root.getBoundingClientRect();
        if (Math.abs(current.width - bounds.width) > 1 || Math.abs(current.height - bounds.height) > 1) finish();
      });
      observer.observe(root);
    }
    timer = window.setTimeout(finish, duration + 40);
  }, [status]);

  useEffect(() => () => { pending.current = null; cleanup.current(); }, []);
  return prepare;
}
