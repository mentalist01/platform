import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Camera, CameraOff, ImagePlus, Loader2, Maximize2, MessageSquare, Mic, MicOff, Minimize2, MonitorUp, MonitorX, Move, Phone, PhoneOff, SendHorizontal, Settings, Signal, Users, X } from 'lucide-react';
import { api } from '../services/api';
import LinkifiedText from './LinkifiedText';
import { getRtcWsUrl, resolveApiUrl } from '../utils/runtimeUrls';

const DEFAULT_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
const WS_PING_INTERVAL_MS = 15000;
const AUDIO_MAX_BITRATE = 32000;
const AUDIO_MIN_BITRATE = 16000;
const getPositiveNumberFromEnv = (key, fallback) => {
  const value = typeof import.meta !== 'undefined' ? import.meta.env?.[key] : undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const VIDEO_MAX_BITRATE = getPositiveNumberFromEnv('VITE_RTC_SCREEN_MAX_BITRATE', 3500000);
const CAMERA_MAX_BITRATE = getPositiveNumberFromEnv('VITE_RTC_CAMERA_MAX_BITRATE', 1200000);
const CAMERA_MIN_BITRATE = getPositiveNumberFromEnv('VITE_RTC_CAMERA_MIN_BITRATE', 220000);
const SCREEN_MIN_BITRATE = getPositiveNumberFromEnv('VITE_RTC_SCREEN_MIN_BITRATE', 500000);
const SCREEN_MAX_FRAMERATE = getPositiveNumberFromEnv('VITE_RTC_SCREEN_MAX_FRAMERATE', 60);
const SCREEN_MAX_WIDTH = getPositiveNumberFromEnv('VITE_RTC_SCREEN_MAX_WIDTH', 1920);
const SCREEN_MAX_HEIGHT = getPositiveNumberFromEnv('VITE_RTC_SCREEN_MAX_HEIGHT', 1080);
const CAMERA_MAX_FRAMERATE = getPositiveNumberFromEnv('VITE_RTC_CAMERA_MAX_FRAMERATE', 30);
const CAMERA_MAX_WIDTH = getPositiveNumberFromEnv('VITE_RTC_CAMERA_MAX_WIDTH', 1280);
const CAMERA_MAX_HEIGHT = getPositiveNumberFromEnv('VITE_RTC_CAMERA_MAX_HEIGHT', 720);
const WS_RECONNECT_BASE_DELAY_MS = 900;
const WS_RECONNECT_MAX_DELAY_MS = 8000;
const WS_RECONNECT_JITTER_MS = 500;
const WS_RECONNECT_MAX_ATTEMPTS = 10;
const RTC_ICE_CANDIDATE_POOL_SIZE = (() => {
  const value = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_RTC_ICE_CANDIDATE_POOL_SIZE : undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(32, Math.round(parsed)));
})();
const RTC_ICE_TRANSPORT_POLICY = (() => {
  const value = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_RTC_ICE_TRANSPORT_POLICY : '';
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'relay' ? 'relay' : 'all';
})();
const CONNECTION_STATS_INTERVAL_MS = 2500;
const RTC_PRESENCE_RECONNECT_DELAY_MS = 2000;
const RTC_PRESENCE_RECONNECT_MAX_DELAY_MS = 12000;
const RTC_PRESENCE_RECONNECT_JITTER_MS = 450;
const RTC_PRESENCE_RECONNECT_MAX_ATTEMPTS = 10;
const RTC_PRESENCE_HTTP_FALLBACK_POLL_INTERVAL_MS = 10000;
const RTC_PRESENCE_FALLBACK_BOOT_TIMEOUT_MS = 5000;
const WS_HEARTBEAT_TIMEOUT_MS = 45000;
const JOIN_ACK_TIMEOUT_MS = 15000;
const ROOM_RESYNC_COOLDOWN_MS = 4000;
const PEER_DISCONNECTED_GRACE_MS = 10000;
const RTC_VIDEO_RECEIVER_SLOTS = 2;
const SPEAKING_RMS_THRESHOLD = getPositiveNumberFromEnv('VITE_RTC_SPEAKING_RMS_THRESHOLD', 0.008);
const SPEAKING_HOLD_MS = getPositiveNumberFromEnv('VITE_RTC_SPEAKING_HOLD_MS', 420);
const SPEAKING_ANALYSER_FFT_SIZE = 1024;
const PEER_VOLUME_STEP_PERCENT = 10;
const DEFAULT_PEER_VOLUME = 1;
const MIN_MIC_SENSITIVITY_PERCENT = 50;
const MAX_MIC_SENSITIVITY_PERCENT = 200;
const DEFAULT_MIC_SENSITIVITY_PERCENT = 200;
const MIC_SENSITIVITY_STEP_PERCENT = 10;
const MIN_MIC_TRIGGER_THRESHOLD_PERCENT = 0;
const MAX_MIC_TRIGGER_THRESHOLD_PERCENT = 150;
const DEFAULT_MIC_TRIGGER_THRESHOLD_PERCENT = 0;
const MIC_TRIGGER_THRESHOLD_STEP_PERCENT = 10;
const MIC_LEVEL_METER_MIN_DB = -60;
const MIC_LEVEL_METER_MAX_DB = -8;
const MIC_SETTINGS_POPUP_WIDTH = 360;
const MIC_SETTINGS_POPUP_OFFSET = 10;
const MIC_SETTINGS_POPUP_MARGIN = 8;
const MIC_SETTINGS_POPUP_ESTIMATED_HEIGHT = 280;
const RTC_MIC_SETTINGS_STORAGE_KEY_PREFIX = 'ege_rtc_mic_settings_v3';
const RTC_ALERT_SOUND_SOURCES = Object.freeze({
  connected: '/sounds/user_join.mp3',
  disconnected: '/sounds/user_leave.mp3',
  peerJoined: '/sounds/user_join.mp3',
  peerLeft: '/sounds/user_leave.mp3',
  micMuted: '/sounds/mute.mp3',
  micUnmuted: '/sounds/unmute.mp3',
  screenOn: '/sounds/demonstration on.MP3',
  screenOff: '/sounds/demonstration off.MP3',
});
const RTC_ALERT_SOUND_VOLUME = 0.2;
const CALL_BACKGROUND_PARTICLE_COUNT = 14;
const CALL_CHAT_POLL_INTERVAL_MS = 4500;
const INLINE_PANEL_BOTTOM_GAP_PX = 2;
const LESSON_CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const LESSON_CHAT_ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

const formatChatDateTime = (iso) => {
  const parsed = Date.parse(String(iso || '').trim());
  if (!Number.isFinite(parsed)) return '';
  try {
    return new Date(parsed).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) {
    reject(new Error('Файл не выбран'));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    if (!result) {
      reject(new Error('Не удалось прочитать файл'));
      return;
    }
    resolve(result);
  };
  reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
  reader.readAsDataURL(file);
});

const normalizePeerVolume = (value) => {
  if (!Number.isFinite(value)) return DEFAULT_PEER_VOLUME;
  return Math.max(0, Math.min(1, value));
};

const percentToPeerVolume = (value) => {
  if (!Number.isFinite(value)) return DEFAULT_PEER_VOLUME;
  return normalizePeerVolume(value / 100);
};

const peerVolumeToPercent = (value) => Math.round(normalizePeerVolume(value) * 100);
const clampToRange = (value, min, max) => Math.min(Math.max(value, min), max);
const rmsToMicLevelPercent = (value) => {
  const rms = Number(value);
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  const normalized = ((db - MIC_LEVEL_METER_MIN_DB) / (MIC_LEVEL_METER_MAX_DB - MIC_LEVEL_METER_MIN_DB)) * 100;
  return Math.round(clampToRange(normalized, 0, 100));
};
const normalizeMicSensitivityPercent = (value) => {
  if (!Number.isFinite(value)) return DEFAULT_MIC_SENSITIVITY_PERCENT;
  return Math.round(clampToRange(
    Number(value),
    MIN_MIC_SENSITIVITY_PERCENT,
    MAX_MIC_SENSITIVITY_PERCENT
  ));
};
const micSensitivityPercentToGain = (value) => normalizeMicSensitivityPercent(value) / 100;
const normalizeMicTriggerThresholdPercent = (value) => {
  if (!Number.isFinite(value)) return DEFAULT_MIC_TRIGGER_THRESHOLD_PERCENT;
  return Math.round(clampToRange(
    Number(value),
    MIN_MIC_TRIGGER_THRESHOLD_PERCENT,
    MAX_MIC_TRIGGER_THRESHOLD_PERCENT
  ));
};
const micTriggerThresholdPercentToRmsThreshold = (value) => {
  const thresholdPercent = normalizeMicTriggerThresholdPercent(value);
  return Math.max(0, SPEAKING_RMS_THRESHOLD * (thresholdPercent / 100));
};
const normalizeConnectionQuality = (value) => {
  if (value === 'poor' || value === 'ok' || value === 'good') return value;
  return 'good';
};
const getConnectionAdaptiveProfile = (quality, highVideoLoad = false) => {
  const normalizedQuality = normalizeConnectionQuality(quality);
  const baseProfile = normalizedQuality === 'poor'
    ? {
      audioBitrate: Math.max(AUDIO_MIN_BITRATE, Math.round(AUDIO_MAX_BITRATE * 0.7)),
      screenBitrate: Math.max(SCREEN_MIN_BITRATE, Math.round(VIDEO_MAX_BITRATE * 0.35)),
      screenFramerate: Math.max(10, Math.min(SCREEN_MAX_FRAMERATE, 18)),
      screenScale: 1.9,
      cameraBitrate: Math.max(CAMERA_MIN_BITRATE, Math.round(CAMERA_MAX_BITRATE * 0.36)),
      cameraFramerate: Math.max(8, Math.min(CAMERA_MAX_FRAMERATE, 14)),
      cameraScale: 2.1,
      degradationPreference: 'balanced',
    }
    : normalizedQuality === 'ok'
      ? {
        audioBitrate: Math.max(AUDIO_MIN_BITRATE, Math.round(AUDIO_MAX_BITRATE * 0.86)),
        screenBitrate: Math.max(SCREEN_MIN_BITRATE, Math.round(VIDEO_MAX_BITRATE * 0.58)),
        screenFramerate: Math.max(14, Math.min(SCREEN_MAX_FRAMERATE, 30)),
        screenScale: 1.35,
        cameraBitrate: Math.max(CAMERA_MIN_BITRATE, Math.round(CAMERA_MAX_BITRATE * 0.62)),
        cameraFramerate: Math.max(12, Math.min(CAMERA_MAX_FRAMERATE, 22)),
        cameraScale: 1.45,
        degradationPreference: 'balanced',
      }
      : {
        audioBitrate: AUDIO_MAX_BITRATE,
        screenBitrate: VIDEO_MAX_BITRATE,
        screenFramerate: SCREEN_MAX_FRAMERATE,
        screenScale: 1,
        cameraBitrate: CAMERA_MAX_BITRATE,
        cameraFramerate: CAMERA_MAX_FRAMERATE,
        cameraScale: 1,
        degradationPreference: 'maintain-resolution',
      };

  if (!highVideoLoad) {
    return baseProfile;
  }

  return {
    ...baseProfile,
    screenBitrate: Math.max(SCREEN_MIN_BITRATE, Math.round(baseProfile.screenBitrate * 0.62)),
    screenFramerate: Math.max(10, Math.min(baseProfile.screenFramerate, 24)),
    screenScale: Math.max(baseProfile.screenScale, 1.55),
    cameraBitrate: Math.max(CAMERA_MIN_BITRATE, Math.round(baseProfile.cameraBitrate * 0.72)),
    cameraFramerate: Math.max(10, Math.min(baseProfile.cameraFramerate, 20)),
    cameraScale: Math.max(baseProfile.cameraScale, 1.4),
    degradationPreference: 'balanced',
  };
};
const getRtcPeerConnectionConfig = (iceServers) => ({
  iceServers,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: RTC_ICE_CANDIDATE_POOL_SIZE,
  iceTransportPolicy: RTC_ICE_TRANSPORT_POLICY,
});
const getRtcPeerConnectionState = (pc) => {
  const directState = typeof pc?.connectionState === 'string' ? pc.connectionState : '';
  if (directState) return directState;
  const iceState = typeof pc?.iceConnectionState === 'string' ? pc.iceConnectionState : '';
  if (iceState === 'failed') return 'failed';
  if (iceState === 'disconnected') return 'disconnected';
  if (iceState === 'closed') return 'closed';
  if (iceState === 'connected' || iceState === 'completed') return 'connected';
  if (iceState === 'checking' || iceState === 'new') return 'connecting';
  return 'new';
};
const getRtcPeerConnectionCtor = () => {
  if (typeof window === 'undefined') return null;
  const ctor = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  return typeof ctor === 'function' ? ctor : null;
};

const clampPanelPositionToViewport = (position, width, height) => {
  const normalizedWidth = Number(width);
  const normalizedHeight = Number(height);
  if (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0 || !Number.isFinite(normalizedHeight) || normalizedHeight <= 0) {
    return position;
  }
  if (typeof window === 'undefined') return position;
  const margin = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxX = Math.max(margin, viewportWidth - normalizedWidth - margin);
  const maxY = Math.max(margin, viewportHeight - normalizedHeight - margin);
  return {
    x: clampToRange(Number(position?.x) || margin, margin, maxX),
    y: clampToRange(Number(position?.y) || margin, margin, maxY),
  };
};

const getRtcIceConfig = () => {
  const raw = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_RTC_ICE_SERVERS : '';
  const normalizedRaw = typeof raw === 'string' ? raw.trim() : '';
  if (!normalizedRaw) {
    return {
      servers: DEFAULT_ICE_SERVERS,
      hasTurn: false,
      hasTurnAuth: false,
      configError: false,
      fromEnv: false,
    };
  }
  try {
    const parsed = JSON.parse(normalizedRaw);
    if (!Array.isArray(parsed)) {
      return {
        servers: DEFAULT_ICE_SERVERS,
        hasTurn: false,
        hasTurnAuth: false,
        configError: true,
        fromEnv: true,
      };
    }
    const normalized = parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const urlsValue = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
        const urls = urlsValue
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        if (!urls.length) return null;
        const iceServer = { urls };
        if (entry.username !== undefined && entry.username !== null) iceServer.username = String(entry.username);
        if (entry.credential !== undefined && entry.credential !== null) iceServer.credential = String(entry.credential);
        return iceServer;
      })
      .filter(Boolean);
    if (!normalized.length) {
      return {
        servers: DEFAULT_ICE_SERVERS,
        hasTurn: false,
        hasTurnAuth: false,
        configError: true,
        fromEnv: true,
      };
    }
    const hasTurn = normalized.some((entry) => (
      Array.isArray(entry?.urls)
      && entry.urls.some((url) => /^turns?:/i.test(String(url || '').trim()))
    ));
    const hasTurnAuth = normalized.some((entry) => {
      if (!Array.isArray(entry?.urls)) return false;
      const hasTurnUrls = entry.urls.some((url) => /^turns?:/i.test(String(url || '').trim()));
      if (!hasTurnUrls) return false;
      const username = typeof entry?.username === 'string' ? entry.username.trim() : '';
      const credential = typeof entry?.credential === 'string' ? entry.credential.trim() : '';
      return Boolean(username && credential);
    });
    return {
      servers: normalized,
      hasTurn,
      hasTurnAuth,
      configError: false,
      fromEnv: true,
    };
  } catch {
    return {
      servers: DEFAULT_ICE_SERVERS,
      hasTurn: false,
      hasTurnAuth: false,
      configError: true,
      fromEnv: true,
    };
  }
};

const normalizeErrorMessage = (error, fallback) => {
  const fallbackText = typeof fallback === 'string' ? fallback : 'Ошибка соединения';
  if (!error) return fallbackText;
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (message) return message;
  const text = String(error).trim();
  return text || fallbackText;
};

const extractHttpErrorMessage = async (response, fallback) => {
  const fallbackText = typeof fallback === 'string' && fallback.trim()
    ? fallback.trim()
    : 'Не удалось выполнить запрос.';
  if (!response) return fallbackText;

  try {
    const jsonPayload = await response.clone().json();
    const jsonError = typeof jsonPayload?.error === 'string' ? jsonPayload.error.trim() : '';
    if (jsonError) return jsonError;
  } catch {}

  try {
    const textPayload = (await response.clone().text()).trim();
    if (textPayload && textPayload.length <= 240) return textPayload;
  } catch {}

  return fallbackText;
};

const formatRtcRoleLabel = (role) => {
  if (role === 'teacher') return 'Преподаватель';
  if (role === 'student') return 'Ученик';
  if (role === 'admin') return 'Администратор';
  return 'Участник';
};

const isUsableVideoTrack = (track) => Boolean(
  track
  && track.kind === 'video'
  && track.readyState === 'live'
  && !track.muted
);

const hasLiveVideoInStream = (stream) => {
  const tracks = Array.isArray(stream?.getVideoTracks?.()) ? stream.getVideoTracks() : [];
  return tracks.some((track) => isUsableVideoTrack(track));
};

const getLiveVideoTracks = (stream) => {
  const tracks = Array.isArray(stream?.getVideoTracks?.()) ? stream.getVideoTracks() : [];
  return tracks.filter((track) => isUsableVideoTrack(track));
};

const getVideoTrackById = (stream, trackId) => {
  const normalizedTrackId = typeof trackId === 'string' ? trackId.trim() : '';
  if (!normalizedTrackId) return null;
  const tracks = Array.isArray(stream?.getVideoTracks?.()) ? stream.getVideoTracks() : [];
  return tracks.find((track) => track.id === normalizedTrackId && isUsableVideoTrack(track)) || null;
};

const inferVideoTrackKind = (track) => {
  if (!track || track.kind !== 'video') return 'video';
  try {
    const settings = typeof track.getSettings === 'function' ? track.getSettings() : null;
    const displaySurface = typeof settings?.displaySurface === 'string'
      ? settings.displaySurface.trim().toLowerCase()
      : '';
    if (displaySurface) return 'screen';
  } catch {}

  const label = typeof track.label === 'string' ? track.label.trim().toLowerCase() : '';
  if (label && /(screen|window|tab|display|экран)/i.test(label)) {
    return 'screen';
  }
  return 'camera';
};

const observeAudioTrackSpeaking = (track, onSpeakingChange, threshold = SPEAKING_RMS_THRESHOLD, onLevelChange) => {
  const reportSpeaking = (value) => {
    onSpeakingChange?.(value);
  };
  const reportLevel = (value) => {
    onLevelChange?.(Number.isFinite(value) && value > 0 ? value : 0);
  };
  const effectiveThreshold = Number.isFinite(threshold) && threshold > 0
    ? threshold
    : SPEAKING_RMS_THRESHOLD;

  if (!track || track.readyState !== 'live' || typeof window === 'undefined') {
    reportSpeaking(false);
    reportLevel(0);
    return () => {};
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    reportSpeaking(false);
    reportLevel(0);
    return () => {};
  }

  let disposed = false;
  let rafId = null;
  let silenceTimer = null;
  let audioContext = null;
  let analyser = null;
  let sourceNode = null;
  let speaking = false;

  const markSpeaking = (nextSpeaking) => {
    if (speaking === nextSpeaking) return;
    speaking = nextSpeaking;
    reportSpeaking(nextSpeaking);
  };

  try {
    audioContext = new AudioContextCtor();
    const probeStream = new MediaStream([track]);
    sourceNode = audioContext.createMediaStreamSource(probeStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = SPEAKING_ANALYSER_FFT_SIZE;
    analyser.smoothingTimeConstant = 0.6;
    sourceNode.connect(analyser);
    audioContext.resume?.().catch(() => {});
  } catch {
    reportSpeaking(false);
    reportLevel(0);
    return () => {};
  }

  const data = new Float32Array(analyser.fftSize);
  const poll = () => {
    if (disposed) return;
    analyser.getFloatTimeDomainData(data);
    let sumSquares = 0;
    for (let index = 0; index < data.length; index += 1) {
      const sample = data[index];
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    reportLevel(rms);
    if (rms > effectiveThreshold) {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      markSpeaking(true);
    } else if (speaking && !silenceTimer) {
      silenceTimer = setTimeout(() => {
        silenceTimer = null;
        markSpeaking(false);
      }, SPEAKING_HOLD_MS);
    }
    rafId = requestAnimationFrame(poll);
  };

  const handleTrackEnded = () => {
    markSpeaking(false);
    reportLevel(0);
  };
  const handleTrackMuted = () => {
    markSpeaking(false);
    reportLevel(0);
  };
  track.addEventListener('ended', handleTrackEnded);
  track.addEventListener('mute', handleTrackMuted);
  poll();

  return () => {
    disposed = true;
    track.removeEventListener('ended', handleTrackEnded);
    track.removeEventListener('mute', handleTrackMuted);
    if (rafId) cancelAnimationFrame(rafId);
    if (silenceTimer) clearTimeout(silenceTimer);
    try {
      sourceNode?.disconnect();
    } catch {}
    try {
      analyser?.disconnect?.();
    } catch {}
    audioContext?.close?.().catch(() => {});
    reportLevel(0);
    reportSpeaking(false);
  };
};

const requestElementFullscreen = async (element) => {
  if (!element?.requestFullscreen) return false;
  try {
    await element.requestFullscreen();
    return true;
  } catch {
    return false;
  }
};

const exitDocumentFullscreen = async () => {
  if (typeof document === 'undefined' || !document.fullscreenElement || !document.exitFullscreen) return false;
  try {
    await document.exitFullscreen();
    return true;
  } catch {
    return false;
  }
};

const MediaTile = ({
  stream,
  title,
  subtitle,
  videoKind = null,
  className = '',
  compact = false,
  isSpeaking = false,
  muted = true,
  allowFullscreen = true,
  onContextMenu,
  isDarkTheme = false,
}) => {
  const tileRef = useRef(null);
  const mediaRef = useRef(null);
  const [, setVideoTrackVersion] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isCompact = compact && !isFullscreen;
  const isScreenShareTile = videoKind === 'screen';
  const isStaticFullscreen = isFullscreen && isScreenShareTile;
  const speakingRingClass = isDarkTheme
    ? 'call-speaking-ring ring-2 ring-emerald-300/85 ring-offset-2 ring-offset-slate-900'
    : 'call-speaking-ring ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-slate-50';
  const videoCardClass = isDarkTheme
    ? 'call-media-tile relative overflow-hidden border border-white/15 bg-slate-900 shadow-[0_10px_26px_rgba(2,6,23,0.45)]'
    : 'call-media-tile relative overflow-hidden border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.14)]';
  const compactCardClass = isDarkTheme
    ? 'call-media-compact-card relative rounded-xl border border-white/10 bg-slate-900/85 px-2.5 py-2 shadow-[0_6px_16px_rgba(2,6,23,0.32)]'
    : 'call-media-compact-card relative rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.12)]';
  const fullscreenButtonClass = isDarkTheme
    ? 'absolute z-10 inline-flex items-center justify-center rounded-md border border-white/20 bg-black/45 text-white transition hover:bg-black/65'
    : 'absolute z-10 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white/85 text-slate-700 transition hover:bg-white';
  const videoFillClass = isDarkTheme ? 'call-media-video h-full w-full bg-slate-950 object-cover' : 'call-media-video h-full w-full bg-slate-100 object-cover';
  const videoOverlayClass = isDarkTheme
    ? 'call-media-overlay pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent'
    : 'call-media-overlay pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/65 via-slate-900/20 to-transparent';
  const overlayTitleClass = isDarkTheme ? 'truncate text-xs font-semibold text-white' : 'truncate text-xs font-semibold text-slate-50';
  const overlaySubtitleClass = isDarkTheme ? 'truncate text-[11px] text-slate-200' : 'truncate text-[11px] text-slate-100';
  const compactAvatarClass = isDarkTheme
    ? 'relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/15 bg-slate-700'
    : 'relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100';
  const compactAvatarTextClass = isDarkTheme
    ? 'flex h-full w-full items-center justify-center text-sm font-semibold text-slate-100'
    : 'flex h-full w-full items-center justify-center text-sm font-semibold text-slate-700';
  const compactAvatarBadgeClass = isDarkTheme
    ? 'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-slate-900 bg-slate-500'
    : 'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500';
  const compactTitleClass = isDarkTheme ? 'truncate text-xs font-semibold text-slate-100' : 'truncate text-xs font-semibold text-slate-700';
  const compactSubtitleClass = isDarkTheme ? 'truncate text-[11px] text-slate-400' : 'truncate text-[11px] text-slate-500';
  const placeholderWrapClass = isDarkTheme
    ? 'call-media-placeholder absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-300'
    : 'call-media-placeholder absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-600';
  const placeholderAvatarClass = isDarkTheme
    ? 'flex items-center justify-center rounded-full bg-slate-700 font-semibold text-slate-100'
    : 'flex items-center justify-center rounded-full border border-slate-200 bg-white font-semibold text-slate-700';
  const placeholderTextClass = isDarkTheme ? 'text-slate-300' : 'text-slate-600';

  useEffect(() => {
    const bumpVideoVersion = () => {
      setVideoTrackVersion((value) => value + 1);
    };
    bumpVideoVersion();
    if (!stream || typeof stream.addEventListener !== 'function') return undefined;

    const trackedListeners = new Map();
    const bindVideoTrack = (track) => {
      if (!track || track.kind !== 'video' || trackedListeners.has(track)) return;
      const handleTrackEvent = () => {
        bumpVideoVersion();
      };
      track.addEventListener?.('ended', handleTrackEvent);
      track.addEventListener?.('mute', handleTrackEvent);
      track.addEventListener?.('unmute', handleTrackEvent);
      trackedListeners.set(track, handleTrackEvent);
    };
    const unbindVideoTrack = (track) => {
      const listener = trackedListeners.get(track);
      if (!listener) return;
      track.removeEventListener?.('ended', listener);
      track.removeEventListener?.('mute', listener);
      track.removeEventListener?.('unmute', listener);
      trackedListeners.delete(track);
    };

    const initialTracks = Array.isArray(stream.getVideoTracks?.()) ? stream.getVideoTracks() : [];
    initialTracks.forEach(bindVideoTrack);

    const handleAddTrack = (event) => {
      bindVideoTrack(event?.track);
      bumpVideoVersion();
    };
    const handleRemoveTrack = (event) => {
      unbindVideoTrack(event?.track);
      bumpVideoVersion();
    };

    stream.addEventListener('addtrack', handleAddTrack);
    stream.addEventListener('removetrack', handleRemoveTrack);

    return () => {
      stream.removeEventListener('addtrack', handleAddTrack);
      stream.removeEventListener('removetrack', handleRemoveTrack);
      trackedListeners.forEach((listener, track) => {
        track.removeEventListener?.('ended', listener);
        track.removeEventListener?.('mute', listener);
        track.removeEventListener?.('unmute', listener);
      });
    };
  }, [stream]);

  const hasVideo = hasLiveVideoInStream(stream);

  useEffect(() => {
    const mediaNode = mediaRef.current;
    if (!mediaNode) return;
    mediaNode.srcObject = stream || null;
    mediaNode.play?.().catch(() => {});
    return () => {
      mediaNode.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleFullscreenChange = () => {
      const tile = tileRef.current;
      setIsFullscreen(Boolean(tile && document.fullscreenElement === tile));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!allowFullscreen) return;
    if (typeof document === 'undefined') return;
    const tile = tileRef.current;
    if (!tile) return;
    if (document.fullscreenElement === tile) {
      await exitDocumentFullscreen();
      return;
    }
    if (document.fullscreenElement) {
      await exitDocumentFullscreen();
    }
    await requestElementFullscreen(tile);
  }, [allowFullscreen]);

  if (isCompact) {
    const initial = String(title || 'U').trim().charAt(0).toUpperCase() || 'U';
    if (hasVideo) {
      return (
        <article
          ref={tileRef}
          onDoubleClick={allowFullscreen ? toggleFullscreen : undefined}
          onContextMenu={onContextMenu}
          data-speaking={isSpeaking ? 'true' : 'false'}
          data-static-fullscreen={isStaticFullscreen ? 'true' : 'false'}
          className={`${videoCardClass} call-media-tile--compact ${isStaticFullscreen ? 'call-media-tile--fullscreen-static' : ''} ${isFullscreen ? 'h-screen w-screen rounded-none border-0' : 'h-24 w-36 rounded-xl md:h-28 md:w-44'} ${isSpeaking && !isFullscreen ? speakingRingClass : ''} ${className}`}
        >
          <button
            type="button"
            onClick={toggleFullscreen}
            disabled={!allowFullscreen}
            className={`${fullscreenButtonClass} right-2 top-2 h-7 w-7 disabled:pointer-events-none disabled:opacity-0`}
            title={isFullscreen ? 'Выйти из полного экрана' : 'Открыть на весь экран'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <video
            ref={mediaRef}
            autoPlay
            muted={muted}
            playsInline
            className={videoFillClass}
          />
          {!isStaticFullscreen && (
            <>
              <div className={`call-video-frame-glow ${isSpeaking ? 'is-speaking' : ''}`} aria-hidden="true" />
              <div className={`call-video-scan ${isSpeaking ? 'is-speaking' : ''}`} aria-hidden="true" />
            </>
          )}
          {!isStaticFullscreen && (
            <div
              className={`call-audio-badge call-audio-badge--compact ${isSpeaking ? 'is-speaking' : ''}`}
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </div>
          )}
          <div className={`${videoOverlayClass} px-2 pb-2 pt-5`}>
            <p className={overlayTitleClass}>{title}</p>
            <p className={overlaySubtitleClass}>{subtitle}</p>
          </div>
        </article>
      );
    }
    return (
      <article
        ref={tileRef}
        onDoubleClick={undefined}
        onContextMenu={onContextMenu}
        className={`${compactCardClass} ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <div className={compactAvatarClass}>
            <div className={compactAvatarTextClass}>
              {initial}
            </div>
            <span className={compactAvatarBadgeClass} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={compactTitleClass}>{title}</p>
            <p className={compactSubtitleClass}>{subtitle}</p>
          </div>
        </div>
      </article>
    );
  }

  return (
      <article
        ref={tileRef}
        onDoubleClick={allowFullscreen ? toggleFullscreen : undefined}
        onContextMenu={onContextMenu}
        data-speaking={isSpeaking ? 'true' : 'false'}
        data-static-fullscreen={isStaticFullscreen ? 'true' : 'false'}
        className={`${videoCardClass} ${isStaticFullscreen ? 'call-media-tile--fullscreen-static' : ''} rounded-2xl ${isSpeaking && !isFullscreen ? speakingRingClass : ''} ${className}`}
      >
      <button
        type="button"
        onClick={toggleFullscreen}
        disabled={!allowFullscreen}
        className={`${fullscreenButtonClass} rounded-lg disabled:pointer-events-none disabled:opacity-0 ${isCompact ? 'right-2 top-2 h-7 w-7' : 'right-3 top-3 h-9 w-9'}`}
        title={isFullscreen ? 'Выйти из полного экрана' : 'Открыть на весь экран'}
      >
        {isFullscreen ? <Minimize2 size={isCompact ? 13 : 16} /> : <Maximize2 size={isCompact ? 13 : 16} />}
      </button>
      <video
        ref={mediaRef}
        autoPlay
        muted={muted}
        playsInline
        className={`call-media-video w-full ${isDarkTheme ? 'bg-slate-950' : 'bg-slate-100'} object-cover ${isFullscreen ? 'h-screen' : (isCompact ? 'h-24 md:h-28' : 'h-72 md:h-80')}`}
      />
      {!isStaticFullscreen && (
        <>
          <div className={`call-video-frame-glow ${isSpeaking ? 'is-speaking' : ''}`} aria-hidden="true" />
          <div className={`call-video-scan ${isSpeaking ? 'is-speaking' : ''}`} aria-hidden="true" />
        </>
      )}
      {!isStaticFullscreen && (
        <div className={`call-audio-badge ${isSpeaking ? 'is-speaking' : ''}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {!hasVideo && (
        <div className={`${placeholderWrapClass} ${isCompact ? 'gap-2' : 'gap-3'}`}>
          <div className={`${placeholderAvatarClass} ${isCompact ? 'h-10 w-10 text-lg' : 'h-16 w-16 text-2xl'}`}>
            {String(title || 'U').trim().charAt(0).toUpperCase() || 'U'}
          </div>
          <p className={`${isCompact ? 'text-xs font-medium' : 'text-sm font-medium'} ${placeholderTextClass}`}>Видео не передается</p>
        </div>
      )}
      <div className={`${videoOverlayClass} ${isCompact ? 'px-2.5 pb-2 pt-6' : 'px-3 pb-3 pt-8'}`}>
        <p className={`${isCompact ? 'text-xs' : 'text-sm'} ${overlayTitleClass}`}>{title}</p>
        <p className={`${isCompact ? 'text-[11px]' : 'text-xs'} ${overlaySubtitleClass}`}>{subtitle}</p>
      </div>
    </article>
  );
};

const RemoteAudioPlayer = ({
  peerId,
  stream,
  onSpeakingChange,
  volume = DEFAULT_PEER_VOLUME,
}) => {
  const audioRef = useRef(null);
  const [audioTrackVersion, setAudioTrackVersion] = useState(0);
  const effectiveVolume = normalizePeerVolume(volume);

  useEffect(() => {
    const audioNode = audioRef.current;
    if (!audioNode) return undefined;
    audioNode.srcObject = stream || null;
    audioNode.play?.().catch(() => {});
    return () => {
      audioNode.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const bumpVersion = () => {
      setAudioTrackVersion((value) => value + 1);
    };
    bumpVersion();
    if (!stream || typeof stream.addEventListener !== 'function') return undefined;

    const trackListeners = new Map();
    const bindAudioTrack = (track) => {
      if (!track || track.kind !== 'audio' || trackListeners.has(track)) return;
      const handler = () => {
        bumpVersion();
      };
      track.addEventListener?.('ended', handler);
      track.addEventListener?.('mute', handler);
      track.addEventListener?.('unmute', handler);
      trackListeners.set(track, handler);
    };
    const unbindAudioTrack = (track) => {
      const handler = trackListeners.get(track);
      if (!handler) return;
      track.removeEventListener?.('ended', handler);
      track.removeEventListener?.('mute', handler);
      track.removeEventListener?.('unmute', handler);
      trackListeners.delete(track);
    };

    const initialTracks = Array.isArray(stream.getAudioTracks?.()) ? stream.getAudioTracks() : [];
    initialTracks.forEach(bindAudioTrack);

    const handleAddTrack = (event) => {
      bindAudioTrack(event?.track);
      bumpVersion();
    };
    const handleRemoveTrack = (event) => {
      unbindAudioTrack(event?.track);
      bumpVersion();
    };

    stream.addEventListener('addtrack', handleAddTrack);
    stream.addEventListener('removetrack', handleRemoveTrack);

    return () => {
      stream.removeEventListener('addtrack', handleAddTrack);
      stream.removeEventListener('removetrack', handleRemoveTrack);
      trackListeners.forEach((handler, track) => {
        track.removeEventListener?.('ended', handler);
        track.removeEventListener?.('mute', handler);
        track.removeEventListener?.('unmute', handler);
      });
    };
  }, [stream]);

  useEffect(() => {
    const audioTrack = Array.isArray(stream?.getAudioTracks?.())
      ? stream.getAudioTracks().find((track) => track.readyState === 'live')
      : null;
    return observeAudioTrackSpeaking(audioTrack, (isSpeaking) => {
      onSpeakingChange?.(peerId, isSpeaking);
    });
  }, [audioTrackVersion, onSpeakingChange, peerId, stream]);

  useEffect(() => {
    const audioNode = audioRef.current;
    if (!audioNode || !stream) return;
    audioNode.play?.().catch(() => {});
  }, [audioTrackVersion, stream]);

  useEffect(() => {
    const audioNode = audioRef.current;
    if (!audioNode) return;
    audioNode.volume = effectiveVolume;
  }, [effectiveVolume]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
};

const CallSection = ({
  role,
  userId,
  teacherId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  uiMode = 'full',
  onRequestExpand,
  onRequestCollapse,
  onStatusChange,
  theme = 'light',
}) => {
  const isTeacher = role === 'teacher';
  const effectiveStudentId = isTeacher ? String(activeStudentId || '').trim() : String(userId || '').trim();
  const effectiveTeacherId = String(teacherId || '').trim();
  const roomId = effectiveTeacherId && effectiveStudentId ? `rtc:${effectiveTeacherId}:${effectiveStudentId}` : '';
  const rtcWsUrl = useMemo(() => getRtcWsUrl(), []);
  const rtcIceConfig = useMemo(() => getRtcIceConfig(), []);
  const rtcPeerConnectionCtor = useMemo(() => getRtcPeerConnectionCtor(), []);
  const rtcIceServers = rtcIceConfig.servers;
  const selectedStudent = useMemo(
    () => (Array.isArray(students) ? students.find((student) => student.id === activeStudentId) : null),
    [students, activeStudentId]
  );
  const micSettingsStorageKey = useMemo(() => {
    const normalizedRole = String(role || 'user').trim() || 'user';
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return '';
    return `${RTC_MIC_SETTINGS_STORAGE_KEY_PREFIX}:${normalizedRole}:${normalizedUserId}`;
  }, [role, userId]);

  const [status, setStatus] = useState('idle');
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [error, setError] = useState('');
  const [presenceError, setPresenceError] = useState('');
  const [micEnabled, setMicEnabled] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenBusy, setScreenBusy] = useState(false);
  const [selfClientId, setSelfClientId] = useState('');
  const [remotePeers, setRemotePeers] = useState([]);
  const [presencePeers, setPresencePeers] = useState([]);
  const [speakingByPeer, setSpeakingByPeer] = useState({});
  const [volumeByPeer, setVolumeByPeer] = useState({});
  const [micSensitivityPercent, setMicSensitivityPercent] = useState(DEFAULT_MIC_SENSITIVITY_PERCENT);
  const [micTriggerThresholdPercent, setMicTriggerThresholdPercent] = useState(DEFAULT_MIC_TRIGGER_THRESHOLD_PERCENT);
  const [micSettingsReadyKey, setMicSettingsReadyKey] = useState('');
  const [micInputLevelPercent, setMicInputLevelPercent] = useState(0);
  const [micSettingsOpen, setMicSettingsOpen] = useState(false);
  const [micSettingsPosition, setMicSettingsPosition] = useState(null);
  const [volumePopup, setVolumePopup] = useState(null);
  const [collapsedPanelPosition, setCollapsedPanelPosition] = useState(null);
  const [floatingPanelPosition, setFloatingPanelPosition] = useState(null);
  const [inlinePanelMinHeightPx, setInlinePanelMinHeightPx] = useState(0);
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const [peerConnectionSummary, setPeerConnectionSummary] = useState({
    total: 0,
    connected: 0,
    connecting: 0,
    disconnected: 0,
    failed: 0,
    closed: 0,
  });
  const [connectionStats, setConnectionStats] = useState({
    quality: 'unknown',
    lossPercent: 0,
    jitterMs: 0,
    rttMs: 0,
  });
  const [lessonChatId, setLessonChatId] = useState('');
  const [lessonChatMeta, setLessonChatMeta] = useState(null);
  const [lessonChatMessages, setLessonChatMessages] = useState([]);
  const [lessonChatLoading, setLessonChatLoading] = useState(false);
  const [lessonChatError, setLessonChatError] = useState('');
  const [lessonChatText, setLessonChatText] = useState('');
  const [lessonChatSending, setLessonChatSending] = useState(false);
  const [lessonChatImageDataUrl, setLessonChatImageDataUrl] = useState('');
  const [lessonChatImageName, setLessonChatImageName] = useState('');
  const [lessonChatPreviewImage, setLessonChatPreviewImage] = useState(null);
  const [lessonChatExpanded, setLessonChatExpanded] = useState(false);

  const wsRef = useRef(null);
  const presenceWsRef = useRef(null);
  const micSettingsWrapRef = useRef(null);
  const micSettingsButtonRef = useRef(null);
  const micSettingsPopupRef = useRef(null);
  const volumePopupRef = useRef(null);
  const collapsedPanelRef = useRef(null);
  const floatingPanelRef = useRef(null);
  const inlinePanelRef = useRef(null);
  const panelDragStateRef = useRef(null);
  const activeRoomRef = useRef('');
  const manualCloseRef = useRef(false);
  const statusRef = useRef(status);
  const previousRoomIdRef = useRef(roomId);
  const selfClientIdRef = useRef('');
  const peersRef = useRef(new Map());
  const peerMetaRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const localStreamRef = useRef(new MediaStream());
  const localAudioTrackRef = useRef(null);
  const localRawAudioTrackRef = useRef(null);
  const localMicAudioContextRef = useRef(null);
  const localMicSourceNodeRef = useRef(null);
  const localMicGainNodeRef = useRef(null);
  const localMicGateGainNodeRef = useRef(null);
  const localMicAnalyserNodeRef = useRef(null);
  const localMicDestinationRef = useRef(null);
  const localMicLevelRafRef = useRef(null);
  const localMicSpeakingOpenRef = useRef(false);
  const localSelfSpeakingObserverCleanupRef = useRef(null);
  const alertAudioTemplatesRef = useRef(new Map());
  const alertAudioActiveRef = useRef(new Set());
  const lessonChatListRef = useRef(null);
  const lessonChatImageInputRef = useRef(null);
  const lessonChatPrevCountRef = useRef(0);
  const previousStatusRef = useRef(status);
  const micTriggerThresholdRmsRef = useRef(micTriggerThresholdPercentToRmsThreshold(DEFAULT_MIC_TRIGGER_THRESHOLD_PERCENT));
  const localCameraTrackRef = useRef(null);
  const localCameraStreamRef = useRef(null);
  const localScreenTrackRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const videoTrackStreamsRef = useRef(new Map());
  const wsPingTimerRef = useRef(null);
  const joinAckTimerRef = useRef(null);
  const wsReconnectTimerRef = useRef(null);
  const wsReconnectAttemptRef = useRef(0);
  const startCallRef = useRef(null);
  const presencePingTimerRef = useRef(null);
  const presenceReconnectTimerRef = useRef(null);
  const presenceReconnectAttemptRef = useRef(0);
  const wsHadErrorRef = useRef(false);
  const lastWsPongAtRef = useRef(0);
  const lastPresencePongAtRef = useRef(0);
  const roomResyncCooldownUntilRef = useRef(0);
  const connectionQualityRef = useRef('ok');
  const highVideoLoadRef = useRef(false);
  const statsTimerRef = useRef(null);
  const lastInboundAudioRef = useRef(new Map());
  const remoteScreenShareStateRef = useRef(new Map());
  const normalizedUiMode = ['full', 'floating', 'collapsed', 'hidden'].includes(uiMode)
    ? uiMode
    : 'full';
  const isFloatingUi = normalizedUiMode === 'floating';
  const isCollapsedUi = normalizedUiMode === 'collapsed';
  const isHiddenUi = normalizedUiMode === 'hidden';
  const showInlineLessonChat = normalizedUiMode === 'full';
  const isDarkTheme = String(theme || '').trim().toLowerCase() === 'dark';

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    micTriggerThresholdRmsRef.current = micTriggerThresholdPercentToRmsThreshold(micTriggerThresholdPercent);
  }, [micTriggerThresholdPercent]);

  useEffect(() => {
    setMicSettingsReadyKey('');

    let nextMicSensitivity = DEFAULT_MIC_SENSITIVITY_PERCENT;
    let nextMicTriggerThreshold = DEFAULT_MIC_TRIGGER_THRESHOLD_PERCENT;

    if (micSettingsStorageKey && typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(micSettingsStorageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
          nextMicSensitivity = normalizeMicSensitivityPercent(Number(parsed.micSensitivityPercent));
          nextMicTriggerThreshold = normalizeMicTriggerThresholdPercent(Number(parsed.micTriggerThresholdPercent));
        }
      } catch {
        nextMicSensitivity = DEFAULT_MIC_SENSITIVITY_PERCENT;
        nextMicTriggerThreshold = DEFAULT_MIC_TRIGGER_THRESHOLD_PERCENT;
      }
    }

    setMicSensitivityPercent(nextMicSensitivity);
    setMicTriggerThresholdPercent(nextMicTriggerThreshold);
    if (micSettingsStorageKey) {
      setMicSettingsReadyKey(micSettingsStorageKey);
    }
  }, [micSettingsStorageKey]);

  useEffect(() => {
    if (!micSettingsStorageKey || micSettingsReadyKey !== micSettingsStorageKey) return;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(micSettingsStorageKey, JSON.stringify({
        micSensitivityPercent: normalizeMicSensitivityPercent(micSensitivityPercent),
        micTriggerThresholdPercent: normalizeMicTriggerThresholdPercent(micTriggerThresholdPercent),
      }));
    } catch {}
  }, [
    micSensitivityPercent,
    micSettingsReadyKey,
    micSettingsStorageKey,
    micTriggerThresholdPercent,
  ]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    if (!showInlineLessonChat) return undefined;
    let cancelled = false;

    if (!isTeacher) {
      setLessonChatId('');
      return undefined;
    }

    if (!effectiveStudentId) {
      setLessonChatId('');
      setLessonChatMeta(null);
      setLessonChatMessages([]);
      return undefined;
    }

    const resolveLessonChatId = async () => {
      try {
        const chats = await api.getStudentChats();
        if (cancelled) return;
        const matchedChat = (Array.isArray(chats) ? chats : []).find((chat) => String(chat?.studentId || '').trim() === effectiveStudentId);
        setLessonChatId(String(matchedChat?.id || '').trim());
      } catch (chatIdError) {
        if (cancelled) return;
        setLessonChatId('');
        setLessonChatError(chatIdError?.message || String(chatIdError));
      }
    };

    resolveLessonChatId();
    return () => {
      cancelled = true;
    };
  }, [effectiveStudentId, isTeacher, showInlineLessonChat]);

  const loadLessonChatMessages = useCallback(async ({ silent = false } = {}) => {
    if (!showInlineLessonChat) return;
    if (isTeacher && !effectiveStudentId) {
      setLessonChatMeta(null);
      setLessonChatMessages([]);
      setLessonChatError('');
      setLessonChatLoading(false);
      return;
    }
    if (isTeacher && !lessonChatId) {
      setLessonChatMeta(null);
      setLessonChatMessages([]);
      setLessonChatLoading(false);
      return;
    }
    if (!silent) setLessonChatLoading(true);
    try {
      const payload = isTeacher
        ? await api.getStudentChatMessagesForTeacher(lessonChatId)
        : await api.getStudentChatMessages();
      setLessonChatMeta(payload?.chat || null);
      setLessonChatMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      setLessonChatError('');
    } catch (chatLoadError) {
      if (!silent) setLessonChatError(chatLoadError?.message || String(chatLoadError));
    } finally {
      if (!silent) setLessonChatLoading(false);
    }
  }, [effectiveStudentId, isTeacher, lessonChatId, showInlineLessonChat]);

  useEffect(() => {
    if (!showInlineLessonChat) return undefined;
    let cancelled = false;
    const load = async ({ silent = false } = {}) => {
      if (cancelled) return;
      await loadLessonChatMessages({ silent });
    };
    load();
    const timerId = setInterval(() => {
      load({ silent: true });
    }, CALL_CHAT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [loadLessonChatMessages, showInlineLessonChat]);

  useEffect(() => {
    if (showInlineLessonChat) return;
    setLessonChatExpanded(false);
    setLessonChatImageDataUrl('');
    setLessonChatImageName('');
  }, [showInlineLessonChat]);

  useEffect(() => {
    if (!showInlineLessonChat) return;
    const node = lessonChatListRef.current;
    if (!node) return;
    const hasNewMessage = lessonChatMessages.length > lessonChatPrevCountRef.current;
    if (hasNewMessage || lessonChatPrevCountRef.current === 0) {
      node.scrollTop = node.scrollHeight;
    }
    lessonChatPrevCountRef.current = lessonChatMessages.length;
  }, [lessonChatMessages, showInlineLessonChat]);

  useEffect(() => {
    if (!showInlineLessonChat || !lessonChatExpanded) return;
    const scrollToBottom = () => {
      const node = lessonChatListRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
    };
    requestAnimationFrame(scrollToBottom);
  }, [lessonChatExpanded, showInlineLessonChat]);

  useEffect(() => {
    if (!showInlineLessonChat || isFloatingUi || typeof window === 'undefined') {
      setInlinePanelMinHeightPx(0);
      return undefined;
    }
    const recalculateInlinePanelMinHeight = () => {
      const node = inlinePanelRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const availableHeight = Math.max(0, viewportHeight - Math.max(rect.top, 0) - INLINE_PANEL_BOTTOM_GAP_PX);
      const nextHeight = Math.floor(availableHeight);
      setInlinePanelMinHeightPx((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
    };
    recalculateInlinePanelMinHeight();
    window.addEventListener('resize', recalculateInlinePanelMinHeight);
    window.addEventListener('scroll', recalculateInlinePanelMinHeight, { passive: true });
    return () => {
      window.removeEventListener('resize', recalculateInlinePanelMinHeight);
      window.removeEventListener('scroll', recalculateInlinePanelMinHeight);
    };
  }, [isFloatingUi, showInlineLessonChat]);

  useEffect(() => {
    if (!lessonChatPreviewImage || typeof window === 'undefined') return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setLessonChatPreviewImage(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [lessonChatPreviewImage]);

  useEffect(() => {
    if (!lessonChatPreviewImage || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lessonChatPreviewImage]);

  const clearLessonChatImage = useCallback(() => {
    setLessonChatImageDataUrl('');
    setLessonChatImageName('');
    if (lessonChatImageInputRef.current) {
      lessonChatImageInputRef.current.value = '';
    }
  }, []);

  const handleLessonChatImageSelect = useCallback(async (file) => {
    if (!file) return;
    const mimeType = String(file.type || '').toLowerCase();
    if (!mimeType || !LESSON_CHAT_ALLOWED_IMAGE_TYPES.has(mimeType)) {
      setLessonChatError('Можно отправлять только изображения: PNG, JPG, WEBP, GIF.');
      return;
    }
    if (Number(file.size) > LESSON_CHAT_IMAGE_MAX_BYTES) {
      setLessonChatError('Изображение должно быть не больше 5 МБ.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setLessonChatImageDataUrl(dataUrl);
      setLessonChatImageName(String(file.name || '').trim());
      setLessonChatError('');
      if (lessonChatImageInputRef.current) {
        lessonChatImageInputRef.current.value = '';
      }
      if (lessonChatExpanded) {
        requestAnimationFrame(() => {
          const node = lessonChatListRef.current;
          if (node) node.scrollTop = node.scrollHeight;
        });
      }
    } catch (imageError) {
      setLessonChatError(imageError?.message || 'Не удалось прочитать изображение.');
    }
  }, [lessonChatExpanded]);

  const handleLessonChatSend = useCallback(async () => {
    const nextText = String(lessonChatText || '').trim();
    const nextImageDataUrl = String(lessonChatImageDataUrl || '').trim();
    const nextImageName = String(lessonChatImageName || '').trim();
    if ((!nextText && !nextImageDataUrl) || lessonChatSending) return;
    if (isTeacher && !lessonChatId) {
      setLessonChatError('Сначала выберите ученика для чата.');
      return;
    }
    setLessonChatSending(true);
    setLessonChatError('');
    const payload = {
      text: nextText,
      imageDataUrl: nextImageDataUrl,
      imageName: nextImageName,
    };
    try {
      if (isTeacher) {
        await api.sendStudentChatMessageForTeacher(lessonChatId, payload);
      } else {
        await api.sendStudentChatMessage(payload);
      }
      setLessonChatText('');
      clearLessonChatImage();
      await loadLessonChatMessages({ silent: true });
    } catch (chatSendError) {
      setLessonChatError(chatSendError?.message || String(chatSendError));
    } finally {
      setLessonChatSending(false);
    }
  }, [
    clearLessonChatImage,
    isTeacher,
    lessonChatId,
    lessonChatImageDataUrl,
    lessonChatImageName,
    lessonChatSending,
    lessonChatText,
    loadLessonChatMessages,
  ]);

  const applyStatus = useCallback((nextStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);
  const getAlertAudioTemplate = useCallback((soundKey) => {
    const key = String(soundKey || '');
    const source = RTC_ALERT_SOUND_SOURCES[key];
    if (!source || typeof window === 'undefined') return null;

    const cachedTemplates = alertAudioTemplatesRef.current;
    let template = cachedTemplates.get(key);
    if (!template) {
      template = new Audio(source);
      template.preload = 'auto';
      template.volume = RTC_ALERT_SOUND_VOLUME;
      cachedTemplates.set(key, template);
    }
    return template;
  }, []);

  const primeAlertSounds = useCallback(() => {
    Object.keys(RTC_ALERT_SOUND_SOURCES).forEach((soundKey) => {
      const template = getAlertAudioTemplate(soundKey);
      try {
        template?.load?.();
      } catch {}
    });
  }, [getAlertAudioTemplate]);

  const playAlertSound = useCallback((soundKey) => {
    const template = getAlertAudioTemplate(soundKey);
    if (!template) return;

    const audio = template.cloneNode(true);
    audio.preload = 'auto';
    audio.volume = RTC_ALERT_SOUND_VOLUME;
    const activeAudios = alertAudioActiveRef.current;
    const finalize = () => {
      activeAudios.delete(audio);
      audio.onended = null;
      audio.onerror = null;
    };

    activeAudios.add(audio);
    audio.onended = finalize;
    audio.onerror = finalize;
    try {
      audio.currentTime = 0;
      const playPromise = audio.play?.();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          finalize();
        });
      }
    } catch {
      finalize();
    }
  }, [getAlertAudioTemplate]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (previousStatus !== status) {
      if (previousStatus !== 'connected' && status === 'connected') {
        void playAlertSound('connected');
      } else if (previousStatus === 'connected' && status === 'idle') {
        void playAlertSound('disconnected');
      }
    }
    previousStatusRef.current = status;
  }, [playAlertSound, status]);

  const clearWsReconnectTimer = useCallback(() => {
    if (!wsReconnectTimerRef.current) return;
    clearTimeout(wsReconnectTimerRef.current);
    wsReconnectTimerRef.current = null;
  }, []);

  const resetWsReconnectState = useCallback(() => {
    clearWsReconnectTimer();
    wsReconnectAttemptRef.current = 0;
  }, [clearWsReconnectTimer]);

  const scheduleWsReconnect = useCallback((reasonText = '') => {
    if (manualCloseRef.current || !roomId) return false;
    if (wsReconnectTimerRef.current) return true;
    const nextAttempt = wsReconnectAttemptRef.current + 1;
    if (nextAttempt > WS_RECONNECT_MAX_ATTEMPTS) {
      setError('Не удалось восстановить соединение созвона. Подключитесь заново.');
      return false;
    }
    wsReconnectAttemptRef.current = nextAttempt;
    const baseDelay = Math.min(
      WS_RECONNECT_MAX_DELAY_MS,
      WS_RECONNECT_BASE_DELAY_MS * (2 ** Math.max(0, nextAttempt - 1))
    );
    const jitter = Math.floor(Math.random() * WS_RECONNECT_JITTER_MS);
    const delay = baseDelay + jitter;
    const reason = String(reasonText || '').trim();
    setError(reason || `Потеряно соединение. Переподключение (${nextAttempt}/${WS_RECONNECT_MAX_ATTEMPTS})...`);
    wsReconnectTimerRef.current = setTimeout(() => {
      wsReconnectTimerRef.current = null;
      if (manualCloseRef.current || !roomId) return;
      const callStarter = startCallRef.current;
      if (typeof callStarter === 'function') {
        callStarter({ isReconnect: true });
      }
    }, delay);
    return true;
  }, [roomId]);

  const updateMicSettingsPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const anchorNode = micSettingsButtonRef.current;
    if (!anchorNode) return;

    const anchorRect = anchorNode.getBoundingClientRect();
    const popupNode = micSettingsPopupRef.current;
    const popupHeight = popupNode?.getBoundingClientRect?.().height || MIC_SETTINGS_POPUP_ESTIMATED_HEIGHT;
    const popupWidth = Math.min(
      MIC_SETTINGS_POPUP_WIDTH,
      Math.max(260, window.innerWidth - (MIC_SETTINGS_POPUP_MARGIN * 2))
    );

    const maxLeft = Math.max(MIC_SETTINGS_POPUP_MARGIN, window.innerWidth - popupWidth - MIC_SETTINGS_POPUP_MARGIN);
    const left = clampToRange(anchorRect.right - popupWidth, MIC_SETTINGS_POPUP_MARGIN, maxLeft);

    let top = anchorRect.bottom + MIC_SETTINGS_POPUP_OFFSET;
    if (top + popupHeight + MIC_SETTINGS_POPUP_MARGIN > window.innerHeight) {
      top = anchorRect.top - popupHeight - MIC_SETTINGS_POPUP_OFFSET;
    }
    const maxTop = Math.max(MIC_SETTINGS_POPUP_MARGIN, window.innerHeight - popupHeight - MIC_SETTINGS_POPUP_MARGIN);
    top = clampToRange(top, MIC_SETTINGS_POPUP_MARGIN, maxTop);

    setMicSettingsPosition((prev) => {
      if (
        prev
        && Math.abs(prev.left - left) < 0.5
        && Math.abs(prev.top - top) < 0.5
        && Math.abs(prev.width - popupWidth) < 0.5
      ) {
        return prev;
      }
      return { left, top, width: popupWidth };
    });
  }, []);

  const refreshPeerConnectionSummary = useCallback(() => {
    const next = {
      total: 0,
      connected: 0,
      connecting: 0,
      disconnected: 0,
      failed: 0,
      closed: 0,
    };
    peersRef.current.forEach((peerState) => {
      const state = getRtcPeerConnectionState(peerState?.pc);
      next.total += 1;
      if (state === 'connected') {
        next.connected += 1;
      } else if (state === 'new' || state === 'connecting') {
        next.connecting += 1;
      } else if (state === 'disconnected') {
        next.disconnected += 1;
      } else if (state === 'failed') {
        next.failed += 1;
      } else if (state === 'closed') {
        next.closed += 1;
      } else {
        next.connecting += 1;
      }
    });
    setPeerConnectionSummary(next);
  }, []);

  const tuneAudioSender = useCallback((sender, qualityOverride) => {
    if (!sender || typeof sender.getParameters !== 'function') return;
    const quality = normalizeConnectionQuality(qualityOverride || connectionQualityRef.current);
    const profile = getConnectionAdaptiveProfile(quality);
    try {
      const params = sender.getParameters() || {};
      const encodings = Array.isArray(params.encodings) ? params.encodings : [{}];
      encodings[0] = {
        ...(encodings[0] || {}),
        maxBitrate: profile.audioBitrate,
        dtx: 'enabled',
        priority: quality === 'poor' ? 'high' : 'medium',
      };
      params.encodings = encodings;
      sender.setParameters(params).catch(() => {});
    } catch {}
  }, []);

  const tuneVideoSender = useCallback((sender, options = {}) => {
    if (!sender || typeof sender.getParameters !== 'function') return;
    const kind = options?.kind === 'camera' ? 'camera' : 'screen';
    const quality = normalizeConnectionQuality(options?.quality || connectionQualityRef.current);
    const profile = getConnectionAdaptiveProfile(quality, highVideoLoadRef.current);
    const isCamera = kind === 'camera';
    const maxBitrate = isCamera ? profile.cameraBitrate : profile.screenBitrate;
    const maxFramerate = isCamera ? profile.cameraFramerate : profile.screenFramerate;
    const scaleResolutionDownBy = Math.max(1, isCamera ? profile.cameraScale : profile.screenScale);
    try {
      const params = sender.getParameters() || {};
      const encodings = Array.isArray(params.encodings) ? params.encodings : [{}];
      encodings[0] = {
        ...(encodings[0] || {}),
        maxBitrate,
        maxFramerate,
        scaleResolutionDownBy,
        priority: isCamera ? (quality === 'poor' ? 'high' : 'medium') : 'high',
      };
      params.degradationPreference = profile.degradationPreference;
      params.encodings = encodings;
      sender.setParameters(params).catch(() => {});
    } catch {}
  }, []);

  const retuneAllPeerSenders = useCallback((qualityOverride) => {
    const quality = normalizeConnectionQuality(qualityOverride || connectionQualityRef.current);
    peersRef.current.forEach((peerState) => {
      if (!peerState) return;
      if (peerState.audioSender) {
        tuneAudioSender(peerState.audioSender, quality);
      }
      if (peerState.screenSender) {
        tuneVideoSender(peerState.screenSender, { kind: 'screen', quality });
      }
      if (peerState.cameraSender) {
        tuneVideoSender(peerState.cameraSender, { kind: 'camera', quality });
      }
    });
  }, [tuneAudioSender, tuneVideoSender]);

  useEffect(() => {
    const localVideoCount = (screenSharing ? 1 : 0) + (cameraEnabled ? 1 : 0);
    const remoteVideoCount = remotePeers.reduce((total, peer) => {
      if (!peer) return total;
      if (peer.hasMediaState) {
        return total + (peer.isScreenSharing ? 1 : 0) + (peer.isCameraEnabled ? 1 : 0);
      }
      const stream = peer.stream || null;
      return total + getLiveVideoTracks(stream).length;
    }, 0);
    const shouldUseHighVideoLoadProfile = (localVideoCount + remoteVideoCount) >= 2;
    if (highVideoLoadRef.current === shouldUseHighVideoLoadProfile) return;
    highVideoLoadRef.current = shouldUseHighVideoLoadProfile;
    retuneAllPeerSenders();
  }, [cameraEnabled, remotePeers, retuneAllPeerSenders, screenSharing]);

  const syncRemotePeers = useCallback(() => {
    const next = [];
    const peerIds = new Set([
      ...Array.from(peerMetaRef.current.keys()),
      ...Array.from(remoteStreamsRef.current.keys()),
    ]);
    peerIds.forEach((peerId) => {
      const meta = peerMetaRef.current.get(peerId) || {};
      const stream = remoteStreamsRef.current.get(peerId) || null;
      const role = typeof meta.role === 'string' ? meta.role.trim() : '';
      const roleLabel = role ? formatRtcRoleLabel(role) : 'Участник';
      const hasScreenState = Object.prototype.hasOwnProperty.call(meta, 'isScreenSharing');
      const hasCameraState = Object.prototype.hasOwnProperty.call(meta, 'isCameraEnabled');
      const hasMediaState = hasScreenState || hasCameraState;
      const isScreenSharing = Boolean(meta.isScreenSharing);
      const isCameraEnabled = Boolean(meta.isCameraEnabled);
      const screenTrackId = typeof meta.screenTrackId === 'string' ? meta.screenTrackId.trim() : '';
      const cameraTrackId = typeof meta.cameraTrackId === 'string' ? meta.cameraTrackId.trim() : '';
      const isVideoEnabled = isScreenSharing || isCameraEnabled;
      const subtitle = isScreenSharing
        ? `${roleLabel} в созвоне | экран включен`
        : isCameraEnabled
          ? `${roleLabel} в созвоне | камера включена`
          : roleLabel;
      next.push({
        peerId,
        stream,
        title: typeof meta.name === 'string' && meta.name.trim() ? meta.name : 'Участник',
        subtitle,
        isScreenSharing,
        isCameraEnabled,
        hasMediaState,
        screenTrackId,
        cameraTrackId,
        isVideoEnabled,
      });
    });
    next.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    setRemotePeers(next);
  }, []);

  useEffect(() => {
    const previousStateByPeer = remoteScreenShareStateRef.current;
    const nextStateByPeer = new Map();

    remotePeers.forEach((peer) => {
      const peerId = typeof peer?.peerId === 'string' ? peer.peerId.trim() : '';
      if (!peerId || !peer?.hasMediaState) return;
      const isScreenSharing = Boolean(peer.isScreenSharing);
      const previousState = previousStateByPeer.get(peerId);
      if (typeof previousState === 'boolean' && previousState !== isScreenSharing) {
        void playAlertSound(isScreenSharing ? 'screenOn' : 'screenOff');
      }
      nextStateByPeer.set(peerId, isScreenSharing);
    });

    remoteScreenShareStateRef.current = nextStateByPeer;
  }, [playAlertSound, remotePeers]);

  const sendWs = useCallback((payload) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  const sendLocalMediaStateToPeer = useCallback((peerId) => {
    const normalizedPeerId = typeof peerId === 'string' ? peerId.trim() : '';
    const roomId = activeRoomRef.current;
    if (!normalizedPeerId || !roomId) return false;
    const screenTrack = localScreenTrackRef.current;
    const cameraTrack = localCameraTrackRef.current;
    const isScreenSharing = Boolean(screenTrack && screenTrack.readyState === 'live');
    const isCameraEnabled = Boolean(cameraTrack && cameraTrack.readyState === 'live');
    const screenTrackId = isScreenSharing ? screenTrack.id : '';
    const cameraTrackId = isCameraEnabled ? cameraTrack.id : '';
    return sendWs({
      type: 'signal',
      roomId,
      targetId: normalizedPeerId,
      signal: {
        mediaState: {
          isScreenSharing,
          isCameraEnabled,
          screenTrackId,
          cameraTrackId,
        },
      },
    });
  }, [sendWs]);

  const broadcastLocalMediaStateToPeers = useCallback(() => {
    peersRef.current.forEach((peerState, peerId) => {
      const pcState = getRtcPeerConnectionState(peerState?.pc);
      if (pcState === 'closed' || pcState === 'failed') return;
      sendLocalMediaStateToPeer(peerId);
    });
  }, [sendLocalMediaStateToPeer]);

  const clearJoinAckTimer = useCallback(() => {
    if (!joinAckTimerRef.current) return;
    clearTimeout(joinAckTimerRef.current);
    joinAckTimerRef.current = null;
  }, []);

  const startJoinAckTimer = useCallback((ws) => {
    if (!ws) return;
    clearJoinAckTimer();
    joinAckTimerRef.current = setTimeout(() => {
      if (wsRef.current !== ws) return;
      if (statusRef.current !== 'connecting') return;
      wsHadErrorRef.current = true;
      setError('Не удалось подтвердить подключение к комнате.');
      try { ws.close(1013, 'Join timeout'); } catch {}
    }, JOIN_ACK_TIMEOUT_MS);
  }, [clearJoinAckTimer]);

  const requestRoomResync = useCallback(() => {
    const ws = wsRef.current;
    const roomId = activeRoomRef.current;
    const now = Date.now();
    if (!roomId || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (manualCloseRef.current) return;
    if (statusRef.current === 'connecting') return;
    if (now < roomResyncCooldownUntilRef.current) return;
    roomResyncCooldownUntilRef.current = now + ROOM_RESYNC_COOLDOWN_MS;
    clearJoinAckTimer();
    wsHadErrorRef.current = false;
    applyStatus('connecting');
    setSocketStatus('connected');
    sendWs({ type: 'join', roomId });
    startJoinAckTimer(ws);
  }, [applyStatus, clearJoinAckTimer, sendWs, startJoinAckTimer]);

  const mapPresenceParticipants = useCallback((participants) => {
    const list = Array.isArray(participants) ? participants : [];
    const nextPeers = list
      .map((peer, index) => {
        const peerId = typeof peer?.id === 'string' ? peer.id.trim() : '';
        const name = typeof peer?.name === 'string' ? peer.name.trim() : '';
        const role = typeof peer?.role === 'string' ? peer.role.trim() : '';
        const isScreenSharing = Boolean(peer?.isScreenSharing);
        const isCameraEnabled = Boolean(peer?.isCameraEnabled);
        const screenTrackId = typeof peer?.screenTrackId === 'string' ? peer.screenTrackId.trim() : '';
        const cameraTrackId = typeof peer?.cameraTrackId === 'string' ? peer.cameraTrackId.trim() : '';
        const isVideoEnabled = isScreenSharing || isCameraEnabled;
        const roleLabel = formatRtcRoleLabel(role);
        return {
          peerId: `presence:${peerId || index}`,
          stream: null,
          title: name || 'Участник',
          subtitle: isScreenSharing
            ? `${roleLabel} в комнате | экран включен`
            : isCameraEnabled
              ? `${roleLabel} в комнате | камера включена`
            : `${roleLabel} в комнате`,
          isScreenSharing,
          isCameraEnabled,
          screenTrackId,
          cameraTrackId,
          isVideoEnabled,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    setPresencePeers(nextPeers);
  }, []);

  const closePresenceSocket = useCallback(() => {
    if (presenceReconnectTimerRef.current) {
      clearTimeout(presenceReconnectTimerRef.current);
      presenceReconnectTimerRef.current = null;
    }
    presenceReconnectAttemptRef.current = 0;
    if (presencePingTimerRef.current) {
      clearInterval(presencePingTimerRef.current);
      presencePingTimerRef.current = null;
    }
    lastPresencePongAtRef.current = 0;
    const ws = presenceWsRef.current;
    presenceWsRef.current = null;
    if (!ws) return;
    try {
      ws.close();
    } catch {}
  }, []);

  const getStreamForVideoTrack = useCallback((track) => {
    if (!track || track.kind !== 'video') return null;
    const cached = videoTrackStreamsRef.current.get(track.id);
    if (cached) {
      const hasTrack = cached.getVideoTracks().some((existingTrack) => existingTrack.id === track.id);
      if (hasTrack) return cached;
      cached.getVideoTracks().forEach((existingTrack) => {
        cached.removeTrack(existingTrack);
      });
      cached.addTrack(track);
      return cached;
    }
    const stream = new MediaStream([track]);
    videoTrackStreamsRef.current.set(track.id, stream);
    return stream;
  }, []);

  const syncLocalTracksToPeer = useCallback((peerState) => {
    if (!peerState?.pc) return;
    const { pc } = peerState;
    const replaceSenderTrack = (sender, track) => {
      if (!sender || typeof sender.replaceTrack !== 'function') return false;
      try {
        sender.replaceTrack(track).catch(() => {});
        return true;
      } catch {
        return false;
      }
    };
    const processedAudioTrack = localAudioTrackRef.current;
    const rawAudioTrack = localRawAudioTrackRef.current;
    const isBackgroundTab = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const preferredAudioTrack = isBackgroundTab ? rawAudioTrack : processedAudioTrack;
    const fallbackAudioTrack = isBackgroundTab ? processedAudioTrack : rawAudioTrack;
    const livePreferredAudioTrack = preferredAudioTrack && preferredAudioTrack.readyState === 'live'
      ? preferredAudioTrack
      : null;
    const liveFallbackAudioTrack = fallbackAudioTrack && fallbackAudioTrack.readyState === 'live'
      ? fallbackAudioTrack
      : null;
    const audioTrack = livePreferredAudioTrack || liveFallbackAudioTrack;
    const screenTrack = localScreenTrackRef.current;
    const cameraTrack = localCameraTrackRef.current;
    const liveScreenTrack = screenTrack && screenTrack.readyState === 'live' ? screenTrack : null;
    const liveCameraTrack = cameraTrack && cameraTrack.readyState === 'live' ? cameraTrack : null;

    if (audioTrack && audioTrack.readyState === 'live') {
      if (peerState.audioSender) {
        const replaced = replaceSenderTrack(peerState.audioSender, audioTrack);
        if (!replaced) {
          try { pc.removeTrack(peerState.audioSender); } catch {}
          peerState.audioSender = pc.addTrack(audioTrack, localStreamRef.current);
        }
        tuneAudioSender(peerState.audioSender);
      } else {
        peerState.audioSender = pc.addTrack(audioTrack, localStreamRef.current);
        tuneAudioSender(peerState.audioSender);
      }
    } else if (peerState.audioSender) {
      replaceSenderTrack(peerState.audioSender, null);
      try { pc.removeTrack(peerState.audioSender); } catch {}
      peerState.audioSender = null;
    }

    const syncVideoSender = (senderKey, track) => {
      const currentSender = peerState[senderKey] || null;
      const videoKind = senderKey === 'cameraSender' ? 'camera' : 'screen';
      if (track) {
        if (currentSender) {
          const replaced = replaceSenderTrack(currentSender, track);
          let senderToTune = currentSender;
          if (!replaced) {
            try { pc.removeTrack(currentSender); } catch {}
            senderToTune = pc.addTrack(track, localStreamRef.current);
            peerState[senderKey] = senderToTune;
          }
          tuneVideoSender(senderToTune, { kind: videoKind });
          return;
        }
        peerState[senderKey] = pc.addTrack(track, localStreamRef.current);
        tuneVideoSender(peerState[senderKey], { kind: videoKind });
        return;
      }
      if (!currentSender) return;
      const cleared = replaceSenderTrack(currentSender, null);
      if (cleared) {
        // Keep sender/transceiver for stable second screen-share start without black remote frames.
        return;
      }
      try { pc.removeTrack(currentSender); } catch {}
      peerState[senderKey] = null;
    };

    syncVideoSender('screenSender', liveScreenTrack);
    syncVideoSender('cameraSender', liveCameraTrack);
  }, [tuneAudioSender, tuneVideoSender]);

  const syncLocalTracksToAllPeers = useCallback(() => {
    peersRef.current.forEach((peerState) => {
      syncLocalTracksToPeer(peerState);
    });
  }, [syncLocalTracksToPeer]);

  const stopConnectionStatsPolling = useCallback(() => {
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    lastInboundAudioRef.current.clear();
    connectionQualityRef.current = 'ok';
    setConnectionStats({
      quality: 'unknown',
      lossPercent: 0,
      jitterMs: 0,
      rttMs: 0,
    });
  }, []);

  const pollConnectionStats = useCallback(async () => {
    const peers = Array.from(peersRef.current.entries());
    if (!peers.length) {
      connectionQualityRef.current = 'ok';
      setConnectionStats({
        quality: 'unknown',
        lossPercent: 0,
        jitterMs: 0,
        rttMs: 0,
      });
      return;
    }

    let totalPackets = 0;
    let totalLost = 0;
    const jitterSamples = [];
    const rttSamples = [];

    for (const [peerId, peerState] of peers) {
      const pc = peerState?.pc;
      if (!pc || typeof pc.getStats !== 'function') continue;
      let statsReport = null;
      try {
        statsReport = await pc.getStats();
      } catch {
        continue;
      }
      if (!statsReport) continue;

      statsReport.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'audio' && !report.isRemote) {
          const received = Number(report.packetsReceived) || 0;
          const lost = Number(report.packetsLost) || 0;
          const prev = lastInboundAudioRef.current.get(peerId) || { received: 0, lost: 0 };
          const receivedDelta = Math.max(0, received - prev.received);
          const lostDelta = Math.max(0, lost - prev.lost);
          const packetDelta = receivedDelta + lostDelta;
          if (packetDelta > 0) {
            totalPackets += packetDelta;
            totalLost += lostDelta;
          }
          lastInboundAudioRef.current.set(peerId, { received, lost });
          if (Number.isFinite(report.jitter) && report.jitter >= 0) {
            jitterSamples.push(report.jitter * 1000);
          }
        }

        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          if (Number.isFinite(report.currentRoundTripTime) && report.currentRoundTripTime >= 0) {
            rttSamples.push(report.currentRoundTripTime * 1000);
          }
        }
      });
    }

    const lossPercent = totalPackets > 0 ? (totalLost / totalPackets) * 100 : 0;
    const jitterMs = jitterSamples.length
      ? jitterSamples.reduce((sum, value) => sum + value, 0) / jitterSamples.length
      : 0;
    const rttMs = rttSamples.length
      ? rttSamples.reduce((sum, value) => sum + value, 0) / rttSamples.length
      : 0;

    const quality = lossPercent > 8 || jitterMs > 50 || rttMs > 250
      ? 'poor'
      : lossPercent > 3 || jitterMs > 25 || rttMs > 130
        ? 'ok'
        : 'good';
    const normalizedQuality = normalizeConnectionQuality(quality);
    if (connectionQualityRef.current !== normalizedQuality) {
      connectionQualityRef.current = normalizedQuality;
      retuneAllPeerSenders(normalizedQuality);
    }

    setConnectionStats({
      quality: normalizedQuality,
      lossPercent,
      jitterMs,
      rttMs,
    });
  }, [retuneAllPeerSenders]);

  const startConnectionStatsPolling = useCallback(() => {
    if (statsTimerRef.current) return;
    pollConnectionStats().catch(() => {});
    statsTimerRef.current = setInterval(() => {
      pollConnectionStats().catch(() => {});
    }, CONNECTION_STATS_INTERVAL_MS);
  }, [pollConnectionStats]);

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((peerState) => {
      if (peerState.disconnectTimer) {
        clearTimeout(peerState.disconnectTimer);
        peerState.disconnectTimer = null;
      }
      try {
        peerState.pc.ontrack = null;
        peerState.pc.onicecandidate = null;
        peerState.pc.onconnectionstatechange = null;
        peerState.pc.oniceconnectionstatechange = null;
        peerState.pc.close();
      } catch {}
    });
    peersRef.current.clear();
    peerMetaRef.current.clear();
    remoteStreamsRef.current.clear();
    lastInboundAudioRef.current.clear();
    videoTrackStreamsRef.current.clear();
    setRemotePeers([]);
    setSpeakingByPeer({});
    setVolumeByPeer({});
    setPeerConnectionSummary({
      total: 0,
      connected: 0,
      connecting: 0,
      disconnected: 0,
      failed: 0,
      closed: 0,
    });
  }, []);

  const detachPeer = useCallback((peerId, options = {}) => {
    const normalizedPeerId = typeof peerId === 'string' ? peerId.trim() : '';
    if (!normalizedPeerId) return;

    const { closeConnection = true } = options;
    const peerState = peersRef.current.get(normalizedPeerId);

    if (peerState?.disconnectTimer) {
      clearTimeout(peerState.disconnectTimer);
      peerState.disconnectTimer = null;
    }

    if (closeConnection && peerState?.pc) {
      try {
        peerState.pc.ontrack = null;
        peerState.pc.onicecandidate = null;
        peerState.pc.onconnectionstatechange = null;
        peerState.pc.oniceconnectionstatechange = null;
        peerState.pc.close();
      } catch {}
    }

    peersRef.current.delete(normalizedPeerId);
    peerMetaRef.current.delete(normalizedPeerId);
    remoteStreamsRef.current.delete(normalizedPeerId);
    lastInboundAudioRef.current.delete(normalizedPeerId);
    setSpeakingByPeer((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedPeerId)) return prev;
      const next = { ...prev };
      delete next[normalizedPeerId];
      return next;
    });
    setVolumeByPeer((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedPeerId)) return prev;
      const next = { ...prev };
      delete next[normalizedPeerId];
      return next;
    });
    refreshPeerConnectionSummary();
    syncRemotePeers();
  }, [refreshPeerConnectionSummary, syncRemotePeers]);

  const handlePeerSpeakingChange = useCallback((peerId, isSpeaking) => {
    const normalizedPeerId = typeof peerId === 'string' ? peerId.trim() : '';
    if (!normalizedPeerId) return;
    setSpeakingByPeer((prev) => {
      const current = Boolean(prev[normalizedPeerId]);
      if (current === isSpeaking) return prev;
      if (!isSpeaking) {
        if (!Object.prototype.hasOwnProperty.call(prev, normalizedPeerId)) return prev;
        const next = { ...prev };
        delete next[normalizedPeerId];
        return next;
      }
      return {
        ...prev,
        [normalizedPeerId]: true,
      };
    });
  }, []);

  const setPeerVolumePercent = useCallback((peerId, percentValue) => {
    const normalizedPeerId = typeof peerId === 'string' ? peerId.trim() : '';
    if (!normalizedPeerId) return;
    const nextVolume = percentToPeerVolume(Number(percentValue));
    setVolumeByPeer((prev) => {
      const currentVolume = normalizePeerVolume(prev[normalizedPeerId]);
      if (Math.abs(currentVolume - nextVolume) < 0.0001) return prev;
      return {
        ...prev,
        [normalizedPeerId]: nextVolume,
      };
    });
  }, []);

  const adjustPeerVolume = useCallback((peerId, percentDelta) => {
    const normalizedPeerId = typeof peerId === 'string' ? peerId.trim() : '';
    if (!normalizedPeerId) return;
    setVolumeByPeer((prev) => {
      const currentPercent = peerVolumeToPercent(prev[normalizedPeerId]);
      const nextPercent = Math.max(0, Math.min(100, currentPercent + Number(percentDelta || 0)));
      const nextVolume = percentToPeerVolume(nextPercent);
      const currentVolume = normalizePeerVolume(prev[normalizedPeerId]);
      if (Math.abs(currentVolume - nextVolume) < 0.0001) return prev;
      return {
        ...prev,
        [normalizedPeerId]: nextVolume,
      };
    });
  }, []);

  const setMicSensitivityPercentSafe = useCallback((nextValue) => {
    setMicSensitivityPercent((prev) => {
      const currentPercent = normalizeMicSensitivityPercent(prev);
      const nextPercent = normalizeMicSensitivityPercent(Number(nextValue));
      return currentPercent === nextPercent ? prev : nextPercent;
    });
  }, []);

  const adjustMicSensitivity = useCallback((percentDelta) => {
    setMicSensitivityPercent((prev) => {
      const currentPercent = normalizeMicSensitivityPercent(prev);
      const nextPercent = normalizeMicSensitivityPercent(currentPercent + Number(percentDelta || 0));
      return currentPercent === nextPercent ? prev : nextPercent;
    });
  }, []);

  const setMicTriggerThresholdPercentSafe = useCallback((nextValue) => {
    setMicTriggerThresholdPercent((prev) => {
      const currentPercent = normalizeMicTriggerThresholdPercent(prev);
      const nextPercent = normalizeMicTriggerThresholdPercent(Number(nextValue));
      return currentPercent === nextPercent ? prev : nextPercent;
    });
  }, []);

  const adjustMicTriggerThreshold = useCallback((percentDelta) => {
    setMicTriggerThresholdPercent((prev) => {
      const currentPercent = normalizeMicTriggerThresholdPercent(prev);
      const nextPercent = normalizeMicTriggerThresholdPercent(currentPercent + Number(percentDelta || 0));
      return currentPercent === nextPercent ? prev : nextPercent;
    });
  }, []);

  const closeVolumePopup = useCallback(() => {
    setVolumePopup(null);
  }, []);

  const openVolumePopupForParticipant = useCallback((event, participant) => {
    const normalizedPeerId = typeof participant?.peerId === 'string' ? participant.peerId.trim() : '';
    if (!normalizedPeerId) return;
    if (statusRef.current !== 'connected') return;
    event.preventDefault();
    event.stopPropagation();

    const popupWidth = 244;
    const popupHeight = 132;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
    const margin = 8;
    const x = Math.min(Math.max(event.clientX, margin), Math.max(margin, viewportWidth - popupWidth - margin));
    const y = Math.min(Math.max(event.clientY, margin), Math.max(margin, viewportHeight - popupHeight - margin));

    setVolumePopup({
      peerId: normalizedPeerId,
      title: typeof participant?.title === 'string' && participant.title.trim()
        ? participant.title
        : 'Участник',
      x,
      y,
    });
  }, []);

  const stopPanelDrag = useCallback(() => {
    const dragState = panelDragStateRef.current;
    if (!dragState) return;
    window.removeEventListener('pointermove', dragState.onPointerMove);
    window.removeEventListener('pointerup', dragState.onPointerUp);
    window.removeEventListener('pointercancel', dragState.onPointerUp);
    if (dragState.target?.releasePointerCapture && Number.isFinite(dragState.pointerId)) {
      try {
        if (dragState.target.hasPointerCapture?.(dragState.pointerId)) {
          dragState.target.releasePointerCapture(dragState.pointerId);
        }
      } catch {}
    }
    panelDragStateRef.current = null;
  }, []);

  const startPanelDrag = useCallback((event, panelKind) => {
    if (!event || panelKind === 'full') return;
    if (event.button !== 0) return;
    const dragTarget = event.target;
    if (
      typeof Element !== 'undefined'
      && dragTarget instanceof Element
      && dragTarget.closest('button, a, input, select, textarea, [role="button"], [data-no-panel-drag]')
    ) {
      return;
    }
    const targetRef = panelKind === 'collapsed' ? collapsedPanelRef.current : floatingPanelRef.current;
    if (!targetRef) return;
    event.preventDefault();
    event.stopPropagation();
    stopPanelDrag();

    const rect = targetRef.getBoundingClientRect();
    const panelWidth = rect.width;
    const panelHeight = rect.height;
    const pointerOffsetX = event.clientX - rect.left;
    const pointerOffsetY = event.clientY - rect.top;

    if (panelKind === 'collapsed' && !collapsedPanelPosition) {
      setCollapsedPanelPosition(clampPanelPositionToViewport({
        x: rect.left,
        y: rect.top,
      }, panelWidth, panelHeight));
    }
    if (panelKind === 'floating' && !floatingPanelPosition) {
      const anchoredPosition = clampPanelPositionToViewport({
        x: rect.left,
        y: rect.top,
      }, panelWidth, panelHeight);
      setFloatingPanelPosition({
        ...anchoredPosition,
        width: panelWidth,
      });
    }

    const onPointerMove = (moveEvent) => {
      const nextPosition = clampPanelPositionToViewport({
        x: moveEvent.clientX - pointerOffsetX,
        y: moveEvent.clientY - pointerOffsetY,
      }, panelWidth, panelHeight);
      if (panelKind === 'collapsed') {
        setCollapsedPanelPosition(nextPosition);
      } else {
        setFloatingPanelPosition({
          ...nextPosition,
          width: panelWidth,
        });
      }
    };
    const onPointerUp = () => {
      stopPanelDrag();
    };

    if (targetRef.setPointerCapture && Number.isFinite(event.pointerId)) {
      try {
        targetRef.setPointerCapture(event.pointerId);
      } catch {}
    }

    panelDragStateRef.current = {
      onPointerMove,
      onPointerUp,
      target: targetRef,
      pointerId: event.pointerId,
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [collapsedPanelPosition, floatingPanelPosition, stopPanelDrag]);

  const stopLocalSelfSpeakingObserver = useCallback(() => {
    const cleanup = localSelfSpeakingObserverCleanupRef.current;
    localSelfSpeakingObserverCleanupRef.current = null;
    if (typeof cleanup === 'function') {
      try {
        cleanup();
      } catch {}
    }
  }, []);

  const restartLocalSelfSpeakingObserver = useCallback((track) => {
    const observedTrack = track || localAudioTrackRef.current;
    stopLocalSelfSpeakingObserver();
    if (!observedTrack || observedTrack.readyState !== 'live') return;
    localSelfSpeakingObserverCleanupRef.current = observeAudioTrackSpeaking(
      observedTrack,
      (isSpeaking) => {
        if (localAudioTrackRef.current !== observedTrack) return;
        const isTrackEnabled = Boolean(localAudioTrackRef.current?.enabled);
        setSelfSpeaking(Boolean(isSpeaking) && statusRef.current === 'connected' && isTrackEnabled);
      },
      SPEAKING_RMS_THRESHOLD,
      (rms) => {
        if (localAudioTrackRef.current !== observedTrack) return;
        const isPrimaryMicAnalyserActive = Boolean(localMicAnalyserNodeRef.current && localMicAudioContextRef.current);
        if (isPrimaryMicAnalyserActive) return;
        const nextLevel = rmsToMicLevelPercent(rms);
        setMicInputLevelPercent((prev) => (prev === nextLevel ? prev : nextLevel));
      }
    );
  }, [stopLocalSelfSpeakingObserver]);

  const disposeLocalMicProcessing = useCallback(() => {
    stopLocalSelfSpeakingObserver();
    const sourceNode = localMicSourceNodeRef.current;
    const gainNode = localMicGainNodeRef.current;
    const gateGainNode = localMicGateGainNodeRef.current;
    const analyserNode = localMicAnalyserNodeRef.current;
    const destination = localMicDestinationRef.current;
    const audioContext = localMicAudioContextRef.current;
    const levelRafId = localMicLevelRafRef.current;

    localMicSourceNodeRef.current = null;
    localMicGainNodeRef.current = null;
    localMicGateGainNodeRef.current = null;
    localMicAnalyserNodeRef.current = null;
    localMicDestinationRef.current = null;
    localMicAudioContextRef.current = null;
    localMicLevelRafRef.current = null;
    localMicSpeakingOpenRef.current = false;

    if (levelRafId) {
      cancelAnimationFrame(levelRafId);
    }
    try { sourceNode?.disconnect?.(); } catch {}
    try { gainNode?.disconnect?.(); } catch {}
    try { gateGainNode?.disconnect?.(); } catch {}
    try { analyserNode?.disconnect?.(); } catch {}
    try {
      destination?.stream?.getTracks?.().forEach((track) => {
        try { track.stop(); } catch {}
      });
    } catch {}
    audioContext?.close?.().catch(() => {});
    setSelfSpeaking(false);
    setMicInputLevelPercent(0);
  }, [stopLocalSelfSpeakingObserver]);

  const createLocalProcessedMicTrack = useCallback((rawTrack) => {
    if (!rawTrack || rawTrack.readyState !== 'live' || typeof window === 'undefined') return rawTrack;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return rawTrack;

    try {
      const audioContext = new AudioContextCtor();
      const sourceStream = new MediaStream([rawTrack]);
      const sourceNode = audioContext.createMediaStreamSource(sourceStream);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = micSensitivityPercentToGain(micSensitivityPercent);
      const gateGainNode = audioContext.createGain();
      gateGainNode.gain.value = 0;
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = SPEAKING_ANALYSER_FFT_SIZE;
      analyserNode.smoothingTimeConstant = 0.6;
      const destination = audioContext.createMediaStreamDestination();
      sourceNode.connect(analyserNode);
      sourceNode.connect(gainNode);
      gainNode.connect(gateGainNode);
      gateGainNode.connect(destination);
      audioContext.resume?.().catch(() => {});
      const processedTrack = destination.stream.getAudioTracks()[0] || null;
      if (!processedTrack) {
        try { sourceNode.disconnect(); } catch {}
        try { gainNode.disconnect(); } catch {}
        try { gateGainNode.disconnect(); } catch {}
        try { analyserNode.disconnect(); } catch {}
        audioContext.close?.().catch(() => {});
        return rawTrack;
      }

      localMicAudioContextRef.current = audioContext;
      localMicSourceNodeRef.current = sourceNode;
      localMicGainNodeRef.current = gainNode;
      localMicGateGainNodeRef.current = gateGainNode;
      localMicAnalyserNodeRef.current = analyserNode;
      localMicDestinationRef.current = destination;
      localMicSpeakingOpenRef.current = false;

      const levelData = new Float32Array(analyserNode.fftSize);
      const monitorMicLevel = () => {
        if (
          localMicAudioContextRef.current !== audioContext
          || localMicAnalyserNodeRef.current !== analyserNode
          || rawTrack.readyState !== 'live'
        ) {
          return;
        }

        analyserNode.getFloatTimeDomainData(levelData);
        let sumSquares = 0;
        for (let index = 0; index < levelData.length; index += 1) {
          const sample = levelData[index];
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / levelData.length);
        const threshold = micTriggerThresholdRmsRef.current;
        const gateOpen = Number.isFinite(threshold) ? rms >= threshold : rms >= SPEAKING_RMS_THRESHOLD;
        if (localMicSpeakingOpenRef.current !== gateOpen) {
          localMicSpeakingOpenRef.current = gateOpen;
        }
        try {
          gateGainNode.gain.setTargetAtTime(gateOpen ? 1 : 0, audioContext.currentTime, gateOpen ? 0.012 : 0.028);
        } catch {
          gateGainNode.gain.value = gateOpen ? 1 : 0;
        }

        const nextLevel = rmsToMicLevelPercent(rms);
        setMicInputLevelPercent((prev) => (prev === nextLevel ? prev : nextLevel));

        localMicLevelRafRef.current = requestAnimationFrame(monitorMicLevel);
      };
      localMicLevelRafRef.current = requestAnimationFrame(monitorMicLevel);
      try {
        processedTrack.contentHint = 'speech';
      } catch {}
      return processedTrack;
    } catch {
      return rawTrack;
    }
  }, [micSensitivityPercent]);

  const stopMicTrack = useCallback((withSync = true) => {
    const track = localAudioTrackRef.current;
    const rawTrack = localRawAudioTrackRef.current;
    if (!track && !rawTrack) return;
    if (track) {
      track.onended = null;
      try { track.stop(); } catch {}
      localStreamRef.current.removeTrack(track);
    }
    if (rawTrack && rawTrack !== track) {
      rawTrack.onended = null;
      try { rawTrack.stop(); } catch {}
    }
    localAudioTrackRef.current = null;
    localRawAudioTrackRef.current = null;
    disposeLocalMicProcessing();
    setMicEnabled(false);
    if (withSync) syncLocalTracksToAllPeers();
  }, [disposeLocalMicProcessing, syncLocalTracksToAllPeers]);

  const stopCameraTrack = useCallback((withSync = true) => {
    const track = localCameraTrackRef.current;
    if (track) {
      track.onended = null;
      try { track.stop(); } catch {}
      videoTrackStreamsRef.current.delete(track.id);
      localCameraTrackRef.current = null;
      localStreamRef.current.removeTrack(track);
    }
    if (localCameraStreamRef.current) {
      localCameraStreamRef.current.getTracks().forEach((streamTrack) => {
        try { streamTrack.stop(); } catch {}
      });
      localCameraStreamRef.current = null;
    }
    setCameraEnabled(false);
    if (withSync) syncLocalTracksToAllPeers();
  }, [syncLocalTracksToAllPeers]);

  const stopScreenTrack = useCallback((withSync = true) => {
    const track = localScreenTrackRef.current;
    if (track) {
      track.onended = null;
      try { track.stop(); } catch {}
      videoTrackStreamsRef.current.delete(track.id);
      localScreenTrackRef.current = null;
      localStreamRef.current.removeTrack(track);
    }
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((streamTrack) => {
        try { streamTrack.stop(); } catch {}
      });
      localScreenStreamRef.current = null;
    }
    setScreenSharing(false);
    if (withSync) syncLocalTracksToAllPeers();
  }, [syncLocalTracksToAllPeers]);

  const ensureMicTrack = useCallback(async () => {
    const existing = localAudioTrackRef.current;
    if (existing && existing.readyState === 'live') {
      existing.enabled = true;
      const rawTrack = localRawAudioTrackRef.current;
      if (rawTrack && rawTrack.readyState === 'live') {
        rawTrack.enabled = true;
      }
      setMicEnabled(true);
      if (!localMicAnalyserNodeRef.current || !localMicAudioContextRef.current) {
        restartLocalSelfSpeakingObserver(existing);
      }
      syncLocalTracksToAllPeers();
      return existing;
    }

    if (existing) {
      localStreamRef.current.removeTrack(existing);
      localAudioTrackRef.current = null;
    }
    const staleRawTrack = localRawAudioTrackRef.current;
    if (staleRawTrack) {
      staleRawTrack.onended = null;
      try { staleRawTrack.stop(); } catch {}
      localRawAudioTrackRef.current = null;
    }
    disposeLocalMicProcessing();

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Браузер не поддерживает доступ к микрофону.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    const rawTrack = stream.getAudioTracks()[0];
    if (!rawTrack) {
      throw new Error('Не удалось получить аудиодорожку.');
    }
    try {
      rawTrack.contentHint = 'speech';
    } catch {}

    stream.getTracks().forEach((streamTrack) => {
      if (streamTrack !== rawTrack) {
        try { streamTrack.stop(); } catch {}
      }
    });

    localRawAudioTrackRef.current = rawTrack;
    const outputTrack = createLocalProcessedMicTrack(rawTrack);
    outputTrack.enabled = true;
    rawTrack.enabled = true;

    const handleRawMicEnded = () => {
      if (localRawAudioTrackRef.current !== rawTrack) return;
      rawTrack.onended = null;
      if (outputTrack && outputTrack !== rawTrack) {
        outputTrack.onended = null;
      }
      if (localAudioTrackRef.current) {
        localStreamRef.current.removeTrack(localAudioTrackRef.current);
      }
      localAudioTrackRef.current = null;
      localRawAudioTrackRef.current = null;
      setMicEnabled(false);
      disposeLocalMicProcessing();
      syncLocalTracksToAllPeers();
    };
    const handleProcessedMicEnded = () => {
      if (outputTrack === rawTrack) return;
      if (localAudioTrackRef.current !== outputTrack) return;
      outputTrack.onended = null;
      // Processed WebAudio track can end in background tabs; fallback to raw mic to keep audio alive.
      if (rawTrack.readyState !== 'live') {
        handleRawMicEnded();
        return;
      }
      localStreamRef.current.removeTrack(outputTrack);
      localAudioTrackRef.current = rawTrack;
      if (!localStreamRef.current.getAudioTracks().some((track) => track.id === rawTrack.id)) {
        localStreamRef.current.addTrack(rawTrack);
      }
      setMicEnabled(Boolean(rawTrack.enabled));
      disposeLocalMicProcessing();
      restartLocalSelfSpeakingObserver(rawTrack);
      syncLocalTracksToAllPeers();
    };
    rawTrack.onended = handleRawMicEnded;
    if (outputTrack !== rawTrack) {
      outputTrack.onended = handleProcessedMicEnded;
    }

    localAudioTrackRef.current = outputTrack;
    if (!localStreamRef.current.getAudioTracks().includes(outputTrack)) {
      localStreamRef.current.addTrack(outputTrack);
    }
    if (!localMicAnalyserNodeRef.current || !localMicAudioContextRef.current || outputTrack === rawTrack) {
      restartLocalSelfSpeakingObserver(outputTrack);
    }
    setMicEnabled(true);
    syncLocalTracksToAllPeers();
    return outputTrack;
  }, [createLocalProcessedMicTrack, disposeLocalMicProcessing, restartLocalSelfSpeakingObserver, syncLocalTracksToAllPeers]);

  const ensureCameraTrack = useCallback(async () => {
    const existing = localCameraTrackRef.current;
    if (existing && existing.readyState === 'live') {
      existing.enabled = true;
      setCameraEnabled(true);
      syncLocalTracksToAllPeers();
      return existing;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Браузер не поддерживает доступ к веб-камере.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        frameRate: { ideal: CAMERA_MAX_FRAMERATE, max: CAMERA_MAX_FRAMERATE },
        width: { ideal: CAMERA_MAX_WIDTH, max: CAMERA_MAX_WIDTH },
        height: { ideal: CAMERA_MAX_HEIGHT, max: CAMERA_MAX_HEIGHT },
      },
    });

    const track = stream.getVideoTracks()[0];
    if (!track) {
      throw new Error('Не удалось получить видеодорожку веб-камеры.');
    }

    try {
      track.contentHint = 'motion';
    } catch {}
    track.applyConstraints?.({
      frameRate: { ideal: CAMERA_MAX_FRAMERATE, max: CAMERA_MAX_FRAMERATE },
      width: { ideal: CAMERA_MAX_WIDTH, max: CAMERA_MAX_WIDTH },
      height: { ideal: CAMERA_MAX_HEIGHT, max: CAMERA_MAX_HEIGHT },
    }).catch(() => {});

    stream.getTracks().forEach((streamTrack) => {
      if (streamTrack !== track) {
        try { streamTrack.stop(); } catch {}
      }
    });

    stopCameraTrack(false);
    localCameraStreamRef.current = stream;
    localCameraTrackRef.current = track;
    track.enabled = true;
    track.onended = () => {
      if (localCameraTrackRef.current !== track) return;
      videoTrackStreamsRef.current.delete(track.id);
      localCameraTrackRef.current = null;
      localStreamRef.current.removeTrack(track);
      setCameraEnabled(false);
      syncLocalTracksToAllPeers();
    };

    if (!localStreamRef.current.getVideoTracks().includes(track)) {
      localStreamRef.current.addTrack(track);
    }
    setCameraEnabled(true);
    syncLocalTracksToAllPeers();
    return track;
  }, [stopCameraTrack, syncLocalTracksToAllPeers]);

  const createPeerState = useCallback((peerId, peerMeta = {}) => {
    const normalizedPeerId = typeof peerId === 'string' ? peerId.trim() : '';
    if (!normalizedPeerId || normalizedPeerId === selfClientIdRef.current) return null;
    if (!rtcPeerConnectionCtor) {
      setError('Ваш браузер не поддерживает WebRTC-звонки. Обновите браузер до последней версии.');
      return null;
    }

    const existing = peersRef.current.get(normalizedPeerId);
    if (existing) {
      peerMetaRef.current.set(normalizedPeerId, {
        ...(peerMetaRef.current.get(normalizedPeerId) || {}),
        ...peerMeta,
      });
      return existing;
    }

    const pc = new rtcPeerConnectionCtor(getRtcPeerConnectionConfig(rtcIceServers));
    if (typeof pc.addTransceiver === 'function') {
      try {
        const existingVideoTransceivers = typeof pc.getTransceivers === 'function'
          ? pc.getTransceivers().filter((transceiver) => transceiver?.receiver?.track?.kind === 'video').length
          : 0;
        const missingVideoTransceivers = Math.max(0, RTC_VIDEO_RECEIVER_SLOTS - existingVideoTransceivers);
        for (let index = 0; index < missingVideoTransceivers; index += 1) {
          pc.addTransceiver('video', { direction: 'recvonly' });
        }
      } catch {}
    }
    const peerState = {
      peerId: normalizedPeerId,
      pc,
      polite: Boolean(selfClientIdRef.current && selfClientIdRef.current > normalizedPeerId),
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      audioSender: null,
      screenSender: null,
      cameraSender: null,
      disconnectTimer: null,
    };

    peersRef.current.set(normalizedPeerId, peerState);
    peerMetaRef.current.set(normalizedPeerId, peerMeta || {});

    pc.onicecandidate = (event) => {
      if (!event.candidate || !activeRoomRef.current) return;
      sendWs({
        type: 'signal',
        roomId: activeRoomRef.current,
        targetId: normalizedPeerId,
        signal: { candidate: event.candidate },
      });
    };

    pc.ontrack = (event) => {
      const candidateStreams = Array.isArray(event.streams) ? event.streams.filter(Boolean) : [];
      const existingStream = remoteStreamsRef.current.get(normalizedPeerId) || null;
      const incomingStream = candidateStreams[0] || null;

      let stream = existingStream || incomingStream;
      if (!stream) {
        stream = new MediaStream();
      }

      if (existingStream && incomingStream && existingStream !== incomingStream) {
        incomingStream.getTracks().forEach((incomingTrack) => {
          if (!existingStream.getTracks().some((existingTrack) => existingTrack.id === incomingTrack.id)) {
            existingStream.addTrack(incomingTrack);
          }
        });
        stream = existingStream;
      }

      const track = event?.track || null;
      if (track?.kind === 'video') {
        const staleVideoTracks = Array.isArray(stream.getVideoTracks?.())
          ? stream.getVideoTracks().filter((existingTrack) => existingTrack.readyState === 'ended')
          : [];
        staleVideoTracks.forEach((existingTrack) => {
          stream.removeTrack(existingTrack);
          videoTrackStreamsRef.current.delete(existingTrack.id);
        });
      }
      if (track && !stream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
        stream.addTrack(track);
      }

      if (track) {
        const removeTrackFromStream = () => {
          const currentStream = remoteStreamsRef.current.get(normalizedPeerId);
          if (!currentStream) return;
          const hasTrack = currentStream.getTracks().some((existingTrack) => existingTrack.id === track.id);
          if (!hasTrack) return;
          currentStream.removeTrack(track);
          videoTrackStreamsRef.current.delete(track.id);
          syncRemotePeers();
        };
        const ensureTrackInStream = () => {
          const currentStream = remoteStreamsRef.current.get(normalizedPeerId);
          if (!currentStream) return;
          const hasTrack = currentStream.getTracks().some((existingTrack) => existingTrack.id === track.id);
          if (hasTrack) return;
          currentStream.addTrack(track);
        };
        track.onended = () => {
          removeTrackFromStream();
        };
        track.onmute = () => {
          syncRemotePeers();
        };
        track.onunmute = () => {
          if (track.kind === 'video') {
            ensureTrackInStream();
          }
          syncRemotePeers();
        };
      }

      remoteStreamsRef.current.set(normalizedPeerId, stream);
      syncRemotePeers();
    };

    const handlePeerConnectionStateChange = () => {
      const state = getRtcPeerConnectionState(pc);
      if (state === 'disconnected') {
        if (!peerState.disconnectTimer) {
          peerState.disconnectTimer = setTimeout(() => {
            const currentPeerState = peersRef.current.get(normalizedPeerId);
            if (!currentPeerState) return;
            if (getRtcPeerConnectionState(currentPeerState.pc) !== 'disconnected') return;
            detachPeer(normalizedPeerId, { closeConnection: true });
            requestRoomResync();
          }, PEER_DISCONNECTED_GRACE_MS);
        }
        refreshPeerConnectionSummary();
        return;
      }

      if (peerState.disconnectTimer) {
        clearTimeout(peerState.disconnectTimer);
        peerState.disconnectTimer = null;
      }

      if (state === 'failed') {
        detachPeer(normalizedPeerId, { closeConnection: true });
        requestRoomResync();
        return;
      }

      if (state === 'closed') {
        detachPeer(normalizedPeerId, { closeConnection: false });
        return;
      }
      refreshPeerConnectionSummary();
    };
    pc.onconnectionstatechange = handlePeerConnectionStateChange;
    pc.oniceconnectionstatechange = handlePeerConnectionStateChange;

    syncLocalTracksToPeer(peerState);
    refreshPeerConnectionSummary();
    return peerState;
  }, [detachPeer, refreshPeerConnectionSummary, requestRoomResync, rtcIceServers, rtcPeerConnectionCtor, sendWs, syncLocalTracksToPeer, syncRemotePeers]);

  const makeOfferToPeer = useCallback(async (peerId) => {
    const peerState = peersRef.current.get(peerId);
    if (!peerState) return;
    try {
      peerState.makingOffer = true;
      const offer = await peerState.pc.createOffer();
      await peerState.pc.setLocalDescription(offer);
      if (!activeRoomRef.current) return;
      sendWs({
        type: 'signal',
        roomId: activeRoomRef.current,
        targetId: peerId,
        signal: { description: peerState.pc.localDescription },
      });
    } catch (offerError) {
      console.error('[call] offer failed:', offerError);
      setError('Не удалось начать WebRTC-сессию.');
    } finally {
      peerState.makingOffer = false;
    }
  }, [sendWs]);

  const renegotiatePeers = useCallback(() => {
    if (!activeRoomRef.current) return;
    peersRef.current.forEach((peerState, peerId) => {
      const pc = peerState?.pc;
      if (!pc) return;
      if (peerState.makingOffer) return;
      if (pc.signalingState !== 'stable') return;
      const pcState = getRtcPeerConnectionState(pc);
      if (pcState === 'closed' || pcState === 'failed') return;
      makeOfferToPeer(peerId);
    });
  }, [makeOfferToPeer]);

  const removePeer = useCallback((peerId) => {
    detachPeer(peerId, { closeConnection: true });
  }, [detachPeer]);

  const handleSignalPayload = useCallback(async (payload) => {
    const fromId = typeof payload?.fromId === 'string' ? payload.fromId.trim() : '';
    if (!fromId || fromId === selfClientIdRef.current) return;
    const signal = payload?.signal && typeof payload.signal === 'object' ? payload.signal : null;
    if (!signal) return;

    let peerState = createPeerState(fromId, payload?.peer || {});
    if (!peerState) return;

    const mediaState = signal.mediaState && typeof signal.mediaState === 'object'
      ? signal.mediaState
      : null;
    if (mediaState) {
      const nextIsScreenSharing = Boolean(mediaState?.isScreenSharing);
      const nextIsCameraEnabled = Boolean(mediaState?.isCameraEnabled);
      const nextScreenTrackIdRaw = typeof mediaState?.screenTrackId === 'string' ? mediaState.screenTrackId.trim() : '';
      const nextCameraTrackIdRaw = typeof mediaState?.cameraTrackId === 'string' ? mediaState.cameraTrackId.trim() : '';
      const nextScreenTrackId = nextIsScreenSharing ? nextScreenTrackIdRaw : '';
      const nextCameraTrackId = nextIsCameraEnabled ? nextCameraTrackIdRaw : '';
      peerMetaRef.current.set(fromId, {
        ...(peerMetaRef.current.get(fromId) || {}),
        isScreenSharing: nextIsScreenSharing,
        isCameraEnabled: nextIsCameraEnabled,
        screenTrackId: nextScreenTrackId,
        cameraTrackId: nextCameraTrackId,
      });
      syncRemotePeers();
    }

    const description = signal.description;
    if (description && typeof description === 'object') {
      const isOffer = description.type === 'offer';
      const offerCollision = isOffer
        && (peerState.makingOffer || peerState.pc.signalingState !== 'stable');
      peerState.ignoreOffer = !peerState.polite && offerCollision;
      if (peerState.ignoreOffer) return;

      try {
        if (isOffer && offerCollision && peerState.polite && peerState.pc.signalingState !== 'stable') {
          let rolledBack = false;
          try {
            await peerState.pc.setLocalDescription({ type: 'rollback' });
            rolledBack = true;
          } catch {
            rolledBack = peerState.pc.signalingState === 'stable';
          }
          if (!rolledBack) {
            detachPeer(fromId, { closeConnection: true });
            const recreatedPeerState = createPeerState(fromId, payload?.peer || {});
            if (!recreatedPeerState) return;
            peerState = recreatedPeerState;
          }
        }
        await peerState.pc.setRemoteDescription(description);
        if (Array.isArray(peerState.pendingCandidates) && peerState.pendingCandidates.length > 0) {
          const queuedCandidates = [...peerState.pendingCandidates];
          peerState.pendingCandidates = [];
          for (const queuedCandidate of queuedCandidates) {
            try {
              await peerState.pc.addIceCandidate(queuedCandidate);
            } catch (queuedCandidateError) {
              if (!peerState.ignoreOffer) {
                console.error('[call] queued addIceCandidate failed:', queuedCandidateError);
              }
            }
          }
        }
        if (isOffer) {
          syncLocalTracksToPeer(peerState);
          const answer = await peerState.pc.createAnswer();
          await peerState.pc.setLocalDescription(answer);
          sendWs({
            type: 'signal',
            roomId: activeRoomRef.current,
            targetId: fromId,
            signal: { description: peerState.pc.localDescription },
          });
        }
      } catch (descriptionError) {
        console.error('[call] remote description failed:', descriptionError);
        setError('Не удалось обработать входящий WebRTC-сигнал.');
      }
      return;
    }

    const candidate = signal.candidate;
    if (candidate) {
      const hasRemoteDescription = Boolean(peerState.pc.remoteDescription && peerState.pc.remoteDescription.type);
      if (!hasRemoteDescription) {
        if (!Array.isArray(peerState.pendingCandidates)) {
          peerState.pendingCandidates = [];
        }
        if (peerState.pendingCandidates.length >= 100) {
          peerState.pendingCandidates.shift();
        }
        peerState.pendingCandidates.push(candidate);
        return;
      }
      try {
        await peerState.pc.addIceCandidate(candidate);
      } catch (candidateError) {
        if (!peerState.ignoreOffer) {
          console.error('[call] addIceCandidate failed:', candidateError);
        }
      }
    }
  }, [createPeerState, detachPeer, sendWs, syncLocalTracksToPeer, syncRemotePeers]);

  const handleWsMessage = useCallback((raw) => {
    let payload = null;
    try {
      payload = JSON.parse(typeof raw === 'string' ? raw : String(raw ?? ''));
    } catch {
      return;
    }

    const type = typeof payload?.type === 'string' ? payload.type.trim() : '';
    if (!type) return;

    if (type === 'pong') {
      lastWsPongAtRef.current = Date.now();
      return;
    }

    if (type === 'error') {
      const errorText = typeof payload?.error === 'string' ? payload.error.trim() : '';
      const normalizedError = errorText || 'Сигнальный сервер вернул ошибку.';
      setError(normalizedError);

      const isJoinPhaseError = statusRef.current === 'connecting' || !activeRoomRef.current;
      if (isJoinPhaseError) {
        clearJoinAckTimer();
        if (wsPingTimerRef.current) {
          clearInterval(wsPingTimerRef.current);
          wsPingTimerRef.current = null;
        }
        stopConnectionStatsPolling();
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws) {
          try { ws.close(); } catch {}
        }
        activeRoomRef.current = '';
        selfClientIdRef.current = '';
        setSelfClientId('');
        closeAllPeers();
        stopScreenTrack(false);
        stopCameraTrack(false);
        stopMicTrack(false);
        setSocketStatus('disconnected');
        roomResyncCooldownUntilRef.current = 0;
        applyStatus('idle');
      }
      return;
    }

    if (type === 'joined') {
      clearJoinAckTimer();
      resetWsReconnectState();
      const normalizedRoomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';
      activeRoomRef.current = normalizedRoomId;
      const nextSelfId = typeof payload?.selfId === 'string' ? payload.selfId.trim() : '';
      selfClientIdRef.current = nextSelfId;
      setSelfClientId(nextSelfId);
      roomResyncCooldownUntilRef.current = 0;
      applyStatus('connected');
      setError('');

      const peers = Array.isArray(payload?.peers) ? payload.peers : [];
      peers.forEach((peer) => {
        const peerId = typeof peer?.id === 'string' ? peer.id.trim() : '';
        if (!peerId || peerId === nextSelfId) return;
        createPeerState(peerId, peer);
      });
      peers.forEach((peer) => {
        const peerId = typeof peer?.id === 'string' ? peer.id.trim() : '';
        if (!peerId || peerId === nextSelfId) return;
        const hasLiveLocalVideo = Boolean(
          (localScreenTrackRef.current && localScreenTrackRef.current.readyState === 'live')
          || (localCameraTrackRef.current && localCameraTrackRef.current.readyState === 'live')
        );
        if ((nextSelfId && nextSelfId < peerId) || hasLiveLocalVideo) {
          makeOfferToPeer(peerId);
        }
      });
      syncRemotePeers();
      return;
    }

    if (type === 'peer-joined') {
      const peerId = typeof payload?.peer?.id === 'string' ? payload.peer.id.trim() : '';
      if (!peerId || peerId === selfClientIdRef.current) return;
      void playAlertSound('peerJoined');
      const existingPeer = peersRef.current.get(peerId);
      createPeerState(peerId, payload.peer);
      const existingState = getRtcPeerConnectionState(existingPeer?.pc);
      const shouldOffer = !existingPeer || existingState === 'disconnected' || existingState === 'failed' || existingState === 'closed';
      const hasLiveLocalVideo = Boolean(
        (localScreenTrackRef.current && localScreenTrackRef.current.readyState === 'live')
        || (localCameraTrackRef.current && localCameraTrackRef.current.readyState === 'live')
      );
      const isPreferredOfferer = Boolean(selfClientIdRef.current && selfClientIdRef.current < peerId);
      if (shouldOffer && (isPreferredOfferer || hasLiveLocalVideo)) {
        makeOfferToPeer(peerId);
      }
      if (shouldOffer && hasLiveLocalVideo) {
        setTimeout(() => {
          const peerState = peersRef.current.get(peerId);
          if (!peerState?.pc) return;
          const connectionState = getRtcPeerConnectionState(peerState.pc);
          if (connectionState === 'closed' || connectionState === 'failed') return;
          if (peerState.makingOffer) return;
          if (peerState.pc.signalingState !== 'stable') return;
          makeOfferToPeer(peerId);
        }, 700);
      }
      sendLocalMediaStateToPeer(peerId);
      syncRemotePeers();
      return;
    }

    if (type === 'peer-left') {
      void playAlertSound('peerLeft');
      removePeer(payload?.peerId);
      return;
    }

    if (type === 'peer-updated') {
      const peerId = typeof payload?.peer?.id === 'string' ? payload.peer.id.trim() : '';
      if (!peerId || peerId === selfClientIdRef.current) return;
      peerMetaRef.current.set(peerId, {
        ...(peerMetaRef.current.get(peerId) || {}),
        ...(payload?.peer && typeof payload.peer === 'object' ? payload.peer : {}),
      });
      syncRemotePeers();
      return;
    }

    if (type === 'signal') {
      handleSignalPayload(payload).catch((signalError) => {
        console.error('[call] signal handling failed:', signalError);
      });
    }
  }, [applyStatus, clearJoinAckTimer, closeAllPeers, createPeerState, handleSignalPayload, makeOfferToPeer, playAlertSound, removePeer, resetWsReconnectState, sendLocalMediaStateToPeer, stopCameraTrack, stopConnectionStatsPolling, stopMicTrack, stopScreenTrack, syncRemotePeers]);

  const stopCall = useCallback(() => {
    manualCloseRef.current = true;
    wsHadErrorRef.current = false;
    clearJoinAckTimer();
    resetWsReconnectState();
    stopConnectionStatsPolling();
    if (wsPingTimerRef.current) {
      clearInterval(wsPingTimerRef.current);
      wsPingTimerRef.current = null;
    }
    lastWsPongAtRef.current = 0;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && activeRoomRef.current) {
      try {
        ws.send(JSON.stringify({ type: 'leave', roomId: activeRoomRef.current }));
      } catch {}
    }
    if (ws) {
      try { ws.close(); } catch {}
    }
    wsRef.current = null;
    activeRoomRef.current = '';
    selfClientIdRef.current = '';
    setSelfClientId('');
    setSocketStatus('disconnected');
    roomResyncCooldownUntilRef.current = 0;
    applyStatus('idle');
    closeAllPeers();
    stopScreenTrack(false);
    stopCameraTrack(false);
    stopMicTrack(false);
  }, [applyStatus, clearJoinAckTimer, closeAllPeers, resetWsReconnectState, stopCameraTrack, stopConnectionStatsPolling, stopMicTrack, stopScreenTrack]);

  const startCall = useCallback(async (options = {}) => {
    const isReconnect = Boolean(options?.isReconnect);
    primeAlertSounds();
    if (!roomId) {
      setPresenceError('');
      setError('Сначала выбери ученика для созвона.');
      return;
    }
    if (!rtcWsUrl) {
      setError('Не удалось определить WebSocket-адрес для созвона.');
      return;
    }
    if (!rtcPeerConnectionCtor) {
      setError('Ваш браузер не поддерживает WebRTC-звонки. Обновите браузер до последней версии.');
      return;
    }
    if (rtcIceConfig.configError) {
      setError('Некорректный VITE_RTC_ICE_SERVERS. Проверь JSON-массив ICE-серверов.');
      return;
    }
    if (RTC_ICE_TRANSPORT_POLICY === 'relay' && !rtcIceConfig.hasTurn) {
      setError('Для режима relay нужен хотя бы один TURN-сервер в VITE_RTC_ICE_SERVERS.');
      return;
    }
    if (RTC_ICE_TRANSPORT_POLICY === 'relay' && !rtcIceConfig.hasTurnAuth) {
      setError('Для режима relay TURN-сервер должен содержать username и credential.');
      return;
    }
    if (isReconnect) {
      clearWsReconnectTimer();
    } else {
      resetWsReconnectState();
    }
    const existingWs = wsRef.current;
    if (existingWs && existingWs.readyState === WebSocket.OPEN) {
      clearJoinAckTimer();
      manualCloseRef.current = false;
      wsHadErrorRef.current = false;
      applyStatus('connecting');
      setSocketStatus('connected');
      const joinSent = sendWs({ type: 'join', roomId });
      if (!joinSent) {
        wsHadErrorRef.current = true;
        setError('Не удалось отправить запрос на подключение.');
        try { existingWs.close(); } catch {}
        return;
      }
      startJoinAckTimer(existingWs);
      return;
    }
    if (existingWs && existingWs.readyState === WebSocket.CONNECTING) {
      applyStatus('connecting');
      setSocketStatus('connecting');
      return;
    }

    if (!isReconnect) {
      setError('');
    }
    setPresenceError('');
    applyStatus('connecting');
    setSocketStatus('connecting');
    manualCloseRef.current = false;
    wsHadErrorRef.current = false;
    clearJoinAckTimer();

    try {
      await ensureMicTrack();
    } catch (micError) {
      roomResyncCooldownUntilRef.current = 0;
      applyStatus('idle');
      setSocketStatus('disconnected');
      setError(normalizeErrorMessage(micError, 'Не удалось включить микрофон.'));
      return;
    }

    try {
      const ws = new WebSocket(rtcWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        setSocketStatus('connected');
        lastWsPongAtRef.current = Date.now();
        const joinSent = sendWs({ type: 'join', roomId });
        if (!joinSent) {
          wsHadErrorRef.current = true;
          setError('Не удалось отправить запрос на подключение.');
          try { ws.close(); } catch {}
          return;
        }
        startJoinAckTimer(ws);
        if (wsPingTimerRef.current) {
          clearInterval(wsPingTimerRef.current);
          wsPingTimerRef.current = null;
        }
        wsPingTimerRef.current = setInterval(() => {
          if (wsRef.current !== ws) return;
          if (Date.now() - lastWsPongAtRef.current >= WS_HEARTBEAT_TIMEOUT_MS) {
            setError('Потеряно соединение с сигнальным сервером.');
            try { ws.close(1011, 'Heartbeat timeout'); } catch {}
            return;
          }
          sendWs({ type: 'ping' });
        }, WS_PING_INTERVAL_MS);
      };
      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        handleWsMessage(event.data);
      };
      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        wsHadErrorRef.current = true;
        setError('Ошибка сигнального канала WebSocket.');
        try { ws.close(); } catch {}
      };
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        clearJoinAckTimer();
        if (wsPingTimerRef.current) {
          clearInterval(wsPingTimerRef.current);
          wsPingTimerRef.current = null;
        }
        lastWsPongAtRef.current = 0;
        stopConnectionStatsPolling();
        wsRef.current = null;
        setSocketStatus('disconnected');
        roomResyncCooldownUntilRef.current = 0;
        applyStatus('idle');
        activeRoomRef.current = '';
        selfClientIdRef.current = '';
        setSelfClientId('');
        closeAllPeers();
        const shouldReconnect = !manualCloseRef.current && Boolean(roomId);
        if (shouldReconnect) {
          const reconnectMessage = wsHadErrorRef.current
            ? 'Сигнальный канал оборвался. Переподключаемся...'
            : 'Соединение для созвона разорвано. Переподключаемся...';
          const scheduled = scheduleWsReconnect(reconnectMessage);
          if (!scheduled) {
            stopScreenTrack(false);
            stopCameraTrack(false);
            stopMicTrack(false);
          }
        } else {
          stopScreenTrack(false);
          stopCameraTrack(false);
          stopMicTrack(false);
        }
        if (!shouldReconnect && !manualCloseRef.current && !wsHadErrorRef.current) {
          setError('Соединение для созвона разорвано.');
        }
        wsHadErrorRef.current = false;
      };
    } catch (connectError) {
      clearJoinAckTimer();
      roomResyncCooldownUntilRef.current = 0;
      applyStatus('idle');
      setSocketStatus('disconnected');
      closeAllPeers();
      const connectErrorText = normalizeErrorMessage(connectError, 'Не удалось открыть сигнальный канал.');
      if (isReconnect) {
        const scheduled = scheduleWsReconnect(connectErrorText);
        if (!scheduled) {
          stopScreenTrack(false);
          stopCameraTrack(false);
          stopMicTrack(false);
        }
      } else {
        stopScreenTrack(false);
        stopCameraTrack(false);
        stopMicTrack(false);
        setError(connectErrorText);
      }
    }
  }, [applyStatus, clearJoinAckTimer, clearWsReconnectTimer, closeAllPeers, ensureMicTrack, handleWsMessage, primeAlertSounds, resetWsReconnectState, roomId, rtcIceConfig.configError, rtcIceConfig.hasTurn, rtcIceConfig.hasTurnAuth, rtcPeerConnectionCtor, rtcWsUrl, scheduleWsReconnect, sendWs, startJoinAckTimer, stopCameraTrack, stopConnectionStatsPolling, stopMicTrack, stopScreenTrack]);

  useEffect(() => {
    startCallRef.current = startCall;
  }, [startCall]);

  useEffect(() => () => {
    clearWsReconnectTimer();
  }, [clearWsReconnectTimer]);

  useEffect(() => () => {
    alertAudioActiveRef.current.forEach((audio) => {
      try {
        audio.pause();
      } catch {}
    });
    alertAudioActiveRef.current.clear();

    alertAudioTemplatesRef.current.forEach((audio) => {
      try {
        audio.pause();
      } catch {}
    });
    alertAudioTemplatesRef.current.clear();
  }, []);

  const toggleMic = useCallback(async () => {
    if (micBusy) return;
    setMicBusy(true);
    setError('');
    try {
      const track = localAudioTrackRef.current;
      if (!track || track.readyState !== 'live') {
        await ensureMicTrack();
        renegotiatePeers();
      } else {
        const nextMicEnabled = !track.enabled;
        track.enabled = nextMicEnabled;
        const rawTrack = localRawAudioTrackRef.current;
        if (rawTrack && rawTrack.readyState === 'live') {
          rawTrack.enabled = nextMicEnabled;
        }
        setMicEnabled(nextMicEnabled);
        void playAlertSound(nextMicEnabled ? 'micUnmuted' : 'micMuted');
        syncLocalTracksToAllPeers();
      }
    } catch (micError) {
      setError(normalizeErrorMessage(micError, 'Не удалось переключить микрофон.'));
    } finally {
      setMicBusy(false);
    }
  }, [ensureMicTrack, micBusy, playAlertSound, renegotiatePeers, syncLocalTracksToAllPeers]);

  const toggleCamera = useCallback(async () => {
    if (cameraBusy) return;
    if (cameraEnabled) {
      stopCameraTrack(true);
      renegotiatePeers();
      return;
    }
    if (status !== 'connected') {
      setError('Сначала подключись к созвону, затем включи веб-камеру.');
      return;
    }

    setCameraBusy(true);
    setError('');
    try {
      await ensureCameraTrack();
      renegotiatePeers();
    } catch (cameraError) {
      setError(normalizeErrorMessage(cameraError, 'Не удалось включить веб-камеру.'));
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy, cameraEnabled, ensureCameraTrack, renegotiatePeers, status, stopCameraTrack]);

  const toggleScreenShare = useCallback(async () => {
    if (screenBusy) return;
    if (screenSharing) {
      stopScreenTrack(true);
      void playAlertSound('screenOff');
      renegotiatePeers();
      return;
    }
    if (status !== 'connected') {
      setError('Сначала подключись к созвону, затем включи демонстрацию экрана.');
      return;
    }
    if (!navigator?.mediaDevices?.getDisplayMedia) {
      setError('Браузер не поддерживает демонстрацию экрана.');
      return;
    }

    setScreenBusy(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: SCREEN_MAX_FRAMERATE, max: SCREEN_MAX_FRAMERATE },
          width: { ideal: SCREEN_MAX_WIDTH, max: SCREEN_MAX_WIDTH },
          height: { ideal: SCREEN_MAX_HEIGHT, max: SCREEN_MAX_HEIGHT },
        },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new Error('Не удалось получить видеодорожку экрана.');
      }

      try {
        track.contentHint = 'detail';
      } catch {}
      track.applyConstraints?.({
        frameRate: { ideal: SCREEN_MAX_FRAMERATE, max: SCREEN_MAX_FRAMERATE },
        width: { ideal: SCREEN_MAX_WIDTH, max: SCREEN_MAX_WIDTH },
        height: { ideal: SCREEN_MAX_HEIGHT, max: SCREEN_MAX_HEIGHT },
      }).catch(() => {});
      stopScreenTrack(false);
      localScreenStreamRef.current = stream;
      localScreenTrackRef.current = track;
      track.onended = () => {
        stopScreenTrack(true);
        void playAlertSound('screenOff');
        renegotiatePeers();
      };
      if (!localStreamRef.current.getVideoTracks().includes(track)) {
        localStreamRef.current.addTrack(track);
      }
      setScreenSharing(true);
      void playAlertSound('screenOn');
      syncLocalTracksToAllPeers();
      renegotiatePeers();
    } catch (screenError) {
      setError(normalizeErrorMessage(screenError, 'Не удалось начать демонстрацию экрана.'));
    } finally {
      setScreenBusy(false);
    }
  }, [playAlertSound, renegotiatePeers, screenBusy, screenSharing, status, stopScreenTrack, syncLocalTracksToAllPeers]);

  useEffect(() => {
    if (status !== 'connected') return;
    if (!activeRoomRef.current) return;
    const screenTrackId = screenSharing && localScreenTrackRef.current
      ? localScreenTrackRef.current.id
      : '';
    const cameraTrackId = cameraEnabled && localCameraTrackRef.current
      ? localCameraTrackRef.current.id
      : '';
    sendWs({
      type: 'presence-state',
      roomId: activeRoomRef.current,
      isScreenSharing: Boolean(screenSharing),
      isCameraEnabled: Boolean(cameraEnabled),
      screenTrackId,
      cameraTrackId,
    });
    broadcastLocalMediaStateToPeers();
  }, [broadcastLocalMediaStateToPeers, cameraEnabled, screenSharing, sendWs, status]);

  useEffect(() => {
    const prevRoomId = previousRoomIdRef.current;
    previousRoomIdRef.current = roomId;
    if (!prevRoomId || prevRoomId === roomId) return;
    if (status !== 'idle') {
      setError('Комната изменилась. Подключись заново.');
      stopCall();
    }
  }, [roomId, status, stopCall]);

  useEffect(() => {
    if (!roomId) {
      closePresenceSocket();
      setPresencePeers([]);
      setPresenceError('');
      return undefined;
    }
    if (status !== 'idle') {
      closePresenceSocket();
      setPresenceError('');
      return undefined;
    }

    if (!rtcWsUrl) {
      setPresencePeers([]);
      setPresenceError('Не удалось определить адрес сервера для списка участников.');
      return undefined;
    }

    let disposed = false;
    let usingPresenceWebSocket = true;
    let fallbackBootTimeout = null;
    let presencePollTimer = null;

    const clearFallbackBootTimeout = () => {
      if (!fallbackBootTimeout) return;
      clearTimeout(fallbackBootTimeout);
      fallbackBootTimeout = null;
    };

    const stopHttpPolling = () => {
      if (!presencePollTimer) return;
      clearInterval(presencePollTimer);
      presencePollTimer = null;
    };

    const loadPresenceSnapshot = async ({ quiet = false } = {}) => {
      try {
        const cacheBust = Date.now();
        const response = await fetch(resolveApiUrl(`/api/rtc/presence?roomId=${encodeURIComponent(roomId)}&_=${cacheBust}`), {
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });
        if (!response.ok) {
          if (disposed) return;
          if (quiet && usingPresenceWebSocket) return;
          const fallbackMessage = `Не удалось обновить список участников (${response.status})`;
          const message = await extractHttpErrorMessage(response, fallbackMessage);
          setPresencePeers([]);
          setPresenceError(message);
          return;
        }
        const payload = await response.json();
        if (disposed) return;
        setPresenceError('');
        mapPresenceParticipants(Array.isArray(payload?.participants) ? payload.participants : []);
      } catch (requestError) {
        if (disposed) return;
        if (quiet && usingPresenceWebSocket) return;
        setPresenceError(normalizeErrorMessage(requestError, 'Не удалось обновить список участников созвона.'));
      }
    };

    const startHttpFallback = () => {
      if (disposed || !usingPresenceWebSocket) return;
      usingPresenceWebSocket = false;
      presenceReconnectAttemptRef.current = 0;
      clearFallbackBootTimeout();
      closePresenceSocket();
      stopHttpPolling();
      void loadPresenceSnapshot();
      presencePollTimer = setInterval(() => {
        void loadPresenceSnapshot();
      }, RTC_PRESENCE_HTTP_FALLBACK_POLL_INTERVAL_MS);
    };

    const scheduleReconnect = () => {
      if (disposed || !usingPresenceWebSocket) return;
      if (presenceReconnectTimerRef.current) {
        return;
      }
      const nextAttempt = presenceReconnectAttemptRef.current + 1;
      if (nextAttempt > RTC_PRESENCE_RECONNECT_MAX_ATTEMPTS) {
        startHttpFallback();
        return;
      }
      presenceReconnectAttemptRef.current = nextAttempt;
      const baseDelay = Math.min(
        RTC_PRESENCE_RECONNECT_MAX_DELAY_MS,
        RTC_PRESENCE_RECONNECT_DELAY_MS * (2 ** Math.max(0, nextAttempt - 1))
      );
      const jitter = Math.floor(Math.random() * RTC_PRESENCE_RECONNECT_JITTER_MS);
      const reconnectDelay = baseDelay + jitter;
      presenceReconnectTimerRef.current = setTimeout(() => {
        presenceReconnectTimerRef.current = null;
        connectPresenceWs();
      }, reconnectDelay);
    };

    const applyPresencePayload = (raw) => {
      let payload = null;
      try {
        payload = JSON.parse(typeof raw === 'string' ? raw : String(raw ?? ''));
      } catch {
        return;
      }

      const type = typeof payload?.type === 'string' ? payload.type.trim() : '';
      if (!type) return;
      if (type === 'pong') {
        lastPresencePongAtRef.current = Date.now();
        return;
      }
      if (type === 'error') {
        clearFallbackBootTimeout();
        stopHttpPolling();
        usingPresenceWebSocket = false;
        closePresenceSocket();
        const fallbackMessage = 'Presence fallback is unavailable on this server. Update backend and restart it.';
        const serverMessage = typeof payload?.error === 'string' ? payload.error.trim() : '';
        setPresencePeers([]);
        setPresenceError(serverMessage || fallbackMessage);
        return;
      }
      if (type !== 'presence-update') return;
      const payloadRoomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';
      if (payloadRoomId && payloadRoomId !== roomId) return;
      const participants = Array.isArray(payload?.participants) ? payload.participants : [];
      clearFallbackBootTimeout();
      stopHttpPolling();
      setPresenceError('');
      mapPresenceParticipants(participants);
    };

    const connectPresenceWs = () => {
      if (disposed || !usingPresenceWebSocket) return;
      const existing = presenceWsRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return;
      }
      try {
        const ws = new WebSocket(rtcWsUrl);
        presenceWsRef.current = ws;

        ws.onopen = () => {
          if (disposed || !usingPresenceWebSocket || presenceWsRef.current !== ws) return;
          presenceReconnectAttemptRef.current = 0;
          lastPresencePongAtRef.current = Date.now();
          try {
            ws.send(JSON.stringify({ type: 'watch-presence', roomId }));
          } catch {
            // Reconnect flow will recover if the socket closes before the join message is sent.
          }
          if (presencePingTimerRef.current) {
            clearInterval(presencePingTimerRef.current);
          }
          presencePingTimerRef.current = setInterval(() => {
            if (presenceWsRef.current !== ws) return;
            if (Date.now() - lastPresencePongAtRef.current >= WS_HEARTBEAT_TIMEOUT_MS) {
              try {
                ws.close(1011, 'Presence heartbeat timeout');
              } catch {
                // Closing a socket that is already shutting down is safe to ignore.
              }
              return;
            }
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              // The close/reconnect handler will recover from transient send failures.
            }
          }, WS_PING_INTERVAL_MS);
        };

        ws.onmessage = (event) => {
          if (disposed || !usingPresenceWebSocket || presenceWsRef.current !== ws) return;
          applyPresencePayload(event.data);
        };

        ws.onerror = () => {
          if (disposed || !usingPresenceWebSocket || presenceWsRef.current !== ws) return;
          try {
            ws.close();
          } catch {
            // Ignore close failures triggered from the error path.
          }
        };

        ws.onclose = () => {
          if (presenceWsRef.current !== ws) return;
          presenceWsRef.current = null;
          if (presencePingTimerRef.current) {
            clearInterval(presencePingTimerRef.current);
            presencePingTimerRef.current = null;
          }
          lastPresencePongAtRef.current = 0;
          scheduleReconnect();
        };
      } catch {
        // Failed socket construction still follows the standard reconnect path.
        scheduleReconnect();
      }
    };

    void loadPresenceSnapshot({ quiet: true });
    fallbackBootTimeout = setTimeout(() => {
      fallbackBootTimeout = null;
      if (disposed || !usingPresenceWebSocket) return;
      startHttpFallback();
    }, RTC_PRESENCE_FALLBACK_BOOT_TIMEOUT_MS);
    connectPresenceWs();

    return () => {
      disposed = true;
      clearFallbackBootTimeout();
      stopHttpPolling();
      closePresenceSocket();
    };
  }, [closePresenceSocket, mapPresenceParticipants, roomId, rtcWsUrl, status]);

  useEffect(() => {
    if (status === 'connected') {
      startConnectionStatsPolling();
      return;
    }
    stopConnectionStatsPolling();
  }, [startConnectionStatsPolling, status, stopConnectionStatsPolling]);

  useEffect(() => () => {
    stopCall();
  }, [stopCall]);

  useEffect(() => () => {
    stopLocalSelfSpeakingObserver();
  }, [stopLocalSelfSpeakingObserver]);

  useEffect(() => {
    const track = localAudioTrackRef.current;
    if (!track || track.readyState !== 'live' || !micEnabled || status !== 'connected') {
      stopLocalSelfSpeakingObserver();
      return;
    }
    restartLocalSelfSpeakingObserver(track);
  }, [
    micEnabled,
    micTriggerThresholdPercent,
    restartLocalSelfSpeakingObserver,
    status,
    stopLocalSelfSpeakingObserver,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') {
        localMicAudioContextRef.current?.resume?.().catch(() => {});
      } else {
        const audioContext = localMicAudioContextRef.current;
        const gateGainNode = localMicGateGainNodeRef.current;
        if (audioContext && gateGainNode) {
          try {
            gateGainNode.gain.setTargetAtTime(1, audioContext.currentTime, 0.015);
          } catch {
            gateGainNode.gain.value = 1;
          }
        }
        setSelfSpeaking(false);
        setMicInputLevelPercent(0);
      }
      syncLocalTracksToAllPeers();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncLocalTracksToAllPeers]);

  useEffect(() => {
    if (status === 'connected' && micEnabled) return;
    setSelfSpeaking(false);
    setMicInputLevelPercent(0);
  }, [micEnabled, status]);

  useEffect(() => {
    const gainNode = localMicGainNodeRef.current;
    const audioContext = localMicAudioContextRef.current;
    if (!gainNode || !audioContext) return;
    const nextGain = micSensitivityPercentToGain(micSensitivityPercent);
    try {
      gainNode.gain.setTargetAtTime(nextGain, audioContext.currentTime, 0.02);
    } catch {
      gainNode.gain.value = nextGain;
    }
  }, [micSensitivityPercent]);

  useEffect(() => {
    if (status === 'connected') return;
    setSpeakingByPeer({});
    setSelfSpeaking(false);
    setMicInputLevelPercent(0);
    setMicSettingsOpen(false);
    setMicSettingsPosition(null);
  }, [status]);

  useEffect(() => {
    if (!micSettingsOpen) return undefined;
    const handlePointerDown = (event) => {
      const wrapNode = micSettingsWrapRef.current;
      const popupNode = micSettingsPopupRef.current;
      if ((wrapNode && wrapNode.contains(event.target)) || (popupNode && popupNode.contains(event.target))) return;
      setMicSettingsOpen(false);
      setMicSettingsPosition(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMicSettingsOpen(false);
        setMicSettingsPosition(null);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [micSettingsOpen]);

  useEffect(() => {
    if (!micSettingsOpen) return undefined;
    updateMicSettingsPosition();
    let rafId = requestAnimationFrame(() => {
      updateMicSettingsPosition();
    });
    const handleViewportChange = () => {
      updateMicSettingsPosition();
    };
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [micSettingsOpen, updateMicSettingsPosition]);

  useEffect(() => {
    if (!volumePopup) return;
    if (status !== 'connected') {
      setVolumePopup(null);
      return;
    }
    const hasPeer = remotePeers.some((peer) => peer.peerId === volumePopup.peerId);
    if (!hasPeer) {
      setVolumePopup(null);
    }
  }, [remotePeers, status, volumePopup]);

  useEffect(() => {
    if (!volumePopup) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setVolumePopup(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [volumePopup]);

  useEffect(() => () => {
    stopPanelDrag();
  }, [stopPanelDrag]);

  useEffect(() => {
    if (!isCollapsedUi || collapsedPanelPosition) return;
    const panelNode = collapsedPanelRef.current;
    if (!panelNode) return;
    const rect = panelNode.getBoundingClientRect();
    setCollapsedPanelPosition(clampPanelPositionToViewport({
      x: rect.left,
      y: rect.top,
    }, rect.width, rect.height));
  }, [collapsedPanelPosition, isCollapsedUi]);

  useEffect(() => {
    if (!isFloatingUi || floatingPanelPosition) return;
    const panelNode = floatingPanelRef.current;
    if (!panelNode) return;
    const rect = panelNode.getBoundingClientRect();
    const anchoredPosition = clampPanelPositionToViewport({
      x: rect.left,
      y: rect.top,
    }, rect.width, rect.height);
    setFloatingPanelPosition({
      ...anchoredPosition,
      width: rect.width,
    });
  }, [floatingPanelPosition, isFloatingUi]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      setCollapsedPanelPosition((prev) => {
        if (!prev) return prev;
        const rect = collapsedPanelRef.current?.getBoundingClientRect?.();
        const width = rect?.width || Math.min(window.innerWidth * 0.96, 640);
        const height = rect?.height || 56;
        return clampPanelPositionToViewport(prev, width, height);
      });
      setFloatingPanelPosition((prev) => {
        if (!prev) return prev;
        const rect = floatingPanelRef.current?.getBoundingClientRect?.();
        const width = rect?.width || Math.min(980, Math.max(320, window.innerWidth - 16));
        const height = rect?.height || Math.min(680, Math.max(160, window.innerHeight - 16));
        const clamped = clampPanelPositionToViewport(prev, width, height);
        return {
          ...clamped,
          width,
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const hasActiveMediaConnection = peerConnectionSummary.connected > 0;
  const hasMediaConnectionIssue = peerConnectionSummary.disconnected > 0 || peerConnectionSummary.failed > 0;
  const hasPendingPeerConnection = peerConnectionSummary.total > 0 && !hasActiveMediaConnection && !hasMediaConnectionIssue;
  const visiblePeers = isConnected ? remotePeers : presencePeers;
  const participantCount = isConnected ? peerConnectionSummary.total + 1 : presencePeers.length;
  const voiceCallParticipants = isConnected
    ? (() => {
      const participants = [];
      const localScreenTrack = localScreenTrackRef.current;
      const localCameraTrack = localCameraTrackRef.current;

      if (screenSharing && localScreenTrack && localScreenTrack.readyState === 'live') {
        participants.push({
          id: 'self:screen',
          peerId: '',
          title: 'Вы',
          subtitle: 'Трансляция активна',
          isSelf: true,
          hasVideo: true,
          videoKind: 'screen',
          stream: getStreamForVideoTrack(localScreenTrack),
          isSpeaking: selfSpeaking,
        });
      }

      if (cameraEnabled && localCameraTrack && localCameraTrack.readyState === 'live') {
        participants.push({
          id: 'self:camera',
          peerId: '',
          title: 'Вы',
          subtitle: 'Камера включена',
          isSelf: true,
          hasVideo: true,
          videoKind: 'camera',
          stream: getStreamForVideoTrack(localCameraTrack),
          isSpeaking: selfSpeaking,
        });
      }

      if (participants.length === 0) {
        participants.push({
          id: 'self',
          peerId: '',
          title: 'Вы',
          subtitle: micEnabled ? 'Микрофон включен' : 'Микрофон выключен',
          isSelf: true,
          hasVideo: false,
          videoKind: null,
          stream: null,
          isSpeaking: selfSpeaking,
        });
      }

      remotePeers.forEach((peer) => {
        const peerStream = peer.stream || null;
        const liveVideoTracks = getLiveVideoTracks(peerStream);
        const isSpeaking = Boolean(speakingByPeer[peer.peerId]);
        const hasExplicitMediaState = Boolean(peer.hasMediaState);
        const shouldSuppressVideoByState = hasExplicitMediaState && !peer.isScreenSharing && !peer.isCameraEnabled;
        if (shouldSuppressVideoByState) {
          participants.push({
            id: peer.peerId,
            peerId: peer.peerId,
            title: peer.title,
            subtitle: peer.subtitle || 'В созвоне',
            isSelf: false,
            hasVideo: false,
            videoKind: null,
            stream: null,
            isSpeaking,
          });
          return;
        }
        if (liveVideoTracks.length === 0) {
          participants.push({
            id: peer.peerId,
            peerId: peer.peerId,
            title: peer.title,
            subtitle: peer.subtitle || 'В созвоне',
            isSelf: false,
            hasVideo: false,
            videoKind: null,
            stream: null,
            isSpeaking,
          });
          return;
        }

        const usedTrackIds = new Set();
        const renderedVideoKinds = new Set();
        let pushedRemoteVideoCount = 0;
        const pushRemoteVideoTrack = (track, kind, subtitle) => {
          if (!track || track.readyState !== 'live') return false;
          const normalizedKind = kind === 'screen' ? 'screen' : 'camera';
          if (usedTrackIds.has(track.id)) return false;
          if (renderedVideoKinds.has(normalizedKind)) return false;
          usedTrackIds.add(track.id);
          renderedVideoKinds.add(normalizedKind);
          pushedRemoteVideoCount += 1;
          participants.push({
            id: `${peer.peerId}:${normalizedKind}:${track.id}`,
            peerId: peer.peerId,
            title: peer.title,
            subtitle,
            isSelf: false,
            hasVideo: true,
            videoKind: normalizedKind,
            stream: getStreamForVideoTrack(track),
            isSpeaking,
          });
          return true;
        };

        const screenTrackById = getVideoTrackById(peerStream, peer.screenTrackId);
        const cameraTrackById = getVideoTrackById(peerStream, peer.cameraTrackId);

        pushRemoteVideoTrack(screenTrackById, 'screen', 'Экран');
        pushRemoteVideoTrack(cameraTrackById, 'camera', 'Камера');

        if (peer.isScreenSharing && !screenTrackById) {
          const inferredScreenTrack = liveVideoTracks.find((track) => (
            !usedTrackIds.has(track.id) && inferVideoTrackKind(track) === 'screen'
          )) || liveVideoTracks.find((track) => !usedTrackIds.has(track.id));
          pushRemoteVideoTrack(inferredScreenTrack, 'screen', 'Экран');
        }

        if (peer.isCameraEnabled && !cameraTrackById) {
          const inferredCameraTrack = liveVideoTracks.find((track) => (
            !usedTrackIds.has(track.id) && inferVideoTrackKind(track) === 'camera'
          )) || liveVideoTracks.find((track) => !usedTrackIds.has(track.id));
          pushRemoteVideoTrack(inferredCameraTrack, 'camera', 'Камера');
        }

        if (hasExplicitMediaState) {
          if (pushedRemoteVideoCount === 0) {
            participants.push({
              id: peer.peerId,
              peerId: peer.peerId,
              title: peer.title,
              subtitle: peer.subtitle || '',
              isSelf: false,
              hasVideo: false,
              videoKind: null,
              stream: null,
              isSpeaking,
            });
          }
          return;
        }

        liveVideoTracks.forEach((track) => {
          if (usedTrackIds.has(track.id)) return;
          const inferredKind = inferVideoTrackKind(track);
          const subtitle = inferredKind === 'screen'
            ? 'Экран'
            : inferredKind === 'camera'
              ? 'Камера'
              : 'Видео';
          pushRemoteVideoTrack(track, inferredKind, subtitle);
        });
      });

      return participants;
    })()
    : [];
  const statusChipClass = isDarkTheme
    ? (isConnected
      ? hasActiveMediaConnection
        ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
        : hasMediaConnectionIssue
          ? 'border-rose-300/40 bg-rose-500/15 text-rose-100'
          : hasPendingPeerConnection
            ? 'border-amber-300/40 bg-amber-500/15 text-amber-200'
            : 'border-sky-300/40 bg-sky-500/15 text-sky-200'
      : isConnecting
        ? 'border-amber-300/40 bg-amber-500/15 text-amber-200'
        : 'border-slate-600/60 bg-slate-800/70 text-slate-200')
    : (isConnected
      ? hasActiveMediaConnection
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : hasMediaConnectionIssue
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : hasPendingPeerConnection
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-sky-200 bg-sky-50 text-sky-700'
      : isConnecting
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-100 text-slate-600');
  const statusText = isConnected
    ? hasActiveMediaConnection
      ? 'Связь установлена'
      : hasMediaConnectionIssue
        ? 'Связь потеряна'
        : hasPendingPeerConnection
          ? 'Соединение с собеседником...'
          : 'В комнате (ожидание)'
    : (isConnecting ? 'Подключение...' : 'Отключено');
  const statusTone = isConnected
    ? (hasMediaConnectionIssue ? 'problem' : (hasActiveMediaConnection ? 'connected' : 'waiting'))
    : (isConnecting ? 'connecting' : 'idle');
  const roomHint = roomId || 'Комната не выбрана';
  const resolvedError = error || (status === 'idle' ? presenceError : '');
  const selectedStudentName = selectedStudent?.name || 'Ученик не выбран';
  const canStart = Boolean(roomId) && !isConnecting && !isConnected;
  const canStop = isConnecting || isConnected;
  const canToggleMic = isConnected && !micBusy;
  const canToggleCamera = isConnected && !cameraBusy;
  const canToggleScreen = isConnected && !screenBusy;
  const qualityClass = connectionStats.quality === 'good'
    ? (isDarkTheme ? 'text-emerald-300' : 'text-emerald-700')
    : connectionStats.quality === 'ok'
      ? (isDarkTheme ? 'text-amber-300' : 'text-amber-700')
      : connectionStats.quality === 'poor'
        ? (isDarkTheme ? 'text-rose-300' : 'text-rose-700')
        : (isDarkTheme ? 'text-slate-300' : 'text-slate-600');
  const qualityText = connectionStats.quality === 'good'
    ? 'стабильно'
    : connectionStats.quality === 'ok'
      ? 'средне'
      : connectionStats.quality === 'poor'
        ? 'плохо'
        : 'нет данных';

  const lessonChatTitle = isTeacher ? 'Чат с учеником' : 'Чат с учителем';
  const lessonChatPeerName = isTeacher
    ? (lessonChatMeta?.studentName || selectedStudent?.name || 'Ученик')
    : (lessonChatMeta?.teacherName || 'Преподаватель');
  const lessonChatPlaceholder = isTeacher ? 'Напишите ученику...' : 'Напишите учителю...';
  const lessonChatDisabled = Boolean(isTeacher && !effectiveStudentId);

  const normalizedMicInputLevelPercent = clampToRange(Math.round(Number(micInputLevelPercent) || 0), 0, 100);
  const micTriggerThresholdMeterPercent = rmsToMicLevelPercent(
    micTriggerThresholdPercentToRmsThreshold(micTriggerThresholdPercent)
  );
  const sceneStatusClass = `call-scene--${statusTone}`;
  const sceneConnectionClass = isConnected ? 'call-scene--connected' : 'call-scene--disconnected';

  const sectionShellClass = isDarkTheme
    ? `call-section-shell call-scene-shell relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-[0_30px_90px_rgba(2,6,23,0.5)] md:p-6 ${sceneStatusClass} ${sceneConnectionClass}`
    : `call-section-shell call-scene-shell relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.12)] md:p-6 ${sceneStatusClass} ${sceneConnectionClass}`;
  const sectionGlowPrimaryClass = isDarkTheme
    ? 'call-aurora call-aurora--primary pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl'
    : 'call-aurora call-aurora--primary pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-violet-200/45 blur-3xl';
  const sectionGlowSecondaryClass = isDarkTheme
    ? 'call-aurora call-aurora--secondary pointer-events-none absolute -bottom-28 right-[-30px] h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl'
    : 'call-aurora call-aurora--secondary pointer-events-none absolute -bottom-28 right-[-30px] h-72 w-72 rounded-full bg-sky-200/40 blur-3xl';
  const collapsedCardClass = isDarkTheme
    ? 'call-collapsed-card flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/95 px-3 py-2 shadow-[0_14px_30px_rgba(2,6,23,0.45)] backdrop-blur cursor-grab active:cursor-grabbing'
    : 'call-collapsed-card flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-[0_12px_26px_rgba(15,23,42,0.14)] backdrop-blur cursor-grab active:cursor-grabbing';
  const collapsedTextClass = isDarkTheme ? 'text-slate-200' : 'text-slate-600';
  const floatingToolbarClass = isDarkTheme
    ? 'call-floating-toolbar mb-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 cursor-grab active:cursor-grabbing'
    : 'call-floating-toolbar mb-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 cursor-grab active:cursor-grabbing';
  const floatingToolbarLabelClass = isDarkTheme ? 'text-slate-200' : 'text-slate-700';
  const ghostButtonClass = isDarkTheme
    ? 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-slate-800 text-slate-200 transition hover:bg-slate-700 cursor-grab active:cursor-grabbing'
    : 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 cursor-grab active:cursor-grabbing';
  const actionButtonClass = isDarkTheme
    ? 'inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/15 bg-slate-800 px-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-700'
    : 'inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100';
  const collapseButtonClass = isDarkTheme
    ? 'inline-flex items-center gap-1 rounded-md border border-white/15 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-100 transition hover:bg-slate-700'
    : 'inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100';
  const hangupButtonClass = isDarkTheme
    ? 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-400/40 bg-rose-500/15 text-rose-100 transition hover:bg-rose-500/25'
    : 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100';
  const headerMetaListClass = isDarkTheme
    ? 'mt-2 flex w-full flex-wrap items-center gap-1.5 text-[11px] text-slate-300'
    : 'mt-2 flex w-full flex-wrap items-center gap-1.5 text-[11px] text-slate-600';
  const headerMetaChipClass = isDarkTheme
    ? 'inline-flex h-7 items-center gap-1.5 rounded-full border border-white/15 bg-slate-900/75 px-2.5'
    : 'inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-white/85 px-2.5';
  const teacherCardClass = isDarkTheme
    ? 'mt-3 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2.5 backdrop-blur'
    : 'mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 backdrop-blur';
  const teacherLabelClass = isDarkTheme ? 'text-[11px] font-semibold uppercase tracking-wide text-slate-300' : 'text-[11px] font-semibold uppercase tracking-wide text-slate-600';
  const teacherSelectClass = isDarkTheme
    ? 'h-9 w-full rounded-xl border border-white/15 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition focus:border-violet-400'
    : 'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-violet-400';
  const mutedTextClass = isDarkTheme ? 'text-xs text-slate-400 md:text-right' : 'text-xs text-slate-500 md:text-right';
  const errorBoxClass = isDarkTheme
    ? 'mt-4 flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100'
    : 'mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700';
  const mediaSectionClass = isDarkTheme
    ? 'call-media-stage rounded-2xl border border-white/10 bg-slate-900/70 p-4 md:p-6'
    : 'call-media-stage rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 md:p-6';
  const peersSectionClass = isDarkTheme
    ? 'call-peers-stage rounded-2xl border border-white/10 bg-slate-900/70 p-3 md:p-4'
    : 'call-peers-stage rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 md:p-4';
  const emptyPeersClass = isDarkTheme
    ? 'flex min-h-[104px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-slate-900/55 px-4 text-center text-xs text-slate-300'
    : 'flex min-h-[104px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 text-center text-xs text-slate-500';
  const emptyPeersHintClass = isDarkTheme ? 'text-[11px] text-slate-400' : 'text-[11px] text-slate-500';
  const statsGridTextClass = isDarkTheme ? 'call-stats-grid mt-4 grid gap-2 text-xs text-slate-200 sm:grid-cols-2 xl:grid-cols-5' : 'call-stats-grid mt-4 grid gap-2 text-xs text-slate-700 sm:grid-cols-2 xl:grid-cols-5';
  const statCardClass = isDarkTheme
    ? 'call-stat-card rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2'
    : 'call-stat-card rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2';
  const statStrongClass = isDarkTheme ? 'font-semibold text-white' : 'font-semibold text-slate-900';
  const connectionHintClass = isDarkTheme ? 'call-connection-hint mt-2 text-xs text-slate-400' : 'call-connection-hint mt-2 text-xs text-slate-500';
  const controlsWrapClass = isDarkTheme
    ? 'call-controls-wrap call-controls-rail mt-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-2 backdrop-blur'
    : 'call-controls-wrap call-controls-rail mt-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/85 p-2 backdrop-blur';
  const baseControlButtonClass = 'call-control-btn inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-45';
  const micSensitivityLabelClass = isDarkTheme ? 'text-xs font-semibold text-slate-200' : 'text-xs font-semibold text-slate-700';
  const neutralControlClass = isDarkTheme
    ? 'border-white/15 bg-slate-800 text-slate-200 hover:bg-slate-700'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100';
  const micOnControlClass = isDarkTheme
    ? 'border-sky-300/40 bg-sky-400/20 text-sky-100 hover:bg-sky-400/30'
    : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100';
  const cameraOnControlClass = isDarkTheme
    ? 'border-cyan-300/40 bg-cyan-400/20 text-cyan-100 hover:bg-cyan-400/30'
    : 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100';
  const screenOnControlClass = isDarkTheme
    ? 'border-violet-300/40 bg-violet-400/20 text-violet-100 hover:bg-violet-400/30'
    : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100';
  const popupCardClass = isDarkTheme
    ? 'absolute w-[244px] rounded-xl border border-white/15 bg-slate-900/95 p-3 shadow-[0_16px_34px_rgba(2,6,23,0.55)] backdrop-blur'
    : 'absolute w-[244px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-[0_16px_34px_rgba(15,23,42,0.2)] backdrop-blur';
  const popupTitleClass = isDarkTheme ? 'truncate text-xs font-semibold text-slate-100' : 'truncate text-xs font-semibold text-slate-800';
  const popupHintClass = isDarkTheme ? 'mt-0.5 text-[11px] text-slate-400' : 'mt-0.5 text-[11px] text-slate-500';
  const popupButtonClass = isDarkTheme
    ? 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-slate-800 text-sm font-semibold text-slate-200 transition hover:bg-slate-700'
    : 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-100';
  const popupValueClass = isDarkTheme ? 'w-10 text-right text-xs font-semibold text-slate-200' : 'w-10 text-right text-xs font-semibold text-slate-700';
  const micSettingsButtonClass = isDarkTheme
    ? `${baseControlButtonClass} border border-white/15 bg-slate-800 text-slate-200 hover:bg-slate-700`
    : `${baseControlButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-100`;
  const micSettingsButtonActiveClass = isDarkTheme
    ? 'border-emerald-300/40 bg-emerald-400/20 text-emerald-100'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const micSettingsPopupClass = isDarkTheme
    ? 'fixed z-[90] rounded-xl border border-white/15 bg-slate-900/95 p-3 shadow-[0_16px_34px_rgba(2,6,23,0.55)] backdrop-blur'
    : 'fixed z-[90] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-[0_16px_34px_rgba(15,23,42,0.2)] backdrop-blur';
  const micSettingsSectionClass = isDarkTheme
    ? 'rounded-lg border border-white/10 bg-slate-900/50 p-2'
    : 'rounded-lg border border-slate-200/60 bg-white/70 p-2';
  const micLevelMeterPopupTrackClass = isDarkTheme
    ? 'relative h-2 flex-1 overflow-hidden rounded-full bg-slate-700'
    : 'relative h-2 flex-1 overflow-hidden rounded-full bg-slate-200';
  const micLevelMeterFillClass = isDarkTheme
    ? 'absolute inset-y-0 left-0 rounded-full bg-slate-400/90 transition-[width] duration-100'
    : 'absolute inset-y-0 left-0 rounded-full bg-slate-400 transition-[width] duration-100';
  const micLevelMeterThresholdClass = isDarkTheme
    ? 'pointer-events-none absolute -top-1 -bottom-1 w-[2px] rounded bg-emerald-300'
    : 'pointer-events-none absolute -top-1 -bottom-1 w-[2px] rounded bg-emerald-500';
  const micLevelMeterHintClass = isDarkTheme ? 'text-[11px] text-slate-400' : 'text-[11px] text-slate-500';
  const speakingRingClass = isDarkTheme
    ? 'call-speaking-ring ring-2 ring-emerald-300/85 ring-offset-2 ring-offset-slate-900'
    : 'call-speaking-ring ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-slate-50';
  const avatarCardClass = isDarkTheme
    ? 'call-avatar-card relative flex h-20 w-20 items-center justify-center rounded-full border bg-slate-800 text-2xl font-semibold text-slate-100 shadow-[0_10px_26px_rgba(2,6,23,0.45)]'
    : 'call-avatar-card relative flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-white text-2xl font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.12)]';
  const idleAvatarBorderClass = isDarkTheme ? 'border-white/15' : 'border-slate-200';
  const avatarBadgeClass = isDarkTheme
    ? 'call-avatar-badge absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-900 bg-slate-700 text-slate-100'
    : 'call-avatar-badge absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600';
  const avatarNameClass = isDarkTheme ? 'call-avatar-name w-full truncate text-xs font-semibold text-slate-100' : 'call-avatar-name w-full truncate text-xs font-semibold text-slate-700';
  const waitingTextClass = isDarkTheme
    ? 'call-waiting-hint mt-3 text-center text-xs text-slate-400'
    : 'call-waiting-hint mt-3 text-center text-xs text-slate-500';
  const modalOverlayClass = isDarkTheme ? 'fixed inset-0 z-50' : 'fixed inset-0 z-50 bg-slate-900/10';
  const popupRangeClass = isDarkTheme ? 'h-2 flex-1 accent-emerald-300' : 'h-2 flex-1 accent-emerald-500';
  const popupToneClass = isDarkTheme ? 'text-slate-200' : 'text-slate-700';
  const lessonChatSectionClass = showInlineLessonChat && lessonChatExpanded
    ? 'call-lesson-chat group/lesson mt-3 flex min-h-0 flex-1 flex-col px-1'
    : (showInlineLessonChat
      ? 'call-lesson-chat group/lesson mt-3 px-1'
      : 'call-lesson-chat group/lesson mt-3 px-1');
  const lessonChatToggleClass = isDarkTheme
    ? 'mb-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-slate-900/40 px-3 text-xs font-semibold text-slate-100 transition hover:bg-slate-800/60'
    : 'mb-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-300/80 bg-white/60 px-3 text-xs font-semibold text-slate-700 transition hover:bg-white';
  const lessonChatBodyClass = showInlineLessonChat
    ? 'flex min-h-0 flex-1 flex-col'
    : '';
  const lessonChatListClass = showInlineLessonChat
    ? 'call-lesson-chat-list flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 pb-2'
    : 'call-lesson-chat-list max-h-[260px] min-h-[88px] overflow-y-auto space-y-1.5 pr-1 pb-2';
  const lessonChatBubbleBaseClass = isDarkTheme
    ? 'call-lesson-chat-bubble relative rounded-2xl border px-3 py-2 text-[13px] text-slate-100 backdrop-blur-sm transition-all duration-300'
    : 'call-lesson-chat-bubble relative rounded-2xl border px-3 py-2 text-[13px] text-slate-700 backdrop-blur-sm transition-all duration-300';
  const lessonChatMineClass = isDarkTheme
    ? 'border-violet-300/35 bg-violet-400/16 text-violet-50'
    : 'border-violet-200/80 bg-violet-500/12 text-violet-900';
  const lessonChatPeerClass = isDarkTheme
    ? 'border-cyan-300/28 bg-cyan-400/12'
    : 'border-sky-200/80 bg-sky-500/10';
  const lessonChatMetaClass = isDarkTheme ? 'mt-1 text-[10px] text-slate-300/80' : 'mt-1 text-[10px] text-slate-500';
  const lessonChatEmptyClass = isDarkTheme
    ? 'call-lesson-chat-empty flex min-h-[88px] flex-col items-center justify-center gap-1.5 text-center text-xs text-slate-300/80'
    : 'call-lesson-chat-empty flex min-h-[88px] flex-col items-center justify-center gap-1.5 text-center text-xs text-slate-500';
  const lessonChatInputWrapClass = isDarkTheme
    ? 'call-lesson-chat-input mt-1 flex max-h-0 translate-y-2 items-end gap-2 overflow-hidden opacity-0 pointer-events-none transition-all duration-400 group-hover/lesson:max-h-48 group-hover/lesson:translate-y-0 group-hover/lesson:opacity-100 group-hover/lesson:pointer-events-auto group-focus-within/lesson:max-h-48 group-focus-within/lesson:translate-y-0 group-focus-within/lesson:opacity-100 group-focus-within/lesson:pointer-events-auto'
    : 'call-lesson-chat-input mt-1 flex max-h-0 translate-y-2 items-end gap-2 overflow-hidden opacity-0 pointer-events-none transition-all duration-400 group-hover/lesson:max-h-48 group-hover/lesson:translate-y-0 group-hover/lesson:opacity-100 group-hover/lesson:pointer-events-auto group-focus-within/lesson:max-h-48 group-focus-within/lesson:translate-y-0 group-focus-within/lesson:opacity-100 group-focus-within/lesson:pointer-events-auto';
  const lessonChatTextareaClass = isDarkTheme
    ? 'w-full resize-none rounded-xl border border-white/15 bg-slate-900/45 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-300/70'
    : 'w-full resize-none rounded-xl border border-slate-300/70 bg-white/45 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400';
  const lessonChatAttachClass = isDarkTheme
    ? 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-slate-900/45 text-slate-200 transition hover:bg-slate-800/60'
    : 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300/70 bg-white/70 text-slate-700 transition hover:bg-white';
  const lessonChatSendClass = isDarkTheme
    ? 'inline-flex self-stretch min-w-[128px] items-center justify-center gap-2 rounded-xl border border-violet-300/45 bg-violet-500/30 px-3 text-sm font-semibold text-violet-50 transition hover:bg-violet-400/40 disabled:opacity-45 disabled:cursor-not-allowed'
    : 'inline-flex self-stretch min-w-[128px] items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-500/20 px-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-500/30 disabled:opacity-45 disabled:cursor-not-allowed';
  const lessonChatErrorClass = isDarkTheme ? 'mt-2 text-xs text-rose-300' : 'mt-2 text-xs text-rose-600';

  const collapsedPanelStyle = collapsedPanelPosition
    ? { left: `${collapsedPanelPosition.x}px`, top: `${collapsedPanelPosition.y}px`, transform: 'none' }
    : undefined;
  const floatingPanelStyle = floatingPanelPosition
    ? {
      left: `${floatingPanelPosition.x}px`,
      top: `${floatingPanelPosition.y}px`,
      right: 'auto',
      width: Number.isFinite(floatingPanelPosition.width) ? `${floatingPanelPosition.width}px` : undefined,
    }
    : undefined;
  const inlinePanelHeightPx = Math.max(0, Math.floor(Number(inlinePanelMinHeightPx) || 0));
  const inlinePanelStyle = showInlineLessonChat && inlinePanelHeightPx > 0
    ? {
      height: `${inlinePanelHeightPx}px`,
      maxHeight: `${inlinePanelHeightPx}px`,
    }
    : undefined;

  if (isHiddenUi) {
    return null;
  }

  if (isCollapsedUi) {
    const collapsedPanelNode = (
      <div
        ref={collapsedPanelRef}
        className="call-collapsed-shell fixed left-1/2 top-2 z-50 w-[min(96vw,640px)] -translate-x-1/2"
        style={collapsedPanelStyle}
        onPointerDown={(event) => startPanelDrag(event, 'collapsed')}
      >
        <div className={collapsedCardClass}>
          <button
            type="button"
            className={ghostButtonClass}
            title="Переместить панель"
          >
            <Move size={13} />
          </button>
          <span className={`call-status-chip call-status-chip--${statusTone} inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusChipClass}`}>
            <span className={`call-status-dot call-status-dot--${statusTone}`} aria-hidden="true" />
            <span>{statusText}</span>
          </span>
          <p className={`min-w-0 flex-1 truncate text-xs ${collapsedTextClass}`}>
            Созвон активен • участников: {participantCount}
          </p>
          <button
            type="button"
            onClick={onRequestExpand}
            className={actionButtonClass}
            title="Развернуть"
          >
            <Maximize2 size={13} />
            Развернуть
          </button>
          <button
            type="button"
            onClick={stopCall}
            className={hangupButtonClass}
            title="Завершить звонок"
          >
            <PhoneOff size={13} />
          </button>
        </div>
      </div>
    );
    const collapsedPanelPortal = typeof document !== 'undefined'
      ? createPortal(collapsedPanelNode, document.body)
      : collapsedPanelNode;
    return (
      <>
        {isConnected && remotePeers.map((peer) => (
          <RemoteAudioPlayer
            key={`audio:${peer.peerId}`}
            peerId={peer.peerId}
            stream={peer.stream || null}
            onSpeakingChange={handlePeerSpeakingChange}
            volume={normalizePeerVolume(volumeByPeer[peer.peerId])}
          />
        ))}
        {collapsedPanelPortal}
      </>
    );
  }

  const panelNode = (
    <div
      ref={isFloatingUi ? floatingPanelRef : inlinePanelRef}
      className={isFloatingUi
        ? 'call-panel-root call-panel-root--floating fixed inset-x-2 top-2 z-50 max-h-[calc(100vh-1rem)] overflow-y-auto md:inset-x-auto md:right-4 md:top-4 md:w-[min(980px,calc(100vw-2rem))]'
        : `call-panel-root animate-fadeIn ${showInlineLessonChat ? 'flex min-h-0 flex-col overflow-hidden pb-2' : 'pb-10'}`}
      style={isFloatingUi ? floatingPanelStyle : inlinePanelStyle}
      data-tour="call"
    >
      <section className={sectionShellClass}>
        <div className={sectionGlowPrimaryClass} />
        <div className={sectionGlowSecondaryClass} />
        <div className="call-grid-overlay" aria-hidden="true" />
        <div className="call-noise-overlay" aria-hidden="true" />
        <div className="call-orbit-ring call-orbit-ring--one" aria-hidden="true" />
        <div className="call-orbit-ring call-orbit-ring--two" aria-hidden="true" />
        <div className="call-particle-field" aria-hidden="true">
          {Array.from({ length: CALL_BACKGROUND_PARTICLE_COUNT }).map((_, index) => (
            <span key={`call-bg-particle-${index}`} style={{ '--call-particle-index': index }} />
          ))}
        </div>
        <div className="call-light-ribbon call-light-ribbon--one" aria-hidden="true" />
        <div className="call-light-ribbon call-light-ribbon--two" aria-hidden="true" />
        <div className="call-scene-sweep" aria-hidden="true" />
        <div className="call-energy-wave call-energy-wave--one" aria-hidden="true" />
        <div className="call-energy-wave call-energy-wave--two" aria-hidden="true" />

        <div className="relative z-10">
          {isFloatingUi && (
            <div className={floatingToolbarClass} onPointerDown={(event) => startPanelDrag(event, 'floating')}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={ghostButtonClass}
                  title="Переместить панель"
                >
                  <Move size={13} />
                </button>
                <p className={`text-xs font-semibold uppercase tracking-wide ${floatingToolbarLabelClass}`}>Панель созвона</p>
              </div>
              <button
                type="button"
                onClick={onRequestCollapse}
                className={collapseButtonClass}
                title="Свернуть"
              >
                <Minimize2 size={13} />
                Свернуть
              </button>
            </div>
          )}
          <header className="call-main-header">
            <div className={headerMetaListClass}>
              <span className={headerMetaChipClass}>
                <Users size={12} />
                <span>{participantCount}</span>
              </span>
              <span className={headerMetaChipClass}>
                <Signal size={12} />
                <span>{qualityText}</span>
              </span>
              <span className={`call-status-chip call-status-chip--${statusTone} ml-auto inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusChipClass}`}>
                <span className={`call-status-dot call-status-dot--${statusTone}`} aria-hidden="true" />
                <span>{statusText}</span>
              </span>
            </div>
          </header>

          {isTeacher && (
            <div className={teacherCardClass}>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[auto_minmax(240px,1fr)_minmax(0,1fr)] md:items-center">
                <label className={teacherLabelClass} htmlFor="call-student-select">
                  Ученик
                </label>
                <select
                  id="call-student-select"
                  className={teacherSelectClass}
                  value={activeStudentId || ''}
                  onChange={(event) => onSelectStudent?.(event.target.value || null)}
                  disabled={studentsLoading}
                >
                  <option value="">Выбери ученика</option>
                  {(students || []).map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
                <p className={`${mutedTextClass} min-w-0 truncate`}>Текущий: {selectedStudentName}</p>
              </div>
            </div>
          )}

          {resolvedError && (
            <div className={errorBoxClass}>
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>{resolvedError}</p>
            </div>
          )}

          <div className="mt-3 space-y-3 md:space-y-4">
            {isConnected && remotePeers.map((peer) => (
              <RemoteAudioPlayer
                key={`audio:${peer.peerId}`}
                peerId={peer.peerId}
                stream={peer.stream || null}
                onSpeakingChange={handlePeerSpeakingChange}
                volume={normalizePeerVolume(volumeByPeer[peer.peerId])}
              />
            ))}

            {isConnected ? (
              <section className={mediaSectionClass}>
                <div className="call-media-grid flex flex-wrap items-center justify-center gap-5 md:gap-8">
                  {voiceCallParticipants.map((peer, index) => {
                    const initial = String(peer.title || 'U').trim().charAt(0).toUpperCase() || 'U';
                    if (peer.isSelf && peer.hasVideo) {
                      return (
                        <div
                          key={peer.id}
                          className="call-participant-entry call-participant-entry--video"
                          data-speaking={peer.isSpeaking ? 'true' : 'false'}
                          data-self={peer.isSelf ? 'true' : 'false'}
                          style={{
                            '--call-stagger-index': index,
                            '--call-depth-rotate': `${((index % 5) - 2) * 0.9}deg`,
                          }}
                        >
                          <MediaTile
                            stream={peer.stream}
                            title="Вы"
                            subtitle={peer.subtitle}
                            videoKind={peer.videoKind}
                            compact
                            isSpeaking={peer.isSpeaking}
                            muted
                            allowFullscreen={false}
                            isDarkTheme={isDarkTheme}
                          />
                        </div>
                      );
                    }
                    if (!peer.isSelf && peer.hasVideo) {
                      return (
                        <div
                          key={peer.id}
                          className="call-participant-entry call-participant-entry--video"
                          data-speaking={peer.isSpeaking ? 'true' : 'false'}
                          data-self={peer.isSelf ? 'true' : 'false'}
                          style={{
                            '--call-stagger-index': index,
                            '--call-depth-rotate': `${((index % 5) - 2) * 0.9}deg`,
                          }}
                        >
                          <MediaTile
                            stream={peer.stream}
                            title={peer.title}
                            subtitle={peer.subtitle}
                            videoKind={peer.videoKind}
                            compact
                            isSpeaking={peer.isSpeaking}
                            isDarkTheme={isDarkTheme}
                            onContextMenu={(event) => openVolumePopupForParticipant(event, peer)}
                          />
                        </div>
                      );
                    }
                    return (
                      <article
                        key={peer.id}
                        onContextMenu={(event) => openVolumePopupForParticipant(event, peer)}
                        className="call-participant-entry call-participant-entry--avatar flex w-[104px] flex-col items-center gap-2 text-center"
                        data-speaking={peer.isSpeaking ? 'true' : 'false'}
                        data-self={peer.isSelf ? 'true' : 'false'}
                        style={{
                          '--call-stagger-index': index,
                          '--call-depth-rotate': `${((index % 5) - 2) * 0.9}deg`,
                        }}
                        title={peer.subtitle}
                      >
                        <div className={`${avatarCardClass} ${peer.isSpeaking ? speakingRingClass : idleAvatarBorderClass}`}>
                          {initial}
                          <span className={`call-avatar-voice ${peer.isSpeaking ? 'is-speaking' : ''}`} aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                          {peer.isSelf && (
                            <span className={avatarBadgeClass}>
                              {micEnabled ? <Mic size={10} /> : <MicOff size={10} />}
                            </span>
                          )}
                        </div>
                        <p className={avatarNameClass}>{peer.title}</p>
                      </article>
                    );
                  })}
                </div>
                {voiceCallParticipants.length <= 1 && (
                  <p className={waitingTextClass}>Ожидание подключения собеседника</p>
                )}
              </section>
            ) : (
              <section className={peersSectionClass}>
                {visiblePeers.length === 0 ? (
                  <div className={emptyPeersClass}>
                    <Users size={16} />
                    <p>В созвоне никого</p>
                    <p className={emptyPeersHintClass}>Подключитесь кнопкой ниже, чтобы начать.</p>
                  </div>
                ) : (
                  <div className="call-peers-grid flex flex-wrap items-start justify-center gap-5 md:gap-8">
                    {visiblePeers.map((peer, index) => {
                      const initial = String(peer.title || 'U').trim().charAt(0).toUpperCase() || 'U';
                      return (
                        <article
                          key={peer.peerId}
                          className="call-participant-entry call-participant-entry--avatar flex w-[104px] flex-col items-center gap-2 text-center"
                          data-speaking="false"
                          data-self="false"
                          style={{
                            '--call-stagger-index': index,
                            '--call-depth-rotate': `${((index % 5) - 2) * 0.9}deg`,
                          }}
                          title={peer.subtitle}
                        >
                          <div className={`${avatarCardClass} ${idleAvatarBorderClass}`}>
                            {initial}
                            <span className="call-avatar-voice" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </span>
                          </div>
                          <p className={avatarNameClass}>{peer.title}</p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>

          {isTeacher && (
            <>
              <div className={statsGridTextClass}>
                <p className={statCardClass}>
                  <span className="inline-flex items-center gap-1"><Users size={13} /> Участники:</span>{' '}
                  <span className={statStrongClass}>{participantCount}</span>
                </p>
                <p className={`${statCardClass} ${qualityClass}`}>
                  <span className="inline-flex items-center gap-1"><Signal size={13} /> Качество:</span>{' '}
                  <span className="font-semibold">{qualityText}</span>
                </p>
                <p className={`${statCardClass} ${popupToneClass}`}>
                  Сигналинг: <span className={statStrongClass}>{socketStatus}</span>
                </p>
                <p className={`${statCardClass} truncate`} title={roomHint}>
                  Комната: <span className={statStrongClass}>{roomHint}</span>
                </p>
                <p className={`${statCardClass} truncate`} title={selfClientId || 'Не назначен'}>
                  ID клиента: <span className={statStrongClass}>{selfClientId || '—'}</span>
                </p>
              </div>

              <p className={connectionHintClass}>
                Потери: {connectionStats.lossPercent.toFixed(1)}% | Джиттер: {Math.round(connectionStats.jitterMs)} ms | RTT: {Math.round(connectionStats.rttMs)} ms
              </p>
            </>
          )}

          <div className={`${controlsWrapClass} ${sceneStatusClass}`}>
            <button
              type="button"
              onClick={startCall}
              disabled={!canStart}
              data-live={isConnecting ? 'true' : 'false'}
              className={`${baseControlButtonClass} call-control-btn--start border border-emerald-300/60 bg-emerald-400 text-slate-950 hover:bg-emerald-300`}
              aria-label={isConnecting ? 'Подключение...' : 'Подключиться'}
              title={isConnecting ? 'Подключение...' : 'Подключиться'}
            >
              {isConnecting ? <Loader2 size={18} className="animate-spin" /> : <Phone size={18} />}
            </button>
            <button
              type="button"
              onClick={stopCall}
              disabled={!canStop}
              className={`${baseControlButtonClass} call-control-btn--hangup border border-rose-300/60 bg-rose-500 text-white hover:bg-rose-400`}
              aria-label="Завершить звонок"
              title="Завершить звонок"
            >
              <PhoneOff size={18} />
            </button>
            <div ref={micSettingsWrapRef} className="relative inline-flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                disabled={!canToggleMic}
                data-live={micEnabled ? 'true' : 'false'}
                className={`${baseControlButtonClass} call-control-btn--mic ${micEnabled ? 'call-control-btn--active' : ''} border ${
                  micEnabled
                    ? micOnControlClass
                    : neutralControlClass
                }`}
                aria-label={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
                title={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
              >
                {micBusy ? <Loader2 size={18} className="animate-spin" /> : (micEnabled ? <Mic size={18} /> : <MicOff size={18} />)}
              </button>
              <button
                ref={micSettingsButtonRef}
                type="button"
                onClick={() => {
                  setMicSettingsOpen((prev) => {
                    const next = !prev;
                    if (!next) {
                      setMicSettingsPosition(null);
                    }
                    return next;
                  });
                }}
                disabled={!canToggleMic}
                className={`${micSettingsButtonClass} call-control-btn--settings ${micSettingsOpen ? micSettingsButtonActiveClass : ''}`}
                aria-label="Настройки микрофона"
                title="Настройки микрофона"
              >
                <Settings size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={toggleCamera}
              disabled={!canToggleCamera}
              data-live={cameraEnabled ? 'true' : 'false'}
              className={`${baseControlButtonClass} call-control-btn--camera ${cameraEnabled ? 'call-control-btn--active' : ''} border ${
                cameraEnabled
                  ? cameraOnControlClass
                  : neutralControlClass
              }`}
              aria-label={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
              title={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
            >
              {cameraBusy ? <Loader2 size={18} className="animate-spin" /> : (cameraEnabled ? <Camera size={18} /> : <CameraOff size={18} />)}
            </button>
            <button
              type="button"
              onClick={toggleScreenShare}
              disabled={!canToggleScreen}
              data-live={screenSharing ? 'true' : 'false'}
              className={`${baseControlButtonClass} call-control-btn--screen ${screenSharing ? 'call-control-btn--active' : ''} border ${
                screenSharing
                  ? screenOnControlClass
                  : neutralControlClass
              }`}
              aria-label={screenSharing ? 'Остановить показ экрана' : 'Показать экран'}
              title={screenSharing ? 'Остановить показ экрана' : 'Показать экран'}
            >
              {screenBusy ? <Loader2 size={18} className="animate-spin" /> : (screenSharing ? <MonitorX size={18} /> : <MonitorUp size={18} />)}
            </button>
          </div>

          {micSettingsOpen && micSettingsPosition && typeof document !== 'undefined' && createPortal(
            <div
              ref={micSettingsPopupRef}
              className={micSettingsPopupClass}
              style={{
                left: `${micSettingsPosition.left}px`,
                top: `${micSettingsPosition.top}px`,
                width: `${micSettingsPosition.width}px`,
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <p className={popupTitleClass}>Настройки микрофона</p>
              <div className="mt-3 flex flex-col gap-3">
                <div className={micSettingsSectionClass}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={micSensitivityLabelClass}>Усиление микрофона</span>
                    <span className={popupValueClass}>{normalizeMicSensitivityPercent(micSensitivityPercent)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustMicSensitivity(-MIC_SENSITIVITY_STEP_PERCENT)}
                      className={popupButtonClass}
                      title="Уменьшить усиление микрофона"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min={MIN_MIC_SENSITIVITY_PERCENT}
                      max={MAX_MIC_SENSITIVITY_PERCENT}
                      step={5}
                      value={normalizeMicSensitivityPercent(micSensitivityPercent)}
                      onChange={(event) => {
                        setMicSensitivityPercentSafe(Number(event.target.value));
                      }}
                      className={popupRangeClass}
                      aria-label="Усиление вашего микрофона"
                    />
                    <button
                      type="button"
                      onClick={() => adjustMicSensitivity(MIC_SENSITIVITY_STEP_PERCENT)}
                      className={popupButtonClass}
                      title="Увеличить усиление микрофона"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className={micSettingsSectionClass}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={micSensitivityLabelClass}>Порог срабатывания</span>
                    <span className={popupValueClass}>{normalizeMicTriggerThresholdPercent(micTriggerThresholdPercent)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustMicTriggerThreshold(-MIC_TRIGGER_THRESHOLD_STEP_PERCENT)}
                      className={popupButtonClass}
                      title="Понизить порог срабатывания"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min={MIN_MIC_TRIGGER_THRESHOLD_PERCENT}
                      max={MAX_MIC_TRIGGER_THRESHOLD_PERCENT}
                      step={5}
                      value={normalizeMicTriggerThresholdPercent(micTriggerThresholdPercent)}
                      onChange={(event) => {
                        setMicTriggerThresholdPercentSafe(Number(event.target.value));
                      }}
                      className={popupRangeClass}
                      aria-label="Порог срабатывания микрофона"
                    />
                    <button
                      type="button"
                      onClick={() => adjustMicTriggerThreshold(MIC_TRIGGER_THRESHOLD_STEP_PERCENT)}
                      className={popupButtonClass}
                      title="Повысить порог срабатывания"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className={micLevelMeterPopupTrackClass} aria-hidden="true">
                      <div
                        className={micLevelMeterFillClass}
                        style={{ width: `${normalizedMicInputLevelPercent}%` }}
                      />
                      <div
                        className={micLevelMeterThresholdClass}
                        style={{ left: `calc(${micTriggerThresholdMeterPercent}% - 1px)` }}
                      />
                    </div>
                    <span className={popupValueClass}>{normalizedMicInputLevelPercent}%</span>
                  </div>
                  <p className={`${micLevelMeterHintClass} mt-2`}>
                    Серое — текущая громкость, зелёная метка — порог.
                  </p>
                </div>
              </div>
            </div>,
            document.body
          )}

          {volumePopup && (
            <div
              className={modalOverlayClass}
              onMouseDown={closeVolumePopup}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div
                ref={volumePopupRef}
                onMouseDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
                className={popupCardClass}
                style={{ left: `${volumePopup.x}px`, top: `${volumePopup.y}px` }}
              >
                <p className={popupTitleClass}>{volumePopup.title}</p>
                <p className={popupHintClass}>Громкость</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustPeerVolume(volumePopup.peerId, -PEER_VOLUME_STEP_PERCENT)}
                    className={popupButtonClass}
                    title="Убавить громкость"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={peerVolumeToPercent(volumeByPeer[volumePopup.peerId])}
                    onChange={(event) => {
                      setPeerVolumePercent(volumePopup.peerId, Number(event.target.value));
                    }}
                    className={popupRangeClass}
                    aria-label={`Громкость ${volumePopup.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => adjustPeerVolume(volumePopup.peerId, PEER_VOLUME_STEP_PERCENT)}
                    className={popupButtonClass}
                    title="Прибавить громкость"
                  >
                    +
                  </button>
                  <span className={popupValueClass}>
                    {peerVolumeToPercent(volumeByPeer[volumePopup.peerId])}%
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      {showInlineLessonChat && (
        <section className={lessonChatSectionClass} aria-label={lessonChatTitle}>
          <div className="mb-1 flex items-center justify-end">
            <button
              type="button"
              className={lessonChatToggleClass}
              onClick={() => setLessonChatExpanded((prev) => !prev)}
              aria-expanded={lessonChatExpanded}
            >
              {lessonChatExpanded ? 'Скрыть чат' : `Показать чат${lessonChatMessages.length > 0 ? ` (${lessonChatMessages.length})` : ''}`}
            </button>
          </div>

          {lessonChatExpanded && (
            <div className={lessonChatBodyClass}>
              <div ref={lessonChatListRef} className={lessonChatListClass}>
                {lessonChatLoading ? (
                  <div className={lessonChatEmptyClass}>Загружаем сообщения...</div>
                ) : lessonChatMessages.length === 0 ? (
                  <div className={lessonChatEmptyClass}>
                    <MessageSquare size={16} />
                    <p>Пока сообщений нет.</p>
                    <p className={emptyPeersHintClass}>Начните диалог прямо во время урока.</p>
                  </div>
                ) : (
                  lessonChatMessages.map((message, index) => {
                    const senderRole = String(message?.senderRole || '').trim();
                    const senderId = String(message?.senderId || '').trim();
                    const localId = String(userId || '').trim();
                    const isMine = senderRole === (isTeacher ? 'teacher' : 'student') || (localId && senderId === localId);
                    const messageText = String(message?.text || '');
                    const messageImageDataUrl = String(message?.imageDataUrl || '').trim();
                    const messageImageName = String(message?.imageName || '').trim();
                    return (
                      <div
                        key={message?.id || `${senderId}-${message?.createdAt || index}`}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`${lessonChatBubbleBaseClass} ${isMine ? lessonChatMineClass : lessonChatPeerClass} max-w-[min(82%,740px)] opacity-45 group-hover/lesson:opacity-100 group-focus-within/lesson:opacity-100`}
                        >
                          {!isMine && (
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-80">
                              {message?.senderName || lessonChatPeerName}
                            </div>
                          )}
                          {messageImageDataUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setLessonChatPreviewImage({
                                  src: messageImageDataUrl,
                                  name: messageImageName,
                                });
                              }}
                              className="mb-2 block overflow-hidden rounded-lg border border-white/15"
                              title={messageImageName || 'Открыть изображение'}
                              aria-label={messageImageName || 'Открыть изображение'}
                            >
                              <img
                                src={messageImageDataUrl}
                                alt={messageImageName || 'Изображение из чата'}
                                className="max-h-[220px] w-full object-contain bg-black/25"
                                loading="lazy"
                              />
                            </button>
                          )}
                          {messageText && (
                            <LinkifiedText
                              text={messageText}
                              className="whitespace-pre-wrap break-words"
                              linkClassName={isMine ? 'underline decoration-white/70 underline-offset-2' : 'underline decoration-current/70 underline-offset-2'}
                            />
                          )}
                          <div className={lessonChatMetaClass}>
                            {formatChatDateTime(message?.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className={lessonChatInputWrapClass}>
                <input
                  ref={lessonChatImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      handleLessonChatImageSelect(file);
                    }
                  }}
                />
                <div className="flex-1 space-y-2">
                  {lessonChatImageDataUrl && (
                    <div className={isDarkTheme ? 'flex items-start gap-2 rounded-lg border border-white/15 bg-slate-900/40 px-2 py-2' : 'flex items-start gap-2 rounded-lg border border-slate-300/70 bg-white/70 px-2 py-2'}>
                      <img
                        src={lessonChatImageDataUrl}
                        alt={lessonChatImageName || '\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435'}
                        className="h-12 w-12 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={isDarkTheme ? 'truncate text-xs text-slate-200' : 'truncate text-xs text-slate-700'}>
                          {lessonChatImageName || '\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435'}
                        </p>
                        <p className={isDarkTheme ? 'text-[11px] text-slate-400' : 'text-[11px] text-slate-500'}>
                          {'\u0414\u043e 5 \u041c\u0411'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={isDarkTheme ? 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 text-slate-200 hover:bg-slate-800/70' : 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100'}
                        onClick={clearLessonChatImage}
                        aria-label={'\u0423\u0431\u0440\u0430\u0442\u044c \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435'}
                        title={'\u0423\u0431\u0440\u0430\u0442\u044c \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435'}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <textarea
                    value={lessonChatText}
                    onChange={(event) => setLessonChatText(event.target.value)}
                    onPaste={(event) => {
                      const items = Array.from(event.clipboardData?.items || []);
                      const imageItem = items.find((item) => item.kind === 'file' && String(item.type || '').toLowerCase().startsWith('image/'));
                      if (!imageItem) return;
                      const file = imageItem.getAsFile?.();
                      if (!file) return;
                      event.preventDefault();
                      handleLessonChatImageSelect(file);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleLessonChatSend();
                      }
                    }}
                    rows={2}
                    disabled={lessonChatDisabled}
                    placeholder={lessonChatDisabled ? '\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0447\u0435\u043d\u0438\u043a\u0430, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0447\u0430\u0442...' : `${lessonChatPlaceholder} (\u043c\u043e\u0436\u043d\u043e \u0432\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443 Ctrl+V)`}
                    className={lessonChatTextareaClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => lessonChatImageInputRef.current?.click()}
                  disabled={lessonChatDisabled || lessonChatSending}
                  className={lessonChatAttachClass}
                  aria-label={'\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435'}
                  title={'\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 (\u0434\u043e 5 \u041c\u0411)'}
                >
                  <ImagePlus size={17} />
                </button>
                <button
                  type="button"
                  onClick={handleLessonChatSend}
                  disabled={lessonChatSending || (!String(lessonChatText || '').trim() && !lessonChatImageDataUrl) || lessonChatDisabled}
                  className={lessonChatSendClass}
                >
                  <SendHorizontal size={15} />
                  {lessonChatSending ? '\u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430...' : '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c'}
                </button>
              </div>
              {lessonChatError && <div className={lessonChatErrorClass}>{lessonChatError}</div>}
            </div>
          )}
        </section>
      )}

      {lessonChatPreviewImage && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          onMouseDown={() => setLessonChatPreviewImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр изображения"
        >
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition hover:bg-black/55"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setLessonChatPreviewImage(null)}
            aria-label="Закрыть просмотр изображения"
            title="Закрыть"
          >
            <X size={18} />
          </button>
          <div
            className="relative max-h-[92vh] max-w-[96vw]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <img
              src={String(lessonChatPreviewImage.src || '')}
              alt={String(lessonChatPreviewImage.name || 'Изображение из чата')}
              className="max-h-[88vh] max-w-[96vw] rounded-xl object-contain shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
              loading="eager"
            />
            {lessonChatPreviewImage.name && (
              <div className="mt-2 rounded-lg border border-white/15 bg-black/35 px-3 py-1.5 text-center text-xs text-white/90">
                {lessonChatPreviewImage.name}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
  if (isFloatingUi && typeof document !== 'undefined') {
    return createPortal(panelNode, document.body);
  }
  return panelNode;
};

export default CallSection;
