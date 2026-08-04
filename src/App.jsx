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
  BookOpen, BarChart2, LogOut, Download, FileText, FileSpreadsheet, CheckCircle, AlertCircle, AlertTriangle,
  X, ChevronRight, Folder, FolderPlus, Upload, 
  ArrowLeft, Trash2, PlayCircle, Play, Bug, StepBack, StepForward, Pause, Check, Plus, Flame, Snowflake,
  Settings, Save, Calendar, RefreshCcw, Pencil, Brush, Minus, Undo2, Hand, Expand, Minimize2, Eraser, Image as ImageIcon, Trophy, Square,
  ChevronsLeft, ChevronsRight, ChevronsUpDown, ChevronDown, Search,
  Camera, MousePointer2, Code2, ExternalLink, MoreHorizontal, MessageSquare, Users, Video, Wallet,
  Map as MapIcon, Crop, FlipHorizontal2, Link2, Copy, Lock, Shield, ThumbsUp, Target,
  ArrowUpToLine, ArrowDownToLine, Type, Shapes, ArrowUpRight, Circle, Diamond, TextSelect, ListPlus
} from 'lucide-react';  
import mascotApproval from './assets/mascot/Approval.png';
import mascotDisapproval from './assets/mascot/disapproval.png';
import mascotGreetings from './assets/mascot/greetings.png';
import mascotPeeking from './assets/mascot/peeking.png';
import mascotPondering from './assets/mascot/pondering.png';
import ivanCoin from './assets/ivan-coin-badge.png';
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
import FinalReviewSection from './components/FinalReviewSection';
import { LogoMark, PythonLogoIcon } from './components/Identity';
import MobileStrategyGame from './components/MobileStrategyGame';
import ProgressSection from './components/ProgressSection';
import PythonSection from './components/PythonSection';
import ScheduleSection from './components/ScheduleSection';
import StudentGlobalSearch from './components/StudentGlobalSearch';
import StudentTodayOverview from './components/StudentTodayOverview';
import StudentLeaderboardSection from './components/StudentLeaderboardSection';
import StudentLeaderboardProfileModal from './components/StudentLeaderboardProfileModal';
import StudentLessonJoinPrompt from './components/StudentLessonJoinPrompt';
import StudentPaymentReminder from './components/StudentPaymentReminder';
import StudentSearchSelect from './components/StudentSearchSelect';
import StudentTour from './components/StudentTour';
import StudentNotificationsCenter from './components/StudentNotificationsCenter';
import StudentWeeklyRecap from './components/StudentWeeklyRecap';
import SignupGuestChat from './components/SignupGuestChat';
import TeacherCalendarSection from './components/TeacherCalendarSection';
import TeacherFinanceSection from './components/TeacherFinanceSection';
import HomeworkStatsPage from './components/HomeworkStatsPage';
import TeacherLessonEndPrompt from './components/TeacherLessonEndPrompt';
import TeacherLessonStartPrompt from './components/TeacherLessonStartPrompt';
import TeacherPanel from './components/TeacherPanel';
import ThemeToggleButton from './components/ThemeToggleButton';
import CoinGuideIcon from './components/CoinGuideTooltip';
import TurtleCanvas from './components/TurtleCanvas';
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
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from './utils/monacoTheme';
import {
  MOCK_EXAM_MODE_TIMER,
  normalizeAssignedMockExamMode,
} from './utils/mockExamMode';
import { normalizeTurtleScene, parseTurtleSceneJson, serializeTurtleScene } from './utils/turtleScene';
import {
  COLLAB_TASK_FILE_CATEGORY_TESTING,
  buildTestingRuntimeFiles,
  normalizeCollabTaskFileCategory,
} from './utils/collabRuntimeFiles';
import {
  normalizeTeacherStudentId,
  resolveTeacherStudentSelection,
} from './utils/teacherStudentSelection';
import { isCurrentStudent, normalizeStudentStudyStatus } from './utils/studentStudyStatus';
import { resolveHomeworkTaskTargetDescriptors } from './utils/homeworkComposer';
import {
  getHomeworkGoalAssignmentTier,
  isOptionalHomeworkGoal,
} from './utils/homeworkAssignmentTier';
import {
  addHomeworkLessonBasketItem,
  clearHomeworkLessonBasket,
  getHomeworkLessonBasketItems,
  hasHomeworkLessonBasketItem,
  loadHomeworkLessonBaskets,
  saveHomeworkLessonBaskets,
} from './utils/homeworkLessonBasket';
import { normalizeTelemostUrl } from './utils/telemost';
import HEADLESS_TURTLE_SOURCE from './python/headless_turtle.py?raw';
import {
  isPushFeatureSupported,
  getPushPermission,
  urlBase64ToUint8Array,
  getPushServiceWorkerRegistration,
  getBrowserPushSubscription,
  isNativeAndroidPushEnvironment,
  getNativePushStatus,
  requestNativePushPermission,
  enableNativePush,
  disableNativePush,
  consumeNativePushLaunchUrl,
  normalizePushErrorMessage,
} from './utils/push';
import { getCollabWsUrl, getNotificationsWsUrl, isNativeAppRuntime, resolveApiUrl } from './utils/runtimeUrls';
import useLessonReplayRecorder from './hooks/useLessonReplayRecorder';
import useWorkbookAutoSync from './hooks/useWorkbookAutoSync';
import useWorkbookHelper from './hooks/useWorkbookHelper';
import { getLevelFromXp, getLevelProgressFromXp } from './utils/leveling';
import {
  api,
  authenticatedUploadsFetch,
  resolveAuthenticatedUploadsUrl,
  setUnauthorizedHandler,
  uploadFileMemorySnapshot,
  withStoredAuthToken,
} from './services/api';

const StudentChatSection = React.lazy(() => import('./components/StudentChatSection'));
const TeacherStudentChatsSection = React.lazy(() => import('./components/TeacherStudentChatsSection'));

const optionalLeagueIcons = import.meta.glob('./assets/leagues/blank.png', { eager: true, import: 'default' });
const leagueBlank = optionalLeagueIcons['./assets/leagues/blank.png'] || null;

const getNativePushUnavailableMessage = (status) => {
  const reason = String(status?.reason || status?.lastError || '').trim();
  if (reason) return reason;
  if (!status?.configured) return 'RuStore Push не настроен для этой Android-сборки.';
  return 'RuStore Push недоступен на этом Android-устройстве.';
};

const parseNativePushLaunchUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const read = (key) => String(url.searchParams.get(key) || '').trim();
    return {
      raw,
      view: read('view'),
      chatId: read('chatId'),
      studentId: read('studentId'),
    };
  } catch {
    return null;
  }
};

const PLATFORM_DOCUMENT_TITLE = 'Платформа';
const CHAT_LIVE_RECONNECT_DELAY_MS = 2500;
const PLATFORM_CHATS_ENABLED = true;
const SESSION_SYNC_INTERVAL_MS = 5000;

const formatUnreadMessageTitle = (count) => {
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  if (safeCount === 1) return '1 новое сообщение';
  if (safeCount % 10 >= 2 && safeCount % 10 <= 4 && (safeCount % 100 < 10 || safeCount % 100 >= 20)) {
    return `${safeCount} новых сообщения`;
  }
  return `${safeCount} новых сообщений`;
};

const playIncomingMessageSound = async (audioContextRef) => {
  if (typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = audioContextRef.current || new AudioContextClass();
    audioContextRef.current = context;
    if (context.state === 'suspended') {
      await context.resume();
    }

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.16, now + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    master.connect(context.destination);

    const first = context.createOscillator();
    first.type = 'sine';
    first.frequency.setValueAtTime(740, now);
    first.frequency.exponentialRampToValueAtTime(1040, now + 0.12);
    first.connect(master);
    first.start(now);
    first.stop(now + 0.18);

    const second = context.createOscillator();
    second.type = 'triangle';
    second.frequency.setValueAtTime(1320, now + 0.12);
    second.frequency.exponentialRampToValueAtTime(1640, now + 0.28);
    second.connect(master);
    second.start(now + 0.11);
    second.stop(now + 0.42);
  } catch {
    // Some browsers allow sound only after the first user interaction.
  }
};

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
const PYTHON_COIN_MIN_REWARD = 4;
const PYTHON_COIN_MAX_REWARD = 17;
const PYTHON_COIN_TASK_ORDER = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
  205, 208, 214, 216, 217, 223, 224, 225, 226, 227,
];
const GOAL_TYPE_TASK = 'task';
const GOAL_TYPE_MOCK = 'mock';
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
const BOARD_BACKGROUND_COLOR = '#f8f9fa';
const BOARD_DEFAULT_COLOR = '#8247e5';
const BOARD_PRESET_COLORS = [
  '#ef3d1f',
  '#ffb800',
  '#00a35c',
  '#5b8def',
  BOARD_DEFAULT_COLOR,
  '#cc681f',
  '#ffffff',
];
const BOARD_COLORS = [
  BOARD_DEFAULT_COLOR,
  ...BOARD_PRESET_COLORS.filter((swatch) => swatch !== BOARD_DEFAULT_COLOR),
];
const BOARD_STROKE_WIDTH = 3.5;
const BOARD_LINE_WIDTH = BOARD_STROKE_WIDTH;
const BOARD_MIN_WIDTH = 1;
const BOARD_MAX_WIDTH = 12;
const BOARD_WIDTH_STEP = 0.5;
const BOARD_ERASER_RADIUS = 8;
const BOARD_IMAGE_MIN_SIZE = 40;
const BOARD_IMAGE_MAX_SIZE = 2800;
const BOARD_TEXT_FONT_SIZE = 28;
const BOARD_SHAPE_MIN_SIZE = 6;
const BOARD_IMAGE_FRAME_COLOR = '#111318';
const BOARD_EXPORT_PADDING = 24;
const BOARD_EXPORT_BASE_SCALE = 4.5;
const BOARD_EXPORT_VECTOR_BASE_SCALE = 5.5;
const BOARD_EXPORT_MAX_SIZE = 11264;
const BOARD_EXPORT_MAX_PIXELS = 72 * 1024 * 1024;
const BOARD_EXPORT_MAX_FILE_BYTES = 64 * 1024 * 1024;
const BOARD_SELECTION_HIT_RADIUS = 6;
const BOARD_MIN_ZOOM = 0.25;
const BOARD_MAX_ZOOM = 2.5;
const BOARD_POINT_MIN_DISTANCE = 1.5;
const BOARD_STROKE_SMOOTHING_DISTANCE = 12;
const BOARD_STROKE_SMOOTHING_MIN_ALPHA = 0.22;
const BOARD_STROKE_SMOOTHING_MAX_ALPHA = 0.72;

const drawBoardImage = (ctx, image, item, overrides = {}) => {
  if (!ctx || !image || !item) return;
  const x = Number(overrides.x ?? item.x) || 0;
  const y = Number(overrides.y ?? item.y) || 0;
  const width = Math.max(1, Number(overrides.width ?? item.width) || 1);
  const height = Math.max(1, Number(overrides.height ?? item.height) || 1);
  const naturalWidth = Math.max(1, Number(image.naturalWidth) || Number(image.width) || 1);
  const naturalHeight = Math.max(1, Number(image.naturalHeight) || Number(image.height) || 1);
  const crop = item.crop && typeof item.crop === 'object' ? item.crop : null;
  const cropX = Math.min(1, Math.max(0, Number(crop?.x) || 0));
  const cropY = Math.min(1, Math.max(0, Number(crop?.y) || 0));
  const cropWidth = Math.min(1 - cropX, Math.max(0.01, Number(crop?.width) || 1));
  const cropHeight = Math.min(1 - cropY, Math.max(0.01, Number(crop?.height) || 1));

  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  if (item.flipX) ctx.scale(-1, 1);
  ctx.drawImage(
    image,
    cropX * naturalWidth,
    cropY * naturalHeight,
    cropWidth * naturalWidth,
    cropHeight * naturalHeight,
    -width / 2,
    -height / 2,
    width,
    height
  );
  ctx.restore();

  if (item.hasFrame) {
    ctx.save();
    ctx.strokeStyle = BOARD_IMAGE_FRAME_COLOR;
    ctx.lineWidth = Math.max(2, Math.min(8, Math.min(width, height) * 0.018));
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }
};
const BOARD_PRESSURE_MIN_RATIO = 0.6;
const BOARD_LOW_BANDWIDTH_CURSOR_MS = 130;
const BOARD_LOW_BANDWIDTH_PREVIEW_MS = 16;
const BOARD_LIVE_STROKE_POINTS_PER_UPDATE = 28;
const BOARD_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const BOARD_IMAGE_COMPRESSION_MIN_BYTES = 512 * 1024;
const BOARD_IMAGE_UPLOAD_MAX_DIMENSION = 2560;
const BOARD_IMAGE_UPLOAD_MAX_PIXELS = 6 * 1024 * 1024;
const BOARD_IMAGE_UPLOAD_WEBP_QUALITY = 0.9;
const BOARD_MAX_ITEM_COUNT = 2500;
const BOARD_MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const BOARD_MAX_STROKE_POINTS = 1400;
const BOARD_REMOTE_LIVE_STROKE_MAX_POINTS = BOARD_MAX_STROKE_POINTS;
const BOARD_SCENE_PADDING = 48;
const BOARD_SCENE_MAX_DIMENSION = 4096;
const BOARD_SCENE_MAX_PIXELS = 8 * 1024 * 1024;
const BOARD_VIEWPORT_STORAGE_KEY_PREFIX = 'board-viewport-v1';
const BOARD_VIEWPORT_SAVE_DEBOUNCE_MS = 160;
const getBoardPixelRatio = () => (
  typeof window !== 'undefined'
    ? Math.max(1, Number(window.devicePixelRatio) || 1)
    : 1
);
const prepareBoardImageUpload = async (file, image) => {
  const naturalWidth = Math.max(1, Number(image?.naturalWidth) || Number(image?.width) || 1);
  const naturalHeight = Math.max(1, Number(image?.naturalHeight) || Number(image?.height) || 1);
  const pixelCount = naturalWidth * naturalHeight;
  const scale = Math.min(
    1,
    BOARD_IMAGE_UPLOAD_MAX_DIMENSION / Math.max(naturalWidth, naturalHeight),
    Math.sqrt(BOARD_IMAGE_UPLOAD_MAX_PIXELS / Math.max(1, pixelCount))
  );
  const shouldCompress = file?.type !== 'image/gif'
    && (Number(file?.size) >= BOARD_IMAGE_COMPRESSION_MIN_BYTES || scale < 1);
  if (!shouldCompress || typeof document === 'undefined') {
    return { file, naturalWidth, naturalHeight };
  }

  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { file, naturalWidth, naturalHeight };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', BOARD_IMAGE_UPLOAD_WEBP_QUALITY);
  });
  canvas.width = 1;
  canvas.height = 1;
  if (!blob || (scale === 1 && blob.size >= Number(file?.size || 0))) {
    return { file, naturalWidth, naturalHeight };
  }
  const baseName = String(file?.name || 'board-image').replace(/\.[^.]+$/, '') || 'board-image';
  return {
    file: new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() }),
    naturalWidth: width,
    naturalHeight: height,
  };
};
const prepareBoardRenderCanvas = (canvas, cssWidth, cssHeight) => {
  if (!canvas) return null;
  const width = Math.max(1, Math.round(Number(cssWidth) || canvas.clientWidth || 1));
  const height = Math.max(1, Math.round(Number(cssHeight) || canvas.clientHeight || 1));
  const pixelRatio = getBoardPixelRatio();
  const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  return {
    width,
    height,
    pixelRatio,
    pixelWidth,
    pixelHeight,
  };
};

const CLIENT_BUILD_CHECK_INTERVAL_MS = 60 * 1000;

const normalizeClientAssetFingerprintEntry = (value) => {
  const raw = String(value || '').trim();
  if (!raw || typeof window === 'undefined') return '';
  try {
    const url = new URL(raw, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return raw;
  }
};

const getCurrentClientBuildFingerprint = () => {
  if (typeof document === 'undefined') return '';
  const entries = [
    ...Array.from(document.querySelectorAll('script[src]')).map((node) => node.getAttribute('src')),
    ...Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).map((node) => node.getAttribute('href')),
  ]
    .map(normalizeClientAssetFingerprintEntry)
    .filter((value) => value && (value.includes('/assets/') || value.includes('/src/')));
  return Array.from(new Set(entries)).join('|');
};
const TASK_FILES_LIST_MIN_HEIGHT = 80;
const TASK_FILES_LIST_MAX_HEIGHT = 320;
const TASK_FILES_LIST_HEIGHT_STEP = 48;
const clampTaskFilesListHeight = (value) => (
  Math.min(TASK_FILES_LIST_MAX_HEIGHT, Math.max(TASK_FILES_LIST_MIN_HEIGHT, Math.round(value)))
);
const formatBoardBytes = (value) => {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
};
const isBoardCapacityErrorMessage = (value) => {
  const message = typeof value === 'string' ? value : '';
  return (
    message.startsWith('На доске уже слишком много элементов.')
    || message.startsWith('Доска переполнена (')
  );
};
const normalizeBoardStoredPoint = (value) => {
  const x = Number(value?.x) || 0;
  const y = Number(value?.y) || 0;
  const pressure = Number(value?.pressure);
  if (Number.isFinite(pressure)) {
    return { x, y, pressure };
  }
  return { x, y };
};
const trimBoardStrokePoints = (points) => {
  const source = Array.isArray(points) ? points : [];
  if (source.length <= BOARD_MAX_STROKE_POINTS) {
    return source.map((point) => normalizeBoardStoredPoint(point));
  }
  const targetCount = Math.max(2, BOARD_MAX_STROKE_POINTS);
  const step = (source.length - 1) / (targetCount - 1);
  const next = [];
  for (let index = 0; index < targetCount; index += 1) {
    const sourceIndex = Math.min(source.length - 1, Math.round(index * step));
    next.push(normalizeBoardStoredPoint(source[sourceIndex]));
  }
  return next;
};
const normalizeBoardAssetUrl = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.length > 2048) return '';
  try {
    const url = new URL(raw, 'https://board-assets.local');
    return /^\/uploads\/board-asset-[a-f0-9]{64}\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname)
      ? url.pathname
      : '';
  } catch {
    return '';
  }
};
const getBoardImageStoredSource = (item) => {
  if (!item || item.type !== 'image') return '';
  return normalizeBoardAssetUrl(item.assetUrl)
    || (typeof item.dataUrl === 'string' ? item.dataUrl : '');
};
const getBoardImageSource = (item) => {
  const source = getBoardImageStoredSource(item);
  if (!source || source.startsWith('data:')) return source;
  return resolveAuthenticatedUploadsUrl(source);
};
const prepareBoardImageElement = (image, source) => {
  if (!image || !source || source.startsWith('data:') || typeof window === 'undefined') return;
  try {
    const url = new URL(source, window.location.href);
    if (url.origin !== window.location.origin) {
      image.crossOrigin = url.searchParams.has('_auth') ? 'anonymous' : 'use-credentials';
    }
  } catch {
    // A relative same-origin URL does not require CORS configuration.
  }
};
const compactBoardLiveStrokePoints = (points, maxPoints = BOARD_LIVE_STROKE_POINTS_PER_UPDATE) => {
  const source = Array.isArray(points)
    ? points.map((point) => normalizeBoardStoredPoint(point))
    : [];
  const limit = Math.max(2, Number(maxPoints) || BOARD_LIVE_STROKE_POINTS_PER_UPDATE);
  if (source.length <= limit) return source;
  const step = (source.length - 1) / (limit - 1);
  const next = [];
  for (let index = 0; index < limit; index += 1) {
    next.push(source[Math.min(source.length - 1, Math.round(index * step))]);
  }
  return next;
};
const normalizeBoardStoredItem = (rawValue) => {
  const source = rawValue && typeof rawValue.toJSON === 'function' ? rawValue.toJSON() : rawValue;
  if (!source || typeof source !== 'object') return null;
  const base = {
    id: String(source.id || '').trim(),
    type: String(source.type || '').trim(),
    color: typeof source.color === 'string' ? source.color : BOARD_DEFAULT_COLOR,
    authorId: typeof source.authorId === 'string' ? source.authorId : '',
  };
  if (!base.id || !base.type) return null;
  if (base.type === 'stroke') {
    const points = trimBoardStrokePoints(source.points);
    if (points.length === 0) return null;
    return {
      ...base,
      type: 'stroke',
      width: Number(source.width) || BOARD_STROKE_WIDTH,
      points,
    };
  }
  if (base.type === 'line') {
    return {
      ...base,
      type: 'line',
      width: Number(source.width) || BOARD_LINE_WIDTH,
      start: normalizeBoardStoredPoint(source.start),
      end: normalizeBoardStoredPoint(source.end),
    };
  }
  if (base.type === 'arrow') {
    return {
      ...base,
      type: 'arrow',
      width: Number(source.width) || BOARD_LINE_WIDTH,
      start: normalizeBoardStoredPoint(source.start),
      end: normalizeBoardStoredPoint(source.end),
    };
  }
  if (base.type === 'shape') {
    return {
      ...base,
      type: 'shape',
      shape: ['ellipse', 'diamond'].includes(source.shape) ? source.shape : 'rectangle',
      width: Math.max(1, Number(source.width) || 1),
      height: Math.max(1, Number(source.height) || 1),
      x: Number(source.x) || 0,
      y: Number(source.y) || 0,
      strokeWidth: Number(source.strokeWidth) || BOARD_LINE_WIDTH,
    };
  }
  if (base.type === 'text') {
    const text = typeof source.text === 'string' ? source.text.slice(0, 4000) : '';
    if (!text.trim()) return null;
    return {
      ...base,
      type: 'text',
      text,
      x: Number(source.x) || 0,
      y: Number(source.y) || 0,
      fontSize: Math.max(10, Math.min(160, Number(source.fontSize) || BOARD_TEXT_FONT_SIZE)),
      width: Math.max(1, Number(source.width) || text.length * BOARD_TEXT_FONT_SIZE * 0.62),
      height: Math.max(1, Number(source.height) || BOARD_TEXT_FONT_SIZE * 1.25),
    };
  }
  if (base.type === 'image') {
    const assetUrl = normalizeBoardAssetUrl(source.assetUrl || source.imageUrl);
    const dataUrl = typeof source.dataUrl === 'string' ? source.dataUrl : '';
    if (!assetUrl && !dataUrl) return null;
    return {
      ...base,
      type: 'image',
      ...(assetUrl ? {
        assetUrl,
        assetId: typeof source.assetId === 'string' ? source.assetId.slice(0, 120) : '',
      } : { dataUrl }),
      x: Number(source.x) || 0,
      y: Number(source.y) || 0,
      width: Math.max(1, Number(source.width) || 0),
      height: Math.max(1, Number(source.height) || 0),
      naturalWidth: Math.max(1, Number(source.naturalWidth) || Number(source.width) || 1),
      naturalHeight: Math.max(1, Number(source.naturalHeight) || Number(source.height) || 1),
      crop: source.crop && typeof source.crop === 'object'
        ? {
          x: Math.min(1, Math.max(0, Number(source.crop.x) || 0)),
          y: Math.min(1, Math.max(0, Number(source.crop.y) || 0)),
          width: Math.min(1, Math.max(0.01, Number(source.crop.width) || 1)),
          height: Math.min(1, Math.max(0.01, Number(source.crop.height) || 1)),
        }
        : null,
      flipX: Boolean(source.flipX),
      hasFrame: Boolean(source.hasFrame),
      hyperlink: typeof source.hyperlink === 'string' ? source.hyperlink.slice(0, 2048) : '',
      locked: Boolean(source.locked),
      superLocked: Boolean(source.superLocked),
      votes: Math.max(0, Math.floor(Number(source.votes) || 0)),
    };
  }
  return null;
};
const estimateBoardItemBytes = (item) => {
  if (!item || typeof item !== 'object') return 0;
  const sharedBytes = 48 + String(item.id || '').length + String(item.authorId || '').length + String(item.color || '').length;
  if (item.type === 'stroke') {
    const points = Array.isArray(item.points) ? item.points : [];
    return sharedBytes + 24 + points.length * 20;
  }
  if (item.type === 'line' || item.type === 'arrow') {
    return sharedBytes + 64;
  }
  if (item.type === 'shape') return sharedBytes + 72;
  if (item.type === 'text') return sharedBytes + 56 + String(item.text || '').length * 2;
  if (item.type === 'image') {
    return sharedBytes
      + 64
      + String(item.assetUrl || '').length
      + String(item.assetId || '').length
      + String(item.dataUrl || '').length;
  }
  return sharedBytes;
};
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
const LEGACY_MOCK_EXAM_ACCESS = { all: true, students: [], mode: MOCK_EXAM_MODE_TIMER };

const normalizeMockExamAccess = (access, fallback = LEGACY_MOCK_EXAM_ACCESS) => {
  if (!access || typeof access !== 'object') {
    return {
      ...fallback,
      mode: normalizeAssignedMockExamMode(fallback?.mode),
    };
  }
  const students = Array.isArray(access.students)
    ? access.students.map((id) => String(id)).filter(Boolean)
    : [];
  return {
    all: Boolean(access.all),
    students,
    mode: normalizeAssignedMockExamMode(access.mode),
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

const normalizeCoinsTotal = (value) => {
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

const getMockGoalProgress = (exam, attempt, targetTaskKeys = []) => {
  const availableTaskKeys = getMockExamTaskKeys(exam);
  const availableTaskKeySet = new Set(availableTaskKeys);
  const requestedTaskKeys = Array.from(new Set(
    (Array.isArray(targetTaskKeys) ? targetTaskKeys : [])
      .map((taskKey) => String(taskKey || '').trim())
      .filter(Boolean)
  ));
  const taskKeys = requestedTaskKeys.length > 0
    ? requestedTaskKeys.filter((taskKey) => availableTaskKeySet.has(taskKey))
    : availableTaskKeys;
  const attemptMode = normalizeAssignedMockExamMode(attempt?.mode);
  const resultsAreHidden = attemptMode === MOCK_EXAM_MODE_TIMER
    && !String(attempt?.timerFinishedAt || '').trim();
  const solvedMap = !resultsAreHidden && attempt?.solved && typeof attempt.solved === 'object'
    ? attempt.solved
    : {};
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

const isTestingSolvedEvent = (event) => {
  if (!event || typeof event !== 'object') return false;
  const taskNum = Number(event.taskNumber);
  if (!Number.isFinite(taskNum) || taskNum < 1 || taskNum > 27) return false;
  if (isMockExamTeacherSolvedNotif(event)) return false;
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

const getTeacherNotifStudentLabel = (note) => {
  const nickname = typeof note?.studentNickname === 'string' ? note.studentNickname.trim() : '';
  if (nickname) return nickname;
  return String(note?.studentName || '').trim() || 'Ученик';
};

const normalizeTeacherSolvedSource = (note) => {
  const raw = String(note?.source || note?.eventKind || '').trim().toLowerCase();
  if (raw === 'mock-exam' || raw === 'mock-exam-task') return 'mock-exam';
  return 'testing';
};

const isMockExamTeacherSolvedNotif = (note) => normalizeTeacherSolvedSource(note) === 'mock-exam';

const getTeacherSolvedNotifKicker = (note, archived = false) => {
  if (isMockExamTeacherSolvedNotif(note)) return archived ? 'Пробник' : 'Ответ в пробнике';
  return archived ? 'Отметка' : 'Новая отметка';
};

const getTeacherSolvedNotifSummary = (note) => {
  if (isMockExamTeacherSolvedNotif(note)) {
    const examTitle = String(note?.mockExamTitle || '').trim() || 'Пробник';
    const taskValue = note?.mockTaskNumber ?? note?.taskNumber;
    const taskLabel = formatTaskNumber(taskValue) || String(taskValue || '').trim();
    return `Решено в пробнике: ${examTitle}${taskLabel ? ` · задание ${taskLabel}` : ''}`;
  }
  const levelLabel = note?.levelId === PYTHON_LEVEL_ID
    ? 'Python'
    : (LEVELS[note?.levelId?.toUpperCase()]?.label || note?.levelId || '');
  const questionPart = note?.questionNumber ? ` · вопрос ${note.questionNumber}` : '';
  return `Решено: задание ${formatTaskNumber(note?.taskNumber) || note?.taskNumber}${levelLabel ? ` · ${levelLabel}` : ''}${questionPart}`;
};

const STUDENT_TOUR_KEY = 'ege_student_onboarding_v1';
const STUDENT_RATING_TOUR_KEY = 'ege_student_rating_onboarding_v1';

const loadTourStatus = (storageKey) => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const saveTourStatus = (storageKey, next) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch { /* no-op */ }
};

const hasStudentSeenStoredTour = (storageKey, studentId) => {
  if (!studentId) return false;
  const key = String(studentId);
  const data = loadTourStatus(storageKey);
  return Boolean(data?.[key]);
};

const markStudentSeenStoredTour = (storageKey, studentId) => {
  if (!studentId) return;
  const key = String(studentId);
  const data = loadTourStatus(storageKey);
  if (data?.[key]) return;
  saveTourStatus(storageKey, { ...data, [key]: true });
};

const loadStudentTourStatus = () => loadTourStatus(STUDENT_TOUR_KEY);

const saveStudentTourStatus = (next) => saveTourStatus(STUDENT_TOUR_KEY, next);

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

const hasStudentSeenRatingTour = (studentId) => hasStudentSeenStoredTour(STUDENT_RATING_TOUR_KEY, studentId);

const markStudentSeenRatingTour = (studentId) => markStudentSeenStoredTour(STUDENT_RATING_TOUR_KEY, studentId);

const LAST_LOCATION_KEY = 'ege_last_location_v1';
const DESKTOP_NAV_COLLAPSED_KEY = 'ege_desktop_nav_collapsed_v1';
const LESSON_REPLAY_VIEW_LABELS = Object.freeze({
  call: 'Звонок',
  board: 'Доска',
  collab: 'Совместный код',
  python: 'Задания Python',
  progress: 'Задания и успеваемость',
  schedule: 'Расписание и домашняя работа',
  notes: 'Конспекты',
  review: 'Итоговое повторение',
  rating: 'Рейтинг',
  chat: 'Чат',
  teacher: 'Ученики',
  'teacher-calendar': 'Календарь',
});
const TELEMOST_AUDIO_SEGMENT_MS = 30_000;
const TELEMOST_AUDIO_BITRATE = 32_000;
const getTelemostReplayAudioMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  return [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ].find((candidate) => MediaRecorder.isTypeSupported?.(candidate)) || '';
};
const TEACHER_NOTIF_HISTORY_KEY_PREFIX = 'ege_teacher_notif_history_v1';
const NOTES_SAVE_DRAFT_STORAGE_KEY_PREFIX = 'ege_notes_save_draft_v1';
const NOTES_SAVE_DRAFT_CATEGORIES = new Set(['class', 'home']);
const NOTES_SAVE_MODE_FULL_TASK = 'full-task';
const NOTES_SAVE_MODE_CODE_ONLY = 'code-only';
const NOTES_SAVE_MODE_CHEATSHEET = 'cheatsheet';
const NOTES_SAVE_MODES = new Set([NOTES_SAVE_MODE_FULL_TASK, NOTES_SAVE_MODE_CODE_ONLY, NOTES_SAVE_MODE_CHEATSHEET]);

const buildCodeMemoryPreview = (value) => {
  const code = String(value || '').trim();
  if (!code) return '';
  const lines = code
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !line.startsWith('#'));
  if (!lines.length) return '';
  const picks = [];
  const addFirst = (matcher) => {
    const found = lines.find((line) => matcher.test(line));
    if (found && !picks.includes(found)) picks.push(found);
  };
  addFirst(/\bopen\s*\(/);
  addFirst(/^(for|while)\s+/);
  addFirst(/^if\s+/);
  addFirst(/\b(print|return)\s*\(?/);
  if (!picks.length) picks.push(...lines.slice(0, 3));
  const preview = picks.slice(0, 4).join(' · ');
  return preview.length > 220 ? `${preview.slice(0, 217).trimEnd()}...` : preview;
};

const getNotesSaveTaskNumbers = (taskOptions) => (
  (Array.isArray(taskOptions) ? taskOptions : [])
    .map((task) => String(task?.number || '').trim())
    .filter(Boolean)
);

const buildNotesSaveDraftStorageKey = (scope, ownerId, studentId) => {
  const normalizedScope = String(scope || 'notes').trim() || 'notes';
  const normalizedOwnerId = String(ownerId || '').trim();
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedOwnerId || !normalizedStudentId) return '';
  return `${NOTES_SAVE_DRAFT_STORAGE_KEY_PREFIX}:${normalizedScope}:${normalizedOwnerId}:${normalizedStudentId}`;
};

const normalizeNotesSaveDraft = (value, taskNumbers = []) => {
  const normalizedTaskNumbers = Array.isArray(taskNumbers)
    ? taskNumbers.map((taskNumber) => String(taskNumber || '').trim()).filter(Boolean)
    : [];
  const defaultTaskNumber = normalizedTaskNumbers[0] || '';
  const allowedTaskNumbers = new Set(normalizedTaskNumbers);
  const rawTaskNumber = String(value?.taskNumber ?? '').trim();
  const taskNumber = rawTaskNumber && (!allowedTaskNumbers.size || allowedTaskNumbers.has(rawTaskNumber))
    ? rawTaskNumber
    : defaultTaskNumber;
  const rawCategory = String(value?.category || '').trim();
  const category = NOTES_SAVE_DRAFT_CATEGORIES.has(rawCategory) ? rawCategory : 'class';
  const rawSaveMode = String(value?.saveMode || '').trim();
  const saveMode = NOTES_SAVE_MODES.has(rawSaveMode) ? rawSaveMode : NOTES_SAVE_MODE_FULL_TASK;
  return {
    taskNumber,
    category,
    folderId: String(value?.folderId ?? '').trim(),
    fileName: String(value?.fileName ?? '').replace(/\./g, ''),
    saveMode,
  };
};

const loadNotesSaveDraft = (storageKey, taskNumbers) => {
  if (!storageKey || typeof localStorage === 'undefined') {
    return normalizeNotesSaveDraft(null, taskNumbers);
  }
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeNotesSaveDraft(parsed, taskNumbers);
  } catch {
    return normalizeNotesSaveDraft(null, taskNumbers);
  }
};

const saveNotesSaveDraft = (storageKey, value, taskNumbers) => {
  if (!storageKey || typeof localStorage === 'undefined') return;
  try {
    const normalized = normalizeNotesSaveDraft(value, taskNumbers);
    localStorage.setItem(storageKey, JSON.stringify({
      ...normalized,
      updatedAt: Date.now(),
    }));
  } catch { /* no-op */ }
};

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

const getTeacherNotifHistoryKey = (teacherId) => {
  const normalizedId = String(teacherId ?? '').trim();
  if (!normalizedId) return '';
  return `${TEACHER_NOTIF_HISTORY_KEY_PREFIX}:${normalizedId}`;
};

const getTeacherNotifTimestampMs = (entry) => {
  const directTs = Number(entry?.timestampMs);
  if (Number.isFinite(directTs) && directTs > 0) return Math.floor(directTs);
  const solvedTs = Date.parse(String(entry?.solvedAt || '').trim());
  if (Number.isFinite(solvedTs) && solvedTs > 0) return solvedTs;
  const messageTs = Date.parse(String(entry?.lastMessageAt || '').trim());
  if (Number.isFinite(messageTs) && messageTs > 0) return messageTs;
  return 0;
};

const buildTeacherNotifArchiveId = (entry) => {
  const type = String(entry?.type || '').trim();
  const id = String(entry?.id || '').trim();
  if (!type || !id) return '';
  if (type === 'solved') return `${type}:${id}`;
  const ts = getTeacherNotifTimestampMs(entry);
  const unreadCount = Math.max(0, Math.floor(Number(entry?.unreadCount) || 0));
  return `${type}:${id}:${ts}:${unreadCount}`;
};

const normalizeTeacherNotifHistoryEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const typeRaw = String(entry?.type || '').trim();
  const type = typeRaw === 'signup' ? 'signup' : (typeRaw === 'solved' ? 'solved' : '');
  if (!type) return null;
  const id = String(entry?.id || '').trim();
  if (!id) return null;
  const timestampMs = getTeacherNotifTimestampMs(entry);
  const archiveIdRaw = String(entry?.archiveId || '').trim();
  const archiveId = archiveIdRaw || buildTeacherNotifArchiveId({ ...entry, type, id, timestampMs });
  if (!archiveId) return null;
  const archivedAtMsRaw = Number(entry?.archivedAtMs);
  const archivedAtMs = Number.isFinite(archivedAtMsRaw) && archivedAtMsRaw > 0
    ? Math.floor(archivedAtMsRaw)
    : Date.now();

  if (type === 'signup') {
    const unreadCountRaw = Number(entry?.unreadCount);
    const unreadCount = Number.isFinite(unreadCountRaw) && unreadCountRaw > 0
      ? Math.floor(unreadCountRaw)
      : 0;
    return {
      archiveId,
      id,
      type,
      timestampMs,
      archivedAtMs,
      guestName: String(entry?.guestName || '').trim(),
      preview: String(entry?.preview || '').trim(),
      unreadCount,
      lastMessageAt: String(entry?.lastMessageAt || '').trim(),
    };
  }

  const questionNumberRaw = Number(entry?.questionNumber);
  const questionNumber = Number.isFinite(questionNumberRaw) && questionNumberRaw > 0
    ? Math.floor(questionNumberRaw)
    : null;
  return {
    archiveId,
    id,
    type,
    timestampMs,
    archivedAtMs,
    studentName: String(entry?.studentName || '').trim(),
    studentNickname: String(entry?.studentNickname || '').trim(),
    source: normalizeTeacherSolvedSource(entry),
    mockExamId: String(entry?.mockExamId || '').trim(),
    mockExamTitle: String(entry?.mockExamTitle || '').trim(),
    mockTaskNumber: entry?.mockTaskNumber ?? null,
    taskNumber: entry?.taskNumber,
    levelId: String(entry?.levelId || '').trim(),
    questionNumber,
    solvedAt: String(entry?.solvedAt || '').trim(),
  };
};

const normalizeTeacherNotifHistoryList = (value) => {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];
  list.forEach((entry) => {
    const safeEntry = normalizeTeacherNotifHistoryEntry(entry);
    if (!safeEntry) return;
    if (seen.has(safeEntry.archiveId)) return;
    seen.add(safeEntry.archiveId);
    normalized.push(safeEntry);
  });
  normalized.sort((left, right) => (Number(right?.timestampMs) || 0) - (Number(left?.timestampMs) || 0));
  return normalized;
};

const loadTeacherNotifHistory = (teacherId) => {
  const key = getTeacherNotifHistoryKey(teacherId);
  if (!key || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeTeacherNotifHistoryList(parsed);
  } catch {
    return [];
  }
};

const saveTeacherNotifHistory = (teacherId, value) => {
  const key = getTeacherNotifHistoryKey(teacherId);
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(normalizeTeacherNotifHistoryList(value)));
  } catch { /* no-op */ }
};

const formatTeacherNotifTimestamp = (value) => {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeStoredOpenTask = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const normalizedTaskNumber = normalizeTaskNumber(entry.taskNumber);
  if (!Number.isFinite(normalizedTaskNumber)) return null;
  const pythonTask = isPythonTaskNumber(normalizedTaskNumber);
  const section = pythonTask ? 'python' : 'progress';
  const rawIndex = Number(entry.questionIndex);
  const questionIndex = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.floor(rawIndex) : null;
  const subsectionId = String(entry.subsectionId || '').trim() || null;
  return {
    taskNumber: normalizedTaskNumber,
    levelId: pythonTask ? PYTHON_LEVEL_ID : entry.levelId,
    targetQuestions: Array.isArray(entry.targetQuestions) ? entry.targetQuestions : null,
    section,
    questionIndex,
    subsectionId,
  };
};

// Заглушка списка заданий
const RAW_TASKS = Array.from({ length: 27 }, (_, i) => ({
  id: i + 1,
  number: i + 1,
  title: [
    "Анализ информационных моделей", "Таблицы истинности", "Поиск в БД", "Кодирование (Фано)", 
    "Анализ алгоритмов", "Черепаха", "Изображения/Звук", "Комбинаторика", "Excel", "Word",
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
  { id: 101, number: 101, title: 'Ввод и вывод данных', displayNumber: '1.0', sectionId: 'topics' },
  { id: 102, number: 102, title: 'Переменные', displayNumber: '1.1', sectionId: 'topics' },
  { id: 103, number: 103, title: 'Условия', displayNumber: '2', sectionId: 'topics' },
  { id: 104, number: 104, title: 'Вычисления', displayNumber: '3', sectionId: 'topics' },
  { id: 105, number: 105, title: 'Цикл for', displayNumber: '4', sectionId: 'topics' },
  { id: 106, number: 106, title: 'Строки', displayNumber: '5', sectionId: 'topics' },
  { id: 107, number: 107, title: 'Цикл while', displayNumber: '6', sectionId: 'topics' },
  { id: 108, number: 108, title: 'Списки', displayNumber: '7.0', sectionId: 'topics' },
  { id: 109, number: 109, title: 'Кортежи', displayNumber: '7.1', sectionId: 'topics' },
  { id: 110, number: 110, title: 'Функции и рекурсия', displayNumber: '8', sectionId: 'topics' },
  { id: 111, number: 111, title: 'Двумерные массивы', displayNumber: '9', sectionId: 'topics' },
  { id: 205, number: 205, title: 'Подготовка к заданию 5', displayNumber: '5', sectionId: 'exam-prep', showInPath: false },
  { id: 208, number: 208, title: 'Подготовка к заданию 8', displayNumber: '8', sectionId: 'exam-prep', showInPath: false },
  { id: 214, number: 214, title: 'Подготовка к заданию 14', displayNumber: '14', sectionId: 'exam-prep', showInPath: false },
  { id: 216, number: 216, title: 'Подготовка к заданию 16', displayNumber: '16', sectionId: 'exam-prep', showInPath: false },
  { id: 217, number: 217, title: 'Подготовка к заданию 17', displayNumber: '17', sectionId: 'exam-prep', showInPath: false },
  { id: 223, number: 223, title: 'Подготовка к заданию 23', displayNumber: '23', sectionId: 'exam-prep', showInPath: false },
  { id: 224, number: 224, title: 'Подготовка к заданию 24', displayNumber: '24', sectionId: 'exam-prep', showInPath: false },
  { id: 225, number: 225, title: 'Подготовка к заданию 25', displayNumber: '25', sectionId: 'exam-prep', showInPath: false },
  { id: 226, number: 226, title: 'Подготовка к заданию 26', displayNumber: '26', sectionId: 'exam-prep', showInPath: false },
  { id: 227, number: 227, title: 'Подготовка к заданию 27', displayNumber: '27', sectionId: 'exam-prep', showInPath: false }
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

const PYODIDE_RUN_TIMEOUT_MS = 40000;
const ALLOW_MAIN_THREAD_PYTHON_FALLBACK = false;
const PYODIDE_STREAM_FLUSH_MS = 35;
const PYODIDE_STREAM_CHUNK_CHARS = 2048;
const PYODIDE_TURTLE_SCENE_JSON_LIMIT = 4 * 1024 * 1024;
const PYODIDE_TURTLE_SCENE_PRIMITIVE_LIMIT = 20_000;
const COLLAB_RUN_OUTPUT_LIMIT = 20000;
const COLLAB_RUN_TIMEOUT_MS = 60000;
const COLLAB_DEBUG_TIMEOUT_MS = 30 * 60 * 1000;
const COLLAB_DEBUG_TRACE_LIMIT = 2500;
const COLLAB_DEBUG_AUTOPLAY_MS = 75;
const COLLAB_DEBUG_INLINE_HINT_MAX_CHARS = 90;
const COLLAB_DEBUG_INLINE_HINT_LINES_MAX = 120;
const COLLAB_EDITOR_FONT_SIZE_DEFAULT = 18;
const COLLAB_EDITOR_FONT_FAMILY = '"JetBrains Mono", Consolas, "Courier New", monospace';
const COLLAB_SAVE_NOTICE_VISIBLE_MS = 4400;
const COLLAB_SAVE_NOTICE_STALE_MS = 8000;
const COLLAB_TURTLE_AUTO_OPEN_MAX_AGE_MS = 2 * 60 * 1000;
const COLLAB_MEMORY_SNAPSHOT_MAX_FILE_BYTES = 16 * 1024 * 1024;
const COLLAB_AUX_PANEL_MODE_INPUT = 'input';
const COLLAB_AUX_PANEL_MODE_TEST_FILE = 'test-file';
const COLLAB_TOP_PANE_MODE_PDF = 'pdf';
const COLLAB_TOP_PANE_MODE_BOARD = 'board';
const COLLAB_TEST_FILE_RUNTIME_NAME = 'test.txt';
const COLLAB_TEST_FILE_DOC_KEY = 'collab-test-file';
const COLLAB_EDITOR_CURSOR_ENABLED = true;
const COLLAB_EDITOR_CURSOR_SYNC_MS = 16;
const COLLAB_EDITOR_CURSOR_STALE_MS = 10 * 60 * 1000;
const COLLAB_EDITOR_TYPING_STALE_MS = 2600;
const COLLAB_BOARD_CODE_SPLIT_DEFAULT = 44;
const COLLAB_BOARD_CODE_SPLIT_MIN = 32;
const COLLAB_BOARD_CODE_SPLIT_MAX = 72;
const COLLAB_OUTPUT_PANEL_HEIGHT_DEFAULT = 220;
const COLLAB_OUTPUT_PANEL_HEIGHT_MIN = 132;
const COLLAB_OUTPUT_PANEL_HEIGHT_MAX = 460;

const clampCollabEditorFontSize = (value) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue)
    ? Math.min(36, Math.max(12, Math.round(nextValue)))
    : COLLAB_EDITOR_FONT_SIZE_DEFAULT;
};

const getCollabEditorMetricOptions = (fontSize) => {
  const normalizedFontSize = clampCollabEditorFontSize(fontSize);
  return {
    fontFamily: COLLAB_EDITOR_FONT_FAMILY,
    fontSize: normalizedFontSize,
    fontWeight: '500',
    fontLigatures: false,
    fontVariations: false,
    letterSpacing: 0,
    lineHeight: Math.round(normalizedFontSize * 1.5),
  };
};

const refreshCollabEditorMetrics = (editor, monaco = null) => {
  if (!editor?.getModel?.()) return;
  try {
    monaco?.editor?.remeasureFonts?.();
    editor.layout?.();
    editor.render?.();
  } catch {
    // Monaco can be disposed while delayed font/layout refresh callbacks are still queued.
  }
};

const scheduleCollabEditorMetricRefresh = (editor, monaco = null) => {
  refreshCollabEditorMetrics(editor, monaco);
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame?.(() => {
      refreshCollabEditorMetrics(editor, monaco);
      window.requestAnimationFrame?.(() => refreshCollabEditorMetrics(editor, monaco));
    });
    window.setTimeout(() => refreshCollabEditorMetrics(editor, monaco), 120);
    window.setTimeout(() => refreshCollabEditorMetrics(editor, monaco), 420);
  }
  if (typeof document !== 'undefined' && document.fonts?.ready?.then) {
    document.fonts.ready
      .then(() => refreshCollabEditorMetrics(editor, monaco))
      .catch(() => {});
  }
};

const normalizeCollabEditorSelection = (selection) => {
  const startLineNumber = Number(selection?.startLineNumber ?? selection?.selectionStartLineNumber);
  const startColumn = Number(selection?.startColumn ?? selection?.selectionStartColumn);
  const endLineNumber = Number(selection?.endLineNumber ?? selection?.positionLineNumber);
  const endColumn = Number(selection?.endColumn ?? selection?.positionColumn);
  const hasValidRange = [startLineNumber, startColumn, endLineNumber, endColumn]
    .every((value) => Number.isInteger(value) && value > 0);
  if (!hasValidRange) return null;
  const startsAfterEnd = startLineNumber > endLineNumber
    || (startLineNumber === endLineNumber && startColumn > endColumn);
  const normalized = startsAfterEnd
    ? {
      startLineNumber: endLineNumber,
      startColumn: endColumn,
      endLineNumber: startLineNumber,
      endColumn: startColumn,
    }
    : {
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
    };
  if (
    normalized.startLineNumber === normalized.endLineNumber
    && normalized.startColumn === normalized.endColumn
  ) {
    return null;
  }
  return normalized;
};

const mergeRuntimeErrorText = (base, next) => {
  const baseText = typeof base === 'string' ? base : String(base ?? '');
  const nextText = typeof next === 'string' ? next : String(next ?? '');
  if (!nextText) return baseText;
  if (!baseText) return nextText;
  return `${baseText}${baseText.endsWith('\n') ? '' : '\n'}${nextText}`;
};

const normalizeCollabTextFileContent = (value) => String(value ?? '').replace(/\r\n?/g, '\n');

const normalizeCollabAuxPanelMode = (value) => (
  String(value || '').trim() === COLLAB_AUX_PANEL_MODE_TEST_FILE
    ? COLLAB_AUX_PANEL_MODE_TEST_FILE
    : COLLAB_AUX_PANEL_MODE_INPUT
);

const normalizeCollabTopPaneMode = (value) => (
  String(value || '').trim() === COLLAB_TOP_PANE_MODE_BOARD
    ? COLLAB_TOP_PANE_MODE_BOARD
    : COLLAB_TOP_PANE_MODE_PDF
);

const normalizeCollabBoardCodeSplit = (value) => {
  if (value == null || String(value).trim() === '') return COLLAB_BOARD_CODE_SPLIT_DEFAULT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return COLLAB_BOARD_CODE_SPLIT_DEFAULT;
  const rounded = Math.round(numeric * 10) / 10;
  return Math.max(COLLAB_BOARD_CODE_SPLIT_MIN, Math.min(COLLAB_BOARD_CODE_SPLIT_MAX, rounded));
};

const normalizeCollabOutputPanelHeight = (value) => {
  if (value == null || String(value).trim() === '') return COLLAB_OUTPUT_PANEL_HEIGHT_DEFAULT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return COLLAB_OUTPUT_PANEL_HEIGHT_DEFAULT;
  return Math.max(
    COLLAB_OUTPUT_PANEL_HEIGHT_MIN,
    Math.min(COLLAB_OUTPUT_PANEL_HEIGHT_MAX, Math.round(numeric))
  );
};

const normalizeCollabTestFileHeight = (value) => {
  const height = Math.round(Number(value));
  if (!Number.isFinite(height)) return 0;
  return Math.max(120, Math.min(1200, height));
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

const areStringArraysEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i] ?? '') !== String(b[i] ?? '')) return false;
  }
  return true;
};

const normalizeCollabOutputSelection = (value, textLength = Number.MAX_SAFE_INTEGER) => {
  if (!value || typeof value !== 'object') return null;
  const maxLength = Number.isFinite(Number(textLength)) && Number(textLength) >= 0
    ? Math.max(0, Math.floor(Number(textLength)))
    : Number.MAX_SAFE_INTEGER;
  const startRaw = Number(value.start);
  const endRaw = Number(value.end);
  if (!Number.isInteger(startRaw) || !Number.isInteger(endRaw)) return null;
  const start = Math.max(0, Math.min(maxLength, startRaw));
  const end = Math.max(0, Math.min(maxLength, endRaw));
  if (end <= start) return null;
  return {
    start,
    end,
    ts: Number.isFinite(Number(value?.ts)) ? Number(value.ts) : Date.now(),
  };
};

const getCollabColorWithAlpha = (value, alpha, fallback = `rgba(99, 102, 241, ${alpha})`) => {
  const normalizedAlpha = Number.isFinite(Number(alpha))
    ? Math.max(0, Math.min(1, Number(alpha)))
    : 1;
  const text = String(value || '').trim();
  const hexMatch = text.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!hexMatch) return fallback;
  const hex = hexMatch[1].length === 3
    ? hexMatch[1].split('').map((char) => `${char}${char}`).join('')
    : hexMatch[1];
  const int = Number.parseInt(hex, 16);
  if (!Number.isFinite(int)) return fallback;
  const red = (int >> 16) & 255;
  const green = (int >> 8) & 255;
  const blue = int & 255;
  return `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha})`;
};

const buildCollabSelectionHighlightStyle = (color) => ({
  background: `linear-gradient(180deg, ${getCollabColorWithAlpha(color, 0.24, 'rgba(56, 189, 248, 0.24)')}, ${getCollabColorWithAlpha(color, 0.14, 'rgba(56, 189, 248, 0.14)')})`,
  boxShadow: `inset 0 0 0 1px ${getCollabColorWithAlpha(color, 0.42, 'rgba(125, 211, 252, 0.45)')}`,
  borderRadius: '0.22rem',
});

const formatCollabSymbolCount = (value) => {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} символ`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} символа`;
  return `${count} символов`;
};

const getCollabTextLocation = (text, index) => {
  const source = String(text ?? '');
  const safeIndex = Math.max(0, Math.min(source.length, Math.floor(Number(index) || 0)));
  let line = 1;
  let column = 1;
  for (let cursor = 0; cursor < safeIndex; cursor += 1) {
    if (source[cursor] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
};

const describeCollabTextSelection = (text, selection) => {
  const range = normalizeCollabOutputSelection(selection, String(text ?? '').length);
  if (!range) return null;
  const start = getCollabTextLocation(text, range.start);
  const end = getCollabTextLocation(text, range.end);
  const charCount = range.end - range.start;
  return {
    start,
    end,
    charCount,
    label: `${start.line}:${start.column} - ${end.line}:${end.column}`,
    summary: `${formatCollabSymbolCount(charCount)} · ${start.line}:${start.column}-${end.line}:${end.column}`,
  };
};

const buildCollabTextSelectionSegments = (text, selections = []) => {
  const source = String(text ?? '');
  const normalizedSelections = (Array.isArray(selections) ? selections : [])
    .map((selection) => {
      const range = normalizeCollabOutputSelection(selection, source.length);
      return range ? { ...selection, ...range } : null;
    })
    .filter(Boolean);
  if (!source || !normalizedSelections.length) return [];
  const boundaries = new Set([0, source.length]);
  normalizedSelections.forEach((selection) => {
    boundaries.add(selection.start);
    boundaries.add(selection.end);
  });
  const points = Array.from(boundaries).sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const selection = normalizedSelections.find((item) => item.start < end && item.end > start) || null;
    segments.push({
      key: `${start}-${end}`,
      text: source.slice(start, end),
      selection,
    });
  }
  return segments;
};

const COLLAB_OUTPUT_SELECTION_STYLE = {
  backgroundColor: 'rgba(56, 189, 248, 0.2)',
  boxShadow: 'inset 0 0 0 1px rgba(125, 211, 252, 0.45)',
};

const normalizeSharedTaskFileIds = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean))];
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

    const toBytes = (value) => {
      if (value instanceof Uint8Array) return value;
      if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      }
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      if (Array.isArray(value)) {
        return Uint8Array.from(value.map((item) => {
          const num = Number(item);
          if (!Number.isFinite(num)) return 0;
          return num & 255;
        }));
      }
      if (typeof value === 'string') {
        try {
          return new TextEncoder().encode(value);
        } catch {
          return new Uint8Array(0);
        }
      }
      return new Uint8Array(0);
    };

    const sanitizeRuntimeFilePath = (value) => {
      const text = toText(value).replace(/\\0/g, '').trim();
      if (!text) return '';
      const parts = text
        .split(/[\\\\/]+/)
        .map((part) => toText(part).trim())
        .filter((part) => part && part !== '.' && part !== '..');
      if (!parts.length) return '';
      return parts.join('/');
    };

    const ensureRuntimeDir = (pyodide, dirPath) => {
      if (!pyodide?.FS || !dirPath) return;
      const parts = String(dirPath).split('/').filter(Boolean);
      let current = '';
      parts.forEach((part) => {
        current = current ? current + '/' + part : part;
        try {
          pyodide.FS.mkdir(current);
        } catch { /* no-op */ }
      });
    };

    let mountedRuntimeFiles = [];
    const clearMountedRuntimeFiles = (pyodide) => {
      if (!pyodide?.FS || !mountedRuntimeFiles.length) {
        mountedRuntimeFiles = [];
        return;
      }
      mountedRuntimeFiles.forEach((name) => {
        try {
          pyodide.FS.unlink(name);
        } catch { /* no-op */ }
      });
      mountedRuntimeFiles = [];
    };

    const mountRuntimeFiles = (pyodide, files) => {
      clearMountedRuntimeFiles(pyodide);
      if (!pyodide?.FS || !Array.isArray(files) || !files.length) return;
      const seen = new Set();
      files.forEach((file) => {
        const safePath = sanitizeRuntimeFilePath(file?.name);
        if (!safePath) return;
        const dedupeKey = safePath.toLowerCase();
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        const bytes = toBytes(file?.bytes);
        const dirPath = safePath.includes('/') ? safePath.slice(0, safePath.lastIndexOf('/')) : '';
        if (dirPath) ensureRuntimeDir(pyodide, dirPath);
        try {
          pyodide.FS.writeFile(safePath, bytes);
          mountedRuntimeFiles.push(safePath);
        } catch { /* no-op */ }
      });
    };

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

    const runPython = async (
      id,
      source,
      inputValue,
      debugMode = false,
      runtimeFiles = [],
      enableTurtle = false
    ) => {
      const pyodide = await ensurePyodide();
      mountRuntimeFiles(pyodide, runtimeFiles);
      const safeInput = toText(inputValue);
      const safeSource = toText(source);
      const useDebugMode = Boolean(debugMode);
      const stdoutEmitter = createChunkEmitter(id, 'stdout');
      const stderrEmitter = createChunkEmitter(id, 'stderr');
      const stdoutDecoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
      const stderrDecoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
      let output = '';
      let error = '';
      let debugTrace = [];
      let debugTraceTruncated = false;
      let turtleScene = null;

      const appendStdout = (value) => {
        const safe = toText(value);
        if (!safe) return;
        output += safe;
        stdoutEmitter.push(safe);
      };

      const appendStderr = (value) => {
        const safe = toText(value);
        if (!safe) return;
        error += safe;
        stderrEmitter.push(safe);
      };

      if (typeof pyodide.setStdout === 'function') {
        pyodide.setStdout({
          write: (buffer) => {
            if (!buffer) return 0;
            const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            const text = stdoutDecoder
              ? stdoutDecoder.decode(bytes, { stream: true })
              : toText(bytes);
            appendStdout(text);
            return bytes.length;
          }
        });
      }
      if (typeof pyodide.setStderr === 'function') {
        pyodide.setStderr({
          write: (buffer) => {
            if (!buffer) return 0;
            const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            const text = stderrDecoder
              ? stderrDecoder.decode(bytes, { stream: true })
              : toText(bytes);
            appendStderr(text);
            return bytes.length;
          }
        });
      }

      const wrapped = [
        enableTurtle ? ${JSON.stringify(HEADLESS_TURTLE_SOURCE)} : '',
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
        'try:',
        '    __turtle_scene_json = _turtle_export_scene_json()',
        'except Exception:',
        '    __turtle_scene_json = ""',
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
        try {
          const sceneValue = pyodide.globals.get('__turtle_scene_json');
          const sceneText = sceneValue && typeof sceneValue.toJs === 'function'
            ? sceneValue.toJs()
            : sceneValue;
          sceneValue?.destroy?.();
          if (
            typeof sceneText === 'string'
            && sceneText
            && sceneText.length <= ${PYODIDE_TURTLE_SCENE_JSON_LIMIT}
          ) {
            const parsedScene = JSON.parse(sceneText);
            if (parsedScene && typeof parsedScene === 'object' && Array.isArray(parsedScene.primitives)) {
              const primitivesTruncated = parsedScene.primitives.length > ${PYODIDE_TURTLE_SCENE_PRIMITIVE_LIMIT};
              turtleScene = {
                ...parsedScene,
                primitives: parsedScene.primitives.slice(0, ${PYODIDE_TURTLE_SCENE_PRIMITIVE_LIMIT}),
                truncated: parsedScene.truncated === true || primitivesTruncated,
              };
            }
          } else if (typeof sceneText === 'string' && sceneText) {
            appendStderr('\\nРисунок turtle слишком большой и не был показан.\\n');
          }
        } catch { /* no-op */ }
      } finally {
        try {
          pyodide.globals.delete('__collab_debug_events');
          pyodide.globals.delete('__collab_debug_events_json');
          pyodide.globals.delete('__collab_debug_truncated');
          pyodide.globals.delete('__turtle_scene_json');
        } catch { /* no-op */ }
        try {
          if (stdoutDecoder) appendStdout(stdoutDecoder.decode());
          if (stderrDecoder) appendStderr(stderrDecoder.decode());
        } catch { /* no-op */ }
        stdoutEmitter.close();
        stderrEmitter.close();
      }
      return {
        output,
        error,
        turtleScene,
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
        if (data.type === 'warmup') {
          await ensurePyodide();
          self.postMessage({ id, type: 'ready' });
          return;
        }
        const result = await runPython(
          id,
          data.source,
          data.input,
          data.debug,
          data.files,
          data.enableTurtle === true
        );
        if (result?.debug) {
          self.postMessage({
            id,
            type: 'debug-trace',
            trace: Array.isArray(result.debug.trace) ? result.debug.trace : [],
            truncated: Boolean(result.debug.truncated),
          });
        }
        self.postMessage({
          id,
          type: 'result',
          output: result.output,
          error: result.error,
          turtleScene: result.turtleScene,
        });
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
  const authToken = typeof value.token === 'string'
    ? value.token.trim()
    : (typeof value.authToken === 'string' ? value.authToken.trim() : '');
  if (authToken) {
    safe.authToken = authToken;
  }
  if (role === 'student') {
    const teacherId = value.teacherId;
    safe.teacherId = teacherId ? String(teacherId) : null;
    const rawGrade = String(value.grade ?? '').trim().toLowerCase();
    safe.grade = rawGrade === 'graduate' || rawGrade === 'graduates' || rawGrade === 'выпускник' || rawGrade === 'выпускники'
      ? 'graduate'
      : (Number(value.grade) === 10 ? 10 : 11);
    safe.studyStatus = normalizeStudentStudyStatus(value.studyStatus, safe.grade);
    const avatarDataUrl = typeof value.avatarDataUrl === 'string' ? value.avatarDataUrl.trim() : '';
    if (avatarDataUrl) safe.avatarDataUrl = avatarDataUrl;
  }
  if (role === 'lead') {
    const chatId = typeof value.chatId === 'string' ? value.chatId.trim() : '';
    if (!chatId) return null;
    safe.chatId = chatId;
    safe.teacherId = value.teacherId ? String(value.teacherId) : null;
  }
  return safe;
};

const MAX_TASK_BYTES = 200 * 1024 * 1024;
const MAX_LESSON_SHARED_TASK_BYTES = 500 * 1024 * 1024;
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
  let nextUrl = resolveAuthenticatedUploadsUrl(url);
  if (studentId && !/[?&]studentId=/.test(nextUrl)) {
    const separator = nextUrl.includes('?') ? '&' : '?';
    nextUrl = `${nextUrl}${separator}studentId=${encodeURIComponent(studentId)}`;
  }
  return nextUrl;
};

const withUploadsAuthToken = (url) => {
  return resolveAuthenticatedUploadsUrl(url);
};

const extractResponseErrorMessage = async (response, fallback = 'Не удалось выполнить запрос.') => {
  if (!response) return fallback;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await response.clone().json();
      const error = typeof data?.error === 'string' ? data.error.trim() : '';
      if (error) return error;
    } catch {
      // Ignore invalid JSON and fall through to text parsing.
    }
  }
  try {
    const text = (await response.clone().text()).trim();
    if (text && text.length <= 240) return text;
  } catch {
    // Ignore unreadable bodies and return the fallback below.
  }
  if (response.status === 429) return 'Превышен лимит трафика для ученика';
  return fallback;
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

const STUDENT_RATING_TOUR_STEPS = [
  {
    id: 'rating-entry',
    title: 'Рейтинг и игра',
    text: 'Это игровая зона: место в рейтинге, лиги, монеты, артефакты и недельная гонка живут здесь.',
    emotion: 'greetings',
    target: '[data-tour="rating-overview"]',
    fallback: '[data-tour="rating-nav"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-nav',
    title: 'Как вернуться',
    text: 'На компьютере рейтинг находится в компактном блоке под основной навигацией, а на телефоне — в «Ещё». Его также можно открыть через карточку уровня.',
    emotion: 'peeking',
    target: '[data-tour="rating-nav"]',
    fallback: '[data-tour="level-profile-entry"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-position',
    title: 'Твоя позиция',
    text: 'Здесь видно место в общем рейтинге и период, за который считается недельный опыт.',
    emotion: 'approval',
    target: '[data-tour="rating-overview"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-league',
    title: 'Лиги и уровень',
    text: 'Лига зависит от общего XP. Открой «Все лиги», чтобы увидеть диапазоны и следующую цель.',
    emotion: 'pondering',
    target: '[data-tour="rating-league"]',
    fallback: '[data-tour="rating-overview"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-name',
    title: 'Имя в рейтинге',
    text: 'Если платформа попросит, выбери настоящее имя или короткий псевдоним. Так тебя будут видеть в таблицах.',
    emotion: 'peeking',
    target: '[data-tour="rating-name"]',
    fallback: '[data-tour="rating-overview"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-coins',
    title: 'Монеты',
    text: 'Монеты дают за Python-задачи, пробники, подарки от учителя и некоторые артефакты.',
    emotion: 'approval',
    target: '[data-tour="rating-coins"]',
    fallback: '[data-tour="rating-altar"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-altar',
    title: 'Алтарь артефактов',
    text: 'Трать монеты на крутки. Артефакты пополняют коллекцию и могут усиливать опыт или монетные награды.',
    emotion: 'greetings',
    target: '[data-tour="rating-altar"]',
    fallback: '[data-tour="rating-overview"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-spin',
    title: 'Крутка',
    text: 'Кнопка призыва запускает выпадение. Если монет не хватает, подсказка покажет, сколько ещё нужно.',
    emotion: 'pondering',
    target: '[data-tour="rating-altar-spin"]',
    fallback: '[data-tour="rating-altar"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-artifacts',
    title: 'Коллекция',
    text: 'Найденные артефакты остаются здесь. Открывай карточки, чтобы посмотреть описание, ранг и бонусы.',
    emotion: 'peeking',
    target: '[data-tour="rating-artifacts"]',
    fallback: '[data-tour="rating-altar"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-timer-chests',
    title: 'Сундуки таймера',
    text: 'Сундуки дают за таймерные пробники: по 1 за рубежи 30, 50, 80 и 100 баллов. Они ждут здесь; открывается один сундук за раз, таймер на 3 часа.',
    emotion: 'greetings',
    target: '[data-tour="rating-timer-chests"]',
    fallback: '[data-tour="rating-overview"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-level-board',
    title: 'Общий рейтинг',
    text: 'Левая таблица показывает выбранный показатель за всё время: XP, курс, Python, дни на платформе или активность. Текущая строка подсвечивается.',
    emotion: 'approval',
    target: '[data-tour="rating-level-board"]',
    fallback: '[data-tour="rating-overview"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-week-board',
    title: 'Недельная гонка',
    text: 'Правая таблица показывает тот же показатель за последние семь дней. Можно догонять даже тех, у кого общий уровень выше.',
    emotion: 'approval',
    target: '[data-tour="rating-week-board"]',
    fallback: '[data-tour="rating-level-board"]',
    view: 'rating',
    menu: 'close'
  },
  {
    id: 'rating-done',
    title: 'Готово',
    text: 'Игра простая: решай задачи, собирай монеты, крути алтарь, усиливай награды и поднимайся в рейтинге.',
    emotion: 'approval',
    target: '[data-tour="rating-overview"]',
    view: 'rating',
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
  theme = THEME_LIGHT,
  withStudentId,
  tasks,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  openSaveToNotesToken = 0,
  onLessonReplayEvent = null,
}) => {
  const isTeacher = role === 'teacher';
  const isDarkTheme = normalizeTheme(theme) === THEME_DARK;
  const [status, setStatus] = useState('disconnected');
  const [peerCount, setPeerCount] = useState(0);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [remoteEditorCursors, setRemoteEditorCursors] = useState([]);
  const [remoteOutputSelections, setRemoteOutputSelections] = useState([]);
  const [remoteTestFileSelections, setRemoteTestFileSelections] = useState([]);
  const [localTestFileSelection, setLocalTestFileSelection] = useState(null);
  const [editorReady, setEditorReady] = useState(false);
  const [editorViewportVersion, setEditorViewportVersion] = useState(0);
  const [editorMountVersion, setEditorMountVersion] = useState(0);
  const editorRef = useRef(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const taskOptions = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const saveTaskNumbers = useMemo(() => getNotesSaveTaskNumbers(taskOptions), [taskOptions]);
  const defaultSaveTaskNumber = saveTaskNumbers[0] || '';
  const [saveTaskNumber, setSaveTaskNumber] = useState(() => defaultSaveTaskNumber);
  const [saveCategory, setSaveCategory] = useState('class');
  const [saveFolderId, setSaveFolderId] = useState('');
  const [saveFileName, setSaveFileName] = useState('');
  const [saveMode, setSaveMode] = useState(NOTES_SAVE_MODE_FULL_TASK);
  const [folders, setFolders] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveNameError, setSaveNameError] = useState(false);
  const [collabSaveNotice, setCollabSaveNotice] = useState(null);
  const saveDraftSkipPersistRef = useRef(true);
  const openSaveToNotesTokenRef = useRef(0);
  const [runInput, setRunInput] = useState('');
  const [stdinPanelOpen, setStdinPanelOpen] = useState(false);
  const [collabAuxPanelMode, setCollabAuxPanelMode] = useState(COLLAB_AUX_PANEL_MODE_INPUT);
  const [testFileText, setTestFileText] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [runError, setRunError] = useState('');
  const [runStatus, setRunStatus] = useState('idle');
  const [runAuthor, setRunAuthor] = useState('');
  const [runTimestamp, setRunTimestamp] = useState(null);
  const [lastRunInput, setLastRunInput] = useState('');
  const [collabTurtleScene, setCollabTurtleScene] = useState(null);
  const [collabTurtleWindowOpen, setCollabTurtleWindowOpen] = useState(false);
  const [collabTurtleWindowFullscreen, setCollabTurtleWindowFullscreen] = useState(false);
  const [collabTurtleAuthor, setCollabTurtleAuthor] = useState('');
  const [outputPanelOpen, setOutputPanelOpen] = useState(false);
  const [outputPanelHeight, setOutputPanelHeight] = useState(() => {
    if (typeof window === 'undefined') return COLLAB_OUTPUT_PANEL_HEIGHT_DEFAULT;
    const raw = window.localStorage.getItem(`collab-output-panel-height-${userId || role || 'anon'}`);
    return normalizeCollabOutputPanelHeight(raw);
  });
  const [runLoading, setRunLoading] = useState(false);
  const [debugActive, setDebugActive] = useState(false);
  const [debugTrace, setDebugTrace] = useState([]);
  const [debugStepIndex, setDebugStepIndex] = useState(-1);
  const [debugTraceTruncated, setDebugTraceTruncated] = useState(false);
  const [debugBreakpoints, setDebugBreakpoints] = useState([]);
  const [debugPlaying, setDebugPlaying] = useState(false);
  const [debugSourceSnapshot, setDebugSourceSnapshot] = useState('');
  const [editorFontSize, setEditorFontSize] = useState(COLLAB_EDITOR_FONT_SIZE_DEFAULT);
  const [isCollabFullscreen, setIsCollabFullscreen] = useState(false);
  const [boardCodeSplitWidth, setBoardCodeSplitWidth] = useState(() => {
    if (typeof window === 'undefined') return COLLAB_BOARD_CODE_SPLIT_DEFAULT;
    const raw = window.localStorage.getItem(`collab-board-code-split-${userId || role || 'anon'}`);
    return normalizeCollabBoardCodeSplit(raw);
  });
  const [testFileTextareaHeight, setTestFileTextareaHeight] = useState(0);
  const [runTaskNumber, setRunTaskNumber] = useState(() => String(taskOptions[0]?.number || ''));
  const [runTaskCategory, setRunTaskCategory] = useState('class');
  const [taskFiles, setTaskFiles] = useState([]);
  const [taskFilesLoading, setTaskFilesLoading] = useState(false);
  const [taskFilesLoaded, setTaskFilesLoaded] = useState(false);
  const [taskFilesError, setTaskFilesError] = useState('');
  const [testingTaskFiles, setTestingTaskFiles] = useState([]);
  const [testingTaskFilesLoading, setTestingTaskFilesLoading] = useState(false);
  const [testingTaskFilesLoaded, setTestingTaskFilesLoaded] = useState(false);
  const [testingTaskFilesError, setTestingTaskFilesError] = useState('');
  const [taskFileUploadBusy, setTaskFileUploadBusy] = useState(false);
  const [selectedTaskFileIds, setSelectedTaskFileIds] = useState([]);
  const [taskFilesPanelOpen, setTaskFilesPanelOpen] = useState(false);
  const [taskFilesSearch, setTaskFilesSearch] = useState('');
  const [taskFilesListHeight, setTaskFilesListHeight] = useState(112);
  const [notesPdfPanelOpen, setNotesPdfPanelOpen] = useState(true);
  const [notesPanelMode, setNotesPanelMode] = useState(COLLAB_TOP_PANE_MODE_BOARD);
  const [notesPdfFolderKey, setNotesPdfFolderKey] = useState('');
  const [notesPdfFileId, setNotesPdfFileId] = useState('');
  const [notesPdfPanelHeight, setNotesPdfPanelHeight] = useState(220);
  const [notesPdfPreviewState, setNotesPdfPreviewState] = useState({ status: 'idle', message: '' });

  const isMobileViewport = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 767px)').matches
    : false;
  const effectiveStudentId = isTeacher ? activeStudentId : userId;
  const roomId = effectiveStudentId && teacherId ? `collab-${teacherId}-${effectiveStudentId}` : null;
  const notesSaveDraftStorageKey = useMemo(() => {
    const ownerId = isTeacher ? (teacherId || userId) : userId;
    return buildNotesSaveDraftStorageKey('code', ownerId, effectiveStudentId);
  }, [effectiveStudentId, isTeacher, teacherId, userId]);
  useEffect(() => {
    const token = Number(openSaveToNotesToken) || 0;
    if (!token || openSaveToNotesTokenRef.current === token) return;
    openSaveToNotesTokenRef.current = token;
    if (!isTeacher || !effectiveStudentId) return;
    setSaveModalOpen(true);
    setSaveError('');
    setSaveSuccess('');
  }, [effectiveStudentId, isTeacher, openSaveToNotesToken]);
  const wsUrl = useMemo(() => getCollabWsUrl(), []);
  const localName = userName || (isTeacher ? 'Учитель' : 'Ученик');
  const localColor = useMemo(
    () => pickCollabColor(isTeacher ? `teacher-${teacherId}` : `student-${userId}`),
    [isTeacher, teacherId, userId]
  );
  const fontSizeStorageKey = useMemo(() => `collab-font-size-${userId || role || 'anon'}`, [userId, role]);
  const boardCodeSplitStorageKey = useMemo(() => `collab-board-code-split-v2-${userId || role || 'anon'}`, [userId, role]);
  const outputPanelHeightStorageKey = useMemo(() => `collab-output-panel-height-${userId || role || 'anon'}`, [userId, role]);
  const taskFilesListHeightStorageKey = useMemo(() => `collab-task-files-list-height-${userId || role || 'anon'}`, [userId, role]);
  const collabRootRef = useRef(null);
  const boardCodeSplitDragCleanupRef = useRef(null);
  const outputPanelResizeCleanupRef = useRef(null);
  const notesPdfResizeCleanupRef = useRef(null);
  const notesPdfPreviewRef = useRef(null);
  const outputViewportRef = useRef(null);
  const outputTextareaRef = useRef(null);
  const outputSelectionTrackingStopRef = useRef(null);
  const outputSelectionSyncFrameRef = useRef(null);
  const testFileSelectionTrackingStopRef = useRef(null);
  const testFileSelectionSyncFrameRef = useRef(null);
  const notesPdfPanelHeightRef = useRef(notesPdfPanelHeight);
  const notesPdfDragHeightRef = useRef(notesPdfPanelHeight);
  const boardCodeSplitWidthRef = useRef(boardCodeSplitWidth);
  const outputPanelHeightRef = useRef(outputPanelHeight);
  const boardCodeSplitLoadedValueRef = useRef(null);
  const collabDocRef = useRef(null);
  const collabTestFileRef = useRef(null);
  const runMapRef = useRef(null);
  const collabAwarenessRef = useRef(null);
  const collabTurtleCloseRef = useRef(null);
  const collabTurtlePayloadRef = useRef({ json: '', runId: '' });
  const collabTurtleSeenRunIdRef = useRef('');
  const runWorkerRef = useRef(null);
  const runPendingRef = useRef(new Map());
  const runSessionRef = useRef(0);
  const publishRunStateRef = useRef(null);
  const monacoRef = useRef(null);
  const runStreamTimerRef = useRef(null);
  const runStreamPendingRef = useRef(null);
  const runInputRef = useRef(runInput);
  const testFileTextRef = useRef(testFileText);
  const runOutputRef = useRef(runOutput);
  const outputSelectionRef = useRef(null);
  const testFileSelectionRef = useRef(null);
  const runErrorRef = useRef(runError);
  const runStatusRef = useRef(runStatus);
  const runTimestampRef = useRef(runTimestamp);
  const outputPanelDismissedRunTokenRef = useRef(null);
  const collabAuxPanelModeRef = useRef(collabAuxPanelMode);
  const testFileTextareaHeightRef = useRef(testFileTextareaHeight);
  const taskFilesPanelOpenRef = useRef(taskFilesPanelOpen);
  const runTaskNumberRef = useRef(runTaskNumber);
  const runTaskCategoryRef = useRef(runTaskCategory);
  const handleRunCodeRef = useRef(null);
  const selectedTaskFileIdsRef = useRef(selectedTaskFileIds);
  const testFileTextareaRef = useRef(null);
  const testFileHighlightOverlayRef = useRef(null);
  const taskFileInputRef = useRef(null);
  const mountedRuntimeFilesRef = useRef([]);
  const debugTraceRef = useRef([]);
  const debugStepIndexRef = useRef(-1);
  const debugBreakpointsRef = useRef([]);
  const debugPlaybackTimerRef = useRef(null);
  const debugDecorationsRef = useRef([]);
  const debugInlineHintDecorationsRef = useRef([]);
  const debugInlayProviderRef = useRef(null);
  const debugBreakpointDecorationsRef = useRef([]);
  const debugGutterDisposableRef = useRef(null);
  const suppressAuxPanelModeSyncRef = useRef(false);
  const suppressTestFileHeightSyncRef = useRef(false);
  const suppressBreakpointSyncRef = useRef(false);
  const suppressTaskFilesSyncRef = useRef(false);
  const taskFilesSyncReadyRef = useRef(false);
  const collabSaveNoticeTimerRef = useRef(null);
  const collabSaveNoticeSeenRef = useRef('');
  const collabBoardSnapshotRendererRef = useRef(null);
  const collabSnippetProviderRef = useRef(null);
  const collabCursorMoveDisposableRef = useRef(null);
  const collabCursorLeaveDisposableRef = useRef(null);
  const collabCursorBlurDisposableRef = useRef(null);
  const collabCursorLayoutDisposableRef = useRef(null);
  const collabCursorScrollDisposableRef = useRef(null);
  const collabCursorPositionDisposableRef = useRef(null);
  const collabCursorSelectionDisposableRef = useRef(null);
  const collabCursorContentDisposableRef = useRef(null);
  const collabCursorTypeDisposableRef = useRef(null);
  const collabCursorDragMouseDownDisposableRef = useRef(null);
  const collabCursorWindowStopRef = useRef(null);
  const collabCursorClearTimerRef = useRef(null);
  const collabCursorSyncTimerRef = useRef(null);
  const collabCursorPendingRef = useRef(null);
  const collabCursorLastSyncAtRef = useRef(0);
  const remoteEditorCursorSeenRef = useRef(new Map());
  const lessonReplayEventRef = useRef(onLessonReplayEvent);
  const lessonReplayCodeTimerRef = useRef(null);
  const lessonReplayPendingCodeRef = useRef(null);
  const lessonReplayLastCodeSignatureRef = useRef('');
  const lessonReplayCodeViewportTimerRef = useRef(null);
  const lessonReplayPendingCodeViewportRef = useRef(null);
  const lessonReplayLastCodeViewportSignatureRef = useRef('');
  const lessonReplayLastCodeViewportAtRef = useRef(0);
  useEffect(() => {
    lessonReplayEventRef.current = onLessonReplayEvent;
  }, [onLessonReplayEvent]);
  const flushLessonReplayCodeSnapshot = useCallback(() => {
    if (typeof window !== 'undefined') window.clearTimeout(lessonReplayCodeTimerRef.current);
    const payload = lessonReplayPendingCodeRef.current;
    lessonReplayPendingCodeRef.current = null;
    if (!payload || typeof lessonReplayEventRef.current !== 'function') return;
    const signature = JSON.stringify(payload);
    if (signature === lessonReplayLastCodeSignatureRef.current) return;
    lessonReplayLastCodeSignatureRef.current = signature;
    lessonReplayEventRef.current('code', payload, { dedupeMs: 10_000 });
  }, []);
  const scheduleLessonReplayCodeSnapshot = useCallback((ytext, delayMs = 1400, overrides = {}) => {
    if (!ytext || typeof window === 'undefined') return;
    lessonReplayPendingCodeRef.current = {
      language: 'python',
      code: ytext.toString(),
      input: Object.prototype.hasOwnProperty.call(overrides, 'input') ? overrides.input : (runInputRef.current || ''),
      testFile: Object.prototype.hasOwnProperty.call(overrides, 'testFile') ? overrides.testFile : (testFileTextRef.current || ''),
      output: Object.prototype.hasOwnProperty.call(overrides, 'output') ? overrides.output : (runOutputRef.current || ''),
      error: Object.prototype.hasOwnProperty.call(overrides, 'error') ? overrides.error : (runErrorRef.current || ''),
    };
    window.clearTimeout(lessonReplayCodeTimerRef.current);
    lessonReplayCodeTimerRef.current = window.setTimeout(
      flushLessonReplayCodeSnapshot,
      Math.max(0, Number(delayMs) || 0)
    );
  }, [flushLessonReplayCodeSnapshot]);
  useEffect(() => () => flushLessonReplayCodeSnapshot(), [flushLessonReplayCodeSnapshot]);
  const flushLessonReplayCodeViewport = useCallback(() => {
    if (typeof window !== 'undefined') window.clearTimeout(lessonReplayCodeViewportTimerRef.current);
    const payload = lessonReplayPendingCodeViewportRef.current;
    lessonReplayPendingCodeViewportRef.current = null;
    if (!payload || typeof lessonReplayEventRef.current !== 'function') return;
    const signature = JSON.stringify(payload);
    if (signature === lessonReplayLastCodeViewportSignatureRef.current) return;
    lessonReplayLastCodeViewportSignatureRef.current = signature;
    lessonReplayLastCodeViewportAtRef.current = Date.now();
    lessonReplayEventRef.current('viewport', payload, { dedupeMs: 5000 });
  }, []);
  const scheduleLessonReplayCodeViewport = useCallback((editor, delayMs = 1600) => {
    if (!editor || typeof window === 'undefined') return;
    const layout = editor.getLayoutInfo?.() || {};
    const viewportHeight = Math.max(1, Number(layout.height) || 1);
    const viewportWidth = Math.max(1, Number(layout.contentWidth) || Number(layout.width) || 1);
    const scrollTop = Math.max(0, Number(editor.getScrollTop?.()) || 0);
    const scrollLeft = Math.max(0, Number(editor.getScrollLeft?.()) || 0);
    const maxScrollTop = Math.max(1, (Number(editor.getScrollHeight?.()) || viewportHeight) - viewportHeight);
    const maxScrollLeft = Math.max(1, (Number(editor.getScrollWidth?.()) || viewportWidth) - viewportWidth);
    const visibleRange = editor.getVisibleRanges?.()?.[0] || null;
    const cursor = editor.getPosition?.() || null;
    lessonReplayPendingCodeViewportRef.current = {
      surface: 'code',
      scrollTopRatio: Math.min(1, scrollTop / maxScrollTop),
      scrollLeftRatio: Math.min(1, scrollLeft / maxScrollLeft),
      firstVisibleLine: Math.max(1, Number(visibleRange?.startLineNumber) || 1),
      cursorLine: Math.max(1, Number(cursor?.lineNumber) || 1),
      cursorColumn: Math.max(1, Number(cursor?.column) || 1),
    };
    const elapsed = Date.now() - lessonReplayLastCodeViewportAtRef.current;
    const waitMs = Math.max(Number(delayMs) || 0, 4000 - elapsed, 0);
    window.clearTimeout(lessonReplayCodeViewportTimerRef.current);
    lessonReplayCodeViewportTimerRef.current = window.setTimeout(
      flushLessonReplayCodeViewport,
      waitMs
    );
  }, [flushLessonReplayCodeViewport]);
  useEffect(() => () => flushLessonReplayCodeViewport(), [flushLessonReplayCodeViewport]);
  const setCollabBoardMemorySnapshotRenderer = useCallback((renderer) => {
    collabBoardSnapshotRendererRef.current = typeof renderer === 'function' ? renderer : null;
  }, []);
  const selectedStudent = useMemo(
    () => (students || []).find((student) => student.id === activeStudentId),
    [students, activeStudentId]
  );
  const runTaskNumbers = useMemo(() => {
    const normalizedTask = normalizeTaskNumber(runTaskNumber);
    if (!Number.isFinite(normalizedTask)) return [];
    if (normalizedTask === GAME_THEORY_TASK) return [19, 20, 21];
    return [normalizedTask];
  }, [runTaskNumber]);
  const activeTaskFiles = runTaskCategory === COLLAB_TASK_FILE_CATEGORY_TESTING
    ? testingTaskFiles
    : taskFiles;
  const activeTaskFilesLoading = runTaskCategory === COLLAB_TASK_FILE_CATEGORY_TESTING
    ? testingTaskFilesLoading
    : taskFilesLoading;
  const activeTaskFilesLoaded = runTaskCategory === COLLAB_TASK_FILE_CATEGORY_TESTING
    ? testingTaskFilesLoaded
    : taskFilesLoaded;
  const activeTaskFilesError = runTaskCategory === COLLAB_TASK_FILE_CATEGORY_TESTING
    ? testingTaskFilesError
    : taskFilesError;
  const filteredTaskFiles = useMemo(() => {
    if (!runTaskCategory || !runTaskNumbers.length) return [];
    return (Array.isArray(activeTaskFiles) ? activeTaskFiles : [])
      .filter((file) => {
        const taskNumber = Number(file?.taskNumber);
        return runTaskNumbers.includes(taskNumber) && file?.category === runTaskCategory;
      })
      .sort((a, b) => {
        const levelDiff = String(a?.levelLabel || '').localeCompare(String(b?.levelLabel || ''), 'ru');
        if (levelDiff !== 0) return levelDiff;
        const questionDiff = (Number(a?.questionNumber) || 0) - (Number(b?.questionNumber) || 0);
        if (questionDiff !== 0) return questionDiff;
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'ru');
      });
  }, [activeTaskFiles, runTaskCategory, runTaskNumbers]);
  const normalizedTaskFilesSearch = useMemo(
    () => String(taskFilesSearch || '').trim().toLowerCase(),
    [taskFilesSearch]
  );
  const visibleTaskFiles = useMemo(() => {
    if (!normalizedTaskFilesSearch) return filteredTaskFiles;
    return filteredTaskFiles.filter((file) => {
      const haystack = [
        file?.name,
        file?.folderName,
        file?.originalName,
        file?.levelLabel,
        file?.questionLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedTaskFilesSearch);
    });
  }, [filteredTaskFiles, normalizedTaskFilesSearch]);
  const selectedTaskFiles = useMemo(() => {
    if (!selectedTaskFileIds.length) return [];
    const selectedSet = new Set(selectedTaskFileIds);
    return filteredTaskFiles.filter((file) => selectedSet.has(file.id));
  }, [filteredTaskFiles, selectedTaskFileIds]);
  const allVisibleTaskFilesSelected = useMemo(() => {
    if (!visibleTaskFiles.length) return false;
    const selectedSet = new Set(selectedTaskFileIds);
    return visibleTaskFiles.every((file) => selectedSet.has(file?.id));
  }, [visibleTaskFiles, selectedTaskFileIds]);
  const notesPdfFiles = useMemo(() => {
    const files = Array.isArray(taskFiles) ? taskFiles : [];
    return files
      .filter((file) => String(file?.name || '').toLowerCase().endsWith('.pdf'))
      .sort((a, b) => {
        const aTask = Number(a?.taskNumber);
        const bTask = Number(b?.taskNumber);
        if (Number.isFinite(aTask) && Number.isFinite(bTask) && aTask !== bTask) return aTask - bTask;
        if (Number.isFinite(aTask) && !Number.isFinite(bTask)) return -1;
        if (!Number.isFinite(aTask) && Number.isFinite(bTask)) return 1;
        const categoryWeight = (value) => (value === 'class' ? 0 : (value === 'home' ? 1 : 2));
        const categoryDiff = categoryWeight(a?.category) - categoryWeight(b?.category);
        if (categoryDiff !== 0) return categoryDiff;
        const folderDiff = String(a?.folderName || '').localeCompare(String(b?.folderName || ''), 'ru');
        if (folderDiff !== 0) return folderDiff;
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'ru');
      });
  }, [taskFiles]);
  const getNotesPdfFolderKey = useCallback((file) => {
    const taskNumber = Number(file?.taskNumber);
    const taskPart = Number.isFinite(taskNumber) ? String(taskNumber) : '';
    const categoryPart = String(file?.category || '');
    const folderIdPart = String(file?.folderId || '');
    const folderNamePart = String(file?.folderName || '');
    return `${taskPart}::${categoryPart}::${folderIdPart}::${folderNamePart}`;
  }, []);
  const notesPdfFolders = useMemo(() => {
    const unique = new Map();
    notesPdfFiles.forEach((file) => {
      const key = getNotesPdfFolderKey(file);
      if (unique.has(key)) return;
      const taskLabel = Number.isFinite(Number(file?.taskNumber))
        ? `№${formatTaskNumber(file.taskNumber) || file.taskNumber}`
        : 'Без задания';
      const categoryLabel = file?.category === 'class'
        ? 'урок'
        : (file?.category === 'home' ? 'домашка' : 'файл');
      const folderLabel = String(file?.folderName || '').trim() || 'Без папки';
      unique.set(key, {
        key,
        label: `${taskLabel} • ${categoryLabel} • ${folderLabel}`,
      });
    });
    return Array.from(unique.values());
  }, [notesPdfFiles, getNotesPdfFolderKey]);
  const selectedNotesPdfFolderKey = useMemo(() => {
    if (!notesPdfFolders.length) return '';
    return notesPdfFolders.some((folder) => folder.key === notesPdfFolderKey)
      ? notesPdfFolderKey
      : notesPdfFolders[0].key;
  }, [notesPdfFolders, notesPdfFolderKey]);
  const notesPdfFilesInSelectedFolder = useMemo(() => {
    if (!selectedNotesPdfFolderKey) return [];
    return notesPdfFiles.filter((file) => getNotesPdfFolderKey(file) === selectedNotesPdfFolderKey);
  }, [notesPdfFiles, selectedNotesPdfFolderKey, getNotesPdfFolderKey]);
  const getTaskFileUrl = useCallback(
    (file) => withStudentId(file?.url, effectiveStudentId),
    [withStudentId, effectiveStudentId]
  );
  const selectedNotesPdfFile = useMemo(
    () => notesPdfFilesInSelectedFolder.find((file) => file.id === notesPdfFileId) || null,
    [notesPdfFilesInSelectedFolder, notesPdfFileId]
  );
  const selectedNotesPdfUrl = selectedNotesPdfFile ? getTaskFileUrl(selectedNotesPdfFile) : '';
  const selectedNotesPdfEmbedUrl = useMemo(() => {
    if (!selectedNotesPdfUrl) return '';
    const joiner = selectedNotesPdfUrl.includes('#') ? '&' : '#';
    return `${selectedNotesPdfUrl}${joiner}toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
  }, [selectedNotesPdfUrl]);
  const canOpenSelectedNotesPdf = Boolean(selectedNotesPdfUrl) && notesPdfPreviewState.status === 'ready';
  const editorOptions = useMemo(() => ({
    minimap: { enabled: false },
    ...getCollabEditorMetricOptions(editorFontSize),
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'off',
    scrollbar: {
      verticalScrollbarSize: isCollabFullscreen ? 7 : 8,
      horizontalScrollbarSize: 6,
    },
    mouseWheelZoom: false,
    quickSuggestions: { other: true, comments: false, strings: true },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    snippetSuggestions: 'inline',
    tabCompletion: 'on',
    suggest: { preview: true, showSnippets: true },
    inlineSuggest: { enabled: true },
    inlayHints: { enabled: 'on' },
    glyphMargin: false,
    lineNumbersMinChars: 2,
    lineDecorationsWidth: 6,
    readOnly: !roomId,
  }), [roomId, editorFontSize, isCollabFullscreen]);
  const isDesktopCollabCompact = !isMobileViewport && !isCollabFullscreen;
  const compactCollabHeight = '100%';
  const editorHeight = isCollabFullscreen
    ? (isMobileViewport ? '60vh' : '82vh')
    : (isMobileViewport ? '50vh' : (isDesktopCollabCompact ? '100%' : '65vh'));
  const notesPdfMinHeight = isMobileViewport ? 90 : 120;
  const compactNotesPdfMaxHeight = typeof window !== 'undefined'
    ? Math.max(360, Math.min(620, window.innerHeight - 260))
    : 500;
  const notesPdfMaxHeight = isCollabFullscreen
    ? (isMobileViewport ? 520 : 760)
    : (isDesktopCollabCompact ? compactNotesPdfMaxHeight : 560);
  const clampNotesPdfHeight = useCallback(
    (value) => Math.max(notesPdfMinHeight, Math.min(notesPdfMaxHeight, Math.round(value))),
    [notesPdfMinHeight, notesPdfMaxHeight]
  );
  const preferredBoardTopPaneHeight = useMemo(
    () => clampNotesPdfHeight(isMobileViewport ? 220 : (isCollabFullscreen ? 360 : (isDesktopCollabCompact ? 220 : 300))),
    [clampNotesPdfHeight, isMobileViewport, isCollabFullscreen, isDesktopCollabCompact]
  );
  const isNotesBoardMode = notesPanelMode === COLLAB_TOP_PANE_MODE_BOARD;
  const useBoardGlassCodePanel = notesPdfPanelOpen && isNotesBoardMode;
  const canResizeTopPane = notesPdfPanelOpen && (isNotesBoardMode || Boolean(selectedNotesPdfFile));
  const isFullscreenDark = isCollabFullscreen && isDarkTheme;
  const isFullscreenLight = isCollabFullscreen && !isDarkTheme;
  const collabShellClass = isCollabFullscreen
    ? (isFullscreenDark
      ? 'collab-workspace-shell animate-fadeIn relative isolate flex h-screen h-[100dvh] w-screen w-[100dvw] flex-col overflow-hidden bg-[radial-gradient(circle_at_0%_0%,_rgba(56,189,248,0.26),_transparent_36%),radial-gradient(circle_at_100%_0%,_rgba(168,85,247,0.28),_transparent_40%),radial-gradient(circle_at_52%_120%,_rgba(14,116,144,0.28),_transparent_46%),linear-gradient(180deg,_rgba(2,6,23,1)_0%,_rgba(9,13,28,1)_48%,_rgba(2,6,23,1)_100%)] text-slate-100 p-0 sm:p-0.5 md:p-1'
      : 'collab-workspace-shell animate-fadeIn relative isolate flex h-screen h-[100dvh] w-screen w-[100dvw] flex-col overflow-hidden bg-[radial-gradient(circle_at_0%_0%,_rgba(56,189,248,0.16),_transparent_36%),radial-gradient(circle_at_100%_0%,_rgba(147,51,234,0.16),_transparent_40%),radial-gradient(circle_at_56%_115%,_rgba(56,189,248,0.14),_transparent_46%),linear-gradient(180deg,_rgba(248,250,252,1)_0%,_rgba(237,242,255,0.96)_50%,_rgba(248,250,252,1)_100%)] text-slate-900 p-0 sm:p-0.5 md:p-1')
    : (isDesktopCollabCompact
      ? 'collab-workspace-shell animate-fadeIn h-full md:flex md:min-h-0 md:flex-col md:overflow-hidden'
      : 'collab-workspace-shell animate-fadeIn pb-10');
  const collabShellStyle = isDesktopCollabCompact
    ? { height: compactCollabHeight, maxHeight: compactCollabHeight }
    : undefined;
  const collabCardBaseClass = isCollabFullscreen
    ? `collab-workspace-card relative z-[1] flex min-h-0 flex-1 flex-col ${isMobileViewport ? 'overflow-visible' : 'overflow-hidden'} border ring-1 ${
      isFullscreenDark
        ? 'border-slate-700/75 ring-cyan-300/10 bg-slate-950/54 shadow-[0_30px_72px_rgba(2,6,23,0.62)]'
        : 'border-slate-200/90 ring-violet-200/80 bg-white/82 shadow-[0_30px_72px_rgba(15,23,42,0.14)]'
    } p-0.5 sm:p-1 md:p-1 backdrop-blur-xl`
    : (isDesktopCollabCompact
      ? 'collab-workspace-card p-1 md:p-1.5 flex min-h-0 flex-1 flex-col overflow-hidden'
      : 'collab-workspace-card p-4 md:p-6');
  const collabCardClass = `${collabCardBaseClass}${useBoardGlassCodePanel ? ' collab-workspace-card--glass-board' : ''}`;
  const normalizedBoardCodeSplitWidth = normalizeCollabBoardCodeSplit(boardCodeSplitWidth);
  const collabCardStyle = useBoardGlassCodePanel
    ? {
      '--collab-board-pane-height': `${notesPdfPanelHeight}px`,
      '--collab-board-pane-width': `${normalizedBoardCodeSplitWidth}%`,
    }
    : undefined;
  const collabTitleClass = isCollabFullscreen ? (isFullscreenDark ? 'text-slate-50' : 'text-slate-900') : 'text-gray-900';
  const collabSubtitleClass = isCollabFullscreen ? (isFullscreenDark ? 'text-slate-300/90' : 'text-slate-600') : 'text-gray-500';
  const collabLabelClass = isCollabFullscreen ? (isFullscreenDark ? 'text-cyan-300' : 'text-violet-600') : 'text-purple-600';
  const collabSessionTextClass = isCollabFullscreen ? (isFullscreenDark ? 'text-slate-100' : 'text-slate-800') : 'text-gray-800';
  const collabHintClass = isCollabFullscreen ? (isFullscreenDark ? 'text-slate-400/90' : 'text-slate-500') : 'text-gray-400';
  const collabToolbarClass = 'collab-code-toolbar--board-style';
  const collabToolbarDividerClass = 'collab-code-toolbar__divider';
  const collabSessionValueClass = isCollabFullscreen ? (isFullscreenDark ? 'text-slate-50' : 'text-slate-800') : collabSessionTextClass;
  const collabIconButtonBase = 'collab-code-icon-button';
  const collabIconButtonDisabled = 'is-disabled';
  const collabIconButtonNeutral = 'is-neutral';
  const collabIconButtonPrimary = 'is-primary';
  const collabIconButtonAccent = 'is-accent';
  const collabIconButtonDanger = 'is-danger';
  const canClearRunState = Boolean(
    runOutput
    || runError
    || runStatus !== 'idle'
    || lastRunInput
    || debugActive
    || collabTurtleScene?.used
  );
  const isBoardCodeAuxOpen = Boolean(useBoardGlassCodePanel && (taskFilesPanelOpen || stdinPanelOpen));

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
        linesDecorationsClassName: 'collab-debug-breakpoint-glyph',
        hoverMessage: [{ value: `Точка останова: строка ${line}` }],
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
        linesDecorationsClassName: 'collab-debug-active-glyph',
        hoverMessage: [{ value: `Текущая строка: ${safeLine}` }],
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

  const scheduleCollabEditorCursor = useCallback((nextCursor, immediate = false) => {
    if (!COLLAB_EDITOR_CURSOR_ENABLED) return;
    const awareness = collabAwarenessRef.current;
    if (!awareness) return;
    const lineNumber = Number(nextCursor?.lineNumber);
    const column = Number(nextCursor?.column);
    const hasPosition = Number.isInteger(lineNumber) && lineNumber > 0
      && Number.isInteger(column) && column > 0;
    const cursorX = Number(nextCursor?.x);
    const cursorY = Number(nextCursor?.y);
    const hasViewportPosition = Number.isFinite(cursorX) && Number.isFinite(cursorY);
    const selection = normalizeCollabEditorSelection(nextCursor?.selection);
    const normalizedCursor = nextCursor
      && (hasViewportPosition || hasPosition)
      ? {
        x: hasViewportPosition ? Math.max(0, Math.min(1, cursorX)) : 0.5,
        y: hasViewportPosition ? Math.max(0, Math.min(1, cursorY)) : 0.5,
        ts: Number.isFinite(Number(nextCursor?.ts)) ? Number(nextCursor.ts) : Date.now(),
        ...(nextCursor?.typing ? {
          typing: true,
          typingTs: Number.isFinite(Number(nextCursor?.typingTs))
            ? Number(nextCursor.typingTs)
            : Date.now(),
        } : {}),
        ...(hasPosition ? { lineNumber, column } : {}),
        ...(selection ? { selection } : {}),
      }
      : null;
    if (immediate) {
      if (collabCursorSyncTimerRef.current) {
        clearTimeout(collabCursorSyncTimerRef.current);
        collabCursorSyncTimerRef.current = null;
      }
      collabCursorPendingRef.current = null;
      collabCursorLastSyncAtRef.current = Date.now();
      awareness.setLocalStateField('editorCursor', normalizedCursor);
      awareness.setLocalStateField('selection', normalizedCursor?.selection || null);
      return;
    }
    collabCursorPendingRef.current = normalizedCursor;
    if (collabCursorSyncTimerRef.current) return;
    const now = Date.now();
    const elapsed = now - collabCursorLastSyncAtRef.current;
    const waitMs = Math.max(0, COLLAB_EDITOR_CURSOR_SYNC_MS - elapsed);
    collabCursorSyncTimerRef.current = setTimeout(() => {
      collabCursorSyncTimerRef.current = null;
      const liveAwareness = collabAwarenessRef.current;
      if (!liveAwareness) return;
      const cursorPayload = collabCursorPendingRef.current;
      collabCursorPendingRef.current = null;
      collabCursorLastSyncAtRef.current = Date.now();
      liveAwareness.setLocalStateField('editorCursor', cursorPayload || null);
      liveAwareness.setLocalStateField('selection', cursorPayload?.selection || null);
    }, waitMs);
  }, []);

  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.updateOptions?.(getCollabEditorMetricOptions(editorFontSize));
    scheduleCollabEditorMetricRefresh(editor, monaco);
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
    const publishCursorFromClientPoint = (clientX, clientY) => {
      if (!COLLAB_EDITOR_CURSOR_ENABLED) return false;
      if (!collabAwarenessRef.current) return false;
      const nextClientX = Number(clientX);
      const nextClientY = Number(clientY);
      if (!Number.isFinite(nextClientX) || !Number.isFinite(nextClientY)) return false;
      const node = editor.getDomNode?.();
      const rect = node?.getBoundingClientRect?.();
      if (!rect || !rect.width || !rect.height) return false;
      const layout = editor.getLayoutInfo?.() || null;
      const contentLeft = Number(layout?.contentLeft) || 0;
      const contentWidth = Number(layout?.contentWidth) || Math.max(1, rect.width - contentLeft);
      if (!contentWidth) return false;
      const x = (nextClientX - rect.left - contentLeft) / contentWidth;
      const y = (nextClientY - rect.top) / rect.height;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const resolvedTarget = editor.getTargetAtClientPoint?.(nextClientX, nextClientY);
      const targetType = Number(resolvedTarget?.type);
      const mouseTargetType = monaco?.editor?.MouseTargetType || null;
      const isContentTarget = mouseTargetType
        ? (
          targetType === mouseTargetType.CONTENT_TEXT
          || targetType === mouseTargetType.CONTENT_EMPTY
          || targetType === mouseTargetType.CONTENT_VIEW_ZONE
        )
        : true;
      const targetPosition = isContentTarget ? resolvedTarget?.position : null;
      scheduleCollabEditorCursor({
        x,
        y,
        ts: Date.now(),
        lineNumber: Number(targetPosition?.lineNumber),
        column: Number(targetPosition?.column),
        selection: editor.getSelection?.(),
      });
      return true;
    };
    const publishCursorFromEditorPosition = (immediate = false, options = {}) => {
      if (!COLLAB_EDITOR_CURSOR_ENABLED) return false;
      if (!collabAwarenessRef.current) return false;
      if (typeof editor.hasTextFocus === 'function' && !editor.hasTextFocus()) return false;
      const position = editor.getPosition?.();
      const lineNumber = Number(position?.lineNumber);
      const column = Number(position?.column);
      if (!Number.isInteger(lineNumber) || lineNumber <= 0 || !Number.isInteger(column) || column <= 0) {
        return false;
      }
      const node = editor.getDomNode?.();
      const rect = node?.getBoundingClientRect?.();
      const layout = editor.getLayoutInfo?.() || null;
      const width = Number(layout?.width) || Number(rect?.width) || 0;
      const height = Number(layout?.height) || Number(rect?.height) || 0;
      const contentLeft = Number(layout?.contentLeft) || 0;
      const contentWidth = Number(layout?.contentWidth) || Math.max(1, width - contentLeft);
      const scrollTop = Number(editor.getScrollTop?.()) || 0;
      const scrollLeft = Number(editor.getScrollLeft?.()) || 0;
      const lineTop = Number(editor.getTopForLineNumber?.(lineNumber));
      const columnLeft = Number(editor.getOffsetForColumn?.(lineNumber, column));
      const hasGeometry = width > 0 && height > 0 && contentWidth > 0
        && Number.isFinite(lineTop)
        && Number.isFinite(columnLeft);
      scheduleCollabEditorCursor({
        x: hasGeometry ? ((columnLeft - scrollLeft) / contentWidth) : 0.5,
        y: hasGeometry ? ((lineTop - scrollTop) / height) : 0.5,
        ts: Date.now(),
        ...(options?.typing ? { typing: true, typingTs: Date.now() } : {}),
        lineNumber,
        column,
        selection: editor.getSelection?.(),
      }, immediate);
      return true;
    };
    collabCursorWindowStopRef.current?.();
    collabCursorWindowStopRef.current = null;
    collabCursorMoveDisposableRef.current?.dispose?.();
    collabCursorMoveDisposableRef.current = editor.onMouseMove((event) => {
      const browserEvent = event?.event?.browserEvent;
      if (!browserEvent) return;
      publishCursorFromClientPoint(browserEvent.clientX, browserEvent.clientY);
    });
    collabCursorDragMouseDownDisposableRef.current?.dispose?.();
    collabCursorDragMouseDownDisposableRef.current = editor.onMouseDown((event) => {
      const browserEvent = event?.event?.browserEvent;
      if (!browserEvent) return;
      publishCursorFromClientPoint(browserEvent.clientX, browserEvent.clientY);
      if (event?.event?.leftButton !== true) return;
      if (typeof window === 'undefined') return;
      const handleWindowMouseMove = (moveEvent) => {
        publishCursorFromClientPoint(moveEvent?.clientX, moveEvent?.clientY);
      };
      const stopWindowCursorTracking = () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', stopWindowCursorTracking);
        window.removeEventListener('blur', stopWindowCursorTracking);
        if (collabCursorWindowStopRef.current === stopWindowCursorTracking) {
          collabCursorWindowStopRef.current = null;
        }
      };
      collabCursorWindowStopRef.current?.();
      collabCursorWindowStopRef.current = stopWindowCursorTracking;
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', stopWindowCursorTracking);
      window.addEventListener('blur', stopWindowCursorTracking);
    });
    collabCursorLeaveDisposableRef.current?.dispose?.();
    collabCursorLeaveDisposableRef.current = null;
    collabCursorBlurDisposableRef.current?.dispose?.();
    collabCursorBlurDisposableRef.current = editor.onDidBlurEditorWidget(() => {
      collabCursorWindowStopRef.current?.();
    });
    collabCursorPositionDisposableRef.current?.dispose?.();
    collabCursorPositionDisposableRef.current = editor.onDidChangeCursorPosition(() => {
      publishCursorFromEditorPosition(true);
      scheduleLessonReplayCodeViewport(editor);
    });
    collabCursorSelectionDisposableRef.current?.dispose?.();
    collabCursorSelectionDisposableRef.current = editor.onDidChangeCursorSelection(() => {
      publishCursorFromEditorPosition(true);
      setEditorViewportVersion((prev) => prev + 1);
    });
    collabCursorTypeDisposableRef.current?.dispose?.();
    collabCursorTypeDisposableRef.current = typeof editor.onDidType === 'function'
      ? editor.onDidType(() => {
        publishCursorFromEditorPosition(true, { typing: true });
      })
      : null;
    collabCursorContentDisposableRef.current?.dispose?.();
    collabCursorContentDisposableRef.current = editor.onDidChangeModelContent(() => {
      setEditorViewportVersion((prev) => prev + 1);
      publishCursorFromEditorPosition(true);
    });
    collabCursorLayoutDisposableRef.current?.dispose?.();
    collabCursorLayoutDisposableRef.current = editor.onDidLayoutChange(() => {
      setEditorViewportVersion((prev) => prev + 1);
      scheduleLessonReplayCodeViewport(editor);
    });
    collabCursorScrollDisposableRef.current?.dispose?.();
    collabCursorScrollDisposableRef.current = editor.onDidScrollChange(() => {
      setEditorViewportVersion((prev) => prev + 1);
      scheduleLessonReplayCodeViewport(editor);
    });
    if (monaco?.KeyCode && typeof editor.addCommand === 'function') {
      const runAllFromEditor = () => {
        void handleRunCodeRef.current?.('all');
      };
      editor.addCommand(monaco.KeyCode.F5, runAllFromEditor);
      if (monaco.KeyMod?.CtrlCmd && monaco.KeyCode.Enter) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runAllFromEditor);
      }
    }
    setEditorReady(true);
    setEditorMountVersion((prev) => prev + 1);
    scheduleLessonReplayCodeViewport(editor, 250);
  }, [
    applyDebugGlyphScale,
    editorFontSize,
    scheduleCollabEditorCursor,
    scheduleLessonReplayCodeViewport,
  ]);

  useEffect(() => () => {
    collabSnippetProviderRef.current?.dispose?.();
    collabSnippetProviderRef.current = null;
    debugGutterDisposableRef.current?.dispose?.();
    debugGutterDisposableRef.current = null;
    debugInlayProviderRef.current?.dispose?.();
    debugInlayProviderRef.current = null;
    collabCursorMoveDisposableRef.current?.dispose?.();
    collabCursorMoveDisposableRef.current = null;
    collabCursorDragMouseDownDisposableRef.current?.dispose?.();
    collabCursorDragMouseDownDisposableRef.current = null;
    collabCursorLeaveDisposableRef.current?.dispose?.();
    collabCursorLeaveDisposableRef.current = null;
    collabCursorBlurDisposableRef.current?.dispose?.();
    collabCursorBlurDisposableRef.current = null;
    collabCursorPositionDisposableRef.current?.dispose?.();
    collabCursorPositionDisposableRef.current = null;
    collabCursorSelectionDisposableRef.current?.dispose?.();
    collabCursorSelectionDisposableRef.current = null;
    collabCursorContentDisposableRef.current?.dispose?.();
    collabCursorContentDisposableRef.current = null;
    collabCursorTypeDisposableRef.current?.dispose?.();
    collabCursorTypeDisposableRef.current = null;
    collabCursorLayoutDisposableRef.current?.dispose?.();
    collabCursorLayoutDisposableRef.current = null;
    collabCursorScrollDisposableRef.current?.dispose?.();
    collabCursorScrollDisposableRef.current = null;
    collabCursorWindowStopRef.current?.();
    collabCursorWindowStopRef.current = null;
    if (collabCursorClearTimerRef.current) {
      clearTimeout(collabCursorClearTimerRef.current);
      collabCursorClearTimerRef.current = null;
    }
    if (collabCursorSyncTimerRef.current) {
      clearTimeout(collabCursorSyncTimerRef.current);
      collabCursorSyncTimerRef.current = null;
    }
    collabCursorPendingRef.current = null;
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
    if (!taskOptions.length) {
      setRunTaskNumber('');
      return;
    }
    const valid = taskOptions.some((task) => String(task?.number ?? '') === String(runTaskNumber ?? ''));
    if (!valid) {
      setRunTaskNumber(String(taskOptions[0]?.number || ''));
    }
  }, [taskOptions, runTaskNumber]);

  useEffect(() => {
    let cancelled = false;
    setTestingTaskFilesLoading(true);
    setTestingTaskFilesLoaded(false);
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestingTaskFiles(buildTestingRuntimeFiles(data));
        setTestingTaskFilesError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestingTaskFiles([]);
        setTestingTaskFilesError(err?.message || 'Не удалось загрузить файлы из тестирований.');
      })
      .finally(() => {
        if (!cancelled) {
          setTestingTaskFilesLoading(false);
          setTestingTaskFilesLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!effectiveStudentId) {
      setTaskFiles([]);
      setTaskFilesError('');
      setTaskFilesLoading(false);
      setTaskFilesLoaded(false);
      setSelectedTaskFileIds([]);
      return;
    }
    let cancelled = false;
    setTaskFilesLoading(true);
    setTaskFilesLoaded(false);
    api.getFiles(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setTaskFiles(Array.isArray(data) ? data : []);
        setTaskFilesError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTaskFiles([]);
        setTaskFilesError(err?.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0444\u0430\u0439\u043b\u044b \u0437\u0430\u0434\u0430\u043d\u0438\u044f.');
      })
      .finally(() => {
        if (!cancelled) {
          setTaskFilesLoading(false);
          setTaskFilesLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    if (!activeTaskFilesLoaded) return;
    const availableIds = new Set(filteredTaskFiles.map((file) => file.id));
    setSelectedTaskFileIds((prev) => {
      const next = prev.filter((id) => availableIds.has(id));
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [activeTaskFilesLoaded, filteredTaskFiles]);

  useEffect(() => {
    if (!notesPdfFolders.length) {
      setNotesPdfFolderKey('');
      return;
    }
    setNotesPdfFolderKey((prev) => {
      if (prev && notesPdfFolders.some((folder) => folder.key === prev)) return prev;
      return notesPdfFolders[0].key;
    });
  }, [notesPdfFolders]);

  useEffect(() => {
    if (!notesPdfFilesInSelectedFolder.length) {
      setNotesPdfFileId('');
      return;
    }
    setNotesPdfFileId((prev) => {
      if (prev && notesPdfFilesInSelectedFolder.some((file) => file.id === prev)) return prev;
      return notesPdfFilesInSelectedFolder[0].id;
    });
  }, [notesPdfFilesInSelectedFolder]);

  useEffect(() => {
    if (!notesPdfPanelOpen || isNotesBoardMode) {
      setNotesPdfPreviewState({ status: 'idle', message: '' });
      return undefined;
    }
    if (!selectedNotesPdfUrl || !selectedNotesPdfFile) {
      setNotesPdfPreviewState({ status: 'idle', message: '' });
      return undefined;
    }

    let cancelled = false;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    setNotesPdfPreviewState({ status: 'checking', message: '' });

    fetch(selectedNotesPdfUrl, {
      method: 'HEAD',
      credentials: 'include',
      cache: 'no-store',
      signal: controller?.signal,
    })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          const fileName = selectedNotesPdfFile?.name || 'PDF';
          const message = await extractResponseErrorMessage(
            response,
            `Не удалось открыть ${fileName}.`
          );
          setNotesPdfPreviewState({ status: 'error', message });
          return;
        }
        setNotesPdfPreviewState({ status: 'ready', message: '' });
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return;
        setNotesPdfPreviewState({
          status: 'error',
          message: error?.message || 'Не удалось открыть PDF.',
        });
      });

    return () => {
      cancelled = true;
      controller?.abort?.();
    };
  }, [notesPdfPanelOpen, isNotesBoardMode, selectedNotesPdfUrl, selectedNotesPdfFile]);

  useEffect(() => {
    setNotesPdfPanelHeight((prev) => clampNotesPdfHeight(prev));
  }, [clampNotesPdfHeight]);

  useEffect(() => {
    if (!notesPdfPanelOpen || !isNotesBoardMode) return;
    setNotesPdfPanelHeight((prev) => Math.max(prev, preferredBoardTopPaneHeight));
  }, [notesPdfPanelOpen, isNotesBoardMode, preferredBoardTopPaneHeight]);

  useEffect(() => {
    notesPdfPanelHeightRef.current = notesPdfPanelHeight;
    notesPdfDragHeightRef.current = notesPdfPanelHeight;
    if (notesPdfPreviewRef.current) {
      notesPdfPreviewRef.current.style.height = `${notesPdfPanelHeight}px`;
    }
  }, [notesPdfPanelHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const forcedFontSize = clampCollabEditorFontSize(COLLAB_EDITOR_FONT_SIZE_DEFAULT);
    const migrationKey = `${fontSizeStorageKey}-default18-v1`;
    const alreadyForced = window.localStorage.getItem(migrationKey) === '1';
    if (!alreadyForced) {
      setEditorFontSize(forcedFontSize);
      window.localStorage.setItem(fontSizeStorageKey, String(forcedFontSize));
      window.localStorage.setItem(migrationKey, '1');
      return;
    }
    const raw = window.localStorage.getItem(fontSizeStorageKey);
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setEditorFontSize(clampCollabEditorFontSize(parsed));
    } else {
      setEditorFontSize(forcedFontSize);
    }
  }, [fontSizeStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(fontSizeStorageKey, String(editorFontSize));
  }, [editorFontSize, fontSizeStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(boardCodeSplitStorageKey);
    if (raw == null || String(raw).trim() === '') {
      boardCodeSplitLoadedValueRef.current = null;
      boardCodeSplitWidthRef.current = COLLAB_BOARD_CODE_SPLIT_DEFAULT;
      setBoardCodeSplitWidth(COLLAB_BOARD_CODE_SPLIT_DEFAULT);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      boardCodeSplitLoadedValueRef.current = null;
      return;
    }
    const normalized = normalizeCollabBoardCodeSplit(parsed);
    boardCodeSplitLoadedValueRef.current = normalized;
    boardCodeSplitWidthRef.current = normalized;
    setBoardCodeSplitWidth(normalized);
  }, [boardCodeSplitStorageKey]);

  useEffect(() => {
    const normalized = normalizeCollabBoardCodeSplit(boardCodeSplitWidth);
    boardCodeSplitWidthRef.current = normalized;
    if (typeof window === 'undefined') return;
    const loadedValue = boardCodeSplitLoadedValueRef.current;
    if (loadedValue != null && normalized !== loadedValue) return;
    boardCodeSplitLoadedValueRef.current = null;
    window.localStorage.setItem(boardCodeSplitStorageKey, String(normalized));
  }, [boardCodeSplitStorageKey, boardCodeSplitWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(outputPanelHeightStorageKey);
    setOutputPanelHeight(normalizeCollabOutputPanelHeight(raw));
  }, [outputPanelHeightStorageKey]);

  useEffect(() => {
    const normalized = normalizeCollabOutputPanelHeight(outputPanelHeight);
    outputPanelHeightRef.current = normalized;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(outputPanelHeightStorageKey, String(normalized));
  }, [outputPanelHeight, outputPanelHeightStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(taskFilesListHeightStorageKey);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setTaskFilesListHeight(clampTaskFilesListHeight(parsed));
  }, [taskFilesListHeightStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(taskFilesListHeightStorageKey, String(clampTaskFilesListHeight(taskFilesListHeight)));
  }, [taskFilesListHeight, taskFilesListHeightStorageKey]);

  useEffect(() => () => {
    boardCodeSplitDragCleanupRef.current?.();
  }, []);

  useEffect(() => () => {
    outputPanelResizeCleanupRef.current?.();
  }, []);

  useEffect(() => () => {
    notesPdfResizeCleanupRef.current?.();
  }, []);

  useEffect(() => {
    editorRef.current?.updateOptions?.(getCollabEditorMetricOptions(editorFontSize));
    scheduleCollabEditorMetricRefresh(editorRef.current, monacoRef.current);
    applyDebugGlyphScale();
  }, [editorFontSize, applyDebugGlyphScale]);

  useEffect(() => {
    runInputRef.current = runInput;
  }, [runInput]);

  useEffect(() => {
    testFileTextRef.current = testFileText;
  }, [testFileText]);

  useEffect(() => {
    runOutputRef.current = runOutput;
  }, [runOutput]);

  const clearCollabOutputSelection = useCallback(() => {
    outputSelectionRef.current = null;
    collabAwarenessRef.current?.setLocalStateField?.('outputSelection', null);
  }, []);

  const cancelCollabOutputSelectionSync = useCallback(() => {
    if (outputSelectionSyncFrameRef.current == null || typeof window === 'undefined') return;
    window.cancelAnimationFrame(outputSelectionSyncFrameRef.current);
    outputSelectionSyncFrameRef.current = null;
  }, []);

  const publishCollabOutputSelection = useCallback((start, end) => {
    const normalized = normalizeCollabOutputSelection({
      start: Number(start),
      end: Number(end),
    }, String(runOutputRef.current || '').length);
    const previous = outputSelectionRef.current;
    const isSameRange = (previous == null && normalized == null)
      || (
        previous
        && normalized
        && previous.start === normalized.start
        && previous.end === normalized.end
      );
    if (isSameRange) return;
    outputSelectionRef.current = normalized
      ? { start: normalized.start, end: normalized.end }
      : null;
    collabAwarenessRef.current?.setLocalStateField?.('outputSelection', normalized ? {
      start: normalized.start,
      end: normalized.end,
      ts: Date.now(),
    } : null);
  }, []);

  const syncCollabOutputSelectionFromTextarea = useCallback(() => {
    const textarea = outputTextareaRef.current;
    if (!textarea) {
      clearCollabOutputSelection();
      return;
    }
    publishCollabOutputSelection(textarea.selectionStart, textarea.selectionEnd);
  }, [clearCollabOutputSelection, publishCollabOutputSelection]);

  const queueCollabOutputSelectionSync = useCallback(() => {
    if (typeof window === 'undefined') {
      syncCollabOutputSelectionFromTextarea();
      return;
    }
    if (outputSelectionSyncFrameRef.current != null) return;
    outputSelectionSyncFrameRef.current = window.requestAnimationFrame(() => {
      outputSelectionSyncFrameRef.current = null;
      syncCollabOutputSelectionFromTextarea();
    });
  }, [syncCollabOutputSelectionFromTextarea]);

  const stopCollabOutputSelectionTracking = useCallback(() => {
    outputSelectionTrackingStopRef.current?.();
    outputSelectionTrackingStopRef.current = null;
    cancelCollabOutputSelectionSync();
  }, [cancelCollabOutputSelectionSync]);

  const handleCollabOutputPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    queueCollabOutputSelectionSync();
    if (typeof window === 'undefined') return;
    const handlePointerMove = () => {
      queueCollabOutputSelectionSync();
    };
    const stopTracking = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopTracking);
      window.removeEventListener('pointercancel', stopTracking);
      window.removeEventListener('blur', stopTracking);
      queueCollabOutputSelectionSync();
      if (outputSelectionTrackingStopRef.current === stopTracking) {
        outputSelectionTrackingStopRef.current = null;
      }
    };
    stopCollabOutputSelectionTracking();
    outputSelectionTrackingStopRef.current = stopTracking;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopTracking);
    window.addEventListener('pointercancel', stopTracking);
    window.addEventListener('blur', stopTracking);
  }, [queueCollabOutputSelectionSync, stopCollabOutputSelectionTracking]);

  const clearCollabTestFileSelection = useCallback(() => {
    testFileSelectionRef.current = null;
    setLocalTestFileSelection(null);
    collabAwarenessRef.current?.setLocalStateField?.('testFileSelection', null);
  }, []);

  const cancelCollabTestFileSelectionSync = useCallback(() => {
    if (testFileSelectionSyncFrameRef.current == null || typeof window === 'undefined') return;
    window.cancelAnimationFrame(testFileSelectionSyncFrameRef.current);
    testFileSelectionSyncFrameRef.current = null;
  }, []);

  const syncCollabTestFileOverlayScroll = useCallback(() => {
    const textarea = testFileTextareaRef.current;
    const overlay = testFileHighlightOverlayRef.current;
    if (!textarea || !overlay) return;
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  }, []);

  const publishCollabTestFileSelection = useCallback((start, end) => {
    const normalized = normalizeCollabOutputSelection({
      start: Number(start),
      end: Number(end),
    }, String(testFileTextRef.current || '').length);
    const previous = testFileSelectionRef.current;
    const isSameRange = (previous == null && normalized == null)
      || (
        previous
        && normalized
        && previous.start === normalized.start
        && previous.end === normalized.end
      );
    if (isSameRange) return;
    testFileSelectionRef.current = normalized
      ? { start: normalized.start, end: normalized.end }
      : null;
    setLocalTestFileSelection(normalized ? { start: normalized.start, end: normalized.end } : null);
    collabAwarenessRef.current?.setLocalStateField?.('testFileSelection', normalized ? {
      start: normalized.start,
      end: normalized.end,
      ts: Date.now(),
    } : null);
  }, []);

  const syncCollabTestFileSelectionFromTextarea = useCallback(() => {
    const textarea = testFileTextareaRef.current;
    if (!textarea || collabAuxPanelModeRef.current !== COLLAB_AUX_PANEL_MODE_TEST_FILE) {
      clearCollabTestFileSelection();
      return;
    }
    syncCollabTestFileOverlayScroll();
    publishCollabTestFileSelection(textarea.selectionStart, textarea.selectionEnd);
  }, [clearCollabTestFileSelection, publishCollabTestFileSelection, syncCollabTestFileOverlayScroll]);

  const queueCollabTestFileSelectionSync = useCallback(() => {
    if (typeof window === 'undefined') {
      syncCollabTestFileSelectionFromTextarea();
      return;
    }
    if (testFileSelectionSyncFrameRef.current != null) return;
    testFileSelectionSyncFrameRef.current = window.requestAnimationFrame(() => {
      testFileSelectionSyncFrameRef.current = null;
      syncCollabTestFileSelectionFromTextarea();
    });
  }, [syncCollabTestFileSelectionFromTextarea]);

  const stopCollabTestFileSelectionTracking = useCallback(() => {
    testFileSelectionTrackingStopRef.current?.();
    testFileSelectionTrackingStopRef.current = null;
    cancelCollabTestFileSelectionSync();
  }, [cancelCollabTestFileSelectionSync]);

  const handleCollabTestFilePointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    queueCollabTestFileSelectionSync();
    if (typeof window === 'undefined') return;
    const handlePointerMove = () => {
      queueCollabTestFileSelectionSync();
    };
    const stopTracking = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopTracking);
      window.removeEventListener('pointercancel', stopTracking);
      window.removeEventListener('blur', stopTracking);
      queueCollabTestFileSelectionSync();
      if (testFileSelectionTrackingStopRef.current === stopTracking) {
        testFileSelectionTrackingStopRef.current = null;
      }
    };
    stopCollabTestFileSelectionTracking();
    testFileSelectionTrackingStopRef.current = stopTracking;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopTracking);
    window.addEventListener('pointercancel', stopTracking);
    window.addEventListener('blur', stopTracking);
  }, [queueCollabTestFileSelectionSync, stopCollabTestFileSelectionTracking]);

  const syncOutputTextareaHeight = useCallback(() => {
    const textarea = outputTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    syncOutputTextareaHeight();
  }, [runOutput, syncOutputTextareaHeight]);

  useEffect(() => {
    const target = outputViewportRef.current?.parentElement || outputViewportRef.current;
    if (!target || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      syncOutputTextareaHeight();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [runOutput, syncOutputTextareaHeight]);

  useEffect(() => {
    clearCollabOutputSelection();
  }, [runOutput, clearCollabOutputSelection]);

  useEffect(() => () => {
    stopCollabOutputSelectionTracking();
  }, [stopCollabOutputSelectionTracking]);

  useLayoutEffect(() => {
    if (collabAuxPanelMode !== COLLAB_AUX_PANEL_MODE_TEST_FILE) return;
    syncCollabTestFileOverlayScroll();
  }, [
    collabAuxPanelMode,
    testFileText,
    testFileTextareaHeight,
    remoteTestFileSelections.length,
    syncCollabTestFileOverlayScroll,
  ]);

  useEffect(() => {
    if (collabAuxPanelMode !== COLLAB_AUX_PANEL_MODE_TEST_FILE) {
      stopCollabTestFileSelectionTracking();
      clearCollabTestFileSelection();
      return;
    }
    queueCollabTestFileSelectionSync();
  }, [
    collabAuxPanelMode,
    testFileText,
    queueCollabTestFileSelectionSync,
    stopCollabTestFileSelectionTracking,
    clearCollabTestFileSelection,
  ]);

  useEffect(() => () => {
    stopCollabTestFileSelectionTracking();
  }, [stopCollabTestFileSelectionTracking]);

  useEffect(() => {
    runErrorRef.current = runError;
  }, [runError]);

  useEffect(() => {
    runStatusRef.current = runStatus;
  }, [runStatus]);

  useEffect(() => {
    runTimestampRef.current = runTimestamp;
  }, [runTimestamp]);

  useEffect(() => {
    collabAuxPanelModeRef.current = collabAuxPanelMode;
  }, [collabAuxPanelMode]);

  useEffect(() => {
    testFileTextareaHeightRef.current = testFileTextareaHeight;
  }, [testFileTextareaHeight]);

  useEffect(() => {
    taskFilesPanelOpenRef.current = taskFilesPanelOpen;
  }, [taskFilesPanelOpen]);

  useEffect(() => {
    runTaskNumberRef.current = runTaskNumber;
  }, [runTaskNumber]);

  useEffect(() => {
    runTaskCategoryRef.current = runTaskCategory;
  }, [runTaskCategory]);

  useEffect(() => {
    selectedTaskFileIdsRef.current = selectedTaskFileIds;
  }, [selectedTaskFileIds]);

  useEffect(() => {
    if (collabAuxPanelMode !== COLLAB_AUX_PANEL_MODE_TEST_FILE) return undefined;
    const textarea = testFileTextareaRef.current;
    if (!textarea) return undefined;
    const syncHeightFromDom = () => {
      const nextHeight = normalizeCollabTestFileHeight(textarea.offsetHeight);
      if (!nextHeight || testFileTextareaHeightRef.current === nextHeight) return;
      testFileTextareaHeightRef.current = nextHeight;
      setTestFileTextareaHeight(nextHeight);
    };
    syncHeightFromDom();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      syncHeightFromDom();
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [collabAuxPanelMode]);

  useEffect(() => {
    debugTraceRef.current = Array.isArray(debugTrace) ? debugTrace : [];
  }, [debugTrace]);

  useEffect(() => {
    setStdinPanelOpen(false);
  }, [roomId]);

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

  useEffect(() => {
    if (!roomId || !taskFilesSyncReadyRef.current) return;
    if (suppressAuxPanelModeSyncRef.current) {
      suppressAuxPanelModeSyncRef.current = false;
      return;
    }
    publishRunStateRef.current?.({
      auxPanelMode: normalizeCollabAuxPanelMode(collabAuxPanelMode),
    });
  }, [roomId, collabAuxPanelMode]);

  useEffect(() => {
    if (!roomId || !taskFilesSyncReadyRef.current) return;
    const normalizedHeight = normalizeCollabTestFileHeight(testFileTextareaHeight);
    if (!normalizedHeight) return;
    if (suppressTestFileHeightSyncRef.current) {
      suppressTestFileHeightSyncRef.current = false;
      return;
    }
    publishRunStateRef.current?.({
      testFileHeight: normalizedHeight,
    });
  }, [roomId, testFileTextareaHeight]);

  useEffect(() => {
    if (!roomId || !taskFilesSyncReadyRef.current) return;
    if (suppressTaskFilesSyncRef.current) {
      suppressTaskFilesSyncRef.current = false;
      return;
    }
    publishRunStateRef.current?.({
      taskFilesPanelOpen,
      taskFilesTaskNumber: runTaskNumber,
      taskFilesCategory: runTaskCategory,
      taskFilesSelectedIds: normalizeSharedTaskFileIds(selectedTaskFileIds),
    });
  }, [roomId, taskFilesPanelOpen, runTaskNumber, runTaskCategory, selectedTaskFileIds]);

  useEffect(() => () => {
    if (runStreamTimerRef.current) {
      clearTimeout(runStreamTimerRef.current);
      runStreamTimerRef.current = null;
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
    saveDraftSkipPersistRef.current = true;
    const draft = loadNotesSaveDraft(notesSaveDraftStorageKey, saveTaskNumbers);
    setSaveTaskNumber(draft.taskNumber);
    setSaveCategory(draft.category);
    setSaveFolderId(draft.folderId);
    setSaveFileName(draft.fileName);
    setSaveMode(draft.saveMode);
    setSaveError('');
    setSaveSuccess('');
    setSaveNameError(false);
  }, [notesSaveDraftStorageKey, saveTaskNumbers]);

  useEffect(() => {
    if (!notesSaveDraftStorageKey) return;
    if (saveDraftSkipPersistRef.current) {
      saveDraftSkipPersistRef.current = false;
      return;
    }
    saveNotesSaveDraft(notesSaveDraftStorageKey, {
      taskNumber: saveTaskNumber,
      category: saveCategory,
      folderId: saveFolderId,
      fileName: saveFileName,
      saveMode,
    }, saveTaskNumbers);
  }, [
    notesSaveDraftStorageKey,
    saveTaskNumber,
    saveCategory,
    saveFolderId,
    saveFileName,
    saveMode,
    saveTaskNumbers,
  ]);

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
    setSaveError('');
    setSaveSuccess('');
    setSaveNameError(false);
  }, [saveTaskNumber, saveCategory, effectiveStudentId]);

  useEffect(() => {
    if (!saveFolderId || foldersLoading || foldersError) return;
    const folderExists = folders.some((folder) => String(folder?.id || '') === String(saveFolderId));
    if (!folderExists) setSaveFolderId('');
  }, [folders, foldersError, foldersLoading, saveFolderId]);

  const handleSaveTaskNumberChange = (value) => {
    setSaveTaskNumber(value);
    setSaveFolderId('');
  };

  const handleSaveCategoryChange = (value) => {
    setSaveCategory(value);
    setSaveFolderId('');
  };

  const normalizeFileName = (value) => {
    const trimmed = String(value || '').replace(/\./g, '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/[\\/]+/g, '').replace(/\0/g, '');
  };

  const showCollabSaveNotice = useCallback((notice) => {
    const noticeId = String(notice?.id || '').trim();
    const noticePath = String(notice?.path || '').trim();
    if (!noticeId || !noticePath || collabSaveNoticeSeenRef.current === noticeId) return;
    collabSaveNoticeSeenRef.current = noticeId;
    if (collabSaveNoticeTimerRef.current) {
      clearTimeout(collabSaveNoticeTimerRef.current);
      collabSaveNoticeTimerRef.current = null;
    }
    setCollabSaveNotice({
      id: noticeId,
      path: noticePath,
      author: String(notice?.author || '').trim(),
      ts: Number.isFinite(Number(notice?.ts)) ? Number(notice.ts) : Date.now(),
    });
    collabSaveNoticeTimerRef.current = setTimeout(() => {
      collabSaveNoticeTimerRef.current = null;
      setCollabSaveNotice((current) => (current?.id === noticeId ? null : current));
    }, COLLAB_SAVE_NOTICE_VISIBLE_MS);
  }, []);

  useEffect(() => () => {
    if (collabSaveNoticeTimerRef.current) {
      clearTimeout(collabSaveNoticeTimerRef.current);
      collabSaveNoticeTimerRef.current = null;
    }
  }, []);

  const getSavedCodeNoticePath = (safeName) => {
    const selectedTask = taskOptions.find((task) => String(task?.number ?? task?.id) === String(saveTaskNumber));
    const taskLabel = selectedTask
      ? `Задание ${getTaskDisplayNumber(selectedTask)}`
      : `Задание ${formatTaskNumber(saveTaskNumber) || saveTaskNumber}`;
    const selectedFolder = folders.find((folder) => String(folder?.id || '') === String(saveFolderId || ''));
    const folderLabel = String(selectedFolder?.name || '').trim();
    return ['Конспекты', taskLabel, folderLabel, safeName]
      .filter(Boolean)
      .join(' / ');
  };

  const publishCollabCodeSaveNotice = (path) => {
    const noticePath = String(path || '').trim();
    if (!noticePath) return;
    const notice = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      path: noticePath,
      author: localName,
      ts: Date.now(),
    };
    const runMap = runMapRef.current;
    const doc = collabDocRef.current;
    if (!runMap || !doc) {
      showCollabSaveNotice(notice);
      return;
    }
    doc.transact(() => {
      runMap.set('saveNoticeId', notice.id);
      runMap.set('saveNoticePath', notice.path);
      runMap.set('saveNoticeAuthor', notice.author);
      runMap.set('saveNoticeTs', notice.ts);
    }, 'collab-code-save-notice');
  };

  const buildCollabCodeMemory = (title = '', source = 'collab-code', codeValue = '') => {
    const output = String(runOutputRef.current || '').trim();
    const error = String(runErrorRef.current || '').trim();
    const status = String(runStatusRef.current || '').trim();
    const memoryTitle = String(title || '').replace(/\.[^.]+$/i, '').replace(/^(конспект|шпаргалка)[-_\s]*/i, '').trim();
    const normalizedSource = String(source || '').trim() || 'collab-code';
    const isCheatsheet = normalizedSource === 'notes-cheatsheet';
    const codePreview = buildCodeMemoryPreview(codeValue);
    return {
      taskNumber: Number(saveTaskNumber),
      source: normalizedSource,
      kind: isCheatsheet ? 'cheatsheet' : 'code',
      title: memoryTitle,
      description: normalizedSource === 'collab-code'
        ? 'Решение из совместного кода'
        : (isCheatsheet ? 'Шпаргалка из совместного кода' : 'Код из совместного редактора'),
      tags: [],
      lastRunOutput: error || output,
      lastRunHadError: Boolean(error || status === 'error'),
      lastRunAt: runTimestamp ? new Date(runTimestamp).toISOString() : '',
      ...(codePreview ? { codePreview } : {}),
    };
  };

  const attachCollabBoardSnapshotToFile = async (fileId, safeName) => {
    const renderer = collabBoardSnapshotRendererRef.current;
    if (!fileId || typeof renderer !== 'function') return { attached: false };
    try {
      const snapshot = await renderer();
      const blob = snapshot?.blob;
      if (!blob) return { attached: false };
      if (blob.size > COLLAB_MEMORY_SNAPSHOT_MAX_FILE_BYTES) {
        throw new Error(`Снимок доски больше ${formatBoardBytes(COLLAB_MEMORY_SNAPSHOT_MAX_FILE_BYTES)}.`);
      }
      const baseName = String(safeName || 'решение').replace(/\.[^.]+$/i, '').trim() || 'решение';
      const snapshotFile = new File([blob], `${baseName}-доска.png`, { type: 'image/png' });
      await uploadFileMemorySnapshot(fileId, snapshotFile, Number(snapshot?.itemCount) || 0);
      return { attached: true };
    } catch (err) {
      console.warn('[collab] failed to attach board snapshot memory', err);
      return { attached: false, error: err?.message || String(err || '') };
    }
  };

  const normalizeRuntimePath = (value) => {
    const text = String(value || '').replace(/\0/g, '').trim();
    if (!text) return '';
    const parts = text
      .split(/[\\/]+/)
      .map((part) => String(part || '').trim())
      .filter((part) => part && part !== '.' && part !== '..');
    if (!parts.length) return '';
    return parts.join('/');
  };

  const normalizeRuntimeFileName = (value) => {
    const normalizedPath = normalizeRuntimePath(value);
    if (!normalizedPath) return '';
    const parts = normalizedPath.split('/');
    return parts[parts.length - 1];
  };

  const getRuntimePathForTaskFile = useCallback((file) => {
    const safeName = normalizeRuntimeFileName(file?.name);
    if (!safeName) return '';
    const folderPath = normalizeRuntimePath(file?.folderPath || file?.folderName);
    return folderPath ? `${folderPath}/${safeName}` : safeName;
  }, []);

  const getRuntimePathVariantsForTaskFile = useCallback((file) => {
    const primaryPath = getRuntimePathForTaskFile(file);
    if (!primaryPath) return [];
    const parts = primaryPath.split('/').filter(Boolean);
    const variants = [];
    const seen = new Set();
    for (let start = 0; start < parts.length; start += 1) {
      const candidate = normalizeRuntimePath(parts.slice(start).join('/'));
      const lowerCandidate = candidate.toLowerCase();
      if (!candidate || seen.has(lowerCandidate)) continue;
      seen.add(lowerCandidate);
      variants.push(candidate);
    }
    return variants;
  }, [getRuntimePathForTaskFile]);

  const getPreferredRuntimePathForTaskFile = useCallback((file, scopeFiles = []) => {
    const variants = getRuntimePathVariantsForTaskFile(file);
    if (!variants.length) return '';
    const counts = new Map();
    const filesScope = Array.isArray(scopeFiles) && scopeFiles.length ? scopeFiles : [file];
    filesScope.forEach((scopeFile) => {
      getRuntimePathVariantsForTaskFile(scopeFile).forEach((candidate) => {
        const lowerCandidate = candidate.toLowerCase();
        counts.set(lowerCandidate, (counts.get(lowerCandidate) || 0) + 1);
      });
    });
    for (let index = variants.length - 1; index >= 0; index -= 1) {
      const candidate = variants[index];
      if ((counts.get(candidate.toLowerCase()) || 0) === 1) return candidate;
    }
    return variants[0] || '';
  }, [getRuntimePathVariantsForTaskFile]);

  const getRunTaskNumberForUpload = () => {
    const num = Number(runTaskNumber);
    if (Number.isFinite(num) && num > 0) return num;
    const normalized = normalizeTaskNumber(runTaskNumber);
    if (Number.isFinite(normalized)) return normalized;
    return Number(taskOptions[0]?.number) || NaN;
  };

  const handleTestFileTextChange = useCallback((value) => {
    const normalized = normalizeCollabTextFileContent(value);
    setTestFileText((prev) => (prev === normalized ? prev : normalized));
    const ytext = collabTestFileRef.current;
    if (!ytext) return;
    const current = normalizeCollabTextFileContent(ytext.toString());
    if (current === normalized) return;
    const applyChange = () => {
      if (ytext.length > 0) {
        ytext.delete(0, ytext.length);
      }
      if (normalized) {
        ytext.insert(0, normalized);
      }
    };
    if (ytext.doc?.transact) {
      ytext.doc.transact(applyChange, 'collab-test-file');
      return;
    }
    applyChange();
  }, []);

  const mountRuntimeFilesInPyodide = useCallback((pyodide, runtimeFiles = []) => {
    if (!pyodide?.FS) return;
    const ensureRuntimeDir = (dirPath) => {
      if (!dirPath) return;
      const parts = String(dirPath).split('/').filter(Boolean);
      let current = '';
      parts.forEach((part) => {
        current = current ? `${current}/${part}` : part;
        try {
          pyodide.FS.mkdir(current);
        } catch { /* no-op */ }
      });
    };
    const mounted = mountedRuntimeFilesRef.current || [];
    mounted.forEach((filePath) => {
      try {
        pyodide.FS.unlink(filePath);
      } catch { /* no-op */ }
    });
    mountedRuntimeFilesRef.current = [];
    if (!Array.isArray(runtimeFiles) || !runtimeFiles.length) return;
    const seen = new Set();
    runtimeFiles.forEach((file) => {
      const safePath = normalizeRuntimePath(file?.name);
      if (!safePath) return;
      const dedupeKey = safePath.toLowerCase();
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      const bytesSource = file?.bytes;
      let bytes = null;
      if (bytesSource instanceof Uint8Array) {
        bytes = bytesSource;
      } else if (ArrayBuffer.isView(bytesSource)) {
        bytes = new Uint8Array(bytesSource.buffer, bytesSource.byteOffset, bytesSource.byteLength);
      } else if (bytesSource instanceof ArrayBuffer) {
        bytes = new Uint8Array(bytesSource);
      } else if (Array.isArray(bytesSource)) {
        bytes = Uint8Array.from(bytesSource.map((item) => {
          const num = Number(item);
          if (!Number.isFinite(num)) return 0;
          return num & 255;
        }));
      } else if (typeof bytesSource === 'string') {
        try {
          bytes = new TextEncoder().encode(bytesSource);
        } catch {
          bytes = new Uint8Array(0);
        }
      } else {
        bytes = new Uint8Array(0);
      }
      const dirPath = safePath.includes('/') ? safePath.slice(0, safePath.lastIndexOf('/')) : '';
      if (dirPath) ensureRuntimeDir(dirPath);
      try {
        pyodide.FS.writeFile(safePath, bytes);
        mountedRuntimeFilesRef.current.push(safePath);
      } catch { /* no-op */ }
    });
  }, []);

  const resolveSelectedRuntimeFiles = useCallback(async () => {
    const reservedRuntimePath = COLLAB_TEST_FILE_RUNTIME_NAME.toLowerCase();
    const payload = [{
      name: COLLAB_TEST_FILE_RUNTIME_NAME,
      bytes: new TextEncoder().encode(normalizeCollabTextFileContent(testFileText)),
    }];
    if (!selectedTaskFiles.length) return payload;
    const selectedEntries = selectedTaskFiles.map((file) => {
      const primaryPath = getRuntimePathForTaskFile(file);
      return {
        file,
        primaryPath,
        variants: getRuntimePathVariantsForTaskFile(file),
      };
    }).filter((entry) => entry.primaryPath);
    const pathCounts = new Map();
    selectedEntries.forEach((entry) => {
      entry.variants.forEach((candidate) => {
        const lowerCandidate = candidate.toLowerCase();
        pathCounts.set(lowerCandidate, (pathCounts.get(lowerCandidate) || 0) + 1);
      });
    });
    const mountedPaths = new Set([reservedRuntimePath]);
    for (const entry of selectedEntries) {
      const { file, primaryPath, variants } = entry;
      const runtimePath = primaryPath;
      if (!runtimePath) continue;
      const lowerPath = runtimePath.toLowerCase();
      if (mountedPaths.has(lowerPath)) {
        if (lowerPath === reservedRuntimePath) continue;
        throw new Error(`\u0412\u044b\u0431\u0440\u0430\u043d\u043e \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0444\u0430\u0439\u043b\u043e\u0432 \u0441 \u043f\u0443\u0442\u0435\u043c ${runtimePath}. \u041e\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u043e\u0434\u0438\u043d.`);
      }
      mountedPaths.add(lowerPath);
      const fileUrl = getTaskFileUrl(file);
      if (!fileUrl) {
        throw new Error(`\u041d\u0435\u0442 \u0441\u0441\u044b\u043b\u043a\u0438 \u0434\u043b\u044f \u0444\u0430\u0439\u043b\u0430 ${runtimePath}.`);
      }
      const response = await authenticatedUploadsFetch(fileUrl);
      if (!response.ok) {
        const reason = await extractResponseErrorMessage(
          response,
          `\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0444\u0430\u0439\u043b ${runtimePath}.`
        );
        throw new Error(
          reason.includes(runtimePath)
            ? reason
            : `${reason} (${runtimePath}).`
        );
      }
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      payload.push({
        name: runtimePath,
        bytes,
      });
      variants.forEach((candidate) => {
        const lowerCandidate = candidate.toLowerCase();
        if (lowerCandidate === reservedRuntimePath) return;
        if (lowerCandidate === lowerPath) return;
        if ((pathCounts.get(lowerCandidate) || 0) !== 1) return;
        if (mountedPaths.has(lowerCandidate)) return;
        mountedPaths.add(lowerCandidate);
        payload.push({
          name: candidate,
          bytes,
        });
      });
    }
    return payload;
  }, [selectedTaskFiles, getTaskFileUrl, getRuntimePathForTaskFile, getRuntimePathVariantsForTaskFile, testFileText]);

  const handleUploadTaskFiles = async (fileList) => {
    const filesToUpload = Array.from(fileList || []).filter(Boolean);
    if (!filesToUpload.length) return;
    if (!effectiveStudentId) {
      setTaskFilesError('\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0447\u0435\u043d\u0438\u043a\u0430.');
      return;
    }
    const uploadTaskNumber = getRunTaskNumberForUpload();
    if (!Number.isFinite(uploadTaskNumber) || !runTaskCategory) {
      setTaskFilesError('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u043d\u0438\u0435 \u0438 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044e.');
      return;
    }
    if (taskFileUploadBusy) return;
    setTaskFileUploadBusy(true);
    setTaskFilesError('');
    try {
      const createdFiles = [];
      for (const file of filesToUpload) {
        const created = await api.uploadFile(file, uploadTaskNumber, runTaskCategory, null, effectiveStudentId);
        createdFiles.push(created);
      }
      if (createdFiles.length) {
        setTaskFiles((prev) => [...createdFiles, ...prev]);
        setSelectedTaskFileIds((prev) => {
          const next = new Set(prev);
          createdFiles.forEach((file) => {
            if (file?.id) next.add(file.id);
          });
          return Array.from(next);
        });
      }
    } catch (err) {
      setTaskFilesError(err?.message || err);
    } finally {
      setTaskFileUploadBusy(false);
      if (taskFileInputRef.current) taskFileInputRef.current.value = '';
    }
  };

  const handleToggleTaskFile = (fileId) => {
    if (!fileId) return;
    setSelectedTaskFileIds((prev) => {
      if (prev.includes(fileId)) return prev.filter((id) => id !== fileId);
      return [...prev, fileId];
    });
  };

  const handleToggleSelectAllTaskFiles = useCallback(() => {
    if (!visibleTaskFiles.length) return;
    const visibleIds = visibleTaskFiles
      .map((file) => file?.id)
      .filter(Boolean);
    if (!visibleIds.length) return;
    setSelectedTaskFileIds((prev) => {
      const next = new Set(prev);
      const isAllSelected = visibleIds.every((id) => next.has(id));
      if (isAllSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return Array.from(next);
    });
  }, [visibleTaskFiles]);
  const handleTaskFilesListHeightStep = useCallback((direction) => {
    const stepDirection = Number(direction);
    if (!Number.isFinite(stepDirection) || stepDirection === 0) return;
    setTaskFilesListHeight((prev) => clampTaskFilesListHeight(
      prev + (stepDirection * TASK_FILES_LIST_HEIGHT_STEP)
    ));
  }, []);

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
    const saveAsCodeOnly = saveMode === NOTES_SAVE_MODE_CODE_ONLY;
    const saveAsCheatsheet = saveMode === NOTES_SAVE_MODE_CHEATSHEET;
    let safeName = baseName;
    const prefix = saveAsCheatsheet ? 'шпаргалка-' : 'конспект-';
    if (!safeName.toLowerCase().startsWith(prefix)) {
      safeName = `${prefix}${safeName}`;
    }
    if (!/\.[a-z0-9]+$/i.test(safeName)) {
      safeName += '.py';
    }
    const file = new File([code], safeName, { type: 'text/plain' });
    const fileSource = saveAsCheatsheet
      ? 'notes-cheatsheet'
      : (saveAsCodeOnly ? 'notes-python' : 'collab-code');
    setSaveBusy(true);
    try {
      const created = await api.uploadFile(
        file,
        Number(saveTaskNumber),
        saveCategory,
        saveFolderId || null,
        effectiveStudentId,
        {
          source: fileSource,
          memory: buildCollabCodeMemory(baseName, fileSource, code),
        }
      );
      const snapshotResult = (saveAsCodeOnly || saveAsCheatsheet)
        ? { attached: false }
        : await attachCollabBoardSnapshotToFile(created?.id, safeName);
      saveNotesSaveDraft(notesSaveDraftStorageKey, {
        taskNumber: saveTaskNumber,
        category: saveCategory,
        folderId: saveFolderId,
        fileName: saveFileName,
        saveMode,
      }, saveTaskNumbers);
      if (saveAsCheatsheet) {
        setSaveSuccess('Сохранено в конспекты: шпаргалка.');
      } else if (saveAsCodeOnly) {
        setSaveSuccess('Сохранено в конспекты: только код.');
      } else {
        setSaveSuccess(snapshotResult.error
          ? `Сохранено в конспекты. Снимок доски не прикрепился: ${snapshotResult.error}`
          : (snapshotResult.attached ? 'Сохранено в конспекты со снимком доски.' : 'Сохранено в конспекты.'));
      }
      publishCollabCodeSaveNotice(getSavedCodeNoticePath(safeName));
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

  const getOutputPanelRunToken = (tsValue = runTimestampRef.current) => {
    const tsNumber = Number(tsValue);
    if (Number.isFinite(tsNumber) && tsNumber > 0) return `ts:${tsNumber}`;
    return `session:${runSessionRef.current}`;
  };

  const revealOutputPanelForRun = (tsValue = runTimestampRef.current) => {
    const token = getOutputPanelRunToken(tsValue);
    if (outputPanelDismissedRunTokenRef.current === token) return;
    setOutputPanelOpen(true);
  };

  const handleCloseOutputPanel = () => {
    outputPanelDismissedRunTokenRef.current = getOutputPanelRunToken();
    setOutputPanelOpen(false);
  };

  const closeBoardAuxPopover = () => {
    setStdinPanelOpen(false);
    setTaskFilesPanelOpen(false);
  };

  const handleToggleBoardAuxPopover = () => {
    if (isBoardCodeAuxOpen) {
      closeBoardAuxPopover();
      return;
    }
    setCollabAuxPanelMode(COLLAB_AUX_PANEL_MODE_TEST_FILE);
    setTaskFilesPanelOpen(true);
  };

  const applySharedTurtleScene = (jsonValue, runIdValue, sceneTsValue, authorValue) => {
    const json = typeof jsonValue === 'string' ? jsonValue : '';
    const runId = typeof runIdValue === 'string' ? runIdValue : String(runIdValue || '');
    const previousPayload = collabTurtlePayloadRef.current;
    if (previousPayload.json === json && previousPayload.runId === runId) {
      if (json && authorValue) setCollabTurtleAuthor(String(authorValue));
      return;
    }
    collabTurtlePayloadRef.current = { json, runId };

    const scene = parseTurtleSceneJson(json);
    if (!scene?.used) {
      setCollabTurtleScene(null);
      setCollabTurtleWindowOpen(false);
      setCollabTurtleWindowFullscreen(false);
      setCollabTurtleAuthor('');
      if (!runId) collabTurtleSeenRunIdRef.current = '';
      return;
    }

    setCollabTurtleScene(scene);
    setCollabTurtleAuthor(String(authorValue || ''));
    const sceneTs = Number(sceneTsValue);
    const isFresh = Number.isFinite(sceneTs)
      && sceneTs > 0
      && Date.now() - sceneTs <= COLLAB_TURTLE_AUTO_OPEN_MAX_AGE_MS;
    const isNewRun = Boolean(runId) && collabTurtleSeenRunIdRef.current !== runId;
    if (runId) collabTurtleSeenRunIdRef.current = runId;
    if (isNewRun && isFresh) setCollabTurtleWindowOpen(true);
  };

  const closeCollabTurtleWindow = useCallback(() => {
    setCollabTurtleWindowFullscreen(false);
    setCollabTurtleWindowOpen(false);
  }, []);

  const updateRunStateFromMap = (runMap) => {
    if (!runMap) {
      setRunOutput('');
      setRunError('');
      setRunStatus('idle');
      setRunAuthor('');
      setRunTimestamp(null);
      runTimestampRef.current = null;
      setLastRunInput('');
      collabTurtlePayloadRef.current = { json: '', runId: '' };
      collabTurtleSeenRunIdRef.current = '';
      setCollabTurtleScene(null);
      setCollabTurtleWindowOpen(false);
      setCollabTurtleWindowFullscreen(false);
      setCollabTurtleAuthor('');
      setOutputPanelOpen(false);
      outputPanelDismissedRunTokenRef.current = null;
      setDebugActive(false);
      setDebugTrace([]);
      debugTraceRef.current = [];
      setDebugTraceTruncated(false);
      setDebugPlaying(false);
      setDebugSourceSnapshot('');
      setDebugStep(-1);
      collabAuxPanelModeRef.current = COLLAB_AUX_PANEL_MODE_INPUT;
      testFileTextareaHeightRef.current = 0;
      taskFilesPanelOpenRef.current = false;
      selectedTaskFileIdsRef.current = [];
      setCollabAuxPanelMode(COLLAB_AUX_PANEL_MODE_INPUT);
      setTestFileTextareaHeight(0);
      setTaskFilesPanelOpen(false);
      setSelectedTaskFileIds([]);
      setNotesPdfPanelOpen(true);
      setNotesPanelMode(COLLAB_TOP_PANE_MODE_BOARD);
      setNotesPdfFolderKey('');
      setNotesPdfFileId('');
      if (collabSaveNoticeTimerRef.current) {
        clearTimeout(collabSaveNoticeTimerRef.current);
        collabSaveNoticeTimerRef.current = null;
      }
      setCollabSaveNotice(null);
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
    runTimestampRef.current = ts;
    setLastRunInput(input);
    applySharedTurtleScene(
      runMap.get('turtleSceneJson'),
      runMap.get('turtleSceneRunId'),
      runMap.get('turtleSceneTs'),
      author
    );
    if (status === 'running') {
      revealOutputPanelForRun(ts);
    }

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

    if (runMap.has('auxPanelMode')) {
      const nextAuxPanelMode = normalizeCollabAuxPanelMode(runMap.get('auxPanelMode'));
      if (collabAuxPanelModeRef.current !== nextAuxPanelMode) {
        suppressAuxPanelModeSyncRef.current = true;
        collabAuxPanelModeRef.current = nextAuxPanelMode;
        setCollabAuxPanelMode(nextAuxPanelMode);
      }
    }
    if (runMap.has('testFileHeight')) {
      const nextTestFileHeight = normalizeCollabTestFileHeight(runMap.get('testFileHeight'));
      if (nextTestFileHeight && testFileTextareaHeightRef.current !== nextTestFileHeight) {
        suppressTestFileHeightSyncRef.current = true;
        testFileTextareaHeightRef.current = nextTestFileHeight;
        setTestFileTextareaHeight(nextTestFileHeight);
      }
    }

    let shouldSuppressTaskFilesSync = false;
    if (runMap.has('taskFilesPanelOpen')) {
      const nextTaskFilesPanelOpen = Boolean(runMap.get('taskFilesPanelOpen'));
      if (taskFilesPanelOpenRef.current !== nextTaskFilesPanelOpen) {
        shouldSuppressTaskFilesSync = true;
        taskFilesPanelOpenRef.current = nextTaskFilesPanelOpen;
        setTaskFilesPanelOpen(nextTaskFilesPanelOpen);
      }
    }
    if (runMap.has('taskFilesTaskNumber')) {
      const nextTaskNumber = typeof runMap.get('taskFilesTaskNumber') === 'string'
        ? runMap.get('taskFilesTaskNumber')
        : String(runMap.get('taskFilesTaskNumber') ?? '');
      if (runTaskNumberRef.current !== nextTaskNumber) {
        shouldSuppressTaskFilesSync = true;
        runTaskNumberRef.current = nextTaskNumber;
        setRunTaskNumber(nextTaskNumber);
      }
    }
    if (runMap.has('taskFilesCategory')) {
      const rawCategory = typeof runMap.get('taskFilesCategory') === 'string'
        ? runMap.get('taskFilesCategory')
        : String(runMap.get('taskFilesCategory') ?? '');
      const nextTaskCategory = normalizeCollabTaskFileCategory(rawCategory);
      if (runTaskCategoryRef.current !== nextTaskCategory) {
        shouldSuppressTaskFilesSync = true;
        runTaskCategoryRef.current = nextTaskCategory;
        setRunTaskCategory(nextTaskCategory);
      }
    }
    if (runMap.has('taskFilesSelectedIds')) {
      const nextSelectedIds = normalizeSharedTaskFileIds(runMap.get('taskFilesSelectedIds'));
      if (!areStringArraysEqual(selectedTaskFileIdsRef.current, nextSelectedIds)) {
        shouldSuppressTaskFilesSync = true;
        selectedTaskFileIdsRef.current = nextSelectedIds;
        setSelectedTaskFileIds(nextSelectedIds);
      }
    }
    if (shouldSuppressTaskFilesSync) {
      suppressTaskFilesSyncRef.current = true;
    }

    if (runMap.has('notesPdfOpen')) {
      setNotesPdfPanelOpen(Boolean(runMap.get('notesPdfOpen')));
    }
    if (runMap.has('notesPanelMode')) {
      setNotesPanelMode(normalizeCollabTopPaneMode(runMap.get('notesPanelMode')));
    }
    if (runMap.has('notesPdfFolderKey')) {
      const nextFolderKey = typeof runMap.get('notesPdfFolderKey') === 'string'
        ? runMap.get('notesPdfFolderKey')
        : String(runMap.get('notesPdfFolderKey') ?? '');
      setNotesPdfFolderKey(nextFolderKey);
    }
    if (runMap.has('notesPdfFileId')) {
      const nextFileId = typeof runMap.get('notesPdfFileId') === 'string'
        ? runMap.get('notesPdfFileId')
        : String(runMap.get('notesPdfFileId') ?? '');
      setNotesPdfFileId(nextFileId);
    }
    if (runMap.has('saveNoticeId')) {
      const noticeId = String(runMap.get('saveNoticeId') || '').trim();
      const noticePath = String(runMap.get('saveNoticePath') || '').trim();
      const noticeTsRaw = Number(runMap.get('saveNoticeTs'));
      const noticeTs = Number.isFinite(noticeTsRaw) ? noticeTsRaw : 0;
      if (noticeId && noticePath && noticeTs > 0 && Date.now() - noticeTs <= COLLAB_SAVE_NOTICE_STALE_MS) {
        showCollabSaveNotice({
          id: noticeId,
          path: noticePath,
          author: String(runMap.get('saveNoticeAuthor') || '').trim(),
          ts: noticeTs,
        });
      }
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
      if (
        Object.prototype.hasOwnProperty.call(payload, 'turtleSceneJson')
        || Object.prototype.hasOwnProperty.call(payload, 'turtleSceneRunId')
        || Object.prototype.hasOwnProperty.call(payload, 'turtleSceneTs')
      ) {
        applySharedTurtleScene(
          payload.turtleSceneJson,
          payload.turtleSceneRunId,
          payload.turtleSceneTs,
          payload.author
        );
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
      if (Object.prototype.hasOwnProperty.call(payload, 'auxPanelMode')) {
        setCollabAuxPanelMode(normalizeCollabAuxPanelMode(payload.auxPanelMode));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'testFileHeight')) {
        const nextTestFileHeight = normalizeCollabTestFileHeight(payload.testFileHeight);
        setTestFileTextareaHeight(nextTestFileHeight);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'taskFilesPanelOpen')) {
        setTaskFilesPanelOpen(Boolean(payload.taskFilesPanelOpen));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'taskFilesTaskNumber')) {
        setRunTaskNumber(String(payload.taskFilesTaskNumber || ''));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'taskFilesCategory')) {
        setRunTaskCategory(normalizeCollabTaskFileCategory(payload.taskFilesCategory));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'taskFilesSelectedIds')) {
        const nextSelectedIds = normalizeSharedTaskFileIds(payload.taskFilesSelectedIds);
        setSelectedTaskFileIds((prev) => (areStringArraysEqual(prev, nextSelectedIds) ? prev : nextSelectedIds));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'notesPdfOpen')) {
        setNotesPdfPanelOpen(Boolean(payload.notesPdfOpen));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'notesPanelMode')) {
        setNotesPanelMode(normalizeCollabTopPaneMode(payload.notesPanelMode));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'notesPdfFolderKey')) {
        setNotesPdfFolderKey(String(payload.notesPdfFolderKey || ''));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'notesPdfFileId')) {
        setNotesPdfFileId(String(payload.notesPdfFileId || ''));
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
      if (Object.prototype.hasOwnProperty.call(payload, 'turtleSceneJson')) {
        runMap.set('turtleSceneJson', typeof payload.turtleSceneJson === 'string' ? payload.turtleSceneJson : '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'turtleSceneRunId')) {
        runMap.set('turtleSceneRunId', String(payload.turtleSceneRunId || ''));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'turtleSceneTs')) {
        const turtleSceneTs = Number(payload.turtleSceneTs);
        runMap.set(
          'turtleSceneTs',
          payload.turtleSceneTs !== null && payload.turtleSceneTs !== '' && Number.isFinite(turtleSceneTs)
            ? turtleSceneTs
            : null
        );
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
      if (Object.prototype.hasOwnProperty.call(payload, 'auxPanelMode')) {
        runMap.set('auxPanelMode', normalizeCollabAuxPanelMode(payload.auxPanelMode));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'testFileHeight')) {
        runMap.set('testFileHeight', normalizeCollabTestFileHeight(payload.testFileHeight));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'taskFilesPanelOpen')) {
        runMap.set('taskFilesPanelOpen', Boolean(payload.taskFilesPanelOpen));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'taskFilesTaskNumber')) {
        runMap.set('taskFilesTaskNumber', String(payload.taskFilesTaskNumber || ''));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'taskFilesCategory')) {
        runMap.set('taskFilesCategory', normalizeCollabTaskFileCategory(payload.taskFilesCategory));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'taskFilesSelectedIds')) {
        runMap.set('taskFilesSelectedIds', normalizeSharedTaskFileIds(payload.taskFilesSelectedIds));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'notesPdfOpen')) {
        runMap.set('notesPdfOpen', Boolean(payload.notesPdfOpen));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'notesPanelMode')) {
        runMap.set('notesPanelMode', normalizeCollabTopPaneMode(payload.notesPanelMode));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'notesPdfFolderKey')) {
        runMap.set('notesPdfFolderKey', String(payload.notesPdfFolderKey || ''));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'notesPdfFileId')) {
        runMap.set('notesPdfFileId', String(payload.notesPdfFileId || ''));
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
        turtleScene: null,
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
        const turtleScene = normalizeTurtleScene(data.turtleScene);
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, turtleScene, done: true });
        }
        pending.resolve({ output, error, turtleScene, debugTrace, debugTraceTruncated });
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

  const runPythonInMainThread = async (source, inputValue, runtimeFiles = []) => {
    const pyodide = await ensurePyodideReady();
    mountRuntimeFilesInPyodide(pyodide, runtimeFiles);
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
    return { output: String(output), error: String(error), turtleScene: null };
  };

  const runPythonCode = async (source, inputValue, onProgress = null, options = {}) => {
    const debugMode = Boolean(options?.debug);
    const runtimeFiles = Array.isArray(options?.files) ? options.files : [];
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
          resolve({ output, error, turtleScene: null, debugTrace, debugTraceTruncated });
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
        worker.postMessage({
          id,
          source,
          input: inputValue,
          debug: debugMode,
          files: runtimeFiles,
          enableTurtle: true,
        });
      });
    }
    if (!ALLOW_MAIN_THREAD_PYTHON_FALLBACK) {
      return {
        output: '',
        error: 'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.',
        turtleScene: null,
      };
    }
    return runPythonInMainThread(source, inputValue, runtimeFiles);
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
    outputPanelDismissedRunTokenRef.current = null;
    setOutputPanelOpen(true);
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
    const startedAt = Date.now();
    const turtleRunId = `${startedAt}-${String(userId || role || 'participant')}-${Math.random().toString(36).slice(2, 8)}`;
    runTimestampRef.current = startedAt;
    setRunTimestamp(startedAt);
    setRunLoading(true);
    setRunStatus('running');
    setRunError('');
    setCollabTurtleScene(null);
    setCollabTurtleWindowOpen(false);
    setCollabTurtleWindowFullscreen(false);
    setCollabTurtleAuthor('');
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
    const inputSnapshot = runInputRef.current || '';
    publishRunStateRef.current?.({
      turtleSceneJson: '',
      turtleSceneRunId: '',
      turtleSceneTs: null,
    });
    let runtimeFilesPayload = [];
    try {
      runtimeFilesPayload = await resolveSelectedRuntimeFiles();
    } catch (err) {
      if (runSessionRef.current !== sessionId) return;
      const message = err?.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u0444\u0430\u0439\u043b\u044b \u0437\u0430\u0434\u0430\u043d\u0438\u044f.';
      setRunLoading(false);
      setRunStatus('done');
      setRunOutput('');
      setRunError(message);
      publishRunState({
        status: 'done',
        output: '',
        error: normalizeRunText(message),
        author: localName,
        ts: Date.now(),
        input: inputSnapshot,
        turtleSceneJson: '',
        turtleSceneRunId: '',
        turtleSceneTs: null,
      });
      return;
    }
    publishRunState({
      status: 'running',
      output: '',
      error: '',
      author: localName,
      ts: startedAt,
      input: inputSnapshot,
      turtleSceneJson: '',
      turtleSceneRunId: '',
      turtleSceneTs: null,
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
      }, { debug: isDebugRun, files: runtimeFilesPayload });
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
      const serializedTurtleScene = serializeTurtleScene(result?.turtleScene);
      const hasTurtleScene = Boolean(serializedTurtleScene.scene?.used && serializedTurtleScene.json);
      const turtleSceneTs = hasTurtleScene ? Date.now() : null;
      const turtleSyncWarning = result?.turtleScene?.used && !hasTurtleScene
        ? 'Рисунок Turtle слишком большой или содержит неподдерживаемые данные и не был отправлен участникам.'
        : '';
      publishRunState({
        status: 'done',
        output: normalizeRunText(result.output || ''),
        error: normalizeRunText(mergeRuntimeErrorText(result.error || '', turtleSyncWarning)),
        author: localName,
        ts: turtleSceneTs || Date.now(),
        input: inputSnapshot,
        turtleSceneJson: hasTurtleScene ? serializedTurtleScene.json : '',
        turtleSceneRunId: hasTurtleScene ? turtleRunId : '',
        turtleSceneTs,
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
        turtleSceneJson: '',
        turtleSceneRunId: '',
        turtleSceneTs: null,
      });
    } finally {
      if (runSessionRef.current === sessionId) {
        setRunLoading(false);
        setRunStatus('done');
      }
    }
  };
  handleRunCodeRef.current = handleRunCode;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleRunHotkey = (event) => {
      const isPlainF5 = (event.key === 'F5' || event.code === 'F5')
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !event.shiftKey;
      const isCtrlEnter = (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter')
        && (event.ctrlKey || event.metaKey)
        && !event.altKey
        && !event.shiftKey;
      if (!isPlainF5 && !isCtrlEnter) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || runLoading || !roomId) return;
      void handleRunCodeRef.current?.('all');
    };
    window.addEventListener('keydown', handleRunHotkey, true);
    return () => window.removeEventListener('keydown', handleRunHotkey, true);
  }, [roomId, runLoading]);

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
      turtleSceneJson: '',
      turtleSceneRunId: '',
      turtleSceneTs: null,
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
    setOutputPanelOpen(false);
    outputPanelDismissedRunTokenRef.current = null;
    clearDebugSession(false);
    publishRunState({
      status: 'idle',
      output: '',
      error: '',
      author: '',
      ts: null,
      input: '',
      turtleSceneJson: '',
      turtleSceneRunId: '',
      turtleSceneTs: null,
      debugActive: false,
      debugTrace: [],
      debugTraceTruncated: false,
      debugStepIndex: -1,
      debugPlaying: false,
      debugSource: '',
    });
  };

  useEffect(() => {
    if (!collabTurtleWindowOpen || typeof window === 'undefined') return undefined;
    const previouslyFocused = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => collabTurtleCloseRef.current?.focus());
    const handleTurtleWindowKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (collabTurtleWindowFullscreen) {
        setCollabTurtleWindowFullscreen(false);
        return;
      }
      closeCollabTurtleWindow();
    };
    window.addEventListener('keydown', handleTurtleWindowKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleTurtleWindowKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [collabTurtleWindowFullscreen, collabTurtleWindowOpen, closeCollabTurtleWindow]);

  useEffect(() => {
    taskFilesSyncReadyRef.current = false;
    if (!roomId || !editorReady || !wsUrl) {
      setStatus('disconnected');
      setPeerCount(0);
      setRemoteParticipants([]);
      setRemoteEditorCursors([]);
      setRemoteOutputSelections([]);
      setRemoteTestFileSelections([]);
      stopCollabOutputSelectionTracking();
      stopCollabTestFileSelectionTracking();
      if (COLLAB_EDITOR_CURSOR_ENABLED) {
        collabAwarenessRef.current?.setLocalStateField?.('editorCursor', null);
      }
      collabAwarenessRef.current?.setLocalStateField?.('outputSelection', null);
      collabAwarenessRef.current?.setLocalStateField?.('testFileSelection', null);
      collabCursorWindowStopRef.current?.();
      collabCursorWindowStopRef.current = null;
      if (collabCursorClearTimerRef.current) {
        clearTimeout(collabCursorClearTimerRef.current);
        collabCursorClearTimerRef.current = null;
      }
      if (collabCursorSyncTimerRef.current) {
        clearTimeout(collabCursorSyncTimerRef.current);
        collabCursorSyncTimerRef.current = null;
      }
      collabCursorPendingRef.current = null;
      remoteEditorCursorSeenRef.current.clear();
      collabDocRef.current = null;
      collabTestFileRef.current = null;
      collabAwarenessRef.current = null;
      runMapRef.current = null;
      outputSelectionRef.current = null;
      testFileSelectionRef.current = null;
      setLocalTestFileSelection(null);
      setTestFileText('');
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
      collabCursorWindowStopRef.current?.();
      collabCursorWindowStopRef.current = null;
      stopCollabOutputSelectionTracking();
      stopCollabTestFileSelectionTracking();
      remoteEditorCursorSeenRef.current.clear();
      setRemoteParticipants([]);
      setRemoteEditorCursors([]);
      setRemoteOutputSelections([]);
      setRemoteTestFileSelections([]);
      setLocalTestFileSelection(null);
      return;
    }

    const ytext = doc.getText('monaco');
    const binding = new MonacoBinding(ytext, model, new Set([editorRef.current]));
    const handleReplayCodeChange = (_event, transaction) => {
      if (transaction?.local === false) return;
      scheduleLessonReplayCodeSnapshot(ytext);
    };
    ytext.observe(handleReplayCodeChange);
    provider.awareness.setLocalStateField('user', { name: localName, color: localColor });
    provider.awareness.setLocalStateField('selection', null);
    provider.awareness.setLocalStateField('outputSelection', null);
    provider.awareness.setLocalStateField('testFileSelection', null);
    if (COLLAB_EDITOR_CURSOR_ENABLED) {
      provider.awareness.setLocalStateField('editorCursor', null);
    }

    const runMap = doc.getMap('collabRun');
    runMapRef.current = runMap;
    const handleRunMapChange = (_event, transaction) => {
      updateRunStateFromMap(runMap);
      const replayRunPayload = {
        status: typeof runMap.get('status') === 'string' ? runMap.get('status') : 'idle',
        input: typeof runMap.get('input') === 'string' ? runMap.get('input') : String(runMap.get('input') ?? ''),
        output: typeof runMap.get('output') === 'string' ? runMap.get('output') : String(runMap.get('output') ?? ''),
        error: typeof runMap.get('error') === 'string' ? runMap.get('error') : String(runMap.get('error') ?? ''),
      };
      const shouldRecordReplay = transaction?.local !== false;
      if (shouldRecordReplay) scheduleLessonReplayCodeSnapshot(ytext, 250, replayRunPayload);
      if (
        shouldRecordReplay
        &&
        typeof lessonReplayEventRef.current === 'function'
        && (replayRunPayload.status !== 'idle' || replayRunPayload.output || replayRunPayload.error)
      ) {
        lessonReplayEventRef.current('run', replayRunPayload, { dedupeMs: 5000 });
      }
    };
    runMap.observe(handleRunMapChange);
    handleRunMapChange();
    taskFilesSyncReadyRef.current = true;

    const testFileYText = doc.getText(COLLAB_TEST_FILE_DOC_KEY);
    collabTestFileRef.current = testFileYText;
    const syncTestFileFromDoc = (_event, transaction) => {
      const next = normalizeCollabTextFileContent(testFileYText.toString());
      setTestFileText((prev) => (prev === next ? prev : next));
      if (transaction?.local !== false) {
        scheduleLessonReplayCodeSnapshot(ytext, 1400, { testFile: next });
      }
    };
    testFileYText.observe(syncTestFileFromDoc);
    syncTestFileFromDoc();
    scheduleLessonReplayCodeSnapshot(ytext, 350);

    const handleStatus = (event) => {
      if (event?.status) setStatus(event.status);
    };
    const handleAwareness = () => {
      const states = provider.awareness.getStates();
      const total = states.size;
      setPeerCount(Math.max(0, total - 1));
      const now = Date.now();
      const cursorSeenByClient = remoteEditorCursorSeenRef.current;
      const participants = [];
      const cursors = [];
      const outputSelections = [];
      const testFileSelections = [];
      const presentRemoteClientIds = new Set();
      const outputLength = String(runOutputRef.current || '').length;
      const testFileLength = String(testFileTextRef.current || '').length;
      states.forEach((state, clientId) => {
        if (clientId === provider.awareness.clientID) return;
        const remoteClientId = String(clientId);
        presentRemoteClientIds.add(remoteClientId);
        const remoteUser = state?.user;
        const remoteName = typeof remoteUser?.name === 'string' && remoteUser.name.trim()
          ? remoteUser.name.trim()
          : 'Участник';
        const remoteColor = typeof remoteUser?.color === 'string' && remoteUser.color
          ? remoteUser.color
          : '#6366f1';
        participants.push({
          id: remoteClientId,
          name: remoteName,
          color: remoteColor,
        });
        const outputSelection = normalizeCollabOutputSelection(state?.outputSelection, outputLength);
        if (outputSelection) {
          outputSelections.push({
            id: remoteClientId,
            start: outputSelection.start,
            end: outputSelection.end,
            name: remoteName,
            color: remoteColor,
          });
        }
        const testFileSelection = normalizeCollabOutputSelection(state?.testFileSelection, testFileLength);
        if (testFileSelection) {
          testFileSelections.push({
            id: remoteClientId,
            start: testFileSelection.start,
            end: testFileSelection.end,
            name: remoteName,
            color: remoteColor,
          });
        }
        if (COLLAB_EDITOR_CURSOR_ENABLED) {
          const cursor = state?.editorCursor;
          const cursorX = Number(cursor?.x);
          const cursorY = Number(cursor?.y);
          const cursorLineNumber = Number(cursor?.lineNumber);
          const cursorColumn = Number(cursor?.column);
          const hasCursorPosition = Number.isInteger(cursorLineNumber) && cursorLineNumber > 0
            && Number.isInteger(cursorColumn) && cursorColumn > 0;
          const hasViewportPosition = Number.isFinite(cursorX) && Number.isFinite(cursorY);
          const cursorSelection = normalizeCollabEditorSelection(cursor?.selection || state?.selection);
          if (!cursor || (!hasViewportPosition && !hasCursorPosition)) {
            cursorSeenByClient.delete(remoteClientId);
            return;
          }
          const normalizedX = hasViewportPosition ? Math.max(0, Math.min(1, cursorX)) : 0.5;
          const normalizedY = hasViewportPosition ? Math.max(0, Math.min(1, cursorY)) : 0.5;
          const remoteCursorTs = Number(cursor?.ts);
          const remoteTypingTs = Number(cursor?.typingTs);
          const cursorSignature = [
            normalizedX.toFixed(4),
            normalizedY.toFixed(4),
            hasCursorPosition ? cursorLineNumber : '',
            hasCursorPosition ? cursorColumn : '',
            cursorSelection
              ? `${cursorSelection.startLineNumber}:${cursorSelection.startColumn}-${cursorSelection.endLineNumber}:${cursorSelection.endColumn}`
              : '',
            Number.isFinite(remoteCursorTs) ? Math.round(remoteCursorTs) : '',
            cursor?.typing === true ? '1' : '0',
            Number.isFinite(remoteTypingTs) ? Math.round(remoteTypingTs) : '',
          ].join('|');
          const previousCursorSeen = cursorSeenByClient.get(remoteClientId) || null;
          const seenAt = previousCursorSeen?.signature === cursorSignature
            ? previousCursorSeen.seenAt
            : now;
          const typingSignature = cursor?.typing === true ? `${cursorSignature}|typing` : '';
          const typingSeenAt = cursor?.typing === true
            ? (previousCursorSeen?.typingSignature === typingSignature ? previousCursorSeen.typingSeenAt : now)
            : 0;
          cursorSeenByClient.set(remoteClientId, {
            signature: cursorSignature,
            seenAt,
            typingSignature,
            typingSeenAt,
          });
          if ((now - seenAt) > COLLAB_EDITOR_CURSOR_STALE_MS) return;
          const isTyping = cursor?.typing === true
            && (now - typingSeenAt) <= COLLAB_EDITOR_TYPING_STALE_MS;
          cursors.push({
            id: remoteClientId,
            x: normalizedX,
            y: normalizedY,
            ts: seenAt,
            typing: isTyping,
            typingTs: typingSeenAt || seenAt,
            ...(hasCursorPosition ? { lineNumber: cursorLineNumber, column: cursorColumn } : {}),
            ...(cursorSelection ? { selection: cursorSelection } : {}),
            name: remoteName,
            color: remoteColor,
          });
        }
      });
      cursorSeenByClient.forEach((_, clientId) => {
        if (!presentRemoteClientIds.has(clientId)) cursorSeenByClient.delete(clientId);
      });
      setRemoteParticipants(participants.sort((left, right) => left.name.localeCompare(right.name, 'ru')));
      setRemoteEditorCursors(COLLAB_EDITOR_CURSOR_ENABLED ? cursors : []);
      setRemoteOutputSelections(outputSelections);
      setRemoteTestFileSelections(testFileSelections);
    };

    provider.on('status', handleStatus);
    provider.awareness.on('change', handleAwareness);
    handleAwareness();

    return () => {
      provider.awareness.off('change', handleAwareness);
      provider.off('status', handleStatus);
      if (COLLAB_EDITOR_CURSOR_ENABLED) {
        provider.awareness.setLocalStateField('editorCursor', null);
      }
      provider.awareness.setLocalStateField('selection', null);
      provider.awareness.setLocalStateField('outputSelection', null);
      provider.awareness.setLocalStateField('testFileSelection', null);
      stopCollabOutputSelectionTracking();
      stopCollabTestFileSelectionTracking();
      collabCursorWindowStopRef.current?.();
      collabCursorWindowStopRef.current = null;
      if (collabCursorClearTimerRef.current) {
        clearTimeout(collabCursorClearTimerRef.current);
        collabCursorClearTimerRef.current = null;
      }
      testFileYText.unobserve(syncTestFileFromDoc);
      ytext.unobserve(handleReplayCodeChange);
      scheduleLessonReplayCodeSnapshot(ytext, 0);
      flushLessonReplayCodeSnapshot();
      runMap.unobserve(handleRunMapChange);
      binding.destroy();
      provider.destroy();
      doc.destroy();
      taskFilesSyncReadyRef.current = false;
      runMapRef.current = null;
      collabDocRef.current = null;
      collabTestFileRef.current = null;
      collabAwarenessRef.current = null;
      remoteEditorCursorSeenRef.current.clear();
      setTestFileText('');
      setRemoteParticipants([]);
      setRemoteEditorCursors([]);
      setRemoteOutputSelections([]);
      setRemoteTestFileSelections([]);
      outputSelectionRef.current = null;
      testFileSelectionRef.current = null;
      setLocalTestFileSelection(null);
      clearDebugSession(false);
      updateRunStateFromMap(null);
    };
  }, [
    roomId,
    editorReady,
    wsUrl,
    localName,
    localColor,
    clearDebugSession,
    editorMountVersion,
    stopCollabOutputSelectionTracking,
    stopCollabTestFileSelectionTracking,
    scheduleLessonReplayCodeSnapshot,
    flushLessonReplayCodeSnapshot,
  ]);

  const statusLabel = status === 'connected'
    ? 'Подключено'
    : (status === 'connecting' ? 'Соединяемся...' : 'Не подключено');
  const statusClass = status === 'connected'
    ? (isCollabFullscreen
      ? (isFullscreenDark
        ? 'border-emerald-300/45 bg-emerald-500/16 text-emerald-100 shadow-[0_6px_16px_rgba(5,150,105,0.2)]'
        : 'border-emerald-200 bg-emerald-50/95 text-emerald-700 shadow-[0_6px_14px_rgba(110,231,183,0.24)]')
      : 'border-emerald-200 bg-emerald-50 text-emerald-700')
    : (isCollabFullscreen
      ? (isFullscreenDark
        ? 'border-amber-300/45 bg-amber-500/18 text-amber-100 shadow-[0_6px_16px_rgba(217,119,6,0.2)]'
        : 'border-amber-200 bg-amber-50/95 text-amber-700 shadow-[0_6px_14px_rgba(252,211,77,0.22)]')
      : 'border-amber-200 bg-amber-50 text-amber-700');
  const SHOW_COLLAB_AUTOFORMAT = false;
  const isSplitCollabLayout = (isCollabFullscreen || isDesktopCollabCompact) && !isMobileViewport;
  const showEditorHeader = !isSplitCollabLayout && !useBoardGlassCodePanel;
  const editorModelValue = editorRef.current?.getModel?.()?.getValue?.() || '';
  const editorCursorPosition = editorRef.current?.getPosition?.() || { lineNumber: 1, column: 1 };
  const showEditorEmptyState = Boolean(
    useBoardGlassCodePanel
    && editorReady
    && roomId
    && status === 'connected'
    && !String(editorModelValue).trim()
  );
  const remoteEditorCursorMarkers = useMemo(() => {
    if (!COLLAB_EDITOR_CURSOR_ENABLED) return [];
    const layoutVersion = editorViewportVersion;
    if (layoutVersion < 0) return [];
    const editor = editorRef.current;
    if (!editor || !remoteEditorCursors.length) return [];
    const layout = editor.getLayoutInfo?.() || null;
    const width = Number(layout?.width) || Number(editor.getDomNode?.()?.clientWidth) || 0;
    const height = Number(layout?.height) || Number(editor.getDomNode?.()?.clientHeight) || 0;
    const contentLeft = Number(layout?.contentLeft) || 0;
    const contentWidth = Number(layout?.contentWidth) || Math.max(1, width - contentLeft);
    const scrollTop = Number(editor.getScrollTop?.()) || 0;
    const scrollLeft = Number(editor.getScrollLeft?.()) || 0;
    const monaco = monacoRef.current;
    const lineHeightOption = monaco?.editor?.EditorOption?.lineHeight
      ? Number(editor.getOption(monaco.editor.EditorOption.lineHeight))
      : 0;
    const lineHeight = Number.isFinite(lineHeightOption) && lineHeightOption > 0
      ? lineHeightOption
      : 20;
    if (!width || !height) return [];
    return remoteEditorCursors
      .map((cursor) => {
        const fallbackLeft = contentLeft + (Number(cursor?.x) * contentWidth);
        const fallbackTop = Number(cursor?.y) * height;
        let left = fallbackLeft;
        let top = fallbackTop;
        const lineNumber = Number(cursor?.lineNumber);
        const column = Number(cursor?.column);
        const hasModelPosition = Number.isInteger(lineNumber) && lineNumber > 0
          && Number.isInteger(column) && column > 0;
        if (hasModelPosition) {
          const lineTop = Number(editor.getTopForLineNumber?.(lineNumber));
          const columnLeft = Number(editor.getOffsetForColumn?.(lineNumber, column));
          if (Number.isFinite(lineTop) && Number.isFinite(columnLeft)) {
            left = contentLeft + columnLeft - scrollLeft;
            top = (lineTop - scrollTop) + Math.max(0, Math.round(lineHeight * 0.18));
          }
        }
        if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
        if (left < -24 || left > width + 24 || top < -24 || top > height + 24) return null;
        return {
          ...cursor,
          left,
          top,
        };
      })
      .filter(Boolean);
  }, [remoteEditorCursors, editorViewportVersion]);
  const remoteEditorSelectionMarkers = useMemo(() => {
    if (!COLLAB_EDITOR_CURSOR_ENABLED) return [];
    const layoutVersion = editorViewportVersion;
    if (layoutVersion < 0) return [];
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!editor || !model || !remoteEditorCursors.length) return [];
    const layout = editor.getLayoutInfo?.() || null;
    const width = Number(layout?.width) || Number(editor.getDomNode?.()?.clientWidth) || 0;
    const height = Number(layout?.height) || Number(editor.getDomNode?.()?.clientHeight) || 0;
    const contentLeft = Number(layout?.contentLeft) || 0;
    const contentWidth = Number(layout?.contentWidth) || Math.max(1, width - contentLeft);
    const scrollTop = Number(editor.getScrollTop?.()) || 0;
    const scrollLeft = Number(editor.getScrollLeft?.()) || 0;
    const monaco = monacoRef.current;
    const lineHeightOption = monaco?.editor?.EditorOption?.lineHeight
      ? Number(editor.getOption(monaco.editor.EditorOption.lineHeight))
      : 0;
    const lineHeight = Number.isFinite(lineHeightOption) && lineHeightOption > 0
      ? lineHeightOption
      : 20;
    const modelLineCount = Number(model.getLineCount?.()) || 0;
    if (!width || !height || !modelLineCount) return [];
    const markers = [];
    remoteEditorCursors.forEach((cursor) => {
      const selection = normalizeCollabEditorSelection(cursor?.selection);
      if (!selection) return;
      const startLine = Math.max(1, Math.min(modelLineCount, selection.startLineNumber));
      const endLine = Math.max(1, Math.min(modelLineCount, selection.endLineNumber));
      for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
        const maxColumn = Number(model.getLineMaxColumn?.(lineNumber)) || 1;
        const startColumn = lineNumber === selection.startLineNumber
          ? Math.max(1, Math.min(maxColumn, selection.startColumn))
          : 1;
        const endColumn = lineNumber === selection.endLineNumber
          ? Math.max(1, Math.min(maxColumn, selection.endColumn))
          : maxColumn;
        if (endColumn <= startColumn) continue;
        const lineTop = Number(editor.getTopForLineNumber?.(lineNumber));
        const startLeft = Number(editor.getOffsetForColumn?.(lineNumber, startColumn));
        const endLeft = Number(editor.getOffsetForColumn?.(lineNumber, endColumn));
        if (!Number.isFinite(lineTop) || !Number.isFinite(startLeft) || !Number.isFinite(endLeft)) continue;
        const top = lineTop - scrollTop + Math.max(2, Math.round(lineHeight * 0.13));
        const rawLeft = contentLeft + startLeft - scrollLeft;
        const rawRight = contentLeft + endLeft - scrollLeft;
        const left = Math.max(contentLeft, Math.min(width, rawLeft));
        const right = Math.max(contentLeft, Math.min(width, rawRight));
        if (right <= contentLeft || left >= width || right <= left) continue;
        if (top < -lineHeight || top > height + lineHeight) continue;
        markers.push({
          id: `${cursor.id}-${lineNumber}-${startColumn}-${endColumn}`,
          left,
          top,
          width: Math.max(2, Math.min(contentWidth, right - left)),
          height: Math.max(16, Math.round(lineHeight * 0.74)),
          color: cursor.color || '#8b5cf6',
          name: cursor.name || 'Участник',
        });
      }
    });
    return markers;
  }, [remoteEditorCursors, editorViewportVersion]);
  const remoteEditorOffscreenIndicators = useMemo(() => {
    if (!COLLAB_EDITOR_CURSOR_ENABLED) return [];
    const layoutVersion = editorViewportVersion;
    if (layoutVersion < 0) return [];
    const editor = editorRef.current;
    if (!editor || !remoteEditorCursors.length) return [];
    const visibleRanges = editor.getVisibleRanges?.() || [];
    const visibleStartLine = visibleRanges.length
      ? Math.min(...visibleRanges.map((range) => Number(range?.startLineNumber) || Infinity))
      : Infinity;
    const visibleEndLine = visibleRanges.length
      ? Math.max(...visibleRanges.map((range) => Number(range?.endLineNumber) || 0))
      : 0;
    const layout = editor.getLayoutInfo?.() || null;
    const width = Number(layout?.width) || Number(editor.getDomNode?.()?.clientWidth) || 0;
    const height = Number(layout?.height) || Number(editor.getDomNode?.()?.clientHeight) || 0;
    const contentLeft = Number(layout?.contentLeft) || 0;
    const contentWidth = Number(layout?.contentWidth) || Math.max(1, width - contentLeft);
    const scrollTop = Number(editor.getScrollTop?.()) || 0;
    const scrollLeft = Number(editor.getScrollLeft?.()) || 0;
    const monaco = monacoRef.current;
    const lineHeightOption = monaco?.editor?.EditorOption?.lineHeight
      ? Number(editor.getOption(monaco.editor.EditorOption.lineHeight))
      : 0;
    const lineHeight = Number.isFinite(lineHeightOption) && lineHeightOption > 0
      ? lineHeightOption
      : 20;
    const model = editor.getModel?.();
    const lineCount = Number(model?.getLineCount?.()) || 0;
    const counters = { up: 0, down: 0 };
    return remoteEditorCursors
      .map((cursor) => {
        const lineNumber = Number(cursor?.lineNumber);
        const column = Number(cursor?.column);
        if (!Number.isInteger(lineNumber) || lineNumber <= 0) return null;
        let direction = null;
        const lineTop = Number(editor.getTopForLineNumber?.(lineNumber));
        const canUseLineGeometry = height > 0
          && (!lineCount || lineNumber <= lineCount)
          && Number.isFinite(lineTop);
        if (canUseLineGeometry) {
          const topInViewport = lineTop - scrollTop;
          const bottomInViewport = topInViewport + lineHeight;
          if (bottomInViewport < 2) direction = 'up';
          if (topInViewport > height - 2) direction = 'down';
          if (!direction) return null;
        } else {
          if (!Number.isFinite(visibleStartLine) || !Number.isFinite(visibleEndLine) || visibleEndLine <= 0) {
            return null;
          }
          if (lineNumber >= visibleStartLine && lineNumber <= visibleEndLine) return null;
          direction = lineNumber < visibleStartLine ? 'up' : 'down';
        }
        const fallbackLeft = contentLeft + (Number(cursor?.x) * contentWidth);
        let left = Number.isFinite(fallbackLeft) ? fallbackLeft : (contentLeft + contentWidth * 0.5);
        if (Number.isInteger(column) && column > 0 && (!lineCount || lineNumber <= lineCount)) {
          const columnLeft = Number(editor.getOffsetForColumn?.(lineNumber, column));
          if (Number.isFinite(columnLeft)) {
            left = contentLeft + columnLeft - scrollLeft;
          }
        }
        const minLeft = Math.min(Math.max(72, contentLeft + 32), Math.max(0, width - 72));
        const maxLeft = Math.max(minLeft, width - 72);
        const clampedLeft = Math.max(minLeft, Math.min(maxLeft, left));
        const stackIndex = counters[direction];
        counters[direction] += 1;
        return {
          ...cursor,
          direction,
          lineNumber,
          column: Number.isInteger(column) && column > 0 ? column : null,
          left: clampedLeft,
          stackIndex,
        };
      })
      .filter(Boolean);
  }, [remoteEditorCursors, editorViewportVersion]);
  const handleJumpToRemoteEditorCursor = useCallback((cursor) => {
    const editor = editorRef.current;
    const lineNumber = Number(cursor?.lineNumber);
    if (!editor || !Number.isInteger(lineNumber) || lineNumber <= 0) return;
    const column = Number(cursor?.column);
    const position = {
      lineNumber,
      column: Number.isInteger(column) && column > 0 ? column : 1,
    };
    if (typeof editor.revealPositionInCenterIfOutsideViewport === 'function') {
      editor.revealPositionInCenterIfOutsideViewport(position);
    } else if (typeof editor.revealLineInCenterIfOutsideViewport === 'function') {
      editor.revealLineInCenterIfOutsideViewport(lineNumber);
    } else if (typeof editor.revealLineInCenter === 'function') {
      editor.revealLineInCenter(lineNumber);
    }
  }, []);
  const visibleRemoteOutputSelections = useMemo(() => (
    (Array.isArray(remoteOutputSelections) ? remoteOutputSelections : [])
      .map((selection) => {
        const range = normalizeCollabOutputSelection(selection, runOutput.length);
        return range ? { ...selection, start: range.start, end: range.end } : null;
      })
      .filter(Boolean)
  ), [remoteOutputSelections, runOutput]);
  const remoteOutputSelectionSegments = useMemo(
    () => buildCollabTextSelectionSegments(runOutput, visibleRemoteOutputSelections),
    [runOutput, visibleRemoteOutputSelections]
  );
  const visibleRemoteTestFileSelections = useMemo(() => (
    (Array.isArray(remoteTestFileSelections) ? remoteTestFileSelections : [])
      .map((selection) => {
        const range = normalizeCollabOutputSelection(selection, testFileText.length);
        return range ? { ...selection, start: range.start, end: range.end } : null;
      })
      .filter(Boolean)
  ), [remoteTestFileSelections, testFileText]);
  const remoteTestFileSelectionSegments = useMemo(
    () => buildCollabTextSelectionSegments(testFileText, visibleRemoteTestFileSelections),
    [testFileText, visibleRemoteTestFileSelections]
  );
  const remoteTestFileSelectionSummaries = useMemo(() => (
    visibleRemoteTestFileSelections
      .map((selection) => {
        const details = describeCollabTextSelection(testFileText, selection);
        return details ? { ...selection, details } : null;
      })
      .filter(Boolean)
  ), [testFileText, visibleRemoteTestFileSelections]);
  const primaryRemoteTestFileSelection = remoteTestFileSelectionSummaries[0] || null;
  const hasMultipleRemoteSelections = remoteTestFileSelectionSummaries.length > 1;
  const remoteTestFileSelectionLabel = primaryRemoteTestFileSelection
    ? `${primaryRemoteTestFileSelection.name}: ${primaryRemoteTestFileSelection.details.summary}${hasMultipleRemoteSelections ? ` +${remoteTestFileSelectionSummaries.length - 1}` : ''}`
    : '';
  const localTestFileSelectionDetails = useMemo(
    () => describeCollabTextSelection(testFileText, localTestFileSelection),
    [testFileText, localTestFileSelection]
  );
  const testFileStats = useMemo(() => {
    const text = String(testFileText || '');
    return {
      chars: text.length,
      lines: text ? text.split('\n').length : 1,
    };
  }, [testFileText]);
  const isTestFileMode = collabAuxPanelMode === COLLAB_AUX_PANEL_MODE_TEST_FILE;
  const isCollabDarkUi = isDarkTheme;
  const stdinInputCharCount = String(runInput ?? '').length;
  const stdinToggleLabel = stdinPanelOpen
    ? 'Скрыть'
    : (stdinInputCharCount ? `Показать • ${formatCollabSymbolCount(stdinInputCharCount)}` : 'Показать');
  const testFileFontSize = isSplitCollabLayout ? 14 : 15;
  const testFileTypographyStyle = useMemo(() => ({
    fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
    fontSize: `${testFileFontSize}px`,
    lineHeight: 1.7,
  }), [testFileFontSize]);
  const testFileTextPaddingClass = isSplitCollabLayout ? 'px-2.5 py-2' : 'px-3 py-2.5';
  const auxTextareaRows = isTestFileMode
    ? (isSplitCollabLayout ? (isCollabFullscreen ? 5 : 4) : (isCollabFullscreen ? (isMobileViewport ? 5 : 6) : (isMobileViewport ? 6 : 8)))
    : (isSplitCollabLayout ? (isCollabFullscreen ? 3 : 2) : (isCollabFullscreen ? (isMobileViewport ? 3 : 4) : (isMobileViewport ? 4 : 6)));
  const handleBoardCodeResizeStart = useCallback((event) => {
    if (!useBoardGlassCodePanel || isMobileViewport || typeof window === 'undefined') return;
    event.preventDefault();
    const handleNode = event.currentTarget;
    const cardNode = handleNode?.closest?.('.collab-workspace-card');
    const pointerId = event.pointerId;
    const applyFromClientX = (clientX) => {
      if (!cardNode) return;
      const rect = cardNode.getBoundingClientRect();
      if (!rect.width) return;
      const relative = ((clientX - rect.left) / rect.width) * 100;
      const nextWidth = normalizeCollabBoardCodeSplit(100 - relative);
      boardCodeSplitWidthRef.current = nextWidth;
      cardNode.style.setProperty('--collab-board-pane-width', `${nextWidth}%`);
      setBoardCodeSplitWidth(nextWidth);
    };
    const handlePointerMove = (moveEvent) => {
      applyFromClientX(moveEvent.clientX);
    };
    const stopDragging = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      try {
        handleNode?.releasePointerCapture?.(pointerId);
      } catch {
        // Ignore pointer capture cleanup failures on browsers that do not support it.
      }
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      boardCodeSplitDragCleanupRef.current = null;
      setBoardCodeSplitWidth(boardCodeSplitWidthRef.current);
    };
    boardCodeSplitDragCleanupRef.current?.();
    boardCodeSplitDragCleanupRef.current = stopDragging;
    try {
      handleNode?.setPointerCapture?.(pointerId);
    } catch {
      // Ignore pointer capture failures on browsers that do not support it.
    }
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    applyFromClientX(event.clientX);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  }, [isMobileViewport, useBoardGlassCodePanel]);

  const handleBoardCodeResizeReset = useCallback(() => {
    setBoardCodeSplitWidth(COLLAB_BOARD_CODE_SPLIT_DEFAULT);
  }, []);

  const handleBoardCodeResizeKeyDown = useCallback((event) => {
    if (!useBoardGlassCodePanel || isMobileViewport) return;
    const direction = event.key === 'ArrowLeft'
      ? 1
      : (event.key === 'ArrowRight' ? -1 : 0);
    if (!direction) return;
    event.preventDefault();
    setBoardCodeSplitWidth((current) => {
      const nextWidth = normalizeCollabBoardCodeSplit(current + (direction * 2));
      boardCodeSplitWidthRef.current = nextWidth;
      return nextWidth;
    });
  }, [isMobileViewport, useBoardGlassCodePanel]);

  const handleOutputPanelResizeStart = useCallback((event) => {
    if (!useBoardGlassCodePanel || !outputPanelOpen || typeof window === 'undefined') return;
    event.preventDefault();
    const handleNode = event.currentTarget;
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startHeight = outputPanelHeightRef.current;
    const applyHeight = (rawHeight) => {
      const nextHeight = normalizeCollabOutputPanelHeight(rawHeight);
      outputPanelHeightRef.current = nextHeight;
      setOutputPanelHeight(nextHeight);
    };
    const handlePointerMove = (moveEvent) => {
      const delta = startY - moveEvent.clientY;
      applyHeight(startHeight + delta);
    };
    const stopDragging = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      try {
        handleNode?.releasePointerCapture?.(pointerId);
      } catch {
        // Ignore pointer capture cleanup failures on browsers that do not support it.
      }
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      outputPanelResizeCleanupRef.current = null;
      setOutputPanelHeight(outputPanelHeightRef.current);
    };
    outputPanelResizeCleanupRef.current?.();
    outputPanelResizeCleanupRef.current = stopDragging;
    try {
      handleNode?.setPointerCapture?.(pointerId);
    } catch {
      // Ignore pointer capture failures on browsers that do not support it.
    }
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  }, [outputPanelOpen, useBoardGlassCodePanel]);

  const handleOutputPanelResizeReset = useCallback(() => {
    setOutputPanelHeight(COLLAB_OUTPUT_PANEL_HEIGHT_DEFAULT);
  }, []);

  const handleNotesPdfResizeStart = useCallback((event) => {
    if (!canResizeTopPane) return;
    event.preventDefault();
    const handleNode = event.currentTarget;
    const cardNode = handleNode?.closest?.('.collab-workspace-card');
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startHeight = notesPdfPanelHeightRef.current;
    notesPdfDragHeightRef.current = startHeight;
    const applyHeight = (rawHeight) => {
      const nextHeight = clampNotesPdfHeight(rawHeight);
      notesPdfDragHeightRef.current = nextHeight;
      if (cardNode) {
        cardNode.style.setProperty('--collab-board-pane-height', `${nextHeight}px`);
      }
      if (notesPdfPreviewRef.current) {
        notesPdfPreviewRef.current.style.height = `${nextHeight}px`;
      }
    };
    const handlePointerMove = (moveEvent) => {
      const delta = moveEvent.clientY - startY;
      applyHeight(startHeight + delta);
    };
    const stopDragging = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      try {
        handleNode?.releasePointerCapture?.(pointerId);
      } catch {
        // Ignore pointer capture cleanup failures on browsers that do not support it.
      }
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      notesPdfResizeCleanupRef.current = null;
      setNotesPdfPanelHeight(notesPdfDragHeightRef.current);
    };
    notesPdfResizeCleanupRef.current?.();
    notesPdfResizeCleanupRef.current = stopDragging;
    try {
      handleNode?.setPointerCapture?.(pointerId);
    } catch {
      // Ignore pointer capture failures on browsers that do not support it.
    }
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  }, [canResizeTopPane, clampNotesPdfHeight]);
  const handleNotesPdfResizeReset = useCallback(() => {
    setNotesPdfPanelHeight(
      isNotesBoardMode
        ? preferredBoardTopPaneHeight
        : clampNotesPdfHeight(isMobileViewport ? 150 : 190)
    );
  }, [clampNotesPdfHeight, isMobileViewport, isNotesBoardMode, preferredBoardTopPaneHeight]);

  const renderStudentPicker = () => {
    if (!isTeacher) return null;
    return (
      <div className={`collab-student-picker inline-flex w-full sm:w-auto items-center rounded-2xl border ${
        isCollabFullscreen
          ? (isFullscreenDark
            ? 'border-slate-600/80 bg-slate-900/78 shadow-[inset_0_1px_0_rgba(148,163,184,0.14)]'
            : 'border-slate-200 bg-white/92 shadow-[0_6px_16px_rgba(148,163,184,0.18)]')
          : 'border-purple-200/80 bg-white/90 shadow-sm shadow-purple-100/40'
      } ${
        isCollabFullscreen || isDesktopCollabCompact ? 'h-8 gap-1.5 px-2 py-0' : 'gap-2 px-3 py-2'
      }`}>
        <span className={`font-semibold uppercase tracking-widest ${
          isCollabFullscreen ? (isFullscreenDark ? 'text-cyan-300' : 'text-violet-600') : 'text-purple-500'
        } ${
          isCollabFullscreen || isDesktopCollabCompact ? 'text-[10px]' : 'text-[11px]'
        }`}>Ученик</span>
        <StudentSearchSelect
          students={students}
          value={activeStudentId || ''}
          onChange={(value) => onSelectStudent?.(value || null)}
          disabled={studentsLoading || (students || []).length === 0}
          className={`w-full min-w-0 rounded-xl border outline-none disabled:opacity-70 ${
            isCollabFullscreen
              ? (isFullscreenDark
                ? 'border-slate-600 bg-slate-950/85 text-slate-100 focus:border-cyan-400'
                : 'border-slate-200 bg-white text-slate-800 focus:border-violet-400')
              : 'border-purple-100 bg-white text-gray-700 focus:border-purple-500'
          } ${
            isCollabFullscreen || isDesktopCollabCompact
              ? 'h-7 sm:min-w-[170px] px-2.5 py-0 text-[13px]'
              : 'sm:min-w-[180px] px-3 py-1.5 text-sm'
          }`}
          dark={isFullscreenDark}
          menuClassName={isFullscreenDark ? 'border-slate-700' : ''}
        />
      </div>
    );
  };

  const notesSaveModeOptions = [
    {
      id: NOTES_SAVE_MODE_FULL_TASK,
      title: 'Задание целиком',
      badge: 'условие + решение',
      description: 'Сохранится решение вместе с карточкой задания и видимой областью доски.',
      Icon: BookOpen,
      className: 'notes-save-mode-option--full',
    },
    {
      id: NOTES_SAVE_MODE_CODE_ONLY,
      title: 'Только код',
      badge: '.py',
      description: 'Сохранится обычный Python-файл без снимка доски.',
      Icon: Code2,
      className: 'notes-save-mode-option--code',
    },
    {
      id: NOTES_SAVE_MODE_CHEATSHEET,
      title: 'Шпаргалка',
      badge: 'код-карточка',
      description: 'Сохранится только код, но в конспектах он будет оформлен как отдельная красивая шпаргалка.',
      Icon: TextSelect,
      className: 'notes-save-mode-option--cheatsheet',
    },
  ];

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
              onChange={(e) => handleSaveTaskNumberChange(e.target.value)}
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
              onChange={(e) => handleSaveCategoryChange(e.target.value)}
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
                const nextValue = String(e.target.value || '').replace(/\./g, '');
                setSaveFileName(nextValue);
                if (saveNameError && nextValue.trim()) {
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

        <div className="notes-save-mode-grid mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {notesSaveModeOptions.map((option) => {
            const active = saveMode === option.id;
            const OptionIcon = option.Icon;
            return (
              <label
                key={option.id}
                className={`notes-save-mode-option ${option.className} ${active ? 'is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="notes-save-mode"
                  value={option.id}
                  checked={active}
                  onChange={() => {
                    setSaveMode(option.id);
                    setSaveSuccess('');
                    setSaveError('');
                  }}
                  className="sr-only"
                />
                <span className="notes-save-mode-option__icon" aria-hidden="true">
                  <OptionIcon size={18} strokeWidth={2.3} />
                  <span />
                </span>
                <span className="notes-save-mode-option__body">
                  <span className="notes-save-mode-option__top">
                    <span className="notes-save-mode-option__title">{option.title}</span>
                    <span className="notes-save-mode-option__badge">{option.badge}</span>
                  </span>
                  <span className="notes-save-mode-option__description">{option.description}</span>
                </span>
              </label>
            );
          })}
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

  const collabSaveNoticeOverlay = collabSaveNotice ? (
    <div className="collab-save-notice" role="status" aria-live="polite">
      <div className="collab-save-notice__card">
        <div className="collab-save-notice__icon" aria-hidden="true">
          <CheckCircle size={30} />
        </div>
        <div className="collab-save-notice__content">
          <div className="collab-save-notice__title">Код сохранен в</div>
          <div className="collab-save-notice__path" title={collabSaveNotice.path}>
            {collabSaveNotice.path}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const editorLoadingState = (
    <div className="collab-code-loading-state" role="status" aria-live="polite">
      <div className="collab-code-loading-state__mark" aria-hidden="true">
        <RefreshCcw size={18} />
      </div>
      <div className="collab-code-loading-state__content">
        <div className="collab-code-loading-state__title">Загружаем редактор</div>
        <div className="collab-code-loading-state__subtitle">Готовим совместный код и файлы.</div>
      </div>
    </div>
  );
  const showEditorConnectionLoading = Boolean(roomId && (!editorReady || status === 'connecting'));

  const editorPane = (
    <div className={`collab-editor-surface ${showEditorHeader ? '' : 'collab-editor-surface--flush'} relative flex flex-col overflow-hidden rounded-xl border ${isSplitCollabLayout ? 'h-full' : ''} ${
      isCollabFullscreen
        ? (isFullscreenDark
          ? 'border-slate-700/90 ring-1 ring-cyan-400/10 bg-slate-950/82 shadow-[0_24px_46px_rgba(2,6,23,0.52)]'
          : 'border-slate-300/80 ring-1 ring-slate-200/70 bg-slate-950 shadow-[0_20px_44px_rgba(71,85,105,0.3)]')
        : 'border-gray-800'
    }`}>
      {showEditorHeader && (
        <div className="collab-editor-header">
          <div className="collab-editor-file">
            <span className="collab-editor-file-icon" aria-hidden="true">
              <PythonLogoIcon size={16} colored />
            </span>
            <span>main.py</span>
            <span className="collab-editor-pill">Python</span>
          </div>
          <div className="collab-editor-meta">
            <span>{roomId ? 'Совместный документ' : 'Выберите ученика'}</span>
            <span className={`collab-editor-connection collab-editor-connection--${status || 'idle'}`}>
              {roomId ? statusLabel : 'Комната не открыта'}
            </span>
          </div>
        </div>
      )}
      <div
        className="collab-editor-body relative min-h-0 flex-1"
        style={isSplitCollabLayout ? undefined : { height: editorHeight }}
      >
        {!roomId && (
          <div className={`absolute inset-0 z-10 flex items-center justify-center px-3 text-center text-sm ${
            isFullscreenDark
              ? 'bg-slate-950/80 text-slate-100'
              : (isFullscreenLight ? 'bg-white/85 text-slate-800' : 'bg-slate-900/70 text-slate-100')
          }`}>
            Выберите ученика, чтобы открыть совместный документ.
          </div>
        )}
        <Editor
          height="100%"
          language="python"
          theme={resolveMonacoColorTheme(theme)}
          beforeMount={ensureMonacoColorTheme}
          defaultValue=""
          onMount={handleEditorMount}
          options={editorOptions}
          loading={editorLoadingState}
        />
        {showEditorEmptyState && (
          <div className="collab-editor-empty-state" aria-hidden="true">
            <span className="collab-editor-empty-state__icon">
              <Code2 size={21} />
            </span>
            <strong>Начните с первой строки</strong>
            <span>Код синхронизируется со всеми участниками урока</span>
            <kbd>F5&nbsp;&nbsp;Запустить</kbd>
          </div>
        )}
        {showEditorConnectionLoading && (
          <div className="collab-code-loading-overlay" role="status" aria-live="polite">
            {editorLoadingState}
          </div>
        )}
        {remoteEditorSelectionMarkers.map((selection) => (
          <div
            key={selection.id}
            className="collab-remote-editor-selection pointer-events-none absolute select-none"
            style={{
              left: `${selection.left}px`,
              top: `${selection.top}px`,
              width: `${selection.width}px`,
              height: `${selection.height}px`,
              '--collab-remote-editor-selection-color': selection.color,
            }}
            title={`${selection.name} выделяет код`}
            aria-hidden
          />
        ))}
        {remoteEditorCursorMarkers.map((cursor) => (
          <div
            key={cursor.id}
            className="pointer-events-none absolute z-[32] select-none"
            style={{
              left: `${cursor.left}px`,
              top: `${cursor.top}px`,
              transform: 'translate(-1px, -1px)',
              '--collab-remote-editor-caret-color': cursor.color,
            }}
          >
            <span className="collab-remote-editor-caret" aria-hidden />
          </div>
        ))}
        {remoteEditorOffscreenIndicators.map((cursor) => (
          <button
            key={`${cursor.id}-${cursor.direction}`}
            type="button"
            className={`collab-remote-cursor-indicator collab-remote-cursor-indicator--${cursor.direction} ${
              cursor.typing ? 'collab-remote-cursor-indicator--typing' : ''
            }`}
            style={{
              left: `${cursor.left}px`,
              [cursor.direction === 'up' ? 'top' : 'bottom']: `${0.45 + (cursor.stackIndex * 2.05)}rem`,
              '--collab-remote-cursor-color': cursor.color,
            }}
            title={`${cursor.name || 'Участник'} ${cursor.typing ? 'печатает' : 'находится'} на строке ${cursor.lineNumber}`}
            aria-label={`${cursor.name || 'Участник'} ${cursor.typing ? 'печатает' : 'находится'} на строке ${cursor.lineNumber}`}
            onClick={() => handleJumpToRemoteEditorCursor(cursor)}
          >
            <span className="collab-remote-cursor-indicator__direction" aria-hidden>
              {cursor.direction === 'up' ? '↑' : '↓'}
            </span>
            <span
              className="collab-remote-cursor-indicator__dot"
              aria-hidden
              style={{ backgroundColor: cursor.color }}
            />
            <span className="collab-remote-cursor-indicator__body">
              <span className="collab-remote-cursor-indicator__name">
                {cursor.name || 'Участник'}
              </span>
              <span className="collab-remote-cursor-indicator__action">
                {cursor.typing ? 'печатает' : 'курсор'}
              </span>
            </span>
            <span className="collab-remote-cursor-indicator__line">
              {`строка ${cursor.lineNumber}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const inputPane = (
    <div className={`collab-aux-panel ${useBoardGlassCodePanel ? 'collab-aux-panel--board-popover' : ''} ${isSplitCollabLayout ? 'space-y-1' : 'space-y-2'} ${
      isCollabFullscreen
        ? (isFullscreenDark
          ? `rounded-xl border p-1.5 shadow-[inset_0_1px_0_rgba(148,163,184,0.12)] ${
            isTestFileMode
              ? 'border-cyan-400/30 bg-slate-900/78 ring-1 ring-cyan-300/12'
              : 'border-slate-700/80 bg-slate-900/68'
          }`
          : 'rounded-xl border border-slate-200/90 bg-white/92 p-1.5 shadow-[0_10px_28px_rgba(148,163,184,0.14)]')
        : ''
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`${isSplitCollabLayout ? 'text-[10px]' : 'text-[11px]'} font-semibold uppercase tracking-widest ${collabHintClass}`}>
          {isTestFileMode ? 'Файлы задания' : 'Ввод (stdin)'}
        </div>
        <div className="flex items-center gap-1.5">
          {!isTestFileMode && (
            <button
              type="button"
              onClick={() => setStdinPanelOpen((prev) => !prev)}
              aria-expanded={stdinPanelOpen}
              className={`inline-flex items-center rounded-xl border transition ${
                isSplitCollabLayout ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[11px]'
              } ${
                isCollabDarkUi
                  ? 'border-slate-600/80 bg-slate-950/70 text-slate-200 hover:border-violet-400 hover:text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300 hover:text-purple-700'
              }`}
            >
              {stdinToggleLabel}
            </button>
          )}
          <div className={`inline-flex items-center rounded-xl border p-0.5 ${
            isCollabDarkUi
              ? 'border-slate-700/80 bg-slate-950/70'
              : 'border-gray-200 bg-gray-100'
          }`}>
            <button
              type="button"
              onClick={() => {
                setCollabAuxPanelMode(COLLAB_AUX_PANEL_MODE_INPUT);
                setStdinPanelOpen(true);
                setTaskFilesPanelOpen(false);
              }}
              className={`rounded-lg transition ${
                isSplitCollabLayout ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[11px]'
              } ${
                !isTestFileMode
                  ? (isCollabDarkUi
                    ? 'bg-violet-500/25 text-violet-100 shadow-[0_4px_14px_rgba(139,92,246,0.24)]'
                    : 'bg-white text-violet-700 shadow-sm')
                  : (isCollabDarkUi
                    ? 'text-slate-300 hover:text-slate-100'
                    : 'text-gray-500 hover:text-gray-700')
              }`}
            >
              stdin
            </button>
            <button
              type="button"
              onClick={() => {
                setCollabAuxPanelMode(COLLAB_AUX_PANEL_MODE_TEST_FILE);
                setTaskFilesPanelOpen(true);
              }}
              className={`rounded-lg transition ${
                isSplitCollabLayout ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]'
              } ${
                isTestFileMode
                  ? (isCollabDarkUi
                    ? 'bg-cyan-400/22 text-cyan-50 ring-1 ring-cyan-300/45 shadow-[0_0_0_1px_rgba(34,211,238,0.14),0_8px_24px_rgba(6,182,212,0.22)]'
                    : 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-300 shadow-[0_8px_20px_rgba(34,211,238,0.18)]')
                  : (isCollabDarkUi
                    ? 'text-slate-300 hover:text-slate-100'
                    : 'text-gray-500 hover:text-gray-700')
              }`}
            >
              Файлы
            </button>
          </div>
        </div>
      </div>
      {(isTestFileMode || stdinPanelOpen) && (
        <div className={isTestFileMode ? (
          isCollabDarkUi
            ? 'rounded-2xl border border-cyan-400/25 bg-slate-950/72'
            : 'rounded-2xl border border-cyan-200 bg-white'
        ) : ''}>
          <div>
            {isTestFileMode && (
              <div className={`mx-2 mt-2 rounded-xl border px-3 py-2 ${
                isCollabDarkUi
                  ? 'border-cyan-400/18 bg-slate-900/88 text-slate-100'
                  : 'border-cyan-200/90 bg-cyan-50/70 text-slate-800'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText size={12} className={isCollabDarkUi ? 'text-cyan-300' : 'text-cyan-700'} />
                    <span className="truncate text-[11px] font-semibold">test.txt</span>
                    {roomId && remoteParticipants.length > 0 && (
                      <span className={`text-[10px] ${
                        isCollabDarkUi ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        {`онлайн: ${remoteParticipants.length + 1}`}
                      </span>
                    )}
                    <div className="hidden sm:flex w-[13rem] min-w-0">
                      <span
                        title={primaryRemoteTestFileSelection?.details.label || ''}
                        aria-hidden={!primaryRemoteTestFileSelection}
                        className={`inline-flex w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-opacity duration-150 ${
                          isCollabDarkUi
                            ? 'border-violet-300/22 bg-violet-400/8 text-violet-50'
                            : 'border-violet-200 bg-white text-violet-800'
                        } ${
                          primaryRemoteTestFileSelection ? 'opacity-100' : 'pointer-events-none opacity-0'
                        }`}
                      >
                        <span
                          className="inline-flex h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: primaryRemoteTestFileSelection?.color || 'transparent' }}
                        />
                        <span className="truncate">{remoteTestFileSelectionLabel || ' '}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <div className="flex w-[4.6rem] justify-end">
                      <span
                        title={localTestFileSelectionDetails?.label || ''}
                        aria-hidden={!localTestFileSelectionDetails}
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-opacity duration-150 ${
                          isCollabDarkUi
                            ? 'border-cyan-300/30 bg-cyan-400/8 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                            : 'border-cyan-200 bg-white text-cyan-800 shadow-[0_1px_2px_rgba(14,165,233,0.08)]'
                        } ${
                          localTestFileSelectionDetails ? 'opacity-100' : 'pointer-events-none opacity-0'
                        }`}
                      >
                        <span className={`inline-flex min-w-[1.35rem] items-center justify-center rounded-full px-1.5 py-[1px] text-[10px] font-semibold leading-none ${
                          isCollabDarkUi
                            ? 'bg-cyan-300/18 text-cyan-50'
                            : 'bg-cyan-100 text-cyan-900'
                        }`}>
                          {localTestFileSelectionDetails?.charCount ?? 0}
                        </span>
                        <span className={`leading-none ${
                          isCollabDarkUi ? 'text-cyan-100/80' : 'text-cyan-800/75'
                        }`}>
                          симв.
                        </span>
                      </span>
                    </div>
                    <span className={`text-[10px] ${
                      isCollabDarkUi ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      {`${testFileStats.lines} стр.`}
                    </span>
                    <span className={`text-[10px] ${
                      isCollabDarkUi ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      {formatCollabSymbolCount(testFileStats.chars)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {isTestFileMode ? (
              <div className={`relative mt-1.5 overflow-hidden rounded-[1.1rem] border ${
                isCollabDarkUi
                  ? 'border-cyan-300/22 bg-[linear-gradient(180deg,rgba(8,20,36,0.96),rgba(4,12,24,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_16px_32px_rgba(3,7,18,0.35)]'
                  : 'border-cyan-200 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,252,255,0.96))] shadow-[0_10px_24px_rgba(34,211,238,0.1)]'
              }`}>
                {remoteTestFileSelectionSegments.length > 0 && (
                  <pre
                    ref={testFileHighlightOverlayRef}
                    aria-hidden
                    className={`collab-selection-overlay pointer-events-none absolute inset-0 m-0 overflow-auto whitespace-pre-wrap break-words text-transparent ${testFileTextPaddingClass}`}
                    style={testFileTypographyStyle}
                  >
                    {remoteTestFileSelectionSegments.map((segment) => (
                      <span
                        key={segment.key}
                        style={segment.selection ? buildCollabSelectionHighlightStyle(segment.selection.color) : undefined}
                      >
                        {segment.text}
                      </span>
                    ))}
                  </pre>
                )}
                <textarea
                  ref={testFileTextareaRef}
                  value={testFileText}
                  onChange={(e) => handleTestFileTextChange(e.target.value)}
                  onPointerDown={handleCollabTestFilePointerDown}
                  onSelect={syncCollabTestFileSelectionFromTextarea}
                  onKeyUp={syncCollabTestFileSelectionFromTextarea}
                  onMouseUp={syncCollabTestFileSelectionFromTextarea}
                  onBlur={clearCollabTestFileSelection}
                  onScroll={syncCollabTestFileOverlayScroll}
                  rows={auxTextareaRows}
                  spellCheck={false}
                  disabled={!roomId}
                  placeholder={roomId ? 'Введите содержимое test.txt.' : 'Выберите ученика, чтобы редактировать test.txt.'}
                  style={{
                    ...(testFileTextareaHeight ? { height: `${testFileTextareaHeight}px` } : {}),
                    ...testFileTypographyStyle,
                  }}
                  className={`relative z-[1] block w-full resize-y border-0 bg-transparent outline-none ${testFileTextPaddingClass} ${
                    isCollabDarkUi
                      ? 'text-slate-50 placeholder:text-slate-500'
                      : 'text-slate-800 placeholder:text-slate-400'
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                />
              </div>
            ) : (
              <textarea
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
                rows={auxTextareaRows}
                placeholder="Если нужен ввод, вставьте его сюда."
                className={`w-full rounded-2xl border outline-none ${
                  isSplitCollabLayout ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
                } ${
                  isFullscreenDark
                    ? 'border-slate-700/80 bg-slate-900/70 text-slate-100 focus:border-violet-400'
                    : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-purple-500'
                } disabled:cursor-not-allowed disabled:opacity-70`}
              />
            )}
          </div>
        </div>
      )}
      {(!useBoardGlassCodePanel || isTestFileMode || taskFilesPanelOpen) && (
        <div className={`collab-task-files-panel rounded-2xl border p-2 ${isSplitCollabLayout ? 'space-y-1' : 'space-y-2'} ${
          isFullscreenDark
            ? 'border-slate-700/80 bg-slate-900/70'
            : 'border-gray-200 bg-white'
        }`}>
        <div className="flex items-center justify-between gap-2">
          <div className={`collab-task-files-title ${isSplitCollabLayout ? 'text-[10px]' : 'text-[11px]'} font-semibold uppercase tracking-widest ${collabHintClass}`}>
            Файлы задания для open()
          </div>
          <div className="flex items-center gap-1">
            <span className={`collab-task-files-count inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              isFullscreenDark
                ? 'border-slate-600 text-slate-200'
                : 'border-purple-200 text-purple-700'
            }`}>
              {selectedTaskFiles.length}
            </span>
            <button
              type="button"
              onClick={() => setTaskFilesPanelOpen((prev) => !prev)}
              aria-expanded={taskFilesPanelOpen}
              className={`collab-task-files-toggle inline-flex items-center rounded-xl border transition ${
                isSplitCollabLayout ? 'gap-0.5 px-2 py-0.5 text-[10px]' : 'gap-1 px-2 py-1 text-[11px]'
              } ${
                isFullscreenDark
                  ? 'border-slate-600 text-slate-100 hover:border-violet-400'
                  : 'border-purple-200 text-purple-700 hover:border-purple-300 hover:bg-purple-50'
              }`}
            >
              <ChevronRight
                size={12}
                className={`transition-transform duration-200 ${taskFilesPanelOpen ? 'rotate-90' : ''}`}
              />
              {taskFilesPanelOpen ? 'Скрыть' : 'Показать'}
            </button>
          </div>
        </div>
        {taskFilesPanelOpen && (
          <>
            <div className={`collab-task-files-controls grid grid-cols-1 ${isSplitCollabLayout ? 'gap-1' : 'gap-2'} md:grid-cols-3`}>
              <select
                value={runTaskNumber}
                onChange={(e) => setRunTaskNumber(e.target.value)}
                disabled={!effectiveStudentId || taskFileUploadBusy}
                className={`collab-task-files-select rounded-xl border outline-none ${
                  isSplitCollabLayout ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
                } ${
                  isFullscreenDark
                    ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-violet-400'
                    : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-purple-500'
                }`}
              >
                {taskOptions.map((task) => (
                  <option key={task.id} value={task.number}>
                    {`Задание ${getTaskDisplayNumber(task)}`}
                  </option>
                ))}
              </select>
              <select
                value={runTaskCategory}
                onChange={(e) => setRunTaskCategory(e.target.value)}
                disabled={!effectiveStudentId || taskFileUploadBusy}
                className={`collab-task-files-select rounded-xl border outline-none ${
                  isSplitCollabLayout ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
                } ${
                  isFullscreenDark
                    ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-violet-400'
                    : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-purple-500'
                }`}
              >
                <option value="class">На уроке</option>
                <option value="home">Домашка</option>
                <option value={COLLAB_TASK_FILE_CATEGORY_TESTING}>Тестирования (Успеваемость)</option>
              </select>
              <div className="flex items-center gap-1">
                <input
                  ref={taskFileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(event) => handleUploadTaskFiles(event.target.files)}
                />
                <button
                  type="button"
                  onClick={() => taskFileInputRef.current?.click()}
                  disabled={!effectiveStudentId || taskFileUploadBusy || runTaskCategory === COLLAB_TASK_FILE_CATEGORY_TESTING}
                  className={`collab-task-files-upload inline-flex w-full items-center justify-center gap-1 rounded-xl border transition ${
                    isSplitCollabLayout ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
                  } ${
                    !effectiveStudentId || taskFileUploadBusy || runTaskCategory === COLLAB_TASK_FILE_CATEGORY_TESTING
                      ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                      : (isFullscreenDark
                        ? 'border-slate-600 bg-slate-950 text-slate-100 hover:border-violet-400'
                        : 'border-purple-200 bg-white text-purple-700 hover:border-purple-300 hover:bg-purple-50')
                  }`}
                >
                  {runTaskCategory === COLLAB_TASK_FILE_CATEGORY_TESTING ? <FileText size={13} /> : <Upload size={13} />}
                  {runTaskCategory === COLLAB_TASK_FILE_CATEGORY_TESTING
                    ? 'Файлы из задач'
                    : (taskFileUploadBusy ? 'Загрузка...' : 'Загрузить файл')}
                </button>
              </div>
            </div>
            {activeTaskFilesError && (
              <div className={`text-[11px] ${isFullscreenDark ? 'text-rose-300' : 'text-rose-600'}`}>
                {activeTaskFilesError}
              </div>
            )}
            <div className={`flex flex-col ${isSplitCollabLayout ? 'gap-1' : 'gap-2'} md:flex-row md:items-center`}>
              <label className="collab-task-files-search-wrap relative min-w-0 flex-1">
                <Search
                  size={isSplitCollabLayout ? 12 : 13}
                  className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${
                    isFullscreenDark ? 'text-slate-400' : 'text-gray-400'
                  }`}
                />
                <input
                  type="text"
                  value={taskFilesSearch}
                  onChange={(e) => setTaskFilesSearch(e.target.value)}
                  placeholder="Поиск по названию файла"
                  aria-label="Поиск по названию файла"
                  className={`collab-task-files-search w-full rounded-xl border outline-none ${
                    isSplitCollabLayout ? 'py-1 pl-8 pr-8 text-[11px]' : 'py-1.5 pl-9 pr-9 text-xs'
                  } ${
                    isFullscreenDark
                      ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-violet-400'
                      : 'border-gray-200 bg-gray-50 text-gray-700 placeholder:text-gray-400 focus:border-purple-500'
                  }`}
                />
                {taskFilesSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => setTaskFilesSearch('')}
                    aria-label="Очистить поиск файлов"
                    className={`absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full transition ${
                      isFullscreenDark
                        ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                        : 'text-gray-400 hover:bg-gray-200 hover:text-gray-700'
                    } ${isSplitCollabLayout ? 'h-5 w-5' : 'h-6 w-6'}`}
                  >
                    <X size={isSplitCollabLayout ? 11 : 12} />
                  </button>
                )}
              </label>
              <div className="flex items-center justify-between gap-1 md:justify-end">
                <div className={`collab-task-files-stepper inline-flex items-center rounded-xl border ${
                  isFullscreenDark
                    ? 'border-slate-700 bg-slate-950/80'
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <button
                    type="button"
                    onClick={() => handleTaskFilesListHeightStep(-1)}
                    disabled={taskFilesListHeight <= TASK_FILES_LIST_MIN_HEIGHT}
                    aria-label="Уменьшить высоту списка файлов"
                    className={`inline-flex items-center justify-center rounded-l-xl transition ${
                      isSplitCollabLayout ? 'h-7 w-7' : 'h-8 w-8'
                    } ${
                      taskFilesListHeight <= TASK_FILES_LIST_MIN_HEIGHT
                        ? 'cursor-not-allowed text-gray-400'
                        : (isFullscreenDark
                          ? 'text-slate-100 hover:bg-slate-800 hover:text-violet-200'
                          : 'text-purple-700 hover:bg-purple-50')
                    }`}
                  >
                    <Minus size={isSplitCollabLayout ? 12 : 13} />
                  </button>
                  <span className={`collab-task-files-height-value min-w-[3.25rem] text-center font-medium ${
                    isSplitCollabLayout ? 'text-[10px]' : 'text-[11px]'
                  } ${isFullscreenDark ? 'text-slate-300' : 'text-gray-600'}`}>
                    {`${Math.round(taskFilesListHeight)} px`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTaskFilesListHeightStep(1)}
                    disabled={taskFilesListHeight >= TASK_FILES_LIST_MAX_HEIGHT}
                    aria-label="Увеличить высоту списка файлов"
                    className={`inline-flex items-center justify-center rounded-r-xl transition ${
                      isSplitCollabLayout ? 'h-7 w-7' : 'h-8 w-8'
                    } ${
                      taskFilesListHeight >= TASK_FILES_LIST_MAX_HEIGHT
                        ? 'cursor-not-allowed text-gray-400'
                        : (isFullscreenDark
                          ? 'text-slate-100 hover:bg-slate-800 hover:text-violet-200'
                          : 'text-purple-700 hover:bg-purple-50')
                    }`}
                  >
                    <Plus size={isSplitCollabLayout ? 12 : 13} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSelectAllTaskFiles}
                  disabled={activeTaskFilesLoading || !visibleTaskFiles.length}
                  className={`collab-task-files-select-all inline-flex items-center rounded-xl border transition ${
                    isSplitCollabLayout ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
                  } ${
                    activeTaskFilesLoading || !visibleTaskFiles.length
                      ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                      : (isFullscreenDark
                        ? 'border-slate-600 bg-slate-950 text-slate-100 hover:border-violet-400'
                        : 'border-purple-200 bg-white text-purple-700 hover:border-purple-300 hover:bg-purple-50')
                  }`}
                >
                  {allVisibleTaskFilesSelected ? 'Снять всё' : 'Выделить всё'}
                </button>
              </div>
            </div>
            <div className={`collab-task-files-meta text-[10px] ${isFullscreenDark ? 'text-slate-400' : 'text-gray-500'}`}>
              {normalizedTaskFilesSearch
                ? `Найдено: ${visibleTaskFiles.length}`
                : `Файлов в списке: ${filteredTaskFiles.length}`}
            </div>
            <div
              className={`collab-task-files-list rounded-xl border overflow-auto ${
                isFullscreenDark
                  ? 'border-slate-700/80 bg-slate-950/60'
                  : 'border-gray-200 bg-gray-50'
              }`}
              style={{ maxHeight: `${taskFilesListHeight}px` }}
            >
              {activeTaskFilesLoading ? (
                <div className={`collab-task-files-empty px-2 py-1.5 text-[11px] ${isFullscreenDark ? 'text-slate-400' : 'text-gray-500'}`}>
                  Загружаем файлы...
                </div>
              ) : (
                <>
                  {!visibleTaskFiles.length ? (
                    <div className={`collab-task-files-empty px-2 py-1.5 text-[11px] ${isFullscreenDark ? 'text-slate-400' : 'text-gray-500'}`}>
                      {normalizedTaskFilesSearch
                        ? `По запросу "${taskFilesSearch.trim()}" ничего не найдено.`
                        : 'Файлы не найдены.'}
                    </div>
                  ) : (
                    visibleTaskFiles.map((file) => {
                      const runtimePath = getRuntimePathForTaskFile(file) || file?.name || 'file';
                      const displayRuntimePath = getPreferredRuntimePathForTaskFile(file, filteredTaskFiles) || runtimePath;
                      return (
                        <label
                          key={file.id}
                          className={`collab-task-files-row flex cursor-pointer items-start gap-2 border-b px-2 py-1.5 text-[11px] last:border-b-0 ${
                            isFullscreenDark
                              ? 'border-slate-800 text-slate-100'
                              : 'border-gray-200 text-gray-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedTaskFileIds.includes(file.id)}
                            onChange={() => handleToggleTaskFile(file.id)}
                            className="collab-task-files-checkbox mt-0.5 h-3.5 w-3.5 rounded border-gray-300"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate" title={runtimePath}>{displayRuntimePath}</span>
                            {file?.sourceKind === COLLAB_TASK_FILE_CATEGORY_TESTING && (
                              <span className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] ${
                                isFullscreenDark ? 'text-slate-400' : 'text-gray-500'
                              }`}>
                                <span className="truncate">{`${file.levelLabel} · ${file.questionLabel}`}</span>
                                <code className={`shrink-0 rounded px-1 py-px ${
                                  isFullscreenDark ? 'bg-slate-800 text-cyan-200' : 'bg-purple-100 text-purple-700'
                                }`}>{`open("${file.name}")`}</code>
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </>
              )}
            </div>
            <div className={`collab-task-files-note text-[10px] ${isFullscreenDark ? 'text-slate-400' : 'text-gray-500'}`}>
              {runTaskCategory === COLLAB_TASK_FILE_CATEGORY_TESTING
                ? <>Выберите файл нужной задачи. При выборе одного файла сохраняется его исходное имя: например, <code>open("17.txt")</code>.</>
                : <>Выбранные файлы доступны по пути из списка. Если имя уникально, можно открыть просто файл, иначе используйте путь с подпапкой. <code>test.txt</code> доступен всегда и редактируется во вкладке выше.</>}
            </div>
          </>
          )}
        </div>
      )}
    </div>
  );
  const handleTopPaneModeChange = (nextMode) => {
    const normalizedMode = normalizeCollabTopPaneMode(nextMode);
    setNotesPanelMode(normalizedMode);
    setNotesPdfPanelOpen(true);
    if (normalizedMode === COLLAB_TOP_PANE_MODE_BOARD) {
      setNotesPdfPanelHeight((prev) => Math.max(prev, preferredBoardTopPaneHeight));
    }
    publishRunStateRef.current?.({
      notesPdfOpen: true,
      notesPanelMode: normalizedMode,
      notesPdfFolderKey: selectedNotesPdfFolderKey || '',
      notesPdfFileId: notesPdfFileId || selectedNotesPdfFile?.id || '',
    });
  };
  const notesTopPaneResizeHandle = (
    <div
      role="separator"
      aria-label="Изменить высоту верхней панели"
      aria-orientation="horizontal"
      aria-valuemin={notesPdfMinHeight}
      aria-valuemax={notesPdfMaxHeight}
      aria-valuenow={Math.round(notesPdfPanelHeight)}
      onPointerDown={handleNotesPdfResizeStart}
      onDoubleClick={handleNotesPdfResizeReset}
      className="collab-top-pane-resize-handle group absolute inset-x-0 bottom-0 z-30 flex h-6 translate-y-[32%] cursor-row-resize select-none touch-none items-center justify-center"
      title="Тяните вверх или вниз, чтобы изменить высоту. Двойной клик — сброс."
    >
      <div className="relative flex h-full w-full items-center justify-center">
        <div className={`absolute inset-x-2 top-1/2 h-[2px] -translate-y-1/2 rounded-full transition ${
          isFullscreenDark
            ? 'bg-slate-700/80 group-hover:bg-violet-400/80'
            : 'bg-slate-300/90 group-hover:bg-purple-400'
        }`} />
        <div className={`relative inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-semibold shadow-sm transition-all duration-150 group-hover:-translate-y-[1px] ${
          isFullscreenDark
            ? 'border-slate-600 bg-slate-950 text-slate-100 group-hover:border-violet-400'
            : 'border-purple-200 bg-white text-purple-700 group-hover:border-purple-300'
        }`}>
          <ChevronsUpDown size={11} aria-hidden="true" />
          <span className="hidden sm:inline">Тяни вверх/вниз</span>
          <span className="sm:hidden">Тяни</span>
        </div>
      </div>
    </div>
  );
  const collabBoardFullscreenButton = (
    <button
      type="button"
      onClick={toggleCollabFullscreen}
      className={`collab-board-fullscreen-button ${isCollabFullscreen ? 'is-active' : ''}`}
      title={isCollabFullscreen ? 'Выйти из фулл фокуса' : 'Фулл фокус'}
      aria-label={isCollabFullscreen ? 'Выйти из фулл фокуса' : 'Фулл фокус'}
    >
      {isCollabFullscreen ? <Minimize2 size={17} /> : <Expand size={17} />}
    </button>
  );
  const notesPdfPane = (
    <div className={`collab-top-pane ${canResizeTopPane ? 'collab-top-pane--resizable' : ''} rounded-xl border ${isCollabFullscreen ? 'px-1 pt-1 pb-0' : 'px-1 pt-0.5 pb-0'} ${isSplitCollabLayout ? 'space-y-0.5' : 'space-y-1'} ${
      isFullscreenDark
        ? 'border-slate-700/80 bg-slate-900/70'
        : 'border-gray-200 bg-white'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className={`flex min-w-0 items-center gap-1 ${isSplitCollabLayout ? 'text-[9px]' : 'text-[10px]'} font-semibold uppercase tracking-widest ${collabHintClass}`}>
          {isNotesBoardMode ? <Brush size={11} /> : <FileText size={11} />}
          <span className="truncate">Материалы урока</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <div className={`inline-flex items-center rounded-xl border p-0.5 ${
            isFullscreenDark
              ? 'border-slate-700 bg-slate-950/70'
              : 'border-gray-200 bg-gray-50'
          }`}>
            {[
              { id: COLLAB_TOP_PANE_MODE_PDF, label: 'PDF', icon: FileText },
              { id: COLLAB_TOP_PANE_MODE_BOARD, label: 'Доска', icon: Brush },
            ].map((modeOption) => {
              const Icon = modeOption.icon;
              const active = notesPanelMode === modeOption.id;
              return (
                <button
                  key={modeOption.id}
                  type="button"
                  onClick={() => handleTopPaneModeChange(modeOption.id)}
                  className={`inline-flex items-center gap-1 rounded-lg transition ${
                    isSplitCollabLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
                  } ${
                    active
                      ? (isFullscreenDark
                        ? 'bg-violet-500/20 text-slate-50'
                        : 'bg-white text-purple-700 shadow-sm')
                      : (isFullscreenDark
                        ? 'text-slate-300 hover:text-slate-100'
                        : 'text-gray-500 hover:text-gray-700')
                  }`}
                >
                  <Icon size={11} />
                  {modeOption.label}
                </button>
              );
            })}
          </div>
          {!isNotesBoardMode && (
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
              isFullscreenDark
                ? 'border-slate-600 text-slate-200'
                : 'border-purple-200 text-purple-700'
            }`}>
              {notesPdfFiles.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              const nextOpen = !notesPdfPanelOpen;
              setNotesPdfPanelOpen(nextOpen);
              if (nextOpen && isNotesBoardMode) {
                setNotesPdfPanelHeight((prev) => Math.max(prev, preferredBoardTopPaneHeight));
              }
              publishRunStateRef.current?.({
                notesPdfOpen: nextOpen,
                notesPanelMode,
                notesPdfFolderKey: selectedNotesPdfFolderKey || '',
                notesPdfFileId: notesPdfFileId || selectedNotesPdfFile?.id || '',
              });
            }}
            aria-expanded={notesPdfPanelOpen}
            className={`collab-notes-pdf-toggle inline-flex items-center rounded-xl border transition ${
              isSplitCollabLayout ? 'gap-0.5 px-1.5 py-0.5 text-[9px]' : 'gap-0.5 px-1.5 py-0.5 text-[10px]'
            } ${
              isFullscreenDark
                ? 'border-slate-600 text-slate-100 hover:border-violet-400'
                : 'border-purple-200 text-purple-700 hover:border-purple-300 hover:bg-purple-50'
            }`}
          >
            <ChevronRight
              size={12}
              className={`transition-transform duration-200 ${notesPdfPanelOpen ? 'rotate-90' : ''}`}
            />
            {notesPdfPanelOpen ? 'Скрыть' : 'Показать'}
          </button>
        </div>
      </div>
      {notesPdfPanelOpen && (
        <>
          {!isNotesBoardMode && (
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <select
                value={selectedNotesPdfFolderKey}
                onChange={(e) => {
                  const nextFolderKey = e.target.value;
                  const folderFiles = notesPdfFiles.filter((file) => getNotesPdfFolderKey(file) === nextFolderKey);
                  const nextFileId = folderFiles.some((file) => file.id === notesPdfFileId)
                    ? notesPdfFileId
                    : String(folderFiles[0]?.id || '');
                  setNotesPdfFolderKey(nextFolderKey);
                  setNotesPdfFileId(nextFileId);
                  publishRunStateRef.current?.({
                    notesPdfOpen: true,
                    notesPanelMode: COLLAB_TOP_PANE_MODE_PDF,
                    notesPdfFolderKey: nextFolderKey,
                    notesPdfFileId: nextFileId,
                  });
                }}
                disabled={!notesPdfFolders.length}
                className={`min-w-0 flex-[1.05] rounded-xl border outline-none ${
                  isSplitCollabLayout ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
                } ${
                  isFullscreenDark
                    ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-violet-400 disabled:opacity-60'
                    : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-purple-500 disabled:opacity-60'
                }`}
              >
                {!notesPdfFolders.length ? (
                  <option value="">Папки не найдены</option>
                ) : (
                  notesPdfFolders.map((folder) => (
                    <option key={folder.key} value={folder.key}>
                      {folder.label}
                    </option>
                  ))
                )}
              </select>
              <select
                value={notesPdfFileId}
                onChange={(e) => {
                  const nextFileId = e.target.value;
                  setNotesPdfFileId(nextFileId);
                  publishRunStateRef.current?.({
                    notesPdfOpen: true,
                    notesPanelMode: COLLAB_TOP_PANE_MODE_PDF,
                    notesPdfFolderKey: selectedNotesPdfFolderKey || '',
                    notesPdfFileId: nextFileId,
                  });
                }}
                disabled={!notesPdfFilesInSelectedFolder.length}
                className={`min-w-0 flex-[1.35] rounded-xl border outline-none ${
                  isSplitCollabLayout ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
                } ${
                  isFullscreenDark
                    ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-violet-400 disabled:opacity-60'
                    : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-purple-500 disabled:opacity-60'
                }`}
              >
                {!notesPdfFilesInSelectedFolder.length ? (
                  <option value="">Файлы в папке не найдены</option>
                ) : (
                  notesPdfFilesInSelectedFolder.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name || 'pdf'}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!canOpenSelectedNotesPdf || typeof window === 'undefined') return;
                  window.open(selectedNotesPdfUrl, '_blank', 'noopener,noreferrer');
                }}
                disabled={!canOpenSelectedNotesPdf}
                className={`shrink-0 inline-flex items-center justify-center rounded-xl border transition ${
                  isSplitCollabLayout ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
                } ${
                  canOpenSelectedNotesPdf
                    ? (isFullscreenDark
                      ? 'border-slate-600 bg-slate-950 text-slate-100 hover:border-violet-400'
                      : 'border-purple-200 bg-white text-purple-700 hover:border-purple-300 hover:bg-purple-50')
                    : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                Открыть отдельно
              </button>
            </div>
          )}
          {isNotesBoardMode ? (
            <>
              <div className="collab-board-underlay-wrap relative">
                <div
                  ref={notesPdfPreviewRef}
                  className={`collab-board-stage overflow-hidden rounded-[0.7rem] ${
                    isFullscreenDark
                      ? 'border-slate-700/80 bg-slate-950/30'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                  style={{ height: `${notesPdfPanelHeight}px` }}
                >
                  {collabBoardFullscreenButton}
                  <BoardSection
                    embedded
                    hideStudentPicker
                    showEmbeddedSummonButton={isTeacher}
                    role={role}
                    userId={userId}
                    userName={userName}
                    teacherId={teacherId}
                    tasks={tasks}
                    students={students}
                    activeStudentId={activeStudentId}
                    onSelectStudent={onSelectStudent}
                    studentsLoading={studentsLoading}
                    theme={theme}
                    onMemorySnapshotRenderer={setCollabBoardMemorySnapshotRenderer}
                    onLessonReplayEvent={onLessonReplayEvent}
                  />
                </div>
                {notesTopPaneResizeHandle}
              </div>
            </>
          ) : selectedNotesPdfFile ? (
            <>
              <div className="relative">
                <div className={`collab-pdf-stage overflow-hidden rounded-[0.7rem] border ${
                  isFullscreenDark
                    ? 'border-slate-700/80 bg-slate-950/60'
                    : 'border-gray-200 bg-gray-50'
                }`} style={{ height: `${notesPdfPanelHeight}px` }} ref={notesPdfPreviewRef}>
                  {notesPdfPreviewState.status === 'ready' && selectedNotesPdfEmbedUrl ? (
                    <iframe
                      title={selectedNotesPdfFile.name || 'PDF из конспектов'}
                      src={selectedNotesPdfEmbedUrl}
                      className="h-full w-full"
                    />
                  ) : (
                    <div className={`flex h-full items-center justify-center px-4 text-center text-sm ${
                      notesPdfPreviewState.status === 'error'
                        ? 'text-rose-500'
                        : (isFullscreenDark ? 'text-slate-300' : 'text-gray-500')
                    }`}>
                      {notesPdfPreviewState.status === 'checking'
                        ? 'Проверяем доступ к PDF...'
                        : (notesPdfPreviewState.message || 'Не удалось открыть PDF.')}
                    </div>
                  )}
                </div>
                {notesTopPaneResizeHandle}
              </div>
            </>
          ) : (
            <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${
              isFullscreenDark
                ? 'border-slate-700 text-slate-400'
                : 'border-gray-200 bg-gray-50 text-gray-500'
            }`}>
              PDF в конспектах пока нет.
            </div>
          )}
        </>
      )}
    </div>
  );
  const resultConsoleClass = `collab-result-console rounded-xl border p-2 text-sm font-mono ${
    isFullscreenDark
      ? 'bg-slate-950/92 text-slate-100'
      : (isFullscreenLight ? 'bg-slate-900 text-slate-100' : 'bg-slate-950 text-slate-100')
  } ${
    isSplitCollabLayout ? 'min-h-0 h-full overflow-auto' : 'min-h-[160px]'
  } ${
    runStatus === 'running'
      ? 'border-amber-300/70 shadow-[0_0_24px_rgba(251,191,36,0.25)]'
      : (isFullscreenDark ? 'border-slate-700/90' : 'border-gray-900')
  }`;
  const collabTurtleDisplayAuthor = collabTurtleAuthor || runAuthor;

  const resultConsole = (
    <div className={resultConsoleClass}>
      {collabTurtleScene?.used && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-2 text-[11px] text-emerald-100">
          <span>
            {`🐢 Рисунок Turtle${collabTurtleDisplayAuthor ? ` от ${collabTurtleDisplayAuthor}` : ''}: ${collabTurtleScene.primitives.length.toLocaleString('ru-RU')} элементов`}
          </span>
          <button
            type="button"
            className="rounded-md border border-emerald-300/45 bg-emerald-300/10 px-2 py-1 font-sans font-bold text-emerald-100 transition hover:bg-emerald-300/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            onClick={() => setCollabTurtleWindowOpen(true)}
          >
            Открыть
          </button>
        </div>
      )}
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
            <div className="mt-1">
              <div ref={outputViewportRef} className="relative">
                {remoteOutputSelectionSegments.length > 0 && (
                  <pre
                    aria-hidden
                    className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words text-transparent"
                  >
                    {remoteOutputSelectionSegments.map((segment) => (
                      <span
                        key={segment.key}
                        style={segment.selection ? COLLAB_OUTPUT_SELECTION_STYLE : undefined}
                      >
                        {segment.text}
                      </span>
                    ))}
                  </pre>
                )}
                <textarea
                  ref={outputTextareaRef}
                  value={runOutput}
                  readOnly
                  rows={1}
                  spellCheck={false}
                  aria-label="Вывод программы"
                  onPointerDown={handleCollabOutputPointerDown}
                  onSelect={syncCollabOutputSelectionFromTextarea}
                  onKeyUp={syncCollabOutputSelectionFromTextarea}
                  onMouseUp={syncCollabOutputSelectionFromTextarea}
                  onBlur={clearCollabOutputSelection}
                  className="relative z-[1] block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-inherit outline-none"
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    fontWeight: 'inherit',
                    lineHeight: 'inherit',
                  }}
                />
              </div>
            </div>
          )}
          {runError && (
            <pre className="mt-2 whitespace-pre-wrap break-words text-rose-300">{runError}</pre>
          )}
        </>
      ) : (
        <div className="collab-result-empty text-slate-400">
          {collabTurtleScene?.used ? 'Программа завершила построение рисунка.' : 'Здесь появится вывод программы.'}
        </div>
      )}
    </div>
  );

  const debugPane = debugActive ? (
    <div className={`rounded-2xl border p-3 text-xs ${
      isFullscreenDark
        ? 'border-cyan-500/35 bg-slate-900/78 text-slate-100 shadow-[inset_0_1px_0_rgba(148,163,184,0.12)]'
        : (isFullscreenLight
          ? 'border-violet-200 bg-white/92 text-slate-800'
          : 'border-violet-200 bg-violet-50/70 text-slate-800')
    } ${isSplitCollabLayout ? 'max-h-[24vh] overflow-auto' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className={`text-[11px] font-semibold uppercase tracking-widest ${isFullscreenDark ? 'text-cyan-300' : 'text-violet-500'}`}>Пошаговый дебаг</div>
          <div className="mt-1 text-[12px]">
            {`Шаг ${Math.max(0, debugStepIndex + 1)} из ${debugTrace.length}`}
            {debugTraceTruncated ? ' • Трасса ограничена по размеру' : ''}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">F10 шаг • F8 продолжить • F7 назад • Esc выйти • точка останова: клик по номеру строки</div>
        </div>
      </div>

      {currentDebugStep && (
        <div className={`mt-3 rounded-xl border p-2 ${
          isFullscreenDark
            ? 'border-slate-700/80 bg-slate-950/80'
            : 'border-violet-200/80 bg-white'
        }`}>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`font-semibold ${isFullscreenDark ? 'text-cyan-300' : 'text-violet-500'}`}>{`Строка ${currentDebugStep.line || '?'}`}</span>
            <span className={isFullscreenDark ? 'text-slate-400' : 'text-slate-500'}>{`Событие: ${currentDebugStep.event || 'line'}`}</span>
            <span className={isFullscreenDark ? 'text-slate-400' : 'text-slate-500'}>{`Функция: ${currentDebugStep.func || '<module>'}`}</span>
          </div>
          {currentDebugLineText && (
            <pre className={`mt-2 whitespace-pre-wrap break-words rounded-lg px-2 py-1 text-[11px] ${
              isFullscreenDark ? 'bg-slate-900 text-cyan-200' : 'bg-slate-950 text-cyan-100'
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
                  isFullscreenDark ? 'bg-slate-900/80 text-slate-200' : 'bg-slate-100 text-slate-700'
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

  const mergeHeaderIntoToolbar = isDesktopCollabCompact || isCollabFullscreen;
  const collabSplitGridTemplateColumns = 'minmax(0, 1fr)';
  const collabStackedEditorHeight = isCollabFullscreen ? '100%' : editorHeight;
  const collabOutputPanelStyle = {
    '--collab-stacked-output-height': useBoardGlassCodePanel
      ? `${normalizeCollabOutputPanelHeight(outputPanelHeight)}px`
      : (isCollabFullscreen
        ? 'clamp(220px, 30vh, 360px)'
        : 'clamp(190px, 30%, 300px)'),
  };
  const shouldShowStackedOutput = !useBoardGlassCodePanel || outputPanelOpen;
  const shouldShowStackedAuxContent = Boolean(debugPane || !useBoardGlassCodePanel);
  const stackedOutputPane = (shouldShowStackedOutput || shouldShowStackedAuxContent) ? (
    <div
      className={`collab-output-pane collab-output-pane--below-code min-h-0 min-w-0 ${
        shouldShowStackedOutput ? 'collab-output-pane--revealed' : 'collab-output-pane--aux-only'
      }`}
      style={collabOutputPanelStyle}
    >
      {useBoardGlassCodePanel && shouldShowStackedOutput && (
        <div
          role="separator"
          aria-label="Изменить высоту вывода"
          aria-orientation="horizontal"
          aria-valuemin={COLLAB_OUTPUT_PANEL_HEIGHT_MIN}
          aria-valuemax={COLLAB_OUTPUT_PANEL_HEIGHT_MAX}
          aria-valuenow={Math.round(normalizeCollabOutputPanelHeight(outputPanelHeight))}
          onPointerDown={handleOutputPanelResizeStart}
          onDoubleClick={handleOutputPanelResizeReset}
          className="collab-output-resize-handle"
          title="Тяните вверх или вниз, чтобы изменить высоту вывода. Двойной клик - сброс."
        >
          <span className="collab-output-resize-handle__line" aria-hidden="true" />
          <span className="collab-output-resize-handle__thumb" aria-hidden="true">
            <ChevronsUpDown size={13} />
          </span>
        </div>
      )}
      <div className={`collab-output-stack flex min-h-0 flex-col ${isCollabFullscreen ? 'gap-1.5' : 'gap-1.5'}`}>
        {shouldShowStackedOutput && (
          <div className={`collab-result-card min-h-0 flex flex-col rounded-xl border ${isCollabFullscreen ? 'p-1' : 'p-1.5'} ${
            isCollabFullscreen
              ? (isFullscreenDark
                ? 'border-slate-700/85 ring-1 ring-cyan-400/10 bg-slate-950/72 shadow-[0_16px_34px_rgba(2,6,23,0.4),inset_0_1px_0_rgba(148,163,184,0.12)]'
                : 'border-slate-200 ring-1 ring-violet-200/80 bg-white/92 shadow-[0_14px_30px_rgba(148,163,184,0.2)]')
              : 'border-gray-200 bg-white'
          }`}>
            {useBoardGlassCodePanel && (
              <div className="collab-output-header-reference">
                <div className="collab-output-title-reference">
                  <ChevronRight size={15} />
                  <span>Вывод</span>
                </div>
                <div className="collab-output-actions-reference">
                  <span aria-hidden="true"><Expand size={14} /></span>
                  <span aria-hidden="true"><Settings size={14} /></span>
                  <span aria-hidden="true"><Lock size={14} /></span>
                  <button
                    type="button"
                    className="collab-output-action-button collab-output-close-button"
                    onClick={handleCloseOutputPanel}
                    title="Закрыть вывод"
                    aria-label="Закрыть вывод"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
            <div className="collab-result-body min-h-0 flex-1">
              {resultConsole}
            </div>
          </div>
        )}
        {debugPane}
        {!useBoardGlassCodePanel && inputPane}
      </div>
    </div>
  ) : null;
  const boardCodeAuxPopover = useBoardGlassCodePanel && isBoardCodeAuxOpen ? (
    <div className="collab-board-aux-popover" role="dialog" aria-label="Ввод и файлы">
      <div className="collab-board-aux-popover__header">
        <div className="collab-board-aux-popover__title">
          <FileText size={15} />
          <span>Ввод и файлы</span>
        </div>
        <button
          type="button"
          className="collab-board-aux-popover__close"
          onClick={closeBoardAuxPopover}
          aria-label="Закрыть ввод и файлы"
          title="Закрыть"
        >
          <X size={15} />
        </button>
      </div>
      {inputPane}
    </div>
  ) : null;
  const collabTopActions = (
    <div className={`collab-top-actions flex flex-wrap items-center ${
      isCollabFullscreen
        ? 'gap-1.5 md:justify-end'
        : (isDesktopCollabCompact ? 'gap-1.5' : 'gap-2')
    }`}>
      {isTeacher && (!isCollabFullscreen || !activeStudentId) && renderStudentPicker()}
      <button
        type="button"
        onClick={() => setSaveModalOpen(true)}
        className="collab-code-action-icon"
        title="Сохранить в конспекты"
        aria-label="Сохранить в конспекты"
      >
        <Save size={19} />
      </button>
      <span
        className={`collab-code-action-icon collab-code-status-icon ${status === 'connected' ? 'is-connected' : (status === 'connecting' ? 'is-connecting' : 'is-disconnected')}`}
        role="status"
        title={statusLabel}
        aria-label={statusLabel}
      >
        {status === 'connected'
          ? <CheckCircle size={19} />
          : (status === 'connecting' ? <RefreshCcw size={19} /> : <AlertCircle size={19} />)}
      </span>
      {roomId && (
        <span
          className="collab-code-action-icon collab-code-online-icon"
          title={`Онлайн: ${peerCount}`}
          aria-label={`Онлайн: ${peerCount}`}
        >
          <Users size={19} />
          <span className="collab-code-online-count" aria-hidden="true">
            {Number(peerCount) > 99 ? '99+' : Math.max(0, Number(peerCount) || 0)}
          </span>
        </span>
      )}
    </div>
  );

  const collabTurtleWindow = collabTurtleWindowOpen && collabTurtleScene?.used ? (
    <div
      className={`student-test-turtle-window collab-turtle-window${collabTurtleWindowFullscreen ? ' is-fullscreen' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeCollabTurtleWindow();
      }}
    >
      <section
        className="student-test-turtle-window__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collab-turtle-window-title"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          event.preventDefault();
          collabTurtleCloseRef.current?.focus();
        }}
      >
        <header className="student-test-turtle-window__header">
          <div className="student-test-turtle-window__title">
            <span className="student-test-turtle-window__icon" aria-hidden="true">🐢</span>
            <div>
              <strong id="collab-turtle-window-title">Turtle Graphics</strong>
              <small>
                {collabTurtleDisplayAuthor
                  ? `Совместный запуск · ${collabTurtleDisplayAuthor}`
                  : 'Рисунок из совместного кода'}
              </small>
            </div>
          </div>
          <div className="student-test-turtle-window__actions">
            <button
              type="button"
              className="student-test-turtle-window__close student-test-turtle-window__fullscreen"
              onClick={() => setCollabTurtleWindowFullscreen((current) => !current)}
              aria-pressed={collabTurtleWindowFullscreen}
              aria-label={collabTurtleWindowFullscreen
                ? 'Выйти из полноэкранного режима Turtle'
                : 'Развернуть окно Turtle на весь экран'}
              title={collabTurtleWindowFullscreen ? 'Свернуть окно' : 'На весь экран'}
            >
              {collabTurtleWindowFullscreen ? <Minimize2 size={18} /> : <Expand size={18} />}
            </button>
            <button
              ref={collabTurtleCloseRef}
              type="button"
              className="student-test-turtle-window__close"
              onClick={closeCollabTurtleWindow}
              aria-label="Закрыть окно Turtle"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="student-test-turtle-window__body">
          <TurtleCanvas drawing={collabTurtleScene} />
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div ref={collabRootRef} className={collabShellClass} style={collabShellStyle}>
      {collabSaveNoticeOverlay}
      {isCollabFullscreen && (
        <>
          <div className={`pointer-events-none absolute -left-24 top-[-110px] h-[320px] w-[320px] rounded-full blur-3xl ${
            isFullscreenDark ? 'bg-cyan-400/16' : 'bg-cyan-300/22'
          }`} />
          <div className={`pointer-events-none absolute -right-24 top-[-100px] h-[300px] w-[300px] rounded-full blur-3xl ${
            isFullscreenDark ? 'bg-violet-500/16' : 'bg-violet-300/20'
          }`} />
          <div className={`pointer-events-none absolute inset-0 opacity-[0.2] ${
            isFullscreenDark
              ? 'bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.07)_1px,transparent_1px)] [background-size:36px_36px]'
              : 'bg-[linear-gradient(to_right,rgba(148,163,184,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:40px_40px]'
          }`} />
        </>
      )}
      {!mergeHeaderIntoToolbar && (
        <div className={`flex flex-col md:flex-row md:items-center md:justify-between ${
          isCollabFullscreen
            ? (isFullscreenDark
              ? 'sticky top-2 z-20 mb-2.5 gap-3 rounded-2xl border border-slate-700/75 bg-slate-950/72 px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-[0_10px_26px_rgba(2,6,23,0.35)] backdrop-blur-xl'
              : 'sticky top-2 z-20 mb-2.5 gap-3 rounded-2xl border border-slate-200/90 bg-white/88 px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-[0_10px_26px_rgba(148,163,184,0.2)] backdrop-blur-xl')
            : 'mb-6 gap-3'
        }`}>
          <div>
            <h2 className={`font-bold flex items-center gap-2 ${
              isCollabFullscreen ? 'text-lg sm:text-xl' : 'text-2xl'
            } ${collabTitleClass}`}>
              <Pencil size={isCollabFullscreen ? 18 : 24} className={collabLabelClass} />
              Совместный код
            </h2>
            <p className={`${collabSubtitleClass} ${isCollabFullscreen ? 'text-xs' : ''}`}>
              Живой документ: изменения видны сразу.
            </p>
          </div>
          {collabTopActions}
        </div>
      )}

      {isTeacher && !activeStudentId && (
        <div className={`flex items-start gap-2 rounded-2xl border ${
          isCollabFullscreen
            ? (isFullscreenDark
              ? 'border-amber-300/45 bg-amber-500/14 text-amber-100'
              : 'border-amber-200 bg-amber-50 text-amber-700')
            : 'border-amber-200 bg-amber-50 text-amber-700'
        } ${
          isCollabFullscreen || isDesktopCollabCompact ? 'mb-2 px-3 py-2 text-xs' : 'mb-4 px-4 py-3 text-sm'
        }`}>
          <AlertTriangle size={18} className="mt-0.5" />
          <div>
            <div className="font-semibold">Сначала выберите ученика</div>
            <div className={`text-xs ${isFullscreenDark ? 'text-amber-100/80' : 'text-amber-700/80'}`}>Комната создаётся отдельно для каждого ученика.</div>
          </div>
        </div>
      )}

      <Card className={collabCardClass} style={collabCardStyle}>
        {SHOW_COLLAB_AUTOFORMAT && !isCollabFullscreen && !isDesktopCollabCompact && (
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-end">
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <button
                type="button"
                onClick={handleFormatCode}
                disabled={!roomId}
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Автоформат
              </button>
            </div>
          </div>
        )}

        <div className={`collab-top-pane-wrap relative ${canResizeTopPane ? 'pb-0.5' : ''} ${isCollabFullscreen || isDesktopCollabCompact ? 'mt-0.5' : 'mt-2'}`}>
          {notesPdfPane}
        </div>

        {useBoardGlassCodePanel && (
          <div
            role="separator"
            aria-label="Изменить ширину доски и кода"
            aria-orientation="vertical"
            aria-valuemin={COLLAB_BOARD_CODE_SPLIT_MIN}
            aria-valuemax={COLLAB_BOARD_CODE_SPLIT_MAX}
            aria-valuenow={Math.round(normalizedBoardCodeSplitWidth)}
            onPointerDown={handleBoardCodeResizeStart}
            onKeyDown={handleBoardCodeResizeKeyDown}
            onDoubleClick={handleBoardCodeResizeReset}
            className="collab-board-code-resizer group"
            tabIndex={0}
            title="Тяните влево или вправо, чтобы изменить ширину доски. Двойной клик - код слева / доска справа."
          >
            <div className="collab-board-code-resizer__label" aria-hidden="true">
              <span><Code2 size={11} />Код</span>
              <i />
              <span>Доска<Brush size={11} /></span>
            </div>
            <div className="collab-board-code-resizer__track" />
            <div className="collab-board-code-resizer__thumb">
              <ChevronsLeft size={11} aria-hidden="true" />
              <div className="collab-board-code-resizer__grip" />
              <ChevronsRight size={11} aria-hidden="true" />
            </div>
          </div>
        )}

        <div className="collab-code-glass-layer">
        <div className={`collab-code-command-row collab-code-command-row--modern ${isTeacher && !useBoardGlassCodePanel ? 'collab-code-command-row--teacher' : 'collab-code-command-row--student'} ${isCollabDarkUi ? 'collab-code-command-row--dark' : 'collab-code-command-row--light'} ${isCollabFullscreen || isDesktopCollabCompact ? (isCollabFullscreen ? 'mt-0 flex flex-wrap items-center gap-1.5' : 'mt-0.5 flex flex-wrap items-center gap-1.5') : ''}`}>
          <div className={`collab-code-toolbar max-w-full flex flex-wrap items-center rounded-xl border ${
            isCollabFullscreen
              ? 'min-w-0 flex-1 rounded-xl px-0.5 py-px sm:px-1 sm:py-0.5'
              : (isDesktopCollabCompact ? 'mt-0 px-0.5 py-px' : 'mt-3 inline-flex px-1.5 py-1')
          } ${collabToolbarClass}`}>
          {useBoardGlassCodePanel ? (
            <>
              <button
                type="button"
                onClick={() => handleRunCode('all')}
                disabled={runLoading || !roomId}
                className={`${collabIconButtonBase} collab-code-pill-button is-run ${
                  runLoading || !roomId ? collabIconButtonDisabled : collabIconButtonPrimary
                }`}
                title="Запустить код"
                aria-label="Запустить код"
              >
                <Play size={15} fill="currentColor" />
                <span>Запустить</span>
                <kbd>F5</kbd>
              </button>
              <div className="collab-code-toolbar-cluster" aria-label="Инструменты выполнения">
                <button
                  type="button"
                  onClick={() => handleRunCode('all', true)}
                  disabled={runLoading || !roomId}
                  className={`${collabIconButtonBase} collab-code-pill-button is-debug ${
                    runLoading || !roomId
                      ? collabIconButtonDisabled
                      : (debugActive ? collabIconButtonPrimary : collabIconButtonNeutral)
                  }`}
                  title="Дебаг по точкам остановки"
                  aria-label="Дебаг"
                >
                  <Bug size={15} />
                  <span className="collab-code-pill-label">Дебаг</span>
                </button>
                <button
                  type="button"
                  onClick={handleTopStop}
                  disabled={!runLoading && !debugActive}
                  className={`${collabIconButtonBase} collab-code-pill-button is-stop is-icon-only ${
                    !runLoading && !debugActive ? collabIconButtonDisabled : collabIconButtonDanger
                  }`}
                  title={runLoading ? 'Остановить выполнение (Ctrl+C)' : 'Выйти из дебага (Esc)'}
                  aria-label="Остановить"
                >
                  <Square size={13} fill="currentColor" />
                </button>
                <button
                  type="button"
                  onClick={handleClearRun}
                  disabled={!canClearRunState}
                  className={`${collabIconButtonBase} collab-code-pill-button is-restart is-icon-only ${
                    canClearRunState ? collabIconButtonNeutral : collabIconButtonDisabled
                  }`}
                  title="Очистить вывод и состояние запуска"
                  aria-label="Очистить вывод и состояние запуска"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <button
                type="button"
                onClick={handleToggleBoardAuxPopover}
                className={`${collabIconButtonBase} collab-code-pill-button is-menu is-files ${isBoardCodeAuxOpen ? 'is-open' : ''}`}
                title="Файлы задания и stdin"
                aria-label="Файлы задания и stdin"
                aria-expanded={isBoardCodeAuxOpen}
              >
                <FileText size={15} />
                <span>Ввод и файлы</span>
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => setSaveModalOpen(true)}
                disabled={!effectiveStudentId}
                className={`${collabIconButtonBase} collab-code-pill-button is-menu is-files`}
                title="Сохранить код в конспекты"
                aria-label="Сохранить код в конспекты"
              >
                <Save size={15} />
                <span>В конспекты</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleRunCode('all')}
                disabled={runLoading || !roomId}
                className={`${collabIconButtonBase} ${
                  runLoading || !roomId
                    ? collabIconButtonDisabled
                    : collabIconButtonPrimary
                }`}
                title="Запустить код (F5)"
                aria-label="Запустить код"
              >
                <Play size={19} />
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
                <TextSelect size={19} />
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
                <Bug size={19} />
              </button>
            </>
          )}

          {collabTurtleScene?.used && (
            <button
              type="button"
              onClick={() => setCollabTurtleWindowOpen(true)}
              className={`${collabIconButtonBase} ${
                useBoardGlassCodePanel
                  ? 'collab-code-pill-button is-menu is-files'
                  : collabIconButtonNeutral
              }`}
              title="Открыть рисунок Turtle"
              aria-label="Открыть рисунок Turtle"
            >
              <span aria-hidden="true">🐢</span>
              {useBoardGlassCodePanel && <span>Рисунок</span>}
            </button>
          )}

          {!useBoardGlassCodePanel && debugActive && (
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
                <StepBack size={18} />
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
                <StepForward size={18} />
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
                <Play size={18} />
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
                    : 'is-warning'
                }`}
                title="Пауза"
                aria-label="Пауза"
              >
                <Pause size={18} />
              </button>
            </>
          )}

          {!useBoardGlassCodePanel && (
            <>
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
                <Square size={18} />
              </button>
              <button
                type="button"
                onClick={handleClearRun}
                disabled={!canClearRunState}
                className={`${collabIconButtonBase} ${
                  !canClearRunState
                    ? collabIconButtonDisabled
                    : collabIconButtonNeutral
                }`}
                title="Очистить вывод"
                aria-label="Очистить вывод"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
          {SHOW_COLLAB_AUTOFORMAT && (isCollabFullscreen || isDesktopCollabCompact) && (
            <>
              <span className={`mx-1 h-5 w-px ${collabToolbarDividerClass}`} />
              <button
                type="button"
                onClick={handleFormatCode}
                disabled={!roomId}
                className={`inline-flex h-7 items-center rounded-lg border px-2 py-0 text-[10px] font-semibold transition disabled:opacity-50 ${
                  isCollabFullscreen
                    ? (isFullscreenDark
                      ? 'border-slate-600/80 bg-slate-900/80 text-slate-100 hover:border-cyan-400/70 hover:bg-slate-800/90'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50')
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Автоформат
              </button>
            </>
          )}
          </div>
          {(isCollabFullscreen || isDesktopCollabCompact) && (
            <>
              {mergeHeaderIntoToolbar && collabTopActions && !useBoardGlassCodePanel && (
                <div className="collab-code-action-dock-wrap ml-auto flex flex-wrap items-center gap-1.5">
                  {collabTopActions}
                </div>
              )}
            </>
          )}
        </div>

        {boardCodeAuxPopover}

        {isSplitCollabLayout ? (
          <div
            className={`collab-split-layout ${isDesktopCollabCompact ? 'mt-0.5 flex-1' : (isCollabFullscreen ? 'mt-0.5 flex-1' : 'mt-1')} grid min-h-0 items-stretch ${
              isCollabFullscreen ? 'gap-1' : 'gap-0'
            }`}
            style={{
              gridTemplateColumns: collabSplitGridTemplateColumns,
              height: (isCollabFullscreen || isDesktopCollabCompact) ? '100%' : undefined,
            }}
          >
            <div className="collab-editor-pane collab-editor-pane--with-output min-h-0 min-w-0" style={{ height: collabStackedEditorHeight }}>
              <div className="collab-code-output-stack min-h-0">
                <div className="collab-code-output-stack__editor min-h-0">
                  {editorPane}
                </div>
                {stackedOutputPane}
                {useBoardGlassCodePanel && (
                  <div className="collab-editor-statusbar" aria-label="Состояние редактора">
                    <div className="collab-editor-statusbar__group">
                      <span className={`collab-editor-statusbar__connection is-${status || 'idle'}`}>
                        <span aria-hidden="true" />
                        {statusLabel}
                      </span>
                      <span className="collab-editor-statusbar__peers" title={`Участников онлайн: ${peerCount}`}>
                        <Users size={12} aria-hidden="true" />
                        {Math.max(0, Number(peerCount) || 0)}
                      </span>
                    </div>
                    <div className="collab-editor-statusbar__group collab-editor-statusbar__meta">
                      <span>{`Стр ${editorCursorPosition.lineNumber}, стлб ${editorCursorPosition.column}`}</span>
                      <span>Пробелы: 4</span>
                      <span>UTF-8</span>
                      <span>Python 3</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={isCollabFullscreen ? 'mt-2' : 'mt-4'}>
              {editorPane}
            </div>
            <div className={`grid grid-cols-1 lg:grid-cols-3 ${isCollabFullscreen ? 'mt-2 gap-2.5' : 'mt-4 gap-3'}`}>
              <div>
                {inputPane}
              </div>
              <div className={`lg:col-span-2 ${isCollabFullscreen ? 'space-y-2.5' : 'space-y-2'}`}>
                {resultConsole}
                {debugPane}
              </div>
            </div>
          </>
        )}
        </div>
      </Card>
      {collabTurtleWindow && (
        isCollabFullscreen || typeof document === 'undefined'
          ? collabTurtleWindow
          : createPortal(collabTurtleWindow, document.body)
      )}
      {isCollabFullscreen
        ? saveModal
        : (typeof document !== 'undefined' ? createPortal(saveModal, document.body) : null)}
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
  embedded = false,
  hideStudentPicker = false,
  showEmbeddedSummonButton = false,
  theme = THEME_LIGHT,
  onMemorySnapshotRenderer = null,
  onLessonReplayEvent = null,
}) => {
  const isTeacher = role === 'teacher';
  const isDarkTheme = normalizeTheme(theme) === THEME_DARK;
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
  const [boardSnapshot, setBoardSnapshot] = useState({ revision: 0, itemCount: 0, estimatedBytes: 0 });
  const [remotePreviews, setRemotePreviews] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState([]);
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(BOARD_COLORS[0] || BOARD_DEFAULT_COLOR);
  const [penWidth, setPenWidth] = useState(BOARD_STROKE_WIDTH);
  const [boardSize, setBoardSize] = useState({ width: 900, height: 520 });
  const [pasteError, setPasteError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [imageResizePreview, setImageResizePreview] = useState(null);
  const [isImageCropMenuOpen, setIsImageCropMenuOpen] = useState(false);
  const [isImageMoreOpen, setIsImageMoreOpen] = useState(false);
  const [imageActionNotice, setImageActionNotice] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);
  const [summonNotice, setSummonNotice] = useState(false);
  const [isBrushPaletteOpen, setIsBrushPaletteOpen] = useState(false);
  const [isShapePaletteOpen, setIsShapePaletteOpen] = useState(false);
  const [shapeKind, setShapeKind] = useState('rectangle');
  const [textDraft, setTextDraft] = useState(null);
  const [isMinimapOpen, setIsMinimapOpen] = useState(false);
  const [isBoardHelpOpen, setIsBoardHelpOpen] = useState(false);
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
  const remotePreviewStateRef = useRef(new Map());
  const imageDragRafRef = useRef(null);
  const pendingImageMoveRef = useRef(null);
  const imageResizeRef = useRef({ active: false });
  const imageResizePreviewRef = useRef(null);
  const imageActionNoticeTimeoutRef = useRef(null);
  const linkedBoardObjectRef = useRef('');
  const lastSummonIdRef = useRef(null);
  const summonTimeoutRef = useRef(null);
  const summonNoticeTimeoutRef = useRef(null);
  const eraserStateRef = useRef({ active: false });
  const brushPaletteRef = useRef(null);
  const shapePaletteRef = useRef(null);
  const textEditorRef = useRef(null);
  const textDraftCancelRef = useRef(false);
  const customColorInputRef = useRef(null);
  const boardBottomControlsRef = useRef(null);
  const selectionRef = useRef(null);
  const selectedIdsRef = useRef([]);
  const selectingRef = useRef({ active: false, start: null, current: null });
  const textBoxDrawRef = useRef({ active: false, start: null, current: null });
  const selectionDragRef = useRef({ active: false, startX: 0, startY: 0, items: null, baseSelection: null });
  const selectionMoveRafRef = useRef(null);
  const pendingSelectionMoveRef = useRef({ dx: 0, dy: 0 });
  const boardSizeRef = useRef(boardSize);
  const offsetRef = useRef(offset);
  const zoomRef = useRef(zoom);
  const toolRef = useRef(tool);
  const boardItemsRef = useRef([]);
  const boardEstimatedBytesRef = useRef(0);
  const boardImageUsageRef = useRef(new Map());
  const boardSceneRef = useRef(null);
  const boardRenderRafRef = useRef(null);
  const sceneRenderRafRef = useRef(null);
  const pendingSceneRenderRef = useRef(null);
  const scheduleBoardRenderRef = useRef(null);
  const scheduleMinimapRenderRef = useRef(null);
  const scheduleBoardSceneRenderRef = useRef(null);
  const imageCacheRef = useRef(new Map());
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const lastPointerClientRef = useRef(null);
  const pointerInsideBoardRef = useRef(false);
  const boardPasteFocusedRef = useRef(false);
  const drawStateRef = useRef({ drawing: false, points: [], start: null, end: null });
  const panStateRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const dragImageRef = useRef({ active: false, id: null, offsetX: 0, offsetY: 0, x: null, y: null });
  const minimapRef = useRef(null);
  const minimapRenderTimerRef = useRef(null);
  const viewportHydratedRef = useRef(false);
  const viewportPersistTimerRef = useRef(null);
  const lessonReplayEventRef = useRef(onLessonReplayEvent);
  const lessonReplayBoardTimerRef = useRef(null);
  const lessonReplayPendingBoardRef = useRef(null);
  const lessonReplayLastBoardSignatureRef = useRef('');
  const lessonReplayBoardViewportTimerRef = useRef(null);
  const lessonReplayPendingBoardViewportRef = useRef(null);
  const lessonReplayLastBoardViewportSignatureRef = useRef('');
  const lessonReplayLastBoardViewportAtRef = useRef(0);
  const boardRevision = boardSnapshot.revision;
  const boardItemCount = boardSnapshot.itemCount;

  useEffect(() => {
    lessonReplayEventRef.current = onLessonReplayEvent;
  }, [onLessonReplayEvent]);

  const flushLessonReplayBoardSnapshot = useCallback(() => {
    if (typeof window !== 'undefined') window.clearTimeout(lessonReplayBoardTimerRef.current);
    const payload = lessonReplayPendingBoardRef.current;
    lessonReplayPendingBoardRef.current = null;
    if (!payload || typeof lessonReplayEventRef.current !== 'function') return;
    const signature = JSON.stringify(payload);
    if (signature === lessonReplayLastBoardSignatureRef.current) return;
    lessonReplayLastBoardSignatureRef.current = signature;
    lessonReplayEventRef.current('board', payload, { dedupeMs: 10_000 });
  }, []);

  const scheduleLessonReplayBoardSnapshot = useCallback((items, delayMs = 1600) => {
    if (typeof window === 'undefined') return;
    const compactItems = (Array.isArray(items) ? items : []).slice(0, 1200).map((item) => {
      if (!item || typeof item !== 'object') return null;
      if (item.type === 'image') {
        const safeImage = { ...item };
        delete safeImage.dataUrl;
        return safeImage.assetUrl ? safeImage : null;
      }
      if (item.type === 'stroke' && Array.isArray(item.points) && item.points.length > 600) {
        const points = [];
        const step = (item.points.length - 1) / 599;
        for (let index = 0; index < 600; index += 1) {
          points.push(item.points[Math.min(item.points.length - 1, Math.round(index * step))]);
        }
        return { ...item, points };
      }
      return item;
    }).filter(Boolean);
    lessonReplayPendingBoardRef.current = { items: compactItems };
    window.clearTimeout(lessonReplayBoardTimerRef.current);
    lessonReplayBoardTimerRef.current = window.setTimeout(
      flushLessonReplayBoardSnapshot,
      Math.max(0, Number(delayMs) || 0)
    );
  }, [flushLessonReplayBoardSnapshot]);

  useEffect(() => () => flushLessonReplayBoardSnapshot(), [flushLessonReplayBoardSnapshot]);

  const flushLessonReplayBoardViewport = useCallback(() => {
    if (typeof window !== 'undefined') window.clearTimeout(lessonReplayBoardViewportTimerRef.current);
    const payload = lessonReplayPendingBoardViewportRef.current;
    lessonReplayPendingBoardViewportRef.current = null;
    if (!payload || typeof lessonReplayEventRef.current !== 'function') return;
    const signature = JSON.stringify(payload);
    if (signature === lessonReplayLastBoardViewportSignatureRef.current) return;
    lessonReplayLastBoardViewportSignatureRef.current = signature;
    lessonReplayLastBoardViewportAtRef.current = Date.now();
    lessonReplayEventRef.current('viewport', payload, { dedupeMs: 5000 });
  }, []);

  const scheduleLessonReplayBoardViewport = useCallback((payload, delayMs = 1600) => {
    if (!payload || typeof window === 'undefined') return;
    lessonReplayPendingBoardViewportRef.current = payload;
    const elapsed = Date.now() - lessonReplayLastBoardViewportAtRef.current;
    const waitMs = Math.max(Number(delayMs) || 0, 4000 - elapsed, 0);
    window.clearTimeout(lessonReplayBoardViewportTimerRef.current);
    lessonReplayBoardViewportTimerRef.current = window.setTimeout(
      flushLessonReplayBoardViewport,
      waitMs
    );
  }, [flushLessonReplayBoardViewport]);

  useEffect(() => () => flushLessonReplayBoardViewport(), [flushLessonReplayBoardViewport]);

  useEffect(() => {
    setIsMinimapOpen(false);
    setColor(BOARD_DEFAULT_COLOR);
    setSelectedImageId(null);
    setImageResizePreview(null);
    setIsImageCropMenuOpen(false);
    setIsImageMoreOpen(false);
    setTextDraft(null);
    linkedBoardObjectRef.current = '';
  }, [roomId]);

  const releaseCachedBoardImage = useCallback((source) => {
    if (!source) return;
    const entry = imageCacheRef.current.get(source);
    if (entry?.img) {
      entry.img.onload = null;
      entry.img.onerror = null;
      try {
        entry.img.src = '';
      } catch {
        // Ignore cache release failures; the entry will still be dropped from the map.
      }
    }
    imageCacheRef.current.delete(source);
  }, []);

  const clearCachedBoardImages = useCallback(() => {
    Array.from(imageCacheRef.current.keys()).forEach((source) => {
      releaseCachedBoardImage(source);
    });
  }, [releaseCachedBoardImage]);

  const trackBoardImageInsert = useCallback((item) => {
    const source = getBoardImageSource(item);
    if (!source) return;
    const nextCount = Number(boardImageUsageRef.current.get(source) || 0) + 1;
    boardImageUsageRef.current.set(source, nextCount);
  }, []);

  const trackBoardImageRemoval = useCallback((item) => {
    const source = getBoardImageSource(item);
    if (!source) return;
    const currentCount = Number(boardImageUsageRef.current.get(source) || 0);
    if (currentCount <= 1) {
      boardImageUsageRef.current.delete(source);
      releaseCachedBoardImage(source);
      return;
    }
    boardImageUsageRef.current.set(source, currentCount - 1);
  }, [releaseCachedBoardImage]);

  const resetBoardData = useCallback(() => {
    if (typeof window !== 'undefined' && sceneRenderRafRef.current) {
      window.cancelAnimationFrame(sceneRenderRafRef.current);
      sceneRenderRafRef.current = null;
    }
    pendingSceneRenderRef.current = null;
    const previousScene = boardSceneRef.current;
    if (previousScene?.canvas) {
      previousScene.canvas.width = 1;
      previousScene.canvas.height = 1;
    }
    boardSceneRef.current = null;
    boardItemsRef.current = [];
    boardEstimatedBytesRef.current = 0;
    boardImageUsageRef.current.clear();
    clearCachedBoardImages();
    setPasteError('');
    setBoardSnapshot((current) => ({
      revision: current.revision + 1,
      itemCount: 0,
      estimatedBytes: 0,
    }));
    scheduleBoardRenderRef.current?.();
    scheduleMinimapRenderRef.current?.(0);
  }, [clearCachedBoardImages]);

  const resetBoardInteractionState = useCallback(() => {
    imageResizeRef.current?.cleanup?.();
    imageResizeRef.current = { active: false };
    imageResizePreviewRef.current = null;
    drawStateRef.current = { drawing: false, points: [], start: null, end: null };
    panStateRef.current = { active: false, startX: 0, startY: 0, originX: 0, originY: 0 };
    dragImageRef.current = { active: false, id: null, offsetX: 0, offsetY: 0, x: null, y: null };
    eraserStateRef.current = { active: false };
    selectingRef.current = { active: false, start: null, current: null };
    textBoxDrawRef.current = { active: false, start: null, current: null };
    selectionDragRef.current = { active: false, startX: 0, startY: 0, items: null, baseSelection: null };
    pendingSelectionMoveRef.current = { dx: 0, dy: 0 };
    pendingImageMoveRef.current = null;
    pendingCursorRef.current = null;
    selectedIdsRef.current = [];
    selectionRef.current = null;
    lastCursorSyncAtRef.current = 0;
    lastPreviewSyncAtRef.current = 0;
    lastSummonIdRef.current = null;

    if (typeof window !== 'undefined' && previewRafRef.current) {
      window.cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    if (typeof window !== 'undefined' && cursorRafRef.current) {
      window.cancelAnimationFrame(cursorRafRef.current);
      cursorRafRef.current = null;
    }
    if (typeof window !== 'undefined' && imageDragRafRef.current) {
      window.cancelAnimationFrame(imageDragRafRef.current);
      imageDragRafRef.current = null;
    }
    if (typeof window !== 'undefined' && selectionMoveRafRef.current) {
      window.cancelAnimationFrame(selectionMoveRafRef.current);
      selectionMoveRafRef.current = null;
    }
    if (summonTimeoutRef.current) {
      clearTimeout(summonTimeoutRef.current);
      summonTimeoutRef.current = null;
    }
    if (summonNoticeTimeoutRef.current) {
      clearTimeout(summonNoticeTimeoutRef.current);
      summonNoticeTimeoutRef.current = null;
    }

    awarenessRef.current?.setLocalStateField('drawing', null);
    awarenessRef.current?.setLocalStateField('cursor', null);
    awarenessRef.current?.setLocalStateField('summon', null);
    remotePreviewStateRef.current.clear();
    setRemotePreviews([]);
    setRemoteCursors([]);
    setSelectedIds([]);
    setSelectionBox(null);
    setSelectedImageId(null);
    setImageResizePreview(null);
    setIsImageCropMenuOpen(false);
    setIsImageMoreOpen(false);
    setSummonNotice(false);
  }, []);

  const commitBoardData = useCallback((nextItems, nextEstimatedBytes) => {
    const safeItems = Array.isArray(nextItems) ? nextItems : [];
    const safeEstimatedBytes = Math.max(0, Math.round(Number(nextEstimatedBytes) || 0));
    boardItemsRef.current = safeItems;
    boardEstimatedBytesRef.current = safeEstimatedBytes;
    setBoardSnapshot((current) => ({
      revision: current.revision + 1,
      itemCount: safeItems.length,
      estimatedBytes: safeEstimatedBytes,
    }));
  }, []);

  const buildBoardSnapshotFromYItems = useCallback((yItems) => {
    const nextItems = [];
    let nextEstimatedBytes = 0;
    boardImageUsageRef.current.clear();
    clearCachedBoardImages();
    const total = Number(yItems?.length) || 0;
    for (let index = 0; index < total; index += 1) {
      const item = normalizeBoardStoredItem(yItems.get(index));
      if (!item) continue;
      nextItems.push(item);
      nextEstimatedBytes += estimateBoardItemBytes(item);
      trackBoardImageInsert(item);
    }
    return { nextItems, nextEstimatedBytes };
  }, [clearCachedBoardImages, trackBoardImageInsert]);

  const applyBoardDelta = useCallback((delta = []) => {
    const nextItems = boardItemsRef.current.slice();
    let nextEstimatedBytes = boardEstimatedBytesRef.current;
    let cursor = 0;
    let mutated = false;
    let canAppendToScene = true;
    const appendedItems = [];
    delta.forEach((step) => {
      const retainCount = Number(step?.retain) || 0;
      if (retainCount > 0) {
        cursor += retainCount;
      }
      const deleteCount = Number(step?.delete) || 0;
      if (deleteCount > 0) {
        mutated = true;
        canAppendToScene = false;
        const removedItems = nextItems.splice(cursor, deleteCount);
        removedItems.forEach((item) => {
          nextEstimatedBytes -= estimateBoardItemBytes(item);
          trackBoardImageRemoval(item);
        });
      }
      const rawInserted = Array.isArray(step?.insert) ? step.insert : [];
      if (rawInserted.length > 0) {
        const insertedItems = rawInserted
          .map((item) => normalizeBoardStoredItem(item))
          .filter(Boolean);
        if (insertedItems.length > 0) {
          mutated = true;
          const isAppendInsert = canAppendToScene && cursor === nextItems.length;
          nextItems.splice(cursor, 0, ...insertedItems);
          insertedItems.forEach((item) => {
            nextEstimatedBytes += estimateBoardItemBytes(item);
            trackBoardImageInsert(item);
          });
          if (isAppendInsert) {
            appendedItems.push(...insertedItems);
          } else {
            canAppendToScene = false;
          }
          cursor += insertedItems.length;
        }
      }
    });
    let renderPlan = { mode: 'none' };
    if (mutated) {
      renderPlan = canAppendToScene && appendedItems.length > 0
        ? { mode: 'append', items: appendedItems }
        : { mode: 'full' };
    }
    return {
      nextItems,
      nextEstimatedBytes: Math.max(0, nextEstimatedBytes),
      renderPlan,
    };
  }, [trackBoardImageInsert, trackBoardImageRemoval]);

  const getBoardCapacityError = useCallback((nextItemCount, nextEstimatedBytes) => {
    if (nextItemCount > BOARD_MAX_ITEM_COUNT) {
      return `На доске уже слишком много элементов. Лимит: ${BOARD_MAX_ITEM_COUNT}. Очистите часть доски или сохраните её в конспекты.`;
    }
    if (nextEstimatedBytes > BOARD_MAX_TOTAL_BYTES) {
      return `Доска переполнена (${formatBoardBytes(nextEstimatedBytes)} из ${formatBoardBytes(BOARD_MAX_TOTAL_BYTES)}). Очистите часть элементов или сохраните доску в конспекты.`;
    }
    return '';
  }, []);

  const ensureBoardCanAddItems = useCallback((items) => {
    const nextItems = (Array.isArray(items) ? items : []).filter(Boolean);
    if (nextItems.length === 0) {
      return { ok: true, error: '' };
    }
    const addedBytes = nextItems.reduce((sum, item) => sum + estimateBoardItemBytes(item), 0);
    const nextItemCount = boardItemsRef.current.length + nextItems.length;
    const nextEstimatedBytes = boardEstimatedBytesRef.current + addedBytes;
    const error = getBoardCapacityError(nextItemCount, nextEstimatedBytes);
    return { ok: !error, error };
  }, [getBoardCapacityError]);

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
  const boardViewportStorageKey = useMemo(() => {
    if (!roomId) return '';
    const normalizedRole = role || 'user';
    const normalizedUserId = userId || 'anon';
    return `${BOARD_VIEWPORT_STORAGE_KEY_PREFIX}:${roomId}:${normalizedRole}:${normalizedUserId}`;
  }, [roomId, role, userId]);

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
    const deletableIds = idsToDelete.filter((id) => {
      const item = boardItemsRef.current.find((entry) => entry?.id === id);
      return item && !item.locked && !item.superLocked;
    });
    if (!deletableIds.length) return false;
    const deleted = deleteItemsByIds(deletableIds);
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
    viewportHydratedRef.current = false;
    if (typeof window === 'undefined') {
      viewportHydratedRef.current = true;
      return;
    }
    if (!boardViewportStorageKey) {
      viewportHydratedRef.current = true;
      return;
    }
    try {
      const raw = window.localStorage.getItem(boardViewportStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const savedZoom = Number(parsed?.zoom);
        const savedOffsetX = Number(parsed?.offset?.x);
        const savedOffsetY = Number(parsed?.offset?.y);
        if (Number.isFinite(savedZoom) && savedZoom > 0) {
          const clampedZoom = Math.min(BOARD_MAX_ZOOM, Math.max(BOARD_MIN_ZOOM, savedZoom));
          setZoom(clampedZoom);
        }
        if (Number.isFinite(savedOffsetX) && Number.isFinite(savedOffsetY)) {
          setOffset({
            x: savedOffsetX,
            y: savedOffsetY,
          });
        }
      }
    } catch {
      // Ignore malformed or unavailable localStorage entries for board viewport restore.
    }
    viewportHydratedRef.current = true;
  }, [boardViewportStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!boardViewportStorageKey) return;
    if (!viewportHydratedRef.current) return;

    const nextZoom = Number(zoom);
    const nextOffsetX = Number(offset?.x);
    const nextOffsetY = Number(offset?.y);
    if (!Number.isFinite(nextZoom) || !Number.isFinite(nextOffsetX) || !Number.isFinite(nextOffsetY)) return;

    if (viewportPersistTimerRef.current) {
      clearTimeout(viewportPersistTimerRef.current);
      viewportPersistTimerRef.current = null;
    }
    viewportPersistTimerRef.current = setTimeout(() => {
      viewportPersistTimerRef.current = null;
      try {
        window.localStorage.setItem(boardViewportStorageKey, JSON.stringify({
          zoom: nextZoom,
          offset: {
            x: nextOffsetX,
            y: nextOffsetY,
          },
          updatedAt: Date.now(),
        }));
      } catch {
        // Ignore localStorage write failures; viewport persistence is best-effort.
      }
    }, BOARD_VIEWPORT_SAVE_DEBOUNCE_MS);
  }, [boardViewportStorageKey, zoom, offset]);

  useEffect(() => () => {
    if (typeof window === 'undefined') return;
    if (!boardViewportStorageKey) return;
    if (viewportPersistTimerRef.current) {
      clearTimeout(viewportPersistTimerRef.current);
      viewportPersistTimerRef.current = null;
    }
    const nextZoom = Number(zoomRef.current);
    const nextOffsetX = Number(offsetRef.current?.x);
    const nextOffsetY = Number(offsetRef.current?.y);
    if (!Number.isFinite(nextZoom) || !Number.isFinite(nextOffsetX) || !Number.isFinite(nextOffsetY)) return;
    try {
      window.localStorage.setItem(boardViewportStorageKey, JSON.stringify({
        zoom: nextZoom,
        offset: {
          x: nextOffsetX,
          y: nextOffsetY,
        },
        updatedAt: Date.now(),
      }));
    } catch {
      // Ignore localStorage write failures during teardown; viewport persistence is best-effort.
    }
  }, [boardViewportStorageKey]);

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
    if (pointerInsideBoardRef.current) return;
    const centerX = offset.x + (boardSize.width / (zoom || 1)) / 2;
    const centerY = offset.y + (boardSize.height / (zoom || 1)) / 2;
    lastPointerRef.current = { x: centerX, y: centerY };
  }, [boardSize.width, boardSize.height, zoom, offset]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!roomId || !viewportHydratedRef.current) return;
    scheduleLessonReplayBoardViewport({
      surface: 'board',
      zoom: Math.max(0.05, Number(zoom) || 1),
      offset: {
        x: Number(offset?.x) || 0,
        y: Number(offset?.y) || 0,
      },
      width: Math.max(1, Math.round(Number(boardSize.width) || 900)),
      height: Math.max(1, Math.round(Number(boardSize.height) || 520)),
    }, 1600);
  }, [
    boardSize.height,
    boardSize.width,
    offset,
    roomId,
    scheduleLessonReplayBoardViewport,
    zoom,
  ]);

  useEffect(() => {
    if (tool !== 'move' && tool !== 'select' && selectedImageId) setSelectedImageId(null);
  }, [tool, selectedImageId]);

  useEffect(() => {
    setIsImageCropMenuOpen(false);
    setIsImageMoreOpen(false);
    setImageActionNotice('');
  }, [selectedImageId]);

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
    const exists = boardItemsRef.current.some((item) => item?.id === selectedImageId && item.type === 'image');
    if (!exists) setSelectedImageId(null);
  }, [boardRevision, selectedImageId]);

  useEffect(() => {
    if (!roomId || typeof window === 'undefined') return;
    const match = String(window.location.hash || '').match(/^#board-item=([^&]+)$/);
    if (!match) return;
    let linkedId = '';
    try {
      linkedId = decodeURIComponent(match[1]);
    } catch {
      linkedId = match[1];
    }
    const linkKey = `${roomId}:${linkedId}`;
    if (!linkedId || linkedBoardObjectRef.current === linkKey) return;
    const linkedItem = boardItemsRef.current.find((item) => item?.id === linkedId && item.type === 'image');
    if (!linkedItem) return;
    linkedBoardObjectRef.current = linkKey;
    setTool('select');
    setSelectedImageId(linkedId);
    setSelectedIds([linkedId]);
    setSelectionBox({
      x: Number(linkedItem.x) || 0,
      y: Number(linkedItem.y) || 0,
      width: Math.max(1, Number(linkedItem.width) || 1),
      height: Math.max(1, Number(linkedItem.height) || 1),
    });
    const currentZoom = zoomRef.current || 1;
    setOffset({
      x: (Number(linkedItem.x) || 0) + (Number(linkedItem.width) || 1) / 2 - boardSizeRef.current.width / currentZoom / 2,
      y: (Number(linkedItem.y) || 0) + (Number(linkedItem.height) || 1) / 2 - boardSizeRef.current.height / currentZoom / 2,
    });
  }, [boardRevision, roomId]);

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
    const existingIds = new Set(boardItemsRef.current.map((item) => item?.id).filter(Boolean));
    const filtered = selectedIdsRef.current.filter((id) => existingIds.has(id));
    if (filtered.length !== selectedIdsRef.current.length) {
      setSelectedIds(filtered);
    }
  }, [boardRevision]);

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
      if (brushPaletteRef.current && !brushPaletteRef.current.contains(event.target)) {
        setIsBrushPaletteOpen(false);
      }
      if (shapePaletteRef.current && !shapePaletteRef.current.contains(event.target)) {
        setIsShapePaletteOpen(false);
      }
      if (boardBottomControlsRef.current && !boardBottomControlsRef.current.contains(event.target)) {
        setIsBoardHelpOpen(false);
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

  const getCanvasSurfacePoint = (clientX, clientY) => {
    const surface = overlayRef.current || canvasRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    const rectWidth = Math.max(1, Number(rect?.width) || 0);
    const rectHeight = Math.max(1, Number(rect?.height) || 0);
    const renderWidth = Math.max(1, Number(boardSizeRef.current?.width) || rectWidth);
    const renderHeight = Math.max(1, Number(boardSizeRef.current?.height) || rectHeight);
    const normalizedX = ((Number(clientX) || 0) - rect.left) / rectWidth;
    const normalizedY = ((Number(clientY) || 0) - rect.top) / rectHeight;
    return {
      x: clamp(normalizedX * renderWidth, 0, renderWidth),
      y: clamp(normalizedY * renderHeight, 0, renderHeight),
      rect,
    };
  };

  const getCanvasPoint = (event) => {
    const surfacePoint = getCanvasSurfacePoint(event?.clientX, event?.clientY);
    if (!surfacePoint) return { x: 0.5, y: 0.5 };
    const screenX = surfacePoint.x;
    const screenY = surfacePoint.y;
    const currentZoom = zoomRef.current || 1;
    const worldX = offsetRef.current.x + screenX / currentZoom;
    const worldY = offsetRef.current.y + screenY / currentZoom;
    return {
      x: worldX,
      y: worldY,
    };
  };

  const rememberBoardPointer = (event) => {
    const point = getCanvasPoint(event);
    lastPointerRef.current = point;
    lastPointerClientRef.current = {
      x: Number(event?.clientX) || 0,
      y: Number(event?.clientY) || 0,
    };
    pointerInsideBoardRef.current = true;
    return point;
  };

  const clearBoardPointer = () => {
    pointerInsideBoardRef.current = false;
    lastPointerClientRef.current = null;
  };

  const getBoardViewportCenterPoint = () => {
    const surface = overlayRef.current || canvasRef.current || containerRef.current;
    const rect = surface?.getBoundingClientRect?.();
    if (rect) {
      const surfacePoint = getCanvasSurfacePoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (surfacePoint) {
        const currentZoom = zoomRef.current || 1;
        return {
          x: offsetRef.current.x + surfacePoint.x / currentZoom,
          y: offsetRef.current.y + surfacePoint.y / currentZoom,
        };
      }
    }
    const currentZoom = zoomRef.current || 1;
    return {
      x: offsetRef.current.x + (boardSizeRef.current.width / currentZoom) / 2,
      y: offsetRef.current.y + (boardSizeRef.current.height / currentZoom) / 2,
    };
  };

  const getBoardPastePoint = () => {
    if (pointerInsideBoardRef.current && lastPointerClientRef.current) {
      const surfacePoint = getCanvasSurfacePoint(lastPointerClientRef.current.x, lastPointerClientRef.current.y);
      if (surfacePoint) {
        const currentZoom = zoomRef.current || 1;
        return {
          x: offsetRef.current.x + surfacePoint.x / currentZoom,
          y: offsetRef.current.y + surfacePoint.y / currentZoom,
        };
      }
    }
    if (
      pointerInsideBoardRef.current
      && lastPointerRef.current
      && Number.isFinite(Number(lastPointerRef.current.x))
      && Number.isFinite(Number(lastPointerRef.current.y))
    ) {
      return lastPointerRef.current;
    }
    return getBoardViewportCenterPoint();
  };

  const getBoardPasteScale = (imageWidth, imageHeight) => {
    const sourceWidth = Math.max(1, Number(imageWidth) || 1);
    const sourceHeight = Math.max(1, Number(imageHeight) || 1);
    const currentZoom = zoomRef.current || 1;
    const viewportWidth = Math.max(BOARD_IMAGE_MIN_SIZE, (boardSizeRef.current.width || 1) / currentZoom);
    const viewportHeight = Math.max(BOARD_IMAGE_MIN_SIZE, (boardSizeRef.current.height || 1) / currentZoom);
    const maxDimension = Math.max(sourceWidth, sourceHeight, 1);
    const maxDimensionScale = maxDimension > BOARD_IMAGE_MAX_SIZE ? BOARD_IMAGE_MAX_SIZE / maxDimension : 1;
    const fitScale = Math.min(
      1,
      (viewportWidth * 0.78) / sourceWidth,
      (viewportHeight * 0.78) / sourceHeight
    );
    return Math.max(BOARD_IMAGE_MIN_SIZE / maxDimension, Math.min(maxDimensionScale, fitScale));
  };

  const shouldHandleBoardImagePaste = (event) => {
    const root = boardRootRef.current;
    if (!root || !roomId) return false;
    const target = event?.target;
    if (target?.nodeType && root.contains(target)) return boardPasteFocusedRef.current;
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    if (active?.nodeType && root.contains(active)) return boardPasteFocusedRef.current;
    return boardPasteFocusedRef.current && (!active || active === document.body || active === document.documentElement);
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
    const surfacePoint = getCanvasSurfacePoint(centerX, centerY);
    const screenX = surfacePoint ? surfacePoint.x : boardSizeRef.current.width / 2;
    const screenY = surfacePoint ? surfacePoint.y : boardSizeRef.current.height / 2;
    const worldX = offsetRef.current.x + screenX / currentZoom;
    const worldY = offsetRef.current.y + screenY / currentZoom;
    setZoom(clamped);
    setOffset({
      x: worldX - screenX / clamped,
      y: worldY - screenY / clamped,
    });
  };

  const zoomBy = (factor) => {
    const rect = (overlayRef.current || canvasRef.current)?.getBoundingClientRect?.();
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
    const trimmed = String(value || '').replace(/\./g, '').trim();
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
      } else if (item.type === 'line' || item.type === 'arrow') {
        includePoint(item.start?.x, item.start?.y);
        includePoint(item.end?.x, item.end?.y);
      } else if (item.type === 'shape' || item.type === 'text') {
        includePoint(item.x, item.y);
        includePoint((item.x || 0) + (item.width || 0), (item.y || 0) + (item.height || 0));
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
    const boardItems = boardItemsRef.current;
    const bounds = getBoardBounds(boardItems);
    if (!bounds) throw new Error('Доска пустая.');
    const padding = BOARD_EXPORT_PADDING;
    const width = Math.max(1, bounds.maxX - bounds.minX + padding * 2);
    const height = Math.max(1, bounds.maxY - bounds.minY + padding * 2);
    const imageItems = boardItems.filter((item) => getBoardImageSource(item));
    const imageMap = new Map();
    await Promise.all(imageItems.map(async (item) => {
      const source = getBoardImageSource(item);
      if (!source || imageMap.has(source)) return;
      const img = await new Promise((resolve) => {
        const image = new Image();
        prepareBoardImageElement(image, source);
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = source;
      });
      if (img) imageMap.set(source, img);
    }));

    const hasVectorItems = boardItems.some((item) => ['stroke', 'line', 'arrow', 'shape', 'text'].includes(item?.type));
    const baseScale = hasVectorItems && !imageItems.length
      ? BOARD_EXPORT_VECTOR_BASE_SCALE
      : BOARD_EXPORT_BASE_SCALE;

    const preferredScale = imageItems.reduce((maxScale, item) => {
      const img = imageMap.get(getBoardImageSource(item));
      if (!img) return maxScale;
      const itemWidth = Math.max(1, Number(item.width) || 1);
      const itemHeight = Math.max(1, Number(item.height) || 1);
      const naturalWidth = Math.max(1, Number(img.naturalWidth) || Number(img.width) || 1);
      const naturalHeight = Math.max(1, Number(img.naturalHeight) || Number(img.height) || 1);
      return Math.max(
        maxScale,
        naturalWidth / itemWidth,
        naturalHeight / itemHeight
      );
    }, Math.max(baseScale, getBoardPixelRatio()));

    const maxDim = Math.max(width, height);
    const maxScaleByDimension = BOARD_EXPORT_MAX_SIZE / Math.max(maxDim, 1);
    const maxScaleByPixels = Math.sqrt(BOARD_EXPORT_MAX_PIXELS / Math.max(width * height, 1));
    const maxAllowedScale = Math.min(maxScaleByDimension, maxScaleByPixels);
    const scale = maxAllowedScale >= 1
      ? Math.min(preferredScale, maxAllowedScale)
      : maxAllowedScale;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось подготовить холст.');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = BOARD_BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      scale,
      0,
      0,
      scale,
      (padding - bounds.minX) * scale,
      (padding - bounds.minY) * scale
    );

    boardItems.forEach((item) => {
      if (!item) return;
      if (item.type === 'stroke') drawStroke(ctx, item, canvas.width, canvas.height);
      if (item.type === 'line') drawLine(ctx, item, canvas.width, canvas.height);
      if (item.type === 'arrow') drawArrow(ctx, item);
      if (item.type === 'shape') drawShape(ctx, item);
      if (item.type === 'text') drawTextItem(ctx, item);
      if (item.type === 'image') {
        const img = imageMap.get(getBoardImageSource(item));
        if (!img) return;
        drawBoardImage(ctx, img, item);
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
    const boardItems = boardItemsRef.current;
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
      if (blob.size > BOARD_EXPORT_MAX_FILE_BYTES) {
        throw new Error(`Файл слишком большой (максимум ${formatBoardBytes(BOARD_EXPORT_MAX_FILE_BYTES)}). Уменьшите размер доски.`);
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
      await api.uploadFile(file, Number(saveTaskNumber), saveCategory, saveFolderId || null, effectiveStudentId, {
        source: 'board-save',
        memory: {
          taskNumber: Number(saveTaskNumber),
          source: 'board-save',
          description: 'Снимок доски',
        },
      });
      setSaveSuccess('Сохранено в конспекты.');
    } catch (err) {
      setSaveError(err?.message || err);
    } finally {
      setSaveBusy(false);
    }
  };

  const findImageAtPoint = (point) => {
    const boardItems = boardItemsRef.current;
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
      const drag = dragImageRef.current;
      if (!next || !drag.active || drag.id !== next.id) return;
      drag.x = next.x;
      drag.y = next.y;
      renderBoard();
      renderOverlay();
    });
  };

  const showImageNotice = (message) => {
    setImageActionNotice(message);
    if (imageActionNoticeTimeoutRef.current) clearTimeout(imageActionNoticeTimeoutRef.current);
    imageActionNoticeTimeoutRef.current = setTimeout(() => {
      imageActionNoticeTimeoutRef.current = null;
      setImageActionNotice('');
    }, 1800);
  };

  const updateImageItem = (id, updater, { stopCapturing = true } = {}) => {
    const yItems = yItemsRef.current;
    const docInstance = docRef.current;
    if (!id || !yItems || !docInstance || typeof updater !== 'function') return null;
    let updated = null;
    docInstance.transact(() => {
      for (let i = yItems.length - 1; i >= 0; i -= 1) {
        const raw = yItems.get(i);
        const item = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
        if (item?.id !== id || item.type !== 'image') continue;
        const next = updater({ ...item });
        if (!next) break;
        updated = { ...next, id: item.id, type: 'image' };
        yItems.delete(i, 1);
        yItems.insert(i, [updated]);
        break;
      }
    }, localOriginRef.current);
    if (updated && stopCapturing) undoManagerRef.current?.stopCapturing();
    return updated;
  };

  const applyImageCropPreset = (id, targetAspect) => {
    const item = boardItemsRef.current.find((entry) => entry?.id === id && entry.type === 'image');
    if (!item) return;
    const cacheEntry = imageCacheRef.current.get(getBoardImageSource(item));
    const naturalWidth = Math.max(1, Number(item.naturalWidth) || Number(cacheEntry?.img?.naturalWidth) || Number(item.width) || 1);
    const naturalHeight = Math.max(1, Number(item.naturalHeight) || Number(cacheEntry?.img?.naturalHeight) || Number(item.height) || 1);
    const naturalAspect = naturalWidth / naturalHeight;
    const aspect = targetAspect === 'original' ? naturalAspect : Math.max(0.1, Number(targetAspect) || naturalAspect);
    let crop = null;
    if (targetAspect !== 'original') {
      crop = naturalAspect > aspect
        ? { x: (1 - aspect / naturalAspect) / 2, y: 0, width: aspect / naturalAspect, height: 1 }
        : { x: 0, y: (1 - naturalAspect / aspect) / 2, width: 1, height: naturalAspect / aspect };
    }
    updateImageItem(id, (current) => {
      const currentWidth = Math.max(1, Number(current.width) || 1);
      const nextHeight = Math.max(BOARD_IMAGE_MIN_SIZE, Math.min(BOARD_IMAGE_MAX_SIZE, currentWidth / aspect));
      const centerY = (Number(current.y) || 0) + (Number(current.height) || 1) / 2;
      return {
        ...current,
        crop,
        naturalWidth,
        naturalHeight,
        height: nextHeight,
        y: centerY - nextHeight / 2,
      };
    });
    setIsImageCropMenuOpen(false);
    showImageNotice(targetAspect === 'original' ? 'Обрезка сброшена' : 'Изображение обрезано');
  };

  const downloadBoardImage = async (item) => {
    const source = getBoardImageSource(item);
    if (!source || typeof document === 'undefined') return;
    const image = await new Promise((resolve) => {
      const cached = imageCacheRef.current.get(source);
      if (cached?.loaded && cached.img) {
        resolve(cached.img);
        return;
      }
      const nextImage = new Image();
      prepareBoardImageElement(nextImage, source);
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => resolve(null);
      nextImage.src = source;
    });
    if (!image) {
      showImageNotice('Не удалось скачать изображение');
      return;
    }
    const exportScale = Math.min(4, Math.max(1, getBoardPixelRatio()));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((Number(item.width) || 1) * exportScale));
    canvas.height = Math.max(1, Math.round((Number(item.height) || 1) * exportScale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(exportScale, 0, 0, exportScale, 0, 0);
    drawBoardImage(ctx, image, item, { x: 0, y: 0 });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `image-${String(item.id || Date.now()).slice(0, 8)}.png`;
    link.click();
    showImageNotice('Изображение скачано');
  };

  const copyTextToClipboard = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  };

  const copySelectedImage = (item) => {
    if (!item) return;
    const copy = {
      ...item,
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      x: (Number(item.x) || 0) + 24,
      y: (Number(item.y) || 0) + 24,
      locked: false,
      superLocked: false,
      votes: 0,
    };
    const capacity = ensureBoardCanAddItems([copy]);
    if (!capacity.ok) {
      showImageNotice(capacity.error);
      return;
    }
    docRef.current?.transact(() => yItemsRef.current?.push([copy]), localOriginRef.current);
    undoManagerRef.current?.stopCapturing();
    setSelectedImageId(copy.id);
    setSelectedIds(tool === 'select' ? [copy.id] : []);
    showImageNotice('Копия создана');
  };

  const moveImageLayer = (id, direction) => {
    const yItems = yItemsRef.current;
    const docInstance = docRef.current;
    if (!yItems || !docInstance) return;
    docInstance.transact(() => {
      for (let i = 0; i < yItems.length; i += 1) {
        const raw = yItems.get(i);
        const item = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
        if (item?.id !== id) continue;
        yItems.delete(i, 1);
        if (direction === 'top') yItems.push([item]);
        else yItems.insert(0, [item]);
        break;
      }
    }, localOriginRef.current);
    undoManagerRef.current?.stopCapturing();
    setIsImageMoreOpen(false);
    showImageNotice(direction === 'top' ? 'Перемещено наверх' : 'Перемещено вниз');
  };

  const setSelectedImageHyperlink = (item) => {
    if (!item || typeof window === 'undefined') return;
    const entered = window.prompt('Введите ссылку для изображения', item.hyperlink || 'https://');
    if (entered === null) return;
    const trimmed = entered.trim();
    const hyperlink = trimmed && !/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? `https://${trimmed}` : trimmed;
    updateImageItem(item.id, (current) => ({ ...current, hyperlink }));
    showImageNotice(hyperlink ? 'Ссылка добавлена' : 'Ссылка удалена');
  };

  const calculateImageResize = (start, handle, point) => {
    const minSize = BOARD_IMAGE_MIN_SIZE;
    const maxSize = BOARD_IMAGE_MAX_SIZE;
    const x = Number(start.x) || 0;
    const y = Number(start.y) || 0;
    const width = Math.max(1, Number(start.width) || 1);
    const height = Math.max(1, Number(start.height) || 1);
    const px = Number(point.x) || 0;
    const py = Number(point.y) || 0;
    const clampSize = (value) => Math.min(maxSize, Math.max(minSize, value));

    if (handle.length === 2) {
      let factor = 1;
      if (handle === 'nw') factor = Math.max((x + width - px) / width, (y + height - py) / height);
      if (handle === 'ne') factor = Math.max((px - x) / width, (y + height - py) / height);
      if (handle === 'se') factor = Math.max((px - x) / width, (py - y) / height);
      if (handle === 'sw') factor = Math.max((x + width - px) / width, (py - y) / height);
      const minFactor = Math.max(minSize / width, minSize / height);
      const maxFactor = Math.min(maxSize / width, maxSize / height);
      factor = Math.min(maxFactor, Math.max(minFactor, factor));
      const nextWidth = width * factor;
      const nextHeight = height * factor;
      return {
        x: handle.includes('w') ? x + width - nextWidth : x,
        y: handle.includes('n') ? y + height - nextHeight : y,
        width: nextWidth,
        height: nextHeight,
      };
    }

    if (handle === 'e') return { x, y, width: clampSize(px - x), height };
    if (handle === 's') return { x, y, width, height: clampSize(py - y) };
    if (handle === 'w') {
      const nextWidth = clampSize(x + width - px);
      return { x: x + width - nextWidth, y, width: nextWidth, height };
    }
    const nextHeight = clampSize(y + height - py);
    return { x, y: y + height - nextHeight, width, height: nextHeight };
  };

  const startImageResize = (event, handle, item) => {
    if (!item || item.locked || item.superLocked || typeof window === 'undefined') return;
    event.preventDefault();
    event.stopPropagation();
    const start = {
      id: item.id,
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      width: Math.max(1, Number(item.width) || 1),
      height: Math.max(1, Number(item.height) || 1),
    };
    const onMove = (moveEvent) => {
      const surfacePoint = getCanvasSurfacePoint(moveEvent.clientX, moveEvent.clientY);
      if (!surfacePoint) return;
      const currentZoom = zoomRef.current || 1;
      const point = {
        x: offsetRef.current.x + surfacePoint.x / currentZoom,
        y: offsetRef.current.y + surfacePoint.y / currentZoom,
      };
      const geometry = calculateImageResize(start, handle, point);
      const preview = { id: item.id, ...geometry };
      imageResizePreviewRef.current = preview;
      imageResizeRef.current.preview = preview;
      setImageResizePreview(preview);
      renderBoard();
      renderOverlay();
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      const preview = imageResizeRef.current.preview;
      imageResizeRef.current = { active: false };
      imageResizePreviewRef.current = null;
      setImageResizePreview(null);
      if (preview?.id === item.id) {
        updateImageItem(item.id, (current) => ({ ...current, ...preview }));
      }
    };
    imageResizeRef.current = { active: true, id: item.id, handle, preview: null, cleanup: stop };
    setIsImageCropMenuOpen(false);
    setIsImageMoreOpen(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
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
      else if (item.type === 'line' || item.type === 'arrow') hit = hitTestLine(item, point, BOARD_ERASER_RADIUS);
      else if (item.type === 'shape' || item.type === 'text') hit = isPointInRect(point, {
        x: item.x || 0,
        y: item.y || 0,
        width: item.width || 0,
        height: item.height || 0,
      });
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
    if (item.type === 'line' || item.type === 'arrow') {
      const start = item.start || { x: 0, y: 0 };
      const end = item.end || { x: 0, y: 0 };
      const minX = Math.min(start.x || 0, end.x || 0);
      const minY = Math.min(start.y || 0, end.y || 0);
      const maxX = Math.max(start.x || 0, end.x || 0);
      const maxY = Math.max(start.y || 0, end.y || 0);
      return { minX, minY, maxX, maxY };
    }
    if (item.type === 'shape' || item.type === 'text') {
      const x = item.x || 0;
      const y = item.y || 0;
      const w = item.width || 0;
      const h = item.height || 0;
      return { minX: x, minY: y, maxX: x + w, maxY: y + h };
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

  const getBoardContentBounds = (items) => {
    const sourceItems = Array.isArray(items) ? items : [];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    sourceItems.forEach((item) => {
      const bounds = getItemBounds(item);
      if (!bounds) return;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
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
    return boardItemsRef.current
      .filter((item) => rectIntersects(rect, getItemBounds(item)))
      .map((item) => item.id)
      .filter(Boolean);
  };

  const getItemsAtPoint = (point) => {
    return boardItemsRef.current
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
        if (item.type === 'line' || item.type === 'arrow') return hitTestLine(item, point, BOARD_SELECTION_HIT_RADIUS);
        if (item.type === 'shape' || item.type === 'text') {
          const x = item.x || 0;
          const y = item.y || 0;
          return point.x >= x && point.x <= x + (item.width || 0) && point.y >= y && point.y <= y + (item.height || 0);
        }
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
    boardItemsRef.current.forEach((item) => {
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
    return boardItemsRef.current
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
        if (item.type === 'line' || item.type === 'arrow') {
          return {
            id: item.id,
            type: item.type,
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
        if (item.type === 'shape' || item.type === 'text') {
          return {
            id: item.id,
            type: item.type,
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
          } else if (current.type === 'line' || current.type === 'arrow') {
            next = {
              ...current,
              start: { x: (item.start?.x || 0) + dx, y: (item.start?.y || 0) + dy },
              end: { x: (item.end?.x || 0) + dx, y: (item.end?.y || 0) + dy },
            };
          } else if (current.type === 'image' || current.type === 'shape' || current.type === 'text') {
            next = { ...current, x: (item.x || 0) + dx, y: (item.y || 0) + dy };
          }
          yItems.delete(i, 1);
          yItems.insert(i, [next]);
          break;
        }
      });
    }, localOriginRef.current);
  };

  const getSelectionDragPreviewItem = (item) => {
    const drag = selectionDragRef.current;
    const pending = pendingSelectionMoveRef.current;
    if (!item || !drag.active || !Array.isArray(drag.items) || !pending) return item;
    const snapshot = drag.items.find((entry) => entry?.id === item.id);
    if (!snapshot) return item;
    const dx = Number(pending.dx) || 0;
    const dy = Number(pending.dy) || 0;
    if (snapshot.type === 'stroke') {
      return {
        ...item,
        points: (snapshot.points || []).map((pt) => {
          const pressure = Number(pt?.pressure);
          if (Number.isFinite(pressure)) {
            return { x: (pt.x || 0) + dx, y: (pt.y || 0) + dy, pressure };
          }
          return { x: (pt.x || 0) + dx, y: (pt.y || 0) + dy };
        }),
      };
    }
    if (snapshot.type === 'line' || snapshot.type === 'arrow') {
      return {
        ...item,
        start: { x: (snapshot.start?.x || 0) + dx, y: (snapshot.start?.y || 0) + dy },
        end: { x: (snapshot.end?.x || 0) + dx, y: (snapshot.end?.y || 0) + dy },
      };
    }
    if (snapshot.type === 'image') {
      return {
        ...item,
        x: (snapshot.x || 0) + dx,
        y: (snapshot.y || 0) + dy,
      };
    }
    if (snapshot.type === 'shape' || snapshot.type === 'text') {
      return {
        ...item,
        x: (snapshot.x || 0) + dx,
        y: (snapshot.y || 0) + dy,
      };
    }
    return item;
  };

  const scheduleSelectionMove = (dx, dy) => {
    pendingSelectionMoveRef.current = { dx, dy };
    if (selectionMoveRafRef.current) return;
    selectionMoveRafRef.current = requestAnimationFrame(() => {
      selectionMoveRafRef.current = null;
      renderBoard();
      renderOverlay();
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

  const getSmoothedStrokePoints = (points) => {
    const source = Array.isArray(points) ? points : [];
    if (source.length <= 2) return source;
    const normalizePoint = (point) => {
      const x = Number(point?.x) || 0;
      const y = Number(point?.y) || 0;
      const pressure = Number(point?.pressure);
      if (Number.isFinite(pressure)) {
        return { x, y, pressure };
      }
      return { x, y };
    };
    const nextPoints = [normalizePoint(source[0])];
    let previous = nextPoints[0];
    for (let index = 1; index < source.length - 1; index += 1) {
      const current = normalizePoint(source[index]);
      const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
      const distanceRatio = clamp(distance / BOARD_STROKE_SMOOTHING_DISTANCE, 0, 1);
      const alpha = BOARD_STROKE_SMOOTHING_MIN_ALPHA
        + (BOARD_STROKE_SMOOTHING_MAX_ALPHA - BOARD_STROKE_SMOOTHING_MIN_ALPHA) * distanceRatio;
      const smoothed = {
        x: previous.x + (current.x - previous.x) * alpha,
        y: previous.y + (current.y - previous.y) * alpha,
      };
      if (Number.isFinite(Number(current.pressure))) {
        const previousPressure = Number.isFinite(Number(previous.pressure))
          ? Number(previous.pressure)
          : Number(current.pressure);
        smoothed.pressure = previousPressure + (Number(current.pressure) - previousPressure) * alpha;
      }
      nextPoints.push(smoothed);
      previous = smoothed;
    }
    nextPoints.push(normalizePoint(source[source.length - 1]));
    return nextPoints;
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
    const rawPoints = Array.isArray(stroke?.points) ? stroke.points : [];
    const points = getSmoothedStrokePoints(rawPoints);
    const lineWidth = Number(stroke.width) || BOARD_STROKE_WIDTH;
    const colorValue = stroke.color || BOARD_DEFAULT_COLOR;
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
    ctx.strokeStyle = line.color || BOARD_DEFAULT_COLOR;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(line.start.x || 0, line.start.y || 0);
    ctx.lineTo(line.end.x || 0, line.end.y || 0);
    ctx.stroke();
  };

  const drawArrow = (ctx, arrow) => {
    if (!arrow?.start || !arrow?.end) return;
    const startX = arrow.start.x || 0;
    const startY = arrow.start.y || 0;
    const endX = arrow.end.x || 0;
    const endY = arrow.end.y || 0;
    const lineWidth = Number(arrow.width) || BOARD_LINE_WIDTH;
    const angle = Math.atan2(endY - startY, endX - startX);
    const headLength = Math.max(12, lineWidth * 3.2);
    ctx.save();
    ctx.strokeStyle = arrow.color || BOARD_DEFAULT_COLOR;
    ctx.fillStyle = arrow.color || BOARD_DEFAULT_COLOR;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawShape = (ctx, shape) => {
    const x = Number(shape?.x) || 0;
    const y = Number(shape?.y) || 0;
    const width = Math.max(1, Number(shape?.width) || 1);
    const height = Math.max(1, Number(shape?.height) || 1);
    const colorValue = shape?.color || BOARD_DEFAULT_COLOR;
    ctx.save();
    ctx.strokeStyle = colorValue;
    ctx.fillStyle = colorValue;
    ctx.lineWidth = Number(shape?.strokeWidth) || BOARD_LINE_WIDTH;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (shape?.shape === 'ellipse') {
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else if (shape?.shape === 'diamond') {
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width, y + height / 2);
      ctx.lineTo(x + width / 2, y + height);
      ctx.lineTo(x, y + height / 2);
      ctx.closePath();
    } else {
      ctx.roundRect(x, y, width, height, Math.min(12, width / 5, height / 5));
    }
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fill();
    ctx.restore();
    ctx.stroke();
    ctx.restore();
  };

  const drawTextItem = (ctx, textItem) => {
    const text = String(textItem?.text || '');
    if (!text) return;
    const fontSize = Math.max(10, Number(textItem.fontSize) || BOARD_TEXT_FONT_SIZE);
    const lineHeight = fontSize * 1.25;
    ctx.save();
    ctx.fillStyle = textItem.color || BOARD_DEFAULT_COLOR;
    ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    text.split('\n').forEach((line, index) => {
      ctx.fillText(line, Number(textItem.x) || 0, (Number(textItem.y) || 0) + index * lineHeight);
    });
    ctx.restore();
  };

  const getCachedImage = (source) => {
    if (!source) return null;
    const cached = imageCacheRef.current.get(source);
    if (cached) return cached;
    const img = new Image();
    const entry = { img, loaded: false };
    imageCacheRef.current.set(source, entry);
    prepareBoardImageElement(img, source);
    img.onload = () => {
      entry.loaded = true;
      scheduleBoardRenderRef.current?.();
      scheduleMinimapRenderRef.current?.(0);
      scheduleBoardSceneRenderRef.current?.({ mode: 'full' });
    };
    img.src = source;
    return entry;
  };

  const drawBoardItemToScene = useCallback((ctx, item) => {
    if (!ctx || !item) return;
    if (item.type === 'stroke') {
      drawStroke(ctx, item);
      return;
    }
    if (item.type === 'line') {
      drawLine(ctx, item);
      return;
    }
    if (item.type === 'arrow') {
      drawArrow(ctx, item);
      return;
    }
    if (item.type === 'shape') {
      drawShape(ctx, item);
      return;
    }
    if (item.type === 'text') {
      drawTextItem(ctx, item);
      return;
    }
    if (item.type === 'image') {
      const cacheEntry = getCachedImage(getBoardImageSource(item));
      if (!cacheEntry?.img || !cacheEntry.loaded) return;
      const img = cacheEntry.img;
      drawBoardImage(ctx, img, item);
    }
  }, []);

  const resetBoardScene = useCallback(() => {
    const previousScene = boardSceneRef.current;
    if (previousScene?.canvas) {
      previousScene.canvas.width = 1;
      previousScene.canvas.height = 1;
    }
    boardSceneRef.current = null;
  }, []);

  const buildBoardScene = useCallback(() => {
    if (typeof document === 'undefined') {
      resetBoardScene();
      return null;
    }
    const items = boardItemsRef.current;
    const contentBounds = getBoardContentBounds(items);
    if (!contentBounds) {
      resetBoardScene();
      return null;
    }

    const width = Math.max(1, contentBounds.maxX - contentBounds.minX + BOARD_SCENE_PADDING * 2);
    const height = Math.max(1, contentBounds.maxY - contentBounds.minY + BOARD_SCENE_PADDING * 2);
    const originX = contentBounds.minX - BOARD_SCENE_PADDING;
    const originY = contentBounds.minY - BOARD_SCENE_PADDING;
    const targetScale = getBoardPixelRatio();
    const dimensionScale = Math.min(
      BOARD_SCENE_MAX_DIMENSION / Math.max(width, 1),
      BOARD_SCENE_MAX_DIMENSION / Math.max(height, 1)
    );
    const pixelScale = Math.sqrt(BOARD_SCENE_MAX_PIXELS / Math.max(width * height, 1));
    const scale = Math.max(Number.EPSILON, Math.min(targetScale, dimensionScale, pixelScale));
    const pixelWidth = Math.max(1, Math.round(width * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));
    const previousScene = boardSceneRef.current;
    const canvas = previousScene?.canvas || document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resetBoardScene();
      return null;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.setTransform(scale, 0, 0, scale, -originX * scale, -originY * scale);
    const drag = dragImageRef.current;
    items.forEach((item) => {
      const selectionPreviewItem = getSelectionDragPreviewItem(item);
      const renderItem = drag.active && selectionPreviewItem?.type === 'image' && selectionPreviewItem.id === drag.id
        ? {
          ...selectionPreviewItem,
          x: Number.isFinite(Number(drag.x)) ? Number(drag.x) : selectionPreviewItem.x,
          y: Number.isFinite(Number(drag.y)) ? Number(drag.y) : selectionPreviewItem.y,
        }
        : selectionPreviewItem;
      drawBoardItemToScene(ctx, renderItem);
    });
    const nextScene = {
      canvas,
      originX,
      originY,
      width,
      height,
      scale,
      contentBounds,
    };
    boardSceneRef.current = nextScene;
    return nextScene;
  }, [drawBoardItemToScene, resetBoardScene]);

  const renderBoardSceneFull = useCallback(() => {
    buildBoardScene();
    scheduleBoardRenderRef.current?.();
    scheduleMinimapRenderRef.current?.(0);
  }, [buildBoardScene]);

  const sceneContainsItem = useCallback((scene, item) => {
    if (!scene || !item) return false;
    const bounds = getItemBounds(item);
    if (!bounds) return false;
    const maxX = scene.originX + scene.width;
    const maxY = scene.originY + scene.height;
    return (
      bounds.minX >= scene.originX
      && bounds.minY >= scene.originY
      && bounds.maxX <= maxX
      && bounds.maxY <= maxY
    );
  }, []);

  const renderBoardSceneAppend = useCallback((appendedItems) => {
    const items = Array.isArray(appendedItems) ? appendedItems.filter(Boolean) : [];
    const scene = boardSceneRef.current;
    if (!scene || items.length === 0) {
      renderBoardSceneFull();
      return;
    }
    if (items.some((item) => !sceneContainsItem(scene, item))) {
      renderBoardSceneFull();
      return;
    }
    const ctx = scene.canvas.getContext('2d');
    if (!ctx) {
      renderBoardSceneFull();
      return;
    }
    ctx.setTransform(scene.scale, 0, 0, scene.scale, -scene.originX * scene.scale, -scene.originY * scene.scale);
    const resizePreview = imageResizePreviewRef.current;
    items.forEach((item) => {
      const renderItem = resizePreview?.id === item?.id
        ? { ...item, ...resizePreview }
        : item;
      drawBoardItemToScene(ctx, renderItem);
    });

    const nextContentBounds = getBoardContentBounds(boardItemsRef.current);
    if (nextContentBounds) {
      boardSceneRef.current = {
        ...scene,
        contentBounds: nextContentBounds,
      };
    }

    scheduleBoardRenderRef.current?.();
    scheduleMinimapRenderRef.current?.(0);
  }, [drawBoardItemToScene, renderBoardSceneFull, sceneContainsItem]);

  const scheduleBoardSceneRender = useCallback((renderPlan = { mode: 'full' }) => {
    if (typeof window === 'undefined') return;
    const normalizedPlan = renderPlan?.mode === 'append' && Array.isArray(renderPlan?.items) && renderPlan.items.length > 0
      ? { mode: 'append', items: renderPlan.items.slice() }
      : (renderPlan?.mode === 'none' ? { mode: 'none' } : { mode: 'full' });

    const pendingPlan = pendingSceneRenderRef.current;
    if (!pendingPlan || pendingPlan.mode === 'none') {
      pendingSceneRenderRef.current = normalizedPlan;
    } else if (pendingPlan.mode === 'full' || normalizedPlan.mode === 'full') {
      pendingSceneRenderRef.current = { mode: 'full' };
    } else if (normalizedPlan.mode === 'append') {
      pendingSceneRenderRef.current = {
        mode: 'append',
        items: [...(pendingPlan.items || []), ...normalizedPlan.items],
      };
    }

    if (sceneRenderRafRef.current) return;
    sceneRenderRafRef.current = window.requestAnimationFrame(() => {
      sceneRenderRafRef.current = null;
      const nextPlan = pendingSceneRenderRef.current;
      pendingSceneRenderRef.current = null;
      if (!nextPlan || nextPlan.mode === 'none') return;
      if (nextPlan.mode === 'append') {
        renderBoardSceneAppend(nextPlan.items);
        return;
      }
      renderBoardSceneFull();
    });
  }, [renderBoardSceneAppend, renderBoardSceneFull]);

  const renderBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prepared = prepareBoardRenderCanvas(
      canvas,
      boardSizeRef.current?.width,
      boardSizeRef.current?.height
    );
    if (!prepared) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { pixelRatio, pixelWidth, pixelHeight } = prepared;
    const currentZoom = zoomRef.current || 1;
    const currentOffset = offsetRef.current || { x: 0, y: 0 };
    const renderScale = pixelRatio * currentZoom;
    const items = boardItemsRef.current || [];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.fillStyle = BOARD_BACKGROUND_COLOR;
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    if (!items.length) {
      ctx.restore();
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(
      renderScale,
      0,
      0,
      renderScale,
      -(currentOffset.x || 0) * renderScale,
      -(currentOffset.y || 0) * renderScale
    );
    const resizePreview = imageResizePreviewRef.current;
    items.forEach((item) => {
      drawBoardItemToScene(
        ctx,
        resizePreview?.id === item?.id ? { ...item, ...resizePreview } : item
      );
    });
    ctx.restore();
  }, [drawBoardItemToScene]);

  useEffect(() => {
    renderBoard();
  }, [renderBoard, boardSize]);

  useEffect(() => {
    renderBoard();
  }, [boardRevision, renderBoard]);

  useEffect(() => {
    if (typeof onMemorySnapshotRenderer !== 'function') return undefined;
    const cropVisibleBoardContent = (sourceCanvas) => {
      const width = sourceCanvas?.width || 0;
      const height = sourceCanvas?.height || 0;
      if (!width || !height) return sourceCanvas;
      const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return sourceCanvas;
      let pixels;
      try {
        pixels = ctx.getImageData(0, 0, width, height).data;
      } catch {
        return sourceCanvas;
      }
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      const step = Math.max(1, Math.floor(Math.min(width, height) / 900));
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const idx = (y * width + x) * 4;
          const alpha = pixels[idx + 3];
          if (alpha < 18) continue;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const nearWhite = r > 246 && g > 246 && b > 246;
          const faintNeutral = Math.abs(r - g) < 5 && Math.abs(g - b) < 5 && r > 238;
          if (nearWhite || faintNeutral) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX < minX || maxY < minY) return sourceCanvas;
      const pad = Math.max(24, Math.round(Math.min(width, height) * 0.035));
      const cropX = Math.max(0, minX - pad);
      const cropY = Math.max(0, minY - pad);
      const cropW = Math.min(width - cropX, maxX - minX + pad * 2);
      const cropH = Math.min(height - cropY, maxY - minY + pad * 2);
      if (cropW >= width * 0.94 && cropH >= height * 0.94) return sourceCanvas;
      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = Math.max(1, Math.round(cropW));
      targetCanvas.height = Math.max(1, Math.round(cropH));
      const targetCtx = targetCanvas.getContext('2d');
      if (!targetCtx) return sourceCanvas;
      targetCtx.fillStyle = '#ffffff';
      targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
      targetCtx.drawImage(
        sourceCanvas,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        targetCanvas.width,
        targetCanvas.height
      );
      return targetCanvas;
    };
    onMemorySnapshotRenderer(async () => {
      const canvas = canvasRef.current;
      const items = boardItemsRef.current || [];
      if (!canvas || !items.length) return null;
      renderBoard();
      const snapshotCanvas = cropVisibleBoardContent(canvas);
      return new Promise((resolve, reject) => {
        snapshotCanvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Не удалось сделать снимок видимой области доски.'));
            return;
          }
          resolve({
            blob,
            itemCount: items.length,
            mode: snapshotCanvas === canvas ? 'viewport' : 'visible-content',
          });
        }, 'image/png');
      });
    });
    return () => {
      onMemorySnapshotRenderer(null);
    };
  }, [onMemorySnapshotRenderer, renderBoard]);

  const selectedImage = useMemo(
    () => {
      const currentRevision = boardRevision;
      if (currentRevision < 0) return null;
      return boardItemsRef.current.find((item) => item?.id === selectedImageId && item.type === 'image') || null;
    },
    [boardRevision, selectedImageId]
  );
  useEffect(() => {
    if (!selectedImage || tool !== 'select' || selectedIdsRef.current.length !== 1) return;
    if (selectedIdsRef.current[0] !== selectedImage.id || selectionDragRef.current.active || imageResizeRef.current.active) return;
    setSelectionBox({
      x: Number(selectedImage.x) || 0,
      y: Number(selectedImage.y) || 0,
      width: Math.max(1, Number(selectedImage.width) || 1),
      height: Math.max(1, Number(selectedImage.height) || 1),
    });
  }, [selectedImage, tool]);
  const displaySelectedImage = selectedImage && imageResizePreview?.id === selectedImage.id
    ? { ...selectedImage, ...imageResizePreview }
    : (selectedImage && tool === 'select' && selectedIds.length === 1 && selectedIds[0] === selectedImage.id && selectionBox
      ? {
        ...selectedImage,
        x: selectionBox.x,
        y: selectionBox.y,
        width: selectionBox.width,
        height: selectionBox.height,
      }
      : selectedImage);
  const renderOverlay = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const prepared = prepareBoardRenderCanvas(
      overlay,
      boardSizeRef.current?.width,
      boardSizeRef.current?.height
    );
    if (!prepared) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    const { pixelRatio, pixelWidth, pixelHeight } = prepared;
    const currentZoom = zoomRef.current || 1;
    const renderScale = pixelRatio * currentZoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.setTransform(
      renderScale,
      0,
      0,
      renderScale,
      -(offsetRef.current.x || 0) * renderScale,
      -(offsetRef.current.y || 0) * renderScale
    );
    if (remotePreviews.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      remotePreviews.forEach((preview) => {
        if (preview?.type === 'stroke') {
          drawStroke(ctx, preview, overlay.width, overlay.height);
        } else if (preview?.type === 'line') {
          drawLine(ctx, preview, overlay.width, overlay.height);
        } else if (preview?.type === 'arrow') {
          drawArrow(ctx, preview);
        } else if (preview?.type === 'shape') {
          drawShape(ctx, preview);
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
        drawLine(ctx, { start: state.start, end: state.end, color, width: penWidth }, overlay.width, overlay.height);
      }
      if (tool === 'arrow' && state.start && state.end) {
        drawArrow(ctx, { start: state.start, end: state.end, color, width: penWidth });
      }
      if (tool === 'shape' && state.start && state.end) {
        const rect = normalizeRect(state.start, state.end);
        drawShape(ctx, { ...rect, shape: shapeKind, color, strokeWidth: penWidth });
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
    const textBoxDraw = textBoxDrawRef.current;
    if (tool === 'text' && textBoxDraw.active && textBoxDraw.start && textBoxDraw.current) {
      const textRect = normalizeRect(textBoxDraw.start, textBoxDraw.current);
      ctx.save();
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.95)';
      ctx.fillStyle = 'rgba(139, 92, 246, 0.08)';
      ctx.lineWidth = 1.5 / (zoomRef.current || 1);
      ctx.setLineDash([6 / (zoomRef.current || 1), 4 / (zoomRef.current || 1)]);
      ctx.strokeRect(textRect.x, textRect.y, textRect.width, textRect.height);
      ctx.fillRect(textRect.x, textRect.y, textRect.width, textRect.height);
      ctx.restore();
    }
    const drag = dragImageRef.current;
    const overlaySelectedImage = displaySelectedImage && drag.active && drag.id === displaySelectedImage.id
      ? {
        ...displaySelectedImage,
        x: Number.isFinite(Number(drag.x)) ? Number(drag.x) : displaySelectedImage.x,
        y: Number.isFinite(Number(drag.y)) ? Number(drag.y) : displaySelectedImage.y,
      }
      : displaySelectedImage;
    if ((tool === 'move' || tool === 'select') && overlaySelectedImage) {
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.9)';
      ctx.lineWidth = 1.5 / (zoomRef.current || 1);
      ctx.setLineDash([6 / (zoomRef.current || 1), 4 / (zoomRef.current || 1)]);
      ctx.strokeRect(
        overlaySelectedImage.x || 0,
        overlaySelectedImage.y || 0,
        overlaySelectedImage.width || 0,
        overlaySelectedImage.height || 0
      );
      ctx.restore();
    }
  };

  useEffect(() => {
    renderOverlay();
  }, [remotePreviews, boardSize, tool, color, penWidth, shapeKind, displaySelectedImage, selectionBox]);

  useEffect(() => {
    renderBoard();
  }, [zoom, offset, renderBoard]);

  useEffect(() => {
    renderOverlay();
  }, [zoom, offset, remotePreviews, tool, color, penWidth, shapeKind, displaySelectedImage, selectionBox]);

  const scheduleBoardRender = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (boardRenderRafRef.current) return;
    boardRenderRafRef.current = window.requestAnimationFrame(() => {
      boardRenderRafRef.current = null;
      renderBoard();
    });
  }, [renderBoard]);

  useEffect(() => {
    scheduleBoardRenderRef.current = scheduleBoardRender;
  }, [scheduleBoardRender]);

  useEffect(() => {
    scheduleBoardSceneRenderRef.current = scheduleBoardSceneRender;
  }, [scheduleBoardSceneRender]);

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

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleDocumentPointerDown = (event) => {
      const root = boardRootRef.current;
      if (!root || !event.target?.nodeType) return;
      if (!root.contains(event.target)) boardPasteFocusedRef.current = false;
    };
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      setBoardSize({ width, height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    prepareBoardRenderCanvas(canvas, boardSize.width, boardSize.height);
    prepareBoardRenderCanvas(overlay, boardSize.width, boardSize.height);
    renderBoard();
    renderOverlay();
  }, [boardSize, renderBoard]);

  useEffect(() => {
    if (!roomId || !wsUrl) {
      setStatus('disconnected');
      setPeerCount(0);
      resetBoardData();
      setUndoState({ canUndo: false, canRedo: false });
      docRef.current = null;
      yItemsRef.current = null;
      providerRef.current = null;
      awarenessRef.current = null;
      undoManagerRef.current = null;
      remotePreviewStateRef.current.clear();
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

    const updateItems = (event, transaction) => {
      const hasDelta = Array.isArray(event?.changes?.delta) && event.changes.delta.length > 0;
      const nextSnapshot = hasDelta
        ? applyBoardDelta(event.changes.delta)
        : {
          ...buildBoardSnapshotFromYItems(yItems),
          renderPlan: { mode: 'full' },
        };
      commitBoardData(nextSnapshot.nextItems, nextSnapshot.nextEstimatedBytes);
      if (transaction?.local !== false) {
        scheduleLessonReplayBoardSnapshot(nextSnapshot.nextItems);
      }
      scheduleBoardRender();
      const capacityError = getBoardCapacityError(nextSnapshot.nextItems.length, nextSnapshot.nextEstimatedBytes);
      setPasteError((current) => {
        if (capacityError) return capacityError;
        return isBoardCapacityErrorMessage(current) ? '' : current;
      });
      if (nextSnapshot.renderPlan?.mode && nextSnapshot.renderPlan.mode !== 'none') {
        scheduleBoardSceneRender(nextSnapshot.renderPlan);
      }
    };

    const handleStatus = (event) => {
      if (event?.status) setStatus(event.status);
    };
    const handleConnectionClose = (event) => {
      const closeCode = Number(event?.code);
      const closeReason = String(event?.reason || '').trim();
      if (closeCode !== 1012 || closeReason !== 'Board reset') return;

      doc.transact(() => {
        if (yItems.length > 0) yItems.delete(0, yItems.length);
      }, localOriginRef.current);
      undoManager.clear();
      undoManager.stopCapturing();
      updateUndoState();
      resetBoardInteractionState();
      resetBoardData();
    };
    const handleAwareness = () => {
      const states = provider.awareness.getStates();
      const total = states.size;
      setPeerCount(Math.max(0, total - 1));
      const previews = [];
      const cursors = [];
      const activePreviewClientIds = new Set();
      let incomingSummon = null;
      states.forEach((state, clientId) => {
        if (clientId === provider.awareness.clientID) return;
        const clientKey = String(clientId);
        const remoteUser = state?.user;
        const remoteName = typeof remoteUser?.name === 'string' && remoteUser.name.trim()
          ? remoteUser.name.trim()
          : 'Участник';
        const remoteColor = typeof remoteUser?.color === 'string' && remoteUser.color
          ? remoteUser.color
          : '#6366f1';
        const drawing = state?.drawing;
        if (drawing && ['stroke', 'line', 'arrow', 'shape'].includes(drawing.type)) {
          activePreviewClientIds.add(clientKey);
          if (drawing.type === 'stroke') {
            const incomingPoints = Array.isArray(drawing.points)
              ? drawing.points.map((point) => normalizeBoardStoredPoint(point))
              : [];
            if (incomingPoints.length > 0) {
              const previewId = String(drawing.previewId || `${clientKey}:legacy`);
              const seq = Number.isFinite(Number(drawing.seq)) ? Number(drawing.seq) : 0;
              const previous = remotePreviewStateRef.current.get(clientKey);
              if (previous && previous.previewId === previewId && seq <= Number(previous.seq || 0)) {
                previews.push(previous);
              } else {
                const canAppend = Boolean(drawing.append)
                  && previous
                  && previous.previewId === previewId
                  && seq > Number(previous.seq || 0);
                let nextPoints = canAppend
                  ? [
                    ...(Array.isArray(previous.points) ? previous.points : []),
                    ...incomingPoints.slice(1),
                  ]
                  : incomingPoints;
                if (nextPoints.length > BOARD_REMOTE_LIVE_STROKE_MAX_POINTS) {
                  nextPoints = nextPoints.slice(nextPoints.length - BOARD_REMOTE_LIVE_STROKE_MAX_POINTS);
                }
                const preview = {
                  type: 'stroke',
                  previewId,
                  seq,
                  color: typeof drawing.color === 'string' ? drawing.color : remoteColor,
                  width: Number(drawing.width) || BOARD_STROKE_WIDTH,
                  points: nextPoints,
                  name: remoteName,
                  authorId: clientKey,
                };
                remotePreviewStateRef.current.set(clientKey, preview);
                previews.push(preview);
              }
            }
          } else {
            remotePreviewStateRef.current.delete(clientKey);
            previews.push(drawing);
          }
        } else {
          remotePreviewStateRef.current.delete(clientKey);
        }
        const cursor = state?.cursor;
        if (
          cursor
          && Number.isFinite(Number(cursor?.x))
          && Number.isFinite(Number(cursor?.y))
        ) {
          cursors.push({
            id: clientKey,
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
      remotePreviewStateRef.current.forEach((_, clientKey) => {
        if (!activePreviewClientIds.has(clientKey)) {
          remotePreviewStateRef.current.delete(clientKey);
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
    provider.on('connection-close', handleConnectionClose);
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
      scheduleLessonReplayBoardSnapshot(yItems.toArray(), 0);
      flushLessonReplayBoardSnapshot();
      undoManager.off('stack-item-added', updateUndoState);
      undoManager.off('stack-item-popped', updateUndoState);
      undoManager.off('stack-item-updated', updateUndoState);
      undoManager.off('stack-item-removed', updateUndoState);
      provider.awareness.off('change', handleAwareness);
      provider.off('connection-close', handleConnectionClose);
      provider.off('status', handleStatus);
      provider.awareness.setLocalStateField('drawing', null);
      provider.awareness.setLocalStateField('cursor', null);
      provider.awareness.setLocalStateField('summon', null);
      undoManagerRef.current = null;
      setUndoState({ canUndo: false, canRedo: false });
      setRemoteCursors([]);
      resetBoardData();
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
      awarenessRef.current = null;
      docRef.current = null;
    };
  }, [roomId, wsUrl, localName, localColor, isTeacher, applyBoardDelta, buildBoardSnapshotFromYItems, commitBoardData, flushLessonReplayBoardSnapshot, getBoardCapacityError, resetBoardData, resetBoardInteractionState, scheduleBoardRender, scheduleBoardSceneRender, scheduleLessonReplayBoardSnapshot]);

  useEffect(() => {
    const handlePaste = async (event) => {
      if (!roomId || !yItemsRef.current) return;
      if (!shouldHandleBoardImagePaste(event)) return;
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
      const docInstance = docRef.current;
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
          img.src = objectUrl;
        });
        const prepared = await prepareBoardImageUpload(file, img);
        const initialCapacity = ensureBoardCanAddItems([{
          type: 'image',
          assetId: '0'.repeat(36),
          assetUrl: `/uploads/board-asset-${'0'.repeat(64)}.webp`,
        }]);
        if (!initialCapacity.ok) {
          setPasteError(initialCapacity.error);
          return;
        }
        const uploaded = await api.uploadBoardAsset(prepared.file, effectiveStudentId);
        const assetUrl = normalizeBoardAssetUrl(uploaded?.url);
        if (!assetUrl || !uploaded?.id) throw new Error('Сервер вернул некорректную ссылку на изображение');
        if (!docInstance || docRef.current !== docInstance || !yItemsRef.current) return;

        const naturalWidth = Math.max(1, Number(prepared.naturalWidth) || 1);
        const naturalHeight = Math.max(1, Number(prepared.naturalHeight) || 1);
        const scale = getBoardPasteScale(naturalWidth, naturalHeight);
        const widthPx = Math.max(1, naturalWidth * scale);
        const heightPx = Math.max(1, naturalHeight * scale);
        const pointer = getBoardPastePoint();
        const x = pointer.x - widthPx / 2;
        const y = pointer.y - heightPx / 2;
        const entry = {
          id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
          type: 'image',
          assetId: String(uploaded.id),
          assetUrl,
          x,
          y,
          width: widthPx,
          height: heightPx,
          naturalWidth,
          naturalHeight,
          authorId: userId,
        };
        const capacity = ensureBoardCanAddItems([entry]);
        if (!capacity.ok) {
          setPasteError(capacity.error);
          return;
        }
        setPasteError('');
        docInstance.transact(() => {
          yItemsRef.current?.push([entry]);
        }, localOriginRef.current);
        if (toolRef.current === 'move' || toolRef.current === 'select') {
          setSelectedImageId(entry.id);
          if (toolRef.current === 'select') {
            setSelectedIds([entry.id]);
            setSelectionBox({ x, y, width: widthPx, height: heightPx });
          }
        }
        lastPointerRef.current = { x: pointer.x, y: pointer.y };
      } catch (error) {
        setPasteError(error?.message || 'Не удалось загрузить изображение');
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    if (typeof window === 'undefined') return undefined;
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [effectiveStudentId, roomId, userId, ensureBoardCanAddItems]);

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
        if (sourcePoints.length === 0) return;
        const latestIndex = sourcePoints.length - 1;
        const lastSentIndex = Number.isInteger(state.previewLastSentIndex)
          ? state.previewLastSentIndex
          : -1;
        if (lastSentIndex >= latestIndex) return;
        const sliceStart = lastSentIndex > 0 ? lastSentIndex : 0;
        const rawPoints = sourcePoints.slice(sliceStart);
        const maxPoints = lowBandwidthMode
          ? Math.max(8, Math.floor(BOARD_LIVE_STROKE_POINTS_PER_UPDATE / 2))
          : BOARD_LIVE_STROKE_POINTS_PER_UPDATE;
        const points = compactBoardLiveStrokePoints(rawPoints, maxPoints);
        state.previewLastSentIndex = latestIndex;
        state.previewSeq = (Number(state.previewSeq) || 0) + 1;
        awarenessRef.current?.setLocalStateField('drawing', {
          type: 'stroke',
          previewId: state.previewId,
          seq: state.previewSeq,
          append: lastSentIndex >= 0,
          color,
          width: penWidth,
          points,
          totalPoints: sourcePoints.length,
          ts: now,
        });
      } else if (tool === 'line') {
        awarenessRef.current?.setLocalStateField('drawing', {
          type: 'line',
          color,
          width: penWidth,
          start: state.start,
          end: state.end,
        });
      } else if (tool === 'arrow') {
        awarenessRef.current?.setLocalStateField('drawing', {
          type: 'arrow',
          color,
          width: penWidth,
          start: state.start,
          end: state.end,
        });
      } else if (tool === 'shape') {
        const rect = normalizeRect(state.start, state.end);
        awarenessRef.current?.setLocalStateField('drawing', {
          type: 'shape',
          shape: shapeKind,
          color,
          strokeWidth: penWidth,
          ...rect,
        });
      }
    });
  };

  useEffect(() => () => {
    if (boardRenderRafRef.current) cancelAnimationFrame(boardRenderRafRef.current);
  }, []);

  useEffect(() => () => {
    if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
  }, []);

  useEffect(() => () => {
    if (cursorRafRef.current) cancelAnimationFrame(cursorRafRef.current);
  }, []);

  useEffect(() => () => {
    if (imageDragRafRef.current) cancelAnimationFrame(imageDragRafRef.current);
    imageResizeRef.current?.cleanup?.();
    if (imageActionNoticeTimeoutRef.current) clearTimeout(imageActionNoticeTimeoutRef.current);
  }, []);

  useEffect(() => () => {
    if (selectionMoveRafRef.current) cancelAnimationFrame(selectionMoveRafRef.current);
  }, []);

  useEffect(() => () => {
    if (minimapRenderTimerRef.current) clearTimeout(minimapRenderTimerRef.current);
  }, []);

  useEffect(() => () => {
    if (summonTimeoutRef.current) clearTimeout(summonTimeoutRef.current);
  }, []);

  useEffect(() => () => {
    if (summonNoticeTimeoutRef.current) clearTimeout(summonNoticeTimeoutRef.current);
  }, []);

  const commitTextDraft = (draft = textDraft) => {
    const textValue = String(draft?.value || '').replace(/\r\n?/g, '\n').slice(0, 4000).trimEnd();
    setTextDraft(null);
    if (!yItemsRef.current || !docRef.current) return;
    const existingItem = draft?.id
      ? boardItemsRef.current.find((item) => item?.id === draft.id && item.type === 'text')
      : null;
    if (!textValue.trim()) {
      if (existingItem) removeBoardItemsByIds([existingItem.id]);
      return;
    }
    if (draft?.id && !existingItem) return;
    const lines = textValue.split('\n');
    const fontSize = Math.max(10, Math.min(160, Number(draft?.fontSize) || BOARD_TEXT_FONT_SIZE));
    const measuredWidth = Math.max(fontSize, ...lines.map((line) => line.length * fontSize * 0.62));
    const measuredHeight = Math.max(fontSize * 1.25, lines.length * fontSize * 1.25);
    const textItem = {
      ...(existingItem || {}),
      id: existingItem?.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`),
      type: 'text',
      text: textValue,
      x: Number(draft.x) || 0,
      y: Number(draft.y) || 0,
      width: Math.ceil(Math.max(Number(draft?.width) || 0, measuredWidth)),
      height: Math.ceil(Math.max(Number(draft?.height) || 0, measuredHeight)),
      fontSize,
      color: draft?.color || existingItem?.color || color,
      authorId: existingItem?.authorId || draft?.authorId || userId,
    };
    if (existingItem) {
      const nextEstimatedBytes = boardEstimatedBytesRef.current
        - estimateBoardItemBytes(existingItem)
        + estimateBoardItemBytes(textItem);
      const capacityError = getBoardCapacityError(boardItemsRef.current.length, nextEstimatedBytes);
      if (capacityError) {
        setPasteError(capacityError);
        return;
      }
      docRef.current.transact(() => {
        for (let index = yItemsRef.current.length - 1; index >= 0; index -= 1) {
          const raw = yItemsRef.current.get(index);
          const item = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
          if (item?.id !== existingItem.id) continue;
          yItemsRef.current.delete(index, 1);
          yItemsRef.current.insert(index, [textItem]);
          break;
        }
      }, localOriginRef.current);
    } else {
      const capacity = ensureBoardCanAddItems([textItem]);
      if (!capacity.ok) {
        setPasteError(capacity.error);
        return;
      }
      docRef.current.transact(() => yItemsRef.current?.push([textItem]), localOriginRef.current);
    }
    undoManagerRef.current?.stopCapturing();
    toolRef.current = 'select';
    setTool('select');
    setSelectedIds([textItem.id]);
    setSelectionBox({
      x: textItem.x,
      y: textItem.y,
      width: textItem.width,
      height: textItem.height,
    });
    setSelectedImageId(null);
  };

  const openTextEditor = (point, editableText = null, initialBox = null) => {
    const fallbackPoint = getBoardViewportCenterPoint();
    const targetPoint = point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
      ? point
      : fallbackPoint;
    textDraftCancelRef.current = false;
    setTextDraft(editableText
      ? {
        id: editableText.id,
        x: editableText.x || 0,
        y: editableText.y || 0,
        value: editableText.text || '',
        width: editableText.width || 0,
        height: editableText.height || 0,
        fontSize: editableText.fontSize || BOARD_TEXT_FONT_SIZE,
        color: editableText.color || color,
        authorId: editableText.authorId,
      }
      : {
        x: targetPoint.x,
        y: targetPoint.y,
        value: '',
        width: Math.max(0, Number(initialBox?.width) || 0),
        height: Math.max(0, Number(initialBox?.height) || 0),
        fontSize: BOARD_TEXT_FONT_SIZE,
        color,
        authorId: userId,
      });
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => textEditorRef.current?.focus?.({ preventScroll: true }));
    }
  };

  const handlePointerDown = (event) => {
    if (!roomId) return;
    boardPasteFocusedRef.current = true;
    setIsImageCropMenuOpen(false);
    setIsImageMoreOpen(false);
    containerRef.current?.focus?.({ preventScroll: true });
    const point = rememberBoardPointer(event);
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
        const selectedItems = boardItemsRef.current.filter((item) => currentSelectedIds.includes(item?.id));
        if (selectedItems.some((item) => item?.locked || item?.superLocked)) return;
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
        const targetItem = boardItemsRef.current.find((item) => item?.id === targetId);
        const nextIds = [targetId];
        const bounds = getSelectionBoundsFromIds(nextIds);
        setSelectedIds(nextIds);
        setSelectionBox(bounds);
        setSelectedImageId(targetItem?.type === 'image' ? targetId : null);
        if (targetItem?.locked || targetItem?.superLocked) return;
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
      setSelectedImageId(null);
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
        if (hit.item.locked || hit.item.superLocked) return;
        dragImageRef.current = {
          active: true,
          id: hit.item.id,
          offsetX: point.x - (hit.item.x || 0),
          offsetY: point.y - (hit.item.y || 0),
          x: hit.item.x || 0,
          y: hit.item.y || 0,
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
    if (tool === 'text') {
      if (textDraft) {
        event.preventDefault();
        textDraftCancelRef.current = true;
        commitTextDraft(textDraft);
        return;
      }
      let editableText = null;
      for (let index = boardItemsRef.current.length - 1; index >= 0; index -= 1) {
        const item = boardItemsRef.current[index];
        if (item?.type !== 'text') continue;
        const bounds = getItemBounds(item);
        if (!bounds || point.x < bounds.minX || point.x > bounds.maxX || point.y < bounds.minY || point.y > bounds.maxY) continue;
        editableText = item;
        break;
      }
      if (editableText) {
        openTextEditor(point, editableText);
        return;
      }
      textBoxDrawRef.current = { active: true, start: point, current: point };
      renderOverlay();
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'pen') {
      drawStateRef.current = {
        drawing: true,
        points: [withPenPressure(point, event)],
        start: null,
        end: null,
        previewId: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
        previewSeq: 0,
        previewLastSentIndex: -1,
      };
    } else if (tool === 'line' || tool === 'arrow' || tool === 'shape') {
      drawStateRef.current = { drawing: true, points: [], start: point, end: point };
    }
    renderOverlay();
    schedulePreviewUpdate();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const point = rememberBoardPointer(event);
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
    if (textBoxDrawRef.current.active) {
      textBoxDrawRef.current.current = point;
      renderOverlay();
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
    } else if (tool === 'line' || tool === 'arrow' || tool === 'shape') {
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
        const selectedItem = nextIds.length === 1
          ? boardItemsRef.current.find((item) => item?.id === nextIds[0])
          : null;
        setSelectedImageId(selectedItem?.type === 'image' ? selectedItem.id : null);
      } else {
        setSelectedIds([]);
        setSelectionBox(null);
        setSelectedImageId(null);
      }
      return;
    }
    if (textBoxDrawRef.current.active) {
      const start = textBoxDrawRef.current.start;
      const current = textBoxDrawRef.current.current || start;
      textBoxDrawRef.current = { active: false, start: null, current: null };
      renderOverlay();
      if (!start || !current) return;
      const rect = normalizeRect(start, current);
      const currentZoom = zoomRef.current || 1;
      const isClick = rect.width < 4 / currentZoom && rect.height < 4 / currentZoom;
      const textRect = isClick
        ? {
          x: start.x,
          y: start.y,
          width: 240 / currentZoom,
          height: 52 / currentZoom,
        }
        : {
          x: rect.x,
          y: rect.y,
          width: Math.max(80 / currentZoom, rect.width),
          height: Math.max(42 / currentZoom, rect.height),
        };
      openTextEditor(textRect, null, textRect);
      return;
    }
    if (dragImageRef.current.active) {
      if (imageDragRafRef.current) {
        cancelAnimationFrame(imageDragRafRef.current);
        imageDragRafRef.current = null;
      }
      const drag = dragImageRef.current;
      const pending = pendingImageMoveRef.current;
      const finalX = pending?.id === drag.id ? pending.x : drag.x;
      const finalY = pending?.id === drag.id ? pending.y : drag.y;
      pendingImageMoveRef.current = null;
      dragImageRef.current.active = false;
      dragImageRef.current = { active: false, id: null, offsetX: 0, offsetY: 0, x: null, y: null };
      if (Number.isFinite(Number(finalX)) && Number.isFinite(Number(finalY))) {
        updateImagePosition(drag.id, Number(finalX), Number(finalY));
      }
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
    const itemsToAdd = [];
    if (tool === 'pen' && state.points.length > 1) {
      itemsToAdd.push({
        ...base,
        type: 'stroke',
        width: penWidth,
        points: trimBoardStrokePoints(state.points),
      });
    }
    if (tool === 'line' && state.start && state.end) {
      itemsToAdd.push({
        ...base,
        type: 'line',
        width: penWidth,
        start: normalizeBoardStoredPoint(state.start),
        end: normalizeBoardStoredPoint(state.end),
      });
    }
    if (tool === 'arrow' && state.start && state.end) {
      itemsToAdd.push({
        ...base,
        type: 'arrow',
        width: penWidth,
        start: normalizeBoardStoredPoint(state.start),
        end: normalizeBoardStoredPoint(state.end),
      });
    }
    if (tool === 'shape' && state.start && state.end) {
      const rect = normalizeRect(state.start, state.end);
      if (rect.width >= BOARD_SHAPE_MIN_SIZE && rect.height >= BOARD_SHAPE_MIN_SIZE) {
        itemsToAdd.push({
          ...base,
          type: 'shape',
          shape: shapeKind,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          strokeWidth: penWidth,
        });
      }
    }
    if (itemsToAdd.length > 0) {
      const capacity = ensureBoardCanAddItems(itemsToAdd);
      if (!capacity.ok) {
        setPasteError(capacity.error);
        drawStateRef.current = { drawing: false, points: [], start: null, end: null };
        return;
      }
      setPasteError('');
      docInstance.transact(() => {
        yItemsRef.current?.push(itemsToAdd);
      }, localOriginRef.current);
    }
    undoManagerRef.current?.stopCapturing();
    drawStateRef.current = { drawing: false, points: [], start: null, end: null };
  };

  const handlePointerLeave = () => {
    handlePointerUp();
    clearBoardPointer();
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
    const scene = boardSceneRef.current;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = BOARD_BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);
    const currentBoardSize = boardSizeRef.current || { width: 1, height: 1 };
    const viewWidth = currentBoardSize.width / (zoomRef.current || 1);
    const viewHeight = currentBoardSize.height / (zoomRef.current || 1);
    const sceneContentBounds = scene?.contentBounds || null;
    const bounds = {
      minX: sceneContentBounds?.minX ?? Number.POSITIVE_INFINITY,
      minY: sceneContentBounds?.minY ?? Number.POSITIVE_INFINITY,
      maxX: sceneContentBounds?.maxX ?? Number.NEGATIVE_INFINITY,
      maxY: sceneContentBounds?.maxY ?? Number.NEGATIVE_INFINITY,
    };
    const includePoint = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    };
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

    if (scene?.canvas) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad, pad, mapWidth * scale, mapHeight * scale);
      ctx.clip();
      ctx.drawImage(
        scene.canvas,
        toMiniX(scene.originX),
        toMiniY(scene.originY),
        scene.width * scale,
        scene.height * scale
      );
      ctx.restore();
    }

    ctx.save();
    const viewX = toMiniX(offsetRef.current.x);
    const viewY = toMiniY(offsetRef.current.y);
    const viewW = viewWidth * scale;
    const viewH = viewHeight * scale;
    ctx.strokeStyle = '#00a9d2';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(viewX, viewY, viewW, viewH);
    ctx.restore();
  }, []);

  const scheduleMinimapRender = useCallback((delayMs = 90) => {
    if (typeof window === 'undefined') return;
    if (minimapRenderTimerRef.current) {
      clearTimeout(minimapRenderTimerRef.current);
      minimapRenderTimerRef.current = null;
    }
    minimapRenderTimerRef.current = setTimeout(() => {
      minimapRenderTimerRef.current = null;
      renderMinimap();
    }, delayMs);
  }, [renderMinimap]);

  useEffect(() => {
    scheduleMinimapRenderRef.current = scheduleMinimapRender;
  }, [scheduleMinimapRender]);

  useEffect(() => {
    scheduleMinimapRender();
  }, [zoom, offset, boardSize.width, boardSize.height, boardRevision, isMinimapOpen, scheduleMinimapRender]);

  const canUndo = undoState.canUndo;
  const canRedo = undoState.canRedo;
  const canClear = boardItemCount > 0;
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
  const selectedImageScreenBox = displaySelectedImage
    ? {
      left: (Number(displaySelectedImage.x) - offset.x) * (zoom || 1),
      top: (Number(displaySelectedImage.y) - offset.y) * (zoom || 1),
      width: Math.max(1, Number(displaySelectedImage.width) * (zoom || 1)),
      height: Math.max(1, Number(displaySelectedImage.height) * (zoom || 1)),
    }
    : null;
  const isSelectedImageLocked = Boolean(displaySelectedImage?.locked || displaySelectedImage?.superLocked);
  const showImageToolbarBelow = Boolean(selectedImageScreenBox && selectedImageScreenBox.top < 74);
  const imageMoreMenuOpensLeft = Boolean(
    selectedImageScreenBox
    && selectedImageScreenBox.left + selectedImageScreenBox.width / 2 + 470 > boardSize.width
  );
  const imageMoreMenuNeedsScroll = Boolean(
    showImageToolbarBelow
    && selectedImageScreenBox
    && selectedImageScreenBox.top + selectedImageScreenBox.height + 420 > boardSize.height
  );
  const statusLabel = status === 'connected'
    ? 'Подключено'
    : (status === 'connecting' ? 'Соединяемся...' : 'Не подключено');
  const statusToneClass = status === 'connected' ? 'is-connected' : 'is-waiting';
  const boardShellClass = isFullscreen
    ? 'animate-fadeIn h-full min-h-0 flex flex-col overflow-hidden'
    : (embedded
      ? 'animate-fadeIn h-full min-h-0 flex flex-col overflow-hidden'
      : 'animate-fadeIn flex flex-1 min-h-0 flex-col overflow-hidden pb-2 md:pb-0');
  const boardCardClass = isFullscreen
    ? 'board-surface-card board-surface-card--fullscreen relative h-full min-h-0 flex flex-col overflow-hidden rounded-none border-0 bg-transparent shadow-none'
    : (embedded
      ? 'board-embedded-card relative h-full min-h-0 rounded-[0.7rem] border-0 bg-white p-0 shadow-none flex flex-col overflow-hidden'
      : 'board-surface-card board-surface-card--main relative overflow-visible rounded-none border-0 bg-transparent shadow-none flex min-h-0 flex-1 flex-col overflow-visible');
  const zoomLabel = `${Math.round((zoom || 1) * 100)}%`;
  const renderStudentPicker = () => {
    if (!isTeacher || hideStudentPicker) return null;
    return (
      <div className="board-toolbar__student-picker">
        <span className="board-toolbar__student-picker-label">Ученик</span>
        <StudentSearchSelect
          students={students}
          value={activeStudentId || ''}
          onChange={(value) => onSelectStudent?.(value || null)}
          disabled={studentsLoading || (students || []).length === 0}
          className="board-toolbar__student-select"
          dark={isDarkTheme}
        />
      </div>
    );
  };
  const showBottomSummonButton = isTeacher && (!embedded || isFullscreen || showEmbeddedSummonButton);
  const showBoardLoading = Boolean(roomId && status === 'connecting');

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
                const nextValue = String(e.target.value || '').replace(/\./g, '');
                setSaveFileName(nextValue);
                if (saveNameError && nextValue.trim()) {
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
  const boardCardContent = (
    <>
      {isTeacher && !hideStudentPicker && (
        <div className={`board-toolbar ${isFullscreen ? 'board-toolbar--fullscreen' : ''} ${embedded ? 'board-toolbar--embedded' : ''} ${!isFullscreen && !embedded ? 'board-toolbar--floating' : ''}`}>
          <div className="board-toolbar__strip board-toolbar__strip--actions">
            <div className="board-toolbar__actions">{renderStudentPicker()}</div>
          </div>
        </div>
      )}

      {pasteError && (
        <div className="mt-2 text-xs text-rose-600">{pasteError}</div>
      )}

      <div
        ref={containerRef}
        tabIndex={roomId ? 0 : -1}
        role="application"
        aria-label="Доска урока. Нажмите, затем вставьте картинку через Ctrl+V."
        onFocus={() => { boardPasteFocusedRef.current = true; }}
        onBlur={(event) => {
          if (!boardRootRef.current?.contains(event.relatedTarget)) {
            boardPasteFocusedRef.current = false;
          }
        }}
        className={`board-canvas-surface board-canvas-outline ${isFullscreen ? 'mt-0 flex-1 min-h-0 h-auto' : (embedded ? 'mt-1 flex-1 min-h-0 h-full' : 'mt-0 h-[74vh] min-h-[360px] sm:min-h-[400px] md:h-auto md:min-h-[61vh] md:flex-1')} relative w-full ${embedded ? 'rounded-[0.7rem]' : 'rounded-[1.15rem]'} bg-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 overflow-hidden ${
          summonNotice ? 'ring-2 ring-amber-400/70 ring-offset-2 ring-offset-white' : ''
        }`}
      >
        <div className="board-tool-rail" role="toolbar" aria-label="Инструменты доски">
          <button
            type="button"
            onClick={() => {
              setTool('select');
              setIsBrushPaletteOpen(false);
              setIsShapePaletteOpen(false);
            }}
            className={`board-tool-rail__button ${tool === 'select' ? 'is-active' : ''}`}
            aria-label="Выделение"
            title="Выделение"
            aria-pressed={tool === 'select'}
          >
            <MousePointer2 size={20} />
          </button>
          <button
            type="button"
            onClick={() => {
              setTool('move');
              setIsBrushPaletteOpen(false);
              setIsShapePaletteOpen(false);
            }}
            className={`board-tool-rail__button ${tool === 'move' ? 'is-active' : ''}`}
            aria-label="Перемещение"
            title="Перемещение"
            aria-pressed={tool === 'move'}
          >
            <Hand size={20} />
          </button>

          <span className="board-tool-rail__divider" aria-hidden="true" />

          <div ref={brushPaletteRef} className="board-tool-rail__brush-wrap">
            <button
              type="button"
              onClick={() => {
                setTool('pen');
                setIsShapePaletteOpen(false);
                setIsBrushPaletteOpen((current) => (tool === 'pen' ? !current : true));
              }}
              className={`board-tool-rail__button ${tool === 'pen' || isBrushPaletteOpen ? 'is-active' : ''}`}
              aria-label="Кисть"
              title="Кисть"
              aria-pressed={tool === 'pen'}
              aria-expanded={isBrushPaletteOpen}
              aria-haspopup="dialog"
            >
              <span className="board-tool-rail__brush-icon" aria-hidden="true">
                <Pencil size={20} />
                <span className="board-tool-rail__brush-icon-dot" />
              </span>
            </button>

            {isBrushPaletteOpen && (
              <div className="board-brush-menu" role="dialog" aria-label="Настройки кисти">
                <div className="board-brush-menu__modes" role="group" aria-label="Режим кисти">
                  <button
                    type="button"
                    onClick={() => setTool('pen')}
                    className={`board-brush-menu__mode ${tool === 'pen' ? 'is-active' : ''}`}
                    aria-label="Перо"
                    aria-pressed={tool === 'pen'}
                    title="Перо"
                  >
                    <svg className="board-brush-menu__nib" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2.5 8.7 8.8l-.9 7.4h8.4l-.9-7.4L12 2.5Z" />
                      <circle cx="12" cy="9.4" r="1.35" />
                      <path d="M7.4 19.2h9.2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTool('eraser')}
                    className={`board-brush-menu__mode ${tool === 'eraser' ? 'is-active' : ''}`}
                    aria-label="Ластик кисти"
                    aria-pressed={tool === 'eraser'}
                    title="Ластик"
                  >
                    <Eraser size={20} />
                  </button>
                </div>

                <span className="board-brush-menu__divider board-brush-menu__divider--modes" aria-hidden="true" />

                <div className="board-brush-menu__colors" role="group" aria-label="Цвет кисти">
                  <button
                    type="button"
                    onClick={() => customColorInputRef.current?.click()}
                    className={`board-brush-menu__custom-color ${BOARD_PRESET_COLORS.includes(color) ? '' : 'is-active'}`}
                    aria-label="Выбрать произвольный цвет"
                    title="Выбрать цвет"
                  >
                    <span
                      className="board-brush-menu__custom-color-ring"
                      style={{ borderColor: color }}
                      aria-hidden="true"
                    />
                  </button>
                  <input
                    ref={customColorInputRef}
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value || BOARD_DEFAULT_COLOR)}
                    className="board-brush-menu__color-input"
                    aria-label="Палитра произвольного цвета"
                    tabIndex={-1}
                  />

                  {BOARD_PRESET_COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setColor(swatch)}
                      className={`board-brush-menu__swatch ${color === swatch ? 'is-active' : ''}`}
                      style={{ backgroundColor: swatch }}
                      aria-label={`Цвет ${swatch}`}
                      aria-pressed={color === swatch}
                      title={swatch}
                    />
                  ))}
                </div>

                <span className="board-brush-menu__divider" aria-hidden="true" />

                <label className="board-brush-menu__width">
                  <span className="sr-only">Толщина кисти</span>
                  <input
                    type="range"
                    min={BOARD_MIN_WIDTH}
                    max={BOARD_MAX_WIDTH}
                    step={BOARD_WIDTH_STEP}
                    value={penWidth}
                    onChange={(event) => setPenWidth(clamp(
                      Number(event.target.value) || BOARD_STROKE_WIDTH,
                      BOARD_MIN_WIDTH,
                      BOARD_MAX_WIDTH
                    ))}
                    className="board-brush-menu__range"
                    aria-label="Толщина кисти"
                  />
                  <output className="board-brush-menu__width-value">
                    {penWidth % 1 === 0 ? penWidth.toFixed(0) : penWidth.toFixed(1)}
                  </output>
                </label>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setTool('line');
              setIsBrushPaletteOpen(false);
              setIsShapePaletteOpen(false);
            }}
            className={`board-tool-rail__button ${tool === 'line' ? 'is-active' : ''}`}
            aria-label="Линия"
            title="Линия"
            aria-pressed={tool === 'line'}
          >
            <Minus className="board-tool-rail__line-icon" size={20} />
          </button>
          <button
            type="button"
            onClick={() => {
              toolRef.current = 'text';
              setTool('text');
              setIsBrushPaletteOpen(false);
              setIsShapePaletteOpen(false);
            }}
            className={`board-tool-rail__button ${tool === 'text' ? 'is-active' : ''}`}
            aria-label="Текст"
            title="Текст"
            aria-pressed={tool === 'text'}
          >
            <Type size={20} />
          </button>
          <div ref={shapePaletteRef} className="board-tool-rail__brush-wrap">
            <button
              type="button"
              onClick={() => {
                setTool('shape');
                setIsBrushPaletteOpen(false);
                setIsShapePaletteOpen((current) => (tool === 'shape' ? !current : true));
              }}
              className={`board-tool-rail__button ${tool === 'shape' || isShapePaletteOpen ? 'is-active' : ''}`}
              aria-label="Фигуры"
              title="Фигуры"
              aria-pressed={tool === 'shape'}
              aria-expanded={isShapePaletteOpen}
            >
              <Shapes size={20} />
            </button>
            {isShapePaletteOpen && (
              <div className="board-shape-menu" role="dialog" aria-label="Выбор фигуры">
                <button
                  type="button"
                  className={shapeKind === 'rectangle' ? 'is-active' : ''}
                  onClick={() => { setShapeKind('rectangle'); setTool('shape'); setIsShapePaletteOpen(false); }}
                  aria-label="Прямоугольник"
                  title="Прямоугольник"
                >
                  <Square size={19} />
                </button>
                <button
                  type="button"
                  className={shapeKind === 'ellipse' ? 'is-active' : ''}
                  onClick={() => { setShapeKind('ellipse'); setTool('shape'); setIsShapePaletteOpen(false); }}
                  aria-label="Круг"
                  title="Круг"
                >
                  <Circle size={19} />
                </button>
                <button
                  type="button"
                  className={shapeKind === 'diamond' ? 'is-active' : ''}
                  onClick={() => { setShapeKind('diamond'); setTool('shape'); setIsShapePaletteOpen(false); }}
                  aria-label="Ромб"
                  title="Ромб"
                >
                  <Diamond size={19} />
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setTool('arrow');
              setIsBrushPaletteOpen(false);
              setIsShapePaletteOpen(false);
            }}
            className={`board-tool-rail__button ${tool === 'arrow' ? 'is-active' : ''}`}
            aria-label="Стрелка"
            title="Стрелка"
            aria-pressed={tool === 'arrow'}
          >
            <ArrowUpRight size={21} />
          </button>
          <button
            type="button"
            onClick={() => {
              setTool('eraser');
              setIsBrushPaletteOpen(false);
              setIsShapePaletteOpen(false);
            }}
            className={`board-tool-rail__button ${tool === 'eraser' ? 'is-active' : ''}`}
            aria-label="Ластик"
            title="Ластик"
            aria-pressed={tool === 'eraser'}
          >
            <Eraser size={20} />
          </button>
        </div>

        {!embedded && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="board-fullscreen-corner"
            aria-label={isFullscreen ? 'Обычный экран' : 'Полный экран'}
            title={isFullscreen ? 'Обычный экран' : 'Полный экран'}
          >
            {isFullscreen ? <Minimize2 size={19} /> : <Expand size={19} />}
          </button>
        )}

        {!roomId && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/70 text-sm text-slate-100">
            Выберите ученика, чтобы открыть доску.
          </div>
        )}
        {showBoardLoading && (
          <div className="board-loading-overlay" role="status" aria-live="polite">
            <div className="board-loading-overlay__card">
              <div className="board-loading-overlay__mark" aria-hidden="true">
                <RefreshCcw size={18} />
              </div>
              <div>
                <div className="board-loading-overlay__title">Загружаем доску</div>
                <div className="board-loading-overlay__subtitle">Подключаем общий холст и инструменты.</div>
              </div>
            </div>
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
              : (tool === 'pen' || tool === 'line' || tool === 'arrow' || tool === 'shape' || tool === 'eraser'
                ? 'crosshair'
                : (tool === 'text' ? 'text' : (tool === 'move' ? 'grab' : 'default')))
          }}
          onPointerDown={handlePointerDown}
          onPointerEnter={rememberBoardPointer}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerLeave}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
        {textDraft && (
          <textarea
            ref={textEditorRef}
            autoFocus
            wrap="off"
            value={textDraft.value}
            onChange={(event) => setTextDraft((current) => current ? { ...current, value: event.target.value } : current)}
            onBlur={(event) => {
              if (textDraftCancelRef.current) {
                textDraftCancelRef.current = false;
                return;
              }
              commitTextDraft({ ...textDraft, value: event.currentTarget.value });
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                textDraftCancelRef.current = true;
                commitTextDraft({ ...textDraft, value: event.currentTarget.value });
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                textDraftCancelRef.current = true;
                setTextDraft(null);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="board-text-editor"
            style={{
              left: `${(textDraft.x - offset.x) * (zoom || 1)}px`,
              top: `${(textDraft.y - offset.y) * (zoom || 1)}px`,
              width: `${Math.min(640, Math.max(80, (textDraft.width || 240) * (zoom || 1)))}px`,
              height: `${Math.min(480, Math.max(42, (textDraft.height || 52) * (zoom || 1)))}px`,
              fontSize: `${Math.max(14, (textDraft.fontSize || BOARD_TEXT_FONT_SIZE) * (zoom || 1))}px`,
              color: textDraft.color || color,
            }}
            aria-label={textDraft.id ? 'Редактировать текст на доске' : 'Введите текст на доске'}
            placeholder="Введите текст…"
          />
        )}
        {(tool === 'move' || tool === 'select') && displaySelectedImage && selectedImageScreenBox && (
          <div className="board-image-selection-layer" aria-label="Выбранное изображение">
            <div
              className={`board-image-selection ${isSelectedImageLocked ? 'is-locked' : ''}`}
              style={{
                left: `${selectedImageScreenBox.left}px`,
                top: `${selectedImageScreenBox.top}px`,
                width: `${selectedImageScreenBox.width}px`,
                height: `${selectedImageScreenBox.height}px`,
              }}
            >
              {!isSelectedImageLocked && ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                <button
                  key={handle}
                  type="button"
                  className={`board-image-selection__handle board-image-selection__handle--${handle}`}
                  onPointerDown={(event) => startImageResize(event, handle, displaySelectedImage)}
                  aria-label={`Изменить размер: ${handle}`}
                  tabIndex={-1}
                />
              ))}
              {isSelectedImageLocked && (
                <span className="board-image-selection__lock" aria-label="Изображение заблокировано">
                  {displaySelectedImage.superLocked ? <Shield size={14} /> : <Lock size={14} />}
                </span>
              )}
            </div>

            <div
              className={`board-image-toolbar ${showImageToolbarBelow ? 'is-below' : ''}`}
              style={{
                left: `${selectedImageScreenBox.left + selectedImageScreenBox.width / 2}px`,
                top: `${showImageToolbarBelow
                  ? selectedImageScreenBox.top + selectedImageScreenBox.height + 12
                  : selectedImageScreenBox.top - 12}px`,
              }}
              role="toolbar"
              aria-label="Действия с изображением"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="board-image-toolbar__pill">
                <div className="board-image-toolbar__action-wrap">
                  <button
                    type="button"
                    className={`board-image-toolbar__button ${isImageCropMenuOpen ? 'is-active' : ''}`}
                    onClick={() => {
                      setIsImageCropMenuOpen((current) => !current);
                      setIsImageMoreOpen(false);
                    }}
                    disabled={isSelectedImageLocked}
                    aria-label="Обрезка"
                    aria-expanded={isImageCropMenuOpen}
                    data-tooltip="Обрезка"
                  >
                    <Crop size={21} />
                  </button>
                  {isImageCropMenuOpen && (
                    <div className="board-image-crop-menu" role="menu" aria-label="Формат обрезки">
                      <button type="button" onClick={() => applyImageCropPreset(displaySelectedImage.id, 'original')}>Исходное</button>
                      <button type="button" onClick={() => applyImageCropPreset(displaySelectedImage.id, 1)}>1:1</button>
                      <button type="button" onClick={() => applyImageCropPreset(displaySelectedImage.id, 4 / 3)}>4:3</button>
                      <button type="button" onClick={() => applyImageCropPreset(displaySelectedImage.id, 16 / 9)}>16:9</button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`board-image-toolbar__button ${displaySelectedImage.flipX ? 'is-active' : ''}`}
                  onClick={() => updateImageItem(displaySelectedImage.id, (item) => ({ ...item, flipX: !item.flipX }))}
                  disabled={isSelectedImageLocked}
                  aria-label="Зеркалирование"
                  data-tooltip="Зеркалирование"
                >
                  <FlipHorizontal2 size={21} />
                </button>
                <button
                  type="button"
                  className={`board-image-toolbar__button ${displaySelectedImage.hasFrame ? 'is-active' : ''}`}
                  onClick={() => updateImageItem(displaySelectedImage.id, (item) => ({ ...item, hasFrame: !item.hasFrame }))}
                  disabled={isSelectedImageLocked}
                  aria-label="Рамка"
                  data-tooltip="Рамка"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="board-image-toolbar__frame-icon">
                    <rect x="4" y="4" width="16" height="16" rx="1.8" />
                    <rect x="7.5" y="7.5" width="9" height="9" rx="0.8" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="board-image-toolbar__button"
                  onClick={() => downloadBoardImage(displaySelectedImage)}
                  aria-label="Скачать"
                  data-tooltip="Скачать"
                >
                  <Download size={21} />
                </button>
                <button
                  type="button"
                  className={`board-image-toolbar__button ${displaySelectedImage.hyperlink ? 'is-active' : ''}`}
                  onClick={() => setSelectedImageHyperlink(displaySelectedImage)}
                  disabled={isSelectedImageLocked}
                  aria-label="Гиперссылка"
                  data-tooltip="Гиперссылка"
                >
                  <Link2 size={21} />
                </button>
                <div className="board-image-toolbar__action-wrap">
                  <button
                    type="button"
                    className={`board-image-toolbar__button ${isImageMoreOpen ? 'is-active' : ''}`}
                    onClick={() => {
                      setIsImageMoreOpen((current) => !current);
                      setIsImageCropMenuOpen(false);
                    }}
                    aria-label="Дополнительно"
                    aria-expanded={isImageMoreOpen}
                    data-tooltip="Дополнительно"
                  >
                    <MoreHorizontal size={22} />
                  </button>
                  {isImageMoreOpen && (
                    <div className={`board-image-more-menu ${imageMoreMenuOpensLeft ? 'is-left' : ''} ${imageMoreMenuNeedsScroll ? 'is-scroll' : ''}`} role="menu" aria-label="Дополнительные действия">
                      <button type="button" onClick={() => copySelectedImage(displaySelectedImage)}>
                        <Copy size={18} /><span>Скопировать</span><kbd>Ctrl + C</kbd>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const objectUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#board-item=${displaySelectedImage.id}`;
                          const copied = await copyTextToClipboard(objectUrl);
                          showImageNotice(copied ? 'Ссылка на объект скопирована' : 'Не удалось скопировать ссылку');
                          setIsImageMoreOpen(false);
                        }}
                      >
                        <Link2 size={18} /><span>Скопировать ссылку на объект</span><kbd>Ctrl + L</kbd>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateImageItem(displaySelectedImage.id, (item) => ({
                          ...item,
                          locked: !(item.locked || item.superLocked),
                          superLocked: false,
                        }))}
                      >
                        <Lock size={18} /><span>{isSelectedImageLocked ? 'Разблокировать' : 'Заблокировать'}</span><kbd>Ctrl + Shift + L</kbd>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateImageItem(displaySelectedImage.id, (item) => ({
                          ...item,
                          superLocked: !item.superLocked,
                          locked: !item.superLocked,
                        }))}
                      >
                        <Shield size={18} /><span>Супер-блокировка</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateImageItem(displaySelectedImage.id, (item) => ({
                          ...item,
                          votes: Math.max(0, Number(item.votes) || 0) + 1,
                        }))}
                      >
                        <ThumbsUp size={18} /><span>Проголосовать</span>
                        {displaySelectedImage.votes > 0 && <kbd>{displaySelectedImage.votes}</kbd>}
                      </button>
                      <span className="board-image-more-menu__divider" aria-hidden="true" />
                      <button type="button" disabled={isSelectedImageLocked} onClick={() => moveImageLayer(displaySelectedImage.id, 'top')}>
                        <ArrowUpToLine size={18} /><span>Переместить наверх</span><kbd>Ctrl + ]</kbd>
                      </button>
                      <button type="button" disabled={isSelectedImageLocked} onClick={() => moveImageLayer(displaySelectedImage.id, 'bottom')}>
                        <ArrowDownToLine size={18} /><span>Переместить вниз</span><kbd>Ctrl + [</kbd>
                      </button>
                      <span className="board-image-more-menu__divider" aria-hidden="true" />
                      <button
                        type="button"
                        className="is-danger"
                        disabled={isSelectedImageLocked}
                        onClick={() => {
                          deleteItemsByIds([displaySelectedImage.id]);
                          setSelectedImageId(null);
                          setSelectedIds([]);
                          setSelectionBox(null);
                          setIsImageMoreOpen(false);
                        }}
                      >
                        <Trash2 size={18} /><span>Удалить</span><kbd>Delete</kbd>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {imageActionNotice && <div className="board-image-toolbar__notice" role="status">{imageActionNotice}</div>}
            </div>
          </div>
        )}
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
        {isMinimapOpen && (
          <div className="board-minimap-shell board-minimap-shell--bottom absolute z-30">
            <canvas
              ref={minimapRef}
              width={240}
              height={140}
              className="board-minimap-canvas block"
            />
          </div>
        )}

        <div ref={boardBottomControlsRef} className="board-bottom-controls">
          <div className="board-bottom-controls__pill board-bottom-controls__session" aria-label="Состояние доски">
            <button
              type="button"
              onClick={() => setSaveModalOpen(true)}
              disabled={!roomId}
              className="board-bottom-controls__button"
              aria-label="Сохранить в конспекты"
              data-tooltip="Сохранить в конспекты"
            >
              <Save size={19} />
            </button>
            {showBottomSummonButton && (
              <button
                type="button"
                onClick={handleSummonStudent}
                disabled={!roomId}
                className="board-bottom-controls__button"
                aria-label="Призвать к себе"
                data-tooltip="Призвать к себе"
              >
                <Users size={19} />
              </button>
            )}
            <span className="board-bottom-controls__divider" aria-hidden="true" />
            <span className={`board-bottom-controls__session-status ${statusToneClass}`} aria-label={statusLabel}>
              <span className="board-bottom-controls__status-dot" aria-hidden="true" />
              <span className="board-bottom-controls__session-label">{statusLabel}</span>
            </span>
            {roomId && (
              <span className="board-bottom-controls__online" aria-label={`Онлайн: ${peerCount}`}>
                <Users size={15} aria-hidden="true" />
                <span>{peerCount}</span>
              </span>
            )}
          </div>
          <div className="board-bottom-controls__pill board-bottom-controls__history" aria-label="История доски">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              className="board-bottom-controls__button"
              aria-label="Отменить"
              title="Отменить"
            >
              <Undo2 size={20} />
            </button>
            <span className="board-bottom-controls__divider" aria-hidden="true" />
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              className="board-bottom-controls__button"
              aria-label="Вернуть"
              title="Вернуть"
            >
              <RefreshCcw size={20} />
            </button>
          </div>

          <div className="board-bottom-controls__pill board-bottom-controls__navigation" aria-label="Навигация по доске">
            <button
              type="button"
              onClick={() => {
                setIsMinimapOpen((current) => !current);
                setIsBoardHelpOpen(false);
              }}
              className={`board-bottom-controls__button ${isMinimapOpen ? 'is-active' : ''}`}
              aria-label="Мини-карта"
              aria-pressed={isMinimapOpen}
              data-tooltip="Мини-карта"
            >
              <MapIcon size={21} />
            </button>
            <button
              type="button"
              onClick={handleClearBoard}
              disabled={!canClear}
              className="board-bottom-controls__button is-danger"
              aria-label="Очистить доску"
              data-tooltip="Очистить доску"
            >
              <Trash2 size={20} />
            </button>
            <span className="board-bottom-controls__divider" aria-hidden="true" />
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.12)}
              className="board-bottom-controls__button"
              aria-label="Отдалить"
              title="Отдалить"
            >
              <Minus size={20} />
            </button>
            <div className="board-bottom-controls__zoom" aria-label={`Масштаб ${zoomLabel}`}>
              {zoomLabel}
            </div>
            <button
              type="button"
              onClick={() => zoomBy(1.12)}
              className="board-bottom-controls__button"
              aria-label="Приблизить"
              title="Приблизить"
            >
              <Plus size={20} />
            </button>
            <span className="board-bottom-controls__divider" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setIsBoardHelpOpen((current) => !current)}
              className="board-bottom-controls__button board-bottom-controls__help-button"
              aria-label="Справка по доске"
              aria-expanded={isBoardHelpOpen}
              aria-haspopup="dialog"
              title="Справка"
            >
              <span aria-hidden="true">?</span>
            </button>

            {isBoardHelpOpen && (
              <div className="board-bottom-controls__help" role="dialog" aria-label="Справка по навигации">
                <strong>Навигация по доске</strong>
                <span>Колесо мыши — масштаб</span>
                <span>Пробел и перетаскивание — перемещение</span>
                <button type="button" onClick={resetView}>Сбросить вид</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      ref={boardRootRef}
      className={boardShellClass}
      onFocusCapture={() => { boardPasteFocusedRef.current = true; }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          boardPasteFocusedRef.current = false;
        }
      }}
    >
      {isTeacher && !activeStudentId && (
        <div className="mb-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5" />
          <div>
            <div className="font-semibold">Сначала выберите ученика</div>
            <div className="text-xs text-amber-700/80">Комната создаётся отдельно для каждого ученика.</div>
          </div>
        </div>
      )}

      {embedded ? (
        <div className={boardCardClass}>
          {boardCardContent}
        </div>
      ) : (
        <Card className={boardCardClass}>
          {boardCardContent}
        </Card>
      )}
      {isFullscreen
        ? saveModal
        : (typeof document !== 'undefined' ? createPortal(saveModal, document.body) : null)}
    </div>
  );
};

const STUDENT_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const readDashboardFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) {
    reject(new Error('Файл не выбран'));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
  reader.readAsDataURL(file);
});

const STUDENT_ROSTER_FOCUS_REVALIDATE_MS = 15_000;
const STUDENT_ROSTER_PICKER_REVALIDATE_MS = 5_000;

const DashboardLayout = ({ user, onLogout, progress, onUpdateProgress, theme, onThemeToggle, onUserUpdated }) => {
  const STUDENT_CALL_SECTION_ENABLED = true;
  const TEACHER_COMMS_VIEW = 'teacher-comms';
  const TEACHER_COMMS_TABS = PLATFORM_CHATS_ENABLED ? ['signup-chats', 'student-chats', 'notifications'] : [];
  const studentCanSeeReview = String(user?.grade || '').trim().toLowerCase() === 'graduate';
  const resolveTeacherCommsTab = (value) => {
    const normalized = String(value || '').trim();
    return TEACHER_COMMS_TABS.includes(normalized) ? normalized : 'signup-chats';
  };
  const normalizeTeacherView = (value) => {
    const normalized = String(value || '').trim();
    if (PLATFORM_CHATS_ENABLED && user.role === 'teacher' && TEACHER_COMMS_TABS.includes(normalized)) {
      return TEACHER_COMMS_VIEW;
    }
    return normalized;
  };
  const allowedViews = user.role === 'admin'
    ? ['admin']
    : user.role === 'teacher'
      ? [
        'schedule',
        'teacher-calendar',
        'finance',
        'progress',
        'review',
        'python',
        'rating',
        'collab',
        'call',
        'board',
        'teacher',
        ...(PLATFORM_CHATS_ENABLED ? [TEACHER_COMMS_VIEW] : []),
        'notes'
      ]
      : [
        'schedule',
        'progress',
        ...(studentCanSeeReview ? ['review'] : []),
        'python',
        'rating',
        'collab',
        ...(STUDENT_CALL_SECTION_ENABLED ? ['call'] : []),
        'board',
        ...(PLATFORM_CHATS_ENABLED ? ['chat'] : []),
        'notes'
      ];
  const allowedViewsKey = allowedViews.join('|');
  const isCallViewAvailable = allowedViews.includes('call');
  const defaultView = user.role === 'teacher'
    ? 'teacher'
    : (user.role === 'admin' ? 'admin' : (studentCanSeeReview ? 'review' : 'schedule'));
  const storedLocation = readUserLocation(user);
  const storedView = storedLocation?.view;
  const urlParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null;
  const urlRequestedView = String(urlParams?.get('view') || '').trim();
  const urlRequestedChatId = String(urlParams?.get('chatId') || '').trim();
  const normalizedUrlRequestedView = normalizeTeacherView(urlRequestedView);
  const normalizedStoredView = normalizeTeacherView(storedView);
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
  const storedActiveStudentId = normalizeTeacherStudentId(storedLocation?.activeStudentId);
  const shouldPreferReviewHome = user.role === 'student' && studentCanSeeReview && !normalizedUrlRequestedView && !restoredOpenTask;
  const initialView = (normalizedUrlRequestedView && allowedViews.includes(normalizedUrlRequestedView))
    ? normalizedUrlRequestedView
    : (restoredOpenTask?.section && allowedViews.includes(restoredOpenTask.section))
    ? restoredOpenTask.section
    : shouldPreferReviewHome
    ? 'review'
    : (allowedViews.includes(normalizedStoredView) ? normalizedStoredView : defaultView);
  const initialTeacherCommsTab = user.role === 'teacher'
    ? resolveTeacherCommsTab(urlRequestedView || storedView)
    : 'signup-chats';
  const initialTeacherChatId = (user.role === 'teacher' || user.role === 'admin')
    ? urlRequestedChatId
    : '';
  const initialTeacherStudentChatId = user.role === 'teacher' && initialTeacherCommsTab === 'student-chats'
    ? initialTeacherChatId
    : '';
  const initialTeacherSignupChatId = user.role === 'teacher' && initialTeacherCommsTab === 'signup-chats'
    ? initialTeacherChatId
    : '';
  const initialProgressSection = ['progress', 'notes', 'mocks'].includes(storedLocation?.progressSection)
    ? storedLocation.progressSection
    : 'progress';
  const initialMockExamId = normalizeMockExamId(storedLocation?.mockExamId);
  const initialNotesLocation = storedLocation?.notesLocation && typeof storedLocation.notesLocation === 'object'
    ? storedLocation.notesLocation
    : null;

  const [view, setView] = useState(initialView);
  const [requestedNotesLocation, setRequestedNotesLocation] = useState(initialNotesLocation);
  const [notesLocationRequestKey, setNotesLocationRequestKey] = useState(0);

  useEffect(() => {
    const allowedViewsList = allowedViewsKey ? allowedViewsKey.split('|') : [];
    if (view && !allowedViewsList.includes(view)) {
      setView(defaultView);
    }
  }, [allowedViewsKey, defaultView, view]);

  const [teacherCommsTab, setTeacherCommsTab] = useState(initialTeacherCommsTab);
  const [teacherStudentChatId, setTeacherStudentChatId] = useState(initialTeacherStudentChatId);
  const [teacherSignupChatId, setTeacherSignupChatId] = useState(initialTeacherSignupChatId);
  const [callSessionStatus, setCallSessionStatus] = useState('idle');
  const [telemostLessonReplay, setTelemostLessonReplay] = useState(null);
  const [telemostLessonFinishBusy, setTelemostLessonFinishBusy] = useState(false);
  const [telemostAudioCapture, setTelemostAudioCapture] = useState({ status: 'idle', message: '' });
  const telemostAudioCaptureRef = useRef(null);
  const telemostLessonActivityMissesRef = useRef(0);
  const [callAutoStartToken, setCallAutoStartToken] = useState(0);
  const [callPanelExpanded, setCallPanelExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [levelProfileState, setLevelProfileState] = useState({
    open: false,
    row: null,
    data: null,
    loading: false,
    error: '',
    levelPosition: null,
    weeklyPosition: null,
  });
  const levelProfileRequestIdRef = useRef(0);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(DESKTOP_NAV_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [progressSectionJumpToken, setProgressSectionJumpToken] = useState(0);
  const [activeProgressSection, setActiveProgressSection] = useState(initialProgressSection);
  const [collabSaveToNotesToken, setCollabSaveToNotesToken] = useState(0);
  const [pendingOpenTask, setPendingOpenTask] = useState(() => (user.role === 'student' ? restoredOpenTask : null));
  const [pendingOpenMockExamId, setPendingOpenMockExamId] = useState(
    () => (user.role === 'student' ? initialMockExamId : null)
  );
  const [pendingHomeworkPrefill, setPendingHomeworkPrefill] = useState(null);
  const [homeworkLessonBaskets, setHomeworkLessonBaskets] = useState(() => (
    user.role === 'teacher' ? loadHomeworkLessonBaskets(user.id) : null
  ));
  const [homeworkLessonBasketNotice, setHomeworkLessonBasketNotice] = useState(null);
  const [pendingDirectChatRequest, setPendingDirectChatRequest] = useState(null);
  const [pendingLessonCapsuleKey, setPendingLessonCapsuleKey] = useState('');
  const [goalState, setGoalState] = useState(null);
  const [goalTestsDb, setGoalTestsDb] = useState(null);
  const [goalRefreshTick, setGoalRefreshTick] = useState(0);
  const [goalCollapsed, setGoalCollapsed] = useState(user.role === 'student');
  const [goalPanelAnimClass, setGoalPanelAnimClass] = useState('');
  const [_HOMEWORK_POPUP_ENTRY, setHomeworkPopupEntry] = useState(null);
  const [homeworkPopupOpen, setHomeworkPopupOpen] = useState(false);
  const [paceForecastPopupOpen, setPaceForecastPopupOpen] = useState(false);
  const paceForecastTriggerRef = useRef(null);
  const paceForecastDialogRef = useRef(null);
  const [studentIntroTourActive, setStudentIntroTourActive] = useState(false);
  const [studentRatingTourActive, setStudentRatingTourActive] = useState(false);
  const [solvedByTask, setSolvedByTask] = useState({});
  const [studentSolvedEvents, setStudentSolvedEvents] = useState([]);
  const [goalTestsLoaded, setGoalTestsLoaded] = useState(false);
  const [studentDataLoaded, setStudentDataLoaded] = useState(false);
  const [studentStreak, setStudentStreak] = useState(getDefaultStreak());
  const [_STUDENT_XP_TOTAL, setStudentXpTotal] = useState(0);
  const [studentCoinsTotal, setStudentCoinsTotal] = useState(0);
  const [xpDisplayTotal, setXpDisplayTotal] = useState(0);
  const [xpDockVisible, setXpDockVisible] = useState(false);
  const [xpAnimationActive, setXpAnimationActive] = useState(false);
  const [xpFlightStars, setXpFlightStars] = useState([]);
  const [coinFlightCoins, setCoinFlightCoins] = useState([]);
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
  const coinInlineBadgeRef = useRef(null);
  const coinDockBadgeRef = useRef(null);
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
  const avatarInputRef = useRef(null);
  const messageAudioContextRef = useRef(null);
  const messageTitleBlinkTimerRef = useRef(null);
  const incomingMessageSoundSeenRef = useRef(new Map());
  const incomingMessageSoundReadyScopesRef = useRef(new Set());
  const chatLiveSocketRef = useRef(null);
  const chatLiveReconnectTimerRef = useRef(null);
  const chatLiveSocketClosedManuallyRef = useRef(false);
  const prevGoalCollapsedRef = useRef(goalCollapsed);
  const [isDesktopWide, setIsDesktopWide] = useState(
    typeof window !== 'undefined' ? window.innerWidth > 1000 : true
  );
  const [teacherSolvedNotifs, setTeacherSolvedNotifs] = useState([]);
  const [teacherSignupNotifs, setTeacherSignupNotifs] = useState([]);
  const [telemostJoinAlerts, setTelemostJoinAlerts] = useState([]);
  const telemostJoinAlertTimersRef = useRef(new Map());
  const [teacherStudentChatsUnreadTotal, setTeacherStudentChatsUnreadTotal] = useState(0);
  const [studentChatNavUnreadTotal, setStudentChatNavUnreadTotal] = useState(0);
  const [incomingMessageSoundPulse, setIncomingMessageSoundPulse] = useState(0);
  const [studentScheduleNavNewTotal, setStudentScheduleNavNewTotal] = useState(0);
  const [studentProgressNavNewTotal, setStudentProgressNavNewTotal] = useState(0);
  const [teacherSolvedBulkReadBusy, setTeacherSolvedBulkReadBusy] = useState(false);
  const [teacherNotifHistory, setTeacherNotifHistory] = useState([]);
  const dismissedSignupNotifsRef = useRef(new Map());
  const [teacherSignupNotifySupported, setTeacherSignupNotifySupported] = useState(isPushFeatureSupported());
  const [teacherSignupNotifyPermission, setTeacherSignupNotifyPermission] = useState(getPushPermission());
  const [teacherSignupNotifyEnabled, setTeacherSignupNotifyEnabled] = useState(false);
  const [teacherSignupNotifySyncing, setTeacherSignupNotifySyncing] = useState(false);
  const [teacherSignupNotifyBusy, setTeacherSignupNotifyBusy] = useState(false);
  const [teacherSignupNotifyReady, setTeacherSignupNotifyReady] = useState(false);
  const [teacherSignupNotifyError, setTeacherSignupNotifyError] = useState('');
  const [taskTitles, setTaskTitles] = useState({});
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const studentsOwnerTeacherIdRef = useRef('');
  const studentsSyncStateRef = useRef({ teacherId: '', lastSuccessAt: 0, inFlight: null });
  const storedActiveStudentIdRef = useRef(storedActiveStudentId);
  const [deletedStudents, setDeletedStudents] = useState([]);
  const [deletedStudentsLoading, setDeletedStudentsLoading] = useState(false);
  const [deletedStudentsError, setDeletedStudentsError] = useState('');
  const [activeStudentId, setActiveStudentId] = useState(() => (
    user.role === 'teacher' ? storedActiveStudentId : null
  ));
  const [homeworkStatsStudentId, setHomeworkStatsStudentId] = useState(null);
  const handleSelectStudent = useCallback((studentId) => {
    const normalizedStudentId = normalizeTeacherStudentId(studentId);
    storedActiveStudentIdRef.current = normalizedStudentId;
    setActiveStudentId(normalizedStudentId);
  }, []);
  const handleOpenHomeworkStats = useCallback((student) => {
    const studentId = normalizeTeacherStudentId(student?.id);
    if (studentId) setHomeworkStatsStudentId(studentId);
  }, []);
  const handleCloseHomeworkStats = useCallback(() => {
    setHomeworkStatsStudentId(null);
  }, []);
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
  const useNativeAndroidPush = isNativeAndroidPushEnvironment();
  const isCallSessionActive = callSessionStatus === 'connected' || callSessionStatus === 'connecting';
  const isTelemostLessonReplayActive = Boolean(
    telemostLessonReplay?.active
    && telemostLessonReplay?.studentId
    && (
      !telemostLessonReplay.autoFinishAt
      || Date.parse(telemostLessonReplay.autoFinishAt) > Date.now()
    )
  );
  const lessonReplayStudentId = callSessionStatus === 'connected'
    ? (user.role === 'student' ? user.id : activeStudentId)
    : (isTelemostLessonReplayActive
      ? telemostLessonReplay.studentId
      : (user.role === 'student' ? user.id : activeStudentId));
  const lessonReplayMode = callSessionStatus === 'connected'
    ? 'platform'
    : (isTelemostLessonReplayActive ? 'telemost' : '');
  const applyTelemostLessonReplay = useCallback((payload = {}) => {
    const activity = payload?.activity || payload?.request?.activity || payload;
    const studentId = String(
      activity?.studentId || payload?.request?.studentId || payload?.studentId || ''
    ).trim();
    if (!studentId) return;
    telemostLessonActivityMissesRef.current = 0;
    setTelemostLessonReplay((current) => ({
      ...(current?.studentId === studentId ? current : {}),
      ...activity,
      studentId,
      occurrenceKey: String(
        activity?.occurrenceKey || payload?.request?.occurrenceKey || current?.occurrenceKey || ''
      ).trim(),
      autoFinishAt: String(
        activity?.autoFinishAt || payload?.request?.autoFinishAt || current?.autoFinishAt || ''
      ).trim(),
      mode: 'telemost',
      active: activity?.active !== false,
    }));
  }, []);
  const {
    recordLessonReplayEvent,
    finishLessonReplayNow,
    uploadLessonReplayScreenSnapshot,
    uploadLessonReplayAudioSegment,
  } = useLessonReplayRecorder({
    active: callSessionStatus === 'connected' || isTelemostLessonReplayActive,
    studentId: lessonReplayStudentId,
    mode: lessonReplayMode || 'platform',
    occurrenceKey: isTelemostLessonReplayActive ? telemostLessonReplay?.occurrenceKey : '',
    view,
    viewLabel: LESSON_REPLAY_VIEW_LABELS[view] || view,
  });

  const stopTelemostAudioCapture = useCallback(() => {
    const capture = telemostAudioCaptureRef.current;
    telemostAudioCaptureRef.current = null;
    if (!capture) {
      setTelemostAudioCapture({ status: 'idle', message: '' });
      return Promise.resolve();
    }
    capture.cancelled = true;
    window.clearTimeout(capture.stopTimerId);
    if (capture.recorder?.state === 'recording') {
      try { capture.recorder.stop(); } catch {
        // The recorder may already have stopped between the state check and this call.
        capture.closeGraph?.();
      }
    } else {
      capture.closeGraph?.();
    }
    setTelemostAudioCapture({ status: 'idle', message: '' });
    return capture.stopPromise || Promise.resolve();
  }, []);

  const startTelemostAudioCapture = useCallback(async () => {
    if (
      !isTelemostLessonReplayActive
      || telemostAudioCaptureRef.current
      || !navigator.mediaDevices?.getDisplayMedia
    ) return;
    const mimeType = getTelemostReplayAudioMimeType();
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!mimeType || !AudioContextCtor) {
      setTelemostAudioCapture({
        status: 'error',
        message: 'Этот браузер не умеет записывать звук Телемоста.',
      });
      return;
    }
    setTelemostAudioCapture({
      status: 'requesting',
      message: 'Выбери вкладку Телемоста и включи «Поделиться аудио».',
    });
    let displayStream = null;
    let micStream = null;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
      });
      const sharedAudioTracks = displayStream.getAudioTracks();
      if (sharedAudioTracks.length === 0) {
        displayStream.getTracks().forEach((track) => track.stop());
        setTelemostAudioCapture({
          status: 'error',
          message: 'Звук не выбран. Нажми ещё раз и включи «Поделиться аудио».',
        });
        return;
      }
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch {
        micStream = null;
      }
      const audioContext = new AudioContextCtor();
      const destination = audioContext.createMediaStreamDestination();
      const sources = [];
      const tracks = [
        ...sharedAudioTracks,
        ...(micStream?.getAudioTracks?.() || []),
      ].filter((track) => track.readyState === 'live');
      tracks.forEach((track) => {
        const source = audioContext.createMediaStreamSource(new MediaStream([track]));
        const gain = audioContext.createGain();
        gain.gain.value = tracks.length > 1 ? 0.72 : 1;
        source.connect(gain);
        gain.connect(destination);
        sources.push({ source, gain });
      });
      const capture = {
        cancelled: false,
        blocked: false,
        closed: false,
        displayStream,
        micStream,
        audioContext,
        destination,
        sources,
        recorder: null,
        stopTimerId: null,
        closeGraph: null,
        stopPromise: null,
        resolveStopped: null,
      };
      capture.stopPromise = new Promise((resolve) => {
        capture.resolveStopped = resolve;
      });
      capture.closeGraph = () => {
        if (capture.closed) return;
        capture.closed = true;
        capture.displayStream?.getTracks?.().forEach((track) => track.stop());
        capture.micStream?.getTracks?.().forEach((track) => track.stop());
        capture.sources.forEach(({ source, gain }) => {
          try { source.disconnect(); } catch {
            // The source may already be disconnected by a browser-ended share.
          }
          try { gain.disconnect(); } catch {
            // The gain may already be disconnected by a browser-ended share.
          }
        });
        capture.audioContext.close().catch(() => null);
        capture.resolveStopped?.();
        capture.resolveStopped = null;
      };
      const startSegment = () => {
        if (capture.cancelled || capture.blocked) {
          capture.closeGraph();
          return;
        }
        const chunks = [];
        const segmentStartedAt = Date.now();
        capture.recorder = new MediaRecorder(destination.stream, {
          mimeType,
          audioBitsPerSecond: TELEMOST_AUDIO_BITRATE,
        });
        capture.recorder.ondataavailable = (event) => {
          if (event.data?.size > 0) chunks.push(event.data);
        };
        capture.recorder.onstop = () => {
          window.clearTimeout(capture.stopTimerId);
          const durationMs = Math.max(250, Date.now() - segmentStartedAt);
          const blob = chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null;
          capture.recorder = null;
          const uploadPromise = blob?.size
            ? uploadLessonReplayAudioSegment(blob, {
              occurredAt: new Date(segmentStartedAt).toISOString(),
              durationMs,
              mimeType,
            })
            : Promise.resolve({ saved: false });
          if (!capture.cancelled && !capture.blocked) {
            startSegment();
            void uploadPromise.then((result) => {
              if (!result?.disabled) return;
              capture.blocked = true;
              setTelemostAudioCapture({
                status: 'error',
                message: 'S3 для звука ещё не настроен или недоступен.',
              });
              if (capture.recorder?.state === 'recording') capture.recorder.stop();
            });
          } else {
            void uploadPromise.finally(() => capture.closeGraph());
          }
        };
        capture.recorder.start();
        capture.stopTimerId = window.setTimeout(() => {
          if (capture.recorder?.state === 'recording') capture.recorder.stop();
        }, TELEMOST_AUDIO_SEGMENT_MS);
      };
      const stopFromBrowser = () => {
        if (telemostAudioCaptureRef.current !== capture) return;
        stopTelemostAudioCapture();
      };
      displayStream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', stopFromBrowser, { once: true });
      });
      telemostAudioCaptureRef.current = capture;
      await audioContext.resume();
      startSegment();
      setTelemostAudioCapture({
        status: 'recording',
        message: micStream
          ? 'Пишется звук Телемоста и микрофона.'
          : 'Пишется звук Телемоста; микрофон браузер не дал.',
      });
    } catch (error) {
      displayStream?.getTracks?.().forEach((track) => track.stop());
      micStream?.getTracks?.().forEach((track) => track.stop());
      const cancelled = error?.name === 'NotAllowedError' || error?.name === 'AbortError';
      setTelemostAudioCapture({
        status: cancelled ? 'idle' : 'error',
        message: cancelled ? '' : 'Не удалось начать запись звука Телемоста.',
      });
    }
  }, [
    isTelemostLessonReplayActive,
    stopTelemostAudioCapture,
    uploadLessonReplayAudioSegment,
  ]);

  useEffect(() => {
    if (isTelemostLessonReplayActive && callSessionStatus !== 'connected') return;
    stopTelemostAudioCapture();
  }, [callSessionStatus, isTelemostLessonReplayActive, stopTelemostAudioCapture]);

  useEffect(() => () => stopTelemostAudioCapture(), [stopTelemostAudioCapture]);
  const {
    workbookAutoSyncState,
    startWorkbookAutoSync,
    stopWorkbookAutoSync,
  } = useWorkbookAutoSync();
  const {
    workbookHelperState,
    launchWorkbookHelper,
  } = useWorkbookHelper();
  const lessonReplayActivityLookupStudentId = String(
    telemostLessonReplay?.studentId
      || (user.role === 'student' ? user.id : activeStudentId)
      || ''
  ).trim();

  useEffect(() => {
    if (!lessonReplayActivityLookupStudentId) return undefined;
    let cancelled = false;
    let busy = false;
    let timerId = null;
    const scheduleRefresh = (delayMs) => {
      window.clearTimeout(timerId);
      if (!cancelled) timerId = window.setTimeout(refreshActivity, delayMs);
    };
    const refreshActivity = async () => {
      if (busy || cancelled) return;
      busy = true;
      let nextDelayMs = 30_000;
      try {
        const activity = await api.getLessonReplayActivity(lessonReplayActivityLookupStudentId);
        if (cancelled) return;
        if (activity?.active && activity?.mode === 'telemost') {
          applyTelemostLessonReplay(activity);
          nextDelayMs = 5000;
          return;
        }
        telemostLessonActivityMissesRef.current += 1;
        if (telemostLessonActivityMissesRef.current >= 2) {
          setTelemostLessonReplay((current) => (
            current?.studentId === lessonReplayActivityLookupStudentId ? null : current
          ));
        }
      } catch {
        // A temporary network issue must not interrupt an otherwise active lesson.
      } finally {
        busy = false;
        scheduleRefresh(nextDelayMs);
      }
    };
    scheduleRefresh(1200);
    const handleFocus = () => scheduleRefresh(0);
    window.addEventListener('focus', handleFocus);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [applyTelemostLessonReplay, lessonReplayActivityLookupStudentId]);

  useEffect(() => {
    const autoFinishAtMs = Date.parse(String(telemostLessonReplay?.autoFinishAt || '').trim());
    if (!isTelemostLessonReplayActive || !Number.isFinite(autoFinishAtMs)) return undefined;
    const finishAtCutoff = () => {
      void (async () => {
        await stopTelemostAudioCapture();
        setTelemostLessonReplay(null);
        if (callSessionStatus !== 'connected') await finishLessonReplayNow();
      })();
    };
    const delayMs = autoFinishAtMs - Date.now();
    if (delayMs <= 0) {
      finishAtCutoff();
      return undefined;
    }
    const timerId = window.setTimeout(finishAtCutoff, Math.min(delayMs, 2_147_000_000));
    return () => window.clearTimeout(timerId);
  }, [
    callSessionStatus,
    finishLessonReplayNow,
    isTelemostLessonReplayActive,
    stopTelemostAudioCapture,
    telemostLessonReplay?.autoFinishAt,
  ]);

  useEffect(() => {
    telemostLessonActivityMissesRef.current = 0;
    setTelemostLessonReplay(null);
  }, [user.id, user.role]);

  const handleFinishTelemostLesson = useCallback(async () => {
    const studentId = String(telemostLessonReplay?.studentId || '').trim();
    if (!studentId || telemostLessonFinishBusy) return;
    setTelemostLessonFinishBusy(true);
    try {
      await stopTelemostAudioCapture();
      await api.finishLessonReplayLesson(studentId, telemostLessonReplay?.occurrenceKey || '');
      await finishLessonReplayNow();
      setTelemostLessonReplay(null);
    } catch (error) {
      console.error('[lesson-replay] failed to finish Telemost lesson:', error);
    } finally {
      setTelemostLessonFinishBusy(false);
    }
  }, [
    finishLessonReplayNow,
    stopTelemostAudioCapture,
    telemostLessonFinishBusy,
    telemostLessonReplay,
  ]);
  const isBoardView = view === 'board';
  const isCallView = view === 'call';
  const isCollabView = view === 'collab';
  const isStudentChatView = PLATFORM_CHATS_ENABLED && view === 'chat' && user?.role === 'student';
  const isTeacherCalendarView = view === 'teacher-calendar' && user?.role === 'teacher';
  const callUiMode = !isCallViewAvailable
    ? 'hidden'
    : isCallView
      ? 'full'
      : isCallSessionActive
        ? (callPanelExpanded ? 'floating' : 'collapsed')
        : 'hidden';
  const mainLayoutClass = isTeacherCalendarView
    ? 'flex-1 overflow-hidden p-0 md:p-0'
    : isBoardView
    ? 'flex-1 overflow-hidden px-0 pt-1 pb-[calc(env(safe-area-inset-bottom)+5.1rem)] sm:px-0.5 sm:pt-1.5 sm:pb-2.5 md:px-1 md:pt-2 md:pb-3 lg:px-1.5 lg:pb-3.5'
    : ((isCallView || isCollabView || isStudentChatView)
      ? 'flex-1 overflow-hidden px-3 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:px-3.5 sm:pt-3 sm:pb-4 md:px-5 md:pt-4 md:pb-4 lg:px-6 lg:pb-5'
      : 'flex-1 overflow-y-auto px-3.5 pt-3 pb-[calc(env(safe-area-inset-bottom)+6.2rem)] sm:px-4 sm:pt-4 md:p-8 md:pb-8');
  const mainContentShellClass = `main-content-shell animate-soft${
    (isBoardView || isCallView || isCollabView || isStudentChatView || isTeacherCalendarView) ? ' h-full min-h-0 flex flex-col overflow-hidden' : ''
  }${isTeacherCalendarView ? ' main-content-shell--calendar' : ''}${isStudentChatView ? ' main-content-shell--student-chat' : ''}`;
  const studentsWithNicknames = useMemo(
    () => students,
    [students]
  );
  const currentStudentsWithNicknames = useMemo(
    () => studentsWithNicknames.filter(isCurrentStudent),
    [studentsWithNicknames]
  );
  const activeHomeworkLessonBasketItems = useMemo(
    () => getHomeworkLessonBasketItems(homeworkLessonBaskets, activeStudentId),
    [activeStudentId, homeworkLessonBaskets]
  );
  const activeHomeworkLessonBasketStudent = useMemo(
    () => currentStudentsWithNicknames.find((student) => (
      String(student?.id || '') === String(activeStudentId || '')
    )) || null,
    [activeStudentId, currentStudentsWithNicknames]
  );
  const homeworkStatsStudent = useMemo(
    () => studentsWithNicknames.find((student) => (
      String(student?.id || '') === String(homeworkStatsStudentId || '')
    )) || null,
    [homeworkStatsStudentId, studentsWithNicknames]
  );
  useEffect(() => {
    if (user.role !== 'teacher') return;
    const normalizedTeacherId = String(user.id || '').trim();
    const studentsSyncState = studentsSyncStateRef.current;
    const rosterLoaded = studentsSyncState.teacherId === normalizedTeacherId
      && studentsSyncState.lastSuccessAt > 0;
    setActiveStudentId((current) => resolveTeacherStudentSelection({
      currentId: current,
      storedId: storedActiveStudentIdRef.current,
      students: currentStudentsWithNicknames,
      rosterLoaded,
    }));
  }, [currentStudentsWithNicknames, user.id, user.role]);

  useEffect(() => {
    if (user.role !== 'teacher') return;
    saveHomeworkLessonBaskets(user.id, homeworkLessonBaskets);
  }, [homeworkLessonBaskets, user.id, user.role]);

  useEffect(() => {
    if (!homeworkLessonBasketNotice) return undefined;
    const timeoutId = setTimeout(() => setHomeworkLessonBasketNotice(null), 2600);
    return () => clearTimeout(timeoutId);
  }, [homeworkLessonBasketNotice]);
  const tasksWithTitles = useMemo(
    () => applyTaskTitles(MOCK_TASKS, taskTitles),
    [taskTitles]
  );
  const weeklyRecapTasks = useMemo(
    () => [...tasksWithTitles, ...PYTHON_TASKS],
    [tasksWithTitles]
  );
  const teacherNotifs = useMemo(() => {
    const solved = (Array.isArray(teacherSolvedNotifs) ? teacherSolvedNotifs : []).map((note) => ({
      ...note,
      type: 'solved',
      timestampMs: Number.isFinite(Number(note?.timestampMs))
        ? Number(note.timestampMs)
        : (Number.isFinite(Date.parse(note?.solvedAt || '')) ? Date.parse(note.solvedAt) : 0),
    }));
    const signup = (Array.isArray(teacherSignupNotifs) ? teacherSignupNotifs : []).map((note) => ({
      ...note,
      type: 'signup',
      timestampMs: Number.isFinite(Number(note?.timestampMs))
        ? Number(note.timestampMs)
        : (Number.isFinite(Date.parse(note?.lastMessageAt || '')) ? Date.parse(note.lastMessageAt) : 0),
    }));
    return [...solved, ...signup]
      .sort((left, right) => (Number(right?.timestampMs) || 0) - (Number(left?.timestampMs) || 0));
  }, [teacherSignupNotifs, teacherSolvedNotifs]);
  const appendTeacherNotifHistory = useCallback((notes) => {
    const source = Array.isArray(notes) ? notes : [notes];
    const prepared = source
      .map((note) => {
        if (!note || typeof note !== 'object') return null;
        const type = note?.type === 'signup' ? 'signup' : (note?.type === 'solved' ? 'solved' : '');
        if (!type) return null;
        const id = typeof note?.id === 'string' ? note.id.trim() : '';
        if (!id) return null;
        const timestampMs = getTeacherNotifTimestampMs(note);
        const unreadCount = Math.max(0, Math.floor(Number(note?.unreadCount) || 0));
        return normalizeTeacherNotifHistoryEntry({
          archiveId: buildTeacherNotifArchiveId({ ...note, type, id, timestampMs, unreadCount }),
          id,
          type,
          timestampMs,
          archivedAtMs: Date.now(),
          studentName: note?.studentName,
          studentNickname: note?.studentNickname,
          source: normalizeTeacherSolvedSource(note),
          mockExamId: note?.mockExamId,
          mockExamTitle: note?.mockExamTitle,
          mockTaskNumber: note?.mockTaskNumber,
          taskNumber: note?.taskNumber,
          levelId: note?.levelId,
          questionNumber: note?.questionNumber,
          solvedAt: note?.solvedAt,
          guestName: note?.guestName,
          preview: note?.preview,
          unreadCount,
          lastMessageAt: note?.lastMessageAt,
        });
      })
      .filter(Boolean);
    if (prepared.length <= 0) return;
    setTeacherNotifHistory((prev) => normalizeTeacherNotifHistoryList([...prepared, ...(Array.isArray(prev) ? prev : [])]));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentUrl = new URL(window.location.href);
    const hasView = currentUrl.searchParams.has('view');
    const hasChatId = currentUrl.searchParams.has('chatId');
    if (!hasView && !hasChatId) return;
    currentUrl.searchParams.delete('view');
    currentUrl.searchParams.delete('chatId');
    const nextSearch = currentUrl.searchParams.toString();
    const nextUrl = `${currentUrl.pathname}${nextSearch ? `?${nextSearch}` : ''}${currentUrl.hash || ''}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, []);

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
    const normalizedStudentId = normalizeTeacherStudentId(activeStudentId);
    storedActiveStudentIdRef.current = normalizedStudentId;
    updateUserLocation(user, { activeStudentId: normalizedStudentId });
  }, [activeStudentId, user.id, user.role]);

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
        { id: 'teacher-calendar', label: 'Общий календарь', icon: Users },
        { id: 'finance', label: 'Финансы', icon: Wallet },
        { id: 'progress', label: 'Успеваемость', icon: BarChart2 },
        { id: 'review', label: 'Повторение', icon: RefreshCcw, featured: true },
        { id: 'python', label: 'Изучение Python', icon: PythonLogoIcon },
        { id: 'rating', label: 'Рейтинг', icon: Trophy },
        { id: 'collab', label: 'Совместный код', icon: Code2 },
        { id: 'call', label: '\u0421\u043e\u0437\u0432\u043e\u043d', icon: PlayCircle },
        { id: 'board', label: 'Доска', icon: Brush },
        { id: 'teacher', label: 'Управление тестами', icon: Settings },
        ...(PLATFORM_CHATS_ENABLED ? [{ id: TEACHER_COMMS_VIEW, label: 'Чаты и уведомления', icon: MessageSquare }] : []),
        { id: 'notes', label: 'Конспекты', icon: Folder }
      ]
      : [
        { id: 'schedule', label: 'Сегодня', icon: Calendar },
        { id: 'progress', label: 'Успеваемость', icon: BarChart2 },
        ...(studentCanSeeReview ? [{ id: 'review', label: 'Повторение', icon: RefreshCcw, featured: true }] : []),
        { id: 'python', label: 'Изучение Python', icon: PythonLogoIcon },
        { id: 'rating', label: 'Рейтинг', icon: Trophy },
        { id: 'collab', label: 'Совместный код', icon: Code2 },
        { id: 'call', label: '\u0421\u043e\u0437\u0432\u043e\u043d', icon: PlayCircle },
        { id: 'board', label: 'Доска', icon: Brush },
        ...(PLATFORM_CHATS_ENABLED ? [{ id: 'chat', label: 'Чаты', icon: MessageSquare }] : []),
        { id: 'notes', label: 'Конспекты', icon: BookOpen }
      ];
  const visibleNav = (user.role === 'student' && !STUDENT_CALL_SECTION_ENABLED)
    ? nav.filter((item) => item.id !== 'call')
    : nav;
  const studentSearchAvailableViews = useMemo(() => (
    user.role === 'student'
      ? [
        'schedule',
        'progress',
        ...(studentCanSeeReview ? ['review'] : []),
        'python',
        'rating',
        'collab',
        'board',
        ...(PLATFORM_CHATS_ENABLED ? ['chat'] : []),
        'notes',
        'lesson',
      ]
      : []
  ), [studentCanSeeReview, user.role]);
  const studentLessonNavIds = STUDENT_CALL_SECTION_ENABLED
    ? ['call', 'board', 'collab']
    : ['board', 'collab'];
  const teacherLessonNavIds = ['call', 'board', 'collab'];
  const studentLessonNavItem = { id: 'lesson', label: '\u0423\u0440\u043e\u043a', icon: PlayCircle };
  const teacherLessonNavItem = { id: 'lesson', label: '\u0423\u0440\u043e\u043a', icon: PlayCircle };
  const studentDesktopMainNav = user.role === 'student'
    ? [
      ...['review', 'schedule', 'progress']
        .map((id) => visibleNav.find((item) => item.id === id))
        .filter(Boolean),
      studentLessonNavItem,
      ...['notes']
        .map((id) => visibleNav.find((item) => item.id === id))
        .filter(Boolean)
    ]
    : visibleNav;
  const studentDesktopToolNav = user.role === 'student'
    ? ['python', ...(PLATFORM_CHATS_ENABLED ? ['chat'] : []), 'rating']
      .map((id) => visibleNav.find((item) => item.id === id))
      .filter(Boolean)
    : [];
  const lessonQuickNavIds = user.role === 'teacher'
    ? teacherLessonNavIds
    : studentLessonNavIds;
  const lessonQuickNav = lessonQuickNavIds
    .map((id) => visibleNav.find((item) => item.id === id))
    .filter(Boolean);
  const studentDefaultLessonView = lessonQuickNav[0]?.id || 'progress';
  const studentMobilePrimaryNavIds = ['schedule', 'progress', 'notes'];
  const studentMobilePrimaryNav = user.role === 'student'
    ? [
      ...['schedule', 'progress']
        .map((id) => visibleNav.find((item) => item.id === id))
        .filter(Boolean),
      studentLessonNavItem,
      ...['notes']
        .map((id) => visibleNav.find((item) => item.id === id))
        .filter(Boolean),
    ]
    : [];
  const studentMobileMorePreferredIds = [
    ...(studentCanSeeReview ? ['review'] : []),
    'python',
    ...(PLATFORM_CHATS_ENABLED ? ['chat'] : []),
    'rating',
  ];
  const studentMobileOverflowNav = user.role === 'student'
    ? visibleNav.filter((item) => (
      !studentMobilePrimaryNavIds.includes(item.id)
      && !studentLessonNavIds.includes(item.id)
    ))
    : [];
  const studentMobileMoreNav = user.role === 'student'
    ? [
      ...studentMobileMorePreferredIds
        .map((id) => studentMobileOverflowNav.find((item) => item.id === id))
        .filter(Boolean),
      ...studentMobileOverflowNav.filter((item) => !studentMobileMorePreferredIds.includes(item.id)),
    ]
    : [];
  const shouldShowMobileMoreButton = user.role === 'student'
    && studentMobileMoreNav.length > 0;
  const mobileNav = user.role === 'student'
    ? [
      ...studentMobilePrimaryNav,
      ...(shouldShowMobileMoreButton ? [{ id: 'more', label: '\u0415\u0449\u0435', icon: MoreHorizontal }] : [])
    ]
    : visibleNav;
  const teacherDesktopPrimaryNav = user.role === 'teacher'
    ? [
      ...['schedule', 'teacher-calendar', 'finance', 'progress', 'review', 'python', 'rating']
        .map((id) => visibleNav.find((item) => item.id === id))
        .filter(Boolean),
      teacherLessonNavItem,
      ...['teacher', ...(PLATFORM_CHATS_ENABLED ? [TEACHER_COMMS_VIEW] : []), 'notes']
        .map((id) => visibleNav.find((item) => item.id === id))
        .filter(Boolean)
    ]
    : visibleNav;
  const desktopPrimaryNav = user.role === 'student'
    ? studentDesktopMainNav
    : teacherDesktopPrimaryNav;
  const desktopFabNav = user.role === 'student'
    ? [...studentDesktopMainNav, ...studentDesktopToolNav]
    : desktopPrimaryNav;
  const mobileNavLabels = {
    schedule: 'График',
    'teacher-calendar': 'Календ.',
    finance: 'Фин.',
    progress: 'Тесты',
    review: 'Повтор',
    lesson: '\u0423\u0440\u043e\u043a',
    rating: 'Рейтинг',
    python: 'Python',
    collab: 'Код',
    call: '\u0417\u0432\u043e\u043d\u043e\u043a',
    board: 'Доска',
    chat: 'Чат',
    teacher: 'Управ.',
    'teacher-comms': 'Чаты',
    'signup-chats': 'Заявки',
    'student-chats': 'Чаты',
    notifications: 'Увед.',
    notes: 'Консп.',
    admin: 'Админка',
    more: '\u0415\u0449\u0435',
  };
  const studentMobileNavLabels = {
    ...mobileNavLabels,
    schedule: 'Сегодня',
    progress: 'Практика',
  };
  const navToneById = {
    schedule: 'violet',
    'teacher-calendar': 'violet',
    finance: 'violet',
    progress: 'violet',
    review: 'violet',
    lesson: 'violet',
    call: 'violet',
    board: 'violet',
    collab: 'violet',
    python: 'violet',
    rating: 'violet',
    chat: 'violet',
    [TEACHER_COMMS_VIEW]: 'violet',
    teacher: 'violet',
    admin: 'violet',
    notes: 'violet',
    more: 'violet',
  };
  const getNavTone = (id) => navToneById[id] || 'violet';
  const teacherCommsNavNewCount = PLATFORM_CHATS_ENABLED && user.role === 'teacher'
    ? (
      (Array.isArray(teacherSolvedNotifs) ? teacherSolvedNotifs.length : 0)
      + (Array.isArray(teacherSignupNotifs)
        ? teacherSignupNotifs.reduce((sum, note) => (
          sum + Math.max(1, Math.floor(Number(note?.unreadCount) || 0))
        ), 0)
        : 0)
      + Math.max(0, Math.floor(Number(teacherStudentChatsUnreadTotal) || 0))
    )
    : 0;
  const teacherSignupUnreadMessageTotal = user.role === 'teacher' && Array.isArray(teacherSignupNotifs)
    ? teacherSignupNotifs.reduce((sum, note) => (
      sum + Math.max(1, Math.floor(Number(note?.unreadCount) || 0))
    ), 0)
    : 0;
  const unreadMessageAlertTotal = PLATFORM_CHATS_ENABLED
    ? (user.role === 'student'
      ? Math.max(0, Math.floor(Number(studentChatNavUnreadTotal) || 0))
      : (user.role === 'teacher'
        ? (
          Math.max(0, Math.floor(Number(teacherStudentChatsUnreadTotal) || 0))
          + Math.max(0, Math.floor(Number(teacherSignupUnreadMessageTotal) || 0))
        )
        : 0))
    : 0;
  const chatLiveWsUrl = useMemo(() => (
    user?.role ? withStoredAuthToken(getNotificationsWsUrl()) : ''
  ), [user?.id, user?.role]);

  const registerIncomingMessageSoundCandidates = useCallback((scope, candidates = []) => {
    const scopeKey = String(scope || '').trim();
    if (!scopeKey) return;

    const readyScopes = incomingMessageSoundReadyScopesRef.current;
    const seen = incomingMessageSoundSeenRef.current;
    const scopeReady = readyScopes.has(scopeKey);
    let shouldPlaySound = false;

    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
      if (!candidate || candidate.incoming !== true) return;
      const key = String(candidate.key || '').trim();
      const unreadCount = Math.max(0, Math.floor(Number(candidate.unreadCount) || 0));
      const lastMessageAt = String(candidate.lastMessageAt || '').trim();
      const timestampMs = Date.parse(lastMessageAt);
      if (!key || unreadCount <= 0 || !Number.isFinite(timestampMs)) return;

      const fullKey = `${scopeKey}:${key}`;
      const previous = seen.get(fullKey);
      const audible = candidate.audible !== false;
      const isLiveEvent = candidate.live === true;
      if (
        (scopeReady || isLiveEvent)
        && audible
        && (!previous || timestampMs > previous.timestampMs)
      ) {
        shouldPlaySound = true;
      }
      if (!previous || timestampMs >= previous.timestampMs) {
        seen.set(fullKey, { timestampMs });
      }
    });

    if (!scopeReady) readyScopes.add(scopeKey);
    if (shouldPlaySound) {
      setIncomingMessageSoundPulse((value) => value + 1);
    }
  }, []);

  const dismissTelemostJoinAlert = useCallback((studentId) => {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId) return;
    const timerId = telemostJoinAlertTimersRef.current.get(normalizedStudentId);
    if (timerId && typeof window !== 'undefined') {
      window.clearTimeout(timerId);
    }
    telemostJoinAlertTimersRef.current.delete(normalizedStudentId);
    setTelemostJoinAlerts((current) => (
      current.filter((item) => item.studentId !== normalizedStudentId)
    ));
  }, []);

  const enqueueTelemostJoinAlert = useCallback((payload) => {
    if (user?.role !== 'teacher') return;
    const studentId = String(payload?.studentId || '').trim();
    const telemostUrl = normalizeTelemostUrl(payload?.telemostUrl);
    if (!studentId || !telemostUrl) return;

    const requestedAt = String(payload?.requestedAt || '').trim() || new Date().toISOString();
    const alert = {
      requestId: String(payload?.requestId || '').trim() || `${studentId}:${requestedAt}`,
      studentId,
      studentName: String(payload?.studentName || '').trim() || 'Ученик',
      telemostUrl,
      requestedAt,
      occurrenceKey: String(payload?.occurrenceKey || payload?.activity?.occurrenceKey || '').trim(),
      autoFinishAt: String(payload?.autoFinishAt || payload?.activity?.autoFinishAt || '').trim(),
      activity: payload?.activity && typeof payload.activity === 'object' ? payload.activity : null,
    };
    setTelemostJoinAlerts((current) => (
      [alert, ...current.filter((item) => item.studentId !== studentId)].slice(0, 4)
    ));

    if (typeof window !== 'undefined') {
      const existingTimerId = telemostJoinAlertTimersRef.current.get(studentId);
      if (existingTimerId) window.clearTimeout(existingTimerId);
      const timerId = window.setTimeout(() => {
        telemostJoinAlertTimersRef.current.delete(studentId);
        setTelemostJoinAlerts((current) => current.filter((item) => item.studentId !== studentId));
      }, 10 * 60 * 1000);
      telemostJoinAlertTimersRef.current.set(studentId, timerId);
    }
  }, [user?.role]);

  const navBadgeCounts = useMemo(() => {
    const counts = {};
    if (user.role === 'student') {
      counts.schedule = Math.max(0, Math.floor(Number(studentScheduleNavNewTotal) || 0));
      counts.progress = Math.max(0, Math.floor(Number(studentProgressNavNewTotal) || 0));
      if (PLATFORM_CHATS_ENABLED) {
        counts.chat = Math.max(0, Math.floor(Number(studentChatNavUnreadTotal) || 0));
      }
      counts.more = ['review', 'python', 'chat', 'rating'].reduce((sum, id) => (
        sum + Math.max(0, Math.floor(Number(counts[id]) || 0))
      ), 0);
    }
    if (PLATFORM_CHATS_ENABLED && user.role === 'teacher') {
      counts[TEACHER_COMMS_VIEW] = Math.max(0, Math.floor(Number(teacherCommsNavNewCount) || 0));
    }
    return counts;
  }, [
    TEACHER_COMMS_VIEW,
    studentChatNavUnreadTotal,
    studentProgressNavNewTotal,
    studentScheduleNavNewTotal,
    teacherCommsNavNewCount,
    user.role,
  ]);
  useEffect(() => {
    incomingMessageSoundSeenRef.current = new Map();
    incomingMessageSoundReadyScopesRef.current = new Set();
    setIncomingMessageSoundPulse(0);
    telemostJoinAlertTimersRef.current.forEach((timerId) => {
      if (typeof window !== 'undefined') window.clearTimeout(timerId);
    });
    telemostJoinAlertTimersRef.current.clear();
    setTelemostJoinAlerts([]);
    return () => {
      telemostJoinAlertTimersRef.current.forEach((timerId) => {
        if (typeof window !== 'undefined') window.clearTimeout(timerId);
      });
      telemostJoinAlertTimersRef.current.clear();
    };
  }, [user.id, user.role]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined' || !chatLiveWsUrl || !user?.role) {
      return undefined;
    }

    chatLiveSocketClosedManuallyRef.current = false;
    let disposed = false;

    const clearReconnectTimer = () => {
      if (!chatLiveReconnectTimerRef.current) return;
      window.clearTimeout(chatLiveReconnectTimerRef.current);
      chatLiveReconnectTimerRef.current = null;
    };

    const closeCurrentSocket = () => {
      const socket = chatLiveSocketRef.current;
      chatLiveSocketRef.current = null;
      if (!socket) return;
      try {
        socket.close();
      } catch {
        // Ignore close errors; reconnect logic is best-effort.
      }
    };

    const scheduleReconnect = () => {
      if (disposed || chatLiveSocketClosedManuallyRef.current) return;
      clearReconnectTimer();
      chatLiveReconnectTimerRef.current = window.setTimeout(() => {
        chatLiveReconnectTimerRef.current = null;
        connect();
      }, CHAT_LIVE_RECONNECT_DELAY_MS);
    };

    const connect = () => {
      if (disposed) return;
      const existing = chatLiveSocketRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return;
      }

      try {
        const socket = new WebSocket(chatLiveWsUrl);
        chatLiveSocketRef.current = socket;

        socket.onmessage = (event) => {
          if (chatLiveSocketRef.current !== socket) return;
          let payload = null;
          try {
            payload = JSON.parse(String(event.data || ''));
          } catch {
            return;
          }
          const liveType = String(payload?.type || '').trim();
          if (liveType === 'telemost-join-requested') {
            enqueueTelemostJoinAlert(payload);
            const studentId = String(payload?.studentId || '').trim();
            const requestedAt = String(payload?.requestedAt || '').trim();
            if (studentId && requestedAt) {
              registerIncomingMessageSoundCandidates('teacher-telemost', [{
                key: studentId,
                unreadCount: 1,
                lastMessageAt: requestedAt,
                incoming: true,
                audible: true,
                live: true,
              }]);
            }
            return;
          }
          if (!PLATFORM_CHATS_ENABLED || !liveType.startsWith('student-chat-')) return;

          const senderId = String(payload.senderId || '').trim();
          const currentUserId = String(user?.id || '').trim();
          const chatId = String(payload.chatId || '').trim();
          if (liveType === 'student-chat-message-created' && senderId && currentUserId && senderId !== currentUserId && chatId) {
            if (user?.role === 'student') {
              const keyPrefix = payload.chatKind === 'student-teacher'
                ? 'teacher'
                : (payload.chatKind === 'social-group' ? 'group' : 'direct');
              registerIncomingMessageSoundCandidates('student-chats', [{
                key: `${keyPrefix}:${chatId}`,
                unreadCount: 1,
                lastMessageAt: payload.createdAt,
                incoming: true,
                audible: payload.audible !== false,
                live: true,
              }]);
            } else if (user?.role === 'teacher') {
              const keyPrefix = payload.chatKind === 'social-group' ? 'group' : 'student';
              registerIncomingMessageSoundCandidates('teacher-student-chats', [{
                key: `${keyPrefix}:${chatId}`,
                unreadCount: 1,
                lastMessageAt: payload.createdAt,
                incoming: true,
                audible: payload.audible !== false,
                live: true,
              }]);
            }
          }
          window.dispatchEvent(new CustomEvent('student-chat-live-event', { detail: payload }));
        };

        socket.onerror = () => {
          if (chatLiveSocketRef.current !== socket) return;
          try {
            socket.close();
          } catch {
            // Ignore close errors.
          }
        };

        socket.onclose = () => {
          if (chatLiveSocketRef.current === socket) {
            chatLiveSocketRef.current = null;
          }
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      disposed = true;
      chatLiveSocketClosedManuallyRef.current = true;
      clearReconnectTimer();
      closeCurrentSocket();
    };
  }, [chatLiveWsUrl, enqueueTelemostJoinAlert, registerIncomingMessageSoundCandidates, user?.id, user?.role]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;

    const unlockAudio = () => {
      try {
        if (!messageAudioContextRef.current) {
          messageAudioContextRef.current = new AudioContextClass();
        }
        if (messageAudioContextRef.current?.state === 'suspended') {
          messageAudioContextRef.current.resume().catch(() => {});
        }
      } catch {
        // Audio will still be retried when a message arrives.
      }
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (incomingMessageSoundPulse <= 0) return;
    void playIncomingMessageSound(messageAudioContextRef);
  }, [incomingMessageSoundPulse]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const total = Math.max(0, Math.floor(Number(unreadMessageAlertTotal) || 0));
    if (messageTitleBlinkTimerRef.current) {
      clearInterval(messageTitleBlinkTimerRef.current);
      messageTitleBlinkTimerRef.current = null;
    }

    if (total <= 0) {
      document.title = PLATFORM_DOCUMENT_TITLE;
      return undefined;
    }

    let showAlertTitle = true;
    const alertTitle = formatUnreadMessageTitle(total);
    const updateTitle = () => {
      document.title = showAlertTitle ? alertTitle : PLATFORM_DOCUMENT_TITLE;
      showAlertTitle = !showAlertTitle;
    };
    updateTitle();
    const timerId = window.setInterval(updateTitle, 1200);
    messageTitleBlinkTimerRef.current = timerId;

    return () => {
      if (messageTitleBlinkTimerRef.current === timerId) {
        clearInterval(timerId);
        messageTitleBlinkTimerRef.current = null;
      }
      document.title = PLATFORM_DOCUMENT_TITLE;
    };
  }, [unreadMessageAlertTotal]);

  const getNavBadgeCount = useCallback((id) => (
    Math.max(0, Math.floor(Number(navBadgeCounts?.[id]) || 0))
  ), [navBadgeCounts]);
  const renderNavBadge = useCallback((id, variant = 'sidebar') => {
    const count = getNavBadgeCount(id);
    if (count <= 0) return null;
    const label = count > 99 ? '99+' : String(count);
    return (
      <span className={`nav-new-badge nav-new-badge--${variant}`} aria-label={`Нового: ${label}`}>
        {label}
      </span>
    );
  }, [getNavBadgeCount]);
  const applyStudentNavNewSummary = useCallback((summary) => {
    setStudentScheduleNavNewTotal(Math.max(0, Math.floor(Number(summary?.schedule?.count) || 0)));
    setStudentProgressNavNewTotal(Math.max(0, Math.floor(Number(summary?.progress?.count) || 0)));
  }, []);
  const syncTeacherSignupNotifyState = useCallback(async ({ silent = true } = {}) => {
    if (user.role !== 'teacher') return;

    setTeacherSignupNotifySyncing(true);
    if (!silent) setTeacherSignupNotifyError('');
    try {
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus();
        const supported = Boolean(nativeStatus?.supported && nativeStatus?.configured && nativeStatus?.available);
        setTeacherSignupNotifySupported(supported);
        setTeacherSignupNotifyPermission(nativeStatus?.permission || 'default');
        if (!supported) {
          setTeacherSignupNotifyEnabled(false);
          if (!silent) {
            setTeacherSignupNotifyError(getNativePushUnavailableMessage(nativeStatus));
          }
          return;
        }

        const serverStatus = await api.getPushSubscriptionStatus().catch(() => ({ subscribed: false, rustoreCount: 0 }));
        let subscribed = Number(serverStatus?.rustoreCount) > 0;
        if (nativeStatus?.token) {
          await api.savePushSubscription({
            provider: 'rustore',
            token: nativeStatus.token,
          });
          subscribed = true;
        }

        setTeacherSignupNotifyEnabled(subscribed);
        return;
      }

      const supported = isPushFeatureSupported();
      setTeacherSignupNotifySupported(supported);
      setTeacherSignupNotifyPermission(getPushPermission());
      if (!supported) {
        setTeacherSignupNotifyEnabled(false);
        if (!silent) {
          setTeacherSignupNotifyError('Этот браузер не поддерживает push-уведомления.');
        }
        return;
      }

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

      setTeacherSignupNotifyEnabled(subscribed);
    } catch (error) {
      if (!silent) {
        setTeacherSignupNotifyError(
          normalizePushErrorMessage(error, 'Не удалось проверить статус push-уведомлений.')
        );
      }
    } finally {
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus().catch(() => null);
        if (nativeStatus) {
          setTeacherSignupNotifyPermission(nativeStatus?.permission || 'default');
        }
      } else {
        setTeacherSignupNotifyPermission(getPushPermission());
      }
      setTeacherSignupNotifySyncing(false);
      setTeacherSignupNotifyReady(true);
    }
  }, [useNativeAndroidPush, user.role]);
  const handleEnableTeacherSignupNotify = useCallback(async () => {
    if (user.role !== 'teacher') return;

    setTeacherSignupNotifyBusy(true);
    setTeacherSignupNotifyError('');
    try {
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus();
        const supported = Boolean(nativeStatus?.supported && nativeStatus?.configured && nativeStatus?.available);
        setTeacherSignupNotifySupported(supported);
        setTeacherSignupNotifyPermission(nativeStatus?.permission || 'default');
        if (!supported) {
          throw new Error(getNativePushUnavailableMessage(nativeStatus));
        }

        let permission = nativeStatus?.permission || 'default';
        if (permission !== 'granted') {
          const permissionResult = await requestNativePushPermission();
          permission = permissionResult?.permission || 'default';
          setTeacherSignupNotifyPermission(permission);
        }
        if (permission !== 'granted') {
          throw new Error('Разрешение на уведомления не выдано в Android.');
        }

        const result = await enableNativePush();
        const token = String(result?.token || '').trim();
        if (!token) {
          throw new Error('RuStore не выдал push-токен.');
        }

        await api.savePushSubscription({
          provider: 'rustore',
          token,
        });
        setTeacherSignupNotifyEnabled(true);
        setTeacherSignupNotifyReady(true);
        return;
      }

      const supported = isPushFeatureSupported();
      setTeacherSignupNotifySupported(supported);
      if (!supported) {
        setTeacherSignupNotifyError('Этот браузер не поддерживает push-уведомления.');
        return;
      }

      const permissionBefore = getPushPermission();
      setTeacherSignupNotifyPermission(permissionBefore);
      if (permissionBefore === 'denied') {
        throw new Error('Разрешение на уведомления отключено в браузере.');
      }

      let permission = permissionBefore;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
        setTeacherSignupNotifyPermission(permission);
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
      setTeacherSignupNotifyEnabled(true);
      setTeacherSignupNotifyReady(true);
    } catch (error) {
      setTeacherSignupNotifyError(normalizePushErrorMessage(error));
    } finally {
      setTeacherSignupNotifyBusy(false);
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus().catch(() => null);
        if (nativeStatus) {
          setTeacherSignupNotifyPermission(nativeStatus?.permission || 'default');
        }
      } else {
        setTeacherSignupNotifyPermission(getPushPermission());
      }
    }
  }, [useNativeAndroidPush, user.role]);
  const handleDisableTeacherSignupNotify = useCallback(async () => {
    if (user.role !== 'teacher') return;
    setTeacherSignupNotifyBusy(true);
    setTeacherSignupNotifyError('');
    try {
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus().catch(() => null);
        const fallbackToken = String(nativeStatus?.token || '').trim();
        const result = await disableNativePush();
        const token = String(result?.previousToken || fallbackToken).trim();
        await api.deletePushSubscription(token
          ? { provider: 'rustore', token }
          : { provider: 'rustore' });
        if (result?.warning) {
          setTeacherSignupNotifyError(result.warning);
        }
        setTeacherSignupNotifyEnabled(false);
        setTeacherSignupNotifyReady(true);
        return;
      }

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
      setTeacherSignupNotifyEnabled(false);
      setTeacherSignupNotifyReady(true);
    } catch (error) {
      setTeacherSignupNotifyError(
        normalizePushErrorMessage(error, 'Не удалось отключить push-уведомления.')
      );
    } finally {
      setTeacherSignupNotifyBusy(false);
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus().catch(() => null);
        if (nativeStatus) {
          setTeacherSignupNotifyPermission(nativeStatus?.permission || 'default');
        }
      } else {
        setTeacherSignupNotifyPermission(getPushPermission());
      }
    }
  }, [useNativeAndroidPush, user.role]);
  const handleToggleTeacherSignupNotify = useCallback(() => {
    if (teacherSignupNotifyBusy || teacherSignupNotifySyncing) return;
    if (teacherSignupNotifyEnabled) {
      handleDisableTeacherSignupNotify();
      return;
    }
    handleEnableTeacherSignupNotify();
  }, [
    handleDisableTeacherSignupNotify,
    handleEnableTeacherSignupNotify,
    teacherSignupNotifyBusy,
    teacherSignupNotifyEnabled,
    teacherSignupNotifySyncing,
  ]);
  const teacherSignupNotifyStatusText = useMemo(() => {
    if (teacherSignupNotifySyncing) return 'Проверяем статус push...';
    if (!teacherSignupNotifySupported) {
      return useNativeAndroidPush
        ? 'RuStore Push недоступен на этом Android-устройстве.'
        : 'Push не поддерживается в этом браузере.';
    }
    if (teacherSignupNotifyPermission === 'denied') {
      return useNativeAndroidPush
        ? 'Уведомления заблокированы в настройках Android.'
        : 'Уведомления заблокированы в настройках браузера.';
    }
    if (teacherSignupNotifyEnabled) {
      return useNativeAndroidPush
        ? 'Push-уведомления через RuStore о новых сообщениях включены.'
        : 'Push-уведомления о новых сообщениях включены.';
    }
    return useNativeAndroidPush
      ? 'Включите push через RuStore, чтобы получать уведомления о новых сообщениях учеников и заявок.'
      : 'Включите push, чтобы получать браузерные уведомления о новых сообщениях учеников и заявок.';
  }, [
    teacherSignupNotifyEnabled,
    teacherSignupNotifyPermission,
    teacherSignupNotifySupported,
    teacherSignupNotifySyncing,
    useNativeAndroidPush,
  ]);
  const syncPushSubscriptionState = useCallback(async ({ silent = true } = {}) => {
    if (user.role !== 'student') return;

    setPushSyncing(true);
    if (!silent) setPushError('');
    try {
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus();
        const supported = Boolean(nativeStatus?.supported && nativeStatus?.configured && nativeStatus?.available);
        setPushSupported(supported);
        setPushPermission(nativeStatus?.permission || 'default');
        if (supported) {
          setPushError('');
        }
        if (!supported) {
          setPushSubscribed(false);
          setPushError(getNativePushUnavailableMessage(nativeStatus));
          return;
        }

        const serverStatus = await api.getPushSubscriptionStatus().catch(() => ({ subscribed: false, rustoreCount: 0 }));
        let subscribed = Number(serverStatus?.rustoreCount) > 0;
        if (nativeStatus?.token) {
          await api.savePushSubscription({
            provider: 'rustore',
            token: nativeStatus.token,
          });
          subscribed = true;
        }

        setPushSubscribed(subscribed);
        return;
      }

      const supported = isPushFeatureSupported();
      setPushSupported(supported);
      setPushPermission(getPushPermission());
      if (!supported) {
        setPushSubscribed(false);
        if (!silent) {
          setPushError('Этот браузер не поддерживает push-уведомления.');
        }
        return;
      }

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
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus().catch(() => null);
        if (nativeStatus) {
          setPushPermission(nativeStatus?.permission || 'default');
        }
      } else {
        setPushPermission(getPushPermission());
      }
      setPushSyncing(false);
      setPushReady(true);
    }
  }, [useNativeAndroidPush, user.role]);
  const handleEnablePush = useCallback(async () => {
    if (user.role !== 'student') return;

    setPushBusy(true);
    setPushError('');
    try {
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus();
        const supported = Boolean(nativeStatus?.supported && nativeStatus?.configured && nativeStatus?.available);
        setPushSupported(supported);
        setPushPermission(nativeStatus?.permission || 'default');
        if (!supported) {
          throw new Error(getNativePushUnavailableMessage(nativeStatus));
        }

        let permission = nativeStatus?.permission || 'default';
        if (permission !== 'granted') {
          const permissionResult = await requestNativePushPermission();
          permission = permissionResult?.permission || 'default';
          const refreshedNativeStatus = await getNativePushStatus().catch(() => null);
          if (refreshedNativeStatus) {
            const refreshedSupported = Boolean(
              refreshedNativeStatus?.supported
              && refreshedNativeStatus?.configured
              && refreshedNativeStatus?.available
            );
            setPushSupported(refreshedSupported);
            permission = refreshedNativeStatus?.permission || permission;
          }
          setPushPermission(permission);
        }
        if (permission !== 'granted') {
          throw new Error('Android не подтвердил разрешение на уведомления. Проверьте настройки приложения и RuStore.');
        }

        const result = await enableNativePush();
        const token = String(result?.token || '').trim();
        if (!token) {
          throw new Error('RuStore не выдал push-токен.');
        }

        await api.savePushSubscription({
          provider: 'rustore',
          token,
        });
        setPushSubscribed(true);
        setPushReady(true);
        return;
      }

      const supported = isPushFeatureSupported();
      setPushSupported(supported);
      if (!supported) {
        setPushError('Этот браузер не поддерживает push-уведомления.');
        return;
      }

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
      if (useNativeAndroidPush) {
        const message = String(error?.message || '').trim();
        setPushError(message || 'Не удалось включить RuStore push.');
      } else {
        setPushError(normalizePushErrorMessage(error));
      }
    } finally {
      setPushBusy(false);
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus().catch(() => null);
        if (nativeStatus) {
          setPushPermission(nativeStatus?.permission || 'default');
        }
      } else {
        setPushPermission(getPushPermission());
      }
    }
  }, [useNativeAndroidPush, user.role]);
  const handleDisablePush = useCallback(async () => {
    if (user.role !== 'student') return;
    setPushBusy(true);
    setPushError('');
    try {
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus().catch(() => null);
        const fallbackToken = String(nativeStatus?.token || '').trim();
        const result = await disableNativePush();
        const token = String(result?.previousToken || fallbackToken).trim();
        await api.deletePushSubscription(token
          ? { provider: 'rustore', token }
          : { provider: 'rustore' });
        if (result?.warning) {
          setPushError(result.warning);
        }
        setPushSubscribed(false);
        setPushReady(true);
        return;
      }

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
      if (useNativeAndroidPush) {
        const nativeStatus = await getNativePushStatus().catch(() => null);
        if (nativeStatus) {
          setPushPermission(nativeStatus?.permission || 'default');
        }
      } else {
        setPushPermission(getPushPermission());
      }
    }
  }, [useNativeAndroidPush, user.role]);
  const handleTogglePush = useCallback(async () => {
    if (pushBusy || pushSyncing) return;
    if (pushSubscribed) {
      await handleDisablePush();
      return;
    }
    await handleEnablePush();
  }, [handleDisablePush, handleEnablePush, pushBusy, pushSubscribed, pushSyncing]);
  const handleAvatarFile = useCallback(async (file) => {
    if (!file || !['student', 'teacher'].includes(user.role) || avatarSaving) return;
    if (!String(file.type || '').toLowerCase().startsWith('image/')) {
      setAvatarError('Нужна картинка');
      return;
    }
    if (Number(file.size) > STUDENT_AVATAR_MAX_BYTES) {
      setAvatarError('До 5 МБ');
      return;
    }
    setAvatarSaving(true);
    setAvatarError('');
    try {
      const avatarDataUrl = await readDashboardFileAsDataUrl(file);
      const payload = user.role === 'teacher'
        ? await api.updateTeacherAvatar(avatarDataUrl)
        : await api.updateStudentAvatar(avatarDataUrl);
      onUserUpdated?.(payload?.user || { ...user, avatarDataUrl: payload?.avatarDataUrl || avatarDataUrl });
    } catch (error) {
      setAvatarError(error?.message || String(error));
    } finally {
      setAvatarSaving(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }, [avatarSaving, onUserUpdated, user]);

  const renderUserAvatar = (className = 'h-9 w-9 rounded-lg', iconSize = 12) => {
    const avatarDataUrl = String(user?.avatarDataUrl || '').trim();
    const canEditAvatar = user.role === 'student' || user.role === 'teacher';
    const content = avatarDataUrl ? (
      <img src={avatarDataUrl} alt={user.name} className="h-full w-full object-cover" />
    ) : (
      <span>{String(user.name || '?').slice(0, 1).toUpperCase()}</span>
    );
    if (!canEditAvatar) {
      return (
        <div className={`${className} overflow-hidden bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-300/40 ring-1 ring-white/70`}>
          {content}
        </div>
      );
    }
    return (
      <button
        type="button"
        className={`${className} group relative overflow-visible font-bold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:opacity-70`}
        onClick={() => avatarInputRef.current?.click()}
        disabled={avatarSaving}
        aria-label="Сменить аватарку"
        title="Сменить аватарку"
      >
        <span
          className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-purple-300/40 ring-1 ring-white/70"
          style={{ borderRadius: 'inherit' }}
        >
          {content}
        </span>
        <span className="pointer-events-none absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-white bg-violet-600 text-white shadow-sm transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110">
          <Camera size={iconSize} />
        </span>
      </button>
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
    if (useNativeAndroidPush) {
      getNativePushStatus()
        .then((status) => {
          setPushPermission(status?.permission || 'default');
        })
        .catch(() => {});
    } else {
      setPushPermission(getPushPermission());
    }
    syncPushSubscriptionState({ silent: true });
  }, [syncPushSubscriptionState, useNativeAndroidPush, user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'teacher') {
      setTeacherSignupNotifySupported(isPushFeatureSupported());
      setTeacherSignupNotifyPermission(getPushPermission());
      setTeacherSignupNotifyEnabled(false);
      setTeacherSignupNotifySyncing(false);
      setTeacherSignupNotifyBusy(false);
      setTeacherSignupNotifyError('');
      setTeacherSignupNotifyReady(false);
      return;
    }
    if (useNativeAndroidPush) {
      getNativePushStatus()
        .then((status) => {
          setTeacherSignupNotifyPermission(status?.permission || 'default');
        })
        .catch(() => {});
    } else {
      setTeacherSignupNotifyPermission(getPushPermission());
    }
    syncTeacherSignupNotifyState({ silent: true });
  }, [syncTeacherSignupNotifyState, useNativeAndroidPush, user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'teacher') return undefined;
    const syncPermission = () => {
      if (useNativeAndroidPush) {
        getNativePushStatus()
          .then((status) => {
            setTeacherSignupNotifyPermission(status?.permission || 'default');
          })
          .catch(() => {});
        return;
      }
      setTeacherSignupNotifyPermission(getPushPermission());
    };
    syncPermission();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', syncPermission);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', syncPermission);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', syncPermission);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', syncPermission);
      }
    };
  }, [useNativeAndroidPush, user.role]);

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
    setCoinFlightCoins([]);
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

  const createCoinFlightCoins = useCallback((sourceRect, targetRect, gainedCoins, flightDurationMs) => {
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 720;
    const sourceCenterX = Number.isFinite(sourceRect?.left)
      ? sourceRect.left + ((Number.isFinite(sourceRect?.width) ? sourceRect.width : 0) / 2)
      : (viewportW * 0.5);
    const sourceCenterY = Number.isFinite(sourceRect?.top)
      ? sourceRect.top + ((Number.isFinite(sourceRect?.height) ? sourceRect.height : 0) * 0.46)
      : (viewportH * 0.62);
    const targetCenterX = Number.isFinite(targetRect?.left)
      ? targetRect.left + ((Number.isFinite(targetRect?.width) ? targetRect.width : 0) / 2)
      : (viewportW * 0.5);
    const targetCenterY = Number.isFinite(targetRect?.top)
      ? targetRect.top + ((Number.isFinite(targetRect?.height) ? targetRect.height : 0) / 2)
      : (viewportH * 0.2);
    const count = Math.max(6, Math.min(18, Math.round(Math.max(1, gainedCoins) * 6)));
    const coins = [];
    let maxLandingMs = 0;
    for (let i = 0; i < count; i += 1) {
      const progress = count > 1 ? (i / (count - 1)) : 0;
      const startX = sourceCenterX + ((Math.random() - 0.5) * Math.max(32, (Number(sourceRect?.width) || 96) * 0.72));
      const startY = sourceCenterY + ((Math.random() - 0.5) * Math.max(18, (Number(sourceRect?.height) || 48) * 0.58));
      const endX = targetCenterX + ((Math.random() - 0.5) * Math.max(8, (Number(targetRect?.width) || 34) * 0.34));
      const endY = targetCenterY + ((Math.random() - 0.5) * Math.max(8, (Number(targetRect?.height) || 22) * 0.42));
      const horizontalCurve = (Math.random() - 0.5) * Math.max(44, Math.min(viewportW * 0.1, 112));
      const verticalLift = 84 + (Math.random() * 88);
      const midX = startX + ((endX - startX) * 0.42) + horizontalCurve;
      const midY = Math.min(startY, endY) - verticalLift;
      const delayMs = Math.round(progress * (flightDurationMs * 0.52) + (Math.random() * 90));
      const durationMs = Math.round(flightDurationMs * (0.66 + (Math.random() * 0.22)));
      const landingMs = delayMs + Math.round(durationMs * 0.9);
      if (landingMs > maxLandingMs) maxLandingMs = landingMs;
      coins.push({
        id: `coin-flight-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        sizePx: Math.round(16 + (Math.random() * 8)),
        delayMs,
        durationMs,
        startX,
        startY,
        midX,
        midY,
        endX,
        endY,
        rotateDeg: Math.round((Math.random() * 90) - 45),
      });
    }
    return { coins, maxLandingMs };
  }, []);

  const handleXpGain = useCallback((payload = {}) => {
    if (user.role !== 'student') return;
    const targetTotal = normalizeXpTotal(payload?.xpTotal);
    const payloadGained = normalizeXpTotal(payload?.xpGained);
    const payloadCoinsGained = normalizeCoinsTotal(payload?.coinsGained);
    const nextCoinsTotal = Number.isFinite(Number(payload?.coinsTotal))
      ? normalizeCoinsTotal(payload.coinsTotal)
      : null;
    const currentDisplay = normalizeXpTotal(xpDisplayTotalRef.current);
    const computedGained = Math.max(payloadGained, targetTotal - currentDisplay, 0);
    const hasXpAnimation = computedGained > 0;
    const hasCoinAnimation = payloadCoinsGained > 0;

    setStudentXpTotal(targetTotal);
    if (nextCoinsTotal !== null) {
      setStudentCoinsTotal(nextCoinsTotal);
    }

    if (!Number.isFinite(targetTotal)) {
      stopXpGainAnimation();
      setXpDisplayTotal(0);
      return;
    }

    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if ((!hasXpAnimation && !hasCoinAnimation) || prefersReducedMotion) {
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
    setCoinFlightCoins([]);

    const sourceRect = (
      payload?.sourceRect
      && Number.isFinite(payload.sourceRect.left)
      && Number.isFinite(payload.sourceRect.top)
      && Number.isFinite(payload.sourceRect.width)
      && Number.isFinite(payload.sourceRect.height)
    )
      ? payload.sourceRect
      : null;
    const baseDurationMs = Math.max(
      1200,
      Math.min(2700, Math.round(1100 + (computedGained * 1.25) + (payloadCoinsGained * 120)))
    );
    const startTotal = currentDisplay;

    const runAnimation = () => {
      if (xpAnimTokenRef.current !== token) return;
      const xpTargetRect = hasXpAnimation
        ? (xpDockBarRef.current?.getBoundingClientRect() || xpInlineBarRef.current?.getBoundingClientRect())
        : null;
      if (hasXpAnimation && (!xpTargetRect || xpTargetRect.width < 24 || xpTargetRect.height < 8)) {
        stopXpGainAnimation();
        setXpDisplayTotal(targetTotal);
        return;
      }
      const coinTargetRect = hasCoinAnimation
        ? (coinDockBadgeRef.current?.getBoundingClientRect() || coinInlineBadgeRef.current?.getBoundingClientRect())
        : null;
      if (hasCoinAnimation && (!coinTargetRect || coinTargetRect.width < 12 || coinTargetRect.height < 12)) {
        stopXpGainAnimation();
        setXpDisplayTotal(targetTotal);
        return;
      }

      let maxLandingMs = 0;
      if (hasXpAnimation) {
        const { stars, maxLandingMs: xpLandingMs } = createXpFlightStars(sourceRect, xpTargetRect, computedGained, baseDurationMs);
        if (xpAnimTokenRef.current !== token) return;
        setXpFlightStars(stars);
        maxLandingMs = Math.max(maxLandingMs, xpLandingMs);
      }
      if (hasCoinAnimation) {
        const { coins, maxLandingMs: coinLandingMs } = createCoinFlightCoins(sourceRect, coinTargetRect, payloadCoinsGained, baseDurationMs);
        if (xpAnimTokenRef.current !== token) return;
        setCoinFlightCoins(coins);
        maxLandingMs = Math.max(maxLandingMs, coinLandingMs);
      }
      if (xpAnimTokenRef.current !== token) return;

      const counterDurationMs = Math.max(900, Math.min(3600, Math.max(maxLandingMs + 140, hasXpAnimation ? 900 : baseDurationMs)));
      if (hasXpAnimation) {
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
      } else {
        setXpDisplayTotal(targetTotal);
      }

      xpDockHideTimerRef.current = setTimeout(() => {
        if (xpAnimTokenRef.current !== token) return;
        setXpAnimationActive(false);
        setXpFlightStars([]);
        setCoinFlightCoins([]);
        setXpDockVisible(false);
        xpAnimationRunningRef.current = false;
      }, counterDurationMs + 820);
    };

    requestAnimationFrame(() => requestAnimationFrame(runAnimation));
  }, [coinInlineBadgeRef, createCoinFlightCoins, createXpFlightStars, stopXpGainAnimation, user.role]);

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
    const resolvedView = ((user.role === 'student' || user.role === 'teacher') && normalizedView === 'lesson')
      ? studentDefaultLessonView
      : normalizedView;
    const allowedViewsList = allowedViewsKey ? allowedViewsKey.split('|') : [];
    if (!allowedViewsList.includes(resolvedView)) return;
    if (!resolvedView || resolvedView === view) return;
    stopGoalFlyAnimation();
    captureGoalFlySource(resolvedView);
    setView(resolvedView);
  }, [allowedViewsKey, captureGoalFlySource, stopGoalFlyAnimation, studentDefaultLessonView, user.role, view]);
  const handleOpenStudentDirectChat = useCallback(async (targetStudentId) => {
    if (!PLATFORM_CHATS_ENABLED || user.role !== 'student') return;
    const normalizedStudentId = String(targetStudentId || '').trim();
    if (!normalizedStudentId || normalizedStudentId === String(user.id || '').trim()) return;

    const payload = await api.openStudentSocialDirectChat(normalizedStudentId);
    const chatId = String(payload?.chat?.id || '').trim();
    if (!chatId) throw new Error('Не удалось открыть чат.');

    setPendingDirectChatRequest({
      token: `${chatId}:${Date.now()}`,
      chatId,
      chat: payload.chat,
      messages: Array.isArray(payload?.messages) ? payload.messages : [],
    });
    setMenuOpen(false);
    navigateToView('chat');
  }, [navigateToView, user.id, user.role]);
  useEffect(() => {
    if (!useNativeAndroidPush) return undefined;

    let cancelled = false;
    const consumeLaunchUrl = async () => {
      const launchUrl = await consumeNativePushLaunchUrl().catch(() => '');
      if (cancelled || !launchUrl) return;

      const payload = parseNativePushLaunchUrl(launchUrl);
      if (!payload) return;

      const requestedView = String(payload.view || '').trim();
      const isTeacherCommsPushView = requestedView === 'signup-chats'
        || requestedView === 'student-chats'
        || requestedView === 'notifications';
      if (PLATFORM_CHATS_ENABLED && user.role === 'teacher' && isTeacherCommsPushView) {
        const nextTab = isTeacherCommsPushView ? requestedView : 'signup-chats';
        setTeacherCommsTab(nextTab);
        if (nextTab === 'student-chats' && payload.chatId) {
          setTeacherStudentChatId(payload.chatId);
        }
        if (nextTab === 'signup-chats' && payload.chatId) {
          setTeacherSignupChatId(payload.chatId);
        }
        setView('teacher-comms');
        return;
      }

      const allowedViewsList = allowedViewsKey ? allowedViewsKey.split('|') : [];
      if (requestedView && allowedViewsList.includes(requestedView)) {
        navigateToView(requestedView);
      }
    };

    const handleFocus = () => {
      consumeLaunchUrl();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        consumeLaunchUrl();
      }
    };

    consumeLaunchUrl();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [allowedViewsKey, navigateToView, useNativeAndroidPush, user.role]);
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
  const totalCoins = normalizeCoinsTotal(studentCoinsTotal);
  const levelProgress = getLevelProgressFromXp(totalXp);
  const currentLevel = levelProgress.level;
  const xpIntoLevel = levelProgress.xpIntoLevel;
  const xpPerLevel = levelProgress.xpForNextLevel;
  const xpRemaining = Math.max(0, xpPerLevel - xpIntoLevel);
  const levelProgressPercent = levelProgress.progressPercent;
  const xpIntoLevelLabel = xpIntoLevel.toLocaleString('ru-RU');
  const xpPerLevelLabel = xpPerLevel.toLocaleString('ru-RU');
  const xpRemainingLabel = xpRemaining.toLocaleString('ru-RU');
  const totalXpLabel = totalXp.toLocaleString('ru-RU');
  const totalCoinsLabel = totalCoins.toLocaleString('ru-RU');
  const openLevelProfile = useCallback(async () => {
    if (user.role !== 'student') return;

    const studentId = String(user.id || '').trim();
    if (!studentId) return;

    const requestId = levelProfileRequestIdRef.current + 1;
    levelProfileRequestIdRef.current = requestId;
    const fallbackRow = {
      studentId,
      displayName: String(user.name || '').trim() || 'Профиль',
      xpTotal: totalXp,
      weeklyXp: 0,
      level: currentLevel,
      isCurrent: true,
    };

    setLevelProfileState((previous) => ({
      ...previous,
      open: true,
      row: previous.row || fallbackRow,
      loading: true,
      error: '',
    }));

    const [profileResult, leaderboardResult] = await Promise.allSettled([
      api.getLeaderboardStudentProfile(studentId),
      api.getStudentsLeaderboard({ studentId }),
    ]);
    if (levelProfileRequestIdRef.current !== requestId) return;

    if (profileResult.status === 'rejected') {
      setLevelProfileState((previous) => ({
        ...previous,
        open: true,
        loading: false,
        error: profileResult.reason?.message || 'Не удалось загрузить профиль.',
      }));
      return;
    }

    const profileData = profileResult.value && typeof profileResult.value === 'object'
      ? profileResult.value
      : null;
    const leaderboardItems = leaderboardResult.status === 'fulfilled'
      && Array.isArray(leaderboardResult.value?.items)
      ? leaderboardResult.value.items
      : [];
    const normalizedRows = leaderboardItems.map((item) => {
      const xpTotal = normalizeXpTotal(item?.xpTotal);
      const weeklyXp = normalizeXpTotal(item?.weeklyXp);
      const levelValue = Number(item?.level);
      return {
        studentId: String(item?.studentId || '').trim(),
        displayName: String(item?.publicName || '').trim(),
        xpTotal,
        weeklyXp,
        level: Number.isFinite(levelValue) && levelValue > 0
          ? Math.floor(levelValue)
          : getLevelFromXp(xpTotal),
      };
    });
    const byLevel = [...normalizedRows].sort((left, right) => (
      right.level - left.level
      || right.xpTotal - left.xpTotal
      || right.weeklyXp - left.weeklyXp
      || left.displayName.localeCompare(right.displayName, 'ru')
    ));
    const byWeeklyXp = [...normalizedRows].sort((left, right) => (
      right.weeklyXp - left.weeklyXp
      || right.level - left.level
      || right.xpTotal - left.xpTotal
      || left.displayName.localeCompare(right.displayName, 'ru')
    ));
    const levelIndex = byLevel.findIndex((item) => item.studentId === studentId);
    const weeklyIndex = byWeeklyXp.findIndex((item) => item.studentId === studentId);
    const profileRow = normalizedRows.find((item) => item.studentId === studentId) || fallbackRow;

    setLevelProfileState({
      open: true,
      row: { ...profileRow, isCurrent: true },
      data: profileData,
      loading: false,
      error: '',
      levelPosition: levelIndex >= 0 ? levelIndex + 1 : null,
      weeklyPosition: weeklyIndex >= 0 ? weeklyIndex + 1 : null,
    });
  }, [currentLevel, totalXp, user.id, user.name, user.role]);

  const closeLevelProfile = useCallback(() => {
    levelProfileRequestIdRef.current += 1;
    setLevelProfileState((previous) => ({
      ...previous,
      open: false,
      loading: false,
      error: '',
    }));
  }, []);
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

  const loadStudents = useCallback((teacherId, options = {}) => {
    const normalizedTeacherId = String(teacherId || '').trim();
    if (!normalizedTeacherId) return Promise.resolve(null);

    const silent = options?.silent === true;
    const maxAgeMs = Math.max(0, Number(options?.maxAgeMs) || 0);
    const syncState = studentsSyncStateRef.current;
    const now = Date.now();

    if (
      maxAgeMs > 0
      && syncState.teacherId === normalizedTeacherId
      && syncState.lastSuccessAt > 0
      && now - syncState.lastSuccessAt < maxAgeMs
    ) {
      return Promise.resolve(null);
    }

    if (syncState.inFlight?.teacherId === normalizedTeacherId) {
      return syncState.inFlight.promise;
    }

    if (!silent) setStudentsLoading(true);

    const requestPromise = api.getStudents(normalizedTeacherId)
      .then((payload) => {
        const data = Array.isArray(payload) ? payload : [];
        if (studentsOwnerTeacherIdRef.current !== normalizedTeacherId) return data;

        studentsSyncStateRef.current.teacherId = normalizedTeacherId;
        studentsSyncStateRef.current.lastSuccessAt = Date.now();
        setStudents(data);
        setStudentsError('');
        setActiveStudentId((current) => resolveTeacherStudentSelection({
          currentId: current,
          storedId: storedActiveStudentIdRef.current,
          students: data.filter(isCurrentStudent),
        }));
        return data;
      })
      .catch((err) => {
        if (studentsOwnerTeacherIdRef.current === normalizedTeacherId && !silent) {
          setStudentsError(err?.message || err);
        }
        return null;
      })
      .finally(() => {
        const latestSyncState = studentsSyncStateRef.current;
        if (latestSyncState.inFlight?.promise === requestPromise) {
          latestSyncState.inFlight = null;
        }
        if (studentsOwnerTeacherIdRef.current === normalizedTeacherId && !silent) {
          setStudentsLoading(false);
        }
      });

    studentsSyncStateRef.current = {
      teacherId: normalizedTeacherId,
      lastSuccessAt: syncState.teacherId === normalizedTeacherId ? syncState.lastSuccessAt : 0,
      inFlight: { teacherId: normalizedTeacherId, promise: requestPromise },
    };
    return requestPromise;
  }, []);

  const refreshStudentsIfStale = useCallback((maxAgeMs = STUDENT_ROSTER_FOCUS_REVALIDATE_MS) => {
    if (user.role !== 'teacher') return Promise.resolve(null);
    return loadStudents(user.id, { silent: true, maxAgeMs });
  }, [loadStudents, user.id, user.role]);

  const refreshStudentsForPicker = useCallback(() => (
    refreshStudentsIfStale(STUDENT_ROSTER_PICKER_REVALIDATE_MS)
  ), [refreshStudentsIfStale]);

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
      const normalizedTeacherId = String(user.id || '').trim();
      if (studentsOwnerTeacherIdRef.current !== normalizedTeacherId) {
        studentsOwnerTeacherIdRef.current = normalizedTeacherId;
        studentsSyncStateRef.current = { teacherId: normalizedTeacherId, lastSuccessAt: 0, inFlight: null };
      }
      loadStudents(normalizedTeacherId);
      loadDeletedStudents(user.id);
    } else {
      studentsOwnerTeacherIdRef.current = '';
      studentsSyncStateRef.current = { teacherId: '', lastSuccessAt: 0, inFlight: null };
      setStudents([]);
      setActiveStudentId(null);
      setStudentsError('');
      setStudentsLoading(false);
      setDeletedStudents([]);
      setDeletedStudentsError('');
      setDeletedStudentsLoading(false);
    }
  }, [loadStudents, user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'teacher') return undefined;

    const refreshVisibleRoster = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshStudentsIfStale();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshVisibleRoster();
    };

    window.addEventListener('focus', refreshVisibleRoster);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshVisibleRoster);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshStudentsIfStale, user.role]);

  useEffect(() => {
    if (user.role !== 'teacher') return;
    refreshStudentsIfStale();
  }, [refreshStudentsIfStale, user.role, view]);

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
      setStudentCoinsTotal(0);
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
        const resolvedCoins = Number.isFinite(Number(data?.coinsTotal))
          ? normalizeCoinsTotal(data.coinsTotal)
          : deriveCoinsFromSolvedByTask(solved);
        setStudentXpTotal(resolvedXp);
        setStudentCoinsTotal(resolvedCoins);
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
          setStudentCoinsTotal(0);
          setXpDisplayTotal(0);
          setStudentDataLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [goalRefreshTick, stopXpGainAnimation, user.id, user.role]);

  useEffect(() => {
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
  }, []);
  const openPaceForecastPopup = useCallback(() => {
    if (user.role !== 'student') return;
    setPaceForecastPopupOpen(true);
  }, [user.role]);
  const handlePaceForecastDialogKeyDown = useCallback((event) => {
    if (event.key !== 'Tab') return;
    const focusableElements = Array.from(event.currentTarget.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    if (!focusableElements.length) return;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && (document.activeElement === firstElement || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }, []);

  useEffect(() => {
    if (!paceForecastPopupOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      paceForecastDialogRef.current?.focus({ preventScroll: true });
    });
    const handleEscape = (event) => {
      if (event.key === 'Escape') closePaceForecastPopup();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousBodyOverflow;
      window.requestAnimationFrame(() => {
        paceForecastTriggerRef.current?.focus({ preventScroll: true });
      });
    };
  }, [closePaceForecastPopup, paceForecastPopupOpen]);

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
      setTeacherSolvedNotifs([]);
      setTeacherSignupNotifs([]);
      setTeacherSolvedBulkReadBusy(false);
      dismissedSignupNotifsRef.current.clear();
      return;
    }
    setTeacherSolvedNotifs([]);
    setTeacherSignupNotifs([]);
    setTeacherSolvedBulkReadBusy(false);
    dismissedSignupNotifsRef.current.clear();
  }, [user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'teacher') {
      setTeacherNotifHistory([]);
      return;
    }
    setTeacherNotifHistory(loadTeacherNotifHistory(user.id));
  }, [user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'teacher') return;
    saveTeacherNotifHistory(user.id, teacherNotifHistory);
  }, [teacherNotifHistory, user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'teacher') return;
    if (!Array.isArray(teacherNotifs) || teacherNotifs.length <= 0) return;
    appendTeacherNotifHistory(teacherNotifs);
  }, [appendTeacherNotifHistory, teacherNotifs, user.role, user.id]);

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
          const solvedAtMs = Date.parse(event?.solvedAt || '');
          unique.push({
            ...event,
            id: eventId,
            type: 'solved',
            source: normalizeTeacherSolvedSource(event),
            timestampMs: Number.isFinite(solvedAtMs) ? solvedAtMs : 0,
          });
        });
        const sorted = unique.sort((a, b) => (Number(b.timestampMs) || 0) - (Number(a.timestampMs) || 0));
        setTeacherSolvedNotifs(sorted);
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

  useEffect(() => {
    if (!PLATFORM_CHATS_ENABLED || user.role !== 'teacher') {
      setTeacherSignupNotifs([]);
      return undefined;
    }
    let cancelled = false;

    const fetchSignupUnread = async () => {
      try {
        const chats = await api.getSignupChats();
        if (cancelled) return;
        const chatList = Array.isArray(chats) ? chats : [];
        const mutedByChat = dismissedSignupNotifsRef.current;
        const existingChatIds = new Set();
        const nextNotifs = [];

        registerIncomingMessageSoundCandidates('teacher-signup', chatList.map((chat) => {
          const chatId = typeof chat?.id === 'string' ? chat.id.trim() : '';
          const unreadForTeacher = Math.max(0, Math.floor(Number(chat?.unreadForTeacher) || 0));
          return {
            key: chatId ? `signup:${chatId}` : '',
            unreadCount: unreadForTeacher,
            lastMessageAt: chat?.lastMessageAt || chat?.updatedAt || chat?.createdAt,
            incoming: unreadForTeacher > 0 && chat?.lastMessageSenderRole === 'lead',
          };
        }));

        chatList.forEach((chat) => {
          const chatId = typeof chat?.id === 'string' ? chat.id.trim() : '';
          if (!chatId) return;
          existingChatIds.add(chatId);

          const unreadForTeacher = Number(chat?.unreadForTeacher) || 0;
          const lastMessageAt = String(chat?.lastMessageAt || chat?.updatedAt || chat?.createdAt || '').trim();
          const ts = Date.parse(lastMessageAt);
          const messagePreview = String(chat?.lastMessagePreview || '').replace(/\s+/g, ' ').trim();
          const guestName = String(chat?.guestName || '').trim() || 'Гость';

          if (unreadForTeacher <= 0) {
            mutedByChat.delete(chatId);
            return;
          }

          const mutedAtUnread = Number(mutedByChat.get(chatId)) || 0;
          if (mutedAtUnread > 0 && unreadForTeacher <= mutedAtUnread) return;

          nextNotifs.push({
            id: `signup-${chatId}`,
            type: 'signup',
            chatId,
            guestName,
            unreadCount: unreadForTeacher,
            preview: messagePreview,
            lastMessageAt,
            timestampMs: Number.isFinite(ts) ? ts : 0,
          });
        });

        [...mutedByChat.keys()].forEach((chatId) => {
          if (!existingChatIds.has(chatId)) mutedByChat.delete(chatId);
        });

        nextNotifs.sort((a, b) => (Number(b.timestampMs) || 0) - (Number(a.timestampMs) || 0));
        setTeacherSignupNotifs(nextNotifs);
      } catch {
        // ignore
      }
    };

    fetchSignupUnread();
    const interval = setInterval(fetchSignupUnread, 9000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [registerIncomingMessageSoundCandidates, user.role, user.id]);

  useEffect(() => {
    if (!PLATFORM_CHATS_ENABLED || user.role !== 'teacher') {
      setTeacherStudentChatsUnreadTotal(0);
      return undefined;
    }
    let cancelled = false;

    const fetchStudentChatUnread = async () => {
      try {
        const [studentChatsResult, groupChatResult] = await Promise.allSettled([
          api.getStudentChats(),
          api.getTeacherSocialGroupChat(user.id),
        ]);
        if (cancelled) return;
        let total = 0;
        const soundCandidates = [];
        if (studentChatsResult.status === 'fulfilled') {
          const studentChats = Array.isArray(studentChatsResult.value) ? studentChatsResult.value : [];
          studentChats.forEach((chat) => {
            const unreadForTeacher = Math.max(0, Math.floor(Number(chat?.unreadForTeacher) || 0));
            total += unreadForTeacher;
            soundCandidates.push({
              key: chat?.id ? `student:${chat.id}` : '',
              unreadCount: unreadForTeacher,
              lastMessageAt: chat?.lastMessageAt || chat?.updatedAt || chat?.createdAt,
              incoming: unreadForTeacher > 0 && chat?.lastMessageSenderRole === 'student',
            });
          });
        }
        if (groupChatResult.status === 'fulfilled') {
          const groupChat = groupChatResult.value?.groupChat || null;
          const groupUnread = Math.max(0, Math.floor(Number(groupChat?.unreadForTeacher) || 0));
          total += groupUnread;
          soundCandidates.push({
            key: groupChat?.id ? `group:${groupChat.id}` : '',
            unreadCount: groupUnread,
            lastMessageAt: groupChat?.lastMessageAt || groupChat?.updatedAt || groupChat?.createdAt,
            incoming: groupUnread > 0 && groupChat?.lastMessageSenderRole === 'student',
          });
        }
        registerIncomingMessageSoundCandidates('teacher-student-chats', soundCandidates);
        setTeacherStudentChatsUnreadTotal(total);
      } catch {
        if (!cancelled) setTeacherStudentChatsUnreadTotal(0);
      }
    };

    fetchStudentChatUnread();
    const handleChatWake = () => {
      void fetchStudentChatUnread();
    };
    window.addEventListener('student-chat-live-event', handleChatWake);
    window.addEventListener('student-chat-local-change', handleChatWake);
    return () => {
      cancelled = true;
      window.removeEventListener('student-chat-live-event', handleChatWake);
      window.removeEventListener('student-chat-local-change', handleChatWake);
    };
  }, [registerIncomingMessageSoundCandidates, user.role, user.id]);

  useEffect(() => {
    if (!PLATFORM_CHATS_ENABLED || user.role !== 'student') {
      setStudentChatNavUnreadTotal(0);
      return undefined;
    }
    let cancelled = false;

    const fetchStudentNavUnread = async () => {
      try {
        const [teacherChatResult, socialChatsResult, notificationSettingsResult] = await Promise.allSettled([
          api.getStudentChatSummary(),
          api.getStudentSocialChats(),
          api.getStudentChatNotificationSettings(),
        ]);
        if (cancelled) return;

        const notificationSettingsLoaded = notificationSettingsResult.status === 'fulfilled';
        const notificationSettings = notificationSettingsLoaded
          ? (notificationSettingsResult.value?.settings || {})
          : {};
        const directNotificationSettings = notificationSettings?.directByChatId || {};
        const soundCandidates = [];
        let total = 0;
        if (teacherChatResult.status === 'fulfilled') {
          const teacherChat = teacherChatResult.value?.chat || null;
          const teacherUnread = Math.max(0, Math.floor(Number(teacherChat?.unreadForStudent) || 0));
          const teacherAudible = notificationSettingsLoaded && notificationSettings.teacherEnabled !== false;
          total += teacherUnread;
          soundCandidates.push({
            key: teacherChat?.id ? `teacher:${teacherChat.id}` : 'teacher:default',
            unreadCount: teacherUnread,
            lastMessageAt: teacherChat?.lastMessageAt || teacherChat?.updatedAt || teacherChat?.createdAt,
            incoming: teacherUnread > 0 && teacherChat?.lastMessageSenderRole === 'teacher',
            audible: teacherAudible,
          });
        }
        if (socialChatsResult.status === 'fulfilled') {
          const payload = socialChatsResult.value || {};
          const groupChat = payload?.groupChat || null;
          const groupUnread = Math.max(0, Math.floor(Number(groupChat?.unreadForStudent) || 0));
          const groupAudible = notificationSettingsLoaded && notificationSettings.groupEnabled !== false;
          total += groupUnread;
          soundCandidates.push({
            key: groupChat?.id ? `group:${groupChat.id}` : '',
            unreadCount: groupUnread,
            lastMessageAt: groupChat?.lastMessageAt || groupChat?.updatedAt || groupChat?.createdAt,
            incoming: groupUnread > 0
              && groupChat?.lastMessageSenderRole !== 'system'
              && String(groupChat?.lastMessageSenderId || '').trim() !== String(user.id || '').trim(),
            audible: groupAudible,
          });
          (Array.isArray(payload?.directChats) ? payload.directChats : []).forEach((chat) => {
            const directUnread = Math.max(0, Math.floor(Number(chat?.unreadForStudent) || 0));
            const directAudible = notificationSettingsLoaded && directNotificationSettings?.[chat?.id] !== false;
            total += directUnread;
            soundCandidates.push({
              key: chat?.id ? `direct:${chat.id}` : '',
              unreadCount: directUnread,
              lastMessageAt: chat?.lastMessageAt || chat?.updatedAt || chat?.createdAt,
              incoming: directUnread > 0
                && chat?.lastMessageSenderRole !== 'system'
                && String(chat?.lastMessageSenderId || '').trim() !== String(user.id || '').trim(),
              audible: directAudible,
            });
          });
        }
        registerIncomingMessageSoundCandidates('student-chats', soundCandidates);
        setStudentChatNavUnreadTotal(total);
      } catch {
        if (!cancelled) setStudentChatNavUnreadTotal(0);
      }
    };

    fetchStudentNavUnread();
    const handleChatWake = () => {
      void fetchStudentNavUnread();
    };
    window.addEventListener('student-chat-notification-settings-updated', fetchStudentNavUnread);
    window.addEventListener('student-chat-live-event', handleChatWake);
    window.addEventListener('student-chat-local-change', handleChatWake);
    return () => {
      cancelled = true;
      window.removeEventListener('student-chat-notification-settings-updated', fetchStudentNavUnread);
      window.removeEventListener('student-chat-live-event', handleChatWake);
      window.removeEventListener('student-chat-local-change', handleChatWake);
    };
  }, [registerIncomingMessageSoundCandidates, user.role, user.id, view]);

  useEffect(() => {
    if (user.role !== 'student') {
      setStudentScheduleNavNewTotal(0);
      setStudentProgressNavNewTotal(0);
      return undefined;
    }
    let cancelled = false;

    const fetchStudentNavNewSummary = async () => {
      try {
        const summary = await api.getStudentNavNewSummary();
        if (!cancelled) applyStudentNavNewSummary(summary);
      } catch {
        if (!cancelled) {
          setStudentScheduleNavNewTotal(0);
          setStudentProgressNavNewTotal(0);
        }
      }
    };

    fetchStudentNavNewSummary();
    const interval = setInterval(fetchStudentNavNewSummary, 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [applyStudentNavNewSummary, user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'student') return undefined;
    const sections = [];
    if (view === 'schedule' && studentScheduleNavNewTotal > 0) sections.push('schedule');
    if (view === 'progress' && activeProgressSection === 'mocks' && studentProgressNavNewTotal > 0) {
      sections.push('progress');
    }
    if (sections.length === 0) return undefined;

    let cancelled = false;
    api.markStudentNavSectionsRead(sections)
      .then((summary) => {
        if (!cancelled) applyStudentNavNewSummary(summary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    activeProgressSection,
    applyStudentNavNewSummary,
    studentProgressNavNewTotal,
    studentScheduleNavNewTotal,
    user.role,
    user.id,
    view,
  ]);

  const handleStudentCreated = (student) => {
    if (!student) return;
    setStudents((prev) => [student, ...prev]);
    if (isCurrentStudent(student)) {
      setActiveStudentId((current) => current || normalizeTeacherStudentId(student.id));
    }
  };

  const handleStudentDeleted = (payload) => {
    const student = typeof payload === 'string' ? { id: payload } : payload;
    if (!student?.id) return;
    setStudents((prev) => {
      const next = prev.filter((s) => s.id !== student.id);
      const nextCurrentStudentId = next.find(isCurrentStudent)?.id || null;
      setActiveStudentId((current) => (current === student.id ? nextCurrentStudentId : current));
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
    if (isCurrentStudent(student)) {
      setActiveStudentId((current) => current || student.id);
    }
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
    setActiveProgressSection(nextSection);
    updateUserLocation(user, { progressSection: nextSection });
  };

  const handleTaskStateChange = (nextTask) => {
    if (user.role !== 'student') return;
    if (nextTask && typeof nextTask === 'object') {
      recordLessonReplayEvent('task', {
        active: true,
        taskNumber: nextTask.taskNumber,
        questionIndex: Number.isFinite(nextTask.questionIndex) ? nextTask.questionIndex : null,
        questionNumber: Number.isFinite(Number(nextTask.questionNumber))
          ? Number(nextTask.questionNumber)
          : null,
        levelId: nextTask.levelId,
        label: Number.isFinite(Number(nextTask.taskNumber))
          ? `Задание ${getTaskDisplayNumber(Number(nextTask.taskNumber))}`
          : '',
      }, { dedupeMs: 4000 });
    } else {
      recordLessonReplayEvent('task', {
        active: false,
        label: 'Список заданий',
      }, { dedupeMs: 4000 });
    }
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

  const handleNotesLocationChange = useCallback((location) => {
    setRequestedNotesLocation(location);
    updateUserLocation(user, { notesLocation: location });
  }, [user]);

  const handleGlobalOpenNotes = useCallback((location) => {
    if (user.role !== 'student') return;
    const nextLocation = {
      ...(location && typeof location === 'object' ? location : {}),
      studentId: user.id,
    };
    setRequestedNotesLocation(nextLocation);
    setNotesLocationRequestKey((current) => current + 1);
    updateUserLocation(user, { view: 'notes', notesLocation: nextLocation });
    navigateToView('notes');
    setMenuOpen(false);
  }, [navigateToView, user]);

  const handleGlobalOpenLesson = useCallback((lessonKey) => {
    if (user.role !== 'student') return;
    const normalizedKey = String(lessonKey || '').trim();
    if (!normalizedKey) return;
    setPendingLessonCapsuleKey(normalizedKey);
    navigateToView('schedule');
    setMenuOpen(false);
  }, [navigateToView, user.role]);

  const handleGlobalOpenProgressSection = useCallback((requestedSection = 'progress') => {
    if (user.role !== 'student') return;
    const nextSection = ['progress', 'notes', 'mocks'].includes(String(requestedSection || '').trim())
      ? String(requestedSection).trim()
      : 'progress';
    setPendingOpenTask(null);
    setPendingOpenMockExamId(null);
    setActiveProgressSection(nextSection);
    setProgressSectionJumpToken((current) => current + 1);
    updateUserLocation(user, {
      view: 'progress',
      progressSection: nextSection,
      openTask: null,
      mockExamId: null,
    });
    navigateToView('progress');
    setMenuOpen(false);
  }, [navigateToView, user]);

  const handleOpenTask = (taskNumber, levelId, targetQuestions, options = {}) => {
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
      questionIndex: null,
      subsectionId: String(options?.subsectionId || '').trim() || null,
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

  const handleOpenMockGoal = (mockExamId = null, initialTaskNumber = null, options = {}) => {
    if (user.role !== 'student') return;
    const normalizedMockExamId = normalizeMockExamId(mockExamId);
    const normalizedInitialTaskNumber = String(initialTaskNumber ?? '').trim();
    const normalizedTargetTaskKeys = Array.from(new Set(
      (Array.isArray(options?.targetTaskKeys) ? options.targetTaskKeys : [])
        .map((taskKey) => String(taskKey || '').trim())
        .filter(Boolean)
    ));
    const requestedMode = String(options?.mode || '').trim();
    const normalizedMode = requestedMode ? normalizeAssignedMockExamMode(requestedMode) : '';
    const fromHomework = options?.fromHomework === true;
    const hasScopedRequest = Boolean(
      normalizedInitialTaskNumber
      || normalizedTargetTaskKeys.length > 0
      || normalizedMode
      || fromHomework
    );
    setPendingOpenTask(null);
    setPendingOpenMockExamId(normalizedMockExamId
      ? (hasScopedRequest
        ? {
            examId: normalizedMockExamId,
            initialTaskNumber: normalizedInitialTaskNumber || null,
            targetTaskKeys: normalizedTargetTaskKeys,
            mode: normalizedMode || null,
            fromHomework,
          }
        : normalizedMockExamId)
      : null);
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

  const handleAssignMockReview = useCallback((request) => {
    if (user.role !== 'teacher') return;
    const targetStudentId = String(request?.studentId || '').trim();
    const mockExamId = normalizeMockExamId(request?.mockExamId);
    const targetTaskKeys = Array.from(new Set(
      (Array.isArray(request?.targetTaskKeys) ? request.targetTaskKeys : [])
        .map((taskKey) => String(taskKey || '').trim())
        .filter(Boolean)
    ));
    if (!targetStudentId || !mockExamId || targetTaskKeys.length === 0) return;
    setActiveStudentId(targetStudentId);
    setPendingHomeworkPrefill({
      id: `${Date.now()}-${mockExamId}`,
      studentId: targetStudentId,
      mockExamId,
      mockExamTitle: String(request?.mockExamTitle || '').trim(),
      mode: normalizeAssignedMockExamMode(request?.mode),
      targetTaskKeys,
      source: 'mock-analysis',
    });
    navigateToView('schedule');
    setMenuOpen(false);
  }, [navigateToView, user.role]);

  const handleAddToHomeworkLessonBasket = useCallback((request) => {
    if (user.role !== 'teacher') return;
    const targetStudentId = normalizeTeacherStudentId(request?.studentId || activeStudentId);
    if (!targetStudentId) {
      setHomeworkLessonBasketNotice({
        id: Date.now(),
        tone: 'error',
        text: 'Сначала выберите ученика.',
      });
      return;
    }
    const alreadyAdded = hasHomeworkLessonBasketItem(
      homeworkLessonBaskets,
      targetStudentId,
      request
    );
    setHomeworkLessonBaskets((current) => (
      addHomeworkLessonBasketItem(current, targetStudentId, request)
    ));
    const questionLabel = Number.isFinite(Number(request?.questionNumber))
      ? `№${Math.trunc(Number(request.questionNumber))}`
      : 'Задание';
    setHomeworkLessonBasketNotice({
      id: Date.now(),
      tone: 'success',
      text: alreadyAdded
        ? `${questionLabel} уже находится в черновике ДЗ.`
        : `${questionLabel} добавлен в черновик ДЗ.`,
    });
  }, [activeStudentId, homeworkLessonBaskets, user.role]);

  const handleOpenHomeworkLessonBasket = useCallback(() => {
    if (user.role !== 'teacher') return;
    const targetStudentId = normalizeTeacherStudentId(activeStudentId);
    const items = getHomeworkLessonBasketItems(homeworkLessonBaskets, targetStudentId);
    if (!targetStudentId || items.length === 0) return;
    setPendingHomeworkPrefill({
      id: `lesson-basket-${Date.now()}-${targetStudentId}`,
      source: 'lesson-basket',
      studentId: targetStudentId,
      items,
    });
    navigateToView('schedule');
    setMenuOpen(false);
  }, [activeStudentId, homeworkLessonBaskets, navigateToView, user.role]);

  const handleHomeworkPrefillHandled = useCallback((result = {}) => {
    const request = result?.request && typeof result.request === 'object'
      ? result.request
      : pendingHomeworkPrefill;
    const isLessonBasketRequest = request?.source === 'lesson-basket';
    const targetStudentId = normalizeTeacherStudentId(request?.studentId);
    if (isLessonBasketRequest && result?.consumed === true && targetStudentId) {
      setHomeworkLessonBaskets((current) => clearHomeworkLessonBasket(current, targetStudentId));
      setHomeworkLessonBasketNotice({
        id: Date.now(),
        tone: 'success',
        text: 'Задания перенесены в конструктор домашки.',
      });
    } else if (isLessonBasketRequest && result?.consumed === false) {
      const errorText = String(result?.error?.message || result?.error || '').trim();
      setHomeworkLessonBasketNotice({
        id: Date.now(),
        tone: 'error',
        text: errorText
          ? `Не удалось открыть корзину: ${errorText}`
          : 'Не удалось открыть корзину. Задания сохранены.',
      });
    }
    setPendingHomeworkPrefill(null);
  }, [pendingHomeworkPrefill]);

  const handleOpenTeacherLessonWorkspace = useCallback((targetView, studentId) => {
    if (user.role !== 'teacher') return;
    const normalizedStudentId = String(studentId || '').trim();
    if (normalizedStudentId) {
      setActiveStudentId(normalizedStudentId);
    }
    const normalizedView = String(targetView || '').trim();
    if (!normalizedView) return;
    if (normalizedView === 'call-connect') {
      setCallPanelExpanded(true);
      setCallAutoStartToken((current) => current + 1);
      navigateToView('call');
      setMenuOpen(false);
      return;
    }
    if (normalizedView === 'collab-save') {
      setCollabSaveToNotesToken(Date.now());
      navigateToView('collab');
    } else {
      navigateToView(normalizedView);
    }
    setMenuOpen(false);
  }, [navigateToView, user.role]);

  const handleOpenStudentPlatformLesson = useCallback(() => {
    if (user.role !== 'student') return;
    if (isCallViewAvailable) {
      setCallPanelExpanded(true);
      setCallAutoStartToken((current) => current + 1);
      navigateToView('call');
    } else {
      navigateToView('board');
    }
    setMenuOpen(false);
  }, [isCallViewAvailable, navigateToView, user.role]);

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
    if (testingForecast.total <= 0) {
      return {
        level: 'neutral',
        title: 'Пока нет заданий для расчёта темпа.'
      };
    }
    if (testingForecast.remaining <= 0) {
      return {
        level: 'ok',
        title: 'Все доступные задания выполнены.'
      };
    }
    if (!hasForecastDuration) {
      return {
        level: 'warn',
        title: 'Пока недостаточно решений для точного прогноза.'
      };
    }
    if (egeDeadlineStats.isOnTrack) {
      return {
        level: 'ok',
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
        title: `Сильное отставание: нужно добавить +${egeDeadlineStats.extraPerDayLabel} задания/день.`
      };
    }
    return {
      level: 'warn',
      title: `Небольшое отставание: нужно добавить +${egeDeadlineStats.extraPerDayLabel} задания/день.`
    };
  }, [egeDeadlineStats, hasForecastDuration, testingForecast.remaining, testingForecast.total]);

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
                  assignmentTier: getHomeworkGoalAssignmentTier(goal),
                  mockExamId,
                  targetTaskKeys: Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : [],
                  continuationOfHomeworkId: String(goal?.continuationOfHomeworkId || '').trim(),
                };
              }
              const normalizedTaskNumber = normalizeTaskNumber(goal?.taskNumber);
              const taskNumberValue = Number.isFinite(normalizedTaskNumber)
                ? normalizedTaskNumber
                : null;
              const isPythonGoal = taskNumberValue ? isPythonTaskNumber(taskNumberValue) : false;
              return {
                type: GOAL_TYPE_TASK,
                assignmentTier: getHomeworkGoalAssignmentTier(goal),
                taskNumber: taskNumberValue,
                levelId: isPythonGoal ? PYTHON_LEVEL_ID : (goal?.levelId || 'basic'),
                targetQuestions: Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [],
                targetQuestionIds: Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [],
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
            assignmentTier: 'required',
            taskNumber: normalizedTaskNumber,
            levelId: isPythonGoal ? PYTHON_LEVEL_ID : item.levelId,
            targetQuestions: Array.isArray(item.targetQuestions) ? item.targetQuestions : [],
            targetQuestionIds: Array.isArray(item.targetQuestionIds) ? item.targetQuestionIds : [],
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
          const mockProgress = getMockGoalProgress(mockExam, mockAttemptById[mockExamId], goal?.targetTaskKeys);
          return {
            type: GOAL_TYPE_MOCK,
            assignmentTier: getHomeworkGoalAssignmentTier(goal),
            mockExamId,
            mockExamTitle: mockExam?.title || 'Пробник',
            mode: normalizeAssignedMockExamMode(goal?.mode),
            targetTaskKeys: Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : [],
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
        const fallbackQuestionNumbers = Array.from(new Set(
          (Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [])
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)
        ));
        const fallbackQuestionIds = Array.isArray(goal?.targetQuestionIds)
          ? goal.targetQuestionIds.map((value) => String(value || '').trim())
          : [];
        const fallbackTargetDescriptors = fallbackQuestionNumbers.map((questionNumber, index) => ({
          questionNumber,
          questionId: fallbackQuestionIds[index] || '',
        }));
        const targetDescriptors = goalTestsLoaded && Array.isArray(questionsList) && questionsList.length > 0
          ? resolveHomeworkTaskTargetDescriptors(goal, questionsList)
          : fallbackTargetDescriptors;
        const targetNumbers = targetDescriptors.map((target) => target.questionNumber);
        const solvedSet = solvedMap[`${taskNumber}|${levelId}`] || new Set();
        const targetStatus = targetDescriptors.map((target) => ({
          num: target.questionNumber,
          questionId: target.questionId,
          solved: target.questionId ? solvedSet.has(String(target.questionId)) : false,
        }));
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
          assignmentTier: getHomeworkGoalAssignmentTier(goal),
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
      const requiredGoals = filteredGoals.filter((goal) => !isOptionalHomeworkGoal(goal));
      const completed = requiredGoals.length === 0 || requiredGoals.every((goal) => goal.completed);
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
  }, [user.role, user.id, goalRefreshTick, goalTestsDb, goalTestsLoaded, taskTitles]);

  useEffect(() => {
    if (user.role !== 'student') return;
    checkHomeworkPopup();
    const intervalId = setInterval(() => {
      checkHomeworkPopup();
    }, 60000);
    return () => clearInterval(intervalId);
  }, [user.role, user.id]);

  const goalGoals = Array.isArray(goalState?.goals) ? goalState.goals : [];
  const requiredGoalGoals = goalGoals.filter((goal) => !isOptionalHomeworkGoal(goal));
  const optionalGoalGoals = goalGoals.filter((goal) => isOptionalHomeworkGoal(goal));
  const orderedGoalGoals = [...requiredGoalGoals, ...optionalGoalGoals];
  const progressGoalGoals = requiredGoalGoals.length > 0 ? requiredGoalGoals : [];
  const goalCompletedCount = progressGoalGoals.filter((goal) => goal.completed).length;
  const firstGoal = requiredGoalGoals.find((goal) => !goal?.completed)
    || optionalGoalGoals.find((goal) => !goal?.completed)
    || requiredGoalGoals[0]
    || optionalGoalGoals[0]
    || null;
  const openHomeworkMockGoal = (goal) => {
    if (!goal?.mockExamId) return;
    const firstPendingTask = (goal.taskStatus || []).find((item) => !item?.solved)
      || goal.taskStatus?.[0]
      || null;
    handleOpenMockGoal(
      goal.mockExamId,
      firstPendingTask?.taskKey || firstPendingTask?.taskNumber || null,
      {
        fromHomework: true,
        mode: goal.mode,
        targetTaskKeys: goal.targetTaskKeys,
      }
    );
  };
  const goalSummaryProgressPercent = progressGoalGoals.length > 0
    ? Math.round((goalCompletedCount / progressGoalGoals.length) * 100)
    : 0;
  const goalDeadlineLabel = (() => {
    const entry = goalState?.entry;
    if (!entry) return '';
    let dueAt = new Date(entry.dueAt || '');
    if (Number.isNaN(dueAt.getTime())) {
      const issuedAt = new Date(entry.issuedAt || '');
      const days = Math.max(1, Number(entry.daysToComplete) || 7);
      if (!Number.isNaN(issuedAt.getTime())) {
        dueAt = new Date(issuedAt.getTime() + (days * 24 * 60 * 60 * 1000));
      }
    }
    if (Number.isNaN(dueAt.getTime())) {
      return `Срок: ${formatDaysText(entry.daysToComplete || 7)}`;
    }
    const dateLabel = dueAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(' г.', '');
    const timeLabel = dueAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `До ${dateLabel}, ${timeLabel}`;
  })();
  const shouldShowGoalBlock = user.role === 'student'
    && view !== 'schedule'
    && view !== 'review'
    && view !== 'collab'
    && view !== 'board'
    && view !== 'call'
    && view !== 'chat'
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

  const dismissTeacherNotif = async (note) => {
    const noteId = typeof note?.id === 'string' ? note.id.trim() : '';
    if (!noteId) return;
    if (note?.type === 'signup') {
      appendTeacherNotifHistory(note);
      const chatId = typeof note?.chatId === 'string' ? note.chatId.trim() : '';
      if (chatId) {
        dismissedSignupNotifsRef.current.set(chatId, Number(note?.unreadCount) || 0);
      }
      setTeacherSignupNotifs((prev) => prev.filter((item) => item.id !== noteId));
      return;
    }
    appendTeacherNotifHistory(note);
    setTeacherSolvedNotifs((prev) => prev.filter((item) => item.id !== noteId));
    try {
      await api.markTeacherSolvedEventsRead(user.id, [noteId]);
    } catch { /* no-op */ }
  };

  const dismissAllTeacherSolvedNotifs = async () => {
    if (user.role !== 'teacher') return;
    if (teacherSolvedBulkReadBusy) return;
    const solvedSnapshot = (Array.isArray(teacherSolvedNotifs) ? teacherSolvedNotifs : []).map((note) => ({
      ...note,
      type: 'solved',
    }));
    if (solvedSnapshot.length > 0) {
      appendTeacherNotifHistory(solvedSnapshot);
    }
    setTeacherSolvedBulkReadBusy(true);
    setTeacherSolvedNotifs([]);
    try {
      await api.markAllTeacherSolvedEventsRead(user.id);
    } catch {
      // no-op
    } finally {
      setTeacherSolvedBulkReadBusy(false);
    }
  };
  const isTeacherCommsView = PLATFORM_CHATS_ENABLED && user.role === 'teacher'
    && (view === TEACHER_COMMS_VIEW || TEACHER_COMMS_TABS.includes(view));
  const activeTeacherCommsTab = isTeacherCommsView
    ? (view === TEACHER_COMMS_VIEW ? resolveTeacherCommsTab(teacherCommsTab) : resolveTeacherCommsTab(view))
    : resolveTeacherCommsTab(teacherCommsTab);
  const isTeacherNotificationsTabOpen = isTeacherCommsView && activeTeacherCommsTab === 'notifications';
  const shouldShowRatingTour = user.role === 'student' && view === 'rating' && !hasStudentSeenRatingTour(user.id);
  const shouldShowIntroTour = user.role === 'student' && !shouldShowRatingTour && !hasStudentSeenTour(user.id);
  const studentTourActive = user.role === 'student'
    && (studentIntroTourActive || studentRatingTourActive || shouldShowIntroTour || shouldShowRatingTour);

  useEffect(() => {
    if (studentTourActive) stopGoalFlyAnimation();
  }, [studentTourActive, stopGoalFlyAnimation]);

  const telemostLessonAutoFinishLabel = telemostLessonReplay?.autoFinishAt
    ? new Date(telemostLessonReplay.autoFinishAt).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';
  const workbookAutoSyncTimeLabel = workbookAutoSyncState?.lastSyncedAt
    ? new Date(workbookAutoSyncState.lastSyncedAt).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    : '';

  return (
    <div className="app-min-h app-shell flex font-sans text-slate-900">
      {user.role === 'teacher' && isTelemostLessonReplayActive && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-3 z-[1350] flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-2xl border border-violet-200/90 bg-white/95 px-3 py-2.5 shadow-[0_16px_42px_rgba(91,33,182,0.22)] backdrop-blur-xl md:bottom-5 md:right-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-md shadow-violet-200/70">
            <Video size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-slate-800">Урок идёт в Телемосте</p>
            <p className="truncate text-[10px] font-semibold text-slate-500">
              {telemostAudioCapture.message || (telemostLessonAutoFinishLabel
                ? `Доска и код пишутся до ${telemostLessonAutoFinishLabel}`
                : 'Доска и код продолжают записываться')}
            </p>
          </div>
          <button
            type="button"
            onClick={telemostAudioCapture.status === 'recording'
              ? stopTelemostAudioCapture
              : startTelemostAudioCapture}
            disabled={telemostAudioCapture.status === 'requesting'}
            className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-extrabold transition disabled:cursor-wait disabled:opacity-60 ${
              telemostAudioCapture.status === 'recording'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
            }`}
            title="Для Телемоста браузер один раз попросит выбрать вкладку с включённым звуком"
          >
            <span className="flex items-center gap-1.5">
              <Mic size={14} />
              {telemostAudioCapture.status === 'recording'
                ? 'Звук пишется'
                : (telemostAudioCapture.status === 'requesting' ? 'Выбери вкладку…' : 'Записать звук')}
            </span>
          </button>
          <button
            type="button"
            onClick={handleFinishTelemostLesson}
            disabled={telemostLessonFinishBusy}
            className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-extrabold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60"
          >
            {telemostLessonFinishBusy ? 'Завершаю…' : 'Завершить урок'}
          </button>
        </div>
      )}
      {user.role === 'student' && workbookAutoSyncState?.status !== 'idle' && (
        <div className={`fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-3 z-[1340] flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-2xl border bg-white/95 px-3 py-2.5 shadow-[0_16px_42px_rgba(91,33,182,0.18)] backdrop-blur-xl md:bottom-5 md:right-5 ${
          workbookAutoSyncState.status === 'error' || workbookAutoSyncState.status === 'unsupported'
            ? 'border-rose-200'
            : workbookAutoSyncState.status === 'saved'
              ? 'border-emerald-200'
              : 'border-violet-200'
        }`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-md ${
            workbookAutoSyncState.status === 'error' || workbookAutoSyncState.status === 'unsupported'
              ? 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-200/70'
              : workbookAutoSyncState.status === 'saved'
                ? 'bg-gradient-to-br from-emerald-400 to-teal-600 shadow-emerald-200/70'
                : 'bg-gradient-to-br from-fuchsia-500 to-violet-600 shadow-violet-200/70'
          }`}>
            <FileSpreadsheet size={18} />
          </span>
          <div className="min-w-0 max-w-[320px]">
            <p className="truncate text-xs font-black text-slate-800">
              {workbookAutoSyncState.fileName || 'Автосохранение таблицы'}
            </p>
            <p className="truncate text-[10px] font-semibold text-slate-500">
              {workbookAutoSyncState.message}
              {workbookAutoSyncState.status === 'saved' && workbookAutoSyncTimeLabel
                ? ` · ${workbookAutoSyncTimeLabel}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={stopWorkbookAutoSync}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Остановить автосохранение таблицы"
            title="Остановить автосохранение"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {user.role === 'teacher' && telemostJoinAlerts.length > 0 && (
        <div className="telemost-join-alerts" role="region" aria-label="Переходы учеников в Телемост">
          {telemostJoinAlerts.map((alert) => {
            const requestedDate = new Date(alert.requestedAt);
            const requestedTime = Number.isFinite(requestedDate.getTime())
              ? requestedDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : '';
            return (
              <div key={alert.studentId} className="telemost-join-alert toast-enter" role="alert">
                <button
                  type="button"
                  className="telemost-join-alert__close"
                  onClick={() => dismissTelemostJoinAlert(alert.studentId)}
                  aria-label="Закрыть уведомление"
                >
                  <X size={17} />
                </button>
                <div className="telemost-join-alert__head">
                  <span className="telemost-join-alert__icon" aria-hidden="true">
                    <Video size={21} />
                  </span>
                  <div>
                    <p className="telemost-join-alert__kicker">Резервный созвон</p>
                    <h2>{alert.studentName} ждёт в Телемосте</h2>
                  </div>
                </div>
                <p className="telemost-join-alert__copy">
                  Ученик ждёт в резервной конференции. Перейдите по его персональной ссылке.
                </p>
                <div className="telemost-join-alert__actions">
                  <a
                    href={alert.telemostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      handleSelectStudent(alert.studentId);
                      applyTelemostLessonReplay({
                        ...(alert.activity || {}),
                        studentId: alert.studentId,
                        occurrenceKey: alert.occurrenceKey,
                        autoFinishAt: alert.autoFinishAt,
                        active: true,
                        mode: 'telemost',
                      });
                      api.acceptTelemostJoin(alert.studentId, alert.requestId)
                        .then((result) => applyTelemostLessonReplay(result))
                        .catch(() => {
                          // The activity poll will reconcile an expired request.
                        });
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('telemost-external-open', {
                          detail: {
                            studentId: alert.studentId,
                            occurrenceKey: alert.occurrenceKey,
                          },
                        }));
                      }
                      dismissTelemostJoinAlert(alert.studentId);
                    }}
                  >
                    <Video size={17} />
                    Открыть Телемост
                    <ExternalLink size={15} />
                  </a>
                  {requestedTime && <span>{requestedTime}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {user.role === 'teacher' && telemostJoinAlerts.length === 0 && !isTeacherNotificationsTabOpen && teacherNotifs.length > 0 && (
        <div className="fixed left-2 right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[1200] sm:left-auto sm:right-4 sm:top-4 sm:w-full sm:max-w-[360px]">
          <div className="surface-panel rounded-2xl px-3 py-3 text-sm text-slate-700 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Новые уведомления</div>
                <div className="text-[11px] text-slate-500">{`Сейчас: ${teacherNotifs.length}`}</div>
              </div>
              {teacherSolvedNotifs.length > 0 && (
                <button
                  type="button"
                  onClick={dismissAllTeacherSolvedNotifs}
                  disabled={teacherSolvedBulkReadBusy}
                  className="rounded-xl border border-purple-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {teacherSolvedBulkReadBusy ? 'Закрываю...' : 'Закрыть все решения'}
                </button>
              )}
            </div>
            <div className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto pr-1">
              {teacherNotifs.map((note) => {
                const signupUnreadLabel = note.unreadCount > 1
                  ? `Новых сообщений: ${note.unreadCount}`
                  : 'Новое сообщение';
                const timestampLabel = formatTeacherNotifTimestamp(note.timestampMs);
                const solvedKicker = getTeacherSolvedNotifKicker(note);
                const solvedSummary = getTeacherSolvedNotifSummary(note);
                return (
                  <div key={note.id} className="toast-enter relative rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <button
                      type="button"
                      onClick={() => dismissTeacherNotif(note)}
                      className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                      aria-label="Закрыть уведомление"
                    >
                      <X size={16} />
                    </button>
                    {note.type === 'signup' ? (
                      <>
                        <div className="text-xs font-bold uppercase tracking-widest text-indigo-500">Новое сообщение</div>
                        <div className="mt-1 font-semibold text-gray-900 truncate">
                          {note.guestName || 'Новая заявка'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {note.preview ? `${signupUnreadLabel}: ${note.preview}` : signupUnreadLabel}
                        </div>
                        {timestampLabel && (
                          <div className="mt-1 text-[11px] text-gray-400">{timestampLabel}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-bold uppercase tracking-widest text-purple-500">{solvedKicker}</div>
                        <div className="mt-1 font-semibold text-gray-900 truncate">
                          {getTeacherNotifStudentLabel(note)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {solvedSummary}
                        </div>
                        {timestampLabel && (
                          <div className="mt-1 text-[11px] text-gray-400">{timestampLabel}</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {user.role === 'student' && !studentTourActive && (
        <StudentNotificationsCenter
          user={user}
          onOpenMockExam={handleOpenMockGoal}
          chatUnreadCount={studentChatNavUnreadTotal}
          onOpenChat={PLATFORM_CHATS_ENABLED ? () => navigateToView('chat') : null}
          onStudentCoinsChange={(nextCoinsTotal) => setStudentCoinsTotal(normalizeCoinsTotal(nextCoinsTotal))}
          theme={theme}
          onGiftCoinsClaim={({ coinsGained, coinsTotal, sourceRect }) => {
            handleXpGain({
              xpTotal: _STUDENT_XP_TOTAL,
              xpGained: 0,
              coinsGained,
              coinsTotal,
              sourceRect,
            });
          }}
        />
      )}
      {user.role === 'student' && !studentTourActive && (
        <StudentWeeklyRecap
          key={`weekly-recap-auto-${user.id}`}
          studentId={user.id}
          tasks={weeklyRecapTasks}
          solvedRefreshKey={goalRefreshTick}
          onOpenLesson={(lesson) => handleGlobalOpenLesson(lesson?.key)}
          showTrigger={false}
          autoReveal
        />
      )}
      <StudentPaymentReminder
        key={`payment-reminder-${user.id}`}
        enabled={user.role === 'student' && !studentTourActive}
        studentId={user.id}
        onOpenSchedule={() => {
          navigateToView('schedule');
          setMenuOpen(false);
        }}
      />
      {user.role === 'student' && xpDockVisible && (
        <div className="xp-flight-dock-shell">
          <div className={`xp-flight-dock ${xpAnimationActive ? 'xp-flight-dock--active' : ''}`}>
            <div className="xp-flight-dock-level">{currentLevel}</div>
            <div className="min-w-0 flex-1">
              <div className="xp-flight-dock-meta">
                <span>{`${xpIntoLevelLabel}/${xpPerLevelLabel} XP`}</span>
                <div className="xp-flight-dock-meta-right">
                  <span>{`${totalXpLabel} XP`}</span>
                  <span
                    ref={coinDockBadgeRef}
                    className="xp-flight-dock-coin"
                    data-coin-balance-target="dock"
                    title={`Монеты Python: ${totalCoinsLabel}`}
                  >
                    <CoinGuideIcon />
                    <span>{totalCoinsLabel}</span>
                  </span>
                </div>
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
      {user.role === 'student' && coinFlightCoins.length > 0 && (
        <div className="xp-flight-overlay" aria-hidden="true">
          {coinFlightCoins.map((coin) => (
            <span
              key={coin.id}
              className="coin-flight-item"
              style={{
                '--coin-size': `${coin.sizePx}px`,
                '--coin-delay': `${coin.delayMs}ms`,
                '--coin-duration': `${coin.durationMs}ms`,
                '--coin-start-x': `${coin.startX}px`,
                '--coin-start-y': `${coin.startY}px`,
                '--coin-mid-x': `${coin.midX}px`,
                '--coin-mid-y': `${coin.midY}px`,
                '--coin-end-x': `${coin.endX}px`,
                '--coin-end-y': `${coin.endY}px`,
                '--coin-rotate': `${coin.rotateDeg}deg`,
              }}
            >
              <img src={ivanCoin} alt="" aria-hidden="true" draggable="false" />
            </span>
          ))}
        </div>
      )}
      {!studentTourActive && streakPopup.open && (
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
      {!studentTourActive && levelUpPopup.open && (
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
      {user.role === 'student' && !studentTourActive && paceForecastPopupOpen && (
        <div
          className="pace-forecast-overlay"
          onClick={closePaceForecastPopup}
        >
          <section
            id="pace-forecast-dialog"
            ref={paceForecastDialogRef}
            className={`pace-forecast-dialog pace-forecast-dialog--${paceBadgeState.level}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handlePaceForecastDialogKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pace-forecast-title"
            aria-describedby="pace-forecast-description"
            tabIndex={-1}
          >
            <header className="pace-forecast-header">
              <div className="pace-forecast-header__icon" aria-hidden="true">
                <BarChart2 size={19} />
              </div>
              <div className="pace-forecast-header__copy">
                <div className="pace-forecast-header__eyebrow">Прогноз подготовки</div>
                <h2 id="pace-forecast-title">Темп и срок подготовки</h2>
                <p id="pace-forecast-description">
                  {solvedPerDayStats.periodDays > 0
                    ? `По решениям за последние ${formatDaysText(solvedPerDayStats.periodDays)}`
                    : 'По текущей активности в заданиях'}
                </p>
              </div>
              <button
                type="button"
                onClick={closePaceForecastPopup}
                className="pace-forecast-close"
                aria-label="Закрыть прогноз"
              >
                <X size={17} />
              </button>
            </header>

            <div className="pace-forecast-body">
              <section className="pace-forecast-overview" aria-label="Прогресс по заданиям">
                <div className="pace-forecast-overview__top">
                  <div>
                    <span>Выполнено</span>
                    <strong>{`${testingForecast.solved} из ${testingForecast.total} заданий`}</strong>
                  </div>
                  <strong className="pace-forecast-overview__percent">{`${testingCompletionPercent}%`}</strong>
                </div>
                <div
                  className="pace-forecast-progress-track"
                  role="progressbar"
                  aria-label="Выполнено заданий"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={testingCompletionPercent}
                >
                  <div
                    className="pace-forecast-progress-fill"
                    style={{ width: `${testingCompletionPercent}%` }}
                  />
                </div>
                <div className="pace-forecast-stats" role="list">
                  <div role="listitem">
                    <span>Всего</span>
                    <strong>{testingForecast.total}</strong>
                  </div>
                  <div role="listitem">
                    <span>Решено</span>
                    <strong>{testingForecast.solved}</strong>
                  </div>
                  <div role="listitem">
                    <span>Осталось</span>
                    <strong>{testingForecast.remaining}</strong>
                  </div>
                </div>
              </section>

              <section className="pace-forecast-result" aria-label="Прогноз завершения">
                <div className="pace-forecast-result__kicker">
                  <Calendar size={15} aria-hidden="true" />
                  <span>Прогноз завершения</span>
                </div>
                {hasForecastDuration ? (
                  <>
                    <div className="pace-forecast-result__duration">{testingForecastDurationText}</div>
                    <p>
                      Если сохранять темп, текущий список будет завершён
                      {' '}<strong>{`примерно к ${testingForecastFinishDateLabel}`}</strong>.
                    </p>
                    <div className="pace-forecast-result__meta">
                      <span>{`≈ ${formatDaysText(testingForecast.daysToFinish)}`}</span>
                      <span>{`${averageSolvedPerDayLabel} задания/день`}</span>
                    </div>
                  </>
                ) : (
                  <p className="pace-forecast-result__empty">{testingForecastText}</p>
                )}
              </section>

              {shouldShowEgeDeadlineHint && (
                <section className={`pace-forecast-goal pace-forecast-goal--${egeDeadlineStats.isOnTrack ? 'ok' : 'warn'}`}>
                  <div className="pace-forecast-goal__header">
                    <div className="pace-forecast-goal__icon" aria-hidden="true">
                      <Target size={17} />
                    </div>
                    <div className="pace-forecast-goal__title">
                      <span>Цель подготовки</span>
                      <strong>{`До ${egeDeadlineStats.deadlineLabel}`}</strong>
                    </div>
                    <span className="pace-forecast-goal__status">
                      {egeDeadlineStats.isOnTrack
                        ? <CheckCircle size={14} aria-hidden="true" />
                        : <AlertTriangle size={14} aria-hidden="true" />}
                      {egeDeadlineStats.isOnTrack ? 'Успеваете' : 'Нужно ускориться'}
                    </span>
                  </div>
                  <div className="pace-forecast-goal__metrics">
                    <div>
                      <span>Ваш темп</span>
                      <strong>{averageSolvedPerDayLabel}<small>/день</small></strong>
                    </div>
                    <div>
                      <span>Для цели достаточно</span>
                      <strong>{egeDeadlineStats.requiredPerDayLabel}<small>/день</small></strong>
                    </div>
                  </div>
                  <p className="pace-forecast-goal__summary">
                    {egeDeadlineStats.isOnTrack
                      ? `Текущего темпа достаточно. Запас — ${egeDeadlineStats.bufferPerDayLabel} задания/день.`
                      : `Чтобы успеть, добавьте ${egeDeadlineStats.extraPerDayLabel} задания/день.`}
                  </p>
                </section>
              )}
            </div>

            <footer className="pace-forecast-actions">
              <button
                type="button"
                onClick={handleOpenProgressFromForecast}
                className="pace-forecast-action pace-forecast-action--primary"
              >
                <span>Перейти к тестам</span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={closePaceForecastPopup}
                className="pace-forecast-action pace-forecast-action--secondary"
              >
                Закрыть
              </button>
            </footer>
          </section>
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
        enabled={!shouldShowRatingTour}
        onActiveChange={setStudentIntroTourActive}
        onFinish={() => checkHomeworkPopup()}
      />
      {user.role === 'student' && view === 'rating' && (
        <StudentTour
          user={user}
          view={view}
          setView={navigateToView}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          steps={STUDENT_RATING_TOUR_STEPS}
          hasSeenTour={hasStudentSeenRatingTour}
          markSeenTour={markStudentSeenRatingTour}
          mascotImages={MASCOT_IMAGES}
          defaultMascot={mascotGreetings}
          enabled={view === 'rating'}
          onActiveChange={setStudentRatingTourActive}
        />
      )}
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
      {user.role === 'teacher' && activeStudentId && activeHomeworkLessonBasketItems.length > 0 && (
        <button
          type="button"
          onClick={handleOpenHomeworkLessonBasket}
          disabled={pendingHomeworkPrefill?.source === 'lesson-basket'}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-3 z-40 inline-flex min-h-12 max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-2xl border border-purple-300/80 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 px-3.5 py-2.5 text-left text-white shadow-[0_16px_38px_rgba(124,58,237,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(124,58,237,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 md:bottom-6 md:right-6 md:px-4"
          aria-label={`Открыть черновик домашки: ${activeHomeworkLessonBasketItems.length} заданий`}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/15 shadow-inner">
            <ListPlus size={19} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-purple-100">
              {activeHomeworkLessonBasketStudent
                ? getStudentLabel(activeHomeworkLessonBasketStudent)
                : 'Черновик домашки'}
            </span>
            <strong className="block truncate text-sm font-black leading-tight">
              {`В черновике ДЗ: ${activeHomeworkLessonBasketItems.length}`}
            </strong>
          </span>
          <ChevronRight size={18} className="shrink-0" aria-hidden="true" />
        </button>
      )}
      {homeworkLessonBasketNotice && (
        <div
          key={homeworkLessonBasketNotice.id}
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 top-[calc(env(safe-area-inset-top)+1rem)] z-[90] w-[min(92vw,430px)] -translate-x-1/2 rounded-2xl border px-4 py-3 text-center text-sm font-bold shadow-2xl backdrop-blur-md ${
            homeworkLessonBasketNotice.tone === 'error'
              ? 'border-rose-200 bg-rose-50/95 text-rose-700'
              : 'border-emerald-200 bg-emerald-50/95 text-emerald-800'
          }`}
        >
          {homeworkLessonBasketNotice.text}
        </div>
      )}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleAvatarFile(file);
        }}
      />
      <div
        className={`sidebar-frame hidden md:block md:sticky md:top-0 z-40 app-h shrink-0 overflow-hidden transition-all duration-300 ease-out ${
          desktopNavCollapsed ? 'w-0' : 'sidebar-frame--open w-64 lg:w-72'
        }`}
      >
        <aside
          className={`h-full w-64 lg:w-72 sidebar-shell rounded-none overflow-hidden transition-transform duration-300 ease-out ${
            desktopNavCollapsed ? '-translate-x-full' : 'translate-x-0'
          }`}
          aria-hidden={desktopNavCollapsed}
          inert={desktopNavCollapsed}
        >
          <div className="relative flex h-full flex-col">
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="sidebar-aurora sidebar-aurora--top" />
              <div className="sidebar-aurora sidebar-aurora--bottom" />
              <div className="sidebar-grid" />
            </div>
            <div className="sidebar-top relative px-5 py-4 border-b border-white/65 bg-white/55 backdrop-blur-xl">
              <button
                type="button"
                className="sidebar-brand-home hidden md:flex items-center gap-3 pr-12 text-left"
                onClick={() => {
                  setView(user.role === 'admin' ? 'admin' : 'schedule');
                  setMenuOpen(false);
                }}
                aria-label="Вернуться на главную"
                title="На главную"
              >
                <div className="sidebar-brand-mark relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-500 text-white shadow-lg shadow-purple-300/40 ring-1 ring-white/70 font-display text-base font-bold tracking-tight">
                  100
                  <span className="sidebar-brand-dot absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white/90" />
                </div>
                <div className="min-w-0">
                  <div className="sidebar-brand-title font-display text-lg font-bold text-slate-900">Иван на сотку</div>
                  <div className="sidebar-brand-subtitle text-[10px] font-semibold uppercase tracking-[0.14em] text-purple-700/80">Личный профиль</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDesktopNavCollapsed(true)}
                className="sidebar-collapse-btn absolute right-3 top-1/2 -translate-y-1/2"
                aria-label="Свернуть панель навигации"
                title="Свернуть панель"
              >
                <ChevronsLeft size={16} />
              </button>
            </div>
            <nav className={`flex-1 px-4 pb-7 pr-2 pt-5 overflow-y-auto sidebar-nav ${user.role === 'student' ? 'sidebar-nav--student' : ''}`} data-tour="nav">
              <div className="sidebar-nav-title mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500/85">
                {user.role === 'student' ? 'Главное' : 'Навигация'}
              </div>
              <div className="space-y-2.5 sidebar-nav-stack">
                {desktopPrimaryNav.map((n, idx) => {
                  const isLessonButton = n.id === 'lesson';
                  const isActive = isLessonButton ? lessonQuickNavIds.includes(view) : view === n.id;
                  const isFeatured = Boolean(n.featured);
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        navigateToView(n.id);
                        setMenuOpen(false);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      data-tour={n.id === 'rating' ? 'rating-nav' : undefined}
                      data-nav-tone={getNavTone(n.id)}
                      style={{ '--item-index': idx }}
                      className={`sidebar-nav-item ${user.role === 'student' ? 'sidebar-nav-item--primary' : ''} ${isFeatured ? 'sidebar-nav-item--featured' : ''} group relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ease-out ${
                        isActive
                          ? (isFeatured
                            ? 'is-active border-amber-300 bg-gradient-to-br from-amber-100 via-white to-yellow-50 text-slate-950 shadow-[0_18px_36px_rgba(245,158,11,0.28)] ring-1 ring-amber-200/80'
                            : 'is-active border-purple-200/80 bg-white text-slate-900 shadow-[0_16px_30px_rgba(124,58,237,0.16)]')
                          : (isFeatured
                            ? 'border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-yellow-50 text-slate-900 shadow-[0_12px_26px_rgba(245,158,11,0.14)] hover:-translate-y-[1px] hover:border-amber-300 hover:text-slate-950 hover:shadow-[0_16px_32px_rgba(245,158,11,0.22)]'
                            : 'border-transparent text-slate-700 hover:-translate-y-[1px] hover:border-purple-200/80 hover:bg-white/92 hover:text-slate-900 hover:shadow-[0_10px_24px_rgba(148,163,184,0.24)]')
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                          className={`sidebar-nav-icon grid h-10 w-10 place-items-center rounded-xl border transition-all duration-200 ${
                            isActive
                              ? (isFeatured
                                ? 'is-active border-amber-300 bg-gradient-to-br from-amber-300 to-yellow-200 text-slate-950 shadow-sm shadow-amber-200/70'
                                : 'is-active bg-gradient-to-br from-violet-100 to-fuchsia-100 text-purple-700 border-purple-200/90 shadow-sm shadow-purple-200/60')
                              : (isFeatured
                                ? 'border-amber-200 bg-gradient-to-br from-amber-100 to-yellow-50 text-amber-700 group-hover:border-amber-300 group-hover:bg-amber-100'
                                : 'bg-white/85 text-purple-600 border-purple-100/80 group-hover:bg-white group-hover:border-purple-200/70')
                          }`}
                        >
                          <n.icon size={18} />
                        </span>
                        <span className="min-w-0">
                          <span className="sidebar-nav-label block whitespace-nowrap text-[13px] font-semibold leading-tight md:text-sm">{n.label}</span>
                          {isFeatured && (
                            <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${
                              isActive ? 'bg-amber-300 text-slate-950' : 'bg-amber-200/75 text-amber-800'
                            }`}>
                              Главное
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className={`sidebar-nav-arrow ml-auto flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200 ${
                          isActive
                            ? (isFeatured
                              ? 'is-active translate-x-0.5 border-amber-300 bg-amber-200 text-amber-800 opacity-100 shadow-sm shadow-amber-200/50'
                              : 'is-active translate-x-0.5 border-purple-200/80 bg-purple-100/90 text-purple-700 opacity-100 shadow-sm shadow-purple-200/50')
                            : (isFeatured
                              ? 'border-amber-200 bg-white/80 text-amber-600 opacity-100 group-hover:translate-x-0.5 group-hover:border-amber-300 group-hover:bg-amber-100'
                              : 'border-purple-100/70 bg-white/75 text-purple-400 opacity-60 group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-purple-600 group-hover:border-purple-200/70')
                        }`}
                      >
                        <ChevronRight size={14} />
                      </span>
                      {renderNavBadge(n.id, 'sidebar')}
                    </button>
                  );
                })}
              </div>
              {user.role === 'student' && studentDesktopToolNav.length > 0 && (
                <div className="sidebar-secondary-nav" role="group" aria-label="Дополнительные разделы">
                  <div className="sidebar-secondary-nav__list">
                    {studentDesktopToolNav.map((n, idx) => {
                      const isActive = view === n.id;
                      return (
                        <button
                          key={`desktop-tool-${n.id}`}
                          type="button"
                          onClick={() => {
                            navigateToView(n.id);
                            setMenuOpen(false);
                          }}
                          aria-current={isActive ? 'page' : undefined}
                          data-tour={n.id === 'rating' ? 'rating-nav' : undefined}
                          data-nav-tone={getNavTone(n.id)}
                          style={{ '--item-index': desktopPrimaryNav.length + idx }}
                          className={`sidebar-secondary-nav__item group ${isActive ? 'is-active' : ''}`}
                        >
                          <span className="sidebar-secondary-nav__icon">
                            <n.icon size={15} />
                          </span>
                          <span className="sidebar-secondary-nav__label">{n.label}</span>
                          {renderNavBadge(n.id, 'sidebar')}
                          <span className="sidebar-secondary-nav__arrow" aria-hidden="true">
                            <ChevronRight size={13} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </nav>
            <div className="sidebar-footer p-3 border-t border-white/70 bg-white/55 backdrop-blur-xl shrink-0">
              <div className="sidebar-profile-card rounded-2xl border border-white/70 bg-gradient-to-br from-white to-purple-50/75 p-3 shadow-[0_8px_18px_rgba(148,163,184,0.2)]">
                <div className="flex items-center gap-2.5">
                  {renderUserAvatar('h-9 w-9 rounded-lg text-sm', 10)}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                    <div className="mt-0.5 inline-flex items-center rounded-md border border-purple-100 bg-gradient-to-r from-violet-100 to-fuchsia-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                      {user.role === 'admin' ? 'Администратор' : (user.role === 'teacher' ? 'Преподаватель' : 'Ученик')}
                    </div>
                  </div>
                </div>
                {avatarError && (
                  <div className="mt-2 text-[10px] font-semibold text-rose-600">{avatarError}</div>
                )}
              </div>
              <button
                onClick={onLogout}
                className="sidebar-logout mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl border border-rose-200/75 bg-white/85 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:-translate-y-[1px] hover:border-rose-300 hover:bg-rose-50 hover:shadow-sm"
              >
                <LogOut size={14} /> Выйти
              </button>
            </div>
          </div>
        </aside>
      </div>
      <div
        className={`desktop-nav-fab hidden md:flex ${desktopNavCollapsed ? 'is-visible' : ''}`}
        aria-hidden={!desktopNavCollapsed}
        inert={!desktopNavCollapsed}
      >
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
          {desktopFabNav.map((n) => {
            const isLessonButton = n.id === 'lesson';
            const isActive = isLessonButton ? lessonQuickNavIds.includes(view) : view === n.id;
            const isFeatured = Boolean(n.featured);
            const isSecondary = user.role === 'student'
              && studentDesktopToolNav.some((item) => item.id === n.id);
            const isFirstSecondary = isSecondary && studentDesktopToolNav[0]?.id === n.id;
            const Icon = n.icon;
            return (
              <button
                key={`desktop-nav-fab-${n.id}`}
                type="button"
                onClick={() => {
                  navigateToView(n.id);
                  setMenuOpen(false);
                }}
                className={`desktop-nav-fab__item ${isActive ? 'is-active' : ''} ${isFeatured ? 'desktop-nav-fab__item--featured' : ''} ${isSecondary ? 'desktop-nav-fab__item--secondary' : ''} ${isFirstSecondary ? 'desktop-nav-fab__item--secondary-first' : ''}`}
                data-nav-tone={getNavTone(n.id)}
                aria-current={isActive ? 'page' : undefined}
                data-tour={n.id === 'rating' ? 'rating-nav' : undefined}
                aria-label={n.label}
                title={n.label}
              >
                <Icon size={24} />
                {renderNavBadge(n.id, 'fab')}
              </button>
            );
          })}
        </div>
      </div>
      <div className={`main-shell relative flex-1 flex flex-col app-h overflow-hidden ${desktopNavCollapsed ? 'desktop-main-shifted' : ''}${isStudentChatView ? ' main-shell--student-chat' : ''}`}>
        <header className="sticky top-0 z-20 md:hidden bg-white/85 backdrop-blur border-b border-slate-200/70 px-3.5 py-3 pt-[calc(env(safe-area-inset-top)+0.55rem)] flex justify-between items-center">
          <button
            type="button"
            className="mobile-brand-home rounded-lg text-left"
            onClick={() => {
              setView(user.role === 'admin' ? 'admin' : 'schedule');
              setMenuOpen(false);
            }}
            aria-label="Вернуться на главную"
            title="На главную"
          >
            <LogoMark className="text-lg" />
          </button>
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
              {user?.avatarDataUrl ? (
                <img src={user.avatarDataUrl} alt={user.name} className="h-6 w-6 rounded-lg object-cover" />
              ) : (
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-[11px] font-bold text-white">
                  {String(user?.name || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-xs font-semibold">Профиль</span>
            </button>
          </div>
        </header>
        <main
          ref={mainScrollRef}
          className={mainLayoutClass}
          data-tour="main"
        >
          <div className={mainContentShellClass}>
          {user.role === 'student' && !isStudentChatView && view !== 'collab' && view !== 'board' && view !== 'call' && (
            <div className="top-stats-strip mb-3 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-slate-50/85 px-2.5 py-1.5 shadow-sm sm:px-3 sm:py-2">
              <div className="flex items-center gap-1.5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-2">
                <button
                  type="button"
                  onClick={openLevelProfile}
                  className="level-progress-card student-level-summary-card min-w-0 flex-1 px-2 py-1.5 text-sm font-semibold md:min-w-[255px] md:flex-none md:px-2.5 md:py-2"
                  data-tour="level-profile-entry"
                  aria-label={`Открыть профиль. Уровень ${currentLevel}. Опыт: ${totalXpLabel} XP. Монеты Python: ${totalCoinsLabel}.`}
                  title={`Открыть профиль. Всего опыта: ${totalXpLabel} XP. Монеты Python: ${totalCoinsLabel}.`}
                >
                  <div className="level-progress-main">
                    <div className="level-progress-badge">
                      <span className="level-progress-badge-label">LVL</span>
                      <span className="level-progress-badge-number">{currentLevel}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="level-progress-head">
                        <div className="level-progress-identity">
                          <span className="level-progress-eyebrow">Ваш прогресс</span>
                          <span className="level-progress-title">{`Уровень ${currentLevel}`}</span>
                        </div>
                        <div className="level-progress-head-meta">
                          <span className="level-progress-total">
                            <strong>{totalXpLabel}</strong>
                            <span className="level-progress-total-label">XP всего</span>
                          </span>
                          <span
                            ref={coinInlineBadgeRef}
                            className="level-progress-coin"
                            data-coin-balance-target="top"
                            title={`Монеты Python: ${totalCoinsLabel}`}
                          >
                            <CoinGuideIcon />
                            <span>{totalCoinsLabel}</span>
                          </span>
                          <span className="level-progress-open" aria-hidden="true">
                            <ChevronRight size={14} />
                          </span>
                        </div>
                      </div>
                      <div
                        ref={xpInlineBarRef}
                        className={`level-progress-track ${xpAnimationActive ? 'xp-inline-bar--active' : ''}`}
                        role="progressbar"
                        aria-label={`Прогресс уровня ${currentLevel}`}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={levelProgressPercent}
                      >
                        <div
                          className="level-progress-fill transition-all duration-300"
                          style={{ width: `${levelProgressPercent}%` }}
                        >
                          {levelProgressPercent > 0 && <span className="level-progress-fill-tip" />}
                        </div>
                        <div className="level-progress-track-grid" />
                        <div className="level-progress-glass" />
                      </div>
                      <div className="level-progress-foot">
                        <span className="level-progress-foot-current">
                          <strong>{xpIntoLevelLabel}</strong>
                          {` из ${xpPerLevelLabel} XP`}
                        </span>
                        <span className="level-progress-foot-next">
                          <span className="level-progress-percent">{`${levelProgressPercent}%`}</span>
                          <span className="level-progress-remaining">
                            <strong>{`${xpRemainingLabel} XP`}</strong>
                            {` до уровня ${currentLevel + 1}`}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5 md:ml-auto md:gap-2">
                  <StudentGlobalSearch
                    studentId={user.id}
                    theme={theme}
                    tasks={tasksWithTitles}
                    pythonTasks={PYTHON_TASKS}
                    availableViews={studentSearchAvailableViews}
                    onNavigate={navigateToView}
                    onOpenTask={handleOpenTask}
                    onOpenMock={handleOpenMockGoal}
                    onOpenNotes={handleGlobalOpenNotes}
                    onOpenLesson={handleGlobalOpenLesson}
                    onJoinLesson={handleOpenStudentPlatformLesson}
                    onOpenProgressSection={handleGlobalOpenProgressSection}
                  />
                  <button
                    ref={paceForecastTriggerRef}
                    type="button"
                    onClick={openPaceForecastPopup}
                    className={`pace-forecast-trigger pace-forecast-trigger--${paceBadgeState.level}`}
                    aria-label={`Темп — ${averageSolvedPerDayLabel} задания в день. ${paceBadgeState.title} Открыть прогноз.`}
                    aria-haspopup="dialog"
                    aria-expanded={paceForecastPopupOpen}
                    aria-controls="pace-forecast-dialog"
                    title={`${paceBadgeState.title} Нажмите, чтобы открыть прогноз.`}
                  >
                    <span className="pace-forecast-trigger__icon" aria-hidden="true">
                      {paceBadgeState.level === 'ok' && <CheckCircle size={15} />}
                      {paceBadgeState.level === 'warn' && <AlertTriangle size={15} />}
                      {paceBadgeState.level === 'danger' && <AlertCircle size={15} />}
                      {paceBadgeState.level === 'neutral' && <BarChart2 size={15} />}
                    </span>
                    <span className="pace-forecast-trigger__copy">
                      <span className="pace-forecast-trigger__label">Темп</span>
                      <span className="pace-forecast-trigger__value">
                        {averageSolvedPerDayLabel}<small>/день</small>
                      </span>
                    </span>
                    <ChevronRight className="pace-forecast-trigger__chevron" size={14} aria-hidden="true" />
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
          {(user.role === 'student' || user.role === 'teacher') && lessonQuickNav.length > 1 && lessonQuickNavIds.includes(view) && (
            <div className={`lesson-quick-nav__shell ${view === 'call' ? 'lesson-quick-nav__shell--call' : ''} mb-2 rounded-2xl border border-purple-200/70 bg-white/90 p-1.5 shadow-sm`}>
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${Math.max(1, lessonQuickNav.length)}, minmax(0, 1fr))` }}
              >
                {lessonQuickNav.map((item) => {
                  const Icon = item.icon;
                  const isActive = view === item.id;
                  return (
                    <button
                      key={`lesson-quick-${item.id}`}
                      type="button"
                      onClick={() => navigateToView(item.id)}
                      className={`lesson-quick-nav__item flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'lesson-quick-nav__item--active bg-purple-600 text-white shadow-sm'
                          : 'lesson-quick-nav__item--inactive border border-purple-100 bg-white text-slate-700 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700'
                      }`}
                    >
                      <Icon size={18} />
                      <span className="truncate leading-none">{mobileNavLabels[item.id] || item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {shouldShowGoalBlock && !studentTourActive && (
            <div ref={goalSummaryFlyRef} className={`goal-summary-strip ${goalCollapsed ? 'sticky top-0 z-30 mb-4' : 'mb-4'}`}>
              {goalCollapsed ? (
                <div className={`student-goal-summary student-goal-summary--collapsed ${goalPanelAnimClass === 'goal-collapse' ? 'goal-collapse' : ''}`}>
                  <div className="student-goal-summary__collapsed-main">
                    <span className="student-goal-summary__icon" aria-hidden="true"><Target size={18} /></span>
                    <div className="min-w-0">
                      <div className="student-goal-summary__eyebrow">Домашка</div>
                      <strong className="student-goal-summary__collapsed-title">Цели к следующему уроку</strong>
                      <span className="student-goal-summary__collapsed-meta">
                        {`${goalDeadlineLabel} · ${goalCompletedCount} из ${progressGoalGoals.length}`}
                      </span>
                    </div>
                  </div>
                  <div className="student-goal-summary__collapsed-progress" aria-hidden="true">
                    <div><span style={{ width: `${goalSummaryProgressPercent}%` }} /></div>
                    <strong>{`${goalSummaryProgressPercent}%`}</strong>
                  </div>
                  <div className="student-goal-summary__collapsed-actions">
                    {firstGoal && (
                      <button
                        type="button"
                        onClick={() => {
                          if (firstGoal.type === GOAL_TYPE_MOCK) {
                            openHomeworkMockGoal(firstGoal);
                          } else {
                            handleOpenTask(firstGoal.taskNumber, firstGoal.levelId, firstGoal.targetNumbers);
                          }
                        }}
                        className="student-goal-summary__primary"
                      >
                        Продолжить <ChevronRight size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleExpandGoalBlock}
                      className="student-goal-summary__expand"
                      aria-expanded="false"
                      aria-controls="student-goal-summary-content"
                      aria-label="Развернуть домашнюю работу"
                    >
                      <span>Подробнее</span>
                      <ChevronDown size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <section id="student-goal-summary-content" className={`student-goal-summary student-goal-summary--expanded ${goalPanelAnimClass === 'goal-expand' ? 'goal-expand' : ''}`}>
                  <header className="student-goal-summary__header">
                    <div className="student-goal-summary__heading">
                      <span className="student-goal-summary__icon" aria-hidden="true"><Target size={20} /></span>
                      <div className="min-w-0">
                        <div className="student-goal-summary__eyebrow">Домашка</div>
                        <h3>Цели к следующему уроку</h3>
                        <div className="student-goal-summary__deadline">{goalDeadlineLabel}</div>
                      </div>
                    </div>
                    <div className="student-goal-summary__header-actions">
                      <span className="student-goal-summary__count"><strong>{goalCompletedCount}</strong>{` из ${progressGoalGoals.length}`}</span>
                      <button
                        type="button"
                        onClick={() => setGoalCollapsed(true)}
                        className="student-goal-summary__collapse"
                        aria-expanded="true"
                        aria-controls="student-goal-summary-content"
                        aria-label="Свернуть домашнюю работу"
                      >
                        <span>Свернуть</span>
                        <ChevronDown size={15} className="rotate-180" />
                      </button>
                    </div>
                  </header>

                  <div className="student-goal-summary__overall-progress">
                    <div className="student-goal-summary__overall-copy">
                      <span>{optionalGoalGoals.length > 0 ? 'Обязательная часть' : 'Общий прогресс'}</span>
                      <strong>{`${goalSummaryProgressPercent}%`}</strong>
                    </div>
                    <div
                      className="student-goal-summary__overall-track"
                      role="progressbar"
                      aria-label="Общий прогресс домашней работы"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={goalSummaryProgressPercent}
                    >
                      <span style={{ width: `${goalSummaryProgressPercent}%` }} />
                    </div>
                  </div>

                  <div className="student-goal-summary__list">
                    {orderedGoalGoals.map((goal, index) => {
                      if (goal.type === GOAL_TYPE_MOCK) {
                        const totalCount = Number(goal.totalCount) || 0;
                        const solvedCount = Number(goal.solvedCount) || 0;
                        const mockProgressPercent = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;
                        return (
                          <article key={`mock-${goal.mockExamId}-${index}`} className="student-goal-summary__item">
                            <div className="student-goal-summary__item-header">
                              <div className="student-goal-summary__item-copy">
                                {isOptionalHomeworkGoal(goal) && (
                                  <div className="mb-1 inline-flex rounded-full bg-fuchsia-100 px-2 py-0.5 text-[9px] font-black text-fuchsia-700">
                                    Если останутся силы
                                  </div>
                                )}
                                <div className="student-goal-summary__item-label">Пробник</div>
                                <strong>{goal.mockExamTitle || 'Пробник'}</strong>
                                <div className="student-goal-summary__item-meta">
                                  {totalCount > 0 ? `${solvedCount} из ${totalCount} заданий выполнено` : 'В пробнике пока нет заданий'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openHomeworkMockGoal(goal)}
                                className="student-goal-summary__item-action"
                              >
                                Продолжить <ChevronRight size={14} />
                              </button>
                            </div>
                            {totalCount > 0 && (
                              <div className="student-goal-summary__item-progress" aria-hidden="true">
                                <span style={{ width: `${mockProgressPercent}%` }} />
                              </div>
                            )}
                          </article>
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
                      const targetProgressPercent = targetTotal > 0 ? Math.round((targetSolved / targetTotal) * 100) : 0;

                      return (
                        <article key={`${goal.taskNumber}-${goal.levelId}-${index}`} className="student-goal-summary__item">
                          <div className="student-goal-summary__item-header">
                            <div className="student-goal-summary__item-copy">
                              {isOptionalHomeworkGoal(goal) && (
                                <div className="mb-1 inline-flex rounded-full bg-fuchsia-100 px-2 py-0.5 text-[9px] font-black text-fuchsia-700">
                                  Если останутся силы
                                </div>
                              )}
                              {isPythonGoal ? (
                                <>
                                  <div className="student-goal-summary__item-label">Python</div>
                                  <strong>{goalHeading.replace(/^Python\s*/, '')}</strong>
                                </>
                              ) : (
                                <div className="student-goal-summary__item-title-row">
                                  <strong>{`Задание ${taskDisplay}`}</strong>
                                  {goal.levelLabel && (
                                    <span className="student-goal-summary__level-pill">
                                      {isOptionalHomeworkGoal(goal) ? `Уровень: ${goal.levelLabel}` : goal.levelLabel}
                                    </span>
                                  )}
                                </div>
                              )}
                              {!isPythonGoal && (
                                <div className="student-goal-summary__item-meta">
                                  {goal.taskTitle || 'Тема не указана'}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenTask(goal.taskNumber, goal.levelId, goal.targetNumbers)}
                              className="student-goal-summary__item-action"
                            >
                              Продолжить <ChevronRight size={14} />
                            </button>
                          </div>

                          {hasTargets && (
                            <div className="student-goal-summary__targets">
                              <div className="student-goal-summary__targets-header">
                                <span>Нужно решить</span>
                                {targetTotal > 0 && <strong>{`${targetSolved}/${targetTotal}`}</strong>}
                              </div>
                              {goal.targetNumbers?.length > 0 ? (
                                <>
                                  <div className="student-goal-summary__target-list">
                                    {goal.targetStatus.map((item) => (
                                      <span
                                        key={item.num}
                                        className={`student-goal-summary__target ${
                                          item.solved
                                            ? 'student-goal-summary__target--solved'
                                            : ''
                                        }`}
                                      >
                                        №{item.num}{item.solved ? ' ✓' : ''}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="student-goal-summary__target-progress" aria-hidden="true">
                                    <span style={{ width: `${targetProgressPercent}%` }} />
                                  </div>
                                  <div className="student-goal-summary__target-progress-copy">
                                    <span>{`${targetSolved} выполнено`}</span>
                                    <strong>{`${targetProgressPercent}%`}</strong>
                                  </div>
                                </>
                              ) : (
                                <div className="student-goal-summary__all-targets">
                                  Все задания этого уровня
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
          {view === 'schedule' && user.role === 'student' && (
            <StudentTodayOverview
              studentName={user.name}
              homeworkEntry={goalState?.entry || null}
              goals={goalGoals}
              completedGoalCount={goalCompletedCount}
              chatUnreadCount={studentChatNavUnreadTotal}
              onContinueHomework={() => {
                if (!firstGoal) {
                  navigateToView('progress');
                  return;
                }
                if (firstGoal.type === GOAL_TYPE_MOCK) {
                  openHomeworkMockGoal(firstGoal);
                } else {
                  handleOpenTask(firstGoal.taskNumber, firstGoal.levelId, firstGoal.targetNumbers);
                }
              }}
              onOpenPractice={() => navigateToView('progress')}
              onOpenPython={() => navigateToView('python')}
              onOpenLesson={() => navigateToView(studentDefaultLessonView)}
              onOpenChat={PLATFORM_CHATS_ENABLED ? () => navigateToView('chat') : null}
            />
          )}
          {view === 'schedule' && (
            <ScheduleSection
              role={user.role}
              showHeader={user.role !== 'student'}
              studentId={user.id}
              students={currentStudentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
              studentsLoading={studentsLoading}
              onOpenTask={user.role === 'student' ? handleOpenTask : null}
              onOpenMockGoal={user.role === 'student' ? handleOpenMockGoal : null}
              solvedRefreshKey={goalRefreshTick}
              openLessonKey={pendingLessonCapsuleKey}
              onOpenLessonHandled={() => setPendingLessonCapsuleKey('')}
              homeworkPrefillRequest={pendingHomeworkPrefill}
              onHomeworkPrefillHandled={handleHomeworkPrefillHandled}
              progress={progress}
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
              pushSupported={pushSupported}
              pushPermission={pushPermission}
              pushEnabled={pushSubscribed}
              pushSyncing={pushSyncing}
              pushBusy={pushBusy}
              pushReady={pushReady}
              pushError={pushError}
              onTogglePush={handleTogglePush}
            />
          )}
          {view === 'review' && (user.role !== 'student' || studentCanSeeReview) && (
            <FinalReviewSection
              key={user.id}
              userId={user.id}
              role={user.role}
              theme={theme}
              activeStudentId={activeStudentId}
              students={studentsWithNicknames}
              onSelectStudent={handleSelectStudent}
              getStudentLabel={getStudentLabel}
              onOpenTask={handleOpenTask}
            />
          )}
          {view === 'teacher-calendar' && user.role === 'teacher' && (
            <TeacherCalendarSection
              teacherId={user.id}
              students={currentStudentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
              onOpenStudentWorkspace={handleOpenTeacherLessonWorkspace}
              getStudentLabel={getStudentLabel}
              pushSupported={teacherSignupNotifySupported}
              pushPermission={teacherSignupNotifyPermission}
              pushEnabled={teacherSignupNotifyEnabled}
              pushSyncing={teacherSignupNotifySyncing}
              pushBusy={teacherSignupNotifyBusy}
              pushReady={teacherSignupNotifyReady}
              pushError={teacherSignupNotifyError}
              onTogglePush={handleToggleTeacherSignupNotify}
            />
          )}
          {view === 'finance' && user.role === 'teacher' && (
            <TeacherFinanceSection
              teacherId={user.id}
              students={studentsWithNicknames}
              studentsLoading={studentsLoading}
            />
          )}
          {view === 'progress' && (
            <ProgressSection
              progress={progress}
              onUpdateProgress={(...args) => {
                onUpdateProgress(...args);
                if (user.role === 'student') setGoalRefreshTick((prev) => prev + 1);
              }}
              theme={theme}
              onThemeToggle={onThemeToggle}
              role={user.role}
              studentId={user.id}
              students={currentStudentsWithNicknames}
              tasks={tasksWithTitles}
              weeklyRecapTasks={weeklyRecapTasks}
              solvedRefreshKey={goalRefreshTick}
              onOpenLesson={(lesson) => handleGlobalOpenLesson(lesson?.key)}
              onTaskTitleUpdate={handleTaskTitleUpdate}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
              onOpenHomeworkStats={() => handleOpenHomeworkStats(
                user.role === 'student'
                  ? user
                  : currentStudentsWithNicknames.find((student) => (
                      String(student?.id || '') === String(activeStudentId || '')
                    ))
              )}
              studentsLoading={studentsLoading}
              openTask={pendingOpenTask}
              onOpenTaskHandled={() => setPendingOpenTask(null)}
              initialSection={initialProgressSection}
              sectionJumpToken={progressSectionJumpToken}
              onSectionChange={handleProgressSectionChange}
              mockNavNewCount={studentProgressNavNewTotal}
              homeworkLessonBasketItems={activeHomeworkLessonBasketItems}
              onAddToHomeworkLessonBasket={handleAddToHomeworkLessonBasket}
              onTaskStateChange={handleTaskStateChange}
              onStreakSaved={handleStreakSaved}
              onXpGain={handleXpGain}
              openMockExamId={pendingOpenMockExamId}
              onOpenMockExamHandled={handleOpenMockGoalHandled}
              onMockAttemptSaved={(_examId, attempt, meta = {}) => {
                if (user.role === 'student') {
                  setGoalRefreshTick((prev) => prev + 1);
                  const xpGained = normalizeXpTotal(attempt?.xpGained);
                  const hasXpTotal = Number.isFinite(Number(attempt?.xpTotal));
                  const coinsGained = normalizeCoinsTotal(attempt?.coinsGained);
                  const hasCoinsTotal = Number.isFinite(Number(attempt?.coinsTotal));
                  if (xpGained > 0 || coinsGained > 0 || hasXpTotal || hasCoinsTotal) {
                    handleXpGain({
                      xpTotal: hasXpTotal ? attempt.xpTotal : _STUDENT_XP_TOTAL,
                      xpGained,
                      coinsGained,
                      coinsTotal: hasCoinsTotal ? attempt.coinsTotal : undefined,
                      sourceRect: meta?.sourceRect,
                    });
                  }
                }
              }}
              onAssignMockReview={handleAssignMockReview}
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
              getLevelFromXp={getLevelFromXp}
              getLevelProgressFromXp={getLevelProgressFromXp}
              formatStreakDate={formatStreakDate}
              BLANK_LEAGUE={BLANK_LEAGUE}
              LEAGUE_TIERS={LEAGUE_TIERS}
              getLeagueAuraStyle={getLeagueAuraStyle}
              isAbsoluteOrAboveLeague={isAbsoluteOrAboveLeague}
              ABSOLUTE_AURA_CROWN_STYLE={ABSOLUTE_AURA_CROWN_STYLE}
              isLeagueAboveAbsolute={isLeagueAboveAbsolute}
              TOP_PLACE_NUMBER_DECOR={TOP_PLACE_NUMBER_DECOR}
              getTopPlaceNumberStyle={getTopPlaceNumberStyle}
              studentCoinsTotal={studentCoinsTotal}
              onStudentCoinsChange={(nextCoinsTotal) => setStudentCoinsTotal(normalizeCoinsTotal(nextCoinsTotal))}
              onStudentXpChange={(nextXpTotal) => {
                const normalizedXp = normalizeXpTotal(nextXpTotal);
                setStudentXpTotal(normalizedXp);
                setXpDisplayTotal(normalizedXp);
              }}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
              studentsLoading={studentsLoading}
              getStudentLabel={getStudentLabel}
              onOpenDirectChat={PLATFORM_CHATS_ENABLED ? handleOpenStudentDirectChat : undefined}
            />
          )}
          {view === 'python' && (
            <PythonSection
              progress={progress}
              onUpdateProgress={(...args) => {
                onUpdateProgress(...args);
                if (user.role === 'student') setGoalRefreshTick((prev) => prev + 1);
              }}
              theme={theme}
              role={user.role}
              studentId={user.id}
              teacherId={user.role === 'teacher' ? user.id : user.teacherId}
              students={currentStudentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
              studentsLoading={studentsLoading}
              openTask={pendingOpenTask}
              onOpenTaskHandled={() => setPendingOpenTask(null)}
              onTaskStateChange={handleTaskStateChange}
              homeworkLessonBasketItems={activeHomeworkLessonBasketItems}
              onAddToHomeworkLessonBasket={handleAddToHomeworkLessonBasket}
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
              theme={theme}
              withStudentId={withStudentId}
              tasks={tasksWithTitles}
              students={currentStudentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
              studentsLoading={studentsLoading}
              openSaveToNotesToken={collabSaveToNotesToken}
              onLessonReplayEvent={recordLessonReplayEvent}
            />
          )}
          {isCallViewAvailable && (
            <CallSection
              role={user.role}
              userId={user.id}
              userName={user.name}
              userAvatarDataUrl={user.avatarDataUrl}
              teacherId={user.role === 'teacher' ? user.id : user.teacherId}
              students={currentStudentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
              onRequestStudentsRefresh={refreshStudentsForPicker}
              studentsLoading={studentsLoading}
              uiMode={callUiMode}
              theme={theme}
              autoStartToken={callAutoStartToken}
              onStatusChange={setCallSessionStatus}
              onTelemostLessonStart={applyTelemostLessonReplay}
              onLessonReplayEvent={recordLessonReplayEvent}
              onLessonReplayScreenSnapshot={uploadLessonReplayScreenSnapshot}
              onLessonReplayAudioSegment={uploadLessonReplayAudioSegment}
              onRequestExpand={() => setCallPanelExpanded(true)}
              onRequestCollapse={() => setCallPanelExpanded(false)}
              onRequestOpenCall={() => navigateToView('call')}
            />
          )}
          {user.role === 'teacher' && (
            <>
              <TeacherLessonStartPrompt
                teacherId={user.id}
                students={currentStudentsWithNicknames}
                getStudentLabel={getStudentLabel}
                onOpenStudentWorkspace={handleOpenTeacherLessonWorkspace}
              />
              <TeacherLessonEndPrompt
                teacherId={user.id}
                students={currentStudentsWithNicknames}
                getStudentLabel={getStudentLabel}
              />
            </>
          )}
          {user.role === 'student' && (
            <StudentLessonJoinPrompt
              studentId={user.id}
              onOpenPlatformLesson={handleOpenStudentPlatformLesson}
              onTelemostLessonStart={applyTelemostLessonReplay}
            />
          )}
          {view === 'board' && (
            <BoardSection
              role={user.role}
              userId={user.id}
              userName={user.name}
              teacherId={user.role === 'teacher' ? user.id : user.teacherId}
              tasks={tasksWithTitles}
              students={currentStudentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
              studentsLoading={studentsLoading}
              theme={theme}
              onLessonReplayEvent={recordLessonReplayEvent}
            />
          )}
          {view === 'notes' && (
            <NotesSection
              theme={theme}
              role={user.role}
              studentId={user.id}
              students={currentStudentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
              studentsLoading={studentsLoading}
              initialLocation={requestedNotesLocation}
              initialLocationKey={notesLocationRequestKey}
              onLocationChange={handleNotesLocationChange}
              withStudentId={withStudentId}
              MOCK_TASKS={MOCK_TASKS}
              normalizeTaskNumber={normalizeTaskNumber}
              GAME_THEORY_TASK={GAME_THEORY_TASK}
              getEntrySizeBytes={getEntrySizeBytes}
              MAX_TASK_BYTES={MAX_TASK_BYTES}
              MAX_LESSON_SHARED_TASK_BYTES={MAX_LESSON_SHARED_TASK_BYTES}
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
              workbookAutoSyncState={workbookAutoSyncState}
              onStartWorkbookAutoSync={startWorkbookAutoSync}
              workbookHelperState={workbookHelperState}
              onLaunchWorkbookHelper={launchWorkbookHelper}
            />
          )}
          {view === 'chat' && (
            <React.Suspense fallback={<div className="surface-panel rounded-2xl p-6 text-sm font-semibold text-slate-500">Загружаем чаты...</div>}>
              <StudentChatSection
                user={user}
                pushSupported={pushSupported}
                pushPermission={pushPermission}
                pushEnabled={pushSubscribed}
                pushSyncing={pushSyncing}
                pushBusy={pushBusy}
                pushReady={pushReady}
                pushError={pushError}
                onTogglePush={handleTogglePush}
                onOpenDirectChat={handleOpenStudentDirectChat}
                onNavigateToRating={() => navigateToView('rating')}
                openDirectChatRequest={pendingDirectChatRequest}
                onOpenDirectChatHandled={() => setPendingDirectChatRequest(null)}
                getLeagueByXp={getLeagueByXp}
                getLeagueAuraStyle={getLeagueAuraStyle}
                isAbsoluteOrAboveLeague={isAbsoluteOrAboveLeague}
                ABSOLUTE_AURA_CROWN_STYLE={ABSOLUTE_AURA_CROWN_STYLE}
                getLevelFromXp={getLevelFromXp}
                getLevelProgressFromXp={getLevelProgressFromXp}
              />
            </React.Suspense>
          )}
          {view === 'teacher' && (
            <TeacherPanel
              mode="tests"
              role={user.role}
              students={studentsWithNicknames}
              studentsLoading={studentsLoading}
              studentsError={studentsError}
              deletedStudents={deletedStudents}
              deletedStudentsLoading={deletedStudentsLoading}
              deletedStudentsError={deletedStudentsError}
              tasks={tasksWithTitles}
              activeStudentId={activeStudentId}
              onSelectStudent={handleSelectStudent}
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
              getLevelFromXp={getLevelFromXp}
              GAME_THEORY_TASK={GAME_THEORY_TASK}
              withUploadsAuthToken={withUploadsAuthToken}
              teacherSignupNotifySupported={teacherSignupNotifySupported}
              teacherSignupNotifyPermission={teacherSignupNotifyPermission}
              teacherSignupNotifyEnabled={teacherSignupNotifyEnabled}
              teacherSignupNotifyBusy={teacherSignupNotifyBusy}
              teacherSignupNotifySyncing={teacherSignupNotifySyncing}
              teacherSignupNotifyReady={teacherSignupNotifyReady}
              teacherSignupNotifyStatusText={teacherSignupNotifyStatusText}
              teacherSignupNotifyError={teacherSignupNotifyError}
              onToggleTeacherSignupNotify={handleToggleTeacherSignupNotify}
            />
          )}
          {isTeacherCommsView && (
            <div className="space-y-4">
              <div className="surface-panel rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTeacherCommsTab('signup-chats')}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      activeTeacherCommsTab === 'signup-chats'
                        ? 'border-purple-500 bg-purple-600 text-white'
                        : 'border-purple-200 bg-white text-purple-700 hover:bg-purple-50'
                    }`}
                  >
                    Чаты заявок
                    {teacherSignupNotifs.length > 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        activeTeacherCommsTab === 'signup-chats'
                          ? 'bg-white/20 text-white'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {teacherSignupNotifs.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherCommsTab('student-chats')}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      activeTeacherCommsTab === 'student-chats'
                        ? 'border-purple-500 bg-purple-600 text-white'
                        : 'border-purple-200 bg-white text-purple-700 hover:bg-purple-50'
                    }`}
                  >
                    Чаты с учениками
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherCommsTab('notifications')}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      activeTeacherCommsTab === 'notifications'
                        ? 'border-purple-500 bg-purple-600 text-white'
                        : 'border-purple-200 bg-white text-purple-700 hover:bg-purple-50'
                    }`}
                  >
                    Уведомления
                    {teacherNotifs.length > 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        activeTeacherCommsTab === 'notifications'
                          ? 'bg-white/20 text-white'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {teacherNotifs.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {activeTeacherCommsTab === 'student-chats' && (
                <React.Suspense fallback={<div className="surface-panel rounded-2xl p-6 text-sm font-semibold text-slate-500">Загружаем чаты...</div>}>
                  <TeacherStudentChatsSection
                    role={user.role}
                    teacherId={user.role === 'teacher' ? user.id : null}
                    initialChatId={teacherStudentChatId}
                    notifySupported={teacherSignupNotifySupported}
                    notifyPermission={teacherSignupNotifyPermission}
                    notifyEnabled={teacherSignupNotifyEnabled}
                    notifyBusy={teacherSignupNotifyBusy}
                    notifySyncing={teacherSignupNotifySyncing}
                    notifyReady={teacherSignupNotifyReady}
                    notifyStatusText={teacherSignupNotifyStatusText}
                    notifyError={teacherSignupNotifyError}
                    onToggleNotify={handleToggleTeacherSignupNotify}
                  />
                </React.Suspense>
              )}

              {activeTeacherCommsTab === 'signup-chats' && (
                <TeacherPanel
                  mode="signup-chats"
                  initialSignupChatId={teacherSignupChatId}
                  role={user.role}
                  students={studentsWithNicknames}
                  studentsLoading={studentsLoading}
                  studentsError={studentsError}
                  deletedStudents={deletedStudents}
                  deletedStudentsLoading={deletedStudentsLoading}
                  deletedStudentsError={deletedStudentsError}
                  tasks={tasksWithTitles}
                  activeStudentId={activeStudentId}
                  onSelectStudent={handleSelectStudent}
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
                  getLevelFromXp={getLevelFromXp}
                  GAME_THEORY_TASK={GAME_THEORY_TASK}
                  withUploadsAuthToken={withUploadsAuthToken}
                  teacherSignupNotifySupported={teacherSignupNotifySupported}
                  teacherSignupNotifyPermission={teacherSignupNotifyPermission}
                  teacherSignupNotifyEnabled={teacherSignupNotifyEnabled}
                  teacherSignupNotifyBusy={teacherSignupNotifyBusy}
                  teacherSignupNotifySyncing={teacherSignupNotifySyncing}
                  teacherSignupNotifyReady={teacherSignupNotifyReady}
                  teacherSignupNotifyStatusText={teacherSignupNotifyStatusText}
                  teacherSignupNotifyError={teacherSignupNotifyError}
                  onToggleTeacherSignupNotify={handleToggleTeacherSignupNotify}
                />
              )}

              {activeTeacherCommsTab === 'notifications' && (
                <div className="space-y-4">
                  <div className="surface-panel rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Новые уведомления</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{`Сейчас: ${teacherNotifs.length}`}</div>
                      </div>
                      {teacherSolvedNotifs.length > 0 && (
                        <button
                          type="button"
                          onClick={dismissAllTeacherSolvedNotifs}
                          disabled={teacherSolvedBulkReadBusy}
                          className="rounded-xl border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {teacherSolvedBulkReadBusy ? 'Закрываю...' : 'Закрыть все решения'}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                      {teacherNotifs.length > 0 ? (
                        teacherNotifs.map((note) => {
                          const signupUnreadLabel = note.unreadCount > 1
                            ? `Новых сообщений: ${note.unreadCount}`
                            : 'Новое сообщение';
                          const timestampLabel = formatTeacherNotifTimestamp(note.timestampMs);
                          const solvedKicker = getTeacherSolvedNotifKicker(note);
                          const solvedSummary = getTeacherSolvedNotifSummary(note);
                          return (
                            <div key={`notif-view-live-${note.id}`} className="relative rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                              <button
                                type="button"
                                onClick={() => dismissTeacherNotif(note)}
                                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                                aria-label="Закрыть уведомление"
                              >
                                <X size={16} />
                              </button>
                              {note.type === 'signup' ? (
                                <>
                                  <div className="text-xs font-bold uppercase tracking-widest text-indigo-500">Новое сообщение</div>
                                  <div className="mt-1 font-semibold text-gray-900 truncate">
                                    {note.guestName || 'Новая заявка'}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {note.preview ? `${signupUnreadLabel}: ${note.preview}` : signupUnreadLabel}
                                  </div>
                                  {timestampLabel && <div className="mt-1 text-[11px] text-gray-400">{timestampLabel}</div>}
                                </>
                              ) : (
                                <>
                                  <div className="text-xs font-bold uppercase tracking-widest text-purple-500">{solvedKicker}</div>
                                  <div className="mt-1 font-semibold text-gray-900 truncate">
                                    {getTeacherNotifStudentLabel(note)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {solvedSummary}
                                  </div>
                                  {timestampLabel && <div className="mt-1 text-[11px] text-gray-400">{timestampLabel}</div>}
                                </>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-xs text-slate-500">
                          Новых уведомлений пока нет.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="surface-panel rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">История уведомлений</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{`Всего: ${teacherNotifHistory.length}`}</div>
                    <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                      {teacherNotifHistory.length > 0 ? (
                        teacherNotifHistory.map((note) => {
                          const signupUnreadLabel = note.unreadCount > 1
                            ? `Новых сообщений: ${note.unreadCount}`
                            : 'Новое сообщение';
                          const timestampLabel = formatTeacherNotifTimestamp(note.timestampMs);
                          const solvedKicker = getTeacherSolvedNotifKicker(note, true);
                          const solvedSummary = getTeacherSolvedNotifSummary(note);
                          return (
                            <div key={note.archiveId} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                              {note.type === 'signup' ? (
                                <>
                                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Сообщение</div>
                                  <div className="mt-1 font-semibold text-slate-800 truncate">
                                    {note.guestName || 'Новая заявка'}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {note.preview ? `${signupUnreadLabel}: ${note.preview}` : signupUnreadLabel}
                                  </div>
                                  {timestampLabel && <div className="mt-1 text-[11px] text-slate-400">{timestampLabel}</div>}
                                </>
                              ) : (
                                <>
                                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{solvedKicker}</div>
                                  <div className="mt-1 font-semibold text-slate-800 truncate">
                                    {getTeacherNotifStudentLabel(note)}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {solvedSummary}
                                  </div>
                                  {timestampLabel && <div className="mt-1 text-[11px] text-slate-400">{timestampLabel}</div>}
                                </>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-xs text-slate-500">
                          История пока пуста.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
        <StudentLeaderboardProfileModal
          open={user.role === 'student' && levelProfileState.open}
          row={levelProfileState.row}
          profile={levelProfileState.data}
          loading={levelProfileState.loading}
          error={levelProfileState.error}
          levelPosition={levelProfileState.levelPosition}
          weeklyPosition={levelProfileState.weeklyPosition}
          onClose={closeLevelProfile}
          onRetry={openLevelProfile}
          onOpenRating={() => {
            closeLevelProfile();
            navigateToView('rating');
          }}
          getLeagueByXp={getLeagueByXp}
          getLeagueAuraStyle={getLeagueAuraStyle}
          isAbsoluteOrAboveLeague={isAbsoluteOrAboveLeague}
          ABSOLUTE_AURA_CROWN_STYLE={ABSOLUTE_AURA_CROWN_STYLE}
          getLevelFromXp={getLevelFromXp}
          getLevelProgressFromXp={getLevelProgressFromXp}
        />
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
            aria-label="Закрыть меню"
          />
          <div className={`absolute inset-x-0 bottom-0 transition-transform duration-300 ease-out ${menuOpen ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="surface-card rounded-t-3xl border border-purple-100/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-14px_30px_rgba(15,23,42,0.22)]">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white to-purple-50/70 p-4 shadow-[0_8px_20px_rgba(148,163,184,0.2)]">
                <div className="flex items-center gap-3">
                  {renderUserAvatar('h-11 w-11 rounded-xl', 12)}
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 truncate">{user.name}</p>
                    <div className="mt-1 inline-flex items-center rounded-md bg-gradient-to-r from-violet-100 to-fuchsia-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
                      {user.role === 'admin' ? 'Администратор' : (user.role === 'teacher' ? 'Преподаватель' : 'Ученик')}
                    </div>
                  </div>
                </div>
                {avatarError && (
                  <div className="mt-2 text-xs font-semibold text-rose-600">{avatarError}</div>
                )}
              </div>
              {user.role === 'student' && studentMobileMoreNav.length > 0 && (
                <div className="mt-4 rounded-2xl border border-purple-100/75 bg-white/90 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-purple-700/80">
                    {'\u0415\u0449\u0435 \u0440\u0430\u0437\u0434\u0435\u043b\u044b'}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {studentMobileMoreNav.map((item) => {
                      const Icon = item.icon;
                      const isActive = view === item.id;
                      return (
                        <button
                          key={`mobile-more-${item.id}`}
                          type="button"
                          data-tour={item.id === 'rating' ? 'rating-nav' : undefined}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => {
                            navigateToView(item.id);
                            setMenuOpen(false);
                          }}
                          className={`relative flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                            isActive
                              ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                              : 'border-purple-100 bg-white text-slate-700 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700'
                          }`}
                        >
                          <Icon size={15} />
                          <span className="truncate leading-tight">{mobileNavLabels[item.id] || item.label}</span>
                          {renderNavBadge(item.id, 'mobile-more')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, mobileNav.length)}, minmax(0, 1fr))` }}>
              {mobileNav.map((n) => {
                const isMoreButton = n.id === 'more';
                const isLessonButton = n.id === 'lesson';
                const isActive = isMoreButton
                  ? (menuOpen || studentMobileMoreNav.some((item) => item.id === view))
                  : (isLessonButton ? studentLessonNavIds.includes(view) : view === n.id);
                const isFeatured = Boolean(n.featured);
                const Icon = n.icon;
                return (
                  <button
                    key={`mobile-nav-${n.id}`}
                    type="button"
                    data-tour={n.id === 'rating' ? 'rating-nav' : undefined}
                    data-nav-tone={getNavTone(n.id)}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => {
                      if (isMoreButton) {
                        setMenuOpen(true);
                        return;
                      }
                      navigateToView(n.id);
                      setMenuOpen(false);
                    }}
                    className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-colors ${
                      isActive
                        ? (isFeatured
                          ? 'bg-amber-400 text-slate-950 shadow-[0_8px_18px_rgba(245,158,11,0.34)]'
                          : 'bg-purple-600 text-white shadow-sm')
                        : (isFeatured
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 hover:text-amber-800'
                          : 'text-slate-600 hover:bg-purple-50 hover:text-purple-700')
                    }`}
                  >
                    <Icon size={16} />
                    <span className="truncate leading-none">
                      {(user.role === 'student' ? studentMobileNavLabels[n.id] : mobileNavLabels[n.id]) || n.label}
                    </span>
                    {renderNavBadge(n.id, 'mobile')}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
        {homeworkStatsStudentId && typeof document !== 'undefined'
          ? createPortal(
              <HomeworkStatsPage
                studentId={homeworkStatsStudentId}
                student={user.role === 'student' ? user : homeworkStatsStudent}
                role={user.role}
                theme={theme}
                onClose={handleCloseHomeworkStats}
              />,
              document.body
            )
          : null}
      </div>
    </div>
  );
};

const GAME_ROUTE_PATH = '/game';

const normalizePathname = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '/';
  const trimmed = value.trim();
  const normalized = trimmed.replace(/\/+$/, '');
  return normalized || '/';
};

const isStandaloneGameRoute = () => {
  if (typeof window === 'undefined') return false;
  return normalizePathname(window.location.pathname) === GAME_ROUTE_PATH;
};

const MainApp = () => {
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
      if (!normalized || (isNativeAppRuntime() && !normalized.authToken)) {
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

  const persistNormalizedUser = useCallback((value) => {
    const normalized = sanitizeAuthUserPayload(value);
    if (!normalized) {
      clearStoredSession();
      setUser(null);
      setProgress({});
      return null;
    }
    setUser((current) => {
      if (
        current
        && current.id === normalized.id
        && current.role === normalized.role
        && current.name === normalized.name
        && current.teacherId === normalized.teacherId
        && current.grade === normalized.grade
        && current.chatId === normalized.chatId
        && current.avatarDataUrl === normalized.avatarDataUrl
        && current.authToken === normalized.authToken
      ) {
        return current;
      }
      return normalized;
    });
    setProgress({});
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(normalized));
    }
    return normalized;
  }, []);

  const syncCurrentUserPayload = useCallback((value) => {
    const normalized = sanitizeAuthUserPayload(value);
    if (!normalized) return null;
    setUser((current) => {
      if (!current || current.id !== normalized.id || current.role !== normalized.role) {
        return current;
      }
      const next = {
        ...current,
        ...normalized,
        authToken: normalized.authToken || current.authToken,
      };
      if (
        current.name === next.name
        && current.teacherId === next.teacherId
        && current.grade === next.grade
        && current.chatId === next.chatId
        && current.avatarDataUrl === next.avatarDataUrl
        && current.authToken === next.authToken
      ) {
        return current;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(next));
      }
      return next;
    });
    return normalized;
  }, []);

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
    if (!user || user.role === 'lead') return undefined;
    let cancelled = false;
    let syncing = false;

    const syncSession = async () => {
      if (syncing) return;
      syncing = true;
      try {
        const session = await api.getCurrentSession();
        if (!cancelled) syncCurrentUserPayload(session);
      } catch (error) {
        if (!cancelled) console.error('[auth] session sync failed:', error);
      } finally {
        syncing = false;
      }
    };

    const handleVisibilitySync = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      syncSession();
    };

    syncSession();
    const intervalId = typeof window !== 'undefined'
      ? window.setInterval(syncSession, SESSION_SYNC_INTERVAL_MS)
      : null;
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleVisibilitySync);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilitySync);
    }

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleVisibilitySync);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilitySync);
      }
    };
  }, [syncCurrentUserPayload, user?.id, user?.role]);

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
    api.getStudentProgress()
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

  useEffect(() => {
    if (import.meta.env.DEV) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    let disposed = false;
    let checking = false;
    let reloadTriggered = false;

    const checkForNewClientBuild = async () => {
      if (disposed || checking || reloadTriggered) return;
      const currentFingerprint = getCurrentClientBuildFingerprint();
      if (!currentFingerprint) return;

      checking = true;
      try {
        const res = await fetch(resolveApiUrl(`/api/client-build-version?_ts=${Date.now()}`), {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        const serverFingerprint = typeof payload?.fingerprint === 'string'
          ? payload.fingerprint.trim()
          : '';
        if (!serverFingerprint) return;
        if (serverFingerprint === currentFingerprint) return;
        reloadTriggered = true;
        window.location.reload();
      } catch {
        // Ignore transient connectivity errors and try again on the next check.
      } finally {
        checking = false;
      }
    };

    checkForNewClientBuild();

    const intervalId = window.setInterval(checkForNewClientBuild, CLIENT_BUILD_CHECK_INTERVAL_MS);
    const handleVisibilityCheck = () => {
      if (document.visibilityState === 'visible') {
        checkForNewClientBuild();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityCheck);
    window.addEventListener('focus', handleVisibilityCheck);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityCheck);
      window.removeEventListener('focus', handleVisibilityCheck);
    };
  }, []);

  const handleLogin = (u) => {
    persistNormalizedUser(u);
  };

  const handleLogout = () => {
    api.logout().catch(() => {});
    clearStoredSession();
    setUser(null);
    setProgress({});
  };

  const handleUserUpdated = useCallback((value) => {
    const normalized = sanitizeAuthUserPayload(value);
    if (!normalized) return null;
    setUser(normalized);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(normalized));
    }
    return normalized;
  }, []);

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

  if (user.role === 'lead') {
    return <SignupGuestChat user={user} onLogout={handleLogout} />;
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
        onUserUpdated={handleUserUpdated}
      />
      <ThemeToggleButton theme={theme} onToggle={handleThemeToggle} className="theme-toggle--desktop" />
    </>
  );
};

const App = () => {
  if (isStandaloneGameRoute()) {
    return <MobileStrategyGame key="mobile-strategy-game-v4" />;
  }

  return <MainApp />;
};

export default App;

