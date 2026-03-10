import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Target, TrendingUp } from 'lucide-react';
import { Card } from './ui';

const ROADMAP_CANVAS_WIDTH = 720;
const ROADMAP_CANVAS_HEIGHT = 940;

const TEXT = {
  title: '\u0414\u0435\u0440\u0435\u0432\u043e \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0438',
  description:
    '\u041c\u0430\u0440\u0448\u0440\u0443\u0442 \u043f\u043e \u0442\u0432\u043e\u0435\u043c\u0443 \u043f\u043b\u0430\u043d\u0443. \u0426\u0432\u0435\u0442 \u0443\u0437\u043b\u0430 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441, \u0430 \u0442\u0435\u043c\u044b \u0438\u0437 \u0434\u043e\u043c\u0430\u0448\u043a\u0438 \u043f\u043e\u0434\u0441\u0432\u0435\u0447\u0435\u043d\u044b \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u043e.',
  average: '\u0421\u0440\u0435\u0434\u043d\u0438\u0439 \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441',
  completed: '\u0417\u0430\u043a\u0440\u044b\u0442\u043e',
  active: '\u0412 \u0440\u0430\u0431\u043e\u0442\u0435',
  focusBanner:
    '\u0422\u0435\u043c\u044b \u0438\u0437 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0435\u0439 \u0434\u043e\u043c\u0430\u0448\u043a\u0438 \u0443\u0436\u0435 \u0432\u044b\u0434\u0435\u043b\u0435\u043d\u044b \u0432 \u0434\u0435\u0440\u0435\u0432\u0435. \u041d\u0430\u0436\u043c\u0438 \u043d\u0430 \u043f\u043e\u0434\u0441\u0432\u0435\u0447\u0435\u043d\u043d\u044b\u0439 \u0443\u0437\u0435\u043b, \u0447\u0442\u043e\u0431\u044b \u0441\u0440\u0430\u0437\u0443 \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043d\u0443\u0436\u043d\u044b\u0439 \u0431\u043b\u043e\u043a.',
  group: '\u0411\u043b\u043e\u043a',
  exam: '\u0415\u0413\u042d',
  theme: '\u0422\u0435\u043c\u0430',
  openBlock: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0431\u043b\u043e\u043a',
  taskTheme: '\u0422\u0435\u043c\u0430 \u0437\u0430\u0434\u0430\u043d\u0438\u044f',
  homework: '\u0414\u043e\u043c\u0430\u0448\u043a\u0430',
  focus: '\u0444\u043e\u043a\u0443\u0441',
  legendDone: '85%+ \u0437\u0430\u043a\u0440\u044b\u0442\u043e',
  legendActive: '40-84% \u0432 \u0440\u0430\u0431\u043e\u0442\u0435',
  legendIdle: '\u0434\u043e 39% \u0437\u043e\u043d\u0430 \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u044f',
  legendFocus: '\u043f\u043e\u0434\u0441\u0432\u0435\u0442\u043a\u0430 = \u0442\u0435\u043a\u0443\u0449\u0430\u044f \u0434\u043e\u043c\u0430\u0448\u043a\u0430',
  expand: '\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c',
  collapse: '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c',
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
    left: 288,
    top: 902,
    width: 144,
    height: 38,
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
];

const getAnchorPoint = (node, side) => {
  const centerX = node.left + (node.width / 2);
  const centerY = node.top + (node.height / 2);
  if (side === 'top') return { x: centerX, y: node.top };
  if (side === 'right') return { x: node.left + node.width, y: centerY };
  if (side === 'left') return { x: node.left, y: centerY };
  return { x: centerX, y: node.top + node.height };
};

const buildBranchPath = (fromNode, toNode) => {
  const start = getAnchorPoint(fromNode, 'top');
  const end = getAnchorPoint(toNode, 'bottom');
  const viaY = Math.min(start.y, end.y) - 26;
  const radius = 16;

  if (Math.abs(start.x - end.x) < 2) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  if (start.x < end.x) {
    return [
      `M ${start.x} ${start.y}`,
      `L ${start.x} ${viaY + radius}`,
      `Q ${start.x} ${viaY} ${start.x + radius} ${viaY}`,
      `L ${end.x - radius} ${viaY}`,
      `Q ${end.x} ${viaY} ${end.x} ${viaY + radius}`,
      `L ${end.x} ${end.y}`,
    ].join(' ');
  }

  return [
    `M ${start.x} ${start.y}`,
    `L ${start.x} ${viaY + radius}`,
    `Q ${start.x} ${viaY} ${start.x - radius} ${viaY}`,
    `L ${end.x + radius} ${viaY}`,
    `Q ${end.x} ${viaY} ${end.x} ${viaY + radius}`,
    `L ${end.x} ${end.y}`,
  ].join(' ');
};

const buildStraightPath = (fromNode, toNode) => {
  const start = getAnchorPoint(fromNode, 'top');
  const end = getAnchorPoint(toNode, 'bottom');
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
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

const getNodeState = (progress, isFocus) => {
  if (isFocus) {
    return {
      border: 'border-fuchsia-300',
      background: 'bg-gradient-to-br from-white via-fuchsia-50/90 to-violet-50/80',
      badge: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
      bar: 'bg-gradient-to-r from-fuchsia-500 via-violet-500 to-sky-500',
      glow: 'shadow-[0_18px_32px_rgba(168,85,247,0.22)]',
      progress: 'text-fuchsia-700',
    };
  }
  if (progress >= 85) {
    return {
      border: 'border-emerald-300',
      background: 'bg-gradient-to-br from-white via-emerald-50/85 to-teal-50/70',
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      bar: 'bg-gradient-to-r from-emerald-500 to-teal-500',
      glow: 'shadow-[0_14px_28px_rgba(16,185,129,0.16)]',
      progress: 'text-emerald-700',
    };
  }
  if (progress >= 40) {
    return {
      border: 'border-violet-200',
      background: 'bg-gradient-to-br from-white via-violet-50/85 to-sky-50/70',
      badge: 'border-violet-200 bg-violet-50 text-violet-700',
      bar: 'bg-gradient-to-r from-violet-500 to-sky-500',
      glow: 'shadow-[0_14px_28px_rgba(99,102,241,0.14)]',
      progress: 'text-violet-700',
    };
  }
  return {
    border: 'border-slate-200',
    background: 'bg-white/92',
    badge: 'border-slate-200 bg-slate-100 text-slate-600',
    bar: 'bg-gradient-to-r from-slate-400 to-slate-500',
    glow: 'shadow-[0_12px_24px_rgba(148,163,184,0.14)]',
    progress: 'text-slate-600',
  };
};

const ScheduleProgressTree = ({
  progressMap = {},
  focusTaskNumbers = new Set(),
  onOpenTask = null,
  tasks = [],
  pythonTasks = [],
  defaultCollapsed = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(Boolean(defaultCollapsed));
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
    };
  }, [focusTaskNumbers, progressMap, uniqueTaskNumbers]);

  const nodes = useMemo(() => (
    ROADMAP_NODES.map((node) => {
      const progress = getNodeProgress(node, progressMap);
      const isFocus = Array.isArray(node.taskNumbers)
        && node.taskNumbers.some((taskNumber) => focusTaskNumbers?.has(Number(taskNumber)));
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
        progress,
        isFocus,
        taskNumber: Number.isFinite(Number(taskNumber)) ? Number(taskNumber) : null,
        state: getNodeState(progress, isFocus),
        title,
        ariaTitle: taskMeta?.title || node.title || node.displayLabel || node.groupLabel || TEXT.theme,
      };
    })
  ), [classicTaskMap, focusTaskNumbers, progressMap, pythonTaskMap]);

  const nodeMap = useMemo(() => {
    const next = {};
    nodes.forEach((node) => {
      next[node.id] = node;
    });
    return next;
  }, [nodes]);

  const handleOpenNode = (node) => {
    if (!node?.taskNumber || typeof onOpenTask !== 'function') return;
    onOpenTask(node.taskNumber, null, null);
  };

  return (
    <Card className="space-y-4 border-purple-200/70 bg-gradient-to-br from-white via-slate-50/85 to-purple-50/65 shadow-[0_14px_30px_rgba(99,102,241,0.12)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-lg font-bold text-slate-900">{TEXT.title}</div>
          <p className="max-w-2xl text-xs text-slate-500">{TEXT.description}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-white/90 px-3 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-50"
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          {isCollapsed ? TEXT.expand : TEXT.collapse}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{TEXT.average}</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <TrendingUp size={14} className="text-violet-600" />
            {summary.average}%
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{TEXT.completed}</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <CheckCircle2 size={14} className="text-emerald-600" />
            {summary.completed}/{summary.total}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{TEXT.active}</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Target size={14} className="text-fuchsia-600" />
            {summary.focusCount > 0 ? `${summary.active} / ${TEXT.focus} ${summary.focusCount}` : summary.active}
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {summary.focusCount > 0 && (
            <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/80 px-3 py-2.5 text-xs font-medium text-fuchsia-700">
              {TEXT.focusBanner}
            </div>
          )}

          <div className="overflow-x-auto pb-2">
            <div
              className="relative rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4"
              style={{
                minWidth: `${ROADMAP_CANVAS_WIDTH + 32}px`,
                backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.28) 1.2px, transparent 0)',
                backgroundSize: '34px 34px',
              }}
            >
              <div
                className="relative mx-auto"
                style={{ width: `${ROADMAP_CANVAS_WIDTH}px`, height: `${ROADMAP_CANVAS_HEIGHT}px` }}
              >
                <svg
                  className="pointer-events-none absolute inset-0"
                  width={ROADMAP_CANVAS_WIDTH}
                  height={ROADMAP_CANVAS_HEIGHT}
                  viewBox={`0 0 ${ROADMAP_CANVAS_WIDTH} ${ROADMAP_CANVAS_HEIGHT}`}
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
                    return (
                      <path
                        key={`${edge.from}-${edge.to}`}
                        d={path}
                        fill="none"
                        stroke="rgba(100,116,139,0.44)"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        markerEnd="url(#schedule-roadmap-arrow)"
                      />
                    );
                  })}
                </svg>

                {nodes.map((node) => {
                  const interactive = typeof onOpenTask === 'function' && Number.isFinite(node.taskNumber);
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
                      className={`absolute overflow-hidden rounded-2xl border px-3 py-2 text-left transition ${node.state.border} ${node.state.background} ${node.state.glow} ${
                        interactive
                          ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_20px_34px_rgba(99,102,241,0.16)]'
                          : 'cursor-default'
                      } disabled:pointer-events-none`}
                      style={{
                        left: `${node.left}px`,
                        top: `${node.top}px`,
                        width: `${node.width}px`,
                        height: `${node.height}px`,
                      }}
                    >
                      {node.compactLabel ? (
                        <div className="flex h-full items-center justify-center text-center text-sm font-bold text-slate-800">
                          {node.compactLabel}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                {node.kind === 'group' ? (node.groupLabel || TEXT.group) : TEXT.exam}
                              </div>
                              <div className="mt-0.5 text-base font-black leading-none text-slate-900">
                                {node.kind === 'group' ? (node.groupLabel || TEXT.group) : `#${node.displayLabel}`}
                              </div>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${node.state.badge} ${node.state.progress}`}>
                              {node.progress}%
                            </span>
                          </div>

                          <div
                            className={`mt-1.5 text-[10px] leading-tight ${node.kind === 'group' ? 'text-slate-700' : 'font-medium text-slate-500'}`}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: node.kind === 'group' ? 2 : 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {node.title || (node.kind === 'group' ? TEXT.openBlock : TEXT.taskTheme)}
                          </div>

                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                            <div
                              className={`h-full rounded-full ${node.state.bar}`}
                              style={{ width: `${node.progress}%` }}
                            />
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{TEXT.legendDone}</span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">{TEXT.legendActive}</span>
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{TEXT.legendIdle}</span>
            <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 font-semibold text-fuchsia-700">{TEXT.legendFocus}</span>
          </div>
        </>
      )}
    </Card>
  );
};

export default ScheduleProgressTree;
