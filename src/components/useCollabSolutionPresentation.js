import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getSharedCollabComparison } from '../utils/collabSolutions.js';

/* eslint-disable react-hooks/set-state-in-effect -- Synchronize the external Yjs presence and Monaco selection with the presentation controls. */

// Presentations are live presence, never persisted room settings. Each pupil
// can leave one presentation without being pulled back by cursor heartbeats.
export default function useCollabSolutionPresentation(options) {
  const { awareness, solutions, enabled, isTeacher, activeId, compareId, busy } = options;
  const optionsRef = useRef(options);
  useLayoutEffect(() => { optionsRef.current = options; });
  const dismissed = useRef(new Set());
  const followingRef = useRef(null);
  const [following, setFollowing] = useState(null);
  const [remote, setRemote] = useState(null);
  const [presenting, setPresenting] = useState(null);

  const leave = useCallback((restore = true) => {
    const current = followingRef.current;
    if (!current) return;
    dismissed.current.add(current.id);
    followingRef.current = null;
    setFollowing(null);
    const config = optionsRef.current;
    if (restore) {
      config.onSelect(current.previousId);
      config.onCompare(null);
    }
  }, []);

  useEffect(() => {
    dismissed.current.clear();
    followingRef.current = null;
    setFollowing(null);
    setPresenting(null);
    return () => { awareness?.setLocalStateField('codeComparison', null); };
  }, [awareness]);

  useEffect(() => {
    if (!awareness || !enabled || isTeacher) { setRemote(null); return undefined; }
    const update = () => {
      const next = getSharedCollabComparison(awareness.getStates(), awareness.clientID, solutions);
      setRemote((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    awareness.on('change', update);
    update();
    return () => awareness.off('change', update);
  }, [awareness, enabled, isTeacher, solutions]);

  useEffect(() => {
    if (busy || !enabled) return;
    if (!remote || dismissed.current.has(remote.id)) { leave(); return; }
    if (followingRef.current?.id === remote.id) return;
    const config = optionsRef.current;
    const previousId = followingRef.current?.previousId || config.activeId;
    if (!config.onSelect(remote.activeId)) return;
    config.onCompare(remote.compareId);
    const next = { ...remote, previousId };
    followingRef.current = next;
    setFollowing(next);
  }, [remote, busy, enabled, leave]);

  useEffect(() => {
    if (!presenting) return;
    if (!enabled || presenting.activeId !== activeId || presenting.compareId !== compareId
      || !solutions.some((item) => item.id === presenting.compareId)
      || !solutions.some((item) => item.id === presenting.activeId)) {
      awareness?.setLocalStateField('codeComparison', null);
      setPresenting(null);
    }
  }, [presenting, awareness, enabled, activeId, compareId, solutions]);

  const toggle = () => {
    if (presenting) {
      awareness?.setLocalStateField('codeComparison', null);
      setPresenting(null);
    } else if (awareness && enabled && isTeacher && compareId && !busy) {
      const pair = { id: globalThis.crypto.randomUUID(), activeId, compareId };
      awareness.setLocalStateField('codeComparison', pair);
      setPresenting(pair);
    }
  };

  return { following, presenting: Boolean(presenting), toggle, leave };
}
