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
  Bell, BellOff, MousePointer2, Moon, Sun, Code2
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
const stripControlChars = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
const stripAnsiCodes = (value) => String(value ?? '').replace(/\u001b\[[0-9;]*m/g, '');
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
  } catch {}
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
  } catch {}
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
  } catch {}
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
  } catch {}
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
          } catch {}
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
          } catch {}
          try {
            const truncatedValue = pyodide.globals.get('__collab_debug_truncated');
            debugTraceTruncated = Boolean(
              truncatedValue && typeof truncatedValue.toJs === 'function'
                ? truncatedValue.toJs()
                : truncatedValue
            );
            truncatedValue?.destroy?.();
          } catch {}
        }
      } finally {
        try {
          pyodide.globals.delete('__collab_debug_events');
          pyodide.globals.delete('__collab_debug_events_json');
          pyodide.globals.delete('__collab_debug_truncated');
        } catch {}
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
const parseApiError = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      if (data?.error) return data.error;
    } catch {}
  }
  try {
    const text = await res.text();
    if (text && text.length <= 200) return text;
  } catch {}
  if (res.status === 413) {
    return '\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u043e\u0439 \u0437\u0430\u043f\u0440\u043e\u0441. \u0423\u043c\u0435\u043d\u044c\u0448\u0438\u0442\u0435 \u0440\u0430\u0437\u043c\u0435\u0440 \u0434\u0430\u043d\u043d\u044b\u0445.';
  }
  return `Ошибка запроса (${res.status} ${res.statusText})`;
};

const parseJsonResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (text?.trim().startsWith('<!doctype')) {
      throw new Error('Сервер не отвечает (HTML вместо JSON). Перезапустите backend.');
    }
    throw new Error('Некорректный ответ сервера');
  }
  return res.json();
};

const USER_SESSION_KEY = 'ege_user_session';
const THEME_STORAGE_KEY = 'ege_theme';
const DESKTOP_NAV_COLLAPSED_KEY = 'ege_desktop_nav_collapsed_v1';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';
let unauthorizedHandler = null;

const normalizeTheme = (value) => (String(value || '').trim().toLowerCase() === THEME_DARK ? THEME_DARK : THEME_LIGHT);

const getPreferredTheme = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return THEME_LIGHT;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_DARK : THEME_LIGHT;
};

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

const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
};

const clearStoredSession = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(USER_SESSION_KEY);
  } catch {}
};

const apiFetch = async (input, init = {}) => {
  const res = await fetch(input, init);
  if (res.status === 401) {
    clearStoredSession();
    try {
      unauthorizedHandler?.();
    } catch {}
  }
  return res;
};

const api = {
  login: async (code) => {
    const res = await apiFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  logout: async () => {
    const res = await apiFetch('/api/logout', { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getPushPublicKey: async () => {
    const res = await apiFetch('/api/push/public-key');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getPushSubscriptionStatus: async () => {
    const res = await apiFetch('/api/push/subscription');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  savePushSubscription: async (subscription) => {
    const payload = subscription && typeof subscription === 'object'
      ? { subscription }
      : {};
    const res = await apiFetch('/api/push/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deletePushSubscription: async (endpoint = '') => {
    const normalizedEndpoint = String(endpoint || '').trim();
    const body = normalizedEndpoint ? { endpoint: normalizedEndpoint } : {};
    const res = await apiFetch('/api/push/subscription', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudents: async (teacherId, options = {}) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', teacherId);
    if (options?.includeDeleted) params.append('includeDeleted', '1');
    if (options?.deletedOnly) params.append('deletedOnly', '1');
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/students?${qs}` : '/api/students');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getStudentsLeaderboard: async (teacherId) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/students/leaderboard?${qs}` : '/api/students/leaderboard');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  setLeaderboardAlias: async (payload) => {
    const bodyPayload = typeof payload === 'string'
      ? { alias: payload }
      : (payload && typeof payload === 'object' ? payload : {});
    const res = await apiFetch('/api/students/leaderboard-alias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  createStudent: async (name, teacherId) => {
    const res = await apiFetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, teacherId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteStudent: async (id) => {
    const res = await apiFetch(`/api/students/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  restoreStudent: async (id) => {
    const res = await apiFetch(`/api/students/${id}/restore`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateStudent: async (id, payload) => {
    const res = await apiFetch(`/api/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  resetStudentCode: async (id) => {
    const res = await apiFetch(`/api/students/${id}/reset-code`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getTeachers: async () => {
    const res = await apiFetch('/api/teachers');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  createTeacher: async (name) => {
    const res = await apiFetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateTeacherName: async (id, name) => {
    const res = await apiFetch(`/api/teachers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteTeacher: async (id) => {
    const res = await apiFetch(`/api/teachers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  resetTeacherCode: async (id) => {
    const res = await apiFetch(`/api/teachers/${id}/reset-code`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateTeacherCode: async (teacherId, currentCode, newCode) => {
    const res = await apiFetch('/api/teacher-code', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId, currentCode, newCode }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getTests: async () => {
    const res = await apiFetch('/api/tests');
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await parseJsonResponse(res);
    return data && typeof data === 'object' ? data : {};
  },
  saveTests: async (newDb) => {
    const res = await apiFetch('/api/tests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDb),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getMockExams: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/mock-exams?${qs}` : '/api/mock-exams');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  createMockExam: async (title) => {
    const res = await apiFetch('/api/mock-exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateMockExam: async (id, payload) => {
    const res = await apiFetch(`/api/mock-exams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteMockExamDefinition: async (id) => {
    const res = await apiFetch(`/api/mock-exams/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getMockAttempt: async (studentId, examId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    if (examId) params.append('examId', String(examId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/mock-exams/attempt?${qs}` : '/api/mock-exams/attempt');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  saveMockAttempt: async (studentId, examId, payload) => {
    const res = await apiFetch('/api/mock-exams/attempt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, examId, ...(payload || {}) }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTaskTitles: async () => {
    const res = await apiFetch('/api/task-titles');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTaskTitle: async (number, title) => {
    const res = await apiFetch('/api/task-titles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, title }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentProgress: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress?${qs}` : '/api/progress');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateStudentProgress: async (studentId, taskId, value) => {
    const res = await apiFetch('/api/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, taskId, value }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getStudentData: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/student-data?${qs}` : '/api/student-data');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentNotes: async (studentId, payload) => {
    const res = await apiFetch('/api/student-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTeacherSolvedEvents: async (teacherId, since, limit) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    if (since) params.append('since', String(since));
    if (limit) params.append('limit', String(limit));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/teacher-solved-events?${qs}` : '/api/teacher-solved-events');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  markTeacherSolvedEventsRead: async (teacherId, eventIds = []) => {
    const ids = Array.isArray(eventIds)
      ? eventIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)
      : [];
    if (!teacherId || ids.length === 0) return { ok: true };
    const res = await apiFetch('/api/teacher-solved-events/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: String(teacherId), eventIds: ids }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentHomework: async (studentId, homeworkId, payload) => {
    const res = await apiFetch(`/api/student-next-lesson/${homeworkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteStudentHomework: async (studentId, homeworkId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(
      qs ? `/api/student-next-lesson/${homeworkId}?${qs}` : `/api/student-next-lesson/${homeworkId}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  solveQuestion: async (payload) => {
    const res = await apiFetch('/api/progress/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getSolvedQuestions: async (studentId, taskNumber, levelId, options = {}) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (levelId) params.append('levelId', String(levelId));
    if (options?.includeCode) params.append('includeCode', '1');
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress/solved?${qs}` : '/api/progress/solved');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getSolvedAnswers: async (studentId, taskNumber, levelId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (levelId) params.append('levelId', String(levelId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress/solved-answers?${qs}` : '/api/progress/solved-answers');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTaskCode: async (studentId, taskNumber) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress/task-code?${qs}` : '/api/progress/task-code');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  saveTaskCode: async (studentId, taskNumber, payload = {}) => {
    const res = await apiFetch('/api/progress/task-code', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, taskNumber, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getQuestionCode: async (studentId, taskNumber, levelId, questionId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (levelId) params.append('levelId', String(levelId));
    if (questionId !== undefined && questionId !== null) params.append('questionId', String(questionId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress/question-code?${qs}` : '/api/progress/question-code');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  saveQuestionCode: async (studentId, taskNumber, levelId, questionId, payload = {}) => {
    const res = await apiFetch('/api/progress/question-code', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, taskNumber, levelId, questionId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  addMockExam: async (studentId, payload) => {
    const res = await apiFetch('/api/mocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteMockExam: async (studentId, id) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/mocks/${id}?${qs}` : `/api/mocks/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  uploadTestFile: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch('/api/test-files', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteTestFile: async (storageName) => {
    if (!storageName) return { ok: true };
    const res = await apiFetch(`/api/test-files/${encodeURIComponent(storageName)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentSchedule: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/student-schedule?${qs}` : '/api/student-schedule');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  addScheduleEntry: async (studentId, payload) => {
    const res = await apiFetch('/api/student-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteScheduleEntry: async (studentId, id) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/student-schedule/${id}?${qs}` : `/api/student-schedule/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getStudentNextLesson: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/student-next-lesson?${qs}` : '/api/student-next-lesson');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentNextLesson: async (studentId, payload) => {
    const res = await apiFetch('/api/student-next-lesson', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getFiles: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/files?${qs}` : '/api/files');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getFolders: async (taskNumber, category, studentId) => {
    const params = new URLSearchParams();
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (category) params.append('category', category);
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/folders?${qs}` : '/api/folders');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  createFolder: async (taskNumber, category, name, studentId) => {
    const res = await apiFetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskNumber, category, name, studentId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  renameFolder: async (id, name) => {
    const res = await apiFetch(`/api/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  uploadFile: async (file, taskNumber, category, folderId, studentId) => {
    const form = new FormData();
    form.append('file', file);
    form.append('taskNumber', String(taskNumber));
    form.append('category', category);
    form.append('studentId', studentId);
    if (folderId) form.append('folderId', folderId);

    const res = await apiFetch('/api/files', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteFile: async (id) => {
    const res = await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  renameFile: async (id, name) => {
    const res = await apiFetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  moveFile: async (id, folderId) => {
    const res = await apiFetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateFileContent: async (id, content) => {
    const res = await apiFetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  }
};

const PUSH_SW_URL = '/sw-push.js';
let pushRegistrationPromise = null;

const isPushFeatureSupported = () => (
  typeof window !== 'undefined'
  && typeof navigator !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window
);

const getPushPermission = () => {
  if (typeof Notification === 'undefined') return 'default';
  return Notification.permission || 'default';
};

const urlBase64ToUint8Array = (base64String) => {
  const padded = `${base64String}${'='.repeat((4 - base64String.length % 4) % 4)}`;
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
};

const getPushServiceWorkerRegistration = async () => {
  if (!isPushFeatureSupported()) {
    throw new Error('Push уведомления не поддерживаются в этом браузере.');
  }
  if (!pushRegistrationPromise) {
    pushRegistrationPromise = navigator.serviceWorker.register(PUSH_SW_URL, { scope: '/' })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        return registration;
      })
      .catch((error) => {
        pushRegistrationPromise = null;
        throw error;
      });
  }
  return pushRegistrationPromise;
};

const getBrowserPushSubscription = async () => {
  if (!isPushFeatureSupported()) return null;
  try {
    const registration = await getPushServiceWorkerRegistration();
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
};

const normalizePushErrorMessage = (error, fallback = 'Не удалось настроить push-уведомления.') => {
  const message = String(error?.message || '').trim();
  if (!message) return fallback;
  if (/permission|denied|разреш/i.test(message)) {
    return 'Разрешите уведомления в браузере для этого сайта.';
  }
  if (/service worker/i.test(message)) {
    return 'Не удалось инициализировать service worker для push.';
  }
  if (/push/i.test(message) && /настро/i.test(message)) {
    return message;
  }
  return message;
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
 * SHARED COMPONENTS
 */
const LogoMark = ({ className = '' }) => (
  <span className={`font-display font-extrabold tracking-tight ${className}`}>
    <span className="text-slate-900">Плат</span>
    <span className="text-purple-600 logo-glow">форма</span>
  </span>
);

const PythonLogoIcon = ({ size = 18 }) => {
  const baseSize = Number(size) || 18;
  const renderSize = Math.round(baseSize * 1.22);
  return (
    <svg
      aria-hidden="true"
      className="python-logo-icon"
      viewBox="0 0 128 128"
      width={renderSize}
      height={renderSize}
      fill="none"
    >
    <path
      fill="currentColor"
      d="M63.391 1.988c-4.222.02-8.252.379-11.8 1.007-10.45 1.846-12.346 5.71-12.346 12.837v9.411h24.693v3.137H29.977c-7.176 0-13.46 4.313-15.426 12.521-2.268 9.405-2.368 15.275 0 25.096 1.755 7.311 5.947 12.519 13.124 12.519h8.491V67.234c0-8.151 7.051-15.34 15.426-15.34h24.665c6.866 0 12.346-5.654 12.346-12.548V15.833c0-6.693-5.646-11.72-12.346-12.837-4.244-.706-8.645-1.027-12.866-1.008zM50.037 9.557c2.55 0 4.634 2.117 4.634 4.721 0 2.593-2.083 4.69-4.634 4.69-2.56 0-4.633-2.097-4.633-4.69-.001-2.604 2.073-4.721 4.633-4.721z"
      transform="translate(0 10.26)"
    />
    <path
      fill="currentColor"
      d="M91.682 28.38v10.966c0 8.5-7.208 15.655-15.426 15.655H51.591c-6.756 0-12.346 5.783-12.346 12.549v23.515c0 6.691 5.818 10.628 12.346 12.547 7.816 2.297 15.312 2.713 24.665 0 6.216-1.801 12.346-5.423 12.346-12.547v-9.412H63.938v-3.138h37.012c7.176 0 9.852-5.005 12.348-12.519 2.578-7.735 2.467-15.174 0-25.096-1.774-7.145-5.161-12.521-12.348-12.521h-9.268zM77.809 87.927c2.561 0 4.634 2.097 4.634 4.692 0 2.602-2.074 4.719-4.634 4.719-2.55 0-4.633-2.117-4.633-4.719 0-2.595 2.083-4.692 4.633-4.692z"
      transform="translate(0 10.26)"
    />
    </svg>
  );
};

const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "px-4 py-2.5 sm:py-2 rounded-xl font-semibold text-sm sm:text-[15px] leading-tight transition-all duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200 hover:-translate-y-[1px]",
    secondary: "bg-white/80 text-gray-700 border border-slate-200 hover:bg-white",
    ghost: "text-gray-500 hover:bg-purple-50 hover:text-purple-700",
    danger: "bg-rose-50 text-rose-600 hover:bg-rose-100",
    success: "bg-emerald-600 text-white hover:bg-emerald-700"
  };
  return <button className={`${baseStyle} ${variants[variant]} ${className}`} onClick={onClick} {...props}>{children}</button>;
};

const Card = ({ children, className = '', onClick, ...props }) => (
  <div
    onClick={onClick}
    className={`surface-card rounded-3xl p-4 sm:p-5 transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-purple-200 hover:shadow-lift hover:-translate-y-1 active:translate-y-0' : ''} ${className}`}
    {...props}
  >
    {children}
  </div>
);

const ProgressBar = ({ value }) => {
  let color = 'bg-gray-200';
  if (value > 0) color = 'bg-blue-400';
  if (value >= 70) color = 'bg-purple-500';
  if (value >= 90) color = 'bg-green-500';
  return (
    <div className="w-full bg-slate-100/80 rounded-full h-2.5 overflow-hidden mt-2 ring-1 ring-slate-200/70">
      <div className={`h-2.5 rounded-full ${color} transition-all duration-700 ease-out`} style={{ width: `${value}%` }}></div>
    </div>
  );
};

/**
 * TEACHER PANEL COMPONENT
 */
const TeacherPanel = ({
  role,
  students,
  studentsLoading,
  studentsError,
  deletedStudents,
  deletedStudentsLoading,
  deletedStudentsError,
  tasks,
  activeStudentId,
  onSelectStudent,
  onStudentCreated,
  onStudentDeleted,
  onStudentRestored,
  onStudentUpdated,
  teacherId
}) => {
  const [testDb, setTestDb] = useState(null);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState('');
  const [selectedTask, setSelectedTask] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState('basic');
  const [newStudentName, setNewStudentName] = useState('');
  const [studentActionLoading, setStudentActionLoading] = useState(false);
  const [studentActionError, setStudentActionError] = useState('');
  const [lastIssuedCode, setLastIssuedCode] = useState(null);
  const [resettingStudentId, setResettingStudentId] = useState(null);
  const [restoringStudentId, setRestoringStudentId] = useState(null);
  const [teacherCodeForm, setTeacherCodeForm] = useState({ current: '', next: '', repeat: '' });
  const [teacherCodeError, setTeacherCodeError] = useState('');
  const [teacherCodeSuccess, setTeacherCodeSuccess] = useState('');
  const [teacherCodeSaving, setTeacherCodeSaving] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentNickname, setEditStudentNickname] = useState('');
  const [editStudentLeaderboardAlias, setEditStudentLeaderboardAlias] = useState('');
  const [editStudentLeaderboardAliasInitial, setEditStudentLeaderboardAliasInitial] = useState('');
  const [editStudentError, setEditStudentError] = useState('');
  const [editStudentSaving, setEditStudentSaving] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [questionScreenshots, setQuestionScreenshots] = useState([]);
  const [questionFiles, setQuestionFiles] = useState([]);
  const [existingQuestionScreenshots, setExistingQuestionScreenshots] = useState([]);
  const [existingQuestionFiles, setExistingQuestionFiles] = useState([]);
  const [initialQuestionAttachments, setInitialQuestionAttachments] = useState({ screenshots: [], files: [] });
  const [screenshotPreviews, setScreenshotPreviews] = useState([]);
  const [questionUploadError, setQuestionUploadError] = useState('');
  const [isUploadingQuestion, setIsUploadingQuestion] = useState(false);
  const [isDraggingScreens, setIsDraggingScreens] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const screenshotsRef = useRef(null);
  const filesRef = useRef(null);

  useEffect(() => {
    const previews = questionScreenshots.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setScreenshotPreviews(previews);
    return () => {
      previews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [questionScreenshots]);

  useEffect(() => {
    let cancelled = false;
    setTestsLoading(true);
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestDb(data && typeof data === 'object' ? data : {});
        setTestsError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsError(err?.message || err);
        setTestDb({});
      })
      .finally(() => {
        if (!cancelled) setTestsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);
  
  // Form state
  const [question, setQuestion] = useState("");
  const [answerInputs, setAnswerInputs] = useState(['']);
  const answerCount = getAnswerCountForTask(selectedTask);

  useEffect(() => {
    setAnswerInputs((prev) => {
      const next = Array.from({ length: answerCount }, (_, i) => prev[i] ?? '');
      return next;
    });
  }, [answerCount]);

  const splitUploadFileName = (name = '') => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === name.length - 1) {
      return { base: name, ext: '' };
    }
    return { base: name.slice(0, lastDot), ext: name.slice(lastDot + 1) };
  };

  const makeQuestionFileEntry = (file) => {
    const { base, ext } = splitUploadFileName(file?.name || '');
    const id = `${file?.name || 'file'}-${file?.size || 0}-${file?.lastModified || 0}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, file, base, ext, originalBase: base };
  };

  const getQuestionFileName = (entry) => {
    const base = String(entry?.base ?? '').trim();
    const ext = entry?.ext ? String(entry.ext).trim() : '';
    const fallback = entry?.file?.name || '';
    if (!base) return fallback;
    return ext ? `${base}.${ext}` : base;
  };

  const buildQuestionUploadFile = (entry) => {
    if (!entry?.file) return null;
    const name = getQuestionFileName(entry);
    if (!name || name === entry.file.name) return entry.file;
    try {
      return new File([entry.file], name, { type: entry.file.type, lastModified: entry.file.lastModified });
    } catch {
      return entry.file;
    }
  };

  const getAttachmentKey = (item) => item?.storageName || item?.url || item?.id || item?.name;

  const resetQuestionForm = (options = {}) => {
    const { keepAnswers = false } = options;
    setQuestion('');
    setQuestionScreenshots([]);
    setQuestionFiles([]);
    setExistingQuestionScreenshots([]);
    setExistingQuestionFiles([]);
    setInitialQuestionAttachments({ screenshots: [], files: [] });
    setQuestionUploadError('');
    setEditingQuestionId(null);
    if (!keepAnswers) {
      setAnswerInputs(Array.from({ length: getAnswerCountForTask(selectedTask) }, () => ''));
    }
    if (screenshotsRef.current) screenshotsRef.current.value = '';
    if (filesRef.current) filesRef.current.value = '';
  };

  const startEditQuestion = (questionItem) => {
    if (!questionItem) return;
    const requiredCount = getAnswerCountForTask(selectedTask);
    setEditingQuestionId(questionItem.id);
    setQuestion(questionItem.question || '');
    setAnswerInputs(getExpectedAnswers(questionItem, requiredCount));
    const existingScreens = Array.isArray(questionItem.screenshots) ? questionItem.screenshots : [];
    const existingFiles = Array.isArray(questionItem.files) ? questionItem.files : [];
    setExistingQuestionScreenshots(existingScreens);
    setExistingQuestionFiles(existingFiles);
    setInitialQuestionAttachments({
      screenshots: existingScreens,
      files: existingFiles
    });
    setQuestionScreenshots([]);
    setQuestionFiles([]);
    setQuestionUploadError('');
    if (screenshotsRef.current) screenshotsRef.current.value = '';
    if (filesRef.current) filesRef.current.value = '';
  };

  const cancelEditQuestion = () => resetQuestionForm();

  useEffect(() => {
    if (editingQuestionId) {
      cancelEditQuestion();
    }
  }, [selectedTask, selectedLevel]);

  const handleSaveQuestion = async () => {
    const requiredCount = getAnswerCountForTask(selectedTask);
    const trimmedAnswers = answerInputs.map((val) => String(val ?? '').trim());
    const answersSlice = trimmedAnswers.slice(0, requiredCount);
    const hasEmpty = answersSlice.some((val) => !val);
    const hasAny = answersSlice.some((val) => val);
    if (requiredCount > 1 && allowsPartialAnswers(selectedTask)) {
      if (!hasAny) {
        alert("Введите хотя бы один правильный ответ");
        return;
      }
    } else if (hasEmpty) {
      alert(requiredCount > 1 ? "Введите все правильные ответы" : "Введите правильный ответ");
      return;
    }
    const hasAnyAttachments =
      questionScreenshots.length > 0 ||
      questionFiles.length > 0 ||
      existingQuestionScreenshots.length > 0 ||
      existingQuestionFiles.length > 0;
    if (!question.trim() && !hasAnyAttachments) {
      alert("Добавьте текст вопроса или прикрепите файл/скриншот");
      return;
    }

    setIsUploadingQuestion(true);
    setQuestionUploadError('');
    let uploadedScreenshots = [];
    let uploadedFiles = [];
    try {
      if (questionScreenshots.length > 0) {
        uploadedScreenshots = await Promise.all(
          questionScreenshots.map((file) => api.uploadTestFile(file))
        );
      }
      if (questionFiles.length > 0) {
        uploadedFiles = await Promise.all(
          questionFiles
            .map((entry) => buildQuestionUploadFile(entry) || entry?.file)
            .filter(Boolean)
            .map((file) => api.uploadTestFile(file))
        );
      }
    } catch (err) {
      setQuestionUploadError(err?.message || err);
      setIsUploadingQuestion(false);
      return;
    }

    const updatedDb = { ...(testDb || {}) };
    if (!updatedDb[selectedTask]) updatedDb[selectedTask] = { basic: [], advanced: [], expert: [] };
    if (!updatedDb[selectedTask][selectedLevel]) updatedDb[selectedTask][selectedLevel] = [];
    const levelList = updatedDb[selectedTask][selectedLevel];
    const finalScreenshots = [...existingQuestionScreenshots, ...uploadedScreenshots];
    const finalFiles = [...existingQuestionFiles, ...uploadedFiles];

    if (editingQuestionId) {
      const targetIndex = levelList.findIndex((q) => q.id === editingQuestionId);
      if (targetIndex === -1) {
        setQuestionUploadError('Не удалось найти вопрос для редактирования.');
        setIsUploadingQuestion(false);
        return;
      }
      const baseQuestion = levelList[targetIndex] || {};
      const updatedQuestion = {
        ...baseQuestion,
        question: question.trim(),
        screenshots: finalScreenshots,
        files: finalFiles,
        ...(requiredCount > 1
          ? { answers: answersSlice }
          : { answer: trimmedAnswers[0] })
      };
      if (requiredCount > 1) {
        delete updatedQuestion.answer;
      } else {
        delete updatedQuestion.answers;
      }
      levelList[targetIndex] = updatedQuestion;
    } else {
      const newQuestion = {
        id: Date.now(),
        question: question.trim(),
        ...(requiredCount > 1
          ? { answers: answersSlice }
          : { answer: trimmedAnswers[0] }),
        screenshots: finalScreenshots,
        files: finalFiles
      };
      levelList.push(newQuestion);
    }
    
    setTestDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
    } catch (err) {
      setQuestionUploadError(err?.message || err);
      setIsUploadingQuestion(false);
      return;
    }
    
    if (editingQuestionId) {
      const removedScreens = (initialQuestionAttachments.screenshots || []).filter((item) => {
        const key = getAttachmentKey(item);
        if (!key) return false;
        return !finalScreenshots.some((current) => getAttachmentKey(current) === key);
      });
      const removedFiles = (initialQuestionAttachments.files || []).filter((item) => {
        const key = getAttachmentKey(item);
        if (!key) return false;
        return !finalFiles.some((current) => getAttachmentKey(current) === key);
      });
      const removed = [...removedScreens, ...removedFiles].filter((file) => file?.storageName);
      if (removed.length > 0) {
        await Promise.allSettled(removed.map((file) => api.deleteTestFile(file.storageName)));
      }
    }

    resetQuestionForm();
    setIsUploadingQuestion(false);
  };

  const handleDeleteQuestion = async (taskId, level, qId) => {
    if(!confirm("Удалить этот вопрос?")) return;
    const updatedDb = { ...(testDb || {}) };
    const removed = updatedDb[taskId][level].find(q => q.id === qId);
    updatedDb[taskId][level] = updatedDb[taskId][level].filter(q => q.id !== qId);
    setTestDb(updatedDb);
    if (editingQuestionId === qId) {
      resetQuestionForm();
    }
    try {
      await api.saveTests(updatedDb);
    } catch (err) {
      alert(err?.message || err);
    }
    if (removed) {
      const attachments = [
        ...(Array.isArray(removed.screenshots) ? removed.screenshots : []),
        ...(Array.isArray(removed.files) ? removed.files : [])
      ];
      if (attachments.length > 0) {
        await Promise.allSettled(
          attachments.map((file) => api.deleteTestFile(file.storageName))
        );
      }
    }
  };

  const currentQuestions = testDb?.[selectedTask]?.[selectedLevel] || [];
  const studentsList = students || [];
  const deletedStudentsList = deletedStudents || [];
  const tasksList = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const formatDeletedDate = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const getDeletedDaysLeft = (iso) => {
    if (!iso) return null;
    const deletedAt = new Date(iso).getTime();
    if (!Number.isFinite(deletedAt)) return null;
    const daysPassed = Math.floor((Date.now() - deletedAt) / (1000 * 60 * 60 * 24));
    return Math.max(0, SOFT_DELETE_DAYS - daysPassed);
  };

  const addScreenshotFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter((file) => file.type?.startsWith('image/'));
    if (incoming.length === 0) return;
    setQuestionScreenshots((prev) => [...prev, ...incoming]);
  };

  const addExtraFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter(Boolean);
    if (incoming.length === 0) return;
    const entries = incoming.map((file) => makeQuestionFileEntry(file));
    setQuestionFiles((prev) => [...prev, ...entries]);
  };

  const removeScreenshot = (idx) => {
    setQuestionScreenshots((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeExtraFile = (idx) => {
    setQuestionFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleScreenshotsDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingScreens(false);
    addScreenshotFiles(e.dataTransfer?.files || []);
  };

  const handleScreenshotsDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingScreens) setIsDraggingScreens(true);
  };

  const handleScreenshotsDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingScreens(false);
  };

  const handleFilesDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFiles(false);
    addExtraFiles(e.dataTransfer?.files || []);
  };

  const handleFilesDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFiles) setIsDraggingFiles(true);
  };

  const handleFilesDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFiles(false);
  };

  const handlePasteImages = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type && item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    const files = imageItems
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (files.length === 0) return;
    e.preventDefault();
    addScreenshotFiles(files);
  };

  const handleCreateStudent = async () => {
    const name = newStudentName.trim();
    if (!name) {
      setStudentActionError('Введите имя ученика');
      return;
    }
    if (!teacherId) {
      setStudentActionError('Сначала выберите учителя');
      return;
    }
    setStudentActionLoading(true);
    try {
      const created = await api.createStudent(name, teacherId);
      const { code, ...rest } = created || {};
      if (rest?.id) onStudentCreated?.(rest);
      if (code) setLastIssuedCode({ name: rest?.name || name, code });
      setNewStudentName('');
      setStudentActionError('');
    } catch (err) {
      setStudentActionError(err?.message || err);
    } finally {
      setStudentActionLoading(false);
    }
  };

  const handleDeleteStudent = async (student) => {
    if (!student?.id) return;
    if (!confirm(`Удалить ученика "${student.name}"? Ученик скроется, но его можно восстановить в течение 30 дней.`)) return;
    setStudentActionLoading(true);
    try {
      const res = await api.deleteStudent(student.id);
      const deletedAt = res?.deletedAt || new Date().toISOString();
      onStudentDeleted?.({ ...student, deletedAt });
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setStudentActionLoading(false);
    }
  };

  const handleResetStudentCode = async (student) => {
    if (!student?.id) return;
    if (!confirm(`Сгенерировать новый код для "${student.name}"? Старый код больше не будет работать.`)) return;
    setResettingStudentId(student.id);
    try {
      const res = await api.resetStudentCode(student.id);
      if (res?.code) setLastIssuedCode({ name: student.name, code: res.code });
      if (res?.codeHint) onStudentUpdated?.({ ...student, codeHint: res.codeHint });
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setResettingStudentId(null);
    }
  };

  const handleRestoreStudent = async (student) => {
    if (!student?.id) return;
    if (!confirm(`Восстановить ученика "${student.name}"?`)) return;
    setRestoringStudentId(student.id);
    try {
      const restored = await api.restoreStudent(student.id);
      onStudentRestored?.(restored);
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setRestoringStudentId(null);
    }
  };

  const startEditStudent = (student) => {
    if (!student?.id) return;
    setEditingStudentId(student.id);
    setEditStudentName(student.name || '');
    setEditStudentNickname(student.nickname || '');
    const alias = typeof student.leaderboardAlias === 'string' ? student.leaderboardAlias : '';
    setEditStudentLeaderboardAlias(alias);
    setEditStudentLeaderboardAliasInitial(alias);
    setEditStudentError('');
  };

  const cancelEditStudent = () => {
    setEditingStudentId(null);
    setEditStudentName('');
    setEditStudentNickname('');
    setEditStudentLeaderboardAlias('');
    setEditStudentLeaderboardAliasInitial('');
    setEditStudentError('');
  };

  const saveEditStudent = async (student) => {
    if (!student?.id) return;
    const nextName = editStudentName.trim();
    const nextAlias = String(editStudentLeaderboardAlias || '').trim();
    const initialAlias = String(editStudentLeaderboardAliasInitial || '').trim();
    const aliasChanged = nextAlias !== initialAlias;
    setEditStudentError('');
    if (!nextName) {
      setEditStudentError('Введите имя ученика');
      return;
    }
    if (nextName.length > 60) {
      setEditStudentError('Имя слишком длинное');
      return;
    }
    if (/[\/\\]/.test(nextName)) {
      setEditStudentError('Недопустимые символы');
      return;
    }
    if (aliasChanged && nextAlias && !/^[А-Яа-яЁё]{2,6}$/.test(nextAlias)) {
      setEditStudentError('Псевдоним: 2-6 символов, только русские буквы.');
      return;
    }

    setEditStudentSaving(true);
    try {
      const payload = { name: nextName, nickname: editStudentNickname };
      if (aliasChanged) payload.leaderboardAlias = nextAlias;
      const res = await api.updateStudent(student.id, payload);
      onStudentUpdated?.({ ...student, ...res });
      cancelEditStudent();
    } catch (err) {
      setEditStudentError(err?.message || err);
    } finally {
      setEditStudentSaving(false);
    }
  };

  const handleChangeTeacherCode = async () => {
    setTeacherCodeError('');
    setTeacherCodeSuccess('');
    if (!teacherId) {
      setTeacherCodeError('Сначала выберите учителя');
      return;
    }
    const current = teacherCodeForm.current.trim();
    const next = teacherCodeForm.next.trim();
    const repeat = teacherCodeForm.repeat.trim();
    if (!current || !next) {
      setTeacherCodeError('Введите текущий и новый код');
      return;
    }
    if (next.length < 4 || next.length > 32) {
      setTeacherCodeError('Код должен быть от 4 до 32 символов');
      return;
    }
    if (next !== repeat) {
      setTeacherCodeError('Коды не совпадают');
      return;
    }
    setTeacherCodeSaving(true);
    try {
      await api.updateTeacherCode(teacherId, current, next);
      setTeacherCodeForm({ current: '', next: '', repeat: '' });
      setTeacherCodeSuccess('Код обновлён');
    } catch (err) {
      setTeacherCodeError(err?.message || err);
    } finally {
      setTeacherCodeSaving(false);
    }
  };


  return (
    <div className="animate-fadeIn pb-10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="text-purple-600" />
          Панель учителя
        </h2>
        <p className="text-gray-500">Добавление и редактирование заданий для тестов</p>
        {testsLoading && <p className="text-xs text-gray-400 mt-2">Загрузка базы тестов...</p>}
        {testsError && <p className="text-xs text-red-500 mt-2">{testsError}</p>}
      </div>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Ученики</h3>
            <p className="text-xs text-gray-500">Всего: {studentsList.length}</p>
          </div>
          {studentsError && <span className="text-xs text-red-500">{studentsError}</span>}
        </div>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <input
            type="text"
            value={newStudentName}
            onChange={(e) => { setNewStudentName(e.target.value); setStudentActionError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateStudent(); }}
            placeholder="Имя ученика"
            className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <Button onClick={handleCreateStudent} disabled={studentActionLoading || !newStudentName.trim()}>
            <Plus size={16}/> Добавить
          </Button>
        </div>
        {studentActionError && <p className="text-xs text-red-500 mb-3">{studentActionError}</p>}
        {lastIssuedCode && (
          <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex flex-wrap items-center justify-between gap-2">
            <span>
              Код доступа для <strong>{lastIssuedCode.name}</strong>:
              <span className="font-mono ml-2">{lastIssuedCode.code}</span>
            </span>
            <button
              onClick={() => setLastIssuedCode(null)}
              className="text-xs text-green-700 hover:text-green-900"
              type="button"
            >
              Скрыть
            </button>
          </div>
        )}


        <div className="space-y-2">
          {studentsLoading ? (
            <div className="text-sm text-gray-500">Загрузка списка...</div>
          ) : studentsList.length === 0 ? (
            <div className="text-sm text-gray-400">Пока нет учеников. Создайте первого.</div>
          ) : (
            studentsList.map((student) => {
              const studentXpTotal = normalizeXpTotal(student?.xpTotal);
              const rawStudentLevel = Number(student?.level);
              const studentLevel = Number.isFinite(rawStudentLevel) && rawStudentLevel > 0
                ? Math.floor(rawStudentLevel)
                : (Math.floor(studentXpTotal / XP_PER_LEVEL) + 1);
              const studentXpLabel = studentXpTotal.toLocaleString('ru-RU');
              return (
                <div
                  key={student.id}
                  onClick={() => onSelectStudent?.(student.id)}
                  className={`p-3 rounded-xl border flex items-start justify-between gap-3 cursor-pointer transition-all ${
                    activeStudentId === student.id ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {editingStudentId === student.id ? (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editStudentName}
                          onChange={(e) => setEditStudentName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditStudent(student);
                            if (e.key === 'Escape') cancelEditStudent();
                          }}
                          placeholder="Имя ученика"
                          className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                        />
                        <input
                          type="text"
                          value={editStudentNickname}
                          onChange={(e) => setEditStudentNickname(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditStudent(student);
                            if (e.key === 'Escape') cancelEditStudent();
                          }}
                          placeholder="Прозвище (только для вас)"
                          className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                        />
                        <input
                          type="text"
                          value={editStudentLeaderboardAlias}
                          onChange={(e) => {
                            const next = String(e.target.value || '')
                              .replace(/[^А-Яа-яЁё]/g, '')
                              .slice(0, 6);
                            setEditStudentLeaderboardAlias(next);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditStudent(student);
                            if (e.key === 'Escape') cancelEditStudent();
                          }}
                          placeholder="Псевдоним в рейтинге (пусто = аноним)"
                          className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                        />
                        <p className="text-[11px] text-gray-500">2-6 русских букв, плохие слова блокируются.</p>
                        {editStudentError && <p className="text-xs text-red-500">{editStudentError}</p>}
                      </div>
                    ) : (
                      <>
                        <p className="font-medium text-gray-800 truncate">{student.name}</p>
                        {student.nickname && (
                          <p className="text-xs text-purple-600 truncate">Прозвище: {student.nickname}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                            {`Ур. ${studentLevel}`}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            {`${studentXpLabel} XP`}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          Рейтинг: <span className="font-medium text-gray-700">{student.leaderboardAlias || 'аноним'}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          Код: <span className="font-mono">{student.codeHint ? `****${student.codeHint}` : 'скрыт'}</span>
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editingStudentId === student.id ? (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); saveEditStudent(student); }}
                          className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-700 disabled:opacity-60"
                          disabled={editStudentSaving}
                          type="button"
                        >
                          {editStudentSaving ? '...' : 'Сохранить'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelEditStudent(); }}
                          className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                          type="button"
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <>
                        {activeStudentId === student.id && (
                          <span className="text-xs font-semibold text-purple-600">Активный</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditStudent(student); }}
                          className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                          type="button"
                        >
                          Изменить
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResetStudentCode(student); }}
                          className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                          title="Сбросить код"
                          disabled={resettingStudentId === student.id}
                          type="button"
                        >
                          <RefreshCcw size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteStudent(student); }}
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                          title="Удалить ученика"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-gray-700">Удалённые ученики</h4>
            <span className="text-xs text-gray-400">восстановление {SOFT_DELETE_DAYS} дней</span>
          </div>
          {deletedStudentsError && <p className="text-xs text-red-500 mb-2">{deletedStudentsError}</p>}
          {deletedStudentsLoading ? (
            <div className="text-sm text-gray-500">Загрузка удалённых...</div>
          ) : deletedStudentsList.length === 0 ? (
            <div className="text-sm text-gray-400">Нет удалённых учеников.</div>
          ) : (
            <div className="space-y-2">
              {deletedStudentsList.map((student) => {
                const daysLeft = getDeletedDaysLeft(student.deletedAt);
                return (
                  <div
                    key={student.id}
                    className="p-3 rounded-xl border border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700 truncate">{student.name}</p>
                      {student.nickname && (
                        <p className="text-xs text-purple-600 truncate">Прозвище: {student.nickname}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Удалён: {formatDeletedDate(student.deletedAt) || '—'}
                      </p>
                      {daysLeft !== null && (
                        <p className="text-xs text-gray-500">Осталось: {daysLeft} дн.</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRestoreStudent(student); }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-60"
                      type="button"
                      disabled={restoringStudentId === student.id}
                    >
                      {restoringStudentId === student.id ? '...' : 'Восстановить'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Смена кода учителя</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="password"
            value={teacherCodeForm.current}
            onChange={(e) => setTeacherCodeForm((prev) => ({ ...prev, current: e.target.value }))}
            placeholder="Текущий код"
            className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <input
            type="password"
            value={teacherCodeForm.next}
            onChange={(e) => setTeacherCodeForm((prev) => ({ ...prev, next: e.target.value }))}
            placeholder="Новый код"
            className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <input
            type="password"
            value={teacherCodeForm.repeat}
            onChange={(e) => setTeacherCodeForm((prev) => ({ ...prev, repeat: e.target.value }))}
            placeholder="Повторите код"
            className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <span className="text-xs text-gray-500">Код хранится в зашифрованном виде. Новый код вступит в силу сразу.</span>
          <Button onClick={handleChangeTeacherCode} disabled={teacherCodeSaving}>
            {teacherCodeSaving ? 'Сохранение...' : 'Обновить код'}
          </Button>
        </div>
        {teacherCodeError && <p className="text-xs text-red-500 mt-2">{teacherCodeError}</p>}
        {teacherCodeSuccess && <p className="text-xs text-green-600 mt-2">{teacherCodeSuccess}</p>}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Controls */}
        <div className="space-y-6">
          <Card>
            <label className="block text-sm font-medium text-gray-700 mb-2">Выберите номер задания</label>
            <select 
              value={selectedTask} 
              onChange={(e) => setSelectedTask(Number(e.target.value))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:border-purple-500"
            >
              {tasksList.map(t => (
                <option key={t.id} value={t.number}>Задание {getTaskDisplayNumber(t)}: {t.title}</option>
              ))}
            </select>
          </Card>

          <Card>
            <label className="block text-sm font-medium text-gray-700 mb-2">Уровень сложности</label>
            <div className="flex flex-col gap-2">
              {Object.values(LEVELS).map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => setSelectedLevel(lvl.id)}
                  className={`p-3 rounded-xl border text-left flex justify-between items-center transition-all ${
                    selectedLevel === lvl.id 
                    ? `border-purple-500 bg-purple-50 text-purple-700 ring-1 ring-purple-500` 
                    : 'border-gray-200 hover:border-purple-300 text-gray-600'
                  }`}
                >
                  <span className="font-medium">{lvl.label}</span>
                  <span className="text-xs bg-white px-2 py-1 rounded border opacity-70">до {lvl.maxScore}%</span>
                </button>
              ))}
            </div>
          </Card>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
            <strong>Всего вопросов:</strong> {currentQuestions.length}<br/>
            Минимум 11 вопросов рекомендуется для разнообразия выборки.
          </div>
        </div>

        {/* MIDDLE COLUMN: Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                {editingQuestionId ? <Pencil size={20} className="text-purple-600" /> : <Plus size={20} className="text-purple-600" />}
                {editingQuestionId ? 'Редактировать вопрос' : 'Добавить вопрос'}
              </h3>
              {editingQuestionId && (
                <button
                  type="button"
                  onClick={cancelEditQuestion}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Отменить
                </button>
              )}
            </div>
            
            <div className="space-y-4" onPaste={handlePasteImages}>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Текст вопроса (необязательно)</label>
                <textarea 
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 min-h-[100px] outline-none focus:border-purple-500"
                  placeholder="Введите текст задания..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Скриншоты вопроса</label>
                  <div
                    onDrop={handleScreenshotsDrop}
                    onDragOver={handleScreenshotsDragOver}
                    onDragLeave={handleScreenshotsDragLeave}
                    className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
                      isDraggingScreens ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      ref={screenshotsRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => addScreenshotFiles(e.target.files)}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
                      <span>Перетащите изображения сюда</span>
                      <button
                        type="button"
                        onClick={() => screenshotsRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                      >
                        Выбрать
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">Можно вставить из буфера (Ctrl+V)</div>
                  </div>
                  {screenshotPreviews.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {screenshotPreviews.map((item, idx) => (
                        <div key={`${item.file.name}-${idx}`} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                          <div className="bg-gray-50 p-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-500 truncate">{item.file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeScreenshot(idx)}
                              className="text-xs text-red-500 hover:text-red-600"
                            >
                              Удалить
                            </button>
                          </div>
                          <img
                            src={item.url}
                            alt={item.file.name}
                            className="w-full object-contain bg-white"
                            style={{ maxHeight: '360px' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {existingQuestionScreenshots.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {existingQuestionScreenshots.map((item, idx) => {
                        const imgUrl = withUploadsAuthToken(item?.url || (item?.storageName ? `/uploads/${item.storageName}` : ''));
                        return (
                          <div key={item.id || item.storageName || item.url || idx} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                            <div className="bg-gray-50 p-2 flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-500 truncate">{item.name || 'Скриншот'}</span>
                              <button
                                type="button"
                                onClick={() => setExistingQuestionScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-xs text-red-500 hover:text-red-600"
                              >
                                Удалить
                              </button>
                            </div>
                            {imgUrl && (
                              <img
                                src={imgUrl}
                                alt={item.name || 'Скриншот'}
                                className="w-full object-contain bg-white"
                                style={{ maxHeight: '360px' }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Доп. файлы</label>
                  <div
                    onDrop={handleFilesDrop}
                    onDragOver={handleFilesDragOver}
                    onDragLeave={handleFilesDragLeave}
                    className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
                      isDraggingFiles ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      ref={filesRef}
                      type="file"
                      multiple
                      onChange={(e) => addExtraFiles(e.target.files)}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
                      <span>Перетащите файлы сюда</span>
                      <button
                        type="button"
                        onClick={() => filesRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  {questionFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {questionFiles.map((entry, idx) => (
                        <div key={entry.id || idx} className="flex items-center justify-between text-xs text-gray-500 gap-2">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-gray-400">•</span>
                            <input
                              type="text"
                              value={entry.base}
                              onChange={(e) => {
                                const value = e.target.value;
                                setQuestionFiles((prev) => prev.map((item, i) => (i === idx ? { ...item, base: value } : item)));
                              }}
                              onBlur={() => {
                                setQuestionFiles((prev) => prev.map((item, i) => {
                                  if (i !== idx) return item;
                                  const nextBase = String(item.base ?? '').trim();
                                  if (nextBase) return item;
                                  const fallback = item.originalBase || splitUploadFileName(item.file?.name || '').base || 'Файл';
                                  return { ...item, base: fallback };
                                }));
                              }}
                              className="text-xs text-gray-600 bg-transparent border-b border-dashed border-gray-300 focus:border-purple-400 outline-none min-w-[60px] max-w-[220px]"
                            />
                            {entry.ext ? <span className="text-xs text-gray-400">.{entry.ext}</span> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeExtraFile(idx)}
                            className="text-red-500 hover:text-red-600"
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {existingQuestionFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {existingQuestionFiles.map((file, idx) => {
                        const { base, ext } = splitUploadFileName(file?.name || '');
                        return (
                          <div key={file.id || file.storageName || file.url || idx} className="flex items-center justify-between text-xs text-gray-500 gap-2">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-gray-400">•</span>
                              <input
                                type="text"
                                value={base}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setExistingQuestionFiles((prev) => prev.map((item, i) => {
                                    if (i !== idx) return item;
                                    const suffix = ext ? `.${ext}` : '';
                                    return { ...item, name: `${value}${suffix}` };
                                  }));
                                }}
                                onBlur={() => {
                                  setExistingQuestionFiles((prev) => prev.map((item, i) => {
                                    if (i !== idx) return item;
                                    const current = String(item?.name || '').trim();
                                    const parsed = splitUploadFileName(current);
                                    if (parsed.base) return item;
                                    const fallbackBase = 'Файл';
                                    const suffix = parsed.ext ? `.${parsed.ext}` : '';
                                    return { ...item, name: `${fallbackBase}${suffix}` };
                                  }));
                                }}
                                className="text-xs text-gray-600 bg-transparent border-b border-dashed border-gray-300 focus:border-purple-400 outline-none min-w-[60px] max-w-[220px]"
                              />
                              {ext ? <span className="text-xs text-gray-400">.{ext}</span> : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => setExistingQuestionFiles((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:text-red-600"
                            >
                              Удалить
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {questionUploadError && <p className="text-xs text-red-500">{questionUploadError}</p>}

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Правильный ответ</label>
                {answerCount > 1 ? (
                  Number(selectedTask) === GAME_THEORY_TASK ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">19</label>
                        <input
                          type="text"
                          value={answerInputs[0] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAnswerInputs((prev) => {
                              const next = [...prev];
                              next[0] = value;
                              return next;
                            });
                          }}
                          className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                          placeholder="Ответ 19"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.1</label>
                          <input
                            type="text"
                            value={answerInputs[1] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAnswerInputs((prev) => {
                                const next = [...prev];
                                next[1] = value;
                                return next;
                              });
                            }}
                            className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                            placeholder="Ответ 20.1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.2</label>
                          <input
                            type="text"
                            value={answerInputs[2] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAnswerInputs((prev) => {
                                const next = [...prev];
                                next[2] = value;
                                return next;
                              });
                            }}
                            className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                            placeholder="Ответ 20.2"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">21</label>
                        <input
                          type="text"
                          value={answerInputs[3] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAnswerInputs((prev) => {
                              const next = [...prev];
                              next[3] = value;
                              return next;
                            });
                          }}
                          className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                          placeholder="Ответ 21"
                        />
                      </div>
                    </div>
                  ) : answerCount === 20 ? (
                    <div className="grid grid-cols-[32px_1fr_1fr] gap-2">
                      {Array.from({ length: 10 }).map((_, rowIdx) => {
                        const leftIdx = rowIdx;
                        const rightIdx = rowIdx + 10;
                        return (
                          <React.Fragment key={rowIdx}>
                            <div className="flex items-center justify-center text-xs font-bold text-gray-500">
                              {rowIdx + 1}
                            </div>
                            <input
                              type="text"
                              value={answerInputs[leftIdx] ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setAnswerInputs((prev) => {
                                  const next = [...prev];
                                  next[leftIdx] = value;
                                  return next;
                                });
                              }}
                              className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                              placeholder="Ответ 1"
                            />
                            <input
                              type="text"
                              value={answerInputs[rightIdx] ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setAnswerInputs((prev) => {
                                  const next = [...prev];
                                  next[rightIdx] = value;
                                  return next;
                                });
                              }}
                              className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                              placeholder="Ответ 2"
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Array.from({ length: answerCount }).map((_, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={answerInputs[idx] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAnswerInputs((prev) => {
                              const next = [...prev];
                              next[idx] = value;
                              return next;
                            });
                          }}
                          className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                          placeholder={`Ответ ${idx + 1}`}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <input
                    type="text"
                    value={answerInputs[0] ?? ''}
                    onChange={(e) => setAnswerInputs([e.target.value])}
                    className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                    placeholder="Введите правильный ответ"
                  />
                )}
              </div>

              <div className="pt-2">
                <Button onClick={handleSaveQuestion} className="w-full" disabled={isUploadingQuestion}>
                  <Save size={18} /> {isUploadingQuestion ? 'Загрузка...' : (editingQuestionId ? 'Сохранить изменения' : 'Сохранить вопрос в базу')}
                </Button>
              </div>
            </div>
          </Card>

          {/* Question List */}
          <div className="space-y-3">
            <h3 className="font-bold text-gray-700">Существующие вопросы ({currentQuestions.length})</h3>
            {currentQuestions.length === 0 ? (
              <div className="text-center p-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed">
                В этой категории пока нет вопросов.
              </div>
            ) : (
              currentQuestions.map((q, idx) => (
                <div key={q.id} className={`bg-white p-4 rounded-xl border shadow-sm flex justify-between items-start gap-4 ${editingQuestionId === q.id ? 'border-purple-300 bg-purple-50/30' : 'border-gray-100'}`}>
                  <div>
                    <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                    <p className="text-gray-800 font-medium mb-1">{q.question || 'Вопрос без текста'}</p>
                    <div className="text-xs text-gray-500 flex gap-2">
                       <span>
                        Ответ:{' '}
                        <span className="text-green-600 font-bold">
                          {(() => {
                            const count = getAnswerCountForTask(selectedTask);
                            const answers = getExpectedAnswers(q, count);
                            if (count <= 1) return answers[0] || '';
                            return answers.filter(Boolean).join('; ');
                          })()}
                        </span>
                      </span>
                    </div>
                    {Array.isArray(q.screenshots) && q.screenshots.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {q.screenshots.map((img) => {
                          const imgUrl = withUploadsAuthToken(img?.url || (img?.storageName ? `/uploads/${img.storageName}` : ''));
                          return (
                          <button
                            key={img.id || img.url || img.storageName}
                            type="button"
                            onClick={() => imgUrl && window.open(imgUrl, '_blank', 'noopener,noreferrer')}
                            className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden hover:border-purple-300"
                            title="Открыть изображение"
                          >
                            <img
                              src={imgUrl}
                              alt={img.name || 'Скриншот'}
                              className="h-24 w-24 object-contain"
                            />
                          </button>
                        );
                        })}
                      </div>
                    )}
                    {Array.isArray(q.files) && q.files.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {q.files.map((file) => {
                          const fileUrl = withUploadsAuthToken(file?.url || (file?.storageName ? `/uploads/${file.storageName}` : ''));
                          return (
                            <a
                              key={file.id || file.url || file.storageName}
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                            >
                              <span className="truncate">{file.name || 'Файл'}</span>
                              <Download size={16} className="text-purple-600" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditQuestion(q)}
                      className="text-gray-400 hover:text-purple-600 transition-colors p-1"
                      title="Редактировать"
                    >
                      <Pencil size={18} />
                    </button>
                    <button 
                      onClick={() => handleDeleteQuestion(selectedTask, selectedLevel, q.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Удалить"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminPanel = ({
  teachers,
  teachersLoading,
  teachersError,
  onTeachersChanged
}) => {
  const [newTeacherName, setNewTeacherName] = useState('');
  const [teacherActionError, setTeacherActionError] = useState('');
  const [teacherActionLoading, setTeacherActionLoading] = useState(false);
  const [lastTeacherCode, setLastTeacherCode] = useState(null);
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [editTeacherName, setEditTeacherName] = useState('');
  const [editTeacherError, setEditTeacherError] = useState('');
  const [editTeacherSaving, setEditTeacherSaving] = useState(false);
  const [resettingTeacherId, setResettingTeacherId] = useState(null);
  const [adminStudents, setAdminStudents] = useState([]);
  const [adminStudentsLoading, setAdminStudentsLoading] = useState(false);
  const [adminStudentsError, setAdminStudentsError] = useState('');

  const loadAllStudents = async () => {
    setAdminStudentsLoading(true);
    try {
      const data = await api.getStudents();
      setAdminStudents(data);
      setAdminStudentsError('');
    } catch (err) {
      setAdminStudentsError(err?.message || err);
    } finally {
      setAdminStudentsLoading(false);
    }
  };

  useEffect(() => {
    loadAllStudents();
  }, [teachers?.length]);

  const handleCreateTeacher = async () => {
    const name = newTeacherName.trim();
    if (!name) {
      setTeacherActionError('Введите имя учителя');
      return;
    }
    setTeacherActionLoading(true);
    try {
      const created = await api.createTeacher(name);
      const { code, ...rest } = created || {};
      if (code) setLastTeacherCode({ name: rest?.name || name, code });
      setNewTeacherName('');
      setTeacherActionError('');
      onTeachersChanged?.();
    } catch (err) {
      setTeacherActionError(err?.message || err);
    } finally {
      setTeacherActionLoading(false);
    }
  };

  const handleDeleteTeacher = async (teacher) => {
    if (!teacher?.id) return;
    if (!confirm(`Удалить учителя "${teacher.name}"? Все его ученики и данные будут удалены.`)) return;
    try {
      await api.deleteTeacher(teacher.id);
      onTeachersChanged?.();
      loadAllStudents();
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleResetTeacherCode = async (teacher) => {
    if (!teacher?.id) return;
    if (!confirm(`Сгенерировать новый код для "${teacher.name}"?`)) return;
    setResettingTeacherId(teacher.id);
    try {
      const res = await api.resetTeacherCode(teacher.id);
      if (res?.code) setLastTeacherCode({ name: teacher.name, code: res.code });
      onTeachersChanged?.();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setResettingTeacherId(null);
    }
  };

  const startEditTeacher = (teacher) => {
    if (!teacher?.id) return;
    setEditingTeacherId(teacher.id);
    setEditTeacherName(teacher.name || '');
    setEditTeacherError('');
  };

  const cancelEditTeacher = () => {
    setEditingTeacherId(null);
    setEditTeacherName('');
    setEditTeacherError('');
  };

  const saveEditTeacher = async (teacher) => {
    const name = editTeacherName.trim();
    if (!name) {
      setEditTeacherError('Введите имя учителя');
      return;
    }
    setEditTeacherSaving(true);
    try {
      await api.updateTeacherName(teacher.id, name);
      cancelEditTeacher();
      onTeachersChanged?.();
    } catch (err) {
      setEditTeacherError(err?.message || err);
    } finally {
      setEditTeacherSaving(false);
    }
  };

  const teacherMap = useMemo(() => {
    const map = new Map();
    (teachers || []).forEach((teacher) => map.set(teacher.id, teacher.name));
    return map;
  }, [teachers]);

  return (
    <div className="animate-fadeIn space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Админка</h2>
        <p className="text-gray-500">Управление учителями и всеми учениками</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Учителя</h3>
            <p className="text-xs text-gray-500">Всего: {teachers?.length || 0}</p>
          </div>
          {teachersError && <span className="text-xs text-red-500">{teachersError}</span>}
        </div>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <input
            type="text"
            value={newTeacherName}
            onChange={(e) => { setNewTeacherName(e.target.value); setTeacherActionError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTeacher(); }}
            placeholder="Имя учителя"
            className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <Button onClick={handleCreateTeacher} disabled={teacherActionLoading || !newTeacherName.trim()}>
            <Plus size={16}/> Добавить
          </Button>
        </div>
        {teacherActionError && <p className="text-xs text-red-500 mb-3">{teacherActionError}</p>}
        {lastTeacherCode && (
          <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex flex-wrap items-center justify-between gap-2">
            <span>
              Код доступа для <strong>{lastTeacherCode.name}</strong>:
              <span className="font-mono ml-2">{lastTeacherCode.code}</span>
            </span>
            <button
              onClick={() => setLastTeacherCode(null)}
              className="text-xs text-green-700 hover:text-green-900"
              type="button"
            >
              Скрыть
            </button>
          </div>
        )}

        <div className="space-y-2">
          {teachersLoading ? (
            <div className="text-sm text-gray-500">Загрузка списка...</div>
          ) : (teachers || []).length === 0 ? (
            <div className="text-sm text-gray-400">Пока нет учителей. Создайте первого.</div>
          ) : (
            (teachers || []).map((teacher) => (
              <div key={teacher.id} className="p-3 rounded-xl border flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editingTeacherId === teacher.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTeacherName}
                        onChange={(e) => setEditTeacherName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditTeacher(teacher);
                          if (e.key === 'Escape') cancelEditTeacher();
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                      />
                      {editTeacherError && <p className="text-xs text-red-500">{editTeacherError}</p>}
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-gray-800 truncate">{teacher.name}</p>
                      <p className="text-xs text-gray-500">
                        Код: <span className="font-mono">{teacher.codeHint ? `****${teacher.codeHint}` : 'скрыт'}</span>
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingTeacherId === teacher.id ? (
                    <>
                      <button
                        onClick={() => saveEditTeacher(teacher)}
                        className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-700 disabled:opacity-60"
                        disabled={editTeacherSaving}
                        type="button"
                      >
                        {editTeacherSaving ? '...' : 'Сохранить'}
                      </button>
                      <button
                        onClick={cancelEditTeacher}
                        className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        type="button"
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditTeacher(teacher)}
                        className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        type="button"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleResetTeacherCode(teacher)}
                        className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                        title="Сбросить код"
                        disabled={resettingTeacherId === teacher.id}
                        type="button"
                      >
                        <RefreshCcw size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(teacher)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                        title="Удалить учителя"
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Все ученики</h3>
            <p className="text-xs text-gray-500">Всего: {adminStudents.length}</p>
          </div>
          {adminStudentsError && <span className="text-xs text-red-500">{adminStudentsError}</span>}
        </div>
        {adminStudentsLoading ? (
          <div className="text-sm text-gray-500">Загрузка списка учеников...</div>
        ) : adminStudents.length === 0 ? (
          <div className="text-sm text-gray-400">Пока нет учеников.</div>
        ) : (
          <div className="space-y-2">
            {adminStudents.map((student) => (
              <div key={student.id} className="p-3 rounded-xl border flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{student.name}</p>
                  <p className="text-xs text-gray-500">
                    Учитель: <span className="font-medium text-gray-700">{teacherMap.get(student.teacherId) || 'Неизвестно'}</span>
                  </p>
                </div>
                <span className="text-xs text-gray-400">{student.codeHint ? `****${student.codeHint}` : 'скрыт'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

/**
 * STUDENT TEST MODAL
 */
const PythonTestModal = ({ task, onClose, onComplete, progress, studentId, testDb, initialQuestionIndex, onQuestionChange, onStreakSaved, onXpGain }) => {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedCodeById, setSolvedCodeById] = useState({});
  const [expandedImage, setExpandedImage] = useState(null);
  const [code, setCode] = useState('');
  const [runnerLoading, setRunnerLoading] = useState(false);
  const [runnerError, setRunnerError] = useState('');
  const [testResults, setTestResults] = useState([]);
  const isMobileViewport = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 767px)').matches
    : false;
  const [showTheory, setShowTheory] = useState(() => (
    typeof window === 'undefined'
      ? true
      : !window.matchMedia('(max-width: 767px)').matches
  ));
  const [expandedTestIndex, setExpandedTestIndex] = useState(null);
  const currentQuestionIdRef = useRef(null);
  const runnerWorkerRef = useRef(null);
  const runnerPendingRef = useRef(new Map());
  const runnerWarmupStartedRef = useRef(false);

  const currentMastery = progress[task.id] || 0;
  const getQuestionIndexKey = () => {
    const safeStudentId = studentId || 'anon';
    const taskNum = task?.number || 'task';
    return `py_last_q_${safeStudentId}_${taskNum}`;
  };
  const getDraftKey = (questionId) => {
    const safeStudentId = studentId || 'anon';
    return `py_draft_${safeStudentId}_${task?.number || 'task'}_${questionId}`;
  };

  useEffect(() => {
    const qs = testDb?.[task.number]?.[PYTHON_LEVEL_ID] || [];
    const list = Array.isArray(qs) ? qs : [];
    let rawIndex = Number(initialQuestionIndex);
    if (!Number.isFinite(rawIndex) && typeof window !== 'undefined') {
      try {
        rawIndex = Number(window.localStorage.getItem(getQuestionIndexKey()));
      } catch {}
    }
    const safeIndex = Number.isFinite(rawIndex) && list.length > 0
      ? Math.max(0, Math.min(list.length - 1, Math.floor(rawIndex)))
      : 0;
    setQuestions(list);
    if (list.length > 0) {
      setCurrentIndex(safeIndex);
    }
    setSolvedIds(new Set());
    setSolvedCodeById({});
    setTestResults([]);
    setRunnerError('');
    if (studentId) {
      api.getSolvedQuestions(studentId, task.number, PYTHON_LEVEL_ID, { includeCode: true })
        .then((payload) => {
          if (Array.isArray(payload)) {
            setSolvedIds(new Set(payload.map((id) => String(id))));
            setSolvedCodeById({});
          } else {
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            const codeById = payload?.codeById && typeof payload.codeById === 'object' ? payload.codeById : {};
            setSolvedIds(new Set(ids.map((id) => String(id))));
            setSolvedCodeById(codeById);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [task?.number, testDb, studentId, initialQuestionIndex]);

  useEffect(() => {
    if (!Number.isFinite(currentIndex)) return;
    if (!questions.length) return;
    onQuestionChange?.(currentIndex);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(getQuestionIndexKey(), String(currentIndex));
    } catch {}
  }, [currentIndex, questions.length, onQuestionChange]);

  useEffect(() => {
    const current = questions[currentIndex];
    const currentId = String(current?.id ?? currentIndex);
    currentQuestionIdRef.current = currentId;
    const starter = current?.starterCode || '';
    const solvedCode = solvedCodeById?.[currentId];
    let nextCode = typeof solvedCode === 'string' ? solvedCode : starter;
    if (typeof window !== 'undefined') {
      try {
        const draft = window.localStorage.getItem(getDraftKey(currentId));
        if (typeof draft === 'string' && draft.length > 0) {
          nextCode = draft;
        }
      } catch {}
    }
    setCode(nextCode);
    setTestResults([]);
    setRunnerError('');
    setExpandedTestIndex(null);
  }, [questions, currentIndex, solvedCodeById, studentId, task?.number]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentId = currentQuestionIdRef.current;
    if (!currentId) return;
    try {
      if (code && code.length > 0) {
        window.localStorage.setItem(getDraftKey(currentId), code);
      } else {
        window.localStorage.removeItem(getDraftKey(currentId));
      }
    } catch {}
  }, [code, studentId, task?.number]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  const resolvePendingRuns = (message) => {
    runnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    runnerPendingRef.current.clear();
  };

  const disposeRunnerWorker = (message) => {
    if (runnerWorkerRef.current) {
      runnerWorkerRef.current.terminate();
      runnerWorkerRef.current = null;
    }
    if (message) resolvePendingRuns(message);
  };

  const ensureRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (runnerWorkerRef.current) return runnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = runnerPendingRef.current.get(data.id);
        if (!pending) return;
        const messageType = typeof data.type === 'string' ? data.type : 'result';
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
        runnerPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string'
          ? data.output
          : (data.output ? String(data.output) : (pending.output || ''));
        const error = typeof data.error === 'string'
          ? data.error
          : (data.error ? String(data.error) : (pending.error || ''));
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, done: true });
        }
        pending.resolve({ output, error });
      };
      worker.onerror = () => disposeRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeRunnerWorker('Ошибка выполнения Python.');
      runnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  useEffect(() => () => disposeRunnerWorker('Python runner stopped.'), []);

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

  const runPythonCode = async (source, inputValue, onProgress = null) => {
    const worker = ensureRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = runnerPendingRef.current.get(id);
          if (!pending) return;
          runnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposeRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        runnerPendingRef.current.set(id, {
          resolve,
          timer,
          output: '',
          error: '',
          onProgress: typeof onProgress === 'function' ? onProgress : null,
        });
        worker.postMessage({ id, source, input: inputValue });
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

  useEffect(() => {
    if (runnerWarmupStartedRef.current) return;
    runnerWarmupStartedRef.current = true;
    runPythonCode('pass', '').catch(() => {});
  }, []);

  const handleRunTests = async (sourceRect = null) => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;
    setRunnerLoading(true);
    setRunnerError('');
    const rawTests = Array.isArray(currentQuestion.tests)
      ? currentQuestion.tests
      : (currentQuestion.answer ? [{ input: '', output: currentQuestion.answer }] : []);
    const hasExpectedOutputs = rawTests.every((test) => (
      Object.prototype.hasOwnProperty.call(test || {}, 'output')
    ));
    const sanitizedTests = rawTests.map((test) => ({
      input: String(test?.input ?? ''),
      output: hasExpectedOutputs ? String(test?.output ?? '') : '',
    }));
    if (sanitizedTests.length === 0) {
      setRunnerLoading(false);
      setRunnerError('Для этой задачи пока нет тестов.');
      setTestResults([]);
      return;
    }
    try {
      const resultsList = [];
      for (const test of sanitizedTests) {
        const res = await runPythonCode(code, test.input);
        const normalizedOut = normalizeOutputForComparison(res.output);
        const normalizedExpected = normalizeOutputForComparison(test.output);
        const runtimeErrorText = normalizeRuntimeErrorForCheck(res.error);
        const hasRuntimeError = runtimeErrorText.length > 0;
        const failReason = hasRuntimeError
          ? 'runtime'
          : (normalizedOut === normalizedExpected ? '' : 'mismatch');
        const passed = hasExpectedOutputs
          ? failReason === ''
          : undefined;
        resultsList.push({
          input: test.input,
          expected: test.output,
          output: res.output,
          error: runtimeErrorText,
          passed,
          failReason,
        });
      }
      setTestResults(resultsList);

      const allPassed = hasExpectedOutputs
        && resultsList.length > 0
        && resultsList.every((item) => item.passed === true);
      const canSubmitWithoutExpected = !hasExpectedOutputs
        && resultsList.length > 0
        && resultsList.every((item) => !String(item.error ?? '').trim());
      const shouldSubmit = allPassed || canSubmitWithoutExpected;

      if (shouldSubmit) {
        const currentId = String(currentQuestion?.id ?? currentIndex);
        if (studentId) {
          try {
            const resp = await api.solveQuestion({
              studentId,
              taskNumber: task.number,
              levelId: PYTHON_LEVEL_ID,
              questionId: currentQuestion.id,
              totalQuestions: questions.length,
              levelMax: 100,
              levelTotals: { [PYTHON_LEVEL_ID]: questions.length },
              code,
              localDay: getLocalDayKey(),
              pythonResults: resultsList.map((item) => ({
                input: String(item?.input ?? ''),
                output: String(item?.output ?? ''),
                error: String(item?.error ?? ''),
              })),
            });
            setSolvedIds((prev) => {
              const next = new Set(prev);
              next.add(currentId);
              return next;
            });
            setSolvedCodeById((prev) => ({ ...prev, [currentId]: code }));
            if (typeof onStreakSaved === 'function') {
              if (resp?.streak) {
                onStreakSaved(resp.streak);
              } else {
                api.getStudentData(studentId)
                  .then((data) => {
                    if (data?.streak) onStreakSaved(data.streak);
                  })
                  .catch(() => {});
              }
            }
            if (typeof onXpGain === 'function' && Number.isFinite(Number(resp?.xpTotal))) {
              onXpGain({
                xpTotal: normalizeXpTotal(resp.xpTotal),
                xpGained: normalizeXpTotal(resp?.xpGained),
                sourceRect: sourceRect && Number.isFinite(sourceRect.left) && Number.isFinite(sourceRect.top)
                  ? sourceRect
                  : null,
              });
            }
            if (typeof resp?.taskProgress === 'number') {
              onComplete(task.id, resp.taskProgress, { skipServer: true });
              setRunnerLoading(false);
              return;
            }
          } catch (err) {
            const message = String(err?.message || err || '');
            setRunnerError(message || 'Не удалось сохранить результат');
            return;
          }
        } else if (!allPassed) {
          setRunnerError('Проверка без эталонных ответов доступна только для ученика.');
          return;
        }
        const totalCount = questions.length;
        if (totalCount > 0) {
          const prevSolved = solvedIds.size;
          const nextSolved = solvedIds.has(currentId) ? prevSolved : prevSolved + 1;
          const nextProgress = Math.round((nextSolved / totalCount) * 100);
          onComplete(task.id, Math.min(100, nextProgress), { skipServer: true });
        }
      }
    } catch (err) {
      setRunnerError(err?.message || err);
    } finally {
      setRunnerLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
    else onClose();
  };

  if (!task) return null;
  const testsLoading = testDb === null || typeof testDb === 'undefined';

  if (testsLoading) {
    const loadingModal = (
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4">
        <div className="surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <div className="mx-auto inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700">
            <RefreshCcw size={14} className="animate-spin" />
            Загрузка заданий...
          </div>
          <p className="text-gray-500 mt-3 text-sm">Подождите немного, загружаем задания и тесты.</p>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(loadingModal, document.body) : null;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    const emptyModal = (
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4">
        <div className="surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <h2 className="text-2xl font-bold text-gray-900">Заданий пока нет</h2>
          <p className="text-gray-500 mt-2">Учитель еще не добавил задания для этой темы.</p>
          <div className="mt-6">
            <Button onClick={onClose}>Закрыть</Button>
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(emptyModal, document.body) : null;
  }

  const currentQuestion = questions[currentIndex];
  const currentId = String(currentQuestion?.id ?? currentIndex);
  const isSolved = solvedIds.has(currentId);
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
  const rawTests = Array.isArray(currentQuestion?.tests)
    ? currentQuestion.tests
    : (currentQuestion?.answer ? [{ input: '', output: currentQuestion.answer }] : []);
  const testsToShow = rawTests.map((test) => ({
    input: String(test?.input ?? ''),
    output: String(test?.output ?? '')
  }));
  const solvedAllTests = isSolved && testResults.length === 0;
  const theory = testDb?.[task.number]?.pythonTheory || null;
  const theoryFullUrl = theory?.type === 'gdoc' ? buildGoogleDocFullUrl(theory.content) : '';
  const editorOptions = {
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
    formatOnPaste: true
  };
  const codeEditorHeight = isMobileViewport ? '170px' : '260px';

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="surface-card modal-card rounded-2xl md:rounded-3xl w-full max-w-5xl max-h-[95svh] md:max-h-[90vh] p-3.5 sm:p-4 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex flex-col gap-3 md:gap-4 mb-3 md:mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Тема</div>
              <div className="text-base md:text-lg font-bold text-gray-900 leading-tight">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={18}/></button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 pr-1">
            {questions.map((q, idx) => {
              const qId = String(q?.id ?? idx);
              const solved = solvedIds.has(qId);
              const isCurrent = idx === currentIndex;
              let btnClass = "shrink-0 w-9 h-9 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

              if (isCurrent && solved) {
                btnClass += "border-green-400 ring-2 ring-green-100 bg-green-100 text-green-700";
              } else if (isCurrent) {
                btnClass += "border-purple-600 ring-2 ring-purple-200 text-purple-600 bg-white";
              } else if (solved) {
                btnClass += "border-green-200 bg-green-100 text-green-600";
              } else {
                btnClass += "border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700";
              }

              return (
                <button
                  key={qId}
                  onClick={() => setCurrentIndex(idx)}
                  className={btnClass}
                  title={solved ? 'Решено' : undefined}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[11px] md:text-xs text-slate-500">
            <span>Задание {currentIndex + 1} из {questions.length}</span>
            {isSolved ? (
              <span className="font-semibold text-emerald-600">Решено</span>
            ) : (
              <span className="font-medium text-slate-400">Не решено</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-0 md:pr-1">
          {theory?.content && (
            <div className="mb-4 md:mb-6 rounded-2xl border border-purple-100 bg-purple-50/60 p-3 md:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Теория</div>
                <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs">
                  {theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-700"
                    >
                      Открыть полностью
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className="text-purple-600 hover:text-purple-700"
                  >
                    {showTheory ? 'Свернуть' : 'Показать'}
                  </button>
                </div>
              </div>
              {showTheory && (
                theory.type === 'gdoc' ? (
                  isGoogleDocEmbedUrl(theory.content) ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-purple-100 bg-white">
                      <iframe
                        title={`theory-${task.number}`}
                        src={theory.content}
                        className="w-full h-[240px] md:h-[360px]"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-red-500">
                      Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                    </div>
                  )
                ) : (
                  <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed max-h-[34svh] overflow-y-auto pr-1 md:max-h-none md:overflow-visible md:pr-0">
                    {theory.content}
                  </div>
                )
              )}
            </div>
          )}
          {screenshots.length > 0 && (
            <div className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
              {screenshots.map((img) => (
                <div
                  key={img.id || img.url}
                  className="border rounded-2xl overflow-hidden bg-gray-900/5 max-h-[42vh] sm:max-h-[55vh] md:max-h-[65vh]"
                >
                  <img
                    src={img.url}
                    alt={img.name || 'Скриншот'}
                    className="w-full object-contain cursor-zoom-in"
                    style={{ maxHeight: isMobileViewport ? '42vh' : '65vh' }}
                    onClick={() => setExpandedImage(img)}
                  />
                </div>
              ))}
            </div>
          )}

          {extraFiles.length > 0 && (
            <div className="mb-5 md:mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
              <div className="space-y-2">
                {extraFiles.map((file) => (
                  <a
                    key={file.id || file.url}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                  >
                    <span className="truncate">{file.name}</span>
                    <Download size={16} className="text-purple-600" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {isSolved && (
            <div className="mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Решено ранее</div>
          )}
          {currentQuestion?.question && (
            <p className="text-[15px] md:text-lg font-medium leading-relaxed text-gray-900 mb-5 md:mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
          )}

          <div className="space-y-3 mb-5 md:mb-6">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-400 uppercase">Код</label>
              <button
                type="button"
                onClick={() => setCode(currentQuestion?.starterCode || '')}
                className="text-xs text-purple-600 hover:text-purple-700"
              >
                Сбросить
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-800">
              <Editor
                height={codeEditorHeight}
                language="python"
                theme="vs-dark"
                value={code}
                onChange={(value) => {
                  setCode(value ?? '');
                  if (testResults.length > 0) setTestResults([]);
                }}
                options={editorOptions}
                loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
              />
            </div>
          </div>

          {runnerError && (
            <div className="mb-4 text-sm text-red-500">{runnerError}</div>
          )}

          <div className="space-y-3 mb-5 md:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-xs font-bold text-gray-400 uppercase">Тесты</div>
              <Button
                onClick={(event) => {
                  const rect = event?.currentTarget?.getBoundingClientRect?.();
                  handleRunTests(rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)
                    ? {
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                      }
                    : null);
                }}
                disabled={runnerLoading || !code.trim()}
                className="w-full sm:w-auto"
              >
                {runnerLoading ? 'Запуск...' : 'Запустить тесты'}
              </Button>
            </div>
            {testsToShow.length === 0 ? (
              <div className="text-sm text-gray-500">Учитель еще не добавил тесты.</div>
            ) : (
              <div className="space-y-2">
                {testsToShow.map((item, idx) => {
                  const result = testResults[idx];
                  const passed = result?.passed ?? (solvedAllTests ? true : undefined);
                  const showDetails = !isMobileViewport || Boolean(result) || expandedTestIndex === idx;
                  return (
                    <div
                      key={`${idx}-${item.input}`}
                      className={`rounded-2xl border p-2.5 md:p-3 text-xs md:text-sm ${
                        passed === undefined
                          ? 'border-gray-200 bg-gray-50'
                          : (passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50')
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">Тест {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] md:text-xs font-bold ${
                            passed === undefined ? 'text-gray-400' : (passed ? 'text-emerald-700' : 'text-red-600')
                          }`}>
                            {passed === undefined ? '—' : (passed ? 'OK' : 'Ошибка')}
                          </span>
                          {isMobileViewport && !result && (
                            <button
                              type="button"
                              onClick={() => setExpandedTestIndex((prev) => (prev === idx ? null : idx))}
                              className="text-[11px] font-semibold text-purple-600"
                            >
                              {showDetails ? 'Скрыть' : 'Детали'}
                            </button>
                          )}
                        </div>
                      </div>
                      {showDetails && (
                        <div className="mt-1.5 text-[11px] md:text-xs text-gray-600">
                          <div>
                            <span className="font-semibold">Вход:</span>
                            <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs">{item.input || '—'}</pre>
                          </div>
                          <div>
                            <span className="font-semibold">Ожидалось:</span>
                            <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs">{item.output || '—'}</pre>
                          </div>
                          {result && (
                            <>
                              <div>
                                <span className="font-semibold">Вывод:</span>
                                <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs">{normalizeOutput(result.output) || '—'}</pre>
                              </div>
                              {result.error && <div className="text-red-600 mt-1">{result.error}</div>}
                              {!result.error && result.passed === false && result.failReason === 'mismatch' && (
                                <div className="text-red-600 mt-1">Вывод отличается от ожидаемого из-за скрытых символов/форматирования.</div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-1 rounded-2xl border border-purple-200/80 bg-gradient-to-r from-violet-100/95 via-fuchsia-100/90 to-purple-100/95 px-3 py-3 md:py-3.5 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <div className="text-xs sm:text-sm text-gray-500">
            Прогресс темы: <span className="font-semibold text-purple-700">{currentMastery}%</span>
            <span className="text-gray-400"> • {currentIndex + 1}/{questions.length}</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">Закрыть</Button>
            <Button onClick={handleNext} className="w-full sm:w-auto">
              {currentIndex >= questions.length - 1 ? 'Готово' : 'Дальше'}
            </Button>
          </div>
        </div>
      </div>
      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 modal-backdrop flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={expandedImage.url}
              alt={expandedImage.name || 'Скриншот'}
              className="w-full h-full object-contain rounded-2xl shadow-2xl"
              style={{ maxHeight: '95vh' }}
            />
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white"
              type="button"
              aria-label="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

const PythonReviewModal = ({ task, onClose, studentId, testDb }) => {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedCodeById, setSolvedCodeById] = useState({});
  const [showTheory, setShowTheory] = useState(true);
  const [questionCodeById, setQuestionCodeById] = useState({});
  const [questionCodeLoadingById, setQuestionCodeLoadingById] = useState({});
  const [questionCodeErrorById, setQuestionCodeErrorById] = useState({});

  const getQuestionCodeEntry = (questionId) => {
    const key = String(questionId ?? '').trim();
    const cached = questionCodeById?.[key];
    if (!cached || typeof cached !== 'object') {
      return { code: '', input: '', updatedAt: '', loaded: false };
    }
    return {
      code: typeof cached.code === 'string' ? cached.code : '',
      input: typeof cached.input === 'string' ? cached.input : '',
      updatedAt: typeof cached.updatedAt === 'string' ? cached.updatedAt : '',
      loaded: Boolean(cached.loaded),
    };
  };

  const setQuestionCodeEntry = (questionId, patch) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeById((prev) => {
      const current = prev?.[key] && typeof prev[key] === 'object'
        ? prev[key]
        : { code: '', input: '', updatedAt: '', loaded: false };
      return {
        ...(prev || {}),
        [key]: {
          ...current,
          ...(patch || {}),
          loaded: true,
        },
      };
    });
  };

  const setQuestionCodeError = (questionId, message) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => ({ ...(prev || {}), [key]: message || '' }));
  };

  const loadQuestionCode = async (questionId, force = false) => {
    if (!studentId || !task?.number) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    if (questionCodeLoadingById?.[key]) return;
    const cached = getQuestionCodeEntry(key);
    if (cached.loaded && !force) return;
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, task.number, PYTHON_LEVEL_ID, key);
      setQuestionCodeEntry(key, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setQuestionCodeErrorById((prev) => {
        if (!prev?.[key]) return prev;
        const next = { ...(prev || {}) };
        delete next[key];
        return next;
      });
    } catch (err) {
      setQuestionCodeError(key, err?.message || err);
    } finally {
      setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: false }));
    }
  };

  useEffect(() => {
    const qs = testDb?.[task.number]?.[PYTHON_LEVEL_ID] || [];
    setQuestions(Array.isArray(qs) ? qs : []);
    setCurrentIndex(0);
    setSolvedIds(new Set());
    setSolvedCodeById({});
    setQuestionCodeById({});
    setQuestionCodeLoadingById({});
    setQuestionCodeErrorById({});
    if (studentId) {
      api.getSolvedQuestions(studentId, task.number, PYTHON_LEVEL_ID, { includeCode: true })
        .then((payload) => {
          if (Array.isArray(payload)) {
            setSolvedIds(new Set(payload.map((id) => String(id))));
            setSolvedCodeById({});
          } else {
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            const codeById = payload?.codeById && typeof payload.codeById === 'object' ? payload.codeById : {};
            setSolvedIds(new Set(ids.map((id) => String(id))));
            setSolvedCodeById(codeById);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [task?.number, testDb, studentId]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  useEffect(() => {
    if (!studentId || !task?.number) return;
    const current = questions[currentIndex];
    const currentId = String(current?.id ?? currentIndex).trim();
    if (!currentId) return;
    loadQuestionCode(currentId);
  }, [studentId, task?.number, questions, currentIndex]);

  if (!task) return null;
  const testsLoading = testDb === null || typeof testDb === 'undefined';

  if (testsLoading) {
    const loadingModal = (
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <div className="mx-auto inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700">
            <RefreshCcw size={14} className="animate-spin" />
            Загрузка заданий...
          </div>
          <p className="text-gray-500 mt-3 text-sm">Подождите немного, загружаем задания и тесты.</p>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(loadingModal, document.body) : null;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    const emptyModal = (
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <h2 className="text-2xl font-bold text-gray-900">Заданий пока нет</h2>
          <p className="text-gray-500 mt-2">Для этой темы нет задач.</p>
          <div className="mt-6">
            <Button onClick={onClose}>Закрыть</Button>
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(emptyModal, document.body) : null;
  }

  const currentQuestion = questions[currentIndex];
  const currentId = String(currentQuestion?.id ?? currentIndex);
  const isSolved = solvedIds.has(currentId);
  const questionCodeEntry = getQuestionCodeEntry(currentId);
  const fallbackSolvedCode = typeof solvedCodeById?.[currentId] === 'string' ? solvedCodeById[currentId] : '';
  const code = questionCodeEntry.code || fallbackSolvedCode;
  const questionCodeLoading = Boolean(questionCodeLoadingById?.[currentId]);
  const questionCodeError = questionCodeErrorById?.[currentId] || '';
  const updatedAtLabel = questionCodeEntry.updatedAt
    ? new Date(questionCodeEntry.updatedAt).toLocaleString('ru-RU')
    : '';
  const theory = testDb?.[task.number]?.pythonTheory || null;
  const theoryFullUrl = theory?.type === 'gdoc' ? buildGoogleDocFullUrl(theory.content) : '';
  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
    readOnly: true
  };

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="surface-card modal-card rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Тема</div>
              <div className="text-lg font-bold text-gray-900">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          </div>

          <div className="flex flex-wrap gap-2">
            {questions.map((q, idx) => {
              const qId = String(q?.id ?? idx);
              const solved = solvedIds.has(qId);
              const isCurrent = idx === currentIndex;
              let btnClass = "w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

              if (isCurrent && solved) {
                btnClass += "border-green-400 ring-2 ring-green-100 bg-green-100 text-green-700";
              } else if (isCurrent) {
                btnClass += "border-purple-600 ring-2 ring-purple-200 text-purple-600 bg-white";
              } else if (solved) {
                btnClass += "border-green-200 bg-green-100 text-green-600";
              } else {
                btnClass += "border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700";
              }

              return (
                <button
                  key={qId}
                  onClick={() => setCurrentIndex(idx)}
                  className={btnClass}
                  title={solved ? 'Решено' : 'Не решено'}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {theory?.content && (
            <div className="mb-6 rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Теория</div>
                <div className="flex items-center gap-3">
                  {theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-600 hover:text-purple-700"
                    >
                      Открыть полностью
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    {showTheory ? 'Свернуть' : 'Показать'}
                  </button>
                </div>
              </div>
              {showTheory && (
                theory.type === 'gdoc' ? (
                  isGoogleDocEmbedUrl(theory.content) ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-purple-100 bg-white">
                      <iframe
                        title={`theory-review-${task.number}`}
                        src={theory.content}
                        className="w-full h-[300px]"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-red-500">
                      Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                    </div>
                  )
                ) : (
                  <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                    {theory.content}
                  </div>
                )
              )}
            </div>
          )}
          {currentQuestion?.question && (
            <p className="text-lg font-medium text-gray-900 mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
          )}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-gray-400 uppercase">Код ученика</div>
              <div className="text-xs text-gray-500">
                {updatedAtLabel ? `Сохранено: ${updatedAtLabel}` : (fallbackSolvedCode ? 'Код из решения' : 'Код не сохранён')}
              </div>
            </div>
            {questionCodeLoading ? (
              <div className="text-sm text-gray-500">Загрузка кода...</div>
            ) : (
              <div className="rounded-2xl overflow-hidden border border-gray-800">
                <Editor
                  height="280px"
                  language="python"
                  theme="vs-dark"
                  value={code || '# Решение еще не сохранено'}
                  options={editorOptions}
                  loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                />
              </div>
            )}
            <div className="rounded-xl border p-2 bg-gray-50">
              <div className="text-xs font-semibold text-gray-600 mb-2">Ввод (stdin)</div>
              <pre className="text-xs bg-white border rounded-lg p-2 overflow-auto max-h-[140px] whitespace-pre-wrap break-words text-gray-800">{questionCodeEntry.input || '—'}</pre>
            </div>
            {questionCodeError && <div className="text-xs text-red-500">{questionCodeError}</div>}
          </div>
          {!isSolved && (
            <div className="mt-3 text-sm text-gray-500">Ученик еще не решил эту задачу.</div>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Решено: {Array.from(solvedIds).length}/{questions.length}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            <Button onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1))} disabled={currentIndex >= questions.length - 1}>
              Дальше
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

const ProgressReviewModal = ({ task, onClose, studentId, testDb }) => {
  const levelOptions = Object.values(LEVELS);
  const [levelId, setLevelId] = useState(levelOptions[0]?.id || 'basic');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [answerById, setAnswerById] = useState({});
  const [questionCodeById, setQuestionCodeById] = useState({});
  const [questionCodeLoadingById, setQuestionCodeLoadingById] = useState({});
  const [questionCodeErrorById, setQuestionCodeErrorById] = useState({});

  const getQuestionCodeEntry = (questionId) => {
    const key = String(questionId ?? '').trim();
    const cached = questionCodeById?.[key];
    if (!cached || typeof cached !== 'object') {
      return { code: '', input: '', updatedAt: '', loaded: false };
    }
    return {
      code: typeof cached.code === 'string' ? cached.code : '',
      input: typeof cached.input === 'string' ? cached.input : '',
      updatedAt: typeof cached.updatedAt === 'string' ? cached.updatedAt : '',
      loaded: Boolean(cached.loaded),
    };
  };

  const setQuestionCodeEntry = (questionId, patch) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeById((prev) => {
      const current = prev?.[key] && typeof prev[key] === 'object'
        ? prev[key]
        : { code: '', input: '', updatedAt: '', loaded: false };
      return {
        ...(prev || {}),
        [key]: {
          ...current,
          ...(patch || {}),
          loaded: true,
        },
      };
    });
  };

  const setQuestionCodeError = (questionId, message) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => ({ ...(prev || {}), [key]: message || '' }));
  };

  const loadQuestionCode = async (questionId, force = false) => {
    if (!studentId || !task?.number || !levelId) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    if (questionCodeLoadingById?.[key]) return;
    const cached = getQuestionCodeEntry(key);
    if (cached.loaded && !force) return;
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, task.number, levelId, key);
      setQuestionCodeEntry(key, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setQuestionCodeErrorById((prev) => {
        if (!prev?.[key]) return prev;
        const next = { ...(prev || {}) };
        delete next[key];
        return next;
      });
    } catch (err) {
      setQuestionCodeError(key, err?.message || err);
    } finally {
      setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: false }));
    }
  };

  useEffect(() => {
    if (!task) return;
    const available = levelOptions.filter((lvl) => {
      const list = testDb?.[task.number]?.[lvl.id];
      return Array.isArray(list) && list.length > 0;
    });
    const nextLevel = available[0]?.id || levelOptions[0]?.id || 'basic';
    setLevelId(nextLevel);
  }, [task?.number, testDb]);

  useEffect(() => {
    if (!task || !levelId) return;
    const qs = testDb?.[task.number]?.[levelId] || [];
    setQuestions(Array.isArray(qs) ? qs : []);
    setCurrentIndex(0);
    setSolvedIds(new Set());
    setAnswerById({});
    setQuestionCodeById({});
    setQuestionCodeLoadingById({});
    setQuestionCodeErrorById({});
    if (studentId) {
      api.getSolvedQuestions(studentId, task.number, levelId, { includeCode: true })
        .then((payload) => {
          if (Array.isArray(payload)) {
            setSolvedIds(new Set(payload.map((id) => String(id))));
            setAnswerById({});
          } else {
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            const codeById = payload?.codeById && typeof payload.codeById === 'object' ? payload.codeById : {};
            setSolvedIds(new Set(ids.map((id) => String(id))));
            setAnswerById(codeById);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [task?.number, levelId, testDb, studentId]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  useEffect(() => {
    if (!studentId || !task?.number || !levelId) return;
    const current = questions[currentIndex];
    const currentId = String(current?.id ?? currentIndex).trim();
    if (!currentId) return;
    loadQuestionCode(currentId);
  }, [studentId, task?.number, levelId, questions, currentIndex]);

  if (!task) return null;

  const parseStoredAnswers = (raw) => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((val) => String(val ?? ''));
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.answers)) return parsed.answers.map((val) => String(val ?? ''));
          if (typeof parsed.answer === 'string') return [parsed.answer];
        }
      } catch {}
    }
    return [trimmed];
  };

  const buildAnswerLabels = (count) => {
    if (Number(task?.number) === GAME_THEORY_TASK && count === 4) {
      return ['19', '20.1', '20.2', '21'];
    }
    return Array.from({ length: count }, (_, idx) => String(idx + 1));
  };

  const hasQuestions = Array.isArray(questions) && questions.length > 0;
  const currentQuestion = hasQuestions ? questions[currentIndex] : null;
  const currentId = String(currentQuestion?.id ?? currentIndex);
  const isSolved = solvedIds.has(currentId);
  const answerCount = getAnswerCountForTask(task?.number);
  const answerLabels = buildAnswerLabels(answerCount);
  const storedAnswers = parseStoredAnswers(answerById?.[currentId]);
  const expectedAnswers = currentQuestion ? getExpectedAnswers(currentQuestion, answerCount) : Array.from({ length: answerCount }, () => '');
  const hasStoredAnswer = Array.isArray(storedAnswers) && storedAnswers.some((val) => String(val ?? '').trim());
  const showingCorrectFallback = !hasStoredAnswer;
  const answerValues = showingCorrectFallback
    ? expectedAnswers
    : (storedAnswers || Array.from({ length: answerCount }, () => ''));
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
  const questionCodeEntry = getQuestionCodeEntry(currentId);
  const questionCodeLoading = Boolean(questionCodeLoadingById?.[currentId]);
  const questionCodeError = questionCodeErrorById?.[currentId] || '';
  const questionCodeUpdatedAtLabel = questionCodeEntry.updatedAt
    ? new Date(questionCodeEntry.updatedAt).toLocaleString('ru-RU')
    : '';
  const codeEditorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
    readOnly: true
  };

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="surface-card modal-card rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Задание</div>
              <div className="text-lg font-bold text-gray-900">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          </div>

          <div className="flex flex-wrap gap-2">
            {levelOptions.map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                onClick={() => setLevelId(lvl.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  levelId === lvl.id
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                {lvl.label}
              </button>
            ))}
          </div>

          {hasQuestions && (
            <div className="flex flex-wrap gap-2">
              {questions.map((q, idx) => {
                const qId = String(q?.id ?? idx);
                const solved = solvedIds.has(qId);
                const isCurrent = idx === currentIndex;
                let btnClass = "w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

                if (isCurrent && solved) {
                  btnClass += "border-green-400 ring-2 ring-green-100 bg-green-100 text-green-700";
                } else if (isCurrent) {
                  btnClass += "border-purple-600 ring-2 ring-purple-200 bg-purple-600 text-white shadow-sm";
                } else if (solved) {
                  btnClass += "border-green-200 bg-green-100 text-green-600";
                } else {
                  btnClass += "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200";
                }

              return (
                  <button
                    key={qId}
                    onClick={() => setCurrentIndex(idx)}
                    className={btnClass}
                    title={solved ? 'Решено' : 'Не решено'}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {!hasQuestions && (
            <div className="text-center text-gray-500 py-10">Для этого уровня пока нет задач.</div>
          )}

          {hasQuestions && (
            <>
              {screenshots.length > 0 && (
                <div className="space-y-3 mb-6">
                  {screenshots.map((img) => (
                    <div
                      key={img.id || img.url}
                      className="border rounded-2xl overflow-hidden bg-gray-900/5"
                      style={{ maxHeight: '65vh' }}
                    >
                      <img
                        src={img.url}
                        alt={img.name || 'Скриншот'}
                        className="w-full object-contain"
                        style={{ maxHeight: '65vh' }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {extraFiles.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
                  <div className="space-y-2">
                    {extraFiles.map((file) => (
                      <a
                        key={file.id || file.url}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white/90 text-sm text-gray-700 shadow-sm hover:border-purple-300 hover:bg-purple-50"
                      >
                        <span className="truncate">{file.name}</span>
                        <Download size={16} className="text-purple-600" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {currentQuestion?.question && (
                <p className="text-lg font-medium text-gray-900 mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
              )}

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-400 uppercase">Ответ ученика</label>
                  {isSolved && <span className="text-xs font-semibold text-emerald-600">Решено</span>}
                </div>
                {answerCount > 1 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: answerCount }).map((_, idx) => (
                      <div key={`answer-${idx}`} className="space-y-1">
                        <div className="text-xs font-semibold text-gray-500">Ответ {answerLabels[idx]}</div>
                        <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                          {answerValues[idx] ? answerValues[idx] : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                    {answerValues[0] ? answerValues[0] : '—'}
                  </div>
                )}
                {!hasStoredAnswer && (
                  <div className="text-xs text-gray-500">
                    {isSolved ? 'Ответ ученика не сохранён.' : 'Ученик ещё не решил эту задачу.'}
                  </div>
                )}
                {showingCorrectFallback && (
                  <div className="text-xs text-purple-600">
                    Показан правильный ответ из базы.
                  </div>
                )}
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-400 uppercase">Код ученика</label>
                  <span className="text-xs text-gray-500">
                    {questionCodeUpdatedAtLabel ? `Сохранено: ${questionCodeUpdatedAtLabel}` : 'Код не сохранён'}
                  </span>
                </div>
                {questionCodeLoading ? (
                  <div className="text-sm text-gray-500">Загрузка кода...</div>
                ) : (
                  <div className="rounded-2xl overflow-hidden border border-gray-800">
                    <Editor
                      height="240px"
                      language="python"
                      theme="vs-dark"
                      value={questionCodeEntry.code || '# Код не сохранён'}
                      options={codeEditorOptions}
                      loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                    />
                  </div>
                )}
                <div className="rounded-xl border p-2 bg-gray-50">
                  <div className="text-xs font-semibold text-gray-600 mb-2">Ввод (stdin)</div>
                  <pre className="text-xs bg-white border rounded-lg p-2 overflow-auto max-h-[140px] whitespace-pre-wrap break-words text-gray-800">{questionCodeEntry.input || '—'}</pre>
                </div>
                {questionCodeError && <div className="text-xs text-red-500">{questionCodeError}</div>}
              </div>
            </>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Решено: {Array.from(solvedIds).length}/{questions.length}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            <Button onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, Math.max(questions.length - 1, 0)))} disabled={!hasQuestions || currentIndex >= questions.length - 1}>
              Дальше
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

const StudentTestModal = ({
  task,
  onClose,
  onComplete,
  progress,
  studentId,
  testDb,
  initialLevel,
  targetQuestions,
  onLevelSelect,
  initialQuestionIndex,
  onQuestionChange,
  onStreakSaved,
  onXpGain,
  forceInitialLevelLaunch = false
}) => {
  const [stage, setStage] = useState('select_level'); // select_level | testing
  const [level, setLevel] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { [idx]: string | { a: string, b: string } }
  const [results, setResults] = useState({}); // { [idx]: boolean }
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedAnswerById, setSolvedAnswerById] = useState({});
  const [expandedImage, setExpandedImage] = useState(null);
  const [questionCodeById, setQuestionCodeById] = useState({});
  const [questionCodeOpen, setQuestionCodeOpen] = useState(false);
  const [questionCodeLoadingById, setQuestionCodeLoadingById] = useState({});
  const [questionCodeSavingById, setQuestionCodeSavingById] = useState({});
  const [questionCodeErrorById, setQuestionCodeErrorById] = useState({});
  const [questionRunStateById, setQuestionRunStateById] = useState({});
  const autoStartRef = useRef(false);
  const [autoStartFailed, setAutoStartFailed] = useState(false);
  const questionRunnerWorkerRef = useRef(null);
  const questionRunnerPendingRef = useRef(new Map());
  const autoStartLevel = ['basic', 'advanced', 'expert'].includes(initialLevel) ? initialLevel : null;

  const currentMastery = progress[task.id] || 0;
  const selectedLevelXpReward = getTaskLevelXpReward(task?.number, level);
  const selectedLevelXpRewardLabel = selectedLevelXpReward > 0
    ? `+${selectedLevelXpReward.toLocaleString('ru-RU')} XP`
    : '';
  const activeQuestion = questions[currentIndex];
  const activeQuestionId = activeQuestion ? String(activeQuestion?.id ?? currentIndex) : '';

  const getQuestionCodeEntry = (questionId) => {
    const key = String(questionId ?? '').trim();
    const cached = questionCodeById?.[key];
    if (!cached || typeof cached !== 'object') {
      return { code: '', input: '', updatedAt: '', loaded: false };
    }
    return {
      code: typeof cached.code === 'string' ? cached.code : '',
      input: typeof cached.input === 'string' ? cached.input : '',
      updatedAt: typeof cached.updatedAt === 'string' ? cached.updatedAt : '',
      loaded: Boolean(cached.loaded),
    };
  };

  const setQuestionCodeEntry = (questionId, patch) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeById((prev) => {
      const current = prev?.[key] && typeof prev[key] === 'object'
        ? prev[key]
        : { code: '', input: '', updatedAt: '', loaded: false };
      return {
        ...(prev || {}),
        [key]: {
          ...current,
          ...(patch || {}),
          loaded: true,
        },
      };
    });
  };

  const clearQuestionCodeError = (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => {
      if (!prev?.[key]) return prev;
      const next = { ...(prev || {}) };
      delete next[key];
      return next;
    });
  };

  const setQuestionCodeError = (questionId, message) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => ({ ...(prev || {}), [key]: message || '' }));
  };

  const resolveQuestionRunnerPending = (message) => {
    questionRunnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    questionRunnerPendingRef.current.clear();
  };

  const disposeQuestionRunnerWorker = (message = '') => {
    if (questionRunnerWorkerRef.current) {
      questionRunnerWorkerRef.current.terminate();
      questionRunnerWorkerRef.current = null;
    }
    if (message) resolveQuestionRunnerPending(message);
  };

  const ensureQuestionRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (questionRunnerWorkerRef.current) return questionRunnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = questionRunnerPendingRef.current.get(data.id);
        if (!pending) return;
        const messageType = typeof data.type === 'string' ? data.type : 'result';
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
        questionRunnerPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string'
          ? data.output
          : (data.output ? String(data.output) : (pending.output || ''));
        const error = typeof data.error === 'string'
          ? data.error
          : (data.error ? String(data.error) : (pending.error || ''));
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, done: true });
        }
        pending.resolve({ output, error });
      };
      worker.onerror = () => disposeQuestionRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeQuestionRunnerWorker('Ошибка выполнения Python.');
      questionRunnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  const runQuestionCodeMainThread = async (source, inputValue) => {
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

  const runQuestionCode = async (source, inputValue, onProgress = null) => {
    const worker = ensureQuestionRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = questionRunnerPendingRef.current.get(id);
          if (!pending) return;
          questionRunnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposeQuestionRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        questionRunnerPendingRef.current.set(id, {
          resolve,
          timer,
          output: '',
          error: '',
          onProgress: typeof onProgress === 'function' ? onProgress : null,
        });
        worker.postMessage({ id, source, input: inputValue });
      });
    }
    if (!ALLOW_MAIN_THREAD_PYTHON_FALLBACK) {
      return {
        output: '',
        error: 'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.'
      };
    }
    return runQuestionCodeMainThread(source, inputValue);
  };

  const loadQuestionCode = async (questionId, force = false) => {
    if (!studentId || !task?.number || !level) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    if (questionCodeLoadingById?.[key]) return;
    const cached = getQuestionCodeEntry(key);
    if (cached.loaded && !force) return;
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, task.number, level, key);
      setQuestionCodeEntry(key, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      clearQuestionCodeError(key);
    } catch (err) {
      setQuestionCodeError(key, err?.message || err);
    } finally {
      setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: false }));
    }
  };

  const saveQuestionCode = async (questionId) => {
    if (!studentId || !task?.number || !level) return;
    const key = String(questionId ?? '').trim();
    if (!key || questionCodeSavingById?.[key]) return;
    const entry = getQuestionCodeEntry(key);
    setQuestionCodeSavingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.saveQuestionCode(studentId, task.number, level, key, {
        code: entry.code,
        input: entry.input,
      });
      setQuestionCodeEntry(key, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      clearQuestionCodeError(key);
    } catch (err) {
      setQuestionCodeError(key, err?.message || err);
    } finally {
      setQuestionCodeSavingById((prev) => ({ ...(prev || {}), [key]: false }));
    }
  };

  const runQuestionCodeForQuestion = async (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    const entry = getQuestionCodeEntry(key);
    setQuestionRunStateById((prev) => ({ ...(prev || {}), [key]: { loading: true, output: '', error: '' } }));
    try {
      const result = await runQuestionCode(entry.code || '', entry.input || '', (progress) => {
        setQuestionRunStateById((prev) => ({
          ...(prev || {}),
          [key]: {
            loading: !progress?.done,
            output: progress?.output || '',
            error: progress?.error || '',
          },
        }));
      });
      setQuestionRunStateById((prev) => ({
        ...(prev || {}),
        [key]: { loading: false, output: result?.output || '', error: result?.error || '' },
      }));
    } catch (err) {
      setQuestionRunStateById((prev) => ({
        ...(prev || {}),
        [key]: { loading: false, output: '', error: err?.message || 'Ошибка выполнения Python' },
      }));
    }
  };

  const startTest = async (lvlId, options = {}) => {
    if (!testDb) {
      if (!options?.silent) {
        alert("База тестов еще загружается. Попробуйте чуть позже.");
      }
      return false;
    }

    const qs = testDb[task.number]?.[lvlId] || [];
    
    if (qs.length === 0) {
      if (!options?.silent) {
        alert("Учитель еще не загрузил задания для этого уровня.");
      }
      return false;
    }

    setQuestions(qs);
    setLevel(lvlId);
    const wantsStoredIndex = Number.isFinite(Number(options?.initialIndex));
    const rawIndex = wantsStoredIndex ? Number(options.initialIndex) : 0;
    const safeIndex = qs.length > 0
      ? Math.max(0, Math.min(qs.length - 1, Math.floor(rawIndex)))
      : 0;
    setCurrentIndex(safeIndex);
    setUserAnswers({});
    setResults({});
    setSolvedIds(new Set());
    setSolvedAnswerById({});
    setQuestionCodeById({});
    setQuestionCodeOpen(false);
    setQuestionCodeLoadingById({});
    setQuestionCodeSavingById({});
    setQuestionCodeErrorById({});
    setQuestionRunStateById({});
    disposeQuestionRunnerWorker();
    setStage('testing');
    onLevelSelect?.(lvlId);

    if (studentId) {
      try {
        const [solvedPayload, solvedAnswersPayload] = await Promise.all([
          api.getSolvedQuestions(studentId, task.number, lvlId).catch(() => []),
          api.getSolvedAnswers(studentId, task.number, lvlId).catch(() => ({})),
        ]);
        const solvedIdsList = Array.isArray(solvedPayload) ? solvedPayload : [];
        setSolvedIds(new Set(solvedIdsList.map((id) => String(id))));
        setSolvedAnswerById(
          solvedAnswersPayload && typeof solvedAnswersPayload === 'object'
            ? solvedAnswersPayload
            : {}
        );
      } catch (err) {
        console.error(err);
      }
    }
    return true;
  };

  useEffect(() => {
    if (stage !== 'select_level') return;
    if (!autoStartLevel || autoStartRef.current || autoStartFailed) return;
    if (!testDb) return;
    let cancelled = false;
    autoStartRef.current = true;
    const forceLaunch = Boolean(forceInitialLevelLaunch && autoStartLevel);
    (async () => {
      try {
        const started = await startTest(autoStartLevel, { silent: !forceLaunch, initialIndex: initialQuestionIndex });
        if (!cancelled && !started) {
          if (forceLaunch) {
            onClose?.();
            return;
          }
          setAutoStartFailed(true);
        }
      } catch {
        if (!cancelled) {
          if (forceLaunch) {
            onClose?.();
            return;
          }
          setAutoStartFailed(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [stage, autoStartLevel, initialQuestionIndex, testDb, autoStartFailed, forceInitialLevelLaunch, onClose]);

  useEffect(() => {
    autoStartRef.current = false;
    setAutoStartFailed(false);
    setQuestionCodeOpen(false);
    setQuestionCodeById({});
    setQuestionCodeLoadingById({});
    setQuestionCodeSavingById({});
    setQuestionCodeErrorById({});
    setQuestionRunStateById({});
    setSolvedAnswerById({});
    disposeQuestionRunnerWorker();
  }, [task?.number]);

  useEffect(() => {
    if (stage !== 'testing') return;
    if (!Number.isFinite(currentIndex)) return;
    onQuestionChange?.(currentIndex);
  }, [currentIndex, stage, onQuestionChange]);

  useEffect(() => {
    if (stage !== 'testing' || !questionCodeOpen) return;
    if (!activeQuestionId) return;
    loadQuestionCode(activeQuestionId);
  }, [stage, questionCodeOpen, activeQuestionId, studentId, task?.number, level]);

  useEffect(() => () => disposeQuestionRunnerWorker('Python runner stopped.'), []);

  const normalizeAnswer = (value) => {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  const parseStoredSolvedAnswers = (raw, count) => {
    const safeCount = Number.isFinite(Number(count)) ? Math.max(1, Number(count)) : 1;
    if (typeof raw !== 'string') {
      return Array.from({ length: safeCount }, () => '');
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return Array.from({ length: safeCount }, () => '');
    }
    let values = null;
    const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) values = parsed;
        else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.answers)) values = parsed.answers;
          else if (typeof parsed.answer !== 'undefined') values = [parsed.answer];
        }
      } catch {}
    }
    if (!Array.isArray(values)) values = [trimmed];
    return Array.from({ length: safeCount }, (_, index) => String(values[index] ?? ''));
  };

  const handleCheck = async (sourceRect = null) => {
    const currentQuestion = questions[currentIndex];
    const currentId = String(currentQuestion?.id ?? currentIndex);
    const answerCount = getAnswerCountForTask(task?.number);
    let fallbackCorrect = false;
    let answerPayload = null;
    if (answerCount > 1) {
      const answerEntry = Array.isArray(userAnswers[currentIndex]) ? userAnswers[currentIndex] : [];
      const provided = Array.from({ length: answerCount }, (_, i) => String(answerEntry[i] ?? ''));
      const allowPartial = allowsPartialAnswers(task?.number);
      if (!allowPartial && provided.some((val) => !val.trim())) return;
      if (allowPartial && provided.every((val) => !val.trim())) return;
      const trimmedProvided = provided.map((val) => String(val ?? '').trim());
      if (trimmedProvided.some((val) => val)) {
        answerPayload = JSON.stringify({ answers: trimmedProvided });
      }
      if (!studentId) {
        const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
        fallbackCorrect = expectedAnswers.every((exp, i) => {
          const expectedNorm = normalizeAnswer(exp);
          const providedNorm = normalizeAnswer(provided[i]);
          if (!expectedNorm) return !providedNorm;
          return providedNorm === expectedNorm;
        });
      }
    } else {
      const answerValue = userAnswers[currentIndex];
      if (!String(answerValue ?? '').trim()) return;
      answerPayload = String(answerValue ?? '').trim();
      if (!studentId) {
        const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
        fallbackCorrect = normalizeAnswer(answerValue) === normalizeAnswer(expectedAnswers[0]);
      }
    }

    let correct = false;
    let serverProgressApplied = false;
    const levelConfig = Object.values(LEVELS).find(l => l.id === level);
    if (studentId) {
      try {
        const resp = await api.solveQuestion({
          studentId,
          taskNumber: task.number,
          levelId: level,
          questionId: currentQuestion.id,
          ...(answerPayload ? { code: answerPayload } : {}),
          localDay: getLocalDayKey(),
        });
        correct = true;
        setSolvedIds((prev) => {
          const next = new Set(prev);
          next.add(String(currentQuestion.id));
          return next;
        });
        try {
          const solvedAnswersPayload = await api.getSolvedAnswers(studentId, task.number, level);
          if (solvedAnswersPayload && typeof solvedAnswersPayload === 'object') {
            setSolvedAnswerById((prev) => ({
              ...(prev || {}),
              ...solvedAnswersPayload,
            }));
          }
        } catch {}
        if (typeof onStreakSaved === 'function') {
          if (resp?.streak) {
            onStreakSaved(resp.streak);
          } else {
            api.getStudentData(studentId)
              .then((data) => {
                if (data?.streak) onStreakSaved(data.streak);
              })
              .catch(() => {});
          }
        }
        if (typeof onXpGain === 'function' && Number.isFinite(Number(resp?.xpTotal))) {
          onXpGain({
            xpTotal: normalizeXpTotal(resp.xpTotal),
            xpGained: normalizeXpTotal(resp?.xpGained),
            sourceRect: sourceRect && Number.isFinite(sourceRect.left) && Number.isFinite(sourceRect.top)
              ? sourceRect
              : null,
          });
        }
        if (typeof resp?.taskProgress === 'number') {
          onComplete(task.id, resp.taskProgress, { skipServer: true });
          serverProgressApplied = true;
        }
      } catch (err) {
        const message = String(err?.message || err || '');
        if (message !== 'Ответ неверный') {
          console.error(err);
          alert(message || 'Не удалось проверить ответ');
          return;
        }
      }
    } else {
      correct = fallbackCorrect;
    }
    setResults((prev) => ({ ...prev, [currentIndex]: correct }));
    
    // Если ответ верный, обновляем прогресс
    if (correct) {
      if (serverProgressApplied) return;
      const weight = LEVEL_WEIGHTS[level] ?? levelConfig?.maxScore ?? 100;
      const totalCount = questions.length;
      if (Number.isFinite(weight) && totalCount > 0) {
        const prevSolved = solvedIds.size;
        const nextSolved = solvedIds.has(String(currentQuestion.id)) ? prevSolved : prevSolved + 1;
        const prevContribution = (prevSolved / totalCount) * weight;
        const nextContribution = (nextSolved / totalCount) * weight;
        const nextProgress = Math.round(Math.max(0, currentMastery - prevContribution + nextContribution));
        onComplete(task.id, Math.min(100, nextProgress), { skipServer: true });
      } else if (levelConfig?.maxScore > currentMastery) {
        onComplete(task.id, levelConfig.maxScore, { skipServer: true });
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
    else onClose();
  };


  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  if (stage === 'select_level') {
    if (autoStartLevel && !autoStartFailed) {
      const waitingTests = testDb === null || typeof testDb === 'undefined';
      const loadingModal = (
        <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-start justify-center p-4 md:p-8 overflow-y-auto">
          <div className="surface-card modal-card rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative text-center">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
            <div className="mx-auto inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700">
              <RefreshCcw size={14} className="animate-spin" />
              {waitingTests ? 'Загрузка заданий...' : 'Открываем задания...'}
            </div>
            <p className="text-gray-500 mt-3 text-sm">
              {waitingTests
                ? 'Подождите немного, загружаем тесты для этого задания.'
                : 'Подготавливаем выбранный уровень.'}
            </p>
          </div>
        </div>
      );
      return typeof document !== 'undefined' ? createPortal(loadingModal, document.body) : null;
    }

    const modal = (
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-start justify-center p-4 md:p-8 overflow-y-auto">
        <div className="surface-card modal-card rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Выберите уровень сложности</h2>
            <p className="text-gray-500">Задание №{getTaskDisplayNumber(task)}: {task.title}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.values(LEVELS).map((lvl) => {
              const isCompleted = currentMastery >= lvl.maxScore;
              const levelXpReward = getTaskLevelXpReward(task?.number, lvl.id);
              const levelXpRewardLabel = levelXpReward > 0
                ? `+${levelXpReward.toLocaleString('ru-RU')} XP`
                : '';

              return (
                <div 
                  key={lvl.id}
                  onClick={() => {
                    const shouldRestoreIndex = initialLevel && initialLevel === lvl.id;
                    startTest(lvl.id, shouldRestoreIndex ? { initialIndex: initialQuestionIndex } : {});
                  }}
                  className={`border-2 rounded-2xl p-5 flex flex-col justify-between cursor-pointer transition-all hover:scale-105 ${isCompleted ? 'border-green-200 bg-green-50 opacity-80' : 'hover:shadow-lg bg-white'} ${lvl.color.replace('bg-', 'border-')}`}
                >
                  <div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${lvl.color}`}>
                      {isCompleted ? <Check size={20} /> : <PlayCircle size={20} />}
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">{lvl.label}</h3>
                    <p className="text-xs text-gray-500">
                      {lvl.id === 'basic' && "Прототипы с реальных ЕГЭ и Демоверсий."}
                      {lvl.id === 'advanced' && "Усложненные условия."}
                      {lvl.id === 'expert' && "Статград и сложнее."}
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-gray-700">до {lvl.maxScore}%</span>
                    {levelXpReward > 0 && (
                      <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                        {levelXpRewardLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
  }

  if (stage === 'testing' && questions.length > 0) {
    const currentQuestion = questions[currentIndex];
    const isChecked = results[currentIndex] !== undefined;
    const isCorrect = results[currentIndex];
    const answerCount = getAnswerCountForTask(task?.number);
    const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
    const currentId = String(currentQuestion?.id ?? currentIndex);
    const isSolved = solvedIds.has(currentId);
    const solvedStoredAnswers = parseStoredSolvedAnswers(solvedAnswerById?.[currentId], answerCount);
    const solvedAnswerValues = Array.from({ length: answerCount }, (_, index) => {
      const expected = String(expectedAnswers[index] ?? '');
      if (expected.trim()) return expected;
      return String(solvedStoredAnswers[index] ?? '');
    });
    const storedAnswer = userAnswers[currentIndex];
    const answerValue = answerCount === 1
      ? (isSolved ? String(solvedAnswerValues[0] ?? '') : String(storedAnswer ?? ''))
      : '';
    const answerValues = answerCount > 1
      ? (
        isSolved
          ? solvedAnswerValues.map((val) => String(val ?? ''))
          : Array.from({ length: answerCount }, (_, i) => String((Array.isArray(storedAnswer) ? storedAnswer[i] : '') ?? ''))
      )
      : [];
    const answerLabels = Number(task?.number) === GAME_THEORY_TASK && answerCount === 4
      ? ['19', '20.1', '20.2', '21']
      : Array.from({ length: answerCount }, (_, idx) => String(idx + 1));
    const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
      .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
    const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
      .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
    const isAnswerReady = isSolved
      ? true
      : (
        answerCount > 1
          ? (allowsPartialAnswers(task?.number)
              ? answerValues.some((val) => String(val ?? '').trim())
              : answerValues.every((val) => String(val ?? '').trim()))
          : Boolean(answerValue.trim())
      );
    const computedChecked = isSolved || isChecked;
    const computedCorrect = isSolved ? true : isCorrect;
    const rawTargets = Array.isArray(targetQuestions) ? targetQuestions : [];
    const targetNumbers = Array.from(new Set(
      rawTargets
        .map((val) => Number(val))
        .filter((val) => Number.isFinite(val) && val > 0)
    ));
    const targetStatus = targetNumbers.map((num) => {
      const question = questions[num - 1];
      const qId = question?.id;
      const solved = qId ? solvedIds.has(String(qId)) : false;
      return { num, solved };
    });
    const targetSolvedCount = targetStatus.filter((item) => item.solved).length;
    const questionCodeEntry = getQuestionCodeEntry(currentId);
    const questionCodeLoading = Boolean(questionCodeLoadingById?.[currentId]);
    const questionCodeSaving = Boolean(questionCodeSavingById?.[currentId]);
    const questionCodeError = questionCodeErrorById?.[currentId] || '';
    const questionRunState = questionRunStateById?.[currentId] || { loading: false, output: '', error: '' };
    const questionIdleConsoleText = buildIdleConsoleText(
      questionCodeEntry.input,
      questionRunState.output,
      questionRunState.error
    );
    const questionCodeUpdatedAtLabel = questionCodeEntry.updatedAt
      ? new Date(questionCodeEntry.updatedAt).toLocaleString('ru-RU')
      : '';
    const isMobileViewport = typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false;
    const questionCodeEditorHeight = isMobileViewport ? '180px' : '240px';

    const modal = (
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4">
        <div className="surface-card modal-card rounded-2xl md:rounded-3xl w-full max-w-5xl max-h-[90vh] p-3.5 sm:p-4 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
          {/* Header & Navigation */}
          <div className="flex flex-col gap-3 md:gap-4 mb-3 md:mb-4">
            <div className="flex justify-between items-start">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg text-[11px] md:text-xs font-bold uppercase ${LEVELS[level.toUpperCase()].color}`}>
                  {LEVELS[level.toUpperCase()].label}
                </span>
                {selectedLevelXpReward > 0 && (
                  <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] md:text-[11px] font-bold text-purple-700">
                    {selectedLevelXpRewardLabel}
                  </span>
                )}
              </div>
              <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={18}/></button>
            </div>
            {targetStatus.length > 0 && (
              <div className="rounded-2xl border border-purple-100 bg-purple-50 px-3 py-2.5 md:px-4 md:py-3 text-xs text-purple-700">
                <div className="font-semibold">Цель: решить отмеченные задания</div>
                <div className="mt-1 text-[11px] md:hidden">
                  Выполнено {targetSolvedCount}/{targetStatus.length}
                </div>
                <div className="hidden md:flex flex-wrap gap-2 mt-2">
                  {targetStatus.map((item) => (
                    <span
                      key={item.num}
                      className={`px-2 py-1 rounded-lg border text-xs font-semibold ${
                        item.solved
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                          : 'border-purple-200 bg-white text-purple-700'
                      }`}
                    >
                      №{item.num}{item.solved ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
                <div className="hidden md:block mt-2 text-[11px] text-purple-600">
                  Выполнено {targetSolvedCount}/{targetStatus.length}
                </div>
              </div>
            )}
            
            {/* Question Navigation Bar */}
          <div className="flex gap-2 overflow-x-auto pb-1 pr-1">
            {questions.map((q, idx) => {
              const qId = String(q?.id ?? idx);
              const solved = solvedIds.has(qId);
              const status = results[idx]; // true, false or undefined
              const isCurrent = idx === currentIndex;
              let btnClass = "shrink-0 w-9 h-9 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

              if (isCurrent && (solved || status === true)) {
                btnClass += "border-green-400 ring-2 ring-green-100 bg-green-100 text-green-700";
              } else if (isCurrent && status === false) {
                btnClass += "border-red-400 ring-2 ring-red-100 bg-red-100 text-red-700";
              } else if (isCurrent) {
                btnClass += "border-purple-600 ring-2 ring-purple-200 bg-white text-purple-600";
              } else if (solved || status === true) {
                btnClass += "border-green-200 bg-green-100 text-green-600";
              } else if (status === false) {
                btnClass += "border-red-200 bg-red-100 text-red-600";
              } else {
                btnClass += "border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700";
              }

              return (
                <button 
                  key={qId} 
                  onClick={() => setCurrentIndex(idx)}
                  className={btnClass}
                  title={solved ? 'Решено' : undefined}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-0 md:pr-1">
            {screenshots.length > 0 && (
              <div className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
                {screenshots.map((img) => (
                  <div
                    key={img.id || img.url}
                    className="border rounded-2xl overflow-hidden bg-gray-900/5 max-h-[42vh] sm:max-h-[55vh] md:max-h-[65vh]"
                  >
                    <img
                      src={img.url}
                      alt={img.name || 'Скриншот'}
                      className="w-full object-contain cursor-zoom-in"
                      style={{ maxHeight: isMobileViewport ? '42vh' : '65vh' }}
                      onClick={() => setExpandedImage(img)}
                    />
                  </div>
                ))}
              </div>
            )}

            {extraFiles.length > 0 && (
              <div className="mb-5 md:mb-6">
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
                <div className="space-y-2">
                  {extraFiles.map((file) => (
                    <a
                      key={file.id || file.url}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                    >
                      <span className="truncate">{file.name}</span>
                      <Download size={16} className="text-purple-600" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {isSolved && (
              <div className="mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Решено ранее</div>
            )}
            {currentQuestion.question && (
              <p className="text-[15px] md:text-lg font-medium leading-relaxed text-gray-900 mb-5 md:mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
            )}

            <div className="space-y-3 mb-5 md:mb-6">
              <label className="block text-xs font-bold text-gray-400 uppercase">
                {isSolved ? 'Правильный ответ' : 'Ответ'}
              </label>
              {isSolved ? (
                answerCount > 1 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: answerCount }).map((_, idx) => (
                      <div key={`solved-answer-${idx}`} className="space-y-1">
                        <div className="text-xs font-semibold text-gray-500">Ответ {answerLabels[idx]}</div>
                        <div className="w-full px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-gray-800">
                          {answerValues[idx] ? answerValues[idx] : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-full px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-gray-800">
                    {answerValue ? answerValue : '—'}
                  </div>
                )
              ) : (
                answerCount > 1 ? (
                  Number(task?.number) === GAME_THEORY_TASK ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">19</label>
                        <input
                          type="text"
                          value={answerValues[0] ?? ''}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex])
                                ? [...next[currentIndex]]
                                : Array.from({ length: answerCount }, () => '');
                              current[0] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder="Ответ 19"
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.1</label>
                          <input
                            type="text"
                            value={answerValues[1] ?? ''}
                            onChange={(e) => {
                              if (computedChecked) return;
                              const value = e.target.value;
                              setUserAnswers((prev) => {
                                const next = { ...prev };
                                const current = Array.isArray(next[currentIndex])
                                  ? [...next[currentIndex]]
                                  : Array.from({ length: answerCount }, () => '');
                                current[1] = value;
                                next[currentIndex] = current;
                                return next;
                              });
                            }}
                            placeholder="Ответ 20.1"
                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                            disabled={computedChecked}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.2</label>
                          <input
                            type="text"
                            value={answerValues[2] ?? ''}
                            onChange={(e) => {
                              if (computedChecked) return;
                              const value = e.target.value;
                              setUserAnswers((prev) => {
                                const next = { ...prev };
                                const current = Array.isArray(next[currentIndex])
                                  ? [...next[currentIndex]]
                                  : Array.from({ length: answerCount }, () => '');
                                current[2] = value;
                                next[currentIndex] = current;
                                return next;
                              });
                            }}
                            placeholder="Ответ 20.2"
                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                            disabled={computedChecked}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">21</label>
                        <input
                          type="text"
                          value={answerValues[3] ?? ''}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex])
                                ? [...next[currentIndex]]
                                : Array.from({ length: answerCount }, () => '');
                              current[3] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder="Ответ 21"
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      </div>
                    </div>
                  ) : answerCount === 20 ? (
                    <div className="grid grid-cols-[26px_1fr_1fr] md:grid-cols-[32px_1fr_1fr] gap-1.5 md:gap-2">
                      {Array.from({ length: 10 }).map((_, rowIdx) => {
                        const leftIdx = rowIdx;
                        const rightIdx = rowIdx + 10;
                        return (
                          <React.Fragment key={rowIdx}>
                            <div className="flex items-center justify-center text-xs font-bold text-gray-500">
                              {rowIdx + 1}
                            </div>
                            <input
                              type="text"
                              value={answerValues[leftIdx] ?? ''}
                              onChange={(e) => {
                                if (computedChecked) return;
                                const value = e.target.value;
                                setUserAnswers((prev) => {
                                  const next = { ...prev };
                                  const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                                  current[leftIdx] = value;
                                  next[currentIndex] = current;
                                  return next;
                                });
                              }}
                              placeholder="Ответ 1"
                              className="w-full px-2.5 md:px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                              disabled={computedChecked}
                            />
                            <input
                              type="text"
                              value={answerValues[rightIdx] ?? ''}
                              onChange={(e) => {
                                if (computedChecked) return;
                                const value = e.target.value;
                                setUserAnswers((prev) => {
                                  const next = { ...prev };
                                  const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                                  current[rightIdx] = value;
                                  next[currentIndex] = current;
                                  return next;
                                });
                              }}
                              placeholder="Ответ 2"
                              className="w-full px-2.5 md:px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                              disabled={computedChecked}
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Array.from({ length: answerCount }).map((_, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={answerValues[idx] ?? ''}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                              current[idx] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder={`Ответ ${idx + 1}`}
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <input
                    type="text"
                    value={answerValue}
                    onChange={(e) => {
                      if (computedChecked) return;
                      setUserAnswers({ ...userAnswers, [currentIndex]: e.target.value });
                    }}
                    placeholder="Введите ответ..."
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                    disabled={computedChecked}
                  />
                )
              )}
            {computedChecked && (
              <div className={`text-sm ${computedCorrect ? 'text-green-600' : 'text-red-600'}`}>
                {computedCorrect ? 'Верно!' : 'Неверно'}
              </div>
            )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-3 mb-5 md:mb-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-gray-500 uppercase">
                  Код решения для задания {currentIndex + 1}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !questionCodeOpen;
                    setQuestionCodeOpen(nextOpen);
                    if (nextOpen && currentId) {
                      loadQuestionCode(currentId);
                    }
                  }}
                  className="text-xs text-purple-600 hover:text-purple-700 font-semibold"
                >
                  {questionCodeOpen ? 'Скрыть код' : 'Открыть код'}
                </button>
              </div>

              {questionCodeOpen && (
                questionCodeLoading ? (
                  <div className="text-sm text-gray-500">Загрузка кода...</div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-xs text-gray-500">
                        {questionCodeUpdatedAtLabel ? `Сохранено: ${questionCodeUpdatedAtLabel}` : 'Код ещё не сохранён'}
                      </div>
                      <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => runQuestionCodeForQuestion(currentId)}
                          disabled={questionRunState.loading}
                          className="w-full sm:w-auto"
                        >
                          {questionRunState.loading ? 'Запуск...' : 'Запустить'}
                        </Button>
                        <Button
                          onClick={() => saveQuestionCode(currentId)}
                          disabled={questionCodeSaving || !studentId}
                          className="w-full sm:w-auto"
                        >
                          {questionCodeSaving ? 'Сохранение...' : 'Сохранить код'}
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-gray-800">
                      <Editor
                        height={questionCodeEditorHeight}
                        language="python"
                        theme="vs-dark"
                        value={questionCodeEntry.code}
                        onChange={(value) => {
                          setQuestionCodeEntry(currentId, { code: value ?? '' });
                          clearQuestionCodeError(currentId);
                        }}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          tabSize: 4,
                          insertSpaces: true,
                          wordWrap: 'on',
                          automaticLayout: true,
                        }}
                        loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                      />
                    </div>
                    <div className="rounded-xl border p-2 bg-gray-50 space-y-2">
                      <div className="text-xs font-semibold text-gray-600">
                        Консоль (IDLE): редактируйте секцию `{PY_IDLE_STDIN_HEADER}`
                      </div>
                      <textarea
                        value={questionIdleConsoleText}
                        onChange={(e) => {
                          setQuestionCodeEntry(currentId, {
                            input: parseIdleConsoleInput(e.target.value, questionCodeEntry.input),
                          });
                          clearQuestionCodeError(currentId);
                        }}
                        readOnly={questionRunState.loading}
                        spellCheck={false}
                        className="w-full min-h-[220px] text-xs font-mono leading-5 px-3 py-2 rounded-lg border border-gray-200 bg-white outline-none focus:border-purple-500 resize-y"
                      />
                    </div>
                    {questionCodeError && <div className="text-xs text-red-500">{questionCodeError}</div>}
                  </>
                )
              )}
            </div>
          </div>

          <div className="pt-3 md:pt-4 bg-transparent pb-[calc(env(safe-area-inset-bottom)+0.25rem)]">
            <Button 
              onClick={(event) => {
                if (!computedChecked) {
                  const rect = event?.currentTarget?.getBoundingClientRect?.();
                  handleCheck(rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)
                    ? {
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                      }
                    : null);
                  return;
                }
                if (!computedCorrect) {
                  setResults((prev) => {
                    const next = { ...prev };
                    delete next[currentIndex];
                    return next;
                  });
                  return;
                }
                handleNext();
              }} 
              disabled={!computedChecked && !isAnswerReady} 
              className="w-full"
              variant={computedChecked ? (computedCorrect ? 'success' : 'danger') : 'primary'}
            >
              {!computedChecked ? 'Проверить' : (
                currentIndex < questions.length - 1 
                  ? (computedCorrect ? 'Верно! Следующий вопрос' : 'Попробовать снова')
                  : 'Закрыть'
              )}
            </Button>
          </div>
        </div>
        {expandedImage && (
          <div
            className="fixed inset-0 z-[60] bg-black/80 modal-backdrop flex items-center justify-center p-4"
            onClick={() => setExpandedImage(null)}
          >
            <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
              <img
                src={expandedImage.url}
                alt={expandedImage.name || 'Скриншот'}
                className="w-full h-full object-contain rounded-2xl shadow-2xl"
                style={{ maxHeight: '95vh' }}
              />
              <button
                onClick={() => setExpandedImage(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white"
                type="button"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
  }
  
  return null;
};

/**
 * PAGE COMPONENTS (Updated Login & Progress)
 */

const LoginPage = ({ onLogin }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const user = await api.login(code.trim());
      onLogin(user);
    } catch (err) { setError(err?.message || err); } 
    finally { setLoading(false); }
  };

  return (
    <div className="app-min-h app-shell relative overflow-hidden flex items-center justify-center p-4 font-sans">
      <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-purple-200/40 blur-3xl" />
      <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="relative max-w-md w-full surface-card rounded-4xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-purple-100 text-purple-700 font-display text-lg font-bold tracking-tight mx-auto mb-4 floating md:hidden">
            100
          </div>
          <div className="hidden md:flex w-16 h-16 bg-purple-100 text-purple-700 rounded-2xl items-center justify-center mx-auto mb-4 floating font-display text-2xl font-bold tracking-tight">
            100
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            <span className="md:hidden"><LogoMark /></span>
            <span className="hidden md:inline">Иван на сотку</span>
          </h1>
          <p className="text-gray-500 mt-2">Вход в платформу</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" value={code} onChange={e => setCode(e.target.value)} required placeholder="Код доступа" className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"/>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <Button type="submit" className="w-full py-3" disabled={loading}>{loading ? 'Вход...' : 'Войти'}</Button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">Код доступа выдаёт учитель</p>
      </div>
    </div>
  );
};

const ProgressSection = ({
  progress,
  onUpdateProgress,
  role,
  studentId,
  students,
  tasks,
  onTaskTitleUpdate,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  openTask,
  onOpenTaskHandled,
  openMockExamId,
  onOpenMockExamHandled,
  initialSection,
  sectionJumpToken,
  onSectionChange,
  onTaskStateChange,
  onStreakSaved,
  onMockAttemptSaved,
  onXpGain
}) => {
  const taskList = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const [activeTask, setActiveTask] = useState(null);
  const [reviewTask, setReviewTask] = useState(null);
  const [autoLevel, setAutoLevel] = useState(null);
  const [autoTargetQuestions, setAutoTargetQuestions] = useState(null);
  const [activeLevel, setActiveLevel] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(null);
  const [mobileLevelPickerTaskId, setMobileLevelPickerTaskId] = useState(null);
  const [mobileLevelPopupView, setMobileLevelPopupView] = useState(null);
  const [mobileLevelPopupClosing, setMobileLevelPopupClosing] = useState(false);
  const [forceInitialLevelLaunch, setForceInitialLevelLaunch] = useState(false);
  const [section, setSection] = useState(() => (
    ['progress', 'notes', 'mocks'].includes(initialSection) ? initialSection : 'progress'
  ));
  const requestedSectionRef = useRef(
    ['progress', 'notes', 'mocks'].includes(initialSection) ? initialSection : 'progress'
  );
  const [studentData, setStudentData] = useState({ progress: {}, notes: '', notesByTask: {}, mocks: [] });
  const [dataError, setDataError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [notesSavingId, setNotesSavingId] = useState(null);
  const [notesMobileFilter, setNotesMobileFilter] = useState('all');
  const [notesMobileQuery, setNotesMobileQuery] = useState('');
  const [mockForm, setMockForm] = useState({ date: '', score: '', comment: '' });
  const [mockExams, setMockExams] = useState([]);
  const [mockExamsError, setMockExamsError] = useState('');
  const [mockExamsLoading, setMockExamsLoading] = useState(false);
  const [mockAttemptsByExam, setMockAttemptsByExam] = useState({});
  const [mockAttemptsLoading, setMockAttemptsLoading] = useState(false);
  const [mockEditorExam, setMockEditorExam] = useState(null);
  const [activeMockExam, setActiveMockExam] = useState(null);
  const [activeMockAttempt, setActiveMockAttempt] = useState(null);
  const [newMockTitle, setNewMockTitle] = useState('');
  const [mockAccessExamId, setMockAccessExamId] = useState(null);
  const [mockAccessAll, setMockAccessAll] = useState(false);
  const [mockAccessStudents, setMockAccessStudents] = useState([]);
  const [mockAccessSaving, setMockAccessSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [savingTaskTitleId, setSavingTaskTitleId] = useState(null);
  const [openTaskCodeNumber, setOpenTaskCodeNumber] = useState(null);
  const [taskCodeCache, setTaskCodeCache] = useState({});
  const [taskCodeLoadingNumber, setTaskCodeLoadingNumber] = useState(null);
  const [taskCodeSavingNumber, setTaskCodeSavingNumber] = useState(null);
  const [taskCodeErrorByTask, setTaskCodeErrorByTask] = useState({});
  const [taskRunStateByTask, setTaskRunStateByTask] = useState({});
  const mobilePathCanvasRef = useRef(null);
  const [mobilePathCanvasWidth, setMobilePathCanvasWidth] = useState(0);
  const taskRunnerWorkerRef = useRef(null);
  const taskRunnerPendingRef = useRef(new Map());
  const mockAttemptRequestIdRef = useRef(0);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const prevEffectiveStudentIdRef = useRef(effectiveStudentId);

  const visibleMockExams = useMemo(() => {
    if (role !== 'student') return mockExams || [];
    return (mockExams || []).filter((exam) => isMockExamAccessible(exam, effectiveStudentId));
  }, [mockExams, role, effectiveStudentId]);

  const getTaskCodeEntry = (taskNumber) => {
    const key = String(taskNumber);
    const cached = taskCodeCache?.[key];
    if (!cached || typeof cached !== 'object') {
      return { code: '', input: '', updatedAt: '', loaded: false };
    }
    return {
      code: typeof cached.code === 'string' ? cached.code : '',
      input: typeof cached.input === 'string' ? cached.input : '',
      updatedAt: typeof cached.updatedAt === 'string' ? cached.updatedAt : '',
      loaded: Boolean(cached.loaded),
    };
  };

  const setTaskCodeEntry = (taskNumber, patch) => {
    const key = String(taskNumber);
    setTaskCodeCache((prev) => {
      const current = prev?.[key] && typeof prev[key] === 'object'
        ? prev[key]
        : { code: '', input: '', updatedAt: '', loaded: false };
      return {
        ...(prev || {}),
        [key]: {
          ...current,
          ...(patch || {}),
          loaded: true
        }
      };
    });
  };

  const clearTaskCodeError = (taskNumber) => {
    const key = String(taskNumber);
    setTaskCodeErrorByTask((prev) => {
      if (!prev?.[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setTaskCodeError = (taskNumber, message) => {
    const key = String(taskNumber);
    setTaskCodeErrorByTask((prev) => ({ ...(prev || {}), [key]: message || '' }));
  };

  const resolveTaskRunnerPending = (message) => {
    taskRunnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    taskRunnerPendingRef.current.clear();
  };

  const disposeTaskRunnerWorker = (message = '') => {
    if (taskRunnerWorkerRef.current) {
      taskRunnerWorkerRef.current.terminate();
      taskRunnerWorkerRef.current = null;
    }
    if (message) resolveTaskRunnerPending(message);
  };

  const ensureTaskRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (taskRunnerWorkerRef.current) return taskRunnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = taskRunnerPendingRef.current.get(data.id);
        if (!pending) return;
        const messageType = typeof data.type === 'string' ? data.type : 'result';
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
        taskRunnerPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string'
          ? data.output
          : (data.output ? String(data.output) : (pending.output || ''));
        const error = typeof data.error === 'string'
          ? data.error
          : (data.error ? String(data.error) : (pending.error || ''));
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, done: true });
        }
        pending.resolve({ output, error });
      };
      worker.onerror = () => disposeTaskRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeTaskRunnerWorker('Ошибка выполнения Python.');
      taskRunnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  const runTaskCodeMainThread = async (source, inputValue) => {
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

  const runTaskCode = async (source, inputValue, onProgress = null) => {
    const worker = ensureTaskRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = taskRunnerPendingRef.current.get(id);
          if (!pending) return;
          taskRunnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposeTaskRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        taskRunnerPendingRef.current.set(id, {
          resolve,
          timer,
          output: '',
          error: '',
          onProgress: typeof onProgress === 'function' ? onProgress : null,
        });
        worker.postMessage({ id, source, input: inputValue });
      });
    }
    if (!ALLOW_MAIN_THREAD_PYTHON_FALLBACK) {
      return {
        output: '',
        error: 'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.'
      };
    }
    return runTaskCodeMainThread(source, inputValue);
  };

  const loadTaskCode = async (taskNumber, force = false) => {
    if (!effectiveStudentId || !Number.isFinite(Number(taskNumber))) return;
    const key = String(taskNumber);
    const cached = getTaskCodeEntry(taskNumber);
    if (cached.loaded && !force) return;
    if (taskCodeLoadingNumber === taskNumber) return;
    setTaskCodeLoadingNumber(taskNumber);
    try {
      const payload = await api.getTaskCode(effectiveStudentId, taskNumber);
      setTaskCodeEntry(taskNumber, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      clearTaskCodeError(taskNumber);
      setTaskRunStateByTask((prev) => ({ ...(prev || {}), [key]: { loading: false, output: '', error: '' } }));
    } catch (err) {
      setTaskCodeError(taskNumber, err?.message || err);
    } finally {
      setTaskCodeLoadingNumber(null);
    }
  };

  const toggleTaskCodePanel = async (taskNumber) => {
    if (!Number.isFinite(Number(taskNumber))) return;
    if (openTaskCodeNumber === taskNumber) {
      setOpenTaskCodeNumber(null);
      return;
    }
    setOpenTaskCodeNumber(taskNumber);
    await loadTaskCode(taskNumber);
  };

  const saveTaskCode = async (taskNumber) => {
    if (!effectiveStudentId || !Number.isFinite(Number(taskNumber))) return;
    if (taskCodeSavingNumber === taskNumber) return;
    const entry = getTaskCodeEntry(taskNumber);
    setTaskCodeSavingNumber(taskNumber);
    try {
      const payload = await api.saveTaskCode(effectiveStudentId, taskNumber, {
        code: entry.code,
        input: entry.input
      });
      setTaskCodeEntry(taskNumber, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      clearTaskCodeError(taskNumber);
    } catch (err) {
      setTaskCodeError(taskNumber, err?.message || err);
    } finally {
      setTaskCodeSavingNumber(null);
    }
  };

  const runTaskCodeForTask = async (taskNumber) => {
    if (!Number.isFinite(Number(taskNumber))) return;
    const key = String(taskNumber);
    const entry = getTaskCodeEntry(taskNumber);
    setTaskRunStateByTask((prev) => ({ ...(prev || {}), [key]: { loading: true, output: '', error: '' } }));
    try {
      const result = await runTaskCode(entry.code || '', entry.input || '', (progress) => {
        setTaskRunStateByTask((prev) => ({
          ...(prev || {}),
          [key]: {
            loading: !progress?.done,
            output: progress?.output || '',
            error: progress?.error || '',
          }
        }));
      });
      setTaskRunStateByTask((prev) => ({
        ...(prev || {}),
        [key]: { loading: false, output: result?.output || '', error: result?.error || '' }
      }));
    } catch (err) {
      setTaskRunStateByTask((prev) => ({
        ...(prev || {}),
        [key]: { loading: false, output: '', error: err?.message || 'Ошибка выполнения Python' }
      }));
    }
  };

  useEffect(() => () => disposeTaskRunnerWorker('Python runner stopped.'), []);

  const startEditTaskTitle = (task) => {
    if (!task) return;
    setEditingTaskId(task.number);
    setEditingTaskTitle(task.title || '');
  };

  const cancelEditTaskTitle = () => {
    setEditingTaskId(null);
    setEditingTaskTitle('');
  };

  const saveTaskTitle = async (task) => {
    if (!task) return;
    const title = editingTaskTitle.trim();
    setSavingTaskTitleId(task.number);
    try {
      await api.updateTaskTitle(task.number, title);
      onTaskTitleUpdate?.(task.number, title);
      cancelEditTaskTitle();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setSavingTaskTitleId(null);
    }
  };

  useEffect(() => {
    if (!effectiveStudentId) {
      setStudentData({ progress: {}, notes: '', notesByTask: {}, mocks: [] });
      return;
    }
    let cancelled = false;
    api.getStudentData(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setStudentData({
          progress: data?.progress || {},
          notes: data?.notes || '',
          notesByTask: data?.notesByTask && typeof data.notesByTask === 'object' ? data.notesByTask : {},
          mocks: Array.isArray(data?.mocks) ? data.mocks : []
        });
        setDataError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    let cancelled = false;
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestsDb(data && typeof data === 'object' ? data : {});
        setTestsDbError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsDb({});
        setTestsDbError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMockExamsLoading(true);
    api.getMockExams(role === 'student' ? effectiveStudentId : null)
      .then((data) => {
        if (cancelled) return;
        setMockExams(Array.isArray(data) ? data : []);
        setMockExamsError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setMockExams([]);
        setMockExamsError(err?.message || err);
      })
      .finally(() => {
        if (!cancelled) setMockExamsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!effectiveStudentId) {
      setMockAttemptsByExam({});
      setMockAttemptsLoading(false);
      return;
    }
    if (!visibleMockExams || visibleMockExams.length === 0) {
      setMockAttemptsByExam({});
      setMockAttemptsLoading(false);
      return;
    }
    let cancelled = false;
    setMockAttemptsLoading(true);
    Promise.all(
      visibleMockExams.map((exam) =>
        api.getMockAttempt(effectiveStudentId, exam.id).catch(() => null)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const map = {};
        visibleMockExams.forEach((exam, idx) => {
          const attempt = results[idx];
          if (attempt && typeof attempt === 'object') {
            map[exam.id] = attempt;
          }
        });
        setMockAttemptsByExam(map);
      })
      .finally(() => {
        if (!cancelled) setMockAttemptsLoading(false);
      });
    return () => { cancelled = true; };
  }, [role, effectiveStudentId, visibleMockExams]);

  useEffect(() => {
    const studentChanged = prevEffectiveStudentIdRef.current !== effectiveStudentId;
    prevEffectiveStudentIdRef.current = effectiveStudentId;
    const sectionChangedAwayFromProgress = section !== 'progress';
    if (studentChanged || sectionChangedAwayFromProgress) {
      setActiveTask(null);
      setReviewTask(null);
      setAutoLevel(null);
      setAutoTargetQuestions(null);
      setActiveLevel(null);
      setActiveQuestionIndex(null);
      setForceInitialLevelLaunch(false);
    }
    setMobileLevelPickerTaskId(null);
    setOpenTaskCodeNumber(null);
    setTaskCodeCache({});
    setTaskCodeLoadingNumber(null);
    setTaskCodeSavingNumber(null);
    setTaskCodeErrorByTask({});
    setTaskRunStateByTask({});
    disposeTaskRunnerWorker();
    cancelEditTaskTitle();
    closeMockAccessEditor();
  }, [section, effectiveStudentId]);

  useEffect(() => {
    requestedSectionRef.current = ['progress', 'notes', 'mocks'].includes(initialSection)
      ? initialSection
      : 'progress';
  }, [initialSection]);

  useEffect(() => {
    const nextSection = requestedSectionRef.current;
    setSection((prev) => (prev === nextSection ? prev : nextSection));
  }, [sectionJumpToken]);

  useEffect(() => {
    onSectionChange?.(section);
  }, [section, onSectionChange]);

  useEffect(() => {
    if (role !== 'student' || !openTask) return;
    if (openTask.section === 'python' || isPythonTaskNumber(openTask.taskNumber)) {
      onOpenTaskHandled?.();
      return;
    }
    const target = taskList.find((task) => Number(task.number) === Number(openTask.taskNumber));
    if (!target) {
      onOpenTaskHandled?.();
      return;
    }
    setSection('progress');
    setActiveLevel(null);
    setForceInitialLevelLaunch(false);
    setActiveTask(target);
    setAutoLevel(openTask.levelId || null);
    setAutoTargetQuestions(Array.isArray(openTask.targetQuestions) ? openTask.targetQuestions : null);
    if (Number.isFinite(openTask.questionIndex)) {
      setActiveQuestionIndex(openTask.questionIndex);
    } else {
      setActiveQuestionIndex(null);
    }
    onOpenTaskHandled?.();
  }, [openTask, role, taskList, onOpenTaskHandled]);

  useEffect(() => {
    if (role !== 'student' || !openMockExamId) return;
    setSection('mocks');
    if (mockExamsLoading) return;

    const targetId = String(openMockExamId);
    const targetExam = (visibleMockExams || []).find((exam) => String(exam?.id) === targetId)
      || (mockExams || []).find((exam) => String(exam?.id) === targetId);
    if (targetExam) {
      handleOpenMockExam(targetExam);
    }
    onOpenMockExamHandled?.();
  }, [
    role,
    openMockExamId,
    mockExamsLoading,
    visibleMockExams,
    mockExams,
    onOpenMockExamHandled
  ]);

  useEffect(() => {
    if (activeTask) setMobileLevelPickerTaskId(null);
  }, [activeTask]);

  useEffect(() => {
    if (role !== 'student') return;
    if (!activeTask) {
      if (openTask) return;
      onTaskStateChange?.(null);
      return;
    }
    onTaskStateChange?.({
      taskNumber: activeTask.number,
      levelId: activeLevel || autoLevel || null,
      targetQuestions: autoTargetQuestions,
      section: 'progress',
      questionIndex: Number.isFinite(activeQuestionIndex) ? activeQuestionIndex : null
    });
  }, [activeTask, activeLevel, autoLevel, autoTargetQuestions, activeQuestionIndex, role, onTaskStateChange, openTask]);

  useLayoutEffect(() => {
    if (role !== 'student' || section !== 'progress') return undefined;
    const element = mobilePathCanvasRef.current;
    if (!element) return undefined;
    const updateWidth = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      if (!Number.isFinite(width) || width <= 0) return;
      setMobilePathCanvasWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
    };
    updateWidth();

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
      return () => observer.disconnect();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    return undefined;
  }, [role, section, taskList.length]);

  const progressMap = role === 'teacher'
    ? (studentData.progress || {})
    : (Object.keys(progress || {}).length ? progress : (studentData.progress || {}));

  const totalMastery = (() => {
    if (!taskList.length) return 0;
    const total = taskList.reduce((sum, task) => {
      const val = Number(progressMap[task.id] || 0);
      return sum + (Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0);
    }, 0);
    return Math.round((total / taskList.length) * 10) / 10;
  })();
  const totalMasteryRounded = Math.round(totalMastery);
  const totalMasteryLabel = Number.isFinite(totalMasteryRounded)
    ? totalMasteryRounded.toString()
    : '0';
  const sectionTabs = [
    { id: 'progress', label: 'Тестирования', icon: BarChart2 },
    { id: 'notes', label: 'Заметки учителя', icon: FileText },
    { id: 'mocks', label: 'Пробники', icon: BookOpen }
  ];
  const sectionShortLabels = {
    progress: 'Тесты',
    notes: 'Заметки',
    mocks: 'Пробники'
  };
  const mobilePathLayout = useMemo(() => {
    const ringSize = 124;
    const strokeWidth = 10;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const labelGap = 7;
    const labelHeight = 42;
    const topPadding = 10;
    const bottomPadding = 24;
    const nodeWidth = 156;
    const labelBoxWidth = 154;
    const pathWidth = Math.max(296, Math.round(mobilePathCanvasWidth || 336));
    const xPattern = [24, 74, 36, 70, 27, 78, 44, 66, 30, 76, 41, 69];
    const stepPattern = [136, 148, 142, 156, 138, 150, 144, 152, 140, 154];
    const connectorPresets = [
      { sway: 22, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 18, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -19, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 20, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -22, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 17, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 18, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -19, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 20, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -22, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 17, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
    ];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const manualNodeShiftPxByNumber = {
      7: -28,
      19: -22,
      20: -22,
      21: -22
    };
    const manualNodeShiftPxByDisplayNumber = {
      '19-21': -22
    };
    const pointInRect = (x, y, rect) => (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
    const segmentHitsRect = (x1, y1, x2, y2, rect) => {
      if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
      const steps = 30;
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const x = x1 + ((x2 - x1) * t);
        const y = y1 + ((y2 - y1) * t);
        if (pointInRect(x, y, rect)) return true;
      }
      return false;
    };
    const nodeHalfWidth = nodeWidth / 2;
    const centerMin = nodeHalfWidth + 4;
    const centerMax = Math.max(centerMin, pathWidth - nodeHalfWidth - 4);
    let currentTop = topPadding;
    const nodes = taskList.map((task, idx) => {
      const rawVal = Number(progressMap[task.id] || 0);
      const val = Number.isFinite(rawVal) ? Math.max(0, Math.min(100, rawVal)) : 0;
      const ringColor = val >= 85
        ? '#10b981'
        : (val >= 60 ? '#8b5cf6' : (val >= 40 ? '#f59e0b' : '#9ca3af'));
      const numericSeed = Number(task?.number);
      const seed = Number.isFinite(numericSeed) ? numericSeed : (idx + 1);
      const jitter = ((seed * 23) % 11) - 5;
      const xBase = clamp(xPattern[idx % xPattern.length] + jitter, 22, 78);
      const numericShiftPx = Number.isFinite(numericSeed)
        ? (manualNodeShiftPxByNumber[numericSeed] || 0)
        : 0;
      const displayShiftPxRaw = manualNodeShiftPxByDisplayNumber[String(task?.displayNumber || '')];
      const manualShiftPx = Number.isFinite(displayShiftPxRaw) ? displayShiftPxRaw : numericShiftPx;
      const centerX = clamp(((xBase / 100) * pathWidth) + manualShiftPx, centerMin, centerMax);
      const top = currentTop;
      const centerY = top + (ringSize / 2);
      currentTop += stepPattern[idx % stepPattern.length];
      const compactTitle = String(task.title || '').replace(/\s+/g, ' ').trim();
      const title = compactTitle.length > 52 ? `${compactTitle.slice(0, 52)}...` : compactTitle;
      const labelTop = top + ringSize + labelGap;
      const labelLeft = centerX - (labelBoxWidth / 2);
      const labelRight = centerX + (labelBoxWidth / 2);
      const labelBottom = labelTop + labelHeight;
      return {
        task,
        idx,
        val,
        ringColor,
        centerX,
        centerY,
        top,
        labelTop,
        labelLeft,
        labelRight,
        labelBottom,
        title
      };
    });
    const curves = nodes.slice(0, -1).map((node, idx) => {
      const next = nodes[idx + 1];
      const preset = connectorPresets[idx % connectorPresets.length];
      const deltaX = next.centerX - node.centerX;
      const deltaY = next.centerY - node.centerY;
      const distance = Math.max(0.001, Math.hypot(deltaX, deltaY));
      const unitX = deltaX / distance;
      const unitY = deltaY / distance;
      const anchorOffset = (ringSize / 2) + (strokeWidth / 2) + 2;
      const startX = node.centerX + (unitX * anchorOffset);
      const startY = node.centerY + (unitY * anchorOffset);
      const endX = next.centerX - (unitX * anchorOffset);
      const endY = next.centerY - (unitY * anchorOffset);

      const currentLabelRect = {
        left: node.labelLeft - 4,
        right: node.labelRight + 4,
        top: node.labelTop - 4,
        bottom: node.labelBottom + 4
      };
      const nextLabelRect = {
        left: next.labelLeft - 4,
        right: next.labelRight + 4,
        top: next.labelTop - 4,
        bottom: next.labelBottom + 4
      };
      const shouldBypassLabels = segmentHitsRect(startX, startY, endX, endY, currentLabelRect)
        || segmentHitsRect(startX, startY, endX, endY, nextLabelRect);
      if (!shouldBypassLabels) {
        return {
          id: `${node.task.id}-${next.task.id}`,
          d: `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${endX.toFixed(2)} ${endY.toFixed(2)}`
        };
      }

      const safeY = Math.min(node.labelTop, next.labelTop) - 16;
      const straightMidY = (startY + endY) / 2;
      const requiredLift = Math.max(0, straightMidY - safeY + 4);
      const tangentOut = clamp(distance * (0.23 + preset.pullA * 0.45), 18, 34);
      const tangentIn = clamp(distance * (0.23 + preset.pullB * 0.45), 18, 34);
      const baseC1X = startX + (unitX * tangentOut);
      const baseC1Y = startY + (unitY * tangentOut);
      const baseC2X = endX - (unitX * tangentIn);
      const baseC2Y = endY - (unitY * tangentIn);
      const nearVertical = Math.abs(deltaX) < 72 && Math.abs(deltaY) > 36;
      const swayFactor = nearVertical
        ? Math.max(0.28, Math.min(0.9, (72 - Math.abs(deltaX)) / 72))
        : 0.18;
      const lateral = preset.sway * swayFactor * 0.34;
      const lift = clamp((preset.lift * 0.58) + requiredLift, 8, 30);
      let c1x = clamp(baseC1X + lateral, 8, pathWidth - 8);
      let c2x = clamp(baseC2X - (lateral * 0.78), 8, pathWidth - 8);
      let c1y = baseC1Y - lift;
      let c2y = baseC2Y - (lift * 0.92);
      const yOvershoot = Math.max(c1y - safeY, c2y - safeY, 0);
      if (yOvershoot > 0) {
        c1y -= yOvershoot;
        c2y -= yOvershoot;
      }
      const minCurveY = Math.min(startY, endY) - 58;
      c1y = Math.max(minCurveY, c1y);
      c2y = Math.max(minCurveY + 6, c2y);
      const minControlGap = Math.max(8, Math.abs(deltaX) * 0.06);
      if (deltaX >= 0 && c2x < c1x + minControlGap) {
        const mid = (c1x + c2x) / 2;
        c1x = clamp(mid - (minControlGap / 2), 8, pathWidth - 8);
        c2x = clamp(mid + (minControlGap / 2), 8, pathWidth - 8);
      } else if (deltaX < 0 && c2x > c1x - minControlGap) {
        const mid = (c1x + c2x) / 2;
        c1x = clamp(mid + (minControlGap / 2), 8, pathWidth - 8);
        c2x = clamp(mid - (minControlGap / 2), 8, pathWidth - 8);
      }
      return {
        id: `${node.task.id}-${next.task.id}`,
        d: `M ${startX.toFixed(2)} ${startY.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${endX.toFixed(2)} ${endY.toFixed(2)}`
      };
    });
    const lastNode = nodes[nodes.length - 1];
    const height = lastNode
      ? Math.round(lastNode.top + ringSize + labelGap + labelHeight + bottomPadding)
      : 200;
    return {
      nodes,
      curves,
      width: pathWidth,
      height,
      nodeWidth,
      ringSize,
      strokeWidth,
      radius,
      circumference
    };
  }, [taskList, progressMap, mobilePathCanvasWidth]);
  const mobileLevelPopupLayout = useMemo(() => {
    if (!mobileLevelPickerTaskId) return null;
    const selectedNode = mobilePathLayout.nodes.find((node) => String(node.task.id) === String(mobileLevelPickerTaskId));
    if (!selectedNode) return null;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const popupMinWidth = 248;
    const popupMaxWidth = 314;
    const variantSeed = Number(selectedNode.task?.number);
    const variantOffset = Number.isFinite(variantSeed)
      ? (((variantSeed * 17) % 41) - 20)
      : 0;
    const preferredWidth = 282 + variantOffset;
    const popupWidth = clamp(
      preferredWidth,
      popupMinWidth,
      Math.min(popupMaxWidth, Math.max(popupMinWidth, mobilePathLayout.width - 38))
    );
    const popupHeight = 214;
    const left = clamp(
      selectedNode.centerX - (popupWidth / 2),
      8,
      Math.max(8, mobilePathLayout.width - popupWidth - 8)
    );
    const aboveTop = selectedNode.top - popupHeight - 8;
    const belowTop = selectedNode.top + mobilePathLayout.ringSize + 8;
    let top = aboveTop;
    let placeBelow = false;
    if (typeof window !== 'undefined' && mobilePathCanvasRef.current) {
      const rect = mobilePathCanvasRef.current.getBoundingClientRect();
      const safeTop = 64;
      const safeBottom = 92;
      const screenMinTop = safeTop;
      const screenMaxTop = Math.max(screenMinTop, window.innerHeight - safeBottom - popupHeight);

      const aboveScreenTopRaw = rect.top + aboveTop;
      const belowScreenTopRaw = rect.top + belowTop;
      const aboveScreenTop = clamp(aboveScreenTopRaw, screenMinTop, screenMaxTop);
      const belowScreenTop = clamp(belowScreenTopRaw, screenMinTop, screenMaxTop);
      const aboveShift = Math.abs(aboveScreenTop - aboveScreenTopRaw);
      const belowShift = Math.abs(belowScreenTop - belowScreenTopRaw);

      if (belowShift + 4 < aboveShift) {
        placeBelow = true;
      } else if (aboveShift + 4 < belowShift) {
        placeBelow = false;
      } else {
        const nodeScreenTop = rect.top + selectedNode.top;
        const nodeScreenBottom = nodeScreenTop + mobilePathLayout.ringSize;
        const availableAbove = nodeScreenTop - screenMinTop - 8;
        const availableBelow = (window.innerHeight - safeBottom) - nodeScreenBottom - 8;
        placeBelow = availableBelow > availableAbove;
      }

      const chosenScreenTop = placeBelow ? belowScreenTop : aboveScreenTop;
      top = chosenScreenTop - rect.top;
    } else {
      const minTop = 6;
      const maxTop = Math.max(minTop, mobilePathLayout.height - popupHeight - 6);
      const aboveClamped = clamp(aboveTop, minTop, maxTop);
      const belowClamped = clamp(belowTop, minTop, maxTop);
      const aboveShift = Math.abs(aboveClamped - aboveTop);
      const belowShift = Math.abs(belowClamped - belowTop);
      placeBelow = belowShift < aboveShift;
      top = placeBelow ? belowClamped : aboveClamped;
    }

    const nodeCenterY = selectedNode.top + (mobilePathLayout.ringSize / 2);
    const popupCenterY = top + (popupHeight / 2);
    placeBelow = popupCenterY >= nodeCenterY;

    const arrowLeft = clamp(selectedNode.centerX - left - 7, 14, popupWidth - 22);
    return {
      node: selectedNode,
      width: popupWidth,
      height: popupHeight,
      left,
      top,
      placeBelow,
      arrowLeft
    };
  }, [mobileLevelPickerTaskId, mobilePathLayout]);

  useEffect(() => {
    if (mobileLevelPopupLayout) {
      setMobileLevelPopupView(mobileLevelPopupLayout);
      setMobileLevelPopupClosing(false);
      return undefined;
    }
    if (!mobileLevelPopupView) return undefined;
    setMobileLevelPopupClosing(true);
    const timer = setTimeout(() => {
      setMobileLevelPopupView(null);
      setMobileLevelPopupClosing(false);
    }, 220);
    return () => clearTimeout(timer);
  }, [mobileLevelPopupLayout, mobileLevelPopupView]);

  const openTaskFromMobilePath = (task, levelId) => {
    if (!task) return;
    setMobileLevelPickerTaskId(null);
    setActiveLevel(null);
    setActiveQuestionIndex(null);
    setAutoTargetQuestions(null);
    setAutoLevel(['basic', 'advanced', 'expert'].includes(levelId) ? levelId : null);
    setForceInitialLevelLaunch(true);
    setActiveTask(task);
  };
  const getBallLabel = (value) => {
    if (!Number.isFinite(value)) return 'баллов';
    if (value % 1 !== 0) return 'балла';
    const abs = Math.abs(Math.round(value));
    const mod100 = abs % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'баллов';
    const mod10 = abs % 10;
    if (mod10 === 1) return 'балл';
    if (mod10 >= 2 && mod10 <= 4) return 'балла';
    return 'баллов';
  };
  const getProgressHeadline = (value) => {
    if (!Number.isFinite(value)) return 'Хорошее начало';
    const score = Math.max(0, Math.min(100, Math.round(value)));
    const labels = [
      { min: 0, label: 'Хорошее начало' },
      { min: 5, label: 'Разогрев в пути' },
      { min: 10, label: 'Первые победы' },
      { min: 15, label: 'Набираем темп' },
      { min: 20, label: 'Уверенный старт' },
      { min: 25, label: 'Держим курс' },
      { min: 30, label: 'Ровный прогресс' },
      { min: 35, label: 'Ритм пойман' },
      { min: 40, label: 'Середина пути' },
      { min: 45, label: 'Хорошая динамика' },
      { min: 50, label: 'Экватор' },
      { min: 55, label: 'Сильная половина' },
      { min: 60, label: 'Уровень растёт' },
      { min: 65, label: 'Уже близко' },
      { min: 70, label: 'Уверенный результат' },
      { min: 75, label: 'Фокус на детали' },
      { min: 80, label: 'Очень близко' },
      { min: 85, label: 'Финишная подготовка' },
      { min: 90, label: 'Финишная прямая' },
      { min: 95, label: 'Почти 100' },
      { min: 100, label: 'Сотка!' }
    ];
    let current = labels[0].label;
    for (const entry of labels) {
      if (score >= entry.min) current = entry.label;
    }
    return current;
  };

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="inline-flex w-full sm:w-auto items-center gap-2 rounded-2xl border border-purple-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-purple-100/40">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-purple-500">Ученик</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="w-full min-w-0 sm:min-w-[180px] rounded-xl border border-purple-100 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const getNotesTaskKeys = (value) => {
    const normalized = normalizeTaskNumber(value);
    if (!Number.isFinite(normalized)) return [];
    if (normalized === GAME_THEORY_TASK) return [19, 20, 21];
    return [normalized];
  };

  const getMergedNote = (value) => {
    const keys = getNotesTaskKeys(value);
    if (!keys.length) return '';
    for (const key of keys) {
      const noteValue = studentData.notesByTask?.[key];
      if (typeof noteValue === 'string' && noteValue.trim()) return noteValue;
    }
    const fallback = studentData.notesByTask?.[keys[0]];
    return typeof fallback === 'string' ? fallback : '';
  };

  useEffect(() => {
    setNotesMobileFilter('all');
    setNotesMobileQuery('');
  }, [effectiveStudentId]);

  const notesCards = taskList.map((task, idx) => {
    const num = task.number;
    const note = getMergedNote(num);
    const hasNote = Boolean(note && note.trim());
    const searchable = `${getTaskDisplayNumber(task)} ${task.title || ''}`.toLowerCase();
    return {
      task,
      idx,
      num,
      note,
      hasNote,
      searchable
    };
  });
  const notesFilledCount = notesCards.filter((item) => item.hasNote).length;
  const notesEmptyCount = Math.max(0, notesCards.length - notesFilledCount);
  const notesQueryNormalized = notesMobileQuery.trim().toLowerCase();
  const filteredNotesCards = notesCards.filter((item) => {
    const passFilter = notesMobileFilter === 'filled'
      ? item.hasNote
      : (notesMobileFilter === 'empty' ? !item.hasNote : true);
    const passQuery = !notesQueryNormalized || item.searchable.includes(notesQueryNormalized);
    return passFilter && passQuery;
  });

  const saveTaskNote = async (taskNumber, note) => {
    if (!effectiveStudentId || role !== 'teacher') return;
    const nextNotes = { ...(studentData.notesByTask || {}) };
    const keys = getNotesTaskKeys(taskNumber);
    if (keys.length === 0) return;
    if (note) {
      keys.forEach((key) => { if (key !== keys[0]) delete nextNotes[key]; });
      nextNotes[keys[0]] = note;
    } else {
      keys.forEach((key) => delete nextNotes[key]);
    }
    setNotesSavingId(taskNumber);
    try {
      const res = await api.updateStudentNotes(effectiveStudentId, { notesByTask: nextNotes });
      setStudentData((prev) => ({ ...prev, notesByTask: res?.notesByTask || nextNotes }));
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setNotesSavingId(null);
    }
  };

  const handleAddMock = async () => {
    if (!effectiveStudentId || role !== 'teacher') return;
    const scoreValue = Number(mockForm.score);
    if (!Number.isFinite(scoreValue)) {
      setDataError('Введите корректный балл');
      return;
    }
    try {
      const entry = await api.addMockExam(effectiveStudentId, {
        date: mockForm.date,
        score: scoreValue,
        comment: mockForm.comment,
      });
      setStudentData((prev) => ({ ...prev, mocks: [entry, ...(prev.mocks || [])] }));
      setMockForm({ date: '', score: '', comment: '' });
      setDataError('');
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleDeleteMock = async (id) => {
    if (!effectiveStudentId || role !== 'teacher') return;
    if (!confirm('Удалить пробник?')) return;
    try {
      await api.deleteMockExam(effectiveStudentId, id);
      setStudentData((prev) => ({ ...prev, mocks: (prev.mocks || []).filter((m) => m.id !== id) }));
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleCreateMockExam = async () => {
    if (role !== 'teacher') return;
    const title = newMockTitle.trim();
    try {
      const created = await api.createMockExam(title);
      setMockExams((prev) => [created, ...(prev || [])]);
      setNewMockTitle('');
      setMockEditorExam(created);
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleSaveMockExam = async (nextExam) => {
    if (!nextExam?.id) return null;
    const payload = { title: nextExam.title, tasks: nextExam.tasks };
    const saved = await api.updateMockExam(nextExam.id, payload);
    setMockExams((prev) => (prev || []).map((exam) => (exam.id === saved.id ? saved : exam)));
    setMockEditorExam(saved);
    return saved;
  };

  const openMockAccessEditor = (exam) => {
    if (!exam) return;
    if (mockAccessExamId === exam.id) {
      closeMockAccessEditor();
      return;
    }
    const access = normalizeMockExamAccess(exam.access, LEGACY_MOCK_EXAM_ACCESS);
    setMockAccessExamId(exam.id);
    setMockAccessAll(access.all);
    setMockAccessStudents(access.students);
  };

  const closeMockAccessEditor = () => {
    setMockAccessExamId(null);
    setMockAccessAll(false);
    setMockAccessStudents([]);
    setMockAccessSaving(false);
  };

  const toggleMockAccessStudent = (studentIdValue) => {
    const id = String(studentIdValue);
    setMockAccessStudents((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const handleSaveMockAccess = async () => {
    if (!mockAccessExamId) return;
    setMockAccessSaving(true);
    try {
      const payload = {
        access: {
          all: Boolean(mockAccessAll),
          students: mockAccessAll ? [] : mockAccessStudents
        }
      };
      const saved = await api.updateMockExam(mockAccessExamId, payload);
      setMockExams((prev) => (prev || []).map((exam) => (exam.id === saved.id ? saved : exam)));
      const normalized = normalizeMockExamAccess(saved.access, LEGACY_MOCK_EXAM_ACCESS);
      setMockAccessAll(normalized.all);
      setMockAccessStudents(normalized.students);
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setMockAccessSaving(false);
    }
  };

  const handleDeleteMockExamDefinition = async (examId) => {
    if (role !== 'teacher') return;
    if (!confirm('Удалить пробник полностью?')) return;
    try {
      await api.deleteMockExamDefinition(examId);
      setMockExams((prev) => (prev || []).filter((exam) => exam.id !== examId));
      if (mockEditorExam?.id === examId) setMockEditorExam(null);
      if (activeMockExam?.id === examId) {
        mockAttemptRequestIdRef.current += 1;
        setActiveMockExam(null);
        setActiveMockAttempt(null);
      }
      if (mockAccessExamId === examId) closeMockAccessEditor();
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleOpenMockExam = async (exam) => {
    if (!exam) return;
    const requestId = mockAttemptRequestIdRef.current + 1;
    mockAttemptRequestIdRef.current = requestId;
    setActiveMockExam(exam);
    const cachedAttempt = mockAttemptsByExam?.[exam.id];
    setActiveMockAttempt(cachedAttempt && typeof cachedAttempt === 'object' ? cachedAttempt : null);
    if (!effectiveStudentId) return;
    try {
      const attempt = await api.getMockAttempt(effectiveStudentId, exam.id);
      if (mockAttemptRequestIdRef.current !== requestId) return;
      setActiveMockAttempt(attempt && typeof attempt === 'object' ? attempt : {});
      setMockAttemptsByExam((prev) => ({
        ...prev,
        [exam.id]: attempt && typeof attempt === 'object' ? attempt : {}
      }));
    } catch (err) {
      if (mockAttemptRequestIdRef.current !== requestId) return;
      setActiveMockAttempt({});
    }
  };

  if (role === 'teacher' && studentsList.length === 0) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Успеваемость</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">
          {studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'}
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Успеваемость</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">Выберите ученика, чтобы посмотреть его прогресс.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn" data-tour="progress">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3 md:gap-5">
          <div className="flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2.5 md:space-y-3">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">Успеваемость</h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {renderStudentPicker()}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-purple-200/80 bg-white/80 p-3 md:p-4 shadow-[0_10px_24px_rgba(99,102,241,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-600 px-2.5 py-1 text-[10px] md:text-xs font-bold uppercase tracking-[0.14em] md:tracking-widest text-white">
                  {getProgressHeadline(totalMasteryRounded)}
                </div>
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-purple-700 drop-shadow-sm">
                {totalMasteryLabel} {getBallLabel(totalMasteryRounded)}
              </div>
            </div>
            <div className="relative mt-2.5 md:mt-3 h-6 md:h-8 w-full overflow-hidden rounded-full border border-purple-100 bg-white/90">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_18px_rgba(168,85,247,0.45)] transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, Number(totalMastery) || 0))}%` }}
              />
              <div
                key={`sheen-${totalMasteryRounded}`}
                className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.6),transparent)] animate-sheen"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-white/85 p-1.5 md:inline-flex md:w-fit md:flex-wrap md:gap-2 md:p-2">
        {sectionTabs.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`inline-flex min-w-0 items-center justify-center gap-1.5 md:gap-2 rounded-xl border px-2 py-2 md:px-4 md:py-2 text-[11px] sm:text-xs md:text-sm font-semibold transition-all ${
                active
                  ? 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-200'
                  : 'border-transparent bg-white text-slate-600 hover:border-purple-200 hover:text-purple-700'
              }`}
            >
              <Icon size={14} />
              <span className="truncate sm:hidden">{sectionShortLabels[item.id] || item.label}</span>
              <span className="hidden sm:inline truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {(dataError || testsDbError) && (
        <div className="space-y-2">
          {dataError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-600">
              {dataError}
            </div>
          )}
          {testsDbError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-700">
              {testsDbError}
            </div>
          )}
        </div>
      )}

      {section === 'progress' && (
        <>
          {role === 'student' && (
            <div className="md:hidden">
              <div className="mobile-topic-path-card rounded-3xl border border-purple-200/80 bg-white/85 p-3 shadow-[0_10px_24px_rgba(99,102,241,0.12)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Путь по темам</h3>
                  <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-semibold text-purple-700">
                    {`Средний: ${totalMasteryLabel}%`}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">Открывай круги по очереди и поднимай прогресс.</div>
                <div className="mt-3">
                  <div
                    ref={mobilePathCanvasRef}
                    className="mobile-topic-path-canvas relative overflow-visible rounded-2xl border border-purple-100/80 bg-gradient-to-b from-white/95 via-purple-50/55 to-sky-50/45 px-1.5 py-2"
                    style={{ height: `${mobilePathLayout.height}px` }}
                    onClick={() => setMobileLevelPickerTaskId(null)}
                  >
                    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
                      <svg
                        className="h-full w-full"
                        viewBox={`0 0 ${mobilePathLayout.width} ${mobilePathLayout.height}`}
                        preserveAspectRatio="none"
                      >
                        {mobilePathLayout.curves.map((curve, curveIdx) => (
                          <path
                            key={`mobile-curve-${curve.id}`}
                            d={curve.d}
                            fill="none"
                            stroke="var(--mobile-path-curve, rgba(168,85,247,0.44))"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeDasharray={curveIdx % 2 === 0 ? '7.5 6.4' : '6.8 6'}
                          />
                        ))}
                      </svg>
                    </div>
                    {mobileLevelPopupView && (
                      <div
                        key={`mobile-level-popover-${mobileLevelPopupView.node.task.id}`}
                        className={`mobile-level-popover absolute z-20 rounded-2xl px-2.5 py-2 backdrop-blur ${
                          mobileLevelPopupView.placeBelow ? 'mobile-level-popover--below' : 'mobile-level-popover--above'
                        } ${mobileLevelPopupClosing ? 'mobile-level-popover--closing' : ''}`}
                        style={{
                          width: `${mobileLevelPopupView.width}px`,
                          left: `${mobileLevelPopupView.left}px`,
                          top: `${mobileLevelPopupView.top}px`
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mobile-level-popover__inner">
                          <div className="mobile-level-popover__title text-[11px] font-bold uppercase tracking-[0.08em] text-purple-700">
                            Выбери уровень
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {Object.values(LEVELS).map((lvl, lvlIdx) => {
                            const tone = lvl.id === 'basic'
                              ? {
                                  accent: '#f59e0b',
                                  variant: 'mobile-level-option--basic',
                                  title: 'text-amber-700',
                                  badge: 'mobile-level-option-badge--basic',
                                  desc: 'text-slate-600'
                                }
                              : (lvl.id === 'advanced'
                                  ? {
                                      accent: '#8b5cf6',
                                      variant: 'mobile-level-option--advanced',
                                      title: 'text-purple-700',
                                      badge: 'mobile-level-option-badge--advanced',
                                      desc: 'text-slate-600'
                                    }
                                  : {
                                      accent: '#10b981',
                                      variant: 'mobile-level-option--expert',
                                      title: 'text-emerald-700',
                                      badge: 'mobile-level-option-badge--expert',
                                      desc: 'text-slate-600'
                                    });
                            const description = lvl.id === 'basic'
                              ? 'Прототипы с реальных ЕГЭ и Демоверсий.'
                              : (lvl.id === 'advanced'
                                  ? 'Усложненные условия.'
                                  : 'Статград и сложнее.');
                            const levelAngle = `${Math.max(0, Math.min(100, Number(lvl.maxScore) || 0)) * 3.6}deg`;
                            return (
                              <button
                                key={`mobile-level-${lvl.id}`}
                                type="button"
                                className={`mobile-level-option w-full rounded-2xl border px-2.5 py-2.5 text-left transition-transform active:scale-[0.99] ${tone.variant}`}
                                style={{
                                  '--i': lvlIdx,
                                  '--level-accent': tone.accent,
                                  '--level-angle': levelAngle
                                }}
                                onClick={() => openTaskFromMobilePath(mobileLevelPopupView.node.task, lvl.id)}
                              >
                                <div className="flex items-start gap-2.5">
                                  <span className="mobile-level-option-ring" aria-hidden="true">
                                    <span className="mobile-level-option-ring__inner">{`${lvl.maxScore}%`}</span>
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className={`text-[12px] font-bold ${tone.title}`}>
                                        {lvl.id === 'basic' ? 'Базовый' : (lvl.id === 'advanced' ? 'Продвинутый' : 'Эксперт')}
                                      </div>
                                      <span className={`mobile-level-option-badge ${tone.badge}`}>
                                        {`до ${lvl.maxScore}%`}
                                      </span>
                                    </div>
                                    <div className={`mt-1 text-[11px] leading-tight ${tone.desc}`}>
                                      {description}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                            })}
                          </div>
                        </div>
                        <div
                          className={`mobile-level-arrow pointer-events-none absolute ${
                            mobileLevelPopupView.placeBelow ? 'mobile-level-arrow--up' : 'mobile-level-arrow--down'
                          }`}
                          style={{ left: `${mobileLevelPopupView.arrowLeft}px` }}
                        />
                      </div>
                    )}
                    {mobilePathLayout.nodes.map((node) => {
                      const dashOffset = mobilePathLayout.circumference - (node.val / 100) * mobilePathLayout.circumference;
                      const isSelected = String(mobileLevelPickerTaskId) === String(node.task.id);
                      const isMastered = node.val >= 85;
                      const isStable = node.val >= 60 && node.val < 85;
                      const isWarmingUp = node.val >= 40 && node.val < 60;
                      const ringGlow = isMastered
                        ? 'rgba(16,185,129,0.34)'
                        : (isStable ? 'rgba(139,92,246,0.34)' : (isWarmingUp ? 'rgba(245,158,11,0.34)' : 'rgba(148,163,184,0.26)'));
                      const progressAngle = Math.max(0, Math.min(360, Number(node.val || 0) * 3.6));
                      const statusLabel = isMastered
                        ? 'Сильная'
                        : (isStable ? 'В темпе' : (isWarmingUp ? 'Практика' : 'Фокус'));
                      const statusTone = isMastered
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : (isStable
                            ? 'border-purple-200 bg-purple-50 text-purple-700'
                            : (isWarmingUp
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-slate-200 bg-slate-50 text-slate-600'));
                      return (
                        <button
                          key={`mobile-path-${node.task.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMobileLevelPickerTaskId((prev) => (
                              String(prev) === String(node.task.id) ? null : node.task.id
                            ));
                          }}
                          className={`mobile-path-node group absolute z-10 rounded-2xl bg-transparent px-1 transition-transform ${
                            isSelected ? 'mobile-path-node--selected scale-[1.03]' : ''
                          }`}
                          style={{
                            left: `${node.centerX}px`,
                            top: `${node.top}px`,
                            width: `${mobilePathLayout.nodeWidth}px`,
                            transform: isSelected ? 'translateX(-50%) scale(1.03)' : 'translateX(-50%)',
                            '--ring-accent': node.ringColor,
                            '--ring-glow': ringGlow,
                            '--progress-angle': `${progressAngle}deg`,
                            '--ring-size': `${mobilePathLayout.ringSize}px`,
                            '--ring-stroke': `${mobilePathLayout.strokeWidth}px`,
                            '--node-delay': `${Math.max(0, node.idx % 8) * 60}ms`
                          }}
                          aria-label={`Открыть тему ${node.task.title}`}
                          aria-expanded={isSelected}
                        >
                          <div
                            className={`mobile-topic-ring-shell relative mx-auto ${
                              isSelected ? 'mobile-topic-ring-shell--selected' : ''
                            } ${isMastered ? 'mobile-topic-ring-shell--mastered' : ''}`}
                            style={{ height: `${mobilePathLayout.ringSize}px`, width: `${mobilePathLayout.ringSize}px` }}
                          >
                            <div className="mobile-topic-glow absolute inset-[-8px] rounded-full" />
                            <div className="mobile-topic-orbit" />
                            <div className="mobile-topic-conic" />
                            <svg
                              className="relative z-[4] h-full w-full -rotate-90"
                              viewBox={`0 0 ${mobilePathLayout.ringSize} ${mobilePathLayout.ringSize}`}
                              aria-hidden="true"
                            >
                              <circle
                                cx={mobilePathLayout.ringSize / 2}
                                cy={mobilePathLayout.ringSize / 2}
                                r={mobilePathLayout.radius}
                                fill="none"
                                stroke="var(--mobile-ring-track, #d7dee8)"
                                strokeWidth={mobilePathLayout.strokeWidth}
                              />
                              <circle
                                cx={mobilePathLayout.ringSize / 2}
                                cy={mobilePathLayout.ringSize / 2}
                                r={mobilePathLayout.radius}
                                fill="none"
                                stroke={node.ringColor}
                                strokeWidth={mobilePathLayout.strokeWidth}
                                strokeLinecap="round"
                                strokeDasharray={mobilePathLayout.circumference}
                                strokeDashoffset={dashOffset}
                                style={{ transition: 'stroke-dashoffset 420ms ease, stroke 220ms ease' }}
                              />
                            </svg>
                            {node.val > 2 && <span className="mobile-topic-marker" />}
                            <div className="mobile-topic-core absolute inset-[12px] z-[5] rounded-full border border-white/90 bg-gradient-to-br from-white to-purple-50 shadow-[0_12px_22px_rgba(15,23,42,0.18)]" />
                            <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center px-2">
                              <div className="text-[22px] font-black leading-none text-slate-900">№{getTaskDisplayNumber(node.task)}</div>
                              <div className="mt-1 text-[14px] font-bold leading-tight text-slate-600">{`${node.val}%`}</div>
                            </div>
                            <div className="mobile-topic-shine" />
                            {isMastered && <span className="mobile-topic-sparkle" />}
                          </div>
                          <div className="mt-1.5 flex justify-center px-1">
                            <div className={`mobile-topic-label-card max-w-[148px] rounded-xl border border-white/80 bg-white/88 px-2.5 py-1 shadow-[0_7px_14px_rgba(148,163,184,0.22)] ${isSelected ? 'ring-2 ring-purple-200/80' : ''}`}>
                              <div className="text-center text-[12.5px] font-semibold leading-[1.05rem] text-slate-700 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                                {node.title}
                              </div>
                              <div className="mt-1.5 flex justify-center">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${statusTone}`}>
                                  {statusLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={`${role === 'student' ? 'hidden md:grid' : 'grid'} grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 stagger-children`}>
            {taskList.map((task, idx) => {
              const val = progressMap[task.id] || 0;
              const clickable = role === 'student' || role === 'teacher';
              const cardTone = val >= 85
                ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/50'
                : (val >= 60
                    ? 'border-purple-200/90 bg-gradient-to-br from-purple-50/65 via-white to-fuchsia-50/45'
                    : (val >= 40
                        ? 'border-amber-200/90 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/35'
                        : 'border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'));
              const statusLabel = val >= 85 ? 'Сильная тема' : (val >= 60 ? 'В работе' : (val >= 40 ? 'Нужна практика' : 'Зона внимания'));
              return (
                <div key={task.id} style={{ '--i': idx }} className="space-y-2">
                  <Card
                    className={`group relative p-3.5 md:p-4 ${cardTone} ${clickable ? 'cursor-pointer' : ''}`}
                    onClick={
                      clickable
                        ? () => {
                            if (role === 'teacher') setReviewTask(task);
                            else {
                              setForceInitialLevelLaunch(false);
                              setActiveLevel(null);
                              setActiveQuestionIndex(null);
                              setActiveTask(task);
                            }
                          }
                        : undefined
                    }
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-lg border border-purple-200 bg-white/90 px-2 py-1 text-[11px] md:text-xs font-bold text-purple-700">
                        №{getTaskDisplayNumber(task)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[10px] md:text-xs font-semibold text-slate-600">
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      {editingTaskId === task.number ? (
                        <input
                          type="text"
                          value={editingTaskTitle}
                          onChange={(e) => setEditingTaskTitle(e.target.value)}
                          onBlur={() => saveTaskTitle(task)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTaskTitle(task);
                            if (e.key === 'Escape') cancelEditTaskTitle();
                          }}
                          className="w-full px-2 py-1 rounded-lg bg-white border border-purple-200 focus:border-purple-500 outline-none text-sm font-semibold text-gray-800"
                          placeholder="Название темы"
                          autoFocus
                        />
                      ) : (
                        <h3 className="font-bold text-[15px] md:text-base leading-snug text-gray-800">{task.title}</h3>
                      )}
                      {role === 'teacher' && editingTaskId !== task.number && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); startEditTaskTitle(task); }}
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-purple-600 hover:border-purple-200"
                          title="Переименовать тему"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {role === 'teacher' && editingTaskId === task.number && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => { e.stopPropagation(); saveTaskTitle(task); }}
                          className="p-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                          title="Сохранить"
                          disabled={savingTaskTitleId === task.number}
                        >
                          <Save size={14} />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] md:text-xs text-slate-500">
                      <span>
                        <span className="sm:hidden">Тема</span>
                        <span className="hidden sm:inline">Прогресс темы</span>
                      </span>
                      <span className="text-sm md:text-base font-bold text-slate-700">{val}%</span>
                    </div>
                    <ProgressBar value={val} />

                    {role === 'student' && clickable && (
                      <div className="absolute inset-0 hidden md:flex bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center rounded-2xl cursor-pointer backdrop-blur-[2px]">
                        <div className="flex items-center gap-2 text-purple-600 font-bold bg-white px-4 py-2 rounded-full shadow-lg border border-purple-100">
                          <PlayCircle size={20} /> Решать
                        </div>
                      </div>
                    )}
                    {role === 'student' && clickable && (
                      <div className="mt-3 md:hidden text-xs font-semibold text-purple-600">Открыть тему</div>
                    )}
                    {role === 'teacher' && (
                      <div className="mt-3 text-xs font-semibold text-purple-600">Смотреть ответы</div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>

          {role === 'student' && activeTask && (
        <StudentTestModal 
          task={activeTask} 
          onClose={() => {
            setActiveTask(null);
            setAutoLevel(null);
            setAutoTargetQuestions(null);
            setActiveLevel(null);
            setActiveQuestionIndex(null);
            setForceInitialLevelLaunch(false);
          }}
          progress={progressMap}
          studentId={studentId}
          testDb={testsDb}
          initialLevel={autoLevel}
          targetQuestions={autoTargetQuestions}
          initialQuestionIndex={activeQuestionIndex}
          onLevelSelect={setActiveLevel}
          onQuestionChange={setActiveQuestionIndex}
          onStreakSaved={onStreakSaved}
          onXpGain={onXpGain}
          forceInitialLevelLaunch={forceInitialLevelLaunch}
          onComplete={(taskId, score, options) => {
            onUpdateProgress(taskId, score, options);
            // setActiveTask(null); // Убрали закрытие, чтобы можно было решать дальше
          }}
        />
      )}
          {role === 'teacher' && reviewTask && (
            <ProgressReviewModal
              task={reviewTask}
              onClose={() => setReviewTask(null)}
              studentId={effectiveStudentId}
              testDb={testsDb}
            />
          )}
        </>
      )}

      {section === 'notes' && (
        <div className="space-y-3 md:space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-gray-800">Заметки учителя</h3>
            <span className="hidden md:inline text-xs text-gray-400">Комментируйте задания кратко</span>
          </div>
          <div className="md:hidden rounded-2xl border border-purple-100/80 bg-white/90 p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-purple-700">
                {`Всего: ${notesCards.length}`}
              </span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                {`С заметкой: ${notesFilledCount}`}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
                {`Пусто: ${notesEmptyCount}`}
              </span>
            </div>
            <div className="mt-2.5">
              <input
                type="text"
                value={notesMobileQuery}
                onChange={(e) => setNotesMobileQuery(e.target.value.slice(0, 80))}
                placeholder="Поиск по номеру или теме"
                className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-400"
              />
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
              {[
                { id: 'all', label: 'Все' },
                { id: 'filled', label: 'С заметкой' },
                { id: 'empty', label: 'Пустые' }
              ].map((filterItem) => (
                <button
                  key={filterItem.id}
                  type="button"
                  onClick={() => setNotesMobileFilter(filterItem.id)}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                    notesMobileFilter === filterItem.id
                      ? 'bg-purple-600 text-white shadow-sm shadow-purple-200'
                      : 'bg-white text-slate-600 border border-transparent'
                  }`}
                >
                  {filterItem.label}
                </button>
              ))}
            </div>
          </div>

          {filteredNotesCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/75 px-4 py-6 text-center text-sm text-slate-500">
              По этим параметрам заметок не найдено.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 md:gap-3 stagger-children">
              {filteredNotesCards.map(({ task, idx, num, note, hasNote }) => (
                <div
                  key={task.id ?? num}
                  style={{ '--i': idx }}
                  className={`rounded-2xl md:rounded-3xl border p-3 md:p-4 flex flex-col gap-2.5 md:gap-3 transition-all duration-200 shadow-sm hover:shadow-md ${
                    hasNote
                      ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50'
                      : 'border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2.5">
                      <div
                        className={`w-9 h-9 md:w-9 md:h-9 shrink-0 rounded-xl md:rounded-2xl flex items-center justify-center text-sm font-bold ${
                          hasNote ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                      >
                        {getTaskDisplayNumber(task)}
                      </div>
                      <div className="min-w-0">
                        <span className={`text-xs font-semibold ${hasNote ? 'text-emerald-700' : 'text-gray-400'}`}>
                          {hasNote ? 'Есть заметка' : 'Пусто'}
                        </span>
                        <div className="mt-0.5 text-[11px] leading-tight text-slate-500 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                          {task.title}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {role === 'teacher' && hasNote && notesSavingId !== num && (
                        <button
                          type="button"
                          onClick={() => saveTaskNote(num, '')}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-600"
                        >
                          Очистить
                        </button>
                      )}
                      {notesSavingId === num && (
                        <span className="text-[10px] text-gray-400">Сохранение…</span>
                      )}
                    </div>
                  </div>
                  {role === 'teacher' ? (
                    <>
                      <textarea
                        value={note}
                        onChange={(e) => {
                          const value = e.target.value.slice(0, 80);
                          const keys = getNotesTaskKeys(num);
                          if (!keys.length) return;
                          setStudentData((prev) => ({
                            ...prev,
                            notesByTask: (() => {
                              const nextNotes = { ...(prev.notesByTask || {}) };
                              keys.forEach((key) => { if (key !== keys[0]) delete nextNotes[key]; });
                              nextNotes[keys[0]] = value;
                              return nextNotes;
                            })()
                          }));
                        }}
                        onBlur={(e) => saveTaskNote(num, e.target.value.trim())}
                        placeholder="Комментарий..."
                        className={`w-full min-h-[92px] md:min-h-[70px] text-[13px] md:text-xs px-3 py-2.5 rounded-2xl border outline-none resize-none transition-colors ${
                          hasNote
                            ? 'bg-white/80 border-emerald-200 focus:border-emerald-500'
                            : 'bg-white border-gray-200 focus:border-purple-500'
                        }`}
                      />
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Автосохранение при выходе из поля</span>
                        <span>{`${note.length}/80`}</span>
                      </div>
                    </>
                  ) : (
                    <div className={`text-[13px] md:text-xs min-h-[70px] whitespace-pre-wrap ${hasNote ? 'text-gray-700' : 'text-gray-400'}`}>
                      {hasNote ? note : 'Нет заметки'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'mocks' && (
        <div className="space-y-4 md:space-y-6">
          <Card className="space-y-3 md:space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Пробники для решения</h3>
                <p className="hidden md:block text-xs text-gray-500">Примерно такое будет на экзамене.</p>
              </div>
              {role === 'teacher' && (
                <div className="flex w-full sm:w-auto flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={newMockTitle}
                    onChange={(e) => setNewMockTitle(e.target.value)}
                    placeholder="Название пробника"
                    className="w-full sm:w-auto px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                  />
                  <Button onClick={handleCreateMockExam} className="w-full sm:w-auto">
                    <Plus size={16}/> Создать
                  </Button>
                </div>
              )}
            </div>

            {mockExamsError && <div className="text-xs text-red-500">{mockExamsError}</div>}
            {role === 'student' && mockAttemptsLoading && (
              <div className="text-xs text-gray-400">Обновляем прогресс...</div>
            )}
            {mockExamsLoading ? (
              <div className="text-sm text-gray-500">Загрузка пробников...</div>
            ) : (
              <div className="space-y-2">
                {visibleMockExams.length === 0 ? (
                  <div className="text-gray-500">Пробников пока нет.</div>
                ) : (
                  visibleMockExams.map((exam) => {
                    const attempt = mockAttemptsByExam?.[exam.id];
                    const primary = getPrimaryScoreFromSolved(attempt?.solved);
                    const secondary = getSecondaryScoreFromPrimary(primary);
                    const access = normalizeMockExamAccess(exam.access, LEGACY_MOCK_EXAM_ACCESS);
                    const accessLabel = access.all
                      ? 'Доступ: всем'
                      : access.students.length > 0
                        ? `Доступ: ${access.students.length} ученикам`
                        : 'Скрыт от учеников';
                    return (
                      <div key={exam.id} className="bg-white rounded-xl border p-3 md:p-4 flex flex-col gap-3">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-800">{exam.title}</p>
                          {role === 'student' && (
                            <p className="text-xs text-gray-500">{`Баллы: ${secondary} (${primary} перв.)`}</p>
                          )}
                          {role === 'teacher' && (
                            <p className="text-xs text-gray-500">{accessLabel}</p>
                          )}
                        </div>
                        <div className="flex w-full md:w-auto flex-wrap items-center gap-2">
                          {role === 'teacher' && (
                            <>
                              <Button variant="secondary" onClick={() => setMockEditorExam(exam)} className="w-full sm:w-auto">Редактировать</Button>
                              <Button variant="secondary" onClick={() => openMockAccessEditor(exam)} className="w-full sm:w-auto">Доступ</Button>
                              <button
                                onClick={() => handleDeleteMockExamDefinition(exam.id)}
                                className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                          <Button onClick={() => handleOpenMockExam(exam)} className="w-full sm:w-auto">
                            {role === 'teacher' ? 'Открыть' : 'Решать'}
                          </Button>
                        </div>
                        </div>
                        {role === 'teacher' && mockAccessExamId === exam.id && (
                          <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4 space-y-3">
                            <div className="text-xs font-semibold text-gray-500">Доступ к пробнику</div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                checked={mockAccessAll}
                                onChange={(e) => setMockAccessAll(e.target.checked)}
                              />
                              Всем ученикам
                            </label>
                            {!mockAccessAll && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                                {studentsList.map((student) => {
                                  const studentIdValue = String(student.id);
                                  const isChecked = mockAccessStudents.includes(studentIdValue);
                                  return (
                                    <label key={student.id} className="flex items-center gap-2 text-sm text-gray-600">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                        checked={isChecked}
                                        onChange={() => toggleMockAccessStudent(studentIdValue)}
                                      />
                                      <span className="truncate">{student.nickname || student.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <Button variant="secondary" onClick={closeMockAccessEditor} disabled={mockAccessSaving}>Закрыть</Button>
                              <Button onClick={handleSaveMockAccess} disabled={mockAccessSaving}>
                                {mockAccessSaving ? 'Сохранение...' : 'Сохранить доступ'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </Card>

          {role === 'teacher' && (
            <Card className="space-y-3">
              <h3 className="text-lg font-bold text-gray-800">Добавить результат пробника</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="date"
                  value={mockForm.date}
                  onChange={(e) => setMockForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={mockForm.score}
                  onChange={(e) => setMockForm((prev) => ({ ...prev, score: e.target.value }))}
                  placeholder="Баллы (0-100)"
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                />
                <input
                  type="text"
                  value={mockForm.comment}
                  onChange={(e) => setMockForm((prev) => ({ ...prev, comment: e.target.value }))}
                  placeholder="Комментарий"
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                />
              </div>
              <Button onClick={handleAddMock}>
                <Plus size={16}/> Добавить
              </Button>
            </Card>
          )}

          <div className="space-y-2">
            {(studentData.mocks || []).length === 0 ? (
              <div className="text-gray-500">Истории пробников пока нет.</div>
            ) : (
              studentData.mocks.map((mock) => (
                <div key={mock.id} className="bg-white rounded-xl border p-3 md:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">Пробник от {mock.date}</p>
                    <p className="text-sm text-gray-500">Баллы: <span className="font-bold text-purple-600">{mock.score}</span></p>
                    {mock.comment && <p className="text-sm text-gray-600 mt-1">{mock.comment}</p>}
                  </div>
                  {role === 'teacher' && (
                    <button
                      onClick={() => handleDeleteMock(mock.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {mockEditorExam && (
            <MockExamEditorModal
              exam={mockEditorExam}
              onClose={() => setMockEditorExam(null)}
              onSave={handleSaveMockExam}
            />
          )}

          {activeMockExam && (
            <MockExamModal
              exam={activeMockExam}
              studentId={effectiveStudentId}
              initialAttempt={activeMockAttempt}
              onAttemptSaved={(examId, attempt) => {
                setActiveMockAttempt(attempt);
                setMockAttemptsByExam((prev) => ({ ...prev, [examId]: attempt }));
                onMockAttemptSaved?.(examId, attempt);
              }}
              onClose={() => {
                mockAttemptRequestIdRef.current += 1;
                setActiveMockExam(null);
                setActiveMockAttempt(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

const PythonSection = ({
  progress,
  onUpdateProgress,
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  openTask,
  onOpenTaskHandled,
  onTaskStateChange,
  onStreakSaved,
  onXpGain
}) => {
  const taskList = PYTHON_TASKS;
  const [activeTask, setActiveTask] = useState(null);
  const [reviewTask, setReviewTask] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(null);
  const [studentData, setStudentData] = useState({ progress: {} });
  const [dataError, setDataError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [manageTaskNumber, setManageTaskNumber] = useState(taskList[0]?.number || '');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPrompt, setNewTaskPrompt] = useState('');
  const [newStarterCode, setNewStarterCode] = useState('');
  const [newTests, setNewTests] = useState([{ input: '', output: '' }]);
  const [testsFileName, setTestsFileName] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [theoryType, setTheoryType] = useState('text');
  const [theoryText, setTheoryText] = useState('');
  const [theoryUrl, setTheoryUrl] = useState('');
  const [theorySaving, setTheorySaving] = useState(false);
  const [theoryError, setTheoryError] = useState('');
  const [showTeacherTaskToolsMobile, setShowTeacherTaskToolsMobile] = useState(false);
  const [showTeacherTheoryToolsMobile, setShowTeacherTheoryToolsMobile] = useState(false);
  const mobilePythonPathCanvasRef = useRef(null);
  const [mobilePythonPathCanvasWidth, setMobilePythonPathCanvasWidth] = useState(0);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;

  useEffect(() => {
    if (!effectiveStudentId) {
      setStudentData({ progress: {} });
      return;
    }
    let cancelled = false;
    api.getStudentData(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setStudentData({ progress: data?.progress || {} });
        setDataError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    setReviewTask(null);
    setActiveTask(null);
    setActiveQuestionIndex(null);
  }, [effectiveStudentId]);

  useEffect(() => {
    setShowTeacherTaskToolsMobile(false);
    setShowTeacherTheoryToolsMobile(false);
  }, [effectiveStudentId, role]);

  useEffect(() => {
    let cancelled = false;
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestsDb(data && typeof data === 'object' ? data : {});
        setTestsDbError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsDb({});
        setTestsDbError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (role !== 'student' || !openTask) return;
    if (!isPythonTaskNumber(openTask.taskNumber)) {
      onOpenTaskHandled?.();
      return;
    }
    const target = taskList.find((task) => Number(task.number) === Number(openTask.taskNumber));
    if (!target) {
      onOpenTaskHandled?.();
      return;
    }
    setActiveTask(target);
    if (Number.isFinite(openTask.questionIndex)) {
      setActiveQuestionIndex(openTask.questionIndex);
    } else {
      setActiveQuestionIndex(null);
    }
    onOpenTaskHandled?.();
  }, [openTask, role, taskList, onOpenTaskHandled]);

  useEffect(() => {
    if (role !== 'student') return;
    if (!activeTask) {
      if (openTask) return;
      onTaskStateChange?.(null);
      return;
    }
    onTaskStateChange?.({
      taskNumber: activeTask.number,
      levelId: PYTHON_LEVEL_ID,
      targetQuestions: null,
      section: 'python',
      questionIndex: Number.isFinite(activeQuestionIndex) ? activeQuestionIndex : null
    });
  }, [activeTask, activeQuestionIndex, role, onTaskStateChange, openTask]);

  useEffect(() => {
    if (!taskList.length) return;
    if (!taskList.some((task) => task.number === manageTaskNumber)) {
      setManageTaskNumber(taskList[0].number);
    }
    setEditingQuestionId(null);
    setReviewTask(null);
    setNewTaskTitle('');
    setNewTaskPrompt('');
    setNewStarterCode('');
    setNewTests([{ input: '', output: '' }]);
    setTestsFileName('');
    setQuestionError('');
    setTheoryError('');
  }, [taskList, manageTaskNumber]);

  useEffect(() => {
    if (!manageTaskNumber) return;
    const theory = testsDb?.[manageTaskNumber]?.pythonTheory || {};
    const type = theory?.type === 'gdoc' ? 'gdoc' : 'text';
    setTheoryType(type);
    setTheoryText(type === 'text' ? String(theory?.content || '') : '');
    setTheoryUrl(type === 'gdoc' ? String(theory?.content || '') : '');
    setTheoryError('');
  }, [testsDb, manageTaskNumber]);

  useLayoutEffect(() => {
    if (role !== 'student') return undefined;
    const element = mobilePythonPathCanvasRef.current;
    if (!element) return undefined;
    const updateWidth = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      if (!Number.isFinite(width) || width <= 0) return;
      setMobilePythonPathCanvasWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
    };
    updateWidth();

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
      return () => observer.disconnect();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    return undefined;
  }, [role, taskList.length]);

  const progressMap = role === 'teacher'
    ? (studentData.progress || {})
    : (Object.keys(progress || {}).length ? progress : (studentData.progress || {}));

  const manageQuestions = manageTaskNumber
    ? (testsDb?.[manageTaskNumber]?.[PYTHON_LEVEL_ID] || [])
    : [];

  const handleSavePythonTask = async () => {
    if (role !== 'teacher') return;
    const question = newTaskPrompt.trim();
    const title = newTaskTitle.trim();
    const starterCode = newStarterCode.trim();
    if (!manageTaskNumber) return;
    const preparedTests = newTests
      .map((test) => ({
        input: String(test?.input ?? '').trimEnd(),
        output: String(test?.output ?? '').trimEnd(),
      }))
      .filter((test) => test.input || test.output);
    if (!question) {
      setQuestionError('Введите условие задачи.');
      return;
    }
    if (preparedTests.length === 0 || preparedTests.some((test) => !test.output)) {
      setQuestionError('Добавьте хотя бы один тест и заполните ожидаемый вывод.');
      return;
    }
    const updatedDb = { ...(testsDb || {}) };
    if (!updatedDb[manageTaskNumber]) updatedDb[manageTaskNumber] = {};
    if (!Array.isArray(updatedDb[manageTaskNumber][PYTHON_LEVEL_ID])) {
      updatedDb[manageTaskNumber][PYTHON_LEVEL_ID] = [];
    }
    const list = updatedDb[manageTaskNumber][PYTHON_LEVEL_ID];
    if (editingQuestionId) {
      const idx = list.findIndex((item) => item.id === editingQuestionId);
      if (idx === -1) {
        setQuestionError('Не удалось найти задачу для редактирования.');
        return;
      }
      list[idx] = {
        ...list[idx],
        title,
        question,
        starterCode,
        tests: preparedTests
      };
    } else {
      list.push({
        id: Date.now(),
        title,
        question,
        starterCode,
        tests: preparedTests
      });
    }
    setQuestionSaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setNewTaskTitle('');
      setNewTaskPrompt('');
      setNewStarterCode('');
      setNewTests([{ input: '', output: '' }]);
      setQuestionError('');
      setEditingQuestionId(null);
      setTestsFileName('');
    } catch (err) {
      setQuestionError(err?.message || err);
    } finally {
      setQuestionSaving(false);
    }
  };

  const startEditPythonTask = (task) => {
    if (!task) return;
    setEditingQuestionId(task.id);
    setNewTaskTitle(task.title || '');
    setNewTaskPrompt(task.question || '');
    setNewStarterCode(task.starterCode || '');
    if (Array.isArray(task.tests) && task.tests.length > 0) {
      setNewTests(task.tests.map((test) => ({
        input: String(test?.input ?? ''),
        output: String(test?.output ?? '')
      })));
    } else if (task.answer) {
      setNewTests([{ input: '', output: String(task.answer) }]);
    } else {
      setNewTests([{ input: '', output: '' }]);
    }
    setQuestionError('');
    setTestsFileName('');
  };

  const cancelEditPythonTask = () => {
    setEditingQuestionId(null);
    setNewTaskTitle('');
    setNewTaskPrompt('');
    setNewStarterCode('');
    setNewTests([{ input: '', output: '' }]);
    setTestsFileName('');
    setQuestionError('');
  };

  const handleTestsFileUpload = (file) => {
    if (!file) return;
    setQuestionError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseTestsFileContent(reader.result);
        if (!parsed.length || parsed.some((test) => !test.output)) {
          setQuestionError('Неверный формат тестов: проверьте наличие ожидаемого вывода.');
          return;
        }
        setNewTests(parsed);
        setTestsFileName(file.name);
      } catch (err) {
        setQuestionError(err?.message || 'Не удалось прочитать файл с тестами.');
      }
    };
    reader.onerror = () => {
      setQuestionError('Не удалось прочитать файл с тестами.');
    };
    reader.readAsText(file);
  };

  const handleSavePythonTheory = async () => {
    if (role !== 'teacher') return;
    if (!manageTaskNumber) return;
    const raw = theoryType === 'gdoc' ? theoryUrl.trim() : theoryText.trim();
    if (!raw) {
      setTheoryError('Добавьте текст теории или ссылку на Google Docs.');
      return;
    }
    let content = raw;
    if (theoryType === 'gdoc') {
      const embedUrl = buildGoogleDocEmbedUrl(raw);
      if (!embedUrl) {
        setTheoryError('Нужна ссылка на Google Docs (поддерживаются ссылки на документ или iframe).');
        return;
      }
      content = embedUrl;
      setTheoryUrl(embedUrl);
    }
    const updatedDb = { ...(testsDb || {}) };
    if (!updatedDb[manageTaskNumber]) updatedDb[manageTaskNumber] = {};
    updatedDb[manageTaskNumber] = {
      ...(updatedDb[manageTaskNumber] || {}),
      pythonTheory: { type: theoryType, content }
    };
    setTheorySaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setTheoryError('');
    } catch (err) {
      setTheoryError(err?.message || err);
    } finally {
      setTheorySaving(false);
    }
  };

  const handleClearPythonTheory = async () => {
    if (role !== 'teacher') return;
    if (!manageTaskNumber) return;
    const updatedDb = { ...(testsDb || {}) };
    if (!updatedDb[manageTaskNumber]) updatedDb[manageTaskNumber] = {};
    const { pythonTheory, ...rest } = updatedDb[manageTaskNumber] || {};
    updatedDb[manageTaskNumber] = { ...rest };
    setTheorySaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setTheoryText('');
      setTheoryUrl('');
      setTheoryError('');
    } catch (err) {
      setTheoryError(err?.message || err);
    } finally {
      setTheorySaving(false);
    }
  };

  const handleDeletePythonQuestion = async (taskNumber, questionId) => {
    if (role !== 'teacher') return;
    if (!confirm('Удалить эту задачу?')) return;
    const updatedDb = { ...(testsDb || {}) };
    const list = Array.isArray(updatedDb?.[taskNumber]?.[PYTHON_LEVEL_ID])
      ? updatedDb[taskNumber][PYTHON_LEVEL_ID]
      : [];
    updatedDb[taskNumber] = {
      ...(updatedDb[taskNumber] || {}),
      [PYTHON_LEVEL_ID]: list.filter((q) => q.id !== questionId)
    };
    setQuestionSaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
    } catch (err) {
      setQuestionError(err?.message || err);
    } finally {
      setQuestionSaving(false);
    }
  };

  const totalMastery = (() => {
    if (!taskList.length) return 0;
    const total = taskList.reduce((sum, task) => {
      const val = Number(progressMap[task.id] || 0);
      return sum + (Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0);
    }, 0);
    return Math.round((total / taskList.length) * 10) / 10;
  })();
  const totalMasteryRounded = Math.round(totalMastery);
  const totalMasteryLabel = Number.isFinite(totalMastery) && totalMastery % 1 !== 0
    ? totalMastery.toFixed(1)
    : totalMasteryRounded.toString();
  const masteredTopicsCount = taskList.filter((task) => Number(progressMap[task.id] || 0) >= 70).length;
  const needsPracticeTopicsCount = taskList.filter((task) => Number(progressMap[task.id] || 0) < 40).length;
  const mobilePythonPathLayout = useMemo(() => {
    const ringSize = 124;
    const strokeWidth = 10;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const labelGap = 7;
    const labelHeight = 42;
    const topPadding = 10;
    const bottomPadding = 24;
    const nodeWidth = 156;
    const labelBoxWidth = 154;
    const pathWidth = Math.max(296, Math.round(mobilePythonPathCanvasWidth || 336));
    const xPattern = [22, 74, 34, 70, 28, 76, 40, 68, 30, 74, 42, 66];
    const stepPattern = [136, 148, 142, 156, 138, 150, 144, 152, 140, 154];
    const connectorPresets = [
      { sway: 22, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 18, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -19, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 20, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -22, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 17, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
    ];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const pointInRect = (x, y, rect) => (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
    const segmentHitsRect = (x1, y1, x2, y2, rect) => {
      if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
      const steps = 30;
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const x = x1 + ((x2 - x1) * t);
        const y = y1 + ((y2 - y1) * t);
        if (pointInRect(x, y, rect)) return true;
      }
      return false;
    };
    const nodeHalfWidth = nodeWidth / 2;
    const centerMin = nodeHalfWidth + 4;
    const centerMax = Math.max(centerMin, pathWidth - nodeHalfWidth - 4);
    let currentTop = topPadding;
    const nodes = taskList.map((task, idx) => {
      const rawVal = Number(progressMap[task.id] || 0);
      const val = Number.isFinite(rawVal) ? Math.max(0, Math.min(100, rawVal)) : 0;
      const ringColor = val >= 85
        ? '#10b981'
        : (val >= 60 ? '#8b5cf6' : (val >= 40 ? '#f59e0b' : '#9ca3af'));
      const numericSeed = Number(task?.number);
      const seed = Number.isFinite(numericSeed) ? numericSeed : (idx + 1);
      const jitter = ((seed * 13) % 11) - 5;
      const xBase = clamp(xPattern[idx % xPattern.length] + jitter, 20, 80);
      const centerX = clamp((xBase / 100) * pathWidth, centerMin, centerMax);
      const top = currentTop;
      const centerY = top + (ringSize / 2);
      currentTop += stepPattern[idx % stepPattern.length];
      const compactTitle = String(task.title || '').replace(/\s+/g, ' ').trim();
      const title = compactTitle.length > 52 ? `${compactTitle.slice(0, 52)}...` : compactTitle;
      const labelTop = top + ringSize + labelGap;
      const labelLeft = centerX - (labelBoxWidth / 2);
      const labelRight = centerX + (labelBoxWidth / 2);
      const labelBottom = labelTop + labelHeight;
      return {
        task,
        idx,
        val,
        ringColor,
        centerX,
        centerY,
        top,
        labelTop,
        labelLeft,
        labelRight,
        labelBottom,
        title
      };
    });
    const curves = nodes.slice(0, -1).map((node, idx) => {
      const next = nodes[idx + 1];
      const preset = connectorPresets[idx % connectorPresets.length];
      const deltaX = next.centerX - node.centerX;
      const deltaY = next.centerY - node.centerY;
      const distance = Math.max(0.001, Math.hypot(deltaX, deltaY));
      const unitX = deltaX / distance;
      const unitY = deltaY / distance;
      const anchorOffset = (ringSize / 2) + (strokeWidth / 2) + 2;
      const startX = node.centerX + (unitX * anchorOffset);
      const startY = node.centerY + (unitY * anchorOffset);
      const endX = next.centerX - (unitX * anchorOffset);
      const endY = next.centerY - (unitY * anchorOffset);

      const currentLabelRect = {
        left: node.labelLeft - 4,
        right: node.labelRight + 4,
        top: node.labelTop - 4,
        bottom: node.labelBottom + 4
      };
      const nextLabelRect = {
        left: next.labelLeft - 4,
        right: next.labelRight + 4,
        top: next.labelTop - 4,
        bottom: next.labelBottom + 4
      };
      const shouldBypassLabels = segmentHitsRect(startX, startY, endX, endY, currentLabelRect)
        || segmentHitsRect(startX, startY, endX, endY, nextLabelRect);
      if (!shouldBypassLabels) {
        return {
          id: `${node.task.id}-${next.task.id}`,
          d: `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${endX.toFixed(2)} ${endY.toFixed(2)}`
        };
      }

      const safeY = Math.min(node.labelTop, next.labelTop) - 16;
      const straightMidY = (startY + endY) / 2;
      const requiredLift = Math.max(0, straightMidY - safeY + 4);
      const tangentOut = clamp(distance * (0.23 + preset.pullA * 0.45), 18, 34);
      const tangentIn = clamp(distance * (0.23 + preset.pullB * 0.45), 18, 34);
      const baseC1X = startX + (unitX * tangentOut);
      const baseC1Y = startY + (unitY * tangentOut);
      const baseC2X = endX - (unitX * tangentIn);
      const baseC2Y = endY - (unitY * tangentIn);
      const nearVertical = Math.abs(deltaX) < 72 && Math.abs(deltaY) > 36;
      const swayFactor = nearVertical
        ? Math.max(0.28, Math.min(0.9, (72 - Math.abs(deltaX)) / 72))
        : 0.18;
      const lateral = preset.sway * swayFactor * 0.34;
      const lift = clamp((preset.lift * 0.58) + requiredLift, 8, 30);
      let c1x = clamp(baseC1X + lateral, 8, pathWidth - 8);
      let c2x = clamp(baseC2X - (lateral * 0.78), 8, pathWidth - 8);
      let c1y = baseC1Y - lift;
      let c2y = baseC2Y - (lift * 0.92);
      const yOvershoot = Math.max(c1y - safeY, c2y - safeY, 0);
      if (yOvershoot > 0) {
        c1y -= yOvershoot;
        c2y -= yOvershoot;
      }
      const minCurveY = Math.min(startY, endY) - 58;
      c1y = Math.max(minCurveY, c1y);
      c2y = Math.max(minCurveY + 6, c2y);
      const minControlGap = Math.max(8, Math.abs(deltaX) * 0.06);
      if (deltaX >= 0 && c2x < c1x + minControlGap) {
        const mid = (c1x + c2x) / 2;
        c1x = clamp(mid - (minControlGap / 2), 8, pathWidth - 8);
        c2x = clamp(mid + (minControlGap / 2), 8, pathWidth - 8);
      } else if (deltaX < 0 && c2x > c1x - minControlGap) {
        const mid = (c1x + c2x) / 2;
        c1x = clamp(mid + (minControlGap / 2), 8, pathWidth - 8);
        c2x = clamp(mid - (minControlGap / 2), 8, pathWidth - 8);
      }
      return {
        id: `${node.task.id}-${next.task.id}`,
        d: `M ${startX.toFixed(2)} ${startY.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${endX.toFixed(2)} ${endY.toFixed(2)}`
      };
    });
    const lastNode = nodes[nodes.length - 1];
    const height = lastNode
      ? Math.round(lastNode.top + ringSize + labelGap + labelHeight + bottomPadding)
      : 200;
    return {
      nodes,
      curves,
      width: pathWidth,
      height,
      nodeWidth,
      ringSize,
      strokeWidth,
      radius,
      circumference
    };
  }, [taskList, progressMap, mobilePythonPathCanvasWidth]);

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Ученик:</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  if (role === 'teacher' && studentsList.length === 0) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Изучение Python</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">
          {studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'}
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Изучение Python</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">Выберите ученика, чтобы посмотреть его прогресс.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3 md:gap-5">
          <div className="flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2.5 md:space-y-3">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">Изучение Python</h2>
                <p className="hidden md:block text-sm text-slate-600">Тестирования по темам курса и общий прогресс</p>
              </div>
              <div className="flex flex-wrap gap-1.5 md:gap-2 text-[11px] md:text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-white/90 px-2 py-1 md:px-2.5 text-purple-700">
                  <BarChart2 size={13} />
                  <span className="sm:hidden">{`Прогресс: ${totalMasteryLabel}%`}</span>
                  <span className="hidden sm:inline">{`Общий прогресс: ${totalMasteryLabel}%`}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/90 px-2 py-1 md:px-2.5 text-emerald-700">
                  <CheckCircle size={13} />
                  <span className="sm:hidden">{`Увер.: ${masteredTopicsCount}/${taskList.length}`}</span>
                  <span className="hidden sm:inline">{`Уверенно: ${masteredTopicsCount}/${taskList.length}`}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white/90 px-2 py-1 md:px-2.5 text-amber-700">
                  <RefreshCcw size={12} />
                  {`Подтянуть: ${needsPracticeTopicsCount}`}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {renderStudentPicker()}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-purple-200/80 bg-white/80 p-3 md:p-4 shadow-[0_10px_24px_rgba(99,102,241,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-600 px-2.5 py-1 text-[10px] md:text-xs font-bold uppercase tracking-[0.14em] md:tracking-widest text-white">
                  Прогресс Python
                </div>
                <span className="hidden md:inline text-sm text-gray-500">Общий прогресс изучения</span>
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-purple-700 drop-shadow-sm">
                {totalMasteryLabel}%
              </div>
            </div>
            <div className="relative mt-2.5 md:mt-3 h-6 md:h-8 w-full overflow-hidden rounded-full border border-purple-100 bg-white/90">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_18px_rgba(168,85,247,0.45)] transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, Number(totalMastery) || 0))}%` }}
              />
              <div
                key={`sheen-python-${totalMasteryRounded}`}
                className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.6),transparent)] animate-sheen"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] md:text-xs text-gray-500">
              <span className="hidden sm:inline">Проходите темы последовательно</span>
              <span className="sm:hidden">Идите по темам по порядку</span>
              <span>0% — старт • 100% — уверенно</span>
            </div>
          </div>
        </div>
      </div>

      {(dataError || testsDbError) && (
        <div className="space-y-2">
          {dataError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-600">
              {dataError}
            </div>
          )}
          {testsDbError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-700">
              {testsDbError}
            </div>
          )}
        </div>
      )}

      {role === 'student' && (
        <div className="md:hidden">
          <div className="mobile-topic-path-card rounded-3xl border border-purple-200/80 bg-white/85 p-3 shadow-[0_10px_24px_rgba(99,102,241,0.12)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">Путь по темам Python</h3>
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-semibold text-purple-700">
                {`Средний: ${totalMasteryLabel}%`}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">Открывай темы по очереди и закрепляй прогресс.</div>
            <div className="mt-3">
              <div
                ref={mobilePythonPathCanvasRef}
                className="mobile-topic-path-canvas relative overflow-visible rounded-2xl border border-purple-100/80 bg-gradient-to-b from-white/95 via-purple-50/55 to-sky-50/45 px-1.5 py-2"
                style={{ height: `${mobilePythonPathLayout.height}px` }}
              >
                <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
                  <svg
                    className="h-full w-full"
                    viewBox={`0 0 ${mobilePythonPathLayout.width} ${mobilePythonPathLayout.height}`}
                    preserveAspectRatio="none"
                  >
                    {mobilePythonPathLayout.curves.map((curve, curveIdx) => (
                      <path
                        key={`mobile-python-curve-${curve.id}`}
                        d={curve.d}
                        fill="none"
                        stroke="var(--mobile-path-curve, rgba(168,85,247,0.44))"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeDasharray={curveIdx % 2 === 0 ? '7.5 6.4' : '6.8 6'}
                      />
                    ))}
                  </svg>
                </div>
                {mobilePythonPathLayout.nodes.map((node) => {
                  const dashOffset = mobilePythonPathLayout.circumference - (node.val / 100) * mobilePythonPathLayout.circumference;
                  const isSelected = String(activeTask?.id) === String(node.task.id);
                  const isMastered = node.val >= 85;
                  const isStable = node.val >= 60 && node.val < 85;
                  const isWarmingUp = node.val >= 40 && node.val < 60;
                  const ringGlow = isMastered
                    ? 'rgba(16,185,129,0.34)'
                    : (isStable ? 'rgba(139,92,246,0.34)' : (isWarmingUp ? 'rgba(245,158,11,0.34)' : 'rgba(148,163,184,0.26)'));
                  const progressAngle = Math.max(0, Math.min(360, Number(node.val || 0) * 3.6));
                  const statusLabel = isMastered
                    ? 'Сильная'
                    : (isStable ? 'В темпе' : (isWarmingUp ? 'Практика' : 'Фокус'));
                  const statusTone = isMastered
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : (isStable
                        ? 'border-purple-200 bg-purple-50 text-purple-700'
                        : (isWarmingUp
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'));
                  return (
                    <button
                      key={`mobile-python-path-${node.task.id}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveQuestionIndex(null);
                        setActiveTask(node.task);
                      }}
                      className={`mobile-path-node group absolute z-10 rounded-2xl bg-transparent px-1 transition-transform ${
                        isSelected ? 'mobile-path-node--selected scale-[1.03]' : ''
                      }`}
                      style={{
                        left: `${node.centerX}px`,
                        top: `${node.top}px`,
                        width: `${mobilePythonPathLayout.nodeWidth}px`,
                        transform: isSelected ? 'translateX(-50%) scale(1.03)' : 'translateX(-50%)',
                        '--ring-accent': node.ringColor,
                        '--ring-glow': ringGlow,
                        '--progress-angle': `${progressAngle}deg`,
                        '--ring-size': `${mobilePythonPathLayout.ringSize}px`,
                        '--ring-stroke': `${mobilePythonPathLayout.strokeWidth}px`,
                        '--node-delay': `${Math.max(0, node.idx % 8) * 60}ms`
                      }}
                      aria-label={`Открыть тему ${node.task.title}`}
                    >
                      <div
                        className={`mobile-topic-ring-shell relative mx-auto ${
                          isSelected ? 'mobile-topic-ring-shell--selected' : ''
                        } ${isMastered ? 'mobile-topic-ring-shell--mastered' : ''}`}
                        style={{ height: `${mobilePythonPathLayout.ringSize}px`, width: `${mobilePythonPathLayout.ringSize}px` }}
                      >
                        <div className="mobile-topic-glow absolute inset-[-8px] rounded-full" />
                        <div className="mobile-topic-orbit" />
                        <div className="mobile-topic-conic" />
                        <svg
                          className="relative z-[4] h-full w-full -rotate-90"
                          viewBox={`0 0 ${mobilePythonPathLayout.ringSize} ${mobilePythonPathLayout.ringSize}`}
                          aria-hidden="true"
                        >
                          <circle
                            cx={mobilePythonPathLayout.ringSize / 2}
                            cy={mobilePythonPathLayout.ringSize / 2}
                            r={mobilePythonPathLayout.radius}
                            fill="none"
                            stroke="var(--mobile-ring-track, #d7dee8)"
                            strokeWidth={mobilePythonPathLayout.strokeWidth}
                          />
                          <circle
                            cx={mobilePythonPathLayout.ringSize / 2}
                            cy={mobilePythonPathLayout.ringSize / 2}
                            r={mobilePythonPathLayout.radius}
                            fill="none"
                            stroke={node.ringColor}
                            strokeWidth={mobilePythonPathLayout.strokeWidth}
                            strokeLinecap="round"
                            strokeDasharray={mobilePythonPathLayout.circumference}
                            strokeDashoffset={dashOffset}
                            style={{ transition: 'stroke-dashoffset 420ms ease, stroke 220ms ease' }}
                          />
                        </svg>
                        {node.val > 2 && <span className="mobile-topic-marker" />}
                        <div className="mobile-topic-core absolute inset-[12px] z-[5] rounded-full border border-white/90 bg-gradient-to-br from-white to-purple-50 shadow-[0_12px_22px_rgba(15,23,42,0.18)]" />
                        <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center px-2">
                          <div className="text-[22px] font-black leading-none text-slate-900">№{getTaskDisplayNumber(node.task)}</div>
                          <div className="mt-1 text-[14px] font-bold leading-tight text-slate-600">{`${node.val}%`}</div>
                        </div>
                        <div className="mobile-topic-shine" />
                        {isMastered && <span className="mobile-topic-sparkle" />}
                      </div>
                      <div className="mt-1.5 flex justify-center px-1">
                        <div className={`mobile-topic-label-card max-w-[148px] rounded-xl border border-white/80 bg-white/88 px-2.5 py-1 shadow-[0_7px_14px_rgba(148,163,184,0.22)] ${isSelected ? 'ring-2 ring-purple-200/80' : ''}`}>
                          <div className="text-center text-[12.5px] font-semibold leading-[1.05rem] text-slate-700 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                            {node.title}
                          </div>
                          <div className="mt-1.5 flex justify-center">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${statusTone}`}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`${role === 'student' ? 'hidden md:grid' : 'grid'} grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 stagger-children`}>
        {taskList.map((task, idx) => {
          const val = progressMap[task.id] || 0;
          const clickable = role === 'student' || role === 'teacher';
          const cardTone = val >= 85
            ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/50'
            : (val >= 60
                ? 'border-purple-200/90 bg-gradient-to-br from-purple-50/65 via-white to-fuchsia-50/45'
                : (val >= 40
                    ? 'border-amber-200/90 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/35'
                    : 'border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'));
          const statusLabel = val >= 85 ? 'Сильная тема' : (val >= 60 ? 'В работе' : (val >= 40 ? 'Нужна практика' : 'Зона внимания'));
          return (
            <Card
              key={task.id}
              style={{ '--i': idx }}
              className={`group relative p-3.5 md:p-4 ${cardTone}`}
              onClick={clickable ? () => {
                if (role === 'teacher') setReviewTask(task);
                else {
                  setActiveQuestionIndex(null);
                  setActiveTask(task);
                }
              } : undefined}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-lg border border-purple-200 bg-white/90 px-2 py-1 text-[11px] md:text-xs font-bold text-purple-700">
                  №{getTaskDisplayNumber(task)}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[10px] md:text-xs font-semibold text-slate-600">
                  {statusLabel}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-[15px] md:text-base leading-snug text-gray-800">{task.title}</h3>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] md:text-xs text-slate-500">
                <span>
                  <span className="sm:hidden">Тема</span>
                  <span className="hidden sm:inline">Прогресс темы</span>
                </span>
                <span className="text-sm md:text-base font-bold text-slate-700">{val}%</span>
              </div>
              <ProgressBar value={val} />

              {clickable && (
                <div className="absolute inset-0 hidden md:flex bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center rounded-2xl cursor-pointer backdrop-blur-[2px]">
                  <div className="flex items-center gap-2 text-purple-600 font-bold bg-white px-4 py-2 rounded-full shadow-lg border border-purple-100">
                    <PlayCircle size={20} /> {role === 'teacher' ? 'Решения' : 'Решать'}
                  </div>
                </div>
              )}
              {clickable && (
                <div className="mt-3 md:hidden text-xs font-semibold text-purple-600">
                  {role === 'teacher' ? 'Смотреть решения' : 'Открыть тему'}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {role === 'teacher' && (
        <div className="md:hidden grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setShowTeacherTaskToolsMobile((prev) => {
                const next = !prev;
                if (next) setShowTeacherTheoryToolsMobile(false);
                return next;
              });
            }}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              showTeacherTaskToolsMobile
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {showTeacherTaskToolsMobile ? 'Скрыть задачи' : 'Задачи Python'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowTeacherTheoryToolsMobile((prev) => {
                const next = !prev;
                if (next) setShowTeacherTaskToolsMobile(false);
                return next;
              });
            }}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              showTeacherTheoryToolsMobile
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {showTeacherTheoryToolsMobile ? 'Скрыть теорию' : 'Теория'}
          </button>
        </div>
      )}

      {role === 'teacher' && (
        <Card className={`space-y-4 border-purple-200/60 bg-gradient-to-br from-white via-white to-purple-50/40 ${showTeacherTaskToolsMobile ? 'block' : 'hidden'} md:block`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-800">
                {editingQuestionId ? 'Редактировать задачу' : 'Добавить задачу'}
              </h3>
              <p className="text-xs text-gray-500">Задачи для тестирования по теме</p>
            </div>
            <select
              value={manageTaskNumber || ''}
              onChange={(e) => setManageTaskNumber(Number(e.target.value))}
              className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none text-sm"
            >
              {taskList.map((task) => (
                <option key={task.id} value={task.number}>
                  {getTaskDisplayNumber(task)} · {task.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Название задачи (необязательно)"
              className="md:col-span-1 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
            <textarea
              value={newTaskPrompt}
              onChange={(e) => setNewTaskPrompt(e.target.value)}
              placeholder="Условие задачи"
              className="md:col-span-2 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none min-h-[80px]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Стартовый код</label>
            <textarea
              value={newStarterCode}
              onChange={(e) => setNewStarterCode(e.target.value)}
              placeholder="Например: print('Hello')"
              className="w-full px-4 py-2 rounded-xl bg-gray-900 text-gray-100 font-mono text-sm border border-gray-800 focus:border-purple-400 outline-none min-h-[120px]"
              spellCheck={false}
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Тесты</span>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <label className="cursor-pointer text-purple-600 hover:text-purple-700">
                  Загрузить из файла
                  <input
                    type="file"
                    accept=".json,.txt"
                    className="hidden"
                    onChange={(e) => handleTestsFileUpload(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setNewTests((prev) => [...prev, { input: '', output: '' }])}
                  className="text-purple-600 hover:text-purple-700"
                >
                  Добавить тест
                </button>
              </div>
            </div>
            {testsFileName && (
              <div className="text-[11px] text-gray-400">Файл: {testsFileName}</div>
            )}
            <div className="space-y-2">
              {newTests.map((test, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <textarea
                    value={test.input}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewTests((prev) => prev.map((item, i) => (i === idx ? { ...item, input: value } : item)));
                    }}
                    placeholder="Входные данные"
                    className="px-3 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none min-h-[60px]"
                  />
                  <div className="relative">
                    <textarea
                      value={test.output}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewTests((prev) => prev.map((item, i) => (i === idx ? { ...item, output: value } : item)));
                      }}
                      placeholder="Ожидаемый вывод"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none min-h-[60px]"
                    />
                    {newTests.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setNewTests((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-600"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {questionError && <span className="text-xs text-red-500">{questionError}</span>}
            <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {editingQuestionId && (
                <Button variant="secondary" onClick={cancelEditPythonTask} disabled={questionSaving} className="w-full sm:w-auto">
                  Отменить
                </Button>
              )}
              <Button onClick={handleSavePythonTask} disabled={questionSaving} className="w-full sm:w-auto">
                {questionSaving ? 'Сохранение...' : (editingQuestionId ? 'Сохранить' : 'Добавить задачу')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {manageQuestions.length === 0 ? (
              <div className="text-sm text-gray-500">Пока нет задач для выбранной темы.</div>
            ) : (
              manageQuestions.map((q, idx) => (
                <div key={q.id || idx} className="p-3 rounded-xl border border-purple-100 bg-white/85 flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{q.title || q.question || `Задача ${idx + 1}`}</p>
                    <p className="text-xs text-gray-500 mt-1">Тестов: {Array.isArray(q.tests) ? q.tests.length : (q.answer ? 1 : 0)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEditPythonTask(q)}
                      className="p-2 rounded-lg text-gray-500 hover:text-purple-600 hover:bg-purple-50"
                      title="Редактировать"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePythonQuestion(manageTaskNumber, q.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {role === 'teacher' && (
        <Card className={`space-y-4 border-slate-200 bg-white/90 ${showTeacherTheoryToolsMobile ? 'block' : 'hidden'} md:block`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Теория темы</h3>
              <p className="text-xs text-gray-500">Текст или встраиваемый Google Docs</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'text', label: 'Текст' },
              { id: 'gdoc', label: 'Google Docs' }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTheoryType(item.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  theoryType === item.id
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-purple-100 hover:border-purple-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {theoryType === 'text' ? (
            <textarea
              value={theoryText}
              onChange={(e) => setTheoryText(e.target.value)}
              placeholder="Вставьте текст теории..."
              className="w-full min-h-[160px] px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={theoryUrl}
                onChange={(e) => setTheoryUrl(e.target.value)}
                placeholder="Вставьте ссылку на документ или iframe Google Docs"
                className="w-full px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              />
              <p className="hidden md:block text-xs text-gray-400">
                Используйте ссылку для встраивания из Google Docs (Файл → Опубликовать в интернете → Встроить).
              </p>
              <p className="text-[11px] text-gray-400">
                Подойдут и обычные ссылки на документ (view/edit) — они встроятся через preview. Для оглавления используйте «Открыть полностью».
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {theoryError && <span className="text-xs text-red-500">{theoryError}</span>}
            <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button variant="secondary" onClick={handleClearPythonTheory} disabled={theorySaving} className="w-full sm:w-auto">
                Очистить
              </Button>
              <Button onClick={handleSavePythonTheory} disabled={theorySaving} className="w-full sm:w-auto">
                {theorySaving ? 'Сохранение...' : 'Сохранить теорию'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {role === 'student' && activeTask && (
        <PythonTestModal
          task={activeTask}
          onClose={() => {
            setActiveTask(null);
            setActiveQuestionIndex(null);
          }}
          progress={progressMap}
          studentId={studentId}
          testDb={testsDb}
          initialQuestionIndex={activeQuestionIndex}
          onQuestionChange={setActiveQuestionIndex}
          onStreakSaved={onStreakSaved}
          onXpGain={onXpGain}
          onComplete={(taskId, score, options) => {
            onUpdateProgress(taskId, score, options);
          }}
        />
      )}
      {role === 'teacher' && reviewTask && (
        <PythonReviewModal
          task={reviewTask}
          onClose={() => setReviewTask(null)}
          studentId={effectiveStudentId}
          testDb={testsDb}
        />
      )}
    </div>
  );
};

const ScheduleSection = ({
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  onOpenTask,
  onOpenMockGoal,
  solvedRefreshKey,
  tasks,
  nextHomeworkFlyRef
}) => {
  const DEFAULT_HOMEWORK = '🟢\n🟢\n🟢';
  const DEFAULT_GOAL = { type: GOAL_TYPE_TASK, taskNumber: '', levelId: 'basic', targetInput: '', includeAll: false, mockExamId: '' };
  const [homeworks, setHomeworks] = useState([]);
  const [nextLesson, setNextLesson] = useState({ homeWork: '', lessonLink: '', boardLink: '', daysToComplete: 7, issuedAt: '', taskNumber: null, levelId: null, targetQuestions: [], goals: [] });
  const [form, setForm] = useState({ homeWork: DEFAULT_HOMEWORK, lessonLink: '', boardLink: '', daysToComplete: 7, goals: [{ ...DEFAULT_GOAL }] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [solvedByKey, setSolvedByKey] = useState({});
  const [mockExams, setMockExams] = useState([]);
  const [mockExamsLoading, setMockExamsLoading] = useState(false);
  const [mockExamsError, setMockExamsError] = useState('');
  const [mockAttemptsByExam, setMockAttemptsByExam] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [scheduleCompactMode, setScheduleCompactMode] = useState(true);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const taskOptions = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const pythonTaskOptions = PYTHON_TASKS;
  const mockExamById = useMemo(
    () => (Array.isArray(mockExams)
      ? mockExams.reduce((acc, exam) => {
          if (exam?.id) acc[String(exam.id)] = exam;
          return acc;
        }, {})
      : {}),
    [mockExams]
  );

  const buildNextLessonData = (latest, fallback = {}) => ({
    homeWork: latest?.homeWork || '',
    lessonLink: latest?.lessonLink || '',
    boardLink: latest?.boardLink || '',
    daysToComplete: Number(latest?.daysToComplete) || fallback.daysToComplete || 7,
    issuedAt: latest?.issuedAt || '',
    taskNumber: latest?.taskNumber ?? null,
    levelId: latest?.levelId ?? null,
    targetQuestions: Array.isArray(latest?.targetQuestions) ? latest.targetQuestions : [],
    goals: Array.isArray(latest?.goals) ? latest.goals : [],
  });

  const loadNextLesson = async () => {
    if (!effectiveStudentId) {
      setHomeworks([]);
      setNextLesson({ homeWork: '', lessonLink: '', boardLink: '', daysToComplete: 7, issuedAt: '', taskNumber: null, levelId: null, targetQuestions: [], goals: [] });
      setForm({ homeWork: DEFAULT_HOMEWORK, lessonLink: '', boardLink: '', daysToComplete: 7, goals: [{ ...DEFAULT_GOAL }] });
      setEditingId(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getStudentNextLesson(effectiveStudentId);
      const list = Array.isArray(data?.homeworks) ? data.homeworks : [];
      const latest = data?.latest && typeof data.latest === 'object' ? data.latest : {};
      const safeData = buildNextLessonData(latest);
      setHomeworks(list);
      setNextLesson(safeData);
      setEditingId(null);
      if (role === 'teacher') {
        setForm({
          homeWork: DEFAULT_HOMEWORK,
          lessonLink: safeData.lessonLink || '',
          boardLink: safeData.boardLink || '',
          daysToComplete: safeData.daysToComplete || 7,
          goals: [{ ...DEFAULT_GOAL }]
        });
      }
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNextLesson();
  }, [effectiveStudentId]);

  useEffect(() => {
    let cancelled = false;
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestsDb(data && typeof data === 'object' ? data : {});
        setTestsDbError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsDb({});
        setTestsDbError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!effectiveStudentId) {
      setMockExams([]);
      setMockExamsLoading(false);
      setMockExamsError('');
      return;
    }
    let cancelled = false;
    setMockExamsLoading(true);
    api.getMockExams(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setMockExams(Array.isArray(data) ? data : []);
        setMockExamsError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setMockExams([]);
        setMockExamsError(err?.message || err);
      })
      .finally(() => {
        if (!cancelled) setMockExamsLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    if (!effectiveStudentId) {
      setSolvedByKey({});
      return;
    }
    const entries = Array.isArray(homeworks)
      ? homeworks.flatMap((entry) => {
          const goals = normalizeEntryGoals(entry).filter((goal) => goal.type === GOAL_TYPE_TASK);
          return goals.map((goal) => ({
            taskNumber: goal.taskNumber,
            levelId: goal.levelId
          }));
        })
      : [];
    const unique = [];
    const seen = new Set();
    entries.forEach((entry) => {
      const key = `${entry.taskNumber}|${entry.levelId}`;
      if (seen.has(key)) return;
      seen.add(key);
      unique.push({ key, taskNumber: entry.taskNumber, levelId: entry.levelId });
    });
    if (unique.length === 0) {
      setSolvedByKey({});
      return;
    }
    let cancelled = false;
    const loadSolved = async () => {
      try {
        const results = await Promise.all(
          unique.map((item) =>
            api.getSolvedQuestions(effectiveStudentId, item.taskNumber, item.levelId).catch(() => [])
          )
        );
        if (cancelled) return;
        const next = {};
        unique.forEach((item, idx) => {
          const list = Array.isArray(results[idx]) ? results[idx] : [];
          next[item.key] = new Set(list.map((val) => String(val)));
        });
        setSolvedByKey(next);
      } catch (err) {
        if (!cancelled) setSolvedByKey({});
      }
    };
    loadSolved();
    return () => { cancelled = true; };
  }, [effectiveStudentId, homeworks, solvedRefreshKey]);

  useEffect(() => {
    if (!effectiveStudentId) {
      setMockAttemptsByExam({});
      return;
    }
    const uniqueExamIds = Array.from(new Set(
      (Array.isArray(homeworks) ? homeworks : [])
        .flatMap((entry) => normalizeEntryGoals(entry))
        .filter((goal) => goal.type === GOAL_TYPE_MOCK)
        .map((goal) => normalizeMockExamId(goal.mockExamId))
        .filter(Boolean)
    ));
    if (uniqueExamIds.length === 0) {
      setMockAttemptsByExam({});
      return;
    }
    let cancelled = false;
    const loadMockAttempts = async () => {
      try {
        const results = await Promise.all(
          uniqueExamIds.map((examId) => api.getMockAttempt(effectiveStudentId, examId).catch(() => null))
        );
        if (cancelled) return;
        const next = {};
        uniqueExamIds.forEach((examId, idx) => {
          const attempt = results[idx];
          if (attempt && typeof attempt === 'object') next[examId] = attempt;
        });
        setMockAttemptsByExam(next);
      } catch {
        if (!cancelled) setMockAttemptsByExam({});
      }
    };
    loadMockAttempts();
    return () => { cancelled = true; };
  }, [effectiveStudentId, homeworks, solvedRefreshKey]);

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Ученик:</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const normalizeUrl = (url) => {
    const raw = String(url || '').trim();
    if (!raw) return '';
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  };

  const parseTargetInput = (input, maxCount) => {
    const parts = String(input || '').split(/[\s,;]+/).filter(Boolean);
    const numbers = parts
      .map((val) => Number(val))
      .filter((val) => Number.isFinite(val) && val > 0)
      .map((val) => Math.trunc(val));
    const unique = Array.from(new Set(numbers));
    if (Number.isFinite(maxCount) && maxCount > 0) {
      return unique.filter((val) => val <= maxCount);
    }
    return unique;
  };

  const formatTargetInput = (targets) => {
    if (!Array.isArray(targets)) return '';
    const values = Array.from(new Set(
      targets
        .map((val) => Number(val))
        .filter((val) => Number.isFinite(val) && val > 0)
        .map((val) => Math.trunc(val))
    ));
    return values.join(', ');
  };

  const getQuestionsCount = (taskNumber, levelId) => {
    if (!testsDb || !taskNumber) return null;
    const effectiveLevelId = isPythonTaskNumber(taskNumber) ? PYTHON_LEVEL_ID : levelId;
    if (!effectiveLevelId) return null;
    const list = testsDb?.[String(taskNumber)]?.[effectiveLevelId];
    return Array.isArray(list) ? list.length : null;
  };

  const normalizeEntryGoals = (entry) => {
    if (!entry) return [];
    if (Array.isArray(entry.goals) && entry.goals.length > 0) {
      return entry.goals
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
            ? String(normalizedTaskNumber)
            : '';
          const isPythonGoal = Number.isFinite(normalizedTaskNumber)
            ? isPythonTaskNumber(normalizedTaskNumber)
            : false;
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
            : Boolean(goal?.taskNumber)
        ));
    }
    if (entry.taskNumber && entry.levelId) {
      const entryTaskNumber = Number(entry.taskNumber);
      return [{
        type: GOAL_TYPE_TASK,
        taskNumber: Number.isFinite(normalizeTaskNumber(entry.taskNumber))
          ? String(normalizeTaskNumber(entry.taskNumber))
          : String(entry.taskNumber),
        levelId: isPythonTaskNumber(entryTaskNumber) ? PYTHON_LEVEL_ID : entry.levelId,
        targetQuestions: Array.isArray(entry.targetQuestions) ? entry.targetQuestions : [],
        includeAll: Boolean(entry.includeAll)
      }];
    }
    return [];
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');
  };

  const formatDaysText = (days) => {
    const value = Number(days) || 0;
    if (value === 7) return 'неделя';
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return `${value} день`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} дня`;
    return `${value} дней`;
  };

  const sortedHomeworks = useMemo(() => {
    const list = Array.isArray(homeworks) ? [...homeworks] : [];
    return list.sort((a, b) => new Date(b?.issuedAt || 0) - new Date(a?.issuedAt || 0));
  }, [homeworks]);

  const nextHomeworkEntry = sortedHomeworks[0] || null;
  const previousHomeworkEntries = sortedHomeworks.slice(1);
  const totalHomeworkCount = sortedHomeworks.length;

  const buildGoalView = (goal, goalIndex = 0) => {
    const goalType = normalizeGoalType(goal);
    if (goalType === GOAL_TYPE_MOCK) {
      const mockExamId = normalizeMockExamId(goal?.mockExamId);
      if (!mockExamId) return null;
      const mockExam = mockExamById[mockExamId] || null;
      const mockProgress = getMockGoalProgress(mockExam, mockAttemptsByExam?.[mockExamId]);
      const totalCount = Number(mockProgress.totalCount) || 0;
      const solvedCount = Number(mockProgress.solvedCount) || 0;
      const progressPercent = totalCount > 0
        ? Math.max(0, Math.min(100, Math.round((solvedCount / totalCount) * 100)))
        : 0;
      return {
        viewKey: `mock-${mockExamId}-${goalIndex}`,
        type: GOAL_TYPE_MOCK,
        mockExamId,
        heading: `Пробник · ${mockExam?.title || 'Пробник недоступен'}`,
        totalCount,
        solvedCount,
        progressPercent,
      };
    }
    const taskNumber = Number(goal?.taskNumber);
    if (!Number.isFinite(taskNumber)) return null;
    const isPythonGoal = isPythonTaskNumber(taskNumber);
    const pythonTask = isPythonGoal ? getPythonTaskInfo(taskNumber) : null;
    const taskDisplay = isPythonGoal
      ? (pythonTask?.displayNumber || taskNumber)
      : (formatTaskNumber(taskNumber) || taskNumber);
    const levelId = isPythonGoal ? PYTHON_LEVEL_ID : goal?.levelId;
    const levelLabel = isPythonGoal
      ? 'Python'
      : (LEVELS[levelId?.toUpperCase()]?.label || levelId);
    const questionsList = taskNumber && levelId
      ? (testsDb?.[String(taskNumber)]?.[levelId] || [])
      : [];
    const totalCount = questionsList.length;
    const targetNumbers = goal?.includeAll
      ? (totalCount > 0 ? Array.from({ length: totalCount }, (_, i) => i + 1) : [])
      : Array.from(new Set(
          (Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [])
            .map((val) => Number(val))
            .filter((val) => Number.isFinite(val) && val > 0)
        )).sort((a, b) => a - b);
    const targetsKey = taskNumber && levelId ? `${taskNumber}|${levelId}` : null;
    const solvedSet = targetsKey ? solvedByKey?.[targetsKey] : null;
    const targetStatus = targetNumbers.map((num) => {
      const question = questionsList[num - 1];
      const qId = question?.id;
      const solved = qId ? solvedSet?.has(String(qId)) : false;
      return { num, solved };
    });
    const solvedCount = targetStatus.filter((item) => item.solved).length;
    const progressPercent = targetStatus.length > 0
      ? Math.max(0, Math.min(100, Math.round((solvedCount / targetStatus.length) * 100)))
      : 0;
    const heading = isPythonGoal
      ? `Python ${pythonTask?.title || (taskNumber ? `тема ${taskNumber}` : 'тема')}`
      : `Задание ${taskDisplay} · ${levelLabel}`;
    return {
      viewKey: `task-${taskNumber}-${levelId}-${goalIndex}`,
      type: GOAL_TYPE_TASK,
      heading,
      taskNumber,
      levelId,
      includeAll: Boolean(goal?.includeAll),
      targetNumbers,
      targetStatus,
      totalCount: targetStatus.length,
      solvedCount,
      progressPercent,
    };
  };

  const summarizeGoalViews = (goalViews) => {
    const list = Array.isArray(goalViews) ? goalViews : [];
    const totalCount = list.reduce(
      (sum, item) => sum + (Number(item?.totalCount) > 0 ? Number(item.totalCount) : 0),
      0
    );
    const solvedCount = list.reduce((sum, item) => {
      const itemTotal = Number(item?.totalCount) || 0;
      const itemSolved = Number(item?.solvedCount) || 0;
      if (itemTotal <= 0) return sum;
      return sum + Math.min(itemSolved, itemTotal);
    }, 0);
    const remainingCount = Math.max(totalCount - solvedCount, 0);
    const progressPercent = totalCount > 0
      ? Math.max(0, Math.min(100, Math.round((solvedCount / totalCount) * 100)))
      : 0;
    const pendingGoals = list.filter((item) => {
      const itemTotal = Number(item?.totalCount) || 0;
      const itemSolved = Number(item?.solvedCount) || 0;
      if (itemTotal <= 0) return true;
      return itemSolved < itemTotal;
    });
    const completedGoals = list.filter((item) => {
      const itemTotal = Number(item?.totalCount) || 0;
      const itemSolved = Number(item?.solvedCount) || 0;
      return itemTotal > 0 && itemSolved >= itemTotal;
    });
    return {
      totalCount,
      solvedCount,
      remainingCount,
      progressPercent,
      pendingGoals,
      completedGoals,
      goalCount: list.length,
    };
  };

  const nextHomeworkGoalViews = nextHomeworkEntry
    ? normalizeEntryGoals(nextHomeworkEntry)
      .map((goal, goalIndex) => buildGoalView(goal, goalIndex))
      .filter(Boolean)
    : [];
  const nextHomeworkSummary = summarizeGoalViews(nextHomeworkGoalViews);
  const nextHomeworkPendingGoal = nextHomeworkSummary.pendingGoals[0] || null;
  const nextHomeworkPendingShortLabel = nextHomeworkPendingGoal?.heading
    ? String(nextHomeworkPendingGoal.heading).split('·')[0].trim()
    : '';

  useEffect(() => {
    setShowHistory(false);
  }, [effectiveStudentId, totalHomeworkCount]);

  const renderHomeworkEntryCard = (entry, section = 'next', key) => {
    if (!entry) return null;
    const isNextSection = section === 'next';
    const dateText = formatDate(entry?.issuedAt);
    const daysText = formatDaysText(entry?.daysToComplete || 7);
    const isEditing = editingId && entry?.id === editingId;
    const entryGoals = normalizeEntryGoals(entry);
    const goalViews = entryGoals
      .map((goal, goalIndex) => buildGoalView(goal, goalIndex))
      .filter(Boolean);
    const goalsSummary = summarizeGoalViews(goalViews);
    const firstPendingGoal = goalsSummary.pendingGoals[0] || null;
    const canOpenFirstPending = Boolean(
      firstPendingGoal
      && (
        (firstPendingGoal.type === GOAL_TYPE_MOCK && onOpenMockGoal)
        || (firstPendingGoal.type === GOAL_TYPE_TASK && onOpenTask)
      )
    );
    const compactPendingPreview = goalsSummary.pendingGoals.slice(0, 2);
    const compactCompletedPreview = goalsSummary.completedGoals.slice(0, 2);
    const sectionTone = isNextSection
      ? 'border-purple-300/80 bg-gradient-to-br from-white via-purple-50/85 to-fuchsia-50/65 shadow-[0_12px_30px_rgba(147,51,234,0.12)]'
      : 'border-slate-200/90 bg-white';
    const cardTone = isEditing ? 'border-purple-400 bg-purple-50/70 ring-2 ring-purple-200/70' : sectionTone;
    const sectionLabel = isNextSection ? 'Следующий урок' : 'Предыдущая домашка';
    const summaryStatus = goalsSummary.goalCount === 0
      ? { label: 'Цели не заданы', tone: 'border-slate-200 bg-white text-slate-600' }
      : goalsSummary.totalCount > 0 && goalsSummary.remainingCount === 0
        ? { label: 'Все выполнено', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
        : goalsSummary.solvedCount > 0
          ? { label: 'В процессе', tone: 'border-amber-200 bg-amber-50 text-amber-700' }
          : { label: 'Нужно начать', tone: 'border-purple-200 bg-purple-50 text-purple-700' };
    const checklistLines = String(entry?.homeWork || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const visibleChecklistLines = scheduleCompactMode ? checklistLines.slice(0, 4) : checklistLines;
    const hiddenChecklistCount = Math.max(checklistLines.length - visibleChecklistLines.length, 0);

    const openGoal = (goalView) => {
      if (!goalView) return;
      if (goalView.type === GOAL_TYPE_MOCK) {
        onOpenMockGoal?.(goalView.mockExamId);
        return;
      }
      onOpenTask?.(goalView.taskNumber, goalView.levelId, goalView.targetNumbers);
    };

    return (
      <div key={key} className={`rounded-2xl border p-3.5 md:p-5 space-y-3 md:space-y-4 ${cardTone}`}>
        <div className="flex flex-wrap items-start justify-between gap-2.5 md:gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                isNextSection
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-300/50'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {sectionLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                <Calendar size={13} />
                {dateText || 'сегодня'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                <RefreshCcw size={12} />
                {`Срок: ${daysText}`}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${summaryStatus.tone}`}>
                {summaryStatus.label}
              </span>
            </div>
          </div>
          {role === 'teacher' && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => startEditHomework(entry)}
                className="px-3 py-1 rounded-lg border border-slate-200 bg-white/90 text-xs font-semibold text-slate-600 hover:bg-white"
              >
                Редактировать
              </button>
              {entry.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteHomework(entry)}
                  disabled={deletingId === entry.id}
                  className="px-3 py-1 rounded-lg border border-red-200 bg-red-50/70 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {deletingId === entry.id ? 'Удаление...' : 'Удалить'}
                </button>
              )}
            </div>
          )}
        </div>
        {goalViews.length > 0 ? (
          <div className={`rounded-2xl border p-3 md:p-4 space-y-3 ${
            isNextSection
              ? 'border-purple-200/80 bg-white/90'
              : 'border-slate-200/90 bg-slate-50/70'
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-purple-500">
                  Прогресс по целям
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {goalsSummary.totalCount > 0
                    ? `Выполнено ${goalsSummary.solvedCount} из ${goalsSummary.totalCount}`
                    : `Целей задано: ${goalsSummary.goalCount}`}
                </div>
              </div>
              <div className="rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                {goalsSummary.totalCount > 0 ? `${goalsSummary.progressPercent}%` : 'без тестов'}
              </div>
            </div>
            {goalsSummary.totalCount > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-purple-100/80">
                <div
                  className={`h-full rounded-full ${
                    goalsSummary.remainingCount === 0
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                      : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                  }`}
                  style={{ width: `${goalsSummary.progressPercent}%` }}
                />
              </div>
            )}
            {scheduleCompactMode ? (
              <div className="rounded-xl border border-purple-100 bg-white/85 px-3 py-2.5">
                {compactPendingPreview.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-purple-700">Что сделать сейчас</div>
                    {compactPendingPreview.map((goalView) => (
                      <div key={`compact-pending-${goalView.viewKey}`} className="flex items-start gap-2 text-xs text-slate-700">
                        <ChevronRight size={13} className="mt-[1px] text-purple-500" />
                        <span>{goalView.heading}</span>
                      </div>
                    ))}
                    {goalsSummary.pendingGoals.length > compactPendingPreview.length && (
                      <div className="text-[11px] text-purple-600">
                        {`Ещё ${goalsSummary.pendingGoals.length - compactPendingPreview.length} целей`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs font-medium text-emerald-700">Все цели закрыты. Отличная работа.</div>
                )}
                {compactCompletedPreview.length > 0 && (
                  <div className="mt-2 text-[11px] text-emerald-700">
                    {`Уже выполнено: ${goalsSummary.completedGoals.length} из ${goalsSummary.goalCount} целей`}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Решено</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{goalsSummary.solvedCount}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Осталось</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{goalsSummary.remainingCount}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Закрыто целей</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{goalsSummary.completedGoals.length}/{goalsSummary.goalCount}</div>
                  </div>
                </div>
                {isNextSection && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-purple-100 bg-purple-50/70 px-3 py-2.5">
                      <div className="text-[11px] font-semibold text-purple-700">Что сделать к следующему занятию</div>
                      {goalsSummary.pendingGoals.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {goalsSummary.pendingGoals.slice(0, 3).map((goalView) => (
                            <div key={`pending-${goalView.viewKey}`} className="flex items-start gap-2 text-xs text-purple-800">
                              <ChevronRight size={13} className="mt-[1px] text-purple-500" />
                              <span>{goalView.heading}</span>
                            </div>
                          ))}
                          {goalsSummary.pendingGoals.length > 3 && (
                            <div className="text-[11px] text-purple-600">
                              {`И ещё ${goalsSummary.pendingGoals.length - 3} целей`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-emerald-700">Все цели закрыты. Отличная работа.</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                      <div className="text-[11px] font-semibold text-emerald-700">Уже сделано</div>
                      {goalsSummary.completedGoals.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {goalsSummary.completedGoals.slice(0, 3).map((goalView) => (
                            <div key={`done-${goalView.viewKey}`} className="flex items-start gap-2 text-xs text-emerald-800">
                              <CheckCircle size={13} className="mt-[1px]" />
                              <span>{goalView.heading}</span>
                            </div>
                          ))}
                          {goalsSummary.completedGoals.length > 3 && (
                            <div className="text-[11px] text-emerald-700">
                              {`И ещё ${goalsSummary.completedGoals.length - 3} выполнено`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-slate-500">Пока нет выполненных целей.</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            {isNextSection && canOpenFirstPending && (
              <button
                type="button"
                onClick={() => openGoal(firstPendingGoal)}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-semibold hover:from-violet-700 hover:to-purple-700 shadow-sm shadow-purple-300/50"
              >
                {firstPendingGoal.type === GOAL_TYPE_MOCK ? 'Начать пробник' : 'Начать следующую цель'}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-500">
            Цели не заданы. Ориентируйтесь на комментарий преподавателя ниже.
          </div>
        )}

        {goalViews.length > 0 && !scheduleCompactMode && (
          <div className="space-y-2.5">
            {goalViews.map((goalView) => {
              if (goalView.type === GOAL_TYPE_MOCK) {
                const remainingCount = goalView.totalCount > 0
                  ? Math.max(goalView.totalCount - goalView.solvedCount, 0)
                  : 0;
                return (
                  <div key={goalView.viewKey} className="rounded-xl border border-purple-100/80 bg-white/90 px-3 py-2.5 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-purple-700">{goalView.heading}</div>
                        <div className="text-[11px] text-slate-500">
                          {goalView.totalCount > 0
                            ? `Выполнено ${goalView.solvedCount}/${goalView.totalCount}`
                            : 'В пробнике пока нет заданий.'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700">
                        {goalView.totalCount > 0 ? `${goalView.solvedCount}/${goalView.totalCount}` : '—'}
                      </div>
                    </div>
                    {goalView.totalCount > 0 && (
                      <div className="h-2 overflow-hidden rounded-full bg-purple-100/80">
                        <div
                          className={`h-full rounded-full ${
                            remainingCount === 0
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                              : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                          }`}
                          style={{ width: `${goalView.progressPercent}%` }}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500">
                        {goalView.totalCount > 0
                          ? `Осталось: ${remainingCount}`
                          : 'Добавьте задания в пробник.'}
                      </div>
                      {onOpenMockGoal && (
                        <button
                          type="button"
                          onClick={() => onOpenMockGoal(goalView.mockExamId)}
                          className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700"
                        >
                          Перейти к пробнику
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              const remainingCount = goalView.totalCount > 0
                ? Math.max(goalView.totalCount - goalView.solvedCount, 0)
                : 0;
              const visibleTargetStatus = goalView.targetStatus.slice(0, 12);
              const hiddenTargetCount = Math.max(goalView.targetStatus.length - visibleTargetStatus.length, 0);

              return (
                <div key={goalView.viewKey} className="rounded-xl border border-purple-100/80 bg-white/90 px-3 py-2.5 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-purple-700">{goalView.heading}</div>
                      <div className="text-[11px] text-slate-500">
                        {goalView.targetNumbers.length > 0
                          ? `Выполнено ${goalView.solvedCount}/${goalView.totalCount}`
                          : (goalView.includeAll ? 'Все задания уровня' : 'Цель без выбранных вопросов')}
                      </div>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700">
                      {goalView.totalCount > 0 ? `${goalView.solvedCount}/${goalView.totalCount}` : '—'}
                    </div>
                  </div>
                  {goalView.totalCount > 0 && (
                    <div className="h-2 overflow-hidden rounded-full bg-purple-100/80">
                      <div
                        className={`h-full rounded-full ${
                          remainingCount === 0
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                            : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                        }`}
                        style={{ width: `${goalView.progressPercent}%` }}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-500">
                      {goalView.totalCount > 0
                        ? `Осталось: ${remainingCount}`
                        : 'Откройте задание, чтобы начать.'}
                    </div>
                    {onOpenTask && (
                      <button
                        type="button"
                        onClick={() => onOpenTask(goalView.taskNumber, goalView.levelId, goalView.targetNumbers)}
                        className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700"
                      >
                        Перейти к заданию
                      </button>
                    )}
                  </div>
                  {goalView.targetNumbers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {visibleTargetStatus.map((item) => (
                        <span
                          key={`${goalView.viewKey}-${item.num}`}
                          className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${
                            item.solved
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                              : 'border-purple-200 bg-purple-50 text-purple-700'
                          }`}
                        >
                          №{item.num}{item.solved ? ' ✓' : ''}
                        </span>
                      ))}
                      {hiddenTargetCount > 0 && (
                        <span className="px-2 py-1 rounded-md border border-slate-200 bg-slate-100 text-[11px] font-semibold text-slate-600">
                          +{hiddenTargetCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-purple-100/70 bg-white/90 p-3.5 md:p-4">
          <div className="mb-1.5 md:mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-purple-500">Домашка</p>
            {checklistLines.length > 0 && (
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                {`Пунктов: ${checklistLines.length}`}
              </span>
            )}
          </div>
          {checklistLines.length > 0 ? (
            <div className="space-y-1.5">
              {visibleChecklistLines.map((line, index) => (
                <div key={`${line}-${index}`} className="flex items-start gap-2 text-[13px] md:text-sm text-gray-700 leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                  <span className="whitespace-pre-wrap">{line}</span>
                </div>
              ))}
              {hiddenChecklistCount > 0 && (
                <div className="text-[11px] text-slate-500">
                  {`Ещё ${hiddenChecklistCount} пунктов — переключите режим на «Подробно», чтобы увидеть всё.`}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] md:text-sm leading-relaxed text-slate-500">
              Комментариев учителя нет.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
          {entry?.lessonLink ? (
            <a
              href={normalizeUrl(entry.lessonLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/80 px-3.5 py-2.5 md:px-4 md:py-3 text-[13px] md:text-sm font-semibold text-purple-700 hover:border-purple-400 hover:bg-white"
            >
              <span className="inline-flex items-center gap-2">
                <Calendar size={15} />
                Открыть ссылку на занятие
              </span>
              <ChevronRight size={15} className="text-purple-400 transition group-hover:translate-x-0.5 group-hover:text-purple-600" />
            </a>
          ) : (
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">
              <Calendar size={14} />
              Ссылка на занятие не указана
            </div>
          )}
          {entry?.boardLink ? (
            <a
              href={normalizeUrl(entry.boardLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/80 px-3.5 py-2.5 md:px-4 md:py-3 text-[13px] md:text-sm font-semibold text-purple-700 hover:border-purple-400 hover:bg-white"
            >
              <span className="inline-flex items-center gap-2">
                <BookOpen size={15} />
                Открыть онлайн-доску
              </span>
              <ChevronRight size={15} className="text-purple-400 transition group-hover:translate-x-0.5 group-hover:text-purple-600" />
            </a>
          ) : (
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">
              <BookOpen size={14} />
              Ссылка на доску не указана
            </div>
          )}
          {!entry?.lessonLink && !entry?.boardLink && (
            <div className="md:hidden rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500">
              Ссылки к занятию появятся здесь.
            </div>
          )}
        </div>
      </div>
    );
  };

  const resetFormToDefault = (base = null) => {
    const source = base || nextLesson || {};
    setForm({
      homeWork: DEFAULT_HOMEWORK,
      lessonLink: source?.lessonLink || '',
      boardLink: source?.boardLink || '',
      daysToComplete: source?.daysToComplete || 7,
      goals: [{ ...DEFAULT_GOAL }]
    });
    setEditingId(null);
  };

  const startEditHomework = (entry) => {
    if (!entry) return;
    const goals = normalizeEntryGoals(entry);
    setEditingId(entry.id || null);
    setForm({
      homeWork: entry.homeWork || '',
      lessonLink: entry.lessonLink || '',
      boardLink: entry.boardLink || '',
      daysToComplete: Number(entry.daysToComplete) || 7,
      goals: goals.length
        ? goals.map((goal) => {
            if (goal.type === GOAL_TYPE_MOCK) {
              return {
                ...DEFAULT_GOAL,
                type: GOAL_TYPE_MOCK,
                mockExamId: goal.mockExamId
              };
            }
            return {
              ...DEFAULT_GOAL,
              type: GOAL_TYPE_TASK,
              taskNumber: goal.taskNumber,
              levelId: goal.levelId || 'basic',
              includeAll: goal.includeAll,
              targetInput: goal.includeAll ? '' : formatTargetInput(goal.targetQuestions)
            };
          })
        : [{ ...DEFAULT_GOAL }]
    });
  };

  const updateGoal = (index, patch) => {
    setForm((prev) => {
      const goals = Array.isArray(prev.goals) ? [...prev.goals] : [];
      if (!goals[index]) return prev;
      goals[index] = { ...goals[index], ...patch };
      return { ...prev, goals };
    });
  };

  const addGoalRow = () => {
    setForm((prev) => ({
      ...prev,
      goals: [...(Array.isArray(prev.goals) ? prev.goals : []), { ...DEFAULT_GOAL }]
    }));
  };

  const removeGoalRow = (index) => {
    setForm((prev) => {
      const goals = Array.isArray(prev.goals) ? prev.goals.filter((_, i) => i !== index) : [];
      return { ...prev, goals: goals.length ? goals : [{ ...DEFAULT_GOAL }] };
    });
  };

  const handleSave = async () => {
    if (!effectiveStudentId || role !== 'teacher') return;
    setSaving(true);
    try {
      const goalsPayload = (Array.isArray(form.goals) ? form.goals : [])
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
          const taskNumber = String(goal?.taskNumber || '').trim();
          if (!taskNumber) return null;
          const normalizedTaskNumber = normalizeTaskNumber(taskNumber);
          if (!Number.isFinite(normalizedTaskNumber)) return null;
          const levelId = isPythonTaskNumber(normalizedTaskNumber)
            ? PYTHON_LEVEL_ID
            : (goal?.levelId || 'basic');
          const includeAll = Boolean(goal?.includeAll);
          const availableCount = getQuestionsCount(normalizedTaskNumber, levelId);
          const targetQuestions = includeAll ? [] : parseTargetInput(goal?.targetInput, availableCount);
          return {
            type: GOAL_TYPE_TASK,
            taskNumber: normalizedTaskNumber,
            levelId,
            includeAll,
            targetQuestions
          };
        })
        .filter(Boolean);
      const payload = {
        homeWork: form.homeWork,
        lessonLink: form.lessonLink,
        boardLink: form.boardLink,
        daysToComplete: form.daysToComplete,
        goals: goalsPayload
      };
      const updated = editingId
        ? await api.updateStudentHomework(effectiveStudentId, editingId, payload)
        : await api.updateStudentNextLesson(effectiveStudentId, payload);
      const list = Array.isArray(updated?.homeworks) ? updated.homeworks : [];
      const latest = updated?.latest && typeof updated.latest === 'object' ? updated.latest : {};
      const safeData = buildNextLessonData(latest, form);
      setHomeworks(list);
      setNextLesson(safeData);
      resetFormToDefault(safeData);
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHomework = async (entry) => {
    if (role !== 'teacher' || !effectiveStudentId || !entry?.id) return;
    if (!window.confirm('Удалить домашку?')) return;
    setDeletingId(entry.id);
    try {
      const updated = await api.deleteStudentHomework(effectiveStudentId, entry.id);
      const list = Array.isArray(updated?.homeworks) ? updated.homeworks : [];
      const latest = updated?.latest && typeof updated.latest === 'object' ? updated.latest : {};
      const safeData = buildNextLessonData(latest, form);
      setHomeworks(list);
      setNextLesson(safeData);
      if (editingId === entry.id) resetFormToDefault(safeData);
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setDeletingId(null);
    }
  };

  if (role === 'teacher' && studentsList.length === 0) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Моё расписание</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">
          {studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'}
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Моё расписание</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">Выберите ученика, чтобы открыть его расписание.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn" data-tour="schedule">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/75 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2.5 md:space-y-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Моё расписание</h2>
            </div>
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white/85 p-1 text-xs font-semibold text-slate-600 shadow-sm">
              <button
                type="button"
                onClick={() => setScheduleCompactMode(true)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  scheduleCompactMode
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'hover:bg-slate-100'
                }`}
              >
                Кратко
              </button>
              <button
                type="button"
                onClick={() => setScheduleCompactMode(false)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  scheduleCompactMode
                    ? 'hover:bg-slate-100'
                    : 'bg-purple-600 text-white shadow-sm'
                }`}
              >
                Подробно
              </button>
            </div>
            {nextHomeworkPendingGoal && (
              <div className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/80 px-3 py-1.5 text-xs text-slate-600 shadow-sm">
                <span className="shrink-0 font-semibold text-slate-500">Следующий шаг:</span>
                <span className="truncate font-semibold text-purple-700">{nextHomeworkPendingShortLabel || nextHomeworkPendingGoal.heading}</span>
              </div>
            )}
          </div>
          {renderStudentPicker()}
        </div>
      </div>

      {(error || testsDbError || mockExamsError) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-600">
              {error}
            </div>
          )}
          {testsDbError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-700">
              {testsDbError}
            </div>
          )}
          {mockExamsError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-700">
              {mockExamsError}
            </div>
          )}
        </div>
      )}

      {role === 'teacher' && (
        <Card className="space-y-4 border-purple-200/60 bg-gradient-to-br from-white via-white to-purple-50/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-800">
                {editingId ? 'Редактировать домашку' : 'Обновить данные'}
              </h3>
              <p className="text-xs text-slate-500">Заполните домашку, цели и ссылки на ближайшее занятие</p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={() => resetFormToDefault()}
                className="px-3 py-1 rounded-lg border border-gray-200 bg-white/90 text-xs font-semibold text-gray-600 hover:bg-white"
              >
                Отменить
              </button>
            )}
          </div>
          <textarea
            value={form.homeWork}
            onChange={(e) => setForm((prev) => ({ ...prev, homeWork: e.target.value }))}
            placeholder="Домашка на следующий урок"
            className="w-full min-h-[120px] resize-none rounded-xl border border-purple-100 bg-white/90 px-4 py-3 shadow-inner shadow-purple-100/40 focus:border-purple-500 outline-none"
          />
          <div className="space-y-3">
            {(Array.isArray(form.goals) ? form.goals : []).map((goal, index) => {
              const goalType = normalizeGoalType(goal);
              const isMockGoal = goalType === GOAL_TYPE_MOCK;
              const hasTask = !isMockGoal && Boolean(goal?.taskNumber);
              const normalizedGoalTaskNumber = normalizeTaskNumber(goal?.taskNumber);
              const isPythonGoal = isPythonTaskNumber(normalizedGoalTaskNumber);
              const effectiveLevelId = isPythonGoal ? PYTHON_LEVEL_ID : goal.levelId;
              const taskNumberValue = Number.isFinite(normalizedGoalTaskNumber)
                ? normalizedGoalTaskNumber
                : goal?.taskNumber;
              const availableCount = hasTask ? getQuestionsCount(taskNumberValue, effectiveLevelId) : null;
              const selectedMockExam = isMockGoal
                ? mockExamById[normalizeMockExamId(goal?.mockExamId)]
                : null;
              return (
                <div key={`${index}-${goalType}-${goal?.taskNumber || goal?.mockExamId || 'goal'}`} className="rounded-2xl border border-purple-100/70 bg-white/90 p-3.5 space-y-3 shadow-sm shadow-purple-100/40">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select
                      value={goalType}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === GOAL_TYPE_MOCK) {
                          updateGoal(index, { ...DEFAULT_GOAL, type: GOAL_TYPE_MOCK });
                          return;
                        }
                        updateGoal(index, { ...DEFAULT_GOAL, type: GOAL_TYPE_TASK, levelId: goal.levelId || 'basic' });
                      }}
                      className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
                    >
                      <option value={GOAL_TYPE_TASK}>Задание</option>
                      <option value={GOAL_TYPE_MOCK}>Пробник</option>
                    </select>
                    {isMockGoal ? (
                      <>
                        <select
                          value={goal?.mockExamId || ''}
                          onChange={(e) => updateGoal(index, { mockExamId: e.target.value })}
                          className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none md:col-span-2"
                        >
                          <option value="">Выберите пробник</option>
                          {mockExams.map((exam) => (
                            <option key={exam.id} value={exam.id}>{exam.title}</option>
                          ))}
                        </select>
                        <div className="flex items-center justify-end gap-3">
                          {(Array.isArray(form.goals) ? form.goals.length : 0) > 1 && (
                            <button
                              type="button"
                              onClick={() => removeGoalRow(index)}
                              className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <select
                          value={goal.taskNumber || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            const valueNum = value ? Number(value) : null;
                            const nextIsPython = valueNum ? isPythonTaskNumber(valueNum) : false;
                            updateGoal(index, {
                              taskNumber: value,
                              levelId: nextIsPython ? PYTHON_LEVEL_ID : (goal.levelId || 'basic'),
                              includeAll: value ? goal.includeAll : false,
                              targetInput: value ? goal.targetInput : ''
                            });
                          }}
                          className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
                        >
                          <option value="">Выберите задание</option>
                          <optgroup label="ЕГЭ">
                            {taskOptions.map((task) => (
                              <option key={task.id ?? task.number} value={task.number}>
                                Задание {getTaskDisplayNumber(task)}: {task.title}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Python">
                            {pythonTaskOptions.map((task) => (
                              <option key={task.id ?? task.number} value={task.number}>
                                {task.displayNumber} · {task.title}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        <select
                          value={isPythonGoal ? PYTHON_LEVEL_ID : (goal.levelId || 'basic')}
                          onChange={(e) => updateGoal(index, { levelId: e.target.value })}
                          disabled={!hasTask || isPythonGoal}
                          className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none disabled:opacity-60"
                        >
                          {isPythonGoal ? (
                            <option value={PYTHON_LEVEL_ID}>Python</option>
                          ) : (
                            Object.values(LEVELS).map((lvl) => (
                              <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                            ))
                          )}
                        </select>
                        <div className="flex items-center justify-between gap-3">
                          <label className={`flex items-center gap-2 text-xs font-semibold ${hasTask ? 'text-gray-600' : 'text-gray-400'}`}>
                            <input
                              type="checkbox"
                              checked={Boolean(goal.includeAll)}
                              disabled={!hasTask}
                              onChange={(e) => updateGoal(index, { includeAll: e.target.checked, targetInput: e.target.checked ? '' : goal.targetInput })}
                            />
                            Все задания
                          </label>
                          {(Array.isArray(form.goals) ? form.goals.length : 0) > 1 && (
                            <button
                              type="button"
                              onClick={() => removeGoalRow(index)}
                              className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="space-y-2">
                    {isMockGoal ? (
                      <div className="text-xs text-gray-500">
                        {mockExamsLoading
                          ? 'Загружаем пробники...'
                          : (selectedMockExam
                              ? `Выбран пробник: ${selectedMockExam.title}`
                              : (mockExams.length > 0
                                  ? 'Выберите пробник из списка.'
                                  : 'Для этого ученика нет доступных пробников.'))}
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={goal.targetInput || ''}
                          onChange={(e) => updateGoal(index, { targetInput: e.target.value })}
                          placeholder="Номера вопросов (например: 1, 3, 5)"
                          disabled={!hasTask || goal.includeAll}
                          className="w-full px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none disabled:opacity-60"
                        />
                        <div className="text-xs text-gray-400">
                          {goal.includeAll
                            ? 'Выбраны все задания этого уровня.'
                            : (availableCount
                                ? `Всего вопросов в уровне: ${availableCount}`
                                : 'Можно оставить пустым — тогда цель не задаётся.')}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addGoalRow}
              className="px-3 py-2 rounded-xl border border-purple-200 bg-white/90 text-xs font-semibold text-purple-700 hover:bg-purple-50"
            >
              + Добавить цель
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="number"
              min="1"
              value={form.daysToComplete}
              onChange={(e) => setForm((prev) => ({ ...prev, daysToComplete: e.target.value }))}
              placeholder="Дней на выполнение"
              className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
            <input
              type="url"
              value={form.lessonLink}
              onChange={(e) => setForm((prev) => ({ ...prev, lessonLink: e.target.value }))}
              placeholder="Ссылка на следующее занятие"
              className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
            <input
              type="url"
              value={form.boardLink}
              onChange={(e) => setForm((prev) => ({ ...prev, boardLink: e.target.value }))}
              placeholder="Ссылка на онлайн-доску"
              className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="md:self-start md:px-5">
            <Save size={16} /> {saving ? 'Сохранение...' : (editingId ? 'Сохранить изменения' : 'Добавить домашку')}
          </Button>
        </Card>
      )}

      <div className="space-y-4 md:space-y-5">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Домашние задания</h3>
        </div>

        {loading ? (
          <Card className="border-slate-200 bg-white/85">
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
              <RefreshCcw size={14} className="animate-spin" />
              Загрузка...
            </div>
          </Card>
        ) : sortedHomeworks.length === 0 ? (
          <Card className="border-slate-200 bg-white/85">
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
              Комментариев учителя нет.
            </div>
          </Card>
        ) : (
          <div className="space-y-4 md:space-y-6">
            <div ref={nextHomeworkFlyRef}>
              <Card className="space-y-2.5 md:space-y-3 border-purple-200/80 bg-gradient-to-br from-purple-50/70 via-white to-fuchsia-50/45 shadow-[0_14px_30px_rgba(147,51,234,0.14)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-purple-700">
                    <Calendar size={15} />
                    На следующий урок
                  </h4>
                  {nextHomeworkEntry?.issuedAt && (
                    <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-600">
                      {formatDate(nextHomeworkEntry.issuedAt)}
                    </span>
                  )}
                </div>
                {renderHomeworkEntryCard(nextHomeworkEntry, 'next')}
              </Card>
            </div>

            <Card className="space-y-2.5 md:space-y-3 border-slate-200 bg-white/90">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <RefreshCcw size={14} />
                  Предыдущие домашки
                </h4>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">
                  {previousHomeworkEntries.length}
                </span>
              </div>
              {previousHomeworkEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
                  Пока нет предыдущих домашних.
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowHistory((prev) => !prev)}
                    className="w-full md:w-auto rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[12px] md:text-sm font-semibold text-slate-600"
                  >
                    {showHistory
                      ? 'Скрыть предыдущие домашки'
                      : `Показать предыдущие (${previousHomeworkEntries.length})`}
                  </button>
                  <div className={`${showHistory ? 'space-y-3 md:space-y-4 block' : 'hidden'}`}>
                    {previousHomeworkEntries.map((entry, idx) =>
                      renderHomeworkEntryCard(entry, 'history', entry.id || `${entry?.issuedAt || 'entry'}-${idx}`)
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

const NotesSection = ({
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  initialLocation,
  onLocationChange
}) => {
  const [currentTask, setCurrentTask] = useState(null);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [files, setFiles] = useState([]);
  const [filesError, setFilesError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [folders, setFolders] = useState([]);
  const [foldersError, setFoldersError] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameBase, setRenameBase] = useState('');
  const [renameExt, setRenameExt] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [draggingFileId, setDraggingFileId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [expandedPyIds, setExpandedPyIds] = useState({});
  const [expandedPdfIds, setExpandedPdfIds] = useState({});
  const [expandedImageIds, setExpandedImageIds] = useState({});
  const [pyContent, setPyContent] = useState({});
  const [pyError, setPyError] = useState({});
  const [pyLoadingId, setPyLoadingId] = useState(null);
  const [editingPyId, setEditingPyId] = useState(null);
  const [pyEditDraft, setPyEditDraft] = useState('');
  const [pyEditSaving, setPyEditSaving] = useState(false);
  const [pyEditError, setPyEditError] = useState('');
  const [pyRunInput, setPyRunInput] = useState('');
  const [pyRunOutput, setPyRunOutput] = useState('');
  const [pyRunError, setPyRunError] = useState('');
  const [pyRunLoading, setPyRunLoading] = useState(false);
  const [showPyCreator, setShowPyCreator] = useState(false);
  const [pyDraftName, setPyDraftName] = useState('');
  const [pyDraftCode, setPyDraftCode] = useState('');
  const [pyDraftError, setPyDraftError] = useState('');
  const [pyDraftSaving, setPyDraftSaving] = useState(false);
  const [showMobilePyTools, setShowMobilePyTools] = useState(false);
  const [showMobileFolderTools, setShowMobileFolderTools] = useState(false);
  const restoringRef = useRef(false);
  const didRestoreRef = useRef(false);
  const skipNullSaveRef = useRef(true);
  const pendingFolderIdRef = useRef(null);
  const fileRef = useRef(null);
  const pyRunnerWorkerRef = useRef(null);
  const pyRunnerPendingRef = useRef(new Map());
  const editingPyIdRef = useRef(null);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const getFileUrl = (file) => withStudentId(file?.url, effectiveStudentId);

  const taskOptions = MOCK_TASKS;
  const normalizedCurrentTask = normalizeTaskNumber(currentTask);
  const getNotesTaskNumber = (value) => normalizeTaskNumber(value);
  const getNotesTaskNumbers = (value) => {
    const normalized = normalizeTaskNumber(value);
    if (!Number.isFinite(normalized)) return [];
    if (normalized === GAME_THEORY_TASK) return [19, 20, 21];
    return [normalized];
  };

  useEffect(() => {
    editingPyIdRef.current = editingPyId;
  }, [editingPyId]);

  useEffect(() => {
    if (!effectiveStudentId) return;
    if (didRestoreRef.current) return;
    const studentKey = String(effectiveStudentId);
    const entry = initialLocation && typeof initialLocation === 'object' ? initialLocation : null;
    if (entry && entry.studentId && String(entry.studentId) !== studentKey) {
      didRestoreRef.current = true;
      return;
    }
    if (!entry) {
      didRestoreRef.current = true;
      return;
    }
    const normalizedTask = normalizeTaskNumber(entry.taskNumber);
    const nextTask = Number.isFinite(normalizedTask) ? normalizedTask : null;
    const nextCategory = entry.category === 'class' || entry.category === 'home' ? entry.category : null;
    const nextFolderId = entry.folderId || null;
    if (!nextTask && !nextCategory && !nextFolderId) {
      didRestoreRef.current = true;
      restoringRef.current = false;
      return;
    }
    restoringRef.current = true;
    pendingFolderIdRef.current = nextFolderId;
    setCurrentTask(nextTask);
    setCurrentCategory(nextCategory);
    setCurrentFolderId(null);
    didRestoreRef.current = true;
  }, [effectiveStudentId, initialLocation]);
  const taskCounts = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      const normalizedTask = getNotesTaskNumber(f?.taskNumber);
      if (!Number.isFinite(normalizedTask)) continue;
      map.set(normalizedTask, (map.get(normalizedTask) || 0) + 1);
    }
    return map;
  }, [files]);

  const taskUsageByNumber = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      const taskNum = Number(f?.taskNumber);
      if (!Number.isFinite(taskNum)) continue;
      map.set(taskNum, (map.get(taskNum) || 0) + getEntrySizeBytes(f));
    }
    return map;
  }, [files]);

  const getFolderTaskNumber = (folderId) => {
    if (!folderId) return null;
    const folder = folders.find((item) => item.id === folderId);
    const taskNum = Number(folder?.taskNumber);
    return Number.isFinite(taskNum) ? taskNum : null;
  };

  const getUploadCandidates = (folderIdOverride) => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) return [];
    const folderId = typeof folderIdOverride === 'undefined' ? currentFolderId : folderIdOverride;
    const folderTaskNumber = getFolderTaskNumber(folderId);
    if (Number.isFinite(folderTaskNumber)) return [folderTaskNumber];
    return getNotesTaskNumbers(normalizedCurrentTask);
  };

  const selectUploadTaskNumber = (sizeBytes, usageMap, folderIdOverride) => {
    const candidates = getUploadCandidates(folderIdOverride);
    if (!candidates.length) return null;
    let chosen = null;
    let bestRemaining = -1;
    for (const taskNumber of candidates) {
      const used = usageMap.get(taskNumber) || 0;
      const remaining = MAX_TASK_BYTES - used;
      if (remaining >= sizeBytes && remaining > bestRemaining) {
        chosen = taskNumber;
        bestRemaining = remaining;
      }
    }
    return chosen;
  };

  const categoryCounts = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask)) return { class: 0, home: 0 };
    const counts = { class: 0, home: 0 };
    for (const f of files) {
      if (getNotesTaskNumber(f?.taskNumber) !== normalizedCurrentTask) continue;
      if (f?.category === 'class') counts.class += 1;
      if (f?.category === 'home') counts.home += 1;
    }
    return counts;
  }, [files, normalizedCurrentTask]);

  const folderCounts = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) return { root: 0, map: new Map() };
    const map = new Map();
    let root = 0;
    for (const f of files) {
      if (getNotesTaskNumber(f?.taskNumber) !== normalizedCurrentTask || f?.category !== currentCategory) continue;
      if (f?.folderId) map.set(f.folderId, (map.get(f.folderId) || 0) + 1);
      else root += 1;
    }
    return { root, map };
  }, [files, normalizedCurrentTask, currentCategory]);

  const taskUsageBytes = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask)) return 0;
    const folderTaskNumber = getFolderTaskNumber(currentFolderId);
    if (Number.isFinite(folderTaskNumber)) {
      return taskUsageByNumber.get(folderTaskNumber) || 0;
    }
    if (normalizedCurrentTask === GAME_THEORY_TASK) {
      return getNotesTaskNumbers(normalizedCurrentTask)
        .reduce((sum, taskNumber) => sum + (taskUsageByNumber.get(taskNumber) || 0), 0);
    }
    return taskUsageByNumber.get(normalizedCurrentTask) || 0;
  }, [normalizedCurrentTask, currentFolderId, taskUsageByNumber, folders]);

  const totalLimitBytes = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask)) return MAX_TASK_BYTES;
    const folderTaskNumber = getFolderTaskNumber(currentFolderId);
    if (Number.isFinite(folderTaskNumber)) return MAX_TASK_BYTES;
    if (normalizedCurrentTask === GAME_THEORY_TASK) {
      return MAX_TASK_BYTES * getNotesTaskNumbers(normalizedCurrentTask).length;
    }
    return MAX_TASK_BYTES;
  }, [normalizedCurrentTask, currentFolderId, folders]);

  const remainingBytes = Math.max(0, totalLimitBytes - taskUsageBytes);

  useEffect(() => {
    if (!effectiveStudentId) {
      setFiles([]);
      setFilesError('');
      return;
    }
    let cancelled = false;
    api.getFiles(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setFiles(data);
        setFilesError('');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setFilesError('Не удалось загрузить файлы. Проверьте, что сервер запущен.');
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory || !effectiveStudentId) {
      setFolders([]);
      setFoldersError('');
      return;
    }
    let cancelled = false;
    const taskNumbers = getNotesTaskNumbers(normalizedCurrentTask);
    Promise.all(taskNumbers.map((taskNumber) => api.getFolders(taskNumber, currentCategory, effectiveStudentId)))
      .then((lists) => {
        if (cancelled) return;
        const merged = [];
        const seen = new Set();
        for (const list of lists) {
          for (const folder of list || []) {
            if (!folder?.id || seen.has(folder.id)) continue;
            seen.add(folder.id);
            merged.push(folder);
          }
        }
        setFolders(merged);
        setFoldersError('');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setFoldersError('Не удалось загрузить папки.');
      });
    return () => { cancelled = true; };
  }, [normalizedCurrentTask, currentCategory, effectiveStudentId]);

  useEffect(() => {
    if (!pendingFolderIdRef.current) return;
    const targetId = pendingFolderIdRef.current;
    pendingFolderIdRef.current = null;
    if (targetId && folders.some((item) => item.id === targetId)) {
      setCurrentFolderId(targetId);
    } else {
      setCurrentFolderId(null);
    }
  }, [folders]);

  useEffect(() => {
    const preserveFolder = restoringRef.current;
    if (!preserveFolder) {
      setCurrentFolderId(null);
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
    setRenamingFolderId(null);
    setRenameFolderValue('');
    setIsRenamingFolder(false);
    setRenamingId(null);
    setRenameBase('');
    setRenameExt('');
    setIsRenaming(false);
    setDraggingFileId(null);
    setDragOverFolderId(null);
    setExpandedPyIds({});
    setExpandedPdfIds({});
    setExpandedImageIds({});
    setEditingPyId(null);
    setPyEditDraft('');
    setPyEditSaving(false);
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
    setShowPyCreator(false);
    setPyDraftName('');
    setPyDraftCode('');
    setPyDraftError('');
    setPyDraftSaving(false);
    setShowMobilePyTools(false);
    setShowMobileFolderTools(false);
    if (restoringRef.current && (currentTask || currentCategory)) {
      restoringRef.current = false;
    }
  }, [currentTask, currentCategory]);

  useEffect(() => {
    if (restoringRef.current) {
      setFolders([]);
      setFiles([]);
      setExpandedPyIds({});
      setExpandedPdfIds({});
      setExpandedImageIds({});
      setEditingPyId(null);
      setPyEditDraft('');
      setPyEditSaving(false);
      setPyEditError('');
      setPyRunInput('');
      setPyRunOutput('');
      setPyRunError('');
      setPyRunLoading(false);
      setShowPyCreator(false);
      setPyDraftName('');
      setPyDraftCode('');
      setPyDraftError('');
      setPyDraftSaving(false);
      setShowMobilePyTools(false);
      setShowMobileFolderTools(false);
      didRestoreRef.current = false;
      skipNullSaveRef.current = true;
      return;
    }
    setCurrentTask(null);
    setCurrentCategory(null);
    setCurrentFolderId(null);
    setFolders([]);
    setFiles([]);
    setExpandedPyIds({});
    setExpandedPdfIds({});
    setExpandedImageIds({});
    setEditingPyId(null);
    setPyEditDraft('');
    setPyEditSaving(false);
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
    setShowPyCreator(false);
    setPyDraftName('');
    setPyDraftCode('');
    setPyDraftError('');
    setPyDraftSaving(false);
    setShowMobilePyTools(false);
    setShowMobileFolderTools(false);
    pendingFolderIdRef.current = null;
    restoringRef.current = false;
    didRestoreRef.current = false;
    skipNullSaveRef.current = true;
  }, [effectiveStudentId]);

  useEffect(() => {
    if (!effectiveStudentId) return;
    if (restoringRef.current) return;
    if (skipNullSaveRef.current && !currentTask && !currentCategory && !currentFolderId) {
      skipNullSaveRef.current = false;
      return;
    }
    skipNullSaveRef.current = false;
    onLocationChange?.({
      studentId: effectiveStudentId,
      taskNumber: currentTask,
      category: currentCategory,
      folderId: currentFolderId
    });
  }, [effectiveStudentId, currentTask, currentCategory, currentFolderId, onLocationChange]);

  const isImageMimeType = (value) => String(value || '').toLowerCase().startsWith('image/');
  const isImageFileName = (name) => /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|heic|heif)$/i.test(String(name || ''));

  const getImageExtensionFromMime = (mime) => {
    const normalized = String(mime || '').toLowerCase();
    if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
    if (normalized === 'image/png') return 'png';
    if (normalized === 'image/gif') return 'gif';
    if (normalized === 'image/webp') return 'webp';
    if (normalized === 'image/bmp') return 'bmp';
    if (normalized === 'image/svg+xml') return 'svg';
    if (normalized === 'image/avif') return 'avif';
    if (normalized === 'image/heic') return 'heic';
    if (normalized === 'image/heif') return 'heif';
    if (normalized === 'image/x-icon' || normalized === 'image/vnd.microsoft.icon') return 'ico';
    return 'png';
  };

  const ensureFileName = (file, prefix = 'upload', index = 0) => {
    if (!file) return null;
    const trimmedName = String(file.name || '').trim();
    if (trimmedName) return file;
    const ext = getImageExtensionFromMime(file.type);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return new File([file], `${prefix}-${stamp}-${index + 1}.${ext}`, { type: file.type || 'application/octet-stream' });
  };

  const getDataTransferFiles = (dataTransfer) => {
    const list = Array.from(dataTransfer?.files || []).filter(Boolean);
    if (list.length > 0) return list;
    const items = Array.from(dataTransfer?.items || []);
    const fromItems = [];
    for (const item of items) {
      if (item?.kind !== 'file') continue;
      const file = item.getAsFile?.();
      if (file) fromItems.push(file);
    }
    return fromItems;
  };

  const getClipboardImageFiles = (clipboardData) => {
    const files = [];
    const fromFiles = Array.from(clipboardData?.files || []);
    fromFiles.forEach((file) => {
      if (!file) return;
      if (!isImageMimeType(file.type) && !isImageFileName(file.name)) return;
      const normalized = ensureFileName(file, 'clipboard', files.length);
      if (normalized) files.push(normalized);
    });
    if (files.length > 0) return files;

    const items = Array.from(clipboardData?.items || []);
    items.forEach((item) => {
      if (item?.kind !== 'file') return;
      const file = item.getAsFile?.();
      if (!file) return;
      if (!isImageMimeType(file.type) && !isImageFileName(file.name)) return;
      const normalized = ensureFileName(file, 'clipboard', files.length);
      if (normalized) files.push(normalized);
    });
    return files;
  };

  const handleUploadFiles = async (fileList) => {
    const filesToUpload = Array.from(fileList || []).filter(Boolean);
    if (filesToUpload.length === 0) return;
    if (!effectiveStudentId) {
      alert('Сначала выберите ученика.');
      return;
    }
    const candidates = getUploadCandidates();
    if (!candidates.length) {
      alert('Сначала выберите задание и категорию.');
      return;
    }
    if (isUploading) return;
    setIsUploading(true);
    const usageByTask = new Map(taskUsageByNumber);
    let skipped = 0;

    for (const file of filesToUpload) {
      const targetTaskNumber = selectUploadTaskNumber(file.size, usageByTask);
      if (!Number.isFinite(targetTaskNumber)) {
        skipped += 1;
        continue;
      }
      try {
        const newF = await api.uploadFile(file, targetTaskNumber, currentCategory, currentFolderId || null, effectiveStudentId);
        setFiles(prev => [newF, ...prev]);
        usageByTask.set(targetTaskNumber, (usageByTask.get(targetTaskNumber) || 0) + file.size);
      } catch(err) {
        alert(err?.message || err);
      }
    }

    setIsUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (skipped > 0) {
      const limitNote = normalizedCurrentTask === GAME_THEORY_TASK && !currentFolderId
        ? 'Лимит 200 МБ на каждое из заданий 19-21.'
        : 'Лимит 200 МБ на задание.';
      alert(`Не хватило места для ${skipped} файла(ов). ${limitNote}`);
    }
  };

  const handleUpload = (e) => {
    handleUploadFiles(e.target.files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = getDataTransferFiles(e.dataTransfer);
    handleUploadFiles(dropped);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPaste = (event) => {
      if (!effectiveStudentId || !Number.isFinite(normalizedCurrentTask) || !currentCategory) return;
      if (isUploading) return;
      const imageFiles = getClipboardImageFiles(event.clipboardData);
      if (!imageFiles.length) return;
      event.preventDefault();
      event.stopPropagation();
      handleUploadFiles(imageFiles);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [
    effectiveStudentId,
    normalizedCurrentTask,
    currentCategory,
    isUploading,
    handleUploadFiles
  ]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setFoldersError('Введите название папки.');
      return;
    }
    const uploadTaskNumber = normalizedCurrentTask;
    if (!Number.isFinite(uploadTaskNumber) || !currentCategory || !effectiveStudentId) return;
    try {
      const created = await api.createFolder(uploadTaskNumber, currentCategory, name, effectiveStudentId);
      setFolders(prev => [created, ...prev]);
      setNewFolderName('');
      setIsCreatingFolder(false);
      setFoldersError('');
      setCurrentFolderId(created.id);
    } catch (err) {
      setFoldersError(err?.message || err);
    }
  };

  const startRenameFolder = (folder) => {
    setRenamingFolderId(folder.id);
    setRenameFolderValue(folder.name || '');
  };

  const cancelRenameFolder = () => {
    setRenamingFolderId(null);
    setRenameFolderValue('');
    setIsRenamingFolder(false);
  };

  const saveRenameFolder = async (folder, nameOverride) => {
    if (!folder?.id) return;
    const name = (nameOverride ?? renameFolderValue).trim();
    if (!name || name === folder.name) {
      cancelRenameFolder();
      return;
    }
    setIsRenamingFolder(true);
    try {
      const updated = await api.renameFolder(folder.id, name);
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? { ...f, name: updated.name } : f)));
      setFiles((prev) => prev.map((f) => (f.folderId === updated.id ? { ...f, folderName: updated.name } : f)));
      cancelRenameFolder();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const handleDragStartFile = (e, file) => {
    if (renamingId === file.id) return;
    setDraggingFileId(file.id);
    e.dataTransfer.setData('text/plain', file.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEndFile = () => {
    setDraggingFileId(null);
    setDragOverFolderId(null);
  };

  const handleFolderDragOver = (e, folderId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleFolderDragLeave = (e, folderId) => {
    e.preventDefault();
    if (dragOverFolderId === folderId) setDragOverFolderId(null);
  };

  const handleFolderDrop = async (e, folderId) => {
    e.preventDefault();
    const fileId = e.dataTransfer.getData('text/plain');
    if (!fileId) return;
    if (folderId) {
      const file = files.find((item) => item.id === fileId);
      const folder = folders.find((item) => item.id === folderId);
      const fileTask = Number(file?.taskNumber);
      const folderTask = Number(folder?.taskNumber);
      if (Number.isFinite(fileTask) && Number.isFinite(folderTask) && fileTask !== folderTask) {
        alert('Нельзя переместить файл в папку другого задания.');
        setDragOverFolderId(null);
        return;
      }
    }
    try {
      const updated = await api.moveFile(fileId, folderId);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? { ...f, folderId: updated.folderId, folderName: updated.folderName } : f)));
      setDraggingFileId(null);
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setDragOverFolderId(null);
    }
  };

  const isPyFile = (name) => name?.toLowerCase().endsWith('.py');
  const isPdfFile = (name) => name?.toLowerCase().endsWith('.pdf');
  const isImageFile = (value) => {
    const name = typeof value === 'string' ? value : value?.name;
    const mime = typeof value === 'string' ? '' : value?.type;
    return isImageFileName(name) || isImageMimeType(mime);
  };
  const isExcelFile = (name) => {
    const lower = name?.toLowerCase() || '';
    return (
      lower.endsWith('.xls') ||
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xlsm') ||
      lower.endsWith('.xlsb') ||
      lower.endsWith('.xlt') ||
      lower.endsWith('.xltx') ||
      lower.endsWith('.ods') ||
      lower.endsWith('.ots') ||
      lower.endsWith('.fods')
    );
  };

  const normalizePyFileName = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.py') ? trimmed : `${trimmed}.py`;
  };

  const getPyDraftSize = (code) => new Blob([code ?? ''], { type: 'text/x-python' }).size;

  const handleCreatePyFile = async () => {
    if (!effectiveStudentId) {
      setPyDraftError('Сначала выберите ученика.');
      return;
    }
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) {
      setPyDraftError('Сначала выберите задание и категорию.');
      return;
    }
    const normalizedName = normalizePyFileName(pyDraftName);
    if (!normalizedName) {
      setPyDraftError('Введите название файла.');
      return;
    }
    const code = String(pyDraftCode ?? '');
    const sizeBytes = getPyDraftSize(code);
    const usageByTask = new Map(taskUsageByNumber);
    const uploadTaskNumber = selectUploadTaskNumber(sizeBytes, usageByTask);
    if (!Number.isFinite(uploadTaskNumber)) {
      setPyDraftError('Недостаточно места для сохранения файла в этом задании.');
      return;
    }
    if (pyDraftSaving) return;
    setPyDraftSaving(true);
    setPyDraftError('');
    try {
      const file = new File([code], normalizedName, { type: 'text/x-python' });
      const created = await api.uploadFile(file, uploadTaskNumber, currentCategory, currentFolderId || null, effectiveStudentId);
      setFiles((prev) => [created, ...prev]);
      setPyDraftName('');
      setPyDraftCode('');
      setShowPyCreator(false);
    } catch (err) {
      setPyDraftError(err?.message || err);
    } finally {
      setPyDraftSaving(false);
    }
  };

  const PdfLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <rect x="3" y="2" width="18" height="20" rx="3" fill="#E53E3E" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="7"
        fontFamily="Arial, sans-serif"
        fill="#FFFFFF"
      >
        PDF
      </text>
    </svg>
  );

  const PyLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <path
        fill="#3776AB"
        d="M12 2c-4 0-4 2-4 2v3h8v1H6c-2.2 0-4 1.8-4 4v2c0 2.2 1.8 4 4 4h2v-3c0-2.2 1.8-4 4-4h4c2.2 0 4-1.8 4-4V6c0-2.2-1.8-4-4-4h-4z"
      />
      <circle cx="10" cy="4.5" r="0.9" fill="#FFFFFF" />
      <path
        fill="#FFD43B"
        d="M12 22c4 0 4-2 4-2v-3h-8v-1h10c2.2 0 4-1.8 4-4v-2c0-2.2-1.8-4-4-4h-2v3c0 2.2-1.8 4-4 4h-4c-2.2 0-4 1.8-4 4v3c0 2.2 1.8 4 4 4h4z"
      />
      <circle cx="14" cy="19.5" r="0.9" fill="#FFFFFF" />
    </svg>
  );

  const ExcelLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <rect x="3" y="2" width="18" height="20" rx="3" fill="#1F7A3E" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="7"
        fontFamily="Arial, sans-serif"
        fill="#FFFFFF"
      >
        XLS
      </text>
    </svg>
  );

  const FileIcon = ({ name }) => {
    if (isImageFile(name)) {
      return (
        <div className="flex flex-col items-center w-12">
          <div className="w-10 h-10 flex items-center justify-center bg-transparent">
            <ImageIcon size={22} className="text-violet-600" />
          </div>
          <span className="text-[10px] font-bold text-violet-700 mt-1">IMG</span>
        </div>
      );
    }
    if (isPdfFile(name)) {
      return (
        <div className="flex flex-col items-center w-12">
          <div className="w-10 h-10 flex items-center justify-center bg-transparent">
            <PdfLogo />
          </div>
          <span className="text-[10px] font-bold text-red-600 mt-1">PDF</span>
        </div>
      );
    }
    if (isExcelFile(name)) {
      return (
        <div className="flex flex-col items-center w-12">
          <div className="w-10 h-10 flex items-center justify-center bg-transparent">
            <ExcelLogo />
          </div>
          <span className="text-[10px] font-bold text-green-700 mt-1">XLS</span>
        </div>
      );
    }
    if (isPyFile(name)) {
      return (
        <div className="flex flex-col items-center w-12">
          <div className="w-10 h-10 flex items-center justify-center bg-transparent">
            <PyLogo />
          </div>
          <span className="text-[10px] font-bold text-blue-600 mt-1">PY</span>
        </div>
      );
    }
    return (
      <div className="w-10 h-10 flex items-center justify-center bg-transparent">
        <FileText size={20} className="text-gray-600"/>
      </div>
    );
  };

  const handleDownload = (file) => {
    const url = getFileUrl(file);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    if (file?.name) link.download = file.name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getPyFileSize = (code) => new Blob([code ?? ''], { type: 'text/x-python' }).size;

  const resolvePyRunnerPending = (message) => {
    pyRunnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    pyRunnerPendingRef.current.clear();
  };

  const disposePyRunnerWorker = (message = '') => {
    if (pyRunnerWorkerRef.current) {
      pyRunnerWorkerRef.current.terminate();
      pyRunnerWorkerRef.current = null;
    }
    if (message) resolvePyRunnerPending(message);
  };

  const ensurePyRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (pyRunnerWorkerRef.current) return pyRunnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = pyRunnerPendingRef.current.get(data.id);
        if (!pending) return;
        const messageType = typeof data.type === 'string' ? data.type : 'result';
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
        pyRunnerPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string'
          ? data.output
          : (data.output ? String(data.output) : (pending.output || ''));
        const error = typeof data.error === 'string'
          ? data.error
          : (data.error ? String(data.error) : (pending.error || ''));
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, done: true });
        }
        pending.resolve({ output, error });
      };
      worker.onerror = () => disposePyRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposePyRunnerWorker('Ошибка выполнения Python.');
      pyRunnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  useEffect(() => () => disposePyRunnerWorker('Python runner stopped.'), []);

  const runPyInMainThread = async (source, inputValue) => {
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

  const runPyCode = async (source, inputValue, onProgress = null) => {
    const worker = ensurePyRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = pyRunnerPendingRef.current.get(id);
          if (!pending) return;
          pyRunnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposePyRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        pyRunnerPendingRef.current.set(id, {
          resolve,
          timer,
          output: '',
          error: '',
          onProgress: typeof onProgress === 'function' ? onProgress : null,
        });
        worker.postMessage({ id, source, input: inputValue });
      });
    }
    if (!ALLOW_MAIN_THREAD_PYTHON_FALLBACK) {
      return {
        output: '',
        error: 'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.'
      };
    }
    return runPyInMainThread(source, inputValue);
  };

  const handleRunEditedPyFile = async () => {
    if (!editingPyId) return;
    if (pyRunLoading) return;
    const targetId = editingPyId;
    setPyRunLoading(true);
    setPyRunError('');
    setPyRunOutput('');
    try {
      const result = await runPyCode(pyEditDraft, pyRunInput, (progress) => {
        if (editingPyIdRef.current !== targetId) return;
        setPyRunOutput(progress?.output || '');
        setPyRunError(progress?.error || '');
      });
      if (editingPyIdRef.current !== targetId) return;
      setPyRunOutput(result.output || '');
      setPyRunError(result.error || '');
    } catch (err) {
      if (editingPyIdRef.current !== targetId) return;
      setPyRunOutput('');
      setPyRunError(err?.message || 'Ошибка выполнения Python');
    } finally {
      if (editingPyIdRef.current !== targetId && editingPyIdRef.current !== null) return;
      setPyRunLoading(false);
    }
  };

  const loadPyFileContent = async (file) => {
    const url = getFileUrl(file);
    if (!url || !isPyFile(file?.name)) return null;
    if (Object.prototype.hasOwnProperty.call(pyContent, file.id)) {
      return pyContent[file.id] ?? '';
    }
    if (pyError[file.id]) return null;

    setPyLoadingId(file.id);
    try {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error('Не удалось загрузить файл');
      const text = await res.text();
      setPyContent((prev) => ({ ...prev, [file.id]: text }));
      return text;
    } catch (err) {
      setPyError((prev) => ({ ...prev, [file.id]: err?.message || 'Ошибка загрузки' }));
      return null;
    } finally {
      setPyLoadingId(null);
    }
  };

  const togglePyPreview = async (file) => {
    if (!isPyFile(file?.name)) return;
    const willOpen = !expandedPyIds[file.id];
    setExpandedPyIds((prev) => {
      const next = { ...prev };
      if (next[file.id]) delete next[file.id];
      else next[file.id] = true;
      return next;
    });
    if (!willOpen && editingPyId === file.id) {
      setEditingPyId(null);
      setPyEditDraft('');
      setPyEditSaving(false);
      setPyEditError('');
      setPyRunInput('');
      setPyRunOutput('');
      setPyRunError('');
      setPyRunLoading(false);
      return;
    }
    if (!willOpen) return;
    await loadPyFileContent(file);
  };

  const startEditingPyFile = async (file) => {
    if (!isPyFile(file?.name)) return;
    if (pyEditSaving) return;
    if (!expandedPyIds[file.id]) {
      setExpandedPyIds((prev) => ({ ...prev, [file.id]: true }));
    }
    let content = Object.prototype.hasOwnProperty.call(pyContent, file.id) ? (pyContent[file.id] ?? '') : null;
    if (content === null) {
      content = await loadPyFileContent(file);
    }
    if (content === null) return;
    setEditingPyId(file.id);
    setPyEditDraft(String(content ?? ''));
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
  };

  const cancelEditingPyFile = () => {
    setEditingPyId(null);
    setPyEditDraft('');
    setPyEditSaving(false);
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
  };

  const saveEditingPyFile = async (file) => {
    if (!isPyFile(file?.name) || !file?.id) return;
    if (editingPyId !== file.id || pyEditSaving) return;
    setPyEditSaving(true);
    setPyEditError('');
    try {
      const content = String(pyEditDraft ?? '');
      const updated = await api.updateFileContent(file.id, content);
      setFiles((prev) => prev.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)));
      setPyContent((prev) => ({ ...prev, [file.id]: content }));
      cancelEditingPyFile();
    } catch (err) {
      setPyEditError(err?.message || 'Не удалось сохранить файл');
    } finally {
      setPyEditSaving(false);
    }
  };

  const togglePdfPreview = (file) => {
    const url = getFileUrl(file);
    if (!url || !isPdfFile(file.name)) return;
    setExpandedPdfIds((prev) => {
      const next = { ...prev };
      if (next[file.id]) delete next[file.id];
      else next[file.id] = true;
      return next;
    });
  };

  const toggleImagePreview = (file) => {
    const url = getFileUrl(file);
    if (!url || !isImageFile(file)) return;
    setExpandedImageIds((prev) => {
      const next = { ...prev };
      if (next[file.id]) delete next[file.id];
      else next[file.id] = true;
      return next;
    });
  };

  const toggleFilePreview = (file) => {
    if (isPyFile(file.name)) return togglePyPreview(file);
    if (isPdfFile(file.name)) return togglePdfPreview(file);
    if (isImageFile(file)) return toggleImagePreview(file);
    return null;
  };

  const handleDelete = async (file) => {
    if (!confirm('Удалить файл?')) return;
    try {
      await api.deleteFile(file.id);
      setFiles(prev => prev.filter(x => x.id !== file.id));
      setExpandedPyIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      setExpandedPdfIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      setExpandedImageIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      if (renamingId === file.id) {
        cancelRename();
      }
      if (editingPyId === file.id) {
        cancelEditingPyFile();
      }
    } catch(err) {
      alert(err?.message || err);
    }
  };

  const splitFileName = (name = '') => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === name.length - 1) {
      return { base: name, ext: '' };
    }
    return { base: name.slice(0, lastDot), ext: name.slice(lastDot + 1) };
  };

  const startRename = (file) => {
    setRenamingId(file.id);
    const { base, ext } = splitFileName(file?.name || '');
    setRenameBase(base);
    setRenameExt(ext);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameBase('');
    setRenameExt('');
    setIsRenaming(false);
  };

  const saveRename = async (file, nameOverride) => {
    if (!file?.id) return;
    const base = (nameOverride ?? renameBase).trim();
    if (!base) {
      cancelRename();
      return;
    }
    const ext = renameExt ? `.${renameExt}` : '';
    const name = `${base}${ext}`;
    if (name === file.name) {
      cancelRename();
      return;
    }
    setIsRenaming(true);
    try {
      const updated = await api.renameFile(file.id, name);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? { ...f, name: updated.name } : f)));
      if (!isPyFile(updated.name)) {
        setExpandedPyIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
        if (editingPyId === file.id) {
          cancelEditingPyFile();
        }
      }
      if (!isPdfFile(updated.name)) {
        setExpandedPdfIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      }
      if (!isImageFile(updated)) {
        setExpandedImageIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      }
      cancelRename();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setIsRenaming(false);
    }
  };

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="inline-flex w-full sm:w-auto items-center gap-2 rounded-2xl border border-purple-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-purple-100/40">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-purple-500">Ученик</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="w-full min-w-0 sm:min-w-[180px] rounded-xl border border-purple-100 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const tasksWithFilesCount = taskOptions.reduce((sum, task) => {
    return sum + ((taskCounts.get(task.number) || 0) > 0 ? 1 : 0);
  }, 0);

  const renderNotesIntro = (message) => (
    <div className="animate-fadeIn space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 space-y-3 md:space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Конспекты</h2>
              <p className="hidden md:block text-sm text-slate-600">Материалы по заданиям, папкам и категориям</p>
            </div>
            {renderStudentPicker()}
          </div>
          <div className="rounded-2xl border border-dashed border-purple-200 bg-white/75 px-3 py-2.5 md:px-4 md:py-3 text-[13px] md:text-sm text-slate-600">
            {message}
          </div>
        </div>
      </div>
    </div>
  );

  if (role === 'teacher' && studentsList.length === 0) {
    return renderNotesIntro(
      studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return renderNotesIntro('Выберите ученика, чтобы открыть его материалы.');
  }

  if (!currentTask) return (
    <div className="animate-fadeIn space-y-4 md:space-y-5" data-tour="notes">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3 md:gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Конспекты</h2>
              <p className="hidden md:block text-sm text-slate-600">Выберите задание, чтобы открыть материалы</p>
            </div>
            {renderStudentPicker()}
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2 text-[11px] md:text-xs font-semibold">
            <span className="inline-flex items-center rounded-full border border-purple-200 bg-white/90 px-2 py-1 md:px-2.5 text-purple-700">
              {`Файлов: ${files.length}`}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white/90 px-2 py-1 md:px-2.5 text-emerald-700">
              <span className="sm:hidden">{`Заполнено: ${tasksWithFilesCount}/${taskOptions.length}`}</span>
              <span className="hidden sm:inline">{`Заполнено заданий: ${tasksWithFilesCount}/${taskOptions.length}`}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {taskOptions.map((task) => {
          const taskFilesCount = taskCounts.get(task.number) || 0;
          const hasFiles = taskFilesCount > 0;
          return (
            <Card
              key={task.number}
              onClick={() => setCurrentTask(normalizeTaskNumber(task.number))}
              className={`group space-y-2.5 md:space-y-3 p-3 sm:p-5 ${
                hasFiles
                  ? 'border-purple-200/80 bg-gradient-to-br from-purple-50/65 via-white to-fuchsia-50/35'
                  : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-lg border border-purple-200 bg-white/90 px-2 py-1 text-[11px] md:text-xs font-bold text-purple-700">
                  №{getTaskDisplayNumber(task)}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] md:text-[11px] font-semibold ${
                    hasFiles
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                >
                  {hasFiles ? `${taskFilesCount} файлов` : 'Пусто'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-9 w-9 md:h-11 md:w-11 items-center justify-center rounded-xl md:rounded-2xl border ${
                  hasFiles ? 'border-purple-200 bg-white text-purple-600' : 'border-slate-200 bg-white text-slate-400'
                }`}>
                  <Folder size={19} />
                </span>
                <p className="hidden sm:block text-xs text-slate-500">
                  {hasFiles ? 'Открыть материалы задания' : 'Добавьте материалы для этой темы'}
                </p>
                <p className="sm:hidden text-[11px] text-slate-500">
                  {hasFiles ? 'Открыть' : 'Пусто'}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  if (!currentCategory) return (
    <div className="animate-fadeIn space-y-4 md:space-y-5" data-tour="notes">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3 md:gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setCurrentTask(null)}
              className="inline-flex items-center gap-1 rounded-xl border border-purple-100 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-purple-300 hover:text-purple-700"
            >
              <ArrowLeft size={16} />
              К заданиям
            </button>
            {renderStudentPicker()}
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2 text-[11px] md:text-xs font-semibold">
            <span className="inline-flex items-center rounded-full border border-purple-200 bg-white/90 px-2 py-1 md:px-2.5 text-purple-700">
              {`Задание ${formatTaskNumber(currentTask) || currentTask}`}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white/90 px-2 py-1 md:px-2.5 text-emerald-700">
              {`Файлов: ${taskCounts.get(normalizedCurrentTask) || 0}`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <Card
          onClick={() => setCurrentCategory('class')}
          className={`p-4 md:p-7 flex items-center gap-3 md:gap-4 ${
            categoryCounts.class > 0
              ? 'border-orange-200/80 bg-gradient-to-br from-orange-50/70 via-white to-amber-50/45'
              : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'
          }`}
        >
          <div className={`inline-flex h-11 w-11 md:h-14 md:w-14 items-center justify-center rounded-xl md:rounded-2xl border ${
            categoryCounts.class > 0 ? 'border-orange-200 bg-white text-orange-500' : 'border-slate-200 bg-white text-slate-400'
          }`}>
            <BookOpen size={24} />
          </div>
          <div>
            <h3 className="font-bold text-base md:text-lg text-gray-800">На уроке</h3>
            <p className="hidden md:block text-gray-500 text-sm">Презентации и скрипты</p>
            <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
              categoryCounts.class > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-100 text-slate-500'
            }`}>
              {categoryCounts.class > 0 ? `Файлов: ${categoryCounts.class}` : 'Пусто'}
            </span>
          </div>
        </Card>
        <Card
          onClick={() => setCurrentCategory('home')}
          className={`p-4 md:p-7 flex items-center gap-3 md:gap-4 ${
            categoryCounts.home > 0
              ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-lime-50/45'
              : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'
          }`}
        >
          <div className={`inline-flex h-11 w-11 md:h-14 md:w-14 items-center justify-center rounded-xl md:rounded-2xl border ${
            categoryCounts.home > 0 ? 'border-emerald-200 bg-white text-emerald-500' : 'border-slate-200 bg-white text-slate-400'
          }`}>
            <FileText size={24} />
          </div>
          <div>
            <h3 className="font-bold text-base md:text-lg text-gray-800">Домашка</h3>
            <p className="hidden md:block text-gray-500 text-sm">Файлы заданий</p>
            <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
              categoryCounts.home > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-100 text-slate-500'
            }`}>
              {categoryCounts.home > 0 ? `Файлов: ${categoryCounts.home}` : 'Пусто'}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );

  const filtered = files.filter((f) =>
    getNotesTaskNumber(f?.taskNumber) === normalizedCurrentTask &&
    f.category === currentCategory &&
    (currentFolderId ? f.folderId === currentFolderId : !f.folderId)
  );
  const currentFolderLabel = currentFolderId
    ? (folders.find((f) => f.id === currentFolderId)?.name || 'Папка')
    : 'Без папки';
  const pyEditorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true
  };
  const isMobileViewport = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 767px)').matches
    : false;
  const pyDraftEditorHeight = isMobileViewport ? '180px' : '220px';
  const pyFileEditorHeight = isMobileViewport ? '220px' : '340px';
  const pyIdleConsoleText = buildIdleConsoleText(pyRunInput, pyRunOutput, pyRunError);
  const pdfPreviewHeight = isMobileViewport ? '48vh' : '60vh';
  const imagePreviewMaxHeight = isMobileViewport ? '56vh' : '72vh';
  const currentTaskLabel = formatTaskNumber(currentTask) || currentTask;
  const currentCategoryLabel = currentCategory === 'class' ? 'На уроке' : 'Домашка';

  return (
    <div className="animate-fadeIn space-y-4 md:space-y-5" data-tour="notes">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 space-y-3 md:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setCurrentCategory(null)}
              className="inline-flex items-center gap-1 rounded-xl border border-purple-100 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-purple-300 hover:text-purple-700"
            >
              <ArrowLeft size={16} />
              Назад
            </button>
            {renderStudentPicker()}
          </div>
          <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="hidden md:flex text-base md:text-lg font-semibold text-gray-700 flex-wrap items-center gap-2">
                <button
                  onClick={() => setCurrentCategory(null)}
                  className="hover:text-purple-600"
                  type="button"
                >
                  Задание {currentTaskLabel}
                </button>
                <ChevronRight size={16} className="text-gray-300" />
                <button
                  onClick={() => setCurrentFolderId(null)}
                  className="hover:text-purple-600"
                  type="button"
                >
                  {currentCategoryLabel}
                </button>
                <ChevronRight size={16} className="text-gray-300" />
                <span className={currentFolderId ? 'text-gray-700' : 'text-gray-400'}>
                  {currentFolderLabel}
                </span>
              </div>
              <div className="md:hidden text-sm font-semibold text-gray-700">
                {`Задание ${currentTaskLabel} · ${currentCategoryLabel}`}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2 text-[11px] md:text-xs font-semibold">
                <span className="inline-flex items-center rounded-full border border-purple-200 bg-white/90 px-2 py-1 md:px-2.5 text-purple-700">
                  <span className="md:hidden">{`Исп.: ${formatBytes(taskUsageBytes)}`}</span>
                  <span className="hidden md:inline">{`Использовано: ${formatBytes(taskUsageBytes)} из ${formatBytes(totalLimitBytes)}`}</span>
                </span>
                <span className={`inline-flex items-center rounded-full border px-2 py-1 md:px-2.5 ${
                  remainingBytes <= 10 * 1024 * 1024
                    ? 'border-rose-200 bg-rose-50 text-rose-600'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  Осталось: {formatBytes(remainingBytes)}
                </span>
                <span className="hidden md:inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-slate-600">
                  {`Файлов в разделе: ${filtered.length}`}
                </span>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input type="file" ref={fileRef} className="hidden" onChange={handleUpload} multiple />
              <Button onClick={() => fileRef.current.click()} disabled={isUploading} className="w-full sm:w-auto min-w-[128px]">
                <Upload size={18} /> {isUploading ? 'Загрузка...' : 'Загрузить'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="md:hidden grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setShowMobileFolderTools((prev) => {
              const next = !prev;
              if (next) setShowMobilePyTools(false);
              return next;
            });
          }}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
            showMobileFolderTools
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {showMobileFolderTools ? 'Скрыть папки' : `Папки (${folders.length})`}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowMobilePyTools((prev) => {
              const next = !prev;
              if (next) setShowMobileFolderTools(false);
              return next;
            });
          }}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
            showMobilePyTools
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {showMobilePyTools ? 'Скрыть Python' : 'Python файл'}
        </button>
      </div>

      <Card className={`space-y-4 border-purple-200/70 bg-gradient-to-br from-white via-white to-purple-50/45 ${showMobilePyTools ? 'block' : 'hidden'} md:block`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-800">Python файл</h3>
            <p className="text-xs text-slate-500">Создайте .py файл сразу в текущей папке</p>
          </div>
          <Button variant="secondary" onClick={() => setShowPyCreator((v) => !v)}>
            <Plus size={16} /> {showPyCreator ? 'Скрыть' : 'Создать'}
          </Button>
        </div>
        {showPyCreator && (
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row gap-2">
              <input
                type="text"
                value={pyDraftName}
                onChange={(e) => { setPyDraftName(e.target.value); setPyDraftError(''); }}
                placeholder="Название файла (без .py)"
                className="flex-1 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              />
              <Button onClick={handleCreatePyFile} disabled={pyDraftSaving || !pyDraftName.trim()} className="w-full md:w-auto">
                {pyDraftSaving ? 'Сохранение...' : 'Сохранить файл'}
              </Button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-800">
              <Editor
                height={pyDraftEditorHeight}
                language="python"
                theme="vs-dark"
                value={pyDraftCode}
                onChange={(value) => {
                  setPyDraftCode(value ?? '');
                  if (pyDraftError) setPyDraftError('');
                }}
                options={pyEditorOptions}
                loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between text-xs text-gray-400 gap-2">
              <span>Файл сохранится в папке: {currentFolderLabel}</span>
              <span>Размер: {formatBytes(getPyDraftSize(pyDraftCode))}</span>
            </div>
            {pyDraftError && <p className="text-xs text-red-500">{pyDraftError}</p>}
          </div>
        )}
      </Card>

      <Card className={`space-y-4 border-slate-200 bg-white/90 ${showMobileFolderTools ? 'block' : 'hidden'} md:block`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-800">Папки</h3>
            <p className="text-xs text-slate-500">Организуйте материалы внутри выбранного раздела</p>
          </div>
          <Button variant="secondary" onClick={() => setIsCreatingFolder((v) => !v)} className="w-full sm:w-auto">
            <FolderPlus size={16} /> Новая папка
          </Button>
        </div>

        {isCreatingFolder && (
          <div className="flex flex-col md:flex-row gap-2 mb-3">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => { setNewFolderName(e.target.value); setFoldersError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
              placeholder="Название папки"
              className="flex-1 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="w-full md:w-auto">
              Создать
            </Button>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCurrentFolderId(null)}
            onDragOver={(e) => handleFolderDragOver(e, 'root')}
            onDragLeave={(e) => handleFolderDragLeave(e, 'root')}
            onDrop={(e) => handleFolderDrop(e, null)}
            className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
              dragOverFolderId === 'root'
                ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200'
                : currentFolderId === null
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 text-gray-600 hover:border-purple-300'
            }`}
          >
            Без папки
            <span className="ml-2 text-xs opacity-70">{folderCounts.root}</span>
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => {
                if (renamingFolderId !== folder.id) setCurrentFolderId(folder.id);
              }}
              onDoubleClick={() => startRenameFolder(folder)}
              onDragOver={(e) => handleFolderDragOver(e, folder.id)}
              onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
              onDrop={(e) => handleFolderDrop(e, folder.id)}
              className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                dragOverFolderId === folder.id
                  ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200'
                  : currentFolderId === folder.id
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 text-gray-600 hover:border-purple-300'
              }`}
            >
              {renamingFolderId === folder.id ? (
                <input
                  value={renameFolderValue}
                  onChange={(e) => setRenameFolderValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRenameFolder(folder);
                    if (e.key === 'Escape') cancelRenameFolder();
                  }}
                  onBlur={() => {
                    if (!isRenamingFolder) saveRenameFolder(folder);
                  }}
                  className="px-2 py-1 rounded-lg bg-white border border-purple-100 focus:border-purple-500 outline-none text-sm"
                  autoFocus
                />
              ) : (
                <>
                  {folder.name}
                  <span className="ml-2 text-xs opacity-70">{folderCounts.map.get(folder.id) || 0}</span>
                </>
              )}
            </button>
          ))}
        </div>
        {foldersError && <p className="text-xs text-red-500 mt-2">{foldersError}</p>}
      </Card>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-tour="files"
        className={`rounded-3xl border-2 border-dashed p-3.5 md:p-5 transition-all ${
          isDragging
            ? 'border-purple-400 bg-gradient-to-br from-purple-50 via-white to-fuchsia-50/40'
            : 'border-slate-200 bg-gradient-to-br from-white via-white to-slate-50/70'
        }`}
      >
        <div className="mb-3 md:mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span className="hidden md:inline">Перетащите файл сюда или вставьте изображение через Ctrl+V</span>
          <span className="md:hidden">Загрузите файл или вставьте изображение</span>
          <span className="text-[11px] md:text-xs text-slate-400">
            Папка: {currentFolderLabel} • Осталось {formatBytes(remainingBytes)}
          </span>
          {isUploading && <span className="text-xs font-bold text-purple-600">Загрузка...</span>}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-6 md:p-10 text-center text-sm text-slate-400">
            {filesError || 'Пусто'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(f => (
              <div key={f.id} className="space-y-2">
                <div
                className={`flex items-start justify-between rounded-2xl border border-slate-200 bg-white/90 p-3 md:p-4 shadow-sm transition-all ${
                  draggingFileId === f.id ? 'opacity-60' : 'hover:border-purple-200 hover:shadow-md'
                }`}
                draggable={renamingId !== f.id}
                onDragStart={(e) => handleDragStartFile(e, f)}
                onDragEnd={handleDragEndFile}
                onClick={() => toggleFilePreview(f)}
                role={(isPyFile(f.name) || isPdfFile(f.name) || isImageFile(f)) ? 'button' : undefined}
                tabIndex={(isPyFile(f.name) || isPdfFile(f.name) || isImageFile(f)) ? 0 : undefined}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && (isPyFile(f.name) || isPdfFile(f.name) || isImageFile(f))) {
                    e.preventDefault();
                    toggleFilePreview(f);
                  }
                }}
              >
                  <div className="flex items-start gap-3 min-w-0">
                    <FileIcon name={f.name} />
                    <div className="min-w-0">
                      {renamingId === f.id ? (
                        <div className="flex items-center gap-1 w-full">
                          <input
                            value={renameBase}
                            onChange={(e) => setRenameBase(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(f);
                              if (e.key === 'Escape') cancelRename();
                            }}
                            onBlur={() => {
                              if (!isRenaming) saveRename(f);
                            }}
                            className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          {renameExt ? (
                            <span className="text-sm text-gray-500 select-none">.{renameExt}</span>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(f);
                          }}
                          className="font-medium text-sm md:text-base text-gray-800 truncate text-left hover:text-purple-600"
                          title="Переименовать"
                        >
                          {f.name}
                        </button>
                      )}
                      <p className="text-xs text-gray-500">
                        {f.size}
                        <span className="hidden sm:inline">{` • ${f.date}`}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 md:gap-2">
                    {renamingId === f.id ? null : (
                      <>
                        {!isPyFile(f.name) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(f); }}
                            className="p-1.5 md:p-2 hover:bg-gray-100 rounded text-gray-500"
                            title="Скачать файл"
                          >
                            <Download size={17}/>
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(f); }} className="p-1.5 md:p-2 hover:bg-red-50 rounded text-red-500"><Trash2 size={17}/></button>
                      </>
                    )}
                  </div>
                </div>
                {isPyFile(f.name) && (
                  <div className={`overflow-hidden transition-all duration-300 ease-out ${
                    expandedPyIds[f.id] ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <div className="bg-white border rounded-xl p-2 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-gray-500">
                          {editingPyId === f.id
                            ? `Размер: ${formatBytes(getPyFileSize(pyEditDraft))}`
                            : 'Просмотр Python'}
                        </span>
                        {editingPyId === f.id ? (
                          <div className="flex w-full sm:w-auto items-center gap-2">
                            <Button
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelEditingPyFile();
                              }}
                              disabled={pyEditSaving}
                              className="w-full sm:w-auto"
                            >
                              Отмена
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                saveEditingPyFile(f);
                              }}
                              disabled={pyEditSaving}
                              className="w-full sm:w-auto"
                            >
                              {pyEditSaving ? 'Сохранение...' : 'Сохранить'}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingPyFile(f);
                            }}
                            disabled={pyLoadingId === f.id || Boolean(pyError[f.id])}
                            className="w-full sm:w-auto"
                          >
                            Редактировать
                          </Button>
                        )}
                      </div>
                      {editingPyId === f.id ? (
                        <div className="space-y-2">
                          <div className="rounded-xl overflow-hidden border border-gray-800">
                            <Editor
                              height={pyFileEditorHeight}
                              language="python"
                              theme="vs-dark"
                              value={pyEditDraft}
                              onChange={(value) => {
                                setPyEditDraft(value ?? '');
                                if (pyEditError) setPyEditError('');
                                if (pyRunOutput) setPyRunOutput('');
                                if (pyRunError) setPyRunError('');
                              }}
                              options={pyEditorOptions}
                              loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                            />
                          </div>
                          <div className="rounded-xl border p-2 bg-gray-50 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <span className="text-xs font-semibold text-gray-600">
                                Консоль (IDLE): редактируйте секцию `{PY_IDLE_STDIN_HEADER}`
                              </span>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunEditedPyFile();
                                }}
                                disabled={pyRunLoading || pyEditSaving}
                                className="w-full sm:w-auto"
                              >
                                {pyRunLoading ? 'Запуск...' : 'Запустить'}
                              </Button>
                            </div>
                            <textarea
                              value={pyIdleConsoleText}
                              onChange={(e) => {
                                setPyRunInput(parseIdleConsoleInput(e.target.value, pyRunInput));
                              }}
                              readOnly={pyRunLoading}
                              spellCheck={false}
                              className="w-full min-h-[220px] text-xs font-mono leading-5 px-3 py-2 rounded-lg border border-gray-200 bg-white outline-none focus:border-purple-500 resize-y"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl max-h-[55vh] overflow-auto">
                          {pyLoadingId === f.id && (
                            <pre className="language-python m-0 p-4 text-sm"><code>Загрузка...</code></pre>
                          )}
                          {pyLoadingId !== f.id && pyError[f.id] && (
                            <pre className="language-python m-0 p-4 text-sm"><code>{pyError[f.id]}</code></pre>
                          )}
                          {pyLoadingId !== f.id && !pyError[f.id] && (
                            pyContent[f.id]
                              ? (
                                <pre className="language-python m-0 p-4 text-sm">
                                  <code dangerouslySetInnerHTML={{ __html: highlightPython(pyContent[f.id]) }} />
                                </pre>
                              )
                              : (
                                <pre className="language-python m-0 p-4 text-sm"><code># Пустой файл</code></pre>
                              )
                          )}
                        </div>
                      )}
                      {editingPyId === f.id && pyEditError && (
                        <p className="text-xs text-red-500">{pyEditError}</p>
                      )}
                    </div>
                  </div>
                )}
                {isPdfFile(f.name) && (
                  <div className={`overflow-hidden transition-all duration-300 ease-out ${
                    expandedPdfIds[f.id] ? 'max-h-[70vh] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <div className="bg-white border rounded-xl overflow-hidden">
                      <iframe
                        title={f.name}
                        src={getFileUrl(f)}
                        className="w-full"
                        style={{ height: pdfPreviewHeight }}
                      />
                    </div>
                  </div>
                )}
                {isImageFile(f) && (
                  <div className={`overflow-hidden transition-all duration-300 ease-out ${
                    expandedImageIds[f.id] ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <ImageViewer
                      src={getFileUrl(f)}
                      alt={f.name || 'Изображение'}
                      maxHeight={imagePreviewMaxHeight}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ImageViewer = ({ src, alt, maxHeight = '72vh', allowFullscreen = true }) => {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const panRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 6;

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth || !img.naturalHeight) return;
    const rect = container.getBoundingClientRect();
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight, 1);
    const displayWidth = img.naturalWidth * scale;
    const displayHeight = img.naturalHeight * scale;
    const nextOffset = {
      x: (rect.width - displayWidth) / 2,
      y: (rect.height - displayHeight) / 2,
    };
    setZoom(scale);
    setOffset(nextOffset);
  }, []);

  useEffect(() => {
    fitToView();
  }, [src, fitToView]);

  const zoomAt = (nextZoom, clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const currentZoom = zoomRef.current || 1;
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - offsetRef.current.x) / currentZoom;
    const worldY = (screenY - offsetRef.current.y) / currentZoom;
    setZoom(clamped);
    setOffset({
      x: screenX - worldX * clamped,
      y: screenY - worldY * clamped,
    });
  };

  const zoomBy = (factor) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomAt((zoomRef.current || 1) * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.12 : 0.9;
    zoomAt((zoomRef.current || 1) * factor, event.clientX, event.clientY);
  }, []);

  const handlePointerDown = (event) => {
    event.preventDefault();
    setIsPanning(true);
    panRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!panRef.current.active) return;
    const dx = event.clientX - panRef.current.startX;
    const dy = event.clientY - panRef.current.startY;
    setOffset({
      x: panRef.current.originX + dx,
      y: panRef.current.originY + dy,
    });
  };

  const handlePointerUp = (event) => {
    if (!panRef.current.active) return;
    panRef.current.active = false;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (typeof document === 'undefined') return;
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const timer = setTimeout(() => {
      fitToView();
    }, 80);
    return () => clearTimeout(timer);
  }, [isFullscreen, fitToView]);

  const toggleFullscreen = async () => {
    if (!allowFullscreen || typeof document === 'undefined') return;
    const root = containerRef.current;
    try {
      if (!document.fullscreenElement && root?.requestFullscreen) {
        await root.requestFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {}
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event) => handleWheel(event);
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [handleWheel]);

  return (
    <div
      className="relative w-full rounded-xl border border-gray-200 bg-white overflow-hidden"
      style={{ height: isFullscreen ? '100vh' : maxHeight }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none', cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || 'Изображение'}
          className="absolute left-0 top-0 select-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'top left',
          }}
          loading="lazy"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onLoad={fitToView}
        />
      </div>
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/90 px-2 py-1 text-xs font-semibold text-gray-600 shadow-sm">
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.12)}
          className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100"
          aria-label="Отдалить"
        >
          <Minus size={14} />
        </button>
        <span className="min-w-[46px] text-center">{`${Math.round((zoom || 1) * 100)}%`}</span>
        <button
          type="button"
          onClick={() => zoomBy(1.12)}
          className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100"
          aria-label="Приблизить"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={fitToView}
          className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100"
          aria-label="По размеру"
          title="По размеру"
        >
          <RefreshCcw size={14} />
        </button>
        {allowFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100"
            aria-label={isFullscreen ? 'Обычный экран' : 'Полный экран'}
            title={isFullscreen ? 'Обычный экран' : 'Полный экран'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}
          </button>
        )}
      </div>
    </div>
  );
};

const StudentTour = ({ user, view, setView, menuOpen, setMenuOpen, onFinish }) => {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState(null);
  const steps = STUDENT_TOUR_STEPS;
  const step = steps[stepIndex] || {};
  const canShowTour = Boolean(user && user.role === 'student' && !hasStudentSeenTour(user.id));

  useEffect(() => {
    if (!canShowTour) return;
    const timer = setTimeout(() => {
      setOpen(true);
      setStepIndex(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [canShowTour]);

  useEffect(() => {
    if (!open) return;
    if (step.view && step.view !== view) setView(step.view);
    if (typeof window === 'undefined') return;
    if (step.menu === 'open' && window.innerWidth < 768) setMenuOpen(true);
    if (step.menu === 'close' && window.innerWidth < 768) setMenuOpen(false);
  }, [open, stepIndex, step.view, step.menu, view, setView, setMenuOpen]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const targetSelector = step.target;
    const fallbackSelector = step.fallback;
    let rafId = 0;
    const update = () => {
      if (!targetSelector && !fallbackSelector) {
        setHighlightRect(null);
        return;
      }
      let el = targetSelector ? document.querySelector(targetSelector) : null;
      if (!el && fallbackSelector) el = document.querySelector(fallbackSelector);
      if (!el) {
        setHighlightRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        setHighlightRect(null);
        return;
      }
      const pad = 10;
      setHighlightRect({
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2
      });
    };
    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    return () => {
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      cancelAnimationFrame(rafId);
    };
  }, [open, stepIndex, view, menuOpen, step.target, step.fallback]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        markStudentSeenTour(user?.id);
        onFinish?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, user?.id, onFinish]);

  const finishTour = (markDone = true) => {
    setOpen(false);
    if (markDone) markStudentSeenTour(user?.id);
    onFinish?.();
  };

  const handleNext = () => {
    if (stepIndex >= steps.length - 1) {
      finishTour(true);
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handlePrev = () => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  if (!open || !canShowTour || !user || user.role !== 'student') return null;
  if (typeof document === 'undefined') return null;

  const mascotSrc = MASCOT_IMAGES[step.emotion] || mascotGreetings;
  const isLast = stepIndex === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[2000]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      {highlightRect && (
        <div
          className="absolute rounded-3xl ring-2 ring-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none"
          style={{
            top: Math.max(8, highlightRect.top),
            left: Math.max(8, highlightRect.left),
            width: Math.max(0, highlightRect.width),
            height: Math.max(0, highlightRect.height)
          }}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 sm:bottom-6 flex justify-center sm:justify-end">
        <div className="surface-card modal-card w-[min(520px,calc(100%-2rem))] rounded-3xl p-4 sm:p-5 mx-4 sm:mx-0 sm:mr-6">
          <div className="flex items-start gap-3">
            <img src={mascotSrc} alt="Маскот" className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-sm" />
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-400">Шаг {stepIndex + 1} из {steps.length}</p>
              <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{step.text}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button onClick={() => finishTour(true)} className="text-sm text-gray-400 hover:text-gray-600">Пропустить</button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handlePrev} disabled={stepIndex === 0}>Назад</Button>
              <Button onClick={handleNext}>{isLast ? 'Готово' : 'Дальше'}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const NewHomeworkModal = ({ entry, open, onClose, onOpenSchedule, onOpenTask, testsDb, solvedByTask }) => {
  if (!open || !entry) return null;
  const homeWorkText = typeof entry.homeWork === 'string' ? entry.homeWork.trim() : '';
  const lessonLink = typeof entry.lessonLink === 'string' ? entry.lessonLink.trim() : '';
  const boardLink = typeof entry.boardLink === 'string' ? entry.boardLink.trim() : '';
  const issuedAt = entry.issuedAt ? new Date(entry.issuedAt) : null;
  const issuedLabel = issuedAt && !Number.isNaN(issuedAt.getTime())
    ? issuedAt.toLocaleDateString('ru-RU')
    : '';
  const cleanHomeworkLine = (line) => String(line ?? '')
    .replace(/^[\s\u2022\u2013\u2014-]+/, '')
    .replace(/^(?:\u2705|\u{1F7E2})+\s*/u, '')
    .trim();
  const homeworkLines = homeWorkText
    ? homeWorkText.split('\n').map(cleanHomeworkLine).filter(Boolean)
    : [];
  const rawGoals = Array.isArray(entry.goals) && entry.goals.length > 0
    ? entry.goals
    : (entry?.taskNumber && entry?.levelId
      ? [{
          taskNumber: entry.taskNumber,
          levelId: entry.levelId,
          targetQuestions: entry.targetQuestions,
          includeAll: entry.includeAll,
        }]
      : []);
  const firstGoal = rawGoals.find((goal) => Number.isFinite(normalizeTaskNumber(goal?.taskNumber)));
  const firstGoalTaskNumber = firstGoal ? normalizeTaskNumber(firstGoal.taskNumber) : null;
  const firstGoalIsPython = Number.isFinite(firstGoalTaskNumber) ? isPythonTaskNumber(firstGoalTaskNumber) : false;
  const firstGoalLevelId = firstGoal
    ? (firstGoalIsPython ? PYTHON_LEVEL_ID : firstGoal.levelId)
    : null;
  const firstGoalTargets = firstGoal && !firstGoal.includeAll
    ? (Array.isArray(firstGoal.targetQuestions) ? firstGoal.targetQuestions : null)
    : null;
  const getQuestionsCountForGoal = (goal, taskNumberValue, levelIdValue) => {
    if (!goal?.includeAll) return 0;
    if (!testsDb || !taskNumberValue || !levelIdValue) return 0;
    const task = testsDb[String(taskNumberValue)] || testsDb[taskNumberValue];
    const list = task?.[String(levelIdValue)] || task?.[levelIdValue];
    return Array.isArray(list) ? list.length : 0;
  };
  const getSolvedCountForGoal = (goal, taskNumberValue, levelIdValue, targetQuestions) => {
    if (!solvedByTask || !taskNumberValue || !levelIdValue) return 0;
    const taskEntry = solvedByTask?.[String(taskNumberValue)] || {};
    const levelEntry = taskEntry?.[String(levelIdValue)] || {};
    const solvedIds = Array.isArray(levelEntry?.solved) ? levelEntry.solved : [];
    if (!testsDb || solvedIds.length === 0) {
      return goal?.includeAll ? solvedIds.length : 0;
    }
    const task = testsDb[String(taskNumberValue)] || testsDb[taskNumberValue];
    const list = task?.[String(levelIdValue)] || task?.[levelIdValue];
    if (!Array.isArray(list)) {
      return goal?.includeAll ? solvedIds.length : 0;
    }
    const idToNumber = new Map();
    list.forEach((question, index) => {
      const id = question?.id;
      if (id !== undefined && id !== null) {
        idToNumber.set(String(id), index + 1);
      }
    });
    const solvedNumbers = new Set();
    solvedIds.forEach((id) => {
      const mapped = idToNumber.get(String(id));
      if (Number.isFinite(mapped)) solvedNumbers.add(mapped);
    });
    if (goal?.includeAll) return solvedNumbers.size;
    const targets = Array.isArray(targetQuestions) ? targetQuestions : [];
    return targets.filter((num) => solvedNumbers.has(Number(num))).length;
  };
  const goalItems = rawGoals
    .map((goal) => {
      const goalType = normalizeGoalType(goal);
      if (goalType === GOAL_TYPE_MOCK) {
        return { label: 'Пробник', progressLabel: '' };
      }
      const normalizedTaskNumber = normalizeTaskNumber(goal?.taskNumber);
      const taskNumberValue = Number.isFinite(normalizedTaskNumber)
        ? Number(normalizedTaskNumber)
        : Number(goal?.taskNumber);
      const isPythonGoal = Number.isFinite(taskNumberValue) ? isPythonTaskNumber(taskNumberValue) : false;
      const pythonTask = isPythonGoal ? getPythonTaskInfo(taskNumberValue) : null;
      const taskInfo = !isPythonGoal
        ? MOCK_TASKS.find((task) => Number(task.number) === Number(taskNumberValue))
        : null;
      const taskTitle = pythonTask?.title || taskInfo?.title || '';
      const taskDisplay = pythonTask?.displayNumber
        || formatTaskNumber(taskNumberValue)
        || (Number.isFinite(taskNumberValue) ? String(taskNumberValue) : '');
      const levelLabel = isPythonGoal
        ? 'Python'
        : (LEVELS[goal?.levelId?.toUpperCase()]?.label || goal?.levelId || '');
      const label = isPythonGoal
        ? `Python ${taskTitle || (taskDisplay ? `тема ${taskDisplay}` : 'тема')}`
        : (() => {
            const labelBase = taskTitle
              ? `${taskDisplay ? `${taskDisplay}. ` : ''}${taskTitle}`
              : (taskDisplay ? `Задание ${taskDisplay}` : 'Задание');
            return levelLabel ? `${labelBase} · ${levelLabel}` : labelBase;
          })();
      const targetQuestions = Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [];
      const effectiveLevelId = isPythonGoal ? PYTHON_LEVEL_ID : goal?.levelId;
      const totalCount = goal?.includeAll
        ? getQuestionsCountForGoal(goal, taskNumberValue, effectiveLevelId)
        : targetQuestions.length;
      const solvedCount = getSolvedCountForGoal(goal, taskNumberValue, effectiveLevelId, targetQuestions);
      const totalLabel = totalCount
        ? String(totalCount)
        : (goal?.includeAll ? 'все' : '');
      const progressLabel = totalLabel ? `${Math.min(solvedCount, Number(totalLabel) || solvedCount)}/${totalLabel}` : '';
      return { label, progressLabel };
    })
    .filter((item) => item.label);
  const headline = homeworkLines[0]
    || (goalItems.length === 1 ? goalItems[0].label : '');
  const listItems = homeworkLines.length > 1
    ? homeworkLines.slice(1).map((line) => ({ label: line, progressLabel: '' }))
    : goalItems;
  const splitGoalLabel = (label) => {
    const parts = String(label || '').split(' \u00b7 ');
    if (parts.length <= 1) return { title: label, level: '' };
    return { title: parts[0], level: parts.slice(1).join(' \u00b7 ') };
  };

  const modal = (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative w-[min(980px,95vw)] aspect-[3/2]">
        <img
          src={HOMEWORK_POPUP_BG}
          alt={'\u041d\u043e\u0432\u0430\u044f \u0434\u043e\u043c\u0430\u0448\u043a\u0430'}
          className="absolute inset-0 w-full h-full object-contain drop-shadow-2xl"
        />
        <div className="absolute left-[25.5%] right-[26%] top-[29%] bottom-[23%] z-10 flex flex-col">
          <div className="flex-1 flex flex-col items-center text-purple-50/90">
            <div className="mt-3 text-[16px] font-semibold tracking-[0.35em] uppercase text-purple-50/90">{'\u0426\u0415\u041b\u042c'}</div>
            <div className="mt-4 w-full max-w-[420px] space-y-3 text-[16px] text-purple-50/90 mx-auto text-left">
              {listItems.length > 0 ? (
                listItems.map((item, idx) => {
                  const { title, level } = splitGoalLabel(item.label);
                  return (
                    <div key={`${idx}-${item.label.slice(0, 24)}`} className="grid grid-cols-[1fr_auto] items-start gap-4">
                      <div className="leading-snug">
                        <div>{title}</div>
                        {level && <div className="text-[15px] text-purple-100/80">{level}</div>}
                      </div>
                      <div className="flex items-center gap-3 pt-0.5">
                        {item.progressLabel && (
                          <span className="text-sm text-purple-100/70">[{item.progressLabel}]</span>
                        )}
                        <span className="inline-flex w-4 h-4 border border-purple-200/70 rounded-sm" />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-sm text-purple-100/70">
                  {'\u0414\u043e\u043c\u0430\u0448\u043a\u0430 \u043f\u043e\u043a\u0430 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430.'}
                </div>
              )}
            </div>
            <div className="mt-auto w-full flex flex-wrap items-center justify-between gap-3 text-[12px] text-purple-100/80">
              <div className="flex flex-wrap items-center gap-3">
                {Number.isFinite(entry.daysToComplete) && (
                  <span className="ml-2">
                    {'\u0421\u0440\u043e\u043a: '}{entry.daysToComplete}{' \u0434\u043d.'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="bg-white/80 text-gray-800 border border-white/80 hover:bg-white"
                  onClick={onClose}
                >
                  {'\u041f\u043e\u043d\u044f\u043b'}
                </Button>
                <Button
                  className="bg-purple-500/80 hover:bg-purple-500 text-white"
                  onClick={() => {
                    if (firstGoal && Number.isFinite(firstGoalTaskNumber)) {
                      onClose?.();
                      onOpenTask?.(firstGoalTaskNumber, firstGoalLevelId, firstGoalTargets);
                    } else {
                      onOpenSchedule();
                    }
                  }}
                  disabled={!firstGoal || !Number.isFinite(firstGoalTaskNumber)}
                >
                  {'\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044e'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

const MockExamEditorModal = ({ exam, onClose, onSave }) => {
  const [title, setTitle] = useState(exam?.title || '');
  const [selectedTask, setSelectedTask] = useState(MOCK_TASK_NUMBERS[0]);
  const [question, setQuestion] = useState('');
  const [answerInputs, setAnswerInputs] = useState(['']);
  const [existingScreenshots, setExistingScreenshots] = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [newScreenshots, setNewScreenshots] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [removedScreenshots, setRemovedScreenshots] = useState([]);
  const [removedFiles, setRemovedFiles] = useState([]);
  const [previewScreens, setPreviewScreens] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDraggingScreens, setIsDraggingScreens] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const screenshotsRef = useRef(null);
  const filesRef = useRef(null);

  useEffect(() => {
    setTitle(exam?.title || '');
  }, [exam?.id]);

  useEffect(() => {
    setSelectedTask(MOCK_TASK_NUMBERS[0]);
  }, [exam?.id]);

  useEffect(() => {
    const previews = newScreenshots.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviewScreens(previews);
    return () => previews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [newScreenshots]);

  const loadTask = (taskNumber) => {
    const key = String(taskNumber);
    const entry = exam?.tasks?.[key] || null;
    const requiredCount = getMockAnswerCountForTask(taskNumber);
    setQuestion(entry?.question || '');
    setAnswerInputs(getExpectedAnswers(entry, requiredCount));
    setExistingScreenshots(Array.isArray(entry?.screenshots) ? entry.screenshots : []);
    setExistingFiles(Array.isArray(entry?.files) ? entry.files : []);
    setNewScreenshots([]);
    setNewFiles([]);
    setRemovedScreenshots([]);
    setRemovedFiles([]);
    setError('');
  };

  useEffect(() => {
    if (!exam) return;
    loadTask(selectedTask);
  }, [exam, selectedTask]);

  const addScreenshotFiles = (files) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!list.length) return;
    setNewScreenshots((prev) => [...prev, ...list]);
  };

  const addExtraFiles = (files) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setNewFiles((prev) => [...prev, ...list]);
  };

  const handlePasteImages = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const images = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (images.length === 0) return;
    e.preventDefault();
    addScreenshotFiles(images);
  };

  const handleScreensDrop = (e) => {
    e.preventDefault();
    setIsDraggingScreens(false);
    addScreenshotFiles(e.dataTransfer?.files || []);
  };

  const handleFilesDrop = (e) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    addExtraFiles(e.dataTransfer?.files || []);
  };

  const handleSaveTask = async () => {
    if (!exam) return;
    const requiredCount = getMockAnswerCountForTask(selectedTask);
    const trimmedAnswers = answerInputs.map((val) => String(val ?? '').trim());
    const answersSlice = trimmedAnswers.slice(0, requiredCount);
    const hasEmpty = answersSlice.some((val) => !val);
    const hasAny = answersSlice.some((val) => val);
    if (requiredCount > 1 && allowsPartialAnswers(selectedTask)) {
      if (!hasAny) {
        setError('Введите хотя бы один правильный ответ');
        return;
      }
    } else if (hasEmpty) {
      setError(requiredCount > 1 ? 'Введите все правильные ответы' : 'Введите правильный ответ');
      return;
    }
    const hasAnyAttachments = existingScreenshots.length > 0 || existingFiles.length > 0 || newScreenshots.length > 0 || newFiles.length > 0;
    if (!question.trim() && !hasAnyAttachments) {
      setError('Добавьте текст вопроса или прикрепите файл/скриншот');
      return;
    }
    setSaving(true);
    setError('');
    let uploadedScreens = [];
    let uploadedFiles = [];
    try {
      if (newScreenshots.length > 0) {
        uploadedScreens = await Promise.all(newScreenshots.map((file) => api.uploadTestFile(file)));
      }
      if (newFiles.length > 0) {
        uploadedFiles = await Promise.all(newFiles.map((file) => api.uploadTestFile(file)));
      }
    } catch (err) {
      setError(err?.message || err);
      setSaving(false);
      return;
    }

    const finalScreens = [...existingScreenshots, ...uploadedScreens];
    const finalFiles = [...existingFiles, ...uploadedFiles];
    const taskEntry = {
      id: exam?.tasks?.[String(selectedTask)]?.id || Date.now(),
      question: question.trim(),
      screenshots: finalScreens,
      files: finalFiles,
      ...(requiredCount > 1
        ? { answers: answersSlice }
        : { answer: trimmedAnswers[0] })
    };

    const nextTasks = { ...(exam.tasks || {}) };
    nextTasks[String(selectedTask)] = taskEntry;
    const nextTitle = title.trim() || exam.title;
    try {
      const saved = await onSave({ ...exam, title: nextTitle, tasks: nextTasks });
      const removed = [...removedScreenshots, ...removedFiles];
      await Promise.all(removed.map((item) => api.deleteTestFile(item?.storageName)));
      if (saved?.tasks) {
        loadTask(selectedTask);
      }
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!exam) return;
    const nextTitle = title.trim() || exam.title;
    setSaving(true);
    setError('');
    try {
      await onSave({ ...exam, title: nextTitle, tasks: exam.tasks || {} });
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!exam) return;
    if (!exam.tasks?.[String(selectedTask)]) return;
    if (!confirm('Удалить задание из пробника?')) return;
    const current = exam.tasks[String(selectedTask)];
    const nextTasks = { ...(exam.tasks || {}) };
    delete nextTasks[String(selectedTask)];
    setSaving(true);
    setError('');
    try {
      await onSave({ ...exam, title: title.trim() || exam.title, tasks: nextTasks });
      const toRemove = [
        ...(Array.isArray(current?.screenshots) ? current.screenshots : []),
        ...(Array.isArray(current?.files) ? current.files : [])
      ];
      await Promise.all(toRemove.map((item) => api.deleteTestFile(item?.storageName)));
      loadTask(selectedTask);
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
  };

  if (!exam) return null;

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="surface-card modal-card rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Пробник</div>
            <h3 className="text-lg font-bold text-gray-900">Редактирование пробника</h3>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500">Название пробника</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                placeholder="Пробник"
              />
              <div className="mt-2">
                <Button variant="secondary" onClick={handleSaveTitle} disabled={saving}>Сохранить название</Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Задание</label>
              <select
                value={selectedTask}
                onChange={(e) => setSelectedTask(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
              >
                {MOCK_TASK_NUMBERS.map((num) => (
                  <option key={num} value={num}>Задание {num}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
              Добавьте текст, фото, файлы и правильные ответы для задания {selectedTask}.
            </div>
          </div>

            <div className="lg:col-span-2 space-y-4" onPaste={handlePasteImages}>
            <div>
              <label className="text-xs font-semibold text-gray-500">Текст задания</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="mt-1 w-full min-h-[120px] px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                placeholder="Условие задания"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500">Скриншоты</label>
                <div
                  onDrop={handleScreensDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingScreens(true); }}
                  onDragLeave={() => setIsDraggingScreens(false)}
                  className={`mt-1 rounded-2xl border-2 border-dashed p-3 transition-colors ${
                    isDraggingScreens ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <input
                    ref={screenshotsRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => addScreenshotFiles(e.target.files)}
                    className="hidden"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span>Перетащите изображения или вставьте Ctrl+V</span>
                    <button
                      type="button"
                      onClick={() => screenshotsRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                    >
                      Выбрать
                    </button>
                  </div>
                </div>
                {(existingScreenshots.length > 0 || previewScreens.length > 0) && (
                  <div className="mt-2 space-y-2">
                    {existingScreenshots.map((item, idx) => (
                      <div key={item.storageName || item.id || idx} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                        <span className="truncate">{item.name || 'Скриншот'}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setRemovedScreenshots((prev) => [...prev, item]);
                            setExistingScreenshots((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="text-red-500"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                    {previewScreens.map((item, idx) => (
                      <div key={`new-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                        <span className="truncate">{item.file.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-red-500"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500">Доп. файлы</label>
                <div
                  onDrop={handleFilesDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFiles(true); }}
                  onDragLeave={() => setIsDraggingFiles(false)}
                  className={`mt-1 rounded-2xl border-2 border-dashed p-3 transition-colors ${
                    isDraggingFiles ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <input
                    ref={filesRef}
                    type="file"
                    multiple
                    onChange={(e) => addExtraFiles(e.target.files)}
                    className="hidden"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span>Перетащите файлы сюда</span>
                    <button
                      type="button"
                      onClick={() => filesRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                    >
                      Выбрать
                    </button>
                  </div>
                </div>
                {(existingFiles.length > 0 || newFiles.length > 0) && (
                  <div className="mt-2 space-y-2">
                    {existingFiles.map((item, idx) => (
                      <div key={item.storageName || item.id || idx} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                        <span className="truncate">{item.name || 'Файл'}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setRemovedFiles((prev) => [...prev, item]);
                            setExistingFiles((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="text-red-500"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                    {newFiles.map((file, idx) => (
                      <div key={`new-file-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-red-500"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500">Правильные ответы</label>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                {Array.from({ length: getMockAnswerCountForTask(selectedTask) }).map((_, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={answerInputs[idx] ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAnswerInputs((prev) => {
                        const next = [...prev];
                        next[idx] = value;
                        return next;
                      });
                    }}
                    placeholder={`Ответ ${idx + 1}`}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                  />
                ))}
              </div>
            </div>

            {error && <div className="text-xs text-red-500">{error}</div>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleDeleteTask}
                className="text-xs text-red-500 hover:text-red-600"
                disabled={saving}
              >
                Удалить задание
              </button>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={onClose}>Закрыть</Button>
                <Button onClick={handleSaveTask} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить задание'}
                </Button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

const MockExamModal = ({ exam, studentId, initialAttempt, onClose, onAttemptSaved }) => {
  const [selectedTask, setSelectedTask] = useState(MOCK_TASK_NUMBERS[0]);
  const [answers, setAnswers] = useState({});
  const [solved, setSolved] = useState({});
  const [results, setResults] = useState({});
  const [saveError, setSaveError] = useState('');
  const [expandedImage, setExpandedImage] = useState(null);
  const hasLocalAttemptChangesRef = useRef(false);

  const readAttemptAnswers = (attempt) => (
    attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : {}
  );
  const readAttemptSolved = (attempt) => (
    attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {}
  );

  useEffect(() => {
    hasLocalAttemptChangesRef.current = false;
    setAnswers(readAttemptAnswers(initialAttempt));
    setSolved(readAttemptSolved(initialAttempt));
    setResults({});
    setSaveError('');
    setSelectedTask(MOCK_TASK_NUMBERS[0]);
  }, [exam?.id, studentId]);

  useEffect(() => {
    if (hasLocalAttemptChangesRef.current) return;
    setAnswers(readAttemptAnswers(initialAttempt));
    setSolved(readAttemptSolved(initialAttempt));
    setResults({});
    setSaveError('');
  }, [initialAttempt]);

  useEffect(() => {
    setSaveError('');
  }, [selectedTask]);

  const taskKey = String(selectedTask);
  const currentQuestion = exam?.tasks?.[taskKey];
  const answerCount = getMockAnswerCountForTask(selectedTask);
  const rawAnswer = answers[taskKey];
  const currentAnswers = Array.isArray(rawAnswer)
    ? rawAnswer
    : (typeof rawAnswer === 'string'
      ? [rawAnswer, ...Array.from({ length: Math.max(0, answerCount - 1) }, () => '')]
      : Array.from({ length: answerCount }, () => '')
    );
  const singleAnswer = typeof rawAnswer === 'string'
    ? rawAnswer
    : (Array.isArray(rawAnswer) ? (rawAnswer[0] ?? '') : '');

  const handleCheck = async () => {
    if (!currentQuestion || !studentId) return;
    if (answerCount > 1) {
      const allowPartial = allowsPartialAnswers(selectedTask);
      const provided = Array.from({ length: answerCount }, (_, i) => String(currentAnswers[i] ?? ''));
      if (!allowPartial && provided.some((val) => !val.trim())) return;
      if (allowPartial && provided.every((val) => !val.trim())) return;
    } else {
      if (!String(singleAnswer ?? '').trim()) return;
    }
    hasLocalAttemptChangesRef.current = true;
    setSaveError('');
    try {
      const saved = await api.saveMockAttempt(studentId, exam.id, { answers });
      if (saved && typeof saved === 'object') {
        const savedSolved = readAttemptSolved(saved);
        const isCorrect = Boolean(savedSolved[taskKey]);
        setSolved(savedSolved);
        setResults((prev) => ({ ...prev, [taskKey]: isCorrect }));
        onAttemptSaved?.(exam.id, saved);
      }
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : '';
      setSaveError(message || 'Не удалось сохранить ответ. Попробуйте снова.');
    }
  };

  const solvedCount = Object.values(solved || {}).filter(Boolean).length;
  const primaryScore = getPrimaryScoreFromSolved(solved);
  const secondaryScore = getSecondaryScoreFromPrimary(primaryScore);
  const firstTaskNumber = MOCK_TASK_NUMBERS[0];
  const lastTaskNumber = MOCK_TASK_NUMBERS[MOCK_TASK_NUMBERS.length - 1];
  const progressPercent = Math.min(100, Math.round((solvedCount / lastTaskNumber) * 100));
  const isFirstTask = selectedTask === firstTaskNumber;
  const isLastTask = selectedTask === lastTaskNumber;
  const handlePrevTask = () => setSelectedTask((prev) => Math.max(firstTaskNumber, prev - 1));
  const handleNextTask = () => setSelectedTask((prev) => Math.min(lastTaskNumber, prev + 1));
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const files = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));

  if (!exam) return null;

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="surface-card modal-card rounded-3xl w-full max-w-6xl max-h-[92vh] p-4 md:p-6 shadow-2xl relative flex flex-col overflow-hidden bg-gradient-to-br from-white via-white to-purple-50/60 border border-purple-100/60">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-purple-50 text-purple-700 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
                Пробник
              </span>
              <span className="inline-flex items-center rounded-full border border-purple-100 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                ЕГЭ
              </span>
            </div>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-4">
              <h3 className="text-2xl md:text-3xl font-display font-bold text-gray-900">{exam.title}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="px-2 py-1 rounded-full border border-purple-100 bg-white/80 hidden sm:inline-flex">
                  Баллы: <span className="font-semibold text-purple-700">{secondaryScore}</span>
                  <span className="text-gray-400">{` (${primaryScore} перв.)`}</span>
                </span>
                <span className="px-2 py-1 rounded-full border border-gray-200 bg-white/80 hidden sm:inline-flex">
                  Решено: <span className="font-semibold text-gray-700">{solvedCount}</span>/27
                </span>
                <span className="px-2 py-1 rounded-full border border-purple-100 bg-white/80 sm:hidden">
                  Баллы: <span className="font-semibold text-purple-700">{secondaryScore}</span>
                </span>
              </div>
            </div>
            <div className="max-w-xs hidden sm:block">
              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <span>Прогресс</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-purple-100/70 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/90 border border-gray-200 rounded-full hover:bg-gray-100"><X size={20}/></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 flex-1 overflow-hidden">
          <div className="surface-panel rounded-2xl p-3 overflow-y-auto hidden sm:block">
            <div className="rounded-2xl bg-gradient-to-br from-purple-600 via-purple-600 to-fuchsia-500 text-white p-4 shadow-sm relative overflow-hidden hidden sm:block">
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-purple-100">Прогресс</div>
              <div className="mt-2 text-2xl font-display font-bold">{secondaryScore} баллов</div>
              <div className="text-xs text-purple-100">{primaryScore} первичных</div>
              <div className="mt-3 h-2 rounded-full bg-white/25 overflow-hidden">
                <div className="h-2 rounded-full bg-white transition-all duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="mt-2 text-[11px] text-purple-100">{solvedCount} из 27 решено</div>
            </div>

            <div className="mt-3 sm:mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500">Задания</div>
                <div className="text-[10px] text-gray-400">1–27</div>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-4 gap-2">
                {MOCK_TASK_NUMBERS.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSelectedTask(num)}
                    className={`h-10 rounded-xl border text-xs font-semibold transition-all duration-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
                      num === selectedTask
                        ? 'border-purple-500 bg-purple-600 text-white shadow-md shadow-purple-200'
                        : (solved[String(num)] ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400' : 'border-gray-200 text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700')
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] text-gray-500">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-600" />
                Текущее
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Решено
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
                Не решено
              </div>
            </div>
          </div>

          <div className="overflow-y-auto pr-1">
            {!currentQuestion ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-gray-500 text-sm bg-white/70">
                Задание {selectedTask} ещё не добавлено преподавателем.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 border border-purple-100/60 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-purple-500">Задание</span>
                    <span className="text-lg font-display font-bold text-gray-900">№ {selectedTask}</span>
                    <span className="text-[10px] uppercase tracking-widest text-gray-400">ЕГЭ</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrevTask}
                      disabled={isFirstTask}
                      className="h-9 w-9 rounded-full border border-gray-200 bg-white/90 text-gray-500 transition hover:border-purple-300 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Предыдущее задание"
                    >
                      <ChevronRight size={16} className="rotate-180 mx-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextTask}
                      disabled={isLastTask}
                      className="h-9 w-9 rounded-full border border-gray-200 bg-white/90 text-gray-500 transition hover:border-purple-300 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Следующее задание"
                    >
                      <ChevronRight size={16} className="mx-auto" />
                    </button>
                  </div>
                </div>
                {currentQuestion?.question && (
                  <div className="whitespace-pre-wrap text-gray-900 text-base leading-relaxed bg-white/90 border border-purple-100/60 border-l-4 border-l-purple-400/60 rounded-2xl p-4 pl-5 shadow-sm">
                    {currentQuestion.question}
                  </div>
                )}

                {screenshots.length > 0 && (
                  <div className="space-y-4">
                    {screenshots.map((img) => (
                      <img
                        key={img.storageName || img.url}
                        src={img.url}
                        alt={img.name || 'Скриншот'}
                        className="w-full max-h-[70vh] rounded-2xl border border-gray-200 object-contain bg-white cursor-pointer shadow-sm hover:shadow-lg transition-shadow"
                        onClick={() => setExpandedImage(img.url)}
                      />
                    ))}
                  </div>
                )}

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <a
                        key={file.storageName || file.url}
                        href={file.url}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="truncate">{file.name || 'Файл'}</span>
                        <Download size={16} className="text-purple-600" />
                      </a>
                    ))}
                  </div>
                )}

                <div className="rounded-2xl border border-purple-100/70 bg-white/95 p-4 shadow-sm">
                  <div className="text-xs font-bold text-gray-400 uppercase mb-2">Ответ ученика</div>
                  {answerCount > 1 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {Array.from({ length: answerCount }).map((_, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={currentAnswers[idx] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            hasLocalAttemptChangesRef.current = true;
                            setSaveError('');
                            setAnswers((prev) => {
                              const next = { ...prev };
                              const prevEntry = next[taskKey];
                              const arr = Array.isArray(prevEntry)
                                ? [...prevEntry]
                                : (typeof prevEntry === 'string'
                                  ? [prevEntry, ...Array.from({ length: Math.max(0, answerCount - 1) }, () => '')]
                                  : Array.from({ length: answerCount }, () => '')
                                );
                              arr[idx] = value;
                              next[taskKey] = arr;
                              return next;
                            });
                          }}
                          placeholder={`Ответ ${idx + 1}`}
                          className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                        />
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={singleAnswer}
                      onChange={(e) => {
                        hasLocalAttemptChangesRef.current = true;
                        setSaveError('');
                        setAnswers((prev) => ({ ...prev, [taskKey]: e.target.value }));
                      }}
                      placeholder="Введите ответ..."
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                    />
                  )}
                  {results[taskKey] !== undefined && (
                    <div className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      results[taskKey]
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-600 border border-rose-200'
                    }`}>
                      {results[taskKey] ? 'Верно' : 'Неверно'}
                    </div>
                  )}
                  {saveError && (
                    <div className="mt-2 text-xs text-rose-600">{saveError}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-gray-500 bg-white/80 border border-gray-200 rounded-full px-3 py-1 self-start whitespace-nowrap">
            Задание {selectedTask} из 27
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">Закрыть</Button>
            <Button onClick={handleCheck} disabled={!currentQuestion} className="w-full sm:w-auto">Проверить</Button>
          </div>
        </div>
      </div>

      {expandedImage && (
        <div className="fixed inset-0 z-[60] bg-black/80 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} alt="Просмотр" className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

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
    } catch {}
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
    return trimmed.replace(/[\\\/]+/g, '').replace(/\0/g, '');
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
      if (runSessionRef.current !== sessionId) return;
      setRunLoading(false);
      setRunStatus('done');
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
              <span className="absolute -right-1 -bottom-1 text-[8px] font-bold leading-none">▶</span>
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
    } catch {}
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
    return trimmed.replace(/[\\\/]+/g, '').replace(/\0/g, '');
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
            points: (item.points || []).map((pt) => ({ x: pt?.x || 0, y: pt?.y || 0 })),
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
            const points = (item.points || []).map((pt) => ({ x: (pt.x || 0) + dx, y: (pt.y || 0) + dy }));
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

  const drawStroke = (ctx, stroke, width, height) => {
    const points = Array.isArray(stroke?.points) ? stroke.points : [];
    if (points.length < 2) {
      if (points.length === 1) {
        const p = points[0];
        ctx.fillStyle = stroke.color || '#0f172a';
        ctx.beginPath();
        ctx.arc(p.x || 0, p.y || 0, (stroke.width || BOARD_STROKE_WIDTH) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    const lineWidth = stroke.width || BOARD_STROKE_WIDTH;
    ctx.strokeStyle = stroke.color || '#0f172a';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((point, index) => {
      const px = point?.x || 0;
      const py = point?.y || 0;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };

  const drawLine = (ctx, line, width, height) => {
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
      drawStateRef.current = { drawing: true, points: [point], start: null, end: null };
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
      const last = state.points[state.points.length - 1];
      const dx = point.x - (last?.x || 0);
      const dy = point.y - (last?.y || 0);
      if ((dx * dx + dy * dy) < BOARD_POINT_MIN_DISTANCE * BOARD_POINT_MIN_DISTANCE) return;
      state.points.push(point);
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
    boardItems.forEach((item) => {
      if (!item) return;
      if (item.type === 'stroke') {
        const pts = item.points || [];
        if (pts.length < 2) return;
        ctx.beginPath();
        pts.forEach((pt, index) => {
          const x = toMiniX(pt?.x || 0);
          const y = toMiniY(pt?.y || 0);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
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

const StudentLeaderboardSection = ({ role, userId, userName }) => {
  const [leaderboard, setLeaderboard] = useState({ items: [], week: null, currentStudent: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasError, setAliasError] = useState('');
  const [aliasSuccess, setAliasSuccess] = useState('');
  const [aliasMode, setAliasMode] = useState('choose');
  const [isLeagueRangesOpen, setIsLeagueRangesOpen] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadLeaderboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await api.getStudentsLeaderboard();
      if (!mountedRef.current) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      const week = data?.week && typeof data.week === 'object' ? data.week : null;
      const currentStudent = data?.currentStudent && typeof data.currentStudent === 'object'
        ? data.currentStudent
        : null;
      setLeaderboard({ items, week, currentStudent });
      if (role === 'student') {
        if (currentStudent?.hasAlias && typeof currentStudent.publicName === 'string') {
          setAliasInput(currentStudent.publicName);
          setAliasMode('choose');
        } else {
          setAliasInput('');
          setAliasMode('choose');
        }
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Не удалось загрузить рейтинг.');
      setLeaderboard({ items: [], week: null, currentStudent: null });
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const rows = useMemo(() => {
    const list = Array.isArray(leaderboard.items) ? leaderboard.items : [];
    return list.map((entry, index) => {
      const studentId = String(entry?.studentId || `student-${index}`);
      const xpTotal = normalizeXpTotal(entry?.xpTotal);
      const weeklyXp = normalizeXpTotal(entry?.weeklyXp);
      const league = getLeagueByXp(xpTotal);
      const resolvedLevelRaw = Number(entry?.level);
      const level = Number.isFinite(resolvedLevelRaw) && resolvedLevelRaw > 0
        ? Math.floor(resolvedLevelRaw)
        : (Math.floor(xpTotal / XP_PER_LEVEL) + 1);
      const displayNameRaw = typeof entry?.publicName === 'string' ? entry.publicName.trim() : '';
      const displayName = displayNameRaw || `Аноним ${index + 1}`;
      const hasAlias = Boolean(entry?.hasAlias);
      const mainName = typeof entry?.mainName === 'string' ? entry.mainName.trim() : '';
      const nickname = typeof entry?.nickname === 'string' ? entry.nickname.trim() : '';
      const isCurrent = role === 'student' && (
        Boolean(entry?.isCurrent) || (String(userId || '') === studentId)
      );
      return {
        studentId,
        displayName,
        hasAlias,
        mainName,
        nickname,
        showTeacherIdentity: role === 'teacher',
        xpTotal,
        xpTotalLabel: xpTotal.toLocaleString('ru-RU'),
        weeklyXp,
        weeklyXpLabel: weeklyXp.toLocaleString('ru-RU'),
        level,
        league,
        isCurrent,
      };
    });
  }, [leaderboard.items, role, userId]);

  const byLevel = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if (b.xpTotal !== a.xpTotal) return b.xpTotal - a.xpTotal;
      if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
      return a.displayName.localeCompare(b.displayName, 'ru');
    });
  }, [rows]);

  const byWeeklyXp = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
      if (b.level !== a.level) return b.level - a.level;
      if (b.xpTotal !== a.xpTotal) return b.xpTotal - a.xpTotal;
      return a.displayName.localeCompare(b.displayName, 'ru');
    });
  }, [rows]);

  const weekRangeLabel = useMemo(() => {
    const week = leaderboard?.week && typeof leaderboard.week === 'object'
      ? leaderboard.week
      : null;
    const start = formatStreakDate(week?.startDay);
    const end = formatStreakDate(week?.endDay);
    if (start && end) return `${start} - ${end}`;
    return 'последние 7 дней';
  }, [leaderboard.week]);

  const leagueRangeRows = useMemo(() => {
    const orderedLeagues = [BLANK_LEAGUE, ...[...LEAGUE_TIERS].sort((a, b) => a.minXp - b.minXp)];
    return orderedLeagues.map((league, index) => {
      const nextLeague = orderedLeagues[index + 1];
      const minXp = normalizeXpTotal(league.minXp);
      const maxXp = nextLeague ? Math.max(minXp, normalizeXpTotal(nextLeague.minXp) - 1) : null;
      const minLabel = minXp.toLocaleString('ru-RU');
      const maxLabel = maxXp !== null ? maxXp.toLocaleString('ru-RU') : null;
      return {
        ...league,
        rangeLabel: maxLabel ? `${minLabel} - ${maxLabel} XP` : `${minLabel}+ XP`,
      };
    });
  }, []);

  const currentStudentRow = role === 'student'
    ? (rows.find((row) => row.isCurrent) || null)
    : null;
  const currentRatingPosition = role === 'student'
    ? (() => {
      const index = byLevel.findIndex((row) => row.isCurrent);
      return index >= 0 ? index + 1 : null;
    })()
    : null;
  const currentLeague = currentStudentRow?.league || BLANK_LEAGUE;
  const currentLeagueAuraStyle = getLeagueAuraStyle(currentLeague.id);
  const isCurrentLeagueAbsolute = isAbsoluteOrAboveLeague(currentLeague.id);
  const currentStudentMeta = role === 'student' && leaderboard?.currentStudent
    ? leaderboard.currentStudent
    : null;
  const currentStudentMainName = (() => {
    const fromLeaderboard = typeof currentStudentMeta?.mainName === 'string'
      ? currentStudentMeta.mainName.trim()
      : '';
    if (fromLeaderboard) return fromLeaderboard;
    const fromProfile = typeof userName === 'string' ? userName.trim() : '';
    return fromProfile;
  })();
  const needsAliasPrompt = role === 'student' && currentStudentMeta && !currentStudentMeta.hasAlias;

  const handleSaveAlias = async () => {
    const normalized = String(aliasInput || '').trim();
    if (!/^[А-Яа-яЁё]{2,6}$/.test(normalized)) {
      setAliasError('Псевдоним: 2-6 символов, только русские буквы.');
      setAliasSuccess('');
      return;
    }
    setAliasSaving(true);
    setAliasError('');
    setAliasSuccess('');
    try {
      await api.setLeaderboardAlias(normalized);
      if (!mountedRef.current) return;
      setAliasSuccess('Псевдоним сохранён.');
      await loadLeaderboard({ silent: true });
    } catch (err) {
      if (!mountedRef.current) return;
      setAliasError(err?.message || 'Не удалось сохранить псевдоним.');
    } finally {
      if (!mountedRef.current) return;
      setAliasSaving(false);
    }
  };

  const handleUseMainName = async () => {
    if (!currentStudentMainName) {
      setAliasError('Не удалось определить основное имя.');
      setAliasSuccess('');
      return;
    }
    setAliasSaving(true);
    setAliasError('');
    setAliasSuccess('');
    try {
      await api.setLeaderboardAlias({ useMainName: true, alias: currentStudentMainName });
      if (!mountedRef.current) return;
      setAliasSuccess('Основное имя добавлено в рейтинг.');
      await loadLeaderboard({ silent: true });
    } catch (err) {
      if (!mountedRef.current) return;
      setAliasError(err?.message || 'Не удалось добавить основное имя.');
    } finally {
      if (!mountedRef.current) return;
      setAliasSaving(false);
    }
  };

  const renderBoard = (items, type) => (
    <div className="rounded-3xl border border-purple-200/70 bg-white/90 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-purple-600">
            {type === 'level' ? 'Рейтинг по уровню' : 'Рейтинг по XP за неделю'}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {type === 'level'
              ? 'Сортировка: уровень, общий XP'
              : `Период: ${weekRangeLabel}`}
          </div>
        </div>
        <div className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-[11px] font-semibold text-purple-700">
          {`${items.length} учен.`}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((row, index) => {
          const topPlaceDecor = TOP_PLACE_NUMBER_DECOR[index];
          const leagueAuraStyle = getLeagueAuraStyle(row.league.id);
          const isAbsoluteLeague = isAbsoluteOrAboveLeague(row.league.id);
          return (
            <div
              key={`${type}-${row.studentId}`}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                row.isCurrent
                  ? 'border-purple-300 bg-purple-50/80'
                  : 'border-purple-100 bg-white'
              }`}
            >
            <div
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-full border ${
                row.league.id === 'blank'
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-purple-200 bg-white'
              }`}
              title={row.league.label}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute z-0 rounded-full ${
                  isAbsoluteLeague ? 'inset-[-10px] blur-[9px]' : 'inset-[-9px] blur-[8px]'
                }`}
                style={leagueAuraStyle}
              />
              {isAbsoluteLeague && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[-12px] z-0 rounded-full blur-[10px]"
                  style={ABSOLUTE_AURA_CROWN_STYLE}
                />
              )}
              {row.league.icon ? (
                <img
                  src={row.league.icon}
                  alt={row.league.label}
                  className={`relative z-[1] object-contain ${
                    row.league.id === 'blank'
                      ? 'h-[2.35rem] w-[2.35rem]'
                      : isLeagueAboveAbsolute(row.league.id)
                        ? 'h-14 w-14 scale-[1.56]'
                        : 'h-14 w-14 scale-[1.45]'
                  }`}
                  loading="lazy"
                />
              ) : (
                <span className="relative z-[1] h-5 w-5 rounded-full bg-slate-200" />
              )}
              {index < 3 ? (
                <span
                  className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center select-none font-black leading-none ${topPlaceDecor?.textClass || 'text-lg'}`}
                  style={getTopPlaceNumberStyle(topPlaceDecor)}
                >
                  {index + 1}
                </span>
              ) : (
                <span
                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center select-none text-xs font-extrabold leading-none text-slate-500/70"
                  style={{
                    textShadow: '0 1px 1px rgba(255,255,255,0.7)',
                  }}
                >
                  {index + 1}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900">{row.displayName}</div>
              {row.showTeacherIdentity && (
                <div className="truncate text-[11px] text-slate-500">{`Имя: ${row.mainName || '—'} • Прозвище: ${row.nickname || '—'}`}</div>
              )}
              <div className="text-[11px] text-slate-500">{`${row.league.label} - Уровень ${row.level} - ${row.xpTotalLabel} XP`}</div>
            </div>
            <div className="text-right">
              {type === 'level' ? (
                <>
                  <div className="text-sm font-bold text-slate-900">{`Ур. ${row.level}`}</div>
                  <div className="text-[11px] font-semibold text-purple-600">{`${row.xpTotalLabel} XP`}</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-bold text-slate-900">{`${row.weeklyXpLabel} XP`}</div>
                  <div className="text-[11px] font-semibold text-purple-600">за 7 дней</div>
                </>
              )}
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className="rounded-3xl border border-purple-200/70 bg-white/90 p-6 text-sm text-gray-600 shadow-soft">
        Загрузка рейтинга...
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-200 bg-rose-50/70 p-6 text-sm text-rose-700 shadow-soft">
        <div>{error}</div>
        <button
          type="button"
          onClick={() => loadLeaderboard()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
        >
          <RefreshCcw size={14} />
          Повторить
        </button>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-3xl border border-purple-200/70 bg-white/90 p-6 text-sm text-gray-600 shadow-soft">
        Учеников для рейтинга пока нет.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="surface-panel rounded-3xl border border-purple-200/70 px-4 py-4 text-sm text-gray-700 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-purple-600">Рейтинг учеников</div>
            <div className="mt-1 text-base font-semibold text-gray-900">
              {role === 'student'
                ? `Твоя позиция в рейтинге: ${currentRatingPosition || '—'}`
                : 'Общий рейтинг по группе'}
            </div>
            <div className="mt-2 inline-flex items-center rounded-full border border-purple-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-700">
              {`Период XP: ${weekRangeLabel}`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadLeaderboard({ silent: true })}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-60"
          >
            <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Обновляем...' : 'Обновить'}
          </button>
        </div>
        {role === 'student' && (
          <div className="mt-3 space-y-2">
            <div className="rounded-2xl border border-purple-200 bg-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">Ваша лига</div>
                <button
                  type="button"
                  onClick={() => setIsLeagueRangesOpen((prev) => !prev)}
                  className="inline-flex items-center rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100"
                  aria-expanded={isLeagueRangesOpen}
                >
                  {isLeagueRangesOpen ? 'Скрыть лиги' : 'Все лиги'}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-full border ${
                    currentLeague.id === 'blank'
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-purple-200 bg-white'
                  }`}
                  title={currentLeague.label}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute z-0 rounded-full ${
                      isCurrentLeagueAbsolute ? 'inset-[-10px] blur-[9px]' : 'inset-[-8px] blur-[7px]'
                    }`}
                    style={currentLeagueAuraStyle}
                  />
                  {isCurrentLeagueAbsolute && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[-12px] z-0 rounded-full blur-[10px]"
                      style={ABSOLUTE_AURA_CROWN_STYLE}
                    />
                  )}
                  {currentLeague.icon ? (
                    <img
                      src={currentLeague.icon}
                      alt={currentLeague.label}
                      className={`relative z-[1] object-contain ${
                        currentLeague.id === 'blank'
                          ? 'h-[2.35rem] w-[2.35rem]'
                          : isLeagueAboveAbsolute(currentLeague.id)
                            ? 'h-14 w-14 scale-[1.56]'
                            : 'h-14 w-14 scale-[1.45]'
                      }`}
                      loading="lazy"
                    />
                  ) : (
                    <span className="relative z-[1] h-5 w-5 rounded-full bg-slate-200" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-slate-900">{currentLeague.label}</div>
                  <div className="text-[11px] text-slate-500">
                    {`${currentStudentRow?.xpTotalLabel || '0'} XP${currentStudentRow ? ` - Уровень ${currentStudentRow.level}` : ''}`}
                  </div>
                </div>
              </div>
            </div>

            {isLeagueRangesOpen && (
              <div className="rounded-2xl border border-purple-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">Лиги и диапазоны XP</div>
                <div className="mt-1 text-[11px] text-slate-500">Сколько опыта нужно для каждой лиги</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {leagueRangeRows.map((leagueItem) => {
                    const isCurrentLeagueItem = leagueItem.id === currentLeague.id;
                    const leagueItemAuraStyle = getLeagueAuraStyle(leagueItem.id);
                    const isAbsoluteLeagueItem = isAbsoluteOrAboveLeague(leagueItem.id);
                    return (
                      <div
                        key={`league-range-${leagueItem.id}`}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                          isCurrentLeagueItem
                            ? 'border-purple-300 bg-purple-50/80'
                            : 'border-purple-100 bg-white'
                        }`}
                      >
                        <div
                          className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-full border ${
                            leagueItem.id === 'blank'
                              ? 'border-slate-200 bg-slate-50'
                              : 'border-purple-200 bg-white'
                          }`}
                          title={leagueItem.label}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none absolute z-0 rounded-full ${
                              isAbsoluteLeagueItem ? 'inset-[-9px] blur-[8px]' : 'inset-[-7px] blur-[6px]'
                            }`}
                            style={leagueItemAuraStyle}
                          />
                          {isAbsoluteLeagueItem && (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-[-10px] z-0 rounded-full blur-[8px]"
                              style={ABSOLUTE_AURA_CROWN_STYLE}
                            />
                          )}
                          {leagueItem.icon ? (
                            <img
                              src={leagueItem.icon}
                              alt={leagueItem.label}
                              className={`relative z-[1] object-contain ${
                                leagueItem.id === 'blank'
                                  ? 'h-8 w-8'
                                  : isLeagueAboveAbsolute(leagueItem.id)
                                    ? 'h-11 w-11 scale-[1.28]'
                                    : 'h-11 w-11 scale-[1.18]'
                              }`}
                              loading="lazy"
                            />
                          ) : (
                            <span className="relative z-[1] h-4 w-4 rounded-full bg-slate-200" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className={`truncate text-xs font-bold ${isCurrentLeagueItem ? 'text-purple-700' : 'text-slate-900'}`}>
                            {leagueItem.label}
                          </div>
                          <div className="text-[11px] text-slate-500">{leagueItem.rangeLabel}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {needsAliasPrompt && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 shadow-soft">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Имя в рейтинге</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            Сейчас вы отображаетесь как «{currentStudentMeta?.publicName || 'Аноним'}».
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Вы можете выбрать, как показываться в рейтинге: под основным именем или под псевдонимом.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleUseMainName}
              disabled={aliasSaving || !currentStudentMainName}
              className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              {aliasSaving ? 'Сохраняем...' : `Использовать имя: ${currentStudentMainName || 'моё имя'}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setAliasMode('custom');
                setAliasInput('');
                setAliasError('');
                setAliasSuccess('');
              }}
              disabled={aliasSaving}
              className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              Создать псевдоним
            </button>
          </div>
          {aliasMode === 'custom' && (
            <>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={aliasInput}
                  onChange={(e) => {
                    const nextValue = String(e.target.value || '')
                      .replace(/[^А-Яа-яЁё]/g, '')
                      .slice(0, 6);
                    setAliasInput(nextValue);
                    setAliasError('');
                    setAliasSuccess('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveAlias();
                    }
                  }}
                  placeholder="Например: Вектор"
                  maxLength={6}
                  className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleSaveAlias}
                  disabled={aliasSaving}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                >
                  {aliasSaving ? 'Сохраняем...' : 'Сохранить псевдоним'}
                </button>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Только русские буквы, 2-6 символов.</div>
            </>
          )}
          {aliasError && <div className="mt-2 text-xs text-rose-600">{aliasError}</div>}
          {aliasSuccess && <div className="mt-2 text-xs text-emerald-700">{aliasSuccess}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {renderBoard(byLevel, 'level')}
        {renderBoard(byWeeklyXp, 'week')}
      </div>
    </section>
  );
};

const DashboardLayout = ({ user, onLogout, progress, onUpdateProgress, theme, onThemeToggle }) => {
  const allowedViews = user.role === 'admin'
    ? ['admin']
    : user.role === 'teacher'
      ? ['schedule', 'progress', 'python', 'rating', 'collab', 'board', 'teacher', 'notes']
      : ['schedule', 'progress', 'python', 'rating', 'collab', 'board', 'notes'];
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
  const [homeworkPopupEntry, setHomeworkPopupEntry] = useState(null);
  const [homeworkPopupOpen, setHomeworkPopupOpen] = useState(false);
  const [paceForecastPopupOpen, setPaceForecastPopupOpen] = useState(false);
  const [solvedByTask, setSolvedByTask] = useState({});
  const [studentSolvedEvents, setStudentSolvedEvents] = useState([]);
  const [goalTestsLoaded, setGoalTestsLoaded] = useState(false);
  const [studentDataLoaded, setStudentDataLoaded] = useState(false);
  const [studentStreak, setStudentStreak] = useState(getDefaultStreak());
  const [studentXpTotal, setStudentXpTotal] = useState(0);
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
        { id: 'board', label: 'Доска', icon: Brush },
        { id: 'notes', label: 'Конспекты', icon: BookOpen }
      ];
  const mobileNavLabels = {
    schedule: 'График',
    progress: 'Тесты',
    rating: 'Рейтинг',
    python: 'Python',
    collab: 'Код',
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
        } catch {}
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
    } catch {}
  };
  const hasHomeworkContent = (entry) => {
    if (!entry) return false;
    const hasText = typeof entry.homeWork === 'string' && entry.homeWork.trim();
    const hasLinks = (typeof entry.lessonLink === 'string' && entry.lessonLink.trim())
      || (typeof entry.boardLink === 'string' && entry.boardLink.trim());
    const hasGoals = Array.isArray(entry.goals) && entry.goals.length > 0;
    return Boolean(hasText || hasLinks || hasGoals);
  };
  const markHomeworkSeen = (entry) => {
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
    } catch {}
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
    } catch {}
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
    } catch {}
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
                {nav.map((n, idx) => {
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
          {nav.map((n) => {
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
            />
          )}
          {view === 'rating' && (
            <StudentLeaderboardSection
              role={user.role}
              userId={user.id}
              userName={user.name}
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
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, nav.length)}, minmax(0, 1fr))` }}>
              {nav.map((n) => {
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

const ThemeToggleButton = ({ theme, onToggle, className = '' }) => {
  const isDarkTheme = theme === THEME_DARK;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`theme-toggle ${className}`.trim()}
      aria-label={isDarkTheme ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
      title={isDarkTheme ? 'Светлая тема' : 'Тёмная тема'}
    >
      <span className="theme-toggle__icon-wrap">
        {isDarkTheme ? <Sun size={16} /> : <Moon size={16} />}
      </span>
      <span className="theme-toggle__label">
        {isDarkTheme ? 'Светлая' : 'Тёмная'}
      </span>
    </button>
  );
};

const App = () => {
  const [theme, setTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme) return normalizeTheme(savedTheme);
      } catch {}
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
    } catch {}
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
