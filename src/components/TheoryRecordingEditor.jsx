import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from './ui';
import TheoryRecordingPlayer from './TheoryRecordingPlayer';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import {
  formatRecordingDuration,
  normalizeTheoryRecording,
  THEORY_RECORDING_EVENT_BOARD,
  THEORY_RECORDING_EVENT_CODE,
  THEORY_RECORDING_EVENT_RUN_OUTPUT,
  THEORY_RECORDING_EVENT_SELECTION,
  THEORY_RECORDING_MAX_EVENTS,
  THEORY_RECORDING_VERSION,
} from '../utils/theoryRecording';

const RECORDING_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  tabSize: 4,
  insertSpaces: true,
  wordWrap: 'on',
  automaticLayout: true,
  scrollBeyondLastLine: false,
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  autoIndent: 'advanced',
  formatOnType: true,
  formatOnPaste: true,
};

const CODE_SNAPSHOT_DEBOUNCE_MS = 120;
const SELECTION_SNAPSHOT_DEBOUNCE_MS = 90;
const BOARD_SNAPSHOT_BG = '#050d1f';
const BOARD_CANVAS_MIN_DISTANCE = 0.0015;
const BOARD_MAX_STROKES = 900;
const BOARD_MAX_POINTS_IN_STROKE = 2400;
const BOARD_DEFAULT_COLOR = '#38bdf8';
const BOARD_DEFAULT_WIDTH = 3;
const BOARD_ERASER_WIDTH_MULTIPLIER = 2.6;
const BOARD_ERASER_MIN_WIDTH = 10;
const BOARD_TIMELINE_THROTTLE_MS = 60;
const BOARD_TIMELINE_MIN_POINT_DELTA = 3;

const getPreferredAudioMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
};

const normalizeSelectionListForEvent = (selections) => (
  (Array.isArray(selections) ? selections : [])
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      let startLineNumber = Math.max(1, Number(item.startLineNumber) || 1);
      let startColumn = Math.max(1, Number(item.startColumn) || 1);
      let endLineNumber = Math.max(1, Number(item.endLineNumber) || startLineNumber);
      let endColumn = Math.max(1, Number(item.endColumn) || startColumn);
      if (endLineNumber < startLineNumber || (endLineNumber === startLineNumber && endColumn < startColumn)) {
        const nextStartLineNumber = endLineNumber;
        const nextStartColumn = endColumn;
        endLineNumber = startLineNumber;
        endColumn = startColumn;
        startLineNumber = nextStartLineNumber;
        startColumn = nextStartColumn;
      }
      return { startLineNumber, startColumn, endLineNumber, endColumn };
    })
    .filter(Boolean)
    .slice(0, 10)
);

const selectionSignature = (selections) => {
  try {
    return JSON.stringify(selections || []);
  } catch {
    return '';
  }
};

const clampBoardUnit = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, Number(num.toFixed(4))));
};

const normalizeBoardStrokeForEvent = (stroke) => {
  if (!stroke || typeof stroke !== 'object') return null;
  const points = (Array.isArray(stroke.points) ? stroke.points : [])
    .map((point) => {
      if (!point || typeof point !== 'object') return null;
      return {
        x: clampBoardUnit(point.x),
        y: clampBoardUnit(point.y),
      };
    })
    .filter(Boolean)
    .slice(0, BOARD_MAX_POINTS_IN_STROKE);
  if (points.length < 1) return null;
  return {
    id: String(stroke.id || '').trim().slice(0, 64) || `stroke-${Date.now()}`,
    color: String(stroke.color || BOARD_DEFAULT_COLOR).trim().slice(0, 40) || BOARD_DEFAULT_COLOR,
    width: Math.max(1, Math.min(64, Number(stroke.width) || BOARD_DEFAULT_WIDTH)),
    points,
  };
};

const normalizeBoardStrokesForEvent = (strokes) => (
  (Array.isArray(strokes) ? strokes : [])
    .map((stroke) => normalizeBoardStrokeForEvent(stroke))
    .filter(Boolean)
    .slice(0, BOARD_MAX_STROKES)
);

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

const buildBoardStrokesFromEvents = (events) => {
  const next = [];
  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!event || event.type !== THEORY_RECORDING_EVENT_BOARD) return;
    if (event.action === 'clear') {
      next.length = 0;
      return;
    }
    if (event.action === 'snapshot') {
      const snapshot = normalizeBoardStrokesForEvent(event.strokes);
      next.length = 0;
      snapshot.forEach((stroke) => next.push(stroke));
      return;
    }
    if (event.action === 'stroke') {
      const stroke = normalizeBoardStrokeForEvent(event.stroke);
      if (!stroke) return;
      upsertBoardStrokeById(next, stroke);
      if (next.length > BOARD_MAX_STROKES) next.splice(0, next.length - BOARD_MAX_STROKES);
    }
  });
  return next;
};

const TheoryRecordingEditor = ({
  initialRecording,
  disabled = false,
  onDraftChange,
  ensurePyodideReady = null,
  theme = '',
}) => {
  const monacoTheme = resolveMonacoColorTheme(theme);
  const normalizedInitial = useMemo(() => normalizeTheoryRecording(initialRecording), [initialRecording]);
  const initialDraft = useMemo(() => (
    normalizedInitial
      ? {
          ...normalizedInitial,
          audio: normalizedInitial.audio
            ? { ...normalizedInitial.audio, isNew: false, file: null }
            : null,
        }
      : null
  ), [normalizedInitial]);
  const initialBoardStrokes = useMemo(
    () => buildBoardStrokesFromEvents(initialDraft?.events),
    [initialDraft?.events]
  );
  const [draft, setDraft] = useState(() => initialDraft);
  const [code, setCode] = useState(() => initialDraft?.initialCode || '');
  const [recordingError, setRecordingError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(() => initialDraft?.durationMs || 0);
  const [eventCount, setEventCount] = useState(() => (
    Array.isArray(initialDraft?.events) ? initialDraft.events.length : 0
  ));
  const [runInput, setRunInput] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [runError, setRunError] = useState('');
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [boardStrokes, setBoardStrokes] = useState(() => initialBoardStrokes);
  const [boardTool, setBoardTool] = useState('pen');
  const [boardColor, setBoardColor] = useState(BOARD_DEFAULT_COLOR);
  const [boardWidth, setBoardWidth] = useState(BOARD_DEFAULT_WIDTH);

  const editorRef = useRef(null);
  const contentDisposableRef = useRef(null);
  const selectionDisposableRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const eventsRef = useRef([]);
  const boardCanvasRef = useRef(null);
  const boardDrawingRef = useRef({ active: false, pointerId: null, stroke: null });
  const boardStrokesRef = useRef(initialBoardStrokes);
  const boardTimelineEmitRef = useRef({ strokeId: '', points: 0, ts: 0 });
  const recordingStartedAtRef = useRef(0);
  const recordingPausedAtRef = useRef(0);
  const recordingPausedAccumMsRef = useRef(0);
  const isRecordingPausedRef = useRef(false);
  const isRecordingRef = useRef(false);
  const elapsedTimerRef = useRef(null);
  const codeDebounceTimerRef = useRef(null);
  const selectionDebounceTimerRef = useRef(null);
  const lastCodeRef = useRef('');
  const lastSelectionSignatureRef = useRef('');
  const initialCodeAtStartRef = useRef('');
  const createdAtRef = useRef(initialDraft?.createdAt || '');
  const localAudioUrlRef = useRef('');
  const runRequestSeqRef = useRef(0);
  const editorId = useId();
  const editorPath = useMemo(() => (
    `inmemory://theory-recording/editor-${String(editorId).replace(/[^0-9a-zA-Z_-]/g, '_')}`
  ), [editorId]);

  const stopMediaStream = useCallback(() => {
    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* no-op */ }
      });
    }
  }, []);

  const clearRecordTimers = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (codeDebounceTimerRef.current) {
      clearTimeout(codeDebounceTimerRef.current);
      codeDebounceTimerRef.current = null;
    }
    if (selectionDebounceTimerRef.current) {
      clearTimeout(selectionDebounceTimerRef.current);
      selectionDebounceTimerRef.current = null;
    }
  }, []);

  const revokeLocalAudioUrl = useCallback(() => {
    if (localAudioUrlRef.current) {
      URL.revokeObjectURL(localAudioUrlRef.current);
      localAudioUrlRef.current = '';
    }
  }, []);

  const getNowMs = useCallback(
    () => {
      const startedAt = Number(recordingStartedAtRef.current || 0);
      if (!startedAt) return 0;
      const pausedAccum = Math.max(0, Number(recordingPausedAccumMsRef.current || 0));
      const nowRaw = isRecordingPausedRef.current
        ? Number(recordingPausedAtRef.current || startedAt)
        : performance.now();
      return Math.max(0, Math.round(nowRaw - startedAt - pausedAccum));
    },
    []
  );

  const startElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs(getNowMs());
    }, 100);
  }, [getNowMs]);

  const getEditorSelections = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || typeof editor.getSelections !== 'function') return [];
    return normalizeSelectionListForEvent(editor.getSelections());
  }, []);

  const appendCodeEvent = useCallback((timestampMs, value, force = false) => {
    const nextCode = typeof value === 'string'
      ? value
      : (editorRef.current?.getValue?.() || '');
    if (!force && nextCode === lastCodeRef.current) return;
    if (eventsRef.current.length >= THEORY_RECORDING_MAX_EVENTS) return;
    lastCodeRef.current = nextCode;
    eventsRef.current.push({
      t: Math.max(0, Math.round(timestampMs)),
      type: THEORY_RECORDING_EVENT_CODE,
      code: nextCode,
    });
    setEventCount(eventsRef.current.length);
  }, []);

  const appendSelectionEvent = useCallback((timestampMs, selections, force = false) => {
    const normalizedSelections = normalizeSelectionListForEvent(selections);
    const signature = selectionSignature(normalizedSelections);
    if (!force && signature === lastSelectionSignatureRef.current) return;
    if (eventsRef.current.length >= THEORY_RECORDING_MAX_EVENTS) return;
    lastSelectionSignatureRef.current = signature;
    eventsRef.current.push({
      t: Math.max(0, Math.round(timestampMs)),
      type: THEORY_RECORDING_EVENT_SELECTION,
      selections: normalizedSelections,
    });
    setEventCount(eventsRef.current.length);
  }, []);

  const appendRunOutputEvent = useCallback((timestampMs, payload = {}) => {
    if (eventsRef.current.length >= THEORY_RECORDING_MAX_EVENTS) return;
    eventsRef.current.push({
      t: Math.max(0, Math.round(timestampMs)),
      type: THEORY_RECORDING_EVENT_RUN_OUTPUT,
      input: String(payload.input ?? ''),
      output: String(payload.output ?? ''),
      error: String(payload.error ?? ''),
    });
    setEventCount(eventsRef.current.length);
  }, []);

  const appendBoardEvent = useCallback((timestampMs, payload = {}) => {
    if (eventsRef.current.length >= THEORY_RECORDING_MAX_EVENTS) return;
    const action = String(payload.action || '').trim();
    if (action === 'clear') {
      eventsRef.current.push({
        t: Math.max(0, Math.round(timestampMs)),
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'clear',
      });
      setEventCount(eventsRef.current.length);
      return;
    }
    if (action === 'snapshot') {
      const strokes = normalizeBoardStrokesForEvent(payload.strokes);
      eventsRef.current.push({
        t: Math.max(0, Math.round(timestampMs)),
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'snapshot',
        strokes,
      });
      setEventCount(eventsRef.current.length);
      return;
    }
    if (action === 'stroke') {
      const stroke = normalizeBoardStrokeForEvent(payload.stroke);
      if (!stroke) return;
      eventsRef.current.push({
        t: Math.max(0, Math.round(timestampMs)),
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'stroke',
        stroke,
      });
      setEventCount(eventsRef.current.length);
    }
  }, []);

  const emitBoardStrokeProgress = useCallback((stroke, options = {}) => {
    if (!isRecordingRef.current || isRecordingPausedRef.current) return;
    const safeStroke = normalizeBoardStrokeForEvent(stroke);
    if (!safeStroke) return;
    const force = options?.force === true;
    const now = Date.now();
    const meta = boardTimelineEmitRef.current;
    const isSameStroke = meta.strokeId === safeStroke.id;
    const isSamePointCount = isSameStroke && meta.points === safeStroke.points.length;
    const pointsDelta = Math.max(0, safeStroke.points.length - Number(meta.points || 0));
    const withinThrottle = isSameStroke && (now - Number(meta.ts || 0)) < BOARD_TIMELINE_THROTTLE_MS;
    if (!force && (isSamePointCount || (withinThrottle && pointsDelta < BOARD_TIMELINE_MIN_POINT_DELTA))) return;
    appendBoardEvent(getNowMs(), { action: 'stroke', stroke: safeStroke });
    boardTimelineEmitRef.current = {
      strokeId: safeStroke.id,
      points: safeStroke.points.length,
      ts: now,
    };
  }, [appendBoardEvent, getNowMs]);

  const drawBoardStroke = useCallback((ctx, stroke, width, height) => {
    if (!ctx || !stroke || !Array.isArray(stroke.points) || stroke.points.length < 1) return;
    const points = stroke.points
      .map((point) => {
        const x = Math.max(0, Math.min(width, Number(point.x || 0) * width));
        const y = Math.max(0, Math.min(height, Number(point.y || 0) * height));
        return { x, y };
      });
    if (points.length < 1) return;
    const lineWidth = Math.max(1, Number(stroke.width) || BOARD_DEFAULT_WIDTH);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = String(stroke.color || BOARD_DEFAULT_COLOR);
    ctx.fillStyle = String(stroke.color || BOARD_DEFAULT_COLOR);
    ctx.lineWidth = lineWidth;
    if (points.length === 1) {
      const point = points[0];
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(1, lineWidth * 0.5), 0, Math.PI * 2);
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

  const renderBoardCanvas = useCallback(() => {
    const canvas = boardCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = Math.max(1, canvas.width || 1);
    const height = Math.max(1, canvas.height || 1);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = BOARD_SNAPSHOT_BG;
    ctx.fillRect(0, 0, width, height);
    boardStrokesRef.current.forEach((stroke) => drawBoardStroke(ctx, stroke, width, height));
    const previewStroke = boardDrawingRef.current?.stroke;
    if (previewStroke) drawBoardStroke(ctx, previewStroke, width, height);
  }, [drawBoardStroke]);

  const getBoardPoint = useCallback((event) => {
    const canvas = boardCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || 1);
    const height = Math.max(1, rect.height || 1);
    const x = clampBoardUnit((Number(event.clientX) - rect.left) / width);
    const y = clampBoardUnit((Number(event.clientY) - rect.top) / height);
    return { x, y };
  }, []);

  const commitBoardStroke = useCallback((stroke) => {
    const safeStroke = normalizeBoardStrokeForEvent(stroke);
    if (!safeStroke) return;
    setBoardStrokes((prev) => {
      const next = [...(Array.isArray(prev) ? prev : [])];
      upsertBoardStrokeById(next, safeStroke);
      if (next.length > BOARD_MAX_STROKES) {
        next.splice(0, next.length - BOARD_MAX_STROKES);
      }
      return next;
    });
  }, []);

  const finishBoardDrawing = useCallback((pointerId = null) => {
    const drawingState = boardDrawingRef.current;
    if (!drawingState.active) return;
    if (pointerId !== null && drawingState.pointerId !== pointerId) return;
    const stroke = drawingState.stroke;
    boardDrawingRef.current = { active: false, pointerId: null, stroke: null };
    if (stroke) {
      emitBoardStrokeProgress(stroke, { force: true });
      commitBoardStroke(stroke);
    }
    renderBoardCanvas();
  }, [commitBoardStroke, emitBoardStrokeProgress, renderBoardCanvas]);

  const handleBoardPointerDown = useCallback((event) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    const point = getBoardPoint(event);
    if (!point) return;
    const strokeColor = boardTool === 'eraser' ? BOARD_SNAPSHOT_BG : boardColor;
    const strokeWidth = boardTool === 'eraser'
      ? Math.max(BOARD_ERASER_MIN_WIDTH, boardWidth * BOARD_ERASER_WIDTH_MULTIPLIER)
      : boardWidth;
    boardDrawingRef.current = {
      active: true,
      pointerId: event.pointerId,
      stroke: {
        id: `board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        color: strokeColor,
        width: strokeWidth,
        points: [point],
      },
    };
    boardTimelineEmitRef.current = {
      strokeId: boardDrawingRef.current.stroke.id,
      points: 0,
      ts: 0,
    };
    emitBoardStrokeProgress(boardDrawingRef.current.stroke, { force: true });
    renderBoardCanvas();
  }, [boardColor, boardTool, boardWidth, disabled, emitBoardStrokeProgress, getBoardPoint, renderBoardCanvas]);

  const handleBoardPointerMove = useCallback((event) => {
    const drawingState = boardDrawingRef.current;
    if (!drawingState.active || drawingState.pointerId !== event.pointerId || !drawingState.stroke) return;
    const point = getBoardPoint(event);
    if (!point) return;
    const points = drawingState.stroke.points;
    const lastPoint = points[points.length - 1];
    const dx = Math.abs(point.x - (lastPoint?.x ?? 0));
    const dy = Math.abs(point.y - (lastPoint?.y ?? 0));
    if ((dx + dy) < BOARD_CANVAS_MIN_DISTANCE) return;
    points.push(point);
    if (points.length > BOARD_MAX_POINTS_IN_STROKE) {
      points.splice(0, points.length - BOARD_MAX_POINTS_IN_STROKE);
    }
    emitBoardStrokeProgress(drawingState.stroke);
    renderBoardCanvas();
  }, [emitBoardStrokeProgress, getBoardPoint, renderBoardCanvas]);

  const handleBoardPointerUp = useCallback((event) => {
    event.preventDefault();
    finishBoardDrawing(event.pointerId);
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
  }, [finishBoardDrawing]);

  const handleBoardPointerCancel = useCallback((event) => {
    event.preventDefault();
    finishBoardDrawing(event.pointerId);
  }, [finishBoardDrawing]);

  const handleClearBoard = useCallback(() => {
    boardDrawingRef.current = { active: false, pointerId: null, stroke: null };
    boardTimelineEmitRef.current = { strokeId: '', points: 0, ts: 0 };
    setBoardStrokes([]);
    if (isRecordingRef.current && !isRecordingPausedRef.current) {
      appendBoardEvent(getNowMs(), { action: 'clear' });
    }
    renderBoardCanvas();
  }, [appendBoardEvent, getNowMs, renderBoardCanvas]);

  const flushScheduledSnapshots = useCallback(() => {
    if (codeDebounceTimerRef.current) {
      clearTimeout(codeDebounceTimerRef.current);
      codeDebounceTimerRef.current = null;
      appendCodeEvent(getNowMs(), editorRef.current?.getValue?.() || '', true);
    }
    if (selectionDebounceTimerRef.current) {
      clearTimeout(selectionDebounceTimerRef.current);
      selectionDebounceTimerRef.current = null;
      appendSelectionEvent(getNowMs(), getEditorSelections(), true);
    }
  }, [appendCodeEvent, appendSelectionEvent, getEditorSelections, getNowMs]);

  useEffect(() => {
    boardStrokesRef.current = Array.isArray(boardStrokes) ? boardStrokes : [];
    renderBoardCanvas();
  }, [boardStrokes, renderBoardCanvas]);

  const finalizeRecording = useCallback((durationMs, mimeType = '') => {
    const chunks = Array.isArray(chunksRef.current) ? chunksRef.current : [];
    const resolvedMime = chunks[0]?.type || mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: resolvedMime });
    stopMediaStream();
    if (!blob.size) {
      setRecordingError('Аудио не записалось. Попробуйте еще раз.');
      return;
    }
    revokeLocalAudioUrl();
    const localAudioUrl = URL.createObjectURL(blob);
    localAudioUrlRef.current = localAudioUrl;
    const extension = resolvedMime.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `theory-recording-${Date.now()}.${extension}`, { type: resolvedMime });
    const events = (Array.isArray(eventsRef.current) ? eventsRef.current : [])
      .map((event) => ({ ...event }))
      .sort((left, right) => {
        const delta = left.t - right.t;
        if (delta !== 0) return delta;
        if (left.type === right.type) return 0;
        const order = {
          [THEORY_RECORDING_EVENT_CODE]: 0,
          [THEORY_RECORDING_EVENT_SELECTION]: 1,
          [THEORY_RECORDING_EVENT_BOARD]: 2,
          [THEORY_RECORDING_EVENT_RUN_OUTPUT]: 3,
        };
        return (order[left.type] ?? 99) - (order[right.type] ?? 99);
      })
      .slice(0, THEORY_RECORDING_MAX_EVENTS);
    const safeDuration = Math.max(
      0,
      Math.round(durationMs || 0),
      events.length > 0 ? Number(events[events.length - 1].t || 0) : 0
    );
    const updatedAt = new Date().toISOString();
    if (!createdAtRef.current) createdAtRef.current = updatedAt;
    setDraft({
      version: THEORY_RECORDING_VERSION,
      initialCode: initialCodeAtStartRef.current,
      durationMs: safeDuration,
      events,
      audio: {
        url: localAudioUrl,
        storageName: '',
        name: file.name,
        sizeBytes: file.size,
        isNew: true,
        file,
      },
      createdAt: createdAtRef.current,
      updatedAt,
    });
    setElapsedMs(safeDuration);
    setEventCount(events.length);
    if (events.length >= THEORY_RECORDING_MAX_EVENTS) {
      setRecordingError('Запись достигла лимита событий. Сократите длительность или количество действий.');
    } else {
      setRecordingError('');
    }
  }, [revokeLocalAudioUrl, stopMediaStream]);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    finishBoardDrawing();
    const stopMs = getNowMs();
    flushScheduledSnapshots();
    clearRecordTimers();
    appendCodeEvent(stopMs, editorRef.current?.getValue?.() || '', true);
    appendSelectionEvent(stopMs, getEditorSelections(), true);
    setElapsedMs(stopMs);
    isRecordingRef.current = false;
    isRecordingPausedRef.current = false;
    recordingPausedAtRef.current = 0;
    recordingPausedAccumMsRef.current = 0;
    setIsPaused(false);
    setIsRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.onstop = () => {
          finalizeRecording(stopMs, recorder?.mimeType || '');
        };
        recorder.stop();
      } catch {
        finalizeRecording(stopMs, recorder?.mimeType || '');
      }
    } else {
      finalizeRecording(stopMs, recorder?.mimeType || '');
    }
  }, [
    appendCodeEvent,
    appendSelectionEvent,
    clearRecordTimers,
    finalizeRecording,
    finishBoardDrawing,
    flushScheduledSnapshots,
    getEditorSelections,
    getNowMs,
  ]);

  const pauseRecording = useCallback(() => {
    if (!isRecordingRef.current || isRecordingPausedRef.current) return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.pause();
      } catch {
        setRecordingError('Не удалось поставить запись на паузу.');
        return;
      }
    }
    finishBoardDrawing();
    const pauseMs = getNowMs();
    flushScheduledSnapshots();
    clearRecordTimers();
    appendCodeEvent(pauseMs, editorRef.current?.getValue?.() || '', true);
    appendSelectionEvent(pauseMs, getEditorSelections(), true);
    setElapsedMs(pauseMs);
    recordingPausedAtRef.current = performance.now();
    isRecordingPausedRef.current = true;
    setIsPaused(true);
    setRecordingError('');
  }, [
    appendCodeEvent,
    appendSelectionEvent,
    clearRecordTimers,
    finishBoardDrawing,
    flushScheduledSnapshots,
    getEditorSelections,
    getNowMs,
  ]);

  const resumeRecording = useCallback(() => {
    if (!isRecordingRef.current || !isRecordingPausedRef.current) return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      try {
        recorder.resume();
      } catch {
        setRecordingError('Не удалось продолжить запись.');
        return;
      }
    }
    const nowPerf = performance.now();
    const pausedAt = Number(recordingPausedAtRef.current || nowPerf);
    if (pausedAt > 0 && nowPerf > pausedAt) {
      recordingPausedAccumMsRef.current += (nowPerf - pausedAt);
    }
    recordingPausedAtRef.current = 0;
    isRecordingPausedRef.current = false;
    setIsPaused(false);
    const resumeMs = getNowMs();
    appendCodeEvent(resumeMs, editorRef.current?.getValue?.() || '', true);
    appendSelectionEvent(resumeMs, getEditorSelections(), true);
    appendBoardEvent(resumeMs, { action: 'snapshot', strokes: boardStrokesRef.current });
    setElapsedMs(resumeMs);
    startElapsedTimer();
    setRecordingError('');
  }, [
    appendBoardEvent,
    appendCodeEvent,
    appendSelectionEvent,
    getEditorSelections,
    getNowMs,
    startElapsedTimer,
  ]);

  const startRecording = useCallback(async () => {
    if (disabled || isRecordingRef.current) return;
    setRecordingError('');
    const editor = editorRef.current;
    if (!editor) {
      setRecordingError('Редактор еще не готов. Попробуйте через секунду.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecordingError('Браузер не поддерживает запись микрофона.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setRecordingError('В этом браузере недоступна запись аудио.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      eventsRef.current = [];
      lastCodeRef.current = '';
      lastSelectionSignatureRef.current = '';
      const mimeType = getPreferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event?.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setRecordingError('Произошла ошибка во время записи аудио.');
      };
      recorder.onstop = () => {
        finalizeRecording(getNowMs(), recorder.mimeType || mimeType);
      };

      initialCodeAtStartRef.current = editor.getValue() || '';
      recordingStartedAtRef.current = performance.now();
      recordingPausedAtRef.current = 0;
      recordingPausedAccumMsRef.current = 0;
      isRecordingPausedRef.current = false;
      isRecordingRef.current = true;
      setIsRecording(true);
      setIsPaused(false);
      setElapsedMs(0);
      setEventCount(0);
      boardTimelineEmitRef.current = { strokeId: '', points: 0, ts: 0 };
      appendCodeEvent(0, initialCodeAtStartRef.current, true);
      appendSelectionEvent(0, getEditorSelections(), true);
      if (boardStrokesRef.current.length > 0) {
        appendBoardEvent(0, { action: 'snapshot', strokes: boardStrokesRef.current });
      }
      recorder.start(250);
      startElapsedTimer();
    } catch (error) {
      stopMediaStream();
      setRecordingError(error?.message || 'Не удалось получить доступ к микрофону.');
    }
  }, [
    appendCodeEvent,
    appendBoardEvent,
    appendSelectionEvent,
    disabled,
    finalizeRecording,
    getEditorSelections,
    getNowMs,
    startElapsedTimer,
    stopMediaStream,
  ]);

  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;
    const model = editor.getModel();
    if (model && model.getValue() !== code) {
      model.setValue(code || '');
    }

    if (contentDisposableRef.current) {
      contentDisposableRef.current.dispose();
      contentDisposableRef.current = null;
    }
    if (selectionDisposableRef.current) {
      selectionDisposableRef.current.dispose();
      selectionDisposableRef.current = null;
    }

    if (model) {
      contentDisposableRef.current = model.onDidChangeContent(() => {
        const nextCode = model.getValue();
        setCode(nextCode);
        if (!isRecordingRef.current || isRecordingPausedRef.current) return;
        if (!codeDebounceTimerRef.current) {
          codeDebounceTimerRef.current = setTimeout(() => {
            codeDebounceTimerRef.current = null;
            appendCodeEvent(getNowMs(), model.getValue());
          }, CODE_SNAPSHOT_DEBOUNCE_MS);
        }
      });
    }

    selectionDisposableRef.current = editor.onDidChangeCursorSelection(() => {
      if (!isRecordingRef.current || isRecordingPausedRef.current) return;
      if (!selectionDebounceTimerRef.current) {
        selectionDebounceTimerRef.current = setTimeout(() => {
          selectionDebounceTimerRef.current = null;
          appendSelectionEvent(getNowMs(), getEditorSelections());
        }, SELECTION_SNAPSHOT_DEBOUNCE_MS);
      }
    });
  }, [appendCodeEvent, appendSelectionEvent, code, getEditorSelections, getNowMs]);

  const runPythonInMainThread = useCallback(async (source, inputValue) => {
    if (typeof ensurePyodideReady !== 'function') {
      return {
        output: '',
        error: 'Запуск Python недоступен: движок не инициализирован.',
      };
    }
    const pyodide = await ensurePyodideReady();
    const wrapped = [
      'import sys, io, traceback',
      `_input = ${JSON.stringify(String(inputValue ?? ''))}`,
      '_stdout = io.StringIO()',
      '_stderr = io.StringIO()',
      'sys.stdin = io.StringIO(_input)',
      'sys.stdout = _stdout',
      'sys.stderr = _stderr',
      '_globals = {}',
      'try:',
      `    exec(${JSON.stringify(String(source ?? ''))}, _globals, _globals)`,
      'except Exception:',
      '    traceback.print_exc()',
      '__output = _stdout.getvalue()',
      '__error = _stderr.getvalue()',
    ].join('\n');
    await pyodide.runPythonAsync(wrapped);
    const output = pyodide.globals.get('__output') || '';
    const error = pyodide.globals.get('__error') || '';
    pyodide.globals.delete('__output');
    pyodide.globals.delete('__error');
    return { output: String(output), error: String(error) };
  }, [ensurePyodideReady]);

  const handleRunCode = useCallback(async () => {
    if (disabled || isRunningCode) return;
    const editorCode = editorRef.current?.getValue?.() || code || '';
    if (!String(editorCode).trim()) {
      setRunOutput('');
      setRunError('Добавьте код перед запуском.');
      return;
    }
    const runSeq = runRequestSeqRef.current + 1;
    runRequestSeqRef.current = runSeq;
    setIsRunningCode(true);
    setRunError('');

    if (isRecordingRef.current && !isRecordingPausedRef.current) {
      flushScheduledSnapshots();
      const stampMs = getNowMs();
      appendCodeEvent(stampMs, editorCode, true);
      appendSelectionEvent(stampMs, getEditorSelections(), true);
    }

    try {
      const result = await runPythonInMainThread(editorCode, runInput);
      if (runRequestSeqRef.current !== runSeq) return;
      const nextOutput = String(result?.output ?? '');
      const nextError = String(result?.error ?? '');
      setRunOutput(nextOutput);
      setRunError(nextError);
      if (isRecordingRef.current && !isRecordingPausedRef.current) {
        appendRunOutputEvent(getNowMs(), {
          input: runInput,
          output: nextOutput,
          error: nextError,
        });
      }
    } catch (error) {
      if (runRequestSeqRef.current !== runSeq) return;
      const message = error?.message || 'Не удалось выполнить код.';
      setRunOutput('');
      setRunError(String(message));
      if (isRecordingRef.current && !isRecordingPausedRef.current) {
        appendRunOutputEvent(getNowMs(), {
          input: runInput,
          output: '',
          error: String(message),
        });
      }
    } finally {
      if (runRequestSeqRef.current === runSeq) {
        setIsRunningCode(false);
      }
    }
  }, [
    appendCodeEvent,
    appendRunOutputEvent,
    appendSelectionEvent,
    code,
    disabled,
    flushScheduledSnapshots,
    getEditorSelections,
    getNowMs,
    isRunningCode,
    runInput,
    runPythonInMainThread,
  ]);

  const handleResetDraft = useCallback(() => {
    if (isRecordingRef.current) return;
    setDraft(null);
    setBoardStrokes([]);
    boardDrawingRef.current = { active: false, pointerId: null, stroke: null };
    boardTimelineEmitRef.current = { strokeId: '', points: 0, ts: 0 };
    setEventCount(0);
    setElapsedMs(0);
    setRunOutput('');
    setRunError('');
    setRecordingError('');
    revokeLocalAudioUrl();
    renderBoardCanvas();
  }, [renderBoardCanvas, revokeLocalAudioUrl]);

  useEffect(() => {
    if (typeof onDraftChange === 'function') {
      onDraftChange(draft);
    }
  }, [draft, onDraftChange]);

  useEffect(() => () => {
    runRequestSeqRef.current += 1;
    isRecordingRef.current = false;
    isRecordingPausedRef.current = false;
    recordingPausedAtRef.current = 0;
    recordingPausedAccumMsRef.current = 0;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.onstop = null;
        recorder.stop();
      } catch {
        /* no-op */
      }
    }
    clearRecordTimers();
    stopMediaStream();
    revokeLocalAudioUrl();
    if (contentDisposableRef.current) contentDisposableRef.current.dispose();
    if (selectionDisposableRef.current) selectionDisposableRef.current.dispose();
  }, [clearRecordTimers, revokeLocalAudioUrl, stopMediaStream]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {!isRecording ? (
            <Button onClick={startRecording} disabled={disabled}>
              Запись теории
            </Button>
          ) : (
            <>
              {!isPaused ? (
                <Button variant="secondary" onClick={pauseRecording} disabled={disabled}>
                  Пауза
                </Button>
              ) : (
                <Button onClick={resumeRecording} disabled={disabled}>
                  Продолжить
                </Button>
              )}
              <Button onClick={stopRecording} disabled={disabled}>
                Остановить запись
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={handleResetDraft} disabled={disabled || isRecording}>
            Сбросить черновик
          </Button>
          <div className="text-xs text-slate-500">
            {!isRecording
              ? 'Запись остановлена'
              : (isPaused ? 'Запись на паузе' : 'Идет запись...')}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>{`Длительность: ${formatRecordingDuration(elapsedMs)}`}</span>
          <span>{`Событий: ${eventCount}`}</span>
        </div>
        {recordingError && (
          <div className="mt-2 text-xs text-red-600">{recordingError}</div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-800">
        <Editor
          height="260px"
          language="python"
          theme={monacoTheme}
          beforeMount={ensureMonacoColorTheme}
          defaultValue={code}
          path={editorPath}
          saveViewState={false}
          onMount={handleEditorMount}
          options={RECORDING_EDITOR_OPTIONS}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/85 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Доска для видеоразбора</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBoardTool('pen')}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                boardTool === 'pen'
                  ? 'border-purple-500 bg-purple-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700'
              }`}
            >
              Перо
            </button>
            <button
              type="button"
              onClick={() => setBoardTool('eraser')}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                boardTool === 'eraser'
                  ? 'border-purple-500 bg-purple-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700'
              }`}
            >
              Ластик
            </button>
            <button
              type="button"
              onClick={handleClearBoard}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
            >
              Очистить
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <label className="inline-flex items-center gap-2">
            <span>Цвет</span>
            <input
              type="color"
              value={boardColor}
              onChange={(event) => setBoardColor(event.target.value || BOARD_DEFAULT_COLOR)}
              disabled={boardTool === 'eraser'}
              className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <label className="inline-flex items-center gap-2">
            <span>Толщина</span>
            <input
              type="range"
              min={1}
              max={22}
              step={1}
              value={Math.max(1, Math.min(22, Math.round(Number(boardWidth) || BOARD_DEFAULT_WIDTH)))}
              onChange={(event) => setBoardWidth(Math.max(1, Math.min(22, Number(event.target.value) || BOARD_DEFAULT_WIDTH)))}
              className="w-28"
            />
            <span>{Math.max(1, Math.min(22, Math.round(Number(boardWidth) || BOARD_DEFAULT_WIDTH)))}</span>
          </label>
          <span>{`Штрихов: ${boardStrokes.length}`}</span>
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-300/80 bg-[#050d1f] shadow-[inset_0_1px_0_rgba(148,163,184,0.16)]">
          <canvas
            ref={boardCanvasRef}
            width={960}
            height={300}
            onPointerDown={handleBoardPointerDown}
            onPointerMove={handleBoardPointerMove}
            onPointerUp={handleBoardPointerUp}
            onPointerCancel={handleBoardPointerCancel}
            className="h-[210px] w-full touch-none select-none cursor-crosshair"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ввод для запуска (stdin)</div>
            <textarea
              value={runInput}
              onChange={(event) => setRunInput(event.target.value)}
              placeholder="Необязательно. Можно оставить пустым."
              spellCheck={false}
              className="mt-1 w-full min-h-[72px] resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-purple-400"
            />
          </div>
          <div className="sm:pl-2">
            <Button
              onClick={handleRunCode}
              disabled={disabled || isRunningCode}
              variant="secondary"
            >
              {isRunningCode ? 'Запуск...' : 'Запустить код'}
            </Button>
          </div>
        </div>
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-950 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Вывод</div>
          <pre className="mt-1 max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-100">{runOutput || 'Вывод появится после запуска кода.'}</pre>
          {runError && (
            <div className="mt-2 border-t border-slate-800 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-300">Ошибки</div>
              <pre className="mt-1 max-h-[120px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-rose-200">{runError}</pre>
            </div>
          )}
        </div>
      </div>

      <div className="text-[11px] text-slate-500">
        Во время записи сохраняются аудио с микрофона, изменения кода, выделения в редакторе, рисунки на доске и результаты запусков (stdin/stdout/stderr).
      </div>

      {draft && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Предпросмотр видеоразбора</div>
          <TheoryRecordingPlayer recording={draft} className="mt-2" theme={theme} />
        </div>
      )}
    </div>
  );
};

export default TheoryRecordingEditor;
