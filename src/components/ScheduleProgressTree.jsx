import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Sparkles, Target, TrendingUp } from 'lucide-react';
import { Card } from './ui';

const ROADMAP_CANVAS_WIDTH = 840;
const ROADMAP_CANVAS_HEIGHT = 1040;
const ROADMAP_CANVAS_MIN_WIDTH = 820;
const ROADMAP_CANVAS_MIN_HEIGHT = 760;
const ROADMAP_CANVAS_HORIZONTAL_PADDING = 112;
const ROADMAP_CANVAS_VERTICAL_PADDING = 76;
const UNLOCK_THRESHOLD = 50;
const UNLOCK_SOUND_URL = '/sounds/user_join.mp3';

const TEXT = {
  title: '\u0414\u0435\u0440\u0435\u0432\u043e \u043d\u0430\u0432\u044b\u043a\u043e\u0432',
  collapsed: '\u041d\u0430\u0432\u044b\u043a\u0438',
  description:
    '\u0418\u0433\u0440\u043e\u0432\u043e\u0439 \u043c\u0430\u0440\u0448\u0440\u0443\u0442 \u043f\u043e \u043f\u043b\u0430\u043d\u0443 \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0438. \u041a\u043e\u0433\u0434\u0430 \u0442\u0435\u043c\u0430 \u0434\u043e\u0445\u043e\u0434\u0438\u0442 \u0434\u043e 50%+, \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0430\u044f \u0432\u0435\u0442\u043a\u0430.',
  average: '\u0421\u0440\u0435\u0434\u043d\u0438\u0439 \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441',
  completed: '\u0417\u0430\u043a\u0440\u044b\u0442\u043e',
  active: '\u0420\u0430\u0437\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u043e',
  focusBanner:
    '\u0422\u0435\u043c\u044b \u0438\u0437 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0435\u0439 \u0434\u043e\u043c\u0430\u0448\u043a\u0438 \u043f\u043e\u0434\u0441\u0432\u0435\u0447\u0435\u043d\u044b. \u041d\u043e\u0432\u0430\u044f \u0432\u0435\u0442\u043a\u0430 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438, \u043a\u043e\u0433\u0434\u0430 \u043f\u0440\u043e\u0448\u043b\u0430\u044f \u0442\u0435\u043c\u0430 \u0434\u043e\u0441\u0442\u0438\u0433\u0430\u0435\u0442 50%+.',
  group: '\u0411\u043b\u043e\u043a',
  exam: '\u0415\u0413\u042d',
  theme: '\u0422\u0435\u043c\u0430',
  openBlock: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0431\u043b\u043e\u043a',
  taskTheme: '\u0422\u0435\u043c\u0430 \u0437\u0430\u0434\u0430\u043d\u0438\u044f',
  homework: '\u0414\u043e\u043c\u0430\u0448\u043a\u0430',
  focus: '\u0444\u043e\u043a\u0443\u0441',
  legendDone: '85%+ \u0437\u0430\u043a\u0440\u044b\u0442\u043e',
  legendActive: '50%+ \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0435',
  legendIdle: '\u0437\u0430\u043a\u0440\u044b\u0442\u044b\u0435 \u0443\u0437\u043b\u044b \u0436\u0434\u0443\u0442 \u043f\u0440\u0435\u0440\u0435\u043a\u0432\u0438\u0437\u0438\u0442',
  legendFocus: '\u043f\u043e\u0434\u0441\u0432\u0435\u0442\u043a\u0430 = \u0442\u0435\u043a\u0443\u0449\u0430\u044f \u0434\u043e\u043c\u0430\u0448\u043a\u0430',
  expand: '\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c',
  collapse: '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c',
  available: '\u0433\u043e\u0442\u043e\u0432\u043e',
  locked: '\u0437\u0430\u043a\u0440\u044b\u0442\u043e',
  unlocked: '\u043d\u043e\u0432\u043e\u0435',
  revealNext: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 (\u0442\u0435\u0441\u0442)',
  revealDone: '\u0412\u0441\u0451 \u043e\u0442\u043a\u0440\u044b\u0442\u043e',
  legendHidden: '\u0441\u043a\u0440\u044b\u0442\u044b\u0435 \u0443\u0437\u043b\u044b \u043f\u043e\u044f\u0432\u043b\u044f\u044e\u0442\u0441\u044f \u043f\u043e \u043c\u0435\u0440\u0435 \u043f\u0440\u043e\u043a\u0430\u0447\u043a\u0438',
};

const clampProgress = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const shortenText = (value, maxLength = 24) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const ROADMAP_NODES = [
  { id: 'task-26', kind: 'task', taskNumbers: [26], displayLabel: '26', left: 312, top: 22, width: 96, height: 62 },
  { id: 'task-27', kind: 'task', taskNumbers: [27], displayLabel: '27', left: 312, top: 90, width: 96, height: 62 },
  { id: 'task-24', kind: 'task', taskNumbers: [24], displayLabel: '24', left: 312, top: 158, width: 96, height: 62 },
  { id: 'task-25', kind: 'task', taskNumbers: [25], displayLabel: '25', left: 312, top: 226, width: 96, height: 62 },
  { id: 'task-19-21', kind: 'task', taskNumbers: [19], displayLabel: '19-21', left: 306, top: 294, width: 108, height: 62 },
  { id: 'task-17', kind: 'task', taskNumbers: [17], displayLabel: '17', left: 312, top: 362, width: 96, height: 62 },
  { id: 'task-23', kind: 'task', taskNumbers: [23], displayLabel: '23', left: 312, top: 430, width: 96, height: 62 },
  { id: 'task-16', kind: 'task', taskNumbers: [16], displayLabel: '16', left: 312, top: 498, width: 96, height: 62 },
  { id: 'task-14', kind: 'task', taskNumbers: [14], displayLabel: '14', left: 312, top: 566, width: 96, height: 62 },
  { id: 'task-8', kind: 'task', taskNumbers: [8], displayLabel: '8', left: 312, top: 634, width: 96, height: 62 },
  { id: 'task-5', kind: 'task', taskNumbers: [5], displayLabel: '5', left: 312, top: 702, width: 96, height: 62 },
  { id: 'task-11', kind: 'task', taskNumbers: [11], displayLabel: '11', left: 312, top: 770, width: 96, height: 62 },
  { id: 'task-7', kind: 'task', taskNumbers: [7], displayLabel: '7', left: 312, top: 838, width: 96, height: 62 },
  {
    id: 'task-4',
    kind: 'task',
    taskNumbers: [4],
    displayLabel: '4',
    left: 294,
    top: 900,
    width: 132,
    height: 132,
    compactLabel: '4 \u0437\u0430\u0434\u0430\u043d\u0438\u0435',
  },

  {
    id: 'excel-start',
    kind: 'group',
    taskNumbers: [3, 18, 9, 22],
    groupLabel: 'Excel',
    title: '\u043d\u0430\u0447\u0430\u043b\u043e \u0438\u0437\u0443\u0447\u0435\u043d\u0438\u044f',
    left: 160,
    top: 690,
    width: 126,
    height: 76,
  },
  { id: 'task-3', kind: 'task', taskNumbers: [3], displayLabel: '3', left: 168, top: 622, width: 110, height: 62 },
  { id: 'task-18', kind: 'task', taskNumbers: [18], displayLabel: '18', left: 168, top: 554, width: 110, height: 62 },
  { id: 'task-9', kind: 'task', taskNumbers: [9], displayLabel: '9', left: 168, top: 486, width: 110, height: 62 },
  { id: 'task-22', kind: 'task', taskNumbers: [22], displayLabel: '22', left: 168, top: 418, width: 110, height: 62 },

  {
    id: 'python-basics',
    kind: 'group',
    taskNumbers: [101, 102, 103, 104],
    groupLabel: 'Python',
    title: '\u0432\u0432\u043e\u0434-\u0432\u044b\u0432\u043e\u0434, \u0443\u0441\u043b\u043e\u0432\u0438\u044f',
    left: 408,
    top: 690,
    width: 124,
    height: 76,
  },
  {
    id: 'python-loops',
    kind: 'group',
    taskNumbers: [105, 106, 107],
    groupLabel: 'Python',
    title: '\u0446\u0438\u043a\u043b for, \u0441\u0442\u0440\u043e\u043a\u0438',
    left: 408,
    top: 622,
    width: 124,
    height: 76,
  },
  {
    id: 'python-advanced',
    kind: 'group',
    taskNumbers: [108, 109, 110],
    groupLabel: 'Python',
    title: '\u0441\u043f\u0438\u0441\u043a\u0438, \u0444\u0443\u043d\u043a\u0446\u0438\u0438',
    left: 408,
    top: 554,
    width: 124,
    height: 76,
  },

  { id: 'task-10', kind: 'task', taskNumbers: [10], displayLabel: '10', left: 36, top: 486, width: 96, height: 62, floating: true },
  { id: 'task-2', kind: 'task', taskNumbers: [2], displayLabel: '2', left: 424, top: 418, width: 96, height: 62, floating: true },
  { id: 'task-13', kind: 'task', taskNumbers: [13], displayLabel: '13', left: 520, top: 418, width: 96, height: 62, floating: true },
  { id: 'task-12', kind: 'task', taskNumbers: [12], displayLabel: '12', left: 628, top: 486, width: 96, height: 62, floating: true },
  { id: 'task-6', kind: 'task', taskNumbers: [6], displayLabel: '6', left: 586, top: 544, width: 96, height: 62, floating: true },
  { id: 'task-1', kind: 'task', taskNumbers: [1], displayLabel: '1', left: 558, top: 632, width: 96, height: 62, floating: true },
  { id: 'task-15', kind: 'task', taskNumbers: [15], displayLabel: '15', left: 446, top: 158, width: 96, height: 62, floating: true },
];

const ROADMAP_EDGES = [
  { from: 'task-4', to: 'task-7' },
  { from: 'task-7', to: 'task-11' },
  { from: 'task-11', to: 'task-5' },
  { from: 'task-5', to: 'task-8' },
  { from: 'task-8', to: 'task-14' },
  { from: 'task-14', to: 'task-16' },
  { from: 'task-16', to: 'task-23' },
  { from: 'task-23', to: 'task-17' },
  { from: 'task-17', to: 'task-19-21' },
  { from: 'task-19-21', to: 'task-25' },
  { from: 'task-25', to: 'task-24' },
  { from: 'task-24', to: 'task-27' },
  { from: 'task-27', to: 'task-26' },

  { from: 'task-11', to: 'excel-start', branch: true },
  { from: 'excel-start', to: 'task-3' },
  { from: 'task-3', to: 'task-18' },
  { from: 'task-18', to: 'task-9' },
  { from: 'task-9', to: 'task-22' },

  { from: 'task-11', to: 'python-basics', branch: true },
  { from: 'python-basics', to: 'python-loops' },
  { from: 'python-loops', to: 'python-advanced' },
  { from: 'task-22', to: 'task-10', branch: true },
  { from: 'task-23', to: 'task-2', branch: true },
  { from: 'task-2', to: 'task-13' },
  { from: 'task-13', to: 'task-12' },
  { from: 'python-advanced', to: 'task-1', branch: true },
  { from: 'task-1', to: 'task-6' },
  { from: 'task-24', to: 'task-15', branch: true },
];

const ROADMAP_INCOMING_BY_NODE_ID = ROADMAP_EDGES.reduce((acc, edge) => {
  if (!acc[edge.to]) acc[edge.to] = [];
  acc[edge.to].push(edge.from);
  return acc;
}, {});

const ROADMAP_OUTGOING_BY_NODE_ID = ROADMAP_EDGES.reduce((acc, edge) => {
  if (!acc[edge.from]) acc[edge.from] = [];
  acc[edge.from].push(edge.to);
  return acc;
}, {});

const ROADMAP_ROOT_NODE_IDS = ROADMAP_NODES
  .filter((node) => !Array.isArray(ROADMAP_INCOMING_BY_NODE_ID[node.id]) || ROADMAP_INCOMING_BY_NODE_ID[node.id].length === 0)
  .map((node) => node.id);

const STRUCTURE_COLUMN_OFFSETS = {
  leftFar: -306,
  left: -182,
  rightNear: 176,
  rightMid: 284,
  rightFar: 392,
};

const NODE_STRUCTURE_LAYOUT = {
  'task-10': { column: 'leftFar', top: 350 },
  'excel-start': { column: 'left', top: 690 },
  'task-3': { column: 'left', top: 622 },
  'task-18': { column: 'left', top: 554 },
  'task-9': { column: 'left', top: 486 },
  'task-22': { column: 'left', top: 418 },
  'task-15': { column: 'rightNear', top: 158 },
  'task-2': { column: 'rightNear', top: 362 },
  'task-13': { column: 'rightMid', top: 294 },
  'task-12': { column: 'rightFar', top: 226 },
  'python-basics': { column: 'rightNear', top: 690 },
  'python-loops': { column: 'rightNear', top: 622 },
  'python-advanced': { column: 'rightNear', top: 554 },
  'task-1': { column: 'rightMid', top: 486 },
  'task-6': { column: 'rightFar', top: 418 },
};

const getAnchorPoint = (node, side) => {
  const centerX = node.left + (node.width / 2);
  const centerY = node.top + (node.height / 2);
  if (side === 'top') return { x: centerX, y: node.top };
  if (side === 'right') return { x: node.left + node.width, y: centerY };
  if (side === 'left') return { x: node.left, y: centerY };
  return { x: centerX, y: node.top + node.height };
};

const buildBranchPath = (fromNode, toNode) => {
  const fromCenterX = fromNode.left + (fromNode.width / 2);
  const toCenterX = toNode.left + (toNode.width / 2);
  const fromSide = toCenterX >= fromCenterX ? 'right' : 'left';
  const toSide = fromSide === 'right' ? 'left' : 'right';
  const start = getAnchorPoint(fromNode, fromSide);
  const end = getAnchorPoint(toNode, toSide);
  const directionX = end.x >= start.x ? 1 : -1;
  const deltaX = Math.abs(end.x - start.x);
  const deltaY = end.y - start.y;
  const radius = Math.max(8, Math.min(16, Math.floor(Math.min(deltaX, Math.abs(deltaY || 0)) / 3)));
  const turnX = start.x + (directionX * Math.max(22, Math.round(deltaX / 2)));

  if (Math.abs(deltaY) < 4) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  const directionY = deltaY >= 0 ? 1 : -1;

  return [
    `M ${start.x} ${start.y}`,
    `L ${turnX - (directionX * radius)} ${start.y}`,
    `Q ${turnX} ${start.y} ${turnX} ${start.y + (directionY * radius)}`,
    `L ${turnX} ${end.y - (directionY * radius)}`,
    `Q ${turnX} ${end.y} ${turnX + (directionX * radius)} ${end.y}`,
    `L ${end.x} ${end.y}`,
  ].join(' ');
};

const buildStraightPath = (fromNode, toNode) => {
  const fromCenterX = fromNode.left + (fromNode.width / 2);
  const fromCenterY = fromNode.top + (fromNode.height / 2);
  const toCenterX = toNode.left + (toNode.width / 2);
  const toCenterY = toNode.top + (toNode.height / 2);
  const deltaX = toCenterX - fromCenterX;
  const deltaY = toCenterY - fromCenterY;

  if (Math.abs(deltaX) <= 12) {
    const start = getAnchorPoint(fromNode, deltaY < 0 ? 'top' : 'bottom');
    const end = getAnchorPoint(toNode, deltaY < 0 ? 'bottom' : 'top');
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  const horizontalDominant = Math.abs(deltaX) > Math.abs(deltaY);
  const start = horizontalDominant
    ? getAnchorPoint(fromNode, deltaX > 0 ? 'right' : 'left')
    : getAnchorPoint(fromNode, deltaY < 0 ? 'top' : 'bottom');
  const end = horizontalDominant
    ? getAnchorPoint(toNode, deltaX > 0 ? 'left' : 'right')
    : getAnchorPoint(toNode, deltaY < 0 ? 'bottom' : 'top');
  const radius = 14;

  if (horizontalDominant) {
    const directionX = deltaX > 0 ? 1 : -1;
    const directionY = end.y >= start.y ? 1 : -1;
    const middleX = start.x + (directionX * Math.max(22, Math.round(Math.abs(end.x - start.x) / 2)));
    if (Math.abs(end.y - start.y) < 4) {
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }
    return [
      `M ${start.x} ${start.y}`,
      `L ${middleX - (directionX * radius)} ${start.y}`,
      `Q ${middleX} ${start.y} ${middleX} ${start.y + (directionY * radius)}`,
      `L ${middleX} ${end.y - (directionY * radius)}`,
      `Q ${middleX} ${end.y} ${middleX + (directionX * radius)} ${end.y}`,
      `L ${end.x} ${end.y}`,
    ].join(' ');
  }

  const directionY = deltaY < 0 ? -1 : 1;
  const directionX = end.x >= start.x ? 1 : -1;
  const middleY = start.y + (directionY * Math.max(22, Math.round(Math.abs(end.y - start.y) / 2)));

  return [
    `M ${start.x} ${start.y}`,
    `L ${start.x} ${middleY - (directionY * radius)}`,
    `Q ${start.x} ${middleY} ${start.x + (directionX * radius)} ${middleY}`,
    `L ${end.x - (directionX * radius)} ${middleY}`,
    `Q ${end.x} ${middleY} ${end.x} ${middleY - (directionY * radius)}`,
    `L ${end.x} ${end.y}`,
  ].join(' ');
};

const getTaskProgress = (progressMap, taskNumber) => {
  if (!progressMap || typeof progressMap !== 'object') return 0;
  const key = String(taskNumber);
  return clampProgress(progressMap?.[key] ?? progressMap?.[taskNumber]);
};

const getNodeProgress = (node, progressMap) => {
  const taskNumbers = Array.isArray(node.taskNumbers) ? node.taskNumbers : [];
  if (taskNumbers.length === 0) return 0;
  const values = taskNumbers.map((taskNumber) => getTaskProgress(progressMap, taskNumber));
  const total = values.reduce((sum, value) => sum + value, 0);
  return clampProgress(Math.round(total / values.length));
};

const getNodeState = (progress, { isFocus = false, isLocked = false, canUnlockNext = false } = {}) => {
  if (isLocked) {
    return { tone: 'locked' };
  }
  if (isFocus) {
    return { tone: 'focus' };
  }
  if (progress >= 85) {
    return { tone: 'complete' };
  }
  if (progress >= 40) {
    return { tone: 'active' };
  }
  if (canUnlockNext) {
    return { tone: 'ready' };
  }
  return { tone: 'base' };
};

const ScheduleProgressTree = ({
  progressMap = {},
  focusTaskNumbers = new Set(),
  onOpenTask = null,
  tasks = [],
  pythonTasks = [],
  defaultCollapsed = true,
  showDebugUnlockButton = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(Boolean(defaultCollapsed));
  const [debugUnlockedIds, setDebugUnlockedIds] = useState([]);
  const [recentlyUnlockedIds, setRecentlyUnlockedIds] = useState([]);
  const unlockAudioTemplateRef = useRef(null);
  const unlockTimersRef = useRef([]);
  const prevUnlockedRef = useRef(null);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => (
    () => {
      unlockTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      unlockTimersRef.current = [];
    }
  ), []);

  const playUnlockSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!unlockAudioTemplateRef.current) {
        const audio = new Audio(UNLOCK_SOUND_URL);
        audio.preload = 'auto';
        unlockAudioTemplateRef.current = audio;
      }
      const instance = unlockAudioTemplateRef.current.cloneNode();
      instance.volume = 0.18;
      instance.play().catch(() => {});
    } catch {}
  }, []);

  const classicTaskMap = useMemo(() => {
    const next = new Map();
    (Array.isArray(tasks) ? tasks : []).forEach((task) => {
      next.set(Number(task.number), task);
    });
    return next;
  }, [tasks]);

  const pythonTaskMap = useMemo(() => {
    const next = new Map();
    (Array.isArray(pythonTasks) ? pythonTasks : []).forEach((task) => {
      next.set(Number(task.number), task);
    });
    return next;
  }, [pythonTasks]);

  const uniqueTaskNumbers = useMemo(
    () => Array.from(new Set(ROADMAP_NODES.flatMap((node) => node.taskNumbers || []))),
    []
  );

  const nodeProgressById = useMemo(() => {
    const next = {};
    ROADMAP_NODES.forEach((node) => {
      next[node.id] = getNodeProgress(node, progressMap);
    });
    return next;
  }, [progressMap]);

  const autoUnlockedNodeIds = useMemo(() => {
    const unlocked = new Set(ROADMAP_ROOT_NODE_IDS);
    let changed = true;

    while (changed) {
      changed = false;
      ROADMAP_EDGES.forEach((edge) => {
        if (unlocked.has(edge.to)) return;
        if (!unlocked.has(edge.from)) return;
        if ((Number(nodeProgressById[edge.from]) || 0) < UNLOCK_THRESHOLD) return;
        unlocked.add(edge.to);
        changed = true;
      });
    }

    return ROADMAP_NODES
      .filter((node) => unlocked.has(node.id))
      .map((node) => node.id);
  }, [nodeProgressById]);

  const autoUnlockedNodeIdSet = useMemo(
    () => new Set(autoUnlockedNodeIds),
    [autoUnlockedNodeIds]
  );

  const revealedNodeIds = useMemo(() => {
    const debugUnlockedIdSet = new Set(debugUnlockedIds);
    return ROADMAP_NODES
      .filter((node) => autoUnlockedNodeIdSet.has(node.id) || debugUnlockedIdSet.has(node.id))
      .map((node) => node.id);
  }, [autoUnlockedNodeIdSet, debugUnlockedIds]);

  const revealedNodeIdSet = useMemo(
    () => new Set(revealedNodeIds),
    [revealedNodeIds]
  );

  const nextDebugUnlockId = useMemo(
    () => (
      ROADMAP_NODES.find((node) => {
        if (revealedNodeIdSet.has(node.id)) return false;
        const parents = ROADMAP_INCOMING_BY_NODE_ID[node.id] || [];
        return parents.some((parentId) => revealedNodeIdSet.has(parentId));
      })?.id || null
    ),
    [revealedNodeIdSet]
  );

  const summary = useMemo(() => {
    const values = uniqueTaskNumbers.map((taskNumber) => getTaskProgress(progressMap, taskNumber));
    const completed = values.filter((value) => value >= 85).length;
    const active = values.filter((value) => value >= 40 && value < 85).length;
    const average = values.length
      ? clampProgress(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length))
      : 0;
    const focusCount = Array.from(focusTaskNumbers || []).filter((value) => (
      uniqueTaskNumbers.includes(Number(value))
    )).length;
    return {
      total: values.length,
      completed,
      active,
      average,
      focusCount,
      unlockedCount: revealedNodeIds.length,
    };
  }, [focusTaskNumbers, progressMap, revealedNodeIds.length, uniqueTaskNumbers]);

  useEffect(() => {
    if (!prevUnlockedRef.current) {
      prevUnlockedRef.current = revealedNodeIds;
      return;
    }

    const prevSet = new Set(prevUnlockedRef.current);
    const added = revealedNodeIds.filter((id) => (
      !prevSet.has(id) && !ROADMAP_ROOT_NODE_IDS.includes(id)
    ));

    if (added.length > 0) {
      const canCelebrate = Date.now() - mountedAtRef.current > 1800;
      if (canCelebrate) {
        playUnlockSound();
        setRecentlyUnlockedIds((prev) => Array.from(new Set([...(prev || []), ...added])));
        added.forEach((id, index) => {
          const timerId = setTimeout(() => {
            setRecentlyUnlockedIds((prev) => prev.filter((entry) => entry !== id));
            unlockTimersRef.current = unlockTimersRef.current.filter((entry) => entry !== timerId);
          }, 1550 + (index * 120));
          unlockTimersRef.current.push(timerId);
        });
      }
    }

    prevUnlockedRef.current = revealedNodeIds;
  }, [playUnlockSound, revealedNodeIds]);

  const nodes = useMemo(() => (
    ROADMAP_NODES.map((node) => {
      const progress = Number(nodeProgressById[node.id]) || 0;
      const autoUnlocked = autoUnlockedNodeIdSet.has(node.id);
      const unlocked = revealedNodeIdSet.has(node.id);
      const parents = ROADMAP_INCOMING_BY_NODE_ID[node.id] || [];
      const isFocus = Array.isArray(node.taskNumbers)
        && node.taskNumbers.some((taskNumber) => focusTaskNumbers?.has(Number(taskNumber)));
      const unlockReadyParent = parents.find((parentId) => (
        revealedNodeIdSet.has(parentId) && (Number(nodeProgressById[parentId]) || 0) >= UNLOCK_THRESHOLD
      )) || null;
      const canUnlockNext = autoUnlocked && (progress >= UNLOCK_THRESHOLD) && (ROADMAP_OUTGOING_BY_NODE_ID[node.id]?.length > 0);
      const firstPendingTask = (node.taskNumbers || []).find((taskNumber) => (
        getTaskProgress(progressMap, taskNumber) < 85
      ));
      const taskNumber = Number.isFinite(firstPendingTask) ? firstPendingTask : node.taskNumbers?.[0];
      const taskMeta = classicTaskMap.get(Number(taskNumber)) || pythonTaskMap.get(Number(taskNumber)) || null;
      const title = node.kind === 'group'
        ? node.title
        : shortenText(taskMeta?.title || '', node.compactLabel ? 28 : 22);
      return {
        ...node,
        autoUnlocked,
        progress,
        unlocked,
        locked: !unlocked,
        isFocus,
        canUnlockNext,
        unlockReadyParent,
        justUnlocked: recentlyUnlockedIds.includes(node.id),
        taskNumber: Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null,
        state: getNodeState(progress, {
          isFocus,
          isLocked: !unlocked,
          canUnlockNext,
        }),
        title,
        ariaTitle: taskMeta?.title || node.title || node.displayLabel || node.groupLabel || TEXT.theme,
      };
    })
  ), [
    classicTaskMap,
    focusTaskNumbers,
    nodeProgressById,
    progressMap,
    pythonTaskMap,
    recentlyUnlockedIds,
    autoUnlockedNodeIdSet,
    revealedNodeIdSet,
  ]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => node.unlocked),
    [nodes]
  );

  const canvasMetrics = useMemo(() => {
    if (visibleNodes.length === 0) {
      return {
        width: ROADMAP_CANVAS_MIN_WIDTH,
        height: ROADMAP_CANVAS_MIN_HEIGHT,
        offsetX: 0,
        offsetY: 0,
      };
    }

    const minLeft = Math.min(...visibleNodes.map((node) => node.left));
    const minTop = Math.min(...visibleNodes.map((node) => node.top));
    const maxRight = Math.max(...visibleNodes.map((node) => node.left + node.width));
    const maxBottom = Math.max(...visibleNodes.map((node) => node.top + node.height));
    const clusterWidth = maxRight - minLeft;
    const clusterHeight = maxBottom - minTop;
    const width = Math.max(
      ROADMAP_CANVAS_MIN_WIDTH,
      Math.min(ROADMAP_CANVAS_WIDTH, Math.round(clusterWidth + (ROADMAP_CANVAS_HORIZONTAL_PADDING * 2)))
    );
    const height = Math.max(
      ROADMAP_CANVAS_MIN_HEIGHT,
      Math.min(ROADMAP_CANVAS_HEIGHT, Math.round(clusterHeight + (ROADMAP_CANVAS_VERTICAL_PADDING * 2)))
    );

    return {
      width,
      height,
      offsetX: ((width - clusterWidth) / 2) - minLeft,
      offsetY: ((height - clusterHeight) / 2) - minTop,
    };
  }, [visibleNodes]);

  const positionedNodes = useMemo(() => (
    visibleNodes.map((node) => ({
      ...node,
      baseLeft: node.left,
      baseTop: node.top,
      left: Math.round(node.left + canvasMetrics.offsetX),
      top: Math.round(node.top + canvasMetrics.offsetY),
    }))
  ), [canvasMetrics.offsetX, canvasMetrics.offsetY, visibleNodes]);

  const primaryLaneX = useMemo(() => {
    const groundedTaskNodes = positionedNodes.filter((node) => node.kind === 'task' && !node.floating);
    if (groundedTaskNodes.length === 0) return Math.round(canvasMetrics.width / 2);
    return Math.round(
      groundedTaskNodes.reduce((sum, node) => sum + node.left + (node.width / 2), 0) / groundedTaskNodes.length
    );
  }, [canvasMetrics.width, positionedNodes]);

  const structuredNodes = useMemo(() => (
    positionedNodes.map((node) => {
      const layout = NODE_STRUCTURE_LAYOUT[node.id];
      if (!layout) return node;
      const left = Math.round(primaryLaneX + STRUCTURE_COLUMN_OFFSETS[layout.column] - (node.width / 2));
      const top = Math.round(canvasMetrics.offsetY + layout.top);
      return { ...node, left, top };
    })
  ), [canvasMetrics.offsetY, positionedNodes, primaryLaneX]);

  const nodeMap = useMemo(() => {
    const next = {};
    structuredNodes.forEach((node) => {
      next[node.id] = node;
    });
    return next;
  }, [structuredNodes]);

  const summaryCards = useMemo(() => ([
    {
      key: 'average',
      label: TEXT.average,
      value: `${summary.average}%`,
      Icon: TrendingUp,
      iconClass: 'text-cyan-600',
      shellClass: 'from-cyan-50/95 via-white to-sky-50/80',
      borderClass: 'border-cyan-200/80',
      railClass: 'from-cyan-400 via-sky-500 to-violet-500',
      percent: Math.max(summary.average, 8),
    },
    {
      key: 'completed',
      label: TEXT.completed,
      value: `${summary.completed}/${summary.total}`,
      Icon: CheckCircle2,
      iconClass: 'text-emerald-600',
      shellClass: 'from-emerald-50/95 via-white to-teal-50/80',
      borderClass: 'border-emerald-200/80',
      railClass: 'from-emerald-400 via-emerald-500 to-teal-500',
      percent: summary.total > 0 ? Math.max(Math.round((summary.completed / summary.total) * 100), 8) : 8,
    },
    {
      key: 'active',
      label: TEXT.active,
      value: summary.focusCount > 0 ? `${summary.unlockedCount} / ${TEXT.focus} ${summary.focusCount}` : String(summary.unlockedCount),
      Icon: Sparkles,
      iconClass: 'text-fuchsia-600',
      shellClass: 'from-fuchsia-50/95 via-white to-violet-50/80',
      borderClass: 'border-fuchsia-200/80',
      railClass: 'from-fuchsia-400 via-violet-500 to-indigo-500',
      percent: Math.max(Math.round((summary.unlockedCount / ROADMAP_NODES.length) * 100), 10),
    },
  ]), [summary]);

  const handleForceUnlockNext = useCallback(() => {
    if (!nextDebugUnlockId) return;
    setDebugUnlockedIds((prev) => (
      prev.includes(nextDebugUnlockId) ? prev : [...prev, nextDebugUnlockId]
    ));
  }, [nextDebugUnlockId]);

  const handleOpenNode = (node) => {
    if (!node?.taskNumber || typeof onOpenTask !== 'function') return;
    onOpenTask(node.taskNumber, null, null);
  };

  if (isCollapsed) {
    return (
      <div className="flex justify-end">
        <Card className="schedule-skill-tree__panel schedule-skill-tree__panel--collapsed ml-auto w-fit border-slate-200/30 bg-white/8 !p-1 shadow-none">
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="schedule-skill-tree__collapse-chip inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-500/80 transition hover:border-cyan-200/35 hover:bg-white/12 hover:text-slate-700"
            aria-expanded="false"
            aria-label={`${TEXT.expand}: ${TEXT.title}`}
            title={TEXT.title}
          >
            <span className="schedule-skill-tree__collapse-chip-icon inline-flex h-5 w-5 items-center justify-center rounded-lg border border-white/10 bg-white/8 text-cyan-600/80">
              <Sparkles size={11} />
            </span>
            <span className="hidden sm:inline">{TEXT.collapsed}</span>
            <ChevronRight size={12} />
          </button>
        </Card>
      </div>
    );
  }

  return (
    <Card className="schedule-skill-tree__panel space-y-5 border-cyan-200/60 bg-gradient-to-br from-white via-slate-50/85 to-cyan-50/60 shadow-[0_20px_42px_rgba(14,165,233,0.12)]">
      <div className="mx-auto w-full max-w-[1180px] space-y-5">
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="schedule-skill-tree__header-icon inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-cyan-600 shadow-[0_10px_26px_rgba(56,189,248,0.14)]">
            <Sparkles size={18} />
          </span>
          <div className="space-y-1.5">
            <div className="text-lg font-bold text-slate-900 sm:text-xl">{TEXT.title}</div>
            <p className="max-w-2xl text-[13px] leading-5 text-slate-500">{TEXT.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {showDebugUnlockButton && (
            <button
              type="button"
              onClick={handleForceUnlockNext}
              disabled={!nextDebugUnlockId}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-white/80 px-3.5 py-2 text-xs font-semibold text-emerald-700 shadow-[0_10px_24px_rgba(16,185,129,0.12)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Sparkles size={14} />
              {nextDebugUnlockId ? TEXT.revealNext : TEXT.revealDone}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-2xl border border-cyan-200/80 bg-white/80 px-3.5 py-2 text-xs font-semibold text-sky-700 shadow-[0_10px_24px_rgba(14,165,233,0.12)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-sky-50"
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            {isCollapsed ? TEXT.expand : TEXT.collapse}
          </button>
        </div>
      </div>

      <div className="relative z-10 space-y-4">
      <div className="relative z-10 grid gap-2 lg:grid-cols-3">
        {summaryCards.map((item) => {
          const Icon = item.Icon;
          return (
            <div
              key={item.key}
              className={`schedule-skill-tree__summary rounded-[22px] border bg-gradient-to-br px-3.5 py-3 text-xs shadow-[0_12px_28px_rgba(15,23,42,0.06)] ${item.borderClass} ${item.shellClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="schedule-skill-tree__summary-title text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {item.label}
                  </div>
                  <div className="schedule-skill-tree__summary-value mt-1 flex items-center gap-2 text-lg font-black text-slate-900">
                    <Icon size={16} className={item.iconClass} />
                    {item.value}
                  </div>
                </div>
                <span className="schedule-skill-tree__summary-icon inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/75 shadow-sm">
                  <Icon size={15} className={item.iconClass} />
                </span>
              </div>
              <div className="schedule-skill-tree__summary-track mt-3 h-1.5 overflow-hidden rounded-full bg-white/80">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${item.railClass}`}
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {!isCollapsed && (
        <>
          {summary.focusCount > 0 && (
            <div className="schedule-skill-tree__focus-banner relative z-10 rounded-[24px] border border-fuchsia-200/70 bg-gradient-to-r from-fuchsia-50/88 via-white to-violet-50/82 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="schedule-skill-tree__focus-icon inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/85 text-fuchsia-600 shadow-[0_10px_22px_rgba(217,70,239,0.14)]">
                  <Target size={16} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-500">{TEXT.homework}</div>
                  <div className="mt-1 text-xs font-medium leading-5 text-fuchsia-800">
                    {TEXT.focusBanner}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto pb-2">
            <div className="flex justify-center">
              <div
                className="schedule-skill-tree__canvas relative shrink-0 rounded-[30px] border border-slate-200/80 bg-slate-50/80 p-4 sm:p-5"
                style={{
                  width: `${canvasMetrics.width + 40}px`,
                  backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.28) 1.2px, transparent 0)',
                  backgroundSize: '34px 34px',
                }}
              >
                <span aria-hidden="true" className="schedule-skill-tree__canvas-orb schedule-skill-tree__canvas-orb--left" />
                <span aria-hidden="true" className="schedule-skill-tree__canvas-orb schedule-skill-tree__canvas-orb--right" />

                <div
                  className="relative mx-auto"
                  style={{ width: `${canvasMetrics.width}px`, height: `${canvasMetrics.height}px` }}
                >
                  <span
                    aria-hidden="true"
                    className="schedule-skill-tree__lane schedule-skill-tree__lane--glow"
                    style={{
                      left: `${primaryLaneX}px`,
                      top: '44px',
                      height: `${Math.max(canvasMetrics.height - 88, 160)}px`,
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="schedule-skill-tree__lane"
                    style={{
                      left: `${primaryLaneX}px`,
                      top: '44px',
                      height: `${Math.max(canvasMetrics.height - 88, 160)}px`,
                    }}
                  />

                  <svg
                    className="pointer-events-none absolute inset-0"
                    width={canvasMetrics.width}
                    height={canvasMetrics.height}
                    viewBox={`0 0 ${canvasMetrics.width} ${canvasMetrics.height}`}
                    aria-hidden="true"
                  >
                    <defs>
                      <marker
                        id="schedule-roadmap-arrow"
                        markerWidth="10"
                        markerHeight="10"
                        refX="6"
                        refY="3"
                        orient="auto"
                      >
                        <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(100,116,139,0.68)" />
                      </marker>
                    </defs>
                    {ROADMAP_EDGES.map((edge) => {
                      const fromNode = nodeMap[edge.from];
                      const toNode = nodeMap[edge.to];
                      if (!fromNode || !toNode) return null;
                      const path = edge.branch
                        ? buildBranchPath(fromNode, toNode)
                        : buildStraightPath(fromNode, toNode);
                      const edgeActive = fromNode.unlocked && toNode.unlocked;
                      const edgeReady = fromNode.autoUnlocked && fromNode.progress >= UNLOCK_THRESHOLD;
                      return (
                        <g key={`${edge.from}-${edge.to}`}>
                          {(edgeActive || edgeReady) && (
                            <path
                              d={path}
                              className={`schedule-skill-tree__link-halo ${
                                edgeActive
                                  ? 'schedule-skill-tree__link-halo--active'
                                  : 'schedule-skill-tree__link-halo--ready'
                              }`}
                              fill="none"
                              stroke={edgeActive ? 'rgba(34,211,238,0.3)' : 'rgba(129,140,248,0.22)'}
                              strokeWidth={edgeActive ? '9.5' : '7.5'}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                          <path
                            d={path}
                            className={`schedule-skill-tree__link ${
                              edgeActive
                                ? 'schedule-skill-tree__link--active'
                                : (edgeReady ? 'schedule-skill-tree__link--ready' : '')
                            }`}
                            fill="none"
                            stroke={edgeActive
                              ? 'rgba(56,189,248,0.78)'
                              : (edgeReady ? 'rgba(124,58,237,0.42)' : 'rgba(100,116,139,0.22)')}
                            strokeWidth={edgeActive ? '2.6' : (edgeReady ? '2.35' : '2.15')}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray={edgeActive ? '12 10' : (edgeReady ? '10 12' : '6 10')}
                            markerEnd="url(#schedule-roadmap-arrow)"
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {structuredNodes.map((node) => {
                    const interactive = typeof onOpenTask === 'function' && Number.isFinite(node.taskNumber) && node.unlocked;
                    const nodeLabel = node.kind === 'group'
                      ? `${node.groupLabel || TEXT.group} / ${node.title}`
                      : `#${node.displayLabel}`;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => handleOpenNode(node)}
                        disabled={!interactive}
                        title={`${nodeLabel}${node.ariaTitle ? ` - ${node.ariaTitle}` : ''}`}
                        aria-label={`${nodeLabel}${node.ariaTitle ? `, ${node.ariaTitle}` : ''}, ${TEXT.average.toLowerCase()} ${node.progress}%`}
                        className={`schedule-skill-tree__node schedule-skill-tree__node--tone-${node.state.tone} absolute overflow-hidden rounded-[22px] border px-3 py-2 text-left transition duration-200 ${
                          interactive
                            ? 'cursor-pointer hover:-translate-y-0.5'
                            : (node.unlocked ? 'cursor-default' : 'cursor-not-allowed')
                        } ${
                          node.unlocked ? 'schedule-skill-tree__node--unlocked' : 'schedule-skill-tree__node--locked'
                        } ${
                          node.canUnlockNext ? 'schedule-skill-tree__node--charged' : ''
                        } ${
                          node.justUnlocked ? 'schedule-skill-tree__node--unlocking z-20' : ''
                        } ${
                          node.isFocus ? 'schedule-skill-tree__node--focus' : ''
                        } disabled:pointer-events-none`}
                        style={{
                          left: `${node.left}px`,
                          top: `${node.top}px`,
                          width: `${node.width}px`,
                          height: `${node.height}px`,
                        }}
                      >
                        {node.justUnlocked && (
                          <>
                            <span aria-hidden="true" className="schedule-skill-tree__node-burst" />
                            <span aria-hidden="true" className="schedule-skill-tree__node-burst schedule-skill-tree__node-burst--delay" />
                          </>
                        )}
                        {node.compactLabel ? (
                          <div className="relative z-10 flex h-full flex-col justify-between">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                  {TEXT.exam}
                                </div>
                                <div className="mt-1 text-[1.7rem] font-black leading-none text-slate-900">
                                  #{node.displayLabel}
                                </div>
                              </div>
                              <span className={`schedule-skill-tree__node-badge schedule-skill-tree__node-badge--${node.state.tone} inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold`}>
                                {node.justUnlocked ? <Sparkles size={10} /> : `${node.progress}%`}
                              </span>
                            </div>
                            <div className="text-sm font-bold leading-tight text-slate-800">
                              {node.compactLabel}
                            </div>
                            <div className="schedule-skill-tree__node-progress-track h-2 overflow-hidden rounded-full bg-slate-200/80">
                              <div
                                className={`schedule-skill-tree__node-progress schedule-skill-tree__node-progress--${node.state.tone} h-full rounded-full`}
                                style={{ width: `${Math.max(node.progress, 8)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="relative z-10 flex h-full flex-col">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                  {node.kind === 'group' ? (node.groupLabel || TEXT.group) : TEXT.exam}
                                </div>
                                <div className="mt-0.5 text-base font-black leading-none text-slate-900">
                                  {node.kind === 'group' ? (node.groupLabel || TEXT.group) : `#${node.displayLabel}`}
                                </div>
                              </div>
                              <span className={`schedule-skill-tree__node-badge schedule-skill-tree__node-badge--${node.state.tone} inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold`}>
                                {node.justUnlocked ? (
                                  <Sparkles size={10} />
                                ) : (
                                  `${node.progress}%`
                                )}
                              </span>
                            </div>

                            <div
                              className={`mt-1.5 ${node.kind === 'group' ? 'text-[10px] font-semibold leading-tight text-slate-700' : 'text-[10px] font-medium leading-tight text-slate-500'}`}
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: node.kind === 'group' ? 2 : 1,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {node.title || (node.kind === 'group' ? TEXT.openBlock : TEXT.taskTheme)}
                            </div>

                            <div className="schedule-skill-tree__node-progress-track mt-auto h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                              <div
                                className={`schedule-skill-tree__node-progress schedule-skill-tree__node-progress--${node.state.tone} h-full rounded-full`}
                                style={{ width: `${Math.max(node.progress, node.unlocked ? 6 : 0)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="schedule-skill-tree__legend-shell relative z-10 flex flex-wrap gap-2 rounded-[22px] border border-white/70 bg-white/60 p-2 text-[11px] text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{TEXT.legendDone}</span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">{TEXT.legendActive}</span>
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{TEXT.legendHidden}</span>
            <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 font-semibold text-fuchsia-700">{TEXT.legendFocus}</span>
          </div>
        </>
      )}
      </div>
      </div>
    </Card>
  );
};

export default ScheduleProgressTree;
