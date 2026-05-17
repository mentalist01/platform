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
import { ARTIFACT_CATALOG_METADATA } from '../src/data/artifactCatalog.js';
import { PROFILE_THEME_CATALOG, PROFILE_THEME_RARITY_ORDER } from '../src/data/profileThemeCatalog.js';
import { getLevelFromXp } from '../src/utils/leveling.js';

const { setupWSConnection } = yWsUtils;
const require = createRequire(import.meta.url);
const Y = require('yjs');
const nodeIcal = require('node-ical');
let LeveldbPersistence = null;
try {
  ({ LeveldbPersistence } = require('y-leveldb'));
} catch (error) {
  console.warn('[collab] y-leveldb not available:', error?.message || error);
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5175;

const parseEnabledEnv = (value, defaultValue = false) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return defaultValue;
};

const parseCsvEnv = (value) => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const uniqueStrings = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : []).map((entry) => String(entry || '').trim()).filter(Boolean)
));

const AUTH_COOKIE_SAME_SITE = (() => {
  const raw = String(process.env.AUTH_COOKIE_SAME_SITE || '').trim().toLowerCase();
  if (raw === 'strict') return 'Strict';
  if (raw === 'none') return 'None';
  return 'Lax';
})();

const AUTH_COOKIE_SECURE = (() => {
  const raw = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  if (AUTH_COOKIE_SAME_SITE === 'None') return true;
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
})();

const CORS_ALLOWED_ORIGINS = uniqueStrings([
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  ...parseCsvEnv(process.env.CORS_ALLOWED_ORIGINS || process.env.APP_ALLOWED_ORIGINS),
]);

const appendVaryHeader = (res, value) => {
  const current = res.getHeader('Vary');
  const entries = uniqueStrings([
    ...(typeof current === 'string' ? current.split(',') : []),
    ...(Array.isArray(current) ? current.flatMap((entry) => String(entry || '').split(',')) : []),
    value,
  ]);
  if (entries.length > 0) {
    res.setHeader('Vary', entries.join(', '));
  }
};

const applyCorsHeaders = (req, res) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (!origin || !CORS_ALLOWED_ORIGINS.includes(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  const requestedHeaders = typeof req.headers['access-control-request-headers'] === 'string'
    ? req.headers['access-control-request-headers'].trim()
    : '';
  res.setHeader(
    'Access-Control-Allow-Headers',
    requestedHeaders || 'Content-Type, Authorization, Cache-Control, Pragma, X-Requested-With'
  );
  appendVaryHeader(res, 'Origin');
  appendVaryHeader(res, 'Access-Control-Request-Headers');
  return true;
};

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
const distDir = path.join(__dirname, '..', 'dist');
const collabDir = resolveStoragePath(
  process.env.PLATFORM_COLLAB_DIR || process.env.APP_COLLAB_DIR,
  path.join(dataDir, 'collab')
);
const boardSnapshotsDir = path.join(collabDir, 'board-snapshots');
const dataFile = path.join(dataDir, 'files.json');
const foldersFile = path.join(dataDir, 'folders.json');
const studentsFile = path.join(dataDir, 'students.json');
const teachersFile = path.join(dataDir, 'teachers.json');
const progressFile = path.join(dataDir, 'progress.json');
const testsFile = path.join(dataDir, 'tests.json');
const mockExamsFile = path.join(dataDir, 'mock-exams.json');
const taskTitlesFile = path.join(dataDir, 'task-titles.json');
const signupChatsFile = path.join(dataDir, 'signup-chats.json');
const studentChatsFile = path.join(dataDir, 'student-chats.json');
const broadcastNotificationsFile = path.join(dataDir, 'broadcast-notifications.json');
const scheduleRequestsFile = path.join(dataDir, 'schedule-requests.json');
const teacherCalendarSyncFile = path.join(dataDir, 'teacher-calendar-sync.json');
const teacherCalendarMarksFile = path.join(dataDir, 'teacher-calendar-marks.json');
const teacherFinanceFile = path.join(dataDir, 'teacher-finances.json');
const authFile = path.join(dataDir, 'auth.json');
const authSessionsFile = path.join(dataDir, 'auth-sessions.json');
const usageFile = path.join(dataDir, 'usage.json');
const pushFile = path.join(dataDir, 'push.json');
const rtcPresenceDir = path.join(dataDir, 'rtc-presence');
const RTC_PRESENCE_FS_ENABLED = parseEnabledEnv(process.env.RTC_PRESENCE_FS_ENABLED, false);
const BOARD_COLLAB_PERSISTENCE_RAW = process.env.BOARD_COLLAB_PERSISTENCE || process.env.COLLAB_PERSIST_BOARD;
const MAX_TASK_BYTES = 200 * 1024 * 1024;
const MAX_LESSON_SHARED_TASK_BYTES = 500 * 1024 * 1024;
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;
const MAX_LESSON_SHARED_UPLOAD_FILE_BYTES = 500 * 1024 * 1024;
const MAX_FOLDER_BYTES = 50 * 1024 * 1024;
const MAX_SHARED_FOLDER_BYTES = 500 * 1024 * 1024;
const LESSON_SHARED_SCOPE = 'lesson-files';
const LESSON_SHARED_FOLDER_NAME = 'файлы к уроку';
const LESSON_SHARED_STUDENT_ID_PREFIX = 'lesson-shared';
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
const STUDENT_CHAT_MESSAGE_MAX_LENGTH = 2000;
const STUDENT_CHAT_LAST_MESSAGE_PREVIEW_MAX_LENGTH = 160;
const STUDENT_CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const STUDENT_CHAT_IMAGE_NAME_MAX_LENGTH = 180;
const STUDENT_CHAT_IMAGE_PREVIEW_TEXT = '[Изображение]';
const BROADCAST_NOTIFICATION_TEXT_MAX_LENGTH = 5000;
const BROADCAST_NOTIFICATION_NAME_MAX_LENGTH = 180;
const BROADCAST_NOTIFICATION_STORAGE_LIMIT = 200;
const BROADCAST_NOTIFICATION_GIFT_MAX_COINS = 1_000_000;
const STUDENT_CHAT_ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const STUDENT_TRAFFIC_LIMIT_BYTES = (() => {
  const bytesRaw = Number(process.env.STUDENT_TRAFFIC_LIMIT_BYTES);
  if (Number.isFinite(bytesRaw)) {
    if (bytesRaw <= 0) return null;
    return bytesRaw;
  }
  const gbRaw = Number(process.env.STUDENT_TRAFFIC_LIMIT_GB);
  if (Number.isFinite(gbRaw)) {
    if (gbRaw <= 0) return null;
    return Math.round(gbRaw * 1024 * 1024 * 1024);
  }
  return null;
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
const PYTHON_COIN_MIN_REWARD = 4;
const PYTHON_COIN_MAX_REWARD = 17;
const PYTHON_COIN_TASK_ORDER = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
  205, 208, 214, 216, 217, 223, 224, 225, 226, 227,
];
const ARTIFACT_SPIN_COST = 50;
const ARTIFACT_MAX_LEVEL = 5;
const ARTIFACT_UPGRADE_REQUIREMENTS = {
  2: { cards: 2, coins: 25 },
  3: { cards: 4, coins: 75 },
  4: { cards: 8, coins: 200 },
  5: { cards: 16, coins: 500 },
};
const ARTIFACT_MAX_LEVEL_DUPLICATE_COIN_REWARDS = {
  C: 10,
  B: 20,
  A: 40,
  S: 80,
};
const ARTIFACT_RANK_ORDER = ['SS', 'S', 'A', 'B', 'C'];
const ARTIFACT_RANK_CHANCES = [
  { rank: 'SS', chance: 0.01 },
  { rank: 'S', chance: 0.05 },
  { rank: 'A', chance: 0.10 },
  { rank: 'B', chance: 0.30 },
  { rank: 'C', chance: 0.54 },
];
const ARTIFACT_EARLY_PULL_PROTECTION_COUNT = 20;
const ARTIFACT_EARLY_PULL_PROTECTED_IDS = new Set(['transfer-agreement']);
const ARTIFACT_DISABLED_DROP_IDS = new Set(['transfer-agreement']);
const ARTIFACT_CATALOG = ARTIFACT_CATALOG_METADATA;
const ARTIFACT_CATALOG_BY_ID = new Map(ARTIFACT_CATALOG.map((artifact) => [artifact.id, artifact]));
const ARTIFACT_IDS_BY_RANK = ARTIFACT_CATALOG.reduce((acc, artifact) => {
  const current = acc.get(artifact.rank) || [];
  current.push(artifact.id);
  acc.set(artifact.rank, current);
  return acc;
}, new Map());
const PROFILE_THEME_CATALOG_BY_ID = new Map(PROFILE_THEME_CATALOG.map((theme) => [theme.id, theme]));
const PROFILE_THEME_IDS_BY_RARITY = PROFILE_THEME_CATALOG.reduce((acc, theme) => {
  const rarity = String(theme?.rarity || 'common').trim().toLowerCase();
  const current = acc.get(rarity) || [];
  current.push(theme.id);
  acc.set(rarity, current);
  return acc;
}, new Map());
const PROFILE_THEME_DROP_CHANCE = 0.45;
const PROFILE_THEME_RARITY_CHANCES = [
  { rarity: 'legendary', chance: 0.04 },
  { rarity: 'epic', chance: 0.12 },
  { rarity: 'rare', chance: 0.28 },
  { rarity: 'common', chance: 0.56 },
];
const PROFILE_THEME_DUPLICATE_COIN_REWARDS = {
  legendary: 120,
  epic: 60,
  rare: 28,
  common: 12,
};
const ARTIFACT_XP_GLOBAL_MULTIPLIERS = {
  krylov: 1,
  duck: 0.15,
  crutch: 0.1,
};
const ARTIFACT_XP_TASK_MULTIPLIERS = {
  '1tbssd': {
    tasks: [15, 16],
    perCopyBonus: 0.5,
  },
  fleshka: {
    tasks: [17, 24, 26, 27],
    perCopyBonus: 0.25,
  },
  'list-comprehension': {
    tasks: [17],
    perCopyBonus: 0.5,
  },
  'recursive scroll': {
    tasks: [16],
    perCopyBonus: 0.5,
  },
  'ring-of-cache': {
    tasks: [16, 19, 20, 21],
    perCopyBonus: 0.5,
  },
  rocks: {
    tasks: [19, 20, 21],
    perCopyBonus: 0.5,
  },
  tears: {
    tasks: [24, 25, 26, 27],
    perCopyBonus: 3,
  },
  turtle: {
    tasks: [6],
    perCopyBonus: 1,
  },
};
const ARTIFACT_COIN_GLOBAL_MULTIPLIERS = {
  'amulet-of-import': 0.5,
  python: 1,
  whileTrue: 0.2,
};
const ARTIFACT_INSTANT_REWARDS = {
  black_pen: { xp: 1000, coins: 0 },
  cookie: { xp: 500, coins: 3 },
  draft: { xp: 1000, coins: 0 },
  coffee: { xp: 0, coins: 5 },
};
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
const MOCK_EXAM_SOLVE_XP_LEVEL_ID = 'basic';
const LEADERBOARD_WEEK_DAYS = 7;
const LEADERBOARD_ALIAS_COIN_REWARD = 100;
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
const RUSTORE_PUSH_PROJECT_ID = (() => {
  const raw = typeof process.env.RUSTORE_PUSH_PROJECT_ID === 'string'
    ? process.env.RUSTORE_PUSH_PROJECT_ID.trim()
    : '';
  return raw;
})();
const RUSTORE_PUSH_SERVICE_TOKEN = (() => {
  const raw = typeof process.env.RUSTORE_PUSH_SERVICE_TOKEN === 'string'
    ? process.env.RUSTORE_PUSH_SERVICE_TOKEN.trim()
    : '';
  return raw;
})();
const RUSTORE_PUSH_DEEP_LINK_BASE = (() => {
  const candidates = [
    process.env.RUSTORE_PUSH_DEEP_LINK_BASE,
    process.env.RUSTORE_PUSH_CLICK_ACTION,
    'ru.ivank.egeplatform://open',
  ];
  for (const candidate of candidates) {
    const raw = typeof candidate === 'string' ? candidate.trim() : '';
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol) return raw;
    } catch {
      // Ignore non-URL legacy values like plain intent action names.
    }
  }
  return 'ru.ivank.egeplatform://open';
})();
const RUSTORE_PUSH_NOTIFICATION_CHANNEL_ID = (() => {
  const raw = typeof process.env.RUSTORE_PUSH_NOTIFICATION_CHANNEL_ID === 'string'
    ? process.env.RUSTORE_PUSH_NOTIFICATION_CHANNEL_ID.trim()
    : '';
  return raw || 'ege_platform_general';
})();
const PUSH_SWEEP_INTERVAL_MS = (() => {
  const raw = Number(process.env.PUSH_SWEEP_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 60 * 1000) return Math.floor(raw);
  return 5 * 60 * 1000;
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
const LESSON_REMINDER_LEAD_MINUTES = (() => {
  const raw = Number(process.env.LESSON_REMINDER_LEAD_MINUTES);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 240) return Math.round(raw);
  return 10;
})();
const LESSON_REMINDER_LEAD_MS = LESSON_REMINDER_LEAD_MINUTES * 60 * 1000;
const LESSON_REMINDER_SEND_WINDOW_MS = (() => {
  const raw = Number(process.env.LESSON_REMINDER_SEND_WINDOW_MS);
  if (Number.isFinite(raw) && raw >= 60 * 1000) return Math.floor(raw);
  return Math.max(10 * 60 * 1000, PUSH_SWEEP_INTERVAL_MS * 2);
})();
const SCHEDULE_SYNC_KEEPALIVE_INTERVAL_MS = (() => {
  const raw = Number(process.env.SCHEDULE_SYNC_KEEPALIVE_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 5000) return Math.floor(raw);
  return 25 * 1000;
})();
const STUDENT_SOLVED_EVENTS_LIMIT = (() => {
  const raw = Number(process.env.STUDENT_SOLVED_EVENTS_LIMIT);
  if (Number.isFinite(raw) && raw >= 50) return Math.floor(raw);
  return 200;
})();
const STUDENT_XP_BALANCE_VERSION = 4;
const STUDENT_RECENT_XP_REBALANCE_VERSION = 3;
const STUDENT_BAD_RECENT_XP_REBALANCE_VERSION = 2;
const ALEXANDER_WEEK_START_XP_FIX_VERSION = 1;
const ALEXANDER_WEEK_START_XP_BASE = 100000;
const ALEXANDER_WEEK_START_XP_NAME = 'александр';
const ALEXANDER_WEEK_START_XP_NICKNAME_PART = 'зенков';
const RECENT_XP_REBALANCE_PRE_FIX_ARTIFACT_BONUSES = {
  krylov: 3,
  tears: 5,
};
const TEACHER_SOLVED_EVENTS_READ_BASE_LIMIT = (() => {
  const raw = Number(process.env.TEACHER_SOLVED_EVENTS_READ_LIMIT);
  if (Number.isFinite(raw) && raw >= 500) return Math.floor(raw);
  return 5000;
})();
const TEACHER_SOLVED_EVENTS_READ_HARD_LIMIT = (() => {
  const raw = Number(process.env.TEACHER_SOLVED_EVENTS_READ_HARD_LIMIT);
  if (Number.isFinite(raw) && raw >= TEACHER_SOLVED_EVENTS_READ_BASE_LIMIT) return Math.floor(raw);
  return 50000;
})();
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
let pushLessonSweepInFlight = false;
let pushTeacherCalendarSweepInFlight = false;

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
fs.mkdirSync(boardSnapshotsDir, { recursive: true });
if (RTC_PRESENCE_FS_ENABLED) {
  fs.mkdirSync(rtcPresenceDir, { recursive: true });
}
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const isCollabPersistenceEnabled = (() => {
  const raw = String(process.env.COLLAB_PERSISTENCE || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  // In development we prefer stability over persistence to avoid LevelDB lock crashes.
  return isProduction;
})();
// Board rooms often accumulate large binary updates (drawings, pasted images).
// Replaying persisted board updates via y-leveldb can block the event loop and
// freeze the entire production server when an old board is opened. Keep board
// y-leveldb persistence disabled; board docs use dedicated snapshot files instead.
const BOARD_COLLAB_PERSISTENCE_ENABLED = false;
const BOARD_COLLAB_SNAPSHOT_PERSISTENCE_ENABLED = parseEnabledEnv(
  process.env.BOARD_COLLAB_SNAPSHOT_PERSISTENCE,
  true
);
const BOARD_COLLAB_SNAPSHOT_WRITE_DEBOUNCE_MS = (() => {
  const raw = Number(process.env.BOARD_COLLAB_SNAPSHOT_WRITE_DEBOUNCE_MS);
  if (Number.isFinite(raw) && raw >= 250) return Math.floor(raw);
  return 2500;
})();
if (isProduction && dataDir === defaultDataDir) {
  console.warn('[storage] PLATFORM_DATA_DIR is not set. Data can be lost after a clean deploy.');
}
if (isProduction && uploadsDir === defaultUploadsDir) {
  console.warn('[storage] PLATFORM_UPLOADS_DIR is not set. Uploads can be lost after a clean deploy.');
}
if (!isCollabPersistenceEnabled && LeveldbPersistence) {
  console.warn('[collab] persistence disabled (set COLLAB_PERSISTENCE=1 to enable in development).');
}
if (!BOARD_COLLAB_PERSISTENCE_ENABLED && LeveldbPersistence) {
  if (String(BOARD_COLLAB_PERSISTENCE_RAW || '').trim()) {
    console.warn('[board] BOARD_COLLAB_PERSISTENCE is ignored: y-leveldb persistence is disabled for stability.');
  } else {
    console.warn('[board] y-leveldb persistence disabled for stability.');
  }
}
if (BOARD_COLLAB_SNAPSHOT_PERSISTENCE_ENABLED) {
  console.info(`[board] snapshot persistence enabled in ${boardSnapshotsDir}`);
}
const rawCollabPersistence = (LeveldbPersistence && isCollabPersistenceEnabled)
  ? new LeveldbPersistence(collabDir)
  : null;
const collabDocsPersistenceBypassUntil = new Map();
const boardSnapshotWriteTimers = new Map();
const normalizeCollabDocName = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};
const getCollabDocPersistenceKeys = (docName) => {
  const normalized = normalizeCollabDocName(docName);
  if (!normalized) return [];
  const keys = new Set([normalized]);
  if (isBoardCollabDoc(normalized)) {
    const base = normalized.split('/').pop() || normalized;
    if (base) {
      keys.add(base);
      keys.add(`collab/${base}`);
    }
  }
  return Array.from(keys).filter(Boolean);
};
const isCollabDocPersistenceBypassed = (docName) => {
  const keys = getCollabDocPersistenceKeys(docName);
  if (keys.length === 0) return false;
  const now = Date.now();
  return keys.some((key) => {
    const until = Number(collabDocsPersistenceBypassUntil.get(key)) || 0;
    if (until > now) return true;
    if (until > 0) collabDocsPersistenceBypassUntil.delete(key);
    return false;
  });
};
const bypassCollabDocPersistence = (docName, durationMs = 30000) => {
  const keys = getCollabDocPersistenceKeys(docName);
  if (keys.length === 0) return;
  const nextDuration = Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs) : 30000;
  const until = Date.now() + nextDuration;
  keys.forEach((key) => {
    collabDocsPersistenceBypassUntil.set(key, until);
  });
};
const isBoardCollabDoc = (docName) => {
  const normalized = normalizeCollabDocName(docName);
  if (!normalized) return false;
  const base = normalized.split('/').pop() || normalized;
  return base.startsWith('board-');
};
const isBoardSnapshotPersistenceActive = (docName) => (
  BOARD_COLLAB_SNAPSHOT_PERSISTENCE_ENABLED
  && isBoardCollabDoc(docName)
  && !isCollabDocPersistenceBypassed(docName)
);
const buildBoardSnapshotFilePath = (storageKey) => {
  const normalizedKey = normalizeCollabDocName(storageKey);
  if (!normalizedKey) return '';
  const base = normalizedKey.split('/').pop() || normalizedKey;
  const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'board';
  const hash = crypto.createHash('sha1').update(normalizedKey).digest('hex').slice(0, 12);
  return path.join(boardSnapshotsDir, `${safeBase}-${hash}.bin`);
};
const getBoardSnapshotFilePaths = (docName) => {
  if (!BOARD_COLLAB_SNAPSHOT_PERSISTENCE_ENABLED || !isBoardCollabDoc(docName)) return [];
  const normalized = normalizeCollabDocName(docName);
  if (!normalized) return [];
  const base = normalized.split('/').pop() || normalized;
  const keys = new Set([base]);
  if (normalized !== base) {
    keys.add(normalized);
  } else if (base) {
    keys.add(`collab/${base}`);
  }
  return Array.from(keys)
    .map((key) => buildBoardSnapshotFilePath(key))
    .filter(Boolean);
};
const clearBoardSnapshotWriteTimer = (docName) => {
  const normalized = normalizeCollabDocName(docName);
  if (!normalized) return;
  const timerId = boardSnapshotWriteTimers.get(normalized);
  if (!timerId) return;
  clearTimeout(timerId);
  boardSnapshotWriteTimers.delete(normalized);
};
const writeFileAtomic = (filePath, contents) => {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, contents);
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
    throw error;
  }
};
const loadBoardDocSnapshot = (docName, ydoc) => {
  if (!isBoardSnapshotPersistenceActive(docName)) return false;
  const filePaths = getBoardSnapshotFilePaths(docName);
  if (!ydoc || filePaths.length === 0) return false;
  for (const filePath of filePaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath);
      if (!raw || raw.length === 0) continue;
      Y.applyUpdate(ydoc, new Uint8Array(raw));
      return true;
    } catch (error) {
      console.warn('[board] snapshot load failed:', error?.message || error);
    }
  }
  return false;
};
const flushBoardDocSnapshot = (docName, ydoc) => {
  const normalized = normalizeCollabDocName(docName);
  if (!normalized || !ydoc) return false;
  if (!isBoardSnapshotPersistenceActive(normalized)) return false;
  const [filePath, ...legacyPaths] = getBoardSnapshotFilePaths(normalized);
  if (!filePath) return false;
  clearBoardSnapshotWriteTimer(normalized);
  try {
    const stateUpdate = Y.encodeStateAsUpdate(ydoc);
    writeFileAtomic(filePath, Buffer.from(stateUpdate));
    legacyPaths.forEach((legacyPath) => {
      try {
        if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
      } catch {}
    });
    return true;
  } catch (error) {
    console.warn('[board] snapshot write failed:', error?.message || error);
    return false;
  }
};
const scheduleBoardDocSnapshotWrite = (docName, ydoc) => {
  const normalized = normalizeCollabDocName(docName);
  if (!normalized || !ydoc) return;
  if (!isBoardSnapshotPersistenceActive(normalized)) return;
  clearBoardSnapshotWriteTimer(normalized);
  const timerId = setTimeout(() => {
    boardSnapshotWriteTimers.delete(normalized);
    flushBoardDocSnapshot(normalized, ydoc);
  }, BOARD_COLLAB_SNAPSHOT_WRITE_DEBOUNCE_MS);
  boardSnapshotWriteTimers.set(normalized, timerId);
};
const clearBoardDocSnapshot = (docName) => {
  const normalized = normalizeCollabDocName(docName);
  if (!normalized) return false;
  clearBoardSnapshotWriteTimer(normalized);
  const filePaths = getBoardSnapshotFilePaths(normalized);
  if (filePaths.length === 0) return false;
  let cleared = false;
  try {
    filePaths.forEach((filePath) => {
      if (!fs.existsSync(filePath)) return;
      fs.unlinkSync(filePath);
      cleared = true;
    });
    return cleared;
  } catch (error) {
    console.warn('[board] snapshot clear failed:', error?.message || error);
    return false;
  }
};
const getLoadedCollabDocEntry = (docName) => {
  const loadedDocs = getLoadedCollabDocs();
  if (!(loadedDocs instanceof Map)) return null;
  const keys = getCollabDocPersistenceKeys(docName);
  for (const key of keys) {
    if (!loadedDocs.has(key)) continue;
    return { loadedDocs, key, doc: loadedDocs.get(key) };
  }
  return null;
};
const flushLoadedBoardDocSnapshots = () => {
  const loadedDocs = getLoadedCollabDocs();
  if (!(loadedDocs instanceof Map)) return;
  loadedDocs.forEach((doc, docName) => {
    if (!isBoardSnapshotPersistenceActive(docName) || !doc) return;
    flushBoardDocSnapshot(docName, doc);
  });
};
const isPersistedCollabDoc = (docName) => {
  if (typeof docName !== 'string') return false;
  const normalized = docName.trim();
  if (!normalized) return false;
  if (isCollabDocPersistenceBypassed(normalized)) return false;
  const base = normalized.split('/').pop() || normalized;
  return (
    ((base.startsWith('board-')) && BOARD_COLLAB_PERSISTENCE_ENABLED)
    || base.startsWith('collab-')
    || base.startsWith('py-collab:')
    || base.startsWith('py-collab-')
  );
};
const getLoadedCollabDocs = () => (
  yWsUtils?.docs instanceof Map
    ? yWsUtils.docs
    : null
);
const resetCollabDoc = async (docName, options = {}) => {
  const normalized = normalizeCollabDocName(docName);
  if (!normalized) {
    return {
      closedConnections: 0,
      hadActiveDoc: false,
      clearedPersistence: false,
    };
  }

  bypassCollabDocPersistence(normalized, options.bypassMs);
  const loadedDocEntry = getLoadedCollabDocEntry(normalized);
  const loadedDocs = loadedDocEntry?.loadedDocs || getLoadedCollabDocs();
  const activeDocKey = loadedDocEntry?.key || normalized;
  const activeDoc = loadedDocEntry?.doc || null;
  let closedConnections = 0;

  if (activeDoc) {
    const connections = activeDoc?.conns instanceof Map
      ? Array.from(activeDoc.conns.keys())
      : [];
    connections.forEach((conn) => {
      if (!conn) return;
      closedConnections += 1;
      try {
        conn.close(options.closeCode || 1012, options.closeReason || 'Document reset');
      } catch {
        // Ignore connection close failures during forced document reset.
      }
    });
    try {
      activeDoc.destroy();
    } catch {
      // Ignore destroy failures and continue clearing persistence state.
    }
    loadedDocs?.delete(activeDocKey);
  }

  let clearedPersistence = false;
  if (rawCollabPersistence && typeof rawCollabPersistence.clearDocument === 'function') {
    await rawCollabPersistence.clearDocument(activeDocKey);
    clearedPersistence = true;
  }
  if (clearBoardDocSnapshot(activeDocKey)) {
    clearedPersistence = true;
  }

  return {
    closedConnections,
    hadActiveDoc: Boolean(activeDoc),
    clearedPersistence,
  };
};
const collabPersistence = (rawCollabPersistence || BOARD_COLLAB_SNAPSHOT_PERSISTENCE_ENABLED) ? {
  bindState: async (docName, ydoc) => {
    if (isBoardCollabDoc(docName)) {
      loadBoardDocSnapshot(docName, ydoc);
      const handleBoardUpdate = () => {
        scheduleBoardDocSnapshotWrite(docName, ydoc);
      };
      const handleBoardDestroy = () => {
        clearBoardSnapshotWriteTimer(docName);
        ydoc.off('update', handleBoardUpdate);
        ydoc.off('destroy', handleBoardDestroy);
      };
      ydoc.on('update', handleBoardUpdate);
      ydoc.on('destroy', handleBoardDestroy);
      return Promise.resolve();
    }
    if (!rawCollabPersistence || !isPersistedCollabDoc(docName)) return Promise.resolve();
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
    if (isBoardCollabDoc(docName)) {
      flushBoardDocSnapshot(docName, ydoc);
      return Promise.resolve();
    }
    if (!rawCollabPersistence || !isPersistedCollabDoc(docName)) return Promise.resolve();
    try {
      const stateUpdate = Y.encodeStateAsUpdate(ydoc);
      await rawCollabPersistence.storeUpdate(docName, stateUpdate);
      return Promise.resolve();
    } catch (error) {
      console.warn('[collab] writeState failed:', error?.message || error);
      return Promise.resolve();
    }
  },
  provider: rawCollabPersistence,
} : null;
if (collabPersistence && typeof yWsUtils?.setPersistence === 'function') {
  yWsUtils.setPersistence(collabPersistence);
}
process.on('exit', flushLoadedBoardDocSnapshots);
process.on('SIGINT', () => {
  flushLoadedBoardDocSnapshots();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flushLoadedBoardDocSnapshots();
  process.exit(0);
});

app.use((req, res, next) => {
  applyCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});

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

const readBroadcastNotificationsDb = () => {
  try {
    const raw = fs.readFileSync(broadcastNotificationsFile, 'utf8');
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : [];
    const normalized = normalizeBroadcastNotificationList(list);
    if (JSON.stringify(normalized) !== JSON.stringify(list)) {
      writeBroadcastNotificationsDb(normalized);
    }
    return normalized;
  } catch {
    return [];
  }
};

const readTeacherCalendarSyncDb = () => {
  try {
    const raw = fs.readFileSync(teacherCalendarSyncFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
};

const normalizeTeacherCalendarMarkKey = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 500) return '';
  if (normalized === '__proto__' || normalized === 'constructor' || normalized === 'prototype') return '';
  return normalized;
};

const normalizeTeacherCalendarMarkValue = (value) => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return new Date().toISOString();
};

const normalizeTeacherCalendarMarks = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  Object.entries(source).forEach(([key, markValue]) => {
    const normalizedKey = normalizeTeacherCalendarMarkKey(key);
    if (!normalizedKey) return;
    normalized[normalizedKey] = normalizeTeacherCalendarMarkValue(markValue);
  });
  return normalized;
};

const normalizeTeacherCalendarMarksDb = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  Object.entries(source).forEach(([teacherId, marks]) => {
    const normalizedTeacherId = String(teacherId || '').trim();
    if (!normalizedTeacherId) return;
    normalized[normalizedTeacherId] = normalizeTeacherCalendarMarks(marks);
  });
  return normalized;
};

const readTeacherCalendarMarksDb = () => {
  try {
    const raw = fs.readFileSync(teacherCalendarMarksFile, 'utf8');
    const data = JSON.parse(raw);
    return normalizeTeacherCalendarMarksDb(data);
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

const writeBroadcastNotificationsDb = (data) => {
  fs.writeFileSync(broadcastNotificationsFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeTeacherCalendarSyncDb = (data) => {
  fs.writeFileSync(teacherCalendarSyncFile, JSON.stringify(data || {}, null, 2), 'utf8');
};

const writeTeacherCalendarMarksDb = (data) => {
  fs.writeFileSync(teacherCalendarMarksFile, JSON.stringify(normalizeTeacherCalendarMarksDb(data), null, 2), 'utf8');
};

const TEACHER_FINANCE_PRICING_MODES = new Set(['perLesson', 'monthly']);
const TEACHER_FINANCE_HISTORY_LIMIT = 12;
const TEACHER_FINANCE_PROFILE_NOTE_MAX_LENGTH = 400;
const TEACHER_FINANCE_STUDENT_NOTE_MAX_LENGTH = 1200;
const TEACHER_FINANCE_MONTH_NOTE_MAX_LENGTH = 2000;

const roundTeacherFinanceNumber = (value, { allowNegative = false } = {}) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const rounded = Math.round(num * 100) / 100;
  return allowNegative ? rounded : Math.max(0, rounded);
};

const normalizeTeacherFinanceMonthKey = (value) => {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};

const getCurrentTeacherFinanceMonthKey = () => new Date().toISOString().slice(0, 7);

const normalizeTeacherFinanceText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, Math.max(0, Number(maxLength) || 0));
};

const normalizeTeacherFinancePricingMode = (value, fallback = 'perLesson') => {
  const normalized = String(value || '').trim();
  if (TEACHER_FINANCE_PRICING_MODES.has(normalized)) return normalized;
  return TEACHER_FINANCE_PRICING_MODES.has(fallback) ? fallback : 'perLesson';
};

const normalizeTeacherFinancePaymentDay = (value) => {
  if (value === null || value === '' || typeof value === 'undefined') return null;
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 31) return null;
  return numeric;
};

const getDefaultTeacherFinanceProfile = () => ({
  pricingMode: 'perLesson',
  lessonPrice: 0,
  monthlyRate: 0,
  plannedLessons: 0,
  paymentDay: null,
  note: '',
});

const normalizeTeacherFinanceProfile = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const fallback = getDefaultTeacherFinanceProfile();
  return {
    pricingMode: normalizeTeacherFinancePricingMode(source.pricingMode, fallback.pricingMode),
    lessonPrice: roundTeacherFinanceNumber(source.lessonPrice),
    monthlyRate: roundTeacherFinanceNumber(source.monthlyRate),
    plannedLessons: roundTeacherFinanceNumber(source.plannedLessons),
    paymentDay: normalizeTeacherFinancePaymentDay(source.paymentDay),
    note: normalizeTeacherFinanceText(source.note, TEACHER_FINANCE_PROFILE_NOTE_MAX_LENGTH),
  };
};

const getDefaultTeacherFinanceStudentRecord = (profile = getDefaultTeacherFinanceProfile()) => ({
  pricingMode: profile.pricingMode,
  lessonPrice: profile.lessonPrice,
  monthlyRate: profile.monthlyRate,
  plannedLessons: profile.plannedLessons,
  completedLessons: 0,
  cancelledLessons: 0,
  paidAmount: 0,
  extraCharge: 0,
  discount: 0,
  expenses: 0,
  paymentDay: profile.paymentDay,
  note: '',
  updatedAt: '',
});

const normalizeTeacherFinanceStudentRecord = (value, profile = getDefaultTeacherFinanceProfile()) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const fallback = getDefaultTeacherFinanceStudentRecord(profile);
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(source, key);
  return {
    pricingMode: normalizeTeacherFinancePricingMode(source.pricingMode, fallback.pricingMode),
    lessonPrice: hasOwn('lessonPrice') ? roundTeacherFinanceNumber(source.lessonPrice) : fallback.lessonPrice,
    monthlyRate: hasOwn('monthlyRate') ? roundTeacherFinanceNumber(source.monthlyRate) : fallback.monthlyRate,
    plannedLessons: hasOwn('plannedLessons') ? roundTeacherFinanceNumber(source.plannedLessons) : fallback.plannedLessons,
    completedLessons: roundTeacherFinanceNumber(source.completedLessons),
    cancelledLessons: roundTeacherFinanceNumber(source.cancelledLessons),
    paidAmount: roundTeacherFinanceNumber(source.paidAmount),
    extraCharge: roundTeacherFinanceNumber(source.extraCharge),
    discount: roundTeacherFinanceNumber(source.discount),
    expenses: roundTeacherFinanceNumber(source.expenses),
    paymentDay: hasOwn('paymentDay') ? normalizeTeacherFinancePaymentDay(source.paymentDay) : fallback.paymentDay,
    note: normalizeTeacherFinanceText(source.note, TEACHER_FINANCE_STUDENT_NOTE_MAX_LENGTH),
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt.trim() ? source.updatedAt.trim() : '',
  };
};

const getDefaultTeacherFinanceMonthSettings = () => ({
  otherIncome: 0,
  otherExpenses: 0,
  incomeGoal: 0,
  note: '',
  updatedAt: '',
});

const normalizeTeacherFinanceMonthSettings = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    otherIncome: roundTeacherFinanceNumber(source.otherIncome),
    otherExpenses: roundTeacherFinanceNumber(source.otherExpenses),
    incomeGoal: roundTeacherFinanceNumber(source.incomeGoal),
    note: normalizeTeacherFinanceText(source.note, TEACHER_FINANCE_MONTH_NOTE_MAX_LENGTH),
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt.trim() ? source.updatedAt.trim() : '',
  };
};

const getDefaultTeacherFinanceTeacherEntry = () => ({
  studentProfiles: {},
  months: {},
});

const normalizeTeacherFinanceTeacherEntry = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const studentProfilesSource = source.studentProfiles && typeof source.studentProfiles === 'object' && !Array.isArray(source.studentProfiles)
    ? source.studentProfiles
    : {};
  const studentProfiles = {};
  Object.entries(studentProfilesSource).forEach(([studentId, profileValue]) => {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId) return;
    studentProfiles[normalizedStudentId] = normalizeTeacherFinanceProfile(profileValue);
  });

  const monthsSource = source.months && typeof source.months === 'object' && !Array.isArray(source.months)
    ? source.months
    : {};
  const months = {};
  Object.entries(monthsSource).forEach(([monthKey, monthValue]) => {
    const normalizedMonth = normalizeTeacherFinanceMonthKey(monthKey);
    if (!normalizedMonth) return;
    const monthSource = monthValue && typeof monthValue === 'object' && !Array.isArray(monthValue) ? monthValue : {};
    const studentsSource = monthSource.students && typeof monthSource.students === 'object' && !Array.isArray(monthSource.students)
      ? monthSource.students
      : {};
    const students = {};
    Object.entries(studentsSource).forEach(([studentId, studentValue]) => {
      const normalizedStudentId = String(studentId || '').trim();
      if (!normalizedStudentId) return;
      students[normalizedStudentId] = normalizeTeacherFinanceStudentRecord(
        studentValue,
        studentProfiles[normalizedStudentId] || getDefaultTeacherFinanceProfile()
      );
    });
    months[normalizedMonth] = {
      settings: normalizeTeacherFinanceMonthSettings(monthSource.settings),
      students,
    };
  });

  return {
    studentProfiles,
    months,
  };
};

const normalizeTeacherFinanceDb = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  Object.entries(source).forEach(([teacherId, teacherValue]) => {
    const normalizedTeacherId = String(teacherId || '').trim();
    if (!normalizedTeacherId) return;
    normalized[normalizedTeacherId] = normalizeTeacherFinanceTeacherEntry(teacherValue);
  });
  return normalized;
};

const readTeacherFinanceDb = () => {
  try {
    const raw = fs.readFileSync(teacherFinanceFile, 'utf8');
    const data = JSON.parse(raw);
    return normalizeTeacherFinanceDb(data);
  } catch {
    return {};
  }
};

const writeTeacherFinanceDb = (data) => {
  const normalized = normalizeTeacherFinanceDb(data);
  fs.writeFileSync(teacherFinanceFile, JSON.stringify(normalized, null, 2), 'utf8');
};

const getTeacherFinanceTeacherEntry = (db, teacherId) => {
  const normalizedDb = normalizeTeacherFinanceDb(db);
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return getDefaultTeacherFinanceTeacherEntry();
  return normalizeTeacherFinanceTeacherEntry(normalizedDb[normalizedTeacherId]);
};

const calculateTeacherFinanceStudentMetrics = (record) => {
  const pricingMode = normalizeTeacherFinancePricingMode(record?.pricingMode);
  const lessonPrice = roundTeacherFinanceNumber(record?.lessonPrice);
  const monthlyRate = roundTeacherFinanceNumber(record?.monthlyRate);
  const plannedLessons = roundTeacherFinanceNumber(record?.plannedLessons);
  const completedLessons = roundTeacherFinanceNumber(record?.completedLessons);
  const cancelledLessons = roundTeacherFinanceNumber(record?.cancelledLessons);
  const paidAmount = roundTeacherFinanceNumber(record?.paidAmount);
  const extraCharge = roundTeacherFinanceNumber(record?.extraCharge);
  const discount = roundTeacherFinanceNumber(record?.discount);
  const expenses = roundTeacherFinanceNumber(record?.expenses);
  const plannedRevenue = pricingMode === 'monthly'
    ? monthlyRate
    : roundTeacherFinanceNumber(lessonPrice * plannedLessons);
  const accruedRevenue = pricingMode === 'monthly'
    ? monthlyRate
    : roundTeacherFinanceNumber(lessonPrice * completedLessons);
  const netAccrued = roundTeacherFinanceNumber(accruedRevenue + extraCharge - discount - expenses, { allowNegative: true });
  const outstanding = roundTeacherFinanceNumber(netAccrued - paidAmount, { allowNegative: true });
  const completionRate = plannedLessons > 0
    ? Math.max(0, Math.min(999, Math.round((completedLessons / plannedLessons) * 100)))
    : 0;
  const hasActivity = Boolean(
    plannedLessons > 0
    || completedLessons > 0
    || cancelledLessons > 0
    || paidAmount > 0
    || extraCharge > 0
    || discount > 0
    || expenses > 0
    || lessonPrice > 0
    || monthlyRate > 0
    || String(record?.note || '').trim()
  );
  const paymentStatus = netAccrued <= 0
    ? 'empty'
    : (outstanding <= 0 ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid'));
  return {
    plannedRevenue,
    accruedRevenue,
    netAccrued,
    outstanding,
    completionRate,
    hasActivity,
    paymentStatus,
  };
};

const buildTeacherFinanceMonthSnapshot = (teacherId, monthKey, teacherEntry, teacherStudents = []) => {
  const normalizedMonthKey = normalizeTeacherFinanceMonthKey(monthKey) || getCurrentTeacherFinanceMonthKey();
  const currentEntry = normalizeTeacherFinanceTeacherEntry(teacherEntry);
  const monthData = currentEntry.months[normalizedMonthKey] || {
    settings: getDefaultTeacherFinanceMonthSettings(),
    students: {},
  };
  const monthSettings = normalizeTeacherFinanceMonthSettings(monthData.settings);
  const studentList = Array.isArray(teacherStudents) ? teacherStudents : [];
  const studentIds = new Set();
  studentList.forEach((student) => {
    const id = String(student?.id || '').trim();
    if (id) studentIds.add(id);
  });
  Object.keys(currentEntry.studentProfiles || {}).forEach((studentId) => studentIds.add(studentId));
  Object.keys(monthData.students || {}).forEach((studentId) => studentIds.add(studentId));

  const studentsById = new Map(
    studentList.map((student) => [String(student?.id || '').trim(), student])
  );

  const students = Array.from(studentIds).map((studentId) => {
    const student = studentsById.get(studentId) || null;
    const profile = normalizeTeacherFinanceProfile(currentEntry.studentProfiles[studentId]);
    const record = normalizeTeacherFinanceStudentRecord(monthData.students[studentId], profile);
    const metrics = calculateTeacherFinanceStudentMetrics(record);
    const fullName = typeof student?.name === 'string' && student.name.trim()
      ? student.name.trim()
      : 'Удалённый ученик';
    const nickname = typeof student?.nickname === 'string' ? student.nickname.trim() : '';
    const displayName = nickname || fullName;
    return {
      id: studentId,
      name: fullName,
      nickname,
      displayName,
      deletedAt: typeof student?.deletedAt === 'string' && student.deletedAt.trim() ? student.deletedAt.trim() : '',
      createdAt: typeof student?.createdAt === 'string' ? student.createdAt : '',
      profile,
      record,
      metrics,
    };
  }).sort((left, right) => {
    const leftDeleted = Boolean(left.deletedAt);
    const rightDeleted = Boolean(right.deletedAt);
    if (leftDeleted !== rightDeleted) return leftDeleted ? 1 : -1;
    const debtDiff = (right.metrics?.outstanding || 0) - (left.metrics?.outstanding || 0);
    if (debtDiff !== 0) return debtDiff;
    return String(left.displayName || '').localeCompare(String(right.displayName || ''), 'ru');
  });

  const studentTotals = students.reduce((acc, student) => {
    const record = student.record || getDefaultTeacherFinanceStudentRecord();
    const metrics = student.metrics || calculateTeacherFinanceStudentMetrics(record);
    acc.studentsCount += 1;
    if (!student.deletedAt) acc.activeStudentsCount += 1;
    if (metrics.hasActivity) acc.studentsWithActivityCount += 1;
    if (metrics.outstanding > 0) acc.studentsWithDebtCount += 1;
    acc.plannedLessons = roundTeacherFinanceNumber(acc.plannedLessons + roundTeacherFinanceNumber(record.plannedLessons));
    acc.completedLessons = roundTeacherFinanceNumber(acc.completedLessons + roundTeacherFinanceNumber(record.completedLessons));
    acc.cancelledLessons = roundTeacherFinanceNumber(acc.cancelledLessons + roundTeacherFinanceNumber(record.cancelledLessons));
    acc.plannedRevenue = roundTeacherFinanceNumber(acc.plannedRevenue + metrics.plannedRevenue);
    acc.accruedRevenue = roundTeacherFinanceNumber(acc.accruedRevenue + metrics.accruedRevenue);
    acc.netAccrued = roundTeacherFinanceNumber(acc.netAccrued + metrics.netAccrued, { allowNegative: true });
    acc.cashflow = roundTeacherFinanceNumber(acc.cashflow + roundTeacherFinanceNumber(record.paidAmount), { allowNegative: true });
    acc.outstanding = roundTeacherFinanceNumber(acc.outstanding + metrics.outstanding, { allowNegative: true });
    return acc;
  }, {
    studentsCount: 0,
    activeStudentsCount: 0,
    studentsWithActivityCount: 0,
    studentsWithDebtCount: 0,
    plannedLessons: 0,
    completedLessons: 0,
    cancelledLessons: 0,
    plannedRevenue: 0,
    accruedRevenue: 0,
    netAccrued: 0,
    cashflow: 0,
    outstanding: 0,
  });

  const totalNetAccrued = roundTeacherFinanceNumber(
    studentTotals.netAccrued + monthSettings.otherIncome - monthSettings.otherExpenses,
    { allowNegative: true }
  );
  const totalCashflow = roundTeacherFinanceNumber(
    studentTotals.cashflow + monthSettings.otherIncome - monthSettings.otherExpenses,
    { allowNegative: true }
  );
  const goalProgress = monthSettings.incomeGoal > 0
    ? Math.max(0, Math.round((totalCashflow / monthSettings.incomeGoal) * 100))
    : 0;

  return {
    month: normalizedMonthKey,
    monthSettings,
    students,
    summary: {
      ...studentTotals,
      otherIncome: monthSettings.otherIncome,
      otherExpenses: monthSettings.otherExpenses,
      incomeGoal: monthSettings.incomeGoal,
      note: monthSettings.note,
      goalProgress,
      totalNetAccrued,
      totalCashflow,
    },
  };
};

const buildTeacherFinanceResponse = (teacherId, monthKey) => {
  const normalizedTeacherId = String(teacherId || '').trim();
  const normalizedMonthKey = normalizeTeacherFinanceMonthKey(monthKey) || getCurrentTeacherFinanceMonthKey();
  const teacherStudents = readStudentsDb().filter(
    (student) => normalizeTeacherId(student?.teacherId) === normalizedTeacherId
  );
  const financeDb = readTeacherFinanceDb();
  const teacherEntry = getTeacherFinanceTeacherEntry(financeDb, normalizedTeacherId);
  const snapshot = buildTeacherFinanceMonthSnapshot(normalizedTeacherId, normalizedMonthKey, teacherEntry, teacherStudents);
  const availableMonths = Array.from(new Set([
    getCurrentTeacherFinanceMonthKey(),
    ...Object.keys(teacherEntry.months || {}),
  ])).filter(Boolean).sort((left, right) => right.localeCompare(left, 'ru'));
  const history = availableMonths
    .slice(0, TEACHER_FINANCE_HISTORY_LIMIT)
    .map((historyMonthKey) => {
      const monthSnapshot = buildTeacherFinanceMonthSnapshot(normalizedTeacherId, historyMonthKey, teacherEntry, teacherStudents);
      return {
        month: historyMonthKey,
        ...monthSnapshot.summary,
      };
    });

  return {
    teacherId: normalizedTeacherId,
    month: snapshot.month,
    availableMonths,
    history,
    monthSettings: snapshot.monthSettings,
    summary: snapshot.summary,
    students: snapshot.students,
  };
};

const SCHEDULE_CHANGE_REQUEST_TYPES = new Set(['create', 'update', 'delete']);
const SCHEDULE_CHANGE_REQUEST_STATUSES = new Set(['pending', 'approved', 'rejected']);

const normalizeScheduleChangeRequestType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return SCHEDULE_CHANGE_REQUEST_TYPES.has(normalized) ? normalized : '';
};

const normalizeScheduleChangeRequestStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return SCHEDULE_CHANGE_REQUEST_STATUSES.has(normalized) ? normalized : '';
};

const normalizeScheduleChangeRequestEntry = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = String(value.id || '').trim();
  const type = normalizeScheduleChangeRequestType(value.type);
  const status = normalizeScheduleChangeRequestStatus(value.status);
  const teacherId = String(value.teacherId || '').trim();
  const studentId = String(value.studentId || '').trim();
  if (!id || !type || !status || !teacherId || !studentId) return null;
  const targetEntryId = String(value.targetEntryId || '').trim();
  const studentName = typeof value.studentName === 'string' ? value.studentName.trim() : '';
  const createdAt = typeof value.createdAt === 'string' && value.createdAt.trim()
    ? value.createdAt.trim()
    : new Date().toISOString();
  const resolvedAt = typeof value.resolvedAt === 'string' && value.resolvedAt.trim()
    ? value.resolvedAt.trim()
    : null;
  const resolvedByRole = typeof value.resolvedByRole === 'string' && value.resolvedByRole.trim()
    ? value.resolvedByRole.trim()
    : null;
  const resolvedById = typeof value.resolvedById === 'string' && value.resolvedById.trim()
    ? value.resolvedById.trim()
    : null;
  const resolvedByName = typeof value.resolvedByName === 'string' && value.resolvedByName.trim()
    ? value.resolvedByName.trim()
    : null;
  const resolutionNote = typeof value.resolutionNote === 'string'
    ? value.resolutionNote.trim().slice(0, 500)
    : '';
  const previousEntry = value.previousEntry && typeof value.previousEntry === 'object' && !Array.isArray(value.previousEntry)
    ? value.previousEntry
    : null;
  const proposedEntry = value.proposedEntry && typeof value.proposedEntry === 'object' && !Array.isArray(value.proposedEntry)
    ? value.proposedEntry
    : null;
  return {
    id,
    type,
    status,
    teacherId,
    studentId,
    studentName,
    targetEntryId,
    previousEntry,
    proposedEntry,
    createdAt,
    resolvedAt,
    resolvedByRole,
    resolvedById,
    resolvedByName,
    resolutionNote,
  };
};

const normalizeScheduleChangeRequestList = (value) => {
  const list = Array.isArray(value) ? value : [];
  const normalized = [];
  const seen = new Set();
  list.forEach((item) => {
    const entry = normalizeScheduleChangeRequestEntry(item);
    if (!entry || seen.has(entry.id)) return;
    seen.add(entry.id);
    normalized.push(entry);
  });
  return normalized;
};

const readScheduleRequestsDb = () => {
  try {
    const raw = fs.readFileSync(scheduleRequestsFile, 'utf8');
    const data = JSON.parse(raw);
    return normalizeScheduleChangeRequestList(data);
  } catch {
    return [];
  }
};

const writeScheduleRequestsDb = (data) => {
  const normalized = normalizeScheduleChangeRequestList(data);
  fs.writeFileSync(scheduleRequestsFile, JSON.stringify(normalized, null, 2), 'utf8');
};

const purgeScheduleRequestsForStudents = (studentIds = []) => {
  const ids = Array.isArray(studentIds)
    ? studentIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const current = readScheduleRequestsDb();
  const next = current.filter((entry) => !idSet.has(String(entry?.studentId || '').trim()));
  if (next.length !== current.length) {
    writeScheduleRequestsDb(next);
  }
};

const purgeScheduleRequestsForTeachers = (teacherIds = []) => {
  const ids = Array.isArray(teacherIds)
    ? teacherIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const current = readScheduleRequestsDb();
  const next = current.filter((entry) => !idSet.has(String(entry?.teacherId || '').trim()));
  if (next.length !== current.length) {
    writeScheduleRequestsDb(next);
  }
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

const normalizePushSubscriptionsByUser = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([userKey, list]) => {
    const key = String(userKey || '').trim();
    if (!key || !Array.isArray(list)) return;
    const unique = [];
    const seen = new Set();
    list.forEach((item) => {
      const normalized = normalizePushStoredSubscription(item);
      if (!normalized || seen.has(normalized.endpoint)) return;
      seen.add(normalized.endpoint);
      unique.push(normalized);
    });
    if (unique.length > 0) {
      result[key] = unique;
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

const normalizeRuStorePushToken = (value) => {
  const token = typeof value === 'string'
    ? value.trim()
    : (typeof value?.token === 'string' ? value.token.trim() : '');
  if (!token) return '';
  return token.slice(0, 4096);
};

const normalizeRuStoreStoredToken = (value) => {
  if (!value || (typeof value !== 'object' && typeof value !== 'string') || Array.isArray(value)) return null;
  const token = normalizeRuStorePushToken(value);
  if (!token) return null;
  const nowIso = new Date().toISOString();
  const createdAt = typeof value?.createdAt === 'string' && value.createdAt.trim()
    ? value.createdAt.trim()
    : nowIso;
  const updatedAt = typeof value?.updatedAt === 'string' && value.updatedAt.trim()
    ? value.updatedAt.trim()
    : createdAt;
  const userAgent = typeof value?.userAgent === 'string'
    ? value.userAgent.slice(0, 500)
    : '';
  const platform = typeof value?.platform === 'string' && value.platform.trim()
    ? value.platform.trim().slice(0, 50)
    : 'android';
  return {
    token,
    createdAt,
    updatedAt,
    userAgent,
    platform,
  };
};

const normalizeRuStoreTokensByStudent = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([studentId, list]) => {
    const id = String(studentId || '').trim();
    if (!id || !Array.isArray(list)) return;
    const unique = [];
    const seen = new Set();
    list.forEach((item) => {
      const normalized = normalizeRuStoreStoredToken(item);
      if (!normalized || seen.has(normalized.token)) return;
      seen.add(normalized.token);
      unique.push(normalized);
    });
    if (unique.length > 0) {
      result[id] = unique;
    }
  });
  return result;
};

const normalizeRuStoreTokensByUser = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([userKey, list]) => {
    const key = String(userKey || '').trim();
    if (!key || !Array.isArray(list)) return;
    const unique = [];
    const seen = new Set();
    list.forEach((item) => {
      const normalized = normalizeRuStoreStoredToken(item);
      if (!normalized || seen.has(normalized.token)) return;
      seen.add(normalized.token);
      unique.push(normalized);
    });
    if (unique.length > 0) {
      result[key] = unique;
    }
  });
  return result;
};

const normalizePushLessonReminderSettingsEntry = (value) => {
  if (typeof value === 'boolean') {
    return { enabled: value, updatedAt: '' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    enabled: Boolean(value.enabled),
    updatedAt: typeof value.updatedAt === 'string' && value.updatedAt.trim()
      ? value.updatedAt.trim()
      : '',
  };
};

const normalizePushLessonReminderSettingsByStudent = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([studentId, entry]) => {
    const id = String(studentId || '').trim();
    if (!id) return;
    const normalized = normalizePushLessonReminderSettingsEntry(entry);
    if (!normalized) return;
    result[id] = normalized;
  });
  return result;
};

const normalizePushTeacherCalendarReminderSettingsEntry = (value) => {
  if (typeof value === 'boolean') {
    return { enabled: value, updatedAt: '' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    enabled: Boolean(value.enabled),
    updatedAt: typeof value.updatedAt === 'string' && value.updatedAt.trim()
      ? value.updatedAt.trim()
      : '',
  };
};

const normalizePushTeacherCalendarReminderSettingsByTeacher = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([teacherId, entry]) => {
    const id = String(teacherId || '').trim();
    if (!id) return;
    const normalized = normalizePushTeacherCalendarReminderSettingsEntry(entry);
    if (!normalized) return;
    result[id] = normalized;
  });
  return result;
};

const normalizePushLessonReminderStateEntry = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const slotId = typeof value.slotId === 'string' ? value.slotId.trim() : '';
  const occurrenceKey = typeof value.occurrenceKey === 'string' ? value.occurrenceKey.trim() : '';
  const sentAt = typeof value.sentAt === 'string' ? value.sentAt.trim() : '';
  if (!slotId || !occurrenceKey || !sentAt) return null;
  return {
    slotId,
    occurrenceKey,
    sentAt,
  };
};

const normalizePushLessonReminderStateByStudent = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([studentId, list]) => {
    const id = String(studentId || '').trim();
    if (!id) return;
    const source = Array.isArray(list)
      ? list
      : (list && typeof list === 'object' ? Object.values(list) : []);
    const unique = [];
    const seen = new Set();
    source.forEach((entry) => {
      const normalized = normalizePushLessonReminderStateEntry(entry);
      if (!normalized || seen.has(normalized.slotId)) return;
      seen.add(normalized.slotId);
      unique.push(normalized);
    });
    if (unique.length > 0) result[id] = unique;
  });
  return result;
};

const normalizePushTeacherCalendarReminderStateEntry = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const slotKey = typeof value.slotKey === 'string' ? value.slotKey.trim() : '';
  const occurrenceKey = typeof value.occurrenceKey === 'string' ? value.occurrenceKey.trim() : '';
  const sentAt = typeof value.sentAt === 'string' ? value.sentAt.trim() : '';
  if (!slotKey || !occurrenceKey || !sentAt) return null;
  return {
    slotKey,
    occurrenceKey,
    sentAt,
  };
};

const normalizePushTeacherCalendarReminderStateByTeacher = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([teacherId, list]) => {
    const id = String(teacherId || '').trim();
    if (!id) return;
    const source = Array.isArray(list)
      ? list
      : (list && typeof list === 'object' ? Object.values(list) : []);
    const unique = [];
    const seen = new Set();
    source.forEach((entry) => {
      const normalized = normalizePushTeacherCalendarReminderStateEntry(entry);
      if (!normalized || seen.has(normalized.slotKey)) return;
      seen.add(normalized.slotKey);
      unique.push(normalized);
    });
    if (unique.length > 0) result[id] = unique;
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
  subscriptionsByUser: {},
  rustoreTokensByStudent: {},
  rustoreTokensByUser: {},
  remindersByStudent: {},
  lessonReminderSettingsByStudent: {},
  lessonReminderStateByStudent: {},
  teacherCalendarReminderSettingsByTeacher: {},
  teacherCalendarReminderStateByTeacher: {},
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
      subscriptionsByUser: normalizePushSubscriptionsByUser(data.subscriptionsByUser),
      rustoreTokensByStudent: normalizeRuStoreTokensByStudent(data.rustoreTokensByStudent),
      rustoreTokensByUser: normalizeRuStoreTokensByUser(data.rustoreTokensByUser),
      remindersByStudent: normalizePushRemindersByStudent(data.remindersByStudent),
      lessonReminderSettingsByStudent: normalizePushLessonReminderSettingsByStudent(data.lessonReminderSettingsByStudent),
      lessonReminderStateByStudent: normalizePushLessonReminderStateByStudent(data.lessonReminderStateByStudent),
      teacherCalendarReminderSettingsByTeacher: normalizePushTeacherCalendarReminderSettingsByTeacher(data.teacherCalendarReminderSettingsByTeacher),
      teacherCalendarReminderStateByTeacher: normalizePushTeacherCalendarReminderStateByTeacher(data.teacherCalendarReminderStateByTeacher),
    };
  } catch {
    return fallback;
  }
};

const writePushDb = (data) => {
  const normalized = {
    vapidKeys: normalizePushVapidKeys(data?.vapidKeys),
    subscriptionsByStudent: normalizePushSubscriptionsByStudent(data?.subscriptionsByStudent),
    subscriptionsByUser: normalizePushSubscriptionsByUser(data?.subscriptionsByUser),
    rustoreTokensByStudent: normalizeRuStoreTokensByStudent(data?.rustoreTokensByStudent),
    rustoreTokensByUser: normalizeRuStoreTokensByUser(data?.rustoreTokensByUser),
    remindersByStudent: normalizePushRemindersByStudent(data?.remindersByStudent),
    lessonReminderSettingsByStudent: normalizePushLessonReminderSettingsByStudent(data?.lessonReminderSettingsByStudent),
    lessonReminderStateByStudent: normalizePushLessonReminderStateByStudent(data?.lessonReminderStateByStudent),
    teacherCalendarReminderSettingsByTeacher: normalizePushTeacherCalendarReminderSettingsByTeacher(data?.teacherCalendarReminderSettingsByTeacher),
    teacherCalendarReminderStateByTeacher: normalizePushTeacherCalendarReminderStateByTeacher(data?.teacherCalendarReminderStateByTeacher),
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
    if (pushDb.rustoreTokensByStudent?.[studentId]) {
      delete pushDb.rustoreTokensByStudent[studentId];
      changed = true;
    }
    if (pushDb.remindersByStudent?.[studentId]) {
      delete pushDb.remindersByStudent[studentId];
      changed = true;
    }
    if (pushDb.lessonReminderSettingsByStudent?.[studentId]) {
      delete pushDb.lessonReminderSettingsByStudent[studentId];
      changed = true;
    }
    if (pushDb.lessonReminderStateByStudent?.[studentId]) {
      delete pushDb.lessonReminderStateByStudent[studentId];
      changed = true;
    }
  });
  if (changed) writePushDb(pushDb);
};

const purgePushDataForTeachers = (teacherIds = []) => {
  const ids = Array.isArray(teacherIds) ? teacherIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (ids.length === 0) return;
  const pushDb = readPushDb();
  let changed = false;
  ids.forEach((teacherId) => {
    const userKey = `teacher:${teacherId}`;
    if (pushDb.subscriptionsByUser?.[userKey]) {
      delete pushDb.subscriptionsByUser[userKey];
      changed = true;
    }
    if (pushDb.rustoreTokensByUser?.[userKey]) {
      delete pushDb.rustoreTokensByUser[userKey];
      changed = true;
    }
    if (pushDb.teacherCalendarReminderSettingsByTeacher?.[teacherId]) {
      delete pushDb.teacherCalendarReminderSettingsByTeacher[teacherId];
      changed = true;
    }
    if (pushDb.teacherCalendarReminderStateByTeacher?.[teacherId]) {
      delete pushDb.teacherCalendarReminderStateByTeacher[teacherId];
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
  purgeStudentTeacherChatsForStudents(ids);
  purgeScheduleRequestsForStudents(ids);
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
  const editedAt = normalizeIsoTimestamp(value.editedAt, '') || null;
  if (!id || !senderId || !text || !createdAt) return null;
  const senderName = senderNameRaw || (senderRole === 'teacher' ? 'Преподаватель' : 'Гость');
  return {
    id,
    senderRole,
    senderId,
    senderName,
    text,
    createdAt,
    editedAt,
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

const normalizeStudentChatMessageText = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return normalized.slice(0, STUDENT_CHAT_MESSAGE_MAX_LENGTH);
};

const normalizeStudentChatImageName = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = normalizeFileName(value).trim();
  if (!normalized) return '';
  return normalized.slice(0, STUDENT_CHAT_IMAGE_NAME_MAX_LENGTH);
};

const getBase64PayloadSizeBytes = (base64Value) => {
  const normalized = typeof base64Value === 'string'
    ? base64Value.replace(/\s+/g, '').trim()
    : '';
  if (!normalized) return 0;
  const padding = normalized.endsWith('==') ? 2 : (normalized.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
};

const normalizeStudentChatImageDataUrl = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized) return '';
  const match = normalized.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return '';
  const mimeRaw = String(match[1] || '').trim().toLowerCase();
  const mime = mimeRaw === 'image/jpg' ? 'image/jpeg' : mimeRaw;
  if (!STUDENT_CHAT_ALLOWED_IMAGE_MIME_TYPES.has(mime)) return '';
  const base64 = String(match[2] || '').replace(/\s+/g, '');
  if (!base64) return '';
  const sizeBytes = getBase64PayloadSizeBytes(base64);
  if (!sizeBytes || sizeBytes > STUDENT_CHAT_IMAGE_MAX_BYTES) return '';
  return `data:${mime};base64,${base64}`;
};

const hasStudentTeacherChatMessageContent = (message) => {
  if (!message || typeof message !== 'object') return false;
  const text = normalizeStudentChatMessageText(message.text);
  const imageDataUrl = normalizeStudentChatImageDataUrl(message.imageDataUrl);
  return Boolean(text || imageDataUrl);
};

const buildStudentTeacherChatMessagePreview = (message) => {
  if (!message || typeof message !== 'object') return '';
  const text = normalizeStudentChatMessageText(message.text);
  if (text) {
    return text.replace(/\s+/g, ' ').trim().slice(0, STUDENT_CHAT_LAST_MESSAGE_PREVIEW_MAX_LENGTH);
  }
  const imageDataUrl = normalizeStudentChatImageDataUrl(message.imageDataUrl);
  if (imageDataUrl) return STUDENT_CHAT_IMAGE_PREVIEW_TEXT;
  return '';
};

const buildStudentTeacherChatId = (studentId) => {
  const id = String(studentId || '').trim();
  if (!id) return '';
  return `student-${id}`;
};

const getStudentIdFromStudentTeacherChatId = (chatId) => {
  const id = String(chatId || '').trim();
  if (!id) return '';
  if (id.startsWith('student-')) return id.slice('student-'.length).trim();
  return id;
};

const normalizeStudentTeacherChatMessage = (value) => {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const senderRole = value.senderRole === 'teacher' ? 'teacher' : 'student';
  const senderId = typeof value.senderId === 'string' ? value.senderId.trim() : '';
  const senderNameRaw = typeof value.senderName === 'string' ? value.senderName.trim() : '';
  const text = normalizeStudentChatMessageText(value.text);
  const imageDataUrl = normalizeStudentChatImageDataUrl(value.imageDataUrl);
  const imageName = normalizeStudentChatImageName(value.imageName);
  const createdAt = normalizeIsoTimestamp(value.createdAt, '');
  if (!id || !senderId || (!text && !imageDataUrl) || !createdAt) return null;
  const senderName = senderNameRaw || (senderRole === 'teacher' ? 'Преподаватель' : 'Ученик');
  const message = {
    id,
    senderRole,
    senderId,
    senderName,
    text,
    createdAt,
  };
  if (imageDataUrl) {
    message.imageDataUrl = imageDataUrl;
    if (imageName) message.imageName = imageName;
  }
  return message;
};

const normalizeStudentTeacherChat = (value) => {
  if (!value || typeof value !== 'object') return null;
  const rawStudentId = typeof value.studentId === 'string' ? value.studentId.trim() : '';
  const rawId = typeof value.id === 'string' ? value.id.trim() : '';
  const studentId = rawStudentId || getStudentIdFromStudentTeacherChatId(rawId);
  const id = rawId || buildStudentTeacherChatId(studentId);
  const teacherId = typeof value.teacherId === 'string' ? value.teacherId.trim() : '';
  if (!id || !studentId || !teacherId) return null;

  const messages = Array.isArray(value.messages)
    ? value.messages.map((item) => normalizeStudentTeacherChatMessage(item)).filter(Boolean)
    : [];
  const lastMessage = messages[messages.length - 1] || null;
  const createdAt = normalizeIsoTimestamp(value.createdAt, lastMessage?.createdAt || new Date().toISOString());
  const updatedAt = normalizeIsoTimestamp(value.updatedAt, lastMessage?.createdAt || createdAt);
  const lastMessageAt = normalizeIsoTimestamp(value.lastMessageAt, lastMessage?.createdAt || updatedAt);
  const lastMessagePreviewRaw = typeof value.lastMessagePreview === 'string'
    ? value.lastMessagePreview.replace(/\s+/g, ' ').trim()
    : '';
  const fallbackPreview = buildStudentTeacherChatMessagePreview(lastMessage);
  const lastMessagePreview = (lastMessagePreviewRaw || fallbackPreview).slice(0, STUDENT_CHAT_LAST_MESSAGE_PREVIEW_MAX_LENGTH);
  const lastMessageSenderRole = value.lastMessageSenderRole === 'teacher' || value.lastMessageSenderRole === 'student'
    ? value.lastMessageSenderRole
    : (lastMessage?.senderRole || '');
  const lastReadByTeacherAt = normalizeIsoTimestamp(value.lastReadByTeacherAt, '') || null;
  const lastReadByStudentAt = normalizeIsoTimestamp(value.lastReadByStudentAt, '') || null;

  return {
    id,
    studentId,
    teacherId,
    createdAt,
    updatedAt,
    lastMessageAt,
    lastMessagePreview,
    lastMessageSenderRole,
    lastReadByTeacherAt,
    lastReadByStudentAt,
    messages,
  };
};

const readStudentChatsDb = () => {
  try {
    const raw = fs.readFileSync(studentChatsFile, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((entry) => normalizeStudentTeacherChat(entry)).filter(Boolean);
  } catch {
    return [];
  }
};

const writeStudentChatsDb = (data) => {
  const safeData = Array.isArray(data)
    ? data.map((entry) => normalizeStudentTeacherChat(entry)).filter(Boolean)
    : [];
  fs.writeFileSync(studentChatsFile, JSON.stringify(safeData, null, 2), 'utf8');
};

const getStudentTeacherChatSortTimestamp = (chat) => {
  const raw = chat?.lastMessageAt || chat?.updatedAt || chat?.createdAt || '';
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getStudentTeacherChatUnreadForTeacher = (chat) => {
  if (!chat || !Array.isArray(chat.messages) || chat.messages.length === 0) return 0;
  const lastReadRaw = chat.lastReadByTeacherAt || '';
  const lastReadAt = Date.parse(lastReadRaw);
  return chat.messages.reduce((count, message) => {
    if (!message || message.senderRole !== 'student') return count;
    if (!Number.isFinite(lastReadAt)) return count + 1;
    const messageAt = Date.parse(message.createdAt || '');
    if (!Number.isFinite(messageAt)) return count + 1;
    return messageAt > lastReadAt ? count + 1 : count;
  }, 0);
};

const getStudentTeacherChatUnreadForStudent = (chat) => {
  if (!chat || !Array.isArray(chat.messages) || chat.messages.length === 0) return 0;
  const lastReadRaw = chat.lastReadByStudentAt || '';
  const lastReadAt = Date.parse(lastReadRaw);
  return chat.messages.reduce((count, message) => {
    if (!message || message.senderRole !== 'teacher') return count;
    if (!Number.isFinite(lastReadAt)) return count + 1;
    const messageAt = Date.parse(message.createdAt || '');
    if (!Number.isFinite(messageAt)) return count + 1;
    return messageAt > lastReadAt ? count + 1 : count;
  }, 0);
};

const buildStudentTeacherChatSummary = (chat, student = null) => ({
  id: chat.id,
  studentId: chat.studentId,
  teacherId: chat.teacherId,
  studentName: String(student?.name || '').trim(),
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
  lastMessageAt: chat.lastMessageAt,
  lastMessagePreview: chat.lastMessagePreview || '',
  lastMessageSenderRole: chat.lastMessageSenderRole || '',
  unreadForTeacher: getStudentTeacherChatUnreadForTeacher(chat),
  unreadForStudent: getStudentTeacherChatUnreadForStudent(chat),
  messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
});

const createStudentTeacherChatForStudent = (student) => {
  const studentId = String(student?.id || '').trim();
  const teacherId = String(student?.teacherId || '').trim();
  if (!studentId || !teacherId) return null;
  const nowIso = new Date().toISOString();
  return {
    id: buildStudentTeacherChatId(studentId),
    studentId,
    teacherId,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastMessageAt: '',
    lastMessagePreview: '',
    lastMessageSenderRole: '',
    lastReadByTeacherAt: nowIso,
    lastReadByStudentAt: nowIso,
    messages: [],
  };
};

const appendStudentTeacherChatMessage = (chat, message) => {
  if (!chat || !message || !hasStudentTeacherChatMessageContent(message) || !message.senderId) return chat;
  const nextMessages = [...(Array.isArray(chat.messages) ? chat.messages : []), message];
  const preview = buildStudentTeacherChatMessagePreview(message);
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
  if (message.senderRole === 'student') {
    next.lastReadByStudentAt = message.createdAt;
  }
  return next;
};

const markStudentTeacherChatReadByTeacher = (chat) => {
  if (!chat) return { chat, changed: false };
  if (getStudentTeacherChatUnreadForTeacher(chat) <= 0) return { chat, changed: false };
  const nowIso = new Date().toISOString();
  return {
    changed: true,
    chat: { ...chat, lastReadByTeacherAt: nowIso },
  };
};

const markStudentTeacherChatReadByStudent = (chat) => {
  if (!chat) return { chat, changed: false };
  if (getStudentTeacherChatUnreadForStudent(chat) <= 0) return { chat, changed: false };
  const nowIso = new Date().toISOString();
  return {
    changed: true,
    chat: { ...chat, lastReadByStudentAt: nowIso },
  };
};

const _ensureStudentTeacherChatForStudent = (student, options = {}) => {
  const persist = options.persist !== false;
  const studentId = String(student?.id || '').trim();
  const teacherId = String(student?.teacherId || '').trim();
  if (!studentId || !teacherId) return null;
  const expectedId = buildStudentTeacherChatId(studentId);
  const chats = Array.isArray(options.chats) ? options.chats : readStudentChatsDb();
  const index = chats.findIndex((entry) => entry?.studentId === studentId || entry?.id === expectedId);

  if (index === -1) {
    const created = createStudentTeacherChatForStudent(student);
    if (!created) return null;
    if (persist) {
      chats.unshift(created);
      writeStudentChatsDb(chats);
    }
    return {
      chat: created,
      chats,
      index: persist ? 0 : -1,
      created: true,
      changed: Boolean(persist),
    };
  }

  const current = chats[index];
  let changed = false;
  let next = current;
  if (current.id !== expectedId || current.studentId !== studentId || current.teacherId !== teacherId) {
    changed = true;
    next = {
      ...current,
      id: expectedId,
      studentId,
      teacherId,
    };
  }
  const normalized = normalizeStudentTeacherChat(next) || next;
  if (changed) {
    chats[index] = normalized;
    if (persist) writeStudentChatsDb(chats);
  }
  return {
    chat: normalized,
    chats,
    index,
    created: false,
    changed,
  };
};

const purgeStudentTeacherChatsForStudents = (studentIds = []) => {
  const ids = Array.isArray(studentIds) ? studentIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const chats = readStudentChatsDb();
  const filtered = chats.filter((chat) => !idSet.has(String(chat?.studentId || '').trim()));
  if (filtered.length !== chats.length) {
    writeStudentChatsDb(filtered);
  }
};

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
  const enabled = Number.isFinite(limit) && limit > 0;
  const remaining = enabled ? Math.max(0, limit - used) : null;
  return { monthKey, used, limit, remaining, enabled };
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
const scheduleSyncClients = new Map();
let scheduleSyncClientCounter = 0;

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
  token: session.token,
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
    `SameSite=${AUTH_COOKIE_SAME_SITE}`,
  ];
  if (AUTH_COOKIE_SECURE) {
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
    `SameSite=${AUTH_COOKIE_SAME_SITE}`,
  ];
  if (AUTH_COOKIE_SECURE) {
    cookieParts.push('Secure');
  }
  appendSetCookie(res, cookieParts.join('; '));
};

const respondWithSession = (res, session) => {
  if (!session) return res.status(500).json({ error: 'Ошибка сервера' });
  setAuthSessionCookie(res, session);
  return res.json(serializeAuthSession(session));
};

const getAuthTokenFromQueryParams = (paramsLike) => {
  if (!paramsLike) return '';
  const readToken = (value) => {
    const normalized = typeof value === 'string'
      ? value.trim()
      : (Array.isArray(value) ? String(value[0] || '').trim() : '');
    return normalized;
  };
  const direct = readToken(paramsLike._auth) || readToken(paramsLike.authToken);
  if (direct) return direct;
  return '';
};

const getAuthTokenFromUrl = (rawUrl) => {
  const normalizedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!normalizedUrl) return '';
  try {
    const url = new URL(normalizedUrl, 'http://local.ege-platform');
    return url.searchParams.get('_auth')?.trim() || url.searchParams.get('authToken')?.trim() || '';
  } catch {
    return '';
  }
};

const getAuthTokenFromRequest = (req) => {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) return match[1].trim();
  }
  const customHeader = req.headers['x-ege-auth-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }
  if (Array.isArray(customHeader)) {
    const firstToken = String(customHeader[0] || '').trim();
    if (firstToken) return firstToken;
  }
  const queryToken = getAuthTokenFromQueryParams(req?.query);
  if (queryToken) {
    return queryToken;
  }
  const urlToken = getAuthTokenFromUrl(req?.originalUrl || req?.url);
  if (urlToken) {
    return urlToken;
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

const writeSseEvent = (res, eventName, payload) => {
  const safeEventName = String(eventName || 'message').trim() || 'message';
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  res.write(`event: ${safeEventName}\n`);
  res.write(`data: ${JSON.stringify(safePayload)}\n\n`);
};

const removeScheduleSyncClient = (clientId) => {
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedClientId) return;
  const client = scheduleSyncClients.get(normalizedClientId);
  if (!client) return;
  if (client.keepAliveTimer) {
    clearInterval(client.keepAliveTimer);
  }
  scheduleSyncClients.delete(normalizedClientId);
};

const isScheduleSyncClientInterested = (client, payload) => {
  if (!client || !payload || typeof payload !== 'object') return false;
  const role = String(client.role || '').trim();
  const teacherId = String(payload.teacherId || '').trim();
  const studentId = String(payload.studentId || '').trim();
  if (role === 'admin') return true;
  if (role === 'teacher') {
    return teacherId && teacherId === String(client.teacherId || '').trim();
  }
  if (role === 'student') {
    return studentId && studentId === String(client.studentId || '').trim();
  }
  return false;
};

const notifyScheduleSyncUpdate = ({
  scope = 'schedule',
  action = 'updated',
  teacherId = '',
  studentId = '',
  entryId = '',
} = {}) => {
  const normalizedTeacherId = String(teacherId || '').trim();
  const normalizedStudentId = String(studentId || '').trim();
  const normalizedEntryId = String(entryId || '').trim();
  if (!normalizedTeacherId && !normalizedStudentId) return;
  if (scheduleSyncClients.size === 0) return;

  const payload = {
    scope: String(scope || 'schedule').trim() || 'schedule',
    action: String(action || 'updated').trim() || 'updated',
    teacherId: normalizedTeacherId || null,
    studentId: normalizedStudentId || null,
    entryId: normalizedEntryId || null,
    updatedAt: new Date().toISOString(),
  };

  scheduleSyncClients.forEach((client, clientId) => {
    if (!isScheduleSyncClientInterested(client, payload)) return;
    try {
      writeSseEvent(client.res, 'schedule-sync', payload);
    } catch {
      removeScheduleSyncClient(clientId);
    }
  });
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
  editedAt: null,
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

const rebuildSignupChatAfterMessageMutation = (chat, nextMessages, options = {}) => {
  if (!chat) return chat;
  const mutationAt = normalizeIsoTimestamp(options.mutationAt, new Date().toISOString());
  const messages = Array.isArray(nextMessages)
    ? nextMessages.map((item) => normalizeSignupMessage(item)).filter(Boolean)
    : [];
  const lastMessage = messages[messages.length - 1] || null;
  const fallbackLastMessageAt = normalizeIsoTimestamp(chat.createdAt, mutationAt);
  const lastMessageAt = lastMessage?.createdAt || fallbackLastMessageAt;
  const lastMessagePreview = lastMessage
    ? lastMessage.text.replace(/\s+/g, ' ').trim().slice(0, SIGNUP_LAST_MESSAGE_PREVIEW_MAX_LENGTH)
    : '';
  return {
    ...chat,
    messages,
    updatedAt: mutationAt,
    lastMessageAt,
    lastMessagePreview,
    lastMessageSenderRole: lastMessage?.senderRole || '',
  };
};

const canModifySignupChatMessage = (auth, chat, message) => {
  if (!auth || !chat || !message) return false;
  if (message.senderRole !== 'teacher') return false;
  if (isAdminRole(auth)) return true;
  if (isTeacherRole(auth)) {
    if (chat.teacherId !== auth.id) return false;
    const senderId = String(message.senderId || '').trim();
    return senderId === auth.id;
  }
  return false;
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

const getStudentTeacherChatAccessError = (auth, chat) => {
  if (!auth || !chat) return 'Недостаточно прав';
  if (isAdminRole(auth)) return '';
  if (isTeacherRole(auth)) {
    return chat.teacherId === auth.id ? '' : 'Недостаточно прав';
  }
  if (isStudentRole(auth)) {
    return chat.studentId === auth.id ? '' : 'Недостаточно прав';
  }
  return 'Недостаточно прав';
};

const ensureStudentTeacherChatAccess = (req, res, chatId, options = {}) => {
  const required = options.required !== false;
  const createIfMissing = options.createIfMissing === true;
  const persist = options.persist !== false;
  const id = String(chatId || '').trim();
  const studentId = getStudentIdFromStudentTeacherChatId(id);
  if (!studentId) {
    if (required) res.status(400).json({ error: 'chatId required' });
    return null;
  }

  const student = findStudentById(studentId);
  if (!student) {
    res.status(404).json({ error: 'Ученик не найден' });
    return null;
  }

  if (isTeacherRole(req.auth) && student.teacherId !== req.auth.id) {
    res.status(403).json({ error: 'Недостаточно прав' });
    return null;
  }
  if (isStudentRole(req.auth) && student.id !== req.auth.id) {
    res.status(403).json({ error: 'Недостаточно прав' });
    return null;
  }
  if (!isAdminRole(req.auth) && !isTeacherRole(req.auth) && !isStudentRole(req.auth)) {
    res.status(403).json({ error: 'Недостаточно прав' });
    return null;
  }

  const chats = Array.isArray(options.chats) ? options.chats : readStudentChatsDb();
  const expectedId = buildStudentTeacherChatId(student.id);
  const chatIndex = chats.findIndex((entry) => entry?.studentId === student.id || entry?.id === expectedId);
  let index = chatIndex;
  let chat = index >= 0 ? chats[index] : null;
  let changed = false;
  let created = false;

  if (!chat) {
    if (!createIfMissing) {
      res.status(404).json({ error: 'Чат не найден' });
      return null;
    }
    const createdChat = createStudentTeacherChatForStudent(student);
    if (!createdChat) {
      res.status(400).json({ error: 'Не удалось создать чат' });
      return null;
    }
    chats.unshift(createdChat);
    index = 0;
    chat = createdChat;
    changed = true;
    created = true;
  }

  if (chat.id !== expectedId || chat.studentId !== student.id || chat.teacherId !== student.teacherId) {
    chat = {
      ...chat,
      id: expectedId,
      studentId: student.id,
      teacherId: student.teacherId,
    };
    chats[index] = chat;
    changed = true;
  }

  const normalized = normalizeStudentTeacherChat(chat) || chat;
  const accessError = getStudentTeacherChatAccessError(req.auth, normalized);
  if (accessError) {
    res.status(403).json({ error: accessError });
    return null;
  }

  if (changed) {
    chats[index] = normalized;
    if (persist) writeStudentChatsDb(chats);
  }

  return {
    chat: normalized,
    chats,
    index,
    student,
    changed,
    created,
  };
};

const createStudentTeacherChatMessage = ({ senderRole, senderId, senderName, text, imageDataUrl, imageName }) => {
  const normalizedText = normalizeStudentChatMessageText(text);
  const normalizedImageDataUrl = normalizeStudentChatImageDataUrl(imageDataUrl);
  const normalizedImageName = normalizeStudentChatImageName(imageName);
  const message = {
    id: crypto.randomUUID(),
    senderRole: senderRole === 'teacher' ? 'teacher' : 'student',
    senderId: String(senderId || '').trim(),
    senderName: String(senderName || '').trim(),
    text: normalizedText,
    createdAt: new Date().toISOString(),
  };
  if (normalizedImageDataUrl) {
    message.imageDataUrl = normalizedImageDataUrl;
    if (normalizedImageName) message.imageName = normalizedImageName;
  }
  return message;
};

const isLeadAllowedApiRequest = (req) => {
  const method = String(req?.method || '').toUpperCase();
  const apiPath = String(req?.path || '').trim();
  if (!apiPath) return false;
  if (apiPath === '/signup-chat/messages') return method === 'GET' || method === 'POST';
  if (apiPath === '/push/public-key') return method === 'GET';
  if (apiPath === '/push/subscription') return method === 'GET' || method === 'POST' || method === 'DELETE';
  if (apiPath === '/push/test') return method === 'POST';
  return false;
};

const getPushUserStorageKey = (auth) => {
  if (!auth) return '';
  if (!isTeacherRole(auth) && !isLeadRole(auth)) return '';
  const role = String(auth.role || '').trim();
  const id = String(auth.id || '').trim();
  if (!role || !id) return '';
  return `${role}:${id}`;
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
  const requestedId = String(studentId || '').trim();
  const id = isStudentRole(req.auth)
    ? String(req.auth?.id || '').trim()
    : requestedId;
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

const getBoardRoomIdForStudent = (student) => {
  const teacherId = normalizeTeacherId(student?.teacherId);
  const studentId = String(student?.id || '').trim();
  if (!teacherId || !studentId) return '';
  return `board-${teacherId}-${studentId}`;
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

const normalizeTeacherId = (value) => {
  if (typeof value === 'string') return value.trim();
  return String(value || '').trim();
};

const normalizeBroadcastNotificationText = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, BROADCAST_NOTIFICATION_TEXT_MAX_LENGTH);
};

const normalizeBroadcastNotificationName = (value, fallback = '') => {
  const normalized = normalizeFileName(typeof value === 'string' ? value.trim() : '');
  const safe = normalized ? path.basename(normalized) : '';
  if (safe) return safe.slice(0, BROADCAST_NOTIFICATION_NAME_MAX_LENGTH);
  return fallback;
};

const normalizeBroadcastNotificationAttachment = (value, options = {}) => {
  if (!value || typeof value !== 'object') return null;
  const fallbackName = typeof options.fallbackName === 'string' ? options.fallbackName : 'Файл';
  const storageName = path.basename(String(value.storageName || '').trim());
  if (!storageName) return null;
  const id = String(value.id || storageName).trim() || storageName;
  const sizeBytesRaw = Number(value.sizeBytes);
  const sizeBytes = Number.isFinite(sizeBytesRaw) && sizeBytesRaw > 0 ? Math.floor(sizeBytesRaw) : 0;
  const urlRaw = typeof value.url === 'string' ? value.url.trim() : '';
  const url = urlRaw || `/uploads/${storageName}`;
  return {
    id,
    name: normalizeBroadcastNotificationName(value.name, fallbackName),
    size: typeof value.size === 'string' && value.size.trim()
      ? value.size.trim().slice(0, 64)
      : formatSize(sizeBytes),
    sizeBytes,
    url,
    storageName,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType.trim().slice(0, 120) : '',
  };
};

const getMockExamTaskCount = (exam) => {
  const tasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  return Object.keys(tasks).filter((key) => Boolean(tasks[key])).length;
};

const normalizeMockExamBadgeLabel = (value) => (
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 36)
);

const normalizeMockExamBadgeThemeId = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(normalized) ? normalized : 'sunset';
};

const normalizeMockExamBadges = (value) => {
  const list = Array.isArray(value) ? value : [];
  const next = [];
  const seen = new Set();

  list.forEach((item) => {
    const label = normalizeMockExamBadgeLabel(item?.label);
    if (!label) return;
    const themeId = normalizeMockExamBadgeThemeId(item?.themeId);
    const dedupeKey = `${themeId}:${label.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    next.push({ label, themeId });
  });

  return next.slice(0, 4);
};

const findMockExamById = (examId) => {
  const normalizedId = String(examId || '').trim();
  if (!normalizedId) return null;
  const list = readMockExamsDb();
  return (Array.isArray(list) ? list : []).find((exam) => String(exam?.id || '').trim() === normalizedId) || null;
};

const normalizeBroadcastNotificationMockExam = (value, options = {}) => {
  if (!value) return null;

  const examFromOptions = options.mockExam && typeof options.mockExam === 'object'
    ? options.mockExam
    : null;
  const rawId = typeof value === 'string'
    ? value.trim()
    : String(value?.id || value?.mockExamId || '').trim();
  const exam = examFromOptions || findMockExamById(rawId);
  const examId = String(exam?.id || rawId).trim();
  if (!examId) return null;

  const fallbackTitle = typeof value === 'object' && typeof value?.title === 'string'
    ? value.title.trim()
    : '';
  const title = String(exam?.title || fallbackTitle).trim().slice(0, 180);
  if (!title) return null;

  const rawTaskCount = typeof value === 'object' ? Number(value?.taskCount) : NaN;
  const taskCount = exam
    ? getMockExamTaskCount(exam)
    : (Number.isFinite(rawTaskCount) && rawTaskCount >= 0 ? Math.floor(rawTaskCount) : 0);
  const badges = normalizeMockExamBadges(
    exam?.badges || (typeof value === 'object' ? value?.badges : null)
  );

  return {
    id: examId,
    title,
    taskCount,
    badges,
  };
};

const normalizeBroadcastNotificationSeenIds = (value) => Array.from(new Set(
  (Array.isArray(value) ? value : []).map((entry) => String(entry || '').trim()).filter(Boolean)
));

const normalizeBroadcastNotificationGift = (value) => {
  if (!value || typeof value !== 'object') return null;
  const coins = Math.min(
    BROADCAST_NOTIFICATION_GIFT_MAX_COINS,
    normalizeCoinsTotal(value.coins ?? value.amount)
  );
  if (coins <= 0) return null;
  return {
    type: 'coins',
    coins,
    claimedByStudentIds: normalizeBroadcastNotificationSeenIds(value.claimedByStudentIds),
  };
};

const normalizeBroadcastNotificationEntry = (value) => {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  if (!id) return null;

  const text = normalizeBroadcastNotificationText(value.text);
  const image = normalizeBroadcastNotificationAttachment(value.image, { fallbackName: 'Изображение' });
  const file = normalizeBroadcastNotificationAttachment(value.file, { fallbackName: 'Файл' });
  const mockExam = normalizeBroadcastNotificationMockExam(value.mockExam || value.mockExamId);
  const gift = normalizeBroadcastNotificationGift(
    value.gift
    || (Object.prototype.hasOwnProperty.call(value, 'giftCoins') ? { coins: value.giftCoins } : null)
  );
  if (!text && !image && !file && !mockExam && !gift) return null;

  const createdByRoleRaw = String(value?.createdByRole || '').trim().toLowerCase();
  const createdByRole = createdByRoleRaw === 'admin'
    ? 'admin'
    : (createdByRoleRaw === 'teacher' ? 'teacher' : '');
  const createdById = String(value.createdById || '').trim();
  if (!createdByRole || !createdById) return null;

  const createdAtMs = Date.parse(String(value.createdAt || ''));
  const createdAt = Number.isFinite(createdAtMs) ? new Date(createdAtMs).toISOString() : new Date().toISOString();
  const updatedAtMs = Date.parse(String(value.updatedAt || ''));
  const updatedAt = Number.isFinite(updatedAtMs) ? new Date(updatedAtMs).toISOString() : createdAt;

  const audienceKind = value.audienceKind === 'all-students' ? 'all-students' : 'teacher-students';
  const audienceTeacherId = audienceKind === 'teacher-students'
    ? normalizeTeacherId(value.audienceTeacherId || (createdByRole === 'teacher' ? createdById : ''))
    : '';
  if (audienceKind === 'teacher-students' && !audienceTeacherId) return null;

  return {
    id,
    text,
    image,
    file,
    mockExam,
    gift,
    createdAt,
    updatedAt,
    createdById,
    createdByName: String(value.createdByName || '').trim().slice(0, 120) || (createdByRole === 'admin' ? 'Администратор' : 'Преподаватель'),
    createdByRole,
    audienceKind,
    audienceTeacherId,
    seenByStudentIds: normalizeBroadcastNotificationSeenIds(value.seenByStudentIds),
  };
};

const normalizeBroadcastNotificationList = (value) => {
  const list = Array.isArray(value) ? value : [];
  const seenIds = new Set();
  const normalized = [];
  list.forEach((entry) => {
    const safeEntry = normalizeBroadcastNotificationEntry(entry);
    if (!safeEntry) return;
    if (seenIds.has(safeEntry.id)) return;
    seenIds.add(safeEntry.id);
    normalized.push(safeEntry);
  });
  normalized.sort((left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''));
  if (normalized.length > BROADCAST_NOTIFICATION_STORAGE_LIMIT) {
    normalized.length = BROADCAST_NOTIFICATION_STORAGE_LIMIT;
  }
  return normalized;
};

const getBroadcastNotificationAudienceLabel = (entry, auth = null) => {
  if (!entry || typeof entry !== 'object') return '';
  if (entry.audienceKind === 'all-students') return 'Всем ученикам платформы';
  const teacherId = normalizeTeacherId(entry.audienceTeacherId);
  if (!teacherId) return 'Ученикам преподавателя';
  if (isTeacherRole(auth) && String(auth?.id || '').trim() === teacherId) {
    return 'Всем вашим ученикам';
  }
  const teacher = findTeacherById(teacherId);
  return teacher?.name
    ? `Ученикам преподавателя ${teacher.name}`
    : 'Ученикам преподавателя';
};

const getBroadcastNotificationRecipientStudents = (entry) => {
  const students = readStudentsDb().filter(isActiveStudent);
  if (!entry || typeof entry !== 'object') return [];
  if (entry.audienceKind === 'all-students') return students;
  const teacherId = normalizeTeacherId(entry.audienceTeacherId);
  if (!teacherId) return [];
  return students.filter((student) => normalizeTeacherId(student?.teacherId) === teacherId);
};

const canStudentViewBroadcastNotification = (auth, entry) => {
  if (!isStudentRole(auth) || !entry) return false;
  if (entry.audienceKind === 'all-students') return true;
  const teacherId = normalizeTeacherId(entry.audienceTeacherId);
  return Boolean(teacherId) && normalizeTeacherId(auth?.teacherId) === teacherId;
};

const canManageBroadcastNotification = (auth, entry) => {
  if (!entry) return false;
  if (isAdminRole(auth)) return true;
  if (!isTeacherRole(auth)) return false;
  return entry.audienceKind === 'teacher-students'
    && normalizeTeacherId(entry.audienceTeacherId) === String(auth?.id || '').trim();
};

const serializeBroadcastNotificationForStaff = (entry, auth) => {
  const recipients = getBroadcastNotificationRecipientStudents(entry);
  const recipientIds = new Set(recipients.map((student) => String(student.id || '').trim()).filter(Boolean));
  const seenCount = normalizeBroadcastNotificationSeenIds(entry?.seenByStudentIds)
    .filter((studentId) => recipientIds.has(studentId))
    .length;
  const gift = normalizeBroadcastNotificationGift(entry?.gift);
  const claimedCount = gift
    ? normalizeBroadcastNotificationSeenIds(gift.claimedByStudentIds)
      .filter((studentId) => recipientIds.has(studentId))
      .length
    : 0;
  const recipientCount = recipients.length;
  return {
    id: entry.id,
    text: entry.text,
    image: entry.image,
    file: entry.file,
    mockExam: normalizeBroadcastNotificationMockExam(entry?.mockExam),
    gift: gift
      ? {
        type: 'coins',
        coins: gift.coins,
        claimedCount,
        unclaimedCount: Math.max(0, recipientCount - claimedCount),
      }
      : null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    createdById: entry.createdById,
    createdByName: entry.createdByName,
    createdByRole: entry.createdByRole,
    audienceLabel: getBroadcastNotificationAudienceLabel(entry, auth),
    recipientCount,
    seenCount,
    unreadCount: Math.max(0, recipientCount - seenCount),
  };
};

const serializeBroadcastNotificationForStudent = (entry, studentId) => {
  const normalizedStudentId = String(studentId || '').trim();
  const seen = normalizeBroadcastNotificationSeenIds(entry?.seenByStudentIds).includes(normalizedStudentId);
  const gift = normalizeBroadcastNotificationGift(entry?.gift);
  const serializedMockExam = (() => {
    const attachedExam = normalizeBroadcastNotificationMockExam(entry?.mockExam);
    if (!attachedExam) return null;
    const liveExam = findMockExamById(attachedExam.id);
    if (!liveExam) return null;
    if (!isMockExamVisibleToStudent(liveExam, normalizedStudentId)) return null;
    return normalizeBroadcastNotificationMockExam(attachedExam, { mockExam: liveExam });
  })();
  return {
    id: entry.id,
    text: entry.text,
    image: entry.image,
    file: entry.file,
    mockExam: serializedMockExam,
    gift: gift
      ? {
        type: 'coins',
        coins: gift.coins,
        claimed: normalizeBroadcastNotificationSeenIds(gift.claimedByStudentIds).includes(normalizedStudentId),
      }
      : null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    createdById: entry.createdById,
    createdByName: entry.createdByName,
    createdByRole: entry.createdByRole,
    audienceLabel: getBroadcastNotificationAudienceLabel(entry),
    seen,
  };
};

const deleteBroadcastNotificationAttachmentFiles = (entry) => {
  [entry?.image, entry?.file].forEach((attachment) => {
    const storageName = path.basename(String(attachment?.storageName || '').trim());
    if (!storageName) return;
    const filePath = path.join(uploadsDir, storageName);
    fs.unlink(filePath, () => {});
  });
};

const SCHEDULE_WEEKDAYS = [
  { key: 'monday', label: 'Понедельник', order: 1 },
  { key: 'tuesday', label: 'Вторник', order: 2 },
  { key: 'wednesday', label: 'Среда', order: 3 },
  { key: 'thursday', label: 'Четверг', order: 4 },
  { key: 'friday', label: 'Пятница', order: 5 },
  { key: 'saturday', label: 'Суббота', order: 6 },
  { key: 'sunday', label: 'Воскресенье', order: 7 },
];
const TEACHER_TRIAL_STUDENT_FALLBACK_NAME = 'Пробное занятие';
const DEFAULT_SCHEDULE_DURATION_MINUTES = 60;
const SCHEDULE_WEEKDAY_BY_KEY = SCHEDULE_WEEKDAYS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});
const SCHEDULE_WEEKDAY_KEY_BY_LABEL = SCHEDULE_WEEKDAYS.reduce((acc, item) => {
  acc[item.label.toLowerCase()] = item.key;
  return acc;
}, {});

const normalizeScheduleWeekdayKey = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (SCHEDULE_WEEKDAY_BY_KEY[normalized]) return normalized;
  return SCHEDULE_WEEKDAY_KEY_BY_LABEL[normalized] || '';
};

const normalizeScheduleTime = (value) => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const normalizeScheduleDurationMinutes = (value, fallback = DEFAULT_SCHEDULE_DURATION_MINUTES) => {
  const fallbackRaw = Number(fallback);
  const fallbackMinutes = Number.isFinite(fallbackRaw) && fallbackRaw >= 15
    ? Math.round(fallbackRaw)
    : DEFAULT_SCHEDULE_DURATION_MINUTES;
  const normalizedRaw = Number(value);
  if (!Number.isFinite(normalizedRaw)) return fallbackMinutes;
  const normalized = Math.round(normalizedRaw);
  if (normalized < 15 || normalized > 360) return fallbackMinutes;
  return normalized;
};

const getScheduleWeekdayMetaFromDate = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = date.getDay();
  const order = weekday === 0 ? 7 : weekday;
  return SCHEDULE_WEEKDAYS.find((item) => item.order === order) || null;
};

const resolveScheduleWeekdayMeta = ({ weekdayKey, day, date }) => {
  const normalizedKey = normalizeScheduleWeekdayKey(weekdayKey);
  if (normalizedKey) return SCHEDULE_WEEKDAY_BY_KEY[normalizedKey] || null;
  const normalizedDayKey = normalizeScheduleWeekdayKey(day);
  if (normalizedDayKey) return SCHEDULE_WEEKDAY_BY_KEY[normalizedDayKey] || null;
  return getScheduleWeekdayMetaFromDate(date);
};

const normalizeScheduleExcludedDates = (value) => {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  value.forEach((item) => {
    const normalized = normalizeDayKey(typeof item === 'string' ? item.trim() : String(item || '').trim());
    if (normalized) unique.add(normalized);
  });
  return Array.from(unique).sort((left, right) => {
    const leftNum = dayKeyToNumber(left);
    const rightNum = dayKeyToNumber(right);
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum !== rightNum) {
      return leftNum - rightNum;
    }
    return left.localeCompare(right, 'ru');
  });
};

const buildStudentScheduleEntry = (payload = {}, options = {}) => {
  const existing = options?.existing && typeof options.existing === 'object' ? options.existing : null;
  const auth = options?.auth && typeof options.auth === 'object' ? options.auth : null;
  const rawDate = typeof payload?.date === 'string'
    ? payload.date.trim()
    : (typeof existing?.date === 'string' ? existing.date.trim() : '');
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return { error: 'Некорректная дата' };
  }

  const weekdayMeta = resolveScheduleWeekdayMeta({
    weekdayKey: payload?.weekdayKey ?? existing?.weekdayKey,
    day: payload?.day ?? existing?.day,
    date: rawDate,
  });
  const time = normalizeScheduleTime(payload?.time ?? existing?.time);
  const durationMinutes = normalizeScheduleDurationMinutes(
    payload?.durationMinutes ?? existing?.durationMinutes,
    existing?.durationMinutes
  );
  const excludedDates = rawDate
    ? []
    : normalizeScheduleExcludedDates(payload?.excludedDates ?? existing?.excludedDates);
  if (!weekdayMeta) {
    return { error: 'Выберите день занятия' };
  }
  if (!time) {
    return { error: 'Укажите время занятия' };
  }

  const subject = (() => {
    if (typeof payload?.subject === 'string' && payload.subject.trim()) return payload.subject.trim();
    if (typeof existing?.subject === 'string' && existing.subject.trim()) return existing.subject.trim();
    return 'Занятие';
  })();
  const note = typeof payload?.note === 'string'
    ? payload.note.trim()
    : (typeof existing?.note === 'string' ? existing.note.trim() : '');
  const boardLink = typeof payload?.boardLink === 'string'
    ? payload.boardLink.trim()
    : (typeof existing?.boardLink === 'string' ? existing.boardLink.trim() : '');
  const lessonLink = typeof payload?.lessonLink === 'string'
    ? payload.lessonLink.trim()
    : (typeof existing?.lessonLink === 'string' ? existing.lessonLink.trim() : '');
  const actorRole = String(auth?.role || '').trim() || null;
  const actorId = String(auth?.id || '').trim() || null;
  const actorName = typeof auth?.name === 'string' && auth.name.trim()
    ? auth.name.trim()
    : null;
  const nowIso = new Date().toISOString();

  return {
    entry: {
      id: existing?.id || crypto.randomUUID(),
      date: rawDate || null,
      day: weekdayMeta.label,
      weekdayKey: weekdayMeta.key,
      weekdayOrder: weekdayMeta.order,
      excludedDates,
      time,
      durationMinutes,
      subject,
      note,
      boardLink,
      lessonLink,
      createdAt: existing?.createdAt || nowIso,
      createdByRole: existing?.createdByRole || actorRole,
      createdById: existing?.createdById || actorId,
      createdByName: existing?.createdByName || actorName,
      updatedAt: nowIso,
    }
  };
};

const normalizeTeacherCalendarEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id) return null;
  const rawDate = typeof entry.date === 'string' ? entry.date.trim() : '';
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return null;
  const weekdayMeta = resolveScheduleWeekdayMeta({
    weekdayKey: entry?.weekdayKey,
    day: entry?.day,
    date: rawDate,
  });
  const time = normalizeScheduleTime(entry?.time);
  const durationMinutes = normalizeScheduleDurationMinutes(entry?.durationMinutes);
  const excludedDates = rawDate ? [] : normalizeScheduleExcludedDates(entry?.excludedDates);
  if (!weekdayMeta || !time) return null;
  const subject = typeof entry?.subject === 'string' && entry.subject.trim()
    ? entry.subject.trim()
    : TEACHER_TRIAL_STUDENT_FALLBACK_NAME;
  const note = typeof entry?.note === 'string' ? entry.note.trim() : '';
  const studentNameRaw = typeof entry?.studentName === 'string' ? entry.studentName.trim() : '';
  const studentName = studentNameRaw || subject || TEACHER_TRIAL_STUDENT_FALLBACK_NAME;
  return {
    ...entry,
    id,
    date: rawDate || null,
    day: weekdayMeta.label,
    weekdayKey: weekdayMeta.key,
    weekdayOrder: weekdayMeta.order,
    excludedDates,
    time,
    durationMinutes,
    subject,
    note,
    studentId: '',
    studentName,
    isTeacherSlot: true,
  };
};

const buildTeacherScheduleEntry = (payload = {}, options = {}) => {
  const existing = options?.existing && typeof options.existing === 'object' ? options.existing : null;
  const auth = options?.auth && typeof options.auth === 'object' ? options.auth : null;
  const rawDate = typeof payload?.date === 'string'
    ? payload.date.trim()
    : (typeof existing?.date === 'string' ? existing.date.trim() : '');
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return { error: 'Некорректная дата' };
  }

  const weekdayMeta = resolveScheduleWeekdayMeta({
    weekdayKey: payload?.weekdayKey ?? existing?.weekdayKey,
    day: payload?.day ?? existing?.day,
    date: rawDate,
  });
  const time = normalizeScheduleTime(payload?.time ?? existing?.time);
  const durationMinutes = normalizeScheduleDurationMinutes(
    payload?.durationMinutes ?? existing?.durationMinutes,
    existing?.durationMinutes
  );
  const excludedDates = rawDate
    ? []
    : normalizeScheduleExcludedDates(payload?.excludedDates ?? existing?.excludedDates);
  if (!weekdayMeta) {
    return { error: 'Выберите день занятия' };
  }
  if (!time) {
    return { error: 'Укажите время занятия' };
  }

  const subject = (() => {
    if (typeof payload?.subject === 'string' && payload.subject.trim()) return payload.subject.trim();
    if (typeof existing?.subject === 'string' && existing.subject.trim()) return existing.subject.trim();
    return TEACHER_TRIAL_STUDENT_FALLBACK_NAME;
  })();
  const note = typeof payload?.note === 'string'
    ? payload.note.trim()
    : (typeof existing?.note === 'string' ? existing.note.trim() : '');
  const studentNameRaw = typeof payload?.studentName === 'string'
    ? payload.studentName.trim()
    : (typeof existing?.studentName === 'string' ? existing.studentName.trim() : '');
  const studentName = studentNameRaw || subject || TEACHER_TRIAL_STUDENT_FALLBACK_NAME;
  const actorRole = String(auth?.role || '').trim() || null;
  const actorId = String(auth?.id || '').trim() || null;
  const actorName = typeof auth?.name === 'string' && auth.name.trim()
    ? auth.name.trim()
    : null;
  const nowIso = new Date().toISOString();

  return {
    entry: {
      id: existing?.id || crypto.randomUUID(),
      date: rawDate || null,
      day: weekdayMeta.label,
      weekdayKey: weekdayMeta.key,
      weekdayOrder: weekdayMeta.order,
      excludedDates,
      time,
      durationMinutes,
      subject,
      note,
      studentId: '',
      studentName,
      isTeacherSlot: true,
      createdAt: existing?.createdAt || nowIso,
      createdByRole: existing?.createdByRole || actorRole,
      createdById: existing?.createdById || actorId,
      createdByName: existing?.createdByName || actorName,
      updatedAt: nowIso,
    }
  };
};

const GOOGLE_CALENDAR_SYNC_CACHE_TTL_MS = 60 * 1000;
const GOOGLE_CALENDAR_SYNC_FETCH_TIMEOUT_MS = 12000;
const GOOGLE_CALENDAR_SYNC_LOOKBACK_DAYS = 14;
const GOOGLE_CALENDAR_SYNC_LOOKAHEAD_DAYS = 120;
const GOOGLE_CALENDAR_SYNC_TIME_ZONE = String(
  process.env.PLATFORM_CALENDAR_TIME_ZONE || process.env.TZ || 'Europe/Moscow'
).trim() || 'Europe/Moscow';
const teacherCalendarSyncCache = new Map();

const normalizeTeacherCalendarSyncUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = raw.toLowerCase().startsWith('webcal://')
    ? `https://${raw.slice('webcal://'.length)}`
    : raw;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString();
  } catch {
    return '';
  }
};

const normalizeTeacherCalendarSyncSettings = (value) => {
  const icalUrl = normalizeTeacherCalendarSyncUrl(value?.icalUrl);
  return {
    enabled: Boolean(value?.enabled) && Boolean(icalUrl),
    icalUrl,
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : '',
    lastFetchedAt: typeof value?.lastFetchedAt === 'string' ? value.lastFetchedAt : '',
    lastError: typeof value?.lastError === 'string' ? value.lastError : '',
    calendarName: typeof value?.calendarName === 'string' ? value.calendarName.trim() : '',
  };
};

const getTeacherCalendarSyncSettings = (teacherId) => {
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return normalizeTeacherCalendarSyncSettings(null);
  const db = readTeacherCalendarSyncDb();
  return normalizeTeacherCalendarSyncSettings(db[normalizedTeacherId]);
};

const maskCalendarSyncUrl = (value) => {
  const normalized = normalizeTeacherCalendarSyncUrl(value);
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    return `${url.protocol}//${url.hostname}${url.pathname ? '/...' : ''}`;
  } catch {
    return 'подключена';
  }
};

const buildTeacherCalendarSyncSettingsResponse = (settings) => ({
  enabled: Boolean(settings?.enabled && settings?.icalUrl),
  configured: Boolean(settings?.icalUrl),
  maskedUrl: maskCalendarSyncUrl(settings?.icalUrl),
  updatedAt: settings?.updatedAt || '',
  lastFetchedAt: settings?.lastFetchedAt || '',
  lastError: settings?.lastError || '',
  calendarName: settings?.calendarName || '',
});

const setTeacherCalendarSyncSettings = (teacherId, patch = {}) => {
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return normalizeTeacherCalendarSyncSettings(null);
  const db = readTeacherCalendarSyncDb();
  const current = normalizeTeacherCalendarSyncSettings(db[normalizedTeacherId]);
  const hasUrlPatch = Object.prototype.hasOwnProperty.call(patch, 'icalUrl');
  const nextUrl = hasUrlPatch
    ? normalizeTeacherCalendarSyncUrl(patch.icalUrl)
    : current.icalUrl;
  const next = normalizeTeacherCalendarSyncSettings({
    ...current,
    ...patch,
    icalUrl: nextUrl,
    enabled: Object.prototype.hasOwnProperty.call(patch, 'enabled')
      ? patch.enabled
      : current.enabled,
    updatedAt: new Date().toISOString(),
  });
  if (!next.icalUrl) {
    delete db[normalizedTeacherId];
  } else {
    db[normalizedTeacherId] = next;
  }
  writeTeacherCalendarSyncDb(db);
  teacherCalendarSyncCache.delete(normalizedTeacherId);
  return next;
};

const updateTeacherCalendarSyncStatus = (teacherId, patch = {}) => {
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return normalizeTeacherCalendarSyncSettings(null);
  const db = readTeacherCalendarSyncDb();
  const current = normalizeTeacherCalendarSyncSettings(db[normalizedTeacherId]);
  if (!current.icalUrl) return current;
  const next = normalizeTeacherCalendarSyncSettings({
    ...current,
    ...patch,
  });
  db[normalizedTeacherId] = next;
  writeTeacherCalendarSyncDb(db);
  return next;
};

const getDatePartsInCalendarTimeZone = (date) => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: GOOGLE_CALENDAR_SYNC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(value).reduce((acc, part) => {
    if (part?.type && part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return null;
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

const extractFirstHttpUrl = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const match = text.match(/https?:\/\/[^\s<>"')]+/i);
    if (match?.[0]) return match[0].replace(/[.,;]+$/, '');
  }
  return '';
};

const normalizeCalendarEventText = (value) => String(value || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^0-9a-zа-я]+/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const calendarEventTextIncludesName = (haystack, name) => {
  const normalizedHaystack = normalizeCalendarEventText(haystack);
  const normalizedName = normalizeCalendarEventText(name);
  if (!normalizedHaystack || normalizedName.length < 2) return false;
  if (normalizedHaystack === normalizedName) return true;
  return ` ${normalizedHaystack} `.includes(` ${normalizedName} `);
};

const getGoogleCalendarStudentMatchNames = (student) => {
  const values = [
    student?.nickname,
    student?.studentNickname,
    student?.name,
    student?.mainName,
    student?.studentName,
    student?.displayName,
    student?.publicName,
  ];
  return Array.from(new Set(
    values
      .map((value) => normalizeCalendarEventText(value))
      .filter((value) => value.length >= 2)
  ));
};

const resolveGoogleCalendarStudentMatch = (event, students = []) => {
  const summary = normalizeCalendarEventText(event?.summary);
  const description = normalizeCalendarEventText(event?.description);
  const location = normalizeCalendarEventText(event?.location);
  const haystack = `${summary} ${description} ${location}`;
  if (!haystack.trim()) return null;
  const candidates = (Array.isArray(students) ? students : [])
    .filter((student) => student && !student.deletedAt)
    .flatMap((student) => (
      getGoogleCalendarStudentMatchNames(student).map((name) => ({ student, name }))
    ))
    .sort((left, right) => right.name.length - left.name.length);
  return candidates.find((item) => calendarEventTextIncludesName(haystack, item.name))?.student || null;
};

const buildGoogleCalendarScheduleEntry = (event, teacherId, students = []) => {
  if (!event || event.type !== 'VEVENT') return null;
  if (String(event.status || '').trim().toUpperCase() === 'CANCELLED') return null;
  if (!event.start || !event.end) return null;
  if (event.isFullDay || event.start?.dateOnly) return null;
  const start = event.start instanceof Date ? event.start : new Date(event.start);
  const end = event.end instanceof Date ? event.end : new Date(event.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const durationMinutes = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000) || DEFAULT_SCHEDULE_DURATION_MINUTES);
  const startParts = getDatePartsInCalendarTimeZone(start);
  if (!startParts?.dayKey || !startParts?.time) return null;
  const weekdayMeta = getScheduleWeekdayMetaFromDate(startParts.dayKey);
  if (!weekdayMeta) return null;
  const summary = String(event.summary || '').trim() || 'Google Calendar';
  const matchedStudent = resolveGoogleCalendarStudentMatch(event, students);
  const studentId = matchedStudent?.id ? String(matchedStudent.id) : '';
  const studentName = matchedStudent?.name || summary;
  const externalId = String(event.uid || event.id || `${summary}-${start.toISOString()}`).trim();
  const instanceId = crypto
    .createHash('sha1')
    .update(`${teacherId}:${externalId}:${start.toISOString()}`)
    .digest('hex')
    .slice(0, 18);
  const lessonLink = extractFirstHttpUrl(event.location, event.description, event.url);
  return {
    id: `google-ical-${instanceId}`,
    date: startParts.dayKey,
    day: weekdayMeta.label,
    weekdayKey: weekdayMeta.key,
    weekdayOrder: weekdayMeta.order,
    excludedDates: [],
    time: startParts.time,
    durationMinutes,
    subject: summary,
    note: String(event.description || '').trim(),
    boardLink: '',
    lessonLink,
    studentId,
    studentName,
    isTeacherSlot: !studentId,
    isExternalCalendarEvent: true,
    source: 'google-ical',
    externalCalendarProvider: 'Google Calendar',
    externalEventId: externalId,
    externalCalendarName: String(event.calendarName || '').trim(),
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  };
};

const extractGoogleCalendarName = (parsed) => {
  const calendar = Object.values(parsed || {}).find((entry) => entry?.type === 'VCALENDAR');
  return String(calendar?.['WR-CALNAME'] || calendar?.calendarName || '').trim();
};

const fetchTeacherGoogleCalendarEntries = async (teacherId, options = {}) => {
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return [];
  const settings = getTeacherCalendarSyncSettings(normalizedTeacherId);
  if (!settings.enabled || !settings.icalUrl) return [];
  const force = Boolean(options.force);
  const now = Date.now();
  const cache = teacherCalendarSyncCache.get(normalizedTeacherId);
  if (!force && cache && cache.url === settings.icalUrl && now - cache.loadedAtMs < GOOGLE_CALENDAR_SYNC_CACHE_TTL_MS) {
    return cache.entries;
  }

  const from = new Date(now - (GOOGLE_CALENDAR_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
  const to = new Date(now + (GOOGLE_CALENDAR_SYNC_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000));
  const students = readStudentsDb().filter((student) => String(student?.teacherId || '').trim() === normalizedTeacherId);
  const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId = null;
  if (abortController) {
    timeoutId = setTimeout(() => abortController.abort(), GOOGLE_CALENDAR_SYNC_FETCH_TIMEOUT_MS);
    if (typeof timeoutId.unref === 'function') timeoutId.unref();
  }

  try {
    const parsed = await nodeIcal.async.fromURL(settings.icalUrl, {
      headers: { 'User-Agent': 'Ivan-EGE-Calendar-Sync/1.0' },
      ...(abortController ? { signal: abortController.signal } : {}),
    });
    const calendarName = extractGoogleCalendarName(parsed);
    const entries = [];
    Object.values(parsed || {}).forEach((event) => {
      if (!event || event.type !== 'VEVENT') return;
      const instances = event.rrule
        ? nodeIcal.expandRecurringEvent(event, { from, to, expandOngoing: true })
        : [event];
      instances.forEach((instance) => {
        const scheduleEntry = buildGoogleCalendarScheduleEntry(
          { ...event, ...instance, calendarName },
          normalizedTeacherId,
          students
        );
        if (!scheduleEntry) return;
        const startMs = Date.parse(`${scheduleEntry.date}T${scheduleEntry.time}:00`);
        if (Number.isFinite(startMs) && (startMs < from.getTime() || startMs > to.getTime())) return;
        entries.push(scheduleEntry);
      });
    });
    const uniqueEntries = Array.from(
      new Map(entries.map((entry) => [entry.id, entry])).values()
    ).sort((left, right) => {
      const leftTime = Date.parse(`${left.date}T${left.time}:00`);
      const rightTime = Date.parse(`${right.date}T${right.time}:00`);
      return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
    });
    teacherCalendarSyncCache.set(normalizedTeacherId, {
      url: settings.icalUrl,
      loadedAtMs: now,
      entries: uniqueEntries,
    });
    updateTeacherCalendarSyncStatus(normalizedTeacherId, {
      lastFetchedAt: new Date().toISOString(),
      lastError: '',
      calendarName,
    });
    return uniqueEntries;
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Google Calendar не ответил вовремя.'
      : (error?.message || 'Не удалось загрузить Google Calendar.');
    updateTeacherCalendarSyncStatus(normalizedTeacherId, {
      lastFetchedAt: new Date().toISOString(),
      lastError: message,
    });
    if (options.throwOnError) throw new Error(message);
    return cache?.entries || [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getTeacherOwnedScheduleEntries = (teacherId) => {
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return [];
  const teacher = findTeacherById(normalizedTeacherId);
  if (!teacher) return [];
  const list = Array.isArray(teacher?.calendarSchedule) ? teacher.calendarSchedule : [];
  return list
    .map((entry) => normalizeTeacherCalendarEntry(entry))
    .filter(Boolean);
};

const getTeacherScheduleEntries = (teacherId, options = {}) => {
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return [];
  const includeDeletedStudents = Boolean(options.includeDeletedStudents);
  const students = readStudentsDb().filter((student) => {
    if (!student || String(student.teacherId || '').trim() !== normalizedTeacherId) return false;
    if (!includeDeletedStudents && student.deletedAt) return false;
    return true;
  });
  const entries = [];
  students.forEach((student) => {
    const studentData = getStudentData(student.id);
    const schedule = Array.isArray(studentData?.schedule) ? studentData.schedule : [];
    schedule.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const rawDate = typeof entry?.date === 'string' ? entry.date.trim() : '';
      if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return;
      const weekdayMeta = resolveScheduleWeekdayMeta({
        weekdayKey: entry?.weekdayKey,
        day: entry?.day,
        date: rawDate,
      });
      const time = normalizeScheduleTime(entry?.time);
      if (!weekdayMeta || !time) return;
      const excludedDates = rawDate ? [] : normalizeScheduleExcludedDates(entry?.excludedDates);
      entries.push({
        ...entry,
        date: rawDate || null,
        day: weekdayMeta.label,
        weekdayKey: weekdayMeta.key,
        weekdayOrder: weekdayMeta.order,
        excludedDates,
        time,
        studentId: student.id,
        studentName: student.name || 'Ученик',
      });
    });
  });
  entries.push(...getTeacherOwnedScheduleEntries(normalizedTeacherId));

  entries.sort((left, right) => {
    const leftOrder = Number(left?.weekdayOrder) || 99;
    const rightOrder = Number(right?.weekdayOrder) || 99;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    const leftTime = String(left?.time || '');
    const rightTime = String(right?.time || '');
    const timeDiff = leftTime.localeCompare(rightTime, 'ru');
    if (timeDiff !== 0) return timeDiff;
    const leftStudent = String(left?.studentName || '');
    const rightStudent = String(right?.studentName || '');
    return leftStudent.localeCompare(rightStudent, 'ru');
  });

  return entries;
};

const normalizeTaskNumber = (value) => {
  const taskNumber = Number(value);
  if (!Number.isFinite(taskNumber)) return NaN;
  return taskNumber;
};

const isLessonSharedCategory = (value) => String(value || '').trim() === 'class';

const buildLessonSharedFolderId = (teacherId, taskNumber) => {
  const normalizedTeacherId = normalizeTeacherId(teacherId);
  const normalizedTaskNumber = normalizeTaskNumber(taskNumber);
  if (!normalizedTeacherId || !Number.isFinite(normalizedTaskNumber)) return '';
  return `${LESSON_SHARED_STUDENT_ID_PREFIX}:${normalizedTeacherId}:${normalizedTaskNumber}`;
};

const buildLessonSharedStudentId = (teacherId) => {
  const normalizedTeacherId = normalizeTeacherId(teacherId);
  if (!normalizedTeacherId) return '';
  return `${LESSON_SHARED_STUDENT_ID_PREFIX}:${normalizedTeacherId}`;
};

const extractTeacherIdFromLessonSharedStudentId = (studentId) => {
  const value = String(studentId || '').trim();
  const prefix = `${LESSON_SHARED_STUDENT_ID_PREFIX}:`;
  if (!value.startsWith(prefix)) return '';
  return normalizeTeacherId(value.slice(prefix.length));
};

const createLessonSharedFolderEntry = (teacherId, taskNumber) => {
  const normalizedTeacherId = normalizeTeacherId(teacherId);
  const normalizedTaskNumber = normalizeTaskNumber(taskNumber);
  if (!normalizedTeacherId || !Number.isFinite(normalizedTaskNumber)) return null;
  return {
    id: buildLessonSharedFolderId(normalizedTeacherId, normalizedTaskNumber),
    studentId: buildLessonSharedStudentId(normalizedTeacherId),
    teacherId: normalizedTeacherId,
    taskNumber: normalizedTaskNumber,
    category: 'class',
    name: LESSON_SHARED_FOLDER_NAME,
    date: '',
    isLessonShared: true,
    isSystem: true,
  };
};

const isLessonSharedFile = (entry) => (
  entry?.sharedScope === LESSON_SHARED_SCOPE
);

const isLessonSharedFolderEntry = (entry) => (
  entry?.sharedScope === LESSON_SHARED_SCOPE || entry?.isLessonShared === true
);

const canReadLessonSharedByTeacher = (auth, teacherId) => {
  const normalizedTeacherId = normalizeTeacherId(teacherId);
  if (!normalizedTeacherId || !auth) return false;
  if (isAdminRole(auth)) return true;
  if (isTeacherRole(auth)) return String(auth.id || '').trim() === normalizedTeacherId;
  if (isStudentRole(auth)) return String(auth.teacherId || '').trim() === normalizedTeacherId;
  return false;
};

const canWriteLessonSharedByTeacher = (auth, teacherId) => {
  const normalizedTeacherId = normalizeTeacherId(teacherId);
  if (!normalizedTeacherId || !auth) return false;
  if (isAdminRole(auth)) return true;
  if (isTeacherRole(auth)) return String(auth.id || '').trim() === normalizedTeacherId;
  return false;
};

const isLessonSharedFolderIdForTeacher = (folderId, teacherId, taskNumber) => {
  const expectedId = buildLessonSharedFolderId(teacherId, taskNumber);
  if (!expectedId) return false;
  return String(folderId || '').trim() === expectedId;
};

const normalizeParentFolderId = (value) => {
  const id = typeof value === 'string' ? value.trim() : '';
  return id || null;
};

const buildFoldersMapById = (folders) => {
  const map = new Map();
  const list = Array.isArray(folders) ? folders : [];
  list.forEach((folder) => {
    const id = String(folder?.id || '').trim();
    if (!id || map.has(id)) return;
    map.set(id, folder);
  });
  return map;
};

const normalizeFolderPathSegment = (value) => {
  const text = typeof value === 'string' ? value.replace(/\0/g, '').trim() : '';
  if (!text) return '';
  return text.replace(/[\\/]+/g, ' ');
};

const buildFolderPathResolver = (foldersById) => {
  const cache = new Map();
  const resolve = (folderId, visited = new Set()) => {
    const normalizedFolderId = normalizeParentFolderId(folderId);
    if (!normalizedFolderId) return '';
    if (cache.has(normalizedFolderId)) return cache.get(normalizedFolderId) || '';
    if (visited.has(normalizedFolderId)) return '';
    const folder = foldersById.get(normalizedFolderId);
    if (!folder) {
      cache.set(normalizedFolderId, '');
      return '';
    }
    const folderName = normalizeFolderPathSegment(folder?.name);
    if (!folderName) {
      cache.set(normalizedFolderId, '');
      return '';
    }
    const nextVisited = new Set(visited);
    nextVisited.add(normalizedFolderId);
    const parentPath = resolve(folder?.parentFolderId, nextVisited);
    const resultPath = parentPath ? `${parentPath}/${folderName}` : folderName;
    cache.set(normalizedFolderId, resultPath);
    return resultPath;
  };
  return resolve;
};

const enrichFilesWithFolderPath = (files, folders) => {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return [];
  const foldersById = buildFoldersMapById(folders);
  list.forEach((file) => {
    if (!isLessonSharedFile(file)) return;
    const teacherId = normalizeTeacherId(file?.teacherId);
    const taskNumber = normalizeTaskNumber(file?.taskNumber);
    const sharedRootFolder = createLessonSharedFolderEntry(teacherId, taskNumber);
    const sharedRootId = String(sharedRootFolder?.id || '').trim();
    if (!sharedRootId || foldersById.has(sharedRootId)) return;
    foldersById.set(sharedRootId, sharedRootFolder);
  });
  const resolveFolderPath = buildFolderPathResolver(foldersById);
  return list.map((file) => {
    const folderPath = resolveFolderPath(file?.folderId);
    if ((file?.folderPath || '') === folderPath) return file;
    return {
      ...file,
      folderPath,
    };
  });
};

const collectFolderSubtreeIds = (folders, startFolderId) => {
  const rootId = String(startFolderId || '').trim();
  if (!rootId) return new Set();
  const childrenByParent = new Map();
  const list = Array.isArray(folders) ? folders : [];
  list.forEach((folder) => {
    const folderId = String(folder?.id || '').trim();
    if (!folderId) return;
    const parentId = normalizeParentFolderId(folder?.parentFolderId);
    if (!parentId) return;
    const bucket = childrenByParent.get(parentId) || [];
    bucket.push(folderId);
    childrenByParent.set(parentId, bucket);
  });
  const result = new Set();
  const stack = [rootId];
  while (stack.length > 0) {
    const cursorId = stack.pop();
    if (!cursorId || result.has(cursorId)) continue;
    result.add(cursorId);
    const children = childrenByParent.get(cursorId) || [];
    children.forEach((childId) => {
      if (!result.has(childId)) stack.push(childId);
    });
  }
  return result;
};

const isFolderInLessonSharedTree = (foldersById, folder, teacherId, taskNumber) => {
  if (!folder || typeof folder !== 'object') return false;
  const sharedRootId = buildLessonSharedFolderId(teacherId, taskNumber);
  const visited = new Set();
  let cursor = folder;
  while (cursor && typeof cursor === 'object') {
    const cursorId = String(cursor.id || '').trim();
    if (cursor?.isLessonShared === true) return true;
    if (sharedRootId && cursorId === sharedRootId) return true;
    const parentId = normalizeParentFolderId(cursor.parentFolderId);
    if (!parentId || visited.has(parentId)) return false;
    if (sharedRootId && parentId === sharedRootId) return true;
    visited.add(parentId);
    cursor = foldersById.get(parentId) || null;
  }
  return false;
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
  return normalized;
};

const normalizeTeacherSolvedEventsReadBefore = (value) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(Math.floor(value)).toISOString();
  }
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return new Date(parsed).toISOString();
};

const getTeacherSolvedEventsReadBeforeMs = (teacher) => {
  const iso = normalizeTeacherSolvedEventsReadBefore(teacher?.solvedEventsReadBefore);
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
};

const trimTeacherSolvedEventIds = (eventIds, limit) => {
  const list = Array.isArray(eventIds) ? eventIds : [];
  const cap = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : TEACHER_SOLVED_EVENTS_READ_BASE_LIMIT;
  if (list.length <= cap) return list;
  return list.slice(list.length - cap);
};

const getTeacherSolvedEventsReadLimit = (teacherId, knownActiveStudentsCount = null) => {
  const normalizedTeacherId = String(teacherId || '').trim();
  if (!normalizedTeacherId) return TEACHER_SOLVED_EVENTS_READ_BASE_LIMIT;
  const hasKnownCount = Number.isFinite(Number(knownActiveStudentsCount)) && Number(knownActiveStudentsCount) >= 0;
  const activeStudentsCount = hasKnownCount
    ? Math.floor(Number(knownActiveStudentsCount))
    : readStudentsDb().reduce((count, student) => {
      if (!student || student.deletedAt) return count;
      const ownerTeacherId = String(student.teacherId || '').trim();
      return ownerTeacherId === normalizedTeacherId ? count + 1 : count;
    }, 0);
  const dynamicLimit = activeStudentsCount > 0
    ? (activeStudentsCount * STUDENT_SOLVED_EVENTS_LIMIT) + STUDENT_SOLVED_EVENTS_LIMIT
    : TEACHER_SOLVED_EVENTS_READ_BASE_LIMIT;
  const cappedDynamicLimit = Math.min(dynamicLimit, TEACHER_SOLVED_EVENTS_READ_HARD_LIMIT);
  return Math.max(TEACHER_SOLVED_EVENTS_READ_BASE_LIMIT, cappedDynamicLimit);
};

const getTeacherSolvedEventReadIdSet = (teacher, knownActiveStudentsCount = null) => (
  new Set(
    trimTeacherSolvedEventIds(
      normalizeTeacherSolvedEventIds(teacher?.readSolvedEventIds),
      getTeacherSolvedEventsReadLimit(teacher?.id, knownActiveStudentsCount)
    )
  )
);

const markTeacherSolvedEventsRead = (teacherId, eventIds = []) => {
  const id = String(teacherId || '').trim();
  if (!id) return null;
  const incoming = normalizeTeacherSolvedEventIds(eventIds);
  if (incoming.length === 0) return null;

  const teachers = readTeachersDb();
  const idx = teachers.findIndex((entry) => entry.id === id);
  if (idx === -1) return null;

  const limit = getTeacherSolvedEventsReadLimit(id);
  const normalizedStored = normalizeTeacherSolvedEventIds(teachers[idx]?.readSolvedEventIds);
  const current = trimTeacherSolvedEventIds(normalizedStored, limit);
  const seen = new Set(current);
  let changed = !Array.isArray(teachers[idx]?.readSolvedEventIds) || normalizedStored.length !== current.length;

  incoming.forEach((eventId) => {
    if (seen.has(eventId)) return;
    seen.add(eventId);
    current.push(eventId);
    changed = true;
  });

  const nextReadIds = trimTeacherSolvedEventIds(current, limit);
  if (nextReadIds.length !== current.length) {
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

const markTeacherSolvedEventsReadAll = (teacherId, beforeMs = Date.now()) => {
  const id = String(teacherId || '').trim();
  if (!id) return null;

  const teachers = readTeachersDb();
  const idx = teachers.findIndex((entry) => entry.id === id);
  if (idx === -1) return null;

  const currentBeforeMs = getTeacherSolvedEventsReadBeforeMs(teachers[idx]);
  const parsedBeforeMs = Number(beforeMs);
  const safeBeforeMs = Number.isFinite(parsedBeforeMs) && parsedBeforeMs > 0
    ? Math.floor(parsedBeforeMs)
    : Date.now();
  const nextBeforeMs = Math.max(currentBeforeMs, safeBeforeMs);
  const nextBeforeIso = new Date(nextBeforeMs).toISOString();
  const normalizedReadIds = normalizeTeacherSolvedEventIds(teachers[idx]?.readSolvedEventIds);
  const shouldResetReadIds = normalizedReadIds.length > 0 || !Array.isArray(teachers[idx]?.readSolvedEventIds);
  const currentBeforeIso = normalizeTeacherSolvedEventsReadBefore(teachers[idx]?.solvedEventsReadBefore);
  const shouldUpdateBefore = currentBeforeIso !== nextBeforeIso;
  if (!shouldResetReadIds && !shouldUpdateBefore) {
    return {
      ...teachers[idx],
      readSolvedEventIds: normalizedReadIds,
      solvedEventsReadBefore: currentBeforeIso,
    };
  }

  const updatedTeacher = {
    ...teachers[idx],
    readSolvedEventIds: [],
    solvedEventsReadBefore: nextBeforeIso,
  };
  teachers[idx] = updatedTeacher;
  writeTeachersDb(teachers);
  return updatedTeacher;
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

const getPythonCoinReward = (taskNumber) => {
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) return 0;
  const lastIndex = PYTHON_COIN_TASK_ORDER.length - 1;
  if (lastIndex <= 0) return PYTHON_COIN_MIN_REWARD;
  let orderIndex = PYTHON_COIN_TASK_ORDER.findIndex((value) => value >= taskNum);
  if (orderIndex < 0) orderIndex = lastIndex;
  const progress = orderIndex / lastIndex;
  return Math.round(
    PYTHON_COIN_MIN_REWARD
    + ((PYTHON_COIN_MAX_REWARD - PYTHON_COIN_MIN_REWARD) * progress)
  );
};

const getSolveCoinReward = (_taskNumber, levelId) => (
  String(levelId || '').trim() === PYTHON_LEVEL_ID ? getPythonCoinReward(_taskNumber) : 0
);

const normalizeXpTotal = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
};

const normalizeStudentXpBalanceVersion = (value) => {
  const version = Number(value);
  if (!Number.isFinite(version) || version <= 0) return 0;
  return Math.floor(version);
};

const normalizeStudentRecentXpRebalanceVersion = (value) => {
  const version = Number(value);
  if (!Number.isFinite(version) || version <= 0) return 0;
  return Math.floor(version);
};

const normalizeAlexanderWeekStartXpFixVersion = (value) => {
  const version = Number(value);
  if (!Number.isFinite(version) || version <= 0) return 0;
  return Math.floor(version);
};

const normalizeCoinsTotal = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
};

const normalizeCoinsSpentTotal = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
};

const normalizeArtifactId = (value) => {
  const id = String(value || '').trim();
  return ARTIFACT_CATALOG_BY_ID.has(id) ? id : '';
};

const normalizeArtifactInventory = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = {};
  Object.entries(value).forEach(([rawId, rawCount]) => {
    const id = normalizeArtifactId(rawId);
    if (!id) return;
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count <= 0) return;
    next[id] = Math.floor(count);
  });
  return next;
};

const normalizeArtifactLevels = (value, inventory = {}) => {
  const safeInventory = normalizeArtifactInventory(inventory);
  const next = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([rawId, rawLevel]) => {
      const id = normalizeArtifactId(rawId);
      if (!id) return;
      const level = Number(rawLevel);
      if (!Number.isFinite(level) || level <= 0) return;
      next[id] = Math.min(ARTIFACT_MAX_LEVEL, Math.max(1, Math.floor(level)));
    });
  }
  Object.entries(safeInventory).forEach(([id, count]) => {
    if (count > 0 && !next[id]) next[id] = 1;
  });
  return next;
};

const normalizeArtifactCards = (value, inventory = {}) => {
  const fallbackCards = normalizeArtifactInventory(inventory);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallbackCards;
  return normalizeArtifactInventory(value);
};

const normalizeArtifactLastPull = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = normalizeArtifactId(value.id || value.artifactId);
  if (!id) return null;
  const pulledAtRaw = typeof value.pulledAt === 'string' ? value.pulledAt.trim() : '';
  const pulledAt = pulledAtRaw && !Number.isNaN(Date.parse(pulledAtRaw))
    ? new Date(pulledAtRaw).toISOString()
    : null;
  const maxLevelDuplicateCoins = normalizeCoinsTotal(value.maxLevelDuplicateCoins);
  return {
    id,
    pulledAt,
    ...(maxLevelDuplicateCoins > 0 ? { maxLevelDuplicateCoins } : {}),
  };
};

const normalizeArtifactTotalPulls = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
};

const normalizeProfileThemeId = (value) => {
  const id = String(value || '').trim();
  return PROFILE_THEME_CATALOG_BY_ID.has(id) ? id : '';
};

const normalizeProfileThemeInventory = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = {};
  Object.entries(value).forEach(([rawId, rawCount]) => {
    const id = normalizeProfileThemeId(rawId);
    if (!id) return;
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count <= 0) return;
    next[id] = Math.floor(count);
  });
  return next;
};

const getProfileThemeInventoryCount = (inventory = {}, themeId) => (
  Math.max(0, Math.floor(Number(inventory?.[themeId]) || 0))
);

const normalizeActiveProfileThemeId = (value, inventory = {}) => {
  const id = normalizeProfileThemeId(value);
  if (!id) return '';
  const safeInventory = normalizeProfileThemeInventory(inventory);
  return getProfileThemeInventoryCount(safeInventory, id) > 0 ? id : '';
};

const getProfileThemeRarityRank = (rarity) => {
  const normalized = String(rarity || 'common').trim().toLowerCase();
  const index = PROFILE_THEME_RARITY_ORDER.indexOf(normalized);
  return index >= 0 ? PROFILE_THEME_RARITY_ORDER.length - index : 0;
};

const isProfileThemeUpgrade = (nextThemeId, currentThemeId) => {
  const nextTheme = PROFILE_THEME_CATALOG_BY_ID.get(normalizeProfileThemeId(nextThemeId));
  if (!nextTheme) return false;
  const currentTheme = PROFILE_THEME_CATALOG_BY_ID.get(normalizeProfileThemeId(currentThemeId));
  if (!currentTheme) return true;
  return getProfileThemeRarityRank(nextTheme.rarity) > getProfileThemeRarityRank(currentTheme.rarity);
};

const buildProfileThemePayload = (themeId, inventory = null) => {
  const id = normalizeProfileThemeId(themeId);
  if (!id) return null;
  if (inventory && getProfileThemeInventoryCount(normalizeProfileThemeInventory(inventory), id) <= 0) return null;
  const theme = PROFILE_THEME_CATALOG_BY_ID.get(id);
  if (!theme) return null;
  return {
    id: theme.id,
    rarity: String(theme.rarity || 'common').trim().toLowerCase() || 'common',
    name: String(theme.name || theme.id).trim() || theme.id,
    shortName: String(theme.shortName || theme.name || theme.id).trim() || theme.id,
    description: typeof theme.description === 'string' ? theme.description : '',
    accent: typeof theme.accent === 'string' ? theme.accent : '',
  };
};

const buildProfileThemeCollectionPayload = (inventory = {}, activeThemeId = '') => {
  const safeInventory = normalizeProfileThemeInventory(inventory);
  const activeId = normalizeActiveProfileThemeId(activeThemeId, safeInventory);
  const unlocked = Object.entries(safeInventory)
    .map(([themeId, count]) => {
      const payload = buildProfileThemePayload(themeId);
      if (!payload) return null;
      return {
        ...payload,
        count: getProfileThemeInventoryCount(safeInventory, themeId),
        active: themeId === activeId,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      getProfileThemeRarityRank(right.rarity) - getProfileThemeRarityRank(left.rarity)
      || String(left.name || '').localeCompare(String(right.name || ''), 'ru')
    ));
  return {
    active: buildProfileThemePayload(activeId),
    unlocked,
    totalOwned: Object.values(safeInventory).reduce((sum, count) => (
      sum + Math.max(0, Math.floor(Number(count) || 0))
    ), 0),
    uniqueOwned: unlocked.length,
  };
};

const rollProfileThemeRarity = (randomValue = Math.random(), chances = PROFILE_THEME_RARITY_CHANCES) => {
  const safeChances = (Array.isArray(chances) ? chances : PROFILE_THEME_RARITY_CHANCES)
    .filter((entry) => entry && PROFILE_THEME_RARITY_ORDER.includes(entry.rarity) && Number(entry.chance) > 0);
  const totalChance = safeChances.reduce((sum, entry) => sum + Number(entry.chance), 0);
  if (totalChance <= 0) return 'common';
  const target = Number(randomValue) * totalChance;
  let cursor = 0;
  for (const entry of safeChances) {
    cursor += Number(entry.chance);
    if (target < cursor) return entry.rarity;
  }
  return safeChances[safeChances.length - 1]?.rarity || 'common';
};

const rollProfileThemeReward = () => {
  if (PROFILE_THEME_CATALOG.length <= 0) return null;
  const availableIdsByRarity = new Map();
  PROFILE_THEME_RARITY_ORDER.forEach((rarity) => {
    const ids = PROFILE_THEME_IDS_BY_RARITY.get(rarity) || [];
    if (ids.length > 0) availableIdsByRarity.set(rarity, ids);
  });
  const availableChances = PROFILE_THEME_RARITY_CHANCES.filter((entry) => (
    (availableIdsByRarity.get(entry.rarity) || []).length > 0
  ));
  const rarity = rollProfileThemeRarity(Math.random(), availableChances);
  const rarityIds = availableIdsByRarity.get(rarity) || [];
  const fallbackIds = PROFILE_THEME_CATALOG.map((theme) => theme.id).filter(Boolean);
  const sourceIds = rarityIds.length > 0 ? rarityIds : fallbackIds;
  const themeId = sourceIds[Math.floor(Math.random() * sourceIds.length)];
  return PROFILE_THEME_CATALOG_BY_ID.get(themeId) || null;
};

const getProfileThemeDuplicateCoinReward = (theme) => {
  const rarity = String(theme?.rarity || 'common').trim().toLowerCase();
  return normalizeCoinsTotal(PROFILE_THEME_DUPLICATE_COIN_REWARDS[rarity]);
};

const buildProfileThemeRewardPayload = (themeId, inventory = {}, extra = {}) => {
  const payload = buildProfileThemePayload(themeId);
  if (!payload) return null;
  return {
    ...payload,
    type: 'profile-theme',
    count: getProfileThemeInventoryCount(inventory, payload.id),
    isNew: Boolean(extra.isNew),
    duplicateCoins: normalizeCoinsTotal(extra.duplicateCoins),
    source: typeof extra.source === 'string' ? extra.source : '',
  };
};

const getArtifactInventoryCount = (inventory = {}, artifactId) => (
  Math.max(0, Math.floor(Number(inventory?.[artifactId]) || 0))
);

const getArtifactLevel = (levels = {}, artifactId) => (
  Math.min(ARTIFACT_MAX_LEVEL, Math.max(0, Math.floor(Number(levels?.[artifactId]) || 0)))
);

const getArtifactXpLevelBonus = (artifactId, level, perLevelBonus = 0) => {
  const normalizedLevel = Math.min(ARTIFACT_MAX_LEVEL, Math.max(0, Math.floor(Number(level) || 0)));
  if (normalizedLevel <= 0) return 0;
  if (artifactId === 'krylov') return 0.4 + (0.1 * normalizedLevel);
  if (artifactId === 'tears') return 0.5 + (0.25 * normalizedLevel);
  return Math.max(0, Number(perLevelBonus) || 0) * normalizedLevel;
};

const getArtifactXpLevelMultiplier = (artifactId, level, perLevelBonus = 0) => (
  1 + getArtifactXpLevelBonus(artifactId, level, perLevelBonus)
);

const getArtifactMaxLevelDuplicateCoinReward = (artifact) => {
  const rank = String(artifact?.rank || '').trim().toUpperCase();
  return normalizeCoinsTotal(ARTIFACT_MAX_LEVEL_DUPLICATE_COIN_REWARDS[rank]);
};

const getArtifactUpgradeRequirement = (level) => (
  ARTIFACT_UPGRADE_REQUIREMENTS[Math.max(1, Math.floor(Number(level) || 1)) + 1] || null
);

const buildArtifactUpgradeState = ({ artifactId, levels = {}, cards = {}, coinsTotal = 0 } = {}) => {
  const id = normalizeArtifactId(artifactId);
  const level = getArtifactLevel(levels, id);
  const nextLevel = level + 1;
  const requirement = ARTIFACT_UPGRADE_REQUIREMENTS[nextLevel] || null;
  const cardsAvailable = getArtifactInventoryCount(cards, id);
  const normalizedCoinsTotal = normalizeCoinsTotal(coinsTotal);

  if (!id || level <= 0 || !requirement) {
    return {
      level,
      maxLevel: ARTIFACT_MAX_LEVEL,
      nextLevel: null,
      cardsRequired: 0,
      cardsAvailable,
      coinsRequired: 0,
      canUpgrade: false,
      isMaxLevel: level >= ARTIFACT_MAX_LEVEL,
    };
  }

  return {
    level,
    maxLevel: ARTIFACT_MAX_LEVEL,
    nextLevel,
    cardsRequired: requirement.cards,
    cardsAvailable,
    coinsRequired: requirement.coins,
    canUpgrade: cardsAvailable >= requirement.cards && normalizedCoinsTotal >= requirement.coins,
    isMaxLevel: false,
  };
};

const formatArtifactBonusPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 1) return '+0%';
  const percent = Math.round((numeric - 1) * 10000) / 100;
  return `+${percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
};

const getArtifactInstantRewardsFromInventory = (inventory = {}) => {
  const safeInventory = normalizeArtifactInventory(inventory);
  return Object.entries(ARTIFACT_INSTANT_REWARDS).reduce((acc, [artifactId, reward]) => {
    const count = getArtifactInventoryCount(safeInventory, artifactId);
    if (count <= 0) return acc;
    acc.xp += Math.max(0, Math.floor(Number(reward?.xp) || 0)) * count;
    acc.coins += Math.max(0, Math.floor(Number(reward?.coins) || 0)) * count;
    return acc;
  }, { xp: 0, coins: 0 });
};

const getArtifactInstantRewardForPull = (artifactId) => {
  const id = normalizeArtifactId(artifactId);
  if (!id) return { xp: 0, coins: 0 };
  const reward = ARTIFACT_INSTANT_REWARDS[id] || null;
  if (!reward) return { xp: 0, coins: 0 };
  return {
    xp: Math.max(0, Math.floor(Number(reward.xp) || 0)),
    coins: Math.max(0, Math.floor(Number(reward.coins) || 0)),
  };
};

const getArtifactSolveXpMultiplier = (artifactLevels = {}, taskNumber) => {
  const safeLevels = normalizeArtifactLevels(artifactLevels);
  const normalizedTask = normalizeClassicTaskForXp(taskNumber);
  let multiplier = 1;

  Object.entries(ARTIFACT_XP_GLOBAL_MULTIPLIERS).forEach(([artifactId, perCopyBonus]) => {
    const level = getArtifactLevel(safeLevels, artifactId);
    if (level <= 0) return;
    multiplier *= getArtifactXpLevelMultiplier(artifactId, level, perCopyBonus);
  });

  if (Number.isFinite(normalizedTask)) {
    Object.entries(ARTIFACT_XP_TASK_MULTIPLIERS).forEach(([artifactId, entry]) => {
      if (!Array.isArray(entry?.tasks) || !entry.tasks.includes(normalizedTask)) return;
      const level = getArtifactLevel(safeLevels, artifactId);
      if (level <= 0) return;
      multiplier *= getArtifactXpLevelMultiplier(artifactId, level, entry.perCopyBonus);
    });
  }

  return Math.max(1, multiplier);
};

const getArtifactSolveCoinMultiplier = (artifactLevels = {}) => {
  const safeLevels = normalizeArtifactLevels(artifactLevels);
  let multiplier = 1;

  Object.entries(ARTIFACT_COIN_GLOBAL_MULTIPLIERS).forEach(([artifactId, perCopyBonus]) => {
    const level = getArtifactLevel(safeLevels, artifactId);
    if (level <= 0) return;
    multiplier *= (1 + (perCopyBonus * level));
  });

  return Math.max(1, multiplier);
};

const applyArtifactXpBonus = (baseReward, artifactLevels = {}, taskNumber) => {
  const reward = Number(baseReward);
  if (!Number.isFinite(reward) || reward <= 0) return 0;
  return normalizeXpTotal(Math.round(reward * getArtifactSolveXpMultiplier(artifactLevels, taskNumber)));
};

const getArtifactRecentXpRebalanceLevelMultiplier = (
  artifactId,
  level,
  perLevelBonus = 0,
  balanceMode = 'current'
) => {
  const normalizedLevel = getArtifactLevel({ [artifactId]: level }, artifactId);
  if (normalizedLevel <= 0) return 1;
  if (balanceMode === 'pre-fix') {
    const oldBonus = RECENT_XP_REBALANCE_PRE_FIX_ARTIFACT_BONUSES[artifactId];
    if (Number.isFinite(Number(oldBonus)) && Number(oldBonus) > 0) {
      return 1 + Number(oldBonus);
    }
  }
  return getArtifactXpLevelMultiplier(artifactId, normalizedLevel, perLevelBonus);
};

const getArtifactRecentXpRebalanceMultiplier = (
  artifactLevels = {},
  taskNumber,
  balanceMode = 'current'
) => {
  const safeLevels = normalizeArtifactLevels(artifactLevels);
  const normalizedTask = normalizeClassicTaskForXp(taskNumber);
  let multiplier = 1;

  Object.entries(ARTIFACT_XP_GLOBAL_MULTIPLIERS).forEach(([artifactId, perCopyBonus]) => {
    const level = getArtifactLevel(safeLevels, artifactId);
    if (level <= 0) return;
    multiplier *= getArtifactRecentXpRebalanceLevelMultiplier(artifactId, level, perCopyBonus, balanceMode);
  });

  if (Number.isFinite(normalizedTask)) {
    Object.entries(ARTIFACT_XP_TASK_MULTIPLIERS).forEach(([artifactId, entry]) => {
      if (!Array.isArray(entry?.tasks) || !entry.tasks.includes(normalizedTask)) return;
      const level = getArtifactLevel(safeLevels, artifactId);
      if (level <= 0) return;
      multiplier *= getArtifactRecentXpRebalanceLevelMultiplier(artifactId, level, entry.perCopyBonus, balanceMode);
    });
  }

  return Math.max(1, multiplier);
};

const getArtifactRecentXpRebalanceReward = (
  taskNumber,
  levelId,
  artifactLevels = {},
  balanceMode = 'current'
) => {
  const reward = getTaskLevelXpReward(taskNumber, levelId);
  if (reward <= 0) return 0;
  return normalizeXpTotal(
    Math.round(reward * getArtifactRecentXpRebalanceMultiplier(artifactLevels, taskNumber, balanceMode))
  );
};

const applyArtifactCoinBonus = (baseReward, artifactLevels = {}) => {
  const reward = Number(baseReward);
  if (!Number.isFinite(reward) || reward <= 0) return 0;
  return normalizeCoinsTotal(Math.round(reward * getArtifactSolveCoinMultiplier(artifactLevels)));
};

const buildArtifactBonusSummary = (inventory = {}, artifactLevels = {}) => {
  const safeInventory = normalizeArtifactInventory(inventory);
  const safeLevels = normalizeArtifactLevels(artifactLevels, safeInventory);
  const hasFleshka = getArtifactLevel(safeLevels, 'fleshka') > 0;
  const hasListComprehension = getArtifactLevel(safeLevels, 'list-comprehension') > 0;
  const hasRecursiveScroll = getArtifactLevel(safeLevels, 'recursive scroll') > 0;
  const hasRingOfCache = getArtifactLevel(safeLevels, 'ring-of-cache') > 0;
  const hasRocks = getArtifactLevel(safeLevels, 'rocks') > 0;
  const hasTurtle = getArtifactLevel(safeLevels, 'turtle') > 0;
  const commonXpMultiplier = getArtifactSolveXpMultiplier(safeLevels, 1);
  const task6Multiplier = getArtifactSolveXpMultiplier(safeLevels, 6);
  const task15to16Multiplier = getArtifactSolveXpMultiplier(safeLevels, 15);
  const task16Multiplier = getArtifactSolveXpMultiplier(safeLevels, 16);
  const task17Multiplier = getArtifactSolveXpMultiplier(safeLevels, 17);
  const cacheTaskMultiplier = Math.max(
    getArtifactSolveXpMultiplier(safeLevels, 16),
    getArtifactSolveXpMultiplier(safeLevels, 19),
    getArtifactSolveXpMultiplier(safeLevels, 20),
    getArtifactSolveXpMultiplier(safeLevels, 21)
  );
  const fileTaskMultiplier = Math.max(
    getArtifactSolveXpMultiplier(safeLevels, 17),
    getArtifactSolveXpMultiplier(safeLevels, 24),
    getArtifactSolveXpMultiplier(safeLevels, 26),
    getArtifactSolveXpMultiplier(safeLevels, 27)
  );
  const gameTaskMultiplier = Math.max(
    getArtifactSolveXpMultiplier(safeLevels, 19),
    getArtifactSolveXpMultiplier(safeLevels, 20),
    getArtifactSolveXpMultiplier(safeLevels, 21)
  );
  const task24to27Multiplier = getArtifactSolveXpMultiplier(safeLevels, 25);
  const solveCoinMultiplier = getArtifactSolveCoinMultiplier(safeLevels);
  const instantRewards = getArtifactInstantRewardsFromInventory(safeInventory);
  const entries = [];

  if (commonXpMultiplier > 1.0001) {
    entries.push({
      id: 'xp-common',
      tone: 'xp',
      label: 'Любой опыт',
      value: formatArtifactBonusPercent(commonXpMultiplier),
    });
  }
  if (hasTurtle && task6Multiplier > 1.0001 && task6Multiplier !== commonXpMultiplier) {
    entries.push({
      id: 'xp-6',
      tone: 'xp',
      label: 'XP за 6',
      value: formatArtifactBonusPercent(task6Multiplier),
    });
  }
  if (task15to16Multiplier > 1.0001 && task15to16Multiplier !== commonXpMultiplier) {
    entries.push({
      id: 'xp-15-16',
      tone: 'xp',
      label: 'XP за 15-16',
      value: formatArtifactBonusPercent(task15to16Multiplier),
    });
  }
  if (hasRecursiveScroll && task16Multiplier > 1.0001 && task16Multiplier !== commonXpMultiplier) {
    entries.push({
      id: 'xp-16',
      tone: 'xp',
      label: 'XP за 16',
      value: formatArtifactBonusPercent(task16Multiplier),
    });
  }
  if (hasListComprehension && task17Multiplier > 1.0001 && task17Multiplier !== commonXpMultiplier) {
    entries.push({
      id: 'xp-17',
      tone: 'xp',
      label: 'XP за 17',
      value: formatArtifactBonusPercent(task17Multiplier),
    });
  }
  if (hasRingOfCache && cacheTaskMultiplier > 1.0001 && cacheTaskMultiplier !== commonXpMultiplier) {
    entries.push({
      id: 'xp-16-19-21',
      tone: 'xp',
      label: 'XP за 16/19-21',
      value: formatArtifactBonusPercent(cacheTaskMultiplier),
    });
  }
  if (hasFleshka && fileTaskMultiplier > 1.0001 && fileTaskMultiplier !== commonXpMultiplier) {
    entries.push({
      id: 'xp-files',
      tone: 'xp',
      label: 'XP за файлы',
      value: formatArtifactBonusPercent(fileTaskMultiplier),
    });
  }
  if (hasRocks && gameTaskMultiplier > 1.0001 && gameTaskMultiplier !== commonXpMultiplier) {
    entries.push({
      id: 'xp-19-21',
      tone: 'xp',
      label: 'XP за 19-21',
      value: formatArtifactBonusPercent(gameTaskMultiplier),
    });
  }
  if (task24to27Multiplier > 1.0001 && task24to27Multiplier !== commonXpMultiplier) {
    entries.push({
      id: 'xp-24-27',
      tone: 'xp',
      label: 'XP за 24-27',
      value: formatArtifactBonusPercent(task24to27Multiplier),
    });
  }
  if (solveCoinMultiplier > 1.0001) {
    entries.push({
      id: 'coins-solve',
      tone: 'coins',
      label: 'Монеты за задания',
      value: formatArtifactBonusPercent(solveCoinMultiplier),
    });
  }
  if (instantRewards.xp > 0) {
    entries.push({
      id: 'instant-xp',
      tone: 'instant',
      label: 'Разовый опыт',
      value: `+${normalizeXpTotal(instantRewards.xp).toLocaleString('ru-RU')} XP`,
    });
  }
  if (instantRewards.coins > 0) {
    entries.push({
      id: 'instant-coins',
      tone: 'instant',
      label: 'Разовые монеты',
      value: `+${normalizeCoinsTotal(instantRewards.coins).toLocaleString('ru-RU')} монет`,
    });
  }

  return {
    xp: {
      commonMultiplier: Math.round(commonXpMultiplier * 100) / 100,
      task6Multiplier: Math.round(task6Multiplier * 100) / 100,
      task15to16Multiplier: Math.round(task15to16Multiplier * 100) / 100,
      task16Multiplier: Math.round(task16Multiplier * 100) / 100,
      task17Multiplier: Math.round(task17Multiplier * 100) / 100,
      cacheTaskMultiplier: Math.round(cacheTaskMultiplier * 100) / 100,
      fileTaskMultiplier: Math.round(fileTaskMultiplier * 100) / 100,
      gameTaskMultiplier: Math.round(gameTaskMultiplier * 100) / 100,
      task24to27Multiplier: Math.round(task24to27Multiplier * 100) / 100,
    },
    coins: {
      solveMultiplier: Math.round(solveCoinMultiplier * 100) / 100,
    },
    instantRewards: {
      xp: normalizeXpTotal(instantRewards.xp),
      coins: normalizeCoinsTotal(instantRewards.coins),
    },
    entries,
  };
};

const buildArtifactRewardPayload = (
  artifactId,
  inventory = {},
  pulledAt = null,
  artifactLevels = {},
  artifactCards = {},
  coinsTotal = 0,
  options = {}
) => {
  const id = normalizeArtifactId(artifactId);
  if (!id) return null;
  const artifact = ARTIFACT_CATALOG_BY_ID.get(id);
  if (!artifact) return null;
  const safeLevels = normalizeArtifactLevels(artifactLevels, inventory);
  const safeCards = normalizeArtifactCards(artifactCards, inventory);
  const level = getArtifactLevel(safeLevels, id);
  const cards = getArtifactInventoryCount(safeCards, id);
  const maxLevelDuplicateCoins = normalizeCoinsTotal(options?.maxLevelDuplicateCoins);
  return {
    id,
    rank: artifact.rank,
    name: artifact.name,
    description: typeof artifact.description === 'string' ? artifact.description : '',
    count: Math.max(0, Math.floor(Number(inventory?.[id]) || 0)),
    level,
    cards,
    upgrade: buildArtifactUpgradeState({ artifactId: id, levels: safeLevels, cards: safeCards, coinsTotal }),
    pulledAt: pulledAt && !Number.isNaN(Date.parse(pulledAt)) ? new Date(pulledAt).toISOString() : null,
    ...(maxLevelDuplicateCoins > 0 ? { maxLevelDuplicateCoins } : {}),
  };
};

const buildStudentArtifactState = (data) => {
  const inventory = normalizeArtifactInventory(data?.artifactInventory);
  const artifactLevels = normalizeArtifactLevels(data?.artifactLevels, inventory);
  const artifactCards = normalizeArtifactCards(data?.artifactCards, inventory);
  const coinsTotal = normalizeCoinsTotal(data?.coinsTotal);
  const totalPulls = normalizeArtifactTotalPulls(data?.artifactTotalPulls);
  const bonuses = buildArtifactBonusSummary(inventory, artifactLevels);
  const collection = ARTIFACT_RANK_ORDER.flatMap((rank) => (
    ARTIFACT_CATALOG
      .filter((artifact) => artifact.rank === rank)
      .map((artifact) => {
        const count = Math.max(0, Math.floor(Number(inventory[artifact.id]) || 0));
        const level = getArtifactLevel(artifactLevels, artifact.id);
        if (count <= 0 && level <= 0) return null;
        return {
          id: artifact.id,
          rank: artifact.rank,
          name: artifact.name,
          description: typeof artifact.description === 'string' ? artifact.description : '',
          count,
          level,
          cards: getArtifactInventoryCount(artifactCards, artifact.id),
          upgrade: buildArtifactUpgradeState({
            artifactId: artifact.id,
            levels: artifactLevels,
            cards: artifactCards,
            coinsTotal,
          }),
        };
      })
      .filter(Boolean)
  ));
  const totalOwned = collection.reduce((sum, artifact) => sum + artifact.count, 0);
  const uniqueOwned = collection.length;
  const lastPull = buildArtifactRewardPayload(
    data?.artifactLastPull?.id,
    inventory,
    data?.artifactLastPull?.pulledAt || null,
    artifactLevels,
    artifactCards,
    coinsTotal,
    { maxLevelDuplicateCoins: data?.artifactLastPull?.maxLevelDuplicateCoins }
  );
  return {
    spinCost: ARTIFACT_SPIN_COST,
    rankChances: getPublicArtifactRankChances(),
    totalPulls,
    totalOwned,
    uniqueOwned,
    collection,
    lastPull,
    bonuses,
  };
};

const rollArtifactRank = (randomValue = Math.random(), chances = ARTIFACT_RANK_CHANCES) => {
  const safeChances = (Array.isArray(chances) ? chances : ARTIFACT_RANK_CHANCES)
    .filter((entry) => entry && ARTIFACT_RANK_ORDER.includes(entry.rank) && Number(entry.chance) > 0);
  const totalChance = safeChances.reduce((sum, entry) => sum + Number(entry.chance), 0);
  if (totalChance <= 0) return ARTIFACT_RANK_CHANCES[ARTIFACT_RANK_CHANCES.length - 1]?.rank || 'C';
  const target = Number(randomValue) * totalChance;
  let cursor = 0;
  for (const entry of safeChances) {
    cursor += Number(entry.chance);
    if (target < cursor) return entry.rank;
  }
  return safeChances[safeChances.length - 1]?.rank || 'C';
};

const getProtectedArtifactDropIds = (totalPullsBefore = 0) => {
  const protectedIds = new Set(ARTIFACT_DISABLED_DROP_IDS);
  if (normalizeArtifactTotalPulls(totalPullsBefore) < ARTIFACT_EARLY_PULL_PROTECTION_COUNT) {
    ARTIFACT_EARLY_PULL_PROTECTED_IDS.forEach((artifactId) => protectedIds.add(artifactId));
  }
  return protectedIds;
};

const getDroppableArtifactIdsForRank = (rank, blockedIds = ARTIFACT_DISABLED_DROP_IDS) => {
  const normalizedRank = String(rank || '').trim().toUpperCase();
  if (!ARTIFACT_RANK_ORDER.includes(normalizedRank)) return [];
  const blocked = blockedIds instanceof Set ? blockedIds : new Set(blockedIds);
  return (ARTIFACT_IDS_BY_RANK.get(normalizedRank) || []).filter((artifactId) => !blocked.has(artifactId));
};

const getPublicArtifactRankChances = () => {
  const availableChances = ARTIFACT_RANK_CHANCES.filter((entry) => (
    getDroppableArtifactIdsForRank(entry.rank).length > 0
  ));
  const totalChance = availableChances.reduce((sum, entry) => sum + (Number(entry.chance) || 0), 0);
  if (totalChance <= 0) return [];
  return availableChances.map((entry) => ({
    rank: entry.rank,
    chancePercent: Math.round(((Number(entry.chance) || 0) / totalChance) * 100),
  }));
};

const rollArtifactReward = ({ totalPullsBefore = 0 } = {}) => {
  const protectedIds = getProtectedArtifactDropIds(totalPullsBefore);
  const availableIdsByRank = new Map();
  ARTIFACT_RANK_ORDER.forEach((rank) => {
    const rankIds = getDroppableArtifactIdsForRank(rank, protectedIds);
    if (rankIds.length > 0) availableIdsByRank.set(rank, rankIds);
  });
  const availableChances = ARTIFACT_RANK_CHANCES.filter((entry) => (
    (availableIdsByRank.get(entry.rank) || []).length > 0
  ));
  const rank = rollArtifactRank(Math.random(), availableChances);
  const rankIds = availableIdsByRank.get(rank) || [];
  if (rankIds.length <= 0) {
    return ARTIFACT_CATALOG.find((artifact) => !protectedIds.has(artifact.id)) || null;
  }
  const artifactId = rankIds[Math.floor(Math.random() * rankIds.length)];
  return ARTIFACT_CATALOG_BY_ID.get(artifactId) || null;
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

const getArtifactAdjustedTaskLevelXpReward = (taskNumber, levelId, artifactLevels = null) => {
  const reward = getTaskLevelXpReward(taskNumber, levelId);
  if (reward <= 0) return 0;
  return artifactLevels && typeof artifactLevels === 'object'
    ? applyArtifactXpBonus(reward, artifactLevels, taskNumber)
    : reward;
};

const getSolvedEventXpReward = (event, artifactLevels = null) => {
  const taskNum = Number(event?.taskNumber);
  const levelId = String(event?.levelId || '').trim();
  const storedReward = normalizeXpTotal(event?.xpGained);
  if (!Number.isFinite(taskNum) || taskNum < 1 || taskNum > 27 || levelId === PYTHON_LEVEL_ID) {
    return storedReward;
  }
  const recalculatedReward = getArtifactAdjustedTaskLevelXpReward(taskNum, levelId, artifactLevels);
  if (storedReward > 0 && recalculatedReward > 0) return Math.min(storedReward, recalculatedReward);
  return storedReward || recalculatedReward;
};

const deriveXpFromSolvedByTask = (solvedByTask, artifactLevels = null) => {
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
      const reward = getArtifactAdjustedTaskLevelXpReward(taskKey, levelKey, artifactLevels);
      if (reward <= 0) return;
      totalXp += solvedCount * reward;
    });
  });
  return totalXp;
};

const deriveCoinsFromSolvedByTask = (solvedByTask) => {
  if (!solvedByTask || typeof solvedByTask !== 'object') return 0;
  let totalCoins = 0;
  Object.entries(solvedByTask).forEach(([taskKey, taskEntry]) => {
    if (!taskEntry || typeof taskEntry !== 'object' || Array.isArray(taskEntry)) return;
    Object.entries(taskEntry).forEach(([levelKey, levelEntry]) => {
      if (String(levelKey).startsWith('_')) return;
      if (!levelEntry || typeof levelEntry !== 'object' || Array.isArray(levelEntry)) return;
      const solvedList = Array.isArray(levelEntry.solved) ? levelEntry.solved : [];
      if (solvedList.length <= 0) return;
      const solvedCount = new Set(solvedList.map((id) => String(id))).size;
      if (solvedCount <= 0) return;
      const reward = getSolveCoinReward(taskKey, levelKey);
      if (reward <= 0) return;
      totalCoins += solvedCount * reward;
    });
  });
  return normalizeCoinsTotal(totalCoins);
};

const deriveXpFromSolvedEvents = (events, artifactLevels = null) => {
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
    const reward = artifactLevels && typeof artifactLevels === 'object'
      ? getSolvedEventXpReward(event, artifactLevels)
      : (normalizeXpTotal(event?.xpGained) || getTaskLevelXpReward(taskNum, levelId));
    if (reward <= 0) return;
    totalXp += reward;
  });
  return totalXp;
};

const deriveCoinsFromSolvedEvents = (events) => {
  if (!Array.isArray(events) || events.length <= 0) return 0;
  const seenIds = new Set();
  let totalCoins = 0;
  events.forEach((event) => {
    const eventId = typeof event?.id === 'string' ? event.id.trim() : '';
    if (eventId) {
      if (seenIds.has(eventId)) return;
      seenIds.add(eventId);
    }
    if (!event || typeof event !== 'object') return;
    const levelId = String(event.levelId || '').trim();
    if (levelId !== PYTHON_LEVEL_ID) return;
    const reward = normalizeCoinsTotal(event?.coinsGained) || getSolveCoinReward(event.taskNumber, levelId);
    if (reward <= 0) return;
    totalCoins += reward;
  });
  return normalizeCoinsTotal(totalCoins);
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

const deriveXpFromLegacyProgress = (progress, testsDb = null, artifactLevels = null) => {
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
      const reward = getArtifactAdjustedTaskLevelXpReward(normalizedTask, levelId, artifactLevels);
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

const getRecentXpFromSolvedEvents = (events, endDayNum, days = LEADERBOARD_WEEK_DAYS, artifactLevels = null) => {
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
    const reward = artifactLevels && typeof artifactLevels === 'object'
      ? getSolvedEventXpReward(event, artifactLevels)
      : (normalizeXpTotal(event?.xpGained) || getTaskLevelXpReward(event.taskNumber, event.levelId));
    if (reward <= 0) return;
    xpTotal += reward;
  });

  return xpTotal;
};

const getRecentXpRebalanceWindow = (now = new Date(), days = LEADERBOARD_WEEK_DAYS) => {
  const parsedDays = Number(days);
  const periodDays = Number.isFinite(parsedDays) && parsedDays > 0
    ? Math.floor(parsedDays)
    : LEADERBOARD_WEEK_DAYS;
  const todayKey = now instanceof Date && !Number.isNaN(now.getTime())
    ? now.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const fallbackEndDayNum = Math.floor(Date.now() / DAY_MS);
  const parsedTodayNum = dayKeyToNumber(todayKey);
  const endDayNum = Number.isFinite(parsedTodayNum) ? parsedTodayNum : fallbackEndDayNum;
  const startDayNum = endDayNum - Math.max(periodDays - 1, 0);
  return {
    days: periodDays,
    startDayNum,
    endDayNum,
    startDay: numberToDayKey(startDayNum) || todayKey,
    endDay: numberToDayKey(endDayNum) || todayKey,
  };
};

const getRecentXpFromSolvedEventsForBalance = (
  events,
  window,
  artifactLevels = {},
  balanceMode = 'current'
) => {
  if (!Array.isArray(events) || events.length <= 0 || !window) return 0;
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
    if (!Number.isFinite(dayNum) || dayNum < window.startDayNum || dayNum > window.endDayNum) return;
    const reward = getArtifactRecentXpRebalanceReward(
      event.taskNumber,
      event.levelId,
      artifactLevels,
      balanceMode
    );
    if (reward <= 0) return;
    xpTotal += reward;
  });

  return normalizeXpTotal(xpTotal);
};

const getRecentXpRebalanceStats = (data, window) => {
  const artifactInventory = normalizeArtifactInventory(data?.artifactInventory);
  const artifactLevels = normalizeArtifactLevels(data?.artifactLevels, artifactInventory);
  const oldRecentXp = getRecentXpFromSolvedEventsForBalance(
    data?.solvedEvents,
    window,
    artifactLevels,
    'pre-fix'
  );
  const newRecentXp = getRecentXpFromSolvedEventsForBalance(
    data?.solvedEvents,
    window,
    artifactLevels,
    'current'
  );
  const removedXp = Math.max(0, oldRecentXp - newRecentXp);
  return {
    oldRecentXp,
    newRecentXp,
    storedRecentXp: oldRecentXp,
    recalculatedRecentXp: newRecentXp,
    removedXp,
  };
};

const buildLeaderboardAnonNameMap = (students = []) => {
  const orderedStudents = [...students].sort((a, b) => {
    const aTs = Date.parse(a?.createdAt || '');
    const bTs = Date.parse(b?.createdAt || '');
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return aTs - bTs;
    return String(a?.id || '').localeCompare(String(b?.id || ''), 'ru');
  });
  return new Map(
    orderedStudents.map((student, index) => [student.id, `Аноним ${index + 1}`])
  );
};

const getSolvedQuestionCountFromSolvedByTask = (solvedByTask) => {
  if (!solvedByTask || typeof solvedByTask !== 'object') return 0;
  let solvedQuestions = 0;
  Object.values(solvedByTask).forEach((taskEntry) => {
    if (!taskEntry || typeof taskEntry !== 'object') return;
    Object.entries(taskEntry).forEach(([levelKey, levelEntry]) => {
      if (String(levelKey || '').startsWith('_')) return;
      if (!levelEntry || typeof levelEntry !== 'object') return;
      const solvedList = Array.isArray(levelEntry.solved) ? levelEntry.solved : [];
      solvedQuestions += new Set(solvedList.map((id) => String(id))).size;
    });
  });
  return Math.max(0, Math.floor(solvedQuestions));
};

const LEADERBOARD_PROFILE_TASK_TITLES = {
  '1': 'Анализ информационных моделей',
  '2': 'Таблицы истинности',
  '3': 'Поиск в БД',
  '4': 'Кодирование (Фано)',
  '5': 'Анализ алгоритмов',
  '6': 'Циклы',
  '7': 'Изображения и звук',
  '8': 'Комбинаторика',
  '9': 'Excel',
  '10': 'Word',
  '11': 'Вычисление информации',
  '12': 'Исполнители',
  '13': 'Графы',
  '14': 'Системы счисления',
  '15': 'Алгебра логики',
  '16': 'Рекурсия',
  '17': 'Последовательности',
  '18': 'Робот (ДП)',
  '19': 'Теория игр (1)',
  '20': 'Теория игр (2)',
  '21': 'Теория игр (3)',
  '22': 'Многопроцессорные',
  '23': 'Динамика (Исполнитель)',
  '24': 'Строки',
  '25': 'Маски чисел',
  '26': 'Жадные алгоритмы',
  '27': 'Анализ данных',
};

const LEADERBOARD_PROFILE_TIME_ZONE = process.env.PLATFORM_TIME_ZONE || process.env.TZ || 'Europe/Moscow';
const LEADERBOARD_PROFILE_PYTHON_TASK_CATALOG_KEY = '__pythonTaskCatalog';
const LEADERBOARD_PROFILE_DEFAULT_PYTHON_TASKS = [
  { number: 101, title: 'Ввод и вывод данных', displayNumber: '1.0', sectionId: 'topics' },
  { number: 102, title: 'Переменные', displayNumber: '1.1', sectionId: 'topics' },
  { number: 103, title: 'Условия', displayNumber: '2', sectionId: 'topics' },
  { number: 104, title: 'Вычисления', displayNumber: '3', sectionId: 'topics' },
  { number: 105, title: 'Цикл for', displayNumber: '4', sectionId: 'topics' },
  { number: 106, title: 'Строки', displayNumber: '5', sectionId: 'topics' },
  { number: 107, title: 'Цикл while', displayNumber: '6', sectionId: 'topics' },
  { number: 108, title: 'Списки', displayNumber: '7.0', sectionId: 'topics' },
  { number: 109, title: 'Кортежи', displayNumber: '7.1', sectionId: 'topics' },
  { number: 110, title: 'Функции и рекурсия', displayNumber: '8', sectionId: 'topics' },
  { number: 111, title: 'Двумерные массивы', displayNumber: '9', sectionId: 'topics' },
  { number: 205, title: 'Подготовка к заданию 5', displayNumber: '5', sectionId: 'exam-prep' },
  { number: 208, title: 'Подготовка к заданию 8', displayNumber: '8', sectionId: 'exam-prep' },
  { number: 214, title: 'Подготовка к заданию 14', displayNumber: '14', sectionId: 'exam-prep' },
  { number: 216, title: 'Подготовка к заданию 16', displayNumber: '16', sectionId: 'exam-prep' },
  { number: 217, title: 'Подготовка к заданию 17', displayNumber: '17', sectionId: 'exam-prep' },
  { number: 223, title: 'Подготовка к заданию 23', displayNumber: '23', sectionId: 'exam-prep' },
  { number: 224, title: 'Подготовка к заданию 24', displayNumber: '24', sectionId: 'exam-prep' },
  { number: 225, title: 'Подготовка к заданию 25', displayNumber: '25', sectionId: 'exam-prep' },
  { number: 226, title: 'Подготовка к заданию 26', displayNumber: '26', sectionId: 'exam-prep' },
  { number: 227, title: 'Подготовка к заданию 27', displayNumber: '27', sectionId: 'exam-prep' },
];

const getLeaderboardProfileDayKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: LEADERBOARD_PROFILE_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const byType = parts.reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
    return normalizeDayKey(`${byType.year}-${byType.month}-${byType.day}`);
  } catch {
    return normalizeDayKey(date.toISOString().slice(0, 10));
  }
};

const getLeaderboardProfilePreparationSummary = (student, now = new Date()) => {
  const joinedAt = typeof student?.createdAt === 'string' ? student.createdAt.trim() : '';
  const startDay = joinedAt ? getLeaderboardProfileDayKey(joinedAt) : null;
  const endDay = getLeaderboardProfileDayKey(now);
  const startDayNum = dayKeyToNumber(startDay);
  const endDayNum = dayKeyToNumber(endDay);
  const days = Number.isFinite(startDayNum) && Number.isFinite(endDayNum)
    ? Math.max(0, endDayNum - startDayNum + 1)
    : 0;

  return {
    joinedAt,
    startDay,
    days,
  };
};

const normalizeLeaderboardProfilePythonTask = (task) => {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return null;
  const numericTaskId = Number(task.number ?? task.id);
  if (!Number.isFinite(numericTaskId)) return null;
  const taskNumber = Math.trunc(numericTaskId);
  if (taskNumber < 100) return null;
  const title = String(task.title || '').trim();
  if (!title) return null;
  const displayNumber = String(task.displayNumber || '').trim() || String(taskNumber);
  const sectionId = String(task.sectionId || '').trim();
  return {
    taskId: String(taskNumber),
    taskNumber,
    title,
    displayNumber,
    sectionId,
  };
};

const getLeaderboardProfilePythonTaskMap = (testsDb) => {
  const pythonTaskMap = new Map();
  LEADERBOARD_PROFILE_DEFAULT_PYTHON_TASKS.forEach((task) => {
    const normalizedTask = normalizeLeaderboardProfilePythonTask(task);
    if (normalizedTask) pythonTaskMap.set(normalizedTask.taskId, normalizedTask);
  });

  const catalog = Array.isArray(testsDb?.[LEADERBOARD_PROFILE_PYTHON_TASK_CATALOG_KEY])
    ? testsDb[LEADERBOARD_PROFILE_PYTHON_TASK_CATALOG_KEY]
    : [];
  catalog.forEach((task) => {
    const normalizedTask = normalizeLeaderboardProfilePythonTask(task);
    if (normalizedTask) pythonTaskMap.set(normalizedTask.taskId, normalizedTask);
  });

  return pythonTaskMap;
};

const getLeaderboardProfileTaskMeta = (taskId, pythonTaskMap) => {
  const numericTaskId = Number(taskId);
  if (!Number.isFinite(numericTaskId)) {
    return {
      taskId: '',
      taskNumber: 0,
      title: 'Тема',
      displayNumber: '',
      isPython: false,
    };
  }
  const normalizedTaskId = String(Math.trunc(numericTaskId));
  const pythonTask = pythonTaskMap instanceof Map ? pythonTaskMap.get(normalizedTaskId) : null;
  if (pythonTask) {
    return {
      ...pythonTask,
      isPython: true,
    };
  }

  const taskNumber = Math.trunc(numericTaskId);
  return {
    taskId: normalizedTaskId,
    taskNumber,
    title: LEADERBOARD_PROFILE_TASK_TITLES[normalizedTaskId] || `Задание ${normalizedTaskId}`,
    displayNumber: normalizedTaskId,
    isPython: false,
  };
};

const getLeaderboardProfileStrongestTasks = (progressByTaskId, testsDb, limit = 3) => {
  if (!(progressByTaskId instanceof Map)) return [];
  const parsedLimit = Number(limit);
  const maxItems = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 3;
  const pythonTaskMap = getLeaderboardProfilePythonTaskMap(testsDb);

  return [...progressByTaskId.entries()]
    .map(([taskId, percent]) => {
      const numericTaskId = Number(taskId);
      if (!Number.isFinite(numericTaskId)) return null;
      const normalizedPercent = Math.max(0, Math.min(100, Number(percent) || 0));
      if (normalizedPercent <= 0) return null;
      const taskMeta = getLeaderboardProfileTaskMeta(taskId, pythonTaskMap);
      return {
        ...taskMeta,
        percent: normalizedPercent,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.percent !== left.percent) return right.percent - left.percent;
      return left.taskNumber - right.taskNumber;
    })
    .slice(0, maxItems);
};

const getLeaderboardProfileProgressSummary = (studentData, testsDb) => {
  const progress = recomputeProgressFromSolved(studentData);
  const progressByTaskId = new Map();
  Object.entries(progress || {}).forEach(([taskId, value]) => {
    const taskNum = Number(taskId);
    if (!Number.isFinite(taskNum)) return;
    const normalizedTaskId = String(Math.trunc(taskNum));
    const normalizedValue = Math.max(0, Math.min(100, Number(value) || 0));
    progressByTaskId.set(normalizedTaskId, normalizedValue);
  });

  const taskIds = new Set();
  Object.entries(testsDb || {}).forEach(([taskId, taskValue]) => {
    const taskNum = Number(taskId);
    if (!Number.isFinite(taskNum)) return;
    if (!taskValue || typeof taskValue !== 'object') return;
    taskIds.add(String(Math.trunc(taskNum)));
  });
  progressByTaskId.forEach((_value, taskId) => taskIds.add(taskId));

  let startedTasks = 0;
  let completedTasks = 0;
  let totalProgress = 0;
  taskIds.forEach((taskId) => {
    const value = progressByTaskId.get(taskId) || 0;
    if (value > 0) startedTasks += 1;
    if (value >= 100) completedTasks += 1;
    totalProgress += value;
  });

  const totalTasks = taskIds.size;
  const overallPercent = totalTasks > 0
    ? Math.max(0, Math.min(100, Math.round(totalProgress / totalTasks)))
    : 0;

  return {
    startedTasks,
    completedTasks,
    totalTasks,
    solvedQuestions: getSolvedQuestionCountFromSolvedByTask(studentData?.solvedByTask),
    overallPercent,
    strongestTasks: getLeaderboardProfileStrongestTasks(progressByTaskId, testsDb),
  };
};

const getLeaderboardProgressKindForTask = (taskNumber) => {
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) return '';
  if (isPythonTaskNumber(taskNum)) return 'python';
  if (taskNum >= 1 && taskNum <= 27) return 'course';
  return '';
};

const shouldIncludeLeaderboardProgressKind = (taskNumber, kind = 'all') => {
  const normalizedKind = String(kind || 'all').trim();
  const taskKind = getLeaderboardProgressKindForTask(taskNumber);
  if (!taskKind) return false;
  if (normalizedKind === 'all') return true;
  return taskKind === normalizedKind;
};

const getLeaderboardProgressTaskIds = (testsDb, kind = 'all') => {
  const taskIds = new Set();
  Object.entries(testsDb || {}).forEach(([taskId, taskValue]) => {
    const taskNum = Number(taskId);
    if (!Number.isFinite(taskNum)) return;
    if (!taskValue || typeof taskValue !== 'object' || Array.isArray(taskValue)) return;
    if (!shouldIncludeLeaderboardProgressKind(taskNum, kind)) return;
    taskIds.add(String(Math.trunc(taskNum)));
  });
  return taskIds;
};

const getLeaderboardProgressSummaryByKind = (studentData, testsDb, kind = 'all') => {
  const progress = recomputeProgressFromSolved(studentData);
  const taskIds = getLeaderboardProgressTaskIds(testsDb, kind);
  const progressByTaskId = new Map();

  Object.entries(progress || {}).forEach(([taskId, value]) => {
    const taskNum = Number(taskId);
    if (!Number.isFinite(taskNum)) return;
    if (!shouldIncludeLeaderboardProgressKind(taskNum, kind)) return;
    const normalizedTaskId = String(Math.trunc(taskNum));
    const normalizedValue = Math.max(0, Math.min(100, Number(value) || 0));
    taskIds.add(normalizedTaskId);
    progressByTaskId.set(normalizedTaskId, normalizedValue);
  });

  let startedTasks = 0;
  let completedTasks = 0;
  let totalProgress = 0;
  taskIds.forEach((taskId) => {
    const value = progressByTaskId.get(taskId) || 0;
    if (value > 0) startedTasks += 1;
    if (value >= 100) completedTasks += 1;
    totalProgress += value;
  });

  const totalTasks = taskIds.size;
  const overallPercent = totalTasks > 0
    ? Math.max(0, Math.min(100, Math.round(totalProgress / totalTasks)))
    : 0;

  return {
    startedTasks,
    completedTasks,
    totalTasks,
    overallPercent,
  };
};

const getLeaderboardLevelProgressWeight = (levelId) => {
  const normalizedLevelId = String(levelId || '').trim();
  if (normalizedLevelId === PYTHON_LEVEL_ID) return 100;
  const weight = Number(LEVEL_WEIGHTS[normalizedLevelId]);
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
};

const isLeaderboardProgressEventSource = (event) => {
  const source = String(event?.source || event?.eventKind || '').trim().toLowerCase();
  return source !== 'mock-exam' && source !== 'mock-exam-task';
};

const getRecentProgressPercentFromSolvedEvents = (events, testsDb, endDayNum, days = LEADERBOARD_WEEK_DAYS, kind = 'all') => {
  const taskIds = getLeaderboardProgressTaskIds(testsDb, kind);
  if (taskIds.size <= 0 || !Array.isArray(events) || events.length <= 0) return 0;

  const parsedDays = Number(days);
  const periodDays = Number.isFinite(parsedDays) && parsedDays > 0
    ? Math.floor(parsedDays)
    : LEADERBOARD_WEEK_DAYS;
  const fallbackEnd = dayKeyToNumber(new Date().toISOString().slice(0, 10));
  const safeEndDayNum = Number.isFinite(endDayNum) ? Math.floor(endDayNum) : fallbackEnd;
  if (!Number.isFinite(safeEndDayNum)) return 0;
  const startDayNum = safeEndDayNum - Math.max(periodDays - 1, 0);
  const seenKeys = new Set();
  const taskProgressById = new Map();

  events.forEach((event) => {
    if (!event || typeof event !== 'object') return;
    if (!isLeaderboardProgressEventSource(event)) return;
    const taskNum = Number(event.taskNumber);
    if (!Number.isFinite(taskNum) || !shouldIncludeLeaderboardProgressKind(taskNum, kind)) return;
    const taskId = String(Math.trunc(taskNum));
    if (!taskIds.has(taskId)) return;
    const dayKey = getSolvedEventDayKey(event);
    const dayNum = dayKeyToNumber(dayKey);
    if (!Number.isFinite(dayNum) || dayNum < startDayNum || dayNum > safeEndDayNum) return;

    const levelId = String(event.levelId || '').trim();
    const questionId = String(event.questionId ?? '').trim();
    if (!questionId) return;
    const { questions, question } = getQuestionEntryFromTestsDb(testsDb, taskNum, levelId, questionId);
    if (!Array.isArray(questions) || questions.length <= 0 || !question) return;
    const seenKey = `${taskId}:${levelId}:${questionId}`;
    if (seenKeys.has(seenKey)) return;
    seenKeys.add(seenKey);

    const levelWeight = getLeaderboardLevelProgressWeight(levelId);
    if (levelWeight <= 0) return;
    const increment = levelWeight / questions.length;
    taskProgressById.set(
      taskId,
      Math.min(100, (taskProgressById.get(taskId) || 0) + increment)
    );
  });

  const totalProgress = [...taskProgressById.values()].reduce((sum, value) => sum + value, 0);
  return Math.max(0, Math.min(100, Math.round(totalProgress / taskIds.size)));
};

const getRecentSolvedQuestionCountByKind = (events, endDayNum, days = LEADERBOARD_WEEK_DAYS, kind = 'all') => {
  if (!Array.isArray(events) || events.length <= 0) return 0;
  const parsedDays = Number(days);
  const periodDays = Number.isFinite(parsedDays) && parsedDays > 0
    ? Math.floor(parsedDays)
    : LEADERBOARD_WEEK_DAYS;
  const fallbackEnd = dayKeyToNumber(new Date().toISOString().slice(0, 10));
  const safeEndDayNum = Number.isFinite(endDayNum) ? Math.floor(endDayNum) : fallbackEnd;
  if (!Number.isFinite(safeEndDayNum)) return 0;
  const startDayNum = safeEndDayNum - Math.max(periodDays - 1, 0);
  const seenKeys = new Set();

  events.forEach((event) => {
    if (!event || typeof event !== 'object') return;
    if (!isLeaderboardProgressEventSource(event)) return;
    const taskNum = Number(event.taskNumber);
    if (!Number.isFinite(taskNum) || !shouldIncludeLeaderboardProgressKind(taskNum, kind)) return;
    const dayKey = getSolvedEventDayKey(event);
    const dayNum = dayKeyToNumber(dayKey);
    if (!Number.isFinite(dayNum) || dayNum < startDayNum || dayNum > safeEndDayNum) return;
    const levelId = String(event.levelId || '').trim();
    const questionId = String(event.questionId ?? '').trim();
    if (!questionId) return;
    seenKeys.add(`${Math.trunc(taskNum)}:${levelId}:${questionId}`);
  });

  return seenKeys.size;
};

const getLeaderboardPlatformDaysSummary = (student, periodWindow) => {
  const todayDayNum = Number.isFinite(periodWindow?.endDayNum)
    ? Math.floor(periodWindow.endDayNum)
    : dayKeyToNumber(new Date().toISOString().slice(0, 10));
  const weekStartDayNum = Number.isFinite(periodWindow?.startDayNum)
    ? Math.floor(periodWindow.startDayNum)
    : todayDayNum - (LEADERBOARD_WEEK_DAYS - 1);
  const joinedAt = typeof student?.createdAt === 'string' ? student.createdAt.trim() : '';
  const joinedDayNum = dayKeyToNumber(getLeaderboardProfileDayKey(joinedAt || new Date()));
  if (!Number.isFinite(todayDayNum) || !Number.isFinite(joinedDayNum)) {
    return {
      totalDays: 0,
      weeklyDays: 0,
    };
  }

  const totalDays = Math.max(0, todayDayNum - joinedDayNum + 1);
  const weeklyStart = Number.isFinite(weekStartDayNum) ? Math.max(weekStartDayNum, joinedDayNum) : joinedDayNum;
  const weeklyDays = weeklyStart <= todayDayNum
    ? Math.max(0, todayDayNum - weeklyStart + 1)
    : 0;

  return {
    totalDays,
    weeklyDays,
  };
};

const getLeaderboardProfileActivitySummary = (events, endDayNum, days = LEADERBOARD_WEEK_DAYS) => {
  const summary = {
    weeklySolvedQuestions: 0,
    weeklyActiveDays: 0,
    totalActiveDays: 0,
    lastSolvedAt: null,
  };
  if (!Array.isArray(events) || events.length <= 0) return summary;

  const parsedDays = Number(days);
  const periodDays = Number.isFinite(parsedDays) && parsedDays > 0
    ? Math.floor(parsedDays)
    : LEADERBOARD_WEEK_DAYS;
  const fallbackEnd = dayKeyToNumber(new Date().toISOString().slice(0, 10));
  const safeEndDayNum = Number.isFinite(endDayNum) ? Math.floor(endDayNum) : fallbackEnd;
  const startDayNum = Number.isFinite(safeEndDayNum)
    ? safeEndDayNum - Math.max(periodDays - 1, 0)
    : null;
  const seenIds = new Set();
  const weeklyDaySet = new Set();
  const totalDaySet = new Set();
  let latestSolvedAt = '';
  let latestSolvedAtMs = 0;

  events.forEach((event) => {
    const eventId = typeof event?.id === 'string' ? event.id.trim() : '';
    if (eventId) {
      if (seenIds.has(eventId)) return;
      seenIds.add(eventId);
    }

    const solvedAt = typeof event?.solvedAt === 'string' && !Number.isNaN(Date.parse(event.solvedAt))
      ? new Date(event.solvedAt).toISOString()
      : '';
    if (solvedAt) {
      const solvedAtMs = Date.parse(solvedAt);
      if (Number.isFinite(solvedAtMs) && solvedAtMs > latestSolvedAtMs) {
        latestSolvedAtMs = solvedAtMs;
        latestSolvedAt = solvedAt;
      }
    }

    const dayKey = getSolvedEventDayKey(event);
    const dayNum = dayKeyToNumber(dayKey);
    if (dayKey) totalDaySet.add(dayKey);
    if (!Number.isFinite(dayNum) || !Number.isFinite(startDayNum) || !Number.isFinite(safeEndDayNum)) return;
    if (dayNum < startDayNum || dayNum > safeEndDayNum) return;
    summary.weeklySolvedQuestions += 1;
    if (dayKey) weeklyDaySet.add(dayKey);
  });

  summary.weeklyActiveDays = weeklyDaySet.size;
  summary.totalActiveDays = totalDaySet.size;
  summary.lastSolvedAt = latestSolvedAt || null;
  return summary;
};

const getLeaderboardProfileMockTaskCounts = (mockExam, attempt) => {
  const solvedMap = attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {};
  const taskKeys = mockExam?.tasks && typeof mockExam.tasks === 'object'
    ? Object.keys(mockExam.tasks).map((taskId) => String(taskId || '').trim()).filter(Boolean)
    : [];
  if (taskKeys.length > 0) {
    let solvedTasks = 0;
    taskKeys.forEach((taskId) => {
      if (Boolean(solvedMap[String(taskId)])) solvedTasks += 1;
    });
    return {
      solvedTasks,
      totalTasks: taskKeys.length,
    };
  }

  const solvedTasks = Object.values(solvedMap).reduce((sum, value) => (value ? sum + 1 : sum), 0);
  return {
    solvedTasks,
    totalTasks: solvedTasks > 0 ? MOCK_TASK_NUMBERS.length : 0,
  };
};

const getLeaderboardProfileMockSummary = (mockAttempts, mockExamById = {}) => {
  const emptySummary = {
    attemptsCount: 0,
    solvedCount: 0,
    completedCount: 0,
    bestScore: 0,
    averageScore: 0,
    perfectCount: 0,
    best: null,
  };

  const attempts = mockAttempts && typeof mockAttempts === 'object'
    ? Object.entries(mockAttempts).filter(([_examId, attempt]) => attempt && typeof attempt === 'object')
    : [];
  if (attempts.length <= 0) {
    return emptySummary;
  }

  const normalizedResults = attempts.map(([examId, attempt]) => {
    const normalizedExamId = String(examId || '').trim();
    const mockExam = normalizedExamId ? mockExamById?.[normalizedExamId] : null;
    const score = getMockSecondaryScoreFromSolved(attempt?.solved);
    const { solvedTasks, totalTasks } = getLeaderboardProfileMockTaskCounts(mockExam, attempt);
    const updatedAt = typeof attempt?.updatedAt === 'string' && attempt.updatedAt.trim()
      ? attempt.updatedAt.trim()
      : '';
    const parsedUpdatedAt = updatedAt ? Date.parse(updatedAt) : NaN;
    return {
      examId: normalizedExamId,
      title: typeof mockExam?.title === 'string' && mockExam.title.trim()
        ? mockExam.title.trim()
        : 'Пробник',
      score,
      solvedTasks,
      totalTasks,
      updatedAt: updatedAt || null,
      updatedAtMs: Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt : 0,
    };
  });

  const solvedResults = normalizedResults.filter((item) => item.score > 0 || item.solvedTasks > 0);
  if (solvedResults.length <= 0) {
    return {
      ...emptySummary,
      attemptsCount: attempts.length,
    };
  }

  const totalScore = solvedResults.reduce((sum, item) => sum + item.score, 0);
  const best = solvedResults.reduce((currentBest, item) => {
    if (!currentBest) return item;
    if (item.score !== currentBest.score) return item.score > currentBest.score ? item : currentBest;
    if (item.solvedTasks !== currentBest.solvedTasks) {
      return item.solvedTasks > currentBest.solvedTasks ? item : currentBest;
    }
    if (item.updatedAtMs !== currentBest.updatedAtMs) {
      return item.updatedAtMs > currentBest.updatedAtMs ? item : currentBest;
    }
    return currentBest;
  }, null);

  return {
    attemptsCount: attempts.length,
    solvedCount: solvedResults.length,
    completedCount: solvedResults.filter((item) => item.totalTasks > 0 && item.solvedTasks >= item.totalTasks).length,
    bestScore: Math.max(...solvedResults.map((item) => item.score)),
    averageScore: Math.round(totalScore / solvedResults.length),
    perfectCount: solvedResults.filter((item) => item.score >= 100).length,
    best: best
      ? {
          examId: best.examId,
          title: best.title,
          score: best.score,
          solvedTasks: best.solvedTasks,
          totalTasks: best.totalTasks,
          updatedAt: best.updatedAt,
        }
      : null,
  };
};

const getHighestArtifactRankFromCollection = (collection = []) => {
  for (const rank of ARTIFACT_RANK_ORDER) {
    if (collection.some((artifact) => String(artifact?.rank || '') === rank)) {
      return rank;
    }
  }
  return '';
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

const MOCK_TASK_NUMBERS = Array.from({ length: 27 }, (_, index) => index + 1);
const MOCK_PRIMARY_TO_SECONDARY = {
  1: 7,
  2: 14,
  3: 20,
  4: 27,
  5: 34,
  6: 40,
  7: 43,
  8: 46,
  9: 48,
  10: 51,
  11: 54,
  12: 56,
  13: 59,
  14: 62,
  15: 64,
  16: 67,
  17: 70,
  18: 72,
  19: 75,
  20: 78,
  21: 80,
  22: 83,
  23: 85,
  24: 88,
  25: 90,
  26: 93,
  27: 95,
  28: 98,
  29: 100,
};

const MOCK_COIN_MILESTONES = [
  { score: 30, coins: 30 },
  { score: 50, coins: 50 },
  { score: 80, coins: 80 },
  { score: 100, coins: 100 },
];
const MOCK_ATTEMPT_MODE_CLASSIC = 'classic';
const MOCK_ATTEMPT_MODE_TIMER = 'timer';
const MOCK_EXAM_TIMER_DURATION_MS = 235 * 60 * 1000;
const MOCK_TIMER_CHEST_MILESTONES = [
  { score: 30, chests: 1 },
  { score: 50, chests: 1 },
  { score: 80, chests: 1 },
  { score: 100, chests: 1 },
];
const MOCK_TIMER_CHEST_ARTIFACTS_PER_CHEST = 2;
const MOCK_TIMER_CHEST_OPEN_DURATION_MS = 3 * 60 * 60 * 1000;
const MOCK_TIMER_CHEST_SLOT_COUNT = 8;

const normalizeMockAttemptMode = (value, fallback = MOCK_ATTEMPT_MODE_CLASSIC) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === MOCK_ATTEMPT_MODE_TIMER) return MOCK_ATTEMPT_MODE_TIMER;
  if (normalized === MOCK_ATTEMPT_MODE_CLASSIC) return MOCK_ATTEMPT_MODE_CLASSIC;
  return fallback;
};

const normalizeMockTimerTimestamp = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const getMockTimerExpiresAt = (startedAt, durationMs = MOCK_EXAM_TIMER_DURATION_MS) => {
  const start = Date.parse(String(startedAt || ''));
  const duration = Math.max(60 * 1000, Math.floor(Number(durationMs) || MOCK_EXAM_TIMER_DURATION_MS));
  if (!Number.isFinite(start)) return '';
  return new Date(start + duration).toISOString();
};

const normalizeMockScore = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor(num)));
};

const getMockPrimaryScoreFromSolved = (solvedMap) => {
  const solved = solvedMap && typeof solvedMap === 'object' ? solvedMap : {};
  return MOCK_TASK_NUMBERS.reduce((sum, taskNumber) => (
    solved[String(taskNumber)] ? sum + (taskNumber === 26 || taskNumber === 27 ? 2 : 1) : sum
  ), 0);
};

const getMockSecondaryScoreFromSolved = (solvedMap) => {
  const primaryScore = Math.max(0, Math.min(29, getMockPrimaryScoreFromSolved(solvedMap)));
  if (primaryScore <= 0) return 0;
  return normalizeMockScore(MOCK_PRIMARY_TO_SECONDARY[primaryScore] || 0);
};

const normalizeMockCoinMilestones = (value) => {
  if (!Array.isArray(value)) return [];
  const allowedScores = new Set(MOCK_COIN_MILESTONES.map((milestone) => milestone.score));
  return [...new Set(
    value
      .map((item) => normalizeMockScore(item))
      .filter((score) => allowedScores.has(score))
  )].sort((left, right) => left - right);
};

const getMockCoinMilestoneScoresForScore = (score) => {
  const normalizedScore = normalizeMockScore(score);
  return MOCK_COIN_MILESTONES
    .filter((milestone) => normalizedScore >= milestone.score)
    .map((milestone) => milestone.score);
};

const getMockCoinsForMilestones = (milestoneScores) => {
  const scores = new Set(normalizeMockCoinMilestones(milestoneScores));
  return normalizeCoinsTotal(MOCK_COIN_MILESTONES.reduce((sum, milestone) => (
    scores.has(milestone.score) ? sum + milestone.coins : sum
  ), 0));
};

const getMockChestsForMilestones = (milestoneScores) => {
  const scores = new Set(normalizeMockCoinMilestones(milestoneScores));
  return normalizeCoinsTotal(MOCK_TIMER_CHEST_MILESTONES.reduce((sum, milestone) => (
    scores.has(milestone.score) ? sum + milestone.chests : sum
  ), 0));
};

const getPreviouslyAwardedMockCoinMilestones = (attempt) => {
  if (!attempt || typeof attempt !== 'object') return [];
  if (normalizeMockAttemptMode(attempt.mode) === MOCK_ATTEMPT_MODE_TIMER) return [];
  const explicit = normalizeMockCoinMilestones(attempt.coinsAwardedMilestones);
  if (explicit.length > 0) return explicit;
  const legacyScore = normalizeMockScore(attempt.coinsAwardedScore ?? attempt.coinsAwarded);
  return getMockCoinMilestoneScoresForScore(legacyScore);
};

const getPreviouslyAwardedMockTimerChestMilestones = (attempt) => {
  if (!attempt || typeof attempt !== 'object') return [];
  return normalizeMockCoinMilestones(attempt.timerChestAwardedMilestones);
};

const normalizeMockTimerChestPendingReward = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const artifactIds = (Array.isArray(value.artifactIds) ? value.artifactIds : [])
    .map((artifactId) => normalizeArtifactId(artifactId))
    .filter((artifactId) => artifactId && ARTIFACT_CATALOG_BY_ID.has(artifactId))
    .slice(0, MOCK_TIMER_CHEST_ARTIFACTS_PER_CHEST);
  const profileThemeIds = (Array.isArray(value.profileThemeIds) ? value.profileThemeIds : [])
    .map((themeId) => normalizeProfileThemeId(themeId))
    .filter((themeId) => themeId && PROFILE_THEME_CATALOG_BY_ID.has(themeId))
    .slice(0, 1);
  if (artifactIds.length <= 0 && profileThemeIds.length <= 0) return null;
  const preparedAt = typeof value.preparedAt === 'string' && !Number.isNaN(Date.parse(value.preparedAt))
    ? new Date(value.preparedAt).toISOString()
    : new Date().toISOString();
  return {
    preparedAt,
    artifactIds,
    ...(profileThemeIds.length > 0 ? { profileThemeIds } : {}),
  };
};

const normalizeMockTimerChestQueue = (value) => (
  (Array.isArray(value) ? value : [])
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object') return null;
      const id = typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : '';
      if (!id) return null;
      const createdAt = typeof raw.createdAt === 'string' && raw.createdAt.trim()
        ? raw.createdAt.trim()
        : new Date(0).toISOString();
      const openStartedAt = typeof raw.openStartedAt === 'string' && raw.openStartedAt.trim()
        ? raw.openStartedAt.trim()
        : '';
      const openReadyAt = typeof raw.openReadyAt === 'string' && raw.openReadyAt.trim()
        ? raw.openReadyAt.trim()
        : '';
      const mockExamId = typeof raw.mockExamId === 'string' && raw.mockExamId.trim()
        ? raw.mockExamId.trim()
        : '';
      const mockExamTitle = typeof raw.mockExamTitle === 'string' && raw.mockExamTitle.trim()
        ? raw.mockExamTitle.trim().slice(0, 120)
        : '';
      const milestoneScore = normalizeMockScore(raw.milestoneScore);
      const chestIndex = Math.max(1, Math.floor(Number(raw.chestIndex) || (index + 1)));
      const pendingReward = normalizeMockTimerChestPendingReward(raw.pendingReward);
      return {
        id,
        source: 'mock-timer-chest',
        createdAt,
        ...(mockExamId ? { mockExamId } : {}),
        ...(mockExamTitle ? { mockExamTitle } : {}),
        ...(milestoneScore > 0 ? { milestoneScore } : {}),
        chestIndex,
        coinsGained: normalizeCoinsTotal(raw.coinsGained),
        ...(openStartedAt ? { openStartedAt } : {}),
        ...(openReadyAt ? { openReadyAt } : {}),
        ...(pendingReward ? { pendingReward } : {}),
      };
    })
    .filter(Boolean)
);

const getMockTimerChestState = (chest, nowMs = Date.now()) => {
  const readyAtMs = Date.parse(chest?.openReadyAt || '');
  if (Number.isFinite(readyAtMs)) {
    return readyAtMs <= nowMs ? 'ready' : 'opening';
  }
  return 'closed';
};

const serializeMockTimerChest = (chest, now = new Date()) => {
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const state = getMockTimerChestState(chest, nowMs);
  const readyAtMs = Date.parse(chest?.openReadyAt || '');
  return {
    id: String(chest?.id || ''),
    state,
    source: 'mock-timer-chest',
    createdAt: chest?.createdAt || '',
    mockExamId: chest?.mockExamId || '',
    mockExamTitle: chest?.mockExamTitle || '',
    milestoneScore: normalizeMockScore(chest?.milestoneScore),
    chestIndex: Math.max(1, Math.floor(Number(chest?.chestIndex) || 1)),
    openDurationMs: MOCK_TIMER_CHEST_OPEN_DURATION_MS,
    remainingMs: state === 'opening' && Number.isFinite(readyAtMs)
      ? Math.max(0, readyAtMs - nowMs)
      : 0,
    ...(chest?.openStartedAt ? { openStartedAt: chest.openStartedAt } : {}),
    ...(chest?.openReadyAt ? { openReadyAt: chest.openReadyAt } : {}),
  };
};

const buildMockTimerChestPanelState = (data, now = new Date()) => {
  const queue = normalizeMockTimerChestQueue(data?.mockTimerChests);
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const chests = queue.map((chest) => serializeMockTimerChest(chest, now));
  const openingCount = chests.filter((chest) => chest.state === 'opening').length;
  const readyCount = chests.filter((chest) => chest.state === 'ready').length;
  const closedCount = chests.filter((chest) => chest.state === 'closed').length;
  return {
    slotCount: MOCK_TIMER_CHEST_SLOT_COUNT,
    openDurationMs: MOCK_TIMER_CHEST_OPEN_DURATION_MS,
    chests,
    visibleChests: chests.slice(0, MOCK_TIMER_CHEST_SLOT_COUNT),
    overflowCount: Math.max(0, chests.length - MOCK_TIMER_CHEST_SLOT_COUNT),
    closedCount,
    openingCount,
    readyCount,
    totalCount: chests.length,
    canStartOpening: !queue.some((chest) => getMockTimerChestState(chest, nowMs) === 'opening'),
  };
};

const createMockTimerChestPendingReward = (data, preparedAt = new Date().toISOString()) => {
  let artifactTotalPulls = normalizeArtifactTotalPulls(data?.artifactTotalPulls);
  const artifactIds = [];
  for (let itemIndex = 0; itemIndex < MOCK_TIMER_CHEST_ARTIFACTS_PER_CHEST; itemIndex += 1) {
    const artifact = rollArtifactReward({ totalPullsBefore: artifactTotalPulls });
    if (!artifact?.id) continue;
    artifactIds.push(artifact.id);
    artifactTotalPulls += 1;
  }
  const profileThemeIds = [];
  if (Math.random() < PROFILE_THEME_DROP_CHANCE) {
    const profileTheme = rollProfileThemeReward();
    if (profileTheme?.id) profileThemeIds.push(profileTheme.id);
  }
  return normalizeMockTimerChestPendingReward({
    preparedAt,
    artifactIds,
    profileThemeIds,
  });
};

const buildMockTimerChestRewardSnapshot = (chest, pendingReward, data, openedAt = new Date().toISOString()) => {
  const safeChest = chest && typeof chest === 'object' ? chest : {};
  const safePendingReward = normalizeMockTimerChestPendingReward(pendingReward)
    || createMockTimerChestPendingReward(data, openedAt)
    || { preparedAt: openedAt, artifactIds: [] };
  const pulledAt = safePendingReward.preparedAt || openedAt;
  const artifactInventory = normalizeArtifactInventory(data?.artifactInventory);
  const artifactLevels = normalizeArtifactLevels(data?.artifactLevels, artifactInventory);
  const artifactCards = normalizeArtifactCards(data?.artifactCards, artifactInventory);
  const profileThemeInventory = normalizeProfileThemeInventory(data?.profileThemeInventory);
  let activeProfileThemeId = normalizeActiveProfileThemeId(data?.activeProfileThemeId, profileThemeInventory);
  let artifactTotalPulls = normalizeArtifactTotalPulls(data?.artifactTotalPulls);
  let xpTotal = normalizeXpTotal(data?.xpTotal);
  let coinsTotal = normalizeCoinsTotal(data?.coinsTotal) + normalizeCoinsTotal(safeChest.coinsGained);
  let artifactXpGained = 0;
  let artifactCoinsGained = 0;
  let profileThemeCoinsGained = 0;
  const artifactDropRecords = [];
  const profileThemeDropRecords = [];

  safePendingReward.artifactIds.forEach((artifactId, itemIndex) => {
    const artifact = ARTIFACT_CATALOG_BY_ID.get(normalizeArtifactId(artifactId));
    if (!artifact) return;
    const artifactLevelBeforePull = getArtifactLevel(artifactLevels, artifact.id);
    const maxLevelDuplicateCoins = artifactLevelBeforePull >= ARTIFACT_MAX_LEVEL
      ? getArtifactMaxLevelDuplicateCoinReward(artifact)
      : 0;
    artifactInventory[artifact.id] = getArtifactInventoryCount(artifactInventory, artifact.id) + 1;
    artifactCards[artifact.id] = getArtifactInventoryCount(artifactCards, artifact.id) + 1;
    if (!artifactLevels[artifact.id]) artifactLevels[artifact.id] = 1;
    artifactTotalPulls += 1;
    const instantReward = getArtifactInstantRewardForPull(artifact.id);
    const dropXpGained = normalizeXpTotal(instantReward.xp);
    const dropCoinsGained = normalizeCoinsTotal(instantReward.coins + maxLevelDuplicateCoins);
    artifactXpGained += dropXpGained;
    artifactCoinsGained += dropCoinsGained;
    xpTotal += dropXpGained;
    coinsTotal += dropCoinsGained;
    artifactDropRecords.push({
      artifactId: artifact.id,
      pulledAt,
      maxLevelDuplicateCoins,
      source: 'mock-timer-chest',
      mockExamId: safeChest.mockExamId || '',
      mockExamTitle: safeChest.mockExamTitle || '',
      milestoneScore: normalizeMockScore(safeChest.milestoneScore),
      chestIndex: Math.max(1, Math.floor(Number(safeChest.chestIndex) || 1)),
      chestItemIndex: itemIndex + 1,
    });
  });

  (Array.isArray(safePendingReward.profileThemeIds) ? safePendingReward.profileThemeIds : []).forEach((themeId, themeIndex) => {
    const profileTheme = PROFILE_THEME_CATALOG_BY_ID.get(normalizeProfileThemeId(themeId));
    if (!profileTheme) return;
    const ownedBefore = getProfileThemeInventoryCount(profileThemeInventory, profileTheme.id);
    const isNew = ownedBefore <= 0;
    const duplicateCoins = isNew ? 0 : getProfileThemeDuplicateCoinReward(profileTheme);
    profileThemeInventory[profileTheme.id] = ownedBefore + 1;
    profileThemeCoinsGained += duplicateCoins;
    coinsTotal += duplicateCoins;
    if (!activeProfileThemeId || (isNew && isProfileThemeUpgrade(profileTheme.id, activeProfileThemeId))) {
      activeProfileThemeId = profileTheme.id;
    }
    profileThemeDropRecords.push({
      themeId: profileTheme.id,
      source: 'mock-timer-chest',
      pulledAt,
      isNew,
      duplicateCoins,
      mockExamId: safeChest.mockExamId || '',
      mockExamTitle: safeChest.mockExamTitle || '',
      milestoneScore: normalizeMockScore(safeChest.milestoneScore),
      chestIndex: Math.max(1, Math.floor(Number(safeChest.chestIndex) || 1)),
      chestItemIndex: safePendingReward.artifactIds.length + themeIndex + 1,
    });
  });

  const mockArtifactDrops = artifactDropRecords
    .map((record) => {
      const drop = buildArtifactRewardPayload(
        record.artifactId,
        artifactInventory,
        record.pulledAt,
        artifactLevels,
        artifactCards,
        coinsTotal,
        { maxLevelDuplicateCoins: record.maxLevelDuplicateCoins }
      );
      if (!drop) return null;
      return {
        ...drop,
        source: 'mock-timer-chest',
        mockExamId: record.mockExamId,
        mockExamTitle: record.mockExamTitle,
        milestoneScore: record.milestoneScore,
        chestIndex: record.chestIndex,
        chestItemIndex: record.chestItemIndex,
      };
    })
    .filter(Boolean);

  const mockProfileThemeDrops = profileThemeDropRecords
    .map((record) => {
      const drop = buildProfileThemeRewardPayload(record.themeId, profileThemeInventory, {
        isNew: record.isNew,
        duplicateCoins: record.duplicateCoins,
        source: 'mock-timer-chest',
      });
      if (!drop) return null;
      return {
        ...drop,
        mockExamId: record.mockExamId,
        mockExamTitle: record.mockExamTitle,
        milestoneScore: record.milestoneScore,
        chestIndex: record.chestIndex,
        chestItemIndex: record.chestItemIndex,
      };
    })
    .filter(Boolean);

  const mockChestReward = {
    id: String(safeChest.id || ''),
    source: 'mock-timer-chest',
    mockExamId: safeChest.mockExamId || '',
    mockExamTitle: safeChest.mockExamTitle || '',
    milestoneScore: normalizeMockScore(safeChest.milestoneScore),
    chestIndex: Math.max(1, Math.floor(Number(safeChest.chestIndex) || 1)),
    coinsGained: normalizeCoinsTotal(safeChest.coinsGained),
    artifacts: mockArtifactDrops,
    profileThemes: mockProfileThemeDrops,
  };

  return {
    pendingReward: safePendingReward,
    mockChestReward,
    mockArtifactDrops,
    artifactDropRecords,
    artifactInventory,
    artifactLevels,
    artifactCards,
    artifactTotalPulls,
    profileThemeInventory,
    activeProfileThemeId,
    xpTotal: normalizeXpTotal(xpTotal),
    coinsTotal: normalizeCoinsTotal(coinsTotal),
    artifactXpGained: normalizeXpTotal(artifactXpGained),
    artifactCoinsGained: normalizeCoinsTotal(artifactCoinsGained),
    profileThemeCoinsGained: normalizeCoinsTotal(profileThemeCoinsGained),
  };
};

const deriveCoinsFromMockAttempts = (mockAttempts) => {
  if (!mockAttempts || typeof mockAttempts !== 'object') return 0;
  return normalizeCoinsTotal(Object.values(mockAttempts).reduce((sum, attempt) => {
    if (!attempt || typeof attempt !== 'object') return sum;
    return sum + getMockCoinsForMilestones(getPreviouslyAwardedMockCoinMilestones(attempt));
  }, 0));
};

const deriveXpFromMockAttempts = (mockAttempts, artifactLevels = null) => {
  if (!mockAttempts || typeof mockAttempts !== 'object') return 0;
  return normalizeXpTotal(Object.values(mockAttempts).reduce((sum, attempt) => {
    if (!attempt || typeof attempt !== 'object') return sum;
    const mode = normalizeMockAttemptMode(attempt.mode);
    if (mode === MOCK_ATTEMPT_MODE_TIMER && (attempt.timerRewardsDisabled === true || !attempt.timerFinishedAt)) {
      return sum;
    }
    const solvedMap = attempt.solvedEver && typeof attempt.solvedEver === 'object' && !Array.isArray(attempt.solvedEver)
      ? attempt.solvedEver
      : (attempt.solved && typeof attempt.solved === 'object' && !Array.isArray(attempt.solved) ? attempt.solved : {});
    return sum + Object.entries(solvedMap).reduce((attemptSum, [taskKey, isSolved]) => {
      if (!isSolved) return attemptSum;
      return attemptSum + getArtifactAdjustedTaskLevelXpReward(taskKey, MOCK_EXAM_SOLVE_XP_LEVEL_ID, artifactLevels);
    }, 0);
  }, 0));
};

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

const hasMockAttemptAnswerValue = (value, count = 1) => {
  if (count <= 1) return Boolean(String(value ?? '').trim());
  const values = Array.isArray(value) ? value : parseMockAttemptAnswers(value, count);
  return values.some((item) => Boolean(String(item ?? '').trim()));
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

const hasMockAttemptStarted = (exam, answers = {}) => {
  const tasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  return Object.keys(tasks).some((taskKey) => {
    const answerCount = getMockAnswerCountForTask(taskKey);
    return hasMockAttemptAnswerValue(answers?.[taskKey], answerCount);
  });
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

const normalizeMockAttemptPayload = (exam, rawAnswers, updatedAt, meta = {}) => {
  const answers = normalizeMockAttemptAnswers(exam, rawAnswers);
  const solved = recomputeMockSolvedMap(exam, answers);
  const mode = normalizeMockAttemptMode(meta?.mode || meta?.attemptMode);
  const modeLockedAt = typeof meta?.modeLockedAt === 'string' && meta.modeLockedAt.trim()
    ? meta.modeLockedAt.trim()
    : '';
  const timerStartedAt = mode === MOCK_ATTEMPT_MODE_TIMER
    ? normalizeMockTimerTimestamp(meta?.timerStartedAt)
    : '';
  const timerDurationMs = mode === MOCK_ATTEMPT_MODE_TIMER
    ? Math.max(60 * 1000, Math.floor(Number(meta?.timerDurationMs) || MOCK_EXAM_TIMER_DURATION_MS))
    : 0;
  const timerExpiresAt = mode === MOCK_ATTEMPT_MODE_TIMER
    ? normalizeMockTimerTimestamp(meta?.timerExpiresAt) || getMockTimerExpiresAt(timerStartedAt, timerDurationMs)
    : '';
  const timerFinishedAt = mode === MOCK_ATTEMPT_MODE_TIMER
    ? normalizeMockTimerTimestamp(meta?.timerFinishedAt)
    : '';
  const timerPausedAt = mode === MOCK_ATTEMPT_MODE_TIMER
    ? normalizeMockTimerTimestamp(meta?.timerPausedAt)
    : '';
  const timerRemainingMs = mode === MOCK_ATTEMPT_MODE_TIMER && timerPausedAt
    ? Math.max(0, Math.floor(Number(meta?.timerRemainingMs) || 0))
    : 0;
  const previousSolvedEver = meta?.solvedEver && typeof meta.solvedEver === 'object' && !Array.isArray(meta.solvedEver)
    ? meta.solvedEver
    : (meta?.solved && typeof meta.solved === 'object' && !Array.isArray(meta.solved) ? meta.solved : {});
  const solvedEver = { ...solved };
  Object.entries(previousSolvedEver).forEach(([taskKey, wasSolved]) => {
    if (wasSolved && Object.prototype.hasOwnProperty.call(solvedEver, taskKey)) solvedEver[taskKey] = true;
  });
  Object.entries(solved).forEach(([taskKey, isSolved]) => {
    if (isSolved) solvedEver[taskKey] = true;
  });
  const coinsAwardedMilestones = getPreviouslyAwardedMockCoinMilestones(meta);
  const coinsAwardedAt = typeof meta?.coinsAwardedAt === 'string' && meta.coinsAwardedAt.trim()
    ? meta.coinsAwardedAt.trim()
    : '';
  const timerChestAwardedMilestones = getPreviouslyAwardedMockTimerChestMilestones(meta);
  const timerChestAwardedAt = typeof meta?.timerChestAwardedAt === 'string' && meta.timerChestAwardedAt.trim()
    ? meta.timerChestAwardedAt.trim()
    : '';
  const timerRewardsDisabled = meta?.timerRewardsDisabled === true;
  return {
    answers,
    solved,
    solvedEver,
    mode,
    ...(modeLockedAt ? { modeLockedAt } : {}),
    ...(timerStartedAt ? { timerStartedAt } : {}),
    ...(timerDurationMs > 0 ? { timerDurationMs } : {}),
    ...(timerExpiresAt ? { timerExpiresAt } : {}),
    ...(timerFinishedAt ? { timerFinishedAt } : {}),
    ...(timerPausedAt ? { timerPausedAt } : {}),
    ...(timerPausedAt ? { timerRemainingMs } : {}),
    updatedAt: typeof updatedAt === 'string' && updatedAt.trim()
      ? updatedAt
      : new Date().toISOString(),
    coinsAwardedMilestones,
    coinsAwardedTotal: getMockCoinsForMilestones(coinsAwardedMilestones),
    ...(coinsAwardedAt ? { coinsAwardedAt } : {}),
    ...(timerChestAwardedMilestones.length > 0 ? { timerChestAwardedMilestones } : {}),
    ...(timerChestAwardedMilestones.length > 0 ? { timerChestAwardedTotal: getMockChestsForMilestones(timerChestAwardedMilestones) } : {}),
    ...(timerChestAwardedAt ? { timerChestAwardedAt } : {}),
    ...(timerRewardsDisabled ? { timerRewardsDisabled: true } : {}),
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
  if (!raw) {
    return {
      progress: {},
      notes: '',
      notesByTask: {},
      mocks: [],
      schedule: [],
      solvedByTask: {},
      solvedEvents: [],
      streak: getDefaultStreak(),
      nextLesson: { homeWork: '', lessonLink: '', boardLink: '', targetQuestions: [], goals: [] },
      homeworks: [],
      mockAttempts: {},
      xpTotal: 0,
      coinsTotal: 0,
      mockTimerChestsTotal: 0,
      mockTimerChests: [],
      coinsSpentTotal: 0,
      xpBalanceVersion: STUDENT_XP_BALANCE_VERSION,
      xpRecentRebalanceVersion: STUDENT_RECENT_XP_REBALANCE_VERSION,
      xpRecentRebalanceAppliedAt: null,
      alexanderWeekStartXpFixVersion: ALEXANDER_WEEK_START_XP_FIX_VERSION,
      alexanderWeekStartXpFixAppliedAt: null,
      artifactInventory: {},
      artifactLevels: {},
      artifactCards: {},
      artifactLastPull: null,
      artifactTotalPulls: 0,
      profileThemeInventory: {},
      activeProfileThemeId: '',
      leaderboardAlias: '',
      leaderboardAliasRewardClaimed: false,
    };
  }
  if (
    raw.progress
    || raw.notes
    || raw.notesByTask
    || raw.mocks
    || raw.schedule
    || raw.solvedByTask
    || raw.streak
    || raw.mockAttempts
    || Object.prototype.hasOwnProperty.call(raw, 'xpTotal')
    || Object.prototype.hasOwnProperty.call(raw, 'coinsTotal')
    || Object.prototype.hasOwnProperty.call(raw, 'xpBalanceVersion')
    || Object.prototype.hasOwnProperty.call(raw, 'xpRecentRebalanceVersion')
    || Object.prototype.hasOwnProperty.call(raw, 'xpRecentRebalanceRepairedAt')
    || Object.prototype.hasOwnProperty.call(raw, 'alexanderWeekStartXpFixVersion')
    || Object.prototype.hasOwnProperty.call(raw, 'mockTimerChestsTotal')
    || Object.prototype.hasOwnProperty.call(raw, 'mockTimerChests')
    || Object.prototype.hasOwnProperty.call(raw, 'coinsSpentTotal')
    || Object.prototype.hasOwnProperty.call(raw, 'artifactInventory')
    || Object.prototype.hasOwnProperty.call(raw, 'artifactLevels')
    || Object.prototype.hasOwnProperty.call(raw, 'artifactCards')
    || Object.prototype.hasOwnProperty.call(raw, 'artifactLastPull')
    || Object.prototype.hasOwnProperty.call(raw, 'artifactTotalPulls')
    || Object.prototype.hasOwnProperty.call(raw, 'profileThemeInventory')
    || Object.prototype.hasOwnProperty.call(raw, 'activeProfileThemeId')
    || Object.prototype.hasOwnProperty.call(raw, 'leaderboardAlias')
    || Object.prototype.hasOwnProperty.call(raw, 'leaderboardAliasRewardClaimed')
  ) {
    const progress = raw.progress && typeof raw.progress === 'object' && !Array.isArray(raw.progress) ? raw.progress : {};
    const solvedByTask = raw.solvedByTask && typeof raw.solvedByTask === 'object' ? raw.solvedByTask : {};
    const solvedEvents = Array.isArray(raw.solvedEvents) ? raw.solvedEvents : [];
    const artifactInventory = normalizeArtifactInventory(raw.artifactInventory);
    const artifactLevels = normalizeArtifactLevels(raw.artifactLevels, artifactInventory);
    const artifactCards = normalizeArtifactCards(raw.artifactCards, artifactInventory);
    const profileThemeInventory = normalizeProfileThemeInventory(raw.profileThemeInventory);
    const activeProfileThemeId = normalizeActiveProfileThemeId(raw.activeProfileThemeId, profileThemeInventory);
    const instantArtifactRewards = getArtifactInstantRewardsFromInventory(artifactInventory);
    const hasStoredXp = Object.prototype.hasOwnProperty.call(raw, 'xpTotal');
    const hasStoredCoins = Object.prototype.hasOwnProperty.call(raw, 'coinsTotal');
    const hasStoredCoinsSpent = Object.prototype.hasOwnProperty.call(raw, 'coinsSpentTotal');
    const leaderboardAlias = normalizeLeaderboardAlias(raw.leaderboardAlias);
    const derivedSolvedXp = deriveXpFromSolvedByTask(solvedByTask);
    const derivedEventsXp = deriveXpFromSolvedEvents(solvedEvents, artifactLevels);
    const derivedLegacyProgressXp = deriveXpFromLegacyProgress(progress);
    const derivedMockXp = deriveXpFromMockAttempts(raw.mockAttempts);
    const derivedSolvedCoins = deriveCoinsFromSolvedByTask(solvedByTask);
    const derivedEventsCoins = deriveCoinsFromSolvedEvents(solvedEvents);
    const derivedMockCoins = deriveCoinsFromMockAttempts(raw.mockAttempts);
    const derivedXp = Math.max(
      Math.max(derivedSolvedXp, derivedLegacyProgressXp) + derivedMockXp,
      derivedEventsXp
    );
    const derivedCoins = Math.max(derivedSolvedCoins, derivedEventsCoins) + derivedMockCoins;
    const coinsSpentTotal = normalizeCoinsSpentTotal(raw.coinsSpentTotal);
    const minXpTotal = normalizeXpTotal(derivedXp + instantArtifactRewards.xp);
    const minCoinsTotal = Math.max(0, normalizeCoinsTotal(derivedCoins + instantArtifactRewards.coins) - coinsSpentTotal);
    const storedXpTotal = normalizeXpTotal(raw.xpTotal);
    const xpTotal = hasStoredXp ? storedXpTotal : minXpTotal;
    let coinsTotal = hasStoredCoins
      ? normalizeCoinsTotal(raw.coinsTotal)
      : minCoinsTotal;
    if (!hasStoredCoinsSpent && coinsTotal < minCoinsTotal) {
      coinsTotal = minCoinsTotal;
    } else if (coinsTotal < minCoinsTotal) {
      coinsTotal = minCoinsTotal;
    }
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
      xpTotal,
      coinsTotal,
      mockTimerChestsTotal: normalizeCoinsTotal(raw.mockTimerChestsTotal),
      mockTimerChests: normalizeMockTimerChestQueue(raw.mockTimerChests),
      coinsSpentTotal,
      xpBalanceVersion: STUDENT_XP_BALANCE_VERSION,
      xpRecentRebalanceVersion: normalizeStudentRecentXpRebalanceVersion(raw.xpRecentRebalanceVersion),
      xpRecentRebalanceAppliedAt: typeof raw.xpRecentRebalanceAppliedAt === 'string' ? raw.xpRecentRebalanceAppliedAt : null,
      xpRecentRebalanceRepairedAt: typeof raw.xpRecentRebalanceRepairedAt === 'string' ? raw.xpRecentRebalanceRepairedAt : null,
      alexanderWeekStartXpFixVersion: normalizeAlexanderWeekStartXpFixVersion(raw.alexanderWeekStartXpFixVersion),
      alexanderWeekStartXpFixAppliedAt: typeof raw.alexanderWeekStartXpFixAppliedAt === 'string' ? raw.alexanderWeekStartXpFixAppliedAt : null,
      artifactInventory,
      artifactLevels,
      artifactCards,
      artifactLastPull: normalizeArtifactLastPull(raw.artifactLastPull),
      artifactTotalPulls: normalizeArtifactTotalPulls(raw.artifactTotalPulls),
      profileThemeInventory,
      activeProfileThemeId,
      leaderboardAlias,
      leaderboardAliasRewardClaimed: Boolean(raw.leaderboardAliasRewardClaimed) || Boolean(leaderboardAlias),
    };
  }
  const legacyProgress = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const legacyXp = deriveXpFromLegacyProgress(legacyProgress);
  return {
    progress: legacyProgress,
    notes: '',
    notesByTask: {},
    mocks: [],
    schedule: [],
    solvedByTask: {},
    solvedEvents: [],
    streak: getDefaultStreak(),
    nextLesson: { homeWork: '', lessonLink: '', boardLink: '', targetQuestions: [], goals: [] },
    homeworks: [],
    mockAttempts: {},
    xpTotal: legacyXp,
    coinsTotal: 0,
    mockTimerChestsTotal: 0,
    mockTimerChests: [],
    coinsSpentTotal: 0,
    xpBalanceVersion: STUDENT_XP_BALANCE_VERSION,
    xpRecentRebalanceVersion: STUDENT_RECENT_XP_REBALANCE_VERSION,
    xpRecentRebalanceAppliedAt: null,
    alexanderWeekStartXpFixVersion: ALEXANDER_WEEK_START_XP_FIX_VERSION,
    alexanderWeekStartXpFixAppliedAt: null,
    artifactInventory: {},
    artifactLevels: {},
    artifactCards: {},
    artifactLastPull: null,
    artifactTotalPulls: 0,
    profileThemeInventory: {},
    activeProfileThemeId: '',
    leaderboardAlias: '',
    leaderboardAliasRewardClaimed: false,
  };
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
    coinsTotal: normalizeCoinsTotal(data.coinsTotal),
    mockTimerChestsTotal: normalizeCoinsTotal(data.mockTimerChestsTotal),
    mockTimerChests: normalizeMockTimerChestQueue(data.mockTimerChests),
    coinsSpentTotal: normalizeCoinsSpentTotal(data.coinsSpentTotal),
    xpBalanceVersion: STUDENT_XP_BALANCE_VERSION,
    xpRecentRebalanceVersion: normalizeStudentRecentXpRebalanceVersion(data.xpRecentRebalanceVersion),
    xpRecentRebalanceAppliedAt: typeof data.xpRecentRebalanceAppliedAt === 'string' ? data.xpRecentRebalanceAppliedAt : null,
    xpRecentRebalanceRepairedAt: typeof data.xpRecentRebalanceRepairedAt === 'string' ? data.xpRecentRebalanceRepairedAt : null,
    alexanderWeekStartXpFixVersion: normalizeAlexanderWeekStartXpFixVersion(data.alexanderWeekStartXpFixVersion),
    alexanderWeekStartXpFixAppliedAt: typeof data.alexanderWeekStartXpFixAppliedAt === 'string' ? data.alexanderWeekStartXpFixAppliedAt : null,
    artifactInventory: normalizeArtifactInventory(data.artifactInventory),
    artifactLevels: normalizeArtifactLevels(data.artifactLevels, data.artifactInventory),
    artifactCards: normalizeArtifactCards(data.artifactCards, data.artifactInventory),
    artifactLastPull: normalizeArtifactLastPull(data.artifactLastPull),
    artifactTotalPulls: normalizeArtifactTotalPulls(data.artifactTotalPulls),
    profileThemeInventory: normalizeProfileThemeInventory(data.profileThemeInventory),
    activeProfileThemeId: normalizeActiveProfileThemeId(data.activeProfileThemeId, data.profileThemeInventory),
    leaderboardAlias: normalizeLeaderboardAlias(data.leaderboardAlias),
    leaderboardAliasRewardClaimed: Boolean(data.leaderboardAliasRewardClaimed),
  };
  db[studentId] = payload;
  writeProgressDb(db);
  return payload;
};

const createProgressBackup = (label) => {
  if (!fs.existsSync(progressFile)) return null;
  const safeLabel = String(label || 'backup').replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'backup';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(dataDir, `progress.${safeLabel}.${timestamp}.json`);
  fs.copyFileSync(progressFile, backupFile);
  return backupFile;
};

const rebalanceStudentXpBalance = ({ apply = false } = {}) => {
  const db = readProgressDb();
  const studentById = new Map(readStudentsDb().map((student) => [student.id, student]));
  const window = getRecentXpRebalanceWindow();
  const candidates = Object.entries(db).filter(([, raw]) => (
    raw
    && typeof raw === 'object'
    && !Array.isArray(raw)
    && normalizeStudentRecentXpRebalanceVersion(raw.xpRecentRebalanceVersion) < STUDENT_RECENT_XP_REBALANCE_VERSION
  ));
  const changed = [];
  let loweredCount = 0;
  let unchangedCount = 0;
  let increasedCount = 0;
  let initializedCount = 0;
  let totalRemovedXp = 0;
  let totalCurrentDelta = 0;
  let backupFile = null;
  const appliedAt = new Date().toISOString();

  candidates.forEach(([studentId, raw]) => {
    const student = studentById.get(studentId) || null;
    const hasStoredXp = Object.prototype.hasOwnProperty.call(raw, 'xpTotal');
    const oldXpTotal = normalizeXpTotal(raw.xpTotal);
    const oldBalanceVersion = normalizeStudentXpBalanceVersion(raw.xpBalanceVersion);
    const oldRecentRebalanceVersion = normalizeStudentRecentXpRebalanceVersion(raw.xpRecentRebalanceVersion);
    const normalized = getStudentData(studentId);
    const recentStats = getRecentXpRebalanceStats(normalized, window);
    const nextXpTotal = hasStoredXp
      ? normalizeXpTotal(oldXpTotal - recentStats.oldRecentXp + recentStats.newRecentXp)
      : normalizeXpTotal(normalized?.xpTotal);

    const delta = nextXpTotal - oldXpTotal;
    if (!hasStoredXp && nextXpTotal > 0) initializedCount += 1;
    if (delta < 0) {
      loweredCount += 1;
    } else if (delta > 0) {
      increasedCount += 1;
    } else if (delta === 0) {
      unchangedCount += 1;
    }
    totalRemovedXp += recentStats.removedXp;
    totalCurrentDelta += delta;

    changed.push({
      studentId,
      name: normalizeStudentName(student?.name || ''),
      nickname: normalizeStudentNickname(student?.nickname || ''),
      leaderboardAlias: normalizeLeaderboardAlias(normalized?.leaderboardAlias),
      oldBalanceVersion,
      oldRecentRebalanceVersion,
      nextBalanceVersion: STUDENT_XP_BALANCE_VERSION,
      nextRecentRebalanceVersion: STUDENT_RECENT_XP_REBALANCE_VERSION,
      hadStoredXp: hasStoredXp,
      oldXpTotal,
      nextXpTotal,
      delta,
      recentOldXp: recentStats.oldRecentXp,
      recentNewXp: recentStats.newRecentXp,
      recentStoredXp: recentStats.storedRecentXp,
      recentRecalculatedXp: recentStats.recalculatedRecentXp,
      recentRemovedXp: recentStats.removedXp,
    });

    if (apply) {
      if (!backupFile) {
        backupFile = createProgressBackup(`xp-balance-v${STUDENT_XP_BALANCE_VERSION}`);
      }
      db[studentId] = {
        ...raw,
        xpTotal: nextXpTotal,
        xpBalanceVersion: STUDENT_XP_BALANCE_VERSION,
        xpRecentRebalanceVersion: STUDENT_RECENT_XP_REBALANCE_VERSION,
        xpRecentRebalanceAppliedAt: appliedAt,
        xpRecentRebalance: {
          mode: 'recent-solved-events',
          oldXpTotal,
          nextXpTotal,
          delta,
          recentOldXp: recentStats.oldRecentXp,
          recentNewXp: recentStats.newRecentXp,
          recentStoredXp: recentStats.storedRecentXp,
          recentRecalculatedXp: recentStats.recalculatedRecentXp,
          recentRemovedXp: recentStats.removedXp,
          window: {
            days: window.days,
            startDay: window.startDay,
            endDay: window.endDay,
          },
        },
      };
    }
  });

  if (apply && candidates.length > 0) {
    writeProgressDb(db);
  }

  const largestDrops = changed
    .filter((entry) => entry.recentRemovedXp > 0)
    .sort((a, b) => b.recentRemovedXp - a.recentRemovedXp)
    .slice(0, 20);

  return {
    applied: Boolean(apply),
    balanceVersion: STUDENT_XP_BALANCE_VERSION,
    recentRebalanceVersion: STUDENT_RECENT_XP_REBALANCE_VERSION,
    mode: 'recent-solved-events',
    formula: 'xpTotal - recentOldXp + recentNewXp',
    oldArtifactBonuses: RECENT_XP_REBALANCE_PRE_FIX_ARTIFACT_BONUSES,
    window: {
      days: window.days,
      startDay: window.startDay,
      endDay: window.endDay,
    },
    scannedStudents: Object.keys(db).length,
    candidates: candidates.length,
    changed: changed.length,
    lowered: loweredCount,
    increasedFromCurrent: increasedCount,
    unchanged: unchangedCount,
    initialized: initializedCount,
    totalRemovedXp,
    totalCurrentDelta,
    backupFile,
    largestDrops,
  };
};

const repairBadRecentXpRebalance = ({ apply = false } = {}) => {
  const db = readProgressDb();
  const studentById = new Map(readStudentsDb().map((student) => [student.id, student]));
  const candidates = Object.entries(db).filter(([, raw]) => (
    raw
    && typeof raw === 'object'
    && !Array.isArray(raw)
    && normalizeStudentRecentXpRebalanceVersion(raw.xpRecentRebalanceVersion) === STUDENT_BAD_RECENT_XP_REBALANCE_VERSION
    && raw.xpRecentRebalance
    && typeof raw.xpRecentRebalance === 'object'
    && normalizeXpTotal(raw.xpRecentRebalance.oldXpTotal) > normalizeXpTotal(raw.xpTotal)
  ));
  const changed = [];
  let backupFile = null;
  const repairedAt = new Date().toISOString();

  candidates.forEach(([studentId, raw]) => {
    const student = studentById.get(studentId) || null;
    const oldXpTotal = normalizeXpTotal(raw.xpTotal);
    const repairedXpTotal = normalizeXpTotal(raw.xpRecentRebalance.oldXpTotal);
    const delta = repairedXpTotal - oldXpTotal;
    changed.push({
      studentId,
      name: normalizeStudentName(student?.name || ''),
      nickname: normalizeStudentNickname(student?.nickname || ''),
      oldXpTotal,
      repairedXpTotal,
      delta,
      badRecentRebalanceVersion: normalizeStudentRecentXpRebalanceVersion(raw.xpRecentRebalanceVersion),
    });

    if (apply) {
      if (!backupFile) {
        backupFile = createProgressBackup(`xp-rebalance-repair-v${STUDENT_RECENT_XP_REBALANCE_VERSION}`);
      }
      db[studentId] = {
        ...raw,
        xpTotal: repairedXpTotal,
        xpBalanceVersion: STUDENT_XP_BALANCE_VERSION,
        xpRecentRebalanceVersion: STUDENT_RECENT_XP_REBALANCE_VERSION,
        xpRecentRebalanceRepairedAt: repairedAt,
        xpRecentRebalanceRepair: {
          mode: 'restore-before-bad-recent-rebalance',
          oldXpTotal,
          repairedXpTotal,
          delta,
          badRecentRebalance: raw.xpRecentRebalance,
        },
      };
    }
  });

  if (apply && candidates.length > 0) {
    writeProgressDb(db);
  }

  return {
    applied: Boolean(apply),
    repairVersion: STUDENT_RECENT_XP_REBALANCE_VERSION,
    badVersion: STUDENT_BAD_RECENT_XP_REBALANCE_VERSION,
    scannedStudents: Object.keys(db).length,
    candidates: candidates.length,
    changed: changed.length,
    totalRestoredXp: changed.reduce((sum, entry) => sum + Math.max(0, entry.delta), 0),
    backupFile,
    changedStudents: changed,
  };
};

const isAlexanderWeekStartXpFixTarget = (student) => {
  const name = normalizeStudentName(student?.name || '').toLowerCase();
  const nickname = normalizeStudentNickname(student?.nickname || '').toLowerCase();
  return name === ALEXANDER_WEEK_START_XP_NAME
    && nickname.includes(ALEXANDER_WEEK_START_XP_NICKNAME_PART);
};

const applyAlexanderWeekStartXpBaseFix = ({ apply = false } = {}) => {
  const db = readProgressDb();
  const window = getRecentXpRebalanceWindow();
  const students = readStudentsDb().filter((student) => isActiveStudent(student) && isAlexanderWeekStartXpFixTarget(student));
  const changed = [];
  const skipped = [];
  let backupFile = null;
  const appliedAt = new Date().toISOString();

  students.forEach((student) => {
    const raw = db[student.id];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      skipped.push({ studentId: student.id, reason: 'missing-progress' });
      return;
    }
    const currentFixVersion = normalizeAlexanderWeekStartXpFixVersion(raw.alexanderWeekStartXpFixVersion);
    if (currentFixVersion >= ALEXANDER_WEEK_START_XP_FIX_VERSION) {
      skipped.push({ studentId: student.id, reason: 'already-applied', currentFixVersion });
      return;
    }

    const data = getStudentData(student.id);
    const oldXpTotal = normalizeXpTotal(raw.xpTotal);
    const weeklyXp = normalizeXpTotal(
      getRecentXpFromSolvedEvents(data?.solvedEvents, window.endDayNum, window.days, data?.artifactLevels)
    );
    const nextXpTotal = normalizeXpTotal(ALEXANDER_WEEK_START_XP_BASE + weeklyXp);
    const delta = nextXpTotal - oldXpTotal;

    changed.push({
      studentId: student.id,
      name: normalizeStudentName(student.name),
      nickname: normalizeStudentNickname(student.nickname),
      oldXpTotal,
      baseXp: ALEXANDER_WEEK_START_XP_BASE,
      weeklyXp,
      nextXpTotal,
      delta,
      window: {
        days: window.days,
        startDay: window.startDay,
        endDay: window.endDay,
      },
    });

    if (apply) {
      if (!backupFile) {
        backupFile = createProgressBackup(`alexander-week-start-xp-fix-v${ALEXANDER_WEEK_START_XP_FIX_VERSION}`);
      }
      db[student.id] = {
        ...raw,
        xpTotal: nextXpTotal,
        xpBalanceVersion: STUDENT_XP_BALANCE_VERSION,
        alexanderWeekStartXpFixVersion: ALEXANDER_WEEK_START_XP_FIX_VERSION,
        alexanderWeekStartXpFixAppliedAt: appliedAt,
        alexanderWeekStartXpFix: {
          mode: 'week-start-base-plus-weekly-xp',
          baseXp: ALEXANDER_WEEK_START_XP_BASE,
          weeklyXp,
          oldXpTotal,
          nextXpTotal,
          delta,
          window: {
            days: window.days,
            startDay: window.startDay,
            endDay: window.endDay,
          },
        },
      };
    }
  });

  if (apply && changed.length > 0) {
    writeProgressDb(db);
  }

  return {
    applied: Boolean(apply),
    fixVersion: ALEXANDER_WEEK_START_XP_FIX_VERSION,
    target: {
      name: ALEXANDER_WEEK_START_XP_NAME,
      nicknamePart: ALEXANDER_WEEK_START_XP_NICKNAME_PART,
    },
    baseXp: ALEXANDER_WEEK_START_XP_BASE,
    scannedStudents: Object.keys(db).length,
    matchedStudents: students.length,
    changed: changed.length,
    totalDelta: changed.reduce((sum, entry) => sum + entry.delta, 0),
    backupFile,
    skipped,
    changedStudents: changed,
  };
};

const runStudentXpFixes = ({ apply = false } = {}) => ({
  repair: repairBadRecentXpRebalance({ apply }),
  alexanderWeekStart: applyAlexanderWeekStartXpBaseFix({ apply }),
});

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

const normalizeCodeText = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
};

const filterTargetsByCount = (targets, count) => {
  if (!Number.isFinite(count) || count <= 0) return targets;
  return targets.filter((val) => val <= count);
};

const isPythonTaskNumber = (taskNum) => Number.isFinite(taskNum) && taskNum >= 100;
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

const getScheduleSlotId = (entry) => {
  const explicitId = typeof entry?.id === 'string' ? entry.id.trim() : '';
  if (explicitId) return explicitId;
  const weekdayMeta = resolveScheduleWeekdayMeta({
    weekdayKey: entry?.weekdayKey,
    day: entry?.day,
    date: entry?.date,
  });
  const weekdayKey = String(weekdayMeta?.key || entry?.weekdayKey || '').trim().toLowerCase();
  const time = normalizeScheduleTime(entry?.time);
  const date = typeof entry?.date === 'string' ? entry.date.trim() : '';
  if (!weekdayKey && !time && !date) return '';
  return `${weekdayKey}|${time}|${date}`;
};

const getScheduleTimeParts = (value) => {
  const normalized = normalizeScheduleTime(value);
  if (!normalized) return null;
  const parts = normalized.split(':').map((item) => Number(item));
  if (parts.length !== 2) return null;
  const [hours, minutes] = parts;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes, normalized };
};

const toLocalScheduleDayKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLessonReminderOccurrenceCandidatesMs = (entry, nowMs) => {
  const now = Number.isFinite(nowMs) ? new Date(nowMs) : new Date();
  const timeParts = getScheduleTimeParts(entry?.time);
  if (!timeParts) return [];
  const excludedDates = normalizeScheduleExcludedDates(entry?.excludedDates);
  const excludedDateSet = new Set(excludedDates);
  const dateRaw = typeof entry?.date === 'string' ? entry.date.trim() : '';
  if (dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    if (excludedDateSet.has(dateRaw)) return [];
    const exactMs = Date.parse(`${dateRaw}T${timeParts.normalized}:00`);
    return Number.isFinite(exactMs) ? [exactMs] : [];
  }

  const weekdayMeta = resolveScheduleWeekdayMeta({
    weekdayKey: entry?.weekdayKey,
    day: entry?.day,
    date: entry?.date,
  });
  if (!weekdayMeta?.order) return [];

  const todayOrder = now.getDay() === 0 ? 7 : now.getDay();
  const baseDiffDays = weekdayMeta.order - todayOrder;
  const list = [];
  for (let weekShift = -1; weekShift <= 1; weekShift += 1) {
    const candidate = new Date(now);
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + baseDiffDays + (weekShift * 7));
    const candidateDayKey = toLocalScheduleDayKey(candidate);
    if (candidateDayKey && excludedDateSet.has(candidateDayKey)) continue;
    candidate.setHours(timeParts.hours, timeParts.minutes, 0, 0);
    const candidateMs = candidate.getTime();
    if (Number.isFinite(candidateMs)) list.push(candidateMs);
  }
  return list;
};

const findDueLessonReminderOccurrence = (entry, nowMs = Date.now()) => {
  const slotId = getScheduleSlotId(entry);
  if (!slotId) return null;
  const candidates = getLessonReminderOccurrenceCandidatesMs(entry, nowMs);
  if (candidates.length === 0) return null;
  let best = null;
  candidates.forEach((startMs) => {
    if (!Number.isFinite(startMs)) return;
    const reminderAtMs = startMs - LESSON_REMINDER_LEAD_MS;
    const delta = nowMs - reminderAtMs;
    if (delta < 0 || delta > LESSON_REMINDER_SEND_WINDOW_MS) return;
    if (nowMs >= startMs) return;
    if (!best || delta < best.delta) {
      best = { startMs, reminderAtMs, delta };
    }
  });
  if (!best) return null;
  return {
    slotId,
    startMs: best.startMs,
    reminderAtMs: best.reminderAtMs,
    occurrenceKey: new Date(best.startMs).toISOString(),
  };
};

const buildLessonReminderPushPayload = (entry, reminder) => {
  const weekdayMeta = resolveScheduleWeekdayMeta({
    weekdayKey: entry?.weekdayKey,
    day: entry?.day,
    date: entry?.date,
  });
  const dayLabel = String(weekdayMeta?.label || entry?.day || '').trim();
  const timeLabel = normalizeScheduleTime(entry?.time) || '';
  const subjectRaw = typeof entry?.subject === 'string' ? entry.subject.trim() : '';
  const subject = subjectRaw || 'занятие';
  const dateLabel = (() => {
    const date = new Date(reminder?.startMs || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    try {
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(' г.', '');
    } catch {
      return '';
    }
  })();
  const whenLabel = [dayLabel, timeLabel].filter(Boolean).join(', ');
  const bodyBase = whenLabel
    ? `${whenLabel}. ${subject.charAt(0).toUpperCase()}${subject.slice(1)} начнется через ${LESSON_REMINDER_LEAD_MINUTES} мин.`
    : `${subject.charAt(0).toUpperCase()}${subject.slice(1)} начнется через ${LESSON_REMINDER_LEAD_MINUTES} мин.`;
  const body = dateLabel
    ? `${dateLabel} · ${bodyBase}`
    : bodyBase;
  const safeSlotTag = String(reminder?.slotId || 'slot').replace(/[^\w-]/g, '-').slice(0, 80);
  const occurrenceTag = String(reminder?.occurrenceKey || '').replace(/[^\dTZ:-]/g, '').slice(0, 20);
  return {
    title: 'Напоминание о занятии',
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `lesson-reminder-${safeSlotTag}-${occurrenceTag || 'next'}`,
    renotify: true,
    data: {
      type: 'lesson-reminder',
      url: '/?view=schedule',
      slotId: reminder?.slotId || null,
      startsAt: Number.isFinite(reminder?.startMs) ? new Date(reminder.startMs).toISOString() : null,
    },
  };
};

const buildTeacherCalendarReminderPushPayload = (entry, reminder, student = null, options = {}) => {
  const weekdayMeta = resolveScheduleWeekdayMeta({
    weekdayKey: entry?.weekdayKey,
    day: entry?.day,
    date: entry?.date,
  });
  const dayLabel = String(weekdayMeta?.label || entry?.day || '').trim();
  const timeLabel = normalizeScheduleTime(entry?.time) || '';
  const studentName = String(student?.name || entry?.studentName || 'Ученик').trim() || 'Ученик';
  const dateLabel = (() => {
    const date = new Date(reminder?.startMs || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    try {
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(' г.', '');
    } catch {
      return '';
    }
  })();
  const whenLabel = [dayLabel, timeLabel].filter(Boolean).join(', ');
  const bodyBase = whenLabel
    ? `${studentName}: ${whenLabel}. Занятие начнется через ${LESSON_REMINDER_LEAD_MINUTES} мин.`
    : `${studentName}: занятие начнется через ${LESSON_REMINDER_LEAD_MINUTES} мин.`;
  const body = dateLabel
    ? `${dateLabel} · ${bodyBase}`
    : bodyBase;
  const safeStudentTag = String(student?.id || entry?.studentId || 'student').replace(/[^\w-]/g, '-').slice(0, 64);
  const safeSlotTagRaw = String(options?.slotKey || reminder?.slotId || 'slot');
  const safeSlotTag = safeSlotTagRaw.replace(/[^\w-]/g, '-').slice(0, 80);
  const occurrenceTag = String(reminder?.occurrenceKey || '').replace(/[^\dTZ:-]/g, '').slice(0, 20);
  return {
    title: 'Напоминание учителю',
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `teacher-calendar-reminder-${safeStudentTag}-${safeSlotTag}-${occurrenceTag || 'next'}`,
    renotify: true,
    data: {
      type: 'teacher-calendar-reminder',
      url: '/?view=teacher-calendar',
      studentId: String(student?.id || entry?.studentId || '').trim() || null,
      studentName,
      slotId: reminder?.slotId || null,
      startsAt: Number.isFinite(reminder?.startMs) ? new Date(reminder.startMs).toISOString() : null,
    },
  };
};

const buildPushTestPayload = (auth = {}) => {
  const role = String(auth?.role || '').trim();
  const now = new Date();
  const sentAtIso = now.toISOString();
  const timestampLabel = (() => {
    try {
      return now.toLocaleString('ru-RU', { hour12: false });
    } catch {
      return sentAtIso;
    }
  })();
  const roleLabel = role === 'teacher'
    ? 'учителя'
    : (role === 'student' ? 'ученика' : 'пользователя');
  const destinationView = role === 'teacher'
    ? 'teacher-calendar'
    : (role === 'student' ? 'schedule' : 'signup-chats');
  return {
    title: 'Тест push-уведомления',
    body: `Проверка доставки для ${roleLabel} (${timestampLabel}).`,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `push-test-${role || 'user'}`,
    renotify: true,
    data: {
      type: 'push-test',
      role: role || 'user',
      sentAt: sentAtIso,
      url: `/?view=${destinationView}`,
    },
  };
};

const isPushSubscriptionGoneError = (error) => {
  const code = Number(error?.statusCode || error?.status);
  return code === 404 || code === 410;
};

const isRuStorePushConfigured = () => Boolean(RUSTORE_PUSH_PROJECT_ID && RUSTORE_PUSH_SERVICE_TOKEN);

const getStudentPushTargets = (pushDb, studentId) => {
  const id = String(studentId || '').trim();
  if (!id) {
    return { subscriptions: [], rustoreTokens: [] };
  }
  const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb?.subscriptionsByStudent);
  const rustoreTokensByStudent = normalizeRuStoreTokensByStudent(pushDb?.rustoreTokensByStudent);
  return {
    subscriptions: Array.isArray(subscriptionsByStudent[id]) ? subscriptionsByStudent[id] : [],
    rustoreTokens: Array.isArray(rustoreTokensByStudent[id]) ? rustoreTokensByStudent[id] : [],
  };
};

const getUserPushTargets = (pushDb, userKey) => {
  const key = String(userKey || '').trim();
  if (!key) {
    return { subscriptions: [], rustoreTokens: [] };
  }
  const subscriptionsByUser = normalizePushSubscriptionsByUser(pushDb?.subscriptionsByUser);
  const rustoreTokensByUser = normalizeRuStoreTokensByUser(pushDb?.rustoreTokensByUser);
  return {
    subscriptions: Array.isArray(subscriptionsByUser[key]) ? subscriptionsByUser[key] : [],
    rustoreTokens: Array.isArray(rustoreTokensByUser[key]) ? rustoreTokensByUser[key] : [],
  };
};

const hasPushTargets = (targets) => (
  Array.isArray(targets?.subscriptions) && targets.subscriptions.length > 0
)
  || (
    Array.isArray(targets?.rustoreTokens) && targets.rustoreTokens.length > 0
  );

const normalizeRuStorePayloadData = (payload = {}) => {
  const data = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : {};
  const prepared = {
    title: payload?.title,
    body: payload?.body,
    tag: payload?.tag,
    url: payload?.data?.url || payload?.url,
    ...data,
  };
  return Object.entries(prepared).reduce((acc, [key, value]) => {
    if (value == null) return acc;
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return acc;
    const normalizedValue = typeof value === 'string'
      ? value.trim()
      : (typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value));
    if (!normalizedValue) return acc;
    acc[normalizedKey] = normalizedValue.slice(0, 2000);
    return acc;
  }, {});
};

const buildRuStorePushDeepLink = (payload = {}) => {
  const data = normalizeRuStorePayloadData(payload);
  let deepLink = null;
  try {
    deepLink = new URL(RUSTORE_PUSH_DEEP_LINK_BASE);
  } catch {
    deepLink = new URL('ru.ivank.egeplatform://open');
  }

  const routeUrl = typeof data.url === 'string' ? data.url.trim() : '';
  if (routeUrl) {
    try {
      const parsedRouteUrl = new URL(routeUrl, 'https://ege-platform.local');
      parsedRouteUrl.searchParams.forEach((value, key) => {
        const normalizedKey = String(key || '').trim();
        const normalizedValue = String(value || '').trim();
        if (!normalizedKey || !normalizedValue) return;
        deepLink.searchParams.set(normalizedKey, normalizedValue);
      });
    } catch {
      // Ignore malformed route URLs and fall back to explicit payload fields.
    }
  }

  [
    'view',
    'chatId',
    'studentId',
    'teacherId',
    'homeworkId',
    'requestId',
    'slotId',
    'mockExamId',
    'taskNumber',
    'levelId',
    'questionId',
    'type',
  ].forEach((key) => {
    const value = typeof data[key] === 'string' ? data[key].trim() : '';
    if (value) {
      deepLink.searchParams.set(key, value);
    }
  });

  return deepLink.toString();
};

const isRuStoreTokenGoneResponse = (status, bodyText = '') => {
  const code = Number(status);
  if (code === 404) return true;
  if (code !== 400) return false;
  return /registration token|invalid_argument|not a valid/i.test(String(bodyText || ''));
};

const sendRuStorePushNotificationToTokens = async (tokens = [], payload, logTarget = '') => {
  const list = Array.isArray(tokens) ? tokens : [];
  if (list.length === 0 || !payload || typeof payload !== 'object') {
    return { successCount: 0, staleTokens: [] };
  }
  if (!isRuStorePushConfigured()) {
    return { successCount: 0, staleTokens: [] };
  }

  const data = normalizeRuStorePayloadData(payload);
  const title = String(payload?.title || '').trim();
  const body = String(payload?.body || '').trim();
  const image = typeof payload?.image === 'string' ? payload.image.trim() : '';
  const clickAction = buildRuStorePushDeepLink(payload);
  const requestUrl = `https://vkpns.rustore.ru/v1/projects/${encodeURIComponent(RUSTORE_PUSH_PROJECT_ID)}/messages:send`;

  const results = await Promise.all(list.map(async (entry) => {
    const token = String(entry?.token || '').trim();
    if (!token) return { ok: false, token: '', stale: false };
    const requestBody = {
      message: {
        token,
        data,
        notification: {
          title,
          body,
          ...(image ? { image } : {}),
        },
        android: {
          ttl: `${PUSH_TTL_SECONDS}s`,
          notification: {
            title,
            body,
            ...(image ? { image } : {}),
            channel_id: RUSTORE_PUSH_NOTIFICATION_CHANNEL_ID,
            click_action: clickAction,
            click_action_type: 1,
          },
        },
      },
    };

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RUSTORE_PUSH_SERVICE_TOKEN}`,
        },
        body: JSON.stringify(requestBody),
      });
      if (response.ok) {
        return { ok: true, token, stale: false };
      }

      const responseText = await response.text().catch(() => '');
      if (isRuStoreTokenGoneResponse(response.status, responseText)) {
        return { ok: false, token, stale: true };
      }

      console.error(`[push] failed to send RuStore notification to ${logTarget || 'user'}: ${response.status} ${responseText}`);
      return { ok: false, token, stale: false };
    } catch (error) {
      console.error(`[push] failed to send RuStore notification to ${logTarget || 'user'}:`, error);
      return { ok: false, token, stale: false };
    }
  }));

  return {
    successCount: results.filter((item) => item.ok).length,
    staleTokens: results
      .filter((item) => !item.ok && item.stale && item.token)
      .map((item) => item.token),
  };
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

const trimPushBodyText = (value, max = 180) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
};

const buildSignupTeacherPushPayload = (chat, message) => {
  const guestName = String(chat?.guestName || 'Гость').trim() || 'Гость';
  const text = trimPushBodyText(message?.text || '');
  return {
    title: `Новое сообщение от ${guestName}`,
    body: text || 'Откройте чат заявок, чтобы прочитать сообщение.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `signup-teacher-${String(chat?.id || '').trim() || 'chat'}`,
    renotify: true,
    data: {
      type: 'signup-chat-teacher',
      url: '/',
      view: 'signup-chats',
      chatId: String(chat?.id || '').trim() || null,
      guestName,
    },
  };
};

const buildSignupLeadPushPayload = (chat, message) => {
  const senderName = String(message?.senderName || 'Преподаватель').trim() || 'Преподаватель';
  const text = trimPushBodyText(message?.text || '');
  return {
    title: `Ответ от ${senderName}`,
    body: text || 'Откройте чат, чтобы прочитать сообщение.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `signup-lead-${String(chat?.id || '').trim() || 'chat'}`,
    renotify: true,
    data: {
      type: 'signup-chat-lead',
      url: '/',
      chatId: String(chat?.id || '').trim() || null,
    },
  };
};

const buildStudentTeacherPushPayloadForTeacher = (chat, message, student) => {
  const studentName = String(student?.name || message?.senderName || 'Ученик').trim() || 'Ученик';
  const text = trimPushBodyText(message?.text || (message?.imageDataUrl ? 'Изображение' : ''));
  return {
    title: `Новое сообщение от ${studentName}`,
    body: text || 'Откройте чаты учеников, чтобы прочитать сообщение.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `student-chat-teacher-${String(chat?.id || student?.id || '').trim() || 'chat'}`,
    renotify: true,
    data: {
      type: 'student-chat-teacher',
      url: '/',
      view: 'student-chats',
      chatId: String(chat?.id || '').trim() || null,
      studentId: String(student?.id || '').trim() || null,
      studentName,
    },
  };
};

const buildStudentTeacherPushPayloadForStudent = (chat, message, teacher) => {
  const teacherName = String(teacher?.name || message?.senderName || 'Преподаватель').trim() || 'Преподаватель';
  const text = trimPushBodyText(message?.text || (message?.imageDataUrl ? 'Изображение' : ''));
  return {
    title: `Ответ от ${teacherName}`,
    body: text || 'Откройте чат с преподавателем, чтобы прочитать сообщение.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `student-chat-student-${String(chat?.id || chat?.studentId || '').trim() || 'chat'}`,
    renotify: true,
    data: {
      type: 'student-chat-student',
      url: '/',
      view: 'chat',
      chatId: String(chat?.id || '').trim() || null,
      teacherId: String(teacher?.id || '').trim() || null,
      teacherName,
    },
  };
};

const buildScheduleChangeRequestPushPayloadForTeacher = (student, requestEntry) => {
  const studentName = String(student?.name || requestEntry?.studentName || 'Ученик').trim() || 'Ученик';
  const type = normalizeScheduleChangeRequestType(requestEntry?.type);
  const proposed = requestEntry?.proposedEntry && typeof requestEntry.proposedEntry === 'object'
    ? requestEntry.proposedEntry
    : null;
  const previous = requestEntry?.previousEntry && typeof requestEntry.previousEntry === 'object'
    ? requestEntry.previousEntry
    : null;
  const actionText = (
    type === 'create' ? 'добавить слот'
      : type === 'update' ? 'изменить слот'
        : type === 'delete' ? 'удалить слот'
          : 'изменить расписание'
  );
  const target = proposed || previous || null;
  const dayLabel = String(target?.day || '').trim();
  const timeLabel = String(target?.time || '').trim();
  const slotText = [dayLabel, timeLabel].filter(Boolean).join(', ');
  const body = slotText
    ? `${studentName} хочет ${actionText}: ${slotText}.`
    : `${studentName} хочет ${actionText}.`;

  return {
    title: `Запрос на изменение расписания`,
    body: trimPushBodyText(body, 190) || `${studentName} отправил запрос на изменение расписания.`,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `schedule-request-${String(requestEntry?.id || '').trim() || 'request'}`,
    renotify: true,
    data: {
      type: 'schedule-request',
      url: '/?view=schedule',
      studentId: String(student?.id || requestEntry?.studentId || '').trim() || null,
      requestId: String(requestEntry?.id || '').trim() || null,
      action: type || null,
    },
  };
};

const sendPushNotificationToStudentId = async (studentId, payload, options = {}) => {
  const id = String(studentId || '').trim();
  if (!id || !payload || typeof payload !== 'object') {
    return { successCount: 0, staleEndpoints: [], staleTokens: [] };
  }

  const pushDb = readPushDb();
  const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
  const rustoreTokensByStudent = normalizeRuStoreTokensByStudent(pushDb.rustoreTokensByStudent);
  const remindersByStudent = normalizePushRemindersByStudent(pushDb.remindersByStudent);
  const lessonReminderStateByStudent = normalizePushLessonReminderStateByStudent(pushDb.lessonReminderStateByStudent);
  const subscriptions = Array.isArray(subscriptionsByStudent[id]) ? subscriptionsByStudent[id] : [];
  const rustoreTokens = Array.isArray(rustoreTokensByStudent[id]) ? rustoreTokensByStudent[id] : [];
  if (subscriptions.length === 0 && rustoreTokens.length === 0) {
    return { successCount: 0, staleEndpoints: [], staleTokens: [] };
  }

  const logTarget = options?.logTarget ? String(options.logTarget) : id;
  const webResult = subscriptions.length > 0
    ? (pushRuntimeEnabled || ensurePushRuntimeConfigured().enabled
      ? await sendPushNotificationToSubscriptions(subscriptions, payload, logTarget)
      : { successCount: 0, staleEndpoints: [] })
    : { successCount: 0, staleEndpoints: [] };
  const rustoreResult = rustoreTokens.length > 0
    ? await sendRuStorePushNotificationToTokens(rustoreTokens, payload, logTarget)
    : { successCount: 0, staleTokens: [] };
  if (webResult.staleEndpoints.length > 0 || rustoreResult.staleTokens.length > 0) {
    const staleSet = new Set(webResult.staleEndpoints);
    const staleTokenSet = new Set(rustoreResult.staleTokens);
    const next = subscriptions.filter((entry) => !staleSet.has(entry.endpoint));
    const nextTokens = rustoreTokens.filter((entry) => !staleTokenSet.has(entry.token));
    if (next.length > 0) {
      subscriptionsByStudent[id] = next;
    } else {
      delete subscriptionsByStudent[id];
    }
    if (nextTokens.length > 0) {
      rustoreTokensByStudent[id] = nextTokens;
    } else {
      delete rustoreTokensByStudent[id];
    }
    if (
      !subscriptionsByStudent[id]
      && !rustoreTokensByStudent[id]
    ) {
      if (remindersByStudent[id]) delete remindersByStudent[id];
      if (lessonReminderStateByStudent[id]) delete lessonReminderStateByStudent[id];
    }
    writePushDb({
      ...pushDb,
      subscriptionsByStudent,
      rustoreTokensByStudent,
      remindersByStudent,
      lessonReminderStateByStudent,
    });
  }
  return {
    successCount: webResult.successCount + rustoreResult.successCount,
    staleEndpoints: webResult.staleEndpoints,
    staleTokens: rustoreResult.staleTokens,
  };
};

const sendPushNotificationToUserKey = async (userKey, payload, options = {}) => {
  const key = String(userKey || '').trim();
  if (!key || !payload || typeof payload !== 'object') {
    return { successCount: 0, staleEndpoints: [], staleTokens: [] };
  }

  const pushDb = readPushDb();
  const subscriptionsByUser = normalizePushSubscriptionsByUser(pushDb.subscriptionsByUser);
  const rustoreTokensByUser = normalizeRuStoreTokensByUser(pushDb.rustoreTokensByUser);
  const subscriptions = Array.isArray(subscriptionsByUser[key]) ? subscriptionsByUser[key] : [];
  const rustoreTokens = Array.isArray(rustoreTokensByUser[key]) ? rustoreTokensByUser[key] : [];
  if (subscriptions.length === 0 && rustoreTokens.length === 0) {
    return { successCount: 0, staleEndpoints: [], staleTokens: [] };
  }

  const logTarget = options?.logTarget ? String(options.logTarget) : key;
  const webResult = subscriptions.length > 0
    ? (pushRuntimeEnabled || ensurePushRuntimeConfigured().enabled
      ? await sendPushNotificationToSubscriptions(subscriptions, payload, logTarget)
      : { successCount: 0, staleEndpoints: [] })
    : { successCount: 0, staleEndpoints: [] };
  const rustoreResult = rustoreTokens.length > 0
    ? await sendRuStorePushNotificationToTokens(rustoreTokens, payload, logTarget)
    : { successCount: 0, staleTokens: [] };
  if (webResult.staleEndpoints.length > 0 || rustoreResult.staleTokens.length > 0) {
    const staleSet = new Set(webResult.staleEndpoints);
    const staleTokenSet = new Set(rustoreResult.staleTokens);
    const next = subscriptions.filter((entry) => !staleSet.has(entry.endpoint));
    const nextTokens = rustoreTokens.filter((entry) => !staleTokenSet.has(entry.token));
    if (next.length > 0) subscriptionsByUser[key] = next;
    else delete subscriptionsByUser[key];
    if (nextTokens.length > 0) rustoreTokensByUser[key] = nextTokens;
    else delete rustoreTokensByUser[key];
    writePushDb({
      ...pushDb,
      subscriptionsByUser,
      rustoreTokensByUser,
    });
  }
  return {
    successCount: webResult.successCount + rustoreResult.successCount,
    staleEndpoints: webResult.staleEndpoints,
    staleTokens: rustoreResult.staleTokens,
  };
};

const notifyStudentAboutNewHomework = async (student, entry) => {
  if (!student?.id || !entry) return;
  try {
    const pushDb = readPushDb();
    const targets = getStudentPushTargets(pushDb, student.id);
    if (!hasPushTargets(targets)) return;

    const testsDb = readTestsDb();
    const mockExamById = readMockExamsDb().reduce((acc, exam) => {
      const examId = String(exam?.id || '').trim();
      if (examId) acc[examId] = exam;
      return acc;
    }, {});
    const summary = evaluateLatestHomeworkProgressForStudent(student, testsDb, mockExamById);
    const payload = buildNewHomeworkPushPayload(student, entry, summary);
    const result = await sendPushNotificationToStudentId(student.id, payload, { logTarget: student.id });

    if (result.successCount > 0) {
      const latestPushDb = readPushDb();
      const nextRemindersByStudent = normalizePushRemindersByStudent(latestPushDb.remindersByStudent);
      if (summary && summary.pendingCount > 0) {
        nextRemindersByStudent[student.id] = {
          homeworkId: summary.homeworkId,
          pendingCount: summary.pendingCount,
          issuedAt: summary.issuedAt || '',
          lastSentAt: new Date().toISOString(),
        };
      } else if (nextRemindersByStudent[student.id]) {
        delete nextRemindersByStudent[student.id];
      }
      writePushDb({
        ...latestPushDb,
        remindersByStudent: nextRemindersByStudent,
      });
    }
  } catch (error) {
    console.error(`[push] failed to send "new homework" notification to student ${student.id}:`, error);
  }
};

const runPushReminderSweep = async () => {
  if (pushSweepInFlight) return;
  if (!isPushReminderWindowOpen()) return;

  pushSweepInFlight = true;
  try {
    const pushDb = readPushDb();
    const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
    const rustoreTokensByStudent = normalizeRuStoreTokensByStudent(pushDb.rustoreTokensByStudent);
    const remindersByStudent = normalizePushRemindersByStudent(pushDb.remindersByStudent);
    const studentIds = Array.from(new Set([
      ...Object.keys(subscriptionsByStudent).filter((studentId) => (
        Array.isArray(subscriptionsByStudent[studentId]) && subscriptionsByStudent[studentId].length > 0
      )),
      ...Object.keys(rustoreTokensByStudent).filter((studentId) => (
        Array.isArray(rustoreTokensByStudent[studentId]) && rustoreTokensByStudent[studentId].length > 0
      )),
    ]));
    if (studentIds.length === 0) {
      if (Object.keys(remindersByStudent).length > 0) {
        writePushDb({ ...pushDb, subscriptionsByStudent, rustoreTokensByStudent, remindersByStudent: {} });
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
        delete rustoreTokensByStudent[studentId];
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
      const rustoreTokens = rustoreTokensByStudent[studentId] || [];
      const result = await sendPushNotificationToStudentId(studentId, payload, { logTarget: studentId });

      if (result.staleEndpoints.length > 0 || result.staleTokens.length > 0) {
        const staleSet = new Set(result.staleEndpoints);
        const staleTokenSet = new Set(result.staleTokens);
        const nextSubscriptions = subscriptions.filter((entry) => !staleSet.has(entry.endpoint));
        const nextTokens = rustoreTokens.filter((entry) => !staleTokenSet.has(entry.token));
        if (nextSubscriptions.length > 0) subscriptionsByStudent[studentId] = nextSubscriptions;
        else delete subscriptionsByStudent[studentId];
        if (nextTokens.length > 0) rustoreTokensByStudent[studentId] = nextTokens;
        else delete rustoreTokensByStudent[studentId];
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
      } else if (
        (!subscriptionsByStudent[studentId] || subscriptionsByStudent[studentId].length === 0)
        && (!rustoreTokensByStudent[studentId] || rustoreTokensByStudent[studentId].length === 0)
      ) {
        delete remindersByStudent[studentId];
        changed = true;
      }
    }

    if (changed) {
      writePushDb({
        ...pushDb,
        subscriptionsByStudent,
        rustoreTokensByStudent,
        remindersByStudent,
      });
    }
  } catch (error) {
    console.error('[push] reminder sweep failed:', error);
  } finally {
    pushSweepInFlight = false;
  }
};

const runPushLessonReminderSweep = async () => {
  if (pushLessonSweepInFlight) return;

  pushLessonSweepInFlight = true;
  try {
    const pushDb = readPushDb();
    const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
    const rustoreTokensByStudent = normalizeRuStoreTokensByStudent(pushDb.rustoreTokensByStudent);
    const lessonReminderSettingsByStudent = normalizePushLessonReminderSettingsByStudent(pushDb.lessonReminderSettingsByStudent);
    const lessonReminderStateByStudent = normalizePushLessonReminderStateByStudent(pushDb.lessonReminderStateByStudent);
    const nowMs = Date.now();
    let changed = false;

    const candidateStudentIds = Array.from(new Set([
      ...Object.keys(subscriptionsByStudent),
      ...Object.keys(rustoreTokensByStudent),
      ...Object.keys(lessonReminderSettingsByStudent),
      ...Object.keys(lessonReminderStateByStudent),
    ]));

    for (const studentId of candidateStudentIds) {
      const student = findStudentById(studentId);
      if (!student) {
        if (subscriptionsByStudent[studentId]) {
          delete subscriptionsByStudent[studentId];
          changed = true;
        }
        if (rustoreTokensByStudent[studentId]) {
          delete rustoreTokensByStudent[studentId];
          changed = true;
        }
        if (lessonReminderSettingsByStudent[studentId]) {
          delete lessonReminderSettingsByStudent[studentId];
          changed = true;
        }
        if (lessonReminderStateByStudent[studentId]) {
          delete lessonReminderStateByStudent[studentId];
          changed = true;
        }
        continue;
      }

      const settings = lessonReminderSettingsByStudent[studentId];
      const enabled = Boolean(settings?.enabled);
      let subscriptions = Array.isArray(subscriptionsByStudent[studentId]) ? subscriptionsByStudent[studentId] : [];
      let rustoreTokens = Array.isArray(rustoreTokensByStudent[studentId]) ? rustoreTokensByStudent[studentId] : [];
      const studentData = getStudentData(student.id);
      const schedule = Array.isArray(studentData?.schedule) ? studentData.schedule : [];
      const knownSlotIds = new Set(schedule.map((entry) => getScheduleSlotId(entry)).filter(Boolean));

      const previousState = Array.isArray(lessonReminderStateByStudent[studentId])
        ? lessonReminderStateByStudent[studentId]
        : [];
      let nextState = previousState.filter((item) => knownSlotIds.has(item.slotId));
      if (nextState.length !== previousState.length) {
        lessonReminderStateByStudent[studentId] = nextState;
        changed = true;
      }

      if (!enabled || (subscriptions.length === 0 && rustoreTokens.length === 0) || schedule.length === 0) {
        if ((!enabled || schedule.length === 0) && nextState.length > 0) {
          delete lessonReminderStateByStudent[studentId];
          changed = true;
        }
        if (enabled && schedule.length > 0 && subscriptions.length === 0 && rustoreTokens.length === 0 && nextState.length > 0) {
          // Keep no state while there are no active subscriptions.
          delete lessonReminderStateByStudent[studentId];
          changed = true;
        }
        continue;
      }

      const stateBySlot = new Map(nextState.map((item) => [item.slotId, item]));
      const dueReminders = schedule
        .map((entry) => ({ entry, reminder: findDueLessonReminderOccurrence(entry, nowMs) }))
        .filter((item) => item.reminder && item.reminder.slotId);

      for (const item of dueReminders) {
        const { entry, reminder } = item;
        const previous = stateBySlot.get(reminder.slotId);
        if (previous?.occurrenceKey === reminder.occurrenceKey) continue;

        const payload = buildLessonReminderPushPayload(entry, reminder);
        const result = await sendPushNotificationToStudentId(studentId, payload, { logTarget: `lesson:${studentId}` });

        if (result.staleEndpoints.length > 0 || result.staleTokens.length > 0) {
          const staleSet = new Set(result.staleEndpoints);
          const staleTokenSet = new Set(result.staleTokens);
          const filtered = subscriptions.filter((sub) => !staleSet.has(sub.endpoint));
          const filteredTokens = rustoreTokens.filter((entry) => !staleTokenSet.has(entry.token));
          if (filtered.length > 0) {
            subscriptionsByStudent[studentId] = filtered;
            subscriptions = filtered;
          } else {
            delete subscriptionsByStudent[studentId];
            subscriptions = [];
          }
          if (filteredTokens.length > 0) {
            rustoreTokensByStudent[studentId] = filteredTokens;
            rustoreTokens = filteredTokens;
          } else {
            delete rustoreTokensByStudent[studentId];
            rustoreTokens = [];
          }
          changed = true;
        }

        if (result.successCount > 0) {
          stateBySlot.set(reminder.slotId, {
            slotId: reminder.slotId,
            occurrenceKey: reminder.occurrenceKey,
            sentAt: new Date().toISOString(),
          });
          changed = true;
        }
      }

      if (stateBySlot.size > 0) {
        lessonReminderStateByStudent[studentId] = Array.from(stateBySlot.values());
      } else if (lessonReminderStateByStudent[studentId]) {
        delete lessonReminderStateByStudent[studentId];
        changed = true;
      }
    }

    if (changed) {
      writePushDb({
        ...pushDb,
        subscriptionsByStudent,
        rustoreTokensByStudent,
        lessonReminderSettingsByStudent,
        lessonReminderStateByStudent,
      });
    }
  } catch (error) {
    console.error('[push] lesson reminder sweep failed:', error);
  } finally {
    pushLessonSweepInFlight = false;
  }
};

const runPushTeacherCalendarReminderSweep = async () => {
  if (pushTeacherCalendarSweepInFlight) return;
  pushTeacherCalendarSweepInFlight = true;
  try {
    const pushDb = readPushDb();
    const subscriptionsByUser = normalizePushSubscriptionsByUser(pushDb.subscriptionsByUser);
    const rustoreTokensByUser = normalizeRuStoreTokensByUser(pushDb.rustoreTokensByUser);
    const reminderSettingsByTeacher = normalizePushTeacherCalendarReminderSettingsByTeacher(pushDb.teacherCalendarReminderSettingsByTeacher);
    const reminderStateByTeacher = normalizePushTeacherCalendarReminderStateByTeacher(pushDb.teacherCalendarReminderStateByTeacher);
    const teachers = readTeachersDb();
    const activeTeacherIds = new Set(
      teachers
        .map((teacher) => String(teacher?.id || '').trim())
        .filter(Boolean)
    );
    let changed = false;
    const nowMs = Date.now();

    const candidateTeacherIds = Array.from(new Set([
      ...Object.keys(reminderSettingsByTeacher),
      ...Object.keys(reminderStateByTeacher),
      ...Object.keys(subscriptionsByUser)
        .filter((key) => key.startsWith('teacher:'))
        .map((key) => key.slice('teacher:'.length)),
      ...Object.keys(rustoreTokensByUser)
        .filter((key) => key.startsWith('teacher:'))
        .map((key) => key.slice('teacher:'.length)),
    ]));

    for (const teacherId of candidateTeacherIds) {
      const normalizedTeacherId = String(teacherId || '').trim();
      if (!normalizedTeacherId) continue;
      const userKey = `teacher:${normalizedTeacherId}`;

      if (!activeTeacherIds.has(normalizedTeacherId)) {
        if (subscriptionsByUser[userKey]) {
          delete subscriptionsByUser[userKey];
          changed = true;
        }
        if (rustoreTokensByUser[userKey]) {
          delete rustoreTokensByUser[userKey];
          changed = true;
        }
        if (reminderSettingsByTeacher[normalizedTeacherId]) {
          delete reminderSettingsByTeacher[normalizedTeacherId];
          changed = true;
        }
        if (reminderStateByTeacher[normalizedTeacherId]) {
          delete reminderStateByTeacher[normalizedTeacherId];
          changed = true;
        }
        continue;
      }

      const enabled = Boolean(reminderSettingsByTeacher[normalizedTeacherId]?.enabled);
      let subscriptions = Array.isArray(subscriptionsByUser[userKey]) ? subscriptionsByUser[userKey] : [];
      let rustoreTokens = Array.isArray(rustoreTokensByUser[userKey]) ? rustoreTokensByUser[userKey] : [];
      const scheduleEntries = getTeacherScheduleEntries(normalizedTeacherId)
        .map((entry) => {
          const slotId = getScheduleSlotId(entry);
          if (!slotId) return null;
          const studentId = String(entry?.studentId || '').trim();
          if (!studentId) {
            return {
              entry,
              student: null,
              slotKey: `trial:${slotId}`,
            };
          }
          const student = findStudentById(studentId);
          if (!student) return null;
          return {
            entry,
            student,
            slotKey: `${studentId}:${slotId}`,
          };
        })
        .filter(Boolean);
      const knownSlotKeys = new Set(scheduleEntries.map((item) => item.slotKey));

      const previousState = Array.isArray(reminderStateByTeacher[normalizedTeacherId])
        ? reminderStateByTeacher[normalizedTeacherId]
        : [];
      const nextState = previousState.filter((item) => knownSlotKeys.has(item.slotKey));
      if (nextState.length !== previousState.length) {
        reminderStateByTeacher[normalizedTeacherId] = nextState;
        changed = true;
      }

      if (!enabled || (subscriptions.length === 0 && rustoreTokens.length === 0) || scheduleEntries.length === 0) {
        if (reminderStateByTeacher[normalizedTeacherId]?.length > 0) {
          delete reminderStateByTeacher[normalizedTeacherId];
          changed = true;
        }
        continue;
      }

      const stateBySlotKey = new Map(nextState.map((item) => [item.slotKey, item]));
      const dueReminders = scheduleEntries
        .map((item) => ({
          ...item,
          reminder: findDueLessonReminderOccurrence(item.entry, nowMs),
        }))
        .filter((item) => item.reminder && item.reminder.slotId);

      for (const item of dueReminders) {
        const { entry, student, slotKey, reminder } = item;
        const previous = stateBySlotKey.get(slotKey);
        if (previous?.occurrenceKey === reminder.occurrenceKey) continue;

        const payload = buildTeacherCalendarReminderPushPayload(entry, reminder, student, { slotKey });
        const result = await sendPushNotificationToUserKey(userKey, payload, {
          logTarget: `teacher-calendar:${normalizedTeacherId}`,
        });

        if (result.staleEndpoints.length > 0 || result.staleTokens.length > 0) {
          const staleSet = new Set(result.staleEndpoints);
          const staleTokenSet = new Set(result.staleTokens);
          const filtered = subscriptions.filter((sub) => !staleSet.has(sub.endpoint));
          const filteredTokens = rustoreTokens.filter((entry) => !staleTokenSet.has(entry.token));
          if (filtered.length > 0) {
            subscriptionsByUser[userKey] = filtered;
            subscriptions = filtered;
          } else {
            delete subscriptionsByUser[userKey];
            subscriptions = [];
          }
          if (filteredTokens.length > 0) {
            rustoreTokensByUser[userKey] = filteredTokens;
            rustoreTokens = filteredTokens;
          } else {
            delete rustoreTokensByUser[userKey];
            rustoreTokens = [];
          }
          changed = true;
        }

        if (result.successCount > 0) {
          stateBySlotKey.set(slotKey, {
            slotKey,
            occurrenceKey: reminder.occurrenceKey,
            sentAt: new Date().toISOString(),
          });
          changed = true;
        }
      }

      if (stateBySlotKey.size > 0) {
        reminderStateByTeacher[normalizedTeacherId] = Array.from(stateBySlotKey.values());
      } else if (reminderStateByTeacher[normalizedTeacherId]) {
        delete reminderStateByTeacher[normalizedTeacherId];
        changed = true;
      }
    }

    if (changed) {
      writePushDb({
        ...pushDb,
        subscriptionsByUser,
        rustoreTokensByUser,
        teacherCalendarReminderSettingsByTeacher: reminderSettingsByTeacher,
        teacherCalendarReminderStateByTeacher: reminderStateByTeacher,
      });
    }
  } catch (error) {
    console.error('[push] teacher calendar reminder sweep failed:', error);
  } finally {
    pushTeacherCalendarSweepInFlight = false;
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

const serializeMockExamEntry = (exam, options = {}) => {
  if (!exam || typeof exam !== 'object') return exam;
  const safeExam = options.sanitizeForStudent ? sanitizeMockExamForStudent(exam) : { ...exam };
  safeExam.badges = normalizeMockExamBadges(exam.badges);
  return safeExam;
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

const extractClientAssetFingerprint = (html) => {
  const rawHtml = typeof html === 'string' ? html : '';
  if (!rawHtml) return '';
  const assets = [];
  const scriptMatches = rawHtml.matchAll(/<script[^>]+src="([^"]+)"/gi);
  for (const match of scriptMatches) {
    const value = String(match?.[1] || '').trim();
    if (value) assets.push(value);
  }
  const styleMatches = rawHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi);
  for (const match of styleMatches) {
    const value = String(match?.[1] || '').trim();
    if (value) assets.push(value);
  }
  return Array.from(new Set(assets)).join('|');
};

const getCurrentClientBuildFingerprint = () => {
  const indexPath = path.join(distDir, 'index.html');
  try {
    if (!fs.existsSync(indexPath)) return '';
    const html = fs.readFileSync(indexPath, 'utf8');
    const fingerprint = extractClientAssetFingerprint(html);
    if (fingerprint) return fingerprint;
    const stats = fs.statSync(indexPath);
    return Number.isFinite(stats?.mtimeMs) ? `index-html:${Math.round(stats.mtimeMs)}` : '';
  } catch {
    return '';
  }
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
    if (isLessonSharedFolderEntry(folder)) {
      const ownerStudent = findStudentById(folder.studentId, { allowDeleted: true });
      const teacherId = normalizeTeacherId(
        folder.teacherId
        || ownerStudent?.teacherId
        || extractTeacherIdFromLessonSharedStudentId(folder.studentId)
      );
      if (teacherId) {
        const sharedStudentId = buildLessonSharedStudentId(teacherId);
        if (folder.studentId !== sharedStudentId) {
          folder.studentId = sharedStudentId;
          foldersChanged = true;
        }
        if (normalizeTeacherId(folder.teacherId) !== teacherId) {
          folder.teacherId = teacherId;
          foldersChanged = true;
        }
        if (folder.sharedScope !== LESSON_SHARED_SCOPE) {
          folder.sharedScope = LESSON_SHARED_SCOPE;
          foldersChanged = true;
        }
        if (folder.isLessonShared !== true) {
          folder.isLessonShared = true;
          foldersChanged = true;
        }
      }
    }
    const normalizedParentId = normalizeParentFolderId(folder.parentFolderId);
    const nextParentId = normalizedParentId === folder.id ? null : normalizedParentId;
    if (folder.parentFolderId !== nextParentId) {
      folder.parentFolderId = nextParentId;
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
  // Typical case: UTF-8 bytes for Cyrillic interpreted as latin1 (U+00D0/U+00D1 + 0x80..0xBF).
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

const hasForcedDownloadFlag = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const stripUploadIdPrefix = (name) => (
  String(name || '').replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    ''
  )
);

const getUploadDownloadName = (ownedFile, storageName) => {
  const preferredName = normalizeFileName(ownedFile?.name || '');
  if (preferredName) return path.basename(preferredName);
  const fallbackName = normalizeFileName(stripUploadIdPrefix(storageName) || storageName);
  return path.basename(fallbackName || 'download');
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

const getTaskLimitBytes = (isLessonSharedTask) => (
  isLessonSharedTask ? MAX_LESSON_SHARED_TASK_BYTES : MAX_TASK_BYTES
);

const getUploadFileLimitBytes = (isLessonSharedUpload) => (
  isLessonSharedUpload ? MAX_LESSON_SHARED_UPLOAD_FILE_BYTES : MAX_UPLOAD_FILE_BYTES
);

const formatLimitLabel = (limitBytes) => `${Math.round(limitBytes / (1024 * 1024))} МБ`;

const getTaskLimitError = (limitBytes) => (
  `Превышен лимит ${formatLimitLabel(limitBytes)} для этого задания`
);

const getFolderLimitBytes = (isLessonSharedFolder) => (
  isLessonSharedFolder ? MAX_SHARED_FOLDER_BYTES : MAX_FOLDER_BYTES
);

const getFolderLimitError = (limitBytes) => (
  `Превышен лимит ${formatLimitLabel(limitBytes)} для этой папки`
);

const getUploadFileLimitError = (limitBytes) => (
  `Файл больше ${formatLimitLabel(limitBytes)}`
);

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
  limits: { fileSize: MAX_LESSON_SHARED_UPLOAD_FILE_BYTES },
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
  let ownerStudentId = '';
  let ownerTeacherId = '';
  const ownerIsLessonShared = Boolean(ownedFile && isLessonSharedFile(ownedFile));
  if (ownedFile) {
    if (ownerIsLessonShared) {
      ownerTeacherId = normalizeTeacherId(ownedFile.teacherId);
      if (!ownerTeacherId || !canReadLessonSharedByTeacher(req.auth, ownerTeacherId)) {
        return res.status(403).send('Недостаточно прав');
      }
    } else if (ownedFile.studentId) {
      const ownerStudent = findStudentById(ownedFile.studentId, { allowDeleted: true });
      if (!ownerStudent) return res.status(404).send('Файл не найден');
      if (!canAccessStudentByRole(req.auth, ownerStudent, { allowDeleted: true })) {
        return res.status(403).send('Недостаточно прав');
      }
      ownerStudentId = ownerStudent.id;
      ownerTeacherId = normalizeTeacherId(ownerStudent.teacherId);
    }
  }

  const stat = fs.statSync(filePath);
  const queryStudentId = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : '';
  if (queryStudentId) {
    const student = findStudentById(queryStudentId);
    if (!student) return res.status(404).send('Ученик не найден');
    if (!canAccessStudentByRole(req.auth, student)) return res.status(403).send('Недостаточно прав');
    if (ownerIsLessonShared) {
      const studentTeacherId = normalizeTeacherId(student.teacherId);
      if (ownerTeacherId && studentTeacherId !== ownerTeacherId) {
        return res.status(400).send('Некорректный studentId');
      }
    } else if (ownerStudentId && queryStudentId !== ownerStudentId) {
      return res.status(400).send('Некорректный studentId');
    }
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
    if (usage.enabled && (usage.remaining <= 0 || usage.used + requestSize > usage.limit)) {
      return res.status(429).json({ error: 'Превышен лимит трафика для ученика' });
    }
    if (usage.enabled && (usage.used / usage.limit >= STUDENT_TRAFFIC_WARN_RATIO)) {
      res.setHeader('X-Traffic-Warn', '1');
    }
    res.setHeader('X-Traffic-Used', String(usage.used));
    res.setHeader('X-Traffic-Limit', usage.enabled ? String(usage.limit) : 'unlimited');
    if (req.method === 'GET') {
      registerUsageOnFinish(usageStudentId, res, requestSize);
    }
  }

  if (hasForcedDownloadFlag(req.query.download)) {
    res.attachment(getUploadDownloadName(ownedFile, safeName));
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

app.get('/api/client-build-version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    fingerprint: getCurrentClientBuildFingerprint(),
  });
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

app.get('/api/session', (req, res) => {
  return res.json({
    ...req.auth,
    token: String(req.authToken || '').trim(),
  });
});

app.get('/api/admin/xp-rebalance', (req, res) => {
  if (!isAdminRole(req.auth)) return forbid(res);
  return res.json(runStudentXpFixes({ apply: false }));
});

app.post('/api/admin/xp-rebalance', (req, res) => {
  if (!isAdminRole(req.auth)) return forbid(res);
  const apply = req.body?.apply === true;
  return res.json(runStudentXpFixes({ apply }));
});

app.post('/api/board/reset', async (req, res) => {
  const requestedStudentId = typeof req.body?.studentId === 'string'
    ? req.body.studentId.trim()
    : String(req.body?.studentId || '').trim();
  const fallbackStudentId = isStudentRole(req.auth) ? String(req.auth.id || '').trim() : '';
  const effectiveStudentId = requestedStudentId || fallbackStudentId;
  const student = ensureStudentAccess(req, res, effectiveStudentId, { missingError: 'studentId required' });
  if (!student) return;

  const roomId = getBoardRoomIdForStudent(student);
  if (!roomId) {
    return res.status(400).json({ error: 'Для ученика не удалось определить доску' });
  }

  try {
    const result = await resetCollabDoc(roomId, {
      closeCode: 1012,
      closeReason: 'Board reset',
      bypassMs: 30000,
    });
    return res.json({
      ok: true,
      roomId,
      studentId: student.id,
      closedConnections: result.closedConnections,
      hadActiveDoc: result.hadActiveDoc,
      clearedPersistence: result.clearedPersistence,
    });
  } catch (error) {
    console.error('[board] reset failed:', error);
    return res.status(500).json({ error: 'Не удалось сбросить доску' });
  }
});

app.get('/api/schedule-sync/stream', (req, res) => {
  if (!isAdminRole(req.auth) && !isTeacherRole(req.auth) && !isStudentRole(req.auth)) {
    return forbid(res);
  }

  scheduleSyncClientCounter += 1;
  const clientId = `schedule-sync-${Date.now()}-${scheduleSyncClientCounter}`;
  const role = String(req.auth?.role || '').trim();
  const teacherId = role === 'teacher'
    ? String(req.auth?.id || '').trim()
    : (role === 'student' ? String(req.auth?.teacherId || '').trim() : '');
  const studentId = role === 'student' ? String(req.auth?.id || '').trim() : '';

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const keepAliveTimer = setInterval(() => {
    try {
      res.write(`: keep-alive ${Date.now()}\n\n`);
    } catch {
      removeScheduleSyncClient(clientId);
    }
  }, SCHEDULE_SYNC_KEEPALIVE_INTERVAL_MS);
  if (typeof keepAliveTimer.unref === 'function') keepAliveTimer.unref();

  scheduleSyncClients.set(clientId, {
    id: clientId,
    role,
    teacherId,
    studentId,
    res,
    keepAliveTimer,
  });

  writeSseEvent(res, 'ready', { ok: true, ts: Date.now() });

  const cleanup = () => {
    removeScheduleSyncClient(clientId);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('close', cleanup);
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
  const teacherPushKey = String(updatedChat?.teacherId || '').trim()
    ? `teacher:${String(updatedChat.teacherId).trim()}`
    : '';
  if (teacherPushKey) {
    const teacherPushPayload = buildSignupTeacherPushPayload(updatedChat, message);
    sendPushNotificationToUserKey(teacherPushKey, teacherPushPayload, { logTarget: teacherPushKey })
      .catch((error) => {
        console.error('[push] failed to send signup message notification to teacher:', error);
      });
  }
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
  chats = chats
    .map((chat, index) => ({ chat, index }))
    .sort((left, right) => {
      const diff = getSignupChatSortTimestamp(right.chat) - getSignupChatSortTimestamp(left.chat);
      if (diff !== 0) return diff;
      return right.index - left.index;
    })
    .map((entry) => entry.chat);
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
  const leadPushKey = String(updatedChat?.guestUserId || '').trim()
    ? `lead:${String(updatedChat.guestUserId).trim()}`
    : '';
  if (leadPushKey) {
    const leadPushPayload = buildSignupLeadPushPayload(updatedChat, message);
    sendPushNotificationToUserKey(leadPushKey, leadPushPayload, { logTarget: leadPushKey })
      .catch((error) => {
        console.error('[push] failed to send signup message notification to lead:', error);
      });
  }
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

app.patch('/api/signup-chats/:chatId/messages/:messageId', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  const text = normalizeSignupMessageText(req.body?.text);
  if (!text) return res.status(400).json({ error: 'Введите сообщение' });

  const messageId = typeof req.params?.messageId === 'string' ? req.params.messageId.trim() : '';
  if (!messageId) return res.status(400).json({ error: 'messageId required' });

  const chats = readSignupChatsDb();
  const access = ensureSignupChatAccess(req, res, req.params.chatId, { chats });
  if (!access) return;
  const { index } = access;
  const chat = access.chat;
  const messages = Array.isArray(chat.messages) ? [...chat.messages] : [];
  const messageIndex = messages.findIndex((message) => message?.id === messageId);
  if (messageIndex === -1) return res.status(404).json({ error: 'Сообщение не найдено' });

  const targetMessage = messages[messageIndex];
  if (!canModifySignupChatMessage(req.auth, chat, targetMessage)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  if (targetMessage.text === text) {
    const teacherName = findTeacherById(chat.teacherId)?.name || 'Преподаватель';
    return res.json({
      ok: true,
      message: targetMessage,
      chat: {
        ...buildSignupChatSummary(chat),
        teacherName,
      },
    });
  }

  const editedMessage = normalizeSignupMessage({
    ...targetMessage,
    text,
    editedAt: new Date().toISOString(),
  });
  if (!editedMessage) return res.status(400).json({ error: 'Некорректное сообщение' });

  messages[messageIndex] = editedMessage;
  chats[index] = normalizeSignupChat(
    rebuildSignupChatAfterMessageMutation(chat, messages)
  ) || chat;
  writeSignupChatsDb(chats);

  const updatedChat = chats[index];
  const teacherName = findTeacherById(updatedChat.teacherId)?.name || 'Преподаватель';
  return res.json({
    ok: true,
    message: editedMessage,
    chat: {
      ...buildSignupChatSummary(updatedChat),
      teacherName,
    },
  });
});

app.delete('/api/signup-chats/:chatId/messages/:messageId', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  const messageId = typeof req.params?.messageId === 'string' ? req.params.messageId.trim() : '';
  if (!messageId) return res.status(400).json({ error: 'messageId required' });

  const chats = readSignupChatsDb();
  const access = ensureSignupChatAccess(req, res, req.params.chatId, { chats });
  if (!access) return;
  const { index } = access;
  const chat = access.chat;
  const messages = Array.isArray(chat.messages) ? [...chat.messages] : [];
  const messageIndex = messages.findIndex((message) => message?.id === messageId);
  if (messageIndex === -1) return res.status(404).json({ error: 'Сообщение не найдено' });

  const targetMessage = messages[messageIndex];
  if (!canModifySignupChatMessage(req.auth, chat, targetMessage)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  messages.splice(messageIndex, 1);
  chats[index] = normalizeSignupChat(
    rebuildSignupChatAfterMessageMutation(chat, messages)
  ) || chat;
  writeSignupChatsDb(chats);

  const updatedChat = chats[index];
  const teacherName = findTeacherById(updatedChat.teacherId)?.name || 'Преподаватель';
  return res.json({
    ok: true,
    messageId,
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

app.get('/api/student-chat/messages', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const chats = readStudentChatsDb();
  const access = ensureStudentTeacherChatAccess(
    req,
    res,
    buildStudentTeacherChatId(req.auth?.id),
    { chats, createIfMissing: true }
  );
  if (!access) return;
  const { index, student } = access;
  let chat = access.chat;

  const markResult = markStudentTeacherChatReadByStudent(chat);
  if (markResult.changed) {
    chats[index] = normalizeStudentTeacherChat(markResult.chat) || markResult.chat;
    writeStudentChatsDb(chats);
    chat = chats[index];
  }

  const teacherName = findTeacherById(chat.teacherId)?.name || 'Преподаватель';
  return res.json({
    chat: {
      ...buildStudentTeacherChatSummary(chat, student),
      teacherName,
      studentName: student?.name || 'Ученик',
    },
    messages: Array.isArray(chat.messages) ? chat.messages : [],
  });
});

app.post('/api/student-chat/messages', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const text = normalizeStudentChatMessageText(req.body?.text);
  const imageDataUrl = normalizeStudentChatImageDataUrl(req.body?.imageDataUrl);
  const imageName = normalizeStudentChatImageName(req.body?.imageName);
  if (!text && !imageDataUrl) return res.status(400).json({ error: 'Введите сообщение или добавьте изображение' });

  const chats = readStudentChatsDb();
  const access = ensureStudentTeacherChatAccess(
    req,
    res,
    buildStudentTeacherChatId(req.auth?.id),
    { chats, createIfMissing: true }
  );
  if (!access) return;
  const { index, student } = access;
  const chat = access.chat;

  const message = createStudentTeacherChatMessage({
    senderRole: 'student',
    senderId: req.auth.id,
    senderName: student?.name || req.auth.name || 'Ученик',
    text,
    imageDataUrl,
    imageName,
  });
  if (!hasStudentTeacherChatMessageContent(message) || !message.senderId) {
    return res.status(400).json({ error: 'Некорректное сообщение' });
  }

  chats[index] = normalizeStudentTeacherChat(appendStudentTeacherChatMessage(chat, message)) || chat;
  writeStudentChatsDb(chats);
  const updatedChat = chats[index];

  const teacherPushKey = String(updatedChat?.teacherId || '').trim()
    ? `teacher:${String(updatedChat.teacherId).trim()}`
    : '';
  if (teacherPushKey) {
    const teacherPushPayload = buildStudentTeacherPushPayloadForTeacher(updatedChat, message, student);
    sendPushNotificationToUserKey(teacherPushKey, teacherPushPayload, { logTarget: teacherPushKey })
      .catch((error) => {
        console.error('[push] failed to send student chat message notification to teacher:', error);
      });
  }

  const teacherName = findTeacherById(updatedChat.teacherId)?.name || 'Преподаватель';
  return res.json({
    ok: true,
    message,
    chat: {
      ...buildStudentTeacherChatSummary(updatedChat, student),
      teacherName,
      studentName: student?.name || 'Ученик',
    },
  });
});

app.get('/api/student-chats', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  const students = readStudentsDb()
    .filter(isActiveStudent)
    .filter((student) => {
      if (!isTeacherRole(req.auth)) return true;
      return student.teacherId === req.auth.id;
    });
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const chats = readStudentChatsDb();

  let changed = false;
  const normalizedChats = chats.map((chat) => {
    const student = studentsById.get(chat.studentId) || findStudentById(chat.studentId);
    if (!student?.id || !student?.teacherId) return chat;
    const expectedId = buildStudentTeacherChatId(student.id);
    if (chat.id === expectedId && chat.studentId === student.id && chat.teacherId === student.teacherId) {
      return chat;
    }
    changed = true;
    return normalizeStudentTeacherChat({
      ...chat,
      id: expectedId,
      studentId: student.id,
      teacherId: student.teacherId,
    }) || chat;
  });
  if (changed) writeStudentChatsDb(normalizedChats);

  const chatByStudentId = new Map(
    normalizedChats.map((chat) => [String(chat?.studentId || '').trim(), chat]).filter((entry) => entry[0])
  );
  const items = students.map((student, index) => {
    const existing = chatByStudentId.get(student.id);
    const chat = existing || createStudentTeacherChatForStudent(student) || {
      id: buildStudentTeacherChatId(student.id),
      studentId: student.id,
      teacherId: student.teacherId,
      createdAt: student.createdAt || '',
      updatedAt: student.createdAt || '',
      lastMessageAt: '',
      lastMessagePreview: '',
      lastMessageSenderRole: '',
      lastReadByTeacherAt: null,
      lastReadByStudentAt: null,
      messages: [],
    };
    return {
      ...buildStudentTeacherChatSummary(chat, student),
      teacherName: findTeacherById(chat.teacherId)?.name || 'Преподаватель',
      sortIndex: index,
    };
  });

  const sorted = items
    .sort((left, right) => {
      const diff = getStudentTeacherChatSortTimestamp(right) - getStudentTeacherChatSortTimestamp(left);
      if (diff !== 0) return diff;
      const leftName = String(left?.studentName || '').trim();
      const rightName = String(right?.studentName || '').trim();
      if (leftName && rightName) {
        const byName = leftName.localeCompare(rightName, 'ru');
        if (byName !== 0) return byName;
      }
      return (left.sortIndex || 0) - (right.sortIndex || 0);
    })
    .map(({ sortIndex, ...rest }) => rest);

  return res.json(sorted);
});

app.get('/api/student-chats/:chatId/messages', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  const chats = readStudentChatsDb();
  const access = ensureStudentTeacherChatAccess(req, res, req.params.chatId, { chats, createIfMissing: true });
  if (!access) return;
  const { index, student } = access;
  let chat = access.chat;

  if (isTeacherRole(req.auth)) {
    const markResult = markStudentTeacherChatReadByTeacher(chat);
    if (markResult.changed) {
      chats[index] = normalizeStudentTeacherChat(markResult.chat) || markResult.chat;
      writeStudentChatsDb(chats);
      chat = chats[index];
    }
  }

  const teacherName = findTeacherById(chat.teacherId)?.name || 'Преподаватель';
  return res.json({
    chat: {
      ...buildStudentTeacherChatSummary(chat, student),
      teacherName,
      studentName: student?.name || 'Ученик',
    },
    messages: Array.isArray(chat.messages) ? chat.messages : [],
  });
});

app.post('/api/student-chats/:chatId/messages', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  const text = normalizeStudentChatMessageText(req.body?.text);
  const imageDataUrl = normalizeStudentChatImageDataUrl(req.body?.imageDataUrl);
  const imageName = normalizeStudentChatImageName(req.body?.imageName);
  if (!text && !imageDataUrl) return res.status(400).json({ error: 'Введите сообщение или добавьте изображение' });

  const chats = readStudentChatsDb();
  const access = ensureStudentTeacherChatAccess(req, res, req.params.chatId, { chats, createIfMissing: true });
  if (!access) return;
  const { index, student } = access;
  const chat = access.chat;

  const teacher = findTeacherById(chat.teacherId);
  const senderId = isTeacherRole(req.auth)
    ? req.auth.id
    : (teacher?.id || chat.teacherId || req.auth.id);
  const senderName = String(teacher?.name || req.auth?.name || 'Преподаватель').trim() || 'Преподаватель';
  const message = createStudentTeacherChatMessage({
    senderRole: 'teacher',
    senderId,
    senderName,
    text,
    imageDataUrl,
    imageName,
  });
  if (!hasStudentTeacherChatMessageContent(message) || !message.senderId) {
    return res.status(400).json({ error: 'Некорректное сообщение' });
  }

  chats[index] = normalizeStudentTeacherChat(appendStudentTeacherChatMessage(chat, message)) || chat;
  writeStudentChatsDb(chats);
  const updatedChat = chats[index];

  const studentPushPayload = buildStudentTeacherPushPayloadForStudent(updatedChat, message, teacher);
  sendPushNotificationToStudentId(student.id, studentPushPayload, { logTarget: `student:${student.id}` })
    .catch((error) => {
      console.error('[push] failed to send student chat message notification to student:', error);
    });

  const teacherName = findTeacherById(updatedChat.teacherId)?.name || senderName;
  return res.json({
    ok: true,
    message,
    chat: {
      ...buildStudentTeacherChatSummary(updatedChat, student),
      teacherName,
      studentName: student?.name || 'Ученик',
    },
  });
});

const normalizeRequestedPushProvider = (value) => {
  const provider = String(value || '').trim().toLowerCase();
  return provider === 'rustore' ? 'rustore' : 'web';
};

const buildPushSubscriptionStatusResponse = ({ subscriptions = [], rustoreTokens = [] } = {}) => {
  const webCount = Array.isArray(subscriptions) ? subscriptions.length : 0;
  const rustoreCount = Array.isArray(rustoreTokens) ? rustoreTokens.length : 0;
  const providers = [];
  if (webCount > 0) providers.push('web');
  if (rustoreCount > 0) providers.push('rustore');
  return {
    subscribed: webCount > 0 || rustoreCount > 0,
    count: webCount + rustoreCount,
    webCount,
    rustoreCount,
    providers,
  };
};

app.get('/api/push/public-key', (req, res) => {
  if (!isStudentRole(req.auth) && !isTeacherRole(req.auth) && !isLeadRole(req.auth)) return forbid(res);
  if (isStudentRole(req.auth)) {
    const student = findStudentById(req.auth.id);
    if (!student) return res.status(404).json({ error: 'Ученик не найден' });
  } else if (isTeacherRole(req.auth)) {
    const teacher = findTeacherById(req.auth.id);
    if (!teacher) return res.status(404).json({ error: 'Учитель не найден' });
  }
  const runtime = ensurePushRuntimeConfigured();
  if (!runtime.enabled || !runtime.publicKey) {
    return res.status(503).json({ error: runtime.error || 'Push не настроен на сервере' });
  }
  return res.json({ publicKey: runtime.publicKey });
});

app.get('/api/push/subscription', (req, res) => {
  if (!isStudentRole(req.auth) && !isTeacherRole(req.auth) && !isLeadRole(req.auth)) return forbid(res);
  const pushDb = readPushDb();
  let targets = { subscriptions: [], rustoreTokens: [] };
  if (isStudentRole(req.auth)) {
    const student = findStudentById(req.auth.id);
    if (!student) return res.status(404).json({ error: 'Ученик не найден' });
    targets = getStudentPushTargets(pushDb, student.id);
  } else {
    const userKey = getPushUserStorageKey(req.auth);
    if (!userKey) return forbid(res);
    targets = getUserPushTargets(pushDb, userKey);
  }
  return res.json(buildPushSubscriptionStatusResponse(targets));
});

app.post('/api/push/test', async (req, res) => {
  if (!isStudentRole(req.auth) && !isTeacherRole(req.auth) && !isLeadRole(req.auth)) return forbid(res);
  try {
    const pushDb = readPushDb();
    let userKey = '';
    let logTarget = '';
    let targets = { subscriptions: [], rustoreTokens: [] };

    if (isStudentRole(req.auth)) {
      const student = findStudentById(req.auth.id);
      if (!student) return res.status(404).json({ error: 'Ученик не найден' });
      logTarget = `student:${student.id}`;
      targets = getStudentPushTargets(pushDb, student.id);
    } else {
      userKey = getPushUserStorageKey(req.auth);
      if (!userKey) return forbid(res);
      logTarget = userKey;
      targets = getUserPushTargets(pushDb, userKey);
    }

    if (!hasPushTargets(targets)) {
      return res.status(400).json({
        error: 'Push не включен на этом устройстве. Сначала нажмите "Включить push".',
      });
    }

    const payload = buildPushTestPayload(req.auth);
    const result = isStudentRole(req.auth)
      ? await sendPushNotificationToStudentId(req.auth.id, payload, { logTarget: `push-test:${logTarget}` })
      : await sendPushNotificationToUserKey(userKey, payload, { logTarget: `push-test:${logTarget}` });

    if (result.successCount <= 0) {
      return res.status(502).json({
        error: 'Не удалось доставить тестовое push-уведомление. Проверьте разрешения приложения или браузера.',
      });
    }

    return res.json({
      ok: true,
      sent: result.successCount,
      staleRemoved: result.staleEndpoints.length + (Array.isArray(result.staleTokens) ? result.staleTokens.length : 0),
    });
  } catch (error) {
    console.error('[push] test notification failed:', error);
    return res.status(500).json({ error: 'Не удалось отправить тестовое push-уведомление' });
  }
});

app.post('/api/push/subscription', (req, res) => {
  if (!isStudentRole(req.auth) && !isTeacherRole(req.auth) && !isLeadRole(req.auth)) return forbid(res);
  let student = null;
  let userKey = '';
  if (isStudentRole(req.auth)) {
    student = findStudentById(req.auth.id);
    if (!student) return res.status(404).json({ error: 'Ученик не найден' });
  } else {
    userKey = getPushUserStorageKey(req.auth);
    if (!userKey) return forbid(res);
  }
  const provider = normalizeRequestedPushProvider(req.body?.provider);
  const userAgent = typeof req.headers['user-agent'] === 'string'
    ? req.headers['user-agent'].slice(0, 500)
    : '';

  const pushDb = readPushDb();
  const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
  const subscriptionsByUser = normalizePushSubscriptionsByUser(pushDb.subscriptionsByUser);
  const rustoreTokensByStudent = normalizeRuStoreTokensByStudent(pushDb.rustoreTokensByStudent);
  const rustoreTokensByUser = normalizeRuStoreTokensByUser(pushDb.rustoreTokensByUser);
  let changed = false;
  const nowIso = new Date().toISOString();

  if (provider === 'rustore') {
    const token = normalizeRuStorePushToken(req.body?.token || req.body);
    if (!token) {
      return res.status(400).json({ error: 'Некорректный RuStore push-токен' });
    }

    Object.keys(rustoreTokensByStudent).forEach((studentId) => {
      if (student && studentId === student.id) return;
      const filtered = (rustoreTokensByStudent[studentId] || []).filter((entry) => entry.token !== token);
      if (filtered.length !== (rustoreTokensByStudent[studentId] || []).length) {
        changed = true;
        if (filtered.length > 0) rustoreTokensByStudent[studentId] = filtered;
        else delete rustoreTokensByStudent[studentId];
      }
    });
    Object.keys(rustoreTokensByUser).forEach((key) => {
      if (userKey && key === userKey) return;
      const filtered = (rustoreTokensByUser[key] || []).filter((entry) => entry.token !== token);
      if (filtered.length !== (rustoreTokensByUser[key] || []).length) {
        changed = true;
        if (filtered.length > 0) rustoreTokensByUser[key] = filtered;
        else delete rustoreTokensByUser[key];
      }
    });

    const ownerList = student
      ? (Array.isArray(rustoreTokensByStudent[student.id]) ? rustoreTokensByStudent[student.id] : [])
      : (Array.isArray(rustoreTokensByUser[userKey]) ? rustoreTokensByUser[userKey] : []);
    const current = [...ownerList];
    const idx = current.findIndex((entry) => entry.token === token);
    if (idx >= 0) {
      const prev = current[idx];
      current[idx] = {
        ...prev,
        token,
        updatedAt: nowIso,
        userAgent,
        platform: 'android',
      };
    } else {
      current.unshift({
        token,
        createdAt: nowIso,
        updatedAt: nowIso,
        userAgent,
        platform: 'android',
      });
    }

    if (student) rustoreTokensByStudent[student.id] = current;
    else rustoreTokensByUser[userKey] = current;

    writePushDb({
      ...pushDb,
      subscriptionsByStudent,
      subscriptionsByUser,
      rustoreTokensByStudent,
      rustoreTokensByUser,
    });

    const targets = student
      ? getStudentPushTargets({ subscriptionsByStudent, subscriptionsByUser, rustoreTokensByStudent, rustoreTokensByUser }, student.id)
      : getUserPushTargets({ subscriptionsByStudent, subscriptionsByUser, rustoreTokensByStudent, rustoreTokensByUser }, userKey);

    return res.json({
      ok: true,
      provider: 'rustore',
      ...buildPushSubscriptionStatusResponse(targets),
      changed: changed || idx === -1,
    });
  }

  const runtime = ensurePushRuntimeConfigured();
  if (!runtime.enabled) {
    return res.status(503).json({ error: runtime.error || 'Push не настроен на сервере' });
  }

  const subscription = normalizePushSubscription(req.body?.subscription || req.body);
  if (!subscription) {
    return res.status(400).json({ error: 'Некорректная push-подписка' });
  }

  Object.keys(subscriptionsByStudent).forEach((studentId) => {
    if (student && studentId === student.id) return;
    const filtered = (subscriptionsByStudent[studentId] || []).filter((entry) => entry.endpoint !== subscription.endpoint);
    if (filtered.length !== (subscriptionsByStudent[studentId] || []).length) {
      changed = true;
      if (filtered.length > 0) subscriptionsByStudent[studentId] = filtered;
      else delete subscriptionsByStudent[studentId];
    }
  });
  Object.keys(subscriptionsByUser).forEach((key) => {
    if (userKey && key === userKey) return;
    const filtered = (subscriptionsByUser[key] || []).filter((entry) => entry.endpoint !== subscription.endpoint);
    if (filtered.length !== (subscriptionsByUser[key] || []).length) {
      changed = true;
      if (filtered.length > 0) subscriptionsByUser[key] = filtered;
      else delete subscriptionsByUser[key];
    }
  });

  const ownerList = student
    ? (Array.isArray(subscriptionsByStudent[student.id]) ? subscriptionsByStudent[student.id] : [])
    : (Array.isArray(subscriptionsByUser[userKey]) ? subscriptionsByUser[userKey] : []);
  const current = [...ownerList];
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
  if (student) {
    subscriptionsByStudent[student.id] = current;
  } else {
    subscriptionsByUser[userKey] = current;
  }
  writePushDb({
    ...pushDb,
    subscriptionsByStudent,
    subscriptionsByUser,
    rustoreTokensByStudent,
    rustoreTokensByUser,
  });

  const targets = student
    ? getStudentPushTargets({ subscriptionsByStudent, subscriptionsByUser, rustoreTokensByStudent, rustoreTokensByUser }, student.id)
    : getUserPushTargets({ subscriptionsByStudent, subscriptionsByUser, rustoreTokensByStudent, rustoreTokensByUser }, userKey);

  return res.json({
    ok: true,
    provider: 'web',
    ...buildPushSubscriptionStatusResponse(targets),
    changed: changed || idx === -1,
  });
});

app.delete('/api/push/subscription', (req, res) => {
  if (!isStudentRole(req.auth) && !isTeacherRole(req.auth) && !isLeadRole(req.auth)) return forbid(res);
  let student = null;
  let userKey = '';
  if (isStudentRole(req.auth)) {
    student = findStudentById(req.auth.id);
    if (!student) return res.status(404).json({ error: 'Ученик не найден' });
  } else {
    userKey = getPushUserStorageKey(req.auth);
    if (!userKey) return forbid(res);
  }

  const provider = normalizeRequestedPushProvider(req.body?.provider || req.query?.provider);
  const endpoint = String(req.body?.endpoint || req.query?.endpoint || '').trim();
  const token = normalizeRuStorePushToken(req.body?.token || req.query?.token || '');
  const pushDb = readPushDb();
  const subscriptionsByStudent = normalizePushSubscriptionsByStudent(pushDb.subscriptionsByStudent);
  const subscriptionsByUser = normalizePushSubscriptionsByUser(pushDb.subscriptionsByUser);
  const rustoreTokensByStudent = normalizeRuStoreTokensByStudent(pushDb.rustoreTokensByStudent);
  const rustoreTokensByUser = normalizeRuStoreTokensByUser(pushDb.rustoreTokensByUser);
  const remindersByStudent = normalizePushRemindersByStudent(pushDb.remindersByStudent);
  const lessonReminderStateByStudent = normalizePushLessonReminderStateByStudent(pushDb.lessonReminderStateByStudent);
  const teacherCalendarReminderStateByTeacher = normalizePushTeacherCalendarReminderStateByTeacher(pushDb.teacherCalendarReminderStateByTeacher);

  if (provider === 'rustore') {
    const current = student
      ? (Array.isArray(rustoreTokensByStudent[student.id]) ? [...rustoreTokensByStudent[student.id]] : [])
      : (Array.isArray(rustoreTokensByUser[userKey]) ? [...rustoreTokensByUser[userKey]] : []);
    const next = token
      ? current.filter((entry) => entry.token !== token)
      : [];

    if (next.length > 0) {
      if (student) rustoreTokensByStudent[student.id] = next;
      else rustoreTokensByUser[userKey] = next;
    } else if (student) {
      delete rustoreTokensByStudent[student.id];
      if (!subscriptionsByStudent[student.id] || subscriptionsByStudent[student.id].length === 0) {
        delete remindersByStudent[student.id];
        if (lessonReminderStateByStudent[student.id]) delete lessonReminderStateByStudent[student.id];
      }
    } else {
      delete rustoreTokensByUser[userKey];
      if (
        (!subscriptionsByUser[userKey] || subscriptionsByUser[userKey].length === 0)
        && isTeacherRole(req.auth)
      ) {
        const teacherId = String(req.auth?.id || '').trim();
        if (teacherId && teacherCalendarReminderStateByTeacher[teacherId]) {
          delete teacherCalendarReminderStateByTeacher[teacherId];
        }
      }
    }

    writePushDb({
      ...pushDb,
      subscriptionsByStudent,
      subscriptionsByUser,
      rustoreTokensByStudent,
      rustoreTokensByUser,
      remindersByStudent,
      lessonReminderStateByStudent,
      teacherCalendarReminderStateByTeacher,
    });

    const targets = student
      ? getStudentPushTargets({ subscriptionsByStudent, subscriptionsByUser, rustoreTokensByStudent, rustoreTokensByUser }, student.id)
      : getUserPushTargets({ subscriptionsByStudent, subscriptionsByUser, rustoreTokensByStudent, rustoreTokensByUser }, userKey);

    return res.json({
      ok: true,
      provider: 'rustore',
      ...buildPushSubscriptionStatusResponse(targets),
    });
  }

  const current = student
    ? (Array.isArray(subscriptionsByStudent[student.id]) ? [...subscriptionsByStudent[student.id]] : [])
    : (Array.isArray(subscriptionsByUser[userKey]) ? [...subscriptionsByUser[userKey]] : []);
  const next = endpoint
    ? current.filter((entry) => entry.endpoint !== endpoint)
    : [];

  if (next.length > 0) {
    if (student) subscriptionsByStudent[student.id] = next;
    else subscriptionsByUser[userKey] = next;
  } else if (student) {
    delete subscriptionsByStudent[student.id];
    if (!rustoreTokensByStudent[student.id] || rustoreTokensByStudent[student.id].length === 0) {
      delete remindersByStudent[student.id];
      if (lessonReminderStateByStudent[student.id]) delete lessonReminderStateByStudent[student.id];
    }
  } else {
    delete subscriptionsByUser[userKey];
    if (
      (!rustoreTokensByUser[userKey] || rustoreTokensByUser[userKey].length === 0)
      && isTeacherRole(req.auth)
    ) {
      const teacherId = String(req.auth?.id || '').trim();
      if (teacherId && teacherCalendarReminderStateByTeacher[teacherId]) {
        delete teacherCalendarReminderStateByTeacher[teacherId];
      }
    }
  }

  writePushDb({
    ...pushDb,
    subscriptionsByStudent,
    subscriptionsByUser,
    rustoreTokensByStudent,
    rustoreTokensByUser,
    remindersByStudent,
    lessonReminderStateByStudent,
    teacherCalendarReminderStateByTeacher,
  });

  const targets = student
    ? getStudentPushTargets({ subscriptionsByStudent, subscriptionsByUser, rustoreTokensByStudent, rustoreTokensByUser }, student.id)
    : getUserPushTargets({ subscriptionsByStudent, subscriptionsByUser, rustoreTokensByStudent, rustoreTokensByUser }, userKey);

  return res.json({
    ok: true,
    provider: 'web',
    ...buildPushSubscriptionStatusResponse(targets),
  });
});

app.get('/api/push/lesson-reminder', (req, res) => {
  const { studentId } = req.query || {};
  const effectiveStudentId = isStudentRole(req.auth)
    ? req.auth.id
    : studentId;
  const student = ensureStudentAccess(req, res, effectiveStudentId, { missingError: 'studentId required' });
  if (!student) return;
  const pushDb = readPushDb();
  const settingsByStudent = normalizePushLessonReminderSettingsByStudent(pushDb.lessonReminderSettingsByStudent);
  const entry = settingsByStudent[student.id] || null;
  return res.json({
    enabled: Boolean(entry?.enabled),
    updatedAt: entry?.updatedAt || '',
  });
});

app.patch('/api/push/lesson-reminder', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const { studentId, enabled } = req.body || {};
  const effectiveStudentId = studentId || req.auth.id;
  const student = ensureStudentAccess(req, res, effectiveStudentId, { missingError: 'studentId required' });
  if (!student) return;

  const nextEnabled = Boolean(enabled);
  const nowIso = new Date().toISOString();
  const pushDb = readPushDb();
  const lessonReminderSettingsByStudent = normalizePushLessonReminderSettingsByStudent(pushDb.lessonReminderSettingsByStudent);
  const lessonReminderStateByStudent = normalizePushLessonReminderStateByStudent(pushDb.lessonReminderStateByStudent);

  lessonReminderSettingsByStudent[student.id] = {
    enabled: nextEnabled,
    updatedAt: nowIso,
  };
  if (!nextEnabled && lessonReminderStateByStudent[student.id]) {
    delete lessonReminderStateByStudent[student.id];
  }

  writePushDb({
    ...pushDb,
    lessonReminderSettingsByStudent,
    lessonReminderStateByStudent,
  });

  return res.json({
    ok: true,
    enabled: nextEnabled,
    updatedAt: nowIso,
  });
});

app.get('/api/push/teacher-calendar-reminder', (req, res) => {
  const { teacherId } = req.query || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const effectiveTeacherId = isTeacherRole(req.auth)
    ? req.auth.id
    : teacherId;
  const teacher = ensureTeacherAccess(req, res, effectiveTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const pushDb = readPushDb();
  const settingsByTeacher = normalizePushTeacherCalendarReminderSettingsByTeacher(pushDb.teacherCalendarReminderSettingsByTeacher);
  const entry = settingsByTeacher[teacher.id] || null;
  return res.json({
    enabled: Boolean(entry?.enabled),
    updatedAt: entry?.updatedAt || '',
  });
});

app.patch('/api/push/teacher-calendar-reminder', (req, res) => {
  const { teacherId, enabled } = req.body || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const effectiveTeacherId = isTeacherRole(req.auth)
    ? req.auth.id
    : teacherId;
  const teacher = ensureTeacherAccess(req, res, effectiveTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;

  const nextEnabled = Boolean(enabled);
  const nowIso = new Date().toISOString();
  const pushDb = readPushDb();
  const reminderSettingsByTeacher = normalizePushTeacherCalendarReminderSettingsByTeacher(pushDb.teacherCalendarReminderSettingsByTeacher);
  const reminderStateByTeacher = normalizePushTeacherCalendarReminderStateByTeacher(pushDb.teacherCalendarReminderStateByTeacher);

  reminderSettingsByTeacher[teacher.id] = {
    enabled: nextEnabled,
    updatedAt: nowIso,
  };
  if (!nextEnabled && reminderStateByTeacher[teacher.id]) {
    delete reminderStateByTeacher[teacher.id];
  }

  writePushDb({
    ...pushDb,
    teacherCalendarReminderSettingsByTeacher: reminderSettingsByTeacher,
    teacherCalendarReminderStateByTeacher: reminderStateByTeacher,
  });

  return res.json({
    ok: true,
    enabled: nextEnabled,
    updatedAt: nowIso,
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
  const notesUsageByStudentId = new Map();
  const filesDb = readFilesDb();
  filesDb.forEach((entry) => {
    if (!entry || isLessonSharedFile(entry)) return;
    const studentId = typeof entry.studentId === 'string' ? entry.studentId.trim() : '';
    if (!studentId) return;
    const sizeBytes = getEntrySizeBytes(entry);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return;
    notesUsageByStudentId.set(studentId, (notesUsageByStudentId.get(studentId) || 0) + sizeBytes);
  });
  const sanitized = students.map(({ codeHash, code, ...rest }) => {
    const data = getStudentData(rest.id);
    const xpTotal = normalizeXpTotal(data?.xpTotal);
    const coinsTotal = normalizeCoinsTotal(data?.coinsTotal);
    const level = getLevelFromXp(xpTotal);
    return {
      ...rest,
      leaderboardAlias: normalizeLeaderboardAlias(data?.leaderboardAlias),
      xpTotal,
      coinsTotal,
      level,
      notesUsageBytes: notesUsageByStudentId.get(rest.id) || 0,
    };
  });
  res.json(sanitized);
});

app.get('/api/students/leaderboard', (req, res) => {
  const { teacherId, studentId } = req.query;
  const requestedTeacherId = typeof teacherId === 'string' ? teacherId.trim() : '';
  const requestedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
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
  const leaderboardWindow = {
    startDayNum,
    endDayNum,
    days: LEADERBOARD_WEEK_DAYS,
  };
  const currentStudentId = isStudentRole(req.auth) ? String(req.auth.id || '') : '';
  const selectedStudentId = isTeacherRole(req.auth) && requestedStudentId
    ? requestedStudentId
    : currentStudentId;
  const anonNameById = buildLeaderboardAnonNameMap(students);
  const testsDb = readTestsDb();

  const items = students.map((student) => {
    const data = getStudentData(student.id);
    const xpTotal = normalizeXpTotal(data?.xpTotal);
    const weeklyXp = getRecentXpFromSolvedEvents(data?.solvedEvents, endDayNum, LEADERBOARD_WEEK_DAYS, data?.artifactLevels);
    const level = getLevelFromXp(xpTotal);
    const alias = normalizeLeaderboardAlias(data?.leaderboardAlias);
    const mainName = includeTeacherIdentity ? normalizeStudentName(student.name) : '';
    const nickname = includeTeacherIdentity ? normalizeStudentNickname(student.nickname) : '';
    const activity = getLeaderboardProfileActivitySummary(data?.solvedEvents, endDayNum, LEADERBOARD_WEEK_DAYS);
    const courseProgress = getLeaderboardProgressSummaryByKind(data, testsDb, 'course');
    const pythonProgress = getLeaderboardProgressSummaryByKind(data, testsDb, 'python');
    const platformDays = getLeaderboardPlatformDaysSummary(student, leaderboardWindow);
    const profileThemeState = buildProfileThemeCollectionPayload(data?.profileThemeInventory, data?.activeProfileThemeId);
    const weeklyCoursePercent = getRecentProgressPercentFromSolvedEvents(
      data?.solvedEvents,
      testsDb,
      endDayNum,
      LEADERBOARD_WEEK_DAYS,
      'course'
    );
    const weeklyPythonPercent = getRecentProgressPercentFromSolvedEvents(
      data?.solvedEvents,
      testsDb,
      endDayNum,
      LEADERBOARD_WEEK_DAYS,
      'python'
    );
    return {
      studentId: student.id,
      publicName: alias || anonNameById.get(student.id) || 'Аноним',
      level,
      xpTotal,
      weeklyXp,
      solvedQuestions: getSolvedQuestionCountFromSolvedByTask(data?.solvedByTask),
      weeklySolvedQuestions: activity.weeklySolvedQuestions,
      activeDaysTotal: activity.totalActiveDays,
      activeDaysWeek: activity.weeklyActiveDays,
      course: {
        ...courseProgress,
        weeklyPercent: weeklyCoursePercent,
        weeklySolvedQuestions: getRecentSolvedQuestionCountByKind(
          data?.solvedEvents,
          endDayNum,
          LEADERBOARD_WEEK_DAYS,
          'course'
        ),
      },
      python: {
        ...pythonProgress,
        weeklyPercent: weeklyPythonPercent,
        weeklySolvedQuestions: getRecentSolvedQuestionCountByKind(
          data?.solvedEvents,
          endDayNum,
          LEADERBOARD_WEEK_DAYS,
          'python'
        ),
      },
      platformDays,
      profileTheme: profileThemeState.active,
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
  const currentStudentData = currentStudentId
    ? getStudentData(currentStudentId)
    : null;
  const selectedStudentEntry = selectedStudentId
    ? (students.find((item) => item.id === selectedStudentId) || null)
    : null;
  const selectedStudentItem = selectedStudentId
    ? (items.find((item) => item.studentId === selectedStudentId) || null)
    : null;
  const selectedStudentData = selectedStudentEntry
    ? getStudentData(selectedStudentId)
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
          coinsTotal: normalizeCoinsTotal(currentStudentData?.coinsTotal),
          mockTimerChests: buildMockTimerChestPanelState(currentStudentData),
          profileThemes: buildProfileThemeCollectionPayload(
            currentStudentData?.profileThemeInventory,
            currentStudentData?.activeProfileThemeId
          ),
          leaderboardAliasRewardClaimed: Boolean(currentStudentData?.leaderboardAliasRewardClaimed),
        }
      : null,
    selectedStudent: selectedStudentItem
      ? {
          studentId: selectedStudentItem.studentId,
          publicName: selectedStudentItem.publicName,
          hasAlias: selectedStudentItem.hasAlias,
          mainName: normalizeStudentName(selectedStudentEntry?.name || ''),
          nickname: normalizeStudentNickname(selectedStudentEntry?.nickname || ''),
          coinsTotal: normalizeCoinsTotal(selectedStudentData?.coinsTotal),
          mockTimerChests: buildMockTimerChestPanelState(selectedStudentData),
          profileThemes: buildProfileThemeCollectionPayload(
            selectedStudentData?.profileThemeInventory,
            selectedStudentData?.activeProfileThemeId
          ),
        }
      : null,
    altar: selectedStudentData ? buildStudentArtifactState(selectedStudentData) : null,
  });
});

app.post('/api/students/mock-timer-chests/:chestId/start', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const chestId = String(req.params?.chestId || '').trim();
  if (!chestId) return res.status(400).json({ error: 'chestId required' });
  const student = ensureStudentAccess(req, res, req.auth.id);
  if (!student) return;
  const data = getStudentData(student.id);
  const queue = normalizeMockTimerChestQueue(data?.mockTimerChests);
  const chestIndex = queue.findIndex((chest) => chest.id === chestId);
  if (chestIndex < 0) return res.status(404).json({ error: 'Сундук не найден' });

  const now = new Date();
  const nowMs = now.getTime();
  const targetState = getMockTimerChestState(queue[chestIndex], nowMs);
  if (targetState === 'ready') {
    return res.status(409).json({ error: 'Сундук уже готов к открытию.' });
  }
  if (targetState === 'opening') {
    return res.json({ mockTimerChests: buildMockTimerChestPanelState(data, now) });
  }
  const hasActiveOpening = queue.some((chest) => getMockTimerChestState(chest, nowMs) === 'opening');
  if (hasActiveOpening) {
    return res.status(409).json({ error: 'Сначала дождитесь открытия текущего сундука.' });
  }

  const openStartedAt = now.toISOString();
  const openReadyAt = new Date(nowMs + MOCK_TIMER_CHEST_OPEN_DURATION_MS).toISOString();
  queue[chestIndex] = {
    ...queue[chestIndex],
    openStartedAt,
    openReadyAt,
  };
  const updated = setStudentData(student.id, {
    ...data,
    mockTimerChests: queue,
  });
  return res.json({
    mockTimerChests: buildMockTimerChestPanelState(updated, now),
  });
});

app.post('/api/students/mock-timer-chests/:chestId/prepare', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const chestId = String(req.params?.chestId || '').trim();
  if (!chestId) return res.status(400).json({ error: 'chestId required' });
  const student = ensureStudentAccess(req, res, req.auth.id);
  if (!student) return;
  const data = getStudentData(student.id);
  const queue = normalizeMockTimerChestQueue(data?.mockTimerChests);
  const chestIndex = queue.findIndex((chest) => chest.id === chestId);
  if (chestIndex < 0) return res.status(404).json({ error: 'Сундук не найден' });

  const now = new Date();
  const nowMs = now.getTime();
  let chest = queue[chestIndex];
  const targetState = getMockTimerChestState(chest, nowMs);
  if (targetState !== 'ready') {
    return res.status(409).json({ error: 'Сундук ещё не готов к открытию.' });
  }

  const pendingReward = normalizeMockTimerChestPendingReward(chest.pendingReward)
    || createMockTimerChestPendingReward(data, now.toISOString());
  if (!pendingReward) {
    return res.status(500).json({ error: 'Не удалось подготовить награду сундука.' });
  }
  chest = {
    ...chest,
    pendingReward,
  };
  queue[chestIndex] = chest;
  const updated = setStudentData(student.id, {
    ...data,
    mockTimerChests: queue,
  });
  const rewardSnapshot = buildMockTimerChestRewardSnapshot(chest, pendingReward, updated, pendingReward.preparedAt);
  return res.json({
    mockTimerChests: buildMockTimerChestPanelState(updated, now),
    mockChestReward: rewardSnapshot.mockChestReward,
    mockChestRewards: [rewardSnapshot.mockChestReward],
  });
});

app.post('/api/students/mock-timer-chests/:chestId/claim', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const chestId = String(req.params?.chestId || '').trim();
  if (!chestId) return res.status(400).json({ error: 'chestId required' });
  const student = ensureStudentAccess(req, res, req.auth.id);
  if (!student) return;
  const data = getStudentData(student.id);
  const queue = normalizeMockTimerChestQueue(data?.mockTimerChests);
  const chestIndex = queue.findIndex((chest) => chest.id === chestId);
  if (chestIndex < 0) return res.status(404).json({ error: 'Сундук не найден' });

  const now = new Date();
  const nowMs = now.getTime();
  let chest = queue[chestIndex];
  const targetState = getMockTimerChestState(chest, nowMs);
  if (targetState !== 'ready') {
    return res.status(409).json({ error: 'Сундук ещё открывается.' });
  }

  const openedAt = now.toISOString();
  const pendingReward = normalizeMockTimerChestPendingReward(chest.pendingReward)
    || createMockTimerChestPendingReward(data, openedAt);
  if (!pendingReward) {
    return res.status(500).json({ error: 'Не удалось открыть сундук.' });
  }
  const rewardSnapshot = buildMockTimerChestRewardSnapshot(chest, pendingReward, data, pendingReward.preparedAt || openedAt);

  const nextQueue = queue.filter((item) => item.id !== chest.id);
  const lastArtifactDropRecord = rewardSnapshot.artifactDropRecords[rewardSnapshot.artifactDropRecords.length - 1] || null;
  const updated = setStudentData(student.id, {
    ...data,
    mockTimerChests: nextQueue,
    xpTotal: rewardSnapshot.xpTotal,
    coinsTotal: rewardSnapshot.coinsTotal,
    artifactInventory: rewardSnapshot.artifactInventory,
    artifactLevels: rewardSnapshot.artifactLevels,
    artifactCards: rewardSnapshot.artifactCards,
    artifactTotalPulls: rewardSnapshot.artifactTotalPulls,
    profileThemeInventory: rewardSnapshot.profileThemeInventory,
    activeProfileThemeId: rewardSnapshot.activeProfileThemeId,
    ...(lastArtifactDropRecord
      ? {
        artifactLastPull: {
          id: lastArtifactDropRecord.artifactId,
          pulledAt: lastArtifactDropRecord.pulledAt,
          ...(lastArtifactDropRecord.maxLevelDuplicateCoins > 0
            ? { maxLevelDuplicateCoins: lastArtifactDropRecord.maxLevelDuplicateCoins }
            : {}),
        },
      }
      : {}),
  });

  const mockArtifactDrops = rewardSnapshot.mockArtifactDrops;
  const mockChestReward = rewardSnapshot.mockChestReward;
  return res.json({
    mockTimerChests: buildMockTimerChestPanelState(updated, now),
    mockChestReward,
    mockChestRewards: [mockChestReward],
    coinsGained: normalizeCoinsTotal(
      mockChestReward.coinsGained
      + rewardSnapshot.artifactCoinsGained
      + rewardSnapshot.profileThemeCoinsGained
    ),
    coinsTotal: normalizeCoinsTotal(updated.coinsTotal),
    xpGained: normalizeXpTotal(rewardSnapshot.artifactXpGained),
    xpTotal: normalizeXpTotal(updated.xpTotal),
    artifactXpGained: rewardSnapshot.artifactXpGained,
    artifactCoinsGained: rewardSnapshot.artifactCoinsGained,
    profileThemeCoinsGained: rewardSnapshot.profileThemeCoinsGained,
    profileThemes: buildProfileThemeCollectionPayload(updated.profileThemeInventory, updated.activeProfileThemeId),
    altar: buildStudentArtifactState(updated),
    ...(mockArtifactDrops.length > 0
      ? {
        mockArtifactDrop: mockArtifactDrops[0],
        mockArtifactDrops,
      }
      : {}),
  });
});

app.get('/api/students/leaderboard-profile', (req, res) => {
  const requestedStudentId = typeof req.query?.studentId === 'string'
    ? req.query.studentId.trim()
    : '';
  if (!requestedStudentId) {
    return res.status(400).json({ error: 'studentId required' });
  }

  const targetStudent = findStudentById(requestedStudentId);
  if (!targetStudent || targetStudent.deletedAt) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }

  if (isStudentRole(req.auth)) {
    const currentStudent = ensureStudentAccess(req, res, req.auth?.id);
    if (!currentStudent) return;
    if (String(currentStudent.teacherId || '').trim() !== String(targetStudent.teacherId || '').trim()) {
      return res.status(403).json({ error: 'Профиль доступен только внутри вашей группы.' });
    }
  } else if (isTeacherRole(req.auth)) {
    if (String(targetStudent.teacherId || '').trim() !== String(req.auth.id || '').trim()) {
      return forbid(res);
    }
  } else if (!isAdminRole(req.auth)) {
    return forbid(res);
  }

  const groupStudents = readStudentsDb().filter((student) => (
    isActiveStudent(student)
    && String(student.teacherId || '').trim() === String(targetStudent.teacherId || '').trim()
  ));
  const anonNameById = buildLeaderboardAnonNameMap(groupStudents);
  const testsDb = readTestsDb();
  const mockExamById = readMockExamsDb().reduce((acc, exam) => {
    const examId = String(exam?.id || '').trim();
    if (examId) acc[examId] = exam;
    return acc;
  }, {});
  const todayKey = new Date().toISOString().slice(0, 10);
  const fallbackEndDayNum = Math.floor(Date.now() / DAY_MS);
  const parsedTodayNum = dayKeyToNumber(todayKey);
  const endDayNum = Number.isFinite(parsedTodayNum) ? parsedTodayNum : fallbackEndDayNum;
  const data = getStudentData(targetStudent.id);
  const artifactState = buildStudentArtifactState(data);
  const xpTotal = normalizeXpTotal(data?.xpTotal);
  const coinsBalance = normalizeCoinsTotal(data?.coinsTotal);
  const coinsSpentTotal = normalizeCoinsSpentTotal(data?.coinsSpentTotal);
  const alias = normalizeLeaderboardAlias(data?.leaderboardAlias);
  const profileThemeState = buildProfileThemeCollectionPayload(data?.profileThemeInventory, data?.activeProfileThemeId);

  return res.json({
    studentId: targetStudent.id,
    publicName: alias || anonNameById.get(targetStudent.id) || 'Аноним',
    hasAlias: Boolean(alias),
    isCurrent: isStudentRole(req.auth) && String(req.auth.id || '') === targetStudent.id,
    level: getLevelFromXp(xpTotal),
    xpTotal,
    weeklyXp: getRecentXpFromSolvedEvents(data?.solvedEvents, endDayNum, LEADERBOARD_WEEK_DAYS, data?.artifactLevels),
    profileTheme: profileThemeState.active,
    profileThemes: profileThemeState,
    streak: normalizeStreak(data?.streak),
    preparation: getLeaderboardProfilePreparationSummary(targetStudent),
    progress: getLeaderboardProfileProgressSummary(data, testsDb),
    activity: getLeaderboardProfileActivitySummary(data?.solvedEvents, endDayNum, LEADERBOARD_WEEK_DAYS),
    mocks: getLeaderboardProfileMockSummary(data?.mockAttempts, mockExamById),
    coins: {
      balance: coinsBalance,
      spentTotal: coinsSpentTotal,
      earnedTotal: coinsBalance + coinsSpentTotal,
    },
    artifacts: {
      totalPulls: normalizeArtifactTotalPulls(artifactState?.totalPulls),
      totalOwned: Math.max(0, Math.floor(Number(artifactState?.totalOwned) || 0)),
      uniqueOwned: Math.max(0, Math.floor(Number(artifactState?.uniqueOwned) || 0)),
      collection: Array.isArray(artifactState?.collection) ? artifactState.collection : [],
      lastPull: artifactState?.lastPull || null,
      bonuses: artifactState?.bonuses && typeof artifactState.bonuses === 'object'
        ? artifactState.bonuses
        : { entries: [] },
      highestRank: getHighestArtifactRankFromCollection(artifactState?.collection),
    },
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
  const coinsGained = data?.leaderboardAliasRewardClaimed ? 0 : LEADERBOARD_ALIAS_COIN_REWARD;
  const coinsTotal = normalizeCoinsTotal(data?.coinsTotal) + coinsGained;
  const updated = setStudentData(student.id, {
    ...data,
    leaderboardAlias: alias,
    leaderboardAliasRewardClaimed: true,
    coinsTotal,
  });
  return res.json({
    ok: true,
    alias: normalizeLeaderboardAlias(updated?.leaderboardAlias),
    coinsGained,
    coinsTotal: normalizeCoinsTotal(updated?.coinsTotal),
  });
});

app.patch('/api/students/profile-theme', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const student = ensureStudentAccess(req, res, req.auth.id);
  if (!student) return;

  const data = getStudentData(student.id);
  const profileThemeInventory = normalizeProfileThemeInventory(data?.profileThemeInventory);
  const requestedThemeId = String(req.body?.themeId || '').trim();
  const activeProfileThemeId = requestedThemeId ? normalizeProfileThemeId(requestedThemeId) : '';
  if (requestedThemeId && !activeProfileThemeId) {
    return res.status(400).json({ error: 'Оформление не найдено.' });
  }
  if (activeProfileThemeId && getProfileThemeInventoryCount(profileThemeInventory, activeProfileThemeId) <= 0) {
    return res.status(400).json({ error: 'Сначала нужно выбить это оформление из сундука.' });
  }

  const updated = setStudentData(student.id, {
    ...data,
    profileThemeInventory,
    activeProfileThemeId,
  });
  return res.json({
    ok: true,
    profileThemes: buildProfileThemeCollectionPayload(updated.profileThemeInventory, updated.activeProfileThemeId),
  });
});

app.post('/api/students/altar/spin', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const student = ensureStudentAccess(req, res, req.auth.id);
  if (!student) return;

  const data = getStudentData(student.id);
  const currentCoins = normalizeCoinsTotal(data?.coinsTotal);
  if (currentCoins < ARTIFACT_SPIN_COST) {
    return res.status(400).json({
      error: `Нужно минимум ${ARTIFACT_SPIN_COST} монет для крутки алтаря.`,
    });
  }

  const artifactTotalPullsBefore = normalizeArtifactTotalPulls(data?.artifactTotalPulls);
  const artifact = rollArtifactReward({ totalPullsBefore: artifactTotalPullsBefore });
  if (!artifact) {
    return res.status(500).json({ error: 'Не удалось выбрать артефакт. Попробуйте еще раз.' });
  }

  const pulledAt = new Date().toISOString();
  const artifactInventory = normalizeArtifactInventory(data?.artifactInventory);
  const artifactLevels = normalizeArtifactLevels(data?.artifactLevels, artifactInventory);
  const artifactCards = normalizeArtifactCards(data?.artifactCards, artifactInventory);
  const artifactLevelBeforePull = getArtifactLevel(artifactLevels, artifact.id);
  const maxLevelDuplicateCoins = artifactLevelBeforePull >= ARTIFACT_MAX_LEVEL
    ? getArtifactMaxLevelDuplicateCoinReward(artifact)
    : 0;
  artifactInventory[artifact.id] = Math.max(0, Math.floor(Number(artifactInventory[artifact.id]) || 0)) + 1;
  artifactCards[artifact.id] = Math.max(0, Math.floor(Number(artifactCards[artifact.id]) || 0)) + 1;
  if (!artifactLevels[artifact.id]) artifactLevels[artifact.id] = 1;
  const instantReward = getArtifactInstantRewardForPull(artifact.id);
  const xpGained = normalizeXpTotal(instantReward.xp);
  const coinsGained = normalizeCoinsTotal(instantReward.coins + maxLevelDuplicateCoins);
  const xpTotal = normalizeXpTotal(data?.xpTotal) + xpGained;
  const coinsTotal = Math.max(0, currentCoins - ARTIFACT_SPIN_COST + coinsGained);
  const coinsSpentTotal = normalizeCoinsSpentTotal(data?.coinsSpentTotal) + ARTIFACT_SPIN_COST;
  const artifactTotalPulls = artifactTotalPullsBefore + 1;

  const updated = setStudentData(student.id, {
    ...data,
    xpTotal,
    coinsTotal,
    coinsSpentTotal,
    artifactInventory,
    artifactLevels,
    artifactCards,
    artifactLastPull: {
      id: artifact.id,
      pulledAt,
      ...(maxLevelDuplicateCoins > 0 ? { maxLevelDuplicateCoins } : {}),
    },
    artifactTotalPulls,
  });

  return res.json({
    ok: true,
    xpTotal: updated.xpTotal,
    xpGained,
    coinsTotal: updated.coinsTotal,
    coinsGained,
    maxLevelDuplicateCoins,
    altar: buildStudentArtifactState(updated),
    drop: buildArtifactRewardPayload(
      artifact.id,
      updated.artifactInventory,
      pulledAt,
      updated.artifactLevels,
      updated.artifactCards,
      updated.coinsTotal,
      { maxLevelDuplicateCoins }
    ),
  });
});

app.post('/api/students/altar/upgrade', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const student = ensureStudentAccess(req, res, req.auth.id);
  if (!student) return;

  const artifactId = normalizeArtifactId(req.body?.artifactId);
  if (!artifactId) {
    return res.status(400).json({ error: 'Артефакт не найден.' });
  }

  const data = getStudentData(student.id);
  const artifactInventory = normalizeArtifactInventory(data?.artifactInventory);
  const artifactLevels = normalizeArtifactLevels(data?.artifactLevels, artifactInventory);
  const artifactCards = normalizeArtifactCards(data?.artifactCards, artifactInventory);
  const currentLevel = getArtifactLevel(artifactLevels, artifactId);
  if (currentLevel <= 0 || getArtifactInventoryCount(artifactInventory, artifactId) <= 0) {
    return res.status(400).json({ error: 'Сначала нужно выбить этот артефакт.' });
  }
  if (currentLevel >= ARTIFACT_MAX_LEVEL) {
    return res.status(400).json({ error: 'Артефакт уже на максимальном уровне.' });
  }

  const requirement = getArtifactUpgradeRequirement(currentLevel);
  if (!requirement) {
    return res.status(400).json({ error: 'Для этого уровня улучшение недоступно.' });
  }

  const cardsAvailable = getArtifactInventoryCount(artifactCards, artifactId);
  if (cardsAvailable < requirement.cards) {
    return res.status(400).json({
      error: `Нужно ${requirement.cards} копии этого артефакта для улучшения.`,
    });
  }

  const currentCoins = normalizeCoinsTotal(data?.coinsTotal);
  if (currentCoins < requirement.coins) {
    return res.status(400).json({
      error: `Нужно ${requirement.coins} монет для улучшения.`,
    });
  }

  artifactCards[artifactId] = cardsAvailable - requirement.cards;
  artifactLevels[artifactId] = currentLevel + 1;

  const updated = setStudentData(student.id, {
    ...data,
    coinsTotal: currentCoins - requirement.coins,
    coinsSpentTotal: normalizeCoinsSpentTotal(data?.coinsSpentTotal) + requirement.coins,
    artifactInventory,
    artifactLevels,
    artifactCards,
  });

  return res.json({
    ok: true,
    artifactId,
    level: artifactLevels[artifactId],
    coinsTotal: updated.coinsTotal,
    coinsSpentTotal: updated.coinsSpentTotal,
    altar: buildStudentArtifactState(updated),
  });
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
  const createdCoinsTotal = normalizeCoinsTotal(createdStudentData?.coinsTotal);
  res.json({
    id: entry.id,
    name: entry.name,
    nickname: entry.nickname || '',
    leaderboardAlias: '',
    xpTotal: createdXpTotal,
    coinsTotal: createdCoinsTotal,
    level: getLevelFromXp(createdXpTotal),
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
  const restoredCoinsTotal = normalizeCoinsTotal(restoredData?.coinsTotal);
  res.json({
    id: restored.id,
    name: restored.name,
    nickname: restored.nickname || '',
    leaderboardAlias: normalizeLeaderboardAlias(restoredData?.leaderboardAlias),
    xpTotal: restoredXpTotal,
    coinsTotal: restoredCoinsTotal,
    level: getLevelFromXp(restoredXpTotal),
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

  purgePushDataForTeachers([id]);
  purgeScheduleRequestsForTeachers([id]);

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
  const { name, nickname, leaderboardAlias, coinsGrant } = req.body || {};
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
  const hasNickname = Object.prototype.hasOwnProperty.call(req.body || {}, 'nickname');
  const hasLeaderboardAlias = Object.prototype.hasOwnProperty.call(req.body || {}, 'leaderboardAlias');
  const hasCoinsGrant = Object.prototype.hasOwnProperty.call(req.body || {}, 'coinsGrant');

  if (!hasName && !hasNickname && !hasLeaderboardAlias && !hasCoinsGrant) {
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
    if (studentNickname.length > 60) return res.status(400).json({ error: 'Имя2 слишком длинное' });
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

  let studentCoinsGrant = 0;
  if (hasCoinsGrant) {
    const parsedCoinsGrant = Number(coinsGrant);
    if (!Number.isFinite(parsedCoinsGrant) || parsedCoinsGrant < 0 || !Number.isInteger(parsedCoinsGrant)) {
      return res.status(400).json({ error: 'Количество монет должно быть целым числом не меньше 0.' });
    }
    studentCoinsGrant = parsedCoinsGrant;
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
  if (hasCoinsGrant && studentCoinsGrant > 0) {
    const data = getStudentData(updated.id);
    setStudentData(updated.id, {
      ...data,
      coinsTotal: normalizeCoinsTotal(data?.coinsTotal) + studentCoinsGrant,
    });
  }
  if (hasLeaderboardAlias) {
    const data = getStudentData(updated.id);
    setStudentData(updated.id, { ...data, leaderboardAlias: studentLeaderboardAlias });
  }
  const updatedData = getStudentData(updated.id);
  const storedAlias = normalizeLeaderboardAlias(updatedData?.leaderboardAlias);
  const updatedXpTotal = normalizeXpTotal(updatedData?.xpTotal);
  const updatedCoinsTotal = normalizeCoinsTotal(updatedData?.coinsTotal);
  res.json({
    id: updated.id,
    name: updated.name,
    nickname: updated.nickname || '',
    leaderboardAlias: storedAlias,
    xpTotal: updatedXpTotal,
    coinsTotal: updatedCoinsTotal,
    level: getLevelFromXp(updatedXpTotal),
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
    return res.json(filtered.map((exam) => serializeMockExamEntry(exam, { sanitizeForStudent: true })));
  }
  if (requestedStudentId) {
    const student = ensureStudentAccess(req, res, requestedStudentId);
    if (!student) return;
    const filtered = (Array.isArray(list) ? list : []).filter((exam) => (
      isMockExamVisibleToStudent(exam, student.id)
    ));
    return res.json(filtered.map((exam) => serializeMockExamEntry(exam)));
  }
  res.json((Array.isArray(list) ? list : []).map((exam) => serializeMockExamEntry(exam)));
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
    badges: [],
    access: { all: false, students: [] },
  };
  const list = readMockExamsDb();
  list.unshift(entry);
  writeMockExamsDb(list);
  res.json(serializeMockExamEntry(entry));
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
  res.json(normalizeMockAttemptPayload(exam, stored.answers, stored.updatedAt, stored));
});

app.patch('/api/mock-exams/attempt/timer-rewards', (req, res) => {
  if (!ensureStaffWriteAccess(req, res)) return;
  const { studentId, examId } = req.body || {};
  const requestedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
  const requestedExamId = typeof examId === 'string' ? examId.trim() : '';
  if (!requestedStudentId || !requestedExamId) {
    return res.status(400).json({ error: 'studentId and examId required' });
  }
  const student = ensureStudentAccess(req, res, requestedStudentId);
  if (!student) return;
  const list = readMockExamsDb();
  const exam = (Array.isArray(list) ? list : []).find((item) => item.id === requestedExamId);
  if (!exam) return res.status(404).json({ error: 'Mock exam not found' });
  if (!isMockExamVisibleToStudent(exam, student.id)) {
    return res.status(403).json({ error: 'Mock exam access denied' });
  }
  const data = getStudentData(student.id);
  const attempts = data.mockAttempts && typeof data.mockAttempts === 'object' ? { ...data.mockAttempts } : {};
  const previousAttempt = attempts[requestedExamId] && typeof attempts[requestedExamId] === 'object'
    ? attempts[requestedExamId]
    : null;
  if (!previousAttempt || Object.keys(previousAttempt).length === 0) {
    return res.status(404).json({ error: 'Попытка пробника не найдена' });
  }
  const previousAttemptMode = normalizeMockAttemptMode(previousAttempt?.mode);
  const hasTimerAttemptMarkers = Boolean(
    normalizeMockTimerTimestamp(previousAttempt?.timerStartedAt)
    || normalizeMockTimerTimestamp(previousAttempt?.timerFinishedAt)
    || normalizeMockTimerTimestamp(previousAttempt?.timerExpiresAt)
  );
  const hasDisabledTimerRewards = previousAttempt.timerRewardsDisabled === true;
  if (!hasDisabledTimerRewards && previousAttemptMode !== MOCK_ATTEMPT_MODE_TIMER && !hasTimerAttemptMarkers) {
    return res.status(409).json({ error: 'Награды можно вернуть только для таймерного режима.' });
  }
  if (!hasDisabledTimerRewards) {
    return res.json(normalizeMockAttemptPayload(exam, previousAttempt.answers, previousAttempt.updatedAt, previousAttempt));
  }

  const restoredAt = new Date().toISOString();
  const nextAttempt = {
    ...previousAttempt,
    timerRewardsRestoredAt: restoredAt,
    updatedAt: restoredAt,
  };
  delete nextAttempt.timerRewardsDisabled;
  delete nextAttempt.timerChestAwardedMilestones;
  delete nextAttempt.timerChestAwardedTotal;
  delete nextAttempt.timerChestAwardedAt;
  attempts[requestedExamId] = nextAttempt;
  const updated = setStudentData(student.id, {
    ...data,
    mockAttempts: attempts,
  });
  const stored = updated.mockAttempts?.[requestedExamId] || nextAttempt;
  return res.json(normalizeMockAttemptPayload(exam, stored.answers, stored.updatedAt, stored));
});

app.put('/api/mock-exams/attempt', (req, res) => {
  const {
    studentId,
    examId,
    answers,
    localDay,
    mode,
    startOnly,
    finishTimerExam,
    pauseTimerExam,
    resumeTimerExam,
    restartTimerExam,
  } = req.body || {};
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
  const previousAttempt = attempts[String(examId)] && typeof attempts[String(examId)] === 'object'
    ? attempts[String(examId)]
    : {};
  const previousAttemptNormalized = normalizeMockAttemptPayload(exam, previousAttempt.answers, previousAttempt.updatedAt, previousAttempt);
  const previousAttemptRawSolved = previousAttempt.solved && typeof previousAttempt.solved === 'object' && !Array.isArray(previousAttempt.solved)
    ? previousAttempt.solved
    : null;
  const previousAttemptRawSolvedEver = previousAttempt.solvedEver && typeof previousAttempt.solvedEver === 'object' && !Array.isArray(previousAttempt.solvedEver)
    ? previousAttempt.solvedEver
    : null;
  const previousAttemptWasUnfinishedTimer = (
    normalizeMockAttemptMode(previousAttempt?.mode) === MOCK_ATTEMPT_MODE_TIMER
    && !normalizeMockTimerTimestamp(previousAttempt?.timerFinishedAt)
  );
  const previousSolved = previousAttemptRawSolved
    || (!previousAttemptWasUnfinishedTimer && previousAttemptNormalized.solved && typeof previousAttemptNormalized.solved === 'object'
      ? previousAttemptNormalized.solved
      : {});
  const previousSolvedEver = previousAttemptRawSolvedEver
    || (!previousAttemptWasUnfinishedTimer && previousAttemptNormalized.solvedEver && typeof previousAttemptNormalized.solvedEver === 'object'
      ? previousAttemptNormalized.solvedEver
      : previousSolved);
  const previousAttemptStarted = hasMockAttemptStarted(exam, previousAttemptNormalized.answers);
  const previousTimerStartedAt = normalizeMockTimerTimestamp(previousAttempt?.timerStartedAt);
  const previousTimerExpiresAt = normalizeMockTimerTimestamp(previousAttempt?.timerExpiresAt);
  const previousTimerPausedAt = normalizeMockTimerTimestamp(previousAttempt?.timerPausedAt);
  const previousTimerRemainingMs = Math.max(0, Math.floor(Number(previousAttempt?.timerRemainingMs) || 0));
  const previousTimerFinishedAt = normalizeMockTimerTimestamp(previousAttempt?.timerFinishedAt);
  const previousMode = normalizeMockAttemptMode(previousAttempt?.mode);
  const previousModeLocked = Boolean(previousAttempt?.modeLockedAt || previousAttemptStarted || previousTimerStartedAt);
  const requestedMode = normalizeMockAttemptMode(mode, previousMode);
  const canSwitchClassicAttemptToTimer = (
    previousModeLocked
    && previousMode === MOCK_ATTEMPT_MODE_CLASSIC
    && requestedMode === MOCK_ATTEMPT_MODE_TIMER
    && !previousTimerFinishedAt
  );
  if (previousModeLocked && requestedMode !== previousMode && !canSwitchClassicAttemptToTimer) {
    return res.status(409).json({ error: 'Режим пробника уже выбран для этой попытки.' });
  }
  const attemptMode = canSwitchClassicAttemptToTimer
    ? MOCK_ATTEMPT_MODE_TIMER
    : (previousModeLocked ? previousMode : requestedMode);
  const isTimerFinishRequest = attemptMode === MOCK_ATTEMPT_MODE_TIMER && !startOnly && finishTimerExam === true;
  const isTimerPauseRequest = attemptMode === MOCK_ATTEMPT_MODE_TIMER && !startOnly && pauseTimerExam === true;
  const isTimerResumeRequest = attemptMode === MOCK_ATTEMPT_MODE_TIMER && resumeTimerExam === true;
  if (attemptMode === MOCK_ATTEMPT_MODE_TIMER && !startOnly && !isTimerFinishRequest && !isTimerPauseRequest) {
    return res.status(409).json({ error: 'Ответы в режиме таймера проверяются только после завершения экзамена.' });
  }
  if (attemptMode === MOCK_ATTEMPT_MODE_TIMER && previousTimerFinishedAt && !startOnly) {
    return res.status(409).json({ error: 'Таймерный экзамен уже завершён.' });
  }
  const savedAt = new Date().toISOString();
  const savedAtMs = Date.parse(savedAt);
  const previousTimerExpiresAtMs = Date.parse(previousTimerExpiresAt || '');
  const previousTimerExpired = attemptMode === MOCK_ATTEMPT_MODE_TIMER && (
    (Number.isFinite(previousTimerExpiresAtMs) && previousTimerExpiresAtMs <= savedAtMs)
    || (previousTimerPausedAt && previousTimerRemainingMs <= 0)
  );
  const previousTimerSolvedMap = previousAttempt?.solved && typeof previousAttempt.solved === 'object' && !Array.isArray(previousAttempt.solved)
    ? previousAttempt.solved
    : {};
  const previousTimerHasEvaluatedSolvedResults = Boolean(
    attemptMode === MOCK_ATTEMPT_MODE_TIMER
    && previousTimerStartedAt
    && Object.keys(previousTimerSolvedMap).length > 0
  );
  const requestedTimerRestart = restartTimerExam === true;
  const canRestartTimerAttempt = Boolean(
    requestedTimerRestart
    && startOnly
    && attemptMode === MOCK_ATTEMPT_MODE_TIMER
    && (previousTimerFinishedAt || previousTimerExpired || previousTimerHasEvaluatedSolvedResults)
  );
  if (requestedTimerRestart && !canRestartTimerAttempt) {
    return res.status(409).json({ error: 'Повторный таймер можно запустить только после завершения времени.' });
  }
  const timerRewardsRestoredAt = normalizeMockTimerTimestamp(previousAttempt?.timerRewardsRestoredAt);
  const canRestartWithRestoredTimerRewards = Boolean(canRestartTimerAttempt && timerRewardsRestoredAt);
  const timerRewardsDisabled = (
    Boolean(previousAttempt?.timerRewardsDisabled)
    || canSwitchClassicAttemptToTimer
    || (canRestartTimerAttempt && !canRestartWithRestoredTimerRewards)
  );
  const modeLockedAt = typeof previousAttempt?.modeLockedAt === 'string' && previousAttempt.modeLockedAt.trim()
    ? previousAttempt.modeLockedAt.trim()
    : savedAt;
  const timerStartedAt = attemptMode === MOCK_ATTEMPT_MODE_TIMER
    ? (canRestartTimerAttempt ? savedAt : (previousTimerStartedAt || savedAt))
    : '';
  const timerDurationMs = attemptMode === MOCK_ATTEMPT_MODE_TIMER
    ? Math.max(60 * 1000, Math.floor(Number(previousAttempt?.timerDurationMs) || MOCK_EXAM_TIMER_DURATION_MS))
    : 0;
  const timerExpiresAt = (() => {
    if (attemptMode !== MOCK_ATTEMPT_MODE_TIMER) return '';
    if (canRestartTimerAttempt) return getMockTimerExpiresAt(timerStartedAt, timerDurationMs);
    if (isTimerResumeRequest && previousTimerPausedAt) {
      const remainingMs = previousTimerRemainingMs > 0
        ? previousTimerRemainingMs
        : Math.max(0, Date.parse(previousTimerExpiresAt || '') - savedAtMs);
      return new Date(savedAtMs + remainingMs).toISOString();
    }
    return previousTimerExpiresAt || getMockTimerExpiresAt(timerStartedAt, timerDurationMs);
  })();
  const timerRemainingOnPauseMs = attemptMode === MOCK_ATTEMPT_MODE_TIMER
    ? (
      previousTimerPausedAt && !isTimerResumeRequest
        ? previousTimerRemainingMs
        : Math.max(0, Date.parse(timerExpiresAt || '') - savedAtMs)
    )
    : 0;
  const timerPausedAt = isTimerPauseRequest ? savedAt : '';
  const timerRemainingMs = isTimerPauseRequest ? timerRemainingOnPauseMs : 0;
  if (
    attemptMode === MOCK_ATTEMPT_MODE_TIMER
    && !startOnly
    && !isTimerFinishRequest
    && !isTimerPauseRequest
    && timerExpiresAt
    && Date.now() > Date.parse(timerExpiresAt)
  ) {
    return res.status(409).json({ error: 'Время таймерного режима истекло.' });
  }
  const previousAwardedMilestones = getPreviouslyAwardedMockCoinMilestones(previousAttempt);
  const shouldResetTimerChestMilestones = Boolean(
    normalizeMockTimerTimestamp(previousAttempt?.timerRewardsRestoredAt)
    && previousAttempt?.timerRewardsDisabled !== true
  );
  const previousTimerChestMilestones = shouldResetTimerChestMilestones
    ? []
    : getPreviouslyAwardedMockTimerChestMilestones(previousAttempt);
  const serverDayKey = savedAt.slice(0, 10);
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
  const rawAnswersForSave = startOnly
    ? (canRestartTimerAttempt ? {} : previousAttemptNormalized.answers)
    : answers;
  const normalizedAttemptBase = normalizeMockAttemptPayload(exam, rawAnswersForSave, savedAt, {
    ...previousAttempt,
    mode: attemptMode,
    modeLockedAt,
    ...(canRestartTimerAttempt ? { timerFinishedAt: '' } : {}),
    timerPausedAt,
    timerRemainingMs,
    timerRewardsDisabled,
    ...(timerStartedAt ? { timerStartedAt, timerDurationMs, timerExpiresAt } : {}),
  });
  const shouldEvaluateMockAttempt = attemptMode === MOCK_ATTEMPT_MODE_CLASSIC || isTimerFinishRequest;
  if (!shouldEvaluateMockAttempt) {
    const normalizedAttempt = {
      ...normalizedAttemptBase,
      solved: canRestartTimerAttempt ? normalizedAttemptBase.solved : previousSolved,
      solvedEver: canRestartTimerAttempt ? normalizedAttemptBase.solvedEver : previousSolvedEver,
      mode: attemptMode,
      modeLockedAt,
      coinsAwardedMilestones: previousAwardedMilestones,
      coinsAwardedTotal: getMockCoinsForMilestones(previousAwardedMilestones),
      ...(previousAttempt?.coinsAwardedAt ? { coinsAwardedAt: previousAttempt.coinsAwardedAt } : {}),
      timerChestAwardedMilestones: previousTimerChestMilestones,
      timerChestAwardedTotal: getMockChestsForMilestones(previousTimerChestMilestones),
      ...(previousAttempt?.timerChestAwardedAt ? { timerChestAwardedAt: previousAttempt.timerChestAwardedAt } : {}),
      ...(timerRewardsDisabled ? { timerRewardsDisabled: true } : {}),
      ...(timerPausedAt ? { timerPausedAt, timerRemainingMs } : {}),
    };
    attempts[String(examId)] = normalizedAttempt;
    const updated = setStudentData(student.id, {
      ...data,
      mockAttempts: attempts,
    });
    return res.json(updated.mockAttempts?.[String(examId)] || normalizedAttempt);
  }
  const secondaryScore = getMockSecondaryScoreFromSolved(normalizedAttemptBase.solved);
  const reachedMilestones = getMockCoinMilestoneScoresForScore(secondaryScore);
  const previousMilestoneSet = new Set(previousAwardedMilestones);
  const newlyReachedMilestones = reachedMilestones.filter((score) => !previousMilestoneSet.has(score));
  const coinsAwardedMilestones = normalizeMockCoinMilestones([
    ...previousAwardedMilestones,
    ...(attemptMode === MOCK_ATTEMPT_MODE_CLASSIC ? reachedMilestones : []),
  ]);
  const previousTimerChestMilestoneSet = new Set(previousTimerChestMilestones);
  const newlyReachedTimerChestMilestones = attemptMode === MOCK_ATTEMPT_MODE_TIMER && !timerRewardsDisabled
    ? reachedMilestones.filter((score) => !previousTimerChestMilestoneSet.has(score))
    : [];
  const timerChestAwardedMilestones = normalizeMockCoinMilestones([
    ...previousTimerChestMilestones,
    ...newlyReachedTimerChestMilestones,
  ]);
  const coinsGained = attemptMode === MOCK_ATTEMPT_MODE_CLASSIC
    ? getMockCoinsForMilestones(newlyReachedMilestones)
    : 0;
  const timerChestsGained = attemptMode === MOCK_ATTEMPT_MODE_TIMER
    ? getMockChestsForMilestones(newlyReachedTimerChestMilestones)
    : 0;
  const normalizedAttempt = {
    ...normalizedAttemptBase,
    mode: attemptMode,
    modeLockedAt,
    ...(isTimerFinishRequest
      ? { timerFinishedAt: savedAt }
      : (normalizedAttemptBase.timerFinishedAt ? { timerFinishedAt: normalizedAttemptBase.timerFinishedAt } : {})),
    coinsAwardedMilestones,
    coinsAwardedTotal: getMockCoinsForMilestones(coinsAwardedMilestones),
    ...(coinsGained > 0
      ? { coinsAwardedAt: savedAt }
      : (normalizedAttemptBase.coinsAwardedAt ? { coinsAwardedAt: normalizedAttemptBase.coinsAwardedAt } : {})),
    timerChestAwardedMilestones,
    timerChestAwardedTotal: getMockChestsForMilestones(timerChestAwardedMilestones),
    ...(timerChestsGained > 0
      ? { timerChestAwardedAt: savedAt }
      : (normalizedAttemptBase.timerChestAwardedAt ? { timerChestAwardedAt: normalizedAttemptBase.timerChestAwardedAt } : {})),
    ...(timerRewardsDisabled ? { timerRewardsDisabled: true } : {}),
  };
  attempts[String(examId)] = normalizedAttempt;
  const newlySolvedTaskKeys = Object.entries(normalizedAttempt.solved || {})
    .filter(([, solvedNow]) => Boolean(solvedNow))
    .map(([entryTaskKey]) => entryTaskKey)
    .filter((entryTaskKey) => !previousSolvedEver?.[entryTaskKey]);
  const rewardableSolvedTaskKeys = attemptMode === MOCK_ATTEMPT_MODE_TIMER && timerRewardsDisabled
    ? []
    : newlySolvedTaskKeys;
  let coinsTotal = normalizeCoinsTotal(data.coinsTotal) + coinsGained;
  const artifactInventory = normalizeArtifactInventory(data?.artifactInventory);
  const artifactLevels = normalizeArtifactLevels(data?.artifactLevels, artifactInventory);
  const artifactCards = normalizeArtifactCards(data?.artifactCards, artifactInventory);
  const mockSolveXpByTaskKey = new Map();
  let mockSolveXpGained = 0;
  rewardableSolvedTaskKeys.forEach((solvedTaskKey) => {
    const solveXpGained = applyArtifactXpBonus(
      getTaskLevelXpReward(solvedTaskKey, MOCK_EXAM_SOLVE_XP_LEVEL_ID),
      artifactLevels,
      solvedTaskKey
    );
    if (solveXpGained <= 0) return;
    mockSolveXpByTaskKey.set(String(solvedTaskKey), solveXpGained);
    mockSolveXpGained += solveXpGained;
  });
  let xpTotal = normalizeXpTotal(data.xpTotal) + mockSolveXpGained;
  let artifactTotalPulls = normalizeArtifactTotalPulls(data?.artifactTotalPulls);
  const artifactDropRecords = [];
  const timerChestRewardRecords = [];
  const nextMockTimerChests = normalizeMockTimerChestQueue(data?.mockTimerChests);
  let artifactXpGained = 0;
  let artifactCoinsGained = 0;
  const examTitle = typeof exam?.title === 'string' && exam.title.trim()
    ? exam.title.trim()
    : 'Пробник';
  const grantMockArtifactReward = (artifact, meta = {}) => {
    if (!artifact) return;
    const artifactLevelBeforePull = getArtifactLevel(artifactLevels, artifact.id);
    const maxLevelDuplicateCoins = artifactLevelBeforePull >= ARTIFACT_MAX_LEVEL
      ? getArtifactMaxLevelDuplicateCoinReward(artifact)
      : 0;
    artifactInventory[artifact.id] = getArtifactInventoryCount(artifactInventory, artifact.id) + 1;
    artifactCards[artifact.id] = getArtifactInventoryCount(artifactCards, artifact.id) + 1;
    if (!artifactLevels[artifact.id]) artifactLevels[artifact.id] = 1;
    artifactTotalPulls += 1;
    const instantReward = getArtifactInstantRewardForPull(artifact.id);
    const dropXpGained = normalizeXpTotal(instantReward.xp);
    const dropCoinsGained = normalizeCoinsTotal(instantReward.coins + maxLevelDuplicateCoins);
    artifactXpGained += dropXpGained;
    artifactCoinsGained += dropCoinsGained;
    xpTotal += dropXpGained;
    coinsTotal += dropCoinsGained;
    const record = {
      artifactId: artifact.id,
      pulledAt: savedAt,
      maxLevelDuplicateCoins,
      ...meta,
    };
    artifactDropRecords.push(record);
    return record;
  };
  newlyReachedTimerChestMilestones.forEach((score, milestoneIndex) => {
    const milestone = MOCK_TIMER_CHEST_MILESTONES.find((entry) => entry.score === score);
    const chestCount = Math.max(1, Math.floor(Number(milestone?.chests) || 1));
    const milestoneCoins = getMockCoinsForMilestones([score]);
    const baseCoins = Math.floor(milestoneCoins / chestCount);
    const extraCoins = milestoneCoins % chestCount;
    for (let chestOffset = 0; chestOffset < chestCount; chestOffset += 1) {
      const chestRecord = {
        id: crypto.randomUUID(),
        source: 'mock-timer-chest',
        mockExamId: String(examId),
        mockExamTitle: examTitle,
        milestoneScore: score,
        chestIndex: timerChestRewardRecords.length + 1,
        milestoneIndex: milestoneIndex + 1,
        createdAt: savedAt,
        coinsGained: normalizeCoinsTotal(baseCoins + (chestOffset < extraCoins ? 1 : 0)),
      };
      timerChestRewardRecords.push(chestRecord);
      nextMockTimerChests.push(chestRecord);
    }
  });
  const solvedEvents = Array.isArray(data.solvedEvents) ? [...data.solvedEvents] : [];
  rewardableSolvedTaskKeys.forEach((taskKey) => {
    const taskNum = Number(taskKey);
    const solveXpGained = normalizeXpTotal(mockSolveXpByTaskKey.get(String(taskKey)));
    solvedEvents.push({
      id: crypto.randomUUID(),
      source: 'mock-exam',
      studentId: student.id,
      mockExamId: String(examId),
      mockExamTitle: examTitle,
      mockTaskNumber: Number.isFinite(taskNum) ? taskNum : taskKey,
      taskNumber: Number.isFinite(taskNum) ? taskNum : taskKey,
      levelId: 'mock-exam',
      questionId: taskKey,
      questionNumber: null,
      solvedAt: savedAt,
      localDay: resolvedDayKey,
      xpGained: solveXpGained,
      coinsGained: 0,
    });
  });
  if (solvedEvents.length > STUDENT_SOLVED_EVENTS_LIMIT) {
    solvedEvents.splice(0, solvedEvents.length - STUDENT_SOLVED_EVENTS_LIMIT);
  }
  const lastArtifactDropRecord = artifactDropRecords[artifactDropRecords.length - 1] || null;
  const updated = setStudentData(student.id, {
    ...data,
    mockAttempts: attempts,
    xpTotal,
    coinsTotal,
    mockTimerChestsTotal: normalizeCoinsTotal(data?.mockTimerChestsTotal) + timerChestsGained,
    mockTimerChests: nextMockTimerChests,
    solvedEvents,
    artifactInventory,
    artifactLevels,
    artifactCards,
    artifactTotalPulls,
    ...(lastArtifactDropRecord
      ? {
        artifactLastPull: {
          id: lastArtifactDropRecord.artifactId,
          pulledAt: lastArtifactDropRecord.pulledAt,
          ...(lastArtifactDropRecord.maxLevelDuplicateCoins > 0
            ? { maxLevelDuplicateCoins: lastArtifactDropRecord.maxLevelDuplicateCoins }
            : {}),
        },
      }
      : {}),
  });
  const dropPayloadByRecord = new Map();
  const mockArtifactDrops = artifactDropRecords
    .map((record) => {
      const drop = buildArtifactRewardPayload(
        record.artifactId,
        updated.artifactInventory,
        record.pulledAt,
        updated.artifactLevels,
        updated.artifactCards,
        updated.coinsTotal,
        { maxLevelDuplicateCoins: record.maxLevelDuplicateCoins }
      );
      if (!drop) return null;
      const taskNum = Number(record.taskKey);
      const payload = {
        ...drop,
        source: record.source || 'mock-exam',
        mockExamId: String(examId),
        mockExamTitle: examTitle,
        ...(record.taskKey !== undefined
          ? { mockTaskNumber: Number.isFinite(taskNum) ? taskNum : record.taskKey }
          : {}),
        ...(record.milestoneScore !== undefined
          ? { milestoneScore: record.milestoneScore }
          : {}),
        ...(record.chestIndex !== undefined
          ? { chestIndex: record.chestIndex }
          : {}),
        ...(record.chestItemIndex !== undefined
          ? { chestItemIndex: record.chestItemIndex }
          : {}),
      };
      dropPayloadByRecord.set(record, payload);
      return payload;
    })
    .filter(Boolean);
  const mockChestRewards = [];
  const xpGained = normalizeXpTotal(mockSolveXpGained + artifactXpGained);
  const timerChestCoinsGained = 0;
  res.json({
    ...(updated.mockAttempts?.[String(examId)] || normalizedAttempt),
    xpGained,
    mockSolveXpGained,
    xpTotal: updated.xpTotal,
    coinsGained,
    coinsTotal: updated.coinsTotal,
    timerChestsGained,
    timerChestsAdded: timerChestsGained,
    timerChestCoinsGained,
    timerChestsTotal: normalizeCoinsTotal(updated.mockTimerChestsTotal),
    mockTimerChests: buildMockTimerChestPanelState(updated),
    ...(mockChestRewards.length > 0 ? { mockChestRewards } : {}),
    ...(mockArtifactDrops.length > 0
      ? {
        artifactXpGained,
        artifactCoinsGained,
        altar: buildStudentArtifactState(updated),
        mockArtifactDrop: mockArtifactDrops[0],
        mockArtifactDrops,
      }
      : {}),
  });
});

app.patch('/api/mock-exams/:id', (req, res) => {
  if (isStudentRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const { title, tasks, access, badges } = req.body || {};
  const list = readMockExamsDb();
  const idx = list.findIndex((exam) => exam.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Пробник не найден' });
  const current = list[idx];
  const trimmed = typeof title === 'string' ? title.trim() : '';
  const next = {
    ...current,
    title: trimmed || current.title,
    tasks: tasks && typeof tasks === 'object' ? tasks : current.tasks || {},
    badges: badges !== undefined ? normalizeMockExamBadges(badges) : normalizeMockExamBadges(current.badges),
    access: access && typeof access === 'object' ? normalizeMockExamAccessForSave(access) : current.access,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = next;
  writeMockExamsDb(list);
  res.json(serializeMockExamEntry(next));
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
  const artifactInventory = normalizeArtifactInventory(data?.artifactInventory);
  const artifactLevels = normalizeArtifactLevels(data?.artifactLevels, artifactInventory);
  let xpTotal = normalizeXpTotal(data.xpTotal);
  let coinsTotal = normalizeCoinsTotal(data.coinsTotal);
  const taskEntry = { ...(solvedByTask[taskKey] || {}) };
  const levelEntry = { ...(taskEntry[levelKey] || {}) };

  const solvedList = Array.isArray(levelEntry.solved) ? [...levelEntry.solved] : [];
  const solvedCode = levelEntry.solvedCode && typeof levelEntry.solvedCode === 'object'
    ? { ...levelEntry.solvedCode }
    : {};
  let solvedAdded = false;
  let xpGained = 0;
  let coinsGained = 0;
  if (!solvedList.includes(qKey)) {
    solvedList.push(qKey);
    solvedAdded = true;
    const questionNumber = getQuestionNumberById(testsDb, taskNum, levelKey, qKey);
    xpGained = applyArtifactXpBonus(getTaskLevelXpReward(taskNum, levelKey), artifactLevels, taskNum);
    coinsGained = applyArtifactCoinBonus(getSolveCoinReward(taskNum, levelKey), artifactLevels);
    solvedEvents.push({
      id: crypto.randomUUID(),
      studentId: student.id,
      taskNumber: taskNum,
      levelId: levelKey,
      questionId: qKey,
      questionNumber,
      solvedAt: new Date().toISOString(),
      localDay: resolvedDayKey,
      xpGained,
      coinsGained,
    });
  }
  if (solvedAdded) {
    if (xpGained > 0) {
      xpTotal += xpGained;
    }
    if (coinsGained > 0) {
      coinsTotal += coinsGained;
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

  if (solvedEvents.length > STUDENT_SOLVED_EVENTS_LIMIT) {
    solvedEvents.splice(0, solvedEvents.length - STUDENT_SOLVED_EVENTS_LIMIT);
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

  const updated = setStudentData(student.id, { ...data, solvedByTask, solvedEvents, progress, streak, xpTotal, coinsTotal });
  res.json({
    taskProgress,
    progress: updated.progress,
    streak: updated.streak,
    xpTotal: updated.xpTotal,
    xpGained,
    coinsTotal: updated.coinsTotal,
    coinsGained,
  });
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
  const students = readStudentsDb().filter((s) => s.teacherId === teacher.id && !s.deletedAt);
  const readIds = getTeacherSolvedEventReadIdSet(teacher, students.length);
  const readBeforeMs = getTeacherSolvedEventsReadBeforeMs(teacher);
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
      if (readBeforeMs > 0 && ts <= readBeforeMs) return;
      const sourceRaw = String(ev?.source || ev?.eventKind || '').trim().toLowerCase();
      const isMockExamEvent = sourceRaw === 'mock-exam' || sourceRaw === 'mock-exam-task';
      const questionNumber = !isMockExamEvent && Number.isFinite(ev?.questionNumber)
        ? ev.questionNumber
        : (isMockExamEvent ? null : getQuestionNumberById(testsDb, ev?.taskNumber, ev?.levelId, ev?.questionId));
      events.push({
        id: eventId,
        studentId: student.id,
        studentName: student.name,
        studentNickname: normalizeStudentNickname(student.nickname),
        source: isMockExamEvent ? 'mock-exam' : 'testing',
        mockExamId: isMockExamEvent ? String(ev?.mockExamId || '').trim() : '',
        mockExamTitle: isMockExamEvent ? String(ev?.mockExamTitle || '').trim() : '',
        mockTaskNumber: isMockExamEvent ? (ev?.mockTaskNumber ?? ev?.taskNumber) : null,
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
  const { teacherId, eventIds, eventId, markAll, before } = req.body || {};
  if (isStudentRole(req.auth)) return forbid(res);
  const teacher = ensureTeacherAccess(req, res, teacherId);
  if (!teacher) return;

  const markAllRequested = (
    markAll === true
    || markAll === 1
    || String(markAll || '').trim().toLowerCase() === 'true'
  );

  if (markAllRequested) {
    const numericBefore = Number(before);
    let beforeMs = Number.isFinite(numericBefore) && numericBefore > 0 ? Math.floor(numericBefore) : NaN;
    if (!Number.isFinite(beforeMs) && typeof before === 'string') {
      const parsedBefore = Date.parse(before);
      if (Number.isFinite(parsedBefore) && parsedBefore > 0) {
        beforeMs = parsedBefore;
      }
    }
    if (!Number.isFinite(beforeMs) || beforeMs <= 0) {
      beforeMs = Date.now();
    }

    const updated = markTeacherSolvedEventsReadAll(teacher.id, beforeMs);
    if (!updated) {
      return res.status(404).json({ error: 'Учитель не найден' });
    }
    return res.json({
      ok: true,
      markAll: true,
      readBefore: normalizeTeacherSolvedEventsReadBefore(updated.solvedEventsReadBefore),
      readCount: Array.isArray(updated.readSolvedEventIds) ? updated.readSolvedEventIds.length : 0,
    });
  }

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

app.get('/api/broadcast-notifications', (req, res) => {
  const list = readBroadcastNotificationsDb();
  if (isStudentRole(req.auth)) {
    const visible = list
      .filter((entry) => canStudentViewBroadcastNotification(req.auth, entry))
      .map((entry) => serializeBroadcastNotificationForStudent(entry, req.auth.id));
    return res.json(visible);
  }
  if (isTeacherRole(req.auth)) {
    const visible = list
      .filter((entry) => canManageBroadcastNotification(req.auth, entry))
      .map((entry) => serializeBroadcastNotificationForStaff(entry, req.auth));
    return res.json(visible);
  }
  if (isAdminRole(req.auth)) {
    return res.json(list.map((entry) => serializeBroadcastNotificationForStaff(entry, req.auth)));
  }
  return forbid(res);
});

app.post('/api/broadcast-notifications', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);

  const text = normalizeBroadcastNotificationText(req.body?.text);
  const image = normalizeBroadcastNotificationAttachment(req.body?.image, { fallbackName: 'Изображение' });
  const file = normalizeBroadcastNotificationAttachment(req.body?.file, { fallbackName: 'Файл' });
  const giftCoins = Math.min(
    BROADCAST_NOTIFICATION_GIFT_MAX_COINS,
    normalizeCoinsTotal(req.body?.giftCoins ?? req.body?.gift?.coins)
  );
  const mockExamId = String(req.body?.mockExamId || req.body?.mockExam?.id || '').trim();
  const selectedMockExam = mockExamId ? findMockExamById(mockExamId) : null;
  if (mockExamId && !selectedMockExam) {
    return res.status(400).json({ error: 'Прикреплённый пробник не найден.' });
  }
  const mockExam = selectedMockExam
    ? normalizeBroadcastNotificationMockExam(selectedMockExam, { mockExam: selectedMockExam })
    : null;
  const gift = giftCoins > 0 ? normalizeBroadcastNotificationGift({ coins: giftCoins, claimedByStudentIds: [] }) : null;
  if (!text && !image && !file && !mockExam && !gift) {
    return res.status(400).json({ error: 'Добавьте текст, картинку, файл, пробник или подарок.' });
  }

  const now = new Date().toISOString();
  const entry = normalizeBroadcastNotificationEntry({
    id: crypto.randomUUID(),
    text,
    image,
    file,
    mockExam,
    gift,
    createdAt: now,
    updatedAt: now,
    createdById: String(req.auth?.id || '').trim(),
    createdByName: typeof req.auth?.name === 'string' && req.auth.name.trim()
      ? req.auth.name.trim()
      : (isAdminRole(req.auth) ? 'Администратор' : 'Преподаватель'),
    createdByRole: String(req.auth?.role || '').trim(),
    audienceKind: isAdminRole(req.auth) ? 'all-students' : 'teacher-students',
    audienceTeacherId: isTeacherRole(req.auth) ? String(req.auth.id || '').trim() : '',
    seenByStudentIds: [],
  });

  if (!entry) {
    return res.status(400).json({ error: 'Не удалось подготовить уведомление.' });
  }

  const nextList = normalizeBroadcastNotificationList([entry, ...readBroadcastNotificationsDb()]);
  writeBroadcastNotificationsDb(nextList);
  broadcastNotificationCreated(entry);
  return res.status(201).json(serializeBroadcastNotificationForStaff(entry, req.auth));
});

app.patch('/api/broadcast-notifications/:id/seen', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const notificationId = String(req.params?.id || '').trim();
  if (!notificationId) {
    return res.status(400).json({ error: 'id required' });
  }

  const list = readBroadcastNotificationsDb();
  const index = list.findIndex((entry) => entry.id === notificationId);
  if (index === -1) {
    return res.status(404).json({ error: 'Уведомление не найдено' });
  }

  const current = list[index];
  if (!canStudentViewBroadcastNotification(req.auth, current)) return forbid(res);

  const seenIds = new Set(normalizeBroadcastNotificationSeenIds(current?.seenByStudentIds));
  if (!seenIds.has(req.auth.id)) {
    seenIds.add(req.auth.id);
    list[index] = {
      ...current,
      updatedAt: new Date().toISOString(),
      seenByStudentIds: Array.from(seenIds),
    };
    writeBroadcastNotificationsDb(normalizeBroadcastNotificationList(list));
  }

  return res.json(serializeBroadcastNotificationForStudent(list[index], req.auth.id));
});

app.post('/api/broadcast-notifications/:id/claim-gift', (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const notificationId = String(req.params?.id || '').trim();
  if (!notificationId) {
    return res.status(400).json({ error: 'id required' });
  }

  const list = readBroadcastNotificationsDb();
  const index = list.findIndex((entry) => entry.id === notificationId);
  if (index === -1) {
    return res.status(404).json({ error: 'Уведомление не найдено' });
  }

  const current = list[index];
  if (!canStudentViewBroadcastNotification(req.auth, current)) return forbid(res);

  const gift = normalizeBroadcastNotificationGift(current?.gift);
  if (!gift) {
    return res.status(400).json({ error: 'В этом уведомлении нет подарка.' });
  }

  const student = readStudentsDb().find((entry) => String(entry?.id || '').trim() === String(req.auth?.id || '').trim() && isActiveStudent(entry));
  if (!student) {
    return res.status(404).json({ error: 'Ученик не найден.' });
  }

  const studentId = String(req.auth.id || '').trim();
  const claimedIds = new Set(normalizeBroadcastNotificationSeenIds(gift.claimedByStudentIds));
  const seenIds = new Set(normalizeBroadcastNotificationSeenIds(current?.seenByStudentIds));
  const alreadyClaimed = claimedIds.has(studentId);
  if (!seenIds.has(studentId)) {
    seenIds.add(studentId);
  }

  let updatedEntry = {
    ...current,
    updatedAt: new Date().toISOString(),
    seenByStudentIds: Array.from(seenIds),
    gift: {
      ...gift,
      claimedByStudentIds: Array.from(claimedIds),
    },
  };

  let updatedStudentData = getStudentData(studentId);
  if (!alreadyClaimed) {
    claimedIds.add(studentId);
    updatedEntry = {
      ...updatedEntry,
      gift: {
        ...gift,
        claimedByStudentIds: Array.from(claimedIds),
      },
    };
    list[index] = updatedEntry;
    writeBroadcastNotificationsDb(normalizeBroadcastNotificationList(list));
    updatedStudentData = setStudentData(studentId, {
      ...updatedStudentData,
      coinsTotal: normalizeCoinsTotal(updatedStudentData.coinsTotal) + gift.coins,
    });
  } else if (!normalizeBroadcastNotificationSeenIds(current?.seenByStudentIds).includes(studentId)) {
    list[index] = updatedEntry;
    writeBroadcastNotificationsDb(normalizeBroadcastNotificationList(list));
  }

  return res.json({
    notification: serializeBroadcastNotificationForStudent(updatedEntry, studentId),
    coinsTotal: normalizeCoinsTotal(updatedStudentData?.coinsTotal),
    claimedNow: !alreadyClaimed,
    giftCoins: gift.coins,
  });
});

app.delete('/api/broadcast-notifications/:id', (req, res) => {
  if (!isStaffRole(req.auth)) return forbid(res);
  const notificationId = String(req.params?.id || '').trim();
  if (!notificationId) {
    return res.status(400).json({ error: 'id required' });
  }

  const list = readBroadcastNotificationsDb();
  const index = list.findIndex((entry) => entry.id === notificationId);
  if (index === -1) {
    return res.status(404).json({ error: 'Уведомление не найдено' });
  }

  const target = list[index];
  if (!canManageBroadcastNotification(req.auth, target)) return forbid(res);

  list.splice(index, 1);
  writeBroadcastNotificationsDb(normalizeBroadcastNotificationList(list));
  broadcastNotificationDeleted(target);
  deleteBroadcastNotificationAttachmentFiles(target);
  return res.json({ ok: true });
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
    code: normalizeCodeText(typeof stored.code === 'string' ? stored.code : ''),
    input: typeof stored.input === 'string' ? stored.input : '',
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
    starterCode: normalizeCodeText(typeof question?.starterCode === 'string' ? question.starterCode : ''),
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
  const safeCode = normalizeCodeText(code).slice(0, 20000);
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
    code: normalizeCodeText(typeof stored.code === 'string' ? stored.code : ''),
    input: typeof stored.input === 'string' ? stored.input : '',
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
    starterCode: normalizeCodeText(typeof question?.starterCode === 'string' ? question.starterCode : ''),
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

app.get('/api/teacher-schedule', async (req, res) => {
  const { teacherId } = req.query || {};
  if (isStudentRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const localEntries = getTeacherScheduleEntries(teacher.id);
  const googleEntries = await fetchTeacherGoogleCalendarEntries(teacher.id);
  return res.json([...localEntries, ...googleEntries]);
});

app.get('/api/teacher-calendar-marks', (req, res) => {
  const { teacherId } = req.query || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const db = readTeacherCalendarMarksDb();
  return res.json({ marks: normalizeTeacherCalendarMarks(db[teacher.id]) });
});

app.patch('/api/teacher-calendar-marks', (req, res) => {
  const { teacherId, marks, set, unset } = req.body || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;

  const db = readTeacherCalendarMarksDb();
  const currentMarks = normalizeTeacherCalendarMarks(db[teacher.id]);
  let nextMarks = currentMarks;

  if (marks && typeof marks === 'object' && !Array.isArray(marks)) {
    nextMarks = normalizeTeacherCalendarMarks(marks);
  } else {
    nextMarks = { ...currentMarks };
    const setEntries = set && typeof set === 'object' && !Array.isArray(set) ? set : {};
    Object.entries(setEntries).forEach(([key, value]) => {
      const normalizedKey = normalizeTeacherCalendarMarkKey(key);
      if (!normalizedKey) return;
      nextMarks[normalizedKey] = normalizeTeacherCalendarMarkValue(value);
    });

    const unsetList = Array.isArray(unset) ? unset : [];
    unsetList.forEach((key) => {
      const normalizedKey = normalizeTeacherCalendarMarkKey(key);
      if (!normalizedKey) return;
      delete nextMarks[normalizedKey];
    });
  }

  db[teacher.id] = normalizeTeacherCalendarMarks(nextMarks);
  writeTeacherCalendarMarksDb(db);
  notifyScheduleSyncUpdate({
    scope: 'teacher-calendar-marks',
    action: 'calendar-marks-updated',
    teacherId: teacher.id,
  });
  return res.json({ marks: db[teacher.id] });
});

app.get('/api/teacher-calendar-sync', (req, res) => {
  const { teacherId } = req.query || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const settings = getTeacherCalendarSyncSettings(teacher.id);
  return res.json(buildTeacherCalendarSyncSettingsResponse(settings));
});

app.patch('/api/teacher-calendar-sync', (req, res) => {
  const { teacherId, icalUrl, enabled } = req.body || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const rawUrl = String(icalUrl || '').trim();
  if (rawUrl && !normalizeTeacherCalendarSyncUrl(rawUrl)) {
    return res.status(400).json({ error: 'Укажите корректную iCal-ссылку Google Calendar.' });
  }
  const settings = setTeacherCalendarSyncSettings(teacher.id, {
    icalUrl: rawUrl,
    enabled: rawUrl ? enabled !== false : false,
    lastError: '',
  });
  notifyScheduleSyncUpdate({
    scope: 'teacher-schedule',
    action: 'calendar-sync-updated',
    teacherId: teacher.id,
  });
  return res.json(buildTeacherCalendarSyncSettingsResponse(settings));
});

app.post('/api/teacher-calendar-sync/refresh', async (req, res) => {
  const { teacherId } = req.body || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  try {
    const events = await fetchTeacherGoogleCalendarEntries(teacher.id, { force: true, throwOnError: true });
    notifyScheduleSyncUpdate({
      scope: 'teacher-schedule',
      action: 'calendar-sync-refreshed',
      teacherId: teacher.id,
    });
    return res.json({
      ok: true,
      importedCount: events.length,
      settings: buildTeacherCalendarSyncSettingsResponse(getTeacherCalendarSyncSettings(teacher.id)),
    });
  } catch (error) {
    return res.status(502).json({
      error: error?.message || 'Не удалось загрузить Google Calendar.',
      settings: buildTeacherCalendarSyncSettingsResponse(getTeacherCalendarSyncSettings(teacher.id)),
    });
  }
});

app.post('/api/teacher-schedule', (req, res) => {
  const { teacherId } = req.body || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const { entry, error } = buildTeacherScheduleEntry(req.body || {}, { auth: req.auth });
  if (!entry) {
    return res.status(400).json({ error: error || 'Не удалось сохранить занятие' });
  }
  const teachers = readTeachersDb();
  const index = teachers.findIndex((item) => String(item?.id || '').trim() === teacher.id);
  if (index < 0) {
    return res.status(404).json({ error: 'Учитель не найден' });
  }
  const currentTeacher = teachers[index];
  const currentSchedule = Array.isArray(currentTeacher?.calendarSchedule) ? currentTeacher.calendarSchedule : [];
  teachers[index] = {
    ...currentTeacher,
    calendarSchedule: [entry, ...currentSchedule],
  };
  writeTeachersDb(teachers);
  notifyScheduleSyncUpdate({
    scope: 'teacher-schedule',
    action: 'created',
    teacherId: teacher.id,
    entryId: entry.id,
  });
  return res.json(entry);
});

app.put('/api/teacher-schedule/:id', (req, res) => {
  const { id } = req.params || {};
  const { teacherId } = req.body || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const entryId = String(id || '').trim();
  if (!entryId) {
    return res.status(400).json({ error: 'id required' });
  }
  const teachers = readTeachersDb();
  const index = teachers.findIndex((item) => String(item?.id || '').trim() === teacher.id);
  if (index < 0) {
    return res.status(404).json({ error: 'Учитель не найден' });
  }
  const currentTeacher = teachers[index];
  const currentSchedule = Array.isArray(currentTeacher?.calendarSchedule) ? [...currentTeacher.calendarSchedule] : [];
  const entryIndex = currentSchedule.findIndex((entry) => String(entry?.id || '').trim() === entryId);
  if (entryIndex < 0) {
    return res.status(404).json({ error: 'Занятие не найдено' });
  }
  const { entry, error } = buildTeacherScheduleEntry(req.body || {}, {
    existing: currentSchedule[entryIndex],
    auth: req.auth,
  });
  if (!entry) {
    return res.status(400).json({ error: error || 'Не удалось обновить занятие' });
  }
  currentSchedule[entryIndex] = entry;
  teachers[index] = {
    ...currentTeacher,
    calendarSchedule: currentSchedule,
  };
  writeTeachersDb(teachers);
  notifyScheduleSyncUpdate({
    scope: 'teacher-schedule',
    action: 'updated',
    teacherId: teacher.id,
    entryId: entry.id,
  });
  return res.json(entry);
});

app.delete('/api/teacher-schedule/:id', (req, res) => {
  const { id } = req.params || {};
  const { teacherId } = req.query || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const entryId = String(id || '').trim();
  if (!entryId) {
    return res.status(400).json({ error: 'id required' });
  }
  const teachers = readTeachersDb();
  const index = teachers.findIndex((item) => String(item?.id || '').trim() === teacher.id);
  if (index < 0) {
    return res.status(404).json({ error: 'Учитель не найден' });
  }
  const currentTeacher = teachers[index];
  const currentSchedule = Array.isArray(currentTeacher?.calendarSchedule) ? currentTeacher.calendarSchedule : [];
  const nextSchedule = currentSchedule.filter((entry) => String(entry?.id || '').trim() !== entryId);
  if (nextSchedule.length === currentSchedule.length) {
    return res.status(404).json({ error: 'Занятие не найдено' });
  }
  teachers[index] = {
    ...currentTeacher,
    calendarSchedule: nextSchedule,
  };
  writeTeachersDb(teachers);
  notifyScheduleSyncUpdate({
    scope: 'teacher-schedule',
    action: 'deleted',
    teacherId: teacher.id,
    entryId,
  });
  return res.json({ ok: true });
});

app.get('/api/teacher-finance', (req, res) => {
  const { teacherId, month } = req.query || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const resolvedMonth = normalizeTeacherFinanceMonthKey(month) || getCurrentTeacherFinanceMonthKey();
  return res.json(buildTeacherFinanceResponse(teacher.id, resolvedMonth));
});

app.patch('/api/teacher-finance/month', (req, res) => {
  const { teacherId, month, otherIncome, otherExpenses, incomeGoal, note } = req.body || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const resolvedMonth = normalizeTeacherFinanceMonthKey(month);
  if (!resolvedMonth) {
    return res.status(400).json({ error: 'Некорректный месяц' });
  }
  const nowIso = new Date().toISOString();
  const financeDb = readTeacherFinanceDb();
  const teacherEntry = getTeacherFinanceTeacherEntry(financeDb, teacher.id);
  const currentMonth = teacherEntry.months[resolvedMonth] || {
    settings: getDefaultTeacherFinanceMonthSettings(),
    students: {},
  };
  teacherEntry.months[resolvedMonth] = {
    settings: {
      ...normalizeTeacherFinanceMonthSettings({
        otherIncome,
        otherExpenses,
        incomeGoal,
        note,
      }),
      updatedAt: nowIso,
    },
    students: currentMonth.students || {},
  };
  financeDb[teacher.id] = teacherEntry;
  writeTeacherFinanceDb(financeDb);
  return res.json(buildTeacherFinanceResponse(teacher.id, resolvedMonth));
});

app.patch('/api/teacher-finance/students/:studentId', (req, res) => {
  const { studentId } = req.params || {};
  const { teacherId, month } = req.body || {};
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const resolvedTeacherId = isTeacherRole(req.auth) ? req.auth.id : teacherId;
  const teacher = ensureTeacherAccess(req, res, resolvedTeacherId, { missingError: 'teacherId required' });
  if (!teacher) return;
  const student = ensureStudentAccess(req, res, studentId, { allowDeleted: true });
  if (!student) return;
  if (normalizeTeacherId(student.teacherId) !== teacher.id) {
    return res.status(403).json({ error: 'Ученик закреплён за другим преподавателем' });
  }
  const resolvedMonth = normalizeTeacherFinanceMonthKey(month);
  if (!resolvedMonth) {
    return res.status(400).json({ error: 'Некорректный месяц' });
  }

  const profile = normalizeTeacherFinanceProfile(req.body || {});
  const nowIso = new Date().toISOString();
  const record = {
    ...normalizeTeacherFinanceStudentRecord(req.body || {}, profile),
    updatedAt: nowIso,
  };
  const financeDb = readTeacherFinanceDb();
  const teacherEntry = getTeacherFinanceTeacherEntry(financeDb, teacher.id);
  const currentMonth = teacherEntry.months[resolvedMonth] || {
    settings: getDefaultTeacherFinanceMonthSettings(),
    students: {},
  };

  teacherEntry.studentProfiles[student.id] = profile;
  teacherEntry.months[resolvedMonth] = {
    settings: normalizeTeacherFinanceMonthSettings(currentMonth.settings),
    students: {
      ...(currentMonth.students || {}),
      [student.id]: record,
    },
  };

  financeDb[teacher.id] = teacherEntry;
  writeTeacherFinanceDb(financeDb);
  return res.json(buildTeacherFinanceResponse(teacher.id, resolvedMonth));
});

app.get('/api/student-schedule-requests', (req, res) => {
  const { studentId, teacherId, status } = req.query || {};
  const requestedStatus = normalizeScheduleChangeRequestStatus(status);
  const requestedStudentId = String(studentId || '').trim();
  const requestedTeacherId = String(teacherId || '').trim();
  let list = readScheduleRequestsDb();

  if (isStudentRole(req.auth)) {
    if (requestedStudentId && requestedStudentId !== req.auth.id) return forbid(res);
    list = list.filter((entry) => entry.studentId === req.auth.id);
  } else if (isTeacherRole(req.auth)) {
    if (requestedTeacherId && requestedTeacherId !== req.auth.id) return forbid(res);
    list = list.filter((entry) => entry.teacherId === req.auth.id);
    if (requestedStudentId) {
      const student = ensureStudentAccess(req, res, requestedStudentId);
      if (!student) return;
      list = list.filter((entry) => entry.studentId === student.id);
    }
  } else if (isAdminRole(req.auth)) {
    if (requestedTeacherId) {
      list = list.filter((entry) => entry.teacherId === requestedTeacherId);
    }
    if (requestedStudentId) {
      list = list.filter((entry) => entry.studentId === requestedStudentId);
    }
  } else {
    return forbid(res);
  }

  if (requestedStatus) {
    list = list.filter((entry) => entry.status === requestedStatus);
  }

  list.sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt || 0);
    const rightTime = Date.parse(right?.createdAt || 0);
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
  return res.json(list);
});

app.post('/api/student-schedule-requests', async (req, res) => {
  if (!isStudentRole(req.auth)) return forbid(res);
  const requestedStudentId = String(req.body?.studentId || req.auth?.id || '').trim();
  const student = ensureStudentAccess(req, res, requestedStudentId, { missingError: 'studentId required' });
  if (!student) return;

  const type = normalizeScheduleChangeRequestType(req.body?.type);
  if (!type) {
    return res.status(400).json({ error: 'Некорректный тип запроса' });
  }

  const payload = req.body?.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload)
    ? req.body.payload
    : {};
  const targetEntryId = String(req.body?.entryId || '').trim();
  const data = getStudentData(student.id);
  const schedule = Array.isArray(data.schedule) ? data.schedule : [];
  let previousEntry = null;
  let proposedEntry = null;

  if (type === 'create') {
    const built = buildStudentScheduleEntry(payload, { auth: req.auth });
    if (!built.entry) {
      return res.status(400).json({ error: built.error || 'Не удалось сформировать слот' });
    }
    proposedEntry = built.entry;
  } else if (type === 'update') {
    if (!targetEntryId) {
      return res.status(400).json({ error: 'entryId required' });
    }
    const existing = schedule.find((entry) => String(entry?.id || '').trim() === targetEntryId);
    if (!existing) {
      return res.status(404).json({ error: 'Занятие не найдено' });
    }
    previousEntry = existing;
    const built = buildStudentScheduleEntry(payload, { existing, auth: req.auth });
    if (!built.entry) {
      return res.status(400).json({ error: built.error || 'Не удалось сформировать изменения' });
    }
    proposedEntry = built.entry;
  } else if (type === 'delete') {
    if (!targetEntryId) {
      return res.status(400).json({ error: 'entryId required' });
    }
    const existing = schedule.find((entry) => String(entry?.id || '').trim() === targetEntryId);
    if (!existing) {
      return res.status(404).json({ error: 'Занятие не найдено' });
    }
    previousEntry = existing;
  }

  const nowIso = new Date().toISOString();
  const requestEntry = {
    id: crypto.randomUUID(),
    type,
    status: 'pending',
    teacherId: String(student.teacherId || '').trim(),
    studentId: student.id,
    studentName: student.name || 'Ученик',
    targetEntryId: targetEntryId || '',
    previousEntry: previousEntry || null,
    proposedEntry: proposedEntry || null,
    createdAt: nowIso,
    resolvedAt: null,
    resolvedByRole: null,
    resolvedById: null,
    resolvedByName: null,
    resolutionNote: '',
  };
  if (!requestEntry.teacherId) {
    return res.status(400).json({ error: 'У ученика не назначен преподаватель' });
  }

  const requests = readScheduleRequestsDb();
  requests.unshift(requestEntry);
  writeScheduleRequestsDb(requests);

  notifyScheduleSyncUpdate({
    scope: 'schedule-request',
    action: 'created',
    teacherId: requestEntry.teacherId,
    studentId: requestEntry.studentId,
    entryId: requestEntry.id,
  });

  const teacherPushKey = requestEntry.teacherId ? `teacher:${requestEntry.teacherId}` : '';
  if (teacherPushKey) {
    const teacherPayload = buildScheduleChangeRequestPushPayloadForTeacher(student, requestEntry);
    sendPushNotificationToUserKey(teacherPushKey, teacherPayload, { logTarget: teacherPushKey })
      .catch((error) => {
        console.error('[push] failed to send schedule-change request notification to teacher:', error);
      });
  }

  return res.json(requestEntry);
});

app.patch('/api/student-schedule-requests/:id', (req, res) => {
  if (!isTeacherRole(req.auth) && !isAdminRole(req.auth)) return forbid(res);
  const requestId = String(req.params?.id || '').trim();
  if (!requestId) {
    return res.status(400).json({ error: 'id required' });
  }
  const action = String(req.body?.action || '').trim().toLowerCase();
  const nextStatus = action === 'approve'
    ? 'approved'
    : (action === 'reject' ? 'rejected' : '');
  if (!nextStatus) {
    return res.status(400).json({ error: 'action must be approve or reject' });
  }

  const requests = readScheduleRequestsDb();
  const index = requests.findIndex((entry) => entry.id === requestId);
  if (index < 0) {
    return res.status(404).json({ error: 'Запрос не найден' });
  }
  const current = requests[index];
  if (isTeacherRole(req.auth) && current.teacherId !== req.auth.id) {
    return forbid(res);
  }
  if (current.status !== 'pending') {
    return res.status(409).json({ error: 'Запрос уже обработан' });
  }

  const student = findStudentById(current.studentId);
  if (!student) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  if (isTeacherRole(req.auth) && student.teacherId !== req.auth.id) {
    return forbid(res);
  }

  if (nextStatus === 'approved') {
    const data = getStudentData(student.id);
    const schedule = Array.isArray(data.schedule) ? [...data.schedule] : [];
    const type = normalizeScheduleChangeRequestType(current.type);
    if (type === 'create') {
      const draftEntry = current.proposedEntry && typeof current.proposedEntry === 'object'
        ? { ...current.proposedEntry }
        : null;
      if (!draftEntry) {
        return res.status(400).json({ error: 'В запросе нет данных для добавления' });
      }
      const draftId = String(draftEntry.id || '').trim();
      draftEntry.id = draftId && !schedule.some((item) => String(item?.id || '').trim() === draftId)
        ? draftId
        : crypto.randomUUID();
      schedule.unshift(draftEntry);
      setStudentData(student.id, { ...data, schedule });
      notifyScheduleSyncUpdate({
        scope: 'student-schedule',
        action: 'created',
        teacherId: student.teacherId,
        studentId: student.id,
        entryId: draftEntry.id,
      });
    } else if (type === 'update') {
      const targetEntryId = String(current.targetEntryId || '').trim();
      const slotIndex = schedule.findIndex((entry) => String(entry?.id || '').trim() === targetEntryId);
      if (slotIndex < 0) {
        return res.status(404).json({ error: 'Занятие для изменения не найдено' });
      }
      const existing = schedule[slotIndex];
      const draftEntry = current.proposedEntry && typeof current.proposedEntry === 'object'
        ? { ...current.proposedEntry }
        : null;
      if (!draftEntry) {
        return res.status(400).json({ error: 'В запросе нет данных для изменения' });
      }
      draftEntry.id = targetEntryId;
      if (!draftEntry.createdAt && existing?.createdAt) {
        draftEntry.createdAt = existing.createdAt;
      }
      schedule[slotIndex] = draftEntry;
      setStudentData(student.id, { ...data, schedule });
      notifyScheduleSyncUpdate({
        scope: 'student-schedule',
        action: 'updated',
        teacherId: student.teacherId,
        studentId: student.id,
        entryId: targetEntryId,
      });
    } else if (type === 'delete') {
      const targetEntryId = String(current.targetEntryId || '').trim();
      const nextSchedule = schedule.filter((entry) => String(entry?.id || '').trim() !== targetEntryId);
      if (nextSchedule.length === schedule.length) {
        return res.status(404).json({ error: 'Занятие для удаления не найдено' });
      }
      setStudentData(student.id, { ...data, schedule: nextSchedule });
      notifyScheduleSyncUpdate({
        scope: 'student-schedule',
        action: 'deleted',
        teacherId: student.teacherId,
        studentId: student.id,
        entryId: targetEntryId,
      });
    } else {
      return res.status(400).json({ error: 'Некорректный тип запроса' });
    }
  }

  const resolvedAt = new Date().toISOString();
  requests[index] = {
    ...current,
    status: nextStatus,
    resolvedAt,
    resolvedByRole: String(req.auth?.role || '').trim() || null,
    resolvedById: String(req.auth?.id || '').trim() || null,
    resolvedByName: typeof req.auth?.name === 'string' && req.auth.name.trim() ? req.auth.name.trim() : null,
    resolutionNote: typeof req.body?.resolutionNote === 'string'
      ? req.body.resolutionNote.trim().slice(0, 500)
      : '',
  };
  writeScheduleRequestsDb(requests);

  notifyScheduleSyncUpdate({
    scope: 'schedule-request',
    action: nextStatus,
    teacherId: current.teacherId,
    studentId: current.studentId,
    entryId: current.id,
  });

  return res.json(requests[index]);
});

app.post('/api/student-schedule', (req, res) => {
  if (isStudentRole(req.auth)) {
    return res.status(403).json({ error: 'Изменение расписания ученика требует подтверждения преподавателя' });
  }
  const { studentId } = req.body || {};
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const { entry, error } = buildStudentScheduleEntry(req.body || {}, { auth: req.auth });
  if (!entry) {
    return res.status(400).json({ error: error || 'Не удалось сохранить занятие' });
  }
  const data = getStudentData(student.id);
  const schedule = [entry, ...(data.schedule || [])];
  setStudentData(student.id, { ...data, schedule });
  notifyScheduleSyncUpdate({
    scope: 'student-schedule',
    action: 'created',
    teacherId: student.teacherId,
    studentId: student.id,
    entryId: entry.id,
  });
  res.json(entry);
});

app.put('/api/student-schedule/:id', (req, res) => {
  if (isStudentRole(req.auth)) {
    return res.status(403).json({ error: 'Изменение расписания ученика требует подтверждения преподавателя' });
  }
  const { id } = req.params;
  const { studentId } = req.body || {};
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const schedule = Array.isArray(data.schedule) ? [...data.schedule] : [];
  const index = schedule.findIndex((item) => item?.id === id);
  if (index < 0) {
    return res.status(404).json({ error: 'Занятие не найдено' });
  }
  const { entry, error } = buildStudentScheduleEntry(req.body || {}, {
    existing: schedule[index],
    auth: req.auth,
  });
  if (!entry) {
    return res.status(400).json({ error: error || 'Не удалось обновить занятие' });
  }
  schedule[index] = entry;
  setStudentData(student.id, { ...data, schedule });
  notifyScheduleSyncUpdate({
    scope: 'student-schedule',
    action: 'updated',
    teacherId: student.teacherId,
    studentId: student.id,
    entryId: entry.id,
  });
  res.json(entry);
});

app.delete('/api/student-schedule/:id', (req, res) => {
  if (isStudentRole(req.auth)) {
    return res.status(403).json({ error: 'Изменение расписания ученика требует подтверждения преподавателя' });
  }
  const { id } = req.params;
  const { studentId } = req.query;
  const student = ensureStudentAccess(req, res, studentId);
  if (!student) return;
  const data = getStudentData(student.id);
  const schedule = (data.schedule || []).filter((item) => item.id !== id);
  setStudentData(student.id, { ...data, schedule });
  notifyScheduleSyncUpdate({
    scope: 'student-schedule',
    action: 'deleted',
    teacherId: student.teacherId,
    studentId: student.id,
    entryId: id,
  });
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
    mimeType: typeof req.file.mimetype === 'string' ? req.file.mimetype : '',
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
  let effectiveStudent = null;
  if (effectiveStudentId) {
    effectiveStudent = ensureStudentAccess(req, res, effectiveStudentId);
    if (!effectiveStudent) return;
  }
  let folders = readFoldersDb();
  if (effectiveStudentId) {
    const teacherId = normalizeTeacherId(effectiveStudent?.teacherId);
    folders = folders.filter((entry) => {
      const folderStudentId = String(entry?.studentId || '').trim();
      if (folderStudentId === effectiveStudentId) return true;
      if (!isLessonSharedFolderEntry(entry)) return false;
      const folderTeacherId = normalizeTeacherId(entry?.teacherId);
      return Boolean(teacherId && folderTeacherId === teacherId);
    });
  }
  const taskNum = Number(taskNumber);
  if (taskNumber) {
    folders = folders.filter((f) => f.taskNumber === taskNum);
  }
  if (category) {
    folders = folders.filter((f) => f.category === category);
  }
  if (
    effectiveStudent
    && isLessonSharedCategory(category)
    && Number.isFinite(taskNum)
  ) {
    const sharedFolder = createLessonSharedFolderEntry(effectiveStudent.teacherId, taskNum);
    if (sharedFolder && !folders.some((folder) => folder?.id === sharedFolder.id)) {
      folders.unshift(sharedFolder);
    }
  }
  res.json(folders);
});

app.post('/api/folders', (req, res) => {
  const { taskNumber, category, name, studentId, parentFolderId } = req.body || {};
  const taskNum = Number(taskNumber);
  const normalizedCategory = String(category || '').trim();
  const folderName = normalizeFolderName(name);
  const normalizedParentFolderId = normalizeParentFolderId(parentFolderId);

  if (!Number.isFinite(taskNum) || !normalizedCategory || !folderName) {
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
  if (isLessonSharedCategory(normalizedCategory) && folderName.toLowerCase() === LESSON_SHARED_FOLDER_NAME.toLowerCase()) {
    return res.status(409).json({ error: 'Папка с таким названием уже создана системой' });
  }

  const folders = readFoldersDb();
  const foldersById = buildFoldersMapById(folders);
  const studentTeacherId = normalizeTeacherId(student?.teacherId);
  const sharedStudentId = buildLessonSharedStudentId(studentTeacherId);
  let parentIsLessonShared = false;
  if (normalizedParentFolderId) {
    if (
      isLessonSharedCategory(normalizedCategory)
      && isLessonSharedFolderIdForTeacher(normalizedParentFolderId, studentTeacherId, taskNum)
    ) {
      parentIsLessonShared = true;
    } else {
      const parentRef = folders.find(
        (f) =>
          f.id === normalizedParentFolderId &&
          f.taskNumber === taskNum &&
          f.category === normalizedCategory &&
          (
            f.studentId === student.id
            || (
              isLessonSharedFolderEntry(f)
              && normalizeTeacherId(f.teacherId) === studentTeacherId
            )
          )
      );
      if (!parentRef) {
        return res.status(400).json({ error: 'Родительская папка не найдена' });
      }
      parentIsLessonShared = isFolderInLessonSharedTree(foldersById, parentRef, studentTeacherId, taskNum);
    }
    if (parentIsLessonShared && !canWriteLessonSharedByTeacher(req.auth, studentTeacherId)) {
      return res.status(403).json({ error: `В папке "${LESSON_SHARED_FOLDER_NAME}" может создавать подпапки только учитель` });
    }
  }
  if (parentIsLessonShared && !sharedStudentId) {
    return res.status(400).json({ error: 'Не удалось определить владельца общей папки' });
  }

  const targetStudentId = parentIsLessonShared ? sharedStudentId : student.id;
  const exists = folders.some(
    (f) =>
      f.studentId === targetStudentId &&
      f.taskNumber === taskNum &&
      f.category === normalizedCategory &&
      normalizeParentFolderId(f.parentFolderId) === normalizedParentFolderId &&
      f.name?.toLowerCase() === folderName.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: 'Такая папка уже существует' });
  }

  const entry = {
    id: crypto.randomUUID(),
    studentId: targetStudentId,
    taskNumber: taskNum,
    category: normalizedCategory,
    parentFolderId: normalizedParentFolderId,
    name: folderName,
    date: new Date().toLocaleDateString('ru-RU'),
    ...(parentIsLessonShared ? {
      teacherId: studentTeacherId,
      sharedScope: LESSON_SHARED_SCOPE,
      isLessonShared: true,
    } : {}),
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
  const currentIsLessonSharedEntry = isLessonSharedFolderEntry(current);
  let ownerStudent = null;
  let ownerTeacherId = '';
  if (currentIsLessonSharedEntry) {
    ownerTeacherId = normalizeTeacherId(
      current?.teacherId
      || extractTeacherIdFromLessonSharedStudentId(current?.studentId)
    );
    if (!ownerTeacherId) {
      return res.status(400).json({ error: 'Не удалось определить владельца общей папки' });
    }
    if (!canWriteLessonSharedByTeacher(req.auth, ownerTeacherId)) return forbid(res);
  } else {
    if (!ensureStudentAccess(req, res, current.studentId, { allowDeleted: true })) return;
    ownerStudent = findStudentById(current?.studentId, { allowDeleted: true });
    ownerTeacherId = normalizeTeacherId(current?.teacherId || ownerStudent?.teacherId);
  }
  const foldersById = buildFoldersMapById(folders);
  const currentParentFolderId = normalizeParentFolderId(current.parentFolderId);
  const isCurrentSharedFolder = isFolderInLessonSharedTree(foldersById, current, ownerTeacherId, current.taskNumber);
  if (isCurrentSharedFolder && !canWriteLessonSharedByTeacher(req.auth, ownerTeacherId)) {
    return forbid(res);
  }
  if (isLessonSharedCategory(current.category) && folderName.toLowerCase() === LESSON_SHARED_FOLDER_NAME.toLowerCase()) {
    return res.status(409).json({ error: 'Папка с таким названием уже создана системой' });
  }
  const exists = folders.some(
    (f) =>
      f.id !== id &&
      f.studentId === current.studentId &&
      f.taskNumber === current.taskNumber &&
      f.category === current.category &&
      normalizeParentFolderId(f.parentFolderId) === currentParentFolderId &&
      f.name?.toLowerCase() === folderName.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: 'Такая папка уже существует' });
  }

  const updated = {
    ...current,
    parentFolderId: currentParentFolderId,
    name: folderName,
    ...(isCurrentSharedFolder ? {
      teacherId: ownerTeacherId,
      sharedScope: LESSON_SHARED_SCOPE,
      isLessonShared: true,
    } : {}),
  };
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

app.delete('/api/folders/:id', (req, res) => {
  if (!isTeacherRole(req.auth)) return forbid(res);
  const { id } = req.params;
  const folderId = String(id || '').trim();
  if (!folderId) return res.status(400).json({ error: 'Некорректный идентификатор папки' });

  const folders = readFoldersDb();
  const idx = folders.findIndex((folder) => folder?.id === folderId);
  if (idx === -1) return res.status(404).json({ error: 'Папка не найдена' });

  const current = folders[idx];
  const foldersById = buildFoldersMapById(folders);
  const ownerStudent = findStudentById(current?.studentId, { allowDeleted: true });
  const ownerTeacherId = normalizeTeacherId(
    current?.teacherId
    || ownerStudent?.teacherId
    || extractTeacherIdFromLessonSharedStudentId(current?.studentId)
  );
  const isSharedFolder = isFolderInLessonSharedTree(foldersById, current, ownerTeacherId, current.taskNumber);
  const isSharedRootFolder = isLessonSharedFolderIdForTeacher(current?.id, ownerTeacherId, current?.taskNumber)
    || String(current?.name || '').trim().toLowerCase() === LESSON_SHARED_FOLDER_NAME;

  if (isSharedFolder) {
    if (current?.isSystem || isSharedRootFolder) {
      return res.status(400).json({ error: 'Системную общую папку удалять нельзя' });
    }
    if (!canWriteLessonSharedByTeacher(req.auth, ownerTeacherId)) return forbid(res);
  } else if (!ensureStudentAccess(req, res, current?.studentId, { allowDeleted: true })) {
    return;
  }

  const deletedFolderIdSet = collectFolderSubtreeIds(folders, folderId);
  if (!deletedFolderIdSet.size) {
    return res.status(400).json({ error: 'Не удалось удалить папку' });
  }
  const deletedFolderIds = Array.from(deletedFolderIdSet);
  const nextFolders = folders.filter((folder) => !deletedFolderIdSet.has(String(folder?.id || '').trim()));
  writeFoldersDb(nextFolders);

  const files = readFilesDb();
  const deletedFiles = [];
  const nextFiles = [];
  files.forEach((file) => {
    const fileFolderId = normalizeParentFolderId(file?.folderId);
    if (fileFolderId && deletedFolderIdSet.has(fileFolderId)) {
      deletedFiles.push(file);
      return;
    }
    nextFiles.push(file);
  });
  if (deletedFiles.length > 0) {
    writeFilesDb(nextFiles);
    deletedFiles.forEach((file) => {
      const safeStorageName = path.basename(String(file?.storageName || '').trim());
      if (!safeStorageName) return;
      const filePath = path.join(uploadsDir, safeStorageName);
      fs.unlink(filePath, () => {});
    });
  }

  res.json({
    ok: true,
    deletedFolderIds,
    deletedFileIds: deletedFiles.map((file) => file.id),
  });
});

app.get('/api/files', (req, res) => {
  const { taskNumber, category, studentId } = req.query;
  const requestedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
  const effectiveStudentId = requestedStudentId || (isStudentRole(req.auth) ? req.auth.id : '');
  if (!effectiveStudentId && !isAdminRole(req.auth)) {
    return res.status(400).json({ error: 'studentId required' });
  }
  let effectiveStudent = null;
  if (effectiveStudentId) {
    effectiveStudent = ensureStudentAccess(req, res, effectiveStudentId);
    if (!effectiveStudent) return;
  }
  let files = readFilesDb();
  if (effectiveStudentId) {
    const teacherId = normalizeTeacherId(effectiveStudent?.teacherId);
    files = files.filter((entry) => {
      const fileStudentId = typeof entry?.studentId === 'string' ? entry.studentId.trim() : '';
      if (fileStudentId === effectiveStudentId) return true;
      if (!isLessonSharedFile(entry)) return false;
      const fileTeacherId = normalizeTeacherId(entry?.teacherId);
      return Boolean(teacherId && fileTeacherId === teacherId);
    });
  }
  const taskNum = Number(taskNumber);
  if (taskNumber) {
    files = files.filter((f) => f.taskNumber === taskNum);
  }
  if (category) {
    files = files.filter((f) => f.category === category);
  }
  const folders = readFoldersDb();
  res.json(enrichFilesWithFolderPath(files, folders));
});

app.post('/api/files', upload.single('file'), (req, res) => {
  const { taskNumber, category, folderId, studentId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Файл не найден' });

  const taskNum = Number(taskNumber);
  const normalizedCategory = String(category || '').trim();
  if (!Number.isFinite(taskNum) || !normalizedCategory) {
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

  const studentTeacherId = normalizeTeacherId(student.teacherId);
  const normalizedFolderId = normalizeParentFolderId(folderId);
  let folderName = null;
  let folderRef = null;
  let isLessonSharedUpload = false;
  if (normalizedFolderId) {
    if (isLessonSharedCategory(normalizedCategory) && isLessonSharedFolderIdForTeacher(normalizedFolderId, studentTeacherId, taskNum)) {
      if (!canWriteLessonSharedByTeacher(req.auth, studentTeacherId)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
        return res.status(403).json({ error: `В папку "${LESSON_SHARED_FOLDER_NAME}" может загружать только учитель` });
      }
      folderRef = createLessonSharedFolderEntry(studentTeacherId, taskNum);
      if (!folderRef) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
        return res.status(400).json({ error: 'Папка не найдена' });
      }
      folderName = folderRef.name;
      isLessonSharedUpload = true;
    } else {
      const folders = readFoldersDb();
      const foldersById = buildFoldersMapById(folders);
      folderRef = folders.find(
        (f) =>
          f.id === normalizedFolderId &&
          f.taskNumber === taskNum &&
          f.category === normalizedCategory &&
          (
            f.studentId === student.id
            || (
              isLessonSharedFolderEntry(f)
              && normalizeTeacherId(f.teacherId) === studentTeacherId
            )
          )
      );
      if (!folderRef) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
        return res.status(400).json({ error: 'Папка не найдена' });
      }
      const folderIsLessonShared = isFolderInLessonSharedTree(foldersById, folderRef, studentTeacherId, taskNum);
      if (folderIsLessonShared && !canWriteLessonSharedByTeacher(req.auth, studentTeacherId)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
        return res.status(403).json({ error: `В папку "${LESSON_SHARED_FOLDER_NAME}" может загружать только учитель` });
      }
      folderName = folderRef.name;
      isLessonSharedUpload = folderIsLessonShared;
    }
  }

  const db = readFilesDb();
  const fileLimitBytes = getUploadFileLimitBytes(isLessonSharedUpload);
  if (req.file.size > fileLimitBytes) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(413).json({ error: getUploadFileLimitError(fileLimitBytes) });
  }
  const taskLimitBytes = getTaskLimitBytes(isLessonSharedUpload);
  const currentTotal = db
    .filter((entry) => {
      if (entry?.taskNumber !== taskNum) return false;
      if (isLessonSharedUpload) {
        return isLessonSharedFile(entry) && normalizeTeacherId(entry?.teacherId) === studentTeacherId;
      }
      return entry?.studentId === student.id;
    })
    .reduce((sum, f) => sum + getEntrySizeBytes(f), 0);
  if (currentTotal + req.file.size > taskLimitBytes) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(413).json({ error: getTaskLimitError(taskLimitBytes) });
  }

  if (folderRef) {
    const folderLimitBytes = getFolderLimitBytes(isLessonSharedUpload);
    const currentFolderTotal = getFolderTotalBytes(db, folderRef.id);
    if (currentFolderTotal + req.file.size > folderLimitBytes) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      return res.status(413).json({ error: getFolderLimitError(folderLimitBytes) });
    }
  }
  const id = req.fileId || crypto.randomUUID();
  const entry = {
    id,
    studentId: isLessonSharedUpload ? buildLessonSharedStudentId(studentTeacherId) : student.id,
    taskNumber: taskNum,
    category: normalizedCategory,
    folderId: folderRef?.id || null,
    folderName,
    name: normalizeFileName(req.file.originalname),
    size: formatSize(req.file.size),
    sizeBytes: req.file.size,
    date: new Date().toLocaleDateString('ru-RU'),
    url: `/uploads/${req.file.filename}`,
    storageName: req.file.filename,
    ...(isLessonSharedUpload ? {
      teacherId: studentTeacherId,
      sharedScope: LESSON_SHARED_SCOPE,
      isLessonShared: true,
    } : {}),
  };

  db.unshift(entry);
  writeFilesDb(db);

  const [entryWithFolderPath] = enrichFilesWithFolderPath([entry], readFoldersDb());
  res.json(entryWithFolderPath || entry);
});

app.delete('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const db = readFilesDb();
  const idx = db.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Файл не найден' });
  const target = db[idx];
  if (isLessonSharedFile(target)) {
    if (!canWriteLessonSharedByTeacher(req.auth, target.teacherId)) return forbid(res);
  } else if (!ensureStudentAccess(req, res, target?.studentId, { allowDeleted: true })) {
    return;
  }

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
  const current = db[idx];
  const isCurrentLessonShared = isLessonSharedFile(current);
  if (isCurrentLessonShared) {
    if (!canWriteLessonSharedByTeacher(req.auth, current?.teacherId)) return forbid(res);
  } else if (!ensureStudentAccess(req, res, current?.studentId, { allowDeleted: true })) {
    return;
  }
  const ownerStudent = isCurrentLessonShared ? null : findStudentById(current?.studentId, { allowDeleted: true });
  const ownerTeacherId = isCurrentLessonShared
    ? normalizeTeacherId(current?.teacherId)
    : normalizeTeacherId(ownerStudent?.teacherId);

  let updated = { ...current };

  if (typeof name !== 'undefined') {
    const newName = normalizeFolderName(name);
    if (!newName) return res.status(400).json({ error: 'Введите название файла' });
    if (newName.length > 120) return res.status(400).json({ error: 'Название слишком длинное' });
    updated.name = newName;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'folderId')) {
    const folderIdRaw = req.body.folderId;
    const folderId = normalizeParentFolderId(folderIdRaw);
    if (!folderId) {
      if (isCurrentLessonShared) {
        return res.status(400).json({ error: `Файл из папки "${LESSON_SHARED_FOLDER_NAME}" можно перемещать только внутри общей папки` });
      }
      updated.folderId = null;
      updated.folderName = null;
    } else if (isLessonSharedFolderIdForTeacher(folderId, ownerTeacherId, updated.taskNumber)) {
      if (!canWriteLessonSharedByTeacher(req.auth, ownerTeacherId)) return forbid(res);
      const movingSizeBytes = getEntrySizeBytes(db[idx]);
      const sharedFolderId = buildLessonSharedFolderId(ownerTeacherId, updated.taskNumber);
      const folderLimitBytes = getFolderLimitBytes(true);
      const currentFolderTotal = getFolderTotalBytes(db, sharedFolderId, id);
      if (currentFolderTotal + movingSizeBytes > folderLimitBytes) {
        return res.status(413).json({ error: getFolderLimitError(folderLimitBytes) });
      }
      const sharedTaskLimitBytes = getTaskLimitBytes(true);
      const sharedTaskTotal = db
        .filter((file) => (
          file.id !== id
          && file.taskNumber === updated.taskNumber
          && isLessonSharedFile(file)
          && normalizeTeacherId(file.teacherId) === ownerTeacherId
        ))
        .reduce((sum, file) => sum + getEntrySizeBytes(file), 0);
      if (sharedTaskTotal + movingSizeBytes > sharedTaskLimitBytes) {
        return res.status(413).json({ error: getTaskLimitError(sharedTaskLimitBytes) });
      }
      updated.folderId = sharedFolderId;
      updated.folderName = LESSON_SHARED_FOLDER_NAME;
      updated.studentId = buildLessonSharedStudentId(ownerTeacherId);
      updated.teacherId = ownerTeacherId;
      updated.sharedScope = LESSON_SHARED_SCOPE;
      updated.isLessonShared = true;
    } else {
      const folders = readFoldersDb();
      const foldersById = buildFoldersMapById(folders);
      const folderRef = folders.find(
        (f) =>
          f.id === folderId &&
          f.taskNumber === updated.taskNumber &&
          f.category === updated.category &&
          (
            f.studentId === updated.studentId
            || (
              isLessonSharedFolderEntry(f)
              && normalizeTeacherId(f.teacherId) === ownerTeacherId
            )
          )
      );
      if (!folderRef) return res.status(400).json({ error: 'Папка не найдена' });
      const movingSizeBytes = getEntrySizeBytes(db[idx]);
      const folderIsLessonShared = isFolderInLessonSharedTree(foldersById, folderRef, ownerTeacherId, updated.taskNumber);
      const folderLimitBytes = getFolderLimitBytes(folderIsLessonShared);
      const currentFolderTotal = getFolderTotalBytes(db, folderRef.id, id);
      if (currentFolderTotal + movingSizeBytes > folderLimitBytes) {
        return res.status(413).json({ error: getFolderLimitError(folderLimitBytes) });
      }
      if (isCurrentLessonShared && !folderIsLessonShared) {
        return res.status(400).json({ error: `Файл из папки "${LESSON_SHARED_FOLDER_NAME}" можно перемещать только внутри общей папки` });
      }
      if (folderIsLessonShared) {
        if (!canWriteLessonSharedByTeacher(req.auth, ownerTeacherId)) return forbid(res);
        const sharedTaskLimitBytes = getTaskLimitBytes(true);
        const sharedTaskTotal = db
          .filter((file) => (
            file.id !== id
            && file.taskNumber === updated.taskNumber
            && isLessonSharedFile(file)
            && normalizeTeacherId(file.teacherId) === ownerTeacherId
          ))
          .reduce((sum, file) => sum + getEntrySizeBytes(file), 0);
        if (sharedTaskTotal + movingSizeBytes > sharedTaskLimitBytes) {
          return res.status(413).json({ error: getTaskLimitError(sharedTaskLimitBytes) });
        }
        updated.folderId = folderRef.id;
        updated.folderName = folderRef.name;
        updated.studentId = buildLessonSharedStudentId(ownerTeacherId);
        updated.teacherId = ownerTeacherId;
        updated.sharedScope = LESSON_SHARED_SCOPE;
        updated.isLessonShared = true;
      } else {
        updated.folderId = folderRef.id;
        updated.folderName = folderRef.name;
      }
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
    const updatedIsLessonShared = isLessonSharedFile(updated);
    const updatedTeacherId = normalizeTeacherId(updated?.teacherId);
    const taskLimitBytes = getTaskLimitBytes(updatedIsLessonShared);
    const currentTotal = db
      .filter((file) => {
        if (file.id === id || file.taskNumber !== updated.taskNumber) return false;
        if (updatedIsLessonShared) {
          return isLessonSharedFile(file) && normalizeTeacherId(file?.teacherId) === updatedTeacherId;
        }
        return file.studentId === updated.studentId;
      })
      .reduce((sum, file) => sum + getEntrySizeBytes(file), 0);
    if (currentTotal + nextSizeBytes > taskLimitBytes) {
      return res.status(413).json({ error: getTaskLimitError(taskLimitBytes) });
    }
    if (updated.folderId) {
      const folderLimitBytes = getFolderLimitBytes(updatedIsLessonShared);
      const currentFolderTotal = getFolderTotalBytes(db, updated.folderId, id);
      if (currentFolderTotal + nextSizeBytes > folderLimitBytes) {
        return res.status(413).json({ error: getFolderLimitError(folderLimitBytes) });
      }
    }
    fs.writeFileSync(filePath, content, 'utf8');
    updated.sizeBytes = nextSizeBytes;
    updated.size = formatSize(nextSizeBytes);
    updated.date = new Date().toLocaleDateString('ru-RU');
  }

  db[idx] = updated;
  writeFilesDb(db);
  const [updatedWithFolderPath] = enrichFilesWithFolderPath([updated], readFoldersDb());
  res.json(updatedWithFolderPath || updated);
});

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
    return res.status(413).json({
      error: getUploadFileLimitError(Number(err?.limit) || MAX_LESSON_SHARED_UPLOAD_FILE_BYTES),
    });
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
  const runSweep = async () => {
    try {
      await runPushReminderSweep();
    } catch (error) {
      console.error('[push] reminder sweep crashed:', error);
    }
    try {
      await runPushLessonReminderSweep();
    } catch (error) {
      console.error('[push] lesson reminder sweep crashed:', error);
    }
    try {
      await runPushTeacherCalendarReminderSweep();
    } catch (error) {
      console.error('[push] teacher calendar reminder sweep crashed:', error);
    }
  };
  runSweep().catch(() => {});
  const interval = setInterval(() => {
    runSweep().catch(() => {});
  }, PUSH_SWEEP_INTERVAL_MS);
  if (typeof interval.unref === 'function') interval.unref();
};

const pushSweepStartTimer = setTimeout(startPushReminderSweep, PUSH_SWEEP_START_DELAY_MS);
if (typeof pushSweepStartTimer.unref === 'function') pushSweepStartTimer.unref();

const server = createServer(app);
const collabWss = new WebSocketServer({ noServer: true });
const rtcWss = new WebSocketServer({ noServer: true });
const notificationsWss = new WebSocketServer({ noServer: true });
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
const notificationClientsBySocket = new Map();

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

const sendNotificationPayload = (ws, payload) => {
  if (!ws || ws.readyState !== WS_OPEN_STATE) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {}
};

const cleanupNotificationClient = (ws) => {
  if (!ws) return;
  notificationClientsBySocket.delete(ws);
};

const broadcastNotificationCreated = (entry) => {
  if (!entry) return;
  notificationClientsBySocket.forEach((client) => {
    if (!client?.auth || !isStudentRole(client.auth)) return;
    if (!canStudentViewBroadcastNotification(client.auth, entry)) return;
    sendNotificationPayload(client.ws, {
      type: 'broadcast-notification-created',
      notification: serializeBroadcastNotificationForStudent(entry, client.auth.id),
    });
  });
};

const broadcastNotificationDeleted = (entry) => {
  if (!entry?.id) return;
  notificationClientsBySocket.forEach((client) => {
    if (!client?.auth || !isStudentRole(client.auth)) return;
    if (!canStudentViewBroadcastNotification(client.auth, entry)) return;
    sendNotificationPayload(client.ws, {
      type: 'broadcast-notification-deleted',
      notificationId: entry.id,
    });
  });
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
  if (!RTC_PRESENCE_FS_ENABLED) return;
  const filePath = getRtcPresenceFilePath(clientId);
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {}
};

const upsertRtcPresenceFileFromClient = (client) => {
  if (!RTC_PRESENCE_FS_ENABLED) return;
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
  if (!RTC_PRESENCE_FS_ENABLED) return [];
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

  if (pathname === '/notifications') {
    const token = getAuthTokenFromRequest(request);
    const session = getAuthSession(token);
    if (!session?.user) {
      rejectUpgrade(socket, 401, 'Unauthorized');
      return;
    }

    notificationsWss.handleUpgrade(request, socket, head, (ws) => {
      notificationsWss.emit('connection', ws, request, session.user);
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

notificationsWss.on('connection', (ws, _request, user) => {
  const auth = buildSessionUser(user);
  if (!auth) {
    try {
      ws.close(1008, 'Unauthorized');
    } catch {}
    return;
  }

  notificationClientsBySocket.set(ws, {
    ws,
    auth,
  });

  sendNotificationPayload(ws, {
    type: 'ready',
    user: {
      id: auth.id,
      role: auth.role,
    },
  });

  ws.on('close', () => {
    cleanupNotificationClient(ws);
  });

  ws.on('error', () => {
    cleanupNotificationClient(ws);
  });
});

if (process.argv.includes('--rebalance-student-xp')) {
  const summary = runStudentXpFixes({ apply: process.argv.includes('--apply') });
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const runStartupStudentXpRebalance = () => {
  if (process.env.DISABLE_STARTUP_XP_REBALANCE === '1') return;
  try {
    const repairSummary = repairBadRecentXpRebalance({ apply: true });
    if (repairSummary.changed > 0 || repairSummary.skipped?.length > 0) {
      console.info('[xp-rebalance] startup repair:', JSON.stringify(repairSummary));
    }
    const alexanderSummary = applyAlexanderWeekStartXpBaseFix({ apply: true });
    if (alexanderSummary.changed > 0 || alexanderSummary.skipped?.length > 0) {
      console.info('[xp-rebalance] alexander week-start fix:', JSON.stringify(alexanderSummary));
    }
  } catch (error) {
    console.warn('[xp-rebalance] startup fix failed:', error?.message || error);
  }
};

runStartupStudentXpRebalance();

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

