import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from './SelfHostedMonacoEditor';
import {
  AlertTriangle,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  formatRecordingDuration,
  getTheoryRecordingAudioSegments,
  normalizeTheoryRecording,
  THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS,
  THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI,
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
const THEORY_PLAYER_BOARD_MAX_IMAGES = 12;

const normalizeBoardDisplayModeForPlayer = (value) => (
  String(value || '').trim() === THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS
    ? THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS
    : THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI
);

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

const clampBoardImageSizeForPlayer = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.32;
  return Math.max(0.04, Math.min(1, num));
};

const clampBoardImageAspectRatioForPlayer = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(0.05, Math.min(20, num));
};

const normalizeBoardImageForPlayer = (image) => {
  if (!image || typeof image !== 'object') return null;
  const src = String(image.src || '').trim();
  if (!src) return null;
  const x = Math.max(0, Math.min(1, Number(image.x)));
  const y = Math.max(0, Math.min(1, Number(image.y)));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: String(image.id || '').trim().slice(0, 64) || `image-${Math.random().toString(36).slice(2, 9)}`,
    src: src.slice(0, 1_600_000),
    x,
    y,
    width: clampBoardImageSizeForPlayer(image.width),
    height: clampBoardImageSizeForPlayer(image.height),
    aspectRatio: clampBoardImageAspectRatioForPlayer(image.aspectRatio),
  };
};
const resolveBoardImageDrawRectForPlayer = (image, canvasWidth, canvasHeight, aspectRatio) => {
  const boxWidth = Math.max(12, Math.min(canvasWidth, Number(image?.width || 0.3) * canvasWidth));
  const boxHeight = Math.max(12, Math.min(canvasHeight, Number(image?.height || 0.3) * canvasHeight));
  const safeAspectRatio = Number(aspectRatio) > 0 ? clampBoardImageAspectRatioForPlayer(aspectRatio) : 0;
  let drawWidth = boxWidth;
  let drawHeight = boxHeight;
  if (safeAspectRatio > 0) {
    const widthFromHeight = boxHeight * safeAspectRatio;
    if (widthFromHeight <= boxWidth) {
      drawWidth = widthFromHeight;
      drawHeight = boxHeight;
    } else {
      drawWidth = boxWidth;
      drawHeight = boxWidth / safeAspectRatio;
    }
  }
  const x = Math.max(0, Math.min(Math.max(0, canvasWidth - drawWidth), Number(image?.x || 0) * canvasWidth));
  const y = Math.max(0, Math.min(Math.max(0, canvasHeight - drawHeight), Number(image?.y || 0) * canvasHeight));
  return { x, y, drawWidth, drawHeight, boxWidth, boxHeight };
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

const upsertBoardImageById = (list, image) => {
  if (!image?.id) return list;
  const idx = list.findIndex((item) => item?.id === image.id);
  if (idx === -1) {
    list.push(image);
    return list;
  }
  list[idx] = image;
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

const cloneSelectionFrames = (selections) => (
  (Array.isArray(selections) ? selections : [])
    .map((selection) => (
      selection && typeof selection === 'object'
        ? {
            startLineNumber: Number(selection.startLineNumber) || 1,
            startColumn: Number(selection.startColumn) || 1,
            endLineNumber: Number(selection.endLineNumber) || 1,
            endColumn: Number(selection.endColumn) || 1,
          }
        : null
    ))
    .filter(Boolean)
);

const isCollapsedSelection = (selection) => (
  Boolean(selection)
  && Number(selection.startLineNumber) === Number(selection.endLineNumber)
  && Number(selection.startColumn) === Number(selection.endColumn)
);

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
  const audioSegments = getTheoryRecordingAudioSegments(normalized);
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  return {
    ready: true,
    updatedAt: String(normalized.updatedAt || ''),
    createdAt: String(normalized.createdAt || ''),
    durationMs: Number(normalized.durationMs || 0),
    audioUrl: String(audioSegments[0]?.url || ''),
    audioStorage: String(audioSegments[0]?.storageName || ''),
    audioSegmentsLength: audioSegments.length,
    audioSegmentsDurationMs: audioSegments.reduce((sum, segment) => sum + Math.max(0, Number(segment?.durationMs) || 0), 0),
    lastAudioSegmentUrl: String(audioSegments[audioSegments.length - 1]?.url || ''),
    lastAudioSegmentStorage: String(audioSegments[audioSegments.length - 1]?.storageName || ''),
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
  if (Boolean(prevProps?.compact) !== Boolean(nextProps?.compact)) return false;
  if (String(prevProps?.experience || '') !== String(nextProps?.experience || '')) return false;
  if (String(prevProps?.title || '') !== String(nextProps?.title || '')) return false;
  const prevMeta = getRecordingMemoMeta(prevProps?.recording);
  const nextMeta = getRecordingMemoMeta(nextProps?.recording);
  return (
    prevMeta.ready === nextMeta.ready
    && prevMeta.updatedAt === nextMeta.updatedAt
    && prevMeta.createdAt === nextMeta.createdAt
    && prevMeta.durationMs === nextMeta.durationMs
    && prevMeta.audioUrl === nextMeta.audioUrl
    && prevMeta.audioStorage === nextMeta.audioStorage
    && prevMeta.audioSegmentsLength === nextMeta.audioSegmentsLength
    && prevMeta.audioSegmentsDurationMs === nextMeta.audioSegmentsDurationMs
    && prevMeta.lastAudioSegmentUrl === nextMeta.lastAudioSegmentUrl
    && prevMeta.lastAudioSegmentStorage === nextMeta.lastAudioSegmentStorage
    && prevMeta.initialCode === nextMeta.initialCode
    && prevMeta.eventsLength === nextMeta.eventsLength
    && prevMeta.lastEventT === nextMeta.lastEventT
    && prevMeta.lastEventType === nextMeta.lastEventType
  );
};

const TheoryRecordingPlayer = ({
  recording,
  className = '',
  progressStorageKey = '',
  theme = '',
  compact = false,
  experience = 'default',
  title = '',
}) => {
  const normalized = useMemo(() => normalizeTheoryRecording(recording), [recording]);
  const isStudyExperience = experience === 'study';
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
  const audioSegments = useMemo(
    () => getTheoryRecordingAudioSegments(normalized).filter((segment) => Boolean(String(segment?.url || '').trim())),
    [normalized]
  );
  const audioSegmentRanges = useMemo(() => {
    let cursorMs = 0;
    return audioSegments.map((segment, index) => {
      const safeDurationMs = Math.max(0, Math.round(Number(segment?.durationMs) || 0));
      const startMs = cursorMs;
      const isLast = index === audioSegments.length - 1;
      const endMs = isLast
        ? Math.max(startMs + safeDurationMs, timelineDurationMs)
        : (startMs + safeDurationMs);
      cursorMs = endMs;
      return {
        ...segment,
        index,
        startMs,
        endMs,
        durationMs: Math.max(0, endMs - startMs),
      };
    });
  }, [audioSegments, timelineDurationMs]);
  const totalAudioDurationMs = useMemo(
    () => (
      audioSegmentRanges.length > 0
        ? Math.max(audioSegmentRanges[audioSegmentRanges.length - 1].endMs, timelineDurationMs)
        : timelineDurationMs
    ),
    [audioSegmentRanges, timelineDurationMs]
  );

  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hasPlayerFocus, setHasPlayerFocus] = useState(false);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mediaStatus, setMediaStatus] = useState('loading');
  const [mediaError, setMediaError] = useState('');
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [seekPreview, setSeekPreview] = useState(null);
  const [touchSeekFeedback, setTouchSeekFeedback] = useState(null);
  const [runOutputFrame, setRunOutputFrame] = useState(null);
  const [boardStrokes, setBoardStrokes] = useState([]);
  const [boardImages, setBoardImages] = useState([]);
  const [boardDisplayMode, setBoardDisplayMode] = useState(THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI);
  const [activeAudioSegmentIndex, setActiveAudioSegmentIndex] = useState(0);
  const [supportsHover, setSupportsHover] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(hover: hover)').matches;
  });

  const playerContainerRef = useRef(null);
  const editorRef = useRef(null);
  const audioRef = useRef(null);
  const boardCanvasRef = useRef(null);
  const monacoRef = useRef(null);
  const boardImageCacheRef = useRef(new Map());
  const renderBoardCanvasRef = useRef(() => {});
  const selectionDecorationsRef = useRef([]);
  const selectionSnapshotRef = useRef([{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }]);
  const lastAppliedIndexRef = useRef(-1);
  const lastAppliedMsRef = useRef(0);
  const rafRef = useRef(null);
  const resumePositionMsRef = useRef(0);
  const lastPersistMetaRef = useRef({ ms: -1, ts: 0 });
  const activeAudioSegmentIndexRef = useRef(0);
  const pendingSeekPlaybackMsRef = useRef(null);
  const autoplayAfterSegmentLoadRef = useRef(false);
  const suppressPausePersistRef = useRef(false);
  const controlsHideTimerRef = useRef(null);
  const lastFrameSyncAtRef = useRef(0);
  const lastTouchTapRef = useRef({ at: 0, side: '' });
  const touchSeekFeedbackTimerRef = useRef(null);

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

  useEffect(() => {
    activeAudioSegmentIndexRef.current = activeAudioSegmentIndex;
  }, [activeAudioSegmentIndex]);

  const resolveSegmentAtPlaybackMs = useCallback((valueMs) => {
    const safePlaybackMs = Math.max(0, Math.round(Number(valueMs) || 0));
    if (audioSegmentRanges.length === 0) return null;
    for (let index = 0; index < audioSegmentRanges.length; index += 1) {
      const segment = audioSegmentRanges[index];
      if (safePlaybackMs < segment.endMs || index === audioSegmentRanges.length - 1) {
        const localMs = Math.max(
          0,
          Math.min(segment.durationMs, safePlaybackMs - segment.startMs)
        );
        return { ...segment, localMs, globalMs: safePlaybackMs };
      }
    }
    const lastSegment = audioSegmentRanges[audioSegmentRanges.length - 1];
    return {
      ...lastSegment,
      localMs: Math.max(0, Math.min(lastSegment.durationMs, safePlaybackMs - lastSegment.startMs)),
      globalMs: safePlaybackMs,
    };
  }, [audioSegmentRanges]);

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

  const applySelectionVisuals = useCallback((editorInstance, selections, options = {}) => {
    const editor = editorInstance || editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const fallbackSelection = [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }];
    const safeSelections = clampSelectionsToModel(model, selections);
    const effectiveSelections = safeSelections.length > 0 ? safeSelections : fallbackSelection;
    selectionSnapshotRef.current = cloneSelectionFrames(effectiveSelections);
    const editorSelections = effectiveSelections
      .map((selection) => asEditorSelection(selection))
      .filter(Boolean);
    if (editorSelections.length > 0) {
      try {
        editor.setSelections(editorSelections);
      } catch {
        // Ignore bad timeline selection frames to keep playback alive.
      }
    }
    const stickiness = monaco.editor?.TrackedRangeStickiness?.NeverGrowsWhenTypingAtEdges ?? 1;
    const decorations = [];
    const primarySelection = effectiveSelections[0] || null;
    if (primarySelection) {
      decorations.push({
        range: new monaco.Range(primarySelection.endLineNumber, 1, primarySelection.endLineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'theory-player-cursor-line',
          stickiness,
        },
      });
    }
    effectiveSelections.forEach((selection, index) => {
      const selectionRange = new monaco.Range(
        selection.startLineNumber,
        selection.startColumn,
        selection.endLineNumber,
        selection.endColumn
      );
      if (!isCollapsedSelection(selection)) {
        decorations.push({
          range: selectionRange,
          options: {
            className: index === 0
              ? 'theory-player-selection-range theory-player-selection-range--primary'
              : 'theory-player-selection-range',
            inlineClassName: index === 0
              ? 'theory-player-selection-inline theory-player-selection-inline--primary'
              : 'theory-player-selection-inline',
            stickiness,
          },
        });
      }
      decorations.push({
        range: new monaco.Range(
          selection.endLineNumber,
          selection.endColumn,
          selection.endLineNumber,
          selection.endColumn
        ),
        options: {
          afterContentClassName: index === 0
            ? 'theory-player-cursor-marker theory-player-cursor-marker--primary'
            : 'theory-player-cursor-marker theory-player-cursor-marker--secondary',
          stickiness,
        },
      });
    });
    try {
      selectionDecorationsRef.current = editor.deltaDecorations(selectionDecorationsRef.current, decorations);
    } catch {
      selectionDecorationsRef.current = [];
    }
    if (options.reveal === false || !primarySelection) return;
    try {
      if (typeof editor.revealRangeInCenterIfOutsideViewport === 'function') {
        editor.revealRangeInCenterIfOutsideViewport(
          new monaco.Range(
            primarySelection.startLineNumber,
            primarySelection.startColumn,
            primarySelection.endLineNumber,
            primarySelection.endColumn
          )
        );
      } else if (typeof editor.revealRange === 'function') {
        editor.revealRange(
          new monaco.Range(
            primarySelection.startLineNumber,
            primarySelection.startColumn,
            primarySelection.endLineNumber,
            primarySelection.endColumn
          )
        );
      }
    } catch {
      // Ignore reveal errors caused by transient models.
    }
  }, []);

  const applyEvent = useCallback((event) => {
    const editor = editorRef.current;
    if (!editor || !event) return;
    if (event.type === THEORY_RECORDING_EVENT_CODE) {
      const model = editor.getModel();
      if (model && model.getValue() !== event.code) {
        try {
          model.setValue(typeof event.code === 'string' ? event.code : String(event.code ?? ''));
          applySelectionVisuals(editor, selectionSnapshotRef.current, { reveal: false });
        } catch {
          // Ignore malformed code frame.
        }
      }
      return;
    }
    if (event.type === THEORY_RECORDING_EVENT_SELECTION) {
      applySelectionVisuals(editor, event.selections, { reveal: true });
      return;
    }
    if (event.type === THEORY_RECORDING_EVENT_BOARD) {
      const action = String(event.action || '').trim();
      if (action === 'display_mode') {
        setBoardDisplayMode(normalizeBoardDisplayModeForPlayer(event.mode));
        return;
      }
      if (action === 'clear') {
        setBoardStrokes([]);
        setBoardImages([]);
        return;
      }
      if (action === 'snapshot') {
        const nextStrokes = (Array.isArray(event.strokes) ? event.strokes : [])
          .map((stroke) => normalizeBoardStrokeForPlayer(stroke))
          .filter(Boolean)
          .slice(-THEORY_PLAYER_BOARD_MAX_STROKES);
        const nextImages = (Array.isArray(event.images) ? event.images : [])
          .map((image) => normalizeBoardImageForPlayer(image))
          .filter(Boolean)
          .slice(-THEORY_PLAYER_BOARD_MAX_IMAGES);
        setBoardStrokes(nextStrokes);
        setBoardImages(nextImages);
        return;
      }
      if (action === 'image') {
        const image = normalizeBoardImageForPlayer(event.image);
        if (!image) return;
        setBoardImages((prev) => {
          const next = [...(Array.isArray(prev) ? prev : [])];
          upsertBoardImageById(next, image);
          if (next.length > THEORY_PLAYER_BOARD_MAX_IMAGES) {
            next.splice(0, next.length - THEORY_PLAYER_BOARD_MAX_IMAGES);
          }
          return next;
        });
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
  }, [applySelectionVisuals]);

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
    setBoardImages([]);
    setBoardDisplayMode(THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI);
    applySelectionVisuals(editor, [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }], { reveal: false });
    const events = normalized.events || [];
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.t > targetMs) break;
      applyEvent(event);
      lastAppliedIndexRef.current = index;
    }
    lastAppliedMsRef.current = targetMs;
    setCurrentMs(targetMs);
  }, [applyEvent, applySelectionVisuals, normalized]);

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

  const seekAudioToPlaybackMs = useCallback(async (valueMs, options = {}) => {
    const audio = audioRef.current;
    const targetSegment = resolveSegmentAtPlaybackMs(valueMs);
    if (!audio || !targetSegment) return false;
    const shouldAutoplay = options.autoplay === true;
    pendingSeekPlaybackMsRef.current = targetSegment.globalMs;
    autoplayAfterSegmentLoadRef.current = shouldAutoplay;
    if (activeAudioSegmentIndexRef.current !== targetSegment.index) {
      suppressPausePersistRef.current = !audio.paused && !audio.ended;
      stopFrameLoop();
      try {
        audio.pause();
      } catch {
        // Ignore pause errors while switching segments.
      }
      setActiveAudioSegmentIndex(targetSegment.index);
      return true;
    }
    try {
      audio.currentTime = targetSegment.localMs / 1000;
    } catch {
      // Ignore seek failures while metadata is being resolved.
    }
    const nextTimelineMs = mapPlaybackMsToTimelineMs(targetSegment.globalMs, totalAudioDurationMs);
    syncTo(nextTimelineMs);
    persistProgressMs(targetSegment.globalMs, { force: true });
    if (shouldAutoplay) {
      try {
        await audio.play();
      } catch {
        setMediaStatus('error');
        setMediaError('Не удалось запустить воспроизведение. Нажмите «Повторить» или проверьте настройки браузера.');
        return false;
      }
    }
    return true;
  }, [
    mapPlaybackMsToTimelineMs,
    persistProgressMs,
    resolveSegmentAtPlaybackMs,
    stopFrameLoop,
    syncTo,
    totalAudioDurationMs,
  ]);

  const runFrameLoop = useCallback(function frameLoop() {
    const audio = audioRef.current;
    if (!audio || audio.paused || audio.ended) {
      stopFrameLoop();
      return;
    }
    const activeSegment = audioSegmentRanges[activeAudioSegmentIndexRef.current] || null;
    const nextPlaybackMs = (activeSegment?.startMs || 0) + ((Number(audio.currentTime) || 0) * 1000);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if ((now - lastFrameSyncAtRef.current) >= 80) {
      lastFrameSyncAtRef.current = now;
      syncTo(mapPlaybackMsToTimelineMs(nextPlaybackMs, totalAudioDurationMs));
    }
    rafRef.current = requestAnimationFrame(frameLoop);
  }, [audioSegmentRanges, mapPlaybackMsToTimelineMs, stopFrameLoop, syncTo, totalAudioDurationMs]);

  const recordingResetKey = useMemo(() => (
    [
      String(normalized?.updatedAt || ''),
      String(normalized?.createdAt || ''),
      String(audioSegments.map((segment) => `${segment.url}|${segment.storageName}|${segment.durationMs}`).join('||')),
      String(normalized?.durationMs || 0),
      String(Number(normalized?.events?.length || 0)),
      String(normalized?.initialCode || ''),
    ].join('|')
  ), [
    audioSegments,
    normalized?.updatedAt,
    normalized?.createdAt,
    normalized?.durationMs,
    normalized?.events?.length,
    normalized?.initialCode,
  ]);
  const hasNormalizedRecording = Boolean(normalized);
  const normalizedInitialCode = String(normalized?.initialCode || '');

  const clearControlsHideTimer = useCallback(() => {
    if (!controlsHideTimerRef.current) return;
    clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = null;
  }, []);

  const revealControls = useCallback((options = {}) => {
    clearControlsHideTimer();
    setControlsVisible(true);
    const shouldAutoHide = options.forceAutoHide === true || isPlaying;
    if (options.keepVisible || !shouldAutoHide) return;
    controlsHideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      controlsHideTimerRef.current = null;
    }, supportsHover ? 2100 : 3000);
  }, [clearControlsHideTimer, isPlaying, supportsHover]);

  useEffect(() => () => stopFrameLoop(), [stopFrameLoop]);

  useEffect(() => () => clearControlsHideTimer(), [clearControlsHideTimer]);

  useEffect(() => () => {
    if (touchSeekFeedbackTimerRef.current) {
      clearTimeout(touchSeekFeedbackTimerRef.current);
      touchSeekFeedbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isPlaying || (hasPlayerFocus && isKeyboardMode) || isSettingsOpen) {
      clearControlsHideTimer();
      setControlsVisible(true);
      return;
    }
    revealControls();
  }, [clearControlsHideTimer, hasPlayerFocus, isKeyboardMode, isPlaying, isSettingsOpen, revealControls]);

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
      selectionSnapshotRef.current = [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }];
      boardImageCacheRef.current = new Map();
      resumePositionMsRef.current = 0;
      setCurrentMs(0);
      setDurationMs(0);
      setIsPlaying(false);
      setPlaybackRate(1);
      setHasPlaybackStarted(false);
      setControlsVisible(true);
      setIsSettingsOpen(false);
      setMediaStatus('loading');
      setMediaError('');
      setBufferedPercent(0);
      setBoardImages([]);
      setActiveAudioSegmentIndex(0);
      return;
    }
    const storedMs = readPersistedProgressMs();
    const maxResumableMs = Math.max(0, totalAudioDurationMs - 1200);
    const resumeMs = Math.max(0, Math.min(storedMs, maxResumableMs));
    const resumeTimelineMs = mapDurationPositionMs(resumeMs, totalAudioDurationMs, timelineDurationMs);
    const resumeSegment = resolveSegmentAtPlaybackMs(resumeMs);
    selectionSnapshotRef.current = [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }];
    boardImageCacheRef.current = new Map();
    resumePositionMsRef.current = resumeMs;
    pendingSeekPlaybackMsRef.current = resumeMs;
    autoplayAfterSegmentLoadRef.current = false;
    setCurrentMs(resumeTimelineMs);
    setDurationMs(totalAudioDurationMs);
    setIsPlaying(false);
    setPlaybackRate(1);
    setHasPlaybackStarted(false);
    setControlsVisible(true);
    setIsSettingsOpen(false);
    setMediaStatus('loading');
    setMediaError('');
    setBufferedPercent(0);
    setIsFullscreen(false);
    setRunOutputFrame(null);
    setBoardStrokes([]);
    setBoardImages([]);
    setActiveAudioSegmentIndex(resumeSegment?.index || 0);
    lastAppliedIndexRef.current = -1;
    lastAppliedMsRef.current = 0;
    lastPersistMetaRef.current = { ms: -1, ts: 0 };
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (resumeSegment && activeAudioSegmentIndexRef.current === resumeSegment.index) {
        try {
          audio.currentTime = resumeSegment.localMs / 1000;
        } catch {
          // Ignore seek failures while metadata is being resolved.
        }
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
    resolveSegmentAtPlaybackMs,
    timelineDurationMs,
    totalAudioDurationMs,
  ]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (!audio) return;
    const activeSegment = audioSegmentRanges[activeAudioSegmentIndexRef.current] || null;
    const currentPlaybackMs = Math.max(
      0,
      Math.round((activeSegment?.startMs || 0) + ((Number(audio.currentTime) || 0) * 1000))
    );
    const nearEndThresholdMs = Math.max(0, totalAudioDurationMs - 1200);
    if (audio.ended || (totalAudioDurationMs > 0 && currentPlaybackMs >= nearEndThresholdMs)) {
      clearPersistedProgress();
      return;
    }
    persistProgressMs(currentPlaybackMs, { force: true });
  }, [audioSegmentRanges, clearPersistedProgress, persistProgressMs, totalAudioDurationMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
    audio.playbackRate = playbackRate;
  }, [isMuted, playbackRate, volume]);

  const handleEditorBeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco;
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
    const resumeMs = Math.max(
      0,
      Math.round(Number(lastAppliedMsRef.current || currentMs || 0))
    );
    if (resumeMs > 0) {
      rebuildTo(resumeMs);
      return;
    }
    applySelectionVisuals(editor, selectionSnapshotRef.current, { reveal: false });
    resetCursorToStart(editor);
  }, [applySelectionVisuals, currentMs, normalized, rebuildTo, resetCursorToStart]);

  const drawBoardImage = useCallback((ctx, image, width, height) => {
    if (!ctx || !image || !image.src) return;
    const cache = boardImageCacheRef.current;
    const safeSrc = String(image.src || '').trim();
    if (!safeSrc) return;
    let entry = cache.get(safeSrc);
    if (!entry && typeof Image !== 'undefined') {
      const element = new Image();
      entry = { image: element, status: 'loading' };
      cache.set(safeSrc, entry);
      element.onload = () => {
        entry.status = 'loaded';
        renderBoardCanvasRef.current?.();
      };
      element.onerror = () => {
        entry.status = 'error';
        renderBoardCanvasRef.current?.();
      };
      element.decoding = 'async';
      element.src = safeSrc;
    }
    const naturalWidth = Number(entry?.image?.naturalWidth || entry?.image?.width || 0);
    const naturalHeight = Number(entry?.image?.naturalHeight || entry?.image?.height || 0);
    const naturalAspectRatio = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 0;
    const storedAspectRatio = Number(image.aspectRatio || 0);
    const effectiveAspectRatio = naturalAspectRatio > 0
      ? clampBoardImageAspectRatioForPlayer(naturalAspectRatio)
      : storedAspectRatio > 0
        ? clampBoardImageAspectRatioForPlayer(storedAspectRatio)
        : 0;
    const { x, y, drawWidth, drawHeight, boxWidth, boxHeight } = resolveBoardImageDrawRectForPlayer(
      image,
      width,
      height,
      effectiveAspectRatio
    );
    if (!entry || entry.status !== 'loaded' || !entry.image) {
      ctx.save();
      ctx.fillStyle = 'rgba(15,23,42,0.78)';
      ctx.strokeStyle = 'rgba(148,163,184,0.42)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, boxWidth, boxHeight);
      ctx.strokeRect(x + 0.75, y + 0.75, Math.max(0, boxWidth - 1.5), Math.max(0, boxHeight - 1.5));
      ctx.fillStyle = 'rgba(226,232,240,0.8)';
      ctx.font = '12px sans-serif';
      ctx.fillText('Картинка...', x + 10, y + 22);
      ctx.restore();
      return;
    }
    try {
      ctx.drawImage(entry.image, x, y, drawWidth, drawHeight);
    } catch {
      // no-op
    }
  }, []);

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

  const renderBoardCanvas = useCallback(() => {
    const canvas = boardCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 1));
    const height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 1));
    const dpr = typeof window !== 'undefined'
      ? Math.max(1, Number(window.devicePixelRatio) || 1)
      : 1;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = THEORY_PLAYER_BOARD_BG;
    ctx.fillRect(0, 0, width, height);
    boardImages.forEach((image) => drawBoardImage(ctx, image, width, height));
    boardStrokes.forEach((stroke) => drawBoardStroke(ctx, stroke, width, height));
  }, [boardImages, boardStrokes, drawBoardImage, drawBoardStroke]);

  useEffect(() => {
    renderBoardCanvasRef.current = renderBoardCanvas;
  }, [renderBoardCanvas]);

  const hasRunOutputFrame = Boolean(
    runOutputFrame
    && (runOutputFrame.input || runOutputFrame.output || runOutputFrame.error)
  );
  const hasBoardTimeline = useMemo(
    () => Array.isArray(normalized?.events) && normalized.events.some((event) => (
      event?.type === THEORY_RECORDING_EVENT_BOARD
      && String(event?.action || '').trim() !== 'display_mode'
    )),
    [normalized?.events]
  );
  const isBoardFocused = boardDisplayMode === THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS;
  const shouldShowBoard = isBoardFocused || hasBoardTimeline || boardStrokes.length > 0 || boardImages.length > 0;
  const showBoardSidebar = shouldShowBoard && !isBoardFocused;
  const timelineMarkers = useMemo(() => {
    const events = Array.isArray(normalized?.events) ? normalized.events : [];
    if (timelineDurationMs <= 0) return [];
    const markers = [];
    events.forEach((event) => {
      const isRun = event?.type === THEORY_RECORDING_EVENT_RUN_OUTPUT;
      const isBoard = event?.type === THEORY_RECORDING_EVENT_BOARD
        && String(event?.action || '').trim() !== 'display_mode';
      if (!isRun && !isBoard) return;
      const percent = Math.max(0, Math.min(100, ((Number(event?.t) || 0) / timelineDurationMs) * 100));
      const previous = markers[markers.length - 1];
      if (previous && Math.abs(previous.percent - percent) < 1.2) return;
      markers.push({
        id: `${String(event?.type || 'event')}-${Math.round(Number(event?.t) || 0)}-${markers.length}`,
        percent,
        label: isRun ? 'Запуск кода' : 'Доска',
        kind: isRun ? 'run' : 'board',
      });
    });
    return markers.slice(0, 48);
  }, [normalized?.events, timelineDurationMs]);

  useEffect(() => {
    renderBoardCanvas();
  }, [boardDisplayMode, isFullscreen, renderBoardCanvas, shouldShowBoard]);

  useEffect(() => {
    const canvas = boardCanvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      renderBoardCanvas();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [boardDisplayMode, isFullscreen, renderBoardCanvas, shouldShowBoard]);

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
  const visibleBufferedPercent = Math.max(playbackProgressPercent, Math.min(100, bufferedPercent));
  const seekTrackStyle = useMemo(() => ({
    background: `linear-gradient(90deg, #ef4444 0%, #ef4444 ${playbackProgressPercent}%, rgba(203,213,225,0.58) ${playbackProgressPercent}%, rgba(203,213,225,0.58) ${visibleBufferedPercent}%, rgba(71,85,105,0.62) ${visibleBufferedPercent}%, rgba(71,85,105,0.62) 100%)`,
  }), [playbackProgressPercent, visibleBufferedPercent]);
  const volumeTrackStyle = useMemo(() => ({
    background: `linear-gradient(90deg, rgba(226,232,240,0.94) 0%, rgba(226,232,240,0.94) ${volumeProgressPercent}%, rgba(148,163,184,0.3) ${volumeProgressPercent}%, rgba(148,163,184,0.3) 100%)`,
  }), [volumeProgressPercent]);
  const centerButtonVisibilityClass = !hasPlaybackStarted
    ? 'opacity-100 scale-100 pointer-events-auto'
    : (isPlaying
        ? 'opacity-0 scale-90 pointer-events-none'
        : (controlsVisible ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'));
  const shouldShowControls = controlsVisible || !isPlaying || (hasPlayerFocus && isKeyboardMode) || isSettingsOpen;
  const timelineControlsVisibilityClass = shouldShowControls
    ? 'opacity-100 translate-y-0'
    : 'opacity-0 translate-y-3 pointer-events-none';
  const topLabelVisibilityClass = shouldShowControls
    ? 'opacity-100 translate-y-0'
    : 'opacity-0 -translate-y-1';
  const centerPlaybackToneClass = isPlaying
    ? 'bg-slate-900/78 text-white shadow-[0_14px_32px_rgba(2,6,23,0.62)]'
    : 'bg-gradient-to-br from-sky-500/40 via-indigo-500/34 to-violet-500/28 text-white shadow-[0_14px_30px_rgba(37,99,235,0.32)]';
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
  const boardCanvasHeightClass = isFullscreen ? 'h-[220px]' : (compact ? 'h-[108px]' : 'h-[132px]');
  const boardFocusOverlayClass = isFullscreen
    ? 'pointer-events-none absolute inset-0 z-10 p-5'
    : 'pointer-events-none absolute inset-0 z-10 p-2.5';
  const boardFocusCardClass = isFullscreen
    ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-slate-700/80 bg-[#050d1f]/98 shadow-[0_18px_40px_rgba(2,6,23,0.56)]'
    : 'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-[#050d1f]/98 shadow-[0_14px_32px_rgba(2,6,23,0.5)]';
  const editorViewportClass = isFullscreen
    ? [
        'pointer-events-auto relative h-full px-5 pt-5',
        hasRunOutputFrame ? 'pb-[22rem]' : 'pb-28',
        showBoardSidebar ? 'md:pr-[calc(min(44vw,640px)+2.25rem)]' : '',
      ].filter(Boolean).join(' ')
    : 'pointer-events-auto relative h-full min-h-0 min-w-0 overflow-hidden rounded-xl border border-slate-800/80 bg-[#020817]';
  const standardLayoutClass = !isFullscreen
    ? [
        compact
          ? `relative z-0 grid h-[min(460px,calc(100vh-18rem))] min-h-0 gap-2.5 overflow-hidden p-2.5 ${hasRunOutputFrame ? 'pb-20' : 'pb-14'}`
          : `relative z-0 grid h-[min(580px,calc(100vh-14rem))] min-h-0 gap-3 overflow-hidden p-3 ${hasRunOutputFrame ? 'pb-24' : 'pb-14'}`,
        hasRunOutputFrame ? 'grid-rows-[minmax(0,1fr)_auto]' : 'grid-rows-[minmax(0,1fr)]',
        showBoardSidebar ? (compact ? 'md:grid-cols-[minmax(0,1fr)_280px] md:items-stretch' : 'md:grid-cols-[minmax(0,1fr)_320px] md:items-stretch') : '',
      ].filter(Boolean).join(' ')
    : '';
  const standardRunOutputWrapperClass = !isFullscreen && showBoardSidebar ? 'min-h-0 md:col-span-2' : 'min-h-0';
  const playbackActionLabel = isPlaying ? 'Пауза' : 'Воспроизвести';
  const soundActionLabel = isMuted ? 'Включить звук' : 'Выключить звук';

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    revealControls();
    try {
      if (audio.paused || audio.ended) {
        const shouldReplayFromStart = audio.ended
          || clampedCurrentPlaybackMs >= Math.max(0, safePlaybackDurationMs - 250);
        setMediaError('');
        setMediaStatus('loading');
        await seekAudioToPlaybackMs(shouldReplayFromStart ? 0 : clampedCurrentPlaybackMs, { autoplay: true });
        return;
      }
      audio.pause();
    } catch {
      setMediaStatus('error');
      setMediaError('Не удалось запустить воспроизведение. Попробуйте ещё раз.');
    }
  }, [clampedCurrentPlaybackMs, revealControls, safePlaybackDurationMs, seekAudioToPlaybackMs]);

  const handleSeek = useCallback((event) => {
    const nextPlaybackMs = Math.max(0, Math.round(Number(event.target?.value) || 0));
    revealControls();
    seekAudioToPlaybackMs(nextPlaybackMs, { autoplay: isPlaying });
  }, [isPlaying, revealControls, seekAudioToPlaybackMs]);

  const seekBySeconds = useCallback((seconds) => {
    const deltaMs = Math.round((Number(seconds) || 0) * 1000);
    const nextPlaybackMs = Math.max(0, Math.min(safePlaybackDurationMs, clampedCurrentPlaybackMs + deltaMs));
    revealControls();
    seekAudioToPlaybackMs(nextPlaybackMs, { autoplay: isPlaying });
  }, [clampedCurrentPlaybackMs, isPlaying, revealControls, safePlaybackDurationMs, seekAudioToPlaybackMs]);

  const handleTouchSurfaceTap = useCallback((event) => {
    if (event.pointerType !== 'touch') return;
    if (event.target?.closest?.('button, input, select, a, .theory-player-settings')) return;
    const rect = event.currentTarget?.getBoundingClientRect?.();
    if (!rect?.width) return;
    const side = event.clientX < (rect.left + (rect.width / 2)) ? 'left' : 'right';
    const now = Date.now();
    const previousTap = lastTouchTapRef.current;
    lastTouchTapRef.current = { at: now, side };
    if (previousTap.side !== side || (now - previousTap.at) > 340) {
      revealControls();
      return;
    }
    lastTouchTapRef.current = { at: 0, side: '' };
    const seconds = side === 'left' ? -10 : 10;
    seekBySeconds(seconds);
    setTouchSeekFeedback({ side, seconds, key: now });
    if (touchSeekFeedbackTimerRef.current) clearTimeout(touchSeekFeedbackTimerRef.current);
    touchSeekFeedbackTimerRef.current = setTimeout(() => {
      setTouchSeekFeedback(null);
      touchSeekFeedbackTimerRef.current = null;
    }, 780);
  }, [revealControls, seekBySeconds]);

  const handleSeekPointerMove = useCallback((event) => {
    const rect = event.currentTarget?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setSeekPreview({
      percent: ratio * 100,
      ms: Math.round(safePlaybackDurationMs * ratio),
    });
  }, [safePlaybackDurationMs]);

  const handleToggleMute = useCallback(() => {
    revealControls({ keepVisible: true });
    setIsMuted((prev) => !prev);
  }, [revealControls]);

  const handleVolumeChange = useCallback((event) => {
    const nextVolume = Math.max(0, Math.min(1, Number(event.target?.value) || 0));
    revealControls({ keepVisible: true });
    setVolume(nextVolume);
    setIsMuted(nextVolume <= 0);
  }, [revealControls]);

  const handleRetryPlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setMediaError('');
    setMediaStatus('loading');
    try {
      audio.load();
      await seekAudioToPlaybackMs(clampedCurrentPlaybackMs, { autoplay: true });
    } catch {
      setMediaStatus('error');
      setMediaError('Видео пока не загрузилось. Проверьте соединение и повторите попытку.');
    }
  }, [clampedCurrentPlaybackMs, seekAudioToPlaybackMs]);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const playerElement = playerContainerRef.current;
    if (!playerElement) return;
    revealControls({ keepVisible: true });
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
      setMediaError('Полноэкранный режим недоступен в этом браузере.');
    }
  }, [revealControls]);

  const handlePlayerKeyDown = useCallback((event) => {
    const key = String(event.key || '').toLowerCase();
    if (key === 'escape' && isSettingsOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsSettingsOpen(false);
      revealControls({ keepVisible: true });
      return;
    }
    const target = event.target;
    const targetTag = String(target?.tagName || '').toLowerCase();
    if (
      targetTag === 'input'
      || targetTag === 'select'
      || targetTag === 'textarea'
      || targetTag === 'button'
      || target?.isContentEditable
      || target?.closest?.('.monaco-editor')
    ) {
      return;
    }
    if (key === ' ' || key === 'k') {
      event.preventDefault();
      void togglePlayback();
      return;
    }
    if (key === 'arrowleft') {
      event.preventDefault();
      seekBySeconds(-5);
      return;
    }
    if (key === 'arrowright') {
      event.preventDefault();
      seekBySeconds(5);
      return;
    }
    if (key === 'j') {
      event.preventDefault();
      seekBySeconds(-10);
      return;
    }
    if (key === 'l') {
      event.preventDefault();
      seekBySeconds(10);
      return;
    }
    if (key === 'm') {
      event.preventDefault();
      handleToggleMute();
      return;
    }
    if (key === 'f') {
      event.preventDefault();
      void toggleFullscreen();
      return;
    }
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      const ratio = Number(key) / 10;
      seekAudioToPlaybackMs(Math.round(safePlaybackDurationMs * ratio), { autoplay: isPlaying });
    }
  }, [handleToggleMute, isPlaying, isSettingsOpen, revealControls, safePlaybackDurationMs, seekAudioToPlaybackMs, seekBySeconds, toggleFullscreen, togglePlayback]);

  const fullscreenActionLabel = isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть полноэкранный режим';
  const editorHeight = '100%';
  const currentAudioSegment = audioSegmentRanges[activeAudioSegmentIndex] || audioSegmentRanges[0] || null;
  const hasPlayableAudio = Boolean(currentAudioSegment?.url);
  const playerEditorOptions = useMemo(() => ({
    ...PLAYER_EDITOR_OPTIONS,
    fontSize: isFullscreen ? 30 : (compact ? 18 : PLAYER_EDITOR_OPTIONS.fontSize),
    padding: isFullscreen
      ? {
          top: 24,
          bottom: hasRunOutputFrame ? 40 : PLAYER_EDITOR_OPTIONS.padding.bottom,
        }
      : (compact ? { top: 14, bottom: 18 } : PLAYER_EDITOR_OPTIONS.padding),
  }), [compact, hasRunOutputFrame, isFullscreen]);

  if (!normalized || !hasPlayableAudio || normalized.events.length === 0) {
    return (
      <div
        className={`theory-recording-empty mt-3 overflow-hidden rounded-2xl px-4 py-4 text-xs ${className}`}
      >
        {FALLBACK_EMPTY_STATE_TEXT}
      </div>
    );
  }

  return (
    <div className={`mt-3 ${className}`}>
      <div
        ref={playerContainerRef}
        className={`theory-recording-player group relative overflow-hidden bg-gradient-to-br from-[#06122d] via-[#050d1f] to-[#030816] p-[2px] shadow-[0_22px_46px_rgba(15,23,42,0.42)] focus:outline-none ${isStudyExperience ? 'theory-recording-player--study' : ''} ${isFullscreen ? 'h-full w-full rounded-none' : 'rounded-[1.4rem]'}`}
        data-controls-visible={shouldShowControls ? 'true' : 'false'}
        data-theory-player="true"
        tabIndex={0}
        role="region"
        aria-label={title ? `Видеоразбор: ${title}` : 'Видеоразбор задачи'}
        onKeyDown={(event) => {
          setIsKeyboardMode(true);
          handlePlayerKeyDown(event);
        }}
        onPointerMove={() => revealControls()}
        onPointerDown={(event) => {
          setIsKeyboardMode(false);
          revealControls();
          if (!event.target?.closest?.('.theory-player-settings, .theory-player-settings-trigger')) {
            setIsSettingsOpen(false);
          }
        }}
        onPointerUp={handleTouchSurfaceTap}
        onMouseEnter={() => revealControls()}
        onFocusCapture={(event) => {
          const keyboardFocus = Boolean(event.target?.matches?.(':focus-visible'));
          setIsKeyboardMode(keyboardFocus);
          setHasPlayerFocus(true);
          revealControls({ keepVisible: keyboardFocus });
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHasPlayerFocus(false);
            setIsSettingsOpen(false);
          }
        }}
        onDoubleClick={(event) => {
          if (!supportsHover) return;
          if (event.target?.closest?.('button, input, select, a')) return;
          void toggleFullscreen();
        }}
      >
        <div className="pointer-events-none absolute -left-14 -top-16 h-44 w-44 rounded-full bg-sky-400/14 blur-3xl" />

        <div className={`relative overflow-hidden bg-[#030817] ${isFullscreen ? 'h-full rounded-none' : 'rounded-[1.1rem]'}`}>
          <audio
            ref={audioRef}
            className="sr-only"
            preload="metadata"
            src={currentAudioSegment?.url || ''}
            onPlay={() => {
              setIsPlaying(true);
              setHasPlaybackStarted(true);
              setMediaStatus('ready');
              setMediaError('');
              revealControls({ forceAutoHide: true });
              stopFrameLoop();
              rafRef.current = requestAnimationFrame(runFrameLoop);
            }}
            onPause={(event) => {
              if (suppressPausePersistRef.current) {
                suppressPausePersistRef.current = false;
                stopFrameLoop();
                return;
              }
              setIsPlaying(false);
              setMediaStatus('ready');
              revealControls({ keepVisible: true });
              stopFrameLoop();
              const currentPlaybackMs = Math.max(
                0,
                Math.round((currentAudioSegment?.startMs || 0) + ((Number(event.currentTarget?.currentTime) || 0) * 1000))
              );
              const nearEndThresholdMs = Math.max(0, totalAudioDurationMs - 1200);
              if (event.currentTarget?.ended || (totalAudioDurationMs > 0 && currentPlaybackMs >= nearEndThresholdMs)) {
                clearPersistedProgress();
                return;
              }
              persistProgressMs(currentPlaybackMs, { force: true });
            }}
            onEnded={() => {
              const nextSegment = audioSegmentRanges[activeAudioSegmentIndexRef.current + 1] || null;
              if (nextSegment) {
                pendingSeekPlaybackMsRef.current = nextSegment.startMs;
                autoplayAfterSegmentLoadRef.current = true;
                suppressPausePersistRef.current = false;
                setActiveAudioSegmentIndex(nextSegment.index);
                return;
              }
              setIsPlaying(false);
              stopFrameLoop();
              syncTo(safeTimelineDurationMs);
              clearPersistedProgress();
            }}
            onTimeUpdate={(event) => {
              const nextPlaybackMs = (currentAudioSegment?.startMs || 0) + ((Number(event.currentTarget?.currentTime) || 0) * 1000);
              syncTo(mapPlaybackMsToTimelineMs(nextPlaybackMs, totalAudioDurationMs));
              persistProgressMs(nextPlaybackMs);
            }}
            onSeeked={(event) => {
              const nextPlaybackMs = (currentAudioSegment?.startMs || 0) + ((Number(event.currentTarget?.currentTime) || 0) * 1000);
              syncTo(mapPlaybackMsToTimelineMs(nextPlaybackMs, totalAudioDurationMs));
              persistProgressMs(nextPlaybackMs, { force: true });
            }}
            onLoadedMetadata={(event) => {
              setDurationMs(totalAudioDurationMs);
              setMediaStatus('ready');
              setMediaError('');
              const requestedPlaybackMs = pendingSeekPlaybackMsRef.current ?? Math.max(0, Math.round(resumePositionMsRef.current || 0));
              const targetSegment = resolveSegmentAtPlaybackMs(requestedPlaybackMs);
              if (!targetSegment) return;
              try {
                event.currentTarget.currentTime = targetSegment.localMs / 1000;
              } catch {
                // Ignore seek failures while metadata is being resolved.
              }
              const targetTimelineMs = mapPlaybackMsToTimelineMs(targetSegment.globalMs, totalAudioDurationMs);
              syncTo(targetTimelineMs);
              setCurrentMs(targetTimelineMs);
              pendingSeekPlaybackMsRef.current = null;
              if (autoplayAfterSegmentLoadRef.current) {
                autoplayAfterSegmentLoadRef.current = false;
                event.currentTarget.play().catch(() => {
                  setMediaStatus('error');
                  setMediaError('Не удалось запустить воспроизведение. Нажмите «Повторить» или проверьте настройки браузера.');
                });
                return;
              }
              autoplayAfterSegmentLoadRef.current = false;
            }}
            onLoadStart={() => setMediaStatus('loading')}
            onWaiting={() => setMediaStatus('loading')}
            onCanPlay={() => {
              setMediaStatus('ready');
              setMediaError('');
            }}
            onPlaying={() => {
              setMediaStatus('ready');
              setMediaError('');
            }}
            onProgress={(event) => {
              const audio = event.currentTarget;
              if (!audio?.buffered?.length || totalAudioDurationMs <= 0) return;
              const localBufferedMs = Math.max(0, Number(audio.buffered.end(audio.buffered.length - 1)) || 0) * 1000;
              const globalBufferedMs = Math.min(
                totalAudioDurationMs,
                (currentAudioSegment?.startMs || 0) + localBufferedMs
              );
              setBufferedPercent(Math.max(0, Math.min(100, (globalBufferedMs / totalAudioDurationMs) * 100)));
            }}
            onError={() => {
              setIsPlaying(false);
              setMediaStatus('error');
              setMediaError('Не удалось загрузить звук видеоразбора.');
              revealControls({ keepVisible: true });
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
              {isBoardFocused && (
                <div className={boardFocusOverlayClass}>
                  <div className={boardFocusCardClass}>
                    <div className="flex items-center justify-between gap-3 border-b border-slate-700/70 px-4 py-3">
                      <div className={boardLabelClass}>Доска</div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200/90">На весь экран</div>
                    </div>
                    <div className="min-h-0 flex-1">
                      <canvas
                        ref={boardCanvasRef}
                        width={1280}
                        height={720}
                        className="h-full w-full"
                      />
                    </div>
                  </div>
                </div>
              )}
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
                {isBoardFocused && (
                  <div className={boardFocusOverlayClass}>
                    <div className={boardFocusCardClass}>
                      <div className="flex items-center justify-between gap-3 border-b border-slate-700/70 px-3 py-2.5">
                        <div className={boardLabelClass}>Доска</div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200/90">На весь экран</div>
                      </div>
                      <div className="min-h-0 flex-1">
                        <canvas
                          ref={boardCanvasRef}
                          width={1280}
                          height={720}
                          className="h-full w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {showBoardSidebar && (
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

          <div className={`theory-player-preview-mask pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${(!hasPlaybackStarted && isPrePlaybackState) ? 'opacity-100' : 'opacity-0'}`}>
            <div
              className={`theory-player-preview-dim absolute inset-0 transition-colors duration-300 ${
                isPrePlaybackState
                  ? (isStudyExperience ? 'bg-slate-950/52' : 'bg-slate-950/78')
                  : 'bg-slate-950/48'
              }`}
            />
            <div className="theory-player-preview-ambient absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(56,189,248,0.09),transparent_52%)]" />
            <div className="theory-player-preview-footer absolute inset-0 bg-gradient-to-b from-slate-950/8 via-transparent to-slate-950/82" />
          </div>

          {isFullscreen && (
            <div className={`theory-player-top-label pointer-events-none absolute left-4 right-4 top-3 z-20 flex items-start justify-between gap-3 text-slate-100 transition-all duration-200 ${topLabelVisibilityClass}`}>
              <div className="min-w-0 rounded-xl bg-slate-950/58 px-3 py-2 backdrop-blur-md">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/90">Видеоразбор</div>
                {title && <div className="mt-0.5 truncate text-sm font-semibold text-white">{title}</div>}
              </div>
              <span className="shrink-0 rounded-full bg-slate-950/58 px-3 py-1.5 text-[10px] font-bold text-slate-200 backdrop-blur-md">
                {formatRecordingDuration(safePlaybackDurationMs)}
              </span>
            </div>
          )}

          {mediaStatus === 'loading' && hasPlaybackStarted && !mediaError && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-[24] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur-md">
              <Loader2 size={28} className="animate-spin" />
            </div>
          )}

          {mediaStatus === 'error' && mediaError && (
            <div className="absolute left-1/2 top-1/2 z-[25] w-[min(92%,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-rose-400/30 bg-slate-950/92 p-4 text-center text-white shadow-2xl backdrop-blur-xl">
              <AlertTriangle size={24} className="mx-auto text-rose-300" />
              <div className="mt-2 text-sm font-semibold">{mediaError}</div>
              <button
                type="button"
                onClick={handleRetryPlayback}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold transition hover:bg-white/16"
              >
                <RotateCw size={14} />
                Повторить
              </button>
            </div>
          )}

          {touchSeekFeedback && (
            <div
              key={touchSeekFeedback.key}
              className={`theory-player-touch-feedback is-${touchSeekFeedback.side} is-visible`}
              aria-live="polite"
            >
              {touchSeekFeedback.seconds < 0 ? <RotateCcw size={24} /> : <RotateCw size={24} />}
              <span>{Math.abs(touchSeekFeedback.seconds)} секунд</span>
            </div>
          )}

          {!hasPlaybackStarted && clampedCurrentPlaybackMs > 1200 && !mediaError && (
            <div className="theory-player-resume-prompt absolute left-1/2 top-[calc(50%+52px)] z-20 -translate-x-1/2">
              <span>{`Продолжить с ${formatRecordingDuration(clampedCurrentPlaybackMs)}`}</span>
              <button
                type="button"
                className="theory-player-resume-reset"
                onClick={(event) => {
                  event.stopPropagation();
                  clearPersistedProgress();
                  void seekAudioToPlaybackMs(0, { autoplay: false });
                }}
              >
                Сначала
              </button>
            </div>
          )}

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

          {isFullscreen && showBoardSidebar && (
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

          <div className={`theory-player-controls absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#020617]/98 via-[#020617]/76 to-transparent px-3 pb-2.5 pt-16 transition-all duration-300 md:px-4 ${timelineControlsVisibilityClass}`}>
            <div
              className="theory-player-seek-shell relative mb-2 h-4"
              onPointerMove={handleSeekPointerMove}
              onPointerLeave={() => setSeekPreview(null)}
            >
              {timelineMarkers.map((marker) => (
                <span
                  key={marker.id}
                  className={`theory-player-marker theory-player-marker--${marker.kind}`}
                  style={{ left: `${marker.percent}%` }}
                  title={marker.label}
                />
              ))}
              {seekPreview && (
                <span
                  className="theory-player-seek-preview"
                  style={{ left: `${seekPreview.percent}%` }}
                >
                  {formatRecordingDuration(seekPreview.ms)}
                </span>
              )}
              <input
                type="range"
                min={0}
                max={safePlaybackDurationMs}
                step={100}
                value={clampedCurrentPlaybackMs}
                onChange={handleSeek}
                className="theory-player-seek absolute inset-x-0 top-1/2 h-1 w-full -translate-y-1/2 cursor-pointer appearance-none bg-transparent"
                style={seekTrackStyle}
                aria-label="Перемотка"
                aria-valuetext={`${formatRecordingDuration(clampedCurrentPlaybackMs)} из ${formatRecordingDuration(safePlaybackDurationMs)}`}
              />
            </div>

            <div className="flex min-w-0 items-center gap-1 text-white sm:gap-1.5">
              <button
                type="button"
                onClick={togglePlayback}
                className="theory-player-control-button"
                aria-label={playbackActionLabel}
                title={`${playbackActionLabel} (Пробел)`}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="translate-x-[1px]" />}
              </button>
              <button
                type="button"
                onClick={() => seekBySeconds(-10)}
                className="theory-player-control-button hidden sm:inline-flex"
                aria-label="Назад на 10 секунд"
                title="Назад на 10 секунд (J)"
              >
                <RotateCcw size={18} />
                <span className="theory-player-skip-label">10</span>
              </button>
              <button
                type="button"
                onClick={() => seekBySeconds(10)}
                className="theory-player-control-button hidden sm:inline-flex"
                aria-label="Вперёд на 10 секунд"
                title="Вперёд на 10 секунд (L)"
              >
                <RotateCw size={18} />
                <span className="theory-player-skip-label">10</span>
              </button>

              <div className="theory-player-volume group/volume flex items-center">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="theory-player-control-button"
                  aria-label={soundActionLabel}
                  title={`${soundActionLabel} (M)`}
                >
                  {isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
                </button>
                <div className="theory-player-volume-slider-wrap">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={normalizedVolume}
                    onChange={handleVolumeChange}
                    className="theory-player-volume-slider h-1 w-20 cursor-pointer appearance-none bg-transparent"
                    style={volumeTrackStyle}
                    aria-label="Громкость"
                  />
                </div>
              </div>

              <span className="ml-1 whitespace-nowrap text-[11px] font-semibold tabular-nums text-slate-100 sm:text-xs">
                {formatRecordingDuration(clampedCurrentPlaybackMs)}
                <span className="px-1 text-slate-400">/</span>
                {formatRecordingDuration(safePlaybackDurationMs)}
              </span>

              <div className="min-w-0 flex-1" />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen((prev) => !prev);
                    revealControls({ keepVisible: true });
                  }}
                  className={`theory-player-control-button theory-player-settings-trigger ${isSettingsOpen ? 'is-active' : ''}`}
                  aria-label="Настройки воспроизведения"
                  aria-expanded={isSettingsOpen}
                  title="Настройки"
                >
                  <Settings size={19} />
                </button>
                {isSettingsOpen && (
                  <div className="theory-player-settings" role="menu" aria-label="Скорость воспроизведения">
                    <div className="px-3 pb-2 pt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Скорость</div>
                    <div className="grid grid-cols-2 gap-1 px-2 pb-2">
                      {PLAYBACK_RATE_OPTIONS.map((rateOption) => (
                        <button
                          key={`playback-rate-${rateOption}`}
                          type="button"
                          onClick={() => {
                            setPlaybackRate(rateOption);
                            setIsSettingsOpen(false);
                            revealControls();
                          }}
                          className={`theory-player-rate-option ${playbackRate === rateOption ? 'is-active' : ''}`}
                          role="menuitemradio"
                          aria-checked={playbackRate === rateOption}
                        >
                          {rateOption === 1 ? 'Обычная' : `${rateOption}×`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="theory-player-control-button"
                aria-label={fullscreenActionLabel}
                title={`${fullscreenActionLabel} (F)`}
              >
                {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(TheoryRecordingPlayer, areTheoryPlayerPropsEqual);

