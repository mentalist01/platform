export const THEORY_RECORDING_TYPE = 'recording';
export const THEORY_RECORDING_VERSION = 1;
export const THEORY_RECORDING_EVENT_CODE = 'code';
export const THEORY_RECORDING_EVENT_SELECTION = 'selection';
export const THEORY_RECORDING_EVENT_BOARD = 'board';
export const THEORY_RECORDING_EVENT_RUN_OUTPUT = 'run_output';
export const THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI = 'mini';
export const THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS = 'focus';
export const THEORY_RECORDING_MAX_EVENTS = 12000;
export const THEORY_RECORDING_MAX_JSON_BYTES = 6 * 1024 * 1024;
export const THEORY_RECORDING_DRAFT_SNAPSHOT_VERSION = 1;
const THEORY_RECORDING_MAX_RUN_INPUT_CHARS = 8000;
const THEORY_RECORDING_MAX_RUN_OUTPUT_CHARS = 120000;
const THEORY_RECORDING_MAX_BOARD_POINTS = 2400;
const THEORY_RECORDING_MAX_BOARD_STROKES = 360;
const THEORY_RECORDING_MAX_BOARD_IMAGES = 12;
const THEORY_RECORDING_MAX_BOARD_IMAGE_SRC_CHARS = 1_600_000;

const clampUnit = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, Number(num.toFixed(4))));
};

const clampBoardWidth = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 2;
  return Math.max(1, Math.min(64, Number(num.toFixed(2))));
};

const normalizeBoardColor = (value) => {
  const color = normalizeText(value).trim();
  if (!color) return '#38bdf8';
  return color.slice(0, 40);
};

const normalizeBoardDisplayMode = (value) => {
  const mode = normalizeText(value).trim();
  return mode === THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS
    ? THEORY_RECORDING_BOARD_DISPLAY_MODE_FOCUS
    : THEORY_RECORDING_BOARD_DISPLAY_MODE_MINI;
};

const normalizeBoardPoint = (value) => {
  if (!value || typeof value !== 'object') return null;
  return {
    x: clampUnit(value.x),
    y: clampUnit(value.y),
  };
};

const normalizeBoardPoints = (value) => (
  (Array.isArray(value) ? value : [])
    .map((item) => normalizeBoardPoint(item))
    .filter(Boolean)
    .slice(0, THEORY_RECORDING_MAX_BOARD_POINTS)
);

const normalizeBoardStroke = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const points = normalizeBoardPoints(value.points);
  if (points.length < 1) return null;
  const id = normalizeText(value.id || '').trim().slice(0, 64) || `stroke-${Date.now()}`;
  return {
    id,
    color: normalizeBoardColor(value.color),
    width: clampBoardWidth(value.width),
    points,
  };
};

const normalizeBoardStrokeList = (value) => (
  (Array.isArray(value) ? value : [])
    .map((item) => normalizeBoardStroke(item))
    .filter(Boolean)
    .slice(0, THEORY_RECORDING_MAX_BOARD_STROKES)
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
  const source = normalizeText(value).trim();
  if (!source) return '';
  return source.slice(0, THEORY_RECORDING_MAX_BOARD_IMAGE_SRC_CHARS);
};

const normalizeBoardImage = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const src = normalizeBoardImageSource(value.src);
  if (!src) return null;
  return {
    id: normalizeText(value.id || '').trim().slice(0, 64) || `image-${Date.now()}`,
    src,
    x: clampUnit(value.x),
    y: clampUnit(value.y),
    width: clampBoardImageSize(value.width),
    height: clampBoardImageSize(value.height),
    aspectRatio: clampBoardImageAspectRatio(value.aspectRatio),
  };
};

const normalizeBoardImageList = (value) => (
  (Array.isArray(value) ? value : [])
    .map((item) => normalizeBoardImage(item))
    .filter(Boolean)
    .slice(0, THEORY_RECORDING_MAX_BOARD_IMAGES)
);

const clampNonNegativeInt = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
};

const normalizeText = (value) => (typeof value === 'string' ? value : String(value ?? ''));

const normalizeSelectionItem = (value) => {
  if (!value || typeof value !== 'object') return null;
  let startLineNumber = Math.max(1, clampNonNegativeInt(value.startLineNumber || 1));
  let startColumn = Math.max(1, clampNonNegativeInt(value.startColumn || 1));
  let endLineNumber = Math.max(1, clampNonNegativeInt(value.endLineNumber || startLineNumber));
  let endColumn = Math.max(1, clampNonNegativeInt(value.endColumn || startColumn));
  if (endLineNumber < startLineNumber || (endLineNumber === startLineNumber && endColumn < startColumn)) {
    const nextStartLineNumber = endLineNumber;
    const nextStartColumn = endColumn;
    endLineNumber = startLineNumber;
    endColumn = startColumn;
    startLineNumber = nextStartLineNumber;
    startColumn = nextStartColumn;
  }
  return { startLineNumber, startColumn, endLineNumber, endColumn };
};

const normalizeSelectionList = (value) => (
  (Array.isArray(value) ? value : [])
    .map((item) => normalizeSelectionItem(item))
    .filter(Boolean)
    .slice(0, 10)
);

const normalizeRunText = (value, maxChars) => {
  const text = normalizeText(value);
  if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
};

const normalizeEvent = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const t = clampNonNegativeInt(value.t);
  const type = String(value.type || '').trim();
  if (type === THEORY_RECORDING_EVENT_CODE) {
    return {
      t,
      type: THEORY_RECORDING_EVENT_CODE,
      code: normalizeText(value.code),
    };
  }
  if (type === THEORY_RECORDING_EVENT_SELECTION) {
    const selections = normalizeSelectionList(value.selections);
    return {
      t,
      type: THEORY_RECORDING_EVENT_SELECTION,
      selections,
    };
  }
  if (type === THEORY_RECORDING_EVENT_RUN_OUTPUT) {
    return {
      t,
      type: THEORY_RECORDING_EVENT_RUN_OUTPUT,
      input: normalizeRunText(value.input, THEORY_RECORDING_MAX_RUN_INPUT_CHARS),
      output: normalizeRunText(value.output, THEORY_RECORDING_MAX_RUN_OUTPUT_CHARS),
      error: normalizeRunText(value.error, THEORY_RECORDING_MAX_RUN_OUTPUT_CHARS),
    };
  }
  if (type === THEORY_RECORDING_EVENT_BOARD) {
    const action = normalizeText(value.action || '').trim();
    if (action === 'clear') {
      return {
        t,
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'clear',
      };
    }
    if (action === 'stroke') {
      const stroke = normalizeBoardStroke(value.stroke);
      if (!stroke) return null;
      return {
        t,
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'stroke',
        stroke,
      };
    }
    if (action === 'snapshot') {
      return {
        t,
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'snapshot',
        strokes: normalizeBoardStrokeList(value.strokes),
        images: normalizeBoardImageList(value.images),
      };
    }
    if (action === 'image') {
      const image = normalizeBoardImage(value.image);
      if (!image) return null;
      return {
        t,
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'image',
        image,
      };
    }
    if (action === 'display_mode') {
      return {
        t,
        type: THEORY_RECORDING_EVENT_BOARD,
        action: 'display_mode',
        mode: normalizeBoardDisplayMode(value.mode),
      };
    }
    return null;
  }
  return null;
};

const normalizeAudioSegment = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  const storageName = typeof value.storageName === 'string' ? value.storageName.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const sizeBytes = clampNonNegativeInt(value.sizeBytes);
  const durationMs = clampNonNegativeInt(value.durationMs);
  const hasFile = typeof File !== 'undefined' && value.file instanceof File;
  const file = hasFile ? value.file : null;
  const isNew = Boolean(value.isNew || hasFile);
  if (!url && !storageName && !name && !sizeBytes && !file) return null;
  return {
    url,
    storageName,
    name,
    sizeBytes,
    durationMs,
    isNew,
    file,
  };
};

const normalizeAudio = (value, fallbackDurationMs = 0) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rawSegments = Array.isArray(value.segments) ? value.segments : [];
  const normalizedSegments = rawSegments
    .map((item) => normalizeAudioSegment(item))
    .filter(Boolean);
  if (normalizedSegments.length === 0) {
    const legacySegment = normalizeAudioSegment({
      ...value,
      durationMs: clampNonNegativeInt(value.durationMs) || clampNonNegativeInt(fallbackDurationMs),
    });
    if (!legacySegment) return null;
    normalizedSegments.push(legacySegment);
  }
  const withDurations = normalizedSegments.map((segment, index) => {
    if (segment.durationMs > 0) return segment;
    if (normalizedSegments.length === 1) {
      return {
        ...segment,
        durationMs: clampNonNegativeInt(fallbackDurationMs),
      };
    }
    return {
      ...segment,
      durationMs: index === normalizedSegments.length - 1 ? clampNonNegativeInt(fallbackDurationMs) : 0,
    };
  });
  const firstSegment = withDurations[0] || null;
  const totalSizeBytes = withDurations.reduce((sum, segment) => sum + clampNonNegativeInt(segment.sizeBytes), 0);
  const hasAnyNewSegment = withDurations.some((segment) => segment.isNew);
  return {
    url: withDurations.length === 1 ? String(firstSegment?.url || '') : '',
    storageName: withDurations.length === 1 ? String(firstSegment?.storageName || '') : '',
    name: withDurations.length === 1
      ? String(firstSegment?.name || '')
      : `segments-${withDurations.length}`,
    sizeBytes: totalSizeBytes,
    durationMs: withDurations.reduce((sum, segment) => sum + clampNonNegativeInt(segment.durationMs), 0),
    isNew: hasAnyNewSegment,
    file: withDurations.length === 1 ? (firstSegment?.file || null) : null,
    segments: withDurations,
  };
};

export const normalizeTheoryRecording = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fallbackDurationMs = clampNonNegativeInt(value.durationMs);
  const events = (Array.isArray(value.events) ? value.events : [])
    .map((event) => normalizeEvent(event))
    .filter(Boolean)
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
  const audio = normalizeAudio(value.audio, fallbackDurationMs);
  return {
    version: clampNonNegativeInt(value.version) || THEORY_RECORDING_VERSION,
    initialCode: normalizeText(value.initialCode),
    durationMs: fallbackDurationMs,
    events,
    audio,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
};

export const isTheoryRecordingReady = (value) => {
  const recording = normalizeTheoryRecording(value);
  if (!recording) return false;
  if (!Array.isArray(recording.audio?.segments) || recording.audio.segments.length === 0) return false;
  if (!recording.audio.segments.some((segment) => segment?.url || segment?.file)) return false;
  return recording.events.length > 0;
};

export const getTheoryRecordingAudioSegments = (value) => {
  const recording = normalizeTheoryRecording(value);
  if (!recording || !Array.isArray(recording.audio?.segments)) return [];
  return recording.audio.segments.map((segment) => ({ ...segment }));
};

export const getTheoryRecordingStorageName = (theory) => {
  if (!theory || typeof theory !== 'object') return '';
  if (String(theory.type || '').trim() !== THEORY_RECORDING_TYPE) return '';
  const content = theory.content && typeof theory.content === 'object' ? theory.content : null;
  if (!content) return '';
  const normalized = normalizeTheoryRecording(content);
  return normalized?.audio?.segments?.[0]?.storageName || '';
};

export const getTheoryRecordingStorageNames = (theory) => {
  if (!theory || typeof theory !== 'object') return [];
  if (String(theory.type || '').trim() !== THEORY_RECORDING_TYPE) return [];
  const content = theory.content && typeof theory.content === 'object' ? theory.content : null;
  if (!content) return [];
  const normalized = normalizeTheoryRecording(content);
  return (Array.isArray(normalized?.audio?.segments) ? normalized.audio.segments : [])
    .map((segment) => String(segment?.storageName || '').trim())
    .filter(Boolean);
};

export const estimateTheoryRecordingSizeBytes = (value) => {
  try {
    const serialized = JSON.stringify(value || {});
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).length;
    return serialized.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

export const formatRecordingDuration = (value) => {
  const totalSeconds = Math.max(0, Math.floor(clampNonNegativeInt(value) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};
