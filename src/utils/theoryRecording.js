export const THEORY_RECORDING_TYPE = 'recording';
export const THEORY_RECORDING_VERSION = 1;
export const THEORY_RECORDING_EVENT_CODE = 'code';
export const THEORY_RECORDING_EVENT_SELECTION = 'selection';
export const THEORY_RECORDING_EVENT_BOARD = 'board';
export const THEORY_RECORDING_EVENT_RUN_OUTPUT = 'run_output';
export const THEORY_RECORDING_MAX_EVENTS = 12000;
export const THEORY_RECORDING_MAX_JSON_BYTES = 6 * 1024 * 1024;
const THEORY_RECORDING_MAX_RUN_INPUT_CHARS = 8000;
const THEORY_RECORDING_MAX_RUN_OUTPUT_CHARS = 120000;
const THEORY_RECORDING_MAX_BOARD_POINTS = 2400;
const THEORY_RECORDING_MAX_BOARD_STROKES = 360;

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
      };
    }
    return null;
  }
  return null;
};

const normalizeAudio = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  const storageName = typeof value.storageName === 'string' ? value.storageName.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const sizeBytes = clampNonNegativeInt(value.sizeBytes);
  const hasFile = typeof File !== 'undefined' && value.file instanceof File;
  const file = hasFile ? value.file : null;
  const isNew = Boolean(value.isNew || hasFile);
  if (!url && !storageName && !name && !sizeBytes && !file) return null;
  return {
    url,
    storageName,
    name,
    sizeBytes,
    isNew,
    file,
  };
};

export const normalizeTheoryRecording = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
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
  const audio = normalizeAudio(value.audio);
  return {
    version: clampNonNegativeInt(value.version) || THEORY_RECORDING_VERSION,
    initialCode: normalizeText(value.initialCode),
    durationMs: clampNonNegativeInt(value.durationMs),
    events,
    audio,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
};

export const isTheoryRecordingReady = (value) => {
  const recording = normalizeTheoryRecording(value);
  if (!recording) return false;
  if (!recording.audio?.url && !recording.audio?.file) return false;
  return recording.events.length > 0;
};

export const getTheoryRecordingStorageName = (theory) => {
  if (!theory || typeof theory !== 'object') return '';
  if (String(theory.type || '').trim() !== THEORY_RECORDING_TYPE) return '';
  const content = theory.content && typeof theory.content === 'object' ? theory.content : null;
  if (!content) return '';
  const normalized = normalizeTheoryRecording(content);
  return normalized?.audio?.storageName || '';
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
