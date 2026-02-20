import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Maximize2, Mic, MicOff, Minimize2, MonitorUp, MonitorX, Phone, PhoneOff, Signal, Users } from 'lucide-react';

const DEFAULT_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
const WS_PING_INTERVAL_MS = 15000;
const AUDIO_MAX_BITRATE = 32000;
const getPositiveNumberFromEnv = (key, fallback) => {
  const value = typeof import.meta !== 'undefined' ? import.meta.env?.[key] : undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const VIDEO_MAX_BITRATE = getPositiveNumberFromEnv('VITE_RTC_SCREEN_MAX_BITRATE', 3500000);
const SCREEN_MAX_FRAMERATE = getPositiveNumberFromEnv('VITE_RTC_SCREEN_MAX_FRAMERATE', 60);
const SCREEN_MAX_WIDTH = getPositiveNumberFromEnv('VITE_RTC_SCREEN_MAX_WIDTH', 1920);
const SCREEN_MAX_HEIGHT = getPositiveNumberFromEnv('VITE_RTC_SCREEN_MAX_HEIGHT', 1080);
const CONNECTION_STATS_INTERVAL_MS = 2500;
const RTC_PRESENCE_POLL_INTERVAL_MS = 3000;
const PEER_DISCONNECTED_GRACE_MS = 10000;

const getRtcWsUrl = () => {
  if (typeof window === 'undefined') return '';
  const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_RTC_WS_URL : '';
  const normalizedEnvUrl = typeof envUrl === 'string' ? envUrl.trim() : '';
  if (normalizedEnvUrl) return normalizedEnvUrl;

  const { protocol, hostname, port, host } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  if ((import.meta?.env?.DEV || port === '5173') && port === '5173') {
    return `${wsProtocol}://${hostname}:5175/rtc`;
  }
  return `${wsProtocol}://${host}/rtc`;
};

const getRtcIceServers = () => {
  const raw = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_RTC_ICE_SERVERS : '';
  const normalizedRaw = typeof raw === 'string' ? raw.trim() : '';
  if (!normalizedRaw) return DEFAULT_ICE_SERVERS;
  try {
    const parsed = JSON.parse(normalizedRaw);
    if (!Array.isArray(parsed)) return DEFAULT_ICE_SERVERS;
    const normalized = parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const urlsValue = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
        const urls = urlsValue
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        if (!urls.length) return null;
        const iceServer = { urls };
        if (entry.username) iceServer.username = String(entry.username);
        if (entry.credential) iceServer.credential = String(entry.credential);
        return iceServer;
      })
      .filter(Boolean);
    if (!normalized.length) return DEFAULT_ICE_SERVERS;
    return normalized;
  } catch {
    return DEFAULT_ICE_SERVERS;
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

const formatRtcRoleLabel = (role) => {
  if (role === 'teacher') return 'Преподаватель';
  if (role === 'student') return 'Ученик';
  if (role === 'admin') return 'Администратор';
  return 'Участник';
};

const hasLiveVideoInStream = (stream) => {
  const tracks = Array.isArray(stream?.getVideoTracks?.()) ? stream.getVideoTracks() : [];
  return tracks.some((track) => track.readyState === 'live');
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

const MediaTile = ({ stream, title, subtitle, className = '', compact = false }) => {
  const tileRef = useRef(null);
  const mediaRef = useRef(null);
  const [, setVideoTrackVersion] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isCompact = compact && !isFullscreen;

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
  }, []);

  if (isCompact) {
    const initial = String(title || 'U').trim().charAt(0).toUpperCase() || 'U';
    if (hasVideo) {
      return (
        <article
          ref={tileRef}
          onDoubleClick={toggleFullscreen}
          className={`relative overflow-hidden border border-white/15 bg-slate-900 shadow-[0_10px_26px_rgba(2,6,23,0.45)] ${isFullscreen ? 'h-screen w-screen rounded-none border-0' : 'h-24 w-36 rounded-xl md:h-28 md:w-44'} ${className}`}
        >
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black/45 text-white transition hover:bg-black/65"
            title={isFullscreen ? 'Выйти из полного экрана' : 'Открыть на весь экран'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <video
            ref={mediaRef}
            autoPlay
            playsInline
            className="h-full w-full bg-slate-950 object-cover"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-2 pb-2 pt-5">
            <p className="truncate text-xs font-semibold text-white">{title}</p>
            <p className="truncate text-[11px] text-slate-200">{subtitle}</p>
          </div>
        </article>
      );
    }
    return (
      <article
        ref={tileRef}
        onDoubleClick={undefined}
        className={`relative rounded-xl border border-white/10 bg-slate-900/85 px-2.5 py-2 shadow-[0_6px_16px_rgba(2,6,23,0.32)] ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/15 bg-slate-700">
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-100">
              {initial}
            </div>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-slate-900 bg-slate-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-100">{title}</p>
            <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      ref={tileRef}
      onDoubleClick={toggleFullscreen}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-[0_8px_24px_rgba(2,6,23,0.35)] ${className}`}
    >
      <button
        type="button"
        onClick={toggleFullscreen}
        className={`absolute z-10 inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/45 text-white transition hover:bg-black/65 ${isCompact ? 'right-2 top-2 h-7 w-7' : 'right-3 top-3 h-9 w-9'}`}
        title={isFullscreen ? 'Выйти из полного экрана' : 'Открыть на весь экран'}
      >
        {isFullscreen ? <Minimize2 size={isCompact ? 13 : 16} /> : <Maximize2 size={isCompact ? 13 : 16} />}
      </button>
      <video
        ref={mediaRef}
        autoPlay
        playsInline
        className={`w-full bg-slate-950 object-cover ${isFullscreen ? 'h-screen' : (isCompact ? 'h-24 md:h-28' : 'h-72 md:h-80')}`}
      />
      {!hasVideo && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-300 ${isCompact ? 'gap-2' : 'gap-3'}`}>
          <div className={`flex items-center justify-center rounded-full bg-slate-700 font-semibold text-slate-100 ${isCompact ? 'h-10 w-10 text-lg' : 'h-16 w-16 text-2xl'}`}>
            {String(title || 'U').trim().charAt(0).toUpperCase() || 'U'}
          </div>
          <p className={isCompact ? 'text-xs font-medium' : 'text-sm font-medium'}>Видео не передается</p>
        </div>
      )}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent ${isCompact ? 'px-2.5 pb-2 pt-6' : 'px-3 pb-3 pt-8'}`}>
        <p className={`truncate font-semibold text-white ${isCompact ? 'text-xs' : 'text-sm'}`}>{title}</p>
        <p className={`truncate text-slate-200 ${isCompact ? 'text-[11px]' : 'text-xs'}`}>{subtitle}</p>
      </div>
    </article>
  );
};

const RemoteAudioPlayer = ({ stream }) => {
  const audioRef = useRef(null);

  useEffect(() => {
    const audioNode = audioRef.current;
    if (!audioNode) return undefined;
    audioNode.srcObject = stream || null;
    audioNode.play?.().catch(() => {});
    return () => {
      audioNode.srcObject = null;
    };
  }, [stream]);

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
}) => {
  const isTeacher = role === 'teacher';
  const effectiveStudentId = isTeacher ? String(activeStudentId || '').trim() : String(userId || '').trim();
  const effectiveTeacherId = String(teacherId || '').trim();
  const roomId = effectiveTeacherId && effectiveStudentId ? `rtc:${effectiveTeacherId}:${effectiveStudentId}` : '';
  const rtcWsUrl = useMemo(() => getRtcWsUrl(), []);
  const rtcIceServers = useMemo(() => getRtcIceServers(), []);
  const selectedStudent = useMemo(
    () => (Array.isArray(students) ? students.find((student) => student.id === activeStudentId) : null),
    [students, activeStudentId]
  );

  const [status, setStatus] = useState('idle');
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [error, setError] = useState('');
  const [micEnabled, setMicEnabled] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenBusy, setScreenBusy] = useState(false);
  const [selfClientId, setSelfClientId] = useState('');
  const [remotePeers, setRemotePeers] = useState([]);
  const [presencePeers, setPresencePeers] = useState([]);
  const [connectionStats, setConnectionStats] = useState({
    quality: 'unknown',
    lossPercent: 0,
    jitterMs: 0,
    rttMs: 0,
  });

  const wsRef = useRef(null);
  const activeRoomRef = useRef('');
  const manualCloseRef = useRef(false);
  const previousRoomIdRef = useRef(roomId);
  const selfClientIdRef = useRef('');
  const peersRef = useRef(new Map());
  const peerMetaRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const localStreamRef = useRef(new MediaStream());
  const localAudioTrackRef = useRef(null);
  const localScreenTrackRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const localPreviewRef = useRef(null);
  const localScreenShellRef = useRef(null);
  const [isLocalScreenFullscreen, setIsLocalScreenFullscreen] = useState(false);
  const wsPingTimerRef = useRef(null);
  const statsTimerRef = useRef(null);
  const lastInboundAudioRef = useRef(new Map());

  const tuneAudioSender = useCallback((sender) => {
    if (!sender || typeof sender.getParameters !== 'function') return;
    try {
      const params = sender.getParameters() || {};
      const encodings = Array.isArray(params.encodings) ? params.encodings : [{}];
      encodings[0] = {
        ...(encodings[0] || {}),
        maxBitrate: AUDIO_MAX_BITRATE,
        dtx: 'disabled',
      };
      params.encodings = encodings;
      sender.setParameters(params).catch(() => {});
    } catch {}
  }, []);

  const tuneVideoSender = useCallback((sender) => {
    if (!sender || typeof sender.getParameters !== 'function') return;
    try {
      const params = sender.getParameters() || {};
      const encodings = Array.isArray(params.encodings) ? params.encodings : [{}];
      encodings[0] = {
        ...(encodings[0] || {}),
        maxBitrate: VIDEO_MAX_BITRATE,
        maxFramerate: SCREEN_MAX_FRAMERATE,
        scaleResolutionDownBy: 1,
        priority: 'high',
      };
      params.degradationPreference = 'maintain-resolution';
      params.encodings = encodings;
      sender.setParameters(params).catch(() => {});
    } catch {}
  }, []);

  const syncRemotePeers = useCallback(() => {
    const next = [];
    remoteStreamsRef.current.forEach((stream, peerId) => {
      const meta = peerMetaRef.current.get(peerId) || {};
      next.push({
        peerId,
        stream,
        title: typeof meta.name === 'string' && meta.name.trim() ? meta.name : 'Участник',
        subtitle: typeof meta.role === 'string' && meta.role.trim() ? meta.role : 'Собеседник',
      });
    });
    next.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    setRemotePeers(next);
  }, []);

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

  const syncLocalTracksToPeer = useCallback((peerState) => {
    if (!peerState?.pc) return;
    const { pc } = peerState;
    const audioTrack = localAudioTrackRef.current;
    const videoTrack = localScreenTrackRef.current;

    if (audioTrack && audioTrack.readyState === 'live') {
      if (peerState.audioSender) {
        peerState.audioSender.replaceTrack(audioTrack).catch(() => {});
        tuneAudioSender(peerState.audioSender);
      } else {
        peerState.audioSender = pc.addTrack(audioTrack, localStreamRef.current);
        tuneAudioSender(peerState.audioSender);
      }
    } else if (peerState.audioSender) {
      try { peerState.audioSender.replaceTrack(null); } catch {}
      try { pc.removeTrack(peerState.audioSender); } catch {}
      peerState.audioSender = null;
    }

    if (videoTrack && videoTrack.readyState === 'live') {
      if (peerState.videoSender) {
        peerState.videoSender.replaceTrack(videoTrack).catch(() => {});
        tuneVideoSender(peerState.videoSender);
      } else {
        peerState.videoSender = pc.addTrack(videoTrack, localStreamRef.current);
        tuneVideoSender(peerState.videoSender);
      }
    } else if (peerState.videoSender) {
      try { peerState.videoSender.replaceTrack(null); } catch {}
      try { pc.removeTrack(peerState.videoSender); } catch {}
      peerState.videoSender = null;
    }
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

    setConnectionStats({
      quality,
      lossPercent,
      jitterMs,
      rttMs,
    });
  }, []);

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
        peerState.pc.close();
      } catch {}
    });
    peersRef.current.clear();
    peerMetaRef.current.clear();
    remoteStreamsRef.current.clear();
    lastInboundAudioRef.current.clear();
    setRemotePeers([]);
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
        peerState.pc.close();
      } catch {}
    }

    peersRef.current.delete(normalizedPeerId);
    peerMetaRef.current.delete(normalizedPeerId);
    remoteStreamsRef.current.delete(normalizedPeerId);
    lastInboundAudioRef.current.delete(normalizedPeerId);
    syncRemotePeers();
  }, [syncRemotePeers]);

  const stopMicTrack = useCallback((withSync = true) => {
    const track = localAudioTrackRef.current;
    if (!track) return;
    track.onended = null;
    try { track.stop(); } catch {}
    localAudioTrackRef.current = null;
    localStreamRef.current.removeTrack(track);
    setMicEnabled(false);
    if (withSync) syncLocalTracksToAllPeers();
  }, [syncLocalTracksToAllPeers]);

  const stopScreenTrack = useCallback((withSync = true) => {
    const track = localScreenTrackRef.current;
    if (track) {
      track.onended = null;
      try { track.stop(); } catch {}
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
    setIsLocalScreenFullscreen(false);
    if (withSync) syncLocalTracksToAllPeers();
  }, [syncLocalTracksToAllPeers]);

  const ensureMicTrack = useCallback(async () => {
    const existing = localAudioTrackRef.current;
    if (existing && existing.readyState === 'live') {
      existing.enabled = true;
      setMicEnabled(true);
      syncLocalTracksToAllPeers();
      return existing;
    }

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
    const track = stream.getAudioTracks()[0];
    if (!track) {
      throw new Error('Не удалось получить аудиодорожку.');
    }
    try {
      track.contentHint = 'speech';
    } catch {}

    stream.getTracks().forEach((streamTrack) => {
      if (streamTrack !== track) {
        try { streamTrack.stop(); } catch {}
      }
    });

    track.enabled = true;
    track.onended = () => {
      if (localAudioTrackRef.current !== track) return;
      localAudioTrackRef.current = null;
      localStreamRef.current.removeTrack(track);
      setMicEnabled(false);
      syncLocalTracksToAllPeers();
    };

    localAudioTrackRef.current = track;
    if (!localStreamRef.current.getAudioTracks().includes(track)) {
      localStreamRef.current.addTrack(track);
    }
    setMicEnabled(true);
    syncLocalTracksToAllPeers();
    return track;
  }, [syncLocalTracksToAllPeers]);

  const createPeerState = useCallback((peerId, peerMeta = {}) => {
    const normalizedPeerId = typeof peerId === 'string' ? peerId.trim() : '';
    if (!normalizedPeerId || normalizedPeerId === selfClientIdRef.current) return null;

    const existing = peersRef.current.get(normalizedPeerId);
    if (existing) {
      peerMetaRef.current.set(normalizedPeerId, {
        ...(peerMetaRef.current.get(normalizedPeerId) || {}),
        ...peerMeta,
      });
      return existing;
    }

    const pc = new RTCPeerConnection({ iceServers: rtcIceServers });
    const peerState = {
      peerId: normalizedPeerId,
      pc,
      polite: Boolean(selfClientIdRef.current && selfClientIdRef.current > normalizedPeerId),
      makingOffer: false,
      ignoreOffer: false,
      audioSender: null,
      videoSender: null,
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
      if (track && !stream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
        stream.addTrack(track);
      }

      if (track) {
        track.onended = () => {
          syncRemotePeers();
        };
        track.onmute = () => {
          syncRemotePeers();
        };
        track.onunmute = () => {
          syncRemotePeers();
        };
      }

      remoteStreamsRef.current.set(normalizedPeerId, stream);
      syncRemotePeers();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'disconnected') {
        if (!peerState.disconnectTimer) {
          peerState.disconnectTimer = setTimeout(() => {
            const currentPeerState = peersRef.current.get(normalizedPeerId);
            if (!currentPeerState) return;
            if (currentPeerState.pc.connectionState !== 'disconnected') return;
            detachPeer(normalizedPeerId, { closeConnection: true });
          }, PEER_DISCONNECTED_GRACE_MS);
        }
        return;
      }

      if (peerState.disconnectTimer) {
        clearTimeout(peerState.disconnectTimer);
        peerState.disconnectTimer = null;
      }

      if (state === 'failed' || state === 'closed') {
        detachPeer(normalizedPeerId, { closeConnection: state !== 'closed' });
      }
    };

    syncLocalTracksToPeer(peerState);
    return peerState;
  }, [detachPeer, rtcIceServers, sendWs, syncLocalTracksToPeer, syncRemotePeers]);

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
      if (pc.connectionState === 'closed' || pc.connectionState === 'failed') return;
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

    const peerState = createPeerState(fromId, payload?.peer || {});
    if (!peerState) return;

    const description = signal.description;
    if (description && typeof description === 'object') {
      const offerCollision = description.type === 'offer'
        && (peerState.makingOffer || peerState.pc.signalingState !== 'stable');
      peerState.ignoreOffer = !peerState.polite && offerCollision;
      if (peerState.ignoreOffer) return;

      try {
        await peerState.pc.setRemoteDescription(description);
        if (description.type === 'offer') {
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
      try {
        await peerState.pc.addIceCandidate(candidate);
      } catch (candidateError) {
        if (!peerState.ignoreOffer) {
          console.error('[call] addIceCandidate failed:', candidateError);
        }
      }
    }
  }, [createPeerState, sendWs, syncLocalTracksToPeer]);

  const handleWsMessage = useCallback((raw) => {
    let payload = null;
    try {
      payload = JSON.parse(typeof raw === 'string' ? raw : String(raw ?? ''));
    } catch {
      return;
    }

    const type = typeof payload?.type === 'string' ? payload.type.trim() : '';
    if (!type) return;

    if (type === 'error') {
      const errorText = typeof payload?.error === 'string' ? payload.error.trim() : '';
      setError(errorText || 'Сигнальный сервер вернул ошибку.');
      return;
    }

    if (type === 'joined') {
      const normalizedRoomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';
      activeRoomRef.current = normalizedRoomId;
      const nextSelfId = typeof payload?.selfId === 'string' ? payload.selfId.trim() : '';
      selfClientIdRef.current = nextSelfId;
      setSelfClientId(nextSelfId);
      setStatus('connected');
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
        if (nextSelfId && nextSelfId < peerId) {
          makeOfferToPeer(peerId);
        }
      });
      syncRemotePeers();
      return;
    }

    if (type === 'peer-joined') {
      const peerId = typeof payload?.peer?.id === 'string' ? payload.peer.id.trim() : '';
      if (!peerId || peerId === selfClientIdRef.current) return;
      createPeerState(peerId, payload.peer);
      if (selfClientIdRef.current && selfClientIdRef.current < peerId) {
        makeOfferToPeer(peerId);
      }
      syncRemotePeers();
      return;
    }

    if (type === 'peer-left') {
      removePeer(payload?.peerId);
      return;
    }

    if (type === 'signal') {
      handleSignalPayload(payload).catch((signalError) => {
        console.error('[call] signal handling failed:', signalError);
      });
    }
  }, [createPeerState, handleSignalPayload, makeOfferToPeer, removePeer, syncRemotePeers]);

  const stopCall = useCallback(() => {
    manualCloseRef.current = true;
    stopConnectionStatsPolling();
    if (wsPingTimerRef.current) {
      clearInterval(wsPingTimerRef.current);
      wsPingTimerRef.current = null;
    }
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
    setStatus('idle');
    closeAllPeers();
    stopScreenTrack(false);
    stopMicTrack(false);
  }, [closeAllPeers, stopConnectionStatsPolling, stopMicTrack, stopScreenTrack]);

  const startCall = useCallback(async () => {
    if (!roomId) {
      setError('Сначала выбери ученика для созвона.');
      return;
    }
    if (!rtcWsUrl) {
      setError('Не удалось определить WebSocket-адрес для созвона.');
      return;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendWs({ type: 'join', roomId });
      return;
    }

    setError('');
    setStatus('connecting');
    setSocketStatus('connecting');
    manualCloseRef.current = false;

    try {
      await ensureMicTrack();
    } catch (micError) {
      setStatus('idle');
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
        sendWs({ type: 'join', roomId });
        if (wsPingTimerRef.current) {
          clearInterval(wsPingTimerRef.current);
          wsPingTimerRef.current = null;
        }
        wsPingTimerRef.current = setInterval(() => {
          sendWs({ type: 'ping' });
        }, WS_PING_INTERVAL_MS);
      };
      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        handleWsMessage(event.data);
      };
      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        setError('Ошибка сигнального канала WebSocket.');
      };
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        if (wsPingTimerRef.current) {
          clearInterval(wsPingTimerRef.current);
          wsPingTimerRef.current = null;
        }
        stopConnectionStatsPolling();
        wsRef.current = null;
        setSocketStatus('disconnected');
        setStatus('idle');
        activeRoomRef.current = '';
        selfClientIdRef.current = '';
        setSelfClientId('');
        closeAllPeers();
        stopScreenTrack(false);
        stopMicTrack(false);
        if (!manualCloseRef.current) {
          setError('Соединение для созвона разорвано.');
        }
      };
    } catch (connectError) {
      setStatus('idle');
      setSocketStatus('disconnected');
      setError(normalizeErrorMessage(connectError, 'Не удалось открыть сигнальный канал.'));
    }
  }, [closeAllPeers, ensureMicTrack, handleWsMessage, roomId, rtcWsUrl, sendWs, stopConnectionStatsPolling, stopMicTrack, stopScreenTrack]);

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
        track.enabled = !track.enabled;
        setMicEnabled(track.enabled);
        syncLocalTracksToAllPeers();
      }
    } catch (micError) {
      setError(normalizeErrorMessage(micError, 'Не удалось переключить микрофон.'));
    } finally {
      setMicBusy(false);
    }
  }, [ensureMicTrack, micBusy, renegotiatePeers, syncLocalTracksToAllPeers]);

  const toggleScreenShare = useCallback(async () => {
    if (screenBusy) return;
    if (screenSharing) {
      stopScreenTrack(true);
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
        renegotiatePeers();
      };
      if (!localStreamRef.current.getVideoTracks().includes(track)) {
        localStreamRef.current.addTrack(track);
      }
      setScreenSharing(true);
      syncLocalTracksToAllPeers();
      renegotiatePeers();
    } catch (screenError) {
      setError(normalizeErrorMessage(screenError, 'Не удалось начать демонстрацию экрана.'));
    } finally {
      setScreenBusy(false);
    }
  }, [renegotiatePeers, screenBusy, screenSharing, status, stopScreenTrack, syncLocalTracksToAllPeers]);

  const toggleLocalScreenFullscreen = useCallback(async () => {
    if (!screenSharing) return;
    if (typeof document === 'undefined') return;
    const panel = localScreenShellRef.current;
    if (!panel) return;
    if (document.fullscreenElement === panel) {
      await exitDocumentFullscreen();
      return;
    }
    if (document.fullscreenElement) {
      await exitDocumentFullscreen();
    }
    await requestElementFullscreen(panel);
  }, [screenSharing]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleFullscreenChange = () => {
      const panel = localScreenShellRef.current;
      setIsLocalScreenFullscreen(Boolean(panel && document.fullscreenElement === panel));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

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
      setPresencePeers([]);
      return undefined;
    }
    if (status === 'connected' || status === 'connecting') {
      return undefined;
    }

    let disposed = false;
    let timerId = null;

    const loadPresence = async () => {
      try {
        const response = await fetch(`/api/rtc/presence?roomId=${encodeURIComponent(roomId)}`, {
          credentials: 'include',
        });
        if (!response.ok) {
          if (!disposed) setPresencePeers([]);
          return;
        }
        const payload = await response.json();
        if (disposed) return;
        const participants = Array.isArray(payload?.participants) ? payload.participants : [];
        const nextPeers = participants
          .map((peer, index) => {
            const peerId = typeof peer?.id === 'string' ? peer.id.trim() : '';
            const name = typeof peer?.name === 'string' ? peer.name.trim() : '';
            const role = typeof peer?.role === 'string' ? peer.role.trim() : '';
            return {
              peerId: `presence:${peerId || index}`,
              stream: null,
              title: name || 'Участник',
              subtitle: `${formatRtcRoleLabel(role)} в комнате`,
            };
          })
          .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
        setPresencePeers(nextPeers);
      } catch {
        if (!disposed) setPresencePeers([]);
      }
    };

    loadPresence();
    timerId = setInterval(loadPresence, RTC_PRESENCE_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      if (timerId) clearInterval(timerId);
    };
  }, [roomId, status]);

  useEffect(() => {
    const previewNode = localPreviewRef.current;
    if (!previewNode) return;
    if (!screenSharing || !localScreenTrackRef.current) {
      previewNode.srcObject = null;
      return;
    }
    const stream = new MediaStream([localScreenTrackRef.current]);
    previewNode.srcObject = stream;
    return () => {
      if (!previewNode) return;
      previewNode.srcObject = null;
    };
  }, [screenSharing]);

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

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const visiblePeers = isConnected ? remotePeers : presencePeers;
  const participantCount = isConnected ? remotePeers.length + 1 : presencePeers.length;
  const voiceCallParticipants = isConnected
    ? [
      {
        id: 'self',
        title: 'Вы',
        subtitle: screenSharing
          ? 'Трансляция активна'
          : (micEnabled ? 'Микрофон включен' : 'Микрофон выключен'),
        isSelf: true,
        hasVideo: screenSharing,
        stream: null,
      },
      ...remotePeers.map((peer) => ({
        id: peer.peerId,
        title: peer.title,
        subtitle: peer.subtitle || 'В созвоне',
        isSelf: false,
        hasVideo: hasLiveVideoInStream(peer.stream),
        stream: peer.stream || null,
      })),
    ]
    : [];
  const statusChipClass = isConnected
    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
    : isConnecting
      ? 'border-amber-300/40 bg-amber-500/15 text-amber-200'
      : 'border-slate-600/60 bg-slate-800/70 text-slate-200';
  const statusText = isConnected ? 'В созвоне' : (isConnecting ? 'Подключение...' : 'Отключено');
  const roomHint = roomId || 'Комната не выбрана';
  const selectedStudentName = selectedStudent?.name || 'Ученик не выбран';
  const canStart = Boolean(roomId) && !isConnecting && !isConnected;
  const canStop = isConnecting || isConnected;
  const canToggleMic = isConnected && !micBusy;
  const canToggleScreen = isConnected && !screenBusy;
  const qualityClass = connectionStats.quality === 'good'
    ? 'text-emerald-300'
    : connectionStats.quality === 'ok'
      ? 'text-amber-300'
      : connectionStats.quality === 'poor'
        ? 'text-rose-300'
        : 'text-slate-300';
  const qualityText = connectionStats.quality === 'good'
    ? 'стабильно'
    : connectionStats.quality === 'ok'
      ? 'средне'
      : connectionStats.quality === 'poor'
        ? 'плохо'
        : 'нет данных';

  return (
    <div className="animate-fadeIn pb-10" data-tour="call">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-[0_30px_90px_rgba(2,6,23,0.5)] md:p-6">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-[-30px] h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="relative z-10">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white md:text-2xl">Онлайн-созвон</h2>
              <p className="mt-1 text-sm text-slate-300">Голос и демонстрация экрана в реальном времени.</p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusChipClass}`}>
              {statusText}
            </span>
          </header>

          {isTeacher && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/70 p-3 backdrop-blur">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-300" htmlFor="call-student-select">
                Ученик
              </label>
              <select
                id="call-student-select"
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-400"
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
              <p className="mt-2 text-xs text-slate-400">Текущий: {selectedStudentName}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {isConnected && remotePeers.map((peer) => (
              <RemoteAudioPlayer key={`audio:${peer.peerId}`} stream={peer.stream || null} />
            ))}

            {isConnected ? (
              <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 md:p-6">
                <div className="flex flex-wrap items-center justify-center gap-5 md:gap-8">
                  {voiceCallParticipants.map((peer) => {
                    const initial = String(peer.title || 'U').trim().charAt(0).toUpperCase() || 'U';
                    if (peer.isSelf && screenSharing) {
                      return (
                        <article
                          key={peer.id}
                          ref={localScreenShellRef}
                          onDoubleClick={toggleLocalScreenFullscreen}
                          className={`relative overflow-hidden border border-white/15 bg-slate-900 shadow-[0_10px_26px_rgba(2,6,23,0.45)] ${isLocalScreenFullscreen ? 'h-screen w-screen rounded-none border-0' : 'h-24 w-36 rounded-xl md:h-28 md:w-44'}`}
                        >
                          <button
                            type="button"
                            onClick={toggleLocalScreenFullscreen}
                            className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black/45 text-white transition hover:bg-black/65"
                            title={isLocalScreenFullscreen ? 'Выйти из полного экрана' : 'Открыть на весь экран'}
                          >
                            {isLocalScreenFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                          </button>
                          <video
                            ref={localPreviewRef}
                            autoPlay
                            muted
                            playsInline
                            className="h-full w-full bg-slate-950 object-cover"
                          />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-2 pb-2 pt-5">
                            <p className="truncate text-xs font-semibold text-white">Вы</p>
                            <p className="truncate text-[11px] text-slate-200">Трансляция активна</p>
                          </div>
                        </article>
                      );
                    }
                    if (!peer.isSelf && peer.hasVideo) {
                      return (
                        <MediaTile
                          key={peer.id}
                          stream={peer.stream}
                          title={peer.title}
                          subtitle={peer.subtitle}
                          compact
                        />
                      );
                    }
                    return (
                      <article key={peer.id} className="flex w-[104px] flex-col items-center gap-2 text-center" title={peer.subtitle}>
                        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-slate-800 text-2xl font-semibold text-slate-100 shadow-[0_10px_26px_rgba(2,6,23,0.45)]">
                          {initial}
                          {peer.isSelf && (
                            <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-900 bg-slate-700 text-slate-100">
                              {micEnabled ? <Mic size={10} /> : <MicOff size={10} />}
                            </span>
                          )}
                        </div>
                        <p className="w-full truncate text-xs font-semibold text-slate-100">{peer.title}</p>
                      </article>
                    );
                  })}
                </div>
                {voiceCallParticipants.length <= 1 && (
                  <p className="mt-3 text-center text-xs text-slate-400">Ожидание подключения собеседника</p>
                )}
              </section>
            ) : (
              <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-200">Участники созвона</h3>
                  <span className="rounded-full border border-white/15 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200">
                    {visiblePeers.length}
                  </span>
                </div>
                {visiblePeers.length === 0 ? (
                  <div className="flex min-h-16 items-center justify-center rounded-xl border border-dashed border-white/15 bg-slate-900/55 px-3 text-center text-xs text-slate-300">
                    В созвоне никого
                  </div>
                ) : (
                  <div className={`grid grid-cols-1 gap-1.5 ${visiblePeers.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : ''}`}>
                    {visiblePeers.map((peer) => (
                      <MediaTile
                        key={peer.peerId}
                        stream={peer.stream}
                        title={peer.title}
                        subtitle={peer.subtitle}
                        compact
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          <div className="mt-4 grid gap-2 text-xs text-slate-200 sm:grid-cols-2 xl:grid-cols-5">
            <p className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2">
              <span className="inline-flex items-center gap-1"><Users size={13} /> Участники:</span>{' '}
              <span className="font-semibold text-white">{participantCount}</span>
            </p>
            <p className={`rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 ${qualityClass}`}>
              <span className="inline-flex items-center gap-1"><Signal size={13} /> Качество:</span>{' '}
              <span className="font-semibold">{qualityText}</span>
            </p>
            <p className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-slate-200">
              Сигналинг: <span className="font-semibold text-white">{socketStatus}</span>
            </p>
            <p className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 truncate" title={roomHint}>
              Комната: <span className="font-semibold text-white">{roomHint}</span>
            </p>
            <p className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 truncate" title={selfClientId || 'Не назначен'}>
              Client ID: <span className="font-semibold text-white">{selfClientId || '—'}</span>
            </p>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            Потери: {connectionStats.lossPercent.toFixed(1)}% | Джиттер: {Math.round(connectionStats.jitterMs)} ms | RTT: {Math.round(connectionStats.rttMs)} ms
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-2 backdrop-blur">
            <button
              type="button"
              onClick={startCall}
              disabled={!canStart}
              className="inline-flex h-11 min-w-[140px] items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
              Подключиться
            </button>
            <button
              type="button"
              onClick={stopCall}
              disabled={!canStop}
              className="inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <PhoneOff size={16} />
              Завершить
            </button>
            <button
              type="button"
              onClick={toggleMic}
              disabled={!canToggleMic}
              className={`inline-flex h-11 min-w-[140px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                micEnabled
                  ? 'border-sky-300/40 bg-sky-400/20 text-sky-100 hover:bg-sky-400/30'
                  : 'border-white/15 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {micBusy ? <Loader2 size={16} className="animate-spin" /> : (micEnabled ? <Mic size={16} /> : <MicOff size={16} />)}
              {micEnabled ? 'Микрофон вкл' : 'Микрофон выкл'}
            </button>
            <button
              type="button"
              onClick={toggleScreenShare}
              disabled={!canToggleScreen}
              className={`inline-flex h-11 min-w-[160px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                screenSharing
                  ? 'border-violet-300/40 bg-violet-400/20 text-violet-100 hover:bg-violet-400/30'
                  : 'border-white/15 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {screenBusy ? <Loader2 size={16} className="animate-spin" /> : (screenSharing ? <MonitorX size={16} /> : <MonitorUp size={16} />)}
              {screenSharing ? 'Остановить экран' : 'Показать экран'}
            </button>
          </div>

        </div>
      </section>
    </div>
  );
};

export default CallSection;

