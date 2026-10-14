import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeCallDevice, readCallDevices, requestCallMedia } from '../utils/callMediaDevices.js';

export const useCallMediaDevices = (role, userId) => {
  const storageKey = `ege_rtc_devices_v1:${role || 'user'}:${userId || ''}`;
  const initial = useMemo(() => {
    try { return readCallDevices(window.localStorage, storageKey); }
    catch { return readCallDevices(null, storageKey); }
  }, [storageKey]);
  const [preferences, setPreferences] = useState(initial);
  const [devices, setDevices] = useState([]);
  const preferencesRef = useRef(initial);
  const mountedRef = useRef(false);
  const enumerationRef = useRef(0);

  useEffect(() => {
    preferencesRef.current = initial;
    setPreferences(initial);
  }, [initial]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const attempt = ++enumerationRef.current;
    try {
      const available = await navigator.mediaDevices.enumerateDevices();
      if (mountedRef.current && attempt === enumerationRef.current) setDevices(available);
    } catch { /* Device names can be hidden until the browser grants permission. */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      mountedRef.current = false;
      enumerationRef.current += 1;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  const selectDevice = useCallback((kind, deviceId) => {
    const device = devices.find((entry) => entry.deviceId === deviceId && entry.kind === (kind === 'camera' ? 'videoinput' : 'audioinput'));
    const next = { ...preferencesRef.current, [kind]: normalizeCallDevice({ deviceId, label: device?.label }) };
    // Update immediately: a live switch requests the new device in the same event.
    preferencesRef.current = next;
    setPreferences(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Session selection still works. */ }
  }, [devices, storageKey]);

  const requestMedia = useCallback(async (constraints) => {
    try {
      return await requestCallMedia(navigator.mediaDevices, constraints, preferencesRef.current);
    } finally {
      void refreshDevices();
    }
  }, [refreshDevices]);

  const setSmallCameraPreview = useCallback((small) => {
    const next = { ...preferencesRef.current, smallCameraPreview: small === true };
    preferencesRef.current = next;
    setPreferences(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Session size still works. */ }
  }, [storageKey]);

  return { preferences, devices, selectDevice, requestMedia, refreshDevices, setSmallCameraPreview };
};
