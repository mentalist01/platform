import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from './ui';
import TheoryRecordingPlayer from './TheoryRecordingPlayer';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import {
  formatRecordingDuration,
  getTheoryRecordingAudioSegments,
  normalizeTheoryRecording,
  THEORY_RECORDING_DRAFT_SNAPSHOT_VERSION,
  THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS,
  THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI,
  THEORY_RECORDING_EVENT_BOARD,
  THEORY_RECORDING_EVENT_CODE,
  THEORY_RECORDING_EVENT_RUN_OUTPUT,
  THEORY_RECORDING_EVENT_SELECTION,
  THEORY_RECORDING_MAX_EVENTS,
  THEORY_RECORDING_VERSION,
} from '../utils/theoryRecording';
import {
  deleteTheoryRecordingDraftSnapshot,
  isTheoryRecordingDraftStoreSupported,
  loadTheoryRecordingDraftSnapshot,
  saveTheoryRecordingDraftSnapshot,
} from '../utils/theoryRecordingDraftStore';

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
const RECORDING_EDITOR_FONT_SIZE_STORAGE_KEY = 'theory-recording-editor-font-size';
const RECORDING_EDITOR_FONT_SIZE_MIN = 12;
const RECORDING_EDITOR_FONT_SIZE_MAX = 24;
const RECORDING_EDITOR_FONT_SIZE_STEP = 1;
const RECORDING_AUTOSAVE_INTERVAL_MS = 3000;

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
const BOARD_MAX_IMAGES = 10;
const BOARD_IMAGE_MAX_DIMENSION_PX = 1600;
const BOARD_IMAGE_MAX_DATA_URL_CHARS = 1_350_000;
const BOARD_IMAGE_MAX_INPUT_BYTES = 16 * 1024 * 1024;
const BOARD_IMAGE_DEFAULT_MAX_WIDTH = 0.78;
const BOARD_IMAGE_DEFAULT_MAX_HEIGHT = 0.7;
const BOARD_IMAGE_STACK_STEP = 0.035;
const BOARD_ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const normalizeBoardDisplayMode = (value) => (
  String(value || '').trim() === THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS
    ? THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS
    : THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI
);

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

const clampRecordingEditorFontSize = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return RECORDING_EDITOR_OPTIONS.fontSize;
  return Math.max(
    RECORDING_EDITOR_FONT_SIZE_MIN,
    Math.min(
      RECORDING_EDITOR_FONT_SIZE_MAX,
      Math.round(num)
    )
  );
};

const getInitialRecordingEditorFontSize = () => {
  if (typeof window === 'undefined') return RECORDING_EDITOR_OPTIONS.fontSize;
  try {
    return clampRecordingEditorFontSize(
      window.localStorage.getItem(RECORDING_EDITOR_FONT_SIZE_STORAGE_KEY)
    );
  } catch {
    return RECORDING_EDITOR_OPTIONS.fontSize;
  }
};

const normalizeRecordingDraftStorageKey = (value) => String(value || '').trim();

const cloneTheoryRecordingEvents = (events) => (
  (Array.isArray(events) ? events : []).map((event) => ({
    ...event,
    stroke: event?.stroke
      ? {
          ...event.stroke,
          points: Array.isArray(event.stroke.points)
            ? event.stroke.points.map((point) => ({ ...point }))
            : [],
        }
      : undefined,
    strokes: Array.isArray(event?.strokes)
      ? event.strokes.map((stroke) => ({
          ...stroke,
          points: Array.isArray(stroke.points)
            ? stroke.points.map((point) => ({ ...point }))
            : [],
        }))
      : undefined,
    image: event?.image
      ? { ...event.image }
      : undefined,
    images: Array.isArray(event?.images)
      ? event.images.map((image) => ({ ...image }))
      : undefined,
    selections: Array.isArray(event?.selections)
      ? event.selections.map((selection) => ({ ...selection }))
      : undefined,
  }))
);

const cloneTheoryRecordingAudioSegments = (segments) => (
  (Array.isArray(segments) ? segments : [])
    .map((segment) => {
      if (!segment || typeof segment !== 'object') return null;
      const hasFile = typeof File !== 'undefined' && segment.file instanceof File;
      return {
        url: String(segment.url || ''),
        storageName: String(segment.storageName || ''),
        name: String(segment.name || ''),
        sizeBytes: Math.max(0, Number(segment.sizeBytes) || 0),
        durationMs: Math.max(0, Number(segment.durationMs) || 0),
        isNew: Boolean(segment.isNew || hasFile),
        file: hasFile ? segment.file : null,
      };
    })
    .filter(Boolean)
);

const createRecordingAudioPayload = (segments) => ({
  segments: cloneTheoryRecordingAudioSegments(segments),
});

const buildRecordingFromParts = (recording, segments) => {
  const normalizedRecording = normalizeTheoryRecording(recording);
  if (!normalizedRecording) return null;
  return {
    ...normalizedRecording,
    events: cloneTheoryRecordingEvents(normalizedRecording.events),
    audio: createRecordingAudioPayload(segments),
  };
};

const deriveLatestCodeFromRecording = (recording, fallbackCode = '') => {
  let nextCode = String(recording?.initialCode || fallbackCode || '');
  (Array.isArray(recording?.events) ? recording.events : []).forEach((event) => {
    if (event?.type === THEORY_RECORDING_EVENT_CODE) {
      nextCode = String(event.code || '');
    }
  });
  return nextCode;
};

const deriveLatestSelectionSignatureFromRecording = (recording) => {
  let latestSelections = [];
  (Array.isArray(recording?.events) ? recording.events : []).forEach((event) => {
    if (event?.type === THEORY_RECORDING_EVENT_SELECTION) {
      latestSelections = normalizeSelectionListForEvent(event.selections);
    }
  });
  return selectionSignature(latestSelections);
};

const deriveLatestRunOutputFrameFromRecording = (recording) => {
  let nextFrame = { input: '', output: '', error: '' };
  (Array.isArray(recording?.events) ? recording.events : []).forEach((event) => {
    if (event?.type === THEORY_RECORDING_EVENT_RUN_OUTPUT) {
      nextFrame = {
        input: String(event.input ?? ''),
        output: String(event.output ?? ''),
        error: String(event.error ?? ''),
      };
    }
  });
  return nextFrame;
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

const clampBoardImageSize = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.32;
  return Math.max(0.04, Math.min(1, Number(num.toFixed(4))));
};

const clampBoardImageAspectRatio = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(0.05, Math.min(20, Number(num.toFixed(4))));
};

const normalizeBoardImageSource = (value) => {
  const source = String(value || '').trim();
  if (!source) return '';
  return source.slice(0, BOARD_IMAGE_MAX_DATA_URL_CHARS);
};

const normalizeBoardImageForEvent = (image) => {
  if (!image || typeof image !== 'object') return null;
  const src = normalizeBoardImageSource(image.src);
  if (!src) return null;
  return {
    id: String(image.id || '').trim().slice(0, 64) || `image-${Date.now()}`,
    src,
    x: clampBoardUnit(image.x),
    y: clampBoardUnit(image.y),
    width: clampBoardImageSize(image.width),
    height: clampBoardImageSize(image.height),
    aspectRatio: clampBoardImageAspectRatio(image.aspectRatio),
  };
};

const normalizeBoardImagesForEvent = (images) => (
  (Array.isArray(images) ? images : [])
    .map((image) => normalizeBoardImageForEvent(image))
    .filter(Boolean)
    .slice(0, BOARD_MAX_IMAGES)
);

const resolveBoardImageDrawRect = (image, canvasWidth, canvasHeight, aspectRatio) => {
  const boxWidth = Math.max(12, Math.min(canvasWidth, Number(image?.width || 0.3) * canvasWidth));
  const boxHeight = Math.max(12, Math.min(canvasHeight, Number(image?.height || 0.3) * canvasHeight));
  const safeAspectRatio = Number(aspectRatio) > 0 ? clampBoardImageAspectRatio(aspectRatio) : 0;
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

const buildBoardImagesFromEvents = (events) => {
  const next = [];
  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!event || event.type !== THEORY_RECORDING_EVENT_BOARD) return;
    if (event.action === 'clear') {
      next.length = 0;
      return;
    }
    if (event.action === 'snapshot') {
      const snapshot = normalizeBoardImagesForEvent(event.images);
      next.length = 0;
      snapshot.forEach((image) => next.push(image));
      return;
    }
    if (event.action === 'image') {
      const image = normalizeBoardImageForEvent(event.image);
      if (!image) return;
      upsertBoardImageById(next, image);
      if (next.length > BOARD_MAX_IMAGES) next.splice(0, next.length - BOARD_MAX_IMAGES);
    }
  });
  return next;
};

const loadImageFromUrl = (url) => new Promise((resolve, reject) => {
  if (typeof Image === 'undefined') {
    reject(new Error('Браузер не поддерживает загрузку изображений.'));
    return;
  }
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Не удалось загрузить изображение.'));
  img.decoding = 'async';
  img.src = url;
});

const boardImageFileToDataUrl = async (file) => {
  if (!(file instanceof File)) {
    throw new Error('Файл изображения не выбран.');
  }
  if (file.size > BOARD_IMAGE_MAX_INPUT_BYTES) {
    throw new Error('Картинка слишком большая. Выберите файл до 16 МБ.');
  }
  const mimeType = String(file.type || '').toLowerCase();
  if (mimeType && !BOARD_ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error('Поддерживаются PNG, JPG, WEBP и GIF.');
  }
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Браузер не поддерживает обработку изображений.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(objectUrl);
    const naturalWidth = Math.max(1, Number(image.naturalWidth || image.width || 1));
    const naturalHeight = Math.max(1, Number(image.naturalHeight || image.height || 1));
    let scale = Math.min(1, BOARD_IMAGE_MAX_DIMENSION_PX / Math.max(naturalWidth, naturalHeight));
    let quality = 0.9;
    let dataUrl = '';
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Не удалось подготовить изображение для доски.');
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      dataUrl = canvas.toDataURL('image/webp', quality);
      if (dataUrl.length <= BOARD_IMAGE_MAX_DATA_URL_CHARS || (width <= 640 && height <= 640)) {
        break;
      }
      scale *= 0.82;
      quality = Math.max(0.55, quality - 0.08);
    }
    if (!dataUrl) {
      throw new Error('Не удалось подготовить изображение для доски.');
    }
    if (dataUrl.length > BOARD_IMAGE_MAX_DATA_URL_CHARS) {
      throw new Error('Картинка слишком тяжелая для видео-теории. Сожмите ее или выберите меньшее изображение.');
    }
    return {
      src: dataUrl,
      width: naturalWidth,
      height: naturalHeight,
    };
  } finally {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      /* no-op */
    }
  }
};

const getClipboardImageFile = (clipboardData) => {
  const directFile = Array.from(clipboardData?.files || []).find((file) => {
    const mimeType = String(file?.type || '').toLowerCase();
    return mimeType.startsWith('image/');
  });
  if (directFile) return directFile;
  const items = Array.from(clipboardData?.items || []);
  const imageItem = items.find((item) => item.kind === 'file' && String(item.type || '').toLowerCase().startsWith('image/'));
  return imageItem?.getAsFile?.() || null;
};

const buildBoardDisplayModeFromEvents = (events) => {
  let mode = THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI;
  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!event || event.type !== THEORY_RECORDING_EVENT_BOARD) return;
    if (String(event.action || '').trim() !== 'display_mode') return;
    mode = normalizeBoardDisplayMode(event.mode);
  });
  return mode;
};

const TheoryRecordingEditor = ({
  initialRecording,
  draftStorageKey = '',
  disabled = false,
  onDraftChange,
  ensurePyodideReady = null,
  theme = '',
  onSave = null,
  onClear = null,
  saveError = '',
  isSaving = false,
}) => {
  const monacoTheme = resolveMonacoColorTheme(theme);
  const normalizedInitial = useMemo(() => normalizeTheoryRecording(initialRecording), [initialRecording]);
  const initialDraft = useMemo(() => (
    normalizedInitial
      ? {
          ...normalizedInitial,
          audio: normalizedInitial.audio?.segments
            ? createRecordingAudioPayload(
                normalizedInitial.audio.segments.map((segment) => ({
                  ...segment,
                  isNew: false,
                  file: null,
                }))
              )
            : null,
        }
      : null
  ), [normalizedInitial]);
  const normalizedDraftStorageKey = useMemo(
    () => normalizeRecordingDraftStorageKey(draftStorageKey),
    [draftStorageKey]
  );
  const initialBoardStrokes = useMemo(
    () => buildBoardStrokesFromEvents(initialDraft?.events),
    [initialDraft?.events]
  );
  const initialBoardImages = useMemo(
    () => buildBoardImagesFromEvents(initialDraft?.events),
    [initialDraft?.events]
  );
  const initialBoardDisplayMode = useMemo(
    () => buildBoardDisplayModeFromEvents(initialDraft?.events),
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
  const [boardImages, setBoardImages] = useState(() => initialBoardImages);
  const [boardTool, setBoardTool] = useState('pen');
  const [boardColor, setBoardColor] = useState(BOARD_DEFAULT_COLOR);
  const [boardWidth, setBoardWidth] = useState(BOARD_DEFAULT_WIDTH);
  const [boardDisplayMode, setBoardDisplayMode] = useState(() => initialBoardDisplayMode);
  const [activeWorkspace, setActiveWorkspace] = useState('code');
  const [editorFontSize, setEditorFontSize] = useState(() => getInitialRecordingEditorFontSize());
  const [recoveredDraftStatus, setRecoveredDraftStatus] = useState('');

  const editorRef = useRef(null);
  const contentDisposableRef = useRef(null);
  const selectionDisposableRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const eventsRef = useRef([]);
  const boardCanvasRef = useRef(null);
  const boardImageInputRef = useRef(null);
  const boardDrawingRef = useRef({ active: false, pointerId: null, stroke: null });
  const boardStrokesRef = useRef(initialBoardStrokes);
  const boardImagesRef = useRef(initialBoardImages);
  const boardDisplayModeRef = useRef(initialBoardDisplayMode);
  const boardTimelineEmitRef = useRef({ strokeId: '', points: 0, ts: 0 });
  const boardImageCacheRef = useRef(new Map());
  const renderBoardCanvasRef = useRef(() => {});
  const recordingBaseElapsedMsRef = useRef(0);
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
  const localAudioUrlsRef = useRef([]);
  const persistedAudioSegmentsRef = useRef([]);
  const currentAudioMimeTypeRef = useRef('');
  const runRequestSeqRef = useRef(0);
  const editorId = useId();
  const editorPath = useMemo(() => (
    `inmemory://theory-recording/editor-${String(editorId).replace(/[^0-9a-zA-Z_-]/g, '_')}`
  ), [editorId]);
  const editorOptions = useMemo(() => ({
    ...RECORDING_EDITOR_OPTIONS,
    fontSize: editorFontSize,
  }), [editorFontSize]);

  const registerLocalAudioUrl = useCallback((url) => {
    const safeUrl = String(url || '').trim();
    if (!safeUrl || !safeUrl.startsWith('blob:')) return safeUrl;
    if (!localAudioUrlsRef.current.includes(safeUrl)) {
      localAudioUrlsRef.current.push(safeUrl);
    }
    return safeUrl;
  }, []);

  const revokeLocalAudioUrl = useCallback(() => {
    const urls = Array.isArray(localAudioUrlsRef.current) ? localAudioUrlsRef.current : [];
    urls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* no-op */
      }
    });
    localAudioUrlsRef.current = [];
  }, []);

  const getNowMs = useCallback(
    () => {
      const baseElapsed = Math.max(0, Number(recordingBaseElapsedMsRef.current || 0));
      const startedAt = Number(recordingStartedAtRef.current || 0);
      if (!startedAt) return baseElapsed;
      const pausedAccum = Math.max(0, Number(recordingPausedAccumMsRef.current || 0));
      const nowRaw = isRecordingPausedRef.current
        ? Number(recordingPausedAtRef.current || startedAt)
        : performance.now();
      return Math.max(0, Math.round(baseElapsed + nowRaw - startedAt - pausedAccum));
    },
    []
  );
  const canUseDraftStore = useMemo(
    () => Boolean(normalizedDraftStorageKey) && isTheoryRecordingDraftStoreSupported(),
    [normalizedDraftStorageKey]
  );

  const hydrateAudioSegmentsForDraft = useCallback((segments) => (
    cloneTheoryRecordingAudioSegments(segments).map((segment) => {
      if (segment.file) {
        return {
          ...segment,
          url: registerLocalAudioUrl(URL.createObjectURL(segment.file)),
        };
      }
      return {
        ...segment,
        url: String(segment.url || ''),
      };
    })
  ), [registerLocalAudioUrl]);

  const applyDraftState = useCallback((payload = {}) => {
    const nextRecording = normalizeTheoryRecording(payload.recording);
    const continuable = payload.continuable === true;
    revokeLocalAudioUrl();
    const nextDraftSegments = nextRecording
      ? hydrateAudioSegmentsForDraft(getTheoryRecordingAudioSegments(nextRecording))
      : [];
    const nextDraft = nextRecording
      ? buildRecordingFromParts(nextRecording, nextDraftSegments)
      : null;
    const nextCode = payload.code !== undefined
      ? String(payload.code || '')
      : deriveLatestCodeFromRecording(nextDraft, '');
    const nextRunOutputFrame = deriveLatestRunOutputFrameFromRecording(nextDraft);
    const nextRunInput = payload.runInput !== undefined
      ? String(payload.runInput || '')
      : String(nextRunOutputFrame.input || '');
    const nextRunOutput = payload.runOutput !== undefined
      ? String(payload.runOutput || '')
      : String(nextRunOutputFrame.output || '');
    const nextRunError = payload.runError !== undefined
      ? String(payload.runError || '')
      : String(nextRunOutputFrame.error || '');
    const nextBoardStrokes = nextDraft ? buildBoardStrokesFromEvents(nextDraft.events) : [];
    const nextBoardImages = nextDraft ? buildBoardImagesFromEvents(nextDraft.events) : [];
    const nextBoardDisplayMode = nextDraft
      ? buildBoardDisplayModeFromEvents(nextDraft.events)
      : THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI;
    const nextDurationMs = Math.max(0, Number(nextDraft?.durationMs || 0));
    persistedAudioSegmentsRef.current = continuable ? cloneTheoryRecordingAudioSegments(nextDraftSegments) : [];
    eventsRef.current = continuable ? cloneTheoryRecordingEvents(nextDraft?.events) : [];
    lastCodeRef.current = deriveLatestCodeFromRecording(nextDraft, nextCode);
    lastSelectionSignatureRef.current = deriveLatestSelectionSignatureFromRecording(nextDraft);
    initialCodeAtStartRef.current = String(nextDraft?.initialCode || nextCode || '');
    createdAtRef.current = String(nextDraft?.createdAt || '');
    recordingBaseElapsedMsRef.current = continuable ? nextDurationMs : 0;
    currentAudioMimeTypeRef.current = String(nextDraftSegments[nextDraftSegments.length - 1]?.file?.type || '');
    boardDrawingRef.current = { active: false, pointerId: null, stroke: null };
    boardTimelineEmitRef.current = { strokeId: '', points: 0, ts: 0 };
    isRecordingRef.current = false;
    isRecordingPausedRef.current = false;
    recordingStartedAtRef.current = 0;
    recordingPausedAtRef.current = 0;
    recordingPausedAccumMsRef.current = 0;
    chunksRef.current = [];
    boardImageCacheRef.current = new Map();
    setDraft(nextDraft);
    setCode(nextCode);
    setElapsedMs(nextDurationMs);
    setEventCount(Array.isArray(nextDraft?.events) ? nextDraft.events.length : 0);
    setRunInput(nextRunInput);
    setRunOutput(nextRunOutput);
    setRunError(nextRunError);
    setBoardStrokes(nextBoardStrokes);
    setBoardImages(nextBoardImages);
    setBoardDisplayMode(nextBoardDisplayMode);
    setActiveWorkspace(String(payload.activeWorkspace || (nextDraft ? 'preview' : 'code')));
    setRecordingError('');
    setIsRecording(false);
    setIsPaused(false);
    setRecoveredDraftStatus(String(payload.recoveredStatus || ''));
  }, [hydrateAudioSegmentsForDraft, registerLocalAudioUrl, revokeLocalAudioUrl]);

  const buildCurrentSessionAudioSegment = useCallback((durationMs, options = {}) => {
    const chunks = Array.isArray(chunksRef.current) ? chunksRef.current : [];
    if (chunks.length === 0) return null;
    const resolvedMime = chunks[0]?.type || currentAudioMimeTypeRef.current || 'audio/webm';
    const blob = new Blob(chunks, { type: resolvedMime });
    if (!blob.size) return null;
    const extension = resolvedMime.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `theory-recording-${Date.now()}.${extension}`, { type: resolvedMime });
    const persistedDurationMs = cloneTheoryRecordingAudioSegments(persistedAudioSegmentsRef.current)
      .reduce((sum, segment) => sum + Math.max(0, Number(segment.durationMs) || 0), 0);
    const safeSegmentDurationMs = Math.max(
      0,
      Math.round(Number(durationMs) || 0) - persistedDurationMs
    );
    return {
      url: options.createPreviewUrl === false ? '' : registerLocalAudioUrl(URL.createObjectURL(blob)),
      storageName: '',
      name: file.name,
      sizeBytes: file.size,
      durationMs: safeSegmentDurationMs,
      isNew: true,
      file,
    };
  }, [registerLocalAudioUrl]);

  const buildRuntimeRecording = useCallback((options = {}) => {
    const durationMs = Math.max(0, Math.round(Number(options.durationMs) || 0));
    const updatedAt = String(options.updatedAt || new Date().toISOString());
    const currentCode = String(options.code ?? (editorRef.current?.getValue?.() || code || ''));
    if (!createdAtRef.current) createdAtRef.current = updatedAt;
    const baseSegments = cloneTheoryRecordingAudioSegments(persistedAudioSegmentsRef.current);
    const includeCurrentSession = options.includeCurrentSession !== false;
    const currentSegment = includeCurrentSession
      ? buildCurrentSessionAudioSegment(durationMs, {
          createPreviewUrl: options.withPreviewUrls === true,
        })
      : null;
    const audioSegments = currentSegment ? [...baseSegments, currentSegment] : baseSegments;
    return buildRecordingFromParts({
      version: THEORY_RECORDING_VERSION,
      initialCode: initialCodeAtStartRef.current || currentCode,
      durationMs,
      events: cloneTheoryRecordingEvents(eventsRef.current),
      audio: createRecordingAudioPayload(audioSegments),
      createdAt: createdAtRef.current || updatedAt,
      updatedAt,
    }, audioSegments);
  }, [buildCurrentSessionAudioSegment, code]);

  const persistDraftSnapshot = useCallback(async (status, options = {}) => {
    if (!canUseDraftStore) return false;
    const normalizedStatus = String(status || '').trim();
    const recording = options.recording
      ? buildRecordingFromParts(options.recording, getTheoryRecordingAudioSegments(options.recording))
      : buildRuntimeRecording({
          durationMs: options.durationMs ?? getNowMs(),
          code: options.code,
          includeCurrentSession: options.includeCurrentSession !== false,
          withPreviewUrls: false,
          updatedAt: options.updatedAt,
        });
    if (!recording || !Array.isArray(recording.audio?.segments) || recording.audio.segments.length === 0) return false;
    return saveTheoryRecordingDraftSnapshot(normalizedDraftStorageKey, {
      version: THEORY_RECORDING_DRAFT_SNAPSHOT_VERSION,
      status: normalizedStatus || 'draft',
      updatedAt: String(options.updatedAt || recording.updatedAt || new Date().toISOString()),
      activeWorkspace: String(options.activeWorkspace || activeWorkspace || 'code'),
      code: String(options.code ?? (editorRef.current?.getValue?.() || code || '')),
      runInput: String(options.runInput ?? runInput ?? ''),
      runOutput: String(options.runOutput ?? runOutput ?? ''),
      runError: String(options.runError ?? runError ?? ''),
      recording,
    });
  }, [
    activeWorkspace,
    buildRuntimeRecording,
    canUseDraftStore,
    code,
    getNowMs,
    normalizedDraftStorageKey,
    runError,
    runInput,
    runOutput,
  ]);

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
      const images = normalizeBoardImagesForEvent(payload.images);
      eventsRef.current.push({
        t: Math.max(0, Math.round(timestampMs)),
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'snapshot',
        strokes,
        images,
      });
      setEventCount(eventsRef.current.length);
      return;
    }
    if (action === 'image') {
      const image = normalizeBoardImageForEvent(payload.image);
      if (!image) return;
      eventsRef.current.push({
        t: Math.max(0, Math.round(timestampMs)),
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'image',
        image,
      });
      setEventCount(eventsRef.current.length);
      return;
    }
    if (action === 'display_mode') {
      eventsRef.current.push({
        t: Math.max(0, Math.round(timestampMs)),
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'display_mode',
        mode: normalizeBoardDisplayMode(payload.mode),
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
      ? clampBoardImageAspectRatio(naturalAspectRatio)
      : storedAspectRatio > 0
        ? clampBoardImageAspectRatio(storedAspectRatio)
        : 0;
    const { x, y, drawWidth, drawHeight, boxWidth, boxHeight } = resolveBoardImageDrawRect(
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
      /* no-op */
    }
  }, []);

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

  const prepareBoardCanvas = useCallback(() => {
    const canvas = boardCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width || canvas.clientWidth || canvas.width || 1));
    const cssHeight = Math.max(1, Math.round(rect.height || canvas.clientHeight || canvas.height || 1));
    const pixelRatio = Math.max(
      1,
      Number(typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1
    );
    const targetWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
    const targetHeight = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    return {
      canvas,
      cssWidth,
      cssHeight,
      pixelRatio,
      targetWidth,
      targetHeight,
    };
  }, []);

  const renderBoardCanvas = useCallback(() => {
    const prepared = prepareBoardCanvas();
    if (!prepared) return;
    const { canvas, cssWidth, cssHeight, pixelRatio, targetWidth, targetHeight } = prepared;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.scale(pixelRatio, pixelRatio);
    ctx.fillStyle = BOARD_SNAPSHOT_BG;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    boardImagesRef.current.forEach((image) => drawBoardImage(ctx, image, cssWidth, cssHeight));
    boardStrokesRef.current.forEach((stroke) => drawBoardStroke(ctx, stroke, cssWidth, cssHeight));
    const previewStroke = boardDrawingRef.current?.stroke;
    if (previewStroke) drawBoardStroke(ctx, previewStroke, cssWidth, cssHeight);
    ctx.restore();
  }, [drawBoardImage, drawBoardStroke, prepareBoardCanvas]);

  useEffect(() => {
    renderBoardCanvasRef.current = renderBoardCanvas;
  }, [renderBoardCanvas]);

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
    boardStrokesRef.current = [];
    boardImagesRef.current = [];
    setBoardStrokes([]);
    setBoardImages([]);
    if (isRecordingRef.current && !isRecordingPausedRef.current) {
      appendBoardEvent(getNowMs(), { action: 'clear' });
    }
    renderBoardCanvas();
  }, [appendBoardEvent, getNowMs, renderBoardCanvas]);

  const appendBoardImage = useCallback((image) => {
    const safeImage = normalizeBoardImageForEvent(image);
    if (!safeImage) return false;
    const next = [...(Array.isArray(boardImagesRef.current) ? boardImagesRef.current : [])];
    upsertBoardImageById(next, safeImage);
    if (next.length > BOARD_MAX_IMAGES) {
      next.splice(0, next.length - BOARD_MAX_IMAGES);
    }
    boardImagesRef.current = next;
    setBoardImages(next);
    if (isRecordingRef.current && !isRecordingPausedRef.current) {
      appendBoardEvent(getNowMs(), { action: 'image', image: safeImage });
    }
    return true;
  }, [appendBoardEvent, getNowMs]);

  const buildBoardImagePlacement = useCallback((sourceMeta, existingCount = 0) => {
    const naturalWidth = Math.max(1, Number(sourceMeta?.width || 1));
    const naturalHeight = Math.max(1, Number(sourceMeta?.height || 1));
    const aspectRatio = clampBoardImageAspectRatio(naturalWidth / naturalHeight);
    const canvasRect = boardCanvasRef.current?.getBoundingClientRect?.();
    const boardWidth = Math.max(1, Number(canvasRect?.width || boardCanvasRef.current?.clientWidth || 16));
    const boardHeight = Math.max(1, Number(canvasRect?.height || boardCanvasRef.current?.clientHeight || 9));
    const boardAspectRatio = boardWidth / boardHeight;
    let width = BOARD_IMAGE_DEFAULT_MAX_WIDTH;
    let height = width * (boardAspectRatio / aspectRatio);
    if (height > BOARD_IMAGE_DEFAULT_MAX_HEIGHT) {
      height = BOARD_IMAGE_DEFAULT_MAX_HEIGHT;
      width = height * (aspectRatio / boardAspectRatio);
    }
    width = clampBoardImageSize(width);
    height = clampBoardImageSize(height);
    const layerIndex = Math.max(0, Number(existingCount) || 0);
    const offsetBase = ((layerIndex % 4) - 1.5) * BOARD_IMAGE_STACK_STEP;
    const verticalOffset = (Math.floor(layerIndex / 4) % 3) * (BOARD_IMAGE_STACK_STEP * 0.55);
    const x = clampBoardUnit(((1 - width) / 2) + offsetBase);
    const y = clampBoardUnit(((1 - height) / 2) + verticalOffset);
    return {
      id: `board-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      src: sourceMeta?.src || '',
      x,
      y,
      width,
      height,
      aspectRatio,
    };
  }, []);

  const handleBoardImageFile = useCallback(async (file) => {
    if (disabled) return;
    if (boardImagesRef.current.length >= BOARD_MAX_IMAGES) {
      setRecordingError(`На доске может быть максимум ${BOARD_MAX_IMAGES} картинок одновременно.`);
      return;
    }
    try {
      const preparedImage = await boardImageFileToDataUrl(file);
      const placedImage = buildBoardImagePlacement(preparedImage, boardImagesRef.current.length);
      const appended = appendBoardImage(placedImage);
      if (!appended) {
        throw new Error('Не удалось добавить картинку на доску.');
      }
      setRecordingError('');
    } catch (error) {
      setRecordingError(error?.message || 'Не удалось добавить картинку на доску.');
    }
  }, [appendBoardImage, buildBoardImagePlacement, disabled]);

  const handleBoardImageInputChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (event.target) {
      event.target.value = '';
    }
    if (!file) return;
    await handleBoardImageFile(file);
  }, [handleBoardImageFile]);

  const handleRemoveLastBoardImage = useCallback(() => {
    const safePrev = Array.isArray(boardImagesRef.current) ? boardImagesRef.current : [];
    if (safePrev.length === 0) return;
    const nextImagesSnapshot = safePrev.slice(0, -1);
    boardImagesRef.current = nextImagesSnapshot;
    setBoardImages(nextImagesSnapshot);
    if (isRecordingRef.current && !isRecordingPausedRef.current) {
      appendBoardEvent(getNowMs(), {
        action: 'snapshot',
        strokes: boardStrokesRef.current,
        images: nextImagesSnapshot,
      });
    }
  }, [appendBoardEvent, getNowMs]);

  const handleBoardPaste = useCallback((event) => {
    const file = getClipboardImageFile(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    handleBoardImageFile(file);
  }, [handleBoardImageFile]);

  useEffect(() => {
    if (activeWorkspace !== 'board' || typeof document === 'undefined') return undefined;
    const handleDocumentPaste = (event) => {
      const file = getClipboardImageFile(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      handleBoardImageFile(file);
    };
    document.addEventListener('paste', handleDocumentPaste);
    return () => {
      document.removeEventListener('paste', handleDocumentPaste);
    };
  }, [activeWorkspace, handleBoardImageFile]);

  const applyBoardDisplayMode = useCallback((nextMode) => {
    boardDisplayModeRef.current = nextMode;
    setBoardDisplayMode(nextMode);
    if (isRecordingRef.current && !isRecordingPausedRef.current) {
      appendBoardEvent(getNowMs(), {
        action: 'display_mode',
        mode: nextMode,
      });
    }
  }, [appendBoardEvent, getNowMs]);

  const handleToggleBoardDisplayMode = useCallback(() => {
    const nextMode = boardDisplayModeRef.current === THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS
      ? THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI
      : THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS;
    applyBoardDisplayMode(nextMode);
  }, [applyBoardDisplayMode]);

  const handleSelectWorkspace = useCallback((nextWorkspace) => {
    const safeWorkspace = String(nextWorkspace || '').trim() || 'code';
    setActiveWorkspace(safeWorkspace);
    if (safeWorkspace === 'board') {
      if (boardDisplayModeRef.current !== THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS) {
        applyBoardDisplayMode(THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS);
      }
      return;
    }
    if (
      activeWorkspace === 'board'
      && safeWorkspace === 'code'
      && boardDisplayModeRef.current !== THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI
    ) {
      applyBoardDisplayMode(THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI);
    }
  }, [activeWorkspace, applyBoardDisplayMode]);

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

  useEffect(() => {
    boardImagesRef.current = Array.isArray(boardImages) ? boardImages : [];
    renderBoardCanvas();
  }, [boardImages, renderBoardCanvas]);

  useEffect(() => {
    boardDisplayModeRef.current = normalizeBoardDisplayMode(boardDisplayMode);
  }, [boardDisplayMode]);

  useEffect(() => {
    const canvas = boardCanvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      renderBoardCanvas();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [renderBoardCanvas]);

  useEffect(() => {
    let cancelled = false;
    applyDraftState({
      recording: initialDraft,
      activeWorkspace: initialDraft ? 'preview' : 'code',
      continuable: false,
      recoveredStatus: '',
      recoveredUpdatedAt: '',
    });
    if (!canUseDraftStore) return () => {
      cancelled = true;
    };
    (async () => {
      const snapshot = await loadTheoryRecordingDraftSnapshot(normalizedDraftStorageKey);
      if (cancelled || !snapshot || typeof snapshot !== 'object') return;
      const snapshotRecording = normalizeTheoryRecording(snapshot.recording);
      if (!snapshotRecording) return;
      const snapshotUpdatedMs = Date.parse(
        String(snapshot.updatedAt || snapshotRecording.updatedAt || snapshotRecording.createdAt || '')
      ) || 0;
      const initialUpdatedMs = Date.parse(
        String(initialDraft?.updatedAt || initialDraft?.createdAt || '')
      ) || 0;
      if (snapshotUpdatedMs < initialUpdatedMs) return;
      applyDraftState({
        recording: snapshotRecording,
        code: snapshot.code,
        runInput: snapshot.runInput,
        runOutput: snapshot.runOutput,
        runError: snapshot.runError,
        activeWorkspace: snapshot.activeWorkspace || 'code',
        continuable: true,
        recoveredStatus: String(snapshot.status || 'draft'),
        recoveredUpdatedAt: String(snapshot.updatedAt || snapshotRecording.updatedAt || ''),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [applyDraftState, canUseDraftStore, initialDraft, normalizedDraftStorageKey]);

  useEffect(() => {
    if (!canUseDraftStore || !isRecording) return undefined;
    const timerId = setInterval(() => {
      flushScheduledSnapshots();
      const nowMs = getNowMs();
      appendCodeEvent(nowMs, editorRef.current?.getValue?.() || '', true);
      appendSelectionEvent(nowMs, getEditorSelections(), true);
      persistDraftSnapshot('recording', {
        durationMs: nowMs,
        activeWorkspace,
        code: editorRef.current?.getValue?.() || '',
        runInput,
        runOutput,
        runError,
      }).catch(() => {});
    }, RECORDING_AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timerId);
  }, [
    activeWorkspace,
    appendCodeEvent,
    appendSelectionEvent,
    canUseDraftStore,
    flushScheduledSnapshots,
    getEditorSelections,
    getNowMs,
    isRecording,
    persistDraftSnapshot,
    runError,
    runInput,
    runOutput,
  ]);

  useEffect(() => {
    if (!canUseDraftStore || isRecording || !draft) return;
    persistDraftSnapshot(recoveredDraftStatus || 'draft', {
      recording: draft,
      activeWorkspace,
      code,
      runInput,
      runOutput,
      runError,
      updatedAt: draft.updatedAt,
    }).catch(() => {});
  }, [activeWorkspace, canUseDraftStore, code, draft, isRecording, persistDraftSnapshot, recoveredDraftStatus, runError, runInput, runOutput]);

  const finalizeRecording = useCallback((durationMs, mimeType = '') => {
    const chunks = Array.isArray(chunksRef.current) ? chunksRef.current : [];
    const resolvedMime = chunks[0]?.type || mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: resolvedMime });
    stopMediaStream();
    if (!blob.size) {
      setRecordingError('Аудио не записалось. Попробуйте еще раз.');
      return;
    }
    const events = cloneTheoryRecordingEvents(eventsRef.current)
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
    const currentSegment = buildCurrentSessionAudioSegment(safeDuration, { createPreviewUrl: true });
    const nextAudioSegments = [
      ...cloneTheoryRecordingAudioSegments(persistedAudioSegmentsRef.current),
      ...(currentSegment ? [currentSegment] : []),
    ];
    const nextDraft = buildRecordingFromParts({
      version: THEORY_RECORDING_VERSION,
      initialCode: initialCodeAtStartRef.current,
      durationMs: safeDuration,
      events,
      audio: createRecordingAudioPayload(nextAudioSegments),
      createdAt: createdAtRef.current,
      updatedAt,
    }, nextAudioSegments);
    persistedAudioSegmentsRef.current = cloneTheoryRecordingAudioSegments(nextAudioSegments);
    setDraft(nextDraft);
    setActiveWorkspace('preview');
    setElapsedMs(safeDuration);
    setEventCount(events.length);
    setRecoveredDraftStatus((prev) => (prev ? 'draft' : prev));
    if (events.length >= THEORY_RECORDING_MAX_EVENTS) {
      setRecordingError('Запись достигла лимита событий. Сократите длительность или количество действий.');
    } else {
      setRecordingError('');
    }
    persistDraftSnapshot('draft', {
      recording: nextDraft,
      activeWorkspace: 'preview',
      code: editorRef.current?.getValue?.() || '',
      runInput,
      runOutput,
      runError,
      updatedAt,
    }).catch(() => {});
  }, [buildCurrentSessionAudioSegment, persistDraftSnapshot, runError, runInput, runOutput, stopMediaStream]);
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
    appendBoardEvent(resumeMs, {
      action: 'display_mode',
      mode: boardDisplayModeRef.current,
    });
    appendBoardEvent(resumeMs, {
      action: 'snapshot',
      strokes: boardStrokesRef.current,
      images: boardImagesRef.current,
    });
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
    setActiveWorkspace('code');
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
      const mimeType = getPreferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      currentAudioMimeTypeRef.current = recorder.mimeType || mimeType || 'audio/webm';
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

      const shouldContinueRecoveredDraft = Boolean(recoveredDraftStatus) && Boolean(draft);
      if (shouldContinueRecoveredDraft) {
        const recoveredRecording = normalizeTheoryRecording(draft);
        const recoveredDurationMs = Math.max(0, Number(recoveredRecording?.durationMs || 0));
        persistedAudioSegmentsRef.current = cloneTheoryRecordingAudioSegments(
          getTheoryRecordingAudioSegments(recoveredRecording)
        );
        eventsRef.current = cloneTheoryRecordingEvents(recoveredRecording?.events);
        initialCodeAtStartRef.current = String(recoveredRecording?.initialCode || editor.getValue() || '');
        createdAtRef.current = String(recoveredRecording?.createdAt || new Date().toISOString());
        recordingBaseElapsedMsRef.current = recoveredDurationMs;
        lastCodeRef.current = deriveLatestCodeFromRecording(recoveredRecording, editor.getValue() || '');
        lastSelectionSignatureRef.current = deriveLatestSelectionSignatureFromRecording(recoveredRecording);
        setElapsedMs(recoveredDurationMs);
        setEventCount(Array.isArray(recoveredRecording?.events) ? recoveredRecording.events.length : 0);
      } else {
        persistedAudioSegmentsRef.current = [];
        eventsRef.current = [];
        lastCodeRef.current = '';
        lastSelectionSignatureRef.current = '';
        initialCodeAtStartRef.current = editor.getValue() || '';
        recordingBaseElapsedMsRef.current = 0;
        createdAtRef.current = '';
        setElapsedMs(0);
        setEventCount(0);
      }
      recordingStartedAtRef.current = performance.now();
      recordingPausedAtRef.current = 0;
      recordingPausedAccumMsRef.current = 0;
      isRecordingPausedRef.current = false;
      isRecordingRef.current = true;
      setIsRecording(true);
      setIsPaused(false);
      boardTimelineEmitRef.current = { strokeId: '', points: 0, ts: 0 };
      const startStampMs = Math.max(0, Number(recordingBaseElapsedMsRef.current || 0));
      appendCodeEvent(startStampMs, editor.getValue() || initialCodeAtStartRef.current, true);
      appendSelectionEvent(startStampMs, getEditorSelections(), true);
      appendBoardEvent(startStampMs, {
        action: 'display_mode',
        mode: boardDisplayModeRef.current,
      });
      if (boardStrokesRef.current.length > 0 || boardImagesRef.current.length > 0) {
        appendBoardEvent(startStampMs, {
          action: 'snapshot',
          strokes: boardStrokesRef.current,
          images: boardImagesRef.current,
        });
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
    draft,
    finalizeRecording,
    getEditorSelections,
    getNowMs,
    recoveredDraftStatus,
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
    boardStrokesRef.current = [];
    boardImagesRef.current = [];
    setBoardStrokes([]);
    setBoardImages([]);
    boardDisplayModeRef.current = THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI;
    setBoardDisplayMode(THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI);
    boardDrawingRef.current = { active: false, pointerId: null, stroke: null };
    boardTimelineEmitRef.current = { strokeId: '', points: 0, ts: 0 };
    boardImageCacheRef.current = new Map();
    setEventCount(0);
    setElapsedMs(0);
    setRunOutput('');
    setRunError('');
    setRecordingError('');
    setRecoveredDraftStatus('');
    persistedAudioSegmentsRef.current = [];
    eventsRef.current = [];
    recordingBaseElapsedMsRef.current = 0;
    revokeLocalAudioUrl();
    renderBoardCanvas();
    if (canUseDraftStore) {
      deleteTheoryRecordingDraftSnapshot(normalizedDraftStorageKey).catch(() => {});
    }
  }, [canUseDraftStore, normalizedDraftStorageKey, renderBoardCanvas, revokeLocalAudioUrl]);

  useEffect(() => {
    if (typeof onDraftChange === 'function') {
      onDraftChange(draft);
    }
  }, [draft, onDraftChange]);

  const handleSaveDraft = useCallback(() => {
    if (typeof onSave === 'function') {
      onSave(draft);
    }
  }, [draft, onSave]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        RECORDING_EDITOR_FONT_SIZE_STORAGE_KEY,
        String(editorFontSize)
      );
    } catch {
      /* no-op */
    }
  }, [editorFontSize]);

  useEffect(() => {
    try {
      editorRef.current?.updateOptions?.({ fontSize: editorFontSize });
      editorRef.current?.layout?.();
    } catch {
      /* no-op */
    }
  }, [editorFontSize]);

  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return undefined;
    const frameId = requestAnimationFrame(() => {
      if (activeWorkspace === 'code') {
        try {
          editorRef.current?.layout?.();
        } catch {
          /* no-op */
        }
        return;
      }
      if (activeWorkspace === 'board') {
        renderBoardCanvas();
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeWorkspace, renderBoardCanvas]);

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

  const boardWidthValue = Math.max(1, Math.min(22, Math.round(Number(boardWidth) || BOARD_DEFAULT_WIDTH)));
  const hasDraft = Boolean(draft);
  const canSave = typeof onSave === 'function';
  const canClearSavedTheory = typeof onClear === 'function';
  const isBoardFocusMode = boardDisplayMode === THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS;
  const hasRecoveredDraft = Boolean(recoveredDraftStatus);
  const startRecordingLabel = hasRecoveredDraft ? 'Продолжить запись' : 'Начать запись';
  const canDecreaseEditorFont = editorFontSize > RECORDING_EDITOR_FONT_SIZE_MIN;
  const canIncreaseEditorFont = editorFontSize < RECORDING_EDITOR_FONT_SIZE_MAX;
  const workspaceTabs = [
    {
      id: 'code',
      label: 'Код',
      hint: 'Пишите, запускайте и записывайте изменения редактора.',
    },
    {
      id: 'board',
      label: 'Доска',
      hint: 'Рисуйте схемы, добавляйте картинки и пометки поверх объяснения.',
    },
    {
      id: 'preview',
      label: 'Предпросмотр',
      hint: 'Проверьте запись перед сохранением.',
    },
  ];
  const recordingStatusLabel = !isRecording
    ? 'Готово к записи'
    : (isPaused ? 'Запись на паузе' : 'Идет запись');
  const recordingStatusClass = !isRecording
    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
    : (isPaused ? 'border-amber-400/30 bg-amber-500/10 text-amber-100' : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100');

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_26%),linear-gradient(160deg,#071127_0%,#091a3f_48%,#050d1f_100%)] text-white shadow-[0_26px_80px_rgba(6,16,40,0.35)]">
        <div className="border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Студия видео-теории</div>
              <h4 className="mt-2 text-xl font-black tracking-tight text-white">Запись, код, доска и сохранение в одном месте</h4>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
                Переключайтесь между кодом и доской во время записи, запускайте примеры и сразу проверяйте готовый разбор перед сохранением.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${recordingStatusClass}`}>
                {recordingStatusLabel}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                {`Длительность: ${formatRecordingDuration(elapsedMs)}`}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                {`Событий: ${eventCount}`}
              </div>
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                hasDraft
                  ? 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100'
                  : 'border-white/10 bg-white/5 text-slate-300'
              }`}>
                {hasDraft ? 'Черновик готов' : 'Черновик появится после остановки записи'}
              </div>
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                isBoardFocusMode
                  ? 'border-sky-300/30 bg-sky-400/10 text-sky-100'
                  : 'border-white/10 bg-white/5 text-slate-300'
              }`}>
                {isBoardFocusMode ? 'Доска в видео: на весь экран' : 'Доска в видео: мини'}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!isRecording ? (
              <Button onClick={startRecording} disabled={disabled || isSaving} className="bg-emerald-500 text-white shadow-[0_14px_40px_rgba(16,185,129,0.26)] hover:bg-emerald-600">
                {startRecordingLabel}
              </Button>
            ) : (
              <>
                {!isPaused ? (
                  <Button variant="secondary" onClick={pauseRecording} disabled={disabled || isSaving} className="border-white/15 bg-white/10 text-white hover:bg-white/15">
                    Пауза
                  </Button>
                ) : (
                  <Button onClick={resumeRecording} disabled={disabled || isSaving} className="bg-cyan-500 text-slate-950 shadow-[0_14px_40px_rgba(34,211,238,0.24)] hover:bg-cyan-400">
                    Продолжить
                  </Button>
                )}
                <Button onClick={stopRecording} disabled={disabled || isSaving} className="bg-rose-500 text-white shadow-[0_14px_40px_rgba(244,63,94,0.22)] hover:bg-rose-600">
                  Остановить запись
                </Button>
              </>
            )}

            {activeWorkspace === 'code' && (
              <Button
                onClick={handleRunCode}
                disabled={disabled || isRunningCode || isSaving}
                variant="secondary"
                className="border-white/15 bg-white/10 text-white hover:bg-white/15"
              >
                {isRunningCode ? 'Запуск...' : 'Запустить код'}
              </Button>
            )}
          </div>

          {(recordingError || saveError) && (
            <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {recordingError || saveError}
            </div>
          )}
        </div>

        <div className="px-4 py-3 sm:px-5">
          <div className="grid gap-2 sm:grid-cols-3">
            {workspaceTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectWorkspace(tab.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  activeWorkspace === tab.id
                    ? 'border-cyan-300/50 bg-cyan-400/12 shadow-[0_12px_40px_rgba(34,211,238,0.16)]'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]'
                }`}
              >
                <div className="text-sm font-semibold text-white">{tab.label}</div>
                <div className="mt-1 text-xs leading-5 text-slate-300">{tab.hint}</div>
              </button>
            ))}
          </div>

          {activeWorkspace === 'preview' ? (
            <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_320px]">
              <div className="rounded-[24px] border border-white/10 bg-[#030b1d]/80 p-3">
                {hasDraft ? (
                  <>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Предпросмотр</div>
                    <TheoryRecordingPlayer recording={draft} className="mt-3" theme={theme} />
                  </>
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-6 text-center text-sm leading-6 text-slate-300">
                    Остановите запись, чтобы собрать черновик и проверить готовую видео-теорию перед сохранением.
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Что сохранится</div>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
                      <div>Аудио с микрофона</div>
                      <div>Изменения кода и выделения</div>
                      <div>Рисунки, картинки и очистка доски</div>
                      <div>Запуски кода, ввод и вывод</div>
                    </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Сохранение</div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Сохранение доступно после остановки записи. Если нужно, вернитесь в код или на доску, внесите правки и запишите новый дубль.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_320px]">
              <div className="min-w-0 rounded-[24px] border border-white/10 bg-[#030b1d]/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {activeWorkspace === 'board' ? 'Доска поверх кода' : 'Редактор Python'}
                    </div>
                    <div className="mt-1 text-sm text-slate-300">
                      {activeWorkspace === 'board'
                        ? 'Код остается на своем месте, а доска временно разворачивается на весь рабочий экран.'
                        : 'Код и выделения записываются автоматически во время записи.'}
                    </div>
                  </div>
                  {activeWorkspace === 'code' ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Шрифт</span>
                        <button
                          type="button"
                          onClick={() => setEditorFontSize((prev) => clampRecordingEditorFontSize(prev - RECORDING_EDITOR_FONT_SIZE_STEP))}
                          disabled={!canDecreaseEditorFont}
                          className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-sm font-semibold text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          A-
                        </button>
                        <div className="min-w-[58px] rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-center text-sm font-semibold text-cyan-100">
                          {`${editorFontSize}px`}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditorFontSize((prev) => clampRecordingEditorFontSize(prev + RECORDING_EDITOR_FONT_SIZE_STEP))}
                          disabled={!canIncreaseEditorFont}
                          className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-sm font-semibold text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          A+
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorFontSize(RECORDING_EDITOR_OPTIONS.fontSize)}
                          disabled={editorFontSize === RECORDING_EDITOR_OPTIONS.fontSize}
                          className="rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Сброс
                        </button>
                      </div>
                      <div className="mt-2 text-[11px] leading-5 text-slate-400">
                        Только для вашего редактора. На запись и предпросмотр не влияет.
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-right">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">Полноэкранная доска</div>
                      <div className="mt-1 text-[11px] leading-5 text-cyan-50/80">
                        Вернитесь во вкладку «Код», когда снова нужно показать редактор без наложения.
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className={`relative overflow-hidden rounded-[20px] border border-white/10 bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
                    activeWorkspace === 'board' ? 'outline-none ring-2 ring-cyan-400/30' : ''
                  }`}
                  onPaste={activeWorkspace === 'board' ? handleBoardPaste : undefined}
                  onMouseDown={activeWorkspace === 'board' ? ((event) => event.currentTarget.focus()) : undefined}
                  tabIndex={activeWorkspace === 'board' ? 0 : -1}
                >
                  <input
                    ref={boardImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleBoardImageInputChange}
                  />
                  <Editor
                    height="460px"
                    language="python"
                    theme={monacoTheme}
                    beforeMount={ensureMonacoColorTheme}
                    defaultValue={code}
                    path={editorPath}
                    saveViewState={false}
                    onMount={handleEditorMount}
                    options={editorOptions}
                  />
                  {activeWorkspace === 'board' && (
                    <div className="absolute inset-0 z-10 overflow-hidden bg-[#050d1f]/96 backdrop-blur-[2px]">
                      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/55 px-4 py-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">Доска на весь экран</div>
                          <div className="mt-1 text-sm text-slate-200">Код остается под ней и вернется без переключения состояния записи.</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                          Ctrl+V для вставки
                        </div>
                      </div>
                      <canvas
                        ref={boardCanvasRef}
                        width={960}
                        height={300}
                        onPointerDown={handleBoardPointerDown}
                        onPointerMove={handleBoardPointerMove}
                        onPointerUp={handleBoardPointerUp}
                        onPointerCancel={handleBoardPointerCancel}
                        className="h-[460px] w-full touch-none select-none cursor-crosshair"
                      />
                    </div>
                  )}
                </div>
                {activeWorkspace === 'board' && (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-[#061127] px-3 py-3 text-sm leading-6 text-slate-300">
                    Картинку можно загрузить кнопкой справа или вставить через <span className="font-semibold text-white">Ctrl+V</span>, если изображение уже скопировано.
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {activeWorkspace === 'code' ? (
                  <>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Запуск кода</div>
                          <div className="mt-1 text-sm text-slate-300">Введите данные и сразу получите вывод для записи.</div>
                        </div>
                      </div>
                      <textarea
                        value={runInput}
                        onChange={(event) => setRunInput(event.target.value)}
                        placeholder="Необязательно. Можно оставить пустым."
                        spellCheck={false}
                        className="mt-3 min-h-[120px] w-full resize-y rounded-2xl border border-white/10 bg-[#061127] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60"
                      />
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-[#030b1d] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Вывод</div>
                      <pre className="mt-3 max-h-[260px] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/25 px-3 py-3 font-mono text-[12px] leading-6 text-slate-100">
                        {runOutput || 'Вывод появится после запуска кода.'}
                      </pre>
                      {runError && (
                        <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200">Ошибки</div>
                          <pre className="mt-2 max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-rose-100">{runError}</pre>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Инструменты доски</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setBoardTool('pen')}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                            boardTool === 'pen'
                              ? 'border-cyan-300/50 bg-cyan-400/12 text-white'
                              : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          Перо
                        </button>
                        <button
                          type="button"
                          onClick={() => setBoardTool('eraser')}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                            boardTool === 'eraser'
                              ? 'border-cyan-300/50 bg-cyan-400/12 text-white'
                              : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          Ластик
                        </button>
                        <button
                          type="button"
                          onClick={handleClearBoard}
                          className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15"
                        >
                          Очистить доску
                        </button>
                        <button
                          type="button"
                          onClick={() => boardImageInputRef.current?.click?.()}
                          className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                        >
                          Добавить картинку
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveLastBoardImage}
                          disabled={boardImages.length === 0}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Убрать последнюю картинку
                        </button>
                        <button
                          type="button"
                          onClick={handleToggleBoardDisplayMode}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                            isBoardFocusMode
                              ? 'border-sky-300/40 bg-sky-400/12 text-sky-100 hover:bg-sky-400/18'
                              : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          {isBoardFocusMode ? 'Вернуть мини-доску' : 'Показать в видео на весь экран'}
                        </button>
                      </div>
                      <div className="mt-3 rounded-2xl border border-white/10 bg-[#061127] px-3 py-3 text-sm leading-6 text-slate-300">
                        {isBoardFocusMode
                          ? 'Во время воспроизведения доска сейчас занимает все окно видео-теории. Нажмите кнопку еще раз, чтобы вернуть обычный мини-режим.'
                          : 'Сейчас доска показывается как мини-панель справа. Можно временно развернуть ее на все окно видео-теории для важных объяснений.'}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Параметры</div>
                      <div className="mt-3 space-y-4 text-sm text-slate-200">
                        <label className="block">
                          <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Цвет линии</span>
                          <input
                            type="color"
                            value={boardColor}
                            onChange={(event) => setBoardColor(event.target.value || BOARD_DEFAULT_COLOR)}
                            disabled={boardTool === 'eraser'}
                            className="h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-[#061127] p-1 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </label>

                        <label className="block">
                          <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-slate-400">
                            <span>Толщина</span>
                            <span>{boardWidthValue}</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={22}
                            step={1}
                            value={boardWidthValue}
                            onChange={(event) => setBoardWidth(Math.max(1, Math.min(22, Number(event.target.value) || BOARD_DEFAULT_WIDTH)))}
                            className="w-full accent-cyan-400"
                          />
                        </label>

                        <div className="rounded-2xl border border-white/10 bg-[#061127] px-3 py-3 text-sm text-slate-300">
                          {`Штрихов: ${boardStrokes.length} · Картинок: ${boardImages.length}`}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-black/15 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl text-sm leading-6 text-slate-300">
              Если нужно записать новый дубль, остановите запись, откройте предпросмотр и только потом сохраняйте готовую видео-теорию.
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                variant="secondary"
                onClick={handleResetDraft}
                disabled={disabled || isRecording || isSaving}
                className="w-full sm:w-auto border-white/15 bg-white/10 text-white hover:bg-white/15"
              >
                Сбросить черновик
              </Button>
              {canClearSavedTheory && (
                <Button
                  variant="danger"
                  onClick={onClear}
                  disabled={disabled || isRecording || isSaving}
                  className="w-full sm:w-auto border border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"
                >
                  Очистить текущую теорию
                </Button>
              )}
              {canSave && (
                <Button
                  onClick={handleSaveDraft}
                  disabled={disabled || isRecording || isSaving || !hasDraft}
                  className="w-full sm:w-auto"
                >
                  {isSaving ? 'Сохранение...' : 'Сохранить видео-теорию'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TheoryRecordingEditor;



