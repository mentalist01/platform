import { useCallback, useEffect, useRef, useState } from 'react';
import { createCallAlertPlayer } from '../utils/callAlertSounds';

export function useCallAlertSounds() {
  const playerRef = useRef(null);
  const [alertSoundError, setAlertSoundError] = useState('');
  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      playerRef.current = createCallAlertPlayer({ onError: setAlertSoundError });
    }
    return playerRef.current;
  }, []);
  const primeAlertSounds = useCallback(() => getPlayer().prime(), [getPlayer]);
  const playAlertSound = useCallback((key) => getPlayer().play(key), [getPlayer]);
  const testAlertSound = useCallback(() => {
    primeAlertSounds();
    void playAlertSound('connected');
  }, [primeAlertSounds, playAlertSound]);

  useEffect(() => {
    // Covers entering a call by keyboard, touch, and automatic room navigation.
    const unlock = () => primeAlertSounds();
    const restore = () => {
      if (document.visibilityState === 'visible') void playerRef.current?.resume();
    };
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('pointerup', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', restore);
    window.addEventListener('focus', restore);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('pointerup', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', restore);
      window.removeEventListener('focus', restore);
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, [primeAlertSounds]);

  return { primeAlertSounds, playAlertSound, testAlertSound, alertSoundError };
}
