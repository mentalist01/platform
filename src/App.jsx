import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { 
  BookOpen, BarChart2, LogOut, Download, FileText, CheckCircle, AlertCircle, AlertTriangle,
  X, ChevronRight, Folder, FolderPlus, Upload, 
  ArrowLeft, Trash2, PlayCircle, Play, Bug, StepBack, StepForward, Pause, Check, Plus, Flame, Snowflake,
  Settings, Save, Calendar, RefreshCcw, Pencil, Brush, Minus, Undo2, Hand, Expand, Minimize2, Eraser, Image as ImageIcon, Trophy, Square,
  ChevronsLeft, ChevronsRight,
  Bell, BellOff, MousePointer2, Code2
} from 'lucide-react';  
import mascotApproval from './assets/mascot/Approval.png';
import mascotDisapproval from './assets/mascot/disapproval.png';
import mascotGreetings from './assets/mascot/greetings.png';
import mascotPeeking from './assets/mascot/peeking.png';
import mascotPondering from './assets/mascot/pondering.png';
import leagueBronze from './assets/leagues/bronze.png';
import leagueSilver from './assets/leagues/silver.png';
import leagueGold from './assets/leagues/gold.png';
import leagueRuby from './assets/leagues/ruby.png';
import leagueDiamond from './assets/leagues/diamond.png';
import leagueAbsolute from './assets/leagues/absolute.png';
import leagueCelestial from './assets/leagues/celestial.png';
import AdminPanel from './components/AdminPanel';
import CallSection from './components/CallSection';
import ImageViewer from './components/ImageViewer';
import LoginPage from './components/LoginPage';
import NotesSection from './components/NotesSection';
import NewHomeworkModal from './components/NewHomeworkModal';
import { LogoMark, PythonLogoIcon } from './components/Identity';
import ProgressSection from './components/ProgressSection';
import PythonSection from './components/PythonSection';
import ScheduleSection from './components/ScheduleSection';
import StudentLeaderboardSection from './components/StudentLeaderboardSection';
import StudentTour from './components/StudentTour';
import TeacherPanel from './components/TeacherPanel';
import ThemeToggleButton from './components/ThemeToggleButton';
import { Button, Card, ProgressBar } from './components/ui';
import {
  USER_SESSION_KEY,
  THEME_STORAGE_KEY,
  THEME_LIGHT,
  THEME_DARK,
  normalizeTheme,
  getPreferredTheme,
  clearStoredSession,
} from './utils/theme';
import {
  isPushFeatureSupported,
  getPushPermission,
  urlBase64ToUint8Array,
  getPushServiceWorkerRegistration,
  getBrowserPushSubscription,
  normalizePushErrorMessage,
} from './utils/push';
import { api, setUnauthorizedHandler } from './services/api';

const optionalLeagueIcons = import.meta.glob('./assets/leagues/blank.png', { eager: true, import: 'default' });
const leagueBlank = optionalLeagueIcons['./assets/leagues/blank.png'] || null;

/**
 * CONSTANTS & CONFIG
 */

const LEVELS = {
  BASIC: { id: 'basic', label: 'Обязательный', maxScore: 70, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  ADVANCED: { id: 'advanced', label: 'Продвинутый', maxScore: 90, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  EXPERT: { id: 'expert', label: 'Чтоб наверняка', maxScore: 100, color: 'bg-red-100 text-red-700 border-red-200' }
};
const LEVEL_WEIGHTS = {
  basic: 70,
  advanced: 20,
  expert: 10,
};
const SOFT_DELETE_DAYS = 30;
const GAME_THEORY_TASK = 19;
const PYTHON_LEVEL_ID = 'python';
const GOAL_TYPE_TASK = 'task';
const GOAL_TYPE_MOCK = 'mock';
const XP_PER_LEVEL = 1000;
const LEAGUE_TIERS = [
  { id: 'celestial', label: 'Целестиал', minXp: 80000, icon: leagueCelestial },
  { id: 'absolute', label: 'Абсолют', minXp: 40000, icon: leagueAbsolute },
  { id: 'ruby', label: 'Рубиновая лига', minXp: 25000, icon: leagueRuby },
  { id: 'diamond', label: 'Алмазная лига', minXp: 20000, icon: leagueDiamond },
  { id: 'gold', label: 'Золотая лига', minXp: 15000, icon: leagueGold },
  { id: 'silver', label: 'Серебряная лига', minXp: 10000, icon: leagueSilver },
  { id: 'bronze', label: 'Бронзовая лига', minXp: 5000, icon: leagueBronze },
];
const BLANK_LEAGUE = { id: 'blank', label: 'Без лиги', minXp: 0, icon: leagueBlank };
const COLLAB_COLORS = ['#7c3aed', '#2563eb', '#0ea5e9', '#10b981', '#f97316', '#ef4444'];
const BOARD_COLORS = ['#0f172a', '#7c3aed', '#2563eb', '#0ea5e9', '#10b981', '#f97316', '#ef4444'];
const BOARD_STROKE_WIDTH = 2.6;
const BOARD_LINE_WIDTH = 2.6;
const BOARD_MIN_WIDTH = 1;
const BOARD_MAX_WIDTH = 12;
const BOARD_WIDTH_STEP = 0.5;
const BOARD_ERASER_RADIUS = 8;
const BOARD_IMAGE_MIN_SIZE = 40;
const BOARD_IMAGE_MAX_SIZE = 2800;
const BOARD_IMAGE_SCALE_STEP = 0.12;
const BOARD_EXPORT_PADDING = 24;
const BOARD_EXPORT_MAX_SIZE = 6000;
const BOARD_SELECTION_HIT_RADIUS = 6;
const BOARD_MIN_ZOOM = 0.25;
const BOARD_MAX_ZOOM = 2.5;
const BOARD_POINT_MIN_DISTANCE = 1.5;
const BOARD_PRESSURE_MIN_RATIO = 0.6;
const BOARD_LOW_BANDWIDTH_CURSOR_MS = 130;
const BOARD_LOW_BANDWIDTH_PREVIEW_MS = 130;
const BOARD_LOW_BANDWIDTH_POINT_STEP = 2;
const BOARD_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const BOARD_DEFAULT_IMAGE_MAX_WIDTH = 640;
const COLLAB_TYPING_IDLE_MS = 1200;
const COLLAB_TYPING_STALE_MS = 4500;
const COLLAB_SNIPPETS = [
  {
    prefix: 'for',
    description: 'Цикл for по range',
    snippet: 'for ${1:i} in range(${2:n}):\n    ${0:pass}',
  },
  {
    prefix: 'if',
    description: 'Условный блок if',
    snippet: 'if ${1:condition}:\n    ${0:pass}',
  },
  {
    prefix: 'def',
    description: 'Шаблон функции',
    snippet: 'def ${1:solve}(${2}) -> ${3:None}:\n    ${0:pass}',
  },
  {
    prefix: 'while',
    description: 'Цикл while',
    snippet: 'while ${1:condition}:\n    ${0:pass}',
  },
];
const pickCollabColor = (seed) => {
  const text = String(seed || 'collab');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLLAB_COLORS.length;
  return COLLAB_COLORS[index];
};
const ABSOLUTE_LEAGUE_ID = 'absolute';
const ABSOLUTE_LEAGUE_MIN_XP = LEAGUE_TIERS.find((league) => league.id === ABSOLUTE_LEAGUE_ID)?.minXp ?? Number.POSITIVE_INFINITY;
const isLeagueAboveAbsolute = (leagueId) => {
  const tier = LEAGUE_TIERS.find((league) => league.id === leagueId);
  return Boolean(tier) && tier.minXp > ABSOLUTE_LEAGUE_MIN_XP;
};
const isAbsoluteOrAboveLeague = (leagueId) => leagueId === ABSOLUTE_LEAGUE_ID || isLeagueAboveAbsolute(leagueId);
const LEVEL_UP_PARTICLE_COUNT = 24;
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
const MOCK_TASK_NUMBERS = Array.from({ length: 27 }, (_, i) => i + 1);
const PRIMARY_TO_SECONDARY = {
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
const LEGACY_MOCK_EXAM_ACCESS = { all: true, students: [] };

const normalizeMockExamAccess = (access, fallback = LEGACY_MOCK_EXAM_ACCESS) => {
  if (!access || typeof access !== 'object') {
    return { ...fallback };
  }
  const students = Array.isArray(access.students)
    ? access.students.map((id) => String(id)).filter(Boolean)
    : [];
  return {
    all: Boolean(access.all),
    students
  };
};

const isMockExamAccessible = (exam, studentId) => {
  if (!exam) return false;
  const access = normalizeMockExamAccess(exam.access, LEGACY_MOCK_EXAM_ACCESS);
  if (access.all) return true;
  if (!studentId) return false;
  return access.students.includes(String(studentId));
};

const applyTaskTitles = (tasks, overrides = {}) => {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task) => {
    const key = String(task.number ?? task.id ?? '');
    const override = overrides?.[key];
    if (typeof override === 'string' && override.trim()) {
      return { ...task, title: override };
    }
    return task;
  });
};

const normalizeTaskNumber = (value) => {
  if (value === '' || value === null || typeof value === 'undefined') return NaN;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return NaN;
  if (num === 20 || num === 21) return GAME_THEORY_TASK;
  return num;
};

const getTaskXpReward = (taskNumber) => {
  const normalizedTask = normalizeTaskNumber(taskNumber);
  if (!Number.isFinite(normalizedTask) || normalizedTask < 1 || normalizedTask > 27) return 0;
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

const getLeagueByXp = (value) => {
  const xpTotal = normalizeXpTotal(value);
  const foundLeague = LEAGUE_TIERS.find((league) => xpTotal >= league.minXp);
  return foundLeague || BLANK_LEAGUE;
};

const TOP_PLACE_NUMBER_DECOR = [
  {
    textClass: 'text-[1.5rem] tracking-[-0.01em]',
    color: '#fff7d1',
    outline: '#3f2307',
    glowPrimary: 'rgba(250, 204, 21, 0.92)',
    glowSecondary: 'rgba(245, 158, 11, 0.82)',
  },
  {
    textClass: 'text-xl tracking-[-0.005em]',
    color: '#f8fafc',
    outline: '#1f2937',
    glowPrimary: 'rgba(148, 163, 184, 0.9)',
    glowSecondary: 'rgba(100, 116, 139, 0.78)',
  },
  {
    textClass: 'text-lg',
    color: '#ffe6cc',
    outline: '#4a2b13',
    glowPrimary: 'rgba(194, 120, 65, 0.88)',
    glowSecondary: 'rgba(146, 92, 53, 0.76)',
  }
];

const getTopPlaceNumberStyle = (decor) => {
  const outline = decor?.outline || '#111827';
  const glowPrimary = decor?.glowPrimary || 'rgba(168, 85, 247, 0.72)';
  const glowSecondary = decor?.glowSecondary || 'rgba(126, 34, 206, 0.6)';
  return {
    color: decor?.color || '#ffffff',
    textShadow: [
      `-1px -1px 0 ${outline}`,
      `1px -1px 0 ${outline}`,
      `-1px 1px 0 ${outline}`,
      `1px 1px 0 ${outline}`,
      `0 -1px 0 ${outline}`,
      `0 1px 0 ${outline}`,
      `-1px 0 0 ${outline}`,
      `1px 0 0 ${outline}`,
      '0 0 4px rgba(255,255,255,0.95)',
      `0 0 9px ${glowPrimary}`,
      `0 0 14px ${glowSecondary}`,
      '0 1px 2px rgba(15,23,42,0.8)',
    ].join(', ')
  };
};

const LEAGUE_AURA_DECOR = {
  celestial: {
    core: 'rgba(191, 219, 254, 0.8)',
    middle: 'rgba(59, 130, 246, 0.58)',
    edge: 'rgba(196, 181, 253, 0.36)',
    opacity: 1,
    scale: 1.25,
    boxShadow: '0 0 9px rgba(147, 197, 253, 0.44), 0 0 15px rgba(59, 130, 246, 0.34), 0 0 24px rgba(167, 139, 250, 0.26)',
  },
  absolute: {
    core: 'rgba(255, 74, 74, 0.66)',
    middle: 'rgba(251, 146, 60, 0.5)',
    edge: 'rgba(255, 225, 120, 0.28)',
    opacity: 0.84,
    scale: 1.14,
    boxShadow: '0 0 8px rgba(255, 92, 92, 0.34), 0 0 14px rgba(251, 146, 60, 0.28), 0 0 20px rgba(250, 204, 21, 0.2)',
  },
  ruby: {
    core: 'rgba(239, 68, 68, 0.74)',
    middle: 'rgba(220, 38, 38, 0.58)',
    edge: 'rgba(248, 113, 113, 0.32)',
    opacity: 1,
    scale: 1.22,
  },
  diamond: {
    core: 'rgba(56, 189, 248, 0.7)',
    middle: 'rgba(14, 165, 233, 0.54)',
    edge: 'rgba(125, 211, 252, 0.3)',
    opacity: 0.98,
    scale: 1.2,
  },
  gold: {
    core: 'rgba(251, 191, 36, 0.72)',
    middle: 'rgba(245, 158, 11, 0.56)',
    edge: 'rgba(253, 224, 71, 0.28)',
    opacity: 0.96,
    scale: 1.18,
  },
  silver: {
    core: 'rgba(226, 232, 240, 0.72)',
    middle: 'rgba(148, 163, 184, 0.56)',
    edge: 'rgba(226, 232, 240, 0.3)',
    opacity: 0.95,
    scale: 1.16,
  },
  bronze: {
    core: 'rgba(217, 119, 6, 0.68)',
    middle: 'rgba(180, 83, 9, 0.52)',
    edge: 'rgba(251, 191, 36, 0.25)',
    opacity: 0.88,
    scale: 1.12,
  },
  blank: {
    core: 'rgba(148, 163, 184, 0.22)',
    middle: 'rgba(148, 163, 184, 0.12)',
    edge: 'rgba(226, 232, 240, 0.06)',
    opacity: 0.5,
    scale: 0.94,
  }
};

const getLeagueAuraStyle = (leagueId) => {
  const decor = LEAGUE_AURA_DECOR[leagueId] || LEAGUE_AURA_DECOR.blank;
  return {
    background: `radial-gradient(circle, ${decor.core} 0%, ${decor.middle} 56%, ${decor.edge} 78%, rgba(255,255,255,0) 100%)`,
    opacity: decor.opacity,
    transform: `scale(${decor.scale})`,
    boxShadow: decor.boxShadow || 'none',
  };
};

const ABSOLUTE_AURA_CROWN_STYLE = {
  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(254,215,170,0.34) 24%, rgba(253,186,116,0.22) 42%, rgba(251,113,133,0.14) 62%, rgba(255,255,255,0) 82%)',
  opacity: 0.48,
  transform: 'scale(1.2)',
  boxShadow: '0 0 8px rgba(255, 120, 80, 0.3), 0 0 12px rgba(251, 191, 36, 0.2)',
};

const formatTaskNumber = (value) => {
  const num = normalizeTaskNumber(value);
  if (num === GAME_THEORY_TASK) return '19-21';
  if (!Number.isFinite(num)) return '';
  return String(num);
};

const getTaskDisplayNumber = (task) => task?.displayNumber ?? formatTaskNumber(task?.number ?? task?.id);
const normalizeMockExamId = (value) => String(value || '').trim();

const normalizeGoalType = (goal) => {
  const rawType = String(goal?.type || '').trim().toLowerCase();
  if (rawType === GOAL_TYPE_MOCK) return GOAL_TYPE_MOCK;
  if (!rawType && normalizeMockExamId(goal?.mockExamId)) return GOAL_TYPE_MOCK;
  return GOAL_TYPE_TASK;
};

const getMockExamTaskKeys = (exam) => {
  const tasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  return Object.keys(tasks)
    .map((taskKey) => String(taskKey || '').trim())
    .filter(Boolean)
    .sort((a, b) => {
      const aNum = Number(a);
      const bNum = Number(b);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
      return a.localeCompare(b, 'ru');
    });
};

const getMockGoalProgress = (exam, attempt) => {
  const taskKeys = getMockExamTaskKeys(exam);
  const solvedMap = attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {};
  const taskStatus = taskKeys.map((taskKey) => {
    const taskNumber = Number(taskKey);
    const label = formatTaskNumber(taskNumber);
    return {
      taskKey,
      taskNumber: Number.isFinite(taskNumber) ? taskNumber : null,
      label: label || taskKey,
      solved: Boolean(solvedMap[String(taskKey)])
    };
  });
  const solvedCount = taskStatus.filter((item) => item.solved).length;
  const totalCount = taskStatus.length;
  return {
    taskStatus,
    solvedCount,
    totalCount,
    completed: totalCount > 0 && solvedCount >= totalCount
  };
};

const stripInvisibleChars = (value) => String(value ?? '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
const stripControlChars = (value) => {
  const source = String(value ?? '');
  let result = '';
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    const isBlocked = (code >= 0 && code <= 8)
      || code === 11
      || code === 12
      || (code >= 14 && code <= 31)
      || code === 127;
    if (!isBlocked) result += source[index];
  }
  return result;
};
const stripAnsiCodes = (value) => {
  const source = String(value ?? '');
  let result = '';
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 27 && source[index + 1] === '[') {
      let cursor = index + 2;
      while (cursor < source.length && /[0-9;]/.test(source[cursor])) cursor += 1;
      if (source[cursor] === 'm') {
        index = cursor;
        continue;
      }
    }
    result += source[index];
  }
  return result;
};
const normalizeOutput = (value) => stripInvisibleChars(String(value ?? '').replace(/\r\n/g, '\n')).trimEnd();
const normalizeOutputForComparison = (value) => normalizeOutput(value).replace(/\s+/g, ' ').trim();
const normalizeRuntimeErrorForCheck = (value) => stripAnsiCodes(stripControlChars(stripInvisibleChars(String(value ?? '')))).trim();

const getLocalDayKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000));
};

const numberToDayKey = (dayNumber) => {
  if (!Number.isFinite(dayNumber)) return null;
  return new Date(dayNumber * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

const getWeekStartKey = (dayKey) => {
  const dayNum = dayKeyToNumber(dayKey);
  if (!Number.isFinite(dayNum)) return null;
  const dt = new Date(dayNum * 24 * 60 * 60 * 1000);
  const weekday = dt.getUTCDay(); // 0 = Sunday, 1 = Monday
  const mondayIndex = (weekday + 6) % 7;
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

const formatStreakDate = (dayKey) => {
  const normalized = normalizeDayKey(dayKey);
  if (!normalized) return '';
  const dt = new Date(`${normalized}T00:00:00`);
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
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
  return getLocalDayKey(parsed);
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

const isTestingSolvedEvent = (event) => {
  if (!event || typeof event !== 'object') return false;
  const taskNum = Number(event.taskNumber);
  if (!Number.isFinite(taskNum) || taskNum < 1 || taskNum > 27) return false;
  const levelId = String(event.levelId || '').trim();
  return levelId !== PYTHON_LEVEL_ID;
};

const formatPerDayRateLabel = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '0';
  if (num < 1) {
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const parseTestsFromText = (content) => {
  const normalized = String(content ?? '').replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n-{3,}\n/);
  const tests = blocks.map((block) => {
    const lines = block.split('\n');
    let section = '';
    const inputLines = [];
    const outputLines = [];
    lines.forEach((line) => {
      const trimmed = line.trim().toLowerCase();
      if (trimmed === 'input:' || trimmed === 'in:' || trimmed === 'stdin:') {
        section = 'input';
        return;
      }
      if (trimmed === 'output:' || trimmed === 'out:' || trimmed === 'stdout:') {
        section = 'output';
        return;
      }
      if (section === 'input') inputLines.push(line);
      if (section === 'output') outputLines.push(line);
    });
    const input = inputLines.join('\n').trimEnd();
    const output = outputLines.join('\n').trimEnd();
    return { input, output };
  });
  return tests.filter((test) => test.input || test.output);
};

const parseTestsFileContent = (content) => {
  const trimmed = String(content ?? '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : data?.tests;
    if (!Array.isArray(list)) return [];
    return list.map((item) => ({
      input: String(item?.input ?? '').trimEnd(),
      output: String(item?.output ?? '').trimEnd(),
    })).filter((test) => test.input || test.output);
  }
  return parseTestsFromText(content);
};

const extractIframeSrc = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.toLowerCase().includes('<iframe')) {
    const match = text.match(/src=["']([^"']+)["']/i);
    if (match) return match[1];
  }
  return text;
};

const buildGoogleDocEmbedUrl = (value) => {
  const raw = extractIframeSrc(value);
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (!url.hostname.includes('docs.google.com')) return '';
  const path = url.pathname;
  const publishedMatch = path.match(/\/document\/(?:u\/\d+\/)?d\/e\/([a-zA-Z0-9_-]+)/);
  if (publishedMatch) {
    const pubId = publishedMatch[1];
    return `https://docs.google.com/document/d/e/${pubId}/pub?embedded=true`;
  }
  const docMatch = path.match(/\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  if (!docMatch) return '';
  const docId = docMatch[1];
  return `https://docs.google.com/document/d/${docId}/preview`;
};

const isGoogleDocEmbedUrl = (value) => {
  try {
    const url = new URL(String(value ?? ''));
    if (!url.hostname.includes('docs.google.com')) return false;
    const isPub = /\/document\/(?:u\/\d+\/)?d\/(e\/)?[a-zA-Z0-9_-]+\/pub/.test(url.pathname)
      && url.searchParams.get('embedded') === 'true';
    const isPreview = /\/document\/(?:u\/\d+\/)?d\/[a-zA-Z0-9_-]+\/preview/.test(url.pathname);
    return isPub || isPreview;
  } catch {
    return false;
  }
};

const buildGoogleDocFullUrl = (value) => {
  const raw = extractIframeSrc(value);
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!url.hostname.includes('docs.google.com')) return raw;
  const path = url.pathname;
  const docMatch = path.match(/\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  if (docMatch && !path.includes('/d/e/')) {
    return `https://docs.google.com/document/d/${docMatch[1]}/edit`;
  }
  const pubE = path.match(/\/document\/(?:u\/\d+\/)?d\/e\/([a-zA-Z0-9_-]+)/);
  if (pubE) return `https://docs.google.com/document/d/e/${pubE[1]}/pub`;
  return raw;
};

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

const allowsPartialAnswers = (taskNumber) => Number(taskNumber) === 25;

const getExpectedAnswers = (question, count) => {
  if (!question) return Array.from({ length: count }, () => '');
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
  if (fromArray.length) {
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

const getPrimaryScoreFromSolved = (solvedMap) => {
  if (!solvedMap || typeof solvedMap !== 'object') return 0;
  return MOCK_TASK_NUMBERS.reduce((sum, num) => {
    if (!solvedMap[String(num)]) return sum;
    return sum + (num === 26 || num === 27 ? 2 : 1);
  }, 0);
};

const getSecondaryScoreFromPrimary = (primary) => {
  const normalized = Math.max(0, Math.min(29, Number(primary) || 0));
  if (!normalized) return 0;
  return PRIMARY_TO_SECONDARY[normalized] || 0;
};

const getStudentLabel = (student) => {
  if (!student) return '';
  const nickname = typeof student.nickname === 'string' ? student.nickname.trim() : '';
  if (nickname) return `${nickname} (${student.name})`;
  return student.name;
};

const STUDENT_TOUR_KEY = 'ege_student_onboarding_v1';

const loadStudentTourStatus = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STUDENT_TOUR_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const saveStudentTourStatus = (next) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STUDENT_TOUR_KEY, JSON.stringify(next));
  } catch { /* no-op */ }
};

const hasStudentSeenTour = (studentId) => {
  if (!studentId) return false;
  const key = String(studentId);
  const data = loadStudentTourStatus();
  return Boolean(data?.[key]);
};

const markStudentSeenTour = (studentId) => {
  if (!studentId) return;
  const key = String(studentId);
  const data = loadStudentTourStatus();
  if (data?.[key]) return;
  saveStudentTourStatus({ ...data, [key]: true });
};

const LAST_LOCATION_KEY = 'ege_last_location_v1';
const DESKTOP_NAV_COLLAPSED_KEY = 'ege_desktop_nav_collapsed_v1';
const PACE_FORECAST_SESSION_KEY_PREFIX = 'ege_pace_forecast_dismissed_v1';
const PACE_FORECAST_LAST_SHOWN_KEY_PREFIX = 'ege_pace_forecast_last_shown_v1';
const PACE_FORECAST_REMINDER_INTERVAL_MS = 48 * 60 * 60 * 1000;

const buildUserLocationKey = (user) => {
  if (!user) return '';
  const role = user.role || 'user';
  const id = typeof user.id !== 'undefined' && user.id !== null ? String(user.id) : 'unknown';
  return `${role}:${id}`;
};

const loadLastLocationStore = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const saveLastLocationStore = (store) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(store));
  } catch { /* no-op */ }
};

const readUserLocation = (user) => {
  const key = buildUserLocationKey(user);
  if (!key) return {};
  const store = loadLastLocationStore();
  const entry = store?.[key];
  return entry && typeof entry === 'object' ? entry : {};
};

const updateUserLocation = (user, patch) => {
  const key = buildUserLocationKey(user);
  if (!key) return;
  const store = loadLastLocationStore();
  const prev = store?.[key];
  const safePrev = prev && typeof prev === 'object' ? prev : {};
  store[key] = { ...safePrev, ...patch };
  saveLastLocationStore(store);
};

const getPaceForecastSessionKey = (userId) => {
  const normalizedId = String(userId ?? '').trim();
  if (!normalizedId) return '';
  return `${PACE_FORECAST_SESSION_KEY_PREFIX}:${normalizedId}`;
};

const isPaceForecastDismissedInSession = (userId) => {
  const key = getPaceForecastSessionKey(userId);
  if (!key || typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const markPaceForecastDismissedInSession = (userId) => {
  const key = getPaceForecastSessionKey(userId);
  if (!key || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, '1');
  } catch { /* no-op */ }
};

const getPaceForecastLastShownKey = (userId) => {
  const normalizedId = String(userId ?? '').trim();
  if (!normalizedId) return '';
  return `${PACE_FORECAST_LAST_SHOWN_KEY_PREFIX}:${normalizedId}`;
};

const readPaceForecastLastShownAt = (userId) => {
  const key = getPaceForecastLastShownKey(userId);
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return ts;
  } catch {
    return null;
  }
};

const markPaceForecastShownNow = (userId) => {
  const key = getPaceForecastLastShownKey(userId);
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch { /* no-op */ }
};

const isPaceForecastReminderDue = (userId) => {
  const lastShownAt = readPaceForecastLastShownAt(userId);
  if (!Number.isFinite(lastShownAt)) return true;
  return (Date.now() - lastShownAt) >= PACE_FORECAST_REMINDER_INTERVAL_MS;
};

const normalizeStoredOpenTask = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const normalizedTaskNumber = normalizeTaskNumber(entry.taskNumber);
  if (!Number.isFinite(normalizedTaskNumber)) return null;
  const pythonTask = isPythonTaskNumber(normalizedTaskNumber);
  const section = pythonTask ? 'python' : 'progress';
  const rawIndex = Number(entry.questionIndex);
  const questionIndex = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.floor(rawIndex) : null;
  return {
    taskNumber: normalizedTaskNumber,
    levelId: pythonTask ? PYTHON_LEVEL_ID : entry.levelId,
    targetQuestions: Array.isArray(entry.targetQuestions) ? entry.targetQuestions : null,
    section,
    questionIndex
  };
};

// Заглушка списка заданий
const RAW_TASKS = Array.from({ length: 27 }, (_, i) => ({
  id: i + 1,
  number: i + 1,
  title: [
    "Анализ информационных моделей", "Таблицы истинности", "Поиск в БД", "Кодирование (Фано)", 
    "Анализ алгоритмов", "Циклы", "Изображения/Звук", "Комбинаторика", "Excel", "Word", 
    "Вычисление информации", "Исполнители", "Графы", "Системы счисления", "Алгебра логики", 
    "Рекурсия", "Последовательности", "Робот (ДП)", "Теория игр (1)", "Теория игр (2)", 
    "Теория игр (3)", "Многопроцессорные", "Динамика (Исполнитель)", "Строки", "Маски чисел", 
    "Жадные алгоритмы", "Анализ данных (Сложная)"
  ][i] || `Задание ${i + 1}`,
  topic: "Тема задания",
  mastery: 0
}));

const MOCK_TASKS = RAW_TASKS
  .filter((task) => ![20, 21].includes(task.number))
  .map((task) => {
    if (task.number === GAME_THEORY_TASK) {
      return {
        ...task,
        title: '19-21 - Теория Игр',
        displayNumber: '19-21',
      };
    }
    return task;
  });

// Начальная база вопросов
const PYTHON_TASKS = [
  { id: 101, number: 101, title: 'Ввод и вывод данных', displayNumber: '1.0' },
  { id: 102, number: 102, title: 'Переменные', displayNumber: '1.1' },
  { id: 103, number: 103, title: 'Условия', displayNumber: '2' },
  { id: 104, number: 104, title: 'Вычисления', displayNumber: '3' },
  { id: 105, number: 105, title: 'Цикл for', displayNumber: '4' },
  { id: 106, number: 106, title: 'Строки', displayNumber: '5' },
  { id: 107, number: 107, title: 'Цикл while', displayNumber: '6' },
  { id: 108, number: 108, title: 'Списки', displayNumber: '7.0' },
  { id: 109, number: 109, title: 'Кортежи', displayNumber: '7.1' },
  { id: 110, number: 110, title: 'Функции и рекурсия', displayNumber: '8' },
  { id: 111, number: 111, title: 'Двумерные массивы', displayNumber: '9' }
];

const PYTHON_TASK_MAP = new Map(PYTHON_TASKS.map((task) => [Number(task.number), task]));

const isPythonTaskNumber = (value) => PYTHON_TASK_MAP.has(Number(value));

const getPythonTaskInfo = (value) => PYTHON_TASK_MAP.get(Number(value)) || null;

const ensurePyodideReady = (() => {
  let pyodidePromise = null;
  return async () => {
    if (pyodidePromise) return pyodidePromise;
    pyodidePromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('Pyodide доступен только в браузере.'));
        return;
      }
      if (window.loadPyodide) {
        window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' })
          .then(resolve)
          .catch(reject);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
      script.async = true;
      script.onload = () => {
        if (!window.loadPyodide) {
          reject(new Error('Не удалось загрузить Pyodide.'));
          return;
        }
        window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' })
          .then(resolve)
          .catch(reject);
      };
      script.onerror = () => reject(new Error('Ошибка загрузки Pyodide.'));
      document.body.appendChild(script);
    });
    return pyodidePromise;
  };
})();

const PYODIDE_RUN_TIMEOUT_MS = 8000;
const ALLOW_MAIN_THREAD_PYTHON_FALLBACK = false;
const PYODIDE_STREAM_FLUSH_MS = 35;
const PYODIDE_STREAM_CHUNK_CHARS = 2048;
const COLLAB_RUN_OUTPUT_LIMIT = 20000;
const COLLAB_RUN_TIMEOUT_MS = 60000;
const COLLAB_DEBUG_TIMEOUT_MS = 30 * 60 * 1000;
const COLLAB_DEBUG_TRACE_LIMIT = 2500;
const COLLAB_DEBUG_AUTOPLAY_MS = 75;
const COLLAB_DEBUG_INLINE_HINT_MAX_CHARS = 90;
const COLLAB_DEBUG_INLINE_HINT_LINES_MAX = 120;

const getCollabWsUrl = () => {
  if (typeof window === 'undefined') return '';
  const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_COLLAB_WS_URL : '';
  if (envUrl) return envUrl;
  const { protocol, hostname, port, host } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  if ((import.meta?.env?.DEV || port === '5173') && port === '5173') {
    return `${wsProtocol}://${hostname}:5175/collab`;
  }
  return `${wsProtocol}://${host}/collab`;
};

const mergeRuntimeErrorText = (base, next) => {
  const baseText = typeof base === 'string' ? base : String(base ?? '');
  const nextText = typeof next === 'string' ? next : String(next ?? '');
  if (!nextText) return baseText;
  if (!baseText) return nextText;
  return `${baseText}${baseText.endsWith('\n') ? '' : '\n'}${nextText}`;
};

const normalizeDebugLocals = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item instanceof Map) {
        return {
          name: String(item.get('name') ?? ''),
          value: String(item.get('value') ?? ''),
          type: String(item.get('type') ?? ''),
        };
      }
      if (Array.isArray(item) && item.length >= 2) {
        return {
          name: String(item[0] ?? ''),
          value: String(item[1] ?? ''),
          type: '',
        };
      }
      if (item && typeof item === 'object') {
        if (Object.prototype.hasOwnProperty.call(item, 'name')) {
          return {
            name: String(item.name ?? ''),
            value: String(item.value ?? ''),
            type: String(item.type ?? ''),
          };
        }
        const entries = Object.entries(item);
        if (entries.length === 1) {
          return {
            name: String(entries[0][0] ?? ''),
            value: String(entries[0][1] ?? ''),
            type: '',
          };
        }
      }
      return { name: '', value: '', type: '' };
    }).filter((item) => item.name);
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).map(([name, localValue]) => ({
      name: String(name),
      value: String(localValue ?? ''),
      type: '',
    }));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([name, localValue]) => ({
      name: String(name),
      value: String(localValue ?? ''),
      type: '',
    }));
  }
  return [];
};

const sanitizeDebugInlineHintValue = (value) => {
  const oneLine = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!oneLine) return '';
  if (oneLine.length <= COLLAB_DEBUG_INLINE_HINT_MAX_CHARS) return oneLine;
  return `${oneLine.slice(0, Math.max(0, COLLAB_DEBUG_INLINE_HINT_MAX_CHARS - 3))}...`;
};

const buildDebugInlineHints = (sourceText, locals) => {
  const source = String(sourceText ?? '').replace(/\r\n/g, '\n');
  if (!source) return [];
  const localList = normalizeDebugLocals(locals);
  if (!localList.length) return [];
  const localsMap = new Map();
  localList.forEach((item) => {
    const name = String(item?.name ?? '').trim();
    if (!name || name === '...') return;
    localsMap.set(name, String(item?.value ?? ''));
  });
  if (!localsMap.size) return [];

  const lines = source.split('\n');
  const hints = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (hints.length >= COLLAB_DEBUG_INLINE_HINT_LINES_MAX) break;
    const line = lines[i];
    if (!line || /^\s*#/.test(line)) continue;
    const names = [];
    const assignmentMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^=].*)?$/);
    if (assignmentMatch) names.push(assignmentMatch[1]);
    const forMatch = line.match(/^\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/);
    if (forMatch) names.push(forMatch[1]);
    if (!names.length) continue;
    const parts = [];
    names.forEach((name) => {
      if (!localsMap.has(name)) return;
      const value = sanitizeDebugInlineHintValue(localsMap.get(name));
      if (!value) return;
      parts.push(`${name}: ${value}`);
    });
    if (!parts.length) continue;
    hints.push({
      lineNumber: i + 1,
      text: parts.join('   '),
    });
  }
  return hints;
};

const areNumberArraysEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Number(a[i]) !== Number(b[i])) return false;
  }
  return true;
};

const normalizeDebugBreakpoints = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((line) => Number(line))
    .filter((line) => Number.isInteger(line) && line > 0))]
    .sort((a, b) => a - b);
};

const normalizeDebugTrace = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((step) => {
    if (!step || typeof step !== 'object') {
      return { event: 'line', line: 0, func: '', locals: [] };
    }
    return {
      event: String(step.event ?? 'line'),
      line: Number(step.line) || 0,
      func: String(step.func ?? ''),
      locals: normalizeDebugLocals(step.locals),
      exception: step.exception == null ? undefined : String(step.exception),
    };
  });
};

const PY_IDLE_STDIN_HEADER = '[Ввод]';
const PY_IDLE_STDOUT_HEADER = '[Вывод]';
const PY_IDLE_STDERR_HEADER = '[Ошибки]';

const normalizeIdleConsoleText = (value) => String(value ?? '').replace(/\r\n/g, '\n');

const buildIdleConsoleText = (inputValue, outputValue, errorValue) => {
  const input = normalizeIdleConsoleText(inputValue);
  const output = normalizeIdleConsoleText(outputValue);
  const error = normalizeIdleConsoleText(errorValue);
  return [
    `${PY_IDLE_STDIN_HEADER} Введите данные для input():`,
    input,
    '',
    PY_IDLE_STDOUT_HEADER,
    output || 'Вывод пуст',
    '',
    PY_IDLE_STDERR_HEADER,
    error || 'Ошибок нет',
  ].join('\n');
};

const parseIdleConsoleInput = (consoleText, fallback = '') => {
  const text = normalizeIdleConsoleText(consoleText);
  const stdoutIndex = text.indexOf(PY_IDLE_STDOUT_HEADER);
  if (stdoutIndex < 0) return text;
  const stdinIndex = text.indexOf(PY_IDLE_STDIN_HEADER);
  let start = 0;
  if (stdinIndex >= 0) {
    const afterHeaderIndex = text.indexOf('\n', stdinIndex);
    start = afterHeaderIndex >= 0 ? afterHeaderIndex + 1 : text.length;
  }
  if (stdoutIndex < start) return typeof fallback === 'string' ? fallback : '';
  return text
    .slice(start, stdoutIndex)
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
};

const createPyodideWorker = () => {
  const workerSource = `
    let pyodidePromise = null;
    const ensurePyodide = () => {
      if (pyodidePromise) return pyodidePromise;
      pyodidePromise = new Promise((resolve, reject) => {
        try {
          importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');
        } catch (err) {
          reject(err);
          return;
        }
        if (!self.loadPyodide) {
          reject(new Error('Pyodide loader not available'));
          return;
        }
        self.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' })
          .then(resolve)
          .catch(reject);
      });
      return pyodidePromise;
    };

    const toText = (value) => (value == null ? '' : String(value));

    const createChunkEmitter = (id, type) => {
      const pushChunk = (chunk) => {
        if (!chunk) return;
        self.postMessage({ id, type, chunk });
      };
      const push = (value) => {
        const text = toText(value);
        if (!text) return;
        if (text.length <= ${PYODIDE_STREAM_CHUNK_CHARS}) {
          pushChunk(text);
          return;
        }
        for (let i = 0; i < text.length; i += ${PYODIDE_STREAM_CHUNK_CHARS}) {
          pushChunk(text.slice(i, i + ${PYODIDE_STREAM_CHUNK_CHARS}));
        }
      };
      const close = () => {};
      return { push, close };
    };

    const runPython = async (id, source, inputValue, debugMode = false) => {
      const pyodide = await ensurePyodide();
      const safeInput = toText(inputValue);
      const safeSource = toText(source);
      const useDebugMode = Boolean(debugMode);
      const stdoutEmitter = createChunkEmitter(id, 'stdout');
      const stderrEmitter = createChunkEmitter(id, 'stderr');
      let output = '';
      let error = '';
      let stdoutNeedsLineBreak = false;
      let stderrNeedsLineBreak = false;
      let debugTrace = [];
      let debugTraceTruncated = false;

      const appendStdout = (value) => {
        let safe = toText(value);
        if (!safe) return;
        if (stdoutNeedsLineBreak && !safe.startsWith('\\n') && !safe.startsWith('\\r')) {
          safe = '\\n' + safe;
        }
        stdoutNeedsLineBreak = !safe.endsWith('\\n') && !safe.endsWith('\\r');
        output += safe;
        stdoutEmitter.push(safe);
      };

      const appendStderr = (value) => {
        let safe = toText(value);
        if (!safe) return;
        if (stderrNeedsLineBreak && !safe.startsWith('\\n') && !safe.startsWith('\\r')) {
          safe = '\\n' + safe;
        }
        stderrNeedsLineBreak = !safe.endsWith('\\n') && !safe.endsWith('\\r');
        error += safe;
        stderrEmitter.push(safe);
      };

      if (typeof pyodide.setStdout === 'function') {
        pyodide.setStdout({
          batched: (text) => {
            appendStdout(text);
          }
        });
      }
      if (typeof pyodide.setStderr === 'function') {
        pyodide.setStderr({
          batched: (text) => {
            appendStderr(text);
          }
        });
      }

      const wrapped = [
        'import sys, io, traceback, builtins, json',
        'def _debug_safe_repr(_value, _max_len=220):',
        '    try:',
        '        _text = repr(_value)',
        '    except Exception:',
        '        return "<unreprable>"',
        '    if len(_text) > _max_len:',
        '        return _text[:_max_len] + "..."',
        '    return _text',
        'try:',
        '    sys.stdout.reconfigure(line_buffering=True)',
        '    sys.stderr.reconfigure(line_buffering=True)',
        'except Exception:',
        '    pass',
        'if not hasattr(builtins, "__collab_print_original"):',
        '    builtins.__collab_print_original = builtins.print',
        'def _collab_print(*args, **kwargs):',
        '    kwargs.setdefault("flush", True)',
        '    return builtins.__collab_print_original(*args, **kwargs)',
        'builtins.print = _collab_print',
        '_input = ' + JSON.stringify(safeInput),
        '_debug_mode = ' + (useDebugMode ? 'True' : 'False'),
        '_source_text = ' + JSON.stringify(safeSource),
        '_source_lines = _source_text.splitlines()',
        '_debug_events = []',
        '_debug_trace_limit = ${COLLAB_DEBUG_TRACE_LIMIT}',
        '_debug_trace_truncated = False',
        'def _debug_capture_locals(_scope):',
        '    _result = []',
        '    for _idx, (_name, _value) in enumerate(_scope.items()):',
        '        if _idx >= 50:',
        '            _result.append({"name": "...", "value": "...", "type": ""})',
        '            break',
        '        _result.append({',
        '            "name": str(_name),',
        '            "value": _debug_safe_repr(_value),',
        '            "type": type(_value).__name__,',
        '        })',
        '    return _result',
        'def _debug_trace(_frame, _event, _arg):',
        '    global _debug_trace_truncated',
        '    if not _debug_mode:',
        '        return _debug_trace',
        '    if _frame.f_code.co_filename != "<collab>":',
        '        return _debug_trace',
        '    if _event not in ("line", "return", "exception"):',
        '        return _debug_trace',
        '    if len(_debug_events) >= _debug_trace_limit:',
        '        _debug_trace_truncated = True',
        '        return _debug_trace',
        '    _entry = {',
        '        "event": _event,',
        '        "line": int(getattr(_frame, "f_lineno", 0) or 0),',
        '        "func": _frame.f_code.co_name,',
        '        "locals": _debug_capture_locals(_frame.f_locals),',
        '    }',
        '    if _event == "exception" and _arg:',
        '        try:',
        '            _entry["exception"] = f"{_arg[0].__name__}: {_arg[1]}"',
        '        except Exception:',
        '            _entry["exception"] = "Exception"',
        '    _debug_events.append(_entry)',
        '    return _debug_trace',
        'sys.stdin = io.StringIO(_input)',
        '_globals = {}',
        'try:',
        '    if _debug_mode:',
        '        sys.settrace(_debug_trace)',
        '    _compiled = compile(_source_text, "<collab>", "exec")',
        '    exec(_compiled, _globals, _globals)',
        'except Exception:',
        '    traceback.print_exc()',
        '    if _debug_mode:',
        '        _exc_type, _exc_value, _tb = sys.exc_info()',
        '        if _tb is not None:',
        '            while _tb.tb_next is not None:',
        '                _tb = _tb.tb_next',
        '            _line_no = int(getattr(_tb, "tb_lineno", 0) or 0)',
        '            if _line_no > 0:',
        '                print(f"\\\\n[DEBUG] Ошибка на строке: {_line_no}")',
        '                if _line_no <= len(_source_lines):',
        '                    print(f"[DEBUG] Код: {_source_lines[_line_no - 1]}")',
        '            _locals_items = list(getattr(_tb.tb_frame, "f_locals", {}).items())',
        '            if _locals_items:',
        '                print("[DEBUG] Локальные переменные:")',
        '                for _idx, (_name, _value) in enumerate(_locals_items):',
        '                    if _idx >= 50:',
        '                        print("  ...")',
        '                        break',
        '                    try:',
        '                        print(f"  {_name} = {repr(_value)}")',
        '                    except Exception:',
        '                        print(f"  {_name} = <unreprable>")',
        'finally:',
        '    sys.settrace(None)',
        '    builtins.print = builtins.__collab_print_original',
        '__collab_debug_events = _debug_events if _debug_mode else []',
        '__collab_debug_events_json = json.dumps(__collab_debug_events, ensure_ascii=False)',
        '__collab_debug_truncated = bool(_debug_trace_truncated)',
      ].join('\\n');
      try {
        await pyodide.runPythonAsync(wrapped);
        if (useDebugMode) {
          let parsedFromJson = false;
          try {
            const traceJsonValue = pyodide.globals.get('__collab_debug_events_json');
            const traceJsonText = traceJsonValue && typeof traceJsonValue.toJs === 'function'
              ? traceJsonValue.toJs()
              : traceJsonValue;
            traceJsonValue?.destroy?.();
            const parsed = typeof traceJsonText === 'string' ? JSON.parse(traceJsonText) : [];
            if (Array.isArray(parsed)) {
              debugTrace = parsed;
              parsedFromJson = true;
            }
          } catch { /* no-op */ }
          try {
            if (!parsedFromJson) {
              const traceValue = pyodide.globals.get('__collab_debug_events');
              if (traceValue) {
                debugTrace = typeof traceValue.toJs === 'function'
                  ? traceValue.toJs({ dict_converter: Object.fromEntries })
                  : traceValue;
                traceValue.destroy?.();
              }
            }
          } catch { /* no-op */ }
          try {
            const truncatedValue = pyodide.globals.get('__collab_debug_truncated');
            debugTraceTruncated = Boolean(
              truncatedValue && typeof truncatedValue.toJs === 'function'
                ? truncatedValue.toJs()
                : truncatedValue
            );
            truncatedValue?.destroy?.();
          } catch { /* no-op */ }
        }
      } finally {
        try {
          pyodide.globals.delete('__collab_debug_events');
          pyodide.globals.delete('__collab_debug_events_json');
          pyodide.globals.delete('__collab_debug_truncated');
        } catch { /* no-op */ }
        stdoutEmitter.close();
        stderrEmitter.close();
      }
      return {
        output,
        error,
        debug: useDebugMode
          ? {
            trace: Array.isArray(debugTrace) ? debugTrace : [],
            truncated: Boolean(debugTraceTruncated),
          }
          : null,
      };
    };

    self.onmessage = async (event) => {
      const data = event.data || {};
      const id = data.id;
      if (!id) return;
      try {
        const result = await runPython(id, data.source, data.input, data.debug);
        if (result?.debug) {
          self.postMessage({
            id,
            type: 'debug-trace',
            trace: Array.isArray(result.debug.trace) ? result.debug.trace : [],
            truncated: Boolean(result.debug.truncated),
          });
        }
        self.postMessage({ id, type: 'result', output: result.output, error: result.error });
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        self.postMessage({ id, type: 'result', output: '', error: message });
      }
    };
  `;

  const blob = new Blob([workerSource], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
};

const INITIAL_TEST_DB = {
  1: {
    basic: [
      { id: 1, question: "Базовый вопрос №1 для задания 1: Найдите длину пути А-Д.", options: ["10", "12", "14", "15"], correctIndex: 1 },
      { id: 2, question: "Базовый вопрос №2 для задания 1: Сколько путей из А в Г?", options: ["3", "4", "5", "6"], correctIndex: 2 }
    ],
    advanced: [],
    expert: []
  }
};


/**
 * API SERVICE
 */
const sanitizeAuthUserPayload = (value) => {
  if (!value || typeof value !== 'object') return null;
  const role = typeof value.role === 'string' ? value.role.trim() : '';
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name : '';
  if (!role || !id || !name) return null;
  const safe = { role, id, name };
  if (role === 'student') {
    const teacherId = value.teacherId;
    safe.teacherId = teacherId ? String(teacherId) : null;
  }
  return safe;
};

const MAX_TASK_BYTES = 200 * 1024 * 1024;
const HOMEWORK_POPUP_BG = '/homework-quest.png';

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '0 МБ';
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

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

const getEntrySizeBytes = (entry) => {
  if (!entry) return 0;
  if (Number.isFinite(entry.sizeBytes)) return entry.sizeBytes;
  return parseSizeString(entry.size);
};

const withStudentId = (url, studentId) => {
  if (!url) return url;
  let nextUrl = url;
  if (studentId && !/[?&]studentId=/.test(nextUrl)) {
    const separator = nextUrl.includes('?') ? '&' : '?';
    nextUrl = `${nextUrl}${separator}studentId=${encodeURIComponent(studentId)}`;
  }
  return nextUrl;
};

const withUploadsAuthToken = (url) => {
  return String(url || '');
};

const highlightPython = (code) => Prism.highlight(code, Prism.languages.python, 'python');

const MASCOT_IMAGES = {
  greetings: mascotGreetings,
  peeking: mascotPeeking,
  pondering: mascotPondering,
  disapproval: mascotDisapproval,
  approval: mascotApproval
};

const STUDENT_TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Добро пожаловать!',
    text: 'Покажу основные разделы и где искать материалы.',
    emotion: 'greetings',
    target: '[data-tour="main"]',
    menu: 'close'
  },
  {
    id: 'nav',
    title: 'Навигация',
    text: 'На телефоне разделы переключаются внизу, на компьютере — в меню слева.',
    emotion: 'peeking',
    target: '[data-tour="nav"]',
    menu: 'close'
  },
  {
    id: 'schedule',
    title: 'Расписание',
    text: 'Здесь домашка и ссылки к следующему занятию.',
    emotion: 'approval',
    target: '[data-tour="schedule"]',
    view: 'schedule',
    menu: 'close'
  },
  {
    id: 'progress',
    title: 'Успеваемость',
    text: 'Следи за прогрессом по заданиям и пробным.',
    emotion: 'pondering',
    target: '[data-tour="progress"]',
    view: 'progress',
    menu: 'close'
  },
  {
    id: 'notes',
    title: 'Конспекты',
    text: 'Здесь материалы по заданиям и твои файлы.',
    emotion: 'peeking',
    target: '[data-tour="notes"]',
    view: 'notes',
    menu: 'close'
  },
  {
    id: 'files',
    title: 'Конспекты',
    text: 'Выбери задание и категорию, затем загружай файлы сюда.',
    emotion: 'approval',
    target: '[data-tour="files"]',
    fallback: '[data-tour="notes"]',
    view: 'notes',
    menu: 'close'
  },
  {
    id: 'done',
    title: 'Готово',
    text: 'Если потеряешься — просто открой нужный раздел слева.',
    emotion: 'approval',
    menu: 'close'
  }
];

/**
 * TEACHER PANEL COMPONENT
 */
const CollabSection = ({
  role,
  userId,
  userName,
  teacherId,
  tasks,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
}) => {
  const isTeacher = role === 'teacher';
  const [status, setStatus] = useState('disconnected');
  const [peerCount, setPeerCount] = useState(0);
  const [editorReady, setEditorReady] = useState(false);
  const [editorMountVersion, setEditorMountVersion] = useState(0);
  const editorRef = useRef(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const taskOptions = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const [saveTaskNumber, setSaveTaskNumber] = useState(() => String(taskOptions[0]?.number || ''));
  const [saveCategory, setSaveCategory] = useState('class');
  const [saveFolderId, setSaveFolderId] = useState('');
  const [saveFileName, setSaveFileName] = useState('');
  const [folders, setFolders] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveNameError, setSaveNameError] = useState(false);
  const [runInput, setRunInput] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [runError, setRunError] = useState('');
  const [runStatus, setRunStatus] = useState('idle');
  const [runAuthor, setRunAuthor] = useState('');
  const [runTimestamp, setRunTimestamp] = useState(null);
  const [lastRunInput, setLastRunInput] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const [debugActive, setDebugActive] = useState(false);
  const [debugTrace, setDebugTrace] = useState([]);
  const [debugStepIndex, setDebugStepIndex] = useState(-1);
  const [debugTraceTruncated, setDebugTraceTruncated] = useState(false);
  const [debugBreakpoints, setDebugBreakpoints] = useState([]);
  const [debugPlaying, setDebugPlaying] = useState(false);
  const [debugSourceSnapshot, setDebugSourceSnapshot] = useState('');
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [isCollabFullscreen, setIsCollabFullscreen] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [splitLeftWidth, setSplitLeftWidth] = useState(68);

  const isMobileViewport = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 767px)').matches
    : false;
  const effectiveStudentId = isTeacher ? activeStudentId : userId;
  const roomId = effectiveStudentId && teacherId ? `collab-${teacherId}-${effectiveStudentId}` : null;
  const wsUrl = useMemo(() => getCollabWsUrl(), []);
  const localName = userName || (isTeacher ? 'Учитель' : 'Ученик');
  const localColor = useMemo(
    () => pickCollabColor(isTeacher ? `teacher-${teacherId}` : `student-${userId}`),
    [isTeacher, teacherId, userId]
  );
  const fontSizeStorageKey = useMemo(() => `collab-font-size-${userId || role || 'anon'}`, [userId, role]);
  const splitWidthStorageKey = useMemo(() => `collab-split-width-${userId || role || 'anon'}`, [userId, role]);
  const collabRootRef = useRef(null);
  const splitLayoutRef = useRef(null);
  const splitDragCleanupRef = useRef(null);
  const collabDocRef = useRef(null);
  const runMapRef = useRef(null);
  const collabAwarenessRef = useRef(null);
  const runWorkerRef = useRef(null);
  const runPendingRef = useRef(new Map());
  const runSessionRef = useRef(0);
  const publishRunStateRef = useRef(null);
  const monacoRef = useRef(null);
  const runStreamTimerRef = useRef(null);
  const runStreamPendingRef = useRef(null);
  const runInputRef = useRef(runInput);
  const runOutputRef = useRef(runOutput);
  const runErrorRef = useRef(runError);
  const runStatusRef = useRef(runStatus);
  const debugTraceRef = useRef([]);
  const debugStepIndexRef = useRef(-1);
  const debugBreakpointsRef = useRef([]);
  const debugPlaybackTimerRef = useRef(null);
  const debugDecorationsRef = useRef([]);
  const debugInlineHintDecorationsRef = useRef([]);
  const debugInlayProviderRef = useRef(null);
  const debugBreakpointDecorationsRef = useRef([]);
  const debugGutterDisposableRef = useRef(null);
  const suppressBreakpointSyncRef = useRef(false);
  const typingIdleTimerRef = useRef(null);
  const collabSnippetProviderRef = useRef(null);
  const selectedStudent = useMemo(
    () => (students || []).find((student) => student.id === activeStudentId),
    [students, activeStudentId]
  );
  const editorOptions = useMemo(() => ({
    minimap: { enabled: false },
    fontSize: editorFontSize,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'on',
    scrollbar: {
      verticalScrollbarSize: isCollabFullscreen ? 8 : 10,
      horizontalScrollbarSize: isCollabFullscreen ? 6 : 8,
    },
    mouseWheelZoom: true,
    quickSuggestions: { other: true, comments: false, strings: true },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    snippetSuggestions: 'inline',
    tabCompletion: 'on',
    suggest: { preview: true, showSnippets: true },
    inlineSuggest: { enabled: true },
    inlayHints: { enabled: 'on' },
    glyphMargin: true,
    readOnly: !roomId,
  }), [roomId, editorFontSize, isCollabFullscreen]);
  const isDesktopCollabCompact = !isMobileViewport && !isCollabFullscreen;
  const compactCollabHeight = 'calc((var(--app-vh, 1vh) * 100) - 10.5rem)';
  const editorHeight = isCollabFullscreen
    ? (isMobileViewport ? '60vh' : '82vh')
    : (isMobileViewport ? '50vh' : (isDesktopCollabCompact ? '100%' : '65vh'));
  const clampFontSize = (value) => Math.min(24, Math.max(12, Math.round(value)));
  const collabShellClass = isCollabFullscreen
    ? 'animate-fadeIn min-h-screen w-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.22),_rgba(15,23,42,0.85)_55%,_rgba(3,7,18,1)_100%)] text-slate-100 px-2 pt-2 pb-1 sm:px-3 sm:pt-3 sm:pb-1.5 md:px-4 md:pt-4 md:pb-2 overflow-auto'
    : (isDesktopCollabCompact
      ? 'animate-fadeIn md:flex md:min-h-0 md:flex-col md:overflow-hidden'
      : 'animate-fadeIn pb-10');
  const collabShellStyle = isDesktopCollabCompact
    ? { height: compactCollabHeight, maxHeight: compactCollabHeight }
    : undefined;
  const collabCardClass = isCollabFullscreen
    ? 'p-2.5 sm:p-3 md:p-3.5 border border-slate-800/80 bg-slate-950/70 shadow-[0_0_40px_rgba(124,58,237,0.18)]'
    : (isDesktopCollabCompact
      ? 'p-3 md:p-4 flex min-h-0 flex-1 flex-col overflow-hidden'
      : 'p-4 md:p-6');
  const collabTitleClass = isCollabFullscreen ? 'text-slate-100' : 'text-gray-900';
  const collabSubtitleClass = isCollabFullscreen ? 'text-slate-300' : 'text-gray-500';
  const collabLabelClass = isCollabFullscreen ? 'text-violet-300' : 'text-purple-600';
  const collabSessionTextClass = isCollabFullscreen ? 'text-slate-100' : 'text-gray-800';
  const collabHintClass = isCollabFullscreen ? 'text-slate-400' : 'text-gray-400';
  const collabToolbarClass = isCollabFullscreen
    ? 'border-slate-200/80 bg-white/85'
    : 'border-purple-100 bg-purple-50/70';
  const collabToolbarDividerClass = isCollabFullscreen ? 'bg-slate-300' : 'bg-purple-200';
  const collabSessionLabelClass = isCollabFullscreen ? 'text-violet-700' : collabLabelClass;
  const collabSessionValueClass = isCollabFullscreen ? 'text-slate-800' : collabSessionTextClass;
  const collabIconButtonBase = `inline-flex ${isCollabFullscreen || isDesktopCollabCompact ? 'h-7 w-7' : 'h-8 w-8'} items-center justify-center rounded-xl border transition`;
  const collabIconButtonDisabled = 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed';
  const collabIconButtonNeutral = 'border-gray-200 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700';
  const collabIconButtonPrimary = 'border-purple-500 bg-purple-600 text-white shadow-sm shadow-purple-200/70 hover:bg-purple-700';
  const collabIconButtonAccent = 'border-purple-200 bg-white text-purple-700 hover:border-purple-300 hover:bg-purple-50';
  const collabIconButtonDanger = 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100';

  const stopDebugPlayback = useCallback(() => {
    if (debugPlaybackTimerRef.current) {
      clearInterval(debugPlaybackTimerRef.current);
      debugPlaybackTimerRef.current = null;
    }
    setDebugPlaying(false);
  }, []);

  const applyBreakpointDecorations = useCallback((lines = debugBreakpointsRef.current) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor) return;
    const model = editor.getModel?.();
    if (!model || !monaco?.Range) return;
    const validLines = [...new Set((Array.isArray(lines) ? lines : [])
      .map((line) => Number(line))
      .filter((line) => Number.isInteger(line) && line > 0 && line <= model.getLineCount()))]
      .sort((a, b) => a - b);
    const decorations = validLines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'collab-debug-breakpoint-glyph',
        glyphMarginHoverMessage: [{ value: `Точка останова: строка ${line}` }],
      },
    }));
    debugBreakpointDecorationsRef.current = editor.deltaDecorations(
      debugBreakpointDecorationsRef.current,
      decorations
    );
  }, []);

  const applyDebugDecoration = useCallback((lineNumber) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco?.Range) return;
    const model = editor.getModel?.();
    if (!model) return;
    if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
      debugDecorationsRef.current = editor.deltaDecorations(debugDecorationsRef.current, []);
      return;
    }
    const safeLine = Math.max(1, Math.min(lineNumber, model.getLineCount()));
    debugDecorationsRef.current = editor.deltaDecorations(debugDecorationsRef.current, [{
      range: new monaco.Range(safeLine, 1, safeLine, 1),
      options: {
        isWholeLine: true,
        className: 'collab-debug-active-line',
        glyphMarginClassName: 'collab-debug-active-glyph',
        glyphMarginHoverMessage: [{ value: `Текущая строка: ${safeLine}` }],
      },
    }]);
    editor.revealLineInCenterIfOutsideViewport?.(safeLine);
  }, []);

  const applyDebugInlineHints = useCallback((hints = []) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor) return;
    const model = editor.getModel?.();
    if (!model || !monaco?.Range) {
      debugInlineHintDecorationsRef.current = editor.deltaDecorations(debugInlineHintDecorationsRef.current, []);
      return;
    }
    const decorations = (Array.isArray(hints) ? hints : []).map((hint) => {
      const lineNumber = Number(hint?.lineNumber);
      if (!Number.isInteger(lineNumber) || lineNumber <= 0 || lineNumber > model.getLineCount()) return null;
      const text = String(hint?.text ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return null;
      const column = model.getLineMaxColumn(lineNumber);
      return {
        range: new monaco.Range(lineNumber, column, lineNumber, column),
        options: {
          after: {
            content: `   ${text}`,
            inlineClassName: 'collab-debug-inline-hint',
          },
        },
      };
    }).filter(Boolean);
    debugInlineHintDecorationsRef.current = editor.deltaDecorations(
      debugInlineHintDecorationsRef.current,
      decorations
    );
  }, []);

  const applyDebugInlayHints = useCallback((hints = []) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel?.();
    debugInlayProviderRef.current?.dispose?.();
    debugInlayProviderRef.current = null;
    if (!editor || !model || !monaco?.languages) return;

    const normalized = (Array.isArray(hints) ? hints : [])
      .map((hint) => {
        const lineNumber = Number(hint?.lineNumber);
        const text = String(hint?.text ?? '').replace(/\s+/g, ' ').trim();
        if (!Number.isInteger(lineNumber) || lineNumber <= 0 || lineNumber > model.getLineCount() || !text) return null;
        return { lineNumber, text };
      })
      .filter(Boolean);

    if (!normalized.length) return;
    const modelUri = model.uri?.toString?.() || '';
    debugInlayProviderRef.current = monaco.languages.registerInlayHintsProvider('python', {
      provideInlayHints: (targetModel, range) => {
        const targetUri = targetModel?.uri?.toString?.() || '';
        if (!targetModel || targetUri !== modelUri) {
          return { hints: [], dispose: () => {} };
        }
        const hintsInRange = normalized
          .filter((hint) => hint.lineNumber >= range.startLineNumber && hint.lineNumber <= range.endLineNumber)
          .map((hint) => ({
            kind: monaco.languages.InlayHintKind.Parameter,
            position: {
              lineNumber: hint.lineNumber,
              column: targetModel.getLineMaxColumn(hint.lineNumber),
            },
            label: ` ${hint.text}`,
            paddingLeft: true,
            paddingRight: false,
            tooltip: 'Значение переменной в текущем шаге дебага',
          }));
        return { hints: hintsInRange, dispose: () => {} };
      },
    });
    editor.layout?.();
  }, []);

  const setDebugStep = useCallback((nextIndex) => {
    const trace = debugTraceRef.current;
    if (!Array.isArray(trace) || trace.length === 0) {
      debugStepIndexRef.current = -1;
      setDebugStepIndex(-1);
      applyDebugDecoration(0);
      return;
    }
    const clamped = Math.max(0, Math.min(nextIndex, trace.length - 1));
    debugStepIndexRef.current = clamped;
    setDebugStepIndex(clamped);
    const step = trace[clamped] || null;
    const lineNumber = Number(step?.line) || 0;
    applyDebugDecoration(lineNumber);
  }, [applyDebugDecoration]);

  const findContinueTargetIndex = useCallback((fromIndex) => {
    const trace = debugTraceRef.current;
    if (!Array.isArray(trace) || trace.length === 0) return -1;
    const start = Math.max(-1, Number(fromIndex));
    const breakpoints = debugBreakpointsRef.current || [];
    if (!breakpoints.length) return trace.length - 1;
    const bpSet = new Set(breakpoints);
    for (let idx = start + 1; idx < trace.length; idx += 1) {
      const lineNumber = Number(trace[idx]?.line) || 0;
      if (bpSet.has(lineNumber)) return idx;
    }
    return trace.length - 1;
  }, []);

  const clearDebugSession = useCallback((clearBreakpoints = false) => {
    stopDebugPlayback();
    setDebugActive(false);
    setDebugTrace([]);
    setDebugTraceTruncated(false);
    setDebugSourceSnapshot('');
    debugTraceRef.current = [];
    setDebugStep(-1);
    applyDebugInlineHints([]);
    applyDebugInlayHints([]);
    if (clearBreakpoints) {
      debugBreakpointsRef.current = [];
      setDebugBreakpoints([]);
      applyBreakpointDecorations([]);
    } else {
      applyBreakpointDecorations(debugBreakpointsRef.current);
    }
  }, [applyBreakpointDecorations, applyDebugInlineHints, applyDebugInlayHints, setDebugStep, stopDebugPlayback]);

  const handleDebugStepBack = useCallback(() => {
    if (!debugActive) return;
    stopDebugPlayback();
    const trace = debugTraceRef.current;
    if (!Array.isArray(trace) || !trace.length) return;
    const current = Number(debugStepIndexRef.current) || 0;
    const nextIndex = Math.max(0, Math.min(current - 1, trace.length - 1));
    setDebugStep(nextIndex);
    publishRunStateRef.current?.({
      debugActive: true,
      debugStepIndex: nextIndex,
      debugPlaying: false,
    });
  }, [debugActive, setDebugStep, stopDebugPlayback]);

  const handleDebugStepForward = useCallback(() => {
    if (!debugActive) return;
    stopDebugPlayback();
    const trace = debugTraceRef.current;
    if (!Array.isArray(trace) || !trace.length) return;
    const current = Number(debugStepIndexRef.current) || 0;
    const nextIndex = Math.max(0, Math.min(current + 1, trace.length - 1));
    setDebugStep(nextIndex);
    publishRunStateRef.current?.({
      debugActive: true,
      debugStepIndex: nextIndex,
      debugPlaying: false,
    });
  }, [debugActive, setDebugStep, stopDebugPlayback]);

  const handleDebugContinue = useCallback(() => {
    if (!debugActive) return;
    const trace = debugTraceRef.current;
    if (!Array.isArray(trace) || trace.length === 0) return;
    const currentIndex = debugStepIndexRef.current;
    const targetIndex = findContinueTargetIndex(currentIndex);
    if (targetIndex <= currentIndex) return;
    stopDebugPlayback();
    setDebugPlaying(true);
    publishRunStateRef.current?.({
      debugActive: true,
      debugPlaying: true,
    });
    debugPlaybackTimerRef.current = setInterval(() => {
      const idx = debugStepIndexRef.current;
      if (idx >= targetIndex) {
        stopDebugPlayback();
        publishRunStateRef.current?.({ debugPlaying: false });
        return;
      }
      const next = idx + 1;
      setDebugStep(next);
      publishRunStateRef.current?.({
        debugActive: true,
        debugStepIndex: next,
        debugPlaying: true,
      });
      if (next >= targetIndex) {
        stopDebugPlayback();
        publishRunStateRef.current?.({ debugPlaying: false });
      }
    }, COLLAB_DEBUG_AUTOPLAY_MS);
  }, [debugActive, findContinueTargetIndex, setDebugStep, stopDebugPlayback]);

  const handleStopDebug = useCallback(() => {
    clearDebugSession(false);
    publishRunStateRef.current?.({
      debugActive: false,
      debugTrace: [],
      debugTraceTruncated: false,
      debugStepIndex: -1,
      debugPlaying: false,
      debugSource: '',
    });
  }, [clearDebugSession]);

  const currentDebugStep = useMemo(() => {
    if (!debugActive) return null;
    if (!Array.isArray(debugTrace) || debugTrace.length === 0) return null;
    if (!Number.isInteger(debugStepIndex) || debugStepIndex < 0 || debugStepIndex >= debugTrace.length) return null;
    return debugTrace[debugStepIndex] || null;
  }, [debugActive, debugTrace, debugStepIndex]);
  const currentDebugLocals = useMemo(() => normalizeDebugLocals(currentDebugStep?.locals), [currentDebugStep]);
  const cumulativeDebugLocals = useMemo(() => {
    if (!debugActive) return [];
    if (!Array.isArray(debugTrace) || debugTrace.length === 0) return [];
    const lastIndex = Math.max(0, Math.min(debugStepIndex, debugTrace.length - 1));
    const byName = new Map();
    for (let i = 0; i <= lastIndex; i += 1) {
      const stepLocals = normalizeDebugLocals(debugTrace[i]?.locals);
      stepLocals.forEach((item) => {
        const name = String(item?.name ?? '').trim();
        if (!name || name === '...') return;
        byName.set(name, {
          name,
          value: String(item?.value ?? ''),
          type: String(item?.type ?? ''),
        });
      });
    }
    return Array.from(byName.values());
  }, [debugActive, debugTrace, debugStepIndex]);
  const currentDebugLineText = useMemo(() => {
    if (!currentDebugStep) return '';
    const lineNumber = Number(currentDebugStep.line) || 0;
    if (!lineNumber) return '';
    const lines = String(debugSourceSnapshot || '').replace(/\r\n/g, '\n').split('\n');
    return lines[lineNumber - 1] || '';
  }, [currentDebugStep, debugSourceSnapshot]);
  const currentDebugInlineHints = useMemo(() => {
    if (!debugActive) return [];
    const primaryHints = buildDebugInlineHints(debugSourceSnapshot, cumulativeDebugLocals);
    if (primaryHints.length > 0) return primaryHints;
    const fallbackLine = Number(currentDebugStep?.line) || 0;
    if (!fallbackLine || currentDebugLocals.length === 0) return [];
    const compact = currentDebugLocals
      .slice(0, 4)
      .map((item) => `${item.name}: ${sanitizeDebugInlineHintValue(item.value)}`)
      .filter(Boolean)
      .join('   ');
    if (!compact) return [];
    return [{ lineNumber: fallbackLine, text: compact }];
  }, [debugActive, debugSourceSnapshot, currentDebugLocals, cumulativeDebugLocals, currentDebugStep]);
  const applyDebugGlyphScale = useCallback((editorInstance = editorRef.current) => {
    const editor = editorInstance;
    if (!editor) return;
    const node = editor.getDomNode?.();
    if (!node) return;
    const monaco = monacoRef.current;
    const layout = editor.getLayoutInfo?.() || null;
    const glyphMarginWidth = Number(layout?.glyphMarginWidth) || 14;
    const lineHeightOption = monaco?.editor?.EditorOption?.lineHeight
      ? Number(editor.getOption(monaco.editor.EditorOption.lineHeight))
      : 0;
    const lineHeight = Number.isFinite(lineHeightOption) && lineHeightOption > 0
      ? lineHeightOption
      : Math.max(18, Math.round(editorFontSize * 1.5));
    const desiredByFont = Math.round(editorFontSize * 0.5);
    const desiredByLine = Math.round(lineHeight * 0.42);
    const desiredSize = Math.min(desiredByFont, desiredByLine);
    const minSize = editorFontSize <= 12 ? 5 : editorFontSize <= 14 ? 6 : 7;
    const maxSize = Math.max(minSize + 1, glyphMarginWidth - 4);
    const size = Math.max(minSize, Math.min(maxSize, desiredSize));
    const glowSize = Math.max(3, Math.round(size * 0.72));
    const ringSize = Math.max(1, Math.round(size * 0.2));
    node.style.setProperty('--collab-breakpoint-size', `${size}px`);
    node.style.setProperty('--collab-breakpoint-glow', `${glowSize}px`);
    node.style.setProperty('--collab-breakpoint-ring', `${ringSize}px`);
    node.style.setProperty('--collab-line-height', `${lineHeight}px`);
    node.style.setProperty('--collab-glyph-margin-width', `${glyphMarginWidth}px`);
  }, [editorFontSize]);

  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    applyDebugGlyphScale(editor);
    if (monaco?.languages && !collabSnippetProviderRef.current) {
      collabSnippetProviderRef.current = monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          );
          const typed = String(word.word || '').toLowerCase();
          if (typed.length < 2) {
            return { suggestions: [] };
          }
          const suggestions = COLLAB_SNIPPETS
            .filter((item) => item.prefix.startsWith(typed))
            .map((item, index) => ({
              label: item.prefix,
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: item.description,
              detail: 'Сниппет',
              insertText: item.snippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
              filterText: item.prefix,
              sortText: `0${String(index).padStart(2, '0')}`,
              preselect: item.prefix === typed,
            }));
          return { suggestions };
        },
      });
    }
    debugGutterDisposableRef.current?.dispose?.();
    if (monaco?.editor?.MouseTargetType) {
      debugGutterDisposableRef.current = editor.onMouseDown((event) => {
        const type = event?.target?.type;
        const isGutterClick = type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
          || type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
          || type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS;
        if (!isGutterClick) return;
        if (event?.event?.leftButton !== true) return;
        const browserEvent = event?.event?.browserEvent;
        const targetAtPoint = browserEvent
          ? editor.getTargetAtClientPoint?.(browserEvent.clientX, browserEvent.clientY)
          : null;
        const resolvedTarget = targetAtPoint || event?.target;
        const lineNumber = Number(
          resolvedTarget?.position?.lineNumber
          || resolvedTarget?.detail?.lineNumber
          || event?.target?.position?.lineNumber
          || event?.target?.detail?.lineNumber
        );
        if (!Number.isInteger(lineNumber) || lineNumber <= 0) return;
        setDebugBreakpoints((prev) => {
          if ((prev || []).includes(lineNumber)) {
            return prev.filter((line) => line !== lineNumber);
          }
          return [...prev, lineNumber].sort((a, b) => a - b);
        });
      });
    }
    setEditorReady(true);
    setEditorMountVersion((prev) => prev + 1);
  }, [applyDebugGlyphScale]);

  useEffect(() => () => {
    collabSnippetProviderRef.current?.dispose?.();
    collabSnippetProviderRef.current = null;
    debugGutterDisposableRef.current?.dispose?.();
    debugGutterDisposableRef.current = null;
    debugInlayProviderRef.current?.dispose?.();
    debugInlayProviderRef.current = null;
    if (debugPlaybackTimerRef.current) {
      clearInterval(debugPlaybackTimerRef.current);
      debugPlaybackTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = typeof document !== 'undefined' && document.fullscreenElement === collabRootRef.current;
      setIsCollabFullscreen(active);
    };
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(fontSizeStorageKey);
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setEditorFontSize(clampFontSize(parsed));
    } else {
      setEditorFontSize(14);
    }
  }, [fontSizeStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(fontSizeStorageKey, String(editorFontSize));
  }, [editorFontSize, fontSizeStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(splitWidthStorageKey);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(48, Math.min(82, parsed));
    setSplitLeftWidth(clamped);
  }, [splitWidthStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(splitWidthStorageKey, String(splitLeftWidth));
  }, [splitWidthStorageKey, splitLeftWidth]);

  useEffect(() => () => {
    splitDragCleanupRef.current?.();
  }, []);

  useEffect(() => {
    editorRef.current?.updateOptions?.({ fontSize: editorFontSize });
    applyDebugGlyphScale();
  }, [editorFontSize, applyDebugGlyphScale]);

  useEffect(() => {
    runInputRef.current = runInput;
  }, [runInput]);

  useEffect(() => {
    runOutputRef.current = runOutput;
  }, [runOutput]);

  useEffect(() => {
    runErrorRef.current = runError;
  }, [runError]);

  useEffect(() => {
    runStatusRef.current = runStatus;
  }, [runStatus]);

  useEffect(() => {
    debugTraceRef.current = Array.isArray(debugTrace) ? debugTrace : [];
  }, [debugTrace]);

  useEffect(() => {
    debugStepIndexRef.current = Number.isInteger(debugStepIndex) ? debugStepIndex : -1;
  }, [debugStepIndex]);

  useEffect(() => {
    const normalized = normalizeDebugBreakpoints(debugBreakpoints);
    debugBreakpointsRef.current = normalized;
    applyBreakpointDecorations(normalized);
    if (suppressBreakpointSyncRef.current) {
      suppressBreakpointSyncRef.current = false;
      return;
    }
    publishRunStateRef.current?.({ debugBreakpoints: normalized });
  }, [debugBreakpoints, applyBreakpointDecorations]);

  useEffect(() => () => {
    if (runStreamTimerRef.current) {
      clearTimeout(runStreamTimerRef.current);
      runStreamTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopDebugPlayback();
    const editor = editorRef.current;
    debugInlayProviderRef.current?.dispose?.();
    debugInlayProviderRef.current = null;
    if (!editor) return;
    if (debugDecorationsRef.current.length) {
      debugDecorationsRef.current = editor.deltaDecorations(debugDecorationsRef.current, []);
    }
    if (debugInlineHintDecorationsRef.current.length) {
      debugInlineHintDecorationsRef.current = editor.deltaDecorations(debugInlineHintDecorationsRef.current, []);
    }
    if (debugBreakpointDecorationsRef.current.length) {
      debugBreakpointDecorationsRef.current = editor.deltaDecorations(debugBreakpointDecorationsRef.current, []);
    }
  }, [stopDebugPlayback]);

  useEffect(() => {
    if (!editorReady) return;
    applyBreakpointDecorations(debugBreakpointsRef.current);
    if (debugActive) {
      const lineNumber = Number(currentDebugStep?.line) || 0;
      applyDebugDecoration(lineNumber);
      applyDebugInlineHints(currentDebugInlineHints);
      applyDebugInlayHints(currentDebugInlineHints);
    } else {
      applyDebugDecoration(0);
      applyDebugInlineHints([]);
      applyDebugInlayHints([]);
    }
  }, [
    editorReady,
    roomId,
    debugActive,
    currentDebugStep,
    currentDebugInlineHints,
    applyBreakpointDecorations,
    applyDebugDecoration,
    applyDebugInlineHints,
    applyDebugInlayHints,
  ]);

  const toggleCollabFullscreen = async () => {
    if (typeof document === 'undefined') return;
    try {
      if (!document.fullscreenElement && collabRootRef.current?.requestFullscreen) {
        await collabRootRef.current.requestFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch { /* no-op */ }
  };

  useEffect(() => {
    if (!effectiveStudentId || !saveTaskNumber || !saveCategory) {
      setFolders([]);
      setFoldersError('');
      setFoldersLoading(false);
      return;
    }
    let cancelled = false;
    setFoldersLoading(true);
    api.getFolders(Number(saveTaskNumber), saveCategory, effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setFolders(Array.isArray(data) ? data : []);
        setFoldersError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setFolders([]);
        setFoldersError(err?.message || 'Не удалось загрузить папки.');
      })
      .finally(() => {
        if (!cancelled) setFoldersLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId, saveTaskNumber, saveCategory]);

  useEffect(() => {
    setSaveFolderId('');
    setSaveError('');
    setSaveSuccess('');
    setSaveNameError(false);
  }, [saveTaskNumber, saveCategory, effectiveStudentId]);

  const normalizeFileName = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/[\\/]+/g, '').replace(/\0/g, '');
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setFoldersError('Введите название папки.');
      return;
    }
    if (!effectiveStudentId || !saveTaskNumber || !saveCategory) return;
    if (creatingFolder) return;
    setCreatingFolder(true);
    try {
      const created = await api.createFolder(Number(saveTaskNumber), saveCategory, name, effectiveStudentId);
      setFolders((prev) => [created, ...prev]);
      setSaveFolderId(created.id);
      setNewFolderName('');
      setFoldersError('');
    } catch (err) {
      setFoldersError(err?.message || err);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleSaveToNotes = async () => {
    setSaveError('');
    setSaveSuccess('');
    setSaveNameError(false);
    if (!effectiveStudentId) {
      setSaveError('Сначала выберите ученика.');
      return;
    }
    if (!saveTaskNumber || !saveCategory) {
      setSaveError('Выберите задание и категорию.');
      return;
    }
    const code = editorRef.current?.getValue?.() ?? '';
    if (!code.trim()) {
      setSaveError('Код пустой.');
      return;
    }
    const baseName = normalizeFileName(saveFileName);
    if (!baseName) {
      setSaveError('Введите название файла.');
      setSaveNameError(true);
      return;
    }
    let safeName = baseName;
    const prefix = 'конспект-';
    if (!safeName.toLowerCase().startsWith(prefix)) {
      safeName = `${prefix}${safeName}`;
    }
    if (!/\.[a-z0-9]+$/i.test(safeName)) {
      safeName += '.py';
    }
    const file = new File([code], safeName, { type: 'text/plain' });
    setSaveBusy(true);
    try {
      await api.uploadFile(file, Number(saveTaskNumber), saveCategory, saveFolderId || null, effectiveStudentId);
      setSaveSuccess('Сохранено в конспекты.');
    } catch (err) {
      setSaveError(err?.message || err);
    } finally {
      setSaveBusy(false);
    }
  };

  const normalizeRunText = (value) => {
    const text = typeof value === 'string' ? value : String(value ?? '');
    if (text.length <= COLLAB_RUN_OUTPUT_LIMIT) return text;
    return `${text.slice(0, COLLAB_RUN_OUTPUT_LIMIT)}\n...`;
  };

  const updateRunStateFromMap = (runMap) => {
    if (!runMap) {
      setRunOutput('');
      setRunError('');
      setRunStatus('idle');
      setRunAuthor('');
      setRunTimestamp(null);
      setLastRunInput('');
      setDebugActive(false);
      setDebugTrace([]);
      debugTraceRef.current = [];
      setDebugTraceTruncated(false);
      setDebugPlaying(false);
      setDebugSourceSnapshot('');
      setDebugStep(-1);
      return;
    }
    const output = typeof runMap.get('output') === 'string' ? runMap.get('output') : String(runMap.get('output') ?? '');
    const error = typeof runMap.get('error') === 'string' ? runMap.get('error') : String(runMap.get('error') ?? '');
    const status = typeof runMap.get('status') === 'string' ? runMap.get('status') : 'idle';
    const author = typeof runMap.get('author') === 'string' ? runMap.get('author') : '';
    const input = typeof runMap.get('input') === 'string' ? runMap.get('input') : String(runMap.get('input') ?? '');
    const tsRaw = runMap.get('ts');
    const ts = Number.isFinite(Number(tsRaw)) ? Number(tsRaw) : null;
    setRunOutput(output);
    setRunError(error);
    setRunStatus(status || 'idle');
    setRunAuthor(author);
    setRunTimestamp(ts);
    setLastRunInput(input);

    const nextTrace = normalizeDebugTrace(runMap.get('debugTrace'));
    const rawStepIndex = Number(runMap.get('debugStepIndex'));
    const nextStepIndex = Number.isInteger(rawStepIndex) ? rawStepIndex : -1;
    const clampedStepIndex = nextTrace.length > 0
      ? Math.max(0, Math.min(nextStepIndex, nextTrace.length - 1))
      : -1;
    const nextActive = Boolean(runMap.get('debugActive')) && nextTrace.length > 0;
    const nextPlaying = Boolean(runMap.get('debugPlaying')) && nextActive;
    const nextTruncated = Boolean(runMap.get('debugTraceTruncated'));
    const nextSource = typeof runMap.get('debugSource') === 'string'
      ? runMap.get('debugSource')
      : String(runMap.get('debugSource') ?? '');
    const nextBreakpoints = normalizeDebugBreakpoints(runMap.get('debugBreakpoints'));

    setDebugActive(nextActive);
    setDebugTrace(nextTrace);
    debugTraceRef.current = nextTrace;
    setDebugTraceTruncated(nextTruncated);
    setDebugPlaying(nextPlaying);
    setDebugSourceSnapshot(nextSource);
    setDebugStep(clampedStepIndex);

    if (!areNumberArraysEqual(debugBreakpointsRef.current, nextBreakpoints)) {
      suppressBreakpointSyncRef.current = true;
      debugBreakpointsRef.current = nextBreakpoints;
      setDebugBreakpoints(nextBreakpoints);
    }
  };

  const publishRunState = (payload) => {
    const runMap = runMapRef.current;
    const doc = collabDocRef.current;
    if (!runMap || !doc) {
      if (Object.prototype.hasOwnProperty.call(payload, 'output')) {
        setRunOutput(payload.output || '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'error')) {
        setRunError(payload.error || '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        setRunStatus(payload.status || 'idle');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'author')) {
        setRunAuthor(payload.author || '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'ts')) {
        const tsValue = Number.isFinite(Number(payload.ts)) ? Number(payload.ts) : null;
        setRunTimestamp(tsValue);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'input')) {
        setLastRunInput(payload.input || '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugActive')) {
        setDebugActive(Boolean(payload.debugActive));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugTrace')) {
        const nextTrace = normalizeDebugTrace(payload.debugTrace);
        setDebugTrace(nextTrace);
        debugTraceRef.current = nextTrace;
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugTraceTruncated')) {
        setDebugTraceTruncated(Boolean(payload.debugTraceTruncated));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugStepIndex')) {
        setDebugStep(Number(payload.debugStepIndex));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugPlaying')) {
        setDebugPlaying(Boolean(payload.debugPlaying));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugSource')) {
        setDebugSourceSnapshot(String(payload.debugSource || ''));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugBreakpoints')) {
        const nextBreakpoints = normalizeDebugBreakpoints(payload.debugBreakpoints);
        if (!areNumberArraysEqual(debugBreakpointsRef.current, nextBreakpoints)) {
          debugBreakpointsRef.current = nextBreakpoints;
          setDebugBreakpoints(nextBreakpoints);
        }
      }
      return;
    }
    doc.transact(() => {
      if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        runMap.set('status', payload.status || 'idle');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'output')) {
        runMap.set('output', payload.output || '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'error')) {
        runMap.set('error', payload.error || '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'author')) {
        runMap.set('author', payload.author || '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'ts')) {
        runMap.set('ts', Number.isFinite(Number(payload.ts)) ? Number(payload.ts) : null);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'input')) {
        runMap.set('input', payload.input || '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugActive')) {
        runMap.set('debugActive', Boolean(payload.debugActive));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugTrace')) {
        runMap.set('debugTrace', normalizeDebugTrace(payload.debugTrace));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugTraceTruncated')) {
        runMap.set('debugTraceTruncated', Boolean(payload.debugTraceTruncated));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugStepIndex')) {
        const step = Number(payload.debugStepIndex);
        runMap.set('debugStepIndex', Number.isInteger(step) ? step : -1);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugPlaying')) {
        runMap.set('debugPlaying', Boolean(payload.debugPlaying));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugSource')) {
        runMap.set('debugSource', String(payload.debugSource || ''));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'debugBreakpoints')) {
        runMap.set('debugBreakpoints', normalizeDebugBreakpoints(payload.debugBreakpoints));
      }
    });
  };
  publishRunStateRef.current = publishRunState;

  const scheduleRunStreamSync = (payload) => {
    runStreamPendingRef.current = payload;
    if (runStreamTimerRef.current) return;
    runStreamTimerRef.current = setTimeout(() => {
      const pending = runStreamPendingRef.current;
      runStreamPendingRef.current = null;
      runStreamTimerRef.current = null;
      if (!pending) return;
      if (pending.sessionId !== runSessionRef.current) return;
      if (runStatusRef.current !== 'running') return;
      publishRunState({
        output: normalizeRunText(pending.output || ''),
        error: normalizeRunText(pending.error || ''),
        author: pending.author || '',
        ts: pending.ts || Date.now(),
        input: pending.input || '',
      });
    }, 120);
  };

  const resolveRunPending = (message) => {
    runPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      const debugTraceSnapshot = Array.isArray(entry.debugTrace) ? entry.debugTrace : [];
      const debugTraceTruncatedSnapshot = Boolean(entry.debugTraceTruncated);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({
        output,
        error,
        debugTrace: debugTraceSnapshot,
        debugTraceTruncated: debugTraceTruncatedSnapshot,
      });
    });
    runPendingRef.current.clear();
  };

  const disposeRunWorker = (message = '') => {
    if (runWorkerRef.current) {
      runWorkerRef.current.terminate();
      runWorkerRef.current = null;
    }
    if (message) resolveRunPending(message);
  };

  const ensureRunWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (runWorkerRef.current) return runWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = runPendingRef.current.get(data.id);
        if (!pending) return;
        const messageType = typeof data.type === 'string' ? data.type : 'result';
        if (messageType === 'debug-trace') {
          pending.debugTrace = Array.isArray(data.trace) ? data.trace : [];
          pending.debugTraceTruncated = Boolean(data.truncated);
          return;
        }
        if (messageType === 'stdout' || messageType === 'stderr') {
          const chunk = typeof data.chunk === 'string' ? data.chunk : String(data.chunk ?? '');
          if (!chunk) return;
          if (messageType === 'stdout') {
            pending.output = `${pending.output || ''}${chunk}`;
          } else {
            pending.error = `${pending.error || ''}${chunk}`;
          }
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({
              output: pending.output || '',
              error: pending.error || '',
              done: false,
            });
          }
          return;
        }
        clearTimeout(pending.timer);
        runPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string'
          ? data.output
          : (data.output ? String(data.output) : (pending.output || ''));
        const error = typeof data.error === 'string'
          ? data.error
          : (data.error ? String(data.error) : (pending.error || ''));
        const debugTrace = Array.isArray(data.debugTrace)
          ? data.debugTrace
          : (Array.isArray(pending.debugTrace) ? pending.debugTrace : []);
        const debugTraceTruncated = Boolean(
          Object.prototype.hasOwnProperty.call(data, 'debugTraceTruncated')
            ? data.debugTraceTruncated
            : pending.debugTraceTruncated
        );
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, done: true });
        }
        pending.resolve({ output, error, debugTrace, debugTraceTruncated });
      };
      worker.onerror = () => disposeRunWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeRunWorker('Ошибка выполнения Python.');
      runWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  useEffect(() => () => disposeRunWorker('Python runner stopped.'), []);

  const runPythonInMainThread = async (source, inputValue) => {
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
  };

  const runPythonCode = async (source, inputValue, onProgress = null, options = {}) => {
    const debugMode = Boolean(options?.debug);
    const worker = ensureRunWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timeoutMs = debugMode ? COLLAB_DEBUG_TIMEOUT_MS : COLLAB_RUN_TIMEOUT_MS;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = runPendingRef.current.get(id);
          if (!pending) return;
          runPendingRef.current.delete(id);
          const timeoutMessage = debugMode
            ? `Превышено время отладки (${Math.round(timeoutMs / 1000)} сек).`
            : `Превышено время выполнения (${Math.round(timeoutMs / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          const debugTrace = Array.isArray(pending.debugTrace) ? pending.debugTrace : [];
          const debugTraceTruncated = Boolean(pending.debugTraceTruncated);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error, debugTrace, debugTraceTruncated });
          disposeRunWorker(debugMode ? 'Превышено время отладки.' : 'Превышено время выполнения.');
        }, timeoutMs);
        runPendingRef.current.set(id, {
          resolve,
          timer,
          output: '',
          error: '',
          debugTrace: [],
          debugTraceTruncated: false,
          onProgress: typeof onProgress === 'function' ? onProgress : null,
        });
        worker.postMessage({ id, source, input: inputValue, debug: debugMode });
      });
    }
    if (!ALLOW_MAIN_THREAD_PYTHON_FALLBACK) {
      return {
        output: '',
        error: 'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.'
      };
    }
    return runPythonInMainThread(source, inputValue);
  };

  const normalizePythonForAutoFormat = (value) => {
    const text = String(value ?? '');
    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, '    ')
      .split('\n')
      .map((line) => line.replace(/\s+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
    return normalized.endsWith('\n') || normalized.length === 0 ? normalized : `${normalized}\n`;
  };

  const handleFormatCode = () => {
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!editor || !model) return;
    const source = model.getValue();
    if (!source) return;
    const formatted = normalizePythonForAutoFormat(source);
    if (formatted === source) return;
    editor.pushUndoStop?.();
    editor.executeEdits('collab-auto-format', [{
      range: model.getFullModelRange(),
      text: formatted,
      forceMoveMarkers: true,
    }]);
    editor.pushUndoStop?.();
    editor.focus?.();
    signalTyping();
  };

  const getSelectedCode = () => {
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!editor || !model) return '';
    const selection = editor.getSelection?.();
    if (!selection) return '';
    if (
      selection.startLineNumber === selection.endLineNumber
      && selection.startColumn === selection.endColumn
    ) {
      return '';
    }
    return model.getValueInRange(selection);
  };

  const resolveRunnableCode = (mode = 'all') => {
    const editor = editorRef.current;
    if (!editor) return { code: '', mode: 'all' };
    const fullCode = editor.getValue?.() ?? '';
    const selectedCode = getSelectedCode();
    if (mode === 'selection') {
      return { code: selectedCode, mode: 'selection' };
    }
    return { code: fullCode, mode: 'all' };
  };

  const handleRunCode = async (mode = 'all', debug = false) => {
    if (!roomId || !editorRef.current) return;
    const requestedDebug = Boolean(debug);
    const breakpointsSource = Array.isArray(debugBreakpoints) && debugBreakpoints.length > 0
      ? debugBreakpoints
      : (debugBreakpointsRef.current || []);
    const activeBreakpoints = [...new Set(breakpointsSource
      .map((line) => Number(line))
      .filter((line) => Number.isInteger(line) && line > 0))];
    const isDebugRun = requestedDebug && activeBreakpoints.length > 0;
    const { code, mode: resolvedMode } = resolveRunnableCode(mode);
    if (!code.trim()) {
      setRunOutput('');
      setRunError(resolvedMode === 'selection' ? 'Сначала выделите код для запуска.' : 'Код пустой.');
      return;
    }
    if (runLoading) return;
    stopDebugPlayback();
    if (!isDebugRun) {
      clearDebugSession(false);
      publishRunStateRef.current?.({
        debugActive: false,
        debugTrace: [],
        debugTraceTruncated: false,
        debugStepIndex: -1,
        debugPlaying: false,
        debugSource: '',
      });
    }
    const sessionId = runSessionRef.current + 1;
    runSessionRef.current = sessionId;
    setRunLoading(true);
    setRunStatus('running');
    setRunError('');
    if (isDebugRun) {
      setDebugActive(false);
      setDebugTrace([]);
      setDebugTraceTruncated(false);
      setDebugPlaying(false);
      setDebugSourceSnapshot(code);
      debugTraceRef.current = [];
      setDebugStep(-1);
      publishRunStateRef.current?.({
        debugActive: false,
        debugTrace: [],
        debugTraceTruncated: false,
        debugStepIndex: -1,
        debugPlaying: false,
        debugSource: code,
      });
    }
    const startedAt = Date.now();
    const inputSnapshot = runInputRef.current || '';
    publishRunState({
      status: 'running',
      output: '',
      error: '',
      author: localName,
      ts: startedAt,
      input: inputSnapshot,
    });
    try {
      const result = await runPythonCode(code, inputSnapshot, (progress) => {
        if (runSessionRef.current !== sessionId) return;
        const nextOutput = progress?.output || '';
        const nextError = progress?.error || '';
        setRunOutput(nextOutput);
        setRunError(nextError);
        scheduleRunStreamSync({
          sessionId,
          output: nextOutput,
          error: nextError,
          author: localName,
          ts: Date.now(),
          input: inputSnapshot,
        });
      }, { debug: isDebugRun });
      if (runSessionRef.current !== sessionId) return;
      if (runStreamTimerRef.current) {
        clearTimeout(runStreamTimerRef.current);
        runStreamTimerRef.current = null;
      }
      runStreamPendingRef.current = null;
      if (isDebugRun) {
        const trace = Array.isArray(result?.debugTrace) ? result.debugTrace : [];
        const traceTruncated = Boolean(result?.debugTraceTruncated);
        const bpSet = new Set(activeBreakpoints);
        let firstBreakpointIndex = -1;
        for (let i = 0; i < trace.length; i += 1) {
          const lineNumber = Number(trace[i]?.line) || 0;
          if (bpSet.has(lineNumber)) {
            firstBreakpointIndex = i;
            break;
          }
        }
        if (firstBreakpointIndex >= 0) {
          setDebugTrace(trace);
          debugTraceRef.current = trace;
          setDebugTraceTruncated(traceTruncated);
          setDebugActive(true);
          setDebugPlaying(false);
          setDebugStep(firstBreakpointIndex);
          publishRunStateRef.current?.({
            debugActive: true,
            debugTrace: trace,
            debugTraceTruncated: traceTruncated,
            debugStepIndex: firstBreakpointIndex,
            debugPlaying: false,
            debugSource: code,
          });
        } else {
          // Если ни одна точка останова не достигнута, завершаем как обычный запуск.
          setDebugTrace([]);
          debugTraceRef.current = [];
          setDebugTraceTruncated(false);
          setDebugActive(false);
          setDebugPlaying(false);
          setDebugStep(-1);
          publishRunStateRef.current?.({
            debugActive: false,
            debugTrace: [],
            debugTraceTruncated: false,
            debugStepIndex: -1,
            debugPlaying: false,
            debugSource: code,
          });
        }
      }
      publishRunState({
        status: 'done',
        output: normalizeRunText(result.output || ''),
        error: normalizeRunText(result.error || ''),
        author: localName,
        ts: Date.now(),
        input: inputSnapshot,
      });
    } catch (err) {
      if (runSessionRef.current !== sessionId) return;
      if (runStreamTimerRef.current) {
        clearTimeout(runStreamTimerRef.current);
        runStreamTimerRef.current = null;
      }
      runStreamPendingRef.current = null;
      if (isDebugRun) {
        publishRunStateRef.current?.({
          debugActive: false,
          debugTrace: [],
          debugTraceTruncated: false,
          debugStepIndex: -1,
          debugPlaying: false,
          debugSource: code,
        });
      }
      publishRunState({
        status: 'done',
        output: '',
        error: normalizeRunText(err?.message || 'Ошибка выполнения Python.'),
        author: localName,
        ts: Date.now(),
        input: inputSnapshot,
      });
    } finally {
      if (runSessionRef.current === sessionId) {
        setRunLoading(false);
        setRunStatus('done');
      }
    }
  };

  const handleStopRun = () => {
    if (!runLoading) return;
    stopDebugPlayback();
    runSessionRef.current += 1;
    if (runStreamTimerRef.current) {
      clearTimeout(runStreamTimerRef.current);
      runStreamTimerRef.current = null;
    }
    runStreamPendingRef.current = null;
    disposeRunWorker('Прервано пользователем.');
    setRunLoading(false);
    setRunStatus('stopped');
    setRunError('Прервано пользователем (Ctrl+C).');
    publishRunState({
      status: 'stopped',
      output: normalizeRunText(runOutputRef.current || ''),
      error: normalizeRunText('Прервано пользователем (Ctrl+C).'),
      author: localName,
      ts: Date.now(),
      input: runInputRef.current || '',
      debugActive: false,
      debugTrace: [],
      debugTraceTruncated: false,
      debugStepIndex: -1,
      debugPlaying: false,
      debugSource: '',
    });
  };

  const handleTopStop = useCallback(() => {
    if (runLoading) {
      handleStopRun();
      return;
    }
    if (debugActive) {
      handleStopDebug();
    }
  }, [runLoading, debugActive, handleStopDebug, handleStopRun]);

  const signalTyping = useCallback(() => {
    if (!roomId || !collabAwarenessRef.current) return;
    collabAwarenessRef.current.setLocalStateField('typing', {
      active: true,
      ts: Date.now(),
    });
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = setTimeout(() => {
      collabAwarenessRef.current?.setLocalStateField('typing', null);
      typingIdleTimerRef.current = null;
    }, COLLAB_TYPING_IDLE_MS);
  }, [roomId]);

  useEffect(() => {
    const isEditableTarget = (target) => {
      const element = target;
      if (!element || typeof element !== 'object') return false;
      if (element.isContentEditable) return true;
      const tagName = element.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
      if (element.classList?.contains('inputarea')) return true;
      return false;
    };
    const handleKeyDown = (event) => {
      if (!runLoading) return;
      if (!event.ctrlKey && !event.metaKey) return;
      const key = String(event.key || '').toLowerCase();
      const code = event.code;
      const isStopKey = code === 'KeyC' || key === 'c' || key === 'с' || key === 'я';
      if (!isStopKey) return;
      if (isEditableTarget(event.target)) return;
      const selectionText = typeof window !== 'undefined' ? window.getSelection?.()?.toString?.() : '';
      if (selectionText) return;
      event.preventDefault();
      handleStopRun();
    };
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runLoading, runOutput, localName]);

  useEffect(() => {
    if (!debugActive) return undefined;
    const isEditableTarget = (target) => {
      const element = target;
      if (!element || typeof element !== 'object') return false;
      if (element.isContentEditable) return true;
      const tagName = element.tagName;
      return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    };
    const handleDebugHotkeys = (event) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === 'F10') {
        event.preventDefault();
        handleDebugStepForward();
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        handleDebugContinue();
        return;
      }
      if (event.key === 'F7') {
        event.preventDefault();
        handleDebugStepBack();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        handleStopDebug();
      }
    };
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('keydown', handleDebugHotkeys);
    return () => window.removeEventListener('keydown', handleDebugHotkeys);
  }, [debugActive, handleDebugStepForward, handleDebugContinue, handleDebugStepBack, handleStopDebug]);

  const handleClearRun = () => {
    clearDebugSession(false);
    publishRunState({
      status: 'idle',
      output: '',
      error: '',
      author: '',
      ts: null,
      input: '',
      debugActive: false,
      debugTrace: [],
      debugTraceTruncated: false,
      debugStepIndex: -1,
      debugPlaying: false,
      debugSource: '',
    });
  };

  useEffect(() => {
    if (!roomId || !editorReady || !wsUrl) {
      setStatus('disconnected');
      setPeerCount(0);
      collabDocRef.current = null;
      collabAwarenessRef.current = null;
      runMapRef.current = null;
      setTypingUsers([]);
      clearDebugSession(false);
      updateRunStateFromMap(null);
      return;
    }

    setStatus('connecting');
    const doc = new Y.Doc();
    collabDocRef.current = doc;
    const provider = new WebsocketProvider(wsUrl, roomId, doc);
    collabAwarenessRef.current = provider.awareness;
    const model = editorRef.current?.getModel?.();
    if (!model) {
      provider.destroy();
      doc.destroy();
      collabDocRef.current = null;
      collabAwarenessRef.current = null;
      return;
    }

    const ytext = doc.getText('monaco');
    const binding = new MonacoBinding(ytext, model, new Set([editorRef.current]), provider.awareness);
    provider.awareness.setLocalStateField('user', { name: localName, color: localColor });
    provider.awareness.setLocalStateField('typing', null);

    const runMap = doc.getMap('collabRun');
    runMapRef.current = runMap;
    const handleRunMapChange = () => updateRunStateFromMap(runMap);
    runMap.observe(handleRunMapChange);
    handleRunMapChange();

    const handleStatus = (event) => {
      if (event?.status) setStatus(event.status);
    };
    const handleAwareness = () => {
      const states = provider.awareness.getStates();
      const total = states.size;
      setPeerCount(Math.max(0, total - 1));
      const now = Date.now();
      const nextTypingUsers = [];
      states.forEach((state, clientId) => {
        if (clientId === provider.awareness.clientID) return;
        const typing = state?.typing;
        if (!typing?.active) return;
        const ts = Number(typing.ts) || 0;
        if (!ts || (now - ts) > COLLAB_TYPING_STALE_MS) return;
        const user = state?.user;
        const name = typeof user?.name === 'string' && user.name.trim() ? user.name.trim() : 'Участник';
        nextTypingUsers.push(name);
      });
      setTypingUsers([...new Set(nextTypingUsers)].slice(0, 2));
    };

    const typingDisposable = editorRef.current?.onDidType?.(() => {
      signalTyping();
    });
    const pasteDisposable = editorRef.current?.onDidPaste?.(() => {
      signalTyping();
    });

    provider.on('status', handleStatus);
    provider.awareness.on('change', handleAwareness);
    handleAwareness();

    return () => {
      typingDisposable?.dispose?.();
      pasteDisposable?.dispose?.();
      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      provider.awareness.off('change', handleAwareness);
      provider.off('status', handleStatus);
      provider.awareness.setLocalStateField('typing', null);
      runMap.unobserve(handleRunMapChange);
      binding.destroy();
      provider.destroy();
      doc.destroy();
      setTypingUsers([]);
      runMapRef.current = null;
      collabDocRef.current = null;
      collabAwarenessRef.current = null;
      clearDebugSession(false);
      updateRunStateFromMap(null);
    };
  }, [roomId, editorReady, wsUrl, localName, localColor, signalTyping, clearDebugSession, editorMountVersion]);

  const statusLabel = status === 'connected'
    ? 'Подключено'
    : (status === 'connecting' ? 'Соединяемся...' : 'Не подключено');
  const statusClass = status === 'connected'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
  const isSplitCollabLayout = (isCollabFullscreen || isDesktopCollabCompact) && !isMobileViewport;
  const sessionLabel = roomId
    ? (isTeacher
      ? `Учитель + ${selectedStudent ? getStudentLabel(selectedStudent) : 'ученик'}`
      : 'Учитель + ученик')
    : 'Не выбрана';
  const handleSplitResizeStart = useCallback((event) => {
    if (!isSplitCollabLayout) return;
    event.preventDefault();
    const applyFromClientX = (clientX) => {
      const container = splitLayoutRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width) return;
      const relative = ((clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(48, Math.min(82, relative));
      setSplitLeftWidth(clamped);
    };
    const handlePointerMove = (moveEvent) => {
      applyFromClientX(moveEvent.clientX);
    };
    const stopDragging = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      splitDragCleanupRef.current = null;
    };
    splitDragCleanupRef.current?.();
    splitDragCleanupRef.current = stopDragging;
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    applyFromClientX(event.clientX);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  }, [isSplitCollabLayout]);
  const handleSplitResizeReset = useCallback(() => {
    setSplitLeftWidth(68);
  }, []);

  const renderStudentPicker = () => {
    if (!isTeacher) return null;
    return (
      <div className={`inline-flex w-full sm:w-auto items-center gap-2 rounded-2xl border border-purple-200/80 bg-white/90 shadow-sm shadow-purple-100/40 ${
        isCollabFullscreen || isDesktopCollabCompact ? 'px-2.5 py-1.5' : 'px-3 py-2'
      }`}>
        <span className={`font-semibold uppercase tracking-widest text-purple-500 ${
          isCollabFullscreen || isDesktopCollabCompact ? 'text-[10px]' : 'text-[11px]'
        }`}>Ученик</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || (students || []).length === 0}
          className={`w-full min-w-0 rounded-xl border border-purple-100 bg-white text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70 ${
            isCollabFullscreen || isDesktopCollabCompact
              ? 'sm:min-w-[170px] px-2.5 py-1 text-[13px]'
              : 'sm:min-w-[180px] px-3 py-1.5 text-sm'
          }`}
        >
          <option value="" disabled>Выберите ученика</option>
          {(students || []).map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const saveModal = saveModalOpen ? (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4">
      <div className="surface-card modal-card rounded-3xl w-full max-w-3xl p-4 sm:p-5 md:p-6 shadow-2xl relative">
        <button
          onClick={() => setSaveModalOpen(false)}
          className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"
          aria-label="Закрыть"
        >
          <X size={18} />
        </button>
        <div className="pr-8">
          <div className="text-xs font-bold uppercase tracking-widest text-purple-500">Сохранение</div>
          <h3 className="mt-1 text-xl font-bold text-gray-900">Сохранить в конспекты</h3>
          <p className="mt-1 text-xs text-gray-500">Файл появится в разделе «Конспекты» выбранного ученика.</p>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Задание</label>
            <select
              value={saveTaskNumber}
              onChange={(e) => setSaveTaskNumber(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-500"
            >
              {taskOptions.map((task) => (
                <option key={task.id} value={task.number}>
                  {`Задание ${getTaskDisplayNumber(task)}: ${task.title}`}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Категория</label>
            <select
              value={saveCategory}
              onChange={(e) => setSaveCategory(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-500"
            >
              <option value="class">На уроке</option>
              <option value="home">Домашка</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Папка</label>
            <select
              value={saveFolderId}
              onChange={(e) => setSaveFolderId(e.target.value)}
              disabled={!effectiveStudentId || foldersLoading}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70"
            >
              <option value="">Без папки</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            {foldersLoading && <div className="text-[11px] text-gray-400">Загрузка папок...</div>}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Имя файла</label>
            <input
              type="text"
              value={saveFileName}
              onChange={(e) => {
                setSaveFileName(e.target.value);
                if (saveNameError && e.target.value.trim()) {
                  setSaveNameError(false);
                  setSaveError('');
                }
              }}
              placeholder="конспект-..."
              className={`w-full rounded-xl px-3 py-2 text-sm outline-none ${
                saveNameError
                  ? 'border border-red-300 bg-red-50 text-red-700 focus:border-red-500'
                  : 'border border-gray-200 bg-gray-50 text-gray-700 focus:border-purple-500'
              }`}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Новая папка"
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-500"
          />
          <Button
            variant="secondary"
            onClick={handleCreateFolder}
            disabled={creatingFolder || !newFolderName.trim() || !effectiveStudentId}
            className="flex items-center justify-center gap-2"
          >
            <FolderPlus size={16} />
            {creatingFolder ? 'Создаём...' : 'Создать папку'}
          </Button>
        </div>

        {foldersError && <div className="mt-2 text-xs text-rose-600">{foldersError}</div>}
        {saveError && <div className="mt-2 text-xs text-rose-600">{saveError}</div>}
        {saveSuccess && <div className="mt-2 text-xs text-emerald-700">{saveSuccess}</div>}

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setSaveModalOpen(false)}>Отмена</Button>
          <Button
            onClick={handleSaveToNotes}
            disabled={saveBusy || !effectiveStudentId || !saveTaskNumber || !saveCategory}
            className="flex items-center justify-center gap-2"
          >
            <Save size={16} />
            {saveBusy ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  const editorPane = (
    <div className={`rounded-2xl overflow-hidden border relative ${isSplitCollabLayout ? 'h-full' : ''} ${isCollabFullscreen ? 'border-slate-700/80 bg-slate-950/60 shadow-[0_0_32px_rgba(99,102,241,0.25)]' : 'border-gray-800'}`}>
      {!roomId && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/70 text-sm text-slate-100">
          Выберите ученика, чтобы открыть совместный документ.
        </div>
      )}
      <Editor
        height={editorHeight}
        language="python"
        theme="vs-dark"
        defaultValue=""
        onMount={handleEditorMount}
        options={editorOptions}
        loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
      />
    </div>
  );

  const inputPane = (
    <div className={isSplitCollabLayout ? 'space-y-1' : 'space-y-2'}>
      <div className={`${isSplitCollabLayout ? 'text-[10px]' : 'text-[11px]'} font-semibold uppercase tracking-widest ${collabHintClass}`}>Ввод (stdin)</div>
      <textarea
        value={runInput}
        onChange={(e) => setRunInput(e.target.value)}
        rows={isSplitCollabLayout ? 2 : (isCollabFullscreen ? (isMobileViewport ? 3 : 4) : (isMobileViewport ? 4 : 6))}
        placeholder="Если нужен ввод, вставьте его сюда."
        className={`w-full rounded-2xl border outline-none ${
          isSplitCollabLayout ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
        } ${
          isCollabFullscreen
            ? 'border-slate-700/80 bg-slate-900/70 text-slate-100 focus:border-violet-400'
            : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-purple-500'
        }`}
      />
    </div>
  );

  const resultHeader = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div>
        <div className={`text-[11px] font-semibold uppercase tracking-widest ${collabHintClass}`}>Результат</div>
        {(runAuthor || runTimestamp) && (
          <div className={`text-[11px] ${isCollabFullscreen ? 'text-slate-400' : 'text-gray-500'}`}>
            {runAuthor ? `Запустил: ${runAuthor}` : 'Запуск'}
            {runTimestamp ? ` • ${new Date(runTimestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
          </div>
        )}
      </div>
    </div>
  );

  const resultConsoleClass = `rounded-2xl border bg-slate-950 text-slate-100 p-3 text-xs font-mono ${
    isSplitCollabLayout ? 'min-h-0 h-full overflow-auto' : 'min-h-[160px]'
  } ${
    runStatus === 'running'
      ? 'border-amber-300/70 shadow-[0_0_24px_rgba(251,191,36,0.25)]'
      : 'border-gray-900'
  }`;

  const resultConsole = (
    <div className={resultConsoleClass}>
      {runStatus === 'running' && (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-amber-300">
          <span className="inline-flex h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.9)] animate-pulse" />
          Выполняется...
        </div>
      )}
      {runStatus === 'stopped' && (
        <div className="mb-2 text-[11px] text-rose-300">Остановлено пользователем</div>
      )}
      {lastRunInput && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">Ввод</div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-slate-200">{lastRunInput}</pre>
        </div>
      )}
      {(runOutput || runError) ? (
        <>
          {runOutput && (
            <pre className="whitespace-pre-wrap break-words">{runOutput}</pre>
          )}
          {runError && (
            <pre className="mt-2 whitespace-pre-wrap break-words text-rose-300">{runError}</pre>
          )}
        </>
      ) : (
        <div className="text-slate-400">Здесь появится вывод программы.</div>
      )}
    </div>
  );

  const debugPane = debugActive ? (
    <div className={`rounded-2xl border p-3 text-xs ${
      isCollabFullscreen
        ? 'border-violet-500/40 bg-slate-900/80 text-slate-100'
        : 'border-violet-200 bg-violet-50/70 text-slate-800'
    } ${isSplitCollabLayout ? 'max-h-[24vh] overflow-auto' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">Пошаговый дебаг</div>
          <div className="mt-1 text-[12px]">
            {`Шаг ${Math.max(0, debugStepIndex + 1)} из ${debugTrace.length}`}
            {debugTraceTruncated ? ' • Трасса ограничена по размеру' : ''}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">F10 шаг • F8 продолжить • F7 назад • Esc выйти • точка останова: клик по номеру строки</div>
        </div>
      </div>

      {currentDebugStep && (
        <div className={`mt-3 rounded-xl border p-2 ${
          isCollabFullscreen
            ? 'border-slate-700/80 bg-slate-950/80'
            : 'border-violet-200/80 bg-white'
        }`}>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold text-violet-400">{`Строка ${currentDebugStep.line || '?'}`}</span>
            <span className={isCollabFullscreen ? 'text-slate-400' : 'text-slate-500'}>{`Событие: ${currentDebugStep.event || 'line'}`}</span>
            <span className={isCollabFullscreen ? 'text-slate-400' : 'text-slate-500'}>{`Функция: ${currentDebugStep.func || '<module>'}`}</span>
          </div>
          {currentDebugLineText && (
            <pre className={`mt-2 whitespace-pre-wrap break-words rounded-lg px-2 py-1 text-[11px] ${
              isCollabFullscreen ? 'bg-slate-900 text-cyan-200' : 'bg-slate-950 text-cyan-100'
            }`}>{currentDebugLineText}</pre>
          )}
          {currentDebugStep.exception && (
            <div className="mt-2 text-[11px] text-rose-400">{currentDebugStep.exception}</div>
          )}
          <div className="mt-2 text-[10px] uppercase tracking-widest text-slate-400">Локальные переменные</div>
          {currentDebugLocals.length > 0 ? (
            <div className="mt-1 max-h-44 overflow-auto space-y-1 pr-1">
              {currentDebugLocals.map((local, idx) => (
                <div key={`${local.name}-${idx}`} className={`rounded-lg px-2 py-1 text-[11px] font-mono ${
                  isCollabFullscreen ? 'bg-slate-900/80 text-slate-200' : 'bg-slate-100 text-slate-700'
                }`}>
                  <span className="text-violet-400">{local.name || '?'}</span>
                  {local.type ? <span className="ml-1 text-slate-400">{`(${local.type})`}</span> : null}
                  <span className="ml-2">{local.value || '—'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-slate-400">Нет локальных переменных на этом шаге.</div>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={collabRootRef} className={collabShellClass} style={collabShellStyle}>
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between ${
        isCollabFullscreen
          ? 'mb-3 gap-2 rounded-2xl border border-slate-800/70 bg-slate-950/60 px-2.5 py-2 sm:px-3 sm:py-2.5 backdrop-blur'
          : (isDesktopCollabCompact ? 'mb-3 gap-2' : 'mb-6 gap-3')
      }`}>
        <div>
          <h2 className={`font-bold flex items-center gap-2 ${
            isCollabFullscreen ? 'text-lg sm:text-xl' : (isDesktopCollabCompact ? 'text-xl' : 'text-2xl')
          } ${collabTitleClass}`}>
            <Pencil size={isCollabFullscreen || isDesktopCollabCompact ? 18 : 24} className={collabLabelClass} />
            Совместный код
          </h2>
          <p className={`${collabSubtitleClass} ${isCollabFullscreen || isDesktopCollabCompact ? 'text-xs' : ''}`}>
            Живой документ: изменения видны сразу.
          </p>
        </div>
        <div className={`flex flex-wrap items-center ${isCollabFullscreen || isDesktopCollabCompact ? 'gap-1.5' : 'gap-2'}`}>
          {renderStudentPicker()}
          <Button
            variant="secondary"
            onClick={() => setSaveModalOpen(true)}
            className={`flex items-center ${
              isCollabFullscreen || isDesktopCollabCompact ? 'gap-1.5 px-2.5 py-1.5 text-xs' : 'gap-2'
            }`}
          >
            <Save size={16} />
            Сохранить в конспекты
          </Button>
          <button
            type="button"
            onClick={toggleCollabFullscreen}
            className={`inline-flex items-center rounded-full border font-semibold transition ${
              isCollabFullscreen || isDesktopCollabCompact ? 'gap-1.5 px-2.5 py-0.5 text-[11px]' : 'gap-2 px-3 py-1 text-xs'
            } ${
              isCollabFullscreen
                ? 'border-violet-500/70 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
            title={isCollabFullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}
          >
            {isCollabFullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}
            {isCollabFullscreen ? 'Свернуть' : 'На весь экран'}
          </button>
          <span className={`inline-flex items-center rounded-full border font-semibold ${
            isCollabFullscreen || isDesktopCollabCompact ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
          } ${statusClass}`}>
            {statusLabel}
          </span>
          {roomId && (
            <span className={`inline-flex items-center rounded-full border border-slate-200 bg-white font-semibold text-slate-600 ${
              isCollabFullscreen || isDesktopCollabCompact ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
            }`}>
              Онлайн: {peerCount}
            </span>
          )}
          {typingUsers.length > 0 && (
            <span className={`inline-flex items-center rounded-full border font-semibold ${
              isCollabFullscreen || isDesktopCollabCompact ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
            } ${
              isCollabFullscreen
                ? 'border-violet-400/60 bg-violet-500/20 text-violet-100'
                : 'border-violet-200 bg-violet-50 text-violet-700'
            }`}>
              {`Печатает: ${typingUsers.join(', ')}`}
            </span>
          )}
        </div>
      </div>

      {isTeacher && !activeStudentId && (
        <div className={`rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 flex items-start gap-2 ${
          isCollabFullscreen || isDesktopCollabCompact ? 'mb-2 px-3 py-2 text-xs' : 'mb-4 px-4 py-3 text-sm'
        }`}>
          <AlertTriangle size={18} className="mt-0.5" />
          <div>
            <div className="font-semibold">Сначала выберите ученика</div>
            <div className="text-xs text-amber-700/80">Комната создаётся отдельно для каждого ученика.</div>
          </div>
        </div>
      )}

      <Card className={collabCardClass}>
        {!isCollabFullscreen && !isDesktopCollabCompact && (
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className={`text-xs font-bold uppercase tracking-widest ${collabLabelClass}`}>Сессия</div>
              <div className={`text-sm font-semibold ${collabSessionTextClass}`}>{sessionLabel}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <button
                type="button"
                onClick={handleFormatCode}
                disabled={!roomId}
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Автоформат
              </button>
            </div>
          </div>
        )}

        <div className={`${isCollabFullscreen || isDesktopCollabCompact ? 'mt-0 flex items-center justify-between gap-2' : ''}`}>
          <div className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border ${
            isCollabFullscreen ? 'mt-0 px-1.5 py-1' : (isDesktopCollabCompact ? 'mt-2 px-1.5 py-1' : 'mt-3 px-2 py-1.5')
          } ${collabToolbarClass}`}>
            {(isCollabFullscreen || isDesktopCollabCompact) && (
              <>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${collabSessionLabelClass}`}>Сессия</span>
                <span className={`max-w-[220px] truncate text-[11px] font-semibold ${collabSessionValueClass}`}>{sessionLabel}</span>
                <span className={`mx-1 h-5 w-px ${collabToolbarDividerClass}`} />
              </>
            )}
          <button
            type="button"
            onClick={() => handleRunCode('all')}
            disabled={runLoading || !roomId}
            className={`${collabIconButtonBase} ${
              runLoading || !roomId
                ? collabIconButtonDisabled
                : collabIconButtonPrimary
            }`}
            title="Запустить код"
            aria-label="Запустить код"
          >
            <Play size={15} />
          </button>
          <button
            type="button"
            onClick={() => handleRunCode('selection')}
            disabled={runLoading || !roomId}
            className={`${collabIconButtonBase} ${
              runLoading || !roomId
                ? collabIconButtonDisabled
                : collabIconButtonNeutral
            }`}
            title="Запустить выделенный фрагмент"
            aria-label="Запустить выделение"
          >
            <span className="relative inline-flex h-4 w-4 items-center justify-center">
              <MousePointer2 size={12} />
              <span className="absolute -right-1 -bottom-1 text-[8px] font-bold leading-none">?</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleRunCode('all', true)}
            disabled={runLoading || !roomId}
            className={`${collabIconButtonBase} ${
              runLoading || !roomId
                ? collabIconButtonDisabled
                : (debugActive
                  ? collabIconButtonPrimary
                  : collabIconButtonAccent)
            }`}
            title="Дебаг (до первой точки остановки)"
            aria-label="Дебаг"
          >
            <Bug size={15} />
          </button>

          {debugActive && (
            <>
              <span className={`mx-1 h-5 w-px ${collabToolbarDividerClass}`} />
              <button
                type="button"
                onClick={handleDebugStepBack}
                disabled={debugPlaying || debugStepIndex <= 0}
                className={`${collabIconButtonBase} ${
                  debugPlaying || debugStepIndex <= 0
                    ? collabIconButtonDisabled
                    : collabIconButtonNeutral
                }`}
                title="Шаг назад (F7)"
                aria-label="Шаг назад"
              >
                <StepBack size={15} />
              </button>
              <button
                type="button"
                onClick={handleDebugStepForward}
                disabled={debugPlaying || debugStepIndex >= debugTrace.length - 1}
                className={`${collabIconButtonBase} ${
                  debugPlaying || debugStepIndex >= debugTrace.length - 1
                    ? collabIconButtonDisabled
                    : collabIconButtonNeutral
                }`}
                title="Шаг вперёд (F10)"
                aria-label="Шаг вперёд"
              >
                <StepForward size={15} />
              </button>
              <button
                type="button"
                onClick={handleDebugContinue}
                disabled={debugPlaying || debugStepIndex >= debugTrace.length - 1}
                className={`${collabIconButtonBase} ${
                  debugPlaying || debugStepIndex >= debugTrace.length - 1
                    ? collabIconButtonDisabled
                    : collabIconButtonPrimary
                }`}
                title="Продолжить (F8)"
                aria-label="Продолжить"
              >
                <Play size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  stopDebugPlayback();
                  publishRunStateRef.current?.({ debugPlaying: false });
                }}
                disabled={!debugPlaying}
                className={`${collabIconButtonBase} ${
                  !debugPlaying
                    ? collabIconButtonDisabled
                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
                title="Пауза"
                aria-label="Пауза"
              >
                <Pause size={14} />
              </button>
            </>
          )}

          <span className={`mx-1 h-5 w-px ${collabToolbarDividerClass}`} />
          <button
            type="button"
            onClick={handleTopStop}
            disabled={!runLoading && !debugActive}
            className={`${collabIconButtonBase} ${
              !runLoading && !debugActive
                ? collabIconButtonDisabled
                : collabIconButtonDanger
            }`}
            title={runLoading ? 'Остановить выполнение (Ctrl+C)' : 'Выйти из дебага (Esc)'}
            aria-label="Остановить"
          >
            <Square size={14} />
          </button>
          <button
            type="button"
            onClick={handleClearRun}
            disabled={!runOutput && !runError && runStatus === 'idle' && !lastRunInput && !debugActive}
            className={`${collabIconButtonBase} ${
              !runOutput && !runError && runStatus === 'idle' && !lastRunInput && !debugActive
                ? collabIconButtonDisabled
                : collabIconButtonNeutral
            }`}
            title="Очистить вывод"
            aria-label="Очистить вывод"
          >
            <Trash2 size={14} />
          </button>
          </div>
          {(isCollabFullscreen || isDesktopCollabCompact) && (
            <button
              type="button"
              onClick={handleFormatCode}
              disabled={!roomId}
              className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
                isCollabFullscreen
                  ? 'border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Автоформат
            </button>
          )}
        </div>

        {isSplitCollabLayout ? (
          <div
            ref={splitLayoutRef}
            className={`${isDesktopCollabCompact ? 'mt-2 flex-1' : 'mt-1'} grid min-h-0 items-stretch gap-0.5`}
            style={{
              gridTemplateColumns: isDesktopCollabCompact
                ? `minmax(360px, ${splitLeftWidth}fr) 10px minmax(280px, ${100 - splitLeftWidth}fr)`
                : `minmax(420px, ${splitLeftWidth}fr) 10px minmax(300px, ${100 - splitLeftWidth}fr)`,
              height: isDesktopCollabCompact ? '100%' : undefined,
            }}
          >
            <div className="min-h-0 min-w-0">
              {editorPane}
            </div>
            <div
              role="separator"
              aria-label="Изменить ширину панелей"
              aria-orientation="vertical"
              aria-valuemin={48}
              aria-valuemax={82}
              aria-valuenow={Math.round(splitLeftWidth)}
              onPointerDown={handleSplitResizeStart}
              onDoubleClick={handleSplitResizeReset}
              className="group relative flex w-[10px] cursor-col-resize select-none items-center justify-center"
              title="Перетащите, чтобы изменить ширину. Двойной клик — сброс."
            >
              <div className={`h-full w-[2px] rounded-full transition ${
                isCollabFullscreen
                  ? 'bg-slate-700/80 group-hover:bg-violet-400/80'
                  : 'bg-gray-300 group-hover:bg-purple-400'
              }`} />
            </div>
            <div className="min-h-0 min-w-0">
              <div className="flex min-h-0 flex-col gap-1.5" style={{ height: editorHeight }}>
                <div className={`min-h-0 flex flex-1 flex-col rounded-2xl border p-2 ${
                  isCollabFullscreen
                    ? 'border-slate-700/80 bg-slate-950/60'
                    : 'border-gray-200 bg-white'
                }`}>
                  {resultHeader}
                  <div className="mt-2 min-h-0 flex-1">
                    {resultConsole}
                  </div>
                </div>
                {debugPane}
                {inputPane}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={isCollabFullscreen ? 'mt-2' : 'mt-4'}>
              {editorPane}
            </div>
            <div className={`grid grid-cols-1 lg:grid-cols-3 ${isCollabFullscreen ? 'mt-1 gap-1.5' : 'mt-4 gap-3'}`}>
              <div>
                {inputPane}
              </div>
              <div className="lg:col-span-2 space-y-2">
                {resultHeader}
                {resultConsole}
                {debugPane}
              </div>
            </div>
          </>
        )}
      </Card>
      {typeof document !== 'undefined' ? createPortal(saveModal, document.body) : null}
    </div>
  );
};

const BoardSection = ({
  role,
  userId,
  userName,
  teacherId,
  tasks,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
}) => {
  const isTeacher = role === 'teacher';
  const effectiveStudentId = isTeacher ? activeStudentId : userId;
  const roomId = effectiveStudentId && teacherId ? `board-${teacherId}-${effectiveStudentId}` : null;
  const taskOptions = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const wsUrl = useMemo(() => getCollabWsUrl(), []);
  const localName = userName || (isTeacher ? 'Учитель' : 'Ученик');
  const localColor = useMemo(
    () => pickCollabColor(isTeacher ? `teacher-${teacherId}` : `student-${userId}`),
    [isTeacher, teacherId, userId]
  );

  const [status, setStatus] = useState('disconnected');
  const [peerCount, setPeerCount] = useState(0);
  const [boardItems, setBoardItems] = useState([]);
  const [remotePreviews, setRemotePreviews] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(BOARD_COLORS[0] || '#0f172a');
  const [penWidth, setPenWidth] = useState(BOARD_STROKE_WIDTH);
  const [lineWidth, setLineWidth] = useState(BOARD_LINE_WIDTH);
  const [boardSize, setBoardSize] = useState({ width: 900, height: 520 });
  const [pasteError, setPasteError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);
  const [summonNotice, setSummonNotice] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [shareMyCursor, setShareMyCursor] = useState(true);
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTaskNumber, setSaveTaskNumber] = useState(() => String(taskOptions[0]?.number || ''));
  const [saveCategory, setSaveCategory] = useState('class');
  const [saveFolderId, setSaveFolderId] = useState('');
  const [saveFileName, setSaveFileName] = useState('');
  const [folders, setFolders] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveNameError, setSaveNameError] = useState(false);

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const boardRootRef = useRef(null);
  const docRef = useRef(null);
  const yItemsRef = useRef(null);
  const providerRef = useRef(null);
  const awarenessRef = useRef(null);
  const undoManagerRef = useRef(null);
  const localOriginRef = useRef(Symbol('board-origin'));
  const previewRafRef = useRef(null);
  const cursorRafRef = useRef(null);
  const pendingCursorRef = useRef(null);
  const lastCursorSyncAtRef = useRef(0);
  const lastPreviewSyncAtRef = useRef(0);
  const imageDragRafRef = useRef(null);
  const pendingImageMoveRef = useRef(null);
  const renderRef = useRef(null);
  const lastSummonIdRef = useRef(null);
  const summonTimeoutRef = useRef(null);
  const summonNoticeTimeoutRef = useRef(null);
  const eraserStateRef = useRef({ active: false });
  const settingsRef = useRef(null);
  const selectionRef = useRef(null);
  const selectedIdsRef = useRef([]);
  const selectingRef = useRef({ active: false, start: null, current: null });
  const selectionDragRef = useRef({ active: false, startX: 0, startY: 0, items: null, baseSelection: null });
  const selectionMoveRafRef = useRef(null);
  const pendingSelectionMoveRef = useRef({ dx: 0, dy: 0 });
  const boardSizeRef = useRef(boardSize);
  const offsetRef = useRef(offset);
  const zoomRef = useRef(zoom);
  const imageCacheRef = useRef(new Map());
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const drawStateRef = useRef({ drawing: false, points: [], start: null, end: null });
  const panStateRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const dragImageRef = useRef({ active: false, id: null, offsetX: 0, offsetY: 0 });
  const minimapRef = useRef(null);

  const selectedStudent = useMemo(
    () => (students || []).find((student) => student.id === activeStudentId),
    [students, activeStudentId]
  );
  const cursorVisibilityStorageKey = useMemo(
    () => `board-share-cursor-${userId || role || 'anon'}`,
    [userId, role]
  );
  const lowBandwidthStorageKey = useMemo(
    () => `board-low-bandwidth-${userId || role || 'anon'}`,
    [userId, role]
  );

  const deleteItemsByIds = useCallback((ids) => {
    const yItems = yItemsRef.current;
    const docInstance = docRef.current;
    if (!yItems || !docInstance || !Array.isArray(ids) || ids.length === 0) return false;
    const idsSet = new Set(ids.filter(Boolean));
    if (!idsSet.size) return false;
    let removedCount = 0;
    docInstance.transact(() => {
      for (let i = yItems.length - 1; i >= 0; i -= 1) {
        const raw = yItems.get(i);
        const item = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
        if (!idsSet.has(item?.id)) continue;
        yItems.delete(i, 1);
        removedCount += 1;
      }
    }, localOriginRef.current);
    if (removedCount > 0) {
      undoManagerRef.current?.stopCapturing();
      return true;
    }
    return false;
  }, []);

  const handleDeleteSelection = useCallback(() => {
    const selected = selectedIdsRef.current || [];
    const idsToDelete = selected.length
      ? selected
      : (selectedImageId ? [selectedImageId] : []);
    if (!idsToDelete.length) return false;
    const deleted = deleteItemsByIds(idsToDelete);
    if (!deleted) return false;
    selectingRef.current.active = false;
    selectionDragRef.current.active = false;
    selectionDragRef.current.items = null;
    selectionDragRef.current.baseSelection = null;
    if (selectionMoveRafRef.current) {
      cancelAnimationFrame(selectionMoveRafRef.current);
      selectionMoveRafRef.current = null;
    }
    pendingSelectionMoveRef.current = { dx: 0, dy: 0 };
    setSelectedIds([]);
    setSelectionBox(null);
    setSelectedImageId(null);
    return true;
  }, [selectedImageId, deleteItemsByIds]);

  const scheduleCursorUpdate = useCallback((point) => {
    if (!awarenessRef.current || !roomId) return;
    if (!shareMyCursor) {
      pendingCursorRef.current = null;
      awarenessRef.current.setLocalStateField('cursor', null);
      return;
    }
    pendingCursorRef.current = point || null;
    if (cursorRafRef.current) return;
    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = null;
      if (!awarenessRef.current || !roomId) return;
      const nextPoint = pendingCursorRef.current;
      const canThrottle = Boolean(nextPoint);
      const now = Date.now();
      if (
        lowBandwidthMode
        && canThrottle
        && (now - lastCursorSyncAtRef.current) < BOARD_LOW_BANDWIDTH_CURSOR_MS
      ) {
        return;
      }
      lastCursorSyncAtRef.current = now;
      pendingCursorRef.current = null;
      if (
        nextPoint
        && Number.isFinite(Number(nextPoint.x))
        && Number.isFinite(Number(nextPoint.y))
      ) {
        awarenessRef.current.setLocalStateField('cursor', {
          x: Number(nextPoint.x),
          y: Number(nextPoint.y),
        });
        return;
      }
      awarenessRef.current.setLocalStateField('cursor', null);
    });
  }, [roomId, shareMyCursor, lowBandwidthMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(cursorVisibilityStorageKey);
    if (raw == null) {
      setShareMyCursor(true);
      return;
    }
    setShareMyCursor(raw !== '0');
  }, [cursorVisibilityStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(cursorVisibilityStorageKey, shareMyCursor ? '1' : '0');
  }, [cursorVisibilityStorageKey, shareMyCursor]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(lowBandwidthStorageKey);
    if (raw == null) {
      setLowBandwidthMode(false);
      return;
    }
    setLowBandwidthMode(raw === '1');
  }, [lowBandwidthStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(lowBandwidthStorageKey, lowBandwidthMode ? '1' : '0');
  }, [lowBandwidthStorageKey, lowBandwidthMode]);

  useEffect(() => {
    if (!awarenessRef.current || !roomId) return;
    if (!shareMyCursor) {
      pendingCursorRef.current = null;
      awarenessRef.current.setLocalStateField('cursor', null);
      return;
    }
    const point = lastPointerRef.current;
    if (
      point
      && Number.isFinite(Number(point.x))
      && Number.isFinite(Number(point.y))
    ) {
      awarenessRef.current.setLocalStateField('cursor', {
        x: Number(point.x),
        y: Number(point.y),
      });
    }
  }, [shareMyCursor, roomId]);

  useEffect(() => {
    boardSizeRef.current = boardSize;
  }, [boardSize]);

  useEffect(() => {
    const centerX = offset.x + (boardSize.width / (zoom || 1)) / 2;
    const centerY = offset.y + (boardSize.height / (zoom || 1)) / 2;
    lastPointerRef.current = { x: centerX, y: centerY };
  }, [boardSize.width, boardSize.height, zoom, offset]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (tool !== 'move' && selectedImageId) setSelectedImageId(null);
  }, [tool, selectedImageId]);

  useEffect(() => {
    if (tool !== 'select') {
      setSelectionBox(null);
      setSelectedIds([]);
      selectingRef.current.active = false;
      selectionDragRef.current.active = false;
    }
  }, [tool]);

  useEffect(() => {
    if (!selectedImageId) return;
    const exists = boardItems.some((item) => item?.id === selectedImageId && item.type === 'image');
    if (!exists) setSelectedImageId(null);
  }, [boardItems, selectedImageId]);

  useEffect(() => {
    selectionRef.current = selectionBox;
  }, [selectionBox]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
    if (selectedIds.length === 0 && !selectingRef.current.active) {
      setSelectionBox(null);
    }
  }, [selectedIds]);

  useEffect(() => {
    if (selectedIdsRef.current.length === 0) return;
    const existingIds = new Set(boardItems.map((item) => item?.id).filter(Boolean));
    const filtered = selectedIdsRef.current.filter((id) => existingIds.has(id));
    if (filtered.length !== selectedIdsRef.current.length) {
      setSelectedIds(filtered);
    }
  }, [boardItems]);

  useEffect(() => {
    if (!effectiveStudentId || !saveTaskNumber || !saveCategory) {
      setFolders([]);
      setFoldersError('');
      setFoldersLoading(false);
      return;
    }
    let cancelled = false;
    setFoldersLoading(true);
    api.getFolders(Number(saveTaskNumber), saveCategory, effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setFolders(Array.isArray(data) ? data : []);
        setFoldersError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setFolders([]);
        setFoldersError(err?.message || 'Не удалось загрузить папки.');
      })
      .finally(() => {
        if (!cancelled) setFoldersLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId, saveTaskNumber, saveCategory]);

  useEffect(() => {
    setSaveFolderId('');
    setSaveError('');
    setSaveSuccess('');
    setSaveNameError(false);
  }, [saveTaskNumber, saveCategory, effectiveStudentId]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    };
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    const isEditableTarget = (target) => {
      const element = target;
      if (!element || typeof element !== 'object') return false;
      if (element.isContentEditable) return true;
      const tagName = element.tagName;
      return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    };
    const handleKeyDown = (event) => {
      if (event.code === 'Space') setIsSpaceDown(true);
      const key = String(event.key || '').toLowerCase();
      const code = event.code;
      const isDeleteKey = code === 'Delete' || key === 'delete' || code === 'Backspace' || key === 'backspace';
      if (isDeleteKey && !isEditableTarget(event.target)) {
        if (handleDeleteSelection()) {
          event.preventDefault();
        }
        return;
      }
      const hasModifier = event.ctrlKey || event.metaKey;
      if (!hasModifier) return;
      const isUndoKey = code === 'KeyZ' || key === 'z' || key === 'я';
      const isRedoKey = code === 'KeyY' || key === 'y' || key === 'н' || (isUndoKey && event.shiftKey);
      if (!isUndoKey && !isRedoKey) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      const undoManager = undoManagerRef.current;
      if (!undoManager) return;
      if (isRedoKey) {
        if (undoManager.redoStack?.length) undoManager.redo();
      } else if (undoManager.undoStack?.length) {
        undoManager.undo();
      }
    };
    const handleKeyUp = (event) => {
      if (event.code === 'Space') setIsSpaceDown(false);
    };
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleDeleteSelection]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = typeof document !== 'undefined' && document.fullscreenElement === boardRootRef.current;
      setIsFullscreen(active);
    };
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const getCanvasPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const currentZoom = zoomRef.current || 1;
    const worldX = offsetRef.current.x + screenX / currentZoom;
    const worldY = offsetRef.current.y + screenY / currentZoom;
    return {
      x: worldX,
      y: worldY,
    };
  };

  const getPenPressure = (event) => {
    if (event?.pointerType !== 'pen') return null;
    const raw = Number(event.pressure);
    if (!Number.isFinite(raw)) return null;
    return clamp(raw, 0, 1);
  };

  const withPenPressure = (point, event) => {
    const pressure = getPenPressure(event);
    if (!Number.isFinite(pressure)) return point;
    return {
      ...point,
      pressure,
    };
  };

  const zoomAt = (nextZoom, centerX, centerY) => {
    const clamped = clamp(nextZoom, BOARD_MIN_ZOOM, BOARD_MAX_ZOOM);
    const currentZoom = zoomRef.current || 1;
    if (clamped === currentZoom) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const screenX = rect ? (centerX - rect.left) : boardSizeRef.current.width / 2;
    const screenY = rect ? (centerY - rect.top) : boardSizeRef.current.height / 2;
    const worldX = offsetRef.current.x + screenX / currentZoom;
    const worldY = offsetRef.current.y + screenY / currentZoom;
    setZoom(clamped);
    setOffset({
      x: worldX - screenX / clamped,
      y: worldY - screenY / clamped,
    });
  };

  const zoomBy = (factor) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : boardSizeRef.current.width / 2;
    const centerY = rect ? rect.top + rect.height / 2 : boardSizeRef.current.height / 2;
    zoomAt((zoomRef.current || 1) * factor, centerX, centerY);
  };

  const toggleFullscreen = async () => {
    if (typeof document === 'undefined') return;
    const root = boardRootRef.current;
    try {
      if (!document.fullscreenElement && root?.requestFullscreen) {
        await root.requestFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch { /* no-op */ }
  };

  const handleSummonStudent = () => {
    if (!awarenessRef.current || !roomId) return;
    const summonPayload = {
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      ts: Date.now(),
      zoom: zoomRef.current || 1,
      offset: { ...offsetRef.current },
    };
    if (summonTimeoutRef.current) clearTimeout(summonTimeoutRef.current);
    awarenessRef.current.setLocalStateField('summon', summonPayload);
    summonTimeoutRef.current = setTimeout(() => {
      awarenessRef.current?.setLocalStateField('summon', null);
    }, 4000);
  };

  const normalizeFileName = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/[\\/]+/g, '').replace(/\0/g, '');
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setFoldersError('Введите название папки.');
      return;
    }
    if (!effectiveStudentId || !saveTaskNumber || !saveCategory) return;
    if (creatingFolder) return;
    setCreatingFolder(true);
    try {
      const created = await api.createFolder(Number(saveTaskNumber), saveCategory, name, effectiveStudentId);
      setFolders((prev) => [created, ...prev]);
      setSaveFolderId(created.id);
      setNewFolderName('');
      setFoldersError('');
    } catch (err) {
      setFoldersError(err?.message || err);
    } finally {
      setCreatingFolder(false);
    }
  };

  const getBoardBounds = (items) => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const includePoint = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };

    items.forEach((item) => {
      if (!item) return;
      if (item.type === 'stroke') {
        (item.points || []).forEach((pt) => includePoint(pt?.x, pt?.y));
      } else if (item.type === 'line') {
        includePoint(item.start?.x, item.start?.y);
        includePoint(item.end?.x, item.end?.y);
      } else if (item.type === 'image') {
        includePoint(item.x, item.y);
        includePoint((item.x || 0) + (item.width || 0), (item.y || 0) + (item.height || 0));
      }
    });

    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  };

  const renderBoardToBlob = async () => {
    if (typeof document === 'undefined') {
      throw new Error('Нельзя сохранить доску в этом окружении.');
    }
    const bounds = getBoardBounds(boardItems);
    if (!bounds) throw new Error('Доска пустая.');
    const padding = BOARD_EXPORT_PADDING;
    const width = Math.max(1, bounds.maxX - bounds.minX + padding * 2);
    const height = Math.max(1, bounds.maxY - bounds.minY + padding * 2);
    const maxDim = Math.max(width, height);
    const scale = maxDim > BOARD_EXPORT_MAX_SIZE ? BOARD_EXPORT_MAX_SIZE / maxDim : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось подготовить холст.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      scale,
      0,
      0,
      scale,
      (padding - bounds.minX) * scale,
      (padding - bounds.minY) * scale
    );

    const imageItems = boardItems.filter((item) => item?.type === 'image' && item.dataUrl);
    const imageMap = new Map();
    await Promise.all(imageItems.map(async (item) => {
      if (!item?.dataUrl || imageMap.has(item.dataUrl)) return;
      const img = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = item.dataUrl;
      });
      if (img) imageMap.set(item.dataUrl, img);
    }));

    boardItems.forEach((item) => {
      if (!item) return;
      if (item.type === 'stroke') drawStroke(ctx, item, canvas.width, canvas.height);
      if (item.type === 'line') drawLine(ctx, item, canvas.width, canvas.height);
      if (item.type === 'image') {
        const img = imageMap.get(item.dataUrl);
        if (!img) return;
        const w = Math.max(1, item.width || 0);
        const h = Math.max(1, item.height || 0);
        const x = item.x || 0;
        const y = item.y || 0;
        ctx.drawImage(img, x, y, w, h);
      }
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error('Не удалось сформировать изображение.'));
        else resolve(blob);
      }, 'image/png');
    });
  };

  const handleSaveBoardToNotes = async () => {
    setSaveError('');
    setSaveSuccess('');
    setSaveNameError(false);
    if (!effectiveStudentId) {
      setSaveError('Сначала выберите ученика.');
      return;
    }
    if (!saveTaskNumber || !saveCategory) {
      setSaveError('Выберите задание и категорию.');
      return;
    }
    if (!boardItems.length) {
      setSaveError('Доска пустая.');
      return;
    }
    setSaveBusy(true);
    try {
      const blob = await renderBoardToBlob();
      if (blob.size > 50 * 1024 * 1024) {
        throw new Error('Файл слишком большой (максимум 50 МБ). Уменьшите размер доски.');
      }
      const baseName = normalizeFileName(saveFileName);
      if (!baseName) {
        setSaveError('Введите название файла.');
        setSaveNameError(true);
        setSaveBusy(false);
        return;
      }
      let safeName = baseName;
      const prefix = 'конспект-';
      if (!safeName.toLowerCase().startsWith(prefix)) {
        safeName = `${prefix}${safeName}`;
      }
      if (!/\.[a-z0-9]+$/i.test(safeName)) {
        safeName += '.png';
      }
      const file = new File([blob], safeName, { type: 'image/png' });
      await api.uploadFile(file, Number(saveTaskNumber), saveCategory, saveFolderId || null, effectiveStudentId);
      setSaveSuccess('Сохранено в конспекты.');
    } catch (err) {
      setSaveError(err?.message || err);
    } finally {
      setSaveBusy(false);
    }
  };

  const findImageAtPoint = (point) => {
    for (let i = boardItems.length - 1; i >= 0; i -= 1) {
      const item = boardItems[i];
      if (!item || item.type !== 'image') continue;
      const x = item.x || 0;
      const y = item.y || 0;
      const w = item.width || 0;
      const h = item.height || 0;
      if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) {
        return { item, index: i };
      }
    }
    return null;
  };

  const updateImagePosition = (id, x, y) => {
    const yItems = yItemsRef.current;
    const docInstance = docRef.current;
    if (!yItems || !docInstance) return;
    docInstance.transact(() => {
      for (let i = yItems.length - 1; i >= 0; i -= 1) {
        const raw = yItems.get(i);
        const item = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
        if (item?.id === id) {
          const next = { ...item, x, y };
          yItems.delete(i, 1);
          yItems.insert(i, [next]);
          break;
        }
      }
    }, localOriginRef.current);
  };

  const scheduleImageMove = (id, x, y) => {
    pendingImageMoveRef.current = { id, x, y };
    if (imageDragRafRef.current) return;
    imageDragRafRef.current = requestAnimationFrame(() => {
      imageDragRafRef.current = null;
      const next = pendingImageMoveRef.current;
      if (next) updateImagePosition(next.id, next.x, next.y);
    });
  };

  const resizeImageByFactor = (id, factor) => {
    const item = boardItems.find((entry) => entry?.id === id && entry.type === 'image');
    if (!item) return;
    const currentWidth = Math.max(1, Number(item.width) || 1);
    const currentHeight = Math.max(1, Number(item.height) || 1);
    const minFactor = Math.max(BOARD_IMAGE_MIN_SIZE / currentWidth, BOARD_IMAGE_MIN_SIZE / currentHeight);
    const maxFactor = Math.min(BOARD_IMAGE_MAX_SIZE / currentWidth, BOARD_IMAGE_MAX_SIZE / currentHeight);
    let nextFactor = factor;
    if (factor >= 1) {
      nextFactor = Math.min(factor, maxFactor);
      if (nextFactor < 1) nextFactor = 1;
    } else {
      nextFactor = Math.max(factor, minFactor);
      if (nextFactor > 1) nextFactor = 1;
    }
    if (!Number.isFinite(nextFactor) || nextFactor === 1) return;
    const nextWidth = currentWidth * nextFactor;
    const nextHeight = currentHeight * nextFactor;
    const centerX = (item.x || 0) + currentWidth / 2;
    const centerY = (item.y || 0) + currentHeight / 2;
    const nextX = centerX - nextWidth / 2;
    const nextY = centerY - nextHeight / 2;
    const yItems = yItemsRef.current;
    const docInstance = docRef.current;
    if (!yItems || !docInstance) return;
    docInstance.transact(() => {
      for (let i = yItems.length - 1; i >= 0; i -= 1) {
        const raw = yItems.get(i);
        const entry = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
        if (entry?.id === id) {
          const next = {
            ...entry,
            width: nextWidth,
            height: nextHeight,
            x: nextX,
            y: nextY,
          };
          yItems.delete(i, 1);
          yItems.insert(i, [next]);
          break;
        }
      }
    }, localOriginRef.current);
    undoManagerRef.current?.stopCapturing();
  };

  const distanceToSegmentSquared = (point, a, b) => {
    const ax = a.x || 0;
    const ay = a.y || 0;
    const bx = b.x || 0;
    const by = b.y || 0;
    const px = point.x || 0;
    const py = point.y || 0;
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) {
      const dxp = px - ax;
      const dyp = py - ay;
      return dxp * dxp + dyp * dyp;
    }
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    const closestX = ax + clamped * dx;
    const closestY = ay + clamped * dy;
    const diffX = px - closestX;
    const diffY = py - closestY;
    return diffX * diffX + diffY * diffY;
  };

  const hitTestStroke = (stroke, point, radius) => {
    const points = Array.isArray(stroke?.points) ? stroke.points : [];
    if (points.length === 0) return false;
    const width = Number(stroke.width) || BOARD_STROKE_WIDTH;
    const threshold = radius + width / 2;
    const thresholdSq = threshold * threshold;
    if (points.length === 1) {
      const dx = (point.x || 0) - (points[0].x || 0);
      const dy = (point.y || 0) - (points[0].y || 0);
      return (dx * dx + dy * dy) <= thresholdSq;
    }
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      if (distanceToSegmentSquared(point, a, b) <= thresholdSq) return true;
    }
    return false;
  };

  const hitTestLine = (line, point, radius) => {
    if (!line?.start || !line?.end) return false;
    const width = Number(line.width) || BOARD_LINE_WIDTH;
    const threshold = radius + width / 2;
    return distanceToSegmentSquared(point, line.start, line.end) <= threshold * threshold;
  };

  const eraseAtPoint = (point) => {
    const yItems = yItemsRef.current;
    const docInstance = docRef.current;
    if (!yItems || !docInstance) return;
    for (let i = yItems.length - 1; i >= 0; i -= 1) {
      const raw = yItems.get(i);
      const item = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
      if (!item) continue;
      let hit = false;
      if (item.type === 'stroke') hit = hitTestStroke(item, point, BOARD_ERASER_RADIUS);
      else if (item.type === 'line') hit = hitTestLine(item, point, BOARD_ERASER_RADIUS);
      if (!hit) continue;
      docInstance.transact(() => {
        yItems.delete(i, 1);
      }, localOriginRef.current);
      return;
    }
  };

  const getItemBounds = (item) => {
    if (!item) return null;
    if (item.type === 'stroke') {
      const points = Array.isArray(item.points) ? item.points : [];
      if (points.length === 0) return null;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      points.forEach((pt) => {
        if (!pt) return;
        minX = Math.min(minX, pt.x || 0);
        minY = Math.min(minY, pt.y || 0);
        maxX = Math.max(maxX, pt.x || 0);
        maxY = Math.max(maxY, pt.y || 0);
      });
      if (!Number.isFinite(minX)) return null;
      return { minX, minY, maxX, maxY };
    }
    if (item.type === 'line') {
      const start = item.start || { x: 0, y: 0 };
      const end = item.end || { x: 0, y: 0 };
      const minX = Math.min(start.x || 0, end.x || 0);
      const minY = Math.min(start.y || 0, end.y || 0);
      const maxX = Math.max(start.x || 0, end.x || 0);
      const maxY = Math.max(start.y || 0, end.y || 0);
      return { minX, minY, maxX, maxY };
    }
    if (item.type === 'image') {
      const x = item.x || 0;
      const y = item.y || 0;
      const w = item.width || 0;
      const h = item.height || 0;
      return { minX: x, minY: y, maxX: x + w, maxY: y + h };
    }
    return null;
  };

  const normalizeRect = (start, current) => {
    const x1 = start?.x ?? 0;
    const y1 = start?.y ?? 0;
    const x2 = current?.x ?? x1;
    const y2 = current?.y ?? y1;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  const rectIntersects = (rect, bounds) => {
    if (!rect || !bounds) return false;
    const rectMaxX = rect.x + rect.width;
    const rectMaxY = rect.y + rect.height;
    return !(
      bounds.maxX < rect.x ||
      bounds.minX > rectMaxX ||
      bounds.maxY < rect.y ||
      bounds.minY > rectMaxY
    );
  };

  const isPointInRect = (point, rect) => {
    if (!rect) return false;
    const x = point.x || 0;
    const y = point.y || 0;
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  };

  const getItemsInRect = (rect) => {
    if (!rect) return [];
    return boardItems
      .filter((item) => rectIntersects(rect, getItemBounds(item)))
      .map((item) => item.id)
      .filter(Boolean);
  };

  const getItemsAtPoint = (point) => {
    return boardItems
      .filter((item) => {
        if (!item) return false;
        if (item.type === 'image') {
          const x = item.x || 0;
          const y = item.y || 0;
          const w = item.width || 0;
          const h = item.height || 0;
          return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
        }
        if (item.type === 'stroke') return hitTestStroke(item, point, BOARD_SELECTION_HIT_RADIUS);
        if (item.type === 'line') return hitTestLine(item, point, BOARD_SELECTION_HIT_RADIUS);
        return false;
      })
      .map((item) => item.id)
      .filter(Boolean);
  };

  const getSelectionBoundsFromIds = (ids) => {
    if (!ids?.length) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    boardItems.forEach((item) => {
      if (!item || !ids.includes(item.id)) return;
      const bounds = getItemBounds(item);
      if (!bounds) return;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });
    if (!Number.isFinite(minX)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  const buildSelectionSnapshot = (ids) => {
    if (!ids?.length) return [];
    return boardItems
      .filter((item) => item && ids.includes(item.id))
      .map((item) => {
        if (item.type === 'stroke') {
          return {
            id: item.id,
            type: 'stroke',
            points: (item.points || []).map((pt) => {
              const pressure = Number(pt?.pressure);
              if (Number.isFinite(pressure)) {
                return { x: pt?.x || 0, y: pt?.y || 0, pressure };
              }
              return { x: pt?.x || 0, y: pt?.y || 0 };
            }),
          };
        }
        if (item.type === 'line') {
          return {
            id: item.id,
            type: 'line',
            start: { x: item.start?.x || 0, y: item.start?.y || 0 },
            end: { x: item.end?.x || 0, y: item.end?.y || 0 },
          };
        }
        if (item.type === 'image') {
          return {
            id: item.id,
            type: 'image',
            x: item.x || 0,
            y: item.y || 0,
          };
        }
        return null;
      })
      .filter(Boolean);
  };

  const applySelectionMove = (dx, dy) => {
    const yItems = yItemsRef.current;
    const docInstance = docRef.current;
    const snapshot = selectionDragRef.current.items;
    if (!yItems || !docInstance || !snapshot?.length) return;
    docInstance.transact(() => {
      snapshot.forEach((item) => {
        for (let i = yItems.length - 1; i >= 0; i -= 1) {
          const raw = yItems.get(i);
          const current = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
          if (current?.id !== item.id) continue;
          let next = current;
          if (current.type === 'stroke') {
            const points = (item.points || []).map((pt) => {
              const pressure = Number(pt?.pressure);
              if (Number.isFinite(pressure)) {
                return { x: (pt.x || 0) + dx, y: (pt.y || 0) + dy, pressure };
              }
              return { x: (pt.x || 0) + dx, y: (pt.y || 0) + dy };
            });
            next = { ...current, points };
          } else if (current.type === 'line') {
            next = {
              ...current,
              start: { x: (item.start?.x || 0) + dx, y: (item.start?.y || 0) + dy },
              end: { x: (item.end?.x || 0) + dx, y: (item.end?.y || 0) + dy },
            };
          } else if (current.type === 'image') {
            next = { ...current, x: (item.x || 0) + dx, y: (item.y || 0) + dy };
          }
          yItems.delete(i, 1);
          yItems.insert(i, [next]);
          break;
        }
      });
    }, localOriginRef.current);
  };

  const scheduleSelectionMove = (dx, dy) => {
    pendingSelectionMoveRef.current = { dx, dy };
    if (selectionMoveRafRef.current) return;
    selectionMoveRafRef.current = requestAnimationFrame(() => {
      selectionMoveRafRef.current = null;
      const pending = pendingSelectionMoveRef.current;
      if (!pending) return;
      applySelectionMove(pending.dx, pending.dy);
    });
  };

  const drawSmoothStrokePath = (ctx, points, mapPoint = (point) => point) => {
    const mapAndNormalize = (point) => {
      const nextPoint = mapPoint(point || {});
      return {
        x: nextPoint?.x || 0,
        y: nextPoint?.y || 0,
      };
    };
    if (!Array.isArray(points) || points.length === 0) return;
    const first = mapAndNormalize(points[0]);
    ctx.moveTo(first.x, first.y);
    if (points.length === 1) return;
    if (points.length === 2) {
      const second = mapAndNormalize(points[1]);
      ctx.lineTo(second.x, second.y);
      return;
    }
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = mapAndNormalize(points[index]);
      const next = mapAndNormalize(points[index + 1]);
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    const penultimate = mapAndNormalize(points[points.length - 2]);
    const last = mapAndNormalize(points[points.length - 1]);
    ctx.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
  };

  const getPressurePointWidth = (baseWidth, point) => {
    const pressure = Number(point?.pressure);
    if (!Number.isFinite(pressure)) return baseWidth;
    const normalized = clamp(pressure, 0, 1);
    const ratio = BOARD_PRESSURE_MIN_RATIO + (1 - BOARD_PRESSURE_MIN_RATIO) * normalized;
    return Math.max(0.1, baseWidth * ratio);
  };

  const drawPressureStroke = (ctx, points, baseWidth) => {
    if (!Array.isArray(points) || points.length < 2) return;
    const normalizePoint = (point) => ({
      x: point?.x || 0,
      y: point?.y || 0,
      width: getPressurePointWidth(baseWidth, point),
    });
    const first = normalizePoint(points[0]);
    if (points.length === 2) {
      const second = normalizePoint(points[1]);
      ctx.lineWidth = (first.width + second.width) / 2;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(second.x, second.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(first.x, first.y, first.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(second.x, second.y, second.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    let previous = first;
    let previousWidth = first.width;
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = normalizePoint(points[index]);
      const next = normalizePoint(points[index + 1]);
      const midpoint = {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
        width: (current.width + next.width) / 2,
      };
      ctx.lineWidth = Math.max(0.1, (previousWidth + current.width + midpoint.width) / 3);
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
      ctx.stroke();
      previous = midpoint;
      previousWidth = midpoint.width;
    }
    const penultimate = normalizePoint(points[points.length - 2]);
    const last = normalizePoint(points[points.length - 1]);
    ctx.lineWidth = Math.max(0.1, (previousWidth + penultimate.width + last.width) / 3);
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(first.x, first.y, first.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(last.x, last.y, last.width / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawStroke = (ctx, stroke) => {
    const points = Array.isArray(stroke?.points) ? stroke.points : [];
    const lineWidth = Number(stroke.width) || BOARD_STROKE_WIDTH;
    const colorValue = stroke.color || '#0f172a';
    const hasPressure = points.some((point) => Number.isFinite(Number(point?.pressure)));
    if (points.length < 2) {
      if (points.length === 1) {
        const p = points[0];
        ctx.fillStyle = colorValue;
        ctx.beginPath();
        ctx.arc(p.x || 0, p.y || 0, getPressurePointWidth(lineWidth, p) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    ctx.strokeStyle = colorValue;
    ctx.fillStyle = colorValue;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (hasPressure) {
      drawPressureStroke(ctx, points, lineWidth);
      return;
    }
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    drawSmoothStrokePath(ctx, points);
    ctx.stroke();
  };

  const drawLine = (ctx, line) => {
    if (!line?.start || !line?.end) return;
    const lineWidth = line.width || BOARD_LINE_WIDTH;
    ctx.strokeStyle = line.color || '#0f172a';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(line.start.x || 0, line.start.y || 0);
    ctx.lineTo(line.end.x || 0, line.end.y || 0);
    ctx.stroke();
  };

  const getCachedImage = (dataUrl) => {
    if (!dataUrl) return null;
    const cached = imageCacheRef.current.get(dataUrl);
    if (cached) return cached;
    const img = new Image();
    const entry = { img, loaded: false };
    imageCacheRef.current.set(dataUrl, entry);
    img.onload = () => {
      entry.loaded = true;
      if (typeof renderRef.current === 'function') renderRef.current();
    };
    img.src = dataUrl;
    return entry;
  };

  const renderBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(zoomRef.current || 1, 0, 0, zoomRef.current || 1, -(offsetRef.current.x || 0) * (zoomRef.current || 1), -(offsetRef.current.y || 0) * (zoomRef.current || 1));
    boardItems.forEach((item) => {
      if (!item) return;
      if (item.type === 'stroke') drawStroke(ctx, item, width, height);
      if (item.type === 'line') drawLine(ctx, item, width, height);
      if (item.type === 'image') {
        const cacheEntry = getCachedImage(item.dataUrl);
        if (!cacheEntry?.img || !cacheEntry.loaded) return;
        const img = cacheEntry.img;
        const w = Math.max(1, item.width || 0);
        const h = Math.max(1, item.height || 0);
        const x = item.x || 0;
        const y = item.y || 0;
        ctx.drawImage(img, x, y, w, h);
      }
    });
  }, [boardItems]);

  useEffect(() => {
    renderRef.current = renderBoard;
  }, [renderBoard]);

  useEffect(() => {
    renderBoard();
  }, [renderBoard, boardSize]);

  const selectedImage = useMemo(
    () => boardItems.find((item) => item?.id === selectedImageId && item.type === 'image') || null,
    [boardItems, selectedImageId]
  );
  const selectedImageLabel = selectedImage
    ? `${Math.round(selectedImage.width || 0)}×${Math.round(selectedImage.height || 0)}`
    : '';

  const renderOverlay = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.setTransform(zoomRef.current || 1, 0, 0, zoomRef.current || 1, -(offsetRef.current.x || 0) * (zoomRef.current || 1), -(offsetRef.current.y || 0) * (zoomRef.current || 1));
    if (remotePreviews.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      remotePreviews.forEach((preview) => {
        if (preview?.type === 'stroke') {
          drawStroke(ctx, preview, overlay.width, overlay.height);
        } else if (preview?.type === 'line') {
          drawLine(ctx, preview, overlay.width, overlay.height);
        }
      });
      ctx.restore();
    }
    const state = drawStateRef.current;
    if (state.drawing) {
      if (tool === 'pen') {
        drawStroke(ctx, { points: state.points, color, width: penWidth }, overlay.width, overlay.height);
      }
      if (tool === 'line' && state.start && state.end) {
        drawLine(ctx, { start: state.start, end: state.end, color, width: lineWidth }, overlay.width, overlay.height);
      }
    }
    if (tool === 'select' && selectionBox) {
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.9)';
      ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
      ctx.lineWidth = 1.5 / (zoomRef.current || 1);
      ctx.setLineDash([6 / (zoomRef.current || 1), 4 / (zoomRef.current || 1)]);
      ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
      ctx.fillRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
      ctx.restore();
    }
    if (tool === 'move' && selectedImage) {
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.9)';
      ctx.lineWidth = 1.5 / (zoomRef.current || 1);
      ctx.setLineDash([6 / (zoomRef.current || 1), 4 / (zoomRef.current || 1)]);
      ctx.strokeRect(
        selectedImage.x || 0,
        selectedImage.y || 0,
        selectedImage.width || 0,
        selectedImage.height || 0
      );
      ctx.restore();
    }
  };

  useEffect(() => {
    renderOverlay();
  }, [remotePreviews, boardSize, tool, color, penWidth, lineWidth, selectedImage, selectionBox]);

  useEffect(() => {
    renderBoard();
    renderOverlay();
  }, [zoom, offset, renderBoard, remotePreviews, tool, color, penWidth, lineWidth, selectedImage]);

  useEffect(() => {
    const handleBlur = () => {
      setIsSpaceDown(false);
      panStateRef.current.active = false;
      scheduleCursorUpdate(null);
    };
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [scheduleCursorUpdate]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      setBoardSize({ width, height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    canvas.width = boardSize.width;
    canvas.height = boardSize.height;
    overlay.width = boardSize.width;
    overlay.height = boardSize.height;
    renderBoard();
    renderOverlay();
  }, [boardSize, renderBoard]);

  useEffect(() => {
    if (!roomId || !wsUrl) {
      setStatus('disconnected');
      setPeerCount(0);
      setBoardItems([]);
      setUndoState({ canUndo: false, canRedo: false });
      docRef.current = null;
      yItemsRef.current = null;
      providerRef.current = null;
      awarenessRef.current = null;
      undoManagerRef.current = null;
      setRemotePreviews([]);
      setRemoteCursors([]);
      return;
    }

    setStatus('connecting');
    const doc = new Y.Doc();
    lastSummonIdRef.current = null;
    docRef.current = doc;
    const provider = new WebsocketProvider(wsUrl, roomId, doc);
    providerRef.current = provider;
    awarenessRef.current = provider.awareness;
    const yItems = doc.getArray('items');
    yItemsRef.current = yItems;
    const undoManager = new Y.UndoManager(yItems, {
      trackedOrigins: new Set([localOriginRef.current]),
    });
    undoManagerRef.current = undoManager;

    const updateUndoState = () => {
      setUndoState({
        canUndo: undoManager.undoStack?.length > 0,
        canRedo: undoManager.redoStack?.length > 0,
      });
    };

    const updateItems = () => {
      const next = yItems.toArray().map((item) => (
        item && typeof item.toJSON === 'function' ? item.toJSON() : item
      ));
      setBoardItems(next);
    };

    const handleStatus = (event) => {
      if (event?.status) setStatus(event.status);
    };
    const handleAwareness = () => {
      const states = provider.awareness.getStates();
      const total = states.size;
      setPeerCount(Math.max(0, total - 1));
      const previews = [];
      const cursors = [];
      let incomingSummon = null;
      states.forEach((state, clientId) => {
        if (clientId === provider.awareness.clientID) return;
        const drawing = state?.drawing;
        if (drawing && (drawing.type === 'stroke' || drawing.type === 'line')) {
          previews.push(drawing);
        }
        const cursor = state?.cursor;
        if (
          cursor
          && Number.isFinite(Number(cursor?.x))
          && Number.isFinite(Number(cursor?.y))
        ) {
          const remoteUser = state?.user;
          const remoteName = typeof remoteUser?.name === 'string' && remoteUser.name.trim()
            ? remoteUser.name.trim()
            : 'Участник';
          const remoteColor = typeof remoteUser?.color === 'string' && remoteUser.color
            ? remoteUser.color
            : '#6366f1';
          cursors.push({
            id: String(clientId),
            x: Number(cursor.x),
            y: Number(cursor.y),
            name: remoteName,
            color: remoteColor,
          });
        }
        const summon = state?.summon;
        if (summon?.ts && (!incomingSummon || summon.ts > (incomingSummon.ts || 0))) {
          incomingSummon = summon;
        }
      });
      setRemotePreviews(previews);
      setRemoteCursors(cursors);
      if (!isTeacher && incomingSummon?.id && incomingSummon.id !== lastSummonIdRef.current) {
        lastSummonIdRef.current = incomingSummon.id;
        const nextZoom = clamp(Number(incomingSummon.zoom) || 1, BOARD_MIN_ZOOM, BOARD_MAX_ZOOM);
        const nextOffset = {
          x: Number(incomingSummon?.offset?.x) || 0,
          y: Number(incomingSummon?.offset?.y) || 0,
        };
        setZoom(nextZoom);
        setOffset(nextOffset);
        setSummonNotice(true);
        if (summonNoticeTimeoutRef.current) clearTimeout(summonNoticeTimeoutRef.current);
        summonNoticeTimeoutRef.current = setTimeout(() => {
          setSummonNotice(false);
        }, 3500);
      }
    };

    provider.awareness.setLocalStateField('user', { name: localName, color: localColor });
    provider.awareness.setLocalStateField('drawing', null);
    provider.awareness.setLocalStateField('cursor', null);
    provider.awareness.setLocalStateField('summon', null);
    provider.on('status', handleStatus);
    provider.awareness.on('change', handleAwareness);
    yItems.observe(updateItems);
    undoManager.on('stack-item-added', updateUndoState);
    undoManager.on('stack-item-popped', updateUndoState);
    undoManager.on('stack-item-updated', updateUndoState);
    undoManager.on('stack-item-removed', updateUndoState);
    updateItems();
    handleAwareness();
    updateUndoState();

    return () => {
      yItems.unobserve(updateItems);
      undoManager.off('stack-item-added', updateUndoState);
      undoManager.off('stack-item-popped', updateUndoState);
      undoManager.off('stack-item-updated', updateUndoState);
      undoManager.off('stack-item-removed', updateUndoState);
      provider.awareness.off('change', handleAwareness);
      provider.off('status', handleStatus);
      provider.awareness.setLocalStateField('drawing', null);
      provider.awareness.setLocalStateField('cursor', null);
      provider.awareness.setLocalStateField('summon', null);
      undoManagerRef.current = null;
      setUndoState({ canUndo: false, canRedo: false });
      setRemoteCursors([]);
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
      awarenessRef.current = null;
      docRef.current = null;
    };
  }, [roomId, wsUrl, localName, localColor, isTeacher]);

  useEffect(() => {
    const handlePaste = (event) => {
      if (!roomId || !yItemsRef.current) return;
      const clipboardItems = event.clipboardData?.items || [];
      const imageItem = Array.from(clipboardItems).find((item) => item.type?.startsWith('image/'));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      if (file.size > BOARD_MAX_IMAGE_BYTES) {
        setPasteError('Слишком большой файл. Максимум 10 МБ.');
        return;
      }
      event.preventDefault();
      setPasteError('');
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const img = new Image();
        img.onload = () => {
          const maxWidth = Math.min(img.width, BOARD_DEFAULT_IMAGE_MAX_WIDTH);
          const scale = img.width ? maxWidth / img.width : 1;
          const widthPx = img.width * scale;
          const heightPx = img.height * scale;
          const pointer = lastPointerRef.current || { x: 0, y: 0 };
          const x = pointer.x - widthPx / 2;
          const y = pointer.y - heightPx / 2;
          const entry = {
            id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
            type: 'image',
            dataUrl,
            x,
            y,
            width: widthPx,
            height: heightPx,
            authorId: userId,
          };
          const docInstance = docRef.current;
          if (docInstance && yItemsRef.current) {
            docInstance.transact(() => {
              yItemsRef.current?.push([entry]);
            }, localOriginRef.current);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    };

    if (typeof window === 'undefined') return undefined;
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [roomId, userId]);

  const schedulePreviewUpdate = () => {
    if (!awarenessRef.current) return;
    if (previewRafRef.current) return;
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = null;
      const state = drawStateRef.current;
      if (!state.drawing) {
        awarenessRef.current?.setLocalStateField('drawing', null);
        lastPreviewSyncAtRef.current = 0;
        return;
      }
      const now = Date.now();
      if (
        lowBandwidthMode
        && (now - lastPreviewSyncAtRef.current) < BOARD_LOW_BANDWIDTH_PREVIEW_MS
      ) {
        return;
      }
      lastPreviewSyncAtRef.current = now;
      if (tool === 'pen') {
        const sourcePoints = Array.isArray(state.points) ? state.points : [];
        const points = lowBandwidthMode && sourcePoints.length > 8
          ? sourcePoints.filter((_, index) => (
            index === sourcePoints.length - 1
            || index % BOARD_LOW_BANDWIDTH_POINT_STEP === 0
          ))
          : sourcePoints;
        awarenessRef.current?.setLocalStateField('drawing', {
          type: 'stroke',
          color,
          width: penWidth,
          points,
        });
      } else if (tool === 'line') {
        awarenessRef.current?.setLocalStateField('drawing', {
          type: 'line',
          color,
          width: lineWidth,
          start: state.start,
          end: state.end,
        });
      }
    });
  };

  useEffect(() => () => {
    if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
  }, []);

  useEffect(() => () => {
    if (cursorRafRef.current) cancelAnimationFrame(cursorRafRef.current);
  }, []);

  useEffect(() => () => {
    if (imageDragRafRef.current) cancelAnimationFrame(imageDragRafRef.current);
  }, []);

  useEffect(() => () => {
    if (selectionMoveRafRef.current) cancelAnimationFrame(selectionMoveRafRef.current);
  }, []);

  useEffect(() => () => {
    if (summonTimeoutRef.current) clearTimeout(summonTimeoutRef.current);
  }, []);

  useEffect(() => () => {
    if (summonNoticeTimeoutRef.current) clearTimeout(summonNoticeTimeoutRef.current);
  }, []);

  const handlePointerDown = (event) => {
    if (!roomId) return;
    const point = getCanvasPoint(event);
    lastPointerRef.current = point;
    scheduleCursorUpdate(point);
    if (event.pointerType === 'touch') event.preventDefault();
    if (isSpaceDown || event.button === 1 || event.button === 2) {
      panStateRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        originX: offsetRef.current.x,
        originY: offsetRef.current.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'select') {
      const currentSelection = selectionBox;
      const currentSelectedIds = selectedIdsRef.current || [];
      if (currentSelection && currentSelectedIds.length > 0 && isPointInRect(point, currentSelection)) {
        const snapshot = buildSelectionSnapshot(currentSelectedIds);
        selectionDragRef.current = {
          active: true,
          startX: point.x,
          startY: point.y,
          items: snapshot,
          baseSelection: { ...currentSelection },
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const hitIds = getItemsAtPoint(point);
      if (hitIds.length > 0) {
        const targetId = hitIds[hitIds.length - 1];
        const nextIds = [targetId];
        const bounds = getSelectionBoundsFromIds(nextIds);
        setSelectedIds(nextIds);
        setSelectionBox(bounds);
        const snapshot = buildSelectionSnapshot(nextIds);
        selectionDragRef.current = {
          active: true,
          startX: point.x,
          startY: point.y,
          items: snapshot,
          baseSelection: bounds ? { ...bounds } : null,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      selectingRef.current = { active: true, start: point, current: point };
      setSelectedIds([]);
      setSelectionBox({ x: point.x, y: point.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'eraser') {
      eraserStateRef.current.active = true;
      eraseAtPoint(point);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'move') {
      const hit = findImageAtPoint(point);
      if (hit?.item?.id) {
        setSelectedImageId(hit.item.id);
        dragImageRef.current = {
          active: true,
          id: hit.item.id,
          offsetX: point.x - (hit.item.x || 0),
          offsetY: point.y - (hit.item.y || 0),
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      setSelectedImageId(null);
      panStateRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        originX: offsetRef.current.x,
        originY: offsetRef.current.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'pen') {
      drawStateRef.current = { drawing: true, points: [withPenPressure(point, event)], start: null, end: null };
    } else if (tool === 'line') {
      drawStateRef.current = { drawing: true, points: [], start: point, end: point };
    }
    renderOverlay();
    schedulePreviewUpdate();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const point = getCanvasPoint(event);
    lastPointerRef.current = point;
    scheduleCursorUpdate(point);
    if (eraserStateRef.current.active) {
      eraseAtPoint(point);
      return;
    }
    if (dragImageRef.current.active) {
      const nextX = point.x - dragImageRef.current.offsetX;
      const nextY = point.y - dragImageRef.current.offsetY;
      scheduleImageMove(dragImageRef.current.id, nextX, nextY);
      return;
    }
    if (selectionDragRef.current.active) {
      const dx = point.x - selectionDragRef.current.startX;
      const dy = point.y - selectionDragRef.current.startY;
      const baseSelection = selectionDragRef.current.baseSelection;
      if (baseSelection) {
        setSelectionBox({
          x: baseSelection.x + dx,
          y: baseSelection.y + dy,
          width: baseSelection.width,
          height: baseSelection.height,
        });
      }
      scheduleSelectionMove(dx, dy);
      return;
    }
    if (selectingRef.current.active) {
      selectingRef.current.current = point;
      setSelectionBox(normalizeRect(selectingRef.current.start, point));
      return;
    }
    if (panStateRef.current.active) {
      const dx = event.clientX - panStateRef.current.startX;
      const dy = event.clientY - panStateRef.current.startY;
      const currentZoom = zoomRef.current || 1;
      setOffset({
        x: panStateRef.current.originX - dx / currentZoom,
        y: panStateRef.current.originY - dy / currentZoom,
      });
      return;
    }
    const state = drawStateRef.current;
    if (!state.drawing) return;
    if (tool === 'pen') {
      const penPoint = withPenPressure(point, event);
      const last = state.points[state.points.length - 1];
      const dx = penPoint.x - (last?.x || 0);
      const dy = penPoint.y - (last?.y || 0);
      if ((dx * dx + dy * dy) < BOARD_POINT_MIN_DISTANCE * BOARD_POINT_MIN_DISTANCE) return;
      state.points.push(penPoint);
    } else if (tool === 'line') {
      state.end = point;
    }
    renderOverlay();
    schedulePreviewUpdate();
  };

  const handlePointerUp = () => {
    if (panStateRef.current.active) {
      panStateRef.current.active = false;
      return;
    }
    if (selectionDragRef.current.active) {
      if (selectionMoveRafRef.current) {
        cancelAnimationFrame(selectionMoveRafRef.current);
        selectionMoveRafRef.current = null;
      }
      const pending = pendingSelectionMoveRef.current;
      if (pending && selectionDragRef.current.items) {
        applySelectionMove(pending.dx, pending.dy);
      }
      pendingSelectionMoveRef.current = { dx: 0, dy: 0 };
      selectionDragRef.current.active = false;
      selectionDragRef.current.items = null;
      selectionDragRef.current.baseSelection = null;
      undoManagerRef.current?.stopCapturing();
      return;
    }
    if (selectingRef.current.active) {
      const start = selectingRef.current.start;
      const current = selectingRef.current.current || start;
      selectingRef.current.active = false;
      const rect = normalizeRect(start, current);
      const isClick = rect.width < 4 && rect.height < 4;
      let nextIds = [];
      if (isClick) {
        const hitIds = getItemsAtPoint(current);
        if (hitIds.length > 0) nextIds = [hitIds[hitIds.length - 1]];
      } else {
        nextIds = getItemsInRect(rect);
      }
      if (nextIds.length > 0) {
        setSelectedIds(nextIds);
        setSelectionBox(getSelectionBoundsFromIds(nextIds));
      } else {
        setSelectedIds([]);
        setSelectionBox(null);
      }
      return;
    }
    if (dragImageRef.current.active) {
      dragImageRef.current.active = false;
      undoManagerRef.current?.stopCapturing();
      return;
    }
    if (eraserStateRef.current.active) {
      eraserStateRef.current.active = false;
      undoManagerRef.current?.stopCapturing();
      return;
    }
    const state = drawStateRef.current;
    if (!state.drawing) return;
    state.drawing = false;
    renderOverlay();
    if (awarenessRef.current) awarenessRef.current.setLocalStateField('drawing', null);
    const docInstance = docRef.current;
    if (!yItemsRef.current || !docInstance) return;
    const base = {
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      color,
      authorId: userId,
    };
    if (tool === 'pen' && state.points.length > 1) {
      docInstance.transact(() => {
        yItemsRef.current?.push([{
          ...base,
          type: 'stroke',
          width: penWidth,
          points: state.points,
        }]);
      }, localOriginRef.current);
    }
    if (tool === 'line' && state.start && state.end) {
      docInstance.transact(() => {
        yItemsRef.current?.push([{
          ...base,
          type: 'line',
          width: lineWidth,
          start: state.start,
          end: state.end,
        }]);
      }, localOriginRef.current);
    }
    undoManagerRef.current?.stopCapturing();
    drawStateRef.current = { drawing: false, points: [], start: null, end: null };
  };

  const handlePointerLeave = () => {
    handlePointerUp();
    scheduleCursorUpdate(null);
  };

  const handleUndo = () => {
    const undoManager = undoManagerRef.current;
    if (!undoManager?.undoStack?.length) return;
    undoManager.undo();
  };

  const handleRedo = () => {
    const undoManager = undoManagerRef.current;
    if (!undoManager?.redoStack?.length) return;
    undoManager.redo();
  };

  const handleClearBoard = () => {
    if (!yItemsRef.current || !docRef.current) return;
    if (!confirm('Очистить доску? Это удалит все элементы.')) return;
    docRef.current.transact(() => {
      yItemsRef.current.delete(0, yItemsRef.current.length);
    }, localOriginRef.current);
    undoManagerRef.current?.stopCapturing();
  };

  const handleWheel = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.12 : 0.9;
    zoomAt((zoomRef.current || 1) * factor, event.clientX, event.clientY);
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const renderMinimap = useCallback(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    const bounds = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    };

    const includePoint = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    };

    boardItems.forEach((item) => {
      if (!item) return;
      if (item.type === 'stroke') {
        (item.points || []).forEach((pt) => includePoint(pt?.x, pt?.y));
      } else if (item.type === 'line') {
        includePoint(item.start?.x, item.start?.y);
        includePoint(item.end?.x, item.end?.y);
      } else if (item.type === 'image') {
        includePoint(item.x, item.y);
        includePoint((item.x || 0) + (item.width || 0), (item.y || 0) + (item.height || 0));
      }
    });

    const viewWidth = boardSize.width / (zoomRef.current || 1);
    const viewHeight = boardSize.height / (zoomRef.current || 1);
    includePoint(offsetRef.current.x, offsetRef.current.y);
    includePoint(offsetRef.current.x + viewWidth, offsetRef.current.y + viewHeight);

    if (!Number.isFinite(bounds.minX)) {
      bounds.minX = 0;
      bounds.minY = 0;
      bounds.maxX = viewWidth;
      bounds.maxY = viewHeight;
    }

    const pad = 8;
    const mapWidth = Math.max(1, bounds.maxX - bounds.minX);
    const mapHeight = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min((width - pad * 2) / mapWidth, (height - pad * 2) / mapHeight);

    const toMiniX = (x) => pad + (x - bounds.minX) * scale;
    const toMiniY = (y) => pad + (y - bounds.minY) * scale;

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.52)';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(pad, pad, mapWidth * scale, mapHeight * scale);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    boardItems.forEach((item) => {
      if (!item) return;
      if (item.type === 'stroke') {
        const pts = item.points || [];
        if (pts.length < 2) return;
        ctx.beginPath();
        drawSmoothStrokePath(ctx, pts, (point) => ({
          x: toMiniX(point?.x || 0),
          y: toMiniY(point?.y || 0),
        }));
        ctx.stroke();
      } else if (item.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(toMiniX(item.start?.x || 0), toMiniY(item.start?.y || 0));
        ctx.lineTo(toMiniX(item.end?.x || 0), toMiniY(item.end?.y || 0));
        ctx.stroke();
      } else if (item.type === 'image') {
        const x = toMiniX(item.x || 0);
        const y = toMiniY(item.y || 0);
        const w = (item.width || 0) * scale;
        const h = (item.height || 0) * scale;
        ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
        ctx.lineWidth = 0.9;
        ctx.strokeRect(x, y, w, h);
      }
    });
    ctx.restore();

    ctx.save();
    const viewX = toMiniX(offsetRef.current.x);
    const viewY = toMiniY(offsetRef.current.y);
    const viewW = viewWidth * scale;
    const viewH = viewHeight * scale;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewW, viewH);
    ctx.restore();
  }, [boardItems, boardSize.width, boardSize.height]);

  useEffect(() => {
    renderMinimap();
  }, [renderMinimap, zoom, offset]);

  const canUndo = undoState.canUndo;
  const canRedo = undoState.canRedo;
  const canClear = boardItems.length > 0;
  const remoteCursorMarkers = useMemo(() => {
    const currentZoom = zoom || 1;
    return remoteCursors
      .map((cursor) => ({
        ...cursor,
        left: (cursor.x - offset.x) * currentZoom,
        top: (cursor.y - offset.y) * currentZoom,
      }))
      .filter((cursor) => (
        Number.isFinite(cursor.left)
        && Number.isFinite(cursor.top)
        && cursor.left >= -40
        && cursor.left <= boardSize.width + 40
        && cursor.top >= -40
        && cursor.top <= boardSize.height + 40
      ));
  }, [remoteCursors, zoom, offset, boardSize.width, boardSize.height]);
  const sessionTitle = roomId
    ? (isTeacher
      ? `Учитель + ${selectedStudent ? getStudentLabel(selectedStudent) : 'ученик'}`
      : 'Учитель + ученик')
    : 'Не выбрана';
  const statusLabel = status === 'connected'
    ? 'Подключено'
    : (status === 'connecting' ? 'Соединяемся...' : 'Не подключено');
  const statusClass = status === 'connected'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
  const boardCanvasHeight = isFullscreen ? 'calc(100vh - 200px)' : '62vh';
  const activeWidth = tool === 'line' ? lineWidth : penWidth;
  const widthTargetLabel = tool === 'line' ? 'Линия' : 'Карандаш';
  const showWidthControls = tool === 'pen' || tool === 'line';
  const zoomLabel = `${Math.round((zoom || 1) * 100)}%`;
  const formattedWidth = Number.isFinite(activeWidth)
    ? (activeWidth % 1 === 0 ? activeWidth.toFixed(0) : activeWidth.toFixed(1))
    : '';
  const handleWidthChange = (event) => {
    const fallbackWidth = tool === 'line' ? BOARD_LINE_WIDTH : BOARD_STROKE_WIDTH;
    const nextValue = clamp(Number(event.target.value) || fallbackWidth, BOARD_MIN_WIDTH, BOARD_MAX_WIDTH);
    if (tool === 'line') setLineWidth(nextValue);
    else setPenWidth(nextValue);
  };

  const renderStudentPicker = () => {
    if (!isTeacher) return null;
    return (
      <div className="inline-flex w-full sm:w-auto items-center gap-2 rounded-2xl border border-purple-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-purple-100/40">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-purple-500">Ученик</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || (students || []).length === 0}
          className="w-full min-w-0 sm:min-w-[180px] rounded-xl border border-purple-100 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70"
        >
          <option value="" disabled>Выберите ученика</option>
          {(students || []).map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const saveModal = saveModalOpen ? (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4">
      <div className="surface-card modal-card rounded-3xl w-full max-w-3xl p-4 sm:p-5 md:p-6 shadow-2xl relative">
        <button
          onClick={() => setSaveModalOpen(false)}
          className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"
          aria-label="Закрыть"
        >
          <X size={18} />
        </button>
        <div className="pr-8">
          <div className="text-xs font-bold uppercase tracking-widest text-purple-500">Сохранение</div>
          <h3 className="mt-1 text-xl font-bold text-gray-900">Сохранить доску в конспекты</h3>
          <p className="mt-1 text-xs text-gray-500">
            Сохраняется PNG снимок всей доски и появится в разделе «Конспекты» выбранного ученика.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Задание</label>
            <select
              value={saveTaskNumber}
              onChange={(e) => setSaveTaskNumber(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-500"
            >
              {taskOptions.map((task) => (
                <option key={task.id} value={task.number}>
                  {`Задание ${getTaskDisplayNumber(task)}: ${task.title}`}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Категория</label>
            <select
              value={saveCategory}
              onChange={(e) => setSaveCategory(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-500"
            >
              <option value="class">На уроке</option>
              <option value="home">Домашка</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Папка</label>
            <select
              value={saveFolderId}
              onChange={(e) => setSaveFolderId(e.target.value)}
              disabled={!effectiveStudentId || foldersLoading}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70"
            >
              <option value="">Без папки</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            {foldersLoading && <div className="text-[11px] text-gray-400">Загрузка папок...</div>}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Имя файла</label>
            <input
              type="text"
              value={saveFileName}
              onChange={(e) => {
                setSaveFileName(e.target.value);
                if (saveNameError && e.target.value.trim()) {
                  setSaveNameError(false);
                  setSaveError('');
                }
              }}
              placeholder="конспект-..."
              className={`w-full rounded-xl px-3 py-2 text-sm outline-none ${
                saveNameError
                  ? 'border border-red-300 bg-red-50 text-red-700 focus:border-red-500'
                  : 'border border-gray-200 bg-gray-50 text-gray-700 focus:border-purple-500'
              }`}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Новая папка"
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-500"
          />
          <Button
            variant="secondary"
            onClick={handleCreateFolder}
            disabled={creatingFolder || !newFolderName.trim() || !effectiveStudentId}
            className="flex items-center justify-center gap-2"
          >
            <FolderPlus size={16} />
            {creatingFolder ? 'Создаём...' : 'Создать папку'}
          </Button>
        </div>

        {foldersError && <div className="mt-2 text-xs text-rose-600">{foldersError}</div>}
        {saveError && <div className="mt-2 text-xs text-rose-600">{saveError}</div>}
        {saveSuccess && <div className="mt-2 text-xs text-emerald-700">{saveSuccess}</div>}

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setSaveModalOpen(false)}>Отмена</Button>
          <Button
            onClick={handleSaveBoardToNotes}
            disabled={saveBusy || !effectiveStudentId || !saveTaskNumber || !saveCategory}
            className="flex items-center justify-center gap-2"
          >
            <Save size={16} />
            {saveBusy ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div ref={boardRootRef} className={isFullscreen ? 'animate-fadeIn pb-2' : 'animate-fadeIn pb-10'}>
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between ${
        isFullscreen ? 'mb-2 gap-2' : 'mb-6 gap-3'
      }`}>
        <div>
          <h2 className={`font-bold flex items-center gap-2 ${isFullscreen ? 'text-white text-xl' : 'text-gray-900 text-2xl'}`}>
            <Brush className={isFullscreen ? 'text-purple-300' : 'text-purple-600'} />
            Онлайн-доска
          </h2>
        </div>
        <div className={`flex flex-wrap items-center ${isFullscreen ? 'gap-1.5' : 'gap-2'}`}>
          {renderStudentPicker()}
          <Button
            variant="secondary"
            onClick={() => setSaveModalOpen(true)}
            className={`flex items-center gap-2 ${isFullscreen ? 'h-9 px-3 py-1.5 text-xs' : ''}`}
            disabled={!roomId}
          >
            <Save size={16} />
            Сохранить в конспекты
          </Button>
          {isTeacher && (
            <button
              type="button"
              onClick={handleSummonStudent}
              disabled={!roomId}
              className={`inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-60 ${
                isFullscreen ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
              }`}
            >
              Призвать ко мне
            </button>
          )}
          <span className={`inline-flex items-center rounded-full border font-semibold ${statusClass} ${
            isFullscreen ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
          }`}>
            {statusLabel}
          </span>
          {roomId && (
            <span className={`inline-flex items-center rounded-full border border-slate-200 bg-white font-semibold text-slate-600 ${
              isFullscreen ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
            }`}>
              Онлайн: {peerCount}
            </span>
          )}
        </div>
      </div>

      {isTeacher && !activeStudentId && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5" />
          <div>
            <div className="font-semibold">Сначала выберите ученика</div>
            <div className="text-xs text-amber-700/80">Комната создаётся отдельно для каждого ученика.</div>
          </div>
        </div>
      )}

      <Card className={isFullscreen ? 'p-3 md:p-3.5' : 'p-4 md:p-6'}>
        {!isFullscreen && (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-500">Сессия</div>
              <div className="text-sm font-semibold text-gray-800">{sessionTitle}</div>
            </div>
            <div className="text-xs text-gray-500">
              Вставка картинки: Ctrl+V. Лимит 10 МБ. Панорамирование: удерживайте Space и тяните.
            </div>
          </div>
        )}

        {isFullscreen && (
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {sessionTitle}
          </div>
        )}

        <div className={`flex flex-wrap items-center ${isFullscreen ? 'mt-2 gap-1.5' : 'mt-4 gap-2'}`}>
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
              tool === 'pen' ? 'border-purple-500 bg-purple-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            aria-label="Карандаш"
            title="Карандаш"
          >
            <Pencil size={14} />
          </button>

          <button
            type="button"
            onClick={() => setTool('line')}
            className={`inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
              tool === 'line' ? 'border-purple-500 bg-purple-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            aria-label="Линия"
            title="Линия"
          >
            <Minus size={14} />
          </button>

          <button
            type="button"
            onClick={() => setTool('select')}
            className={`inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
              tool === 'select' ? 'border-purple-500 bg-purple-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            aria-label="Выделение"
            title="Выделение"
          >
            <MousePointer2 size={14} />
          </button>

          <button
            type="button"
            onClick={() => setTool('move')}
            className={`inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
              tool === 'move' ? 'border-purple-500 bg-purple-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            aria-label="Перемещение"
            title="Перемещение"
          >
            <Hand size={14} />
          </button>

          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
              tool === 'eraser' ? 'border-purple-500 bg-purple-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            aria-label="Ластик"
            title="Ластик"
          >
            <Eraser size={14} />
          </button>

          <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              className="inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              aria-label="Отменить"
              title="Отменить"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              className="inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              aria-label="Вернуть"
              title="Вернуть"
            >
              <RefreshCcw size={14} />
            </button>
            <button
              type="button"
              onClick={handleClearBoard}
              disabled={!canClear}
              className="inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              aria-label="Очистить доску"
              title="Очистить доску"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div ref={settingsRef} className="relative">
            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              <Settings size={14} />
              Цвет и размер
              <span
                className="ml-1 inline-flex h-2.5 w-2.5 rounded-full border border-white/80"
                style={{ backgroundColor: color }}
              />
            </button>
            {isSettingsOpen && (
              <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg">
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">{`Толщина (${widthTargetLabel})`}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={BOARD_MIN_WIDTH}
                        max={BOARD_MAX_WIDTH}
                        step={BOARD_WIDTH_STEP}
                        value={activeWidth}
                        onChange={handleWidthChange}
                        disabled={!showWidthControls}
                        className={`w-full accent-purple-600 ${showWidthControls ? '' : 'opacity-40'}`}
                      />
                      <span className="w-8 text-right text-xs font-semibold text-gray-600">{formattedWidth}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">Цвет</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {BOARD_COLORS.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() => setColor(swatch)}
                          className={`h-7 w-7 rounded-full border-2 transition ${
                            color === swatch ? 'border-gray-900 scale-110' : 'border-white/80'
                          }`}
                          style={{ backgroundColor: swatch }}
                          aria-label={`Цвет ${swatch}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={shareMyCursor}
                        onChange={(event) => setShareMyCursor(event.target.checked)}
                        className="h-4 w-4 accent-purple-600"
                      />
                      Показывать мой курсор
                    </label>
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={lowBandwidthMode}
                        onChange={(event) => setLowBandwidthMode(event.target.checked)}
                        className="h-4 w-4 accent-purple-600"
                      />
                      Режим слабого интернета
                    </label>
                    <div className="mt-1 text-[11px] text-gray-400">
                      Реже отправляет курсор и превью линий, чтобы снизить трафик.
                    </div>
                  </div>
                  {tool === 'move' && selectedImage && (
                    <div className="border-t border-gray-100 pt-3">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500">Изображение</div>
                      <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                        <span>{selectedImageLabel}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => resizeImageByFactor(selectedImage.id, 1 - BOARD_IMAGE_SCALE_STEP)}
                            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => resizeImageByFactor(selectedImage.id, 1 + BOARD_IMAGE_SCALE_STEP)}
                            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => zoomBy(1 / 1.12)}
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            aria-label="Отдалить"
            title="Отдалить"
          >
            <Minus size={14} />
          </button>

          <div className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 min-w-[64px]">
            {zoomLabel}
          </div>

          <button
            type="button"
            onClick={() => zoomBy(1.12)}
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            aria-label="Приблизить"
            title="Приблизить"
          >
            <Plus size={14} />
          </button>

          <button
            type="button"
            onClick={resetView}
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            aria-label="Сброс масштаба"
            title="Сброс масштаба"
          >
            Сброс
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="ml-auto inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            aria-label={isFullscreen ? 'Обычный экран' : 'Полный экран'}
            title={isFullscreen ? 'Обычный экран' : 'Полный экран'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}
          </button>
        </div>

        {pasteError && (
          <div className="mt-2 text-xs text-rose-600">{pasteError}</div>
        )}

        <div
          ref={containerRef}
          className={`mt-4 relative w-full rounded-2xl border border-gray-200 bg-white overflow-hidden ${
            summonNotice ? 'ring-2 ring-amber-400/70 ring-offset-2 ring-offset-white' : ''
          }`}
          style={{ height: boardCanvasHeight }}
        >
          {!roomId && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/70 text-sm text-slate-100">
              Выберите ученика, чтобы открыть доску.
            </div>
          )}
          {!isTeacher && summonNotice && (
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700 shadow-sm">
              Учитель переместил вас к себе
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full"
            style={{
              touchAction: 'none',
              cursor: isSpaceDown
                ? (panStateRef.current.active ? 'grabbing' : 'grab')
                : (tool === 'pen' || tool === 'line' || tool === 'eraser' ? 'crosshair' : (tool === 'move' ? 'grab' : 'default'))
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerLeave}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
          />
          {remoteCursorMarkers.map((cursor) => (
            <div
              key={cursor.id}
              className="pointer-events-none absolute z-20 select-none"
              style={{
                left: `${cursor.left}px`,
                top: `${cursor.top}px`,
                transform: 'translate(-2px, -2px)',
              }}
            >
              <div
                className="h-3 w-3 rounded-full border border-white shadow"
                style={{ backgroundColor: cursor.color }}
              />
              <div
                className="mt-1 rounded-md px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                style={{ backgroundColor: cursor.color }}
              >
                {cursor.name}
              </div>
            </div>
          ))}
          <div className="board-minimap-shell absolute right-3 top-3 z-20">
            <canvas
              ref={minimapRef}
              width={160}
              height={120}
              className="board-minimap-canvas block"
            />
          </div>
        </div>
      </Card>
      {isFullscreen
        ? saveModal
        : (typeof document !== 'undefined' ? createPortal(saveModal, document.body) : null)}
    </div>
  );
};

const DashboardLayout = ({ user, onLogout, progress, onUpdateProgress, theme, onThemeToggle }) => {
  const STUDENT_CALL_SECTION_ENABLED = true;
  const allowedViews = user.role === 'admin'
    ? ['admin']
    : user.role === 'teacher'
      ? ['schedule', 'progress', 'python', 'rating', 'collab', 'call', 'board', 'teacher', 'notes']
      : [
        'schedule',
        'progress',
        'python',
        'rating',
        'collab',
        ...(STUDENT_CALL_SECTION_ENABLED ? ['call'] : []),
        'board',
        'notes'
      ];
  const isCallViewAvailable = allowedViews.includes('call');
  const defaultView = user.role === 'teacher' ? 'teacher' : (user.role === 'admin' ? 'admin' : 'progress');
  const storedLocation = readUserLocation(user);
  const storedView = storedLocation?.view;
  const storedPythonLocation = storedLocation?.pythonLocation && typeof storedLocation.pythonLocation === 'object'
    ? storedLocation.pythonLocation
    : null;
  const fallbackPythonOpenTask = storedPythonLocation
    ? normalizeStoredOpenTask({
      taskNumber: storedPythonLocation?.taskNumber,
      levelId: PYTHON_LEVEL_ID,
      questionIndex: storedPythonLocation?.questionIndex
    })
    : null;
  const restoredOpenTask = user.role === 'student'
    ? (normalizeStoredOpenTask(storedLocation?.openTask)
        || (storedView === 'python' ? fallbackPythonOpenTask : null))
    : null;
  const storedActiveStudentId = storedLocation?.activeStudentId ? String(storedLocation.activeStudentId) : null;
  const initialView = (restoredOpenTask?.section && allowedViews.includes(restoredOpenTask.section))
    ? restoredOpenTask.section
    : (allowedViews.includes(storedView) ? storedView : defaultView);
  const initialProgressSection = ['progress', 'notes', 'mocks'].includes(storedLocation?.progressSection)
    ? storedLocation.progressSection
    : 'progress';
  const initialMockExamId = normalizeMockExamId(storedLocation?.mockExamId);
  const initialNotesLocation = storedLocation?.notesLocation && typeof storedLocation.notesLocation === 'object'
    ? storedLocation.notesLocation
    : null;

  const [view, setView] = useState(initialView);
  const [callSessionStatus, setCallSessionStatus] = useState('idle');
  const [callPanelExpanded, setCallPanelExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(DESKTOP_NAV_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [progressSectionJumpToken, setProgressSectionJumpToken] = useState(0);
  const [pendingOpenTask, setPendingOpenTask] = useState(() => (user.role === 'student' ? restoredOpenTask : null));
  const [pendingOpenMockExamId, setPendingOpenMockExamId] = useState(
    () => (user.role === 'student' ? initialMockExamId : null)
  );
  const [goalState, setGoalState] = useState(null);
  const [goalTestsDb, setGoalTestsDb] = useState(null);
  const [goalRefreshTick, setGoalRefreshTick] = useState(0);
  const [goalCollapsed, setGoalCollapsed] = useState(user.role === 'student');
  const [goalPanelAnimClass, setGoalPanelAnimClass] = useState('');
  const [_HOMEWORK_POPUP_ENTRY, setHomeworkPopupEntry] = useState(null);
  const [homeworkPopupOpen, setHomeworkPopupOpen] = useState(false);
  const [paceForecastPopupOpen, setPaceForecastPopupOpen] = useState(false);
  const [solvedByTask, setSolvedByTask] = useState({});
  const [studentSolvedEvents, setStudentSolvedEvents] = useState([]);
  const [goalTestsLoaded, setGoalTestsLoaded] = useState(false);
  const [studentDataLoaded, setStudentDataLoaded] = useState(false);
  const [studentStreak, setStudentStreak] = useState(getDefaultStreak());
  const [_STUDENT_XP_TOTAL, setStudentXpTotal] = useState(0);
  const [xpDisplayTotal, setXpDisplayTotal] = useState(0);
  const [xpDockVisible, setXpDockVisible] = useState(false);
  const [xpAnimationActive, setXpAnimationActive] = useState(false);
  const [xpFlightStars, setXpFlightStars] = useState([]);
  const [streakPopup, setStreakPopup] = useState({
    open: false,
    current: 0,
    best: 0,
    isNewRecord: false
  });
  const [levelUpPopup, setLevelUpPopup] = useState({
    open: false,
    from: 1,
    to: 1,
    totalXp: 0
  });
  const studentStreakRef = useRef(studentStreak);
  const xpDisplayTotalRef = useRef(0);
  const xpCounterFrameRef = useRef(null);
  const xpDockHideTimerRef = useRef(null);
  const xpAnimTokenRef = useRef(0);
  const xpAnimationRunningRef = useRef(false);
  const xpInlineBarRef = useRef(null);
  const xpDockBarRef = useRef(null);
  const prevLevelRef = useRef(null);
  const levelUpTimerRef = useRef(null);
  const scheduleHomeworkFlyRef = useRef(null);
  const goalSummaryFlyRef = useRef(null);
  const goalFlyFromRectRef = useRef(null);
  const goalFlyActiveRef = useRef(false);
  const goalFlyTargetTypeRef = useRef(null);
  const goalFlyCloneRef = useRef(null);
  const goalFlyRevealTimerRef = useRef(null);
  const goalFlyResetTimerRef = useRef(null);
  const goalFlyTargetNodeRef = useRef(null);
  const mainScrollRef = useRef(null);
  const paceForecastShownRef = useRef(false);
  const prevGoalCollapsedRef = useRef(goalCollapsed);
  const [isDesktopWide, setIsDesktopWide] = useState(
    typeof window !== 'undefined' ? window.innerWidth > 1000 : true
  );
  const [teacherNotifs, setTeacherNotifs] = useState([]);
  const [taskTitles, setTaskTitles] = useState({});
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [deletedStudents, setDeletedStudents] = useState([]);
  const [deletedStudentsLoading, setDeletedStudentsLoading] = useState(false);
  const [deletedStudentsError, setDeletedStudentsError] = useState('');
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState('');
  const [pushSupported, setPushSupported] = useState(isPushFeatureSupported());
  const [pushPermission, setPushPermission] = useState(getPushPermission());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSyncing, setPushSyncing] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [pushReady, setPushReady] = useState(false);
  const isCallSessionActive = callSessionStatus === 'connected' || callSessionStatus === 'connecting';
  const callUiMode = !isCallViewAvailable
    ? 'hidden'
    : view === 'call'
      ? 'full'
      : isCallSessionActive
        ? (callPanelExpanded ? 'floating' : 'collapsed')
        : 'hidden';
  const studentsWithNicknames = useMemo(
    () => students,
    [students]
  );
  const tasksWithTitles = useMemo(
    () => applyTaskTitles(MOCK_TASKS, taskTitles),
    [taskTitles]
  );

  useEffect(() => {
    updateUserLocation(user, { view });
    if (view !== 'progress' && view !== 'python') {
      updateUserLocation(user, { openTask: null });
    }
  }, [view, user]);

  useEffect(() => {
    if (view === 'call') return;
    if (!isCallSessionActive) return;
    setCallPanelExpanded(false);
  }, [isCallSessionActive, view]);

  useEffect(() => {
    if (isCallSessionActive) return;
    setCallPanelExpanded(false);
  }, [isCallSessionActive]);

  useEffect(() => {
    if (user.role !== 'teacher') return;
    updateUserLocation(user, { activeStudentId: activeStudentId || null });
  }, [activeStudentId, user]);

  useEffect(() => {
    if (user.role === 'student') return;
    setPendingOpenMockExamId(null);
  }, [user.role, user.id]);

  const nav = user.role === 'admin'
    ? [
      { id: 'admin', label: 'Админка', icon: Settings }
    ]
    : user.role === 'teacher'
      ? [
        { id: 'schedule', label: 'Моё расписание', icon: Calendar },
        { id: 'progress', label: 'Успеваемость', icon: BarChart2 },
        { id: 'python', label: 'Изучение Python', icon: PythonLogoIcon },
        { id: 'rating', label: 'Рейтинг', icon: Trophy },
        { id: 'collab', label: 'Совместный код', icon: Code2 },
        { id: 'call', label: '\u0421\u043e\u0437\u0432\u043e\u043d', icon: PlayCircle },
        { id: 'board', label: 'Доска', icon: Brush },
        { id: 'teacher', label: 'Управление тестами', icon: Settings },
        { id: 'notes', label: 'Конспекты', icon: Folder }
      ]
      : [
        { id: 'schedule', label: 'Моё расписание', icon: Calendar },
        { id: 'progress', label: 'Успеваемость', icon: BarChart2 },
        { id: 'python', label: 'Изучение Python', icon: PythonLogoIcon },
        { id: 'rating', label: 'Рейтинг', icon: Trophy },
        { id: 'collab', label: 'Совместный код', icon: Code2 },
        { id: 'call', label: '\u0421\u043e\u0437\u0432\u043e\u043d', icon: PlayCircle },
        { id: 'board', label: 'Доска', icon: Brush },
        { id: 'notes', label: 'Конспекты', icon: BookOpen }
      ];
  const visibleNav = (user.role === 'student' && !STUDENT_CALL_SECTION_ENABLED)
    ? nav.filter((item) => item.id !== 'call')
    : nav;
  const mobileNavLabels = {
    schedule: 'График',
    progress: 'Тесты',
    rating: 'Рейтинг',
    python: 'Python',
    collab: 'Код',
    call: '\u0417\u0432\u043e\u043d\u043e\u043a',
    board: 'Доска',
    teacher: 'Управ.',
    notes: 'Консп.',
    admin: 'Админка',
  };
  const syncPushSubscriptionState = useCallback(async ({ silent = true } = {}) => {
    if (user.role !== 'student') return;
    const supported = isPushFeatureSupported();
    setPushSupported(supported);
    setPushPermission(getPushPermission());
    if (!supported) {
      setPushSubscribed(false);
      setPushReady(true);
      if (!silent) {
        setPushError('Этот браузер не поддерживает push-уведомления.');
      }
      return;
    }

    setPushSyncing(true);
    if (!silent) setPushError('');
    try {
      const [serverStatus, browserSubscription] = await Promise.all([
        api.getPushSubscriptionStatus().catch(() => ({ subscribed: false, count: 0 })),
        getBrowserPushSubscription(),
      ]);

      let subscribed = Boolean(serverStatus?.subscribed);
      if (browserSubscription) {
        subscribed = true;
        if (!serverStatus?.subscribed) {
          await api.savePushSubscription(browserSubscription.toJSON());
        }
      }

      setPushSubscribed(subscribed);
    } catch (error) {
      if (!silent) {
        setPushError(normalizePushErrorMessage(error, 'Не удалось проверить статус push-уведомлений.'));
      }
    } finally {
      setPushPermission(getPushPermission());
      setPushSyncing(false);
      setPushReady(true);
    }
  }, [user.role]);
  const handleEnablePush = useCallback(async () => {
    if (user.role !== 'student') return;
    const supported = isPushFeatureSupported();
    setPushSupported(supported);
    if (!supported) {
      setPushError('Этот браузер не поддерживает push-уведомления.');
      return;
    }

    setPushBusy(true);
    setPushError('');
    try {
      const permissionBefore = getPushPermission();
      setPushPermission(permissionBefore);
      if (permissionBefore === 'denied') {
        throw new Error('Разрешение на уведомления отключено в браузере.');
      }

      let permission = permissionBefore;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
        setPushPermission(permission);
      }
      if (permission !== 'granted') {
        throw new Error('Разрешение на уведомления не выдано.');
      }

      const keyPayload = await api.getPushPublicKey();
      const publicKey = String(keyPayload?.publicKey || '').trim();
      if (!publicKey) {
        throw new Error('Push не настроен на сервере.');
      }

      const registration = await getPushServiceWorkerRegistration();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await api.savePushSubscription(subscription.toJSON());
      setPushSubscribed(true);
      setPushReady(true);
    } catch (error) {
      setPushError(normalizePushErrorMessage(error));
    } finally {
      setPushBusy(false);
      setPushPermission(getPushPermission());
    }
  }, [user.role]);
  const handleDisablePush = useCallback(async () => {
    if (user.role !== 'student') return;
    setPushBusy(true);
    setPushError('');
    try {
      const browserSubscription = await getBrowserPushSubscription();
      const endpoint = browserSubscription?.endpoint
        ? String(browserSubscription.endpoint)
        : '';
      await api.deletePushSubscription(endpoint);
      if (browserSubscription) {
        try {
          await browserSubscription.unsubscribe();
        } catch { /* no-op */ }
      }
      setPushSubscribed(false);
      setPushReady(true);
    } catch (error) {
      setPushError(normalizePushErrorMessage(error, 'Не удалось отключить push-уведомления.'));
    } finally {
      setPushBusy(false);
      setPushPermission(getPushPermission());
    }
  }, [user.role]);
  const handleTogglePush = useCallback(() => {
    if (pushBusy || pushSyncing) return;
    if (pushSubscribed) {
      handleDisablePush();
      return;
    }
    handleEnablePush();
  }, [handleDisablePush, handleEnablePush, pushBusy, pushSubscribed, pushSyncing]);
  const pushStatusText = (() => {
    if (pushSyncing) return 'Проверяем статус push...';
    if (!pushSupported) return 'Push не поддерживается в этом браузере.';
    if (pushPermission === 'denied') return 'Уведомления заблокированы в настройках браузера.';
    if (pushSubscribed) return 'Push о новой домашке включены.';
    return 'Включите push, чтобы получать уведомления о новой домашке.';
  })();
  const pushButtonLabel = pushBusy
    ? 'Сохраняем...'
    : (pushSubscribed ? 'Отключить push' : 'Включить push');
  const PushButtonIcon = pushSubscribed ? BellOff : Bell;
  const renderPushControl = ({ mobile = false } = {}) => {
    if (user.role !== 'student') return null;
    return (
      <div className={mobile ? 'mt-3' : 'mt-3'}>
        <div className={`rounded-xl border px-3 py-2.5 ${
          pushSupported
            ? 'border-purple-200/80 bg-white/85'
            : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-purple-600">Push</p>
              <p className="mt-1 text-[11px] text-slate-600">{pushStatusText}</p>
            </div>
            <button
              type="button"
              onClick={handleTogglePush}
              disabled={!pushSupported || pushBusy || pushSyncing || !pushReady}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                pushSubscribed
                  ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                  : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <PushButtonIcon size={13} />
              {pushButtonLabel}
            </button>
          </div>
          {pushError && (
            <p className="mt-2 text-[11px] text-rose-600">{pushError}</p>
          )}
        </div>
      </div>
    );
  };
  useEffect(() => {
    if (user.role !== 'student') {
      setPushSupported(isPushFeatureSupported());
      setPushPermission(getPushPermission());
      setPushSubscribed(false);
      setPushSyncing(false);
      setPushBusy(false);
      setPushError('');
      setPushReady(false);
      return;
    }
    setPushPermission(getPushPermission());
    syncPushSubscriptionState({ silent: true });
  }, [syncPushSubscriptionState, user.role, user.id]);

  const stopXpGainAnimation = useCallback(({ keepDock = false } = {}) => {
    xpAnimTokenRef.current += 1;
    if (xpCounterFrameRef.current) {
      cancelAnimationFrame(xpCounterFrameRef.current);
      xpCounterFrameRef.current = null;
    }
    if (xpDockHideTimerRef.current) {
      clearTimeout(xpDockHideTimerRef.current);
      xpDockHideTimerRef.current = null;
    }
    xpAnimationRunningRef.current = false;
    setXpAnimationActive(false);
    setXpFlightStars([]);
    if (!keepDock) {
      setXpDockVisible(false);
    }
  }, []);

  useEffect(() => {
    xpDisplayTotalRef.current = normalizeXpTotal(xpDisplayTotal);
  }, [xpDisplayTotal]);

  const createXpFlightStars = useCallback((sourceRect, targetRect, gainedXp, flightDurationMs) => {
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 720;
    const sourceCenterX = Number.isFinite(sourceRect?.left)
      ? sourceRect.left + ((Number.isFinite(sourceRect?.width) ? sourceRect.width : 0) / 2)
      : (viewportW * 0.5);
    const sourceCenterY = Number.isFinite(sourceRect?.top)
      ? sourceRect.top + ((Number.isFinite(sourceRect?.height) ? sourceRect.height : 0) * 0.42)
      : (viewportH * 0.62);
    const targetPaddingX = Math.max(6, Math.min(14, targetRect.width * 0.08));
    const targetInnerLeft = targetRect.left + targetPaddingX;
    const targetInnerWidth = Math.max(10, targetRect.width - (targetPaddingX * 2));
    const targetCenterY = targetRect.top + (targetRect.height * 0.5);
    const count = Math.max(10, Math.min(34, Math.round(gainedXp / 35)));
    const stars = [];
    let maxLandingMs = 0;
    for (let i = 0; i < count; i += 1) {
      const progress = count > 1 ? (i / (count - 1)) : 0;
      const startJitterX = (Math.random() - 0.5) * Math.max(36, (Number(sourceRect?.width) || 110) * 0.85);
      const startJitterY = (Math.random() - 0.5) * Math.max(24, (Number(sourceRect?.height) || 56) * 0.7);
      const laneProgress = Math.max(
        0.06,
        Math.min(0.94, (progress * 0.55) + (Math.random() * 0.45))
      );
      const endX = targetInnerLeft + (targetInnerWidth * laneProgress);
      const endY = targetCenterY + ((Math.random() - 0.5) * Math.min(2.8, targetRect.height * 0.3));
      const startX = sourceCenterX + startJitterX;
      const startY = sourceCenterY + startJitterY;
      const horizontalCurve = (Math.random() - 0.5) * Math.max(56, Math.min(viewportW * 0.12, 132));
      const verticalLift = 96 + (Math.random() * 106);
      const midX = startX + ((endX - startX) * 0.44) + horizontalCurve;
      const midY = Math.min(startY, endY) - verticalLift;
      const delayMs = Math.round(progress * (flightDurationMs * 0.58) + (Math.random() * 120));
      const durationMs = Math.round((flightDurationMs * (0.62 + (Math.random() * 0.34))));
      const landingMs = delayMs + Math.round(durationMs * 0.88);
      if (landingMs > maxLandingMs) maxLandingMs = landingMs;
      stars.push({
        id: `xp-star-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        sizePx: Math.round(18 + (Math.random() * 14)),
        delayMs,
        durationMs,
        startX,
        startY,
        midX,
        midY,
        endX,
        endY,
        rotateDeg: Math.round((Math.random() * 180) - 90),
        hue: Math.round((Math.random() * 18) - 9),
      });
    }
    return { stars, maxLandingMs };
  }, []);

  const handleXpGain = useCallback((payload = {}) => {
    if (user.role !== 'student') return;
    const targetTotal = normalizeXpTotal(payload?.xpTotal);
    const payloadGained = normalizeXpTotal(payload?.xpGained);
    const currentDisplay = normalizeXpTotal(xpDisplayTotalRef.current);
    const computedGained = Math.max(payloadGained, targetTotal - currentDisplay, 0);

    setStudentXpTotal(targetTotal);

    if (!Number.isFinite(targetTotal) || targetTotal <= 0) {
      stopXpGainAnimation();
      setXpDisplayTotal(0);
      return;
    }

    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (computedGained <= 0 || prefersReducedMotion) {
      stopXpGainAnimation();
      setXpDisplayTotal(targetTotal);
      return;
    }

    stopXpGainAnimation({ keepDock: true });
    const token = Date.now() + Math.floor(Math.random() * 1000);
    xpAnimTokenRef.current = token;
    xpAnimationRunningRef.current = true;
    setXpDockVisible(true);
    setXpAnimationActive(true);
    setXpFlightStars([]);

    const sourceRect = (
      payload?.sourceRect
      && Number.isFinite(payload.sourceRect.left)
      && Number.isFinite(payload.sourceRect.top)
      && Number.isFinite(payload.sourceRect.width)
      && Number.isFinite(payload.sourceRect.height)
    )
      ? payload.sourceRect
      : null;
    const baseDurationMs = Math.max(1200, Math.min(2700, Math.round(1100 + (computedGained * 1.25))));
    const startTotal = currentDisplay;

    const runAnimation = () => {
      if (xpAnimTokenRef.current !== token) return;
      const targetRect = xpDockBarRef.current?.getBoundingClientRect() || xpInlineBarRef.current?.getBoundingClientRect();
      if (!targetRect || targetRect.width < 24 || targetRect.height < 8) {
        stopXpGainAnimation();
        setXpDisplayTotal(targetTotal);
        return;
      }

      const { stars, maxLandingMs } = createXpFlightStars(sourceRect, targetRect, computedGained, baseDurationMs);
      if (xpAnimTokenRef.current !== token) return;
      setXpFlightStars(stars);

      const counterDurationMs = Math.max(900, Math.min(3600, maxLandingMs + 140));
      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tick = (nowRaw) => {
        if (xpAnimTokenRef.current !== token) return;
        const now = Number.isFinite(nowRaw) ? nowRaw : Date.now();
        const elapsed = Math.max(0, now - startTime);
        const linearProgress = Math.max(0, Math.min(1, elapsed / counterDurationMs));
        const easedProgress = 1 - Math.pow(1 - linearProgress, 3);
        const nextValue = Math.round(startTotal + ((targetTotal - startTotal) * easedProgress));
        setXpDisplayTotal(nextValue);
        if (linearProgress < 1) {
          xpCounterFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        xpCounterFrameRef.current = null;
        setXpDisplayTotal(targetTotal);
      };
      xpCounterFrameRef.current = requestAnimationFrame(tick);

      xpDockHideTimerRef.current = setTimeout(() => {
        if (xpAnimTokenRef.current !== token) return;
        setXpAnimationActive(false);
        setXpFlightStars([]);
        setXpDockVisible(false);
        xpAnimationRunningRef.current = false;
      }, counterDurationMs + 820);
    };

    requestAnimationFrame(() => requestAnimationFrame(runAnimation));
  }, [createXpFlightStars, stopXpGainAnimation, user.role]);

  useEffect(() => () => {
    stopXpGainAnimation();
  }, [stopXpGainAnimation]);

  const clearGoalFlyAnimationStyles = useCallback((node = goalSummaryFlyRef.current) => {
    if (!node) return;
    node.style.transition = '';
    node.style.transform = '';
    node.style.transformOrigin = '';
    node.style.opacity = '';
    node.style.filter = '';
    node.style.willChange = '';
    node.style.pointerEvents = '';
  }, []);
  const stopGoalFlyAnimation = useCallback(() => {
    if (goalFlyRevealTimerRef.current) {
      clearTimeout(goalFlyRevealTimerRef.current);
      goalFlyRevealTimerRef.current = null;
    }
    if (goalFlyResetTimerRef.current) {
      clearTimeout(goalFlyResetTimerRef.current);
      goalFlyResetTimerRef.current = null;
    }
    if (goalFlyCloneRef.current?.parentNode) {
      goalFlyCloneRef.current.parentNode.removeChild(goalFlyCloneRef.current);
    }
    if (goalFlyTargetNodeRef.current) {
      clearGoalFlyAnimationStyles(goalFlyTargetNodeRef.current);
    }
    goalFlyCloneRef.current = null;
    goalFlyTargetNodeRef.current = null;
    goalFlyActiveRef.current = false;
    goalFlyFromRectRef.current = null;
    goalFlyTargetTypeRef.current = null;
    clearGoalFlyAnimationStyles();
  }, [clearGoalFlyAnimationStyles]);
  const captureGoalFlySource = useCallback((nextView) => {
    if (user.role !== 'student') return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const normalizedNextView = String(nextView || '').trim();
    if (!normalizedNextView || normalizedNextView === view) return;

    let sourceNode = null;
    let targetType = null;
    if (view === 'schedule' && normalizedNextView !== 'schedule') {
      const wrapper = scheduleHomeworkFlyRef.current;
      sourceNode = wrapper?.firstElementChild instanceof HTMLElement
        ? wrapper.firstElementChild
        : wrapper;
      targetType = 'goal';
    } else if (view !== 'schedule' && normalizedNextView === 'schedule') {
      if (goalSummaryFlyRef.current?.firstElementChild instanceof HTMLElement) {
        sourceNode = goalSummaryFlyRef.current.firstElementChild;
      } else {
        sourceNode = goalSummaryFlyRef.current;
      }
      targetType = 'schedule';
    } else {
      return;
    }
    if (!sourceNode) return;
    const rect = sourceNode.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    goalFlyFromRectRef.current = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
    const sourceStyle = window.getComputedStyle(sourceNode);
    const rawSourceRadius = String(sourceStyle.borderRadius || '').trim();
    const safeSourceRadius = rawSourceRadius && rawSourceRadius !== '0px' ? rawSourceRadius : '16px';
    const clone = sourceNode.cloneNode(true);
    if (!(clone instanceof HTMLElement)) return;
    clone.removeAttribute('id');
    clone.querySelectorAll?.('[id]').forEach((node) => node.removeAttribute('id'));
    clone.style.position = 'fixed';
    clone.style.top = `${rect.top}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = '0';
    clone.style.boxSizing = 'border-box';
    clone.style.padding = sourceStyle.padding;
    clone.style.border = sourceStyle.border;
    clone.style.borderRadius = safeSourceRadius;
    clone.style.background = sourceStyle.background;
    clone.style.boxShadow = sourceStyle.boxShadow;
    clone.style.backdropFilter = sourceStyle.backdropFilter;
    clone.style.transform = 'translate(0px, 0px)';
    clone.style.transformOrigin = 'top left';
    clone.style.transition = 'none';
    clone.style.pointerEvents = 'none';
    clone.style.userSelect = 'none';
    clone.style.overflow = 'hidden';
    clone.style.willChange = 'transform, opacity';
    clone.style.zIndex = '1200';
    clone.style.opacity = '1';
    clone.setAttribute('aria-hidden', 'true');
    document.body.appendChild(clone);
    goalFlyCloneRef.current = clone;
    goalFlyTargetNodeRef.current = null;
    goalFlyActiveRef.current = true;
    goalFlyTargetTypeRef.current = targetType;
  }, [user.role, view]);
  const navigateToView = useCallback((nextView) => {
    const normalizedView = String(nextView || '').trim();
    if (!normalizedView || normalizedView === view) return;
    stopGoalFlyAnimation();
    captureGoalFlySource(normalizedView);
    setView(normalizedView);
  }, [captureGoalFlySource, stopGoalFlyAnimation, view]);
  const handleStreakSaved = (nextStreak) => {
    const normalizedNext = normalizeStreak(nextStreak);
    const normalizedPrev = normalizeStreak(studentStreakRef.current);
    setStudentStreak(normalizedNext);
    const todayKey = getLocalDayKey();
    const activeDay = normalizeDayKey(normalizedNext.lastActiveDay);
    const streakIncreased = normalizedNext.current > normalizedPrev.current;
    const isNewRecord = normalizedNext.current > normalizedPrev.best;
    if (streakIncreased && activeDay && activeDay === todayKey) {
      setStreakPopup({
        open: true,
        current: normalizedNext.current,
        best: normalizedNext.best,
        isNewRecord
      });
    }
  };
  const streak = normalizeStreak(studentStreak);
  const todayKey = getLocalDayKey();
  const todayNum = dayKeyToNumber(todayKey);
  const lastActiveKey = normalizeDayKey(streak.lastActiveDay);
  const lastActiveLabel = formatStreakDate(lastActiveKey);
  const lastDayNum = dayKeyToNumber(lastActiveKey);
  let diffDays = Number.isFinite(todayNum) && Number.isFinite(lastDayNum) ? todayNum - lastDayNum : null;
  if (Number.isFinite(diffDays) && diffDays < 0) diffDays = 0;
  const weekStart = getWeekStartKey(todayKey);
  const freezeUsedThisWeek = weekStart && streak.freezeUsedWeekStart === weekStart;
  const freezeAvailable = !freezeUsedThisWeek;
  const totalXp = normalizeXpTotal(xpDisplayTotal);
  const currentLevel = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = totalXp % XP_PER_LEVEL;
  const levelProgressPercent = Math.max(0, Math.min(100, Math.round((xpIntoLevel / XP_PER_LEVEL) * 100)));
  const xpIntoLevelLabel = xpIntoLevel.toLocaleString('ru-RU');
  const xpPerLevelLabel = XP_PER_LEVEL.toLocaleString('ru-RU');
  const totalXpLabel = totalXp.toLocaleString('ru-RU');
  const displayStreakCurrent = (() => {
    if (!lastActiveKey) return 0;
    if (!Number.isFinite(diffDays) || diffDays <= 1) return streak.current;
    if (diffDays === 2 && freezeAvailable) return streak.current;
    return 0;
  })();
  const streakStatusText = (() => {
    if (!lastActiveKey) return 'Начните решать, чтобы запустить серию.';
    if (diffDays === 0) return 'Сегодняшняя активность засчитана.';
    if (diffDays === 1) return 'Решите сегодня, чтобы сохранить серию.';
    if (diffDays === 2) {
      return freezeAvailable ? 'Заморозка сохранит серию — решите сегодня.' : 'Серия сброшена.';
    }
    if (Number.isFinite(diffDays) && diffDays > 2) return 'Серия сброшена.';
    return 'Продолжайте решать задачи.';
  })();
  const streakWeek = (() => {
    if (!Number.isFinite(todayNum)) return [];
    const lastNum = Number.isFinite(lastDayNum) ? lastDayNum : null;
    const startNum = displayStreakCurrent > 0 && Number.isFinite(lastNum)
      ? lastNum - (displayStreakCurrent - 1)
      : null;
    const freezeDayKey = normalizeDayKey(streak.freezeUsedDay);
    const freezeNum = dayKeyToNumber(freezeDayKey);
    const list = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const dayNum = todayNum - offset;
      const dayKey = numberToDayKey(dayNum);
      const labelRaw = dayKey
        ? new Date(`${dayKey}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short' })
        : '';
      const label = labelRaw.replace('.', '').toUpperCase();
      const isInStreak = Number.isFinite(startNum)
        && Number.isFinite(lastNum)
        && dayNum >= startNum
        && dayNum <= lastNum;
      const isFreeze = isInStreak && Number.isFinite(freezeNum) && dayNum === freezeNum;
      list.push({ dayKey, label, isInStreak, isFreeze, isToday: dayNum === todayNum });
    }
    return list;
  })();
  const solvedPerDayStats = useMemo(() => {
    const list = Array.isArray(studentSolvedEvents) ? studentSolvedEvents : [];
    if (list.length <= 0) {
      return { average: 0, solvedCount: 0, periodDays: 0 };
    }

    const seenIds = new Set();
    let solvedCount = 0;
    let firstDayNum = Infinity;
    let lastDayNum = -Infinity;

    list.forEach((event) => {
      const eventId = typeof event?.id === 'string' ? event.id.trim() : '';
      if (eventId) {
        if (seenIds.has(eventId)) return;
        seenIds.add(eventId);
      }
      if (!isTestingSolvedEvent(event)) return;
      const dayKey = getSolvedEventDayKey(event);
      const dayNum = dayKeyToNumber(dayKey);
      if (!Number.isFinite(dayNum)) return;
      solvedCount += 1;
      if (dayNum < firstDayNum) firstDayNum = dayNum;
      if (dayNum > lastDayNum) lastDayNum = dayNum;
    });

    if (!Number.isFinite(firstDayNum) || solvedCount <= 0) {
      return { average: 0, solvedCount: 0, periodDays: 0 };
    }

    const endDayNum = Number.isFinite(todayNum) ? Math.max(todayNum, lastDayNum) : lastDayNum;
    const periodDays = Math.max(endDayNum - firstDayNum + 1, 1);
    return {
      average: solvedCount / periodDays,
      solvedCount,
      periodDays
    };
  }, [studentSolvedEvents, todayNum]);
  const averageSolvedPerDayLabel = formatPerDayRateLabel(solvedPerDayStats.average);
  const levelUpParticles = useMemo(() => (
    Array.from({ length: LEVEL_UP_PARTICLE_COUNT }, (_, index) => {
      const horizontalSeed = ((index * 53) % 240) - 120;
      const driftSeed = ((index * 37) % 80) - 40;
      const size = 5 + ((index * 7) % 7);
      const delay = ((index * 11) % 18) * 0.045;
      const duration = 1.45 + ((index * 13) % 11) * 0.12;
      const rotate = ((index * 29) % 120) - 60;
      return {
        key: `lvl-particle-${index}`,
        left: `calc(50% + ${horizontalSeed}px)`,
        driftX: `${driftSeed}px`,
        size: `${size}px`,
        delay: `${delay}s`,
        duration: `${duration}s`,
        rotate: `${rotate}deg`,
      };
    })
  ), []);
  const testingForecast = useMemo(() => {
    const testsDb = goalTestsDb && typeof goalTestsDb === 'object' ? goalTestsDb : {};
    let total = 0;
    let solved = 0;
    for (const [taskKey, taskLevels] of Object.entries(testsDb)) {
      const taskNum = Number(taskKey);
      if (!Number.isFinite(taskNum) || taskNum < 1 || taskNum > 27) continue;
      if (!taskLevels || typeof taskLevels !== 'object') continue;
      const taskSolvedEntry = solvedByTask?.[String(taskNum)] && typeof solvedByTask[String(taskNum)] === 'object'
        ? solvedByTask[String(taskNum)]
        : {};
      ['basic', 'advanced', 'expert'].forEach((levelId) => {
        const questions = Array.isArray(taskLevels[levelId]) ? taskLevels[levelId] : [];
        const levelTotal = questions.length;
        if (levelTotal <= 0) return;
        total += levelTotal;
        const solvedList = Array.isArray(taskSolvedEntry?.[levelId]?.solved)
          ? taskSolvedEntry[levelId].solved
          : [];
        const solvedCount = new Set(solvedList.map((id) => String(id))).size;
        solved += Math.min(solvedCount, levelTotal);
      });
    }
    const remaining = Math.max(total - solved, 0);
    const averagePerDay = Number(solvedPerDayStats.average) || 0;
    let daysToFinish = null;
    if (remaining <= 0) {
      daysToFinish = 0;
    } else if (Number.isFinite(averagePerDay) && averagePerDay > 0) {
      daysToFinish = Math.ceil(remaining / averagePerDay);
    }
    return { total, solved, remaining, daysToFinish, averagePerDay };
  }, [goalTestsDb, solvedByTask, solvedPerDayStats.average]);

  const loadStudents = async (teacherId) => {
    setStudentsLoading(true);
    try {
      const data = await api.getStudents(teacherId);
      setStudents(data);
      setStudentsError('');
      setActiveStudentId((current) => {
        if (data.some((s) => s.id === current)) return current;
        if (storedActiveStudentId && data.some((s) => String(s.id) === storedActiveStudentId)) {
          return storedActiveStudentId;
        }
        return data[0]?.id || null;
      });
    } catch (err) {
      setStudentsError(err?.message || err);
    } finally {
      setStudentsLoading(false);
    }
  };

  const loadDeletedStudents = async (teacherId) => {
    setDeletedStudentsLoading(true);
    try {
      const data = await api.getStudents(teacherId, { deletedOnly: true });
      setDeletedStudents(data);
      setDeletedStudentsError('');
    } catch (err) {
      setDeletedStudentsError(err?.message || err);
    } finally {
      setDeletedStudentsLoading(false);
    }
  };

  const loadTeachers = async () => {
    setTeachersLoading(true);
    try {
      const data = await api.getTeachers();
      setTeachers(data);
      setTeachersError('');
    } catch (err) {
      setTeachersError(err?.message || err);
    } finally {
      setTeachersLoading(false);
    }
  };

  const getHomeworkSeenKey = () => `ege_homework_popup_${user.id}`;
  const getHomeworkEntryId = (entry) => String(entry?.id || entry?.issuedAt || '').trim();
  const readHomeworkPopupState = () => {
    try {
      const raw = localStorage.getItem(getHomeworkSeenKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const writeHomeworkPopupState = (state) => {
    try {
      localStorage.setItem(getHomeworkSeenKey(), JSON.stringify(state));
    } catch { /* no-op */ }
  };
  const hasHomeworkContent = (entry) => {
    if (!entry) return false;
    const hasText = typeof entry.homeWork === 'string' && entry.homeWork.trim();
    const hasLinks = (typeof entry.lessonLink === 'string' && entry.lessonLink.trim())
      || (typeof entry.boardLink === 'string' && entry.boardLink.trim());
    const hasGoals = Array.isArray(entry.goals) && entry.goals.length > 0;
    return Boolean(hasText || hasLinks || hasGoals);
  };
  const _markHomeworkSeen = (entry) => {
    const id = getHomeworkEntryId(entry);
    if (id) {
      writeHomeworkPopupState({ id, status: 'seen' });
    }
    setHomeworkPopupOpen(false);
  };
  const checkHomeworkPopup = async () => {
    if (user.role !== 'student') return;
    if (!hasStudentSeenTour(user.id)) return;
    try {
      const data = await api.getStudentNextLesson(user.id);
      const latest = data?.latest || null;
      if (!latest || !hasHomeworkContent(latest)) return;
      const latestId = getHomeworkEntryId(latest);
      if (!latestId) return;
      const stored = readHomeworkPopupState();
      if (stored?.id === latestId) {
        if (stored.status === 'pending') {
          setHomeworkPopupEntry(latest);
          setHomeworkPopupOpen(true);
        }
        return;
      }
      writeHomeworkPopupState({ id: latestId, status: 'pending' });
      setHomeworkPopupEntry(latest);
      setHomeworkPopupOpen(true);
    } catch { /* no-op */ }
  };

  useEffect(() => {
    if (user.role === 'teacher') {
      loadStudents(user.id);
      loadDeletedStudents(user.id);
    } else {
      setStudents([]);
      setActiveStudentId(null);
      setStudentsError('');
      setStudentsLoading(false);
      setDeletedStudents([]);
      setDeletedStudentsError('');
      setDeletedStudentsLoading(false);
    }
  }, [user.role, user.id]);

  useEffect(() => {
    if (user.role === 'admin') {
      loadTeachers();
    } else {
      setTeachers([]);
      setTeachersError('');
      setTeachersLoading(false);
    }
  }, [user.role]);

  useEffect(() => {
    let cancelled = false;
    api.getTaskTitles()
      .then((data) => {
        if (cancelled) return;
        setTaskTitles(data && typeof data === 'object' ? data : {});
      })
      .catch(() => {
        if (!cancelled) setTaskTitles({});
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (user.role !== 'student') {
      setGoalTestsDb(null);
      setGoalTestsLoaded(false);
      return;
    }
    let cancelled = false;
    setGoalTestsLoaded(false);
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setGoalTestsDb(data && typeof data === 'object' ? data : {});
        setGoalTestsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setGoalTestsDb({});
          setGoalTestsLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [user.role]);

  useEffect(() => {
    if (user.role !== 'student') {
      stopXpGainAnimation();
      setSolvedByTask({});
      setStudentSolvedEvents([]);
      setStudentDataLoaded(false);
      setStudentStreak(getDefaultStreak());
      setStudentXpTotal(0);
      setXpDisplayTotal(0);
      prevLevelRef.current = null;
      if (levelUpTimerRef.current) {
        clearTimeout(levelUpTimerRef.current);
        levelUpTimerRef.current = null;
      }
      setLevelUpPopup({ open: false, from: 1, to: 1, totalXp: 0 });
      return;
    }
    let cancelled = false;
    setStudentDataLoaded(false);
    api.getStudentData(user.id)
      .then((data) => {
        if (cancelled) return;
        const solved = data?.solvedByTask && typeof data.solvedByTask === 'object'
          ? data.solvedByTask
          : {};
        const solvedEvents = Array.isArray(data?.solvedEvents) ? data.solvedEvents : [];
        setSolvedByTask(solved);
        setStudentSolvedEvents(solvedEvents);
        setStudentStreak(normalizeStreak(data?.streak));
        const resolvedXp = Number.isFinite(Number(data?.xpTotal))
          ? normalizeXpTotal(data.xpTotal)
          : deriveXpFromSolvedByTask(solved);
        setStudentXpTotal(resolvedXp);
        if (!xpAnimationRunningRef.current) {
          setXpDisplayTotal(resolvedXp);
        }
        setStudentDataLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          stopXpGainAnimation();
          setSolvedByTask({});
          setStudentSolvedEvents([]);
          setStudentStreak(getDefaultStreak());
          setStudentXpTotal(0);
          setXpDisplayTotal(0);
          setStudentDataLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [goalRefreshTick, stopXpGainAnimation, user.id, user.role]);

  useEffect(() => {
    paceForecastShownRef.current = false;
    setPaceForecastPopupOpen(false);
  }, [user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'student') return;
    if (!studentDataLoaded) return;
    if (!Number.isFinite(currentLevel) || currentLevel < 1) return;

    const previousLevel = prevLevelRef.current;
    if (!Number.isFinite(previousLevel)) {
      prevLevelRef.current = currentLevel;
      return;
    }
    if (currentLevel > previousLevel) {
      setLevelUpPopup({
        open: true,
        from: previousLevel,
        to: currentLevel,
        totalXp
      });
      if (levelUpTimerRef.current) clearTimeout(levelUpTimerRef.current);
      levelUpTimerRef.current = setTimeout(() => {
        setLevelUpPopup((prev) => ({ ...prev, open: false }));
        levelUpTimerRef.current = null;
      }, 4500);
    }
    prevLevelRef.current = currentLevel;
  }, [user.role, studentDataLoaded, currentLevel, totalXp]);

  useEffect(() => () => {
    if (levelUpTimerRef.current) {
      clearTimeout(levelUpTimerRef.current);
      levelUpTimerRef.current = null;
    }
  }, []);

  const closePaceForecastPopup = useCallback(() => {
    setPaceForecastPopupOpen(false);
    paceForecastShownRef.current = true;
    if (user.role === 'student') {
      markPaceForecastDismissedInSession(user.id);
      markPaceForecastShownNow(user.id);
    }
  }, [user.role, user.id]);
  const openPaceForecastPopup = useCallback(() => {
    if (user.role !== 'student') return;
    paceForecastShownRef.current = true;
    markPaceForecastShownNow(user.id);
    setPaceForecastPopupOpen(true);
  }, [user.role, user.id]);
  const handleOpenProgressFromForecast = useCallback(() => {
    closePaceForecastPopup();
    navigateToView('progress');
    setMenuOpen(false);
    if (user.role === 'student') {
      updateUserLocation(user, {
        view: 'progress',
        progressSection: 'progress'
      });
    }
  }, [closePaceForecastPopup, navigateToView, user]);

  useEffect(() => {
    if (user.role !== 'student') return;
    if (!goalTestsLoaded || !studentDataLoaded) return;
    if ((Number(solvedPerDayStats.solvedCount) || 0) <= 0) return;
    if (paceForecastShownRef.current) return;
    const reminderDue = isPaceForecastReminderDue(user.id);
    if (!reminderDue && isPaceForecastDismissedInSession(user.id)) {
      paceForecastShownRef.current = true;
      setPaceForecastPopupOpen(false);
      return;
    }
    paceForecastShownRef.current = true;
    markPaceForecastShownNow(user.id);
    setPaceForecastPopupOpen(true);
  }, [goalTestsLoaded, studentDataLoaded, solvedPerDayStats.solvedCount, user.role, user.id]);

  useEffect(() => {
    setGoalCollapsed(user.role === 'student');
  }, [user.role]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(DESKTOP_NAV_COLLAPSED_KEY, desktopNavCollapsed ? '1' : '0');
    } catch { /* no-op */ }
  }, [desktopNavCollapsed]);

  useEffect(() => {
    const prev = prevGoalCollapsedRef.current;
    if (prev === goalCollapsed) return;
    const animClass = goalCollapsed ? 'goal-collapse' : 'goal-expand';
    setGoalPanelAnimClass(animClass);
    prevGoalCollapsedRef.current = goalCollapsed;
    const clearDelay = goalCollapsed ? 240 : 300;
    const timerId = setTimeout(() => setGoalPanelAnimClass(''), clearDelay);
    return () => clearTimeout(timerId);
  }, [goalCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      setIsDesktopWide(window.innerWidth > 1000);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isDesktopWide && homeworkPopupOpen) {
      setHomeworkPopupOpen(false);
    }
  }, [isDesktopWide, homeworkPopupOpen]);

  useEffect(() => {
    studentStreakRef.current = studentStreak;
  }, [studentStreak]);

  useEffect(() => {
    if (user.role !== 'teacher') {
      setTeacherNotifs([]);
      return;
    }
    setTeacherNotifs([]);
  }, [user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'teacher') return;
    let cancelled = false;

    const fetchEvents = async () => {
      try {
        const events = await api.getTeacherSolvedEvents(user.id, null, 200);
        if (cancelled) return;
        const unique = [];
        const seenIds = new Set();
        (Array.isArray(events) ? events : []).forEach((event) => {
          const eventId = typeof event?.id === 'string' ? event.id.trim() : '';
          if (!eventId || seenIds.has(eventId)) return;
          seenIds.add(eventId);
          unique.push({ ...event, id: eventId });
        });
        const sorted = unique.sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt));
        setTeacherNotifs(sorted);
      } catch {
        // ignore
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user.role, user.id]);

  const handleStudentCreated = (student) => {
    if (!student) return;
    setStudents((prev) => [student, ...prev]);
    setActiveStudentId(student.id);
  };

  const handleStudentDeleted = (payload) => {
    const student = typeof payload === 'string' ? { id: payload } : payload;
    if (!student?.id) return;
    setStudents((prev) => {
      const next = prev.filter((s) => s.id !== student.id);
      setActiveStudentId((current) => (current === student.id ? (next[0]?.id || null) : current));
      return next;
    });
    setDeletedStudents((prev) => {
      const filtered = prev.filter((item) => item.id !== student.id);
      return [{ ...student }, ...filtered];
    });
  };

  const handleStudentRestored = (student) => {
    if (!student?.id) return;
    setDeletedStudents((prev) => prev.filter((item) => item.id !== student.id));
    setStudents((prev) => [student, ...prev.filter((item) => item.id !== student.id)]);
    setActiveStudentId((current) => current || student.id);
  };

  const handleStudentUpdated = (student) => {
    if (!student?.id) return;
    setStudents((prev) => prev.map((item) => (item.id === student.id ? { ...item, ...student } : item)));
  };

  const handleTaskTitleUpdate = (number, title) => {
    const key = String(number);
    setTaskTitles((prev) => {
      const next = { ...(prev || {}) };
      if (title && title.trim()) next[key] = title.trim();
      else delete next[key];
      return next;
    });
  };

  const handleProgressSectionChange = (nextSection) => {
    updateUserLocation(user, { progressSection: nextSection });
  };

  const handleTaskStateChange = (nextTask) => {
    if (user.role !== 'student') return;
    updateUserLocation(user, { openTask: nextTask });
    if (!nextTask || nextTask.section !== 'python') {
      updateUserLocation(user, { pythonLocation: null });
      return;
    }
    updateUserLocation(user, {
      pythonLocation: {
        taskNumber: nextTask.taskNumber,
        questionIndex: Number.isFinite(nextTask.questionIndex) ? nextTask.questionIndex : null
      }
    });
  };

  const handleNotesLocationChange = (location) => {
    updateUserLocation(user, { notesLocation: location });
  };

  const handleOpenTask = (taskNumber, levelId, targetQuestions) => {
    const normalizedTaskNumber = normalizeTaskNumber(taskNumber);
    if (!Number.isFinite(normalizedTaskNumber)) return;
    const pythonTask = isPythonTaskNumber(normalizedTaskNumber);
    if (user.role !== 'student') {
      navigateToView(pythonTask ? 'python' : 'progress');
      setMenuOpen(false);
      return;
    }
    const nextTask = {
      taskNumber: normalizedTaskNumber,
      levelId: pythonTask ? PYTHON_LEVEL_ID : levelId,
      targetQuestions: Array.isArray(targetQuestions) ? targetQuestions : null,
      section: pythonTask ? 'python' : 'progress',
      questionIndex: null
    };
    setPendingOpenTask(nextTask);
    setPendingOpenMockExamId(null);
    navigateToView(pythonTask ? 'python' : 'progress');
    setMenuOpen(false);
    if (pythonTask) {
      updateUserLocation(user, { view: 'python', openTask: nextTask, mockExamId: null });
    } else {
      updateUserLocation(user, {
        view: 'progress',
        openTask: nextTask,
        progressSection: 'progress',
        mockExamId: null
      });
    }
  };

  const handleOpenMockGoal = (mockExamId = null) => {
    if (user.role !== 'student') return;
    const normalizedMockExamId = normalizeMockExamId(mockExamId);
    setPendingOpenTask(null);
    setPendingOpenMockExamId(normalizedMockExamId || null);
    navigateToView('progress');
    setMenuOpen(false);
    updateUserLocation(user, {
      view: 'progress',
      openTask: null,
      progressSection: 'mocks',
      mockExamId: normalizedMockExamId || null
    });
    setProgressSectionJumpToken((prev) => prev + 1);
  };

  const handleOpenMockGoalHandled = () => {
    setPendingOpenMockExamId(null);
    if (user.role !== 'student') return;
    updateUserLocation(user, { mockExamId: null });
  };

  const handleExpandGoalBlock = useCallback(() => {
    setGoalCollapsed(false);
    const mainNode = mainScrollRef.current;
    if (mainNode && typeof mainNode.scrollTo === 'function') {
      mainNode.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const formatDaysText = (days) => {
    const value = Number(days) || 0;
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return `${value} день`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} дня`;
    return `${value} дней`;
  };
  const formatMonthsText = (months) => {
    const value = Number(months) || 0;
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return `${value} месяц`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} месяца`;
    return `${value} месяцев`;
  };
  const formatMonthsAndDaysText = (days) => {
    const totalDays = Math.max(0, Math.ceil(Number(days) || 0));
    const months = Math.floor(totalDays / 30);
    const restDays = totalDays % 30;
    if (months <= 0) return formatDaysText(restDays);
    if (restDays <= 0) return formatMonthsText(months);
    return `${formatMonthsText(months)} ${formatDaysText(restDays)}`;
  };
  const hasForecastDuration = (
    testingForecast.total > 0
    && testingForecast.remaining > 0
    && Number.isFinite(testingForecast.averagePerDay)
    && testingForecast.averagePerDay > 0
    && Number.isFinite(testingForecast.daysToFinish)
  );
  const testingCompletionPercent = testingForecast.total > 0
    ? Math.max(0, Math.min(100, Math.round((testingForecast.solved / testingForecast.total) * 100)))
    : 0;
  const testingForecastDurationText = hasForecastDuration
    ? formatMonthsAndDaysText(testingForecast.daysToFinish)
    : '';
  const testingForecastFinishDateLabel = (() => {
    if (!hasForecastDuration) return '';
    const targetDate = new Date();
    const days = Math.max(0, Math.ceil(Number(testingForecast.daysToFinish) || 0));
    targetDate.setHours(12, 0, 0, 0);
    targetDate.setDate(targetDate.getDate() + days);
    return targetDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  })();
  const testingForecastText = (() => {
    if (testingForecast.total <= 0) {
      return 'Пока нет данных о заданиях в разделе тестирования.';
    }
    if (testingForecast.remaining <= 0) {
      return 'Все задания в тестированиях уже решены.';
    }
    if (!hasForecastDuration) {
      return 'Пока недостаточно решений, чтобы оценить срок завершения.';
    }
    return '';
  })();
  const egeDeadlineStats = useMemo(() => {
    const now = new Date();
    const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    let deadline = new Date(todayNoon.getFullYear(), 5, 18, 12, 0, 0, 0); // 18 June
    if (todayNoon.getTime() > deadline.getTime()) {
      deadline = new Date(todayNoon.getFullYear() + 1, 5, 18, 12, 0, 0, 0);
    }
    const rawDays = Math.floor((deadline.getTime() - todayNoon.getTime()) / (24 * 60 * 60 * 1000));
    const daysAvailable = Math.max(rawDays + 1, 1); // include today
    const remaining = Math.max(0, Number(testingForecast.remaining) || 0);
    const currentPerDay = Math.max(0, Number(testingForecast.averagePerDay) || 0);
    const requiredPerDay = daysAvailable > 0 ? (remaining / daysAvailable) : remaining;
    const extraPerDay = Math.max(requiredPerDay - currentPerDay, 0);
    const bufferPerDay = Math.max(currentPerDay - requiredPerDay, 0);
    const isOnTrack = extraPerDay <= 0.01;
    return {
      deadlineLabel: deadline.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
      daysAvailable,
      currentPerDay,
      requiredPerDay,
      extraPerDay,
      bufferPerDay,
      isOnTrack,
      requiredPerDayLabel: formatPerDayRateLabel(requiredPerDay),
      extraPerDayLabel: formatPerDayRateLabel(extraPerDay),
      bufferPerDayLabel: formatPerDayRateLabel(bufferPerDay),
    };
  }, [testingForecast.averagePerDay, testingForecast.remaining]);
  const shouldShowEgeDeadlineHint = testingForecast.total > 0 && testingForecast.remaining > 0;
  const paceBadgeState = useMemo(() => {
    if (!shouldShowEgeDeadlineHint) {
      return {
        level: 'ok',
        className: 'border-emerald-200 text-emerald-600',
        title: `В среднем ${averageSolvedPerDayLabel} задания/день за ${solvedPerDayStats.periodDays || 0} дн.`
      };
    }
    if (egeDeadlineStats.isOnTrack) {
      return {
        level: 'ok',
        className: 'border-emerald-200 text-emerald-600',
        title: `Вы успеваете к дедлайну. Запас: +${egeDeadlineStats.bufferPerDayLabel} задания/день.`
      };
    }
    const extra = Number(egeDeadlineStats.extraPerDay) || 0;
    const required = Number(egeDeadlineStats.requiredPerDay) || 0;
    const lagRatio = required > 0 ? (extra / required) : 0;
    const isDanger = extra >= 1 || lagRatio >= 0.35;
    if (isDanger) {
      return {
        level: 'danger',
        className: 'border-rose-200 text-rose-600',
        title: `Сильное отставание: нужно добавить +${egeDeadlineStats.extraPerDayLabel} задания/день.`
      };
    }
    return {
      level: 'warn',
      className: 'border-amber-200 text-amber-600',
      title: `Небольшое отставание: нужно добавить +${egeDeadlineStats.extraPerDayLabel} задания/день.`
    };
  }, [averageSolvedPerDayLabel, egeDeadlineStats, shouldShowEgeDeadlineHint, solvedPerDayStats.periodDays]);

  const refreshGoalState = async () => {
    if (user.role !== 'student') return;
    try {
      const data = await api.getStudentNextLesson(user.id);
      const list = Array.isArray(data?.homeworks) ? data.homeworks : [];
      const sorted = [...list].sort((a, b) => new Date(b?.issuedAt || 0) - new Date(a?.issuedAt || 0));
      const normalizeEntryGoals = (item) => {
        if (!item) return [];
        if (Array.isArray(item.goals) && item.goals.length > 0) {
          return item.goals
            .map((goal) => {
              const goalType = normalizeGoalType(goal);
              if (goalType === GOAL_TYPE_MOCK) {
                const mockExamId = normalizeMockExamId(goal?.mockExamId);
                if (!mockExamId) return null;
                return {
                  type: GOAL_TYPE_MOCK,
                  mockExamId
                };
              }
              const normalizedTaskNumber = normalizeTaskNumber(goal?.taskNumber);
              const taskNumberValue = Number.isFinite(normalizedTaskNumber)
                ? normalizedTaskNumber
                : null;
              const isPythonGoal = taskNumberValue ? isPythonTaskNumber(taskNumberValue) : false;
              return {
                type: GOAL_TYPE_TASK,
                taskNumber: taskNumberValue,
                levelId: isPythonGoal ? PYTHON_LEVEL_ID : (goal?.levelId || 'basic'),
                targetQuestions: Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [],
                includeAll: Boolean(goal?.includeAll)
              };
            })
            .filter((goal) => (
              goal?.type === GOAL_TYPE_MOCK
                ? Boolean(goal?.mockExamId)
                : Number.isFinite(goal?.taskNumber)
            ));
        }
        if (item.taskNumber && item.levelId) {
          const normalizedTaskNumber = Number.isFinite(normalizeTaskNumber(item.taskNumber))
            ? normalizeTaskNumber(item.taskNumber)
            : Number(item.taskNumber);
          const isPythonGoal = isPythonTaskNumber(normalizedTaskNumber);
          return [{
            type: GOAL_TYPE_TASK,
            taskNumber: normalizedTaskNumber,
            levelId: isPythonGoal ? PYTHON_LEVEL_ID : item.levelId,
            targetQuestions: Array.isArray(item.targetQuestions) ? item.targetQuestions : [],
            includeAll: Boolean(item.includeAll)
          }];
        }
        return [];
      };

      const entry = sorted.find((item) => normalizeEntryGoals(item).length > 0);
      if (!entry) {
        setGoalState(null);
        return;
      }
      const goals = normalizeEntryGoals(entry);
      if (goals.length === 0) {
        setGoalState(null);
        return;
      }
      const taskGoals = goals.filter((goal) => goal.type === GOAL_TYPE_TASK);
      const unique = [];
      const seen = new Set();
      taskGoals.forEach((goal) => {
        const key = `${goal.taskNumber}|${goal.levelId}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push({ key, taskNumber: goal.taskNumber, levelId: goal.levelId });
      });
      const solvedMap = {};
      if (unique.length > 0) {
        const solvedResults = await Promise.all(
          unique.map((item) => api.getSolvedQuestions(user.id, item.taskNumber, item.levelId).catch(() => []))
        );
        unique.forEach((item, idx) => {
          const list = Array.isArray(solvedResults[idx]) ? solvedResults[idx] : [];
          solvedMap[item.key] = new Set(list.map((val) => String(val)));
        });
      }

      const mockGoalIds = Array.from(new Set(
        goals
          .filter((goal) => goal.type === GOAL_TYPE_MOCK)
          .map((goal) => normalizeMockExamId(goal.mockExamId))
          .filter(Boolean)
      ));
      let mockExamById = {};
      let mockAttemptById = {};
      if (mockGoalIds.length > 0) {
        const mockExams = await api.getMockExams(user.id).catch(() => []);
        mockExamById = Array.isArray(mockExams)
          ? mockExams.reduce((acc, exam) => {
              if (exam?.id) acc[String(exam.id)] = exam;
              return acc;
            }, {})
          : {};
        const attempts = await Promise.all(
          mockGoalIds.map((examId) => api.getMockAttempt(user.id, examId).catch(() => null))
        );
        mockAttemptById = mockGoalIds.reduce((acc, examId, idx) => {
          const attempt = attempts[idx];
          if (attempt && typeof attempt === 'object') acc[examId] = attempt;
          return acc;
        }, {});
      }

      const goalsWithStatus = goals.map((goal) => {
        if (goal.type === GOAL_TYPE_MOCK) {
          const mockExamId = normalizeMockExamId(goal.mockExamId);
          const mockExam = mockExamById[mockExamId] || null;
          const mockProgress = getMockGoalProgress(mockExam, mockAttemptById[mockExamId]);
          return {
            type: GOAL_TYPE_MOCK,
            mockExamId,
            mockExamTitle: mockExam?.title || 'Пробник',
            taskStatus: mockProgress.taskStatus,
            solvedCount: mockProgress.solvedCount,
            totalCount: mockProgress.totalCount,
            completed: mockProgress.completed
          };
        }
        const taskNumber = Number.isFinite(normalizeTaskNumber(goal.taskNumber))
          ? normalizeTaskNumber(goal.taskNumber)
          : goal.taskNumber;
        const isPythonGoal = isPythonTaskNumber(taskNumber);
        const levelId = isPythonGoal ? PYTHON_LEVEL_ID : goal.levelId;
        const questionsList = goalTestsDb?.[String(taskNumber)]?.[levelId] || [];
        const totalCount = questionsList.length;
        const targetNumbers = goal.includeAll
          ? (totalCount > 0 ? Array.from({ length: totalCount }, (_, i) => i + 1) : [])
          : Array.from(new Set(
              (Array.isArray(goal.targetQuestions) ? goal.targetQuestions : [])
                .map((val) => Number(val))
                .filter((val) => Number.isFinite(val) && val > 0)
            )).sort((a, b) => a - b);
        const solvedSet = solvedMap[`${taskNumber}|${levelId}`] || new Set();
        const targetStatus = targetNumbers.map((num) => {
          const question = questionsList[num - 1];
          const qId = question?.id;
          const solved = qId ? solvedSet.has(String(qId)) : false;
          return { num, solved };
        });
        const solvedCount = targetStatus.filter((item) => item.solved).length;
        const completed = targetStatus.length > 0 && targetStatus.every((item) => item.solved);
        const pythonTask = isPythonGoal ? getPythonTaskInfo(taskNumber) : null;
        const taskInfo = !isPythonGoal
          ? tasksWithTitles.find((task) => Number(task.number) === Number(taskNumber))
          : null;
        const taskTitle = pythonTask?.title || taskInfo?.title || `Задание ${formatTaskNumber(taskNumber) || taskNumber}`;
        const levelLabel = isPythonGoal
          ? 'Python'
          : (LEVELS[levelId?.toUpperCase()]?.label || levelId);
        return {
          type: GOAL_TYPE_TASK,
          taskNumber,
          levelId,
          levelLabel,
          taskTitle,
          targetNumbers,
          targetStatus,
          solvedCount,
          totalCount: targetStatus.length,
          completed,
          includeAll: goal.includeAll
        };
      });

      const filteredGoals = goalsWithStatus.filter(
        (goal) => (
          goal.type === GOAL_TYPE_MOCK
            ? Boolean(goal.mockExamId)
            : (goal.includeAll || (Array.isArray(goal.targetNumbers) && goal.targetNumbers.length > 0))
        )
      );
      if (filteredGoals.length === 0) {
        setGoalState(null);
        return;
      }
      const completed = filteredGoals.length > 0 && filteredGoals.every((goal) => goal.completed);
      setGoalState({
        entry,
        goals: filteredGoals,
        completed,
      });
    } catch {
      setGoalState(null);
    }
  };

  useEffect(() => {
    if (user.role !== 'student') return;
    refreshGoalState();
  }, [user.role, user.id, goalRefreshTick, goalTestsDb, taskTitles]);

  useEffect(() => {
    if (user.role !== 'student') return;
    checkHomeworkPopup();
    const intervalId = setInterval(() => {
      checkHomeworkPopup();
    }, 60000);
    return () => clearInterval(intervalId);
  }, [user.role, user.id]);

  const goalGoals = Array.isArray(goalState?.goals) ? goalState.goals : [];
  const goalCompletedCount = goalGoals.filter((goal) => goal.completed).length;
  const firstGoal = goalGoals[0] || null;
  const shouldShowGoalBlock = user.role === 'student'
    && view !== 'schedule'
    && view !== 'collab'
    && view !== 'board'
    && goalState?.entry
    && !goalState.completed
    && goalGoals.length > 0;

  useLayoutEffect(() => {
    if (!goalFlyActiveRef.current) return;
    const sourceRect = goalFlyFromRectRef.current;
    const cloneNode = goalFlyCloneRef.current;
    const targetType = goalFlyTargetTypeRef.current;
    if (!sourceRect || !cloneNode || !targetType) {
      stopGoalFlyAnimation();
      return;
    }

    const findTargetNode = () => {
      if (targetType === 'goal') {
        if (!shouldShowGoalBlock) return null;
        const wrapper = goalSummaryFlyRef.current;
        if (!wrapper) return null;
        return wrapper.firstElementChild instanceof HTMLElement
          ? wrapper.firstElementChild
          : wrapper;
      }
      if (targetType === 'schedule') {
        const wrapper = scheduleHomeworkFlyRef.current;
        if (!wrapper) return null;
        return wrapper.firstElementChild instanceof HTMLElement
          ? wrapper.firstElementChild
          : wrapper;
      }
      return null;
    };

    let frameId = 0;
    const startTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const maxWaitMs = 900;

    const runAnimation = () => {
      const targetNode = findTargetNode();
      if (!targetNode) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if ((now - startTs) > maxWaitMs) {
          stopGoalFlyAnimation();
          return;
        }
        frameId = requestAnimationFrame(runAnimation);
        return;
      }

      const targetRect = targetNode.getBoundingClientRect();
      if (targetRect.width < 8 || targetRect.height < 8) {
        frameId = requestAnimationFrame(runAnimation);
        return;
      }
      goalFlyTargetNodeRef.current = targetNode;

      const sourceStyle = window.getComputedStyle(cloneNode);
      const targetStyle = window.getComputedStyle(targetNode);
      const sourceRadius = sourceStyle.borderRadius || '16px';
      const targetRadius = targetStyle.borderRadius || sourceRadius;
      const morphRadius = targetRadius && targetRadius !== '0px' ? targetRadius : sourceRadius;
      const sourceShadow = sourceStyle.boxShadow || 'none';
      const targetShadow = targetStyle.boxShadow || sourceShadow;
      const deltaX = targetRect.left - sourceRect.left;
      const deltaY = targetRect.top - sourceRect.top;
      const scaleX = Math.max(0.2, Math.min(3, targetRect.width / sourceRect.width));
      const scaleY = Math.max(0.2, Math.min(3, targetRect.height / sourceRect.height));
      const distance = Math.hypot(deltaX, deltaY);
      const axisDistance = Math.abs(deltaY) + (Math.abs(deltaX) * 0.55);
      const totalDuration = Math.round(Math.max(460, Math.min(820, 420 + axisDistance * 0.5)));
      const revealDelay = Math.round(totalDuration * 0.44);
      const revealDuration = Math.round(Math.max(320, Math.min(520, totalDuration * 0.68)));
      const directionFactor = deltaY < 0 ? -1 : 1;
      const introOffsetY = deltaY < 0 ? 12 : -12;
      const arcStrength = Math.max(16, Math.min(44, distance * 0.14));
      const arcOffsetY = directionFactor * arcStrength;
      const midX = deltaX * 0.42;
      const midY = deltaY * 0.42 + arcOffsetY;
      const nearX = deltaX * 0.86;
      const nearY = deltaY * 0.86 + directionFactor * (arcStrength * 0.25);
      const midScaleX = 1 + (scaleX - 1) * 0.44;
      const midScaleY = 1 + (scaleY - 1) * 0.44;
      const nearScaleX = 1 + (scaleX - 1) * 0.88;
      const nearScaleY = 1 + (scaleY - 1) * 0.88;
      const flyEasing = 'cubic-bezier(0.14, 0.82, 0.18, 1)';
      const revealEasing = 'cubic-bezier(0.16, 1, 0.3, 1)';

      targetNode.style.willChange = 'opacity, filter, transform';
      targetNode.style.transition = 'none';
      targetNode.style.opacity = '0.02';
      targetNode.style.filter = 'blur(3px)';
      targetNode.style.transform = `translateY(${introOffsetY}px) scale(0.97)`;
      targetNode.style.pointerEvents = 'none';
      targetNode.getBoundingClientRect();

      if (typeof cloneNode.animate === 'function') {
        cloneNode.animate(
          [
            {
              transform: 'translate(0px, 0px) scale(1, 1)',
              borderRadius: morphRadius,
              boxShadow: sourceShadow,
              opacity: 0.98,
              offset: 0
            },
            {
              transform: `translate(${midX}px, ${midY}px) scale(${midScaleX}, ${midScaleY})`,
              borderRadius: morphRadius,
              boxShadow: targetShadow,
              opacity: 0.94,
              offset: 0.34
            },
            {
              transform: `translate(${nearX}px, ${nearY}px) scale(${nearScaleX}, ${nearScaleY})`,
              borderRadius: morphRadius,
              boxShadow: targetShadow,
              opacity: 0.72,
              offset: 0.72
            },
            {
              transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
              borderRadius: morphRadius,
              boxShadow: targetShadow,
              opacity: 0.15,
              offset: 0.96
            },
            {
              transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
              borderRadius: morphRadius,
              boxShadow: targetShadow,
              opacity: 0,
              offset: 1
            },
          ],
          {
            duration: totalDuration,
            easing: flyEasing,
            fill: 'forwards'
          }
        );
      } else {
        cloneNode.style.transition = `transform ${totalDuration}ms ${flyEasing}, opacity ${totalDuration}ms ease, box-shadow ${totalDuration}ms ease`;
        cloneNode.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;
        cloneNode.style.borderRadius = morphRadius;
        cloneNode.style.boxShadow = targetShadow;
        cloneNode.style.opacity = '0';
      }
      goalFlyRevealTimerRef.current = setTimeout(() => {
        targetNode.style.transition = `opacity ${revealDuration}ms ${revealEasing}, filter ${revealDuration}ms ease, transform ${revealDuration}ms ${revealEasing}`;
        targetNode.style.opacity = '1';
        targetNode.style.filter = 'none';
        targetNode.style.transform = 'translateY(0px) scale(1)';
        targetNode.style.pointerEvents = '';
      }, revealDelay);

      const resetDelay = Math.max(totalDuration + 90, revealDelay + revealDuration + 48);
      goalFlyResetTimerRef.current = setTimeout(() => {
        stopGoalFlyAnimation();
      }, resetDelay);
    };

    frameId = requestAnimationFrame(runAnimation);

    return () => {
      if (goalFlyRevealTimerRef.current) {
        clearTimeout(goalFlyRevealTimerRef.current);
        goalFlyRevealTimerRef.current = null;
      }
      if (goalFlyResetTimerRef.current) {
        clearTimeout(goalFlyResetTimerRef.current);
        goalFlyResetTimerRef.current = null;
      }
      cancelAnimationFrame(frameId);
    };
  }, [shouldShowGoalBlock, stopGoalFlyAnimation, view]);

  useEffect(() => () => {
    stopGoalFlyAnimation();
  }, [stopGoalFlyAnimation]);

  const dismissTeacherNotif = async (eventId) => {
    if (!eventId) return;
    setTeacherNotifs((prev) => prev.filter((note) => note.id !== eventId));
    try {
      await api.markTeacherSolvedEventsRead(user.id, [eventId]);
    } catch { /* no-op */ }
  };

  return (
    <div className="app-min-h app-shell flex font-sans text-slate-900">
      {user.role === 'teacher' && teacherNotifs.length > 0 && (
        <div className="fixed left-2 right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[1200] space-y-3 sm:left-auto sm:right-4 sm:top-4 sm:w-full sm:max-w-[320px]">
          {teacherNotifs.map((note) => {
            const levelLabel = note.levelId === PYTHON_LEVEL_ID
              ? 'Python'
              : (LEVELS[note.levelId?.toUpperCase()]?.label || note.levelId || '');
            const questionPart = note.questionNumber ? ` · вопрос ${note.questionNumber}` : '';
            return (
              <div key={note.id} className="surface-panel toast-enter rounded-2xl px-4 py-3 text-sm text-slate-700 relative">
                <button
                  type="button"
                  onClick={() => dismissTeacherNotif(note.id)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                  aria-label="Закрыть уведомление"
                >
                  <X size={16} />
                </button>
                <div className="text-xs font-bold uppercase tracking-widest text-purple-500">Новая отметка</div>
                <div className="mt-1 font-semibold text-gray-900 truncate">
                  {note.studentName || 'Ученик'}
                </div>
                <div className="text-xs text-gray-500">
                  {`Решено: задание ${formatTaskNumber(note.taskNumber) || note.taskNumber}${levelLabel ? ` · ${levelLabel}` : ''}${questionPart}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {user.role === 'student' && xpDockVisible && (
        <div className="xp-flight-dock-shell">
          <div className={`xp-flight-dock ${xpAnimationActive ? 'xp-flight-dock--active' : ''}`}>
            <div className="xp-flight-dock-level">{currentLevel}</div>
            <div className="min-w-0 flex-1">
              <div className="xp-flight-dock-meta">
                <span>{`${xpIntoLevelLabel}/${xpPerLevelLabel} XP`}</span>
                <span>{`${totalXpLabel} XP`}</span>
              </div>
              <div ref={xpDockBarRef} className="xp-flight-dock-track">
                <div
                  className="xp-flight-dock-fill"
                  style={{ width: `${levelProgressPercent}%` }}
                />
                <div className="xp-flight-dock-shine" />
              </div>
            </div>
          </div>
        </div>
      )}
      {user.role === 'student' && xpFlightStars.length > 0 && (
        <div className="xp-flight-overlay" aria-hidden="true">
          {xpFlightStars.map((star) => (
            <span
              key={star.id}
              className="xp-flight-star"
              style={{
                '--xp-size': `${star.sizePx}px`,
                '--xp-delay': `${star.delayMs}ms`,
                '--xp-duration': `${star.durationMs}ms`,
                '--xp-start-x': `${star.startX}px`,
                '--xp-start-y': `${star.startY}px`,
                '--xp-mid-x': `${star.midX}px`,
                '--xp-mid-y': `${star.midY}px`,
                '--xp-end-x': `${star.endX}px`,
                '--xp-end-y': `${star.endY}px`,
                '--xp-rotate': `${star.rotateDeg}deg`,
                '--xp-hue': `${star.hue}deg`,
              }}
            />
          ))}
        </div>
      )}
      {streakPopup.open && (
          <div
            className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/30 backdrop-blur-sm streak-overlay"
            onClick={() => setStreakPopup((prev) => ({ ...prev, open: false }))}
          >
            <div
              className="w-[280px] rounded-[32px] bg-white px-6 py-6 text-center shadow-2xl streak-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-purple-100 streak-mascot">
                <img src={mascotApproval} alt="Маскот" className="h-16 w-16 object-contain" />
              </div>
              <div className="text-5xl font-extrabold text-purple-600">{streakPopup.current}</div>
              <div className="mt-1 text-sm font-semibold text-purple-600">
                {`${formatDaysText(streakPopup.current)} подряд`}
              </div>
              <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50 px-4 py-2 text-[11px] text-purple-700 shadow-sm">
                {streakPopup.isNewRecord
                  ? `Новый рекорд! ${formatDaysText(streakPopup.current)} подряд.`
                  : `Отлично! Серия ${formatDaysText(streakPopup.current)} подряд.`}
              </div>
              <button
                type="button"
                onClick={() => setStreakPopup((prev) => ({ ...prev, open: false }))}
                className="mt-4 w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50"
              >
                Ок
              </button>
            </div>
          </div>
      )}
      {levelUpPopup.open && (
        <div
          className="fixed inset-0 z-[1350] flex items-center justify-center bg-slate-950/45 backdrop-blur-[3px] levelup-overlay"
          onClick={() => setLevelUpPopup((prev) => ({ ...prev, open: false }))}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="levelup-rings">
              <span className="levelup-ring levelup-ring--a" />
              <span className="levelup-ring levelup-ring--b" />
              <span className="levelup-ring levelup-ring--c" />
            </div>
            <div className="levelup-rays">
              <span className="levelup-ray levelup-ray--a" />
              <span className="levelup-ray levelup-ray--b" />
              <span className="levelup-ray levelup-ray--c" />
            </div>
            {levelUpParticles.map((particle) => (
              <span
                key={particle.key}
                className="levelup-particle"
                style={{
                  left: particle.left,
                  width: particle.size,
                  height: particle.size,
                  '--levelup-drift-x': particle.driftX,
                  '--levelup-rotate': particle.rotate,
                  '--levelup-delay': particle.delay,
                  '--levelup-duration': particle.duration,
                }}
              />
            ))}
          </div>
          <div
            className="levelup-card relative w-[min(92vw,420px)] rounded-[30px] border border-violet-200/70 bg-gradient-to-br from-white via-violet-50 to-fuchsia-100/85 px-6 py-6 text-center shadow-[0_28px_80px_rgba(67,17,128,0.35)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 levelup-badge">
              <div className="levelup-badge-core">{levelUpPopup.to}</div>
              <div className="levelup-badge-glow" />
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-700">Level Up</div>
            <div className="mt-1 text-3xl font-extrabold text-slate-900">{`Уровень ${levelUpPopup.to}`}</div>
            <div className="mt-2 text-xs font-semibold text-slate-500">{`Было ${levelUpPopup.from} • стало ${levelUpPopup.to}`}</div>
            <div className="mt-3 inline-flex items-center rounded-full border border-violet-200 bg-white/85 px-3 py-1 text-xs font-semibold text-violet-700">
              {`${(Number(levelUpPopup.totalXp) || totalXp).toLocaleString('ru-RU')} XP`}
            </div>
            <button
              type="button"
              onClick={() => setLevelUpPopup((prev) => ({ ...prev, open: false }))}
              className="mt-5 w-full rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
            >
              Круто!
            </button>
          </div>
        </div>
      )}
      {user.role === 'student' && paceForecastPopupOpen && (
        <div
          className="fixed inset-0 z-[1250] flex items-center justify-center overflow-y-auto bg-black/40 px-2 pt-[max(env(safe-area-inset-top),0.75rem)] pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-[2px] sm:px-4 sm:py-4"
          onClick={closePaceForecastPopup}
        >
          <div
            className="w-full max-w-[560px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-rose-50/40 px-4 py-4 shadow-2xl sm:max-h-[88vh] sm:px-6 sm:py-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                  Прогноз подготовки
                </div>
                <div className="mt-2 text-base font-bold text-slate-900 sm:text-xl">Когда прорешаем все задания</div>
                <div className="mt-1 text-xs text-slate-500">Расчёт по текущему темпу решений</div>
              </div>
              <button
                type="button"
                onClick={closePaceForecastPopup}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-500 hover:bg-slate-50"
                aria-label="Закрыть"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white/90 px-3 py-3">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                <span>Прогресс</span>
                <span>{`${testingCompletionPercent}%`}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-purple-500 to-fuchsia-500 transition-all duration-500"
                  style={{ width: `${testingCompletionPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-1.5 text-center sm:gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[10px]">Всего</div>
                <div className="mt-1 text-[15px] font-bold text-slate-900 sm:text-base">{testingForecast.total}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2.5">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-600 sm:text-[10px]">Решено</div>
                <div className="mt-1 text-[15px] font-bold text-emerald-700 sm:text-base">{testingForecast.solved}</div>
              </div>
              <div className="rounded-xl border border-purple-200 bg-purple-50 px-2 py-2.5">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-purple-600 sm:text-[10px]">Осталось</div>
                <div className="mt-1 text-[15px] font-bold text-purple-700 sm:text-base">{testingForecast.remaining}</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
              {hasForecastDuration ? (
                <div className="space-y-2">
                  <div className="text-[13px] font-semibold text-rose-700 sm:text-sm">
                    При таком темпе подготовимся к ЕГЭ полностью примерно через
                  </div>
                  <div className="rounded-xl border border-rose-300 bg-white px-3 py-3 text-center">
                    <div className="text-[30px] font-extrabold leading-none text-rose-700 sm:text-4xl">
                      {testingForecastDurationText}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-rose-500">
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1">
                        {`до ${testingForecastFinishDateLabel}`}
                      </span>
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1">
                        {`≈ ${formatDaysText(testingForecast.daysToFinish)}`}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm font-semibold text-rose-700">{testingForecastText}</div>
              )}
            </div>

            <div className="mt-3 text-[11px] text-slate-500 sm:text-xs">
              {`Текущий темп: ${averageSolvedPerDayLabel} задания/день.`}
              {solvedPerDayStats.periodDays > 0 ? ` Период расчёта: ${formatDaysText(solvedPerDayStats.periodDays)}.` : ''}
            </div>
            {shouldShowEgeDeadlineHint && (
              <div className={`mt-3 rounded-xl border px-3 py-2.5 ${
                egeDeadlineStats.isOnTrack
                  ? 'border-emerald-200 bg-emerald-50/80'
                  : 'border-amber-200 bg-amber-50/80'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className={`text-[11px] font-semibold ${
                    egeDeadlineStats.isOnTrack ? 'text-emerald-700' : 'text-amber-700'
                  }`}>
                    {`Цель: успеть до ${egeDeadlineStats.deadlineLabel}`}
                  </div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    egeDeadlineStats.isOnTrack
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                      : 'border-amber-300 bg-amber-100 text-amber-700'
                  }`}>
                    {egeDeadlineStats.isOnTrack ? 'Успеваешь' : 'Нужно ускориться'}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                  <div className={`rounded-lg border px-2 py-1.5 ${
                    egeDeadlineStats.isOnTrack
                      ? 'border-emerald-200 bg-white/80'
                      : 'border-amber-200 bg-white/80'
                  }`}>
                    <div className={`text-[10px] uppercase tracking-wide ${
                      egeDeadlineStats.isOnTrack ? 'text-emerald-600' : 'text-amber-600'
                    }`}>Нужно в день</div>
                    <div className={`mt-0.5 text-sm font-extrabold ${
                      egeDeadlineStats.isOnTrack ? 'text-emerald-800' : 'text-amber-800'
                    }`}>{`${egeDeadlineStats.requiredPerDayLabel}`}</div>
                  </div>
                  <div className={`rounded-lg border px-2 py-1.5 ${
                    egeDeadlineStats.isOnTrack
                      ? 'border-emerald-200 bg-white/80'
                      : 'border-amber-200 bg-white/80'
                  }`}>
                    <div className={`text-[10px] uppercase tracking-wide ${
                      egeDeadlineStats.isOnTrack ? 'text-emerald-600' : 'text-amber-600'
                    }`}>Осталось дней</div>
                    <div className={`mt-0.5 text-sm font-extrabold ${
                      egeDeadlineStats.isOnTrack ? 'text-emerald-800' : 'text-amber-800'
                    }`}>{egeDeadlineStats.daysAvailable}</div>
                  </div>
                </div>
                <div className={`mt-2 text-sm font-extrabold ${
                  egeDeadlineStats.isOnTrack ? 'text-emerald-900' : 'text-amber-900'
                }`}>
                  {egeDeadlineStats.isOnTrack
                    ? `Запас по темпу: +${egeDeadlineStats.bufferPerDayLabel} задания/день.`
                    : `Нужно добавить: +${egeDeadlineStats.extraPerDayLabel} задания/день.`}
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleOpenProgressFromForecast}
                className="rounded-xl bg-purple-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-purple-700"
              >
                Перейти к тестам
              </button>
              <button
                type="button"
                onClick={closePaceForecastPopup}
                className="rounded-xl border border-purple-200 bg-white px-3 py-3 text-sm font-semibold text-purple-700 hover:bg-purple-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
      <StudentTour
        user={user}
        view={view}
        setView={navigateToView}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        steps={STUDENT_TOUR_STEPS}
        hasSeenTour={hasStudentSeenTour}
        markSeenTour={markStudentSeenTour}
        mascotImages={MASCOT_IMAGES}
        defaultMascot={mascotGreetings}
        onFinish={() => checkHomeworkPopup()}
      />
      {/*
        Временно скрыто окно "квеста" (домашки).
        Вернуть можно, раскомментировав блок ниже.
      */}
      {/*
        {user.role === 'student' && isDesktopWide && homeworkPopupOpen && homeworkPopupEntry && (
          <NewHomeworkModal
            entry={homeworkPopupEntry}
            open={homeworkPopupOpen}
            testsDb={goalTestsDb}
            solvedByTask={solvedByTask}
            normalizeTaskNumber={normalizeTaskNumber}
            isPythonTaskNumber={isPythonTaskNumber}
            PYTHON_LEVEL_ID={PYTHON_LEVEL_ID}
            normalizeGoalType={normalizeGoalType}
            GOAL_TYPE_MOCK={GOAL_TYPE_MOCK}
            getPythonTaskInfo={getPythonTaskInfo}
            MOCK_TASKS={MOCK_TASKS}
            formatTaskNumber={formatTaskNumber}
            LEVELS={LEVELS}
            HOMEWORK_POPUP_BG={HOMEWORK_POPUP_BG}
            onClose={() => markHomeworkSeen(homeworkPopupEntry)}
            onOpenTask={handleOpenTask}
            onOpenSchedule={() => {
              setView('schedule');
              setMenuOpen(false);
              markHomeworkSeen(homeworkPopupEntry);
            }}
          />
        )}
      */}
      <div
        className={`hidden md:block md:sticky md:top-0 z-40 app-h shrink-0 overflow-hidden transition-all duration-300 ease-out ${
          desktopNavCollapsed ? 'w-0' : 'w-64 lg:w-72'
        }`}
      >
        <aside
          className={`h-full w-64 lg:w-72 sidebar-shell rounded-none overflow-hidden transition-transform duration-300 ease-out ${
            desktopNavCollapsed ? '-translate-x-full' : 'translate-x-0'
          }`}
        >
          <div className="relative flex h-full flex-col">
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="sidebar-aurora sidebar-aurora--top" />
              <div className="sidebar-aurora sidebar-aurora--bottom" />
              <div className="sidebar-grid" />
            </div>
            <div className="sidebar-top relative px-6 py-7 border-b border-white/65 bg-white/55 backdrop-blur-xl">
              <div className="hidden md:flex items-center gap-4">
                <div className="sidebar-brand-mark relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-500 text-white shadow-lg shadow-purple-300/40 ring-1 ring-white/70 font-display text-lg font-bold tracking-tight">
                  100
                  <span className="sidebar-brand-dot absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white/90" />
                </div>
                <div className="min-w-0">
                  <div className="sidebar-brand-title font-display text-xl font-bold text-slate-900">Иван на сотку</div>
                  <div className="sidebar-brand-subtitle text-xs font-semibold uppercase tracking-[0.17em] text-purple-700/80">Личный профиль</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDesktopNavCollapsed(true)}
                className="sidebar-collapse-btn absolute right-4 top-1/2 -translate-y-1/2"
                aria-label="Свернуть панель навигации"
                title="Свернуть панель"
              >
                <ChevronsLeft size={16} />
              </button>
            </div>
            <nav className="flex-1 px-4 pb-7 pr-2 pt-5 overflow-y-auto sidebar-nav" data-tour="nav">
              <div className="sidebar-nav-title mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500/85">
                Навигация
              </div>
              <div className="space-y-2.5 sidebar-nav-stack">
                {visibleNav.map((n, idx) => {
                  const isActive = view === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        navigateToView(n.id);
                        setMenuOpen(false);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      style={{ '--item-index': idx }}
                      className={`sidebar-nav-item group relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ease-out ${
                        isActive
                          ? 'is-active border-purple-200/80 bg-white text-slate-900 shadow-[0_16px_30px_rgba(124,58,237,0.16)]'
                          : 'border-transparent text-slate-700 hover:-translate-y-[1px] hover:border-purple-200/80 hover:bg-white/92 hover:text-slate-900 hover:shadow-[0_10px_24px_rgba(148,163,184,0.24)]'
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                          className={`sidebar-nav-icon grid h-10 w-10 place-items-center rounded-xl border transition-all duration-200 ${
                            isActive
                              ? 'is-active bg-gradient-to-br from-violet-100 to-fuchsia-100 text-purple-700 border-purple-200/90 shadow-sm shadow-purple-200/60'
                              : 'bg-white/85 text-purple-600 border-purple-100/80 group-hover:bg-white group-hover:border-purple-200/70'
                          }`}
                        >
                          <n.icon size={18} />
                        </span>
                        <span className="sidebar-nav-label whitespace-nowrap text-[13px] font-semibold leading-tight md:text-sm">{n.label}</span>
                      </span>
                      <span
                        className={`sidebar-nav-arrow ml-auto flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200 ${
                          isActive
                            ? 'is-active translate-x-0.5 border-purple-200/80 bg-purple-100/90 text-purple-700 opacity-100 shadow-sm shadow-purple-200/50'
                            : 'border-purple-100/70 bg-white/75 text-purple-400 opacity-60 group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-purple-600 group-hover:border-purple-200/70'
                        }`}
                      >
                        <ChevronRight size={14} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
            <div className="sidebar-footer p-5 border-t border-white/70 bg-white/55 backdrop-blur-xl shrink-0">
              <div className="sidebar-profile-card rounded-2xl border border-white/70 bg-gradient-to-br from-white to-purple-50/75 p-4 shadow-[0_10px_24px_rgba(148,163,184,0.24)]">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-300/40 ring-1 ring-white/70">
                    {user.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 truncate">{user.name}</p>
                    <div className="mt-1 inline-flex items-center rounded-lg border border-purple-100 bg-gradient-to-r from-violet-100 to-fuchsia-100 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
                      {user.role === 'admin' ? 'Администратор' : (user.role === 'teacher' ? 'Преподаватель' : 'Ученик')}
                    </div>
                  </div>
                </div>
              </div>
              {renderPushControl()}
              <button
                onClick={onLogout}
                className="sidebar-logout mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200/75 bg-white/85 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:-translate-y-[1px] hover:border-rose-300 hover:bg-rose-50 hover:shadow-sm"
              >
                <LogOut size={16} /> Выйти
              </button>
            </div>
          </div>
        </aside>
      </div>
      <div className={`desktop-nav-fab hidden md:flex ${desktopNavCollapsed ? 'is-visible' : ''}`} aria-hidden={!desktopNavCollapsed}>
        <button
          type="button"
          onClick={() => setDesktopNavCollapsed(false)}
          className="desktop-nav-fab__toggle"
          aria-label="Развернуть панель навигации"
          title="Развернуть панель"
        >
          <ChevronsRight size={22} />
        </button>
        <div className="desktop-nav-fab__divider" aria-hidden="true" />
        <div className="desktop-nav-fab__stack">
          {visibleNav.map((n) => {
            const isActive = view === n.id;
            const Icon = n.icon;
            return (
              <button
                key={`desktop-nav-fab-${n.id}`}
                type="button"
                onClick={() => {
                  navigateToView(n.id);
                  setMenuOpen(false);
                }}
                className={`desktop-nav-fab__item ${isActive ? 'is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={n.label}
                title={n.label}
              >
                <Icon size={24} />
              </button>
            );
          })}
        </div>
      </div>
      <div className={`main-shell relative flex-1 flex flex-col app-h overflow-hidden ${desktopNavCollapsed ? 'desktop-main-shifted' : ''}`}>
        <header className="sticky top-0 z-20 md:hidden bg-white/85 backdrop-blur border-b border-slate-200/70 px-3.5 py-3 pt-[calc(env(safe-area-inset-top)+0.55rem)] flex justify-between items-center">
          <LogoMark className="text-lg" />
          <div className="flex items-center gap-2">
            <ThemeToggleButton
              theme={theme}
              onToggle={onThemeToggle}
              className="theme-toggle--inline"
            />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-10 min-w-[40px] items-center gap-2 rounded-xl border border-purple-200/70 bg-white px-2 text-purple-700 shadow-sm"
              aria-label="Открыть профиль"
            >
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-[11px] font-bold text-white">
                {String(user?.name || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="text-xs font-semibold">Профиль</span>
            </button>
          </div>
        </header>
        <main
          ref={mainScrollRef}
          className="flex-1 overflow-y-auto px-3.5 pt-3 pb-[calc(env(safe-area-inset-bottom)+6.2rem)] sm:px-4 sm:pt-4 md:p-8 md:pb-8"
          data-tour="main"
        >
          <div className="main-content-shell animate-soft">
          {user.role === 'student' && view !== 'collab' && view !== 'board' && (
            <div className="top-stats-strip mb-3 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-slate-50/85 px-2.5 py-1.5 shadow-sm sm:px-3 sm:py-2">
              <div className="flex items-center gap-1.5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-2">
                <div
                  className="level-progress-card min-w-0 flex-1 px-2 py-1.5 text-sm font-semibold md:min-w-[255px] md:flex-none md:px-2.5 md:py-2"
                  aria-label={`Уровень ${currentLevel}. Опыт: ${totalXpLabel}`}
                  title={`Всего опыта: ${totalXpLabel} XP`}
                >
                  <div className="level-progress-main">
                    <div className="level-progress-badge">
                      {currentLevel}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="level-progress-head">
                        <span className="level-progress-title">{`Уровень ${currentLevel}`}</span>
                        <span className="level-progress-total">{`${totalXpLabel} XP`}</span>
                      </div>
                      <div
                        ref={xpInlineBarRef}
                        className={`level-progress-track ${xpAnimationActive ? 'xp-inline-bar--active' : ''}`}
                      >
                        <div
                          className="level-progress-fill transition-all duration-300"
                          style={{ width: `${levelProgressPercent}%` }}
                        />
                        <div className="level-progress-track-grid" />
                        <div className="level-progress-glass" />
                      </div>
                      <div className="level-progress-foot">
                        <span>{`${xpIntoLevelLabel}/${xpPerLevelLabel} XP`}</span>
                        <span>{`${levelProgressPercent}%`}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 md:ml-auto md:gap-2">
                  <button
                    type="button"
                    onClick={openPaceForecastPopup}
                    className={`flex items-center justify-center gap-1 rounded-full border bg-white px-2.5 py-1.5 text-[13px] font-semibold shadow-sm transition hover:bg-slate-50 active:scale-[0.99] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 md:gap-2 md:px-3.5 md:py-2 md:text-sm ${paceBadgeState.className}`}
                    aria-label={`Среднее в день: ${averageSolvedPerDayLabel}`}
                    title={`${paceBadgeState.title} Нажмите, чтобы открыть прогноз.`}
                  >
                    {paceBadgeState.level === 'ok' && <CheckCircle size={14} />}
                    {paceBadgeState.level === 'warn' && <AlertTriangle size={14} />}
                    {paceBadgeState.level === 'danger' && <AlertCircle size={14} />}
                    <span className="text-gray-900 whitespace-nowrap">{averageSolvedPerDayLabel}</span>
                    <span className="hidden whitespace-nowrap text-[11px] font-semibold text-gray-500 sm:inline">/день</span>
                  </button>
                  <div className="relative group shrink-0">
                    <div
                      className={`flex h-full items-center justify-center gap-1.5 rounded-full border border-purple-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-purple-600 shadow-sm cursor-default streak-badge md:gap-2 md:px-3.5 md:py-2 md:text-sm ${displayStreakCurrent > 0 ? 'streak-badge--active' : ''}`}
                      aria-label={`Серия: ${displayStreakCurrent}`}
                    >
                      <Flame
                        size={16}
                        className={`${displayStreakCurrent > 0 ? 'text-purple-500 streak-flame' : 'text-gray-300'}`}
                        fill={displayStreakCurrent > 0 ? 'currentColor' : 'none'}
                        stroke={displayStreakCurrent > 0 ? 'currentColor' : 'currentColor'}
                      />
                      <span className="text-gray-900">{displayStreakCurrent}</span>
                    </div>
                    <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-72 origin-top-right translate-y-1 rounded-3xl surface-panel p-4 text-gray-700 shadow-xl opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 streak-popover">
                      <div className="absolute right-6 -top-1 h-3 w-3 rotate-45 border-l border-t border-purple-200 bg-white" />
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                          <Flame size={22} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-purple-700">Серия</div>
                          <div className="text-xs text-gray-500">Решайте каждый день, чтобы поддерживать серию.</div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-end gap-2">
                        <div className="text-3xl font-bold text-gray-900">{displayStreakCurrent}</div>
                        <div className="text-xs text-gray-500">дней подряд</div>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{streakStatusText}</div>
                      <div className="mt-3 grid grid-cols-7 gap-2 text-[10px] text-gray-400">
                        {streakWeek.map((day) => (
                          <div key={day.dayKey || day.label} className="flex flex-col items-center gap-1">
                            <span className="uppercase">{day.label}</span>
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                                day.isInStreak
                                  ? 'border-purple-400 bg-purple-500 text-white'
                                  : 'border-gray-200 bg-gray-100 text-gray-400'
                              }`}
                            >
                              {day.isInStreak && (
                                day.isFreeze ? <Snowflake size={14} /> : <Check size={16} />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
                        <span>{`Рекорд: ${streak.best}`}</span>
                        <span>{`Заморозка: ${freezeAvailable ? 'доступна' : 'использована'}`}</span>
                      </div>
                      {lastActiveLabel && (
                        <div className="mt-1 text-[11px] text-gray-400">{`Последняя активность: ${lastActiveLabel}`}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {shouldShowGoalBlock && (
            <div ref={goalSummaryFlyRef} className={goalCollapsed ? 'sticky top-0 z-30 mb-4' : 'mb-4'}>
              {goalCollapsed ? (
                <div className={`surface-panel rounded-2xl border border-purple-200/80 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-3 py-2 text-sm text-gray-700 shadow-soft flex items-center justify-between gap-1.5 sm:gap-2 sm:px-4 sm:py-2.5 ${goalPanelAnimClass === 'goal-collapse' ? 'goal-collapse' : ''}`}>
                  <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-purple-600 shrink-0">домашка</div>
                    <div className="min-w-0 truncate text-[13px] font-semibold text-gray-900 sm:text-sm">
                      <span className="sm:hidden">{`${formatDaysText(goalState.entry?.daysToComplete || 7)} · ${goalCompletedCount}/${goalGoals.length}`}</span>
                      <span className="hidden sm:inline">{`За ${formatDaysText(goalState.entry?.daysToComplete || 7)} выполнить ${goalCompletedCount}/${goalGoals.length} целей`}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    {firstGoal && (
                      <button
                        type="button"
                        onClick={() => {
                          if (firstGoal.type === GOAL_TYPE_MOCK) {
                            handleOpenMockGoal(firstGoal.mockExamId);
                          } else {
                            handleOpenTask(firstGoal.taskNumber, firstGoal.levelId, firstGoal.targetNumbers);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-[11px] font-semibold hover:bg-purple-700 shadow-sm sm:px-3 sm:py-1.5 sm:text-xs"
                      >
                        К цели
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleExpandGoalBlock}
                      className="px-2.5 py-1 rounded-lg border border-purple-200 text-[11px] font-semibold text-purple-700 hover:bg-purple-50 sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      Развернуть
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`rounded-[24px] border border-purple-200/90 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/80 px-4 py-3.5 text-sm text-gray-700 shadow-soft sm:px-5 ${goalPanelAnimClass === 'goal-expand' ? 'goal-expand' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-purple-600">домашка</div>
                      <div className="mt-1 text-base font-semibold text-gray-900">
                        {`За ${formatDaysText(goalState.entry?.daysToComplete || 7)} выполнить эти цели`}
                      </div>
                      <div className="mt-1 text-xs text-purple-700/90">
                        {`Выполнено ${goalCompletedCount}/${goalGoals.length}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoalCollapsed(true)}
                      className="px-3 py-1.5 rounded-lg border border-purple-200 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                    >
                      Свернуть
                    </button>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {goalGoals.map((goal, index) => {
                      if (goal.type === GOAL_TYPE_MOCK) {
                        const totalCount = Number(goal.totalCount) || 0;
                        const solvedCount = Number(goal.solvedCount) || 0;
                        return (
                          <div key={`mock-${goal.mockExamId}-${index}`} className="rounded-2xl border border-purple-200/80 bg-white/95 px-3.5 py-3 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-purple-600">
                                  Пробник
                                </div>
                                <div className="mt-1 text-sm font-semibold text-gray-900 truncate">{goal.mockExamTitle || 'Пробник'}</div>
                                <div className="mt-1 text-[11px] text-gray-600">
                                  {totalCount > 0 ? `Выполнено ${solvedCount}/${totalCount}` : 'В пробнике пока нет заданий'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenMockGoal(goal.mockExamId)}
                                className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 shadow-sm"
                              >
                                Перейти
                              </button>
                            </div>
                          </div>
                        );
                      }

                      const hasTargets = goal.targetNumbers?.length > 0 || goal.includeAll;
                      const isPythonGoal = isPythonTaskNumber(goal.taskNumber);
                      const pythonTask = isPythonGoal
                        ? getPythonTaskInfo(goal.taskNumber)
                        : null;
                      const taskDisplay = pythonTask?.displayNumber || formatTaskNumber(goal.taskNumber) || goal.taskNumber;
                      const goalHeading = isPythonGoal
                        ? `Python ${goal.taskTitle || pythonTask?.title || (goal.taskNumber ? `тема ${goal.taskNumber}` : 'тема')}`
                        : `Задание ${taskDisplay} · ${goal.levelLabel}`;
                      const targetTotal = Array.isArray(goal.targetStatus) ? goal.targetStatus.length : 0;
                      const targetSolved = Array.isArray(goal.targetStatus)
                        ? goal.targetStatus.filter((item) => item.solved).length
                        : 0;

                      return (
                        <div key={`${goal.taskNumber}-${goal.levelId}-${index}`} className="rounded-2xl border border-purple-200/80 bg-white/95 px-3.5 py-3 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 space-y-0.5">
                              {isPythonGoal ? (
                                <div className="text-sm font-semibold text-gray-900">{goalHeading}</div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-semibold text-gray-900">{`Задание ${taskDisplay}`}</span>
                                  {goal.levelLabel && (
                                    <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                      {goal.levelLabel}
                                    </span>
                                  )}
                                </div>
                              )}
                              {!isPythonGoal && (
                                <div className="text-xs text-gray-500 truncate">
                                  {`Тема: ${goal.taskTitle || '—'}`}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenTask(goal.taskNumber, goal.levelId, goal.targetNumbers)}
                              className="shrink-0 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 shadow-sm"
                            >
                              Перейти
                            </button>
                          </div>

                          {hasTargets && (
                            <div className="mt-2 rounded-xl border border-purple-100/90 bg-purple-50/60 px-2.5 py-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-700">Цель</div>
                              {goal.targetNumbers?.length > 0 ? (
                                <>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {goal.targetStatus.map((item) => (
                                      <span
                                        key={item.num}
                                        className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${
                                          item.solved
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200 bg-white text-slate-700'
                                        }`}
                                      >
                                        №{item.num}{item.solved ? ' ✓' : ''}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-600">
                                    <span>Выполнено</span>
                                    <span className="font-semibold text-gray-800">{`${targetSolved}/${targetTotal}`}</span>
                                  </div>
                                </>
                              ) : (
                                <div className="mt-1 text-[11px] text-purple-700">
                                  Все задания этого уровня
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {view === 'schedule' && (
            <ScheduleSection
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
              onOpenTask={user.role === 'student' ? handleOpenTask : null}
              onOpenMockGoal={user.role === 'student' ? handleOpenMockGoal : null}
              solvedRefreshKey={goalRefreshTick}
              tasks={tasksWithTitles}
              nextHomeworkFlyRef={scheduleHomeworkFlyRef}
              GOAL_TYPE_TASK={GOAL_TYPE_TASK}
              GOAL_TYPE_MOCK={GOAL_TYPE_MOCK}
              normalizeGoalType={normalizeGoalType}
              normalizeTaskNumber={normalizeTaskNumber}
              isPythonTaskNumber={isPythonTaskNumber}
              getPythonTaskInfo={getPythonTaskInfo}
              getStudentLabel={getStudentLabel}
              getMockGoalProgress={getMockGoalProgress}
              getTaskDisplayNumber={getTaskDisplayNumber}
              formatTaskNumber={formatTaskNumber}
              normalizeMockExamId={normalizeMockExamId}
              normalizeMockExamAccess={normalizeMockExamAccess}
              LEGACY_MOCK_EXAM_ACCESS={LEGACY_MOCK_EXAM_ACCESS}
              isMockExamAccessible={isMockExamAccessible}
              MOCK_TASKS={MOCK_TASKS}
              PYTHON_TASKS={PYTHON_TASKS}
              PYTHON_LEVEL_ID={PYTHON_LEVEL_ID}
              LEVELS={LEVELS}
            />
          )}
          {view === 'progress' && (
            <ProgressSection
              progress={progress}
              onUpdateProgress={(...args) => {
                onUpdateProgress(...args);
                if (user.role === 'student') setGoalRefreshTick((prev) => prev + 1);
              }}
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              tasks={tasksWithTitles}
              onTaskTitleUpdate={handleTaskTitleUpdate}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
              openTask={pendingOpenTask}
              onOpenTaskHandled={() => setPendingOpenTask(null)}
              initialSection={initialProgressSection}
              sectionJumpToken={progressSectionJumpToken}
              onSectionChange={handleProgressSectionChange}
              onTaskStateChange={handleTaskStateChange}
              onStreakSaved={handleStreakSaved}
              onXpGain={handleXpGain}
              openMockExamId={pendingOpenMockExamId}
              onOpenMockExamHandled={handleOpenMockGoalHandled}
              onMockAttemptSaved={() => {
                if (user.role === 'student') setGoalRefreshTick((prev) => prev + 1);
              }}
              MOCK_TASKS={MOCK_TASKS}
              isMockExamAccessible={isMockExamAccessible}
              mergeRuntimeErrorText={mergeRuntimeErrorText}
              createPyodideWorker={createPyodideWorker}
              ensurePyodideReady={ensurePyodideReady}
              isPythonTaskNumber={isPythonTaskNumber}
              normalizeTaskNumber={normalizeTaskNumber}
              getTaskDisplayNumber={getTaskDisplayNumber}
              normalizeMockExamAccess={normalizeMockExamAccess}
              LEGACY_MOCK_EXAM_ACCESS={LEGACY_MOCK_EXAM_ACCESS}
              LEVELS={LEVELS}
              LEVEL_WEIGHTS={LEVEL_WEIGHTS}
              GAME_THEORY_TASK={GAME_THEORY_TASK}
              PYODIDE_RUN_TIMEOUT_MS={PYODIDE_RUN_TIMEOUT_MS}
              ALLOW_MAIN_THREAD_PYTHON_FALLBACK={ALLOW_MAIN_THREAD_PYTHON_FALLBACK}
              getStudentLabel={getStudentLabel}
              getTaskLevelXpReward={getTaskLevelXpReward}
              getAnswerCountForTask={getAnswerCountForTask}
              getExpectedAnswers={getExpectedAnswers}
              allowsPartialAnswers={allowsPartialAnswers}
              buildIdleConsoleText={buildIdleConsoleText}
              getLocalDayKey={getLocalDayKey}
              normalizeXpTotal={normalizeXpTotal}
              parseIdleConsoleInput={parseIdleConsoleInput}
              PY_IDLE_STDIN_HEADER={PY_IDLE_STDIN_HEADER}
              withStudentId={withStudentId}
              getPrimaryScoreFromSolved={getPrimaryScoreFromSolved}
              getSecondaryScoreFromPrimary={getSecondaryScoreFromPrimary}
              MOCK_TASK_NUMBERS={MOCK_TASK_NUMBERS}
              getMockAnswerCountForTask={getMockAnswerCountForTask}
            />
          )}
          {view === 'rating' && (
            <StudentLeaderboardSection
              role={user.role}
              userId={user.id}
              userName={user.name}
              normalizeXpTotal={normalizeXpTotal}
              getLeagueByXp={getLeagueByXp}
              XP_PER_LEVEL={XP_PER_LEVEL}
              formatStreakDate={formatStreakDate}
              BLANK_LEAGUE={BLANK_LEAGUE}
              LEAGUE_TIERS={LEAGUE_TIERS}
              getLeagueAuraStyle={getLeagueAuraStyle}
              isAbsoluteOrAboveLeague={isAbsoluteOrAboveLeague}
              ABSOLUTE_AURA_CROWN_STYLE={ABSOLUTE_AURA_CROWN_STYLE}
              isLeagueAboveAbsolute={isLeagueAboveAbsolute}
              TOP_PLACE_NUMBER_DECOR={TOP_PLACE_NUMBER_DECOR}
              getTopPlaceNumberStyle={getTopPlaceNumberStyle}
            />
          )}
          {view === 'python' && (
            <PythonSection
              progress={progress}
              onUpdateProgress={(...args) => {
                onUpdateProgress(...args);
                if (user.role === 'student') setGoalRefreshTick((prev) => prev + 1);
              }}
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
              openTask={pendingOpenTask}
              onOpenTaskHandled={() => setPendingOpenTask(null)}
              onTaskStateChange={handleTaskStateChange}
              onStreakSaved={handleStreakSaved}
              onXpGain={handleXpGain}
              PYTHON_TASKS={PYTHON_TASKS}
              PYTHON_LEVEL_ID={PYTHON_LEVEL_ID}
              isPythonTaskNumber={isPythonTaskNumber}
              getStudentLabel={getStudentLabel}
              parseTestsFileContent={parseTestsFileContent}
              buildGoogleDocEmbedUrl={buildGoogleDocEmbedUrl}
              buildGoogleDocFullUrl={buildGoogleDocFullUrl}
              getTaskDisplayNumber={getTaskDisplayNumber}
              ensurePyodideReady={ensurePyodideReady}
              mergeRuntimeErrorText={mergeRuntimeErrorText}
              createPyodideWorker={createPyodideWorker}
              withStudentId={withStudentId}
              isGoogleDocEmbedUrl={isGoogleDocEmbedUrl}
              normalizeOutput={normalizeOutput}
              normalizeOutputForComparison={normalizeOutputForComparison}
              normalizeRuntimeErrorForCheck={normalizeRuntimeErrorForCheck}
              getLocalDayKey={getLocalDayKey}
              normalizeXpTotal={normalizeXpTotal}
              PYODIDE_RUN_TIMEOUT_MS={PYODIDE_RUN_TIMEOUT_MS}
              ALLOW_MAIN_THREAD_PYTHON_FALLBACK={ALLOW_MAIN_THREAD_PYTHON_FALLBACK}
            />
          )}
          {view === 'collab' && (
            <CollabSection
              role={user.role}
              userId={user.id}
              userName={user.name}
              teacherId={user.role === 'teacher' ? user.id : user.teacherId}
              tasks={tasksWithTitles}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
            />
          )}
          {isCallViewAvailable && (
            <CallSection
              role={user.role}
              userId={user.id}
              teacherId={user.role === 'teacher' ? user.id : user.teacherId}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
              uiMode={callUiMode}
              theme={theme}
              onStatusChange={setCallSessionStatus}
              onRequestExpand={() => setCallPanelExpanded(true)}
              onRequestCollapse={() => setCallPanelExpanded(false)}
            />
          )}
          {view === 'board' && (
            <BoardSection
              role={user.role}
              userId={user.id}
              userName={user.name}
              teacherId={user.role === 'teacher' ? user.id : user.teacherId}
              tasks={tasksWithTitles}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
            />
          )}
          {view === 'notes' && (
            <NotesSection
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
              initialLocation={initialNotesLocation}
              onLocationChange={handleNotesLocationChange}
              withStudentId={withStudentId}
              MOCK_TASKS={MOCK_TASKS}
              normalizeTaskNumber={normalizeTaskNumber}
              GAME_THEORY_TASK={GAME_THEORY_TASK}
              getEntrySizeBytes={getEntrySizeBytes}
              MAX_TASK_BYTES={MAX_TASK_BYTES}
              mergeRuntimeErrorText={mergeRuntimeErrorText}
              createPyodideWorker={createPyodideWorker}
              ensurePyodideReady={ensurePyodideReady}
              PYODIDE_RUN_TIMEOUT_MS={PYODIDE_RUN_TIMEOUT_MS}
              ALLOW_MAIN_THREAD_PYTHON_FALLBACK={ALLOW_MAIN_THREAD_PYTHON_FALLBACK}
              getStudentLabel={getStudentLabel}
              getTaskDisplayNumber={getTaskDisplayNumber}
              formatTaskNumber={formatTaskNumber}
              buildIdleConsoleText={buildIdleConsoleText}
              formatBytes={formatBytes}
              PY_IDLE_STDIN_HEADER={PY_IDLE_STDIN_HEADER}
              parseIdleConsoleInput={parseIdleConsoleInput}
              highlightPython={highlightPython}
            />
          )}
          {view === 'teacher' && (
            <TeacherPanel
              role={user.role}
              students={studentsWithNicknames}
              studentsLoading={studentsLoading}
              studentsError={studentsError}
              deletedStudents={deletedStudents}
              deletedStudentsLoading={deletedStudentsLoading}
              deletedStudentsError={deletedStudentsError}
              tasks={tasksWithTitles}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              onStudentCreated={handleStudentCreated}
              onStudentDeleted={handleStudentDeleted}
              onStudentRestored={handleStudentRestored}
              onStudentUpdated={handleStudentUpdated}
              teacherId={user.role === 'teacher' ? user.id : null}
              SOFT_DELETE_DAYS={SOFT_DELETE_DAYS}
              MOCK_TASKS={MOCK_TASKS}
              LEVELS={LEVELS}
              getTaskDisplayNumber={getTaskDisplayNumber}
              getAnswerCountForTask={getAnswerCountForTask}
              getExpectedAnswers={getExpectedAnswers}
              allowsPartialAnswers={allowsPartialAnswers}
              normalizeXpTotal={normalizeXpTotal}
              XP_PER_LEVEL={XP_PER_LEVEL}
              GAME_THEORY_TASK={GAME_THEORY_TASK}
              withUploadsAuthToken={withUploadsAuthToken}
            />
          )}
          {view === 'admin' && (
            <AdminPanel
              teachers={teachers}
              teachersLoading={teachersLoading}
              teachersError={teachersError}
              onTeachersChanged={loadTeachers}
            />
          )}
          </div>
        </main>
        <div
          className={`fixed inset-0 z-30 transition-opacity duration-200 md:hidden ${
            menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          aria-hidden={!menuOpen}
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
            aria-label="Закрыть профиль"
          />
          <div className={`absolute inset-x-0 bottom-0 transition-transform duration-300 ease-out ${menuOpen ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="surface-card rounded-t-3xl border border-purple-100/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-14px_30px_rgba(15,23,42,0.22)]">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white to-purple-50/70 p-4 shadow-[0_8px_20px_rgba(148,163,184,0.2)]">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-300/40 ring-1 ring-white/70">
                    {user.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 truncate">{user.name}</p>
                    <div className="mt-1 inline-flex items-center rounded-md bg-gradient-to-r from-violet-100 to-fuchsia-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
                      {user.role === 'admin' ? 'Администратор' : (user.role === 'teacher' ? 'Преподаватель' : 'Ученик')}
                    </div>
                  </div>
                </div>
              </div>
              {renderPushControl({ mobile: true })}
              <button
                onClick={onLogout}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200/70 bg-white/90 px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 hover:shadow-sm"
              >
                <LogOut size={16} /> Выйти
              </button>
            </div>
          </div>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-20 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] md:hidden" data-tour="nav">
          <div className="surface-panel rounded-2xl border border-purple-100/70 bg-white/90 p-1.5 shadow-[0_12px_26px_rgba(15,23,42,0.16)]">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleNav.length)}, minmax(0, 1fr))` }}>
              {visibleNav.map((n) => {
                const isActive = view === n.id;
                const Icon = n.icon;
                return (
                  <button
                    key={`mobile-nav-${n.id}`}
                    type="button"
                    onClick={() => {
                      navigateToView(n.id);
                      setMenuOpen(false);
                    }}
                    className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-colors ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-purple-50 hover:text-purple-700'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="truncate leading-none">{mobileNavLabels[n.id] || n.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
};

const App = () => {
  const [theme, setTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme) return normalizeTheme(savedTheme);
      } catch { /* no-op */ }
    }
    return getPreferredTheme();
  });
  const [user, setUser] = useState(() => {
    if (typeof localStorage === 'undefined') return null;
    try {
      const savedUser = localStorage.getItem(USER_SESSION_KEY);
      const parsed = savedUser ? JSON.parse(savedUser) : null;
      const normalized = sanitizeAuthUserPayload(parsed);
      if (!normalized) {
        localStorage.removeItem(USER_SESSION_KEY);
        return null;
      }
      if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      return null;
    }
  });
  const [progress, setProgress] = useState({});

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', normalizeTheme(theme));
    root.style.colorScheme = theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  }, [theme]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme));
    } catch { /* no-op */ }
  }, [theme]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser((current) => (current ? null : current));
      setProgress({});
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const updateVh = () => {
      if (typeof window === 'undefined') return;
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    };
    updateVh();
    window.addEventListener('resize', updateVh);
    window.addEventListener('orientationchange', updateVh);
    return () => {
      window.removeEventListener('resize', updateVh);
      window.removeEventListener('orientationchange', updateVh);
    };
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'student') return;
    let cancelled = false;
    api.getStudentProgress(user.id)
      .then((data) => {
        if (cancelled) return;
        setProgress(data || {});
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setProgress({});
      });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  const handleLogin = (u) => {
    const normalized = sanitizeAuthUserPayload(u);
    if (!normalized) {
      clearStoredSession();
      setUser(null);
      setProgress({});
      return;
    }
    setUser(normalized);
    setProgress({});
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(normalized));
  };

  const handleLogout = () => {
    api.logout().catch(() => {});
    clearStoredSession();
    setUser(null);
    setProgress({});
  };

  const updateProgress = async (taskId, val, options = {}) => {
    if (!user || user.role !== 'student') return;
    setProgress((prev) => ({ ...prev, [taskId]: val }));
    if (options?.skipServer) return;
    // Прогресс ученика сохраняется через /api/progress/solve после проверки ответа.
  };

  const handleThemeToggle = () => {
    setTheme((currentTheme) => (currentTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK));
  };

  if (!user) {
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <ThemeToggleButton theme={theme} onToggle={handleThemeToggle} />
      </>
    );
  }

  return (
    <>
      <DashboardLayout
        user={user}
        onLogout={handleLogout}
        progress={progress}
        onUpdateProgress={updateProgress}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />
      <ThemeToggleButton theme={theme} onToggle={handleThemeToggle} className="theme-toggle--desktop" />
    </>
  );
};

export default App;



