import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer } from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import webpush from 'web-push';
import { WebSocketServer } from 'ws';
import yWsUtils from 'y-websocket/bin/utils';

const { setupWSConnection } = yWsUtils;
const require = createRequire(import.meta.url);
const Y = require('yjs');
let LeveldbPersistence = null;
try {
  ({ LeveldbPersistence } = require('y-leveldb'));
} catch (error) {
  console.warn('[collab] y-leveldb not available:', error?.message || error);
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5175;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolveStoragePath = (value, fallbackPath) => {
  if (typeof value !== 'string') return fallbackPath;
  const trimmed = value.trim();
  if (!trimmed) return fallbackPath;
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(__dirname, trimmed);
};
const defaultDataDir = path.join(__dirname, 'data');
const defaultUploadsDir = path.join(__dirname, 'uploads');
const dataDir = resolveStoragePath(
  process.env.PLATFORM_DATA_DIR || process.env.APP_DATA_DIR || process.env.DATA_DIR,
  defaultDataDir
);
const uploadsDir = resolveStoragePath(
  process.env.PLATFORM_UPLOADS_DIR || process.env.APP_UPLOADS_DIR || process.env.UPLOADS_DIR,
  defaultUploadsDir
);
const collabDir = resolveStoragePath(
  process.env.PLATFORM_COLLAB_DIR || process.env.APP_COLLAB_DIR,
  path.join(dataDir, 'collab')
);
const dataFile = path.join(dataDir, 'files.json');
const foldersFile = path.join(dataDir, 'folders.json');
const studentsFile = path.join(dataDir, 'students.json');
const teachersFile = path.join(dataDir, 'teachers.json');
const progressFile = path.join(dataDir, 'progress.json');
const testsFile = path.join(dataDir, 'tests.json');
const mockExamsFile = path.join(dataDir, 'mock-exams.json');
const taskTitlesFile = path.join(dataDir, 'task-titles.json');
const signupChatsFile = path.join(dataDir, 'signup-chats.json');
const authFile = path.join(dataDir, 'auth.json');
const authSessionsFile = path.join(dataDir, 'auth-sessions.json');
const usageFile = path.join(dataDir, 'usage.json');
const pushFile = path.join(dataDir, 'push.json');
const rtcPresenceDir = path.join(dataDir, 'rtc-presence');
const MAX_TASK_BYTES = 200 * 1024 * 1024;
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FOLDER_BYTES = 30 * 1024 * 1024;
const JSON_BODY_LIMIT = '20mb';
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;
const AUTH_SESSION_TTL_MS = (() => {
  const daysRaw = Number(process.env.AUTH_SESSION_TTL_DAYS);
  if (Number.isFinite(daysRaw) && daysRaw > 0) return Math.round(daysRaw * 24 * 60 * 60 * 1000);
  const hoursRaw = Number(process.env.AUTH_SESSION_TTL_HOURS);
  if (Number.isFinite(hoursRaw) && hoursRaw > 0) return Math.round(hoursRaw * 60 * 60 * 1000);
  return 30 * 24 * 60 * 60 * 1000;
})();
const AUTH_SESSION_SWEEP_MS = 10 * 60 * 1000;
const AUTH_SESSION_PERSIST_DEBOUNCE_MS = 5000;
const ADMIN_CODE = process.env.ADMIN_CODE || 'admin-7264';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Администратор';
const TEACHER_CODE = process.env.TEACHER_CODE || 'admin100';
const TEACHER_NAME = process.env.TEACHER_NAME || '\u0423\u0447\u0438\u0442\u0435\u043b\u044c';
const SIGNUP_DEFAULT_TEACHER_ID = String(
  process.env.SIGNUP_TEACHER_ID || process.env.DEFAULT_SIGNUP_TEACHER_ID || ''
).trim();
const SIGNUP_GUEST_NAME_MAX_LENGTH = 80;
const SIGNUP_GUEST_KEY_MAX_LENGTH = 120;
const SIGNUP_MESSAGE_MAX_LENGTH = 2000;
const SIGNUP_LAST_MESSAGE_PREVIEW_MAX_LENGTH = 160;
const STUDENT_TRAFFIC_LIMIT_BYTES = (() => {
  const bytesRaw = Number(process.env.STUDENT_TRAFFIC_LIMIT_BYTES);
  if (Number.isFinite(bytesRaw) && bytesRaw > 0) return bytesRaw;
  const gbRaw = Number(process.env.STUDENT_TRAFFIC_LIMIT_GB);
  if (Number.isFinite(gbRaw) && gbRaw > 0) return Math.round(gbRaw * 1024 * 1024 * 1024);
  return 2 * 1024 * 1024 * 1024;
})();
const STUDENT_TRAFFIC_WARN_RATIO = (() => {
  const ratio = Number(process.env.STUDENT_TRAFFIC_WARN_RATIO);
  if (Number.isFinite(ratio) && ratio > 0 && ratio < 1) return ratio;
  return 0.8;
})();
const LEVEL_WEIGHTS = {
  basic: 70,
  advanced: 20,
  expert: 10,
};
const LEGACY_PROGRESS_LEVEL_SEQUENCE = ['basic', 'advanced', 'expert'];
const SOFT_DELETE_DAYS = 30;
const SOFT_DELETE_TTL_MS = SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GAME_THEORY_TASK = 19;
const PYTHON_LEVEL_ID = 'python';
const TASK_XP_REWARDS = {
  1: 20,
  2: 50,
  3: 40,
  4: 30,
  5: 100,
  6: 100,
  7: 80,
  8: 350,
  9: 550,
  10: 10,
  11: 500,
  12: 120,
  13: 300,
  14: 300,
  15: 450,
  16: 150,
  17: 450,
  18: 250,
  19: 500,
  22: 300,
  23: 150,
  24: 700,
  25: 500,
  26: 800,
  27: 500,
};
const XP_PER_LEVEL = 1000;
const LEADERBOARD_WEEK_DAYS = 7;
const LEADERBOARD_ALIAS_MIN_LENGTH = 2;
const LEADERBOARD_ALIAS_MAX_LENGTH = 60;
const LEADERBOARD_PSEUDONYM_MIN_LENGTH = 2;
const LEADERBOARD_PSEUDONYM_MAX_LENGTH = 6;
const LEADERBOARD_PSEUDONYM_REGEX = /^[\u0410-\u042F\u0430-\u044F\u0401\u0451]+$/;
const LEADERBOARD_BLOCKED_WORD_PATTERNS = [
  /хуй/,
  /хуе/,
  /хер/,
  /пизд/,
  /бля/,
  /бляд/,
  /ебан/,
  /ебат/,
  /ебал/,
  /ебл/,
  /уеб/,
  /жоп/,
  /долбо/,
  /дроч/,
  /говн/,
  /мраз/,
  /сран/,
  /залуп/,
  /шмар/,
  /мудак/,
  /мудил/,
  /г[ао]ндон/,
  /пидор/,
  /пидр/,
  /сука/,
  /сучк/,
  /шлюх/,
  /чмо/,
];
const AUTH_COOKIE_NAME = 'ege_auth_token';
const PUSH_VAPID_SUBJECT = (() => {
  const raw = typeof process.env.PUSH_VAPID_SUBJECT === 'string'
    ? process.env.PUSH_VAPID_SUBJECT.trim()
    : '';
  if (raw) return raw;
  return 'mailto:no-reply@ege-platform.local';
})();
const PUSH_SWEEP_INTERVAL_MS = (() => {
  const raw = Number(process.env.PUSH_SWEEP_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 5 * 60 * 1000) return Math.floor(raw);
  return 30 * 60 * 1000;
})();
const PUSH_SWEEP_START_DELAY_MS = (() => {
  const raw = Number(process.env.PUSH_SWEEP_START_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 1000) return Math.floor(raw);
  return 45 * 1000;
})();
const PUSH_REMINDER_WINDOW_START_HOUR = (() => {
  const raw = Number(process.env.PUSH_REMINDER_WINDOW_START_HOUR);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 23) return Math.floor(raw);
  return 9;
})();
const PUSH_REMINDER_WINDOW_END_HOUR = (() => {
  const raw = Number(process.env.PUSH_REMINDER_WINDOW_END_HOUR);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 23) return Math.floor(raw);
  return 21;
})();
const PUSH_TTL_SECONDS = (() => {
  const raw = Number(process.env.PUSH_TTL_SECONDS);
  if (Number.isFinite(raw) && raw >= 60) return Math.floor(raw);
  return 60 * 60;
})();
const PUSH_REMINDER_MIN_INTERVAL_MS = (() => {
  const raw = Number(process.env.PUSH_REMINDER_MIN_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 2 * DAY_MS) return Math.floor(raw);
  return 2 * DAY_MS;
})();
const TEACHER_SOLVED_EVENTS_READ_LIMIT = 500;
const PYTHON_RUN_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.PYTHON_RUN_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 1000) return Math.floor(parsed);
  return 5000;
})();
const PYTHON_RUN_MAX_BUFFER_BYTES = (() => {
  const parsed = Number(process.env.PYTHON_RUN_MAX_BUFFER_BYTES);
  if (Number.isFinite(parsed) && parsed >= 1024) return Math.floor(parsed);
  return 512 * 1024;
})();
const PYTHON_RUN_MAX_CODE_CHARS = (() => {
  const parsed = Number(process.env.PYTHON_RUN_MAX_CODE_CHARS);
  if (Number.isFinite(parsed) && parsed >= 1000) return Math.floor(parsed);
  return 20000;
})();
const PYTHON_RUN_MAX_CONCURRENT = (() => {
  const parsed = Number(process.env.PYTHON_RUN_MAX_CONCURRENT);
  if (Number.isFinite(parsed) && parsed >= 1) return Math.floor(parsed);
  return 2;
})();
const PYTHON_RUNNER_SCRIPT = [
  'import ast',
  'import builtins as _builtins',
  'from base64 import b64decode',
  'import sys',
  'import traceback',
  'source = b64decode(sys.argv[1]).decode("utf-8", "replace")',
  'forbidden_names = {"__builtins__", "__import__", "open", "eval", "exec", "compile", "globals", "locals", "vars", "getattr", "setattr", "delattr", "breakpoint", "help"}',
  'forbidden_modules = {"os", "sys", "subprocess", "socket", "pathlib", "shutil", "ctypes", "inspect", "importlib", "pickle", "marshal"}',
  'forbidden_calls = {"__import__", "open", "eval", "exec", "compile", "globals", "locals", "vars", "getattr", "setattr", "delattr"}',
  'forbidden_nodes = (ast.Import, ast.ImportFrom, ast.With, ast.AsyncWith, ast.Try, ast.Raise, ast.Global, ast.Nonlocal, ast.ClassDef)',
  'tree = ast.parse(source, mode="exec")',
  'for node in ast.walk(tree):',
  '    if isinstance(node, forbidden_nodes):',
  '        raise RuntimeError("Недопустимая конструкция Python")',
  '    if isinstance(node, ast.Name) and node.id in forbidden_names:',
  '        raise RuntimeError("Недопустимое имя в коде")',
  '    if isinstance(node, ast.Attribute) and node.attr.startswith("__"):',
  '        raise RuntimeError("Недопустимый доступ к атрибуту")',
  '    if isinstance(node, ast.alias) and node.name.split(".")[0] in forbidden_modules:',
  '        raise RuntimeError("Импорт модулей запрещен")',
  '    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in forbidden_calls:',
  '        raise RuntimeError("Недопустимый вызов функции")',
  'safe_builtin_names = {',
  '    "abs", "all", "any", "bin", "bool", "chr", "dict", "divmod", "enumerate", "filter", "float", "hex",',
  '    "int", "len", "list", "map", "max", "min", "oct", "ord", "pow", "print", "range", "reversed",',
  '    "round", "set", "sorted", "str", "sum", "tuple", "zip", "input"',
  '}',
  'safe_builtins = {name: getattr(_builtins, name) for name in safe_builtin_names}',
  'globals_ns = {"__name__": "__main__", "__builtins__": safe_builtins}',
  'try:',
  '    exec(compile(tree, "<submitted>", "exec"), globals_ns, globals_ns)',
  'except Exception:',
  '    traceback.print_exc()',
  '    raise',
].join('\n');
const PYTHON_RUNNER_CANDIDATES = (() => {
  const envRunner = typeof process.env.PYTHON_EXECUTABLE === 'string'
    ? process.env.PYTHON_EXECUTABLE.trim()
    : '';
  const defaults = process.platform === 'win32'
    ? [
      { command: 'py', baseArgs: ['-3'] },
      { command: 'py', baseArgs: [] },
      { command: 'python', baseArgs: [] },
      { command: 'python3', baseArgs: [] },
    ]
    : [
      { command: 'python3', baseArgs: [] },
      { command: 'python', baseArgs: [] },
    ];
  if (!envRunner) return defaults;
  const normalized = envRunner.toLowerCase();
  return [
    { command: envRunner, baseArgs: [] },
    ...defaults.filter((item) => item.command.toLowerCase() !== normalized),
  ];
})();
let cachedPythonRunner = null;
let pythonRunnerResolved = false;
let pythonRunnerResolvePromise = null;
let pythonRunActiveCount = 0;
const pythonRunQueue = [];
let pushRuntimeEnabled = false;
let pushRuntimeConfigError = '';
let pushSweepInFlight = false;

const normalizeDayKey = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return trimmed;
};

const dayKeyToNumber = (dayKey) => {
  const normalized = normalizeDayKey(dayKey);
  if (!normalized) return NaN;
  const [year, month, day] = normalized.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return NaN;
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
};

const numberToDayKey = (dayNumber) => {
  if (!Number.isFinite(dayNumber)) return null;
  const ms = dayNumber * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
};

const getWeekStartKey = (dayKey) => {
  const dayNum = dayKeyToNumber(dayKey);
  if (!Number.isFinite(dayNum)) return null;
  const dt = new Date(dayNum * DAY_MS);
  const weekday = dt.getUTCDay(); // 0 = Sunday, 1 = Monday
  const mondayIndex = (weekday + 6) % 7; // Monday = 0
  return numberToDayKey(dayNum - mondayIndex);
};

const getDefaultStreak = () => ({
  current: 0,
  best: 0,
  lastActiveDay: null,
  freezeUsedWeekStart: null,
  freezeUsedDay: null,
});

const normalizeStreak = (value) => {
  if (!value || typeof value !== 'object') return getDefaultStreak();
  const current = Number(value.current);
  const best = Number(value.best);
  const normalized = {
    current: Number.isFinite(current) && current > 0 ? Math.floor(current) : 0,
    best: Number.isFinite(best) && best > 0 ? Math.floor(best) : 0,
    lastActiveDay: normalizeDayKey(value.lastActiveDay) || null,
    freezeUsedWeekStart: normalizeDayKey(value.freezeUsedWeekStart) || null,
    freezeUsedDay: normalizeDayKey(value.freezeUsedDay) || null,
  };
  if (normalized.best < normalized.current) normalized.best = normalized.current;
  return normalized;
};


fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(collabDir, { recursive: true });
fs.mkdirSync(rtcPresenceDir, { recursive: true });
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
if (isProduction && dataDir === defaultDataDir) {
  console.warn('[storage] PLATFORM_DATA_DIR is not set. Data can be lost after a clean deploy.');
}
if (isProduction && uploadsDir === defaultUploadsDir) {
  console.warn('[storage] PLATFORM_UPLOADS_DIR is not set. Uploads can be lost after a clean deploy.');
}
const rawCollabPersistence = LeveldbPersistence ? new LeveldbPersistence(collabDir) : null;
const isPersistedCollabDoc = (docName) => {
  if (typeof docName !== 'string') return false;
  const normalized = docName.trim();
  if (!normalized) return false;
  const base = normalized.split('/').pop() || normalized;
  return base.startsWith('board-') || base.startsWith('collab-');
};
const collabPersistence = rawCollabPersistence ? {
  bindState: async (docName, ydoc) => {
    if (!isPersistedCollabDoc(docName)) return Promise.resolve();
    try {
      const persistedYdoc = await rawCollabPersistence.getYDoc(docName);
      const localStateUpdate = Y.encodeStateAsUpdate(ydoc);
      await rawCollabPersistence.storeUpdate(docName, localStateUpdate);
      const persistedStateUpdate = Y.encodeStateAsUpdate(persistedYdoc);
      Y.applyUpdate(ydoc, persistedStateUpdate);
      if (typeof persistedYdoc.destroy === 'function') persistedYdoc.destroy();
      ydoc.on('update', (update) => {
        rawCollabPersistence.storeUpdate(docName, update).catch((error) => {
          console.warn('[collab] storeUpdate failed:', error?.message || error);
        });
      });
      return Promise.resolve();
    } catch (error) {
      console.warn('[collab] bindState failed:', error?.message || error);
      return Promise.resolve();
    }
  },
  writeState: async (docName, ydoc) => {
    if (!isPersistedCollabDoc(docName)) return Promise.resolve();
    try {
      const stateUpdate = Y.encodeStateAsUpdate(ydoc);
      await rawCollabPersistence.storeUpdate(docName, stateUpdate);
      return Promise.resolve();
    } catch (error) {
      console.warn('[collab] writeState failed:', error?.message || error);
      return Promise.resolve();
    }
  },
} : null;
if (collabPersistence && typeof yWsUtils?.setPersistence === 'function') {
  yWsUtils.setPersistence(collabPersistence);
}

app.use(express.json({ limit: JSON_BODY_LIMIT }));

const readFilesDb = () => {
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const normalizeUploadEntryName = (entry) => {
  if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') return false;
  const fixed = normalizeFileName(entry.name);
  if (!fixed || fixed === entry.name) return false;
  entry.name = fixed;
  return true;
};

const migrateFileNames = () => {
  const files = readFilesDb();
  let changed = false;
  for (const file of files) {
    if (normalizeUploadEntryName(file)) changed = true;
  }
  if (changed) writeFilesDb(files);
};

const migrateTestsFileNames = () => {
  const tests = readTestsDb();
  let changed = false;
  for (const taskLevels of Object.values(tests || {})) {
    if (!taskLevels || typeof taskLevels !== 'object') continue;
    for (const level of ['basic', 'advanced', 'expert']) {
      const questions = taskLevels[level];
      if (!Array.isArray(questions)) continue;
      for (const question of questions) {
        if (!question || typeof question !== 'object') continue;
        for (const field of ['files', 'screenshots']) {
          const items = question[field];
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            if (normalizeUploadEntryName(item)) changed = true;
          }
        }
      }
    }
  }
  if (changed) writeTestsDb(tests);
};

const migrateMockExamFileNames = () => {
  const exams = readMockExamsDb();
  let changed = false;
  for (const exam of exams) {
    if (!exam || typeof exam !== 'object') continue;
    const tasks = exam.tasks;
    if (!tasks || typeof tasks !== 'object') continue;
    for (const task of Object.values(tasks)) {
      if (!task || typeof task !== 'object') continue;
      for (const field of ['files', 'screenshots']) {
        const items = task[field];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (normalizeUploadEntryName(item)) changed = true;
        }
      }
    }
  }
  if (changed) writeMockExamsDb(exams);
};

const readFoldersDb = () => {
  try {
    const raw = fs.readFileSync(foldersFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const readStudentsDb = () => {
  try {
    const raw = fs.readFileSync(studentsFile, 'utf8');
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : [];
    return purgeExpiredDeletedStudents(list);
  } catch {
    return [];
  }
};

const readTeachersDb = () => {
  try {
    const raw = fs.readFileSync(teachersFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const readTaskTitlesDb = () => {
  try {
    const raw = fs.readFileSync(taskTitlesFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const readProgressDb = () => {
  try {
    const raw = fs.readFileSync(progressFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const writeFilesDb = (data) => {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeFoldersDb = (data) => {
  fs.writeFileSync(foldersFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeStudentsDb = (data) => {
  fs.writeFileSync(studentsFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeTeachersDb = (data) => {
  fs.writeFileSync(teachersFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeTaskTitlesDb = (data) => {
  fs.writeFileSync(taskTitlesFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeProgressDb = (data) => {
  fs.writeFileSync(progressFile, JSON.stringify(data, null, 2), 'utf8');
};

const readUsageDb = () => {
  try {
    const raw = fs.readFileSync(usageFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const writeUsageDb = (data) => {
  fs.writeFileSync(usageFile, JSON.stringify(data, null, 2), 'utf8');
};

const normalizePushSubscription = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const endpoint = typeof value.endpoint === 'string' ? value.endpoint.trim() : '';
  const keys = value.keys && typeof value.keys === 'object' && !Array.isArray(value.keys) ? value.keys : {};
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys.auth === 'string' ? keys.auth.trim() : '';
  if (!endpoint || !p256dh || !auth) return null;
  const expirationRaw = value.expirationTime;
  const expirationTime = Number.isFinite(Number(expirationRaw)) ? Number(expirationRaw) : null;
  return {
    endpoint,
    expirationTime,
    keys: {
      p256dh,
      auth,
    },
  };
};

const normalizePushStoredSubscription = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const subscription = normalizePushSubscription(value.subscription || value);
  if (!subscription) return null;
  const nowIso = new Date().toISOString();
  const createdAt = typeof value.createdAt === 'string' && value.createdAt.trim()
    ? value.createdAt.trim()
    : nowIso;
  const updatedAt = typeof value.updatedAt === 'string' && value.updatedAt.trim()
    ? value.updatedAt.trim()
    : createdAt;
  const userAgent = typeof value.userAgent === 'string'
    ? value.userAgent.slice(0, 500)
    : '';
  return {
    endpoint: subscription.endpoint,
    subscription,
    createdAt,
    updatedAt,
    userAgent,
  };
};

const normalizePushSubscriptionsByStudent = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([studentId, list]) => {
    const id = String(studentId || '').trim();
    if (!id || !Array.isArray(list)) return;
    const unique = [];
    const seen = new Set();
    list.forEach((item) => {
      const normalized = normalizePushStoredSubscription(item);
      if (!normalized || seen.has(normalized.endpoint)) return;
      seen.add(normalized.endpoint);
      unique.push(normalized);
    });
    if (unique.length > 0) {
      result[id] = unique;
    }
  });
  return result;
};

const normalizePushReminderEntry = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const homeworkId = typeof value.homeworkId === 'string' ? value.homeworkId.trim() : '';
  const lastSentAt = typeof value.lastSentAt === 'string' ? value.lastSentAt.trim() : '';
  const issuedAt = typeof value.issuedAt === 'string' ? value.issuedAt.trim() : '';
  const pendingCountRaw = Number(value.pendingCount);
  const pendingCount = Number.isFinite(pendingCountRaw) && pendingCountRaw >= 0
    ? Math.floor(pendingCountRaw)
    : 0;
  if (!homeworkId || !lastSentAt) return null;
  return {
    homeworkId,
    lastSentAt,
    issuedAt,
    pendingCount,
  };
};

const normalizePushRemindersByStudent = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([studentId, entry]) => {
    const id = String(studentId || '').trim();
    if (!id) return;
    const normalized = normalizePushReminderEntry(entry);
    if (!normalized) return;
    result[id] = normalized;
  });
  return result;
};

const normalizePushVapidKeys = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const publicKey = typeof value.publicKey === 'string' ? value.publicKey.trim() : '';
  const privateKey = typeof value.privateKey === 'string' ? value.privateKey.trim() : '';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
};

const getDefaultPushDb = () => ({
  vapidKeys: null,
  subscriptionsByStudent: {},
  remindersByStudent: {},
});

const readPushDb = () => {
  const fallback = getDefaultPushDb();
  try {
    const raw = fs.readFileSync(pushFile, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return fallback;
    }
    return {
      vapidKeys: normalizePushVapidKeys(data.vapidKeys),
      subscriptionsByStudent: normalizePushSubscriptionsByStudent(data.subscriptionsByStudent),
      remindersByStudent: normalizePushRemindersByStudent(data.remindersByStudent),
    };
  } catch {
    return fallback;
  }
};

const writePushDb = (data) => {
  const normalized = {
    vapidKeys: normalizePushVapidKeys(data?.vapidKeys),
    subscriptionsByStudent: normalizePushSubscriptionsByStudent(data?.subscriptionsByStudent),
    remindersByStudent: normalizePushRemindersByStudent(data?.remindersByStudent),
  };
  fs.writeFileSync(pushFile, JSON.stringify(normalized, null, 2), 'utf8');
};

const purgePushDataForStudents = (studentIds = []) => {
  const ids = Array.isArray(studentIds) ? studentIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (ids.length === 0) return;
  const pushDb = readPushDb();
  let changed = false;
  ids.forEach((studentId) => {
    if (pushDb.subscriptionsByStudent?.[studentId]) {
      delete pushDb.subscriptionsByStudent[studentId];
      changed = true;
    }
    if (pushDb.remindersByStudent?.[studentId]) {
      delete pushDb.remindersByStudent[studentId];
      changed = true;
    }
  });
  if (changed) writePushDb(pushDb);
};

const isStudentDeleted = (student) => Boolean(student?.deletedAt);
const isActiveStudent = (student) => Boolean(student && !student.deletedAt);

const hardDeleteStudentData = (studentIds = []) => {
  const ids = Array.isArray(studentIds) ? studentIds.filter(Boolean) : [];
  if (ids.length === 0) return;
  const idSet = new Set(ids);

  const files = readFilesDb();
  const remainingFiles = [];
  const removedFiles = [];
  for (const file of files) {
    if (idSet.has(file.studentId)) removedFiles.push(file);
    else remainingFiles.push(file);
  }
  if (removedFiles.length > 0) {
    writeFilesDb(remainingFiles);
    for (const file of removedFiles) {
      if (file?.storageName) {
        const filePath = path.join(uploadsDir, file.storageName);
        fs.unlink(filePath, () => {});
      }
    }
  }

  const folders = readFoldersDb().filter((folder) => !idSet.has(folder.studentId));
  writeFoldersDb(folders);

  const progressDb = readProgressDb();
  let progressChanged = false;
  ids.forEach((id) => {
    if (progressDb[id]) {
      delete progressDb[id];
      progressChanged = true;
    }
  });
  if (progressChanged) writeProgressDb(progressDb);

  const usageDb = readUsageDb();
  let usageChanged = false;
  ids.forEach((id) => {
    if (usageDb[id]) {
      delete usageDb[id];
      usageChanged = true;
    }
  });
  if (usageChanged) writeUsageDb(usageDb);

  purgePushDataForStudents(ids);
};

const purgeExpiredDeletedStudents = (students = []) => {
  if (!Array.isArray(students) || students.length === 0) return students;
  const now = Date.now();
  const expired = [];
  const remaining = [];
  students.forEach((student) => {
    if (student?.deletedAt) {
      const deletedAtMs = Date.parse(student.deletedAt);
      if (Number.isFinite(deletedAtMs) && now - deletedAtMs > SOFT_DELETE_TTL_MS) {
        expired.push(student);
        return;
      }
    }
    remaining.push(student);
  });
  if (expired.length > 0) {
    writeStudentsDb(remaining);
    hardDeleteStudentData(expired.map((student) => student.id));
  }
  return remaining;
};

const readTestsDb = () => {
  try {
    const raw = fs.readFileSync(testsFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const writeTestsDb = (data) => {
  fs.writeFileSync(testsFile, JSON.stringify(data, null, 2), 'utf8');
};

const readMockExamsDb = () => {
  try {
    const raw = fs.readFileSync(mockExamsFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const writeMockExamsDb = (data) => {
  fs.writeFileSync(mockExamsFile, JSON.stringify(data, null, 2), 'utf8');
};

const normalizeSignupGuestName = (name) => {
  if (typeof name !== 'string') return '';
  return name.trim();
};

const normalizeSignupGuestKey = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().slice(0, SIGNUP_GUEST_KEY_MAX_LENGTH);
  if (!normalized) return '';
  return /^[A-Za-z0-9_-]+$/.test(normalized) ? normalized : '';
};

const normalizeSignupMessageText = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return normalized.slice(0, SIGNUP_MESSAGE_MAX_LENGTH);
};

const normalizeIsoTimestamp = (value, fallback = '') => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return fallback;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
};

const normalizeSignupMessage = (value) => {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const senderRole = value.senderRole === 'teacher' ? 'teacher' : 'lead';
  const senderId = typeof value.senderId === 'string' ? value.senderId.trim() : '';
  const senderNameRaw = typeof value.senderName === 'string' ? value.senderName.trim() : '';
  const text = normalizeSignupMessageText(value.text);
  const createdAt = normalizeIsoTimestamp(value.createdAt, '');
  if (!id || !senderId || !text || !createdAt) return null;
  const senderName = senderNameRaw || (senderRole === 'teacher' ? 'Преподаватель' : 'Гость');
  return {
    id,
    senderRole,
    senderId,
    senderName,
    text,
    createdAt,
  };
};

const normalizeSignupChat = (value) => {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const teacherId = typeof value.teacherId === 'string' ? value.teacherId.trim() : '';
  const guestUserId = typeof value.guestUserId === 'string' ? value.guestUserId.trim() : '';
  const guestKey = normalizeSignupGuestKey(value.guestKey);
  const guestName = normalizeSignupGuestName(value.guestName);
  if (!id || !teacherId || !guestUserId || !guestName) return null;

  const messages = Array.isArray(value.messages)
    ? value.messages.map((item) => normalizeSignupMessage(item)).filter(Boolean)
    : [];
  const lastMessage = messages[messages.length - 1] || null;
  const createdAt = normalizeIsoTimestamp(value.createdAt, lastMessage?.createdAt || new Date().toISOString());
  const updatedAt = normalizeIsoTimestamp(value.updatedAt, lastMessage?.createdAt || createdAt);
  const lastMessageAt = normalizeIsoTimestamp(value.lastMessageAt, lastMessage?.createdAt || updatedAt);
  const lastMessagePreviewRaw = typeof value.lastMessagePreview === 'string'
    ? value.lastMessagePreview.replace(/\s+/g, ' ').trim()
    : '';
  const lastMessagePreview = (lastMessagePreviewRaw || lastMessage?.text || '').slice(0, SIGNUP_LAST_MESSAGE_PREVIEW_MAX_LENGTH);
  const lastMessageSenderRole = value.lastMessageSenderRole === 'teacher' || value.lastMessageSenderRole === 'lead'
    ? value.lastMessageSenderRole
    : (lastMessage?.senderRole || '');
  const lastReadByTeacherAt = normalizeIsoTimestamp(value.lastReadByTeacherAt, '') || null;
  const lastReadByLeadAt = normalizeIsoTimestamp(value.lastReadByLeadAt, '') || null;

  return {
    id,
    teacherId,
    guestUserId,
    guestKey,
    guestName,
    createdAt,
    updatedAt,
    lastMessageAt,
    lastMessagePreview,
    lastMessageSenderRole,
    lastReadByTeacherAt,
    lastReadByLeadAt,
    messages,
  };
};

const readSignupChatsDb = () => {
  try {
    const raw = fs.readFileSync(signupChatsFile, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((entry) => normalizeSignupChat(entry)).filter(Boolean);
  } catch {
    return [];
  }
};

const writeSignupChatsDb = (data) => {
  const safeData = Array.isArray(data)
    ? data.map((entry) => normalizeSignupChat(entry)).filter(Boolean)
    : [];
  fs.writeFileSync(signupChatsFile, JSON.stringify(safeData, null, 2), 'utf8');
};

const getSignupChatSortTimestamp = (chat) => {
  const raw = chat?.lastMessageAt || chat?.updatedAt || chat?.createdAt || '';
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getSignupUnreadForTeacher = (chat) => {
  if (!chat || !Array.isArray(chat.messages) || chat.messages.length === 0) return 0;
  const lastReadRaw = chat.lastReadByTeacherAt || '';
  const lastReadAt = Date.parse(lastReadRaw);
  return chat.messages.reduce((count, message) => {
    if (!message || message.senderRole !== 'lead') return count;
    if (!Number.isFinite(lastReadAt)) return count + 1;
    const messageAt = Date.parse(message.createdAt || '');
    if (!Number.isFinite(messageAt)) return count + 1;
    return messageAt > lastReadAt ? count + 1 : count;
  }, 0);
};

const getSignupUnreadForLead = (chat) => {
  if (!chat || !Array.isArray(chat.messages) || chat.messages.length === 0) return 0;
  const lastReadRaw = chat.lastReadByLeadAt || '';
  const lastReadAt = Date.parse(lastReadRaw);
  return chat.messages.reduce((count, message) => {
    if (!message || message.senderRole !== 'teacher') return count;
    if (!Number.isFinite(lastReadAt)) return count + 1;
    const messageAt = Date.parse(message.createdAt || '');
    if (!Number.isFinite(messageAt)) return count + 1;
    return messageAt > lastReadAt ? count + 1 : count;
  }, 0);
};

const buildSignupChatSummary = (chat) => ({
  id: chat.id,
  teacherId: chat.teacherId,
  guestName: chat.guestName,
  guestUserId: chat.guestUserId,
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
  lastMessageAt: chat.lastMessageAt,
  lastMessagePreview: chat.lastMessagePreview || '',
  lastMessageSenderRole: chat.lastMessageSenderRole || '',
  unreadForTeacher: getSignupUnreadForTeacher(chat),
  messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
});

const normalizeMockExamAccess = (access, fallbackAll = true) => {
  if (!access || typeof access !== 'object') {
    return { all: fallbackAll, students: [] };
  }
  const students = Array.isArray(access.students)
    ? access.students.map((id) => String(id)).filter(Boolean)
    : [];
  return { all: Boolean(access.all), students };
};

const normalizeMockExamAccessForSave = (access) => {
  const normalized = normalizeMockExamAccess(access, false);
  if (normalized.all) {
    return { all: true, students: [] };
  }
  return { all: false, students: normalized.students };
};

const isMockExamVisibleToStudent = (exam, studentId) => {
  if (!exam) return false;
  const access = normalizeMockExamAccess(exam.access, true);
  if (access.all) return true;
  if (!studentId) return false;
  return access.students.includes(String(studentId));
};

const getMonthKey = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getStudentUsage = (studentId) => {
  const monthKey = getMonthKey();
  const db = readUsageDb();
  const used = Number(db?.[studentId]?.[monthKey]) || 0;
  const limit = STUDENT_TRAFFIC_LIMIT_BYTES;
  const remaining = Math.max(0, limit - used);
  return { monthKey, used, limit, remaining };
};

const addStudentUsage = (studentId, bytes) => {
  if (!studentId || !Number.isFinite(bytes) || bytes <= 0) return;
  const monthKey = getMonthKey();
  const db = readUsageDb();
  const studentEntry = db[studentId] && typeof db[studentId] === 'object' ? db[studentId] : {};
  const used = Number(studentEntry[monthKey]) || 0;
  studentEntry[monthKey] = used + bytes;
  db[studentId] = studentEntry;
  writeUsageDb(db);
  return studentEntry[monthKey];
};

const getRangeSize = (rangeHeader, totalSize) => {
  if (!rangeHeader || typeof rangeHeader !== 'string') return totalSize;
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return totalSize;
  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && endRaw) {
    const tail = Number(endRaw);
    if (Number.isFinite(tail) && tail > 0) return Math.min(totalSize, tail);
    return totalSize;
  }
  const start = Number(startRaw);
  const end = endRaw ? Number(endRaw) : totalSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    return totalSize;
  }
  return Math.min(totalSize, end - start + 1);
};

const registerUsageOnFinish = (studentId, res, fallbackBytes) => {
  if (!studentId) return;
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const headerLen = Number(res.getHeader('Content-Length'));
    const bytes = Number.isFinite(headerLen) && headerLen > 0 ? headerLen : fallbackBytes;
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    addStudentUsage(studentId, bytes);
  });
};

const readAuthDb = () => {
  try {
    const raw = fs.readFileSync(authFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
};

const writeAuthDb = (data) => {
  fs.writeFileSync(authFile, JSON.stringify(data, null, 2), 'utf8');
};

const normalizeAccessCode = (value) => (typeof value === 'string' ? value.trim() : '');

const hashCode = (code) => {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(code, salt, 64).toString('base64');
  return `scrypt$${salt}$${hash}`;
};

const verifyCode = (code, stored) => {
  if (!code || typeof stored !== 'string') return false;
  const [method, salt, hash] = stored.split('$');
  if (method !== 'scrypt' || !salt || !hash) return false;
  const derived = crypto.scryptSync(code, salt, 64);
  const storedBuf = Buffer.from(hash, 'base64');
  if (storedBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(storedBuf, derived);
};

const getCodeHint = (code) => {
  const normalized = normalizeAccessCode(code);
  if (!normalized) return '';
  return normalized.slice(-4);
};

const ensureAdminAuth = () => {
  const existing = readAuthDb();
  if (existing?.adminCodeHash) return existing;
  const seedCode = normalizeAccessCode(ADMIN_CODE) || 'admin-root';
  const next = {
    adminCodeHash: hashCode(seedCode),
    updatedAt: new Date().toISOString(),
  };
  writeAuthDb(next);
  return next;
};

const authSessions = new Map();
let authSessionsPersistTimer = null;

const readAuthSessionsDb = () => {
  try {
    const raw = fs.readFileSync(authSessionsFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const writeAuthSessionsDb = (sessions) => {
  fs.writeFileSync(authSessionsFile, JSON.stringify(sessions, null, 2), 'utf8');
};

const serializeAuthSessionForStorage = (session) => ({
  token: session.token,
  user: session.user,
  createdAtMs: session.createdAtMs,
  expiresAtMs: session.expiresAtMs,
});

const persistAuthSessions = () => {
  try {
    const payload = Array.from(authSessions.values()).map((session) => serializeAuthSessionForStorage(session));
    writeAuthSessionsDb(payload);
  } catch (error) {
    console.error('[auth] failed to persist sessions:', error);
  }
};

const schedulePersistAuthSessions = () => {
  if (authSessionsPersistTimer) return;
  authSessionsPersistTimer = setTimeout(() => {
    authSessionsPersistTimer = null;
    persistAuthSessions();
  }, AUTH_SESSION_PERSIST_DEBOUNCE_MS);
  if (typeof authSessionsPersistTimer.unref === 'function') authSessionsPersistTimer.unref();
};

const createAuthToken = () => crypto.randomBytes(32).toString('hex');

const buildSessionUser = (user) => {
  if (!user || typeof user !== 'object') return null;
  const role = String(user.role || '');
  const id = String(user.id || '');
  const name = typeof user.name === 'string' ? user.name : '';
  if (!['admin', 'teacher', 'student', 'lead'].includes(role) || !id || !name) return null;
  const payload = { id, name, role };
  if (role === 'student') {
    payload.teacherId = user.teacherId ? String(user.teacherId) : null;
  }
  if (role === 'lead') {
    const chatId = typeof user.chatId === 'string' ? user.chatId.trim() : '';
    if (!chatId) return null;
    payload.chatId = chatId;
    payload.teacherId = user.teacherId ? String(user.teacherId) : null;
  }
  return payload;
};

const normalizeStoredAuthSession = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const token = typeof entry.token === 'string' ? entry.token.trim() : '';
  const user = buildSessionUser(entry.user);
  const createdAtMs = Number(entry.createdAtMs);
  const expiresAtMs = Number(entry.expiresAtMs);
  if (!token || !user || !Number.isFinite(expiresAtMs)) return null;
  return {
    token,
    user,
    createdAtMs: Number.isFinite(createdAtMs) ? Math.floor(createdAtMs) : Date.now(),
    expiresAtMs: Math.floor(expiresAtMs),
  };
};

const getAuthSessionFromStorage = (token) => {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken) return null;
  const now = Date.now();
  const entries = readAuthSessionsDb();
  for (const entry of entries) {
    const normalized = normalizeStoredAuthSession(entry);
    if (!normalized) continue;
    if (normalized.expiresAtMs <= now) continue;
    if (normalized.token !== normalizedToken) continue;
    authSessions.set(normalizedToken, normalized);
    return normalized;
  }
  return null;
};

const deleteAuthSessionFromStorage = (token) => {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken) return false;
  const now = Date.now();
  const entries = readAuthSessionsDb();
  if (!entries.length) return false;
  let changed = false;
  const next = [];
  entries.forEach((entry) => {
    const normalized = normalizeStoredAuthSession(entry);
    if (!normalized) {
      changed = true;
      return;
    }
    if (normalized.expiresAtMs <= now) {
      changed = true;
      return;
    }
    if (normalized.token === normalizedToken) {
      changed = true;
      return;
    }
    next.push(normalized);
  });
  if (!changed) return false;
  try {
    writeAuthSessionsDb(next.map((session) => serializeAuthSessionForStorage(session)));
    return true;
  } catch (error) {
    console.error('[auth] failed to delete session from storage:', error);
    return false;
  }
};

const resolveSessionUser = (sessionUser) => {
  const role = String(sessionUser?.role || '');
  if (role === 'admin') {
    return { id: 'admin1', name: ADMIN_NAME, role: 'admin' };
  }
  if (role === 'teacher') {
    const teacher = readTeachersDb().find((entry) => entry.id === String(sessionUser.id));
    if (!teacher) return null;
    return { id: teacher.id, name: teacher.name, role: 'teacher' };
  }
  if (role === 'student') {
    const student = readStudentsDb().find((entry) => entry.id === String(sessionUser.id) && !entry.deletedAt);
    if (!student) return null;
    return {
      id: student.id,
      name: student.name,
      role: 'student',
      teacherId: student.teacherId || null,
    };
  }
  if (role === 'lead') {
    const chatId = typeof sessionUser?.chatId === 'string' ? sessionUser.chatId.trim() : '';
    const leadId = String(sessionUser?.id || '').trim();
    if (!chatId || !leadId) return null;
    const chat = readSignupChatsDb().find((entry) => entry.id === chatId && entry.guestUserId === leadId);
    if (!chat) return null;
    return {
      id: chat.guestUserId,
      name: chat.guestName,
      role: 'lead',
      chatId: chat.id,
      teacherId: chat.teacherId || null,
    };
  }
  return null;
};

const hydrateAuthSessions = () => {
  const now = Date.now();
  let hadExpired = false;
  readAuthSessionsDb().forEach((entry) => {
    const normalized = normalizeStoredAuthSession(entry);
    if (!normalized) return;
    if (normalized.expiresAtMs <= now) {
      hadExpired = true;
      return;
    }
    authSessions.set(normalized.token, normalized);
  });
  if (hadExpired) persistAuthSessions();
};

const deleteAuthSession = (token) => {
  if (!token) return false;
  const deleted = authSessions.delete(token);
  if (deleted) {
    persistAuthSessions();
    return true;
  }
  return deleteAuthSessionFromStorage(token);
};

const purgeExpiredAuthSessions = () => {
  const now = Date.now();
  let changed = false;
  for (const [token, session] of authSessions.entries()) {
    if (!session || !Number.isFinite(session.expiresAtMs) || session.expiresAtMs <= now) {
      authSessions.delete(token);
      changed = true;
    }
  }
  if (changed) persistAuthSessions();
};

const authSessionSweepTimer = setInterval(purgeExpiredAuthSessions, AUTH_SESSION_SWEEP_MS);
if (typeof authSessionSweepTimer.unref === 'function') {
  authSessionSweepTimer.unref();
}

const createAuthSession = (user) => {
  const payload = buildSessionUser(user);
  if (!payload) return null;
  const now = Date.now();
  const session = {
    token: createAuthToken(),
    user: payload,
    createdAtMs: now,
    expiresAtMs: now + AUTH_SESSION_TTL_MS,
  };
  authSessions.set(session.token, session);
  persistAuthSessions();
  return session;
};

const touchAuthSession = (session) => {
  if (!session) return;
  session.expiresAtMs = Date.now() + AUTH_SESSION_TTL_MS;
  schedulePersistAuthSessions();
};

const getAuthSession = (token) => {
  if (!token) return null;
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken) return null;
  const session = authSessions.get(normalizedToken) || getAuthSessionFromStorage(normalizedToken);
  if (!session) return null;
  if (!Number.isFinite(session.expiresAtMs) || session.expiresAtMs <= Date.now()) {
    deleteAuthSession(normalizedToken);
    return null;
  }
  const user = resolveSessionUser(session.user);
  if (!user) {
    deleteAuthSession(normalizedToken);
    return null;
  }
  session.user = user;
  touchAuthSession(session);
  return session;
};

const serializeAuthSession = (session) => ({
  ...session.user,
});

const parseCookies = (cookieHeader) => {
  if (typeof cookieHeader !== 'string' || !cookieHeader.trim()) return {};
  return cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, chunk) => {
      const eqIndex = chunk.indexOf('=');
      if (eqIndex <= 0) return acc;
      const key = chunk.slice(0, eqIndex).trim();
      const valueRaw = chunk.slice(eqIndex + 1).trim();
      if (!key) return acc;
      try {
        acc[key] = decodeURIComponent(valueRaw);
      } catch {
        acc[key] = valueRaw;
      }
      return acc;
    }, {});
};

const appendSetCookie = (res, cookieValue) => {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieValue]);
    return;
  }
  res.setHeader('Set-Cookie', [String(existing), cookieValue]);
};

const setAuthSessionCookie = (res, session) => {
  if (!session?.token || !Number.isFinite(session.expiresAtMs)) return;
  const maxAgeSec = Math.max(0, Math.floor((session.expiresAtMs - Date.now()) / 1000));
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(session.token)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    cookieParts.push('Secure');
  }
  appendSetCookie(res, cookieParts.join('; '));
};

const clearAuthSessionCookie = (res) => {
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    cookieParts.push('Secure');
  }
  appendSetCookie(res, cookieParts.join('; '));
};

const respondWithSession = (res, session) => {
  if (!session) return res.status(500).json({ error: 'Ошибка сервера' });
  setAuthSessionCookie(res, session);
  return res.json(serializeAuthSession(session));
};

const getAuthTokenFromRequest = (req) => {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) return match[1].trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = typeof cookies?.[AUTH_COOKIE_NAME] === 'string'
    ? cookies[AUTH_COOKIE_NAME].trim()
    : '';
  if (cookieToken) {
    return cookieToken;
  }
  return '';
};

const isAdminRole = (auth) => auth?.role === 'admin';
const isTeacherRole = (auth) => auth?.role === 'teacher';
const isStudentRole = (auth) => auth?.role === 'student';
const isLeadRole = (auth) => auth?.role === 'lead';
const isStaffRole = (auth) => isAdminRole(auth) || isTeacherRole(auth);

const findTeacherById = (teacherId) => {
  if (!teacherId) return null;
  const id = String(teacherId);
  return readTeachersDb().find((teacher) => teacher.id === id) || null;
};

const findStudentById = (studentId, options = {}) => {
  if (!studentId) return null;
  const allowDeleted = Boolean(options.allowDeleted);
  const id = String(studentId);
  const student = readStudentsDb().find((entry) => entry.id === id);
  if (!student) return null;
  if (!allowDeleted && student.deletedAt) return null;
  return student;
};

const resolveSignupTeacher = (requestedTeacherId = '') => {
  const teachers = readTeachersDb();
  if (teachers.length === 0) return null;

  const requestedId = String(requestedTeacherId || '').trim();
  if (requestedId) {
    const requested = teachers.find((teacher) => teacher.id === requestedId);
    if (requested) return requested;
  }

  if (SIGNUP_DEFAULT_TEACHER_ID) {
    const configured = teachers.find((teacher) => teacher.id === SIGNUP_DEFAULT_TEACHER_ID);
    if (configured) return configured;
  }

  if (teachers.length === 1) return teachers[0];

  const activeStudents = readStudentsDb().filter((student) => student && !student.deletedAt);
  const studentsByTeacherId = activeStudents.reduce((acc, student) => {
    const teacherId = typeof student.teacherId === 'string' ? student.teacherId.trim() : '';
    if (!teacherId) return acc;
    acc.set(teacherId, (acc.get(teacherId) || 0) + 1);
    return acc;
  }, new Map());

  const ranked = [...teachers].sort((left, right) => {
    const leftStudents = studentsByTeacherId.get(left.id) || 0;
    const rightStudents = studentsByTeacherId.get(right.id) || 0;
    if (leftStudents !== rightStudents) return rightStudents - leftStudents;
    const leftCreated = Date.parse(left?.createdAt || '');
    const rightCreated = Date.parse(right?.createdAt || '');
    if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) {
      return leftCreated - rightCreated;
    }
    return String(left?.name || '').localeCompare(String(right?.name || ''), 'ru');
  });

  return ranked[0] || null;
};

const getSignupChatAccessError = (auth, chat) => {
  if (!auth || !chat) return 'Недостаточно прав';
  if (isAdminRole(auth)) return '';
  if (isTeacherRole(auth)) {
    return chat.teacherId === auth.id ? '' : 'Недостаточно прав';
  }
  if (isLeadRole(auth)) {
    const authChatId = typeof auth.chatId === 'string' ? auth.chatId.trim() : '';
    const authLeadId = typeof auth.id === 'string' ? auth.id.trim() : '';
    if (!authChatId || !authLeadId) return 'Недостаточно прав';
    return (authChatId === chat.id && authLeadId === chat.guestUserId) ? '' : 'Недостаточно прав';
  }
  return 'Недостаточно прав';
};

const ensureSignupChatAccess = (req, res, chatId, options = {}) => {
  const required = options.required !== false;
  const id = String(chatId || '').trim();
  if (!id) {
    if (required) res.status(400).json({ error: 'chatId required' });
    return null;
  }
  const chats = Array.isArray(options.chats) ? options.chats : readSignupChatsDb();
  const index = chats.findIndex((entry) => entry?.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Чат не найден' });
    return null;
  }
  const chat = chats[index];
  const accessError = getSignupChatAccessError(req.auth, chat);
  if (accessError) {
    res.status(403).json({ error: accessError });
    return null;
  }
  return { chat, chats, index };
};

const createSignupChatMessage = ({ senderRole, senderId, senderName, text }) => ({
  id: crypto.randomUUID(),
  senderRole: senderRole === 'teacher' ? 'teacher' : 'lead',
  senderId: String(senderId || '').trim(),
  senderName: String(senderName || '').trim(),
  text: normalizeSignupMessageText(text),
  createdAt: new Date().toISOString(),
});

const appendSignupChatMessage = (chat, message) => {
  if (!chat || !message || !message.text || !message.senderId) return chat;
  const nextMessages = [...(Array.isArray(chat.messages) ? chat.messages : []), message];
  const preview = message.text.replace(/\s+/g, ' ').trim().slice(0, SIGNUP_LAST_MESSAGE_PREVIEW_MAX_LENGTH);
  const next = {
    ...chat,
    messages: nextMessages,
    updatedAt: message.createdAt,
    lastMessageAt: message.createdAt,
    lastMessagePreview: preview,
    lastMessageSenderRole: message.senderRole,
  };
  if (message.senderRole === 'teacher') {
    next.lastReadByTeacherAt = message.createdAt;
  }
  if (message.senderRole === 'lead') {
    next.lastReadByLeadAt = message.createdAt;
  }
  return next;
};

const markSignupChatReadByTeacher = (chat) => {
  if (!chat) return { chat, changed: false };
  if (getSignupUnreadForTeacher(chat) <= 0) return { chat, changed: false };
  const nowIso = new Date().toISOString();
  return {
    changed: true,
    chat: { ...chat, lastReadByTeacherAt: nowIso },
  };
};

const markSignupChatReadByLead = (chat) => {
  if (!chat) return { chat, changed: false };
  if (getSignupUnreadForLead(chat) <= 0) return { chat, changed: false };
  const nowIso = new Date().toISOString();
  return {
    changed: true,
    chat: { ...chat, lastReadByLeadAt: nowIso },
  };
};

const isLeadAllowedApiRequest = (req) => {
  const method = String(req?.method || '').toUpperCase();
  const apiPath = String(req?.path || '').trim();
  if (!apiPath) return false;
  if (apiPath === '/signup-chat/messages') return method === 'GET' || method === 'POST';
  return false;
};

const canAccessStudentByRole = (auth, student, options = {}) => {
  if (!auth || !student) return false;
  const allowDeleted = Boolean(options.allowDeleted);
  if (!allowDeleted && student.deletedAt) return false;
  if (isAdminRole(auth)) return true;
  if (isTeacherRole(auth)) return student.teacherId === auth.id;
  if (isStudentRole(auth)) return !student.deletedAt && student.id === auth.id;
  return false;
};

const ensureStudentAccess = (req, res, studentId, options = {}) => {
  const required = options.required !== false;
  const allowDeleted = Boolean(options.allowDeleted);
  const missingError = options.missingError || 'studentId required';
  const id = String(studentId || '').trim();
  if (!id) {
    if (required) {
      res.status(400).json({ error: missingError });
    }
    return null;
  }
  const student = findStudentById(id, { allowDeleted });
  if (!student) {
    res.status(404).json({ error: 'Ученик не найден' });
    return null;
  }
  if (!canAccessStudentByRole(req.auth, student, { allowDeleted })) {
    res.status(403).json({ error: 'Недостаточно прав' });
    return null;
  }
  return student;
};

const ensureTeacherAccess = (req, res, teacherId, options = {}) => {
  const required = options.required !== false;
  const missingError = options.missingError || 'teacherId required';
  const id = String(teacherId || '').trim();
  if (!id) {
    if (required) {
      res.status(400).json({ error: missingError });
    }
    return null;
  }
  const teacher = findTeacherById(id);
  if (!teacher) {
    res.status(404).json({ error: 'Учитель не найден' });
    return null;
  }
  if (isAdminRole(req.auth)) return teacher;
  if (isTeacherRole(req.auth) && req.auth.id === id) return teacher;
  res.status(403).json({ error: 'Недостаточно прав' });
  return null;
};

const normalizeTeacherSolvedEventIds = (value) => {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];
  list.forEach((item) => {
    const id = typeof item === 'string' ? item.trim() : '';
    if (!id || seen.has(id)) return;
    seen.add(id);
    normalized.push(id);
  });
  if (normalized.length > TEACHER_SOLVED_EVENTS_READ_LIMIT) {
    return normalized.slice(normalized.length - TEACHER_SOLVED_EVENTS_READ_LIMIT);
  }
  return normalized;
};

const getTeacherSolvedEventReadIdSet = (teacher) => (
  new Set(normalizeTeacherSolvedEventIds(teacher?.readSolvedEventIds))
);

const markTeacherSolvedEventsRead = (teacherId, eventIds = []) => {
  const id = String(teacherId || '').trim();
  if (!id) return null;
  const incoming = normalizeTeacherSolvedEventIds(eventIds);
  if (incoming.length === 0) return null;

  const teachers = readTeachersDb();
  const idx = teachers.findIndex((entry) => entry.id === id);
  if (idx === -1) return null;

  const current = normalizeTeacherSolvedEventIds(teachers[idx]?.readSolvedEventIds);
  const seen = new Set(current);
  let changed = !Array.isArray(teachers[idx]?.readSolvedEventIds);

  incoming.forEach((eventId) => {
    if (seen.has(eventId)) return;
    seen.add(eventId);
    current.push(eventId);
    changed = true;
  });

  let nextReadIds = current;
  if (nextReadIds.length > TEACHER_SOLVED_EVENTS_READ_LIMIT) {
    nextReadIds = nextReadIds.slice(nextReadIds.length - TEACHER_SOLVED_EVENTS_READ_LIMIT);
    changed = true;
  }

  if (changed) {
    teachers[idx] = { ...teachers[idx], readSolvedEventIds: nextReadIds };
    writeTeachersDb(teachers);
  }

  return {
    ...teachers[idx],
    readSolvedEventIds: nextReadIds,
  };
};

const forbid = (res) => res.status(403).json({ error: 'Недостаточно прав' });
const ensureStaffWriteAccess = (req, res) => {
  if (!isStaffRole(req.auth)) {
    forbid(res);
    return false;
  }
  return true;
};

const loginAttempts = new Map();

const getClientKey = (req) => req.ip || req.connection?.remoteAddress || 'unknown';

const getRateInfo = (key) => {
  const entry = loginAttempts.get(key);
  if (!entry) return { blocked: false };
  const now = Date.now();
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  if (now - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return { blocked: false };
  }
  return { blocked: false };
};

const registerLoginFailure = (key) => {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now, blockedUntil: null });
    return { blocked: false };
  }
  entry.count += 1;
  if (entry.count >= LOGIN_LIMIT) {
    entry.blockedUntil = now + LOGIN_BLOCK_MS;
    return { blocked: true, retryAfter: Math.ceil(LOGIN_BLOCK_MS / 1000) };
  }
  return { blocked: false };
};

const clearLoginFailures = (key) => {
  loginAttempts.delete(key);
};

const computeTaskProgress = (taskEntry = {}) => {
  const levelProgressValues = Object.entries(taskEntry)
    .filter(([levelKey]) => !String(levelKey).startsWith('_'))
    .map(([levelKey, entry]) => {
    const entryTotal = Number(entry?.totalQuestions) || 0;
    const entrySolved = Array.isArray(entry?.solved) ? entry.solved.length : 0;
    if (!entryTotal || entrySolved === 0) return 0;

    const weight = LEVEL_WEIGHTS[levelKey];
    if (Number.isFinite(weight)) {
      const raw = (entrySolved / entryTotal) * weight;
      return Math.max(0, raw);
    }

    const entryMax = Number(entry?.levelMax) || 0;
    if (!entryMax) return 0;
    const raw = (entrySolved / entryTotal) * entryMax;
    return Math.max(0, raw);
  });
  return Math.round(levelProgressValues.reduce((sum, val) => sum + val, 0));
};

const normalizeClassicTaskForXp = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const taskNum = Math.trunc(num);
  if (taskNum < 1 || taskNum > 27) return null;
  if (taskNum === 20 || taskNum === 21) return GAME_THEORY_TASK;
  return taskNum;
};

const getTaskXpReward = (taskNumber) => {
  const normalizedTask = normalizeClassicTaskForXp(taskNumber);
  if (!Number.isFinite(normalizedTask)) return 0;
  const reward = Number(TASK_XP_REWARDS[normalizedTask]);
  if (!Number.isFinite(reward) || reward <= 0) return 0;
  return Math.floor(reward);
};

const getLevelXpMultiplier = (levelId) => {
  const key = String(levelId || '').trim().toLowerCase();
  if (key === 'advanced') return 1.5;
  if (key === 'expert') return 2;
  return 1;
};

const getTaskLevelXpReward = (taskNumber, levelId) => {
  const baseReward = getTaskXpReward(taskNumber);
  if (baseReward <= 0) return 0;
  const multiplier = getLevelXpMultiplier(levelId);
  return Math.max(0, Math.round(baseReward * multiplier));
};

const normalizeXpTotal = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
};

const normalizeLeaderboardAlias = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length < LEADERBOARD_ALIAS_MIN_LENGTH) return '';
  if (normalized.length > LEADERBOARD_ALIAS_MAX_LENGTH) return '';
  if (!/^[A-Za-z\u0410-\u042F\u0430-\u044F\u0401\u04510-9_.\-\s]+$/.test(normalized)) return '';
  return normalized;
};

const normalizeLeaderboardPseudonym = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length < LEADERBOARD_PSEUDONYM_MIN_LENGTH) return '';
  if (normalized.length > LEADERBOARD_PSEUDONYM_MAX_LENGTH) return '';
  if (!LEADERBOARD_PSEUDONYM_REGEX.test(normalized)) return '';
  return normalized;
};

const containsBlockedLeaderboardWord = (value) => {
  const normalized = String(value || '').toLowerCase().replace(/\u0451/g, '\u0435');
  if (!normalized) return false;
  return LEADERBOARD_BLOCKED_WORD_PATTERNS.some((pattern) => pattern.test(normalized));
};

const deriveXpFromSolvedByTask = (solvedByTask) => {
  if (!solvedByTask || typeof solvedByTask !== 'object') return 0;
  let totalXp = 0;
  Object.entries(solvedByTask).forEach(([taskKey, taskEntry]) => {
    if (!taskEntry || typeof taskEntry !== 'object' || Array.isArray(taskEntry)) return;
    Object.entries(taskEntry).forEach(([levelKey, levelEntry]) => {
      if (String(levelKey).startsWith('_')) return;
      if (!levelEntry || typeof levelEntry !== 'object' || Array.isArray(levelEntry)) return;
      const solvedList = Array.isArray(levelEntry.solved) ? levelEntry.solved : [];
      if (solvedList.length <= 0) return;
      const solvedCount = new Set(solvedList.map((id) => String(id))).size;
      if (solvedCount <= 0) return;
      const reward = getTaskLevelXpReward(taskKey, levelKey);
      if (reward <= 0) return;
      totalXp += solvedCount * reward;
    });
  });
  return totalXp;
};

const deriveXpFromSolvedEvents = (events) => {
  if (!Array.isArray(events) || events.length <= 0) return 0;
  const seenIds = new Set();
  let totalXp = 0;
  events.forEach((event) => {
    const eventId = typeof event?.id === 'string' ? event.id.trim() : '';
    if (eventId) {
      if (seenIds.has(eventId)) return;
      seenIds.add(eventId);
    }
    if (!event || typeof event !== 'object') return;
    const taskNum = Number(event.taskNumber);
    if (!Number.isFinite(taskNum) || taskNum < 1 || taskNum > 27) return;
    const levelId = String(event.levelId || '').trim();
    if (levelId === PYTHON_LEVEL_ID) return;
    const reward = getTaskLevelXpReward(taskNum, levelId);
    if (reward <= 0) return;
    totalXp += reward;
  });
  return totalXp;
};

const getLegacyProgressLevelCompletionRatio = (taskProgress, levelId) => {
  const safeTaskProgress = Math.max(0, Math.min(100, Number(taskProgress) || 0));
  const levelWeight = Number(LEVEL_WEIGHTS[levelId]);
  if (!Number.isFinite(levelWeight) || levelWeight <= 0) return 0;
  let levelStart = 0;
  for (const key of LEGACY_PROGRESS_LEVEL_SEQUENCE) {
    if (key === levelId) break;
    const weight = Number(LEVEL_WEIGHTS[key]);
    if (Number.isFinite(weight) && weight > 0) {
      levelStart += weight;
    }
  }
  return Math.max(0, Math.min(1, (safeTaskProgress - levelStart) / levelWeight));
};

const deriveXpFromLegacyProgress = (progress, testsDb = null) => {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return 0;
  const safeTestsDb = testsDb || readTestsDb();
  let totalXp = 0;

  Object.entries(progress).forEach(([taskKey, progressValue]) => {
    const normalizedTask = normalizeClassicTaskForXp(taskKey);
    if (!Number.isFinite(normalizedTask)) return;
    const taskProgress = Math.max(0, Math.min(100, Number(progressValue) || 0));
    if (taskProgress <= 0) return;
    const taskLevels = safeTestsDb?.[String(normalizedTask)];
    if (!taskLevels || typeof taskLevels !== 'object') return;

    LEGACY_PROGRESS_LEVEL_SEQUENCE.forEach((levelId) => {
      const questions = Array.isArray(taskLevels[levelId]) ? taskLevels[levelId] : [];
      const questionCount = questions.length;
      if (questionCount <= 0) return;
      const completionRatio = getLegacyProgressLevelCompletionRatio(taskProgress, levelId);
      if (completionRatio <= 0) return;
      const reward = getTaskLevelXpReward(normalizedTask, levelId);
      if (reward <= 0) return;
      totalXp += completionRatio * questionCount * reward;
    });
  });

  return normalizeXpTotal(totalXp);
};

const getSolvedEventDayKey = (event) => {
  if (!event || typeof event !== 'object') return null;
  const localDay = normalizeDayKey(event.localDay);
  if (localDay) return localDay;
  const solvedAtRaw = typeof event.solvedAt === 'string' ? event.solvedAt.trim() : '';
  if (!solvedAtRaw) return null;
  const isoPrefix = solvedAtRaw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return normalizeDayKey(isoPrefix[1]);
  const parsed = new Date(solvedAtRaw);
  if (Number.isNaN(parsed.getTime())) return null;
  return normalizeDayKey(parsed.toISOString().slice(0, 10));
};

const isTestingSolvedEvent = (event) => {
  if (!event || typeof event !== 'object') return false;
  const taskNum = Number(event.taskNumber);
  if (!Number.isFinite(taskNum) || taskNum < 1 || taskNum > 27) return false;
  const levelId = String(event.levelId || '').trim();
  return levelId !== PYTHON_LEVEL_ID;
};

const getRecentXpFromSolvedEvents = (events, endDayNum, days = LEADERBOARD_WEEK_DAYS) => {
  if (!Array.isArray(events) || events.length <= 0) return 0;
  const parsedDays = Number(days);
  const periodDays = Number.isFinite(parsedDays) && parsedDays > 0
    ? Math.floor(parsedDays)
    : LEADERBOARD_WEEK_DAYS;
  const fallbackEnd = dayKeyToNumber(new Date().toISOString().slice(0, 10));
  const safeEndDayNum = Number.isFinite(endDayNum) ? Math.floor(endDayNum) : fallbackEnd;
  if (!Number.isFinite(safeEndDayNum)) return 0;
  const startDayNum = safeEndDayNum - Math.max(periodDays - 1, 0);
  const seenIds = new Set();
  let xpTotal = 0;

  events.forEach((event) => {
    const eventId = typeof event?.id === 'string' ? event.id.trim() : '';
    if (eventId) {
      if (seenIds.has(eventId)) return;
      seenIds.add(eventId);
    }
    if (!isTestingSolvedEvent(event)) return;
    const dayKey = getSolvedEventDayKey(event);
    const dayNum = dayKeyToNumber(dayKey);
    if (!Number.isFinite(dayNum) || dayNum < startDayNum || dayNum > safeEndDayNum) return;
    const reward = getTaskLevelXpReward(event.taskNumber, event.levelId);
    if (reward <= 0) return;
    xpTotal += reward;
  });

  return xpTotal;
};

const normalizeAnswerValue = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const getAnswerCountForTask = (taskNumber) => {
  const num = Number(taskNumber);
  if (num === GAME_THEORY_TASK) return 4;
  if (num === 25) return 20;
  if (num === 27) return 4;
  if (num === 17 || num === 18 || num === 26) return 2;
  return 1;
};

const getMockAnswerCountForTask = (taskNumber) => {
  const num = Number(taskNumber);
  if (num === 20) return 2;
  if (num === GAME_THEORY_TASK) return 1;
  return getAnswerCountForTask(num);
};

const allowsPartialMockAnswers = (taskNumber) => Number(taskNumber) === 25;

const getExpectedAnswersForQuestion = (question, count) => {
  if (!question || typeof question !== 'object') {
    return Array.from({ length: count }, () => '');
  }
  if (count <= 1) {
    const fallback = Array.isArray(question?.options)
      ? question.options[question.correctIndex]
      : '';
    const directAnswer = question?.answer;
    if (directAnswer !== undefined && directAnswer !== null && String(directAnswer).trim() !== '') {
      return [directAnswer];
    }
    const fromArray = Array.isArray(question?.answers) ? question.answers : [];
    if (fromArray.length > 0 && String(fromArray[0] ?? '').trim() !== '') {
      return [fromArray[0]];
    }
    return [fallback ?? ''];
  }
  const fromArray = Array.isArray(question.answers) ? question.answers : [];
  if (fromArray.length > 0) {
    const filled = [...fromArray];
    while (filled.length < count) filled.push('');
    return filled.slice(0, count);
  }
  const answers = [];
  for (let i = 1; i <= count; i += 1) {
    const key = i === 1 ? 'answer' : `answer${i}`;
    answers.push(question?.[key] ?? '');
  }
  return answers;
};

const parseSubmittedAnswers = (rawValue, count) => {
  if (count <= 1) return [String(rawValue ?? '')];
  if (typeof rawValue !== 'string') {
    return Array.from({ length: count }, () => '');
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return Array.from({ length: count }, () => '');
  }
  let values = null;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) values = parsed;
      else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.answers)) values = parsed.answers;
        else if (typeof parsed.answer !== 'undefined') values = [parsed.answer];
      }
    } catch {
      values = null;
    }
  }
  if (!Array.isArray(values)) values = [trimmed];
  const normalized = Array.from({ length: count }, (_, index) => String(values[index] ?? ''));
  return normalized;
};

const parseMockAttemptAnswers = (rawValue, count) => {
  if (count <= 1) {
    if (Array.isArray(rawValue)) return [String(rawValue[0] ?? '')];
    return [String(rawValue ?? '')];
  }
  if (Array.isArray(rawValue)) {
    return Array.from({ length: count }, (_, index) => String(rawValue[index] ?? ''));
  }
  if (typeof rawValue === 'string') {
    return Array.from({ length: count }, (_, index) => (index === 0 ? rawValue : ''));
  }
  return Array.from({ length: count }, () => '');
};

const normalizeMockAttemptAnswers = (exam, rawAnswers) => {
  const tasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  const source = rawAnswers && typeof rawAnswers === 'object' ? rawAnswers : {};
  const normalized = {};
  Object.keys(tasks).forEach((taskKey) => {
    const answerCount = getMockAnswerCountForTask(taskKey);
    const provided = parseMockAttemptAnswers(source[taskKey], answerCount);
    normalized[taskKey] = answerCount <= 1 ? provided[0] : provided;
  });
  return normalized;
};

const recomputeMockSolvedMap = (exam, answersMap) => {
  const tasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  const solved = {};
  Object.entries(tasks).forEach(([taskKey, question]) => {
    const answerCount = getMockAnswerCountForTask(taskKey);
    const expectedAnswers = getExpectedAnswersForQuestion(question, answerCount);
    const provided = parseMockAttemptAnswers(answersMap?.[taskKey], answerCount);
    if (answerCount <= 1) {
      const value = String(provided[0] ?? '');
      if (!value.trim()) {
        solved[taskKey] = false;
        return;
      }
      solved[taskKey] = normalizeAnswerValue(value) === normalizeAnswerValue(expectedAnswers[0]);
      return;
    }
    const allowPartial = allowsPartialMockAnswers(taskKey);
    if (!allowPartial && provided.some((value) => !String(value ?? '').trim())) {
      solved[taskKey] = false;
      return;
    }
    if (allowPartial && provided.every((value) => !String(value ?? '').trim())) {
      solved[taskKey] = false;
      return;
    }
    solved[taskKey] = expectedAnswers.every((expected, index) => (
      normalizeAnswerValue(expected) === normalizeAnswerValue(provided[index])
    ));
  });
  return solved;
};

const normalizeMockAttemptPayload = (exam, rawAnswers, updatedAt) => {
  const answers = normalizeMockAttemptAnswers(exam, rawAnswers);
  return {
    answers,
    solved: recomputeMockSolvedMap(exam, answers),
    updatedAt: typeof updatedAt === 'string' && updatedAt.trim()
      ? updatedAt
      : new Date().toISOString(),
  };
};

const isSolvedAnswerValid = (question, rawValue, taskNumber) => {
  const answerCount = getAnswerCountForTask(taskNumber);
  const expectedAnswers = getExpectedAnswersForQuestion(question, answerCount);
  const providedAnswers = parseSubmittedAnswers(rawValue, answerCount);
  if (answerCount <= 1) {
    if (!String(providedAnswers[0] ?? '').trim()) return false;
    return normalizeAnswerValue(providedAnswers[0]) === normalizeAnswerValue(expectedAnswers[0]);
  }
  if (providedAnswers.every((value) => !String(value ?? '').trim())) return false;
  return expectedAnswers.every((expected, index) => (
    normalizeAnswerValue(expected) === normalizeAnswerValue(providedAnswers[index])
  ));
};

const recomputeProgressFromSolved = (data) => {
  const baseProgress = { ...(data.progress || {}) };
  const solvedByTask = data.solvedByTask && typeof data.solvedByTask === 'object' ? data.solvedByTask : {};
  Object.entries(solvedByTask).forEach(([taskKey, entry]) => {
    baseProgress[taskKey] = computeTaskProgress(entry || {});
  });
  return baseProgress;
};

const normalizeNotesByTaskMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = {};
  Object.entries(value).forEach(([taskKey, noteValue]) => {
    const taskNum = Number(taskKey);
    if (!Number.isFinite(taskNum) || taskNum <= 0) return;
    if (typeof noteValue !== 'string') return;
    const note = noteValue.trim().slice(0, 80);
    if (!note) return;
    next[String(Math.trunc(taskNum))] = note;
  });
  return next;
};

const getStudentData = (studentId) => {
  const db = readProgressDb();
  const raw = db[studentId];
  if (!raw) return { progress: {}, notes: '', notesByTask: {}, mocks: [], schedule: [], solvedByTask: {}, solvedEvents: [], streak: getDefaultStreak(), nextLesson: { homeWork: '', lessonLink: '', boardLink: '', targetQuestions: [], goals: [] }, homeworks: [], mockAttempts: {}, xpTotal: 0, leaderboardAlias: '' };
  if (raw.progress || raw.notes || raw.notesByTask || raw.mocks || raw.schedule || raw.solvedByTask || raw.streak || raw.mockAttempts || Object.prototype.hasOwnProperty.call(raw, 'xpTotal') || Object.prototype.hasOwnProperty.call(raw, 'leaderboardAlias')) {
    const progress = raw.progress && typeof raw.progress === 'object' && !Array.isArray(raw.progress) ? raw.progress : {};
    const solvedByTask = raw.solvedByTask && typeof raw.solvedByTask === 'object' ? raw.solvedByTask : {};
    const solvedEvents = Array.isArray(raw.solvedEvents) ? raw.solvedEvents : [];
    const hasStoredXp = Object.prototype.hasOwnProperty.call(raw, 'xpTotal');
    const derivedSolvedXp = deriveXpFromSolvedByTask(solvedByTask);
    const derivedEventsXp = deriveXpFromSolvedEvents(solvedEvents);
    const derivedLegacyProgressXp = deriveXpFromLegacyProgress(progress);
    const derivedXp = Math.max(derivedSolvedXp, derivedEventsXp, derivedLegacyProgressXp);
    return {
      progress,
      notes: raw.notes || '',
      notesByTask: normalizeNotesByTaskMap(raw.notesByTask),
      mocks: Array.isArray(raw.mocks) ? raw.mocks : [],
      schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
      solvedByTask,
      solvedEvents,
      streak: normalizeStreak(raw.streak),
      nextLesson: raw.nextLesson && typeof raw.nextLesson === 'object' ? raw.nextLesson : { homeWork: '', lessonLink: '', boardLink: '', targetQuestions: [], goals: [] },
      homeworks: Array.isArray(raw.homeworks) ? raw.homeworks : [],
      mockAttempts: raw.mockAttempts && typeof raw.mockAttempts === 'object' ? raw.mockAttempts : {},
      xpTotal: hasStoredXp ? normalizeXpTotal(raw.xpTotal) : derivedXp,
      leaderboardAlias: normalizeLeaderboardAlias(raw.leaderboardAlias),
    };
  }
  const legacyProgress = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const legacyXp = deriveXpFromLegacyProgress(legacyProgress);
  return { progress: legacyProgress, notes: '', notesByTask: {}, mocks: [], schedule: [], solvedByTask: {}, solvedEvents: [], streak: getDefaultStreak(), nextLesson: { homeWork: '', lessonLink: '', boardLink: '', targetQuestions: [], goals: [] }, homeworks: [], mockAttempts: {}, xpTotal: legacyXp, leaderboardAlias: '' };
};

const setStudentData = (studentId, data) => {
  const db = readProgressDb();
  const payload = {
    progress: data.progress || {},
    notes: data.notes || '',
    notesByTask: normalizeNotesByTaskMap(data.notesByTask),
    mocks: Array.isArray(data.mocks) ? data.mocks : [],
    schedule: Array.isArray(data.schedule) ? data.schedule : [],
    solvedByTask: data.solvedByTask && typeof data.solvedByTask === 'object' ? data.solvedByTask : {},
    solvedEvents: Array.isArray(data.solvedEvents) ? data.solvedEvents : [],
    streak: normalizeStreak(data.streak),
    nextLesson: data.nextLesson && typeof data.nextLesson === 'object' ? data.nextLesson : { homeWork: '', lessonLink: '', boardLink: '', targetQuestions: [], goals: [] },
    homeworks: Array.isArray(data.homeworks) ? data.homeworks : [],
    mockAttempts: data.mockAttempts && typeof data.mockAttempts === 'object' ? data.mockAttempts : {},
    xpTotal: normalizeXpTotal(data.xpTotal),
    leaderboardAlias: normalizeLeaderboardAlias(data.leaderboardAlias),
  };
  db[studentId] = payload;
  writeProgressDb(db);
  return payload;
};

const getQuestionsCountForLevel = (testsDb, taskNum, levelId) => {
  if (!testsDb || !taskNum || !levelId) return 0;
  const task = testsDb[String(taskNum)] || testsDb[taskNum];
  const list = task?.[levelId];
  return Array.isArray(list) ? list.length : 0;
};

const getTaskLevelsFromTestsDb = (testsDb, taskNum) => {
  if (!testsDb || !Number.isFinite(taskNum)) return null;
  const entry = testsDb[String(taskNum)] || testsDb[taskNum];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  return entry;
};

const getQuestionEntryFromTestsDb = (testsDb, taskNum, levelId, questionId) => {
  const taskLevels = getTaskLevelsFromTestsDb(testsDb, taskNum);
  if (!taskLevels) return { taskLevels: null, questions: null, question: null };
  const questions = taskLevels?.[String(levelId)];
  if (!Array.isArray(questions)) return { taskLevels, questions: null, question: null };
  const questionKey = String(questionId || '').trim();
  const question = questions.find((entry) => String(entry?.id ?? '').trim() === questionKey) || null;
  return { taskLevels, questions, question };
};

const filterTargetsByCount = (targets, count) => {
  if (!Number.isFinite(count) || count <= 0) return targets;
  return targets.filter((val) => val <= count);
};

const isPythonTaskNumber = (taskNum) => Number.isFinite(taskNum) && taskNum >= 100 && taskNum <= 199;
const isClassicTaskNumber = (taskNum) => Number.isFinite(taskNum) && taskNum >= 1 && taskNum <= 27;
const isKnownTaskNumber = (taskNum) => isClassicTaskNumber(taskNum) || isPythonTaskNumber(taskNum);
const GOAL_TYPE_TASK = 'task';
const GOAL_TYPE_MOCK = 'mock';

const normalizeGoalType = (goal) => {
  const rawType = String(goal?.type || '').trim().toLowerCase();
  if (rawType === GOAL_TYPE_MOCK) return GOAL_TYPE_MOCK;
  if (!rawType && String(goal?.mockExamId || '').trim()) return GOAL_TYPE_MOCK;
  return GOAL_TYPE_TASK;
};

const normalizeGoals = (goals, testsDb = null) => {
  if (!Array.isArray(goals)) return [];
  const result = [];
  goals.forEach((goal) => {
    if (!goal || typeof goal !== 'object') return;
    const goalType = normalizeGoalType(goal);
    if (goalType === GOAL_TYPE_MOCK) {
      const mockExamId = String(goal.mockExamId || '').trim();
      if (!mockExamId) return;
      result.push({ type: GOAL_TYPE_MOCK, mockExamId });
      return;
    }
    const taskNum = Number(goal.taskNumber);
    const isPython = isPythonTaskNumber(taskNum);
    if (!Number.isFinite(taskNum) || (!isPython && (taskNum < 1 || taskNum > 27))) return;
    let levelId = String(goal.levelId || '').trim();
    if (isPython) levelId = 'python';
    if (!isPython && !['basic', 'advanced', 'expert'].includes(levelId)) return;
    const includeAll = Boolean(goal.includeAll);
    const rawTargets = Array.isArray(goal.targetQuestions) ? goal.targetQuestions : [];
    const targetsRaw = includeAll
      ? []
      : Array.from(new Set(
          rawTargets
            .map((val) => Number(val))
            .filter((val) => Number.isFinite(val) && val > 0)
            .map((val) => Math.trunc(val))
        ));
    const totalCount = getQuestionsCountForLevel(testsDb, taskNum, levelId);
    const targets = filterTargetsByCount(targetsRaw, totalCount);
    result.push({ type: GOAL_TYPE_TASK, taskNumber: taskNum, levelId, includeAll, targetQuestions: targets });
  });
  return result;
};

const normalizeGoalsFromLegacy = (entry, testsDb = null) => {
  if (!entry) return [];
  const taskNum = Number(entry.taskNumber);
  let levelId = String(entry.levelId || '').trim();
  const isPython = isPythonTaskNumber(taskNum);
  if (!Number.isFinite(taskNum) || (!isPython && (taskNum < 1 || taskNum > 27))) return [];
  if (isPython) levelId = 'python';
  if (!isPython && !['basic', 'advanced', 'expert'].includes(levelId)) return [];
  const includeAll = Boolean(entry.includeAll);
  const rawTargets = Array.isArray(entry.targetQuestions) ? entry.targetQuestions : [];
  const targetsRaw = includeAll
    ? []
    : Array.from(new Set(
        rawTargets
          .map((val) => Number(val))
          .filter((val) => Number.isFinite(val) && val > 0)
          .map((val) => Math.trunc(val))
      ));
  const totalCount = getQuestionsCountForLevel(testsDb, taskNum, levelId);
  const targets = filterTargetsByCount(targetsRaw, totalCount);
  return [{ type: GOAL_TYPE_TASK, taskNumber: taskNum, levelId, includeAll, targetQuestions: targets }];
};

const ensurePushRuntimeConfigured = () => {
  try {
    const pushDb = readPushDb();
    let vapidKeys = normalizePushVapidKeys(pushDb.vapidKeys);
    if (!vapidKeys) {
      vapidKeys = webpush.generateVAPIDKeys();
      pushDb.vapidKeys = vapidKeys;
      writePushDb(pushDb);
    }
    webpush.setVapidDetails(PUSH_VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
    pushRuntimeEnabled = true;
    pushRuntimeConfigError = '';
    return {
      enabled: true,
      publicKey: vapidKeys.publicKey,
    };
  } catch (error) {
    pushRuntimeEnabled = false;
    pushRuntimeConfigError = error?.message || 'Push runtime error';
    console.error('[push] failed to configure runtime:', error);
    return {
      enabled: false,
      error: pushRuntimeConfigError,
    };
  }
};

const isPushReminderWindowOpen = (date = new Date()) => {
  const hour = date.getHours();
  if (!Number.isFinite(hour)) return true;
  const start = PUSH_REMINDER_WINDOW_START_HOUR;
  const end = PUSH_REMINDER_WINDOW_END_HOUR;
  if (start === end) return true;
  if (start < end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
};

const getNormalizedHomeworkGoals = (entry, testsDb = null) => {
  const normalized = normalizeGoals(entry?.goals, testsDb);
  if (normalized.length > 0) return normalized;
  return normalizeGoalsFromLegacy(entry, testsDb);
};

const getHomeworkSortTime = (entry) => {
  const issuedAtMs = Date.parse(entry?.issuedAt || '');
  if (Number.isFinite(issuedAtMs)) return issuedAtMs;
  return 0;
};

const getLatestHomeworkEntryForPush = (studentData, testsDb = null) => {
  const homeworks = Array.isArray(studentData?.homeworks) ? studentData.homeworks : [];
  const sortedHomeworks = homeworks
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const goals = getNormalizedHomeworkGoals(entry, testsDb);
      return { ...entry, goals };
    })
    .filter((entry) => Array.isArray(entry.goals) && entry.goals.length > 0)
    .sort((a, b) => getHomeworkSortTime(b) - getHomeworkSortTime(a));

  if (sortedHomeworks.length > 0) return sortedHomeworks[0];

  const nextLesson = studentData?.nextLesson && typeof studentData.nextLesson === 'object'
    ? studentData.nextLesson
    : null;
  if (!nextLesson) return null;

  const hasContent = Boolean(
    (typeof nextLesson.homeWork === 'string' && nextLesson.homeWork.trim())
    || (typeof nextLesson.lessonLink === 'string' && nextLesson.lessonLink.trim())
    || (typeof nextLesson.boardLink === 'string' && nextLesson.boardLink.trim())
    || nextLesson.taskNumber
    || (Array.isArray(nextLesson.goals) && nextLesson.goals.length > 0)
  );
  if (!hasContent) return null;

  const goals = getNormalizedHomeworkGoals(nextLesson, testsDb);
  if (goals.length === 0) return null;

  return {
    id: 'legacy',
    issuedAt: typeof nextLesson.issuedAt === 'string' ? nextLesson.issuedAt : '',
    daysToComplete: Number(nextLesson.daysToComplete) || 7,
    homeWork: typeof nextLesson.homeWork === 'string' ? nextLesson.homeWork : '',
    goals,
  };
};

const collectGoalTargetNumbers = (goal, questionCount) => {
  if (!Number.isFinite(questionCount) || questionCount <= 0) return [];
  if (Boolean(goal?.includeAll)) {
    return Array.from({ length: questionCount }, (_, index) => index + 1);
  }
  const rawTargets = Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [];
  const unique = Array.from(new Set(
    rawTargets
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.trunc(value))
  ));
  return unique.filter((value) => value <= questionCount).sort((a, b) => a - b);
};

const getTaskGoalProgressSnapshot = (goal, studentData, testsDb) => {
  const taskNumber = Number(goal?.taskNumber);
  if (!Number.isFinite(taskNumber)) return { pendingCount: 0, totalCount: 0 };
  const levelId = isPythonTaskNumber(taskNumber) ? PYTHON_LEVEL_ID : String(goal?.levelId || '').trim();
  if (!levelId) return { pendingCount: 0, totalCount: 0 };
  const questions = testsDb?.[String(taskNumber)]?.[levelId];
  if (!Array.isArray(questions) || questions.length === 0) return { pendingCount: 0, totalCount: 0 };
  const targetNumbers = collectGoalTargetNumbers(goal, questions.length);
  if (targetNumbers.length === 0) return { pendingCount: 0, totalCount: 0 };
  const solved = studentData?.solvedByTask?.[String(taskNumber)]?.[levelId]?.solved;
  const solvedSet = new Set(
    (Array.isArray(solved) ? solved : [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  );
  let solvedCount = 0;
  targetNumbers.forEach((targetNumber) => {
    const question = questions[targetNumber - 1];
    const questionId = String(question?.id ?? '').trim();
    if (!questionId) return;
    if (solvedSet.has(questionId)) solvedCount += 1;
  });
  const totalCount = targetNumbers.length;
  return {
    totalCount,
    pendingCount: Math.max(totalCount - solvedCount, 0),
  };
};

const getMockGoalProgressSnapshot = (goal, studentData, mockExamById = {}) => {
  const mockExamId = String(goal?.mockExamId || '').trim();
  if (!mockExamId) return { pendingCount: 0, totalCount: 0 };
  const exam = mockExamById[mockExamId];
  const tasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  const taskKeys = Object.keys(tasks).map((taskKey) => String(taskKey || '').trim()).filter(Boolean);
  if (taskKeys.length === 0) return { pendingCount: 0, totalCount: 0 };
  const solvedMap = studentData?.mockAttempts?.[mockExamId]?.solved;
  const solved = solvedMap && typeof solvedMap === 'object' ? solvedMap : {};
  let solvedCount = 0;
  taskKeys.forEach((taskKey) => {
    if (Boolean(solved[String(taskKey)])) solvedCount += 1;
  });
  const totalCount = taskKeys.length;
  return {
    totalCount,
    pendingCount: Math.max(totalCount - solvedCount, 0),
  };
};

const evaluateLatestHomeworkProgressForStudent = (student, testsDb, mockExamById = {}) => {
  if (!student?.id) return null;
  const studentData = getStudentData(student.id);
  const latestHomework = getLatestHomeworkEntryForPush(studentData, testsDb);
  if (!latestHomework) return null;
  const goals = Array.isArray(latestHomework.goals)
    ? latestHomework.goals
    : getNormalizedHomeworkGoals(latestHomework, testsDb);
  if (!Array.isArray(goals) || goals.length === 0) return null;

  let totalCount = 0;
  let pendingCount = 0;
  goals.forEach((goal) => {
    const goalType = normalizeGoalType(goal);
    const snapshot = goalType === GOAL_TYPE_MOCK
      ? getMockGoalProgressSnapshot(goal, studentData, mockExamById)
      : getTaskGoalProgressSnapshot(goal, studentData, testsDb);
    totalCount += Number(snapshot.totalCount) || 0;
    pendingCount += Number(snapshot.pendingCount) || 0;
  });
  if (totalCount <= 0) return null;

  const fallbackId = String(latestHomework?.issuedAt || '').trim();
  const homeworkId = String(latestHomework?.id || fallbackId || 'legacy').trim() || 'legacy';
  return {
    studentId: student.id,
    studentName: student.name || 'Ученик',
    homeworkId,
    issuedAt: typeof latestHomework?.issuedAt === 'string' ? latestHomework.issuedAt : '',
    daysToComplete: Number(latestHomework?.daysToComplete) || 7,
    pendingCount,
    totalCount,
  };
};

const formatHomeworkPendingLabel = (count) => {
  const value = Number(count) || 0;
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} задание`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} задания`;
  return `${value} заданий`;
};

const getHomeworkPreviewText = (entry) => {
  const raw = typeof entry?.homeWork === 'string' ? entry.homeWork : '';
  if (!raw.trim()) return '';
  const firstLine = raw
    .split('\n')
    .map((line) => String(line || '').trim())
    .find((line) => line);
  if (!firstLine) return '';
  const compact = firstLine.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= 90) return compact;
  return `${compact.slice(0, 87)}...`;
};

const buildHomeworkPushPayload = (summary) => ({
  title: 'Домашка не закончена',
  body: `Осталось ${formatHomeworkPendingLabel(summary.pendingCount)}. Проверь раздел "Моё расписание".`,
  icon: '/favicon.ico',
  badge: '/favicon.ico',
  tag: `homework-${summary.homeworkId}`,
  renotify: false,
  data: {
    type: 'homework-reminder',
    url: '/?view=schedule',
    homeworkId: summary.homeworkId,
    pendingCount: summary.pendingCount,
    issuedAt: summary.issuedAt || null,
    studentId: summary.studentId,
  },
});

const buildNewHomeworkPushPayload = (student, entry, summary = null) => {
  const pendingCount = Number(summary?.pendingCount);
  const homeworkId = String(
    summary?.homeworkId
    || entry?.id
    || entry?.issuedAt
    || 'latest'
  ).trim() || 'latest';
  const preview = getHomeworkPreviewText(entry);
  const baseBody = Number.isFinite(pendingCount) && pendingCount > 0
    ? `Новая домашка: ${formatHomeworkPendingLabel(pendingCount)} к следующему занятию.`
    : 'Вам выдали новую домашку. Откройте раздел "Моё расписание".';
  const body = preview ? `${baseBody} ${preview}` : baseBody;
  return {
    title: 'Новая домашка',
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `new-homework-${homeworkId}`,
    renotify: true,
    data: {
      type: 'new-homework',
      url: '/?view=schedule',
      homeworkId,
      issuedAt: summary?.issuedAt || entry?.issuedAt || null,
      studentId: student?.id || null,
    },
  };
};

const isPushSubscriptionGoneError = (error) => {
  const code = Number(error?.statusCode || error?.status);
  return code === 404 || code === 410;
};

const sendPushNotificationToSubscriptions = async (subscriptions = [], payload, studentId) => {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  if (list.length === 0) {
    return { successCount: 0, staleEndpoints: [] };
  }
  const results = await Promise.all(list.map(async (entry) => {
    try {
      await webpush.sendNotification(
        entry.subscription,
        JSON.stringify(payload),
        { TTL: PUSH_TTL_SECONDS }
      );
      return { ok: true, endpoint: entry.endpoint };
    } catch (error) {
      if (isPushSubscriptionGoneError(error)) {
        return { ok: false, endpoint: entry.endpoint, stale: true };
      }
      console.error(`[push] failed to send notification to student ${studentId}:`, error);
      return { ok: false, endpoint: entry.endpoint, stale: false };
    }
  }));
  const successCount = results.filter((item) => item.ok).length;
  const staleEndpoints = results
    .filter((item) => !item.ok && item.stale && item.endpoint)
    .map((item) => item.endpoint);
  return { successCount, staleEndpoints };
};

const notifyStudentAboutNewHomework = async (student, entry) => {
  if (!student?.id || !entry) return;
  if (!pushRuntimeEnabled) {
    const runtime = ensurePushRuntimeConfigured();
    if (!runtime.enabled) return;
  }
  try {
    const pushDb = readPushDb();
    const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
    const remindersByStudent = normalizePushRemindersByStudent(pushDb.remindersByStudent);
    const subscriptions = Array.isArray(subscriptionsByStudent[student.id])
      ? subscriptionsByStudent[student.id]
      : [];
    if (subscriptions.length === 0) return;

    const testsDb = readTestsDb();
    const mockExamById = readMockExamsDb().reduce((acc, exam) => {
      const examId = String(exam?.id || '').trim();
      if (examId) acc[examId] = exam;
      return acc;
    }, {});
    const summary = evaluateLatestHomeworkProgressForStudent(student, testsDb, mockExamById);
    const payload = buildNewHomeworkPushPayload(student, entry, summary);
    const result = await sendPushNotificationToSubscriptions(subscriptions, payload, student.id);

    let changed = false;
    if (result.staleEndpoints.length > 0) {
      const staleSet = new Set(result.staleEndpoints);
      subscriptionsByStudent[student.id] = subscriptions.filter((item) => !staleSet.has(item.endpoint));
      changed = true;
    }

    if (result.successCount > 0) {
      if (summary && summary.pendingCount > 0) {
        remindersByStudent[student.id] = {
          homeworkId: summary.homeworkId,
          pendingCount: summary.pendingCount,
          issuedAt: summary.issuedAt || '',
          lastSentAt: new Date().toISOString(),
        };
      } else if (remindersByStudent[student.id]) {
        delete remindersByStudent[student.id];
      }
      changed = true;
    }

    if (changed) {
      writePushDb({
        ...pushDb,
        subscriptionsByStudent,
        remindersByStudent,
      });
    }
  } catch (error) {
    console.error(`[push] failed to send "new homework" notification to student ${student.id}:`, error);
  }
};

const runPushReminderSweep = async () => {
  if (pushSweepInFlight) return;
  if (!pushRuntimeEnabled) {
    const runtime = ensurePushRuntimeConfigured();
    if (!runtime.enabled) return;
  }
  if (!isPushReminderWindowOpen()) return;

  pushSweepInFlight = true;
  try {
    const pushDb = readPushDb();
    const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
    const remindersByStudent = normalizePushRemindersByStudent(pushDb.remindersByStudent);
    const studentIds = Object.keys(subscriptionsByStudent).filter((studentId) => (
      Array.isArray(subscriptionsByStudent[studentId]) && subscriptionsByStudent[studentId].length > 0
    ));
    if (studentIds.length === 0) {
      if (Object.keys(remindersByStudent).length > 0) {
        writePushDb({ ...pushDb, subscriptionsByStudent, remindersByStudent: {} });
      }
      return;
    }

    const testsDb = readTestsDb();
    const mockExamById = readMockExamsDb().reduce((acc, exam) => {
      const examId = String(exam?.id || '').trim();
      if (examId) acc[examId] = exam;
      return acc;
    }, {});

    let changed = false;
    for (const studentId of studentIds) {
      const student = findStudentById(studentId);
      if (!student) {
        delete subscriptionsByStudent[studentId];
        delete remindersByStudent[studentId];
        changed = true;
        continue;
      }

      const summary = evaluateLatestHomeworkProgressForStudent(student, testsDb, mockExamById);
      if (!summary || summary.pendingCount <= 0) {
        if (remindersByStudent[studentId]) {
          delete remindersByStudent[studentId];
          changed = true;
        }
        continue;
      }

      const previousReminder = remindersByStudent[studentId];
      const sameHomework = previousReminder?.homeworkId === summary.homeworkId;
      const lastSentMs = Date.parse(previousReminder?.lastSentAt || '');
      const delayPassed = !Number.isFinite(lastSentMs) || (Date.now() - lastSentMs >= PUSH_REMINDER_MIN_INTERVAL_MS);
      if (sameHomework && !delayPassed) continue;

      const payload = buildHomeworkPushPayload(summary);
      const subscriptions = subscriptionsByStudent[studentId] || [];
      const result = await sendPushNotificationToSubscriptions(subscriptions, payload, studentId);

      if (result.staleEndpoints.length > 0) {
        const staleSet = new Set(result.staleEndpoints);
        subscriptionsByStudent[studentId] = subscriptions.filter((entry) => !staleSet.has(entry.endpoint));
        changed = true;
      }

      if (result.successCount > 0) {
        remindersByStudent[studentId] = {
          homeworkId: summary.homeworkId,
          pendingCount: summary.pendingCount,
          issuedAt: summary.issuedAt || '',
          lastSentAt: new Date().toISOString(),
        };
        changed = true;
      } else if (!subscriptionsByStudent[studentId] || subscriptionsByStudent[studentId].length === 0) {
        delete remindersByStudent[studentId];
        changed = true;
      }
    }

    if (changed) {
      writePushDb({
        ...pushDb,
        subscriptionsByStudent,
        remindersByStudent,
      });
    }
  } catch (error) {
    console.error('[push] reminder sweep failed:', error);
  } finally {
    pushSweepInFlight = false;
  }
};

const getQuestionNumberById = (testsDb, taskNum, levelId, questionId) => {
  if (!testsDb || !taskNum || !levelId || !questionId) return null;
  const task = testsDb[String(taskNum)] || testsDb[taskNum];
  const list = task?.[String(levelId)] || task?.[levelId];
  if (!Array.isArray(list)) return null;
  const targetId = String(questionId);
  const idx = list.findIndex((q) => String(q?.id ?? '') === targetId);
  if (idx < 0) return null;
  return idx + 1;
};

const sanitizeStudentQuestion = (question) => {
  if (!question || typeof question !== 'object') return question;
  const safe = { ...question };
  delete safe.correctIndex;
  delete safe.answer;
  delete safe.answers;
  Object.keys(safe).forEach((key) => {
    if (/^answer\d+$/i.test(key)) {
      delete safe[key];
    }
  });
  return safe;
};

const normalizeOutputValue = (value) => String(value ?? '')
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
  .replace(/\r\n/g, '\n')
  .replace(/\s+/g, ' ')
  .trim();

const getPythonChildEnv = () => {
  const env = {
    PYTHONIOENCODING: 'utf-8',
    PYTHONNOUSERSITE: '1',
    PYTHONHASHSEED: '0',
  };
  const keepKeys = process.platform === 'win32'
    ? ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP']
    : ['PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR'];
  keepKeys.forEach((key) => {
    if (typeof process.env[key] === 'string' && process.env[key]) {
      env[key] = process.env[key];
    }
  });
  return env;
};

const runChildProcess = (command, args, options = {}) => new Promise((resolve) => {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(0, Number(options.timeoutMs)) : 0;
  const maxBufferBytes = Number.isFinite(Number(options.maxBufferBytes))
    ? Math.max(1024, Number(options.maxBufferBytes))
    : PYTHON_RUN_MAX_BUFFER_BYTES;
  const stdinInput = typeof options.input === 'string' ? options.input : String(options.input ?? '');
  const stdoutChunks = [];
  const stderrChunks = [];
  let outputBytes = 0;
  let timedOut = false;
  let overflow = false;
  let settled = false;
  let timer = null;

  const finish = (payload) => {
    if (settled) return;
    settled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    resolve({
      status: payload?.status,
      signal: payload?.signal,
      error: payload?.error || null,
      timedOut,
      overflow,
      stdout,
      stderr,
    });
  };

  let child;
  try {
    child = spawn(command, args, {
      windowsHide: true,
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    finish({ error });
    return;
  }

  const terminate = () => {
    if (!child || child.killed) return;
    try {
      child.kill();
    } catch {}
  };

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
  }

  const pushOutput = (target, chunk) => {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ''), 'utf8');
    outputBytes += data.length;
    if (outputBytes > maxBufferBytes) {
      overflow = true;
      terminate();
      return;
    }
    target.push(data);
  };

  if (child.stdout) {
    child.stdout.on('data', (chunk) => pushOutput(stdoutChunks, chunk));
  }
  if (child.stderr) {
    child.stderr.on('data', (chunk) => pushOutput(stderrChunks, chunk));
  }

  if (child.stdin) {
    child.stdin.on('error', () => {});
    if (stdinInput) child.stdin.write(stdinInput);
    child.stdin.end();
  }

  child.on('error', (error) => finish({ error }));
  child.on('close', (status, signal) => finish({ status, signal }));
});

const acquirePythonRunSlot = () => new Promise((resolve) => {
  if (pythonRunActiveCount < PYTHON_RUN_MAX_CONCURRENT) {
    pythonRunActiveCount += 1;
    resolve();
    return;
  }
  pythonRunQueue.push(resolve);
});

const releasePythonRunSlot = () => {
  if (pythonRunActiveCount > 0) pythonRunActiveCount -= 1;
  const next = pythonRunQueue.shift();
  if (typeof next === 'function') {
    pythonRunActiveCount += 1;
    next();
  }
};

const resolvePythonRunner = async () => {
  if (pythonRunnerResolved) return cachedPythonRunner;
  if (pythonRunnerResolvePromise) return pythonRunnerResolvePromise;
  pythonRunnerResolvePromise = (async () => {
    for (const candidate of PYTHON_RUNNER_CANDIDATES) {
      const probe = await runChildProcess(candidate.command, [...candidate.baseArgs, '--version'], {
        timeoutMs: 2000,
        maxBufferBytes: 64 * 1024,
      });
      if (!probe.error && !probe.timedOut && probe.status === 0) {
        cachedPythonRunner = candidate;
        pythonRunnerResolved = true;
        return cachedPythonRunner;
      }
    }
    pythonRunnerResolved = true;
    cachedPythonRunner = null;
    return null;
  })().finally(() => {
    pythonRunnerResolvePromise = null;
  });
  return pythonRunnerResolvePromise;
};

const invalidatePythonRunner = () => {
  cachedPythonRunner = null;
  pythonRunnerResolved = false;
};

const runPythonSourceForInput = async (runner, encodedSource, inputValue) => {
  if (!runner || !encodedSource) return { ok: false, launchError: true };
  await acquirePythonRunSlot();
  try {
    const args = [...runner.baseArgs, '-I', '-S', '-B', '-c', PYTHON_RUNNER_SCRIPT, encodedSource];
    const execution = await runChildProcess(runner.command, args, {
      input: String(inputValue ?? ''),
      timeoutMs: PYTHON_RUN_TIMEOUT_MS,
      maxBufferBytes: PYTHON_RUN_MAX_BUFFER_BYTES,
      env: getPythonChildEnv(),
    });
    if (execution.error) {
      invalidatePythonRunner();
      return { ok: false, launchError: true };
    }
    if (execution.timedOut) {
      return { ok: false, timeout: true };
    }
    if (execution.overflow) {
      return { ok: false, outputOverflow: true };
    }
    if (execution.status !== 0) {
      return { ok: false, runtimeError: true };
    }
    return { ok: true, output: String(execution.stdout ?? '') };
  } finally {
    releasePythonRunSlot();
  }
};

const sanitizePythonQuestionForStudent = (question) => {
  const safe = sanitizeStudentQuestion(question);
  if (!safe || typeof safe !== 'object') return safe;
  const tests = Array.isArray(question?.tests) ? question.tests : [];
  safe.tests = tests.map((test) => {
    const safeTest = {
      input: String(test?.input ?? ''),
    };
    if (Object.prototype.hasOwnProperty.call(test || {}, 'output')) {
      safeTest.output = String(test?.output ?? '');
    }
    return safeTest;
  });
  return safe;
};

const validatePythonSolveResults = async (question, sourceRaw) => {
  const tests = Array.isArray(question?.tests) ? question.tests : [];
  if (tests.length === 0) {
    return { ok: false, error: 'Для этой задачи не заданы тесты' };
  }
  const hasExpectedOutputs = tests.every((test) => (
    Object.prototype.hasOwnProperty.call(test || {}, 'output')
  ));
  if (!hasExpectedOutputs) {
    return { ok: false, error: 'Для этой задачи не заданы эталонные ответы' };
  }
  const source = typeof sourceRaw === 'string' ? sourceRaw : '';
  if (!source.trim()) {
    return { ok: false, error: 'Добавьте код решения' };
  }
  if (source.length > PYTHON_RUN_MAX_CODE_CHARS) {
    return { ok: false, error: `Код слишком большой (максимум ${PYTHON_RUN_MAX_CODE_CHARS} символов)` };
  }
  const runner = await resolvePythonRunner();
  if (!runner) {
    return { ok: false, error: 'Проверка Python временно недоступна на сервере' };
  }
  const encodedSource = Buffer.from(source, 'utf8').toString('base64');
  const timeoutMessage = `Превышено время выполнения (${Math.round(PYTHON_RUN_TIMEOUT_MS / 1000)} сек).`;
  for (let index = 0; index < tests.length; index += 1) {
    const expectedTest = tests[index] && typeof tests[index] === 'object' ? tests[index] : {};
    const expectedInput = String(expectedTest.input ?? '');
    const expectedOutput = normalizeOutputValue(expectedTest.output ?? '');
    const execution = await runPythonSourceForInput(runner, encodedSource, expectedInput);
    if (!execution.ok) {
      if (execution.timeout) {
        return { ok: false, error: timeoutMessage };
      }
      if (execution.outputOverflow) {
        return { ok: false, error: 'Превышен допустимый объём вывода программы' };
      }
      if (execution.launchError) {
        return { ok: false, error: 'Не удалось запустить Python на сервере' };
      }
      return { ok: false, error: `Ошибка выполнения кода на тесте ${index + 1}` };
    }
    const providedOutput = normalizeOutputValue(execution.output);
    if (providedOutput !== expectedOutput) {
      return { ok: false, error: 'Тесты не пройдены' };
    }
  }
  return { ok: true };
};

const validatePythonSolveResultsFromProvided = (question, pythonResultsRaw) => {
  const tests = Array.isArray(question?.tests) ? question.tests : [];
  if (tests.length === 0) {
    return { ok: false, error: 'Для этой задачи не заданы тесты' };
  }
  const hasExpectedOutputs = tests.every((test) => (
    Object.prototype.hasOwnProperty.call(test || {}, 'output')
  ));
  if (!hasExpectedOutputs) {
    return { ok: false, error: 'Для этой задачи не заданы эталонные ответы' };
  }
  const pythonResults = Array.isArray(pythonResultsRaw) ? pythonResultsRaw : [];
  if (pythonResults.length !== tests.length) {
    return { ok: false, error: 'Тесты не пройдены' };
  }
  for (let index = 0; index < tests.length; index += 1) {
    const expectedTest = tests[index] && typeof tests[index] === 'object' ? tests[index] : {};
    const providedResult = pythonResults[index] && typeof pythonResults[index] === 'object'
      ? pythonResults[index]
      : {};
    const expectedInput = String(expectedTest.input ?? '');
    const providedInput = String(providedResult.input ?? '');
    if (providedInput !== expectedInput) {
      return { ok: false, error: 'Тесты не пройдены' };
    }
    const runtimeError = String(providedResult.error ?? '').trim();
    if (runtimeError) {
      return { ok: false, error: `Ошибка выполнения кода на тесте ${index + 1}` };
    }
    const expectedOutput = normalizeOutputValue(expectedTest.output ?? '');
    const providedOutput = normalizeOutputValue(providedResult.output ?? '');
    if (providedOutput !== expectedOutput) {
      return { ok: false, error: 'Тесты не пройдены' };
    }
  }
  return { ok: true };
};

const sanitizeTestsDbForStudent = (testsDb) => {
  if (!testsDb || typeof testsDb !== 'object') return {};
  const sanitizedDb = {};
  Object.entries(testsDb).forEach(([taskKey, taskValue]) => {
    if (!taskValue || typeof taskValue !== 'object' || Array.isArray(taskValue)) {
      sanitizedDb[taskKey] = taskValue;
      return;
    }
    const taskNum = Number(taskKey);
    const pythonTask = isPythonTaskNumber(taskNum);
    const nextTask = {};
    Object.entries(taskValue).forEach(([levelKey, levelValue]) => {
      if (!Array.isArray(levelValue)) {
        nextTask[levelKey] = levelValue;
        return;
      }
      const keepAnswers = pythonTask || levelKey === PYTHON_LEVEL_ID;
      nextTask[levelKey] = keepAnswers
        ? levelValue.map((question) => sanitizePythonQuestionForStudent(question))
        : levelValue.map((question) => sanitizeStudentQuestion(question));
    });
    sanitizedDb[taskKey] = nextTask;
  });
  return sanitizedDb;
};

const sanitizeMockExamForStudent = (exam) => {
  if (!exam || typeof exam !== 'object') return exam;
  const safe = { ...exam };
  const tasks = exam.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  const sanitizedTasks = {};
  Object.entries(tasks).forEach(([taskKey, taskValue]) => {
    sanitizedTasks[taskKey] = sanitizeStudentQuestion(taskValue);
  });
  safe.tasks = sanitizedTasks;
  return safe;
};

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const isPyFileName = (name) => String(name || '').toLowerCase().endsWith('.py');

const parseSizeString = (value) => {
  if (typeof value !== 'string') return 0;
  const normalized = value.replace(',', '.').trim();
  const match = normalized.match(/^([\d.]+)\s*(KB|MB|GB)?$/i);
  if (!match) return 0;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return 0;
  const unit = (match[2] || 'MB').toUpperCase();
  if (unit === 'KB') return Math.round(num * 1024);
  if (unit === 'GB') return Math.round(num * 1024 * 1024 * 1024);
  return Math.round(num * 1024 * 1024);
};

const normalizeFolderName = (name) => {
  if (typeof name !== 'string') return '';
  return name.trim();
};

const normalizeStudentName = (name) => {
  if (typeof name !== 'string') return '';
  return name.trim();
};

const normalizeStudentNickname = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeTeacherName = (name) => {
  if (typeof name !== 'string') return '';
  return name.trim();
};

const isPlaceholderName = (value) => typeof value === 'string' && /^\?+$/.test(value.trim());

const codeMatchesStudents = (code, students) => students.some((student) => {
  if (student?.codeHash) return verifyCode(code, student.codeHash);
  if (student?.code) return student.code === code;
  return false;
});

const codeMatchesTeachers = (code, teachers) => teachers.some((teacher) => {
  if (teacher?.codeHash) return verifyCode(code, teacher.codeHash);
  return false;
});

const generateStudentCode = (students, teachers = []) => {
  let code = '';
  while (!code || codeMatchesStudents(code, students) || codeMatchesTeachers(code, teachers)) {
    code = String(crypto.randomInt(100000, 999999));
  }
  return code;
};

const generateTeacherCode = (teachers, students = []) => {
  let code = '';
  while (!code || codeMatchesTeachers(code, teachers) || codeMatchesStudents(code, students)) {
    code = String(crypto.randomInt(100000, 999999));
  }
  return code;
};

const migrateStudentCodes = (students) => {
  let changed = false;
  students.forEach((student) => {
    if (student?.code && !student?.codeHash) {
      const plain = normalizeAccessCode(student.code);
      if (plain) {
        student.codeHash = hashCode(plain);
        student.codeHint = getCodeHint(plain);
      }
      delete student.code;
      changed = true;
    }
    if (student?.codeHash && typeof student.codeHint !== 'string') {
      student.codeHint = '';
      changed = true;
    }
  });
  if (changed) writeStudentsDb(students);
  return students;
};

const ensureDefaultTeacher = () => {
  const teachers = readTeachersDb();
  if (teachers.length === 0) {
    const plainCode = normalizeAccessCode(TEACHER_CODE) || generateTeacherCode(teachers, readStudentsDb());
    const entry = {
      id: crypto.randomUUID(),
      name: TEACHER_NAME,
      codeHash: hashCode(plainCode),
      codeHint: getCodeHint(plainCode),
      readSolvedEventIds: [],
      createdAt: new Date().toISOString(),
    };
    teachers.push(entry);
    writeTeachersDb(teachers);
  } else {
    const normalizedDefaultName = normalizeTeacherName(TEACHER_NAME);
    if (normalizedDefaultName) {
      let changed = false;
      teachers.forEach((teacher, idx) => {
        if (isPlaceholderName(teacher?.name)) {
          teachers[idx] = { ...teacher, name: normalizedDefaultName };
          changed = true;
        }
      });
      if (changed) writeTeachersDb(teachers);
    }
  }
  return teachers;
};

const ensureDefaultStudent = () => {
  const teachers = ensureDefaultTeacher();
  const defaultTeacherId = teachers[0]?.id || null;
  const students = readStudentsDb();
  if (students.length === 0) {
    const plainCode = generateStudentCode(students, teachers);
    const entry = {
      id: crypto.randomUUID(),
      name: 'Ученик 1',
      teacherId: defaultTeacherId,
      nickname: '',
      codeHash: hashCode(plainCode),
      codeHint: getCodeHint(plainCode),
      createdAt: new Date().toISOString(),
    };
    students.push(entry);
    writeStudentsDb(students);
  }
  return students;
};

const ensureStudentIds = () => {
  const teachers = ensureDefaultTeacher();
  const defaultTeacherId = teachers[0]?.id || null;
  const students = migrateStudentCodes(ensureDefaultStudent());
  const defaultStudentId = students[0]?.id || null;
  if (!defaultTeacherId || !defaultStudentId) return;

  const files = readFilesDb();
  let filesChanged = false;
  for (const file of files) {
    if (!file.studentId) {
      file.studentId = defaultStudentId;
      filesChanged = true;
    }
  }
  if (filesChanged) writeFilesDb(files);

  const folders = readFoldersDb();
  let foldersChanged = false;
  for (const folder of folders) {
    if (!folder.studentId) {
      folder.studentId = defaultStudentId;
      foldersChanged = true;
    }
  }
  if (foldersChanged) writeFoldersDb(folders);

  const updatedStudents = students.map((student) => {
    if (!student.teacherId) return { ...student, teacherId: defaultTeacherId };
    return student;
  });
  if (updatedStudents.some((s, idx) => s.teacherId !== students[idx].teacherId)) {
    writeStudentsDb(updatedStudents);
    return updatedStudents;
  }

  return students;
};

const hasCyrillic = (value) => /[\u0400-\u04FF]/.test(value);

const looksMojibake = (name) => {
  if (!name || hasCyrillic(name)) return false;
  // Typical case: UTF-8 bytes for Cyrillic interpreted as latin1 ("Ð", "Ñ" + 0x80..0xBF).
  if (/(?:\u00D0|\u00D1)[\u0080-\u00BF]/.test(name)) return true;
  // C1 controls should not appear in normal file names; they are common in mojibake.
  return /[\u0080-\u009F]/.test(name);
};

const normalizeFileName = (name) => {
  if (typeof name !== 'string') return '';
  if (!looksMojibake(name)) return name;
  try {
    const fixed = Buffer.from(name, 'latin1').toString('utf8');
    if (fixed && !fixed.includes('\uFFFD')) return fixed;
  } catch {}
  return name;
};

let adminAuth = ensureAdminAuth();

migrateFileNames();
migrateTestsFileNames();
migrateMockExamFileNames();
ensureStudentIds();
hydrateAuthSessions();

const getEntrySizeBytes = (entry) => {
  if (!entry) return 0;
  if (Number.isFinite(entry.sizeBytes)) return entry.sizeBytes;
  if (entry.storageName) {
    try {
      const stat = fs.statSync(path.join(uploadsDir, entry.storageName));
      return stat.size || 0;
    } catch {}
  }
  return parseSizeString(entry.size);
};

const getFolderTotalBytes = (filesDb, folderId, excludeFileId = '') => {
  if (!Array.isArray(filesDb) || !folderId) return 0;
  return filesDb
    .filter((file) => file?.folderId === folderId && file?.id !== excludeFileId)
    .reduce((sum, file) => sum + getEntrySizeBytes(file), 0);
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    req.fileId = id;
    const safeName = path.basename(normalizeFileName(file.originalname));
    cb(null, `${id}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_FILE_BYTES },
});

const handleUploadRequest = (req, res) => {
  const token = getAuthTokenFromRequest(req);
  const session = getAuthSession(token);
  if (!session) {
    clearAuthSessionCookie(res);
    return res.status(401).send('Требуется авторизация');
  }
  req.auth = session.user;
  if (isLeadRole(req.auth)) {
    return res.status(403).send('Недостаточно прав');
  }

  const rawName = req.params.storageName || '';
  const safeName = path.basename(rawName);
  if (!safeName) return res.status(400).send('Некорректное имя файла');

  const filePath = path.join(uploadsDir, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).send('Файл не найден');

  const ownedFile = readFilesDb().find((entry) => entry?.storageName === safeName);
  const ownerStudentId = typeof ownedFile?.studentId === 'string' ? ownedFile.studentId.trim() : '';
  if (ownedFile?.studentId) {
    const ownerStudent = findStudentById(ownedFile.studentId, { allowDeleted: true });
    if (!ownerStudent) return res.status(404).send('Файл не найден');
    if (!canAccessStudentByRole(req.auth, ownerStudent, { allowDeleted: true })) {
      return res.status(403).send('Недостаточно прав');
    }
  }

  const stat = fs.statSync(filePath);
  const queryStudentId = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : '';
  if (queryStudentId) {
    if (ownerStudentId && queryStudentId !== ownerStudentId) {
      return res.status(400).send('Некорректный studentId');
    }
    const student = findStudentById(queryStudentId);
    if (!student) return res.status(404).send('Ученик не найден');
    if (!canAccessStudentByRole(req.auth, student)) return res.status(403).send('Недостаточно прав');
  }

  const usageStudentId = (() => {
    if (!isStudentRole(req.auth)) return '';
    if (ownerStudentId) return ownerStudentId;
    if (queryStudentId) return queryStudentId;
    return req.auth.id;
  })();
  if (usageStudentId) {
    const student = findStudentById(usageStudentId);
    if (!student) return res.status(404).send('Ученик не найден');
    const requestSize = getRangeSize(req.headers.range, stat.size);
    const usage = getStudentUsage(usageStudentId);
    if (usage.remaining <= 0 || usage.used + requestSize > usage.limit) {
      return res.status(429).json({ error: 'Превышен лимит трафика для ученика' });
    }
    if (usage.used / usage.limit >= STUDENT_TRAFFIC_WARN_RATIO) {
      res.setHeader('X-Traffic-Warn', '1');
    }
    res.setHeader('X-Traffic-Used', String(usage.used));
    res.setHeader('X-Traffic-Limit', String(usage.limit));
    if (req.method === 'GET') {
      registerUsageOnFinish(usageStudentId, res, requestSize);
    }
  }

  return res.sendFile(filePath);
};

app.get('/uploads/:storageName', handleUploadRequest);
app.head('/uploads/:storageName', handleUploadRequest);

app.post('/api/login', (req, res) => {
  const { code } = req.body || {};
  const normalizedCode = normalizeAccessCode(code);
  if (!normalizedCode) return res.status(400).json({ error: 'Введите код доступа' });

  const clientKey = getClientKey(req);
  const rateInfo = getRateInfo(clientKey);
  if (rateInfo.blocked) {
    return res.status(429).json({
      error: 'Слишком много попыток. Попробуйте позже.',
      retryAfter: rateInfo.retryAfter,
    });
  }

  if (verifyCode(normalizedCode, adminAuth?.adminCodeHash)) {
    clearLoginFailures(clientKey);
    const session = createAuthSession({ id: 'admin1', name: ADMIN_NAME, role: 'admin' });
    return respondWithSession(res, session);
  }

  const teachers = readTeachersDb();
  const teacher = teachers.find((entry) => entry?.codeHash && verifyCode(normalizedCode, entry.codeHash));
  if (teacher) {
    clearLoginFailures(clientKey);
    const session = createAuthSession({ id: teacher.id, name: teacher.name, role: 'teacher' });
    return respondWithSession(res, session);
  }

  const students = readStudentsDb();
  const student = students.find((entry) => {
    if (entry?.deletedAt) return false;
    if (entry?.codeHash) return verifyCode(normalizedCode, entry.codeHash);
    if (entry?.code) return entry.code === normalizedCode;
    return false;
  });
  if (!student) {
    const deletedMatch = students.find((entry) => {
      if (!entry?.deletedAt) return false;
      if (entry?.codeHash) return verifyCode(normalizedCode, entry.codeHash);
      if (entry?.code) return entry.code === normalizedCode;
      return false;
    });
    if (deletedMatch) {
      return res.status(403).json({ error: 'Студент удалён. Обратитесь к учителю.' });
    }
    const blocked = registerLoginFailure(clientKey);
    if (blocked.blocked) {
      return res.status(429).json({
        error: 'Слишком много попыток. Попробуйте позже.',
        retryAfter: blocked.retryAfter,
      });
    }
    return res.status(401).json({ error: 'Неверный код доступа' });
  }

  clearLoginFailures(clientKey);
  const session = createAuthSession({
    id: student.id,
    name: student.name,
    role: 'student',
    teacherId: student.teacherId || null,
  });
  return respondWithSession(res, session);
});

app.post('/api/signup/login', (req, res) => {
  const rawGuestName = normalizeSignupGuestName(req.body?.name);
  const guestKey = normalizeSignupGuestKey(req.body?.guestKey);
  const chats = readSignupChatsDb();
  const nowIso = new Date().toISOString();
  let chat = null;

  if (guestKey) {
    const existingIdx = chats.findIndex((entry) => entry.guestKey && entry.guestKey === guestKey);
    if (existingIdx >= 0) {
      const existing = chats[existingIdx];
      let guestName = existing.guestName;
      if (rawGuestName) {
        if (rawGuestName.length > SIGNUP_GUEST_NAME_MAX_LENGTH) {
          return res.status(400).json({ error: `Имя слишком длинное (до ${SIGNUP_GUEST_NAME_MAX_LENGTH} символов)` });
        }
        if (/[/\\]/.test(rawGuestName)) return res.status(400).json({ error: 'Недопустимые символы в имени' });
        guestName = rawGuestName;
      }
      const restored = normalizeSignupChat({
        ...existing,
        guestName,
        updatedAt: nowIso,
        lastReadByLeadAt: nowIso,
      });
      if (restored) {
        chats[existingIdx] = restored;
        writeSignupChatsDb(chats);
        chat = restored;
      }
    }
  }

  if (!chat) {
    const guestName = rawGuestName;
    if (!guestName) return res.status(400).json({ error: 'Введите имя' });
    if (guestName.length > SIGNUP_GUEST_NAME_MAX_LENGTH) {
      return res.status(400).json({ error: `Имя слишком длинное (до ${SIGNUP_GUEST_NAME_MAX_LENGTH} символов)` });
    }
    if (/[/\\]/.test(guestName)) return res.status(400).json({ error: 'Недопустимые символы в имени' });

    const requestedTeacherId = typeof req.body?.teacherId === 'string' ? req.body.teacherId.trim() : '';
    const teacher = resolveSignupTeacher(requestedTeacherId);
    if (!teacher) {
      return res.status(503).json({ error: 'Пока нет преподавателя для записи. Попробуйте позже.' });
    }

    chat = normalizeSignupChat({
      id: crypto.randomUUID(),
      teacherId: teacher.id,
      guestUserId: crypto.randomUUID(),
      guestKey,
      guestName,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastMessageAt: nowIso,
      lastMessagePreview: '',
      lastMessageSenderRole: '',
      lastReadByTeacherAt: null,
      lastReadByLeadAt: nowIso,
      messages: [],
    });
    if (!chat) return res.status(500).json({ error: 'Не удалось создать чат' });

    chats.unshift(chat);
    writeSignupChatsDb(chats);
  }

  const session = createAuthSession({
    id: chat.guestUserId,
    name: chat.guestName,
    role: 'lead',
    chatId: chat.id,
    teacherId: chat.teacherId,
  });
  return respondWithSession(res, session);
});

app.post('/api/logout', (req, res) => {
  const token = getAuthTokenFromRequest(req);
  if (token) deleteAuthSession(token);
  clearAuthSessionCookie(res);
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  const token = getAuthTokenFromRequest(req);
  const session = getAuthSession(token);
  if (!session) {
    clearAuthSessionCookie(res);
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  req.auth = session.user;
  req.authToken = session.token;
  setAuthSessionCookie(res, session);
  if (isLeadRole(req.auth) && !isLeadAllowedApiRequest(req)) {
    return forbid(res);
  }
  return next();
});

app.get('/api/rtc/presence', (req, res) => {
  const roomMeta = parseRtcRoomId(req.query?.roomId);
  if (!roomMeta) {
    return res.status(400).json({ error: 'Некорректная комната' });
  }

  const accessError = getRtcRoomAccessError(req.auth, roomMeta);
  if (accessError) {
    return res.status(403).json({ error: accessError });
  }

  const participants = getRtcPresenceParticipantsForRoom(roomMeta.roomId);

  return res.json({
    roomId: roomMeta.roomId,
    participants,
    count: participants.length,
  });
});

app.get('/api/signup-chat/messages', (req, res) => {
  if (!isLeadRole(req.auth)) return forbid(res);
  const chats = readSignupChatsDb();
  const access = ensureSignupChatAccess(req, res, req.auth?.chatId, { chats });
  if (!access) return;
  const { index } = access;
  let chat = access.chat;

  const markResult = markSignupChatReadByLead(chat);
  if (markResult.changed) {
    chats[index] = normalizeSignupChat(markResult.chat) || markResult.chat;
    writeSignupChatsDb(chats);
    chat = chats[index];
  }

  const teacherName = findTeacherById(chat.teacherId)?.name || 'Преподаватель';
  return res.json({
    chat: {
      ...buildSignupChatSummary(chat),
      teacherName,
    },
    messages: Array.isArray(chat.messages) ? chat.messages : [],
  });
});

app.post('/api/signup-chat/messages', (req, res) => {
  if (!isLeadRole(req.auth)) return forbid(res);
  const text = normalizeSignupMessageText(req.body?.text);
  if (!text) return res.status(400).json({ error: 'Введите сообщение' });

  const chats = readSignupChatsDb();
  const access = ensureSignupChatAccess(req, res, req.auth?.chatId, { chats });
  if (!access) return;
  const { index } = access;
  const chat = access.chat;

  const message = createSignupChatMessage({
    senderRole: 'lead',
    senderId: req.auth.id,
    senderName: chat.guestName,
    text,
  });
  if (!message.text || !message.senderId) {
    return res.status(400).json({ error: 'Некорректное сообщение' });
  }

  chats[index] = normalizeSignupChat(appendSignupChatMessage(chat, message)) || chat;
  writeSignupChatsDb(chats);
  const updatedChat = chats[index];
  const teacherName = findTeacherById(updatedChat.teacherId)?.name || 'Преподаватель';
  return res.json({
    ok: true,
    message,
    chat: {
      ...buildSignupChatSummary(updatedChat),
      teacherName,
    },
  });
});

app.get('/api/signup-chats', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  let chats = readSignupChatsDb();
  if (isTeacherRole(req.auth)) {
    chats = chats.filter((chat) => chat.teacherId === req.auth.id);
  }
  chats.sort((left, right) => getSignupChatSortTimestamp(right) - getSignupChatSortTimestamp(left));
  return res.json(chats.map((chat) => ({
    ...buildSignupChatSummary(chat),
    teacherName: findTeacherById(chat.teacherId)?.name || 'Преподаватель',
  })));
});

app.get('/api/signup-chats/:chatId/messages', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  const chats = readSignupChatsDb();
  const access = ensureSignupChatAccess(req, res, req.params.chatId, { chats });
  if (!access) return;
  const { index } = access;
  let chat = access.chat;

  const markResult = markSignupChatReadByTeacher(chat);
  if (markResult.changed) {
    chats[index] = normalizeSignupChat(markResult.chat) || markResult.chat;
    writeSignupChatsDb(chats);
    chat = chats[index];
  }

  const teacherName = findTeacherById(chat.teacherId)?.name || 'Преподаватель';
  return res.json({
    chat: {
      ...buildSignupChatSummary(chat),
      teacherName,
    },
    messages: Array.isArray(chat.messages) ? chat.messages : [],
  });
});

app.post('/api/signup-chats/:chatId/messages', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  const text = normalizeSignupMessageText(req.body?.text);
  if (!text) return res.status(400).json({ error: 'Введите сообщение' });

  const chats = readSignupChatsDb();
  const access = ensureSignupChatAccess(req, res, req.params.chatId, { chats });
  if (!access) return;
  const { index } = access;
  const chat = access.chat;

  const senderName = String(req.auth?.name || '').trim() || (findTeacherById(chat.teacherId)?.name || 'Преподаватель');
  const message = createSignupChatMessage({
    senderRole: 'teacher',
    senderId: req.auth.id,
    senderName,
    text,
  });
  if (!message.text || !message.senderId) {
    return res.status(400).json({ error: 'Некорректное сообщение' });
  }

  chats[index] = normalizeSignupChat(appendSignupChatMessage(chat, message)) || chat;
  writeSignupChatsDb(chats);
  const updatedChat = chats[index];
  const teacherName = findTeacherById(updatedChat.teacherId)?.name || 'Преподаватель';
  return res.json({
    ok: true,
    message,
    chat: {
      ...buildSignupChatSummary(updatedChat),
      teacherName,
    },
  });
});

app.delete('/api/signup-chats/:chatId', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  const chats = readSignupChatsDb();
  const access = ensureSignupChatAccess(req, res, req.params.chatId, { chats });
  if (!access) return;
  const { index, chat } = access;
  chats.splice(index, 1);
  writeSignupChatsDb(chats);
  return res.json({
    ok: true,
    chatId: chat.id,
  });
});

app.get('/api/push/public-key', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const student = findStudentById(req.auth.id);
  if (!student) return res.status(404).json({ error: 'Ученик не найден' });
  const runtime = ensurePushRuntimeConfigured();
  if (!runtime.enabled || !runtime.publicKey) {
    return res.status(503).json({ error: runtime.error || 'Push не настроен на сервере' });
  }
  return res.json({ publicKey: runtime.publicKey });
});

app.get('/api/push/subscription', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const student = findStudentById(req.auth.id);
  if (!student) return res.status(404).json({ error: 'Ученик не найден' });
  const pushDb = readPushDb();
  const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
  const list = Array.isArray(subscriptionsByStudent[student.id]) ? subscriptionsByStudent[student.id] : [];
  return res.json({
    subscribed: list.length > 0,
    count: list.length,
  });
});

app.post('/api/push/subscription', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const student = findStudentById(req.auth.id);
  if (!student) return res.status(404).json({ error: 'Ученик не найден' });
  const runtime = ensurePushRuntimeConfigured();
  if (!runtime.enabled) {
    return res.status(503).json({ error: runtime.error || 'Push не настроен на сервере' });
  }
  const subscription = normalizePushSubscription(req.body?.subscription || req.body);
  if (!subscription) {
    return res.status(400).json({ error: 'Некорректная push-подписка' });
  }
  const userAgent = typeof req.headers['user-agent'] === 'string'
    ? req.headers['user-agent'].slice(0, 500)
    : '';

  const pushDb = readPushDb();
  const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
  let changed = false;
  Object.keys(subscriptionsByStudent).forEach((studentId) => {
    if (studentId === student.id) return;
    const filtered = (subscriptionsByStudent[studentId] || []).filter((entry) => entry.endpoint !== subscription.endpoint);
    if (filtered.length !== (subscriptionsByStudent[studentId] || []).length) {
      changed = true;
      if (filtered.length > 0) subscriptionsByStudent[studentId] = filtered;
      else delete subscriptionsByStudent[studentId];
    }
  });

  const nowIso = new Date().toISOString();
  const current = Array.isArray(subscriptionsByStudent[student.id]) ? [...subscriptionsByStudent[student.id]] : [];
  const idx = current.findIndex((entry) => entry.endpoint === subscription.endpoint);
  if (idx >= 0) {
    const prev = current[idx];
    current[idx] = {
      ...prev,
      endpoint: subscription.endpoint,
      subscription,
      updatedAt: nowIso,
      userAgent,
    };
  } else {
    current.unshift({
      endpoint: subscription.endpoint,
      subscription,
      createdAt: nowIso,
      updatedAt: nowIso,
      userAgent,
    });
  }
  subscriptionsByStudent[student.id] = current;
  writePushDb({
    ...pushDb,
    subscriptionsByStudent,
  });

  return res.json({
    ok: true,
    subscribed: true,
    count: current.length,
    changed: changed || idx === -1,
  });
});

app.delete('/api/push/subscription', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const student = findStudentById(req.auth.id);
  if (!student) return res.status(404).json({ error: 'Ученик не найден' });

  const endpoint = String(req.body?.endpoint || req.query?.endpoint || '').trim();
  const pushDb = readPushDb();
  const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
  const remindersByStudent = normalizePushRemindersByStudent(pushDb.remindersByStudent);
  const current = Array.isArray(subscriptionsByStudent[student.id]) ? [...subscriptionsByStudent[student.id]] : [];
  const next = endpoint
    ? current.filter((entry) => entry.endpoint !== endpoint)
    : [];

  if (next.length > 0) {
    subscriptionsByStudent[student.id] = next;
  } else {
    delete subscriptionsByStudent[student.id];
    delete remindersByStudent[student.id];
  }

  writePushDb({
    ...pushDb,
    subscriptionsByStudent,
    remindersByStudent,
  });

  return res.json({
    ok: true,
    subscribed: next.length > 0,
    count: next.length,
  });
});

app.get('/api/students', (req, res) => {
  const { teacherId, includeDeleted, deletedOnly } = req.query;
  if (isStudentRole(req.auth)) return forbid(res);
  let students = readStudentsDb();
  if (isTeacherRole(req.auth)) {
    students = students.filter((s) => s.teacherId === req.auth.id);
  } else if (teacherId) {
    students = students.filter((s) => s.teacherId === teacherId);
  }
  const includeDeletedFlag = includeDeleted === '1' || includeDeleted === 'true';
  const deletedOnlyFlag = deletedOnly === '1' || deletedOnly === 'true';
  if (deletedOnlyFlag) {
    students = students.filter(isStudentDeleted);
  } else if (!includeDeletedFlag) {
    students = students.filter(isActiveStudent);
  }
  const sanitized = students.map(({ codeHash, code, ...rest }) => {
    const data = getStudentData(rest.id);
    const xpTotal = normalizeXpTotal(data?.xpTotal);
    const level = Math.floor(xpTotal / XP_PER_LEVEL) + 1;
    return {
      ...rest,
      leaderboardAlias: normalizeLeaderboardAlias(data?.leaderboardAlias),
      xpTotal,
      level,
    };
  });
  res.json(sanitized);
});

app.get('/api/students/leaderboard', (req, res) => {
  const { teacherId } = req.query;
  const requestedTeacherId = typeof teacherId === 'string' ? teacherId.trim() : '';
  const includeTeacherIdentity = isTeacherRole(req.auth);
  let students = readStudentsDb().filter(isActiveStudent);

  if (isStudentRole(req.auth)) {
    const currentStudent = ensureStudentAccess(req, res, req.auth?.id);
    if (!currentStudent) return;
    students = students.filter((entry) => entry.teacherId === currentStudent.teacherId);
  } else if (isTeacherRole(req.auth)) {
    if (requestedTeacherId && requestedTeacherId !== req.auth.id) return forbid(res);
    students = students.filter((entry) => entry.teacherId === req.auth.id);
  } else if (requestedTeacherId) {
    const teacher = findTeacherById(requestedTeacherId);
    if (!teacher) return res.status(404).json({ error: 'Учитель не найден' });
    students = students.filter((entry) => entry.teacherId === teacher.id);
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const fallbackEndDayNum = Math.floor(Date.now() / DAY_MS);
  const parsedTodayNum = dayKeyToNumber(todayKey);
  const endDayNum = Number.isFinite(parsedTodayNum) ? parsedTodayNum : fallbackEndDayNum;
  const startDayNum = endDayNum - (LEADERBOARD_WEEK_DAYS - 1);
  const startDay = numberToDayKey(startDayNum) || todayKey;
  const endDay = numberToDayKey(endDayNum) || todayKey;
  const currentStudentId = isStudentRole(req.auth) ? String(req.auth.id || '') : '';
  const studentsSortedForAnon = [...students].sort((a, b) => {
    const aTs = Date.parse(a?.createdAt || '');
    const bTs = Date.parse(b?.createdAt || '');
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return aTs - bTs;
    return String(a?.id || '').localeCompare(String(b?.id || ''), 'ru');
  });
  const anonNameById = new Map(
    studentsSortedForAnon.map((student, index) => [student.id, `Аноним ${index + 1}`])
  );

  const items = students.map((student) => {
    const data = getStudentData(student.id);
    const xpTotal = normalizeXpTotal(data?.xpTotal);
    const weeklyXp = getRecentXpFromSolvedEvents(data?.solvedEvents, endDayNum, LEADERBOARD_WEEK_DAYS);
    const level = Math.floor(xpTotal / XP_PER_LEVEL) + 1;
    const alias = normalizeLeaderboardAlias(data?.leaderboardAlias);
    const mainName = includeTeacherIdentity ? normalizeStudentName(student.name) : '';
    const nickname = includeTeacherIdentity ? normalizeStudentNickname(student.nickname) : '';
    return {
      studentId: student.id,
      publicName: alias || anonNameById.get(student.id) || 'Аноним',
      level,
      xpTotal,
      weeklyXp,
      hasAlias: Boolean(alias),
      mainName,
      nickname,
      isCurrent: Boolean(currentStudentId && student.id === currentStudentId),
    };
  });
  items.sort((a, b) => String(a.publicName || '').localeCompare(String(b.publicName || ''), 'ru'));
  const currentStudent = currentStudentId
    ? (items.find((item) => item.studentId === currentStudentId) || null)
    : null;
  const currentStudentEntry = currentStudentId
    ? (students.find((item) => item.id === currentStudentId) || null)
    : null;

  return res.json({
    week: {
      startDay,
      endDay,
      days: LEADERBOARD_WEEK_DAYS,
    },
    items,
    currentStudent: currentStudent
      ? {
          studentId: currentStudent.studentId,
          publicName: currentStudent.publicName,
          hasAlias: currentStudent.hasAlias,
          mainName: normalizeStudentName(currentStudentEntry?.name || ''),
        }
      : null,
  });
});

app.patch('/api/students/leaderboard-alias', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const student = ensureStudentAccess(req, res, req.auth.id);
  if (!student) return;
  const useMainName = Boolean(req.body?.useMainName);
  const alias = useMainName
    ? normalizeLeaderboardAlias(normalizeStudentName(student.name))
    : normalizeLeaderboardPseudonym(req.body?.alias);
  if (!alias) {
    return res.status(400).json({
      error: useMainName
        ? `Имя для рейтинга должно быть от ${LEADERBOARD_ALIAS_MIN_LENGTH} до ${LEADERBOARD_ALIAS_MAX_LENGTH} символов.`
        : `Псевдоним должен быть от ${LEADERBOARD_PSEUDONYM_MIN_LENGTH} до ${LEADERBOARD_PSEUDONYM_MAX_LENGTH} символов и содержать только русские буквы.`,
    });
  }
  if (!useMainName && containsBlockedLeaderboardWord(alias)) {
    return res.status(400).json({
      error: 'Псевдоним содержит недопустимые слова. Выберите другой.',
    });
  }

  const data = getStudentData(student.id);
  const updated = setStudentData(student.id, { ...data, leaderboardAlias: alias });
  return res.json({ ok: true, alias: normalizeLeaderboardAlias(updated?.leaderboardAlias) });
});

app.post('/api/students', (req, res) => {
  const { name, teacherId } = req.body || {};
  if (isStudentRole(req.auth)) return forbid(res);
  const studentName = normalizeStudentName(name);
  if (!studentName) return res.status(400).json({ error: 'Введите имя ученика' });
  if (studentName.length > 60) return res.status(400).json({ error: 'Имя слишком длинное' });
  if (/[/\\]/.test(studentName)) return res.status(400).json({ error: 'Недопустимые символы' });

  const teachers = readTeachersDb();
  const requestedTeacherId = typeof teacherId === 'string' ? teacherId.trim() : '';
  if (isTeacherRole(req.auth) && requestedTeacherId && requestedTeacherId !== req.auth.id) {
    return forbid(res);
  }
  const resolvedTeacherId = isTeacherRole(req.auth)
    ? req.auth.id
    : (requestedTeacherId || teachers[0]?.id || null);
  if (!resolvedTeacherId || !teachers.some((t) => t.id === resolvedTeacherId)) {
    return res.status(400).json({ error: 'Укажите учителя' });
  }

  const students = readStudentsDb();
  const plainCode = generateStudentCode(students, teachers);
  const entry = {
    id: crypto.randomUUID(),
    name: studentName,
    teacherId: resolvedTeacherId,
    nickname: '',
    codeHash: hashCode(plainCode),
    codeHint: getCodeHint(plainCode),
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };
  students.unshift(entry);
  writeStudentsDb(students);
  const createdStudentData = getStudentData(entry.id);
  const createdXpTotal = normalizeXpTotal(createdStudentData?.xpTotal);
  res.json({
    id: entry.id,
    name: entry.name,
    nickname: entry.nickname || '',
    leaderboardAlias: '',
    xpTotal: createdXpTotal,
    level: Math.floor(createdXpTotal / XP_PER_LEVEL) + 1,
    teacherId: entry.teacherId,
    code: plainCode,
    codeHint: entry.codeHint,
    createdAt: entry.createdAt
  });
});

app.delete('/api/students/:id', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const students = readStudentsDb();
  const idx = students.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ученик не найден' });
  if (students[idx]?.deletedAt) return res.status(404).json({ error: 'Ученик удалён' });
  if (isTeacherRole(req.auth) && students[idx]?.teacherId !== req.auth.id) return forbid(res);

  const existing = students[idx];
  if (existing?.deletedAt) {
    return res.json({ ok: true, deletedAt: existing.deletedAt });
  }
  const deletedAt = new Date().toISOString();
  students[idx] = { ...existing, deletedAt };
  writeStudentsDb(students);

  res.json({ ok: true, deletedAt });
});

app.post('/api/students/:id/restore', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const students = readStudentsDb();
  const idx = students.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ученик не найден' });
  if (isTeacherRole(req.auth) && students[idx]?.teacherId !== req.auth.id) return forbid(res);

  const existing = students[idx];
  if (!existing?.deletedAt) {
    return res.status(400).json({ error: 'Ученик не удалён' });
  }
  const deletedAtMs = Date.parse(existing.deletedAt);
  if (!Number.isFinite(deletedAtMs)) {
    return res.status(400).json({ error: 'Некорректная дата удаления' });
  }
  if (Date.now() - deletedAtMs > SOFT_DELETE_TTL_MS) {
    students.splice(idx, 1);
    writeStudentsDb(students);
    hardDeleteStudentData([existing.id]);
    return res.status(410).json({ error: 'Срок восстановления истёк' });
  }

  const restored = { ...existing, deletedAt: null };
  students[idx] = restored;
  writeStudentsDb(students);
  const restoredData = getStudentData(restored.id);
  const restoredXpTotal = normalizeXpTotal(restoredData?.xpTotal);
  res.json({
    id: restored.id,
    name: restored.name,
    nickname: restored.nickname || '',
    leaderboardAlias: normalizeLeaderboardAlias(restoredData?.leaderboardAlias),
    xpTotal: restoredXpTotal,
    level: Math.floor(restoredXpTotal / XP_PER_LEVEL) + 1,
    teacherId: restored.teacherId,
    codeHint: restored.codeHint,
    createdAt: restored.createdAt,
    deletedAt: restored.deletedAt
  });
});

app.get('/api/task-titles', (_req, res) => {
  const data = readTaskTitlesDb();
  res.json(data || {});
});

app.patch('/api/task-titles', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const { number, title } = req.body || {};
  const taskNumber = Number(number);
  if (!Number.isFinite(taskNumber) || taskNumber < 1 || taskNumber > 27) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  const trimmed = typeof title === 'string' ? title.trim() : '';
  const db = readTaskTitlesDb();
  const key = String(taskNumber);
  if (!trimmed) {
    if (db[key]) delete db[key];
    writeTaskTitlesDb(db);
    return res.json({ ok: true, number: taskNumber, title: '' });
  }
  if (trimmed.length > 120) {
    return res.status(400).json({ error: 'Название слишком длинное' });
  }
  db[key] = trimmed;
  writeTaskTitlesDb(db);
  res.json({ ok: true, number: taskNumber, title: trimmed });
});

app.get('/api/teachers', (_req, res) => {
  if (!isAdminRole(_req.auth)) return forbid(res);
  const teachers = readTeachersDb();
  const sanitized = teachers.map(({ codeHash, readSolvedEventIds, ...rest }) => rest);
  res.json(sanitized);
});

app.post('/api/teachers', (req, res) => {
  if (!isAdminRole(req.auth)) return forbid(res);
  const { name } = req.body || {};
  const teacherName = normalizeTeacherName(name);
  if (!teacherName) return res.status(400).json({ error: 'Введите имя учителя' });
  if (teacherName.length > 60) return res.status(400).json({ error: 'Имя слишком длинное' });
  if (/[/\\]/.test(teacherName)) return res.status(400).json({ error: 'Недопустимые символы' });

  const teachers = readTeachersDb();
  const students = readStudentsDb();
  const plainCode = generateTeacherCode(teachers, students);
  const entry = {
    id: crypto.randomUUID(),
    name: teacherName,
    codeHash: hashCode(plainCode),
    codeHint: getCodeHint(plainCode),
    readSolvedEventIds: [],
    createdAt: new Date().toISOString(),
  };
  teachers.unshift(entry);
  writeTeachersDb(teachers);
  res.json({ id: entry.id, name: entry.name, code: plainCode, codeHint: entry.codeHint, createdAt: entry.createdAt });
});

app.patch('/api/teachers/:id', (req, res) => {
  if (!isAdminRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const { name } = req.body || {};
  const teacherName = normalizeTeacherName(name);
  if (!teacherName) return res.status(400).json({ error: 'Введите имя учителя' });
  if (teacherName.length > 60) return res.status(400).json({ error: 'Имя слишком длинное' });
  if (/[/\\]/.test(teacherName)) return res.status(400).json({ error: 'Недопустимые символы' });

  const teachers = readTeachersDb();
  const idx = teachers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Учитель не найден' });

  const updated = { ...teachers[idx], name: teacherName };
  teachers[idx] = updated;
  writeTeachersDb(teachers);
  res.json({ id: updated.id, name: updated.name, codeHint: updated.codeHint, createdAt: updated.createdAt });
});

app.delete('/api/teachers/:id', (req, res) => {
  if (!isAdminRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const teachers = readTeachersDb();
  const idx = teachers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Учитель не найден' });

  const removed = teachers.splice(idx, 1)[0];
  writeTeachersDb(teachers);

  const students = readStudentsDb();
  const toRemove = students.filter((s) => s.teacherId === id);
  if (toRemove.length > 0) {
    const remaining = students.filter((s) => s.teacherId !== id);
    writeStudentsDb(remaining);
    hardDeleteStudentData(toRemove.map((student) => student.id));
  }

  res.json({ ok: true, removedTeacher: { id: removed.id, name: removed.name } });
});

app.post('/api/teachers/:id/reset-code', (req, res) => {
  if (!isAdminRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const teachers = readTeachersDb();
  const idx = teachers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Учитель не найден' });

  const students = readStudentsDb();
  const plainCode = generateTeacherCode(teachers, students);
  const updated = {
    ...teachers[idx],
    codeHash: hashCode(plainCode),
    codeHint: getCodeHint(plainCode),
  };
  teachers[idx] = updated;
  writeTeachersDb(teachers);
  res.json({ id: updated.id, code: plainCode, codeHint: updated.codeHint });
});

app.patch('/api/students/:id', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const { name, nickname, leaderboardAlias } = req.body || {};
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
  const hasNickname = Object.prototype.hasOwnProperty.call(req.body || {}, 'nickname');
  const hasLeaderboardAlias = Object.prototype.hasOwnProperty.call(req.body || {}, 'leaderboardAlias');

  if (!hasName && !hasNickname && !hasLeaderboardAlias) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }

  let studentName = null;
  if (hasName) {
    studentName = normalizeStudentName(name);
    if (!studentName) return res.status(400).json({ error: 'Введите имя ученика' });
    if (studentName.length > 60) return res.status(400).json({ error: 'Имя слишком длинное' });
    if (/[/\\]/.test(studentName)) return res.status(400).json({ error: 'Недопустимые символы' });
  }

  let studentNickname = null;
  if (hasNickname) {
    studentNickname = normalizeStudentNickname(nickname);
    if (studentNickname.length > 60) return res.status(400).json({ error: 'Прозвище слишком длинное' });
    if (/[/\\]/.test(studentNickname)) return res.status(400).json({ error: 'Недопустимые символы' });
  }

  let studentLeaderboardAlias = null;
  if (hasLeaderboardAlias) {
    const rawAlias = typeof leaderboardAlias === 'string' ? leaderboardAlias.trim() : '';
    if (!rawAlias) {
      studentLeaderboardAlias = '';
    } else {
      const normalizedPseudonym = normalizeLeaderboardPseudonym(rawAlias);
      if (!normalizedPseudonym) {
        return res.status(400).json({
          error: `Псевдоним должен быть от ${LEADERBOARD_PSEUDONYM_MIN_LENGTH} до ${LEADERBOARD_PSEUDONYM_MAX_LENGTH} символов и содержать только русские буквы.`,
        });
      }
      if (containsBlockedLeaderboardWord(normalizedPseudonym)) {
        return res.status(400).json({ error: 'Псевдоним содержит недопустимые слова. Выберите другой.' });
      }
      studentLeaderboardAlias = normalizedPseudonym;
    }
  }

  const students = readStudentsDb();
  const idx = students.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ученик не найден' });
  if (isTeacherRole(req.auth) && students[idx]?.teacherId !== req.auth.id) return forbid(res);

  const updated = { ...students[idx] };
  if (hasName) updated.name = studentName;
  if (hasNickname) updated.nickname = studentNickname;

  students[idx] = updated;
  writeStudentsDb(students);
  if (hasLeaderboardAlias) {
    const data = getStudentData(updated.id);
    setStudentData(updated.id, { ...data, leaderboardAlias: studentLeaderboardAlias });
  }
  const updatedData = getStudentData(updated.id);
  const storedAlias = normalizeLeaderboardAlias(updatedData?.leaderboardAlias);
  const updatedXpTotal = normalizeXpTotal(updatedData?.xpTotal);
  res.json({
    id: updated.id,
    name: updated.name,
    nickname: updated.nickname || '',
    leaderboardAlias: storedAlias,
    xpTotal: updatedXpTotal,
    level: Math.floor(updatedXpTotal / XP_PER_LEVEL) + 1,
    codeHint: updated.codeHint,
    teacherId: updated.teacherId,
    createdAt: updated.createdAt
  });
});

app.post('/api/students/:id/reset-code', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const students = readStudentsDb();
  const idx = students.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ученик не найден' });
  if (students[idx]?.deletedAt) return res.status(404).json({ error: 'Ученик удалён' });
  if (isTeacherRole(req.auth) && students[idx]?.teacherId !== req.auth.id) return forbid(res);

  const teachers = readTeachersDb();
  const plainCode = generateStudentCode(students, teachers);
  const updated = {
    ...students[idx],
    codeHash: hashCode(plainCode),
    codeHint: getCodeHint(plainCode),
  };
  students[idx] = updated;
  writeStudentsDb(students);
  res.json({ id: updated.id, code: plainCode, codeHint: updated.codeHint });
});

app.get('/api/tests', (req, res) => {
  const data = readTestsDb();
  if (isStudentRole(req.auth)) {
    return res.json(sanitizeTestsDbForStudent(data || {}));
  }
  return res.json(data || {});
});

app.put('/api/tests', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Некорректные данные' });
  }
  writeTestsDb(payload);
  res.json({ ok: true });
});

app.get('/api/mock-exams', (req, res) => {
  const list = readMockExamsDb();
  const { studentId } = req.query || {};
  const requestedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
  if (isStudentRole(req.auth)) {
    if (requestedStudentId && requestedStudentId !== req.auth.id) return forbid(res);
    const filtered = (Array.isArray(list) ? list : []).filter((exam) => (
      isMockExamVisibleToStudent(exam, req.auth.id)
    ));
    return res.json(filtered.map((exam) => sanitizeMockExamForStudent(exam)));
  }
  if (requestedStudentId) {
    const student = ensureStudentAccess(req, res, requestedStudentId);
    if (!student) return;
    const filtered = (Array.isArray(list) ? list : []).filter((exam) => (
      isMockExamVisibleToStudent(exam, student.id)
    ));
    return res.json(filtered);
  }
  res.json(Array.isArray(list) ? list : []);
});

app.post('/api/mock-exams', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const { title } = req.body || {};
  const trimmed = typeof title === 'string' ? title.trim() : '';
  const entry = {
    id: crypto.randomUUID(),
    title: trimmed || `Пробник ${new Date().toLocaleDateString('ru-RU')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: {},
    access: { all: false, students: [] },
  };
  const list = readMockExamsDb();
  list.unshift(entry);
  writeMockExamsDb(list);
  res.json(entry);
});

app.get('/api/mock-exams/attempt', (req, res) => {
  const { studentId, examId } = req.query;
  const requestedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
  if (isStudentRole(req.auth) && requestedStudentId && requestedStudentId !== req.auth.id) return forbid(res);
  const effectiveStudentId = isStudentRole(req.auth) ? req.auth.id : requestedStudentId;
  if (!effectiveStudentId || !examId) return res.status(400).json({ error: 'studentId and examId required' });
  const student = ensureStudentAccess(req, res, effectiveStudentId);
  if (!student) return;
  const list = readMockExamsDb();
  const exam = (Array.isArray(list) ? list : []).find((item) => item.id === String(examId));
  if (!exam) return res.status(404).json({ error: 'Mock exam not found' });
  if (!isMockExamVisibleToStudent(exam, student.id)) {
    return res.status(403).json({ error: 'Mock exam access denied' });
  }
  const data = getStudentData(student.id);
  const attempts = data.mockAttempts && typeof data.mockAttempts === 'object' ? data.mockAttempts : {};
  const stored = attempts[String(examId)] && typeof attempts[String(examId)] === 'object'
    ? attempts[String(examId)]
    : {};
  res.json(normalizeMockAttemptPayload(exam, stored.answers, stored.updatedAt));
});

app.put('/api/mock-exams/attempt', (req, res) => {
  const { studentId, examId, answers } = req.body || {};
  const requestedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
  if (isStudentRole(req.auth) && requestedStudentId && requestedStudentId !== req.auth.id) return forbid(res);
  const effectiveStudentId = isStudentRole(req.auth) ? req.auth.id : requestedStudentId;
  if (!effectiveStudentId || !examId) return res.status(400).json({ error: 'studentId and examId required' });
  const student = ensureStudentAccess(req, res, effectiveStudentId);
  if (!student) return;
  const list = readMockExamsDb();
  const exam = (Array.isArray(list) ? list : []).find((item) => item.id === String(examId));
  if (!exam) return res.status(404).json({ error: 'Mock exam not found' });
  if (!isMockExamVisibleToStudent(exam, student.id)) {
    return res.status(403).json({ error: 'Mock exam access denied' });
  }
  const data = getStudentData(student.id);
  const attempts = data.mockAttempts && typeof data.mockAttempts === 'object' ? { ...data.mockAttempts } : {};
  const normalizedAttempt = normalizeMockAttemptPayload(exam, answers, new Date().toISOString());
  attempts[String(examId)] = normalizedAttempt;
  const updated = setStudentData(student.id, { ...data, mockAttempts: attempts });
  res.json(updated.mockAttempts?.[String(examId)] || normalizedAttempt);
});

app.patch('/api/mock-exams/:id', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const { title, tasks, access } = req.body || {};
  const list = readMockExamsDb();
  const idx = list.findIndex((exam) => exam.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Пробник не найден' });
  const current = list[idx];
  const trimmed = typeof title === 'string' ? title.trim() : '';
  const next = {
    ...current,
    title: trimmed || current.title,
    tasks: tasks && typeof tasks === 'object' ? tasks : current.tasks || {},
    access: access && typeof access === 'object' ? normalizeMockExamAccessForSave(access) : current.access,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = next;
  writeMockExamsDb(list);
  res.json(next);
});

app.delete('/api/mock-exams/:id', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const list = readMockExamsDb();
  const filtered = list.filter((exam) => exam.id !== id);
  if (filtered.length === list.length) return res.status(404).json({ error: 'Пробник не найден' });
  writeMockExamsDb(filtered);
  res.json({ ok: true });
});
app.patch('/api/teacher-code', (req, res) => {
  const { teacherId, currentCode, newCode } = req.body || {};
  const current = normalizeAccessCode(currentCode);
  const next = normalizeAccessCode(newCode);
  if (!teacherId) return res.status(400).json({ error: 'teacherId required' });
  if (!current || !next) return res.status(400).json({ error: 'Введите текущий и новый код' });
  if (next.length < 4 || next.length > 32) {
    return res.status(400).json({ error: 'Код должен быть от 4 до 32 символов' });
  }
  if (!ensureTeacherAccess(req, res, teacherId)) return;

  const teachers = readTeachersDb();
  const idx = teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return res.status(404).json({ error: 'Учитель не найден' });
  if (!verifyCode(current, teachers[idx]?.codeHash)) {
    return res.status(401).json({ error: 'Текущий код неверный' });
  }

  teachers[idx] = {
    ...teachers[idx],
    codeHash: hashCode(next),
    codeHint: getCodeHint(next),
  };
  writeTeachersDb(teachers);
  res.json({ ok: true });
});

app.get('/api/progress', (req, res) => {
  const { studentId } = req.query;
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const progress = recomputeProgressFromSolved(data);
  res.json(progress || {});
});

app.patch('/api/progress', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { studentId, taskId, value } = req.body || {};
  if (!Number.isFinite(Number(taskId))) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return res.status(400).json({ error: 'Некорректное значение' });
  }
  const data = getStudentData(student.id);
  const key = String(taskId);
  const clamped = Math.max(0, Math.min(100, score));
  const progress = { ...(data.progress || {}) };
  progress[key] = clamped;
  const updated = setStudentData(student.id, { ...data, progress });
  res.json(updated.progress);
});

app.post('/api/progress/solve', async (req, res) => {
  try {
  const {
    studentId,
    taskNumber,
    levelId,
    questionId,
    code,
    pythonResults,
    localDay
  } = req.body || {};
  if (!taskNumber || !levelId || !questionId) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const requestedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
  const effectiveStudentId = isStudentRole(req.auth)
    ? req.auth.id
    : requestedStudentId;
  if (!effectiveStudentId) return res.status(400).json({ error: 'studentId required' });
  if (isStudentRole(req.auth) && requestedStudentId && requestedStudentId !== req.auth.id) return forbid(res);
  const student = ensureStudentAccess(req, res, effectiveStudentId);
  if (!student) return;
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  const testsDb = readTestsDb();
  const taskKey = String(taskNum);
  const levelKey = String(levelId).trim();
  const qKey = String(questionId).trim();
  if (!qKey) {
    return res.status(400).json({ error: 'Некорректный questionId' });
  }
  const taskLevels = testsDb?.[taskKey];
  if (!taskLevels || typeof taskLevels !== 'object') {
    return res.status(400).json({ error: 'Задание не найдено' });
  }
  const questions = taskLevels?.[levelKey];
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'Уровень не найден' });
  }
  const questionEntry = questions.find((entry) => String(entry?.id ?? '').trim() === qKey);
  if (!questionEntry) {
    return res.status(400).json({ error: 'Вопрос не найден' });
  }
  const isPythonLevel = isPythonTaskNumber(taskNum) || levelKey === PYTHON_LEVEL_ID;
  if (isPythonLevel) {
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'Добавьте код решения' });
    }
    let validation = null;
    const providedValidation = validatePythonSolveResultsFromProvided(questionEntry, pythonResults);
    if (providedValidation.ok) validation = providedValidation;
    if (!validation) {
      validation = await validatePythonSolveResults(questionEntry, code);
    }
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error || 'Тесты не пройдены' });
    }
  } else if (!isSolvedAnswerValid(questionEntry, code, taskNum)) {
    return res.status(400).json({ error: 'Ответ неверный' });
  }
  const serverDayKey = new Date().toISOString().slice(0, 10);
  const clientDayKey = normalizeDayKey(localDay);
  const resolvedDayKey = (() => {
    if (!clientDayKey) return serverDayKey;
    const serverNum = dayKeyToNumber(serverDayKey);
    const clientNum = dayKeyToNumber(clientDayKey);
    if (!Number.isFinite(serverNum) || !Number.isFinite(clientNum)) return serverDayKey;
    const diff = clientNum - serverNum;
    if (diff < -1 || diff > 1) return serverDayKey;
    return clientDayKey;
  })();
  const data = getStudentData(student.id);
  const solvedByTask = { ...(data.solvedByTask || {}) };
  const solvedEvents = Array.isArray(data.solvedEvents) ? [...data.solvedEvents] : [];
  const streak = normalizeStreak(data.streak);
  let xpTotal = normalizeXpTotal(data.xpTotal);
  const taskEntry = { ...(solvedByTask[taskKey] || {}) };
  const levelEntry = { ...(taskEntry[levelKey] || {}) };

  const solvedList = Array.isArray(levelEntry.solved) ? [...levelEntry.solved] : [];
  const solvedCode = levelEntry.solvedCode && typeof levelEntry.solvedCode === 'object'
    ? { ...levelEntry.solvedCode }
    : {};
  let solvedAdded = false;
  let xpGained = 0;
  if (!solvedList.includes(qKey)) {
    solvedList.push(qKey);
    solvedAdded = true;
    const questionNumber = getQuestionNumberById(testsDb, taskNum, levelKey, qKey);
    solvedEvents.push({
      id: crypto.randomUUID(),
      studentId: student.id,
      taskNumber: taskNum,
      levelId: levelKey,
      questionId: qKey,
      questionNumber,
      solvedAt: new Date().toISOString(),
      localDay: resolvedDayKey,
    });
  }
  if (solvedAdded) {
    xpGained = getTaskLevelXpReward(taskNum, levelKey);
    if (xpGained > 0) {
      xpTotal += xpGained;
    }
  }
  if (typeof code === 'string' && code.trim()) {
    const safeCode = code.slice(0, 20000);
    solvedCode[qKey] = safeCode;
  }
  if (questions.length > 0) {
    levelEntry.totalQuestions = questions.length;
  }
  if (isPythonLevel) {
    levelEntry.levelMax = 100;
  }

  levelEntry.solved = solvedList;
  levelEntry.solvedCode = solvedCode;
  taskEntry[levelKey] = levelEntry;
  solvedByTask[taskKey] = taskEntry;

  Object.entries(taskLevels).forEach(([lvl, list]) => {
    if (!Array.isArray(list) || list.length <= 0) return;
    const existing = taskEntry[lvl] || {};
    const next = { ...existing, totalQuestions: list.length };
    if (lvl === PYTHON_LEVEL_ID && (!Number.isFinite(Number(next.levelMax)) || Number(next.levelMax) <= 0)) {
      next.levelMax = 100;
    }
    taskEntry[lvl] = next;
  });
  const taskProgress = computeTaskProgress(taskEntry);

  const progress = { ...(data.progress || {}) };
  progress[taskKey] = taskProgress;

  if (solvedEvents.length > 200) {
    solvedEvents.splice(0, solvedEvents.length - 200);
  }
  if (solvedAdded && resolvedDayKey) {
    const currentDayNum = dayKeyToNumber(resolvedDayKey);
    const lastActiveDay = normalizeDayKey(streak.lastActiveDay);
    const lastDayNum = dayKeyToNumber(lastActiveDay);
    if (!Number.isFinite(lastDayNum) || !lastActiveDay) {
      streak.current = 1;
      streak.best = Math.max(streak.best, streak.current);
      streak.lastActiveDay = resolvedDayKey;
    } else if (Number.isFinite(currentDayNum)) {
      const diff = currentDayNum - lastDayNum;
      if (diff === 1) {
        streak.current += 1;
        streak.lastActiveDay = resolvedDayKey;
        streak.best = Math.max(streak.best, streak.current);
      } else if (diff === 2) {
        const skippedDay = numberToDayKey(lastDayNum + 1);
        const skippedWeekStart = getWeekStartKey(skippedDay);
        const freezeWeek = normalizeDayKey(streak.freezeUsedWeekStart);
        if (skippedWeekStart && (!freezeWeek || freezeWeek !== skippedWeekStart)) {
          streak.current += 1;
          streak.lastActiveDay = resolvedDayKey;
          streak.freezeUsedWeekStart = skippedWeekStart;
          streak.freezeUsedDay = skippedDay;
          streak.best = Math.max(streak.best, streak.current);
        } else {
          streak.current = 1;
          streak.lastActiveDay = resolvedDayKey;
          streak.best = Math.max(streak.best, streak.current);
        }
      } else if (diff > 2) {
        streak.current = 1;
        streak.lastActiveDay = resolvedDayKey;
        streak.best = Math.max(streak.best, streak.current);
      }
    }
  }

  const updated = setStudentData(student.id, { ...data, solvedByTask, solvedEvents, progress, streak, xpTotal });
  res.json({ taskProgress, progress: updated.progress, streak: updated.streak, xpTotal: updated.xpTotal, xpGained });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/teacher-solved-events', (req, res) => {
  const { teacherId, since, limit } = req.query;
  if (isStudentRole(req.auth)) return forbid(res);
  const teacher = ensureTeacherAccess(req, res, teacherId);
  if (!teacher) return;
  const testsDb = readTestsDb();
  const readIds = getTeacherSolvedEventReadIdSet(teacher);
  const students = readStudentsDb().filter((s) => s.teacherId === teacher.id && !s.deletedAt);
  const sinceMs = since ? Date.parse(String(since)) : null;
  const sinceTime = Number.isFinite(sinceMs) ? sinceMs : 0;
  const events = [];

  students.forEach((student) => {
    const data = getStudentData(student.id);
    const list = Array.isArray(data.solvedEvents) ? data.solvedEvents : [];
    list.forEach((ev) => {
      const eventId = typeof ev?.id === 'string' ? ev.id.trim() : '';
      if (!eventId || readIds.has(eventId)) return;
      const ts = Date.parse(ev?.solvedAt || '');
      if (!Number.isFinite(ts) || ts <= sinceTime) return;
      const questionNumber = Number.isFinite(ev?.questionNumber)
        ? ev.questionNumber
        : getQuestionNumberById(testsDb, ev?.taskNumber, ev?.levelId, ev?.questionId);
      events.push({
        id: eventId,
        studentId: student.id,
        studentName: student.name,
        taskNumber: ev.taskNumber,
        levelId: ev.levelId,
        questionId: ev.questionId,
        questionNumber,
        solvedAt: ev.solvedAt,
      });
    });
  });

  const limitNum = Number(limit);
  const maxLimit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(limitNum, 200) : 200;
  events.sort((a, b) => new Date(a.solvedAt) - new Date(b.solvedAt));
  const limited = events.slice(-maxLimit);
  res.json(limited);
});

app.patch('/api/teacher-solved-events/read', (req, res) => {
  const { teacherId, eventIds, eventId } = req.body || {};
  if (isStudentRole(req.auth)) return forbid(res);
  const teacher = ensureTeacherAccess(req, res, teacherId);
  if (!teacher) return;

  const payloadIds = [];
  if (Array.isArray(eventIds)) payloadIds.push(...eventIds);
  if (typeof eventId !== 'undefined') payloadIds.push(eventId);

  const normalizedIds = normalizeTeacherSolvedEventIds(payloadIds);
  if (normalizedIds.length === 0) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }

  const updated = markTeacherSolvedEventsRead(teacher.id, normalizedIds);
  if (!updated) {
    return res.status(404).json({ error: 'Учитель не найден' });
  }

  return res.json({
    ok: true,
    readCount: Array.isArray(updated.readSolvedEventIds) ? updated.readSolvedEventIds.length : 0,
  });
});

app.get('/api/progress/solved', (req, res) => {
  const { studentId, taskNumber, levelId, includeCode } = req.query;
  if (!taskNumber || !levelId) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  const data = getStudentData(student.id);
  const taskKey = String(taskNum);
  const levelKey = String(levelId);
  const levelEntry = data?.solvedByTask?.[taskKey]?.[levelKey] || {};
  const solved = levelEntry?.solved || [];
  const solvedCode = levelEntry?.solvedCode && typeof levelEntry.solvedCode === 'object'
    ? levelEntry.solvedCode
    : {};
  if (includeCode === '1' || includeCode === 'true') {
    return res.json({ ids: Array.isArray(solved) ? solved : [], codeById: solvedCode });
  }
  res.json(Array.isArray(solved) ? solved : []);
});

app.get('/api/progress/solved-answers', (req, res) => {
  const { studentId, taskNumber, levelId } = req.query;
  if (!taskNumber || !levelId) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  const testsDb = readTestsDb();
  const taskKey = String(taskNum);
  const levelKey = String(levelId);
  const taskLevels = testsDb?.[taskKey];
  if (!taskLevels || typeof taskLevels !== 'object') {
    return res.status(400).json({ error: 'Задание не найдено' });
  }
  const questions = taskLevels?.[levelKey];
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'Уровень не найден' });
  }

  const data = getStudentData(student.id);
  const levelEntry = data?.solvedByTask?.[taskKey]?.[levelKey] || {};
  const solved = Array.isArray(levelEntry?.solved) ? levelEntry.solved : [];
  const solvedSet = new Set(solved.map((id) => String(id ?? '').trim()).filter(Boolean));
  const answerCount = getAnswerCountForTask(taskNum);
  const answerById = {};

  questions.forEach((question) => {
    const qKey = String(question?.id ?? '').trim();
    if (!qKey || !solvedSet.has(qKey)) return;
    const expectedAnswers = getExpectedAnswersForQuestion(question, answerCount).map((value) => String(value ?? ''));
    if (answerCount <= 1) {
      answerById[qKey] = expectedAnswers[0] ?? '';
      return;
    }
    answerById[qKey] = JSON.stringify({ answers: expectedAnswers });
  });

  return res.json(answerById);
});

app.get('/api/progress/task-code', (req, res) => {
  const { studentId, taskNumber } = req.query;
  if (!taskNumber) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  if (!isKnownTaskNumber(taskNum)) {
    return res.status(400).json({ error: 'Задание не найдено' });
  }
  const data = getStudentData(student.id);
  const taskEntry = data?.solvedByTask?.[String(taskNum)];
  const stored = taskEntry?._taskCode && typeof taskEntry._taskCode === 'object'
    ? taskEntry._taskCode
    : {};
  return res.json({
    code: typeof stored.code === 'string' ? stored.code : '',
    input: typeof stored.input === 'string' ? stored.input : '',
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
  });
});

app.patch('/api/progress/task-code', (req, res) => {
  const { studentId, taskNumber, code, input } = req.body || {};
  if (!taskNumber) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  if (!isKnownTaskNumber(taskNum)) {
    return res.status(400).json({ error: 'Задание не найдено' });
  }
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Некорректный код' });
  }
  if (typeof input !== 'string' && typeof input !== 'undefined') {
    return res.status(400).json({ error: 'Некорректный ввод' });
  }
  const data = getStudentData(student.id);
  const solvedByTask = { ...(data.solvedByTask || {}) };
  const taskKey = String(taskNum);
  const taskEntry = { ...(solvedByTask[taskKey] || {}) };
  const safeCode = code.slice(0, 20000);
  const safeInput = typeof input === 'string' ? input.slice(0, 5000) : '';
  const hasPayload = Boolean(safeCode.trim() || safeInput.trim());

  if (hasPayload) {
    taskEntry._taskCode = {
      code: safeCode,
      input: safeInput,
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete taskEntry._taskCode;
  }

  if (Object.keys(taskEntry).length > 0) solvedByTask[taskKey] = taskEntry;
  else delete solvedByTask[taskKey];

  const updated = setStudentData(student.id, { ...data, solvedByTask });
  const stored = updated?.solvedByTask?.[taskKey]?._taskCode && typeof updated.solvedByTask[taskKey]._taskCode === 'object'
    ? updated.solvedByTask[taskKey]._taskCode
    : {};
  return res.json({
    code: typeof stored.code === 'string' ? stored.code : '',
    input: typeof stored.input === 'string' ? stored.input : '',
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
  });
});

app.get('/api/progress/question-code', (req, res) => {
  const { studentId, taskNumber, levelId, questionId } = req.query;
  if (!taskNumber || !levelId || !String(questionId || '').trim()) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  if (!isKnownTaskNumber(taskNum)) {
    return res.status(400).json({ error: 'Задание не найдено' });
  }
  const taskKey = String(taskNum);
  const levelKey = String(levelId);
  const questionKey = String(questionId).trim();
  const testsDb = readTestsDb();
  const { taskLevels, questions, question } = getQuestionEntryFromTestsDb(testsDb, taskNum, levelKey, questionKey);
  if (!taskLevels) return res.status(400).json({ error: 'Задание не найдено' });
  if (!questions) return res.status(400).json({ error: 'Уровень не найден' });
  if (!question) return res.status(400).json({ error: 'Вопрос не найден' });
  const data = getStudentData(student.id);
  const levelEntry = data?.solvedByTask?.[taskKey]?.[levelKey] || {};
  const byId = levelEntry?._questionCodeById && typeof levelEntry._questionCodeById === 'object'
    ? levelEntry._questionCodeById
    : {};
  const stored = byId?.[questionKey] && typeof byId[questionKey] === 'object'
    ? byId[questionKey]
    : {};
  return res.json({
    code: typeof stored.code === 'string' ? stored.code : '',
    input: typeof stored.input === 'string' ? stored.input : '',
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
  });
});

app.patch('/api/progress/question-code', (req, res) => {
  const { studentId, taskNumber, levelId, questionId, code, input } = req.body || {};
  if (!taskNumber || !levelId || !String(questionId || '').trim()) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  if (!isKnownTaskNumber(taskNum)) {
    return res.status(400).json({ error: 'Задание не найдено' });
  }
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Некорректный код' });
  }
  if (typeof input !== 'string' && typeof input !== 'undefined') {
    return res.status(400).json({ error: 'Некорректный ввод' });
  }
  const taskKey = String(taskNum);
  const levelKey = String(levelId);
  const questionKey = String(questionId).trim();
  const testsDb = readTestsDb();
  const { taskLevels, questions, question } = getQuestionEntryFromTestsDb(testsDb, taskNum, levelKey, questionKey);
  if (!taskLevels) return res.status(400).json({ error: 'Задание не найдено' });
  if (!questions) return res.status(400).json({ error: 'Уровень не найден' });
  if (!question) return res.status(400).json({ error: 'Вопрос не найден' });
  const safeCode = code.slice(0, 20000);
  const safeInput = typeof input === 'string' ? input.slice(0, 5000) : '';
  const hasPayload = Boolean(safeCode.trim() || safeInput.trim());

  const data = getStudentData(student.id);
  const solvedByTask = { ...(data.solvedByTask || {}) };
  const taskEntry = { ...(solvedByTask[taskKey] || {}) };
  const levelEntry = { ...(taskEntry[levelKey] || {}) };
  const byId = levelEntry._questionCodeById && typeof levelEntry._questionCodeById === 'object'
    ? { ...levelEntry._questionCodeById }
    : {};

  if (hasPayload) {
    byId[questionKey] = {
      code: safeCode,
      input: safeInput,
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete byId[questionKey];
  }

  if (Object.keys(byId).length > 0) {
    levelEntry._questionCodeById = byId;
  } else {
    delete levelEntry._questionCodeById;
  }

  if (Object.keys(levelEntry).length > 0) taskEntry[levelKey] = levelEntry;
  else delete taskEntry[levelKey];

  if (Object.keys(taskEntry).length > 0) solvedByTask[taskKey] = taskEntry;
  else delete solvedByTask[taskKey];

  const updated = setStudentData(student.id, { ...data, solvedByTask });
  const stored = updated?.solvedByTask?.[taskKey]?.[levelKey]?._questionCodeById?.[questionKey]
    && typeof updated.solvedByTask[taskKey][levelKey]._questionCodeById[questionKey] === 'object'
      ? updated.solvedByTask[taskKey][levelKey]._questionCodeById[questionKey]
      : {};
  return res.json({
    code: typeof stored.code === 'string' ? stored.code : '',
    input: typeof stored.input === 'string' ? stored.input : '',
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
  });
});

app.get('/api/student-data', (req, res) => {
  const { studentId } = req.query;
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const progress = recomputeProgressFromSolved(data);
  res.json({ ...data, progress });
});

app.patch('/api/student-notes', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { studentId, notes, notesByTask } = req.body || {};
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const payload = { ...data };
  if (typeof notesByTask !== 'undefined') {
    if (!notesByTask || typeof notesByTask !== 'object' || Array.isArray(notesByTask)) {
      return res.status(400).json({ error: 'Некорректный формат заметок' });
    }
    payload.notesByTask = normalizeNotesByTaskMap(notesByTask);
  } else {
    payload.notes = String(notes ?? '').trim();
  }
  const updated = setStudentData(student.id, payload);
  res.json({ notes: updated.notes, notesByTask: updated.notesByTask || {} });
});

app.post('/api/mocks', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { studentId, date, score, comment } = req.body || {};
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const examDate = typeof date === 'string' && date.trim() ? date.trim() : new Date().toISOString().slice(0, 10);
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return res.status(400).json({ error: 'Некорректный балл' });
  }
  const clamped = Math.max(0, Math.min(100, numericScore));
  const entry = {
    id: crypto.randomUUID(),
    date: examDate,
    score: clamped,
    comment: typeof comment === 'string' ? comment.trim() : '',
    createdAt: new Date().toISOString(),
  };
  const data = getStudentData(student.id);
  const mocks = [entry, ...(data.mocks || [])];
  setStudentData(student.id, { ...data, mocks });
  res.json(entry);
});

app.delete('/api/mocks/:id', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { id } = req.params;
  const { studentId } = req.query;
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const mocks = (data.mocks || []).filter((m) => m.id !== id);
  setStudentData(student.id, { ...data, mocks });
  res.json({ ok: true });
});

app.get('/api/student-schedule', (req, res) => {
  const { studentId } = req.query;
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  res.json(data.schedule || []);
});

app.post('/api/student-schedule', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { studentId, day, date, time, subject, note, boardLink, lessonLink } = req.body || {};
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const trimmedDate = typeof date === 'string' ? date.trim() : '';
  const trimmedDay = typeof day === 'string' ? day.trim() : '';
  if ((!trimmedDate && !trimmedDay) || !time || !subject) {
    return res.status(400).json({ error: '\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0434\u0430\u0442\u0443, \u0432\u0440\u0435\u043c\u044f \u0438 \u043f\u0440\u0435\u0434\u043c\u0435\u0442' });
  }
  if (trimmedDate && !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    return res.status(400).json({ error: '\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f \u0434\u0430\u0442\u0430' });
  }
  const resolvedDay = (() => {
    if (trimmedDay) return trimmedDay;
    if (!trimmedDate) return '';
    const dt = new Date(`${trimmedDate}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return '';
    const label = dt.toLocaleDateString('ru-RU', { weekday: 'long' });
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
  })();

  const entry = {
    id: crypto.randomUUID(),
    date: trimmedDate || null,
    day: resolvedDay,
    time: String(time).trim(),
    subject: String(subject).trim(),
    note: typeof note === 'string' ? note.trim() : '',
    boardLink: typeof boardLink === 'string' ? boardLink.trim() : '',
    lessonLink: typeof lessonLink === 'string' ? lessonLink.trim() : '',
    createdAt: new Date().toISOString(),
  };
  const data = getStudentData(student.id);
  const schedule = [entry, ...(data.schedule || [])];
  setStudentData(student.id, { ...data, schedule });
  res.json(entry);
});

app.delete('/api/student-schedule/:id', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { id } = req.params;
  const { studentId } = req.query;
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const schedule = (data.schedule || []).filter((item) => item.id !== id);
  setStudentData(student.id, { ...data, schedule });
  res.json({ ok: true });
});

app.get('/api/student-next-lesson', (req, res) => {
  const { studentId } = req.query;
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const legacyNextLesson = data.nextLesson && typeof data.nextLesson === 'object'
    ? data.nextLesson
    : { homeWork: '', lessonLink: '', boardLink: '' };
  const homeworks = Array.isArray(data.homeworks) ? data.homeworks : [];
  const hasLegacyContent = Boolean(
    legacyNextLesson?.homeWork ||
    legacyNextLesson?.lessonLink ||
    legacyNextLesson?.boardLink
  );
  const legacyTargets = Array.isArray(legacyNextLesson?.targetQuestions)
    ? legacyNextLesson.targetQuestions
        .map((val) => Number(val))
        .filter((val) => Number.isFinite(val) && val > 0)
    : [];
  const testsDb = readTestsDb();
  const legacyGoals = normalizeGoals(legacyNextLesson?.goals, testsDb);
  const normalizedHomeworks = homeworks.length === 0 && hasLegacyContent
    ? [{
      id: 'legacy',
      issuedAt: legacyNextLesson?.issuedAt || new Date().toISOString(),
      daysToComplete: Number(legacyNextLesson?.daysToComplete) || 7,
      homeWork: legacyNextLesson?.homeWork || '',
      lessonLink: legacyNextLesson?.lessonLink || '',
      boardLink: legacyNextLesson?.boardLink || '',
      taskNumber: null,
      levelId: null,
      targetQuestions: legacyTargets,
      goals: legacyGoals.length ? legacyGoals : normalizeGoalsFromLegacy(legacyNextLesson, testsDb),
    }]
    : homeworks;
  const withGoals = normalizedHomeworks.map((entry) => {
    const goals = normalizeGoals(entry?.goals, testsDb);
    if (goals.length) return { ...entry, goals };
    const legacyGoalsEntry = normalizeGoalsFromLegacy(entry, testsDb);
    return { ...entry, goals: legacyGoalsEntry };
  });
  const latest = withGoals[0] || legacyNextLesson;
  res.json({ homeworks: withGoals, latest });
});

app.patch('/api/student-next-lesson', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { studentId, homeWork, lessonLink, boardLink, daysToComplete, taskNumber, levelId, targetQuestions, goals } = req.body || {};
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const payloadHomeWork = typeof homeWork === 'string' ? homeWork.trim() : '';
  const payloadLessonLink = typeof lessonLink === 'string' ? lessonLink.trim() : '';
  const payloadBoardLink = typeof boardLink === 'string' ? boardLink.trim() : '';
  const daysValue = Number(daysToComplete);
  const normalizedDays = Number.isFinite(daysValue) && daysValue > 0 ? Math.round(daysValue) : 7;

  const existingHomeworks = Array.isArray(data.homeworks) ? [...data.homeworks] : [];
  const legacyNextLesson = data.nextLesson && typeof data.nextLesson === 'object'
    ? data.nextLesson
    : { homeWork: '', lessonLink: '', boardLink: '' };
  const hasLegacyContent = Boolean(
    legacyNextLesson?.homeWork ||
    legacyNextLesson?.lessonLink ||
    legacyNextLesson?.boardLink
  );
  if (existingHomeworks.length === 0 && hasLegacyContent) {
    const legacyTargets = Array.isArray(legacyNextLesson?.targetQuestions)
      ? legacyNextLesson.targetQuestions
          .map((val) => Number(val))
          .filter((val) => Number.isFinite(val) && val > 0)
      : [];
    existingHomeworks.push({
      id: 'legacy',
      issuedAt: legacyNextLesson?.issuedAt || new Date().toISOString(),
      daysToComplete: Number(legacyNextLesson?.daysToComplete) || 7,
      homeWork: legacyNextLesson?.homeWork || '',
      lessonLink: legacyNextLesson?.lessonLink || '',
      boardLink: legacyNextLesson?.boardLink || '',
      targetQuestions: legacyTargets,
    });
  }

  const hasTaskNumber = typeof taskNumber !== 'undefined' && String(taskNumber).trim() !== '';
  let normalizedTaskNumber = null;
  let normalizedLevelId = null;
  const testsDb = readTestsDb();
  let normalizedTargets = [];
  let normalizedGoals = normalizeGoals(goals, testsDb);
  if (hasTaskNumber) {
    const taskNum = Number(taskNumber);
    if (!Number.isFinite(taskNum) || taskNum < 1 || taskNum > 27) {
      return res.status(400).json({ error: 'Некорректный номер задания' });
    }
    const normalizedLevel = String(levelId || '').trim();
    if (!['basic', 'advanced', 'expert'].includes(normalizedLevel)) {
      return res.status(400).json({ error: 'Некорректный уровень' });
    }
    normalizedTaskNumber = taskNum;
    normalizedLevelId = normalizedLevel;
    if (Array.isArray(targetQuestions)) {
      const cleanTargets = targetQuestions
        .map((val) => Number(val))
        .filter((val) => Number.isFinite(val) && val > 0)
        .map((val) => Math.trunc(val));
      const totalCount = getQuestionsCountForLevel(testsDb, taskNum, normalizedLevel);
      const filtered = filterTargetsByCount(Array.from(new Set(cleanTargets)), totalCount);
      normalizedTargets = filtered.slice(0, 200);
    }
  }
  if (normalizedGoals.length === 0 && (normalizedTaskNumber || normalizedLevelId)) {
    normalizedGoals = [{
      type: GOAL_TYPE_TASK,
      taskNumber: normalizedTaskNumber,
      levelId: normalizedLevelId,
      includeAll: false,
      targetQuestions: normalizedTargets
    }];
  }

  const newEntry = {
    id: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
    daysToComplete: normalizedDays,
    homeWork: payloadHomeWork,
    lessonLink: payloadLessonLink,
    boardLink: payloadBoardLink,
    taskNumber: normalizedTaskNumber,
    levelId: normalizedLevelId,
    targetQuestions: normalizedTargets,
    goals: normalizedGoals,
  };
  const updatedHomeworks = [newEntry, ...existingHomeworks];
  const nextLesson = {
    homeWork: newEntry.homeWork,
    lessonLink: newEntry.lessonLink,
    boardLink: newEntry.boardLink,
    issuedAt: newEntry.issuedAt,
    daysToComplete: newEntry.daysToComplete,
    taskNumber: newEntry.taskNumber,
    levelId: newEntry.levelId,
    targetQuestions: newEntry.targetQuestions,
    goals: newEntry.goals,
  };
  const updated = setStudentData(student.id, { ...data, nextLesson, homeworks: updatedHomeworks });
  notifyStudentAboutNewHomework(student, newEntry).catch((error) => {
    console.error(`[push] post-save "new homework" notify failed for student ${student.id}:`, error);
  });
  res.json({ homeworks: updated.homeworks || [], latest: nextLesson });
});

app.patch('/api/student-next-lesson/:id', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { id } = req.params;
  const { studentId, homeWork, lessonLink, boardLink, daysToComplete, taskNumber, levelId, targetQuestions, goals } = req.body || {};
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const homeworks = Array.isArray(data.homeworks) ? [...data.homeworks] : [];
  const index = homeworks.findIndex((entry) => entry?.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Домашка не найдена' });
  }

  const existing = homeworks[index] || {};
  const payloadHomeWork = typeof homeWork === 'string' ? homeWork.trim() : (existing.homeWork || '');
  const payloadLessonLink = typeof lessonLink === 'string' ? lessonLink.trim() : (existing.lessonLink || '');
  const payloadBoardLink = typeof boardLink === 'string' ? boardLink.trim() : (existing.boardLink || '');
  const daysValue = Number(daysToComplete);
  const normalizedDays = Number.isFinite(daysValue) && daysValue > 0 ? Math.round(daysValue) : (existing.daysToComplete || 7);

  const hasGoalsField = Array.isArray(goals);
  const hasTaskField = typeof taskNumber !== 'undefined';
  let normalizedTaskNumber = existing.taskNumber ?? null;
  let normalizedLevelId = existing.levelId ?? null;
  let normalizedTargets = Array.isArray(existing.targetQuestions) ? existing.targetQuestions : [];
  const testsDb = readTestsDb();
  let normalizedGoals = normalizeGoals(existing.goals, testsDb);
  if (hasGoalsField) {
    normalizedGoals = normalizeGoals(goals, testsDb);
    if (normalizedGoals.length > 0) {
      const primaryTaskGoal = normalizedGoals.find((goalItem) => (
        normalizeGoalType(goalItem) === GOAL_TYPE_TASK
        && Number.isFinite(goalItem?.taskNumber)
      ));
      if (primaryTaskGoal) {
        normalizedTaskNumber = primaryTaskGoal.taskNumber;
        normalizedLevelId = primaryTaskGoal.levelId;
        normalizedTargets = primaryTaskGoal.includeAll ? [] : primaryTaskGoal.targetQuestions;
      } else {
        normalizedTaskNumber = null;
        normalizedLevelId = null;
        normalizedTargets = [];
      }
    } else {
      normalizedTaskNumber = null;
      normalizedLevelId = null;
      normalizedTargets = [];
    }
  } else if (hasTaskField) {
    const rawTask = String(taskNumber || '').trim();
    if (!rawTask) {
      normalizedTaskNumber = null;
      normalizedLevelId = null;
      normalizedTargets = [];
    } else {
      const taskNum = Number(taskNumber);
      if (!Number.isFinite(taskNum) || taskNum < 1 || taskNum > 27) {
        return res.status(400).json({ error: 'Некорректный номер задания' });
      }
      const normalizedLevel = String(levelId || '').trim();
      if (!['basic', 'advanced', 'expert'].includes(normalizedLevel)) {
        return res.status(400).json({ error: 'Некорректный уровень' });
      }
      normalizedTaskNumber = taskNum;
      normalizedLevelId = normalizedLevel;
      if (Array.isArray(targetQuestions)) {
        const cleanTargets = targetQuestions
          .map((val) => Number(val))
          .filter((val) => Number.isFinite(val) && val > 0)
          .map((val) => Math.trunc(val));
        const totalCount = getQuestionsCountForLevel(testsDb, taskNum, normalizedLevel);
        const filtered = filterTargetsByCount(Array.from(new Set(cleanTargets)), totalCount);
        normalizedTargets = filtered.slice(0, 200);
      }
    }
    normalizedGoals = normalizedTaskNumber && normalizedLevelId
      ? [{ type: GOAL_TYPE_TASK, taskNumber: normalizedTaskNumber, levelId: normalizedLevelId, includeAll: false, targetQuestions: normalizedTargets }]
      : [];
  }

  const updatedEntry = {
    ...existing,
    homeWork: payloadHomeWork,
    lessonLink: payloadLessonLink,
    boardLink: payloadBoardLink,
    daysToComplete: normalizedDays,
    taskNumber: normalizedTaskNumber,
    levelId: normalizedLevelId,
    targetQuestions: normalizedTargets,
    goals: normalizedGoals,
  };
  homeworks[index] = updatedEntry;

  const latestEntry = homeworks[0];
  const nextLesson = latestEntry
    ? {
        homeWork: latestEntry.homeWork,
        lessonLink: latestEntry.lessonLink,
        boardLink: latestEntry.boardLink,
        issuedAt: latestEntry.issuedAt,
        daysToComplete: latestEntry.daysToComplete,
        taskNumber: latestEntry.taskNumber ?? null,
        levelId: latestEntry.levelId ?? null,
        targetQuestions: Array.isArray(latestEntry.targetQuestions) ? latestEntry.targetQuestions : [],
        goals: Array.isArray(latestEntry.goals) ? latestEntry.goals : normalizeGoalsFromLegacy(latestEntry),
      }
    : (data.nextLesson || { homeWork: '', lessonLink: '', boardLink: '', targetQuestions: [], goals: [] });

  const updated = setStudentData(student.id, { ...data, nextLesson, homeworks });
  res.json({ homeworks: updated.homeworks || [], latest: nextLesson });
});

app.delete('/api/student-next-lesson/:id', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { id } = req.params;
  const studentId = req.query.studentId || req.body?.studentId;
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const homeworks = Array.isArray(data.homeworks) ? [...data.homeworks] : [];

  let updatedHomeworks = homeworks;
  if (id === 'legacy' && homeworks.length === 0) {
    updatedHomeworks = [];
  } else {
    const index = homeworks.findIndex((entry) => entry?.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Домашка не найдена' });
    }
    updatedHomeworks = homeworks.filter((_, idx) => idx !== index);
  }

  const latestEntry = updatedHomeworks[0] || null;
  const nextLesson = latestEntry
    ? {
        homeWork: latestEntry.homeWork,
        lessonLink: latestEntry.lessonLink,
        boardLink: latestEntry.boardLink,
        issuedAt: latestEntry.issuedAt,
        daysToComplete: latestEntry.daysToComplete,
        taskNumber: latestEntry.taskNumber ?? null,
        levelId: latestEntry.levelId ?? null,
        targetQuestions: Array.isArray(latestEntry.targetQuestions) ? latestEntry.targetQuestions : [],
        goals: Array.isArray(latestEntry.goals) ? latestEntry.goals : normalizeGoalsFromLegacy(latestEntry),
      }
    : { homeWork: '', lessonLink: '', boardLink: '', issuedAt: '', daysToComplete: 7, taskNumber: null, levelId: null, targetQuestions: [], goals: [] };

  const updated = setStudentData(student.id, { ...data, nextLesson, homeworks: updatedHomeworks });
  res.json({ homeworks: updated.homeworks || [], latest: nextLesson });
});


app.post('/api/test-files', upload.single('file'), (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  if (!req.file) return res.status(400).json({ error: 'Файл не найден' });
  const id = req.fileId || crypto.randomUUID();
  res.json({
    id,
    name: normalizeFileName(req.file.originalname),
    size: formatSize(req.file.size),
    sizeBytes: req.file.size,
    url: `/uploads/${req.file.filename}`,
    storageName: req.file.filename,
  });
});

app.delete('/api/test-files/:storageName', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const rawName = req.params.storageName || '';
  const safeName = path.basename(rawName);
  if (!safeName) return res.status(400).json({ error: 'Некорректное имя файла' });
  const filePath = path.join(uploadsDir, safeName);
  fs.unlink(filePath, (err) => {
    if (err) return res.status(404).json({ error: 'Файл не найден' });
    res.json({ ok: true });
  });
});

app.get('/api/folders', (req, res) => {
  const { taskNumber, category, studentId } = req.query;
  const requestedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
  const effectiveStudentId = requestedStudentId || (isStudentRole(req.auth) ? req.auth.id : '');
  if (!effectiveStudentId && !isAdminRole(req.auth)) {
    return res.status(400).json({ error: 'studentId required' });
  }
  if (effectiveStudentId) {
    const student = ensureStudentAccess(req, res, effectiveStudentId);
    if (!student) return;
  }
  let folders = readFoldersDb();
  if (effectiveStudentId) {
    folders = folders.filter((f) => f.studentId === effectiveStudentId);
  }
  if (taskNumber) {
    const taskNum = Number(taskNumber);
    folders = folders.filter((f) => f.taskNumber === taskNum);
  }
  if (category) {
    folders = folders.filter((f) => f.category === category);
  }
  res.json(folders);
});

app.post('/api/folders', (req, res) => {
  const { taskNumber, category, name, studentId } = req.body || {};
  const taskNum = Number(taskNumber);
  const folderName = normalizeFolderName(name);

  if (!Number.isFinite(taskNum) || !category || !folderName) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  if (folderName.length > 60) {
    return res.status(400).json({ error: 'Название слишком длинное' });
  }
  if (/[/\\]/.test(folderName)) {
    return res.status(400).json({ error: 'Недопустимые символы' });
  }

  const folders = readFoldersDb();
  const exists = folders.some(
    (f) =>
      f.studentId === student.id &&
      f.taskNumber === taskNum &&
      f.category === category &&
      f.name?.toLowerCase() === folderName.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: 'Такая папка уже существует' });
  }

  const entry = {
    id: crypto.randomUUID(),
    studentId: student.id,
    taskNumber: taskNum,
    category,
    name: folderName,
    date: new Date().toLocaleDateString('ru-RU'),
  };

  folders.unshift(entry);
  writeFoldersDb(folders);
  res.json(entry);
});

app.patch('/api/folders/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};
  const folderName = normalizeFolderName(name);

  if (!folderName) return res.status(400).json({ error: 'Введите название папки' });
  if (folderName.length > 60) return res.status(400).json({ error: 'Название слишком длинное' });
  if (/[/\\]/.test(folderName)) {
    return res.status(400).json({ error: 'Недопустимые символы' });
  }

  const folders = readFoldersDb();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Папка не найдена' });

  const current = folders[idx];
  if (!ensureStudentAccess(req, res, current.studentId, { allowDeleted: true })) return;
  const exists = folders.some(
    (f) =>
      f.id !== id &&
      f.studentId === current.studentId &&
      f.taskNumber === current.taskNumber &&
      f.category === current.category &&
      f.name?.toLowerCase() === folderName.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: 'Такая папка уже существует' });
  }

  const updated = { ...current, name: folderName };
  folders[idx] = updated;
  writeFoldersDb(folders);

  const files = readFilesDb();
  let changed = false;
  const updatedFiles = files.map((file) => {
    if (file.folderId === id) {
      changed = true;
      return { ...file, folderName };
    }
    return file;
  });
  if (changed) writeFilesDb(updatedFiles);

  res.json(updated);
});

app.get('/api/files', (req, res) => {
  const { taskNumber, category, studentId } = req.query;
  const requestedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
  const effectiveStudentId = requestedStudentId || (isStudentRole(req.auth) ? req.auth.id : '');
  if (!effectiveStudentId && !isAdminRole(req.auth)) {
    return res.status(400).json({ error: 'studentId required' });
  }
  if (effectiveStudentId) {
    const student = ensureStudentAccess(req, res, effectiveStudentId);
    if (!student) return;
  }
  let files = readFilesDb();
  if (effectiveStudentId) {
    files = files.filter((f) => f.studentId === effectiveStudentId);
  }
  if (taskNumber) {
    const taskNum = Number(taskNumber);
    files = files.filter((f) => f.taskNumber === taskNum);
  }
  if (category) {
    files = files.filter((f) => f.category === category);
  }
  res.json(files);
});

app.post('/api/files', upload.single('file'), (req, res) => {
  const { taskNumber, category, folderId, studentId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Файл не найден' });

  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum) || !category) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return;
  }

  let folderName = null;
  let folderRef = null;
  if (folderId) {
    const folders = readFoldersDb();
    folderRef = folders.find(
      (f) =>
        f.id === folderId &&
        f.studentId === student.id &&
        f.taskNumber === taskNum &&
        f.category === category
    );
    if (!folderRef) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      return res.status(400).json({ error: 'Папка не найдена' });
    }
    folderName = folderRef.name;
  }

  const db = readFilesDb();
  const currentTotal = db
    .filter((f) => f.taskNumber === taskNum && f.studentId === student.id)
    .reduce((sum, f) => sum + getEntrySizeBytes(f), 0);
  if (currentTotal + req.file.size > MAX_TASK_BYTES) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(413).json({ error: 'Превышен лимит 200 МБ для этого задания' });
  }

  if (folderRef) {
    const currentFolderTotal = getFolderTotalBytes(db, folderRef.id);
    if (currentFolderTotal + req.file.size > MAX_FOLDER_BYTES) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      return res.status(413).json({ error: '\u041f\u0440\u0435\u0432\u044b\u0448\u0435\u043d \u043b\u0438\u043c\u0438\u0442 30 \u041c\u0411 \u0434\u043b\u044f \u044d\u0442\u043e\u0439 \u043f\u0430\u043f\u043a\u0438' });
    }
  }
  const id = req.fileId || crypto.randomUUID();
  const entry = {
    id,
    studentId: student.id,
    taskNumber: taskNum,
    category,
    folderId: folderRef?.id || null,
    folderName,
    name: normalizeFileName(req.file.originalname),
    size: formatSize(req.file.size),
    sizeBytes: req.file.size,
    date: new Date().toLocaleDateString('ru-RU'),
    url: `/uploads/${req.file.filename}`,
    storageName: req.file.filename,
  };

  db.unshift(entry);
  writeFilesDb(db);

  res.json(entry);
});

app.delete('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const db = readFilesDb();
  const idx = db.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Файл не найден' });
  if (!ensureStudentAccess(req, res, db[idx]?.studentId, { allowDeleted: true })) return;

  const [removed] = db.splice(idx, 1);
  writeFilesDb(db);

  if (removed?.storageName) {
    const filePath = path.join(uploadsDir, removed.storageName);
    fs.unlink(filePath, () => {});
  }

  res.json({ ok: true });
});

app.patch('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};
  const hasContentField = Object.prototype.hasOwnProperty.call(req.body || {}, 'content');
  const content = hasContentField ? req.body.content : undefined;

  const db = readFilesDb();
  const idx = db.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Файл не найден' });
  if (!ensureStudentAccess(req, res, db[idx]?.studentId, { allowDeleted: true })) return;

  let updated = { ...db[idx] };

  if (typeof name !== 'undefined') {
    const newName = normalizeFolderName(name);
    if (!newName) return res.status(400).json({ error: 'Введите название файла' });
    if (newName.length > 120) return res.status(400).json({ error: 'Название слишком длинное' });
    updated.name = newName;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'folderId')) {
    const folderId = req.body.folderId;
    if (!folderId) {
      updated.folderId = null;
      updated.folderName = null;
    } else {
      const folders = readFoldersDb();
      const folderRef = folders.find(
        (f) =>
          f.id === folderId &&
          f.studentId === updated.studentId &&
          f.taskNumber === updated.taskNumber &&
          f.category === updated.category
      );
      if (!folderRef) return res.status(400).json({ error: 'Папка не найдена' });
      const movingSizeBytes = getEntrySizeBytes(db[idx]);
      const currentFolderTotal = getFolderTotalBytes(db, folderRef.id, id);
      if (currentFolderTotal + movingSizeBytes > MAX_FOLDER_BYTES) {
        return res.status(413).json({ error: '\u041f\u0440\u0435\u0432\u044b\u0448\u0435\u043d \u043b\u0438\u043c\u0438\u0442 30 \u041c\u0411 \u0434\u043b\u044f \u044d\u0442\u043e\u0439 \u043f\u0430\u043f\u043a\u0438' });
      }
      updated.folderId = folderRef.id;
      updated.folderName = folderRef.name;
    }
  }

  if (hasContentField) {
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Некорректное содержимое файла' });
    }
    if (!isPyFileName(updated.name)) {
      return res.status(400).json({ error: 'Редактировать можно только .py файлы' });
    }
    const safeStorageName = path.basename(updated.storageName || '');
    if (!safeStorageName) {
      return res.status(400).json({ error: 'Некорректное имя файла на диске' });
    }
    const filePath = path.join(uploadsDir, safeStorageName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Файл на диске не найден' });
    }
    const nextSizeBytes = Buffer.byteLength(content, 'utf8');
    const currentTotal = db
      .filter((file) => file.id !== id && file.studentId === updated.studentId && file.taskNumber === updated.taskNumber)
      .reduce((sum, file) => sum + getEntrySizeBytes(file), 0);
    if (currentTotal + nextSizeBytes > MAX_TASK_BYTES) {
      return res.status(413).json({ error: 'Превышен лимит 200 МБ для этого задания' });
    }
    if (updated.folderId) {
      const currentFolderTotal = getFolderTotalBytes(db, updated.folderId, id);
      if (currentFolderTotal + nextSizeBytes > MAX_FOLDER_BYTES) {
        return res.status(413).json({ error: '\u041f\u0440\u0435\u0432\u044b\u0448\u0435\u043d \u043b\u0438\u043c\u0438\u0442 30 \u041c\u0411 \u0434\u043b\u044f \u044d\u0442\u043e\u0439 \u043f\u0430\u043f\u043a\u0438' });
      }
    }
    fs.writeFileSync(filePath, content, 'utf8');
    updated.sizeBytes = nextSizeBytes;
    updated.size = formatSize(nextSizeBytes);
    updated.date = new Date().toLocaleDateString('ru-RU');
  }

  db[idx] = updated;
  writeFilesDb(db);
  res.json(updated);
});

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return res.status(404).end();
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Файл больше 50 МБ' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Слишком большой запрос. Уменьшите размер данных.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Ошибка сервера' });
});

const pushRuntimeBoot = ensurePushRuntimeConfigured();
if (!pushRuntimeBoot.enabled) {
  console.warn(`[push] runtime disabled: ${pushRuntimeBoot.error || 'configuration error'}`);
}

const startPushReminderSweep = () => {
  const runSweep = () => {
    runPushReminderSweep().catch((error) => {
      console.error('[push] reminder sweep crashed:', error);
    });
  };
  runSweep();
  const interval = setInterval(runSweep, PUSH_SWEEP_INTERVAL_MS);
  if (typeof interval.unref === 'function') interval.unref();
};

const pushSweepStartTimer = setTimeout(startPushReminderSweep, PUSH_SWEEP_START_DELAY_MS);
if (typeof pushSweepStartTimer.unref === 'function') pushSweepStartTimer.unref();

const server = createServer(app);
const collabWss = new WebSocketServer({ noServer: true });
const rtcWss = new WebSocketServer({ noServer: true });
const WS_OPEN_STATE = 1;
const RTC_SIGNAL_MAX_MESSAGE_BYTES = 64 * 1024;
const RTC_CLIENT_STALE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.RTC_CLIENT_STALE_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 30 * 1000) return Math.round(raw);
  return 90 * 1000;
})();
const RTC_CLIENT_SWEEP_INTERVAL_MS = (() => {
  const raw = Number(process.env.RTC_CLIENT_SWEEP_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 5 * 1000) return Math.round(raw);
  return 15 * 1000;
})();
const RTC_PRESENCE_FILE_STALE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.RTC_PRESENCE_FILE_STALE_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 30 * 1000) return Math.round(raw);
  return RTC_CLIENT_STALE_TIMEOUT_MS + 15 * 1000;
})();
const rtcRooms = new Map();
const rtcPresenceWatchers = new Map();
const rtcCodeSyncWatchers = new Map();
const rtcClientsBySocket = new Map();

const getUpgradePathname = (requestUrl) => {
  const url = typeof requestUrl === 'string' ? requestUrl : '';
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return '';
  }
};

const rejectUpgrade = (socket, status = 400, message = 'Bad Request') => {
  try {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  } catch {}
  socket.destroy();
};

const sendRtcPayload = (ws, payload) => {
  if (!ws || ws.readyState !== WS_OPEN_STATE) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {}
};

const normalizeRtcRoomPart = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 120) return '';
  if (!/^[a-zA-Z0-9:_-]+$/.test(normalized)) return '';
  return normalized;
};

const parseRtcRoomId = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  const parts = normalized.split(':');
  if (parts.length !== 3 || parts[0] !== 'rtc') return null;
  const teacherId = normalizeRtcRoomPart(parts[1]);
  const studentId = normalizeRtcRoomPart(parts[2]);
  if (!teacherId || !studentId) return null;
  return {
    roomId: `rtc:${teacherId}:${studentId}`,
    teacherId,
    studentId,
  };
};

const getRtcRoomAccessError = (auth, roomMeta) => {
  if (!auth || !roomMeta) return 'Требуется авторизация';
  const { teacherId, studentId } = roomMeta;
  const student = findStudentById(studentId);
  if (!student) return 'Ученик не найден';
  if (!student.teacherId || student.teacherId !== teacherId) return 'Некорректная комната созвона';

  if (isAdminRole(auth)) return '';
  if (isTeacherRole(auth)) {
    if (auth.id !== teacherId) return 'Недостаточно прав для этой комнаты';
    return '';
  }
  if (isStudentRole(auth)) {
    if (auth.id !== studentId) return 'Недостаточно прав для этой комнаты';
    if (!auth.teacherId || auth.teacherId !== teacherId) return 'Недостаточно прав для этой комнаты';
    return '';
  }
  return 'Недостаточно прав';
};

const serializeRtcPeer = (client) => ({
  id: client.clientId,
  userId: client.auth.id,
  name: client.auth.name,
  role: client.auth.role,
  isScreenSharing: Boolean(client.isScreenSharing),
  isCameraEnabled: Boolean(client.isCameraEnabled),
  screenTrackId: typeof client.screenTrackId === 'string' ? client.screenTrackId : '',
  cameraTrackId: typeof client.cameraTrackId === 'string' ? client.cameraTrackId : '',
  callState: client.roomId ? 'in-call' : 'idle',
  joinedAt: Number.isFinite(client.joinedAt) ? client.joinedAt : 0,
  heartbeatAt: Number.isFinite(client.lastHeartbeatAt) ? client.lastHeartbeatAt : 0,
});

const normalizeRtcPresenceClientId = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 120) return '';
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) return '';
  return normalized;
};

const getRtcPresenceFilePath = (clientId) => {
  const normalizedClientId = normalizeRtcPresenceClientId(clientId);
  if (!normalizedClientId) return '';
  return path.join(rtcPresenceDir, `${normalizedClientId}.json`);
};

const removeRtcPresenceFileByClientId = (clientId) => {
  const filePath = getRtcPresenceFilePath(clientId);
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {}
};

const upsertRtcPresenceFileFromClient = (client) => {
  if (!client || !client.roomId) return;
  const clientId = normalizeRtcPresenceClientId(client.clientId);
  if (!clientId) return;
  const filePath = getRtcPresenceFilePath(clientId);
  if (!filePath) return;

  const joinedAt = Number.isFinite(client.joinedAt) ? client.joinedAt : Date.now();
  const heartbeatAt = Number.isFinite(client.lastHeartbeatAt) ? client.lastHeartbeatAt : Date.now();
  const payload = {
    clientId,
    roomId: client.roomId,
    userId: typeof client.auth?.id === 'string' ? client.auth.id : '',
    name: typeof client.auth?.name === 'string' ? client.auth.name : '',
    role: typeof client.auth?.role === 'string' ? client.auth.role : '',
    isScreenSharing: Boolean(client.isScreenSharing),
    isCameraEnabled: Boolean(client.isCameraEnabled),
    screenTrackId: typeof client.screenTrackId === 'string' ? client.screenTrackId : '',
    cameraTrackId: typeof client.cameraTrackId === 'string' ? client.cameraTrackId : '',
    joinedAt,
    heartbeatAt,
  };
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(payload), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
};

const recordToRtcPeer = (record) => {
  if (!record || typeof record !== 'object') return null;
  const clientId = normalizeRtcPresenceClientId(record.clientId);
  const userId = typeof record.userId === 'string' ? record.userId.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const role = typeof record.role === 'string' ? record.role.trim() : '';
  if (!clientId || !userId || !name || !role) return null;
  const joinedAtRaw = Number(record.joinedAt);
  const joinedAt = Number.isFinite(joinedAtRaw) ? Math.max(0, Math.floor(joinedAtRaw)) : 0;
  const heartbeatAtRaw = Number(record.heartbeatAt);
  const heartbeatAt = Number.isFinite(heartbeatAtRaw) ? Math.max(0, Math.floor(heartbeatAtRaw)) : 0;
  const isScreenSharing = Boolean(record.isScreenSharing);
  const isCameraEnabled = Boolean(record.isCameraEnabled);
  return {
    id: clientId,
    userId,
    name,
    role,
    isScreenSharing,
    isCameraEnabled,
    screenTrackId: isScreenSharing && typeof record.screenTrackId === 'string' ? record.screenTrackId : '',
    cameraTrackId: isCameraEnabled && typeof record.cameraTrackId === 'string' ? record.cameraTrackId : '',
    callState: 'in-call',
    joinedAt,
    heartbeatAt,
  };
};

const readRtcPresenceParticipantsFromFiles = (roomId) => {
  const normalizedRoomId = typeof roomId === 'string' ? roomId.trim() : '';
  if (!normalizedRoomId) return [];

  const now = Date.now();
  let fileNames = [];
  try {
    fileNames = fs.readdirSync(rtcPresenceDir);
  } catch {
    return [];
  }

  const peersByClientId = new Map();
  fileNames.forEach((fileName) => {
    if (typeof fileName !== 'string' || !fileName.endsWith('.json')) return;
    const filePath = path.join(rtcPresenceDir, fileName);
    let parsed = null;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const parsedRoomId = typeof parsed?.roomId === 'string' ? parsed.roomId.trim() : '';
    const heartbeatAt = Number(parsed?.heartbeatAt);
    if (!parsedRoomId || !Number.isFinite(heartbeatAt)) {
      return;
    }
    if (now - heartbeatAt > RTC_PRESENCE_FILE_STALE_TIMEOUT_MS) {
      const staleClientId = normalizeRtcPresenceClientId(parsed?.clientId);
      if (staleClientId) {
        removeRtcPresenceFileByClientId(staleClientId);
      }
      return;
    }
    if (parsedRoomId !== normalizedRoomId) return;
    const peer = recordToRtcPeer(parsed);
    if (!peer) return;
    peersByClientId.set(peer.id, peer);
  });

  return Array.from(peersByClientId.values());
};

const getRtcPresenceParticipantsForRoom = (roomId, excludeClientId = '') => {
  const normalizedRoomId = typeof roomId === 'string' ? roomId.trim() : '';
  if (!normalizedRoomId) return [];
  const roomMeta = parseRtcRoomId(normalizedRoomId);
  if (!roomMeta) return [];

  const activeClientIds = new Set();
  const peersByClientId = new Map();
  readRtcPresenceParticipantsFromFiles(roomMeta.roomId).forEach((peer) => {
    peersByClientId.set(peer.id, peer);
  });
  const room = rtcRooms.get(roomMeta.roomId);
  if (room && room.size > 0) {
    room.forEach((client) => {
      activeClientIds.add(client.clientId);
      peersByClientId.set(client.clientId, serializeRtcPeer(client));
    });
  }

  const selectPreferredPeer = (left, right) => {
    if (!left) return right;
    if (!right) return left;

    const leftIsActive = activeClientIds.has(left.id);
    const rightIsActive = activeClientIds.has(right.id);
    if (leftIsActive !== rightIsActive) return rightIsActive ? right : left;

    const leftHeartbeatAt = Number(left.heartbeatAt) || 0;
    const rightHeartbeatAt = Number(right.heartbeatAt) || 0;
    if (leftHeartbeatAt !== rightHeartbeatAt) return rightHeartbeatAt > leftHeartbeatAt ? right : left;

    const leftJoinedAt = Number(left.joinedAt) || 0;
    const rightJoinedAt = Number(right.joinedAt) || 0;
    if (leftJoinedAt !== rightJoinedAt) return rightJoinedAt > leftJoinedAt ? right : left;

    const leftHasVideo = Boolean(left.isScreenSharing || left.isCameraEnabled);
    const rightHasVideo = Boolean(right.isScreenSharing || right.isCameraEnabled);
    if (leftHasVideo !== rightHasVideo) return rightHasVideo ? right : left;

    return String(right.id || '').localeCompare(String(left.id || '')) > 0 ? right : left;
  };

  const peersByUserKey = new Map();
  peersByClientId.forEach((peer) => {
    const normalizedUserId = typeof peer?.userId === 'string' ? peer.userId.trim() : '';
    const normalizedRole = typeof peer?.role === 'string' ? peer.role.trim() : '';
    const userKey = normalizedUserId && normalizedRole
      ? `${normalizedRole}:${normalizedUserId}`
      : `client:${String(peer?.id || '')}`;
    const current = peersByUserKey.get(userKey);
    peersByUserKey.set(userKey, selectPreferredPeer(current, peer));
  });

  const normalizedExcludeClientId = typeof excludeClientId === 'string' ? excludeClientId.trim() : '';
  return Array.from(peersByUserKey.values())
    .filter((peer) => !normalizedExcludeClientId || peer.id !== normalizedExcludeClientId)
    .sort((left, right) => {
      const leftName = String(left?.name || '');
      const rightName = String(right?.name || '');
      return leftName.localeCompare(rightName, 'ru');
    });
};

const broadcastRtcToRoom = (roomId, payload, excludeClientId = '') => {
  const room = rtcRooms.get(roomId);
  if (!room || room.size === 0) return;
  room.forEach((peerClient, peerId) => {
    if (excludeClientId && peerId === excludeClientId) return;
    sendRtcPayload(peerClient.ws, payload);
  });
};

const leaveRtcPresenceWatch = (client) => {
  if (!client || !client.watchedRoomId) return;
  const roomId = client.watchedRoomId;
  client.watchedRoomId = '';
  const watchers = rtcPresenceWatchers.get(roomId);
  if (!watchers) return;
  watchers.delete(client.clientId);
  if (watchers.size === 0) {
    rtcPresenceWatchers.delete(roomId);
  }
};

const sendRtcPresenceUpdateToClient = (client, roomId) => {
  if (!client || !roomId) return;
  const participants = getRtcPresenceParticipantsForRoom(roomId, client.clientId);
  sendRtcPayload(client.ws, {
    type: 'presence-update',
    roomId,
    participants,
    count: participants.length,
  });
};

const broadcastRtcPresenceUpdate = (roomId) => {
  const watchers = rtcPresenceWatchers.get(roomId);
  if (!watchers || watchers.size === 0) return;
  watchers.forEach((watcherClient) => {
    sendRtcPresenceUpdateToClient(watcherClient, roomId);
  });
};

const watchRtcPresence = (client, roomMeta) => {
  if (!client || !roomMeta) return;
  const { roomId } = roomMeta;
  if (client.watchedRoomId && client.watchedRoomId !== roomId) {
    leaveRtcPresenceWatch(client);
  }
  let watchers = rtcPresenceWatchers.get(roomId);
  if (!watchers) {
    watchers = new Map();
    rtcPresenceWatchers.set(roomId, watchers);
  }
  watchers.set(client.clientId, client);
  client.watchedRoomId = roomId;
  sendRtcPresenceUpdateToClient(client, roomId);
};

const leaveRtcCodeSyncWatch = (client) => {
  if (!client || !client.watchedCodeRoomId) return;
  const roomId = client.watchedCodeRoomId;
  client.watchedCodeRoomId = '';
  const watchers = rtcCodeSyncWatchers.get(roomId);
  if (!watchers) return;
  watchers.delete(client.clientId);
  if (watchers.size === 0) {
    rtcCodeSyncWatchers.delete(roomId);
  }
};

const watchRtcCodeSync = (client, roomMeta) => {
  if (!client || !roomMeta) return;
  const { roomId } = roomMeta;
  if (client.watchedCodeRoomId && client.watchedCodeRoomId !== roomId) {
    leaveRtcCodeSyncWatch(client);
  }
  let watchers = rtcCodeSyncWatchers.get(roomId);
  if (!watchers) {
    watchers = new Map();
    rtcCodeSyncWatchers.set(roomId, watchers);
  }
  watchers.set(client.clientId, client);
  client.watchedCodeRoomId = roomId;
  sendRtcPayload(client.ws, { type: 'code-sync-watched', roomId });
};

const broadcastRtcCodeSync = (roomId, payload, excludeClientId = '') => {
  const watchers = rtcCodeSyncWatchers.get(roomId);
  if (!watchers || watchers.size === 0) return;
  watchers.forEach((watcherClient, watcherId) => {
    if (excludeClientId && watcherId === excludeClientId) return;
    sendRtcPayload(watcherClient.ws, payload);
  });
};

const leaveRtcRoom = (client) => {
  if (!client || !client.roomId) return;
  const roomId = client.roomId;
  const clientId = client.clientId;
  const room = rtcRooms.get(roomId);
  client.roomId = '';
  client.isScreenSharing = false;
  client.isCameraEnabled = false;
  client.screenTrackId = '';
  client.cameraTrackId = '';
  client.joinedAt = 0;
  removeRtcPresenceFileByClientId(clientId);
  if (!room) {
    broadcastRtcPresenceUpdate(roomId);
    return;
  }
  const removed = room.delete(client.clientId);
  if (!removed) return;
  if (room.size === 0) {
    rtcRooms.delete(roomId);
    broadcastRtcPresenceUpdate(roomId);
    return;
  }
  broadcastRtcToRoom(roomId, {
    type: 'peer-left',
    roomId,
    peerId: client.clientId,
  }, client.clientId);
  broadcastRtcPresenceUpdate(roomId);
};

const joinRtcRoom = (client, roomMeta) => {
  if (!client || !roomMeta) return;
  const { roomId } = roomMeta;
  if (client.roomId && client.roomId !== roomId) {
    leaveRtcRoom(client);
  }

  let room = rtcRooms.get(roomId);
  if (!room) {
    room = new Map();
    rtcRooms.set(roomId, room);
  }

  if (client.roomId === roomId) {
    room.set(client.clientId, client);
    upsertRtcPresenceFileFromClient(client);
    const peers = Array.from(room.values())
      .filter((entry) => entry.clientId !== client.clientId)
      .map((entry) => serializeRtcPeer(entry));
    sendRtcPayload(client.ws, {
      type: 'joined',
      roomId,
      selfId: client.clientId,
      peers,
    });
    broadcastRtcPresenceUpdate(roomId);
    return;
  }

  const peers = Array.from(room.values())
    .filter((entry) => entry.clientId !== client.clientId)
    .map((entry) => serializeRtcPeer(entry));

  room.set(client.clientId, client);
  client.roomId = roomId;
  client.isScreenSharing = false;
  client.isCameraEnabled = false;
  client.screenTrackId = '';
  client.cameraTrackId = '';
  client.joinedAt = Date.now();
  upsertRtcPresenceFileFromClient(client);

  sendRtcPayload(client.ws, {
    type: 'joined',
    roomId,
    selfId: client.clientId,
    peers,
  });

  broadcastRtcToRoom(roomId, {
    type: 'peer-joined',
    roomId,
    peer: serializeRtcPeer(client),
  }, client.clientId);
  broadcastRtcPresenceUpdate(roomId);
};

const handleRtcMessage = (client, rawData, isBinary) => {
  if (!client) return;
  if (isBinary) return;
  const dataText = typeof rawData === 'string'
    ? rawData
    : Buffer.isBuffer(rawData)
      ? rawData.toString('utf8')
      : String(rawData ?? '');
  if (!dataText) return;

  if (Buffer.byteLength(dataText, 'utf8') > RTC_SIGNAL_MAX_MESSAGE_BYTES) {
    sendRtcPayload(client.ws, { type: 'error', error: 'Слишком большое сообщение' });
    try {
      client.ws.close(1009, 'Message too large');
    } catch {}
    return;
  }

  let payload = null;
  try {
    payload = JSON.parse(dataText);
  } catch {
    sendRtcPayload(client.ws, { type: 'error', error: 'Некорректный формат сообщения' });
    return;
  }

  const type = typeof payload?.type === 'string' ? payload.type.trim() : '';
  if (!type) return;
  client.lastHeartbeatAt = Date.now();

  if (type === 'watch-presence') {
    const roomMeta = parseRtcRoomId(payload?.roomId);
    if (!roomMeta) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Некорректная комната' });
      return;
    }
    const accessError = getRtcRoomAccessError(client.auth, roomMeta);
    if (accessError) {
      sendRtcPayload(client.ws, { type: 'error', error: accessError });
      return;
    }
    watchRtcPresence(client, roomMeta);
    return;
  }

  if (type === 'unwatch-presence') {
    leaveRtcPresenceWatch(client);
    sendRtcPayload(client.ws, { type: 'presence-unwatched' });
    return;
  }

  if (type === 'watch-code-sync') {
    const roomMeta = parseRtcRoomId(payload?.roomId);
    if (!roomMeta) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Некорректная комната' });
      return;
    }
    const accessError = getRtcRoomAccessError(client.auth, roomMeta);
    if (accessError) {
      sendRtcPayload(client.ws, { type: 'error', error: accessError });
      return;
    }
    watchRtcCodeSync(client, roomMeta);
    return;
  }

  if (type === 'unwatch-code-sync') {
    leaveRtcCodeSyncWatch(client);
    sendRtcPayload(client.ws, { type: 'code-sync-unwatched' });
    return;
  }

  if (type === 'code-sync') {
    const roomMeta = parseRtcRoomId(payload?.roomId);
    if (!roomMeta) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Некорректная комната' });
      return;
    }
    const accessError = getRtcRoomAccessError(client.auth, roomMeta);
    if (accessError) {
      sendRtcPayload(client.ws, { type: 'error', error: accessError });
      return;
    }
    if (client.watchedCodeRoomId !== roomMeta.roomId) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Сначала подпишитесь на синхронизацию кода' });
      return;
    }

    const taskNumber = Number(payload?.taskNumber);
    const levelId = typeof payload?.levelId === 'string' ? payload.levelId.trim() : '';
    const questionId = typeof payload?.questionId === 'string' ? payload.questionId.trim() : '';
    const code = typeof payload?.code === 'string' ? payload.code : '';
    const input = typeof payload?.input === 'string' ? payload.input : '';
    const updatedAtRaw = typeof payload?.updatedAt === 'string' ? payload.updatedAt.trim() : '';

    if (!Number.isFinite(taskNumber) || !levelId || !questionId) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Некорректные данные синхронизации' });
      return;
    }

    const safeCode = code.slice(0, 20000);
    const safeInput = input.slice(0, 5000);
    const updatedAt = updatedAtRaw && updatedAtRaw.length <= 80
      ? updatedAtRaw
      : new Date().toISOString();

    broadcastRtcCodeSync(roomMeta.roomId, {
      type: 'code-sync',
      roomId: roomMeta.roomId,
      taskNumber,
      levelId,
      questionId,
      code: safeCode,
      input: safeInput,
      updatedAt,
      fromId: client.clientId,
      fromUserId: client.auth.id,
      fromRole: client.auth.role,
    }, client.clientId);
    return;
  }

  if (type === 'join') {
    const roomMeta = parseRtcRoomId(payload?.roomId);
    if (!roomMeta) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Некорректная комната' });
      return;
    }
    const accessError = getRtcRoomAccessError(client.auth, roomMeta);
    if (accessError) {
      sendRtcPayload(client.ws, { type: 'error', error: accessError });
      return;
    }
    leaveRtcPresenceWatch(client);
    joinRtcRoom(client, roomMeta);
    return;
  }

  if (type === 'leave') {
    leaveRtcRoom(client);
    sendRtcPayload(client.ws, { type: 'left' });
    return;
  }

  if (type === 'signal') {
    if (!client.roomId) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Сначала подключитесь к комнате' });
      return;
    }
    const room = rtcRooms.get(client.roomId);
    if (!room) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Комната не найдена' });
      return;
    }
    const targetId = typeof payload?.targetId === 'string' ? payload.targetId.trim() : '';
    const signal = payload?.signal && typeof payload.signal === 'object' ? payload.signal : null;
    if (!targetId || !signal) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Некорректный сигнал' });
      return;
    }
    const targetClient = room.get(targetId);
    if (!targetClient) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Собеседник недоступен' });
      return;
    }
    sendRtcPayload(targetClient.ws, {
      type: 'signal',
      roomId: client.roomId,
      fromId: client.clientId,
      peer: serializeRtcPeer(client),
      signal,
    });
    return;
  }

  if (type === 'presence-state') {
    if (!client.roomId) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Сначала подключитесь к комнате' });
      return;
    }
    const payloadRoomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';
    if (payloadRoomId && payloadRoomId !== client.roomId) {
      sendRtcPayload(client.ws, { type: 'error', error: 'Некорректная комната' });
      return;
    }
    const nextScreenSharing = Boolean(payload?.isScreenSharing);
    const nextCameraEnabled = Boolean(payload?.isCameraEnabled);
    const nextScreenTrackIdRaw = typeof payload?.screenTrackId === 'string' ? payload.screenTrackId.trim() : '';
    const nextCameraTrackIdRaw = typeof payload?.cameraTrackId === 'string' ? payload.cameraTrackId.trim() : '';
    const nextScreenTrackId = nextScreenSharing ? nextScreenTrackIdRaw : '';
    const nextCameraTrackId = nextCameraEnabled ? nextCameraTrackIdRaw : '';
    const hasPresenceChange = client.isScreenSharing !== nextScreenSharing
      || client.isCameraEnabled !== nextCameraEnabled
      || client.screenTrackId !== nextScreenTrackId
      || client.cameraTrackId !== nextCameraTrackId;
    if (hasPresenceChange) {
      client.isScreenSharing = nextScreenSharing;
      client.isCameraEnabled = nextCameraEnabled;
      client.screenTrackId = nextScreenTrackId;
      client.cameraTrackId = nextCameraTrackId;
      upsertRtcPresenceFileFromClient(client);
      broadcastRtcToRoom(client.roomId, {
        type: 'peer-updated',
        roomId: client.roomId,
        peer: serializeRtcPeer(client),
      }, client.clientId);
      broadcastRtcPresenceUpdate(client.roomId);
    }
    return;
  }

  if (type === 'ping') {
    if (client.roomId) {
      upsertRtcPresenceFileFromClient(client);
    }
    sendRtcPayload(client.ws, { type: 'pong' });
  }
};

const cleanupRtcClient = (client, options = {}) => {
  if (!client) return;
  const { closeSocket = false, closeCode = 1000, closeReason = 'Normal Closure' } = options;
  leaveRtcPresenceWatch(client);
  leaveRtcCodeSyncWatch(client);
  leaveRtcRoom(client);
  if (closeSocket && client.ws && client.ws.readyState === WS_OPEN_STATE) {
    try {
      client.ws.close(closeCode, closeReason);
    } catch {}
  }
  removeRtcPresenceFileByClientId(client.clientId);
  rtcClientsBySocket.delete(client.ws);
};

const runRtcClientSweep = () => {
  const now = Date.now();
  rtcClientsBySocket.forEach((client) => {
    if (!client) return;
    if (!client.ws || client.ws.readyState !== WS_OPEN_STATE) {
      cleanupRtcClient(client, { closeSocket: false });
      return;
    }
    const lastHeartbeatAt = Number(client.lastHeartbeatAt) || 0;
    if (!lastHeartbeatAt) return;
    if (now - lastHeartbeatAt < RTC_CLIENT_STALE_TIMEOUT_MS) return;
    cleanupRtcClient(client, {
      closeSocket: true,
      closeCode: 1011,
      closeReason: 'Heartbeat timeout',
    });
  });
};

const rtcClientSweepInterval = setInterval(runRtcClientSweep, RTC_CLIENT_SWEEP_INTERVAL_MS);
if (typeof rtcClientSweepInterval.unref === 'function') {
  rtcClientSweepInterval.unref();
}

server.on('upgrade', (request, socket, head) => {
  const pathname = getUpgradePathname(request?.url);
  if (pathname === '/collab' || pathname.startsWith('/collab/')) {
    collabWss.handleUpgrade(request, socket, head, (ws) => {
      collabWss.emit('connection', ws, request);
    });
    return;
  }

  if (pathname === '/rtc') {
    const token = getAuthTokenFromRequest(request);
    const session = getAuthSession(token);
    if (!session?.user) {
      rejectUpgrade(socket, 401, 'Unauthorized');
      return;
    }

    rtcWss.handleUpgrade(request, socket, head, (ws) => {
      rtcWss.emit('connection', ws, request, session.user);
    });
    return;
  }

  socket.destroy();
});

collabWss.on('connection', (ws, request) => {
  setupWSConnection(ws, request);
});

rtcWss.on('connection', (ws, _request, user) => {
  const auth = buildSessionUser(user);
  if (!auth) {
    try {
      ws.close(1008, 'Unauthorized');
    } catch {}
    return;
  }

  const client = {
    clientId: crypto.randomUUID(),
    ws,
    auth,
    roomId: '',
    watchedRoomId: '',
    watchedCodeRoomId: '',
    isScreenSharing: false,
    isCameraEnabled: false,
    screenTrackId: '',
    cameraTrackId: '',
    joinedAt: 0,
    lastHeartbeatAt: Date.now(),
  };
  rtcClientsBySocket.set(ws, client);

  sendRtcPayload(ws, {
    type: 'ready',
    clientId: client.clientId,
    user: {
      id: auth.id,
      name: auth.name,
      role: auth.role,
    },
  });

  ws.on('message', (rawData, isBinary) => {
    handleRtcMessage(client, rawData, isBinary);
  });

  ws.on('close', () => {
    cleanupRtcClient(client, { closeSocket: false });
  });

  ws.on('error', () => {
    cleanupRtcClient(client, { closeSocket: false });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  resolvePythonRunner()
    .then((runner) => {
      if (!runner) {
        console.warn('[python] runner not found, server-side Python checks are disabled.');
      }
    })
    .catch((error) => {
      console.warn('[python] runner warmup failed:', error?.message || error);
    });
});
