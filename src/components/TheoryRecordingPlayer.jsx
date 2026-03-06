import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import {
  formatRecordingDuration,
  normalizeTheoryRecording,
  THEORY_RECORDING_EVENT_BOARD,
  THEORY_RECORDING_EVENT_CODE,
  THEORY_RECORDING_EVENT_RUN_OUTPUT,
  THEORY_RECORDING_EVENT_SELECTION,
} from '../utils/theoryRecording';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';

const PLAYER_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  readOnly: true,
  fontSize: 21,
  lineNumbers: 'on',
  wordWrap: 'on',
  automaticLayout: true,
  scrollBeyondLastLine: false,
  handleMouseWheel: true,
  alwaysConsumeMouseWheel: false,
  renderLineHighlight: 'line',
  glyphMargin: false,
  mouseWheelZoom: false,
  fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  smoothScrolling: true,
  cursorSmoothCaretAnimation: 'on',
  padding: { top: 18, bottom: 26 },
};

const FALLBACK_EMPTY_STATE_TEXT = 'Видеоразбор пока не готов.';

const PLAYBACK_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const THEORY_PLAYER_BOARD_BG = '#050d1f';
const THEORY_PLAYER_BOARD_MAX_STROKES = 900;

const normalizeBoardStrokeForPlayer = (stroke) => {
  if (!stroke || typeof stroke !== 'object') return null;
  const points = (Array.isArray(stroke.points) ? stroke.points : [])
    .map((point) => {
      if (!point || typeof point !== 'object') return null;
      const x = Math.max(0, Math.min(1, Number(point.x)));
      const y = Math.max(0, Math.min(1, Number(point.y)));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    })
    .filter(Boolean);
  if (points.length < 1) return null;
  return {
    id: String(stroke.id || '').trim().slice(0, 64) || `stroke-${Math.random().toString(36).slice(2, 9)}`,
    color: String(stroke.color || '#38bdf8').trim().slice(0, 40) || '#38bdf8',
    width: Math.max(1, Math.min(64, Number(stroke.width) || 3)),
    points,
  };
};

const upsertBoardStrokeById = (list, stroke) => {
  if (!stroke?.id) return list;
  const idx = list.findIndex((item) => item?.id === stroke.id);
  if (idx === -1) {
    list.push(stroke);
    return list;
  }
  list[idx] = stroke;
  return list;
};

const clampSelectionToModel = (model, selection) => {
  if (!model || !selection || typeof selection !== 'object') return null;
  const lineCount = Math.max(1, Number(model.getLineCount?.()) || 1);
  const clampLine = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return 1;
    return Math.min(lineCount, Math.floor(num));
  };
  const clampColumn = (lineNumber, value) => {
    const maxColRaw = Number(model.getLineMaxColumn?.(lineNumber));
    const maxCol = Number.isFinite(maxColRaw) && maxColRaw > 0 ? Math.floor(maxColRaw) : 1;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return 1;
    return Math.min(maxCol, Math.floor(num));
  };
  const startLineNumber = clampLine(selection.startLineNumber);
  const endLineNumber = clampLine(selection.endLineNumber);
  const startColumn = clampColumn(startLineNumber, selection.startColumn);
  const endColumn = clampColumn(endLineNumber, selection.endColumn);
  if (endLineNumber < startLineNumber || (endLineNumber === startLineNumber && endColumn < startColumn)) {
    return {
      startLineNumber: endLineNumber,
      startColumn: endColumn,
      endLineNumber: startLineNumber,
      endColumn: startColumn,
    };
  }
  return { startLineNumber, startColumn, endLineNumber, endColumn };
};

const clampSelectionsToModel = (model, selections) => (
  (Array.isArray(selections) ? selections : [])
    .map((item) => clampSelectionToModel(model, item))
    .filter(Boolean)
);

const asEditorSelection = (selection) => {
  if (!selection || typeof selection !== 'object') return null;
  const startLineNumber = Number(selection.startLineNumber);
  const startColumn = Number(selection.startColumn);
  const endLineNumber = Number(selection.endLineNumber);
  const endColumn = Number(selection.endColumn);
  if (
    !Number.isFinite(startLineNumber)
    || !Number.isFinite(startColumn)
    || !Number.isFinite(endLineNumber)
    || !Number.isFinite(endColumn)
  ) {
    return null;
  }
  return {
    selectionStartLineNumber: startLineNumber,
    selectionStartColumn: startColumn,
    positionLineNumber: endLineNumber,
    positionColumn: endColumn,
  };
};

const mapDurationPositionMs = (valueMs, sourceDurationMs, targetDurationMs) => {
  const rawValue = Number(valueMs);
  const safeValue = Number.isFinite(rawValue) ? Math.max(0, Math.round(rawValue)) : 0;
  const rawSource = Number(sourceDurationMs);
  const rawTarget = Number(targetDurationMs);
  const safeSource = Number.isFinite(rawSource) ? Math.max(0, Math.round(rawSource)) : 0;
  const safeTarget = Number.isFinite(rawTarget) ? Math.max(0, Math.round(rawTarget)) : 0;
  if (safeTarget <= 0) return safeValue;
  if (safeSource <= 0) return Math.min(safeTarget, safeValue);
  if (Math.abs(safeSource - safeTarget) <= 160) {
    return Math.min(safeTarget, safeValue);
  }
  const ratio = safeValue / safeSource;
  return Math.max(0, Math.min(safeTarget, Math.round(ratio * safeTarget)));
};

const getRecordingMemoMeta = (recording) => {
  const normalized = normalizeTheoryRecording(recording);
  if (!normalized) {
    return {
      ready: false,
      updatedAt: '',
      createdAt: '',
      durationMs: 0,
      audioUrl: '',
      audioStorage: '',
      initialCode: '',
      eventsLength: 0,
      lastEventT: 0,
      lastEventType: '',
    };
  }
  const events = Array.isArray(normalized.events) ? normalized.events : [];
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  return {
    ready: true,
    updatedAt: String(normalized.updatedAt || ''),
    createdAt: String(normalized.createdAt || ''),
    durationMs: Number(normalized.durationMs || 0),
    audioUrl: String(normalized.audio?.url || ''),
    audioStorage: String(normalized.audio?.storageName || ''),
    initialCode: String(normalized.initialCode || ''),
    eventsLength: events.length,
    lastEventT: Number(lastEvent?.t || 0),
    lastEventType: String(lastEvent?.type || ''),
  };
};

const areTheoryPlayerPropsEqual = (prevProps, nextProps) => {
  if (String(prevProps?.className || '') !== String(nextProps?.className || '')) return false;
  if (String(prevProps?.progressStorageKey || '') !== String(nextProps?.progressStorageKey || '')) return false;
  if (String(prevProps?.theme || '') !== String(nextProps?.theme || '')) return false;
  const prevMeta = getRecordingMemoMeta(prevProps?.recording);
  const nextMeta = getRecordingMemoMeta(nextProps?.recording);
  return (
    prevMeta.ready === nextMeta.ready
    && prevMeta.updatedAt === nextMeta.updatedAt
    && prevMeta.createdAt === nextMeta.createdAt
    && prevMeta.durationMs === nextMeta.durationMs
    && prevMeta.audioUrl === nextMeta.audioUrl
    && prevMeta.audioStorage === nextMeta.audioStorage
    && prevMeta.initialCode === nextMeta.initialCode
    && prevMeta.eventsLength === nextMeta.eventsLength
    && prevMeta.lastEventT === nextMeta.lastEventT
    && prevMeta.lastEventType === nextMeta.lastEventType
  );
};

const TheoryRecordingPlayer = ({ recording, className = '', progressStorageKey = '', theme = '' }) => {
  const normalized = useMemo(() => normalizeTheoryRecording(recording), [recording]);
  const monacoTheme = resolveMonacoColorTheme(theme);
  const normalizedProgressStorageKey = useMemo(
    () => String(progressStorageKey || '').trim(),
    [progressStorageKey]
  );
  const canPersistProgress = normalizedProgressStorageKey.length > 0;
  const modelPath = useMemo(() => {
    const source = String(normalized?.updatedAt || normalized?.createdAt || 'draft');
    const safeId = source.replace(/[^0-9a-zA-Z_-]/g, '_');
    return `inmemory://theory-recording/player-${safeId}`;
  }, [normalized?.createdAt, normalized?.updatedAt]);
  const timelineDurationMs = useMemo(() => {
    const events = Array.isArray(normalized?.events) ? normalized.events : [];
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;
    const lastEventMs = Math.max(0, Math.round(Number(lastEvent?.t) || 0));
    return Math.max(0, Math.round(Number(normalized?.durationMs) || 0), lastEventMs);
  }, [normalized?.durationMs, normalized?.events]);

  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerHovered, setIsPlayerHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [runOutputFrame, setRunOutputFrame] = useState(null);
  const [boardStrokes, setBoardStrokes] = useState([]);
  const [supportsHover, setSupportsHover] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(hover: hover)').matches;
  });

  const playerContainerRef = useRef(null);
  const editorRef = useRef(null);
  const audioRef = useRef(null);
  const boardCanvasRef = useRef(null);
  const lastAppliedIndexRef = useRef(-1);
  const lastAppliedMsRef = useRef(0);
  const rafRef = useRef(null);
  const resumePositionMsRef = useRef(0);
  const lastPersistMetaRef = useRef({ ms: -1, ts: 0 });

  const mapPlaybackMsToTimelineMs = useCallback((playbackMs, sourceDurationOverride = 0) => {
    const sourceDurationMs = Math.max(0, Math.round(Number(sourceDurationOverride) || 0))
      || Math.max(0, Math.round(Number(durationMs) || 0))
      || timelineDurationMs;
    const targetDurationMs = timelineDurationMs || sourceDurationMs;
    return mapDurationPositionMs(playbackMs, sourceDurationMs, targetDurationMs);
  }, [durationMs, timelineDurationMs]);

  const mapTimelineMsToPlaybackMs = useCallback((timelineMs, targetDurationOverride = 0) => {
    const targetDurationMs = Math.max(0, Math.round(Number(targetDurationOverride) || 0))
      || Math.max(0, Math.round(Number(durationMs) || 0))
      || timelineDurationMs;
    const sourceDurationMs = timelineDurationMs || targetDurationMs;
    return mapDurationPositionMs(timelineMs, sourceDurationMs, targetDurationMs);
  }, [durationMs, timelineDurationMs]);

  const resetCursorToStart = useCallback((editor) => {
    if (!editor) return;
    try {
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.revealPosition({ lineNumber: 1, column: 1 });
    } catch {
      // Ignore cursor reset failures.
    }
  }, []);

  const stopFrameLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const readPersistedProgressMs = useCallback(() => {
    if (!canPersistProgress || typeof window === 'undefined') return 0;
    try {
      const raw = window.localStorage.getItem(normalizedProgressStorageKey);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) return 0;
      return Math.max(0, Math.round(parsed));
    } catch {
      return 0;
    }
  }, [canPersistProgress, normalizedProgressStorageKey]);

  const clearPersistedProgress = useCallback(() => {
    if (!canPersistProgress || typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(normalizedProgressStorageKey);
    } catch {
      // Ignore storage quota/privacy errors.
    }
  }, [canPersistProgress, normalizedProgressStorageKey]);

  const persistProgressMs = useCallback((valueMs, options = {}) => {
    if (!canPersistProgress || typeof window === 'undefined') return;
    const force = options?.force === true;
    const nextMs = Math.max(0, Math.round(Number(valueMs) || 0));
    const now = Date.now();
    if (!force) {
      const meta = lastPersistMetaRef.current;
      if ((now - Number(meta.ts || 0)) < 1200 && Math.abs(nextMs - Number(meta.ms || 0)) < 900) {
        return;
      }
    }
    lastPersistMetaRef.current = { ms: nextMs, ts: now };
    try {
      window.localStorage.setItem(normalizedProgressStorageKey, String(nextMs));
    } catch {
      // Ignore storage quota/privacy errors.
    }
  }, [canPersistProgress, normalizedProgressStorageKey]);

  const applyEvent = useCallback((event) => {
    const editor = editorRef.current;
    if (!editor || !event) return;
    if (event.type === THEORY_RECORDING_EVENT_CODE) {
      const model = editor.getModel();
      if (model && model.getValue() !== event.code) {
        try {
          model.setValue(typeof event.code === 'string' ? event.code : String(event.code ?? ''));
        } catch {
          // Ignore malformed code frame.
        }
      }
      return;
    }
    if (event.type === THEORY_RECORDING_EVENT_SELECTION) {
      if (Array.isArray(event.selections) && event.selections.length > 0) {
        const model = editor.getModel();
        const safeSelections = clampSelectionsToModel(model, event.selections)
          .map((selection) => asEditorSelection(selection))
          .filter(Boolean);
        if (safeSelections.length > 0) {
          try {
            editor.setSelections(safeSelections);
          } catch {
            // Ignore bad timeline selection frames to keep playback alive.
          }
        }
      }
      return;
    }
    if (event.type === THEORY_RECORDING_EVENT_BOARD) {
      const action = String(event.action || '').trim();
      if (action === 'clear') {
        setBoardStrokes([]);
        return;
      }
      if (action === 'snapshot') {
        const nextStrokes = (Array.isArray(event.strokes) ? event.strokes : [])
          .map((stroke) => normalizeBoardStrokeForPlayer(stroke))
          .filter(Boolean)
          .slice(-THEORY_PLAYER_BOARD_MAX_STROKES);
        setBoardStrokes(nextStrokes);
        return;
      }
      if (action === 'stroke') {
        const stroke = normalizeBoardStrokeForPlayer(event.stroke);
        if (!stroke) return;
        setBoardStrokes((prev) => {
          const next = [...(Array.isArray(prev) ? prev : [])];
          upsertBoardStrokeById(next, stroke);
          if (next.length > THEORY_PLAYER_BOARD_MAX_STROKES) {
            next.splice(0, next.length - THEORY_PLAYER_BOARD_MAX_STROKES);
          }
          return next;
        });
      }
      return;
    }
    if (event.type === THEORY_RECORDING_EVENT_RUN_OUTPUT) {
      setRunOutputFrame({
        input: String(event.input ?? ''),
        output: String(event.output ?? ''),
        error: String(event.error ?? ''),
      });
    }
  }, []);

  const rebuildTo = useCallback((targetMs) => {
    const editor = editorRef.current;
    if (!normalized || !editor) return;
    const model = editor.getModel();
    if (model && model.getValue() !== normalized.initialCode) {
      try {
        model.setValue(normalized.initialCode);
      } catch {
        // Ignore malformed initial code frame.
      }
    }
    lastAppliedIndexRef.current = -1;
    setRunOutputFrame(null);
    setBoardStrokes([]);
    const events = normalized.events || [];
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.t > targetMs) break;
      applyEvent(event);
      lastAppliedIndexRef.current = index;
    }
    lastAppliedMsRef.current = targetMs;
    setCurrentMs(targetMs);
  }, [applyEvent, normalized]);

  const syncTo = useCallback((targetMsRaw) => {
    if (!normalized) return;
    const targetMs = Math.max(0, Math.round(targetMsRaw));
    if (targetMs < lastAppliedMsRef.current) {
      rebuildTo(targetMs);
      return;
    }
    const events = normalized.events || [];
    let nextIndex = lastAppliedIndexRef.current + 1;
    while (nextIndex < events.length && events[nextIndex].t <= targetMs) {
      applyEvent(events[nextIndex]);
      lastAppliedIndexRef.current = nextIndex;
      nextIndex += 1;
    }
    lastAppliedMsRef.current = targetMs;
    setCurrentMs(targetMs);
  }, [applyEvent, normalized, rebuildTo]);

  const runFrameLoop = useCallback(function frameLoop() {
    const audio = audioRef.current;
    if (!audio || audio.paused || audio.ended) {
      stopFrameLoop();
      return;
    }
    const nextPlaybackMs = (Number(audio.currentTime) || 0) * 1000;
    syncTo(mapPlaybackMsToTimelineMs(nextPlaybackMs));
    rafRef.current = requestAnimationFrame(frameLoop);
  }, [mapPlaybackMsToTimelineMs, stopFrameLoop, syncTo]);

  const recordingResetKey = useMemo(() => (
    [
      String(normalized?.updatedAt || ''),
      String(normalized?.createdAt || ''),
      String(normalized?.audio?.url || ''),
      String(normalized?.durationMs || 0),
      String(Number(normalized?.events?.length || 0)),
      String(normalized?.initialCode || ''),
    ].join('|')
  ), [
    normalized?.updatedAt,
    normalized?.createdAt,
    normalized?.audio?.url,
    normalized?.durationMs,
    normalized?.events?.length,
    normalized?.initialCode,
  ]);
  const hasNormalizedRecording = Boolean(normalized);
  const normalizedInitialCode = String(normalized?.initialCode || '');

  useEffect(() => () => stopFrameLoop(), [stopFrameLoop]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const hoverMedia = window.matchMedia('(hover: hover)');
    const updateHoverSupport = () => setSupportsHover(hoverMedia.matches);
    updateHoverSupport();
    if (typeof hoverMedia.addEventListener === 'function') {
      hoverMedia.addEventListener('change', updateHoverSupport);
      return () => hoverMedia.removeEventListener('change', updateHoverSupport);
    }
    hoverMedia.addListener(updateHoverSupport);
    return () => hoverMedia.removeListener(updateHoverSupport);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const getCurrentFullscreenElement = () => (
      document.fullscreenElement
      || document.webkitFullscreenElement
      || null
    );
    const handleFullscreenChange = () => {
      setIsFullscreen(getCurrentFullscreenElement() === playerContainerRef.current);
    };
    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!hasNormalizedRecording) {
      resumePositionMsRef.current = 0;
      setCurrentMs(0);
      setDurationMs(0);
      setIsPlaying(false);
      setPlaybackRate(1);
      setHasPlaybackStarted(false);
      return;
    }
    const storedMs = readPersistedProgressMs();
    const maxResumableMs = Math.max(0, timelineDurationMs - 1200);
    const resumeMs = Math.max(0, Math.min(storedMs, maxResumableMs));
    const resumeTimelineMs = mapDurationPositionMs(resumeMs, timelineDurationMs, timelineDurationMs);
    resumePositionMsRef.current = resumeMs;
    setCurrentMs(resumeTimelineMs);
    setDurationMs(timelineDurationMs);
    setIsPlaying(false);
    setPlaybackRate(1);
    setHasPlaybackStarted(false);
    setIsFullscreen(false);
    setRunOutputFrame(null);
    setBoardStrokes([]);
    lastAppliedIndexRef.current = -1;
    lastAppliedMsRef.current = 0;
    lastPersistMetaRef.current = { ms: -1, ts: 0 };
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      try {
        audio.currentTime = resumeMs > 0 ? (resumeMs / 1000) : 0;
      } catch {
        audio.currentTime = 0;
      }
    }
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        try {
          model.setValue(normalizedInitialCode);
        } catch {
          // no-op
        }
      }
      if (resumeMs > 0) {
        rebuildTo(resumeTimelineMs);
      } else {
        resetCursorToStart(editorRef.current);
      }
    }
  }, [
    hasNormalizedRecording,
    normalizedInitialCode,
    readPersistedProgressMs,
    recordingResetKey,
    rebuildTo,
    resetCursorToStart,
    timelineDurationMs,
  ]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (!audio) return;
    const mediaDurationMs = Number.isFinite(Number(audio.duration)) ? Math.round(Number(audio.duration) * 1000) : 0;
    const currentTimeMs = Math.max(0, Math.round((Number(audio.currentTime) || 0) * 1000));
    const nearEndThresholdMs = Math.max(0, mediaDurationMs - 1200);
    if (audio.ended || (mediaDurationMs > 0 && currentTimeMs >= nearEndThresholdMs)) {
      clearPersistedProgress();
      return;
    }
    persistProgressMs(currentTimeMs, { force: true });
  }, [clearPersistedProgress, persistProgressMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
    audio.playbackRate = playbackRate;
  }, [isMuted, playbackRate, volume]);

  const handleEditorBeforeMount = useCallback((monaco) => {
    ensureMonacoColorTheme(monaco);
  }, []);

  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;
    if (!normalized) return;
    const model = editor.getModel();
    if (model) {
      try {
        model.setValue(normalized.initialCode || '');
      } catch {
        // no-op
      }
    }
    resetCursorToStart(editor);
  }, [normalized, resetCursorToStart]);

  const drawBoardStroke = useCallback((ctx, stroke, width, height) => {
    if (!ctx || !stroke || !Array.isArray(stroke.points) || stroke.points.length < 1) return;
    const points = stroke.points
      .map((point) => ({
        x: Math.max(0, Math.min(width, Number(point.x || 0) * width)),
        y: Math.max(0, Math.min(height, Number(point.y || 0) * height)),
      }));
    if (points.length < 1) return;
    const lineWidth = Math.max(1, Number(stroke.width) || 3);
    const color = String(stroke.color || '#38bdf8');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, Math.max(1, lineWidth * 0.5), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (points.length === 2) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    const penultimate = points[points.length - 2];
    const last = points[points.length - 1];
    ctx.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
    ctx.stroke();
  }, []);

  useEffect(() => {
    const canvas = boardCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = Math.max(1, canvas.width || 1);
    const height = Math.max(1, canvas.height || 1);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = THEORY_PLAYER_BOARD_BG;
    ctx.fillRect(0, 0, width, height);
    boardStrokes.forEach((stroke) => drawBoardStroke(ctx, stroke, width, height));
  }, [boardStrokes, drawBoardStroke]);

  const safeTimelineDurationMs = Math.max(
    1,
    Math.round(timelineDurationMs || 0),
    Math.round(currentMs || 0),
  );
  const safePlaybackDurationMs = Math.max(
    1,
    Math.round(durationMs || 0) || safeTimelineDurationMs,
  );
  const clampedCurrentTimelineMs = Math.min(
    Math.max(0, Math.round(currentMs || 0)),
    safeTimelineDurationMs
  );
  const clampedCurrentPlaybackMs = Math.min(
    Math.max(0, mapTimelineMsToPlaybackMs(clampedCurrentTimelineMs, safePlaybackDurationMs)),
    safePlaybackDurationMs
  );
  const isAtStart = clampedCurrentPlaybackMs <= 120;
  const isPrePlaybackState = !isPlaying && isAtStart;
  const playbackProgressPercent = Math.max(
    0,
    Math.min(100, (clampedCurrentPlaybackMs / safePlaybackDurationMs) * 100)
  );
  const normalizedVolume = isMuted ? 0 : volume;
  const volumeProgressPercent = Math.max(0, Math.min(100, normalizedVolume * 100));
  const seekTrackStyle = useMemo(() => ({
    background: `linear-gradient(90deg, rgba(37,99,235,0.96) 0%, rgba(34,211,238,0.92) ${playbackProgressPercent}%, rgba(71,85,105,0.55) ${playbackProgressPercent}%, rgba(71,85,105,0.55) 100%)`,
  }), [playbackProgressPercent]);
  const volumeTrackStyle = useMemo(() => ({
    background: `linear-gradient(90deg, rgba(226,232,240,0.94) 0%, rgba(226,232,240,0.94) ${volumeProgressPercent}%, rgba(148,163,184,0.3) ${volumeProgressPercent}%, rgba(148,163,184,0.3) 100%)`,
  }), [volumeProgressPercent]);
  const centerButtonVisibilityClass = !hasPlaybackStarted
    ? 'opacity-100 scale-100 pointer-events-auto'
    : (
      isPlaying
        ? (
          supportsHover
            ? (isPlayerHovered ? 'opacity-95 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none')
            : 'opacity-0 scale-90 pointer-events-none'
        )
        : (
          supportsHover
            ? (isPlayerHovered ? 'opacity-90 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none')
            : 'opacity-0 scale-90 pointer-events-none'
        )
    );
  const timelineControlsVisibilityClass = isPlaying && supportsHover
    ? (isPlayerHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none')
    : 'opacity-100 translate-y-0';
  const topLabelVisibilityClass = supportsHover && isPlayerHovered
    ? 'opacity-100 translate-y-0'
    : 'opacity-0 -translate-y-1';
  const centerPlaybackToneClass = isPlaying
    ? 'bg-slate-900/78 text-white shadow-[0_14px_32px_rgba(2,6,23,0.62)]'
    : 'bg-gradient-to-br from-sky-500/40 via-indigo-500/34 to-violet-500/28 text-white shadow-[0_14px_30px_rgba(37,99,235,0.32)]';
  const transportPlaybackToneClass = isPlaying
    ? 'bg-gradient-to-br from-violet-500/44 via-indigo-500/38 to-sky-500/34 text-white shadow-[0_10px_22px_rgba(79,70,229,0.48),inset_0_1px_0_rgba(255,255,255,0.24)] hover:from-violet-400/52 hover:via-indigo-400/46 hover:to-sky-400/42'
    : 'bg-gradient-to-br from-sky-500/30 via-blue-500/28 to-indigo-500/26 text-sky-100 shadow-[0_8px_18px_rgba(14,116,144,0.34),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-sky-400/40 hover:via-blue-400/36 hover:to-indigo-400/34';
  const fullscreenButtonToneClass = isFullscreen
    ? 'bg-gradient-to-br from-fuchsia-500/86 via-violet-500/84 to-indigo-500/84 text-white shadow-[0_0_0_1px_rgba(196,181,253,0.42),0_12px_24px_rgba(124,58,237,0.52)] hover:from-fuchsia-400/92 hover:via-violet-400/90 hover:to-indigo-400/90'
    : 'bg-gradient-to-br from-sky-500/28 via-indigo-500/34 to-violet-500/30 text-sky-100 shadow-[0_10px_20px_rgba(79,70,229,0.3),inset_0_1px_0_rgba(255,255,255,0.18)] hover:from-sky-400/42 hover:via-indigo-400/46 hover:to-violet-400/42';
  const fullscreenIndicatorClass = isFullscreen ? 'opacity-100 scale-100' : 'opacity-0 scale-75';
  const hasRunOutputFrame = Boolean(
    runOutputFrame
    && (runOutputFrame.input || runOutputFrame.output || runOutputFrame.error)
  );
  const runOutputShellClass = isFullscreen
    ? 'absolute inset-x-5 bottom-28 z-20 md:left-6 md:right-auto md:w-[min(1040px,calc(100%-3rem))]'
    : 'absolute inset-x-3 bottom-24 z-20 md:left-4 md:right-auto md:w-[min(680px,calc(100%-2rem))]';
  const runOutputCardClass = isFullscreen
    ? 'rounded-2xl border border-slate-700/70 bg-slate-950/94 px-4 py-3 shadow-[0_14px_34px_rgba(2,6,23,0.6)] backdrop-blur-md'
    : 'rounded-xl border border-slate-700/70 bg-slate-950/94 px-3 py-2 shadow-[0_12px_30px_rgba(2,6,23,0.55)] backdrop-blur-md';
  const runOutputLabelClass = isFullscreen
    ? 'text-[12px] font-semibold uppercase tracking-wide text-slate-300'
    : 'text-[10px] font-semibold uppercase tracking-wide text-slate-400';
  const runOutputInputTextClass = isFullscreen
    ? 'mt-1 max-h-[140px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/80 px-3 py-2 font-mono text-[15px] leading-7 text-slate-100'
    : 'mt-1 max-h-[78px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/80 px-2 py-1 font-mono text-[11px] leading-5 text-slate-200';
  const runOutputMainTextClass = isFullscreen
    ? 'mt-1 max-h-[260px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/75 px-3 py-2 font-mono text-[16px] leading-7 text-slate-100'
    : 'mt-1 max-h-[126px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/75 px-2 py-1 font-mono text-[11px] leading-5 text-slate-100';
  const runOutputErrorLabelClass = isFullscreen
    ? 'text-[12px] font-semibold uppercase tracking-wide text-rose-200'
    : 'text-[10px] font-semibold uppercase tracking-wide text-rose-300';
  const runOutputErrorTextClass = isFullscreen
    ? 'mt-1 max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-rose-950/30 px-3 py-2 font-mono text-[16px] leading-7 text-rose-200'
    : 'mt-1 max-h-[108px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-rose-950/30 px-2 py-1 font-mono text-[11px] leading-5 text-rose-200';
  const hasBoardTimeline = useMemo(
    () => Array.isArray(normalized?.events) && normalized.events.some((event) => event?.type === THEORY_RECORDING_EVENT_BOARD),
    [normalized?.events]
  );
  const shouldShowBoard = hasBoardTimeline || boardStrokes.length > 0;
  const boardShellClass = isFullscreen
    ? (hasRunOutputFrame
        ? 'absolute right-5 top-14 z-20 w-[min(44vw,640px)]'
        : 'absolute right-5 bottom-28 z-20 w-[min(44vw,640px)]')
    : (hasRunOutputFrame
        ? 'absolute right-3 top-12 z-20 w-[min(44vw,320px)]'
        : 'absolute right-3 bottom-24 z-20 w-[min(44vw,320px)]');
  const boardCardClass = isFullscreen
    ? 'rounded-2xl border border-slate-700/70 bg-slate-950/92 p-3 shadow-[0_14px_30px_rgba(2,6,23,0.58)] backdrop-blur-md'
    : 'rounded-xl border border-slate-700/70 bg-slate-950/92 p-2 shadow-[0_10px_26px_rgba(2,6,23,0.5)] backdrop-blur-md';
  const boardLabelClass = isFullscreen
    ? 'text-[12px] font-semibold uppercase tracking-wide text-slate-300'
    : 'text-[10px] font-semibold uppercase tracking-wide text-slate-400';
  const boardCanvasHeightClass = isFullscreen ? 'h-[220px]' : 'h-[132px]';
  const editorViewportClass = isFullscreen
    ? [
        'pointer-events-auto h-full px-5 pt-5',
        hasRunOutputFrame ? 'pb-[22rem]' : 'pb-28',
        shouldShowBoard ? 'md:pr-[calc(min(44vw,640px)+2.25rem)]' : '',
      ].filter(Boolean).join(' ')
    : 'pointer-events-auto h-full min-h-0 min-w-0 overflow-hidden rounded-xl border border-slate-800/80 bg-[#020817]';
  const standardLayoutClass = !isFullscreen
    ? [
        'relative z-0 grid h-[min(580px,calc(100vh-14rem))] min-h-0 gap-3 overflow-hidden p-3 pb-24',
        hasRunOutputFrame ? 'grid-rows-[minmax(0,1fr)_auto]' : 'grid-rows-[minmax(0,1fr)]',
        shouldShowBoard ? 'md:grid-cols-[minmax(0,1fr)_320px] md:items-stretch' : '',
      ].filter(Boolean).join(' ')
    : '';
  const standardRunOutputWrapperClass = !isFullscreen && shouldShowBoard ? 'min-h-0 md:col-span-2' : 'min-h-0';
  const playbackActionLabel = isPlaying ? 'Пауза' : 'Воспроизвести';
  const soundActionLabel = isMuted ? 'Включить звук' : 'Выключить звук';

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused || audio.ended) {
        await audio.play();
        return;
      }
      audio.pause();
    } catch {
      // Ignore autoplay and playback policy errors.
    }
  }, []);

  const handleSeek = useCallback((event) => {
    const nextPlaybackMs = Math.max(0, Math.round(Number(event.target?.value) || 0));
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = nextPlaybackMs / 1000;
    }
    syncTo(mapPlaybackMsToTimelineMs(nextPlaybackMs, safePlaybackDurationMs));
  }, [mapPlaybackMsToTimelineMs, safePlaybackDurationMs, syncTo]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleVolumeChange = useCallback((event) => {
    const nextVolume = Math.max(0, Math.min(1, Number(event.target?.value) || 0));
    setVolume(nextVolume);
    setIsMuted(nextVolume <= 0);
  }, []);

  const handlePlaybackRateChange = useCallback((event) => {
    const nextRate = Number(event.target?.value);
    if (!Number.isFinite(nextRate)) return;
    setPlaybackRate(nextRate);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const playerElement = playerContainerRef.current;
    if (!playerElement) return;
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
    try {
      if (fullscreenElement === playerElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
        return;
      }
      if (typeof playerElement.requestFullscreen === 'function') {
        await playerElement.requestFullscreen();
      } else if (typeof playerElement.webkitRequestFullscreen === 'function') {
        playerElement.webkitRequestFullscreen();
      }
    } catch {
      // Ignore fullscreen API rejections and unsupported environments.
    }
  }, []);

  const fullscreenActionLabel = isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть полноэкранный режим';
  const editorHeight = '100%';
  const playerEditorOptions = useMemo(() => ({
    ...PLAYER_EDITOR_OPTIONS,
    fontSize: isFullscreen ? 30 : PLAYER_EDITOR_OPTIONS.fontSize,
    padding: isFullscreen
      ? {
          top: 24,
          bottom: hasRunOutputFrame ? 40 : PLAYER_EDITOR_OPTIONS.padding.bottom,
        }
      : PLAYER_EDITOR_OPTIONS.padding,
  }), [hasRunOutputFrame, isFullscreen]);

  if (!normalized || !normalized.audio?.url || normalized.events.length === 0) {
    return (
      <div
        className={`mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-white via-violet-50/65 to-fuchsia-50/45 px-4 py-4 text-xs text-slate-600 shadow-[0_10px_24px_rgba(124,58,237,0.09)] ${className}`}
      >
        {FALLBACK_EMPTY_STATE_TEXT}
      </div>
    );
  }

  return (
    <div className={`mt-3 ${className}`}>
      <div
        ref={playerContainerRef}
        className={`group relative overflow-hidden bg-gradient-to-br from-[#06122d] via-[#050d1f] to-[#030816] p-[2px] shadow-[0_22px_46px_rgba(15,23,42,0.42)] ${isFullscreen ? 'h-full w-full rounded-none' : 'rounded-[1.4rem]'}`}
        onMouseEnter={() => setIsPlayerHovered(true)}
        onMouseLeave={() => setIsPlayerHovered(false)}
      >
        <div className="pointer-events-none absolute -left-14 -top-16 h-44 w-44 rounded-full bg-sky-400/14 blur-3xl" />

        <div className={`relative overflow-hidden bg-[#030817] ${isFullscreen ? 'h-full rounded-none' : 'rounded-[1.1rem]'}`}>
          <audio
            ref={audioRef}
            className="sr-only"
            preload="metadata"
            src={normalized.audio.url}
            onPlay={() => {
              setIsPlaying(true);
              setHasPlaybackStarted(true);
              stopFrameLoop();
              rafRef.current = requestAnimationFrame(runFrameLoop);
            }}
            onPause={(event) => {
              setIsPlaying(false);
              stopFrameLoop();
              const mediaDurationMs = Number.isFinite(Number(event.currentTarget?.duration))
                ? Math.round(Number(event.currentTarget.duration) * 1000)
                : 0;
              const currentTimeMs = Math.max(0, Math.round((Number(event.currentTarget?.currentTime) || 0) * 1000));
              const nearEndThresholdMs = Math.max(0, mediaDurationMs - 1200);
              if (event.currentTarget?.ended || (mediaDurationMs > 0 && currentTimeMs >= nearEndThresholdMs)) {
                clearPersistedProgress();
                return;
              }
              persistProgressMs(currentTimeMs, { force: true });
            }}
            onEnded={() => {
              setIsPlaying(false);
              stopFrameLoop();
              syncTo(safeTimelineDurationMs);
              clearPersistedProgress();
            }}
            onTimeUpdate={(event) => {
              const nextPlaybackMs = (Number(event.currentTarget?.currentTime) || 0) * 1000;
              syncTo(mapPlaybackMsToTimelineMs(nextPlaybackMs, safePlaybackDurationMs));
              persistProgressMs(nextPlaybackMs);
            }}
            onSeeked={(event) => {
              const nextPlaybackMs = (Number(event.currentTarget?.currentTime) || 0) * 1000;
              syncTo(mapPlaybackMsToTimelineMs(nextPlaybackMs, safePlaybackDurationMs));
              persistProgressMs(nextPlaybackMs, { force: true });
            }}
            onLoadedMetadata={(event) => {
              const duration = Number(event.currentTarget?.duration);
              if (Number.isFinite(duration) && duration > 0) {
                const durationFromAudio = Math.round(duration * 1000);
                setDurationMs(durationFromAudio);
                const maxResumableMs = Math.max(0, durationFromAudio - 1200);
                const targetMs = Math.max(0, Math.min(Math.round(resumePositionMsRef.current || 0), maxResumableMs));
                if (targetMs > 0) {
                  try {
                    event.currentTarget.currentTime = targetMs / 1000;
                  } catch {
                    // Ignore seek failures while metadata is being resolved.
                  }
                  const targetTimelineMs = mapPlaybackMsToTimelineMs(targetMs, durationFromAudio);
                  syncTo(targetTimelineMs);
                  setCurrentMs(targetTimelineMs);
                }
              }
            }}
          />

          {isFullscreen ? (
            <div className={editorViewportClass}>
              <Editor
                height={editorHeight}
                language="python"
                theme={monacoTheme}
                defaultValue={normalized.initialCode || ''}
                path={modelPath}
                saveViewState={false}
                beforeMount={handleEditorBeforeMount}
                onMount={handleEditorMount}
                options={playerEditorOptions}
              />
            </div>
          ) : (
            <div className={standardLayoutClass}>
              <div className={editorViewportClass}>
                <Editor
                  height={editorHeight}
                  language="python"
                  theme={monacoTheme}
                  defaultValue={normalized.initialCode || ''}
                  path={modelPath}
                  saveViewState={false}
                  beforeMount={handleEditorBeforeMount}
                  onMount={handleEditorMount}
                  options={playerEditorOptions}
                />
              </div>

              {shouldShowBoard && (
                <div className="pointer-events-none min-w-0">
                  <div className={boardCardClass}>
                    <div className={boardLabelClass}>Доска</div>
                    <div className="mt-1 overflow-hidden rounded-lg border border-slate-700/80 bg-[#050d1f]">
                      <canvas
                        ref={boardCanvasRef}
                        width={960}
                        height={320}
                        className={`w-full ${boardCanvasHeightClass}`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {hasRunOutputFrame && (
                <div className={standardRunOutputWrapperClass}>
                  <div className={runOutputCardClass}>
                    {runOutputFrame?.input && (
                      <div className="mb-2">
                        <div className={runOutputLabelClass}>stdin</div>
                        <pre className={runOutputInputTextClass}>{runOutputFrame.input}</pre>
                      </div>
                    )}
                    <div>
                      <div className={runOutputLabelClass}>Вывод</div>
                      <pre className={runOutputMainTextClass}>{runOutputFrame?.output || 'Пусто'}</pre>
                    </div>
                    {runOutputFrame?.error && (
                      <div className="mt-2 border-t border-slate-800 pt-2">
                        <div className={runOutputErrorLabelClass}>stderr</div>
                        <pre className={runOutputErrorTextClass}>{runOutputFrame.error}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${(!hasPlaybackStarted && isPrePlaybackState) ? 'opacity-100' : 'opacity-0'}`}>
            <div
              className={`absolute inset-0 transition-colors duration-300 ${
                isPrePlaybackState ? 'bg-slate-950/78' : 'bg-slate-950/48'
              }`}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(56,189,248,0.09),transparent_52%)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/8 via-transparent to-slate-950/82" />
          </div>

          <div className={`pointer-events-none absolute right-4 top-3 z-20 inline-flex items-center gap-2 rounded-full bg-slate-900/56 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200/90 backdrop-blur-md transition-all duration-200 ${topLabelVisibilityClass}`}>
            <span>Видеоразбор</span>
            <span className="h-1 w-1 rounded-full bg-violet-300/80" />
            <span>{formatRecordingDuration(safePlaybackDurationMs)}</span>
          </div>

          {isFullscreen && hasRunOutputFrame && (
            <div className={runOutputShellClass}>
              <div className={runOutputCardClass}>
                {runOutputFrame?.input && (
                  <div className="mb-2">
                    <div className={runOutputLabelClass}>stdin</div>
                    <pre className={runOutputInputTextClass}>{runOutputFrame.input}</pre>
                  </div>
                )}
                <div>
                  <div className={runOutputLabelClass}>Вывод</div>
                  <pre className={runOutputMainTextClass}>{runOutputFrame?.output || 'Пусто'}</pre>
                </div>
                {runOutputFrame?.error && (
                  <div className="mt-2 border-t border-slate-800 pt-2">
                    <div className={runOutputErrorLabelClass}>stderr</div>
                    <pre className={runOutputErrorTextClass}>{runOutputFrame.error}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {isFullscreen && shouldShowBoard && (
            <div className={`${boardShellClass} pointer-events-none`}>
              <div className={boardCardClass}>
                <div className={boardLabelClass}>Доска</div>
                <div className="mt-1 overflow-hidden rounded-lg border border-slate-700/80 bg-[#050d1f]">
                  <canvas
                    ref={boardCanvasRef}
                    width={960}
                    height={320}
                    className={`w-full ${boardCanvasHeightClass}`}
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={togglePlayback}
            className={`absolute left-1/2 top-1/2 z-20 flex h-16 w-16 items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 ${isPlaying ? 'hover:bg-slate-800/90 hover:opacity-100' : 'hover:opacity-95'} ${centerPlaybackToneClass} ${centerButtonVisibilityClass}`}
            style={{ transform: 'translate(-50%, -50%)' }}
            aria-label={playbackActionLabel}
          >
            <span className="relative block h-6 w-6 drop-shadow-[0_2px_8px_rgba(15,23,42,0.42)]">
              <Play
                size={24}
                className={`absolute inset-0 m-auto transition-all duration-200 ${isPlaying ? 'scale-75 opacity-0' : 'scale-100 opacity-100'}`}
              />
              <Pause
                size={24}
                className={`absolute inset-0 m-auto transition-all duration-200 ${isPlaying ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
              />
            </span>
          </button>

          <div className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#020617]/95 via-[#020617]/72 to-transparent px-3 pb-3 pt-14 transition-all duration-300 md:px-4 ${timelineControlsVisibilityClass}`}>
            <div className="pointer-events-none absolute inset-x-10 bottom-[66px] h-8 bg-gradient-to-r from-transparent via-violet-500/14 to-transparent blur-2xl" />
            <div className="pointer-events-none absolute inset-x-16 bottom-[64px] h-5 bg-gradient-to-r from-transparent via-sky-400/16 to-transparent blur-xl" />
            <div className="rounded-2xl bg-slate-900/58 p-2.5 shadow-[0_10px_28px_rgba(2,6,23,0.46)] backdrop-blur-xl md:p-3">
              <div className="flex items-center gap-2.5 md:gap-3">
                <button
                  type="button"
                  onClick={togglePlayback}
                  className={`group relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all duration-200 ${transportPlaybackToneClass}`}
                  aria-label={playbackActionLabel}
                >
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  {isPlaying ? (
                    <Pause size={16} className="relative z-10 drop-shadow-[0_1px_4px_rgba(15,23,42,0.45)]" />
                  ) : (
                    <Play size={16} className="relative z-10 translate-x-[1px] drop-shadow-[0_1px_4px_rgba(15,23,42,0.45)]" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <input
                    type="range"
                    min={0}
                    max={safePlaybackDurationMs}
                    step={100}
                    value={clampedCurrentPlaybackMs}
                    onChange={handleSeek}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-sky-400"
                    style={seekTrackStyle}
                    aria-label="Перемотка"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold tracking-wide text-slate-300/90">
                    <span>{formatRecordingDuration(clampedCurrentPlaybackMs)}</span>
                    <span>{formatRecordingDuration(safePlaybackDurationMs)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-slate-100 transition hover:bg-white/16"
                  aria-label={soundActionLabel}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={normalizedVolume}
                  onChange={handleVolumeChange}
                  className="hidden h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-transparent accent-white sm:block"
                  style={volumeTrackStyle}
                  aria-label="Громкость"
                />
                <select
                  value={playbackRate}
                  onChange={handlePlaybackRateChange}
                  className="h-9 w-[70px] shrink-0 cursor-pointer rounded-lg border border-white/18 bg-white/10 px-2 text-[11px] font-semibold text-slate-100 outline-none transition hover:bg-white/16"
                  aria-label="Playback speed"
                >
                  {PLAYBACK_RATE_OPTIONS.map((rateOption) => (
                    <option key={`playback-rate-${rateOption}`} value={rateOption} className="bg-slate-900 text-slate-100">
                      {`${rateOption}x`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className={`group relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-xl transition-all duration-200 hover:scale-[1.04] ${fullscreenButtonToneClass}`}
                  aria-label={fullscreenActionLabel}
                >
                  <span className="pointer-events-none absolute -inset-1 rounded-[0.95rem] bg-gradient-to-br from-violet-400/24 via-fuchsia-400/20 to-sky-400/22 opacity-80 blur-sm transition-opacity duration-200 group-hover:opacity-100" />
                  <span className={`pointer-events-none absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] transition-all duration-200 ${fullscreenIndicatorClass}`} />
                  {isFullscreen ? (
                    <Minimize2 size={16} className="relative z-10 drop-shadow-[0_1px_4px_rgba(15,23,42,0.45)]" />
                  ) : (
                    <Maximize2 size={16} className="relative z-10 drop-shadow-[0_1px_4px_rgba(15,23,42,0.45)]" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(TheoryRecordingPlayer, areTheoryPlayerPropsEqual);
