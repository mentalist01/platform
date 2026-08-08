import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Brush,
  Code2,
  Eye,
  GitBranch,
  Hand,
  History,
  ListChecks,
  Maximize2,
  Minimize2,
  MonitorUp,
  MousePointer2,
  Pause,
  PenTool,
  Play,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
  UserRound,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { api, resolveAuthenticatedUploadsUrl } from '../services/api';
import {
  findReplayAudioEventIndex,
  findUpcomingReplayAudioEventIndex,
  getReplayAudioDurationMs,
  getReplayTimelineDurationMs,
} from '../utils/lessonReplayTimeline';
import {
  createLessonReplayBranch,
  updateLessonReplayBranchBoard,
  updateLessonReplayBranchCode,
} from '../utils/lessonReplayTimeMachine';
import './LessonReplayPlayer.css';

const VIEW_LABELS = {
  call: 'Звонок',
  board: 'Доска',
  collab: 'Совместный код',
  python: 'Задания Python',
  progress: 'Задания',
  schedule: 'Домашняя работа',
  notes: 'Конспекты',
  review: 'Повторение',
  rating: 'Рейтинг',
  chat: 'Чат',
  teacher: 'Ученики',
  'teacher-calendar': 'Календарь',
};

const EVENT_LABELS = {
  session: 'Занятие',
  navigation: 'Переход',
  task: 'Задание',
  code: 'Код',
  'code-view': 'Перемещение по коду',
  board: 'Доска',
  'board-view': 'Перемещение по доске',
  viewport: 'Перемещение по материалу',
  run: 'Запуск',
  screen: 'Демонстрация экрана',
  audio: 'Аудиозапись',
};

const SURFACE_TABS = {
  board: { label: 'Доска', icon: PenTool },
  code: { label: 'Код', icon: Code2 },
  screen: { label: 'Экран', icon: MonitorUp },
};

const AUDIO_LOAD_TIMEOUT_MS = 12_000;
const TIME_MACHINE_RUN_TIMEOUT_MS = 40_000;
const TIME_MACHINE_OUTPUT_LIMIT = 20_000;

const formatClock = (value) => {
  const totalSeconds = Math.max(0, Math.floor((Number(value) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getEventLabel = (event) => {
  if (!event) return 'Начало занятия';
  if (event.type === 'navigation') {
    return event.payload?.label || VIEW_LABELS[event.payload?.view] || 'Переход по платформе';
  }
  if (event.type === 'task') {
    if (event.payload?.active === false) return event.payload?.label || 'Возврат к списку заданий';
    const task = event.payload?.label
      || (Number.isFinite(Number(event.payload?.taskNumber)) ? `Задание ${event.payload.taskNumber}` : 'Задание');
    const stableQuestionNumber = Number(event.payload?.questionNumber);
    const question = Number.isFinite(stableQuestionNumber)
      ? ` · вопрос ${stableQuestionNumber}`
      : (Number.isFinite(Number(event.payload?.questionIndex))
        ? ` · вопрос ${Number(event.payload.questionIndex) + 1}`
        : '');
    return `${task}${question}`;
  }
  if (event.type === 'code') return 'Изменение совместного кода';
  if (event.type === 'code-view') return 'Перемещение по коду';
  if (event.type === 'board') return 'Изменение на доске';
  if (event.type === 'board-view') return 'Перемещение по доске';
  if (event.type === 'run') return 'Запуск программы';
  if (event.type === 'screen') {
    if (event.payload?.active === false) return 'Демонстрация экрана завершена';
    const owner = event.payload?.sharedByRole === 'teacher' ? 'учителя' : 'ученика';
    return `Экран ${owner}`;
  }
  if (event.type === 'session') {
    if (event.payload?.action === 'switch') {
      return event.payload?.via === 'telemost' ? 'Перешли в Телемост' : 'Вернулись на платформу';
    }
    return event.payload?.action === 'end' ? 'Занятие завершено' : 'Занятие началось';
  }
  return EVENT_LABELS[event.type] || 'Действие';
};

const createRoleState = () => ({
  current: null,
  navigation: null,
  task: null,
  code: null,
  codeView: null,
  board: null,
  boardView: null,
  run: null,
  screen: null,
});

const getActorRole = (event) => {
  const role = event?.type === 'screen'
    ? (event?.payload?.sharedByRole || event?.actor?.role)
    : (event?.actor?.role || event?.payload?.sharedByRole);
  return role === 'teacher' || role === 'student' ? role : '';
};

const materializeBoardReplayEvents = (events) => {
  let boardItems = [];
  return events.map((event) => {
    if (event?.type !== 'board') return event;
    const payload = event.payload || {};
    if (payload.mode === 'delta') {
      const removedIds = new Set(
        (Array.isArray(payload.removedIds) ? payload.removedIds : []).map((id) => String(id || ''))
      );
      const upserts = (Array.isArray(payload.upserts) ? payload.upserts : [])
        .filter((entry) => entry?.item?.id)
        .sort((left, right) => Number(left.index) - Number(right.index));
      const upsertIds = new Set(upserts.map((entry) => String(entry.item.id)));
      const nextItems = boardItems.filter((item) => (
        !removedIds.has(String(item?.id || '')) && !upsertIds.has(String(item?.id || ''))
      ));
      upserts.forEach((entry) => {
        const index = Math.max(0, Math.min(nextItems.length, Math.round(Number(entry.index) || 0)));
        nextItems.splice(index, 0, entry.item);
      });
      boardItems = nextItems;
    } else {
      boardItems = Array.isArray(payload.items) ? [...payload.items] : [];
    }
    return {
      ...event,
      payload: {
        ...payload,
        items: boardItems,
      },
    };
  });
};

const applyEventToState = (state, event) => {
  state.current = event;
  if (event.type === 'task') state.task = event.payload?.active === false ? null : event;
  else if (event.type === 'screen') state.screen = event.payload?.active === false ? null : event;
  else if (event.type === 'board-view') state.boardView = event;
  else if (event.type === 'code-view') state.codeView = event;
  else if (event.type === 'viewport' && event.payload?.surface === 'board') state.boardView = event;
  else if (event.type === 'viewport' && event.payload?.surface === 'code') state.codeView = event;
  else if (Object.prototype.hasOwnProperty.call(state, event.type)) state[event.type] = event;
};

const buildStateAt = (events, positionMs) => {
  const state = {
    ...createRoleState(),
    audio: null,
    actors: {
      teacher: createRoleState(),
      student: createRoleState(),
    },
  };
  for (const event of events) {
    if (event.offsetMs > positionMs) break;
    applyEventToState(state, event);
    if (event.type === 'audio' && (event.payload?.url || event.payload?.playbackUrl)) state.audio = event;
    const role = getActorRole(event);
    if (role) applyEventToState(state.actors[role], event);
  }
  return state;
};

const getFollowSurface = (events, positionMs, role) => {
  let screenEnded = false;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.offsetMs > positionMs || getActorRole(event) !== role) continue;
    if (event.type === 'screen') {
      if (event.payload?.active === false) {
        screenEnded = true;
        continue;
      }
      if (!screenEnded) return 'screen';
      continue;
    }
    if (event.type === 'board' || event.type === 'board-view' || (event.type === 'viewport' && event.payload?.surface === 'board') || (event.type === 'navigation' && event.payload?.view === 'board')) return 'board';
    if (event.type === 'code' || event.type === 'code-view' || (event.type === 'viewport' && event.payload?.surface === 'code') || event.type === 'run' || (event.type === 'navigation' && ['collab', 'python'].includes(event.payload?.view))) return 'code';
  }
  return 'board';
};

const getItemBounds = (item) => {
  if (!item) return null;
  if (item.type === 'stroke') {
    const points = Array.isArray(item.points) ? item.points : [];
    if (points.length === 0) return null;
    return points.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, Number(point?.x) || 0),
      minY: Math.min(bounds.minY, Number(point?.y) || 0),
      maxX: Math.max(bounds.maxX, Number(point?.x) || 0),
      maxY: Math.max(bounds.maxY, Number(point?.y) || 0),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }
  if (item.type === 'line' || item.type === 'arrow') {
    return {
      minX: Math.min(Number(item.start?.x) || 0, Number(item.end?.x) || 0),
      minY: Math.min(Number(item.start?.y) || 0, Number(item.end?.y) || 0),
      maxX: Math.max(Number(item.start?.x) || 0, Number(item.end?.x) || 0),
      maxY: Math.max(Number(item.start?.y) || 0, Number(item.end?.y) || 0),
    };
  }
  if (item.type === 'text') {
    const x = Number(item.x) || 0;
    const y = Number(item.y) || 0;
    const fontSize = Math.max(8, Number(item.fontSize) || 22);
    const lines = String(item.text || '').split('\n').slice(0, 20);
    const longestLine = Math.max(1, ...lines.map((line) => line.length));
    return {
      minX: x,
      minY: y,
      maxX: x + Math.max(12, longestLine * fontSize * 0.62),
      maxY: y + Math.max(fontSize, lines.length * fontSize * 1.25),
    };
  }
  return {
    minX: Number(item.x) || 0,
    minY: Number(item.y) || 0,
    maxX: (Number(item.x) || 0) + Math.max(1, Number(item.width) || 1),
    maxY: (Number(item.y) || 0) + Math.max(1, Number(item.height) || 1),
  };
};

const getFitView = (items) => {
  const bounds = items.map(getItemBounds).filter(Boolean);
  if (bounds.length === 0) return { x: -20, y: -20, width: 900, height: 520 };
  const minX = Math.min(...bounds.map((entry) => entry.minX));
  const minY = Math.min(...bounds.map((entry) => entry.minY));
  const maxX = Math.max(...bounds.map((entry) => entry.maxX));
  const maxY = Math.max(...bounds.map((entry) => entry.maxY));
  const padding = Math.max(28, Math.min(100, Math.max(maxX - minX, maxY - minY) * 0.08));
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(240, maxX - minX + padding * 2),
    height: Math.max(140, maxY - minY + padding * 2),
  };
};

const viewFromRecordedPosition = (fitView, recordedView) => {
  const zoom = Math.max(0.15, Math.min(12, Number(recordedView?.zoom) || 1));
  const recordedWidth = Number(recordedView?.width);
  const recordedHeight = Number(recordedView?.height);
  const width = Number.isFinite(recordedWidth) && recordedWidth > 0 ? recordedWidth / zoom : fitView.width / zoom;
  const height = Number.isFinite(recordedHeight) && recordedHeight > 0 ? recordedHeight / zoom : fitView.height / zoom;
  const offsetX = Number(recordedView?.offset?.x);
  const offsetY = Number(recordedView?.offset?.y);
  const directX = Number(recordedView?.x);
  const directY = Number(recordedView?.y);
  const x = Number.isFinite(offsetX)
    ? offsetX
    : (Number.isFinite(directX) ? directX : fitView.x + (fitView.width - width) / 2);
  const y = Number.isFinite(offsetY)
    ? offsetY
    : (Number.isFinite(directY) ? directY : fitView.y + (fitView.height - height) / 2);
  return { x, y, width, height };
};

const getSvgViewportMetrics = (rect, view) => {
  const scale = Math.max(0.0001, Math.min(
    Math.max(1, rect.width) / Math.max(1, view.width),
    Math.max(1, rect.height) / Math.max(1, view.height)
  ));
  const renderedWidth = view.width * scale;
  const renderedHeight = view.height * scale;
  return {
    scale,
    offsetX: (rect.width - renderedWidth) / 2,
    offsetY: (rect.height - renderedHeight) / 2,
  };
};

const ReplayBoardTask = ({ item }) => {
  const x = Number(item?.x) || 0;
  const y = Number(item?.y) || 0;
  const width = Math.max(420, Number(item?.width) || 720);
  const height = Math.max(220, Number(item?.height) || 640);
  const answerCount = Math.max(1, Math.min(50, Number(item?.answerCount) || 1));
  const columns = answerCount === 1 ? 1 : (answerCount > 20 ? 5 : 2);
  const order = answerCount === 20
    ? Array.from({ length: 10 }, (_, rowIndex) => [rowIndex, rowIndex + 10]).flat()
    : Array.from({ length: answerCount }, (_, index) => index);
  const rows = Math.ceil(answerCount / columns);
  const padding = 22;
  const gap = columns > 2 ? 7 : 12;
  const fieldWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const fieldHeight = 44;
  const rowGap = 10;
  const panelHeight = 48 + rows * fieldHeight + Math.max(0, rows - 1) * rowGap + 66;
  const panelY = height - panelHeight - padding;
  const status = ['correct', 'wrong'].includes(item?.checkState) ? item.checkState : 'idle';
  const accent = status === 'correct' ? '#16a34a' : (status === 'wrong' ? '#dc2626' : '#7c3aed');
  const screenshotHeights = (item.screenshots || []).map((screenshot) => (
    Math.max(40, Number(screenshot?.displayHeight) || 220)
  ));
  const imageY = y + 78 + screenshotHeights.reduce((total, imageHeight) => total + imageHeight + 12, 0);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="18" fill="#fff" stroke={status === 'idle' ? '#d8d2f4' : accent} strokeWidth={status === 'idle' ? 1.5 : 2.5} />
      <path d={`M ${x + 18} ${y + 1} H ${x + width - 18} Q ${x + width - 1} ${y + 1} ${x + width - 1} ${y + 18} V ${y + 62} H ${x + 1} V ${y + 18} Q ${x + 1} ${y + 1} ${x + 18} ${y + 1}`} fill="#f6f3ff" />
      <rect x={x + 18} y={y + 15} width="34" height="34" rx="10" fill={accent} />
      <text x={x + 35} y={y + 37} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800">{String(item.questionNumber || item.taskNumber || '?').slice(0, 4)}</text>
      <text x={x + 64} y={y + 34} fill="#211a35" fontSize="17" fontWeight="800">{String(item.heading || `Задание ${item.taskDisplayNumber || item.taskNumber || ''}`).slice(0, 72)}</text>
      {(item.screenshots || []).map((screenshot, index) => {
        const imageHeight = screenshotHeights[index];
        const currentY = y + 78 + screenshotHeights
          .slice(0, index)
          .reduce((total, previousHeight) => total + previousHeight + 12, 0);
        return (
          <image
            key={`${item.id}-task-image-${index}`}
            href={resolveAuthenticatedUploadsUrl(screenshot.assetUrl)}
            x={x + padding}
            y={currentY}
            width={width - padding * 2}
            height={imageHeight}
            preserveAspectRatio="xMidYMid meet"
          />
        );
      })}
      {item.questionText && imageY < y + panelY - 12 && (
        <foreignObject x={x + padding} y={imageY} width={width - padding * 2} height={Math.max(24, y + panelY - imageY - 12)}>
          <div xmlns="http://www.w3.org/1999/xhtml" style={{ color: '#211a35', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 17, fontWeight: 600, lineHeight: 1.4, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
            {item.questionText}
          </div>
        </foreignObject>
      )}
      <rect x={x + padding - 8} y={y + panelY - 8} width={width - padding * 2 + 16} height={panelHeight + 2} rx="14" fill={status === 'correct' ? '#f0fdf4' : (status === 'wrong' ? '#fef2f2' : '#f8f7fc')} />
      <text x={x + padding} y={y + panelY + 19} fill="#6d6381" fontSize="12" fontWeight="800">ОТВЕТ</text>
      {order.map((answerIndex, position) => {
        const row = Math.floor(position / columns);
        const column = position % columns;
        const fieldX = x + padding + column * (fieldWidth + gap);
        const fieldY = y + panelY + 48 + row * (fieldHeight + rowGap);
        const value = String(item.userAnswers?.[answerIndex] ?? '');
        const label = item.answerLabels?.[answerIndex] || answerIndex + 1;
        return (
          <g key={`${item.id}-task-answer-${answerIndex}`}>
            <rect x={fieldX} y={fieldY} width={fieldWidth} height={fieldHeight} rx="10" fill="#fff" stroke={status === 'wrong' ? '#fecaca' : (status === 'correct' ? '#bbf7d0' : '#ddd6ee')} strokeWidth="1.3" />
            <text x={fieldX + 13} y={fieldY + 27} fill={value ? '#251d38' : '#aaa1b9'} fontSize="14" fontWeight={value ? '600' : '500'}>{(value || `Ответ ${label}`).slice(0, 38)}</text>
          </g>
        );
      })}
      <rect x={x + padding} y={y + panelY + panelHeight - 58} width="142" height="42" rx="11" fill={accent} />
      <text x={x + padding + 71} y={y + panelY + panelHeight - 32} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800">Проверить</text>
      {status !== 'idle' && <text x={x + padding + 160} y={y + panelY + panelHeight - 32} fill={accent} fontSize="14" fontWeight="800">{status === 'correct' ? 'Верно!' : 'Пока неверно'}</text>}
    </g>
  );
};

const ReplayBoardItems = ({ items, arrowMarkerId }) => (
  <>
    {(Array.isArray(items) ? items : []).map((item) => {
      const key = item.id;
      if (item.type === 'stroke') {
        const points = (item.points || []).map((point) => `${Number(point?.x) || 0},${Number(point?.y) || 0}`).join(' ');
        return <polyline key={key} points={points} fill="none" stroke={item.color} strokeWidth={item.width || 3} strokeLinecap="round" strokeLinejoin="round" />;
      }
      if (item.type === 'line' || item.type === 'arrow') {
        return <line key={key} x1={item.start?.x || 0} y1={item.start?.y || 0} x2={item.end?.x || 0} y2={item.end?.y || 0} stroke={item.color} strokeWidth={item.width || 3} strokeLinecap="round" markerEnd={item.type === 'arrow' ? `url(#${arrowMarkerId})` : undefined} />;
      }
      if (item.type === 'shape') {
        if (item.shape === 'ellipse') return <ellipse key={key} cx={(item.x || 0) + (item.width || 1) / 2} cy={(item.y || 0) + (item.height || 1) / 2} rx={(item.width || 1) / 2} ry={(item.height || 1) / 2} fill="none" stroke={item.color} strokeWidth={item.strokeWidth || 3} />;
        if (item.shape === 'diamond') {
          const x = item.x || 0;
          const y = item.y || 0;
          const width = item.width || 1;
          const height = item.height || 1;
          return <polygon key={key} points={`${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`} fill="none" stroke={item.color} strokeWidth={item.strokeWidth || 3} />;
        }
        return <rect key={key} x={item.x || 0} y={item.y || 0} width={item.width || 1} height={item.height || 1} rx="6" fill="none" stroke={item.color} strokeWidth={item.strokeWidth || 3} />;
      }
      if (item.type === 'text') {
        return (
          <text key={key} x={item.x || 0} y={(item.y || 0) + (item.fontSize || 22)} fill={item.color} fontSize={item.fontSize || 22} fontFamily="Inter, system-ui, sans-serif">
            {String(item.text || '').split('\n').slice(0, 20).map((line, index) => (
              <tspan key={`${key}-${index}`} x={item.x || 0} dy={index === 0 ? 0 : (item.fontSize || 22) * 1.25}>{line || ' '}</tspan>
            ))}
          </text>
        );
      }
      if (item.type === 'task') return <ReplayBoardTask key={key} item={item} />;
      if (item.type === 'image' && item.assetUrl) {
        const source = resolveAuthenticatedUploadsUrl(item.assetUrl);
        return <image key={key} href={source} x={item.x || 0} y={item.y || 0} width={item.width || 1} height={item.height || 1} preserveAspectRatio="none" transform={item.flipX ? `translate(${(item.x || 0) * 2 + (item.width || 1)} 0) scale(-1 1)` : undefined} />;
      }
      return null;
    })}
  </>
);

const ReplayBoard = ({ items, recordedView, freeNavigation }) => {
  const normalizedItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const fitView = useMemo(() => getFitView(normalizedItems), [normalizedItems]);
  const [freeView, setFreeView] = useState(null);
  const pointerRef = useRef(null);
  const arrowMarkerId = `lesson-replay-arrow-${useId().replace(/:/g, '')}`;
  const view = freeNavigation
    ? (freeView || fitView)
    : viewFromRecordedPosition(fitView, recordedView);

  const zoomAtCenter = (factor) => {
    if (!freeNavigation) return;
    const current = view;
    const width = Math.max(40, Math.min(8000, current.width * factor));
    const height = Math.max(30, Math.min(5000, current.height * factor));
    setFreeView({
      x: current.x + (current.width - width) / 2,
      y: current.y + (current.height - height) / 2,
      width,
      height,
    });
  };

  if (normalizedItems.length === 0) {
    return <div className="lesson-replay-player__empty-surface"><PenTool size={25} /><span>На этом моменте доска пустая</span></div>;
  }

  return (
    <div className="lesson-replay-player__board-wrap">
      {freeNavigation && (
        <div className="lesson-replay-player__board-tools">
          <button type="button" onClick={() => zoomAtCenter(0.8)} aria-label="Приблизить"><ZoomIn size={16} /></button>
          <button type="button" onClick={() => zoomAtCenter(1.25)} aria-label="Отдалить"><ZoomOut size={16} /></button>
          <button type="button" onClick={() => setFreeView(null)}>Вписать</button>
        </div>
      )}
      <svg
        className={`lesson-replay-player__board${freeNavigation ? ' is-interactive' : ''}`}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Состояние доски"
        onPointerDown={(event) => {
          if (!freeNavigation) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerRef.current = { x: event.clientX, y: event.clientY, view };
        }}
        onPointerMove={(event) => {
          const origin = pointerRef.current;
          if (!freeNavigation || !origin) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const metrics = getSvgViewportMetrics(rect, origin.view);
          setFreeView({
            ...origin.view,
            x: origin.view.x - ((event.clientX - origin.x) / metrics.scale),
            y: origin.view.y - ((event.clientY - origin.y) / metrics.scale),
          });
        }}
        onPointerUp={() => { pointerRef.current = null; }}
        onPointerCancel={() => { pointerRef.current = null; }}
        onWheel={(event) => {
          if (!freeNavigation) return;
          event.preventDefault();
          zoomAtCenter(event.deltaY > 0 ? 1.12 : 0.89);
        }}
      >
        <defs>
          <marker id={arrowMarkerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        <ReplayBoardItems items={normalizedItems} arrowMarkerId={arrowMarkerId} />
      </svg>
    </div>
  );
};

const ReplayCode = ({ event, runEvent, recordedView, freeNavigation }) => {
  const payload = event?.payload || {};
  const runPayload = runEvent && Number(runEvent.offsetMs) >= Number(event?.offsetMs || 0) ? (runEvent.payload || {}) : {};
  const error = runPayload.error || payload.error;
  const output = error || runPayload.output || payload.output;
  const codeRef = useRef(null);
  const view = recordedView || payload.editor || payload.view || {};

  useEffect(() => {
    const node = codeRef.current;
    if (!node || freeNavigation) return;
    const frame = window.requestAnimationFrame(() => {
      const scrollTopRatio = Number(view.scrollTopRatio);
      const scrollLeftRatio = Number(view.scrollLeftRatio);
      const firstVisibleLine = Number(view.firstVisibleLine);
      node.scrollTop = Number.isFinite(scrollTopRatio)
        ? Math.max(0, scrollTopRatio) * Math.max(0, node.scrollHeight - node.clientHeight)
        : (Number.isFinite(Number(view.scrollTop))
          ? Math.max(0, Number(view.scrollTop))
          : Math.max(0, (Number.isFinite(firstVisibleLine) ? firstVisibleLine - 1 : 0) * 20.8));
      node.scrollLeft = Number.isFinite(scrollLeftRatio)
        ? Math.max(0, scrollLeftRatio) * Math.max(0, node.scrollWidth - node.clientWidth)
        : Math.max(0, Number(view.scrollLeft) || 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [freeNavigation, view.firstVisibleLine, view.scrollLeft, view.scrollLeftRatio, view.scrollTop, view.scrollTopRatio]);

  const cursorLine = Math.max(0, Number(view.cursorLine) || 0);
  return (
    <div className="lesson-replay-player__code-layout">
      {cursorLine > 0 && !freeNavigation && <span className="lesson-replay-player__code-position">Строка {cursorLine}</span>}
      <pre ref={codeRef} className="lesson-replay-player__code"><code>{payload.code || '# Код пока не появился'}</code></pre>
      {(payload.input || payload.testFile || output) && (
        <div className="lesson-replay-player__console-grid">
          {(payload.input || payload.testFile) && <section><span>Ввод</span><pre>{payload.input || payload.testFile}</pre></section>}
          {output && <section className={error ? 'is-error' : ''}><span>{error ? 'Ошибка' : 'Результат'}</span><pre>{output}</pre></section>}
        </div>
      )}
    </div>
  );
};

const limitTimeMachineOutput = (value) => {
  const text = String(value ?? '');
  if (text.length <= TIME_MACHINE_OUTPUT_LIMIT) return text;
  return `${text.slice(0, TIME_MACHINE_OUTPUT_LIMIT)}\n… вывод сокращён`;
};

const TimeMachineCodeEditor = ({ branch, onCodePatch, createPythonWorker }) => {
  const [running, setRunning] = useState(false);
  const [streamOutput, setStreamOutput] = useState('');
  const [streamError, setStreamError] = useState('');
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);
  const runSequenceRef = useRef(0);
  const code = branch?.code || {};
  const isPython = String(code.language || 'python').toLowerCase() === 'python';

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    workerRef.current?.terminate?.();
    workerRef.current = null;
  }, []);

  const stopWorker = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    workerRef.current?.terminate?.();
    workerRef.current = null;
  }, []);

  const handleRun = useCallback(() => {
    if (running || !isPython) return;
    if (!String(code.code || '').trim()) {
      onCodePatch({ output: '', error: 'Добавьте код перед запуском.', status: 'error' });
      return;
    }
    if (typeof createPythonWorker !== 'function' || typeof Worker === 'undefined') {
      onCodePatch({ output: '', error: 'Изолированный запуск Python недоступен в этом браузере.', status: 'error' });
      return;
    }

    let worker = workerRef.current;
    try {
      if (!worker) {
        worker = createPythonWorker();
        workerRef.current = worker;
      }
    } catch (error) {
      onCodePatch({ output: '', error: error?.message || 'Не удалось запустить Python.', status: 'error' });
      return;
    }

    const runId = `lesson-replay-${branch.branchId}-${runSequenceRef.current + 1}`;
    runSequenceRef.current += 1;
    let outputBuffer = '';
    let errorBuffer = '';
    let finished = false;
    setRunning(true);
    setStreamOutput('');
    setStreamError('');
    const sourceRevision = branch.revision;
    const runningRevision = sourceRevision + 1;
    onCodePatch({ output: '', error: '', status: 'running' }, sourceRevision);

    const removeWorkerListeners = () => {
      worker.removeEventListener('message', handleWorkerMessage);
      worker.removeEventListener('error', handleWorkerError);
      worker.removeEventListener('messageerror', handleWorkerMessageError);
    };
    const finish = (output, error, terminate = false) => {
      if (finished) return;
      finished = true;
      removeWorkerListeners();
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (terminate) stopWorker();
      const nextOutput = limitTimeMachineOutput(output);
      const nextError = limitTimeMachineOutput(error);
      setStreamOutput(nextOutput);
      setStreamError(nextError);
      setRunning(false);
      onCodePatch({
        output: nextOutput,
        error: nextError,
        status: nextError ? 'error' : 'success',
      }, runningRevision);
    };

    const handleWorkerMessage = (event) => {
      const data = event.data || {};
      if (data.id !== runId) return;
      if (data.type === 'stdout' || data.type === 'stderr') {
        const chunk = String(data.chunk ?? '');
        if (data.type === 'stdout') {
          outputBuffer = limitTimeMachineOutput(`${outputBuffer}${chunk}`);
          setStreamOutput(outputBuffer);
        } else {
          errorBuffer = limitTimeMachineOutput(`${errorBuffer}${chunk}`);
          setStreamError(errorBuffer);
        }
        return;
      }
      if (data.type === 'result') {
        finish(data.output ?? outputBuffer, data.error ?? errorBuffer);
      }
    };
    const handleWorkerError = () => finish('', 'Ошибка выполнения Python.', true);
    const handleWorkerMessageError = () => finish('', 'Не удалось прочитать результат Python.', true);
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.addEventListener('messageerror', handleWorkerMessageError);
    timeoutRef.current = window.setTimeout(() => {
      finish(outputBuffer, `${errorBuffer}${errorBuffer ? '\n' : ''}Превышено время выполнения (40 сек).`, true);
    }, TIME_MACHINE_RUN_TIMEOUT_MS);
    worker.postMessage({
      id: runId,
      source: String(code.code || ''),
      input: String(code.input || ''),
      files: [{
        name: 'test.txt',
        bytes: new TextEncoder().encode(String(code.testFile || '')),
      }],
      enableTurtle: false,
    });
  }, [branch.branchId, branch.revision, code.code, code.input, code.testFile, createPythonWorker, isPython, onCodePatch, running, stopWorker]);

  const visibleOutput = running ? streamOutput : String(code.output || '');
  const visibleError = running ? streamError : String(code.error || '');
  return (
    <div className="lesson-replay-player__time-machine-code">
      <div className="lesson-replay-player__time-machine-editor">
        <Editor
          height="100%"
          language={String(code.language || 'python')}
          path={`inmemory://lesson-replay/${branch.branchId}.py`}
          theme="vs-dark"
          value={String(code.code || '')}
          saveViewState={false}
          onChange={(value) => onCodePatch({
            code: value || '',
            output: '',
            error: '',
            status: 'edited',
          })}
          options={{
            ariaLabel: 'Код самостоятельной ветки',
            automaticLayout: true,
            readOnly: running,
            fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
            fontSize: 13,
            lineHeight: 21,
            minimap: { enabled: false },
            padding: { top: 14, bottom: 14 },
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            tabSize: 4,
          }}
        />
      </div>
      <div className="lesson-replay-player__time-machine-console">
        <label>
          <span>Ввод для input()</span>
          <textarea
            value={String(code.input || '')}
            onChange={(event) => onCodePatch({ input: event.target.value, status: 'edited' })}
            disabled={running}
            placeholder="Введите исходные данные"
            spellCheck="false"
          />
        </label>
        <section className={visibleError ? 'is-error' : ''} aria-live="polite">
          <div>
            <span>{visibleError ? 'Ошибка' : 'Результат'}</span>
            <button
              type="button"
              onClick={handleRun}
              disabled={running || !isPython || typeof createPythonWorker !== 'function'}
              title={!isPython ? 'Запуск доступен только для Python' : undefined}
            >
              {running ? <Pause size={14} /> : <PlayCircle size={14} />}
              {running ? 'Выполняется…' : 'Запустить'}
            </button>
          </div>
          <pre>{visibleError || visibleOutput || (running ? 'Подготовка Python…' : 'Здесь появится результат')}</pre>
        </section>
      </div>
    </div>
  );
};

const TimeMachineBoard = ({ branchId, items, onItemsChange }) => {
  const normalizedItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const [view, setView] = useState(() => getFitView(Array.isArray(items) ? items : []));
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#7c3aed');
  const [draftStroke, setDraftStroke] = useState(null);
  const pointerRef = useRef(null);
  const strokeSequenceRef = useRef((Array.isArray(items) ? items : []).reduce((maximum, item) => {
    const prefix = `time-machine-stroke-${branchId}-`;
    const id = String(item?.id || '');
    if (!id.startsWith(prefix)) return maximum;
    const sequence = Number(id.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0));
  const arrowMarkerId = `lesson-time-machine-arrow-${useId().replace(/:/g, '')}`;

  const zoomAtCenter = (factor) => {
    setView((current) => {
      const width = Math.max(40, Math.min(8000, current.width * factor));
      const height = Math.max(30, Math.min(5000, current.height * factor));
      return {
        x: current.x + (current.width - width) / 2,
        y: current.y + (current.height - height) / 2,
        width,
        height,
      };
    });
  };

  const toBoardPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const metrics = getSvgViewportMetrics(rect, view);
    const x = (event.clientX - rect.left - metrics.offsetX) / metrics.scale;
    const y = (event.clientY - rect.top - metrics.offsetY) / metrics.scale;
    return {
      x: view.x + Math.min(view.width, Math.max(0, x)),
      y: view.y + Math.min(view.height, Math.max(0, y)),
    };
  };

  const finishPointer = (event) => {
    const pointer = pointerRef.current;
    if (!pointer) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerRef.current = null;
    if (pointer.kind !== 'draw') return;
    const stroke = pointer.stroke;
    if ((stroke.points || []).length === 1) {
      stroke.points = [...stroke.points, { x: stroke.points[0].x + 0.5, y: stroke.points[0].y + 0.5 }];
    }
    setDraftStroke(null);
    onItemsChange([...normalizedItems, stroke]);
  };

  const localItems = normalizedItems.filter((item) => item?.timeMachineBranch === branchId);
  const undoLastStroke = () => {
    const last = localItems[localItems.length - 1];
    if (!last) return;
    onItemsChange(normalizedItems.filter((item) => item?.id !== last.id));
  };

  return (
    <div className="lesson-replay-player__time-machine-board-wrap">
      <div className="lesson-replay-player__time-machine-board-tools" role="toolbar" aria-label="Инструменты доски ветки">
        <button type="button" className={tool === 'pen' ? 'is-active' : ''} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')} title="Рисовать"><Brush size={15} /></button>
        <button type="button" className={tool === 'pan' ? 'is-active' : ''} aria-pressed={tool === 'pan'} onClick={() => setTool('pan')} title="Двигать доску"><Hand size={15} /></button>
        <span className="lesson-replay-player__time-machine-colors" aria-label="Цвет линии">
          {['#7c3aed', '#2563eb', '#dc2626', '#111827'].map((value) => (
            <button key={value} type="button" className={color === value ? 'is-active' : ''} aria-label={`Цвет ${value}`} aria-pressed={color === value} onClick={() => { setColor(value); setTool('pen'); }} style={{ '--time-machine-color': value }} />
          ))}
        </span>
        <button type="button" onClick={undoLastStroke} disabled={localItems.length === 0} title="Отменить последний штрих"><Undo2 size={15} /></button>
        <button type="button" onClick={() => onItemsChange(normalizedItems.filter((item) => item?.timeMachineBranch !== branchId))} disabled={localItems.length === 0} title="Очистить мои штрихи"><Trash2 size={15} /></button>
        <button type="button" onClick={() => zoomAtCenter(0.8)} title="Приблизить"><ZoomIn size={15} /></button>
        <button type="button" onClick={() => zoomAtCenter(1.25)} title="Отдалить"><ZoomOut size={15} /></button>
        <button type="button" onClick={() => setView(getFitView(normalizedItems))}>Вписать</button>
      </div>
      <svg
        className={`lesson-replay-player__time-machine-board is-${tool}`}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Редактируемая доска самостоятельной ветки"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          if (tool === 'pan') {
            pointerRef.current = { kind: 'pan', x: event.clientX, y: event.clientY, view };
            return;
          }
          const point = toBoardPoint(event);
          strokeSequenceRef.current += 1;
          const stroke = {
            id: `time-machine-stroke-${branchId}-${strokeSequenceRef.current}`,
            type: 'stroke',
            points: [point],
            color,
            width: Math.max(2, view.width / 330),
            timeMachineBranch: branchId,
          };
          pointerRef.current = { kind: 'draw', stroke };
          setDraftStroke(stroke);
        }}
        onPointerMove={(event) => {
          const pointer = pointerRef.current;
          if (!pointer) return;
          if (pointer.kind === 'pan') {
            const rect = event.currentTarget.getBoundingClientRect();
            const metrics = getSvgViewportMetrics(rect, pointer.view);
            setView({
              ...pointer.view,
              x: pointer.view.x - ((event.clientX - pointer.x) / metrics.scale),
              y: pointer.view.y - ((event.clientY - pointer.y) / metrics.scale),
            });
            return;
          }
          const point = toBoardPoint(event);
          const points = pointer.stroke.points || [];
          const previous = points[points.length - 1];
          const minDistance = Math.max(0.5, view.width / 900);
          if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < minDistance) return;
          pointer.stroke = { ...pointer.stroke, points: [...points, point] };
          setDraftStroke(pointer.stroke);
        }}
        onPointerUp={finishPointer}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          pointerRef.current = null;
          setDraftStroke(null);
        }}
        onWheel={(event) => {
          event.preventDefault();
          zoomAtCenter(event.deltaY > 0 ? 1.12 : 0.89);
        }}
      >
        <defs>
          <marker id={arrowMarkerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        <ReplayBoardItems items={draftStroke ? [...normalizedItems, draftStroke] : normalizedItems} arrowMarkerId={arrowMarkerId} />
      </svg>
    </div>
  );
};

const TimeMachineOriginalSurface = ({ surface, boardEvent, boardView, codeEvent, codeView, runEvent }) => (
  surface === 'board'
    ? <ReplayBoard items={boardEvent?.payload?.items} recordedView={boardView} freeNavigation={false} />
    : <ReplayCode event={codeEvent} runEvent={runEvent} recordedView={codeView} freeNavigation={false} />
);

const TimeMachineWorkspace = ({
  branch,
  boardEvent,
  boardView,
  codeEvent,
  codeView,
  createPythonWorker,
  branchEpoch,
  onBranchBoardChange,
  onBranchCodePatch,
  onClose,
  onResetBranch,
  onStartBranch,
  onSurfaceChange,
  playing,
  positionMs,
  runEvent,
  surface,
}) => (
  <div className="lesson-replay-player__time-machine">
    <div className="lesson-replay-player__time-machine-bar">
      <div className="lesson-replay-player__time-machine-heading">
        <span><History size={14} /> Машина времени</span>
        <strong>{branch ? `Ветка от ${formatClock(branch.metadata.positionMs)}` : 'Живая копия записи'}</strong>
      </div>
      <div className="lesson-replay-player__time-machine-surfaces" role="tablist" aria-label="Поверхность машины времени">
        {['code', 'board'].map((value) => {
          const Icon = SURFACE_TABS[value].icon;
          return (
            <button key={value} type="button" role="tab" aria-selected={surface === value} className={surface === value ? 'is-active' : ''} onClick={() => onSurfaceChange(value)}>
              <Icon size={14} />{SURFACE_TABS[value].label}
            </button>
          );
        })}
      </div>
      {branch && <button type="button" className="lesson-replay-player__time-machine-reset" onClick={onResetBranch}><RotateCcw size={14} /> Сбросить ветку</button>}
      <button type="button" className="lesson-replay-player__time-machine-close" onClick={onClose} aria-label="Закрыть машину времени"><X size={17} /></button>
    </div>

    {!branch ? (
      <div className="lesson-replay-player__time-machine-preview" data-surface={surface}>
        <TimeMachineOriginalSurface surface={surface} boardEvent={boardEvent} boardView={boardView} codeEvent={codeEvent} codeView={codeView} runEvent={runEvent} />
        {playing ? (
          <div className="lesson-replay-player__time-machine-playing-note"><PlayCircle size={14} /> Останови запись в нужном месте — появится «Попробуй сам»</div>
        ) : (
          <div className="lesson-replay-player__time-machine-prompt" role="status">
            <span><Sparkles size={17} /> Запись остановлена на {formatClock(positionMs)}</span>
            <strong>Попробуй продолжить решение сам</strong>
            <p>Создадим отдельную копию. Настоящие код и доска не изменятся.</p>
            <button type="button" onClick={onStartBranch}><GitBranch size={16} /> Попробуй сам</button>
          </div>
        )}
      </div>
    ) : (
      <div className="lesson-replay-player__time-machine-compare" data-surface={surface}>
        <section className="lesson-replay-player__time-machine-pane is-original" aria-label="Оригинальная запись">
          <header>
            <span><Eye size={14} /> Оригинал-призрак</span>
            <strong>{formatClock(positionMs)} · {playing ? 'запись идёт' : 'пауза'}</strong>
          </header>
          <div className="lesson-replay-player__time-machine-pane-content" aria-hidden="true">
            <TimeMachineOriginalSurface surface={surface} boardEvent={boardEvent} boardView={boardView} codeEvent={codeEvent} codeView={codeView} runEvent={runEvent} />
          </div>
        </section>
        <section className="lesson-replay-player__time-machine-pane is-branch" aria-label="Самостоятельная ветка ученика">
          <header>
            <span><GitBranch size={14} /> Моя ветка</span>
            <strong>от {formatClock(branch.metadata.positionMs)} · версия {branch.revision}</strong>
          </header>
          <div className="lesson-replay-player__time-machine-pane-content">
            {surface === 'board' ? (
              <TimeMachineBoard
                key={`${branch.branchId}-board`}
                branchId={branch.branchId}
                items={branch.board?.items}
                onItemsChange={onBranchBoardChange}
              />
            ) : (
              <TimeMachineCodeEditor key={`${branch.branchId}-${branchEpoch}`} branch={branch} onCodePatch={onBranchCodePatch} createPythonWorker={createPythonWorker} />
            )}
          </div>
        </section>
      </div>
    )}
  </div>
);

const ReplayScreen = ({ event, occurrence }) => {
  const snapshotId = String(event?.payload?.snapshotId || '').trim();
  const [failedSnapshotId, setFailedSnapshotId] = useState('');
  const source = snapshotId && occurrence?.studentId && occurrence?.key
    ? api.getLessonReplaySnapshotUrl(occurrence.studentId, occurrence.key, snapshotId)
    : '';
  const failed = failedSnapshotId === snapshotId;

  if (!source || failed) {
    return <div className="lesson-replay-player__empty-surface"><MonitorUp size={25} /><span>{failed ? 'Этот снимок экрана уже недоступен' : 'На этом моменте нет снимка экрана'}</span></div>;
  }
  return (
    <div className="lesson-replay-player__screen">
      <img src={source} alt="Снимок демонстрации экрана" onError={() => setFailedSnapshotId(snapshotId)} />
      <span><MonitorUp size={13} />{event.payload?.sharedByRole === 'teacher' ? 'Экран учителя' : 'Экран ученика'}</span>
    </div>
  );
};

const getReplayAudioSource = (event, replay) => {
  if (!event) return '';
  if (event.payload?.audioId) {
    return api.getLessonReplayAudioUrl(
      replay?.occurrence?.studentId,
      replay?.occurrence?.key,
      event.payload.audioId
    );
  }
  return resolveAuthenticatedUploadsUrl(event.payload?.playbackUrl || event.payload?.url);
};

const LessonReplayPlayer = ({ replay, createPythonWorker = null }) => {
  const events = useMemo(() => (
    materializeBoardReplayEvents(
      (Array.isArray(replay?.events) ? replay.events : [])
      .map((event) => ({ ...event, offsetMs: Math.max(0, Number(event?.offsetMs) || 0) }))
      .sort((left, right) => left.offsetMs - right.offsetMs || String(left.id).localeCompare(String(right.id)))
    )
  ), [replay]);
  const durationMs = useMemo(
    () => getReplayTimelineDurationMs(events, replay?.durationMs),
    [events, replay?.durationMs]
  );
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState('teacher');
  const [activeTab, setActiveTab] = useState('board');
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioBuffering, setAudioBuffering] = useState(false);
  const [seekSequence, setSeekSequence] = useState(0);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const [timeMachineOpen, setTimeMachineOpen] = useState(false);
  const [timeMachineSurface, setTimeMachineSurface] = useState('code');
  const [timeMachineBranch, setTimeMachineBranch] = useState(null);
  const [timeMachineBranchEpoch, setTimeMachineBranchEpoch] = useState(0);
  const playerRef = useRef(null);
  const positionRef = useRef(0);
  const frameRef = useRef(null);
  const lastFrameAtRef = useRef(0);
  const lastRenderedAtRef = useRef(0);
  const audioRefs = useRef([null, null]);
  const audioClockRef = useRef({ event: null, slot: -1, nextAudioStart: null, upcomingAudioStart: null });
  const endedAudioEventIdRef = useRef('');
  const playingRef = useRef(false);
  const seekSequenceRef = useRef(0);
  const fullscreenRequestPendingRef = useRef(false);
  const isFullscreen = isNativeFullscreen || isFallbackFullscreen;

  const audioEvents = useMemo(() => events.filter((event) => (
    event.type === 'audio'
    && (event.payload?.audioId || event.payload?.playbackUrl || event.payload?.url)
  )), [events]);
  const audioEventIndex = useMemo(
    () => findReplayAudioEventIndex(audioEvents, positionMs),
    [audioEvents, positionMs]
  );
  const audioEvent = audioEventIndex >= 0 ? audioEvents[audioEventIndex] : null;
  const upcomingAudioEventIndex = findUpcomingReplayAudioEventIndex(audioEvents, positionMs);
  const hasUpcomingAudioEvent = upcomingAudioEventIndex >= 0
    && upcomingAudioEventIndex < audioEvents.length
    && upcomingAudioEventIndex !== audioEventIndex;
  const audioSlots = useMemo(() => {
    const slots = [null, null];
    const indexes = [
      ...(audioEventIndex >= 0 ? [audioEventIndex] : []),
      ...(hasUpcomingAudioEvent ? [upcomingAudioEventIndex] : []),
    ];
    indexes.forEach((index) => {
      const event = audioEvents[index];
      if (!event) return;
      const slot = index % 2;
      if (slots[slot] && index !== audioEventIndex) return;
      slots[slot] = {
        index,
        event,
        source: getReplayAudioSource(event, replay),
      };
    });
    return slots;
  }, [audioEventIndex, audioEvents, hasUpcomingAudioEvent, replay, upcomingAudioEventIndex]);
  const activeAudioSlot = audioEventIndex >= 0 ? audioEventIndex % 2 : -1;
  const audioSource = activeAudioSlot >= 0 ? (audioSlots[activeAudioSlot]?.source || '') : '';
  const nextAudioStart = audioEventIndex >= 0 && hasUpcomingAudioEvent
    ? Number(audioEvents[upcomingAudioEventIndex]?.offsetMs)
    : null;
  const upcomingAudioStart = hasUpcomingAudioEvent
    ? Number(audioEvents[upcomingAudioEventIndex]?.offsetMs)
    : null;

  useLayoutEffect(() => {
    playingRef.current = playing;
    audioClockRef.current = {
      event: audioEvent,
      slot: activeAudioSlot,
      nextAudioStart: Number.isFinite(nextAudioStart) ? nextAudioStart : null,
      upcomingAudioStart: Number.isFinite(upcomingAudioStart) ? upcomingAudioStart : null,
    };
  }, [activeAudioSlot, audioEvent, nextAudioStart, playing, upcomingAudioStart]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleFullscreenChange = () => {
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
      const playerIsFullscreen = fullscreenElement === playerRef.current;
      fullscreenRequestPendingRef.current = false;
      setIsNativeFullscreen(playerIsFullscreen);
      if (playerIsFullscreen) setIsFallbackFullscreen(false);
    };
    const handleFullscreenError = () => {
      if (!fullscreenRequestPendingRef.current) return;
      fullscreenRequestPendingRef.current = false;
      setIsFallbackFullscreen(true);
    };
    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('fullscreenerror', handleFullscreenError);
    document.addEventListener('webkitfullscreenerror', handleFullscreenError);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('fullscreenerror', handleFullscreenError);
      document.removeEventListener('webkitfullscreenerror', handleFullscreenError);
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof document === 'undefined' || !isFallbackFullscreen) return undefined;
    document.body.classList.add('lesson-replay-fullscreen-fallback-active');
    return () => document.body.classList.remove('lesson-replay-fullscreen-fallback-active');
  }, [isFallbackFullscreen]);

  useLayoutEffect(() => {
    if (typeof document === 'undefined' || !isFullscreen) return undefined;
    const handleFullscreenEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (isFallbackFullscreen) {
        event.preventDefault();
        setIsFallbackFullscreen(false);
      }
      // Native fullscreen keeps the browser's default Escape action. Stopping
      // propagation only prevents the surrounding lesson modal from closing.
    };
    document.addEventListener('keydown', handleFullscreenEscape, true);
    return () => document.removeEventListener('keydown', handleFullscreenEscape, true);
  }, [isFallbackFullscreen, isFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const player = playerRef.current;
    if (!player) return;
    if (isFallbackFullscreen) {
      fullscreenRequestPendingRef.current = false;
      setIsFallbackFullscreen(false);
      return;
    }
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
    try {
      if (fullscreenElement === player) {
        fullscreenRequestPendingRef.current = false;
        if (document.exitFullscreen) await document.exitFullscreen();
        else document.webkitExitFullscreen?.();
        return;
      }
      if (fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else document.webkitExitFullscreen?.();
      }
      fullscreenRequestPendingRef.current = true;
      if (player.requestFullscreen) {
        await player.requestFullscreen({ navigationUI: 'hide' });
      } else if (player.webkitRequestFullscreen) {
        const request = player.webkitRequestFullscreen();
        if (request && typeof request.then === 'function') await request;
      } else {
        fullscreenRequestPendingRef.current = false;
        setIsFallbackFullscreen(true);
      }
    } catch {
      fullscreenRequestPendingRef.current = false;
      setIsFallbackFullscreen(true);
    }
  }, [isFallbackFullscreen]);

  const state = useMemo(() => buildStateAt(events, positionMs), [events, positionMs]);
  const followedRole = mode === 'student' ? 'student' : 'teacher';
  const followedState = state.actors[followedRole];
  const surfaceState = mode === 'free' ? state : followedState;
  const boardEvent = state.board;
  const codeEvent = state.code;
  const runEvent = state.run;
  const screenEvent = surfaceState.screen || (mode === 'free' ? state.screen : null);
  const boardView = surfaceState.boardView?.payload || boardEvent?.payload?.viewport || boardEvent?.payload?.view;
  const codeView = surfaceState.codeView?.payload || codeEvent?.payload?.editor || codeEvent?.payload?.view;
  const hasScreenEvents = events.some((event) => event.type === 'screen' && (event.payload?.snapshotId || event.payload?.active !== false));
  const availableTabs = hasScreenEvents ? ['board', 'code', 'screen'] : ['board', 'code'];

  const followedTab = getFollowSurface(events, positionMs, followedRole);
  const resolvedActiveTab = mode === 'free'
    ? activeTab
    : (followedTab === 'screen' && !hasScreenEvents ? 'board' : followedTab);

  const seekReplayTo = useCallback((rawPositionMs) => {
    const nextPosition = Math.min(durationMs, Math.max(0, Number(rawPositionMs) || 0));
    positionRef.current = nextPosition;
    endedAudioEventIdRef.current = '';
    seekSequenceRef.current += 1;
    setSeekSequence(seekSequenceRef.current);
    setAudioBuffering(false);
    setPositionMs(nextPosition);
  }, [durationMs]);

  const handleAudioEnded = useCallback((slot, entry, audio) => {
    const clock = audioClockRef.current;
    if (!entry || clock.slot !== slot || clock.event?.id !== entry.event?.id) return;
    endedAudioEventIdRef.current = entry.event.id;
    setAudioBuffering(false);
    const recordedDuration = getReplayAudioDurationMs(entry.event);
    const actualDuration = Number.isFinite(audio?.duration) && audio.duration > 0
      ? audio.duration * 1000
      : recordedDuration;
    const actualEnd = Number(entry.event.offsetMs) + actualDuration;
    const nextPosition = Math.min(durationMs, Math.max(positionRef.current, actualEnd));
    positionRef.current = nextPosition;
    setPositionMs(nextPosition);
    if (nextPosition >= durationMs) setPlaying(false);
  }, [durationMs]);

  const handleAudioUnavailable = useCallback((slot, entry) => {
    const clock = audioClockRef.current;
    if (!entry || clock.slot !== slot || clock.event?.id !== entry.event?.id) return;
    endedAudioEventIdRef.current = entry.event.id;
    audioRefs.current[slot]?.pause();
    setAudioBuffering(false);
    const nextPosition = Math.min(
      durationMs,
      Math.max(positionRef.current, Number(entry.event.offsetMs) || 0)
    );
    positionRef.current = nextPosition;
    setPositionMs(nextPosition);
    if (nextPosition >= durationMs) setPlaying(false);
  }, [durationMs]);

  /* eslint-disable react-hooks/immutability -- HTMLMediaElement playback is an imperative browser API synchronized by these effects. */
  useEffect(() => {
    audioRefs.current.forEach((audio) => {
      if (!audio) return;
      audio.playbackRate = speed;
      audio.muted = audioMuted;
    });
  }, [audioMuted, speed]);

  useEffect(() => {
    const entry = activeAudioSlot >= 0 ? audioSlots[activeAudioSlot] : null;
    const audio = activeAudioSlot >= 0 ? audioRefs.current[activeAudioSlot] : null;
    if (!audio || !audioSource || !audioEvent || entry?.event?.id !== audioEvent.id) return undefined;
    if (endedAudioEventIdRef.current === audioEvent.id) return undefined;
    if (endedAudioEventIdRef.current !== audioEvent.id) endedAudioEventIdRef.current = '';
    let cancelled = false;
    let waitingForSeek = false;

    const handlePlayFailure = (error) => {
      if (cancelled) return;
      const clock = audioClockRef.current;
      if (clock.slot !== activeAudioSlot || clock.event?.id !== audioEvent.id) return;
      if (endedAudioEventIdRef.current === audioEvent.id) return;
      setAudioBuffering(false);
      if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
        setPlaying(false);
      } else {
        handleAudioUnavailable(activeAudioSlot, entry);
      }
    };
    const resumeAfterSeek = () => {
      waitingForSeek = false;
      if (cancelled || !playingRef.current) return;
      const clock = audioClockRef.current;
      if (clock.slot !== activeAudioSlot || clock.event?.id !== audioEvent.id) return;
      if (endedAudioEventIdRef.current === audioEvent.id) return;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(handlePlayFailure);
      }
    };
    const applyPosition = () => {
      if (cancelled) return;
      const clock = audioClockRef.current;
      if (clock.slot !== activeAudioSlot || clock.event?.id !== audioEvent.id) return;
      const desiredTime = Math.max(0, (positionRef.current - Number(audioEvent.offsetMs)) / 1000);
      waitingForSeek = true;
      audio.addEventListener('seeked', resumeAfterSeek, { once: true });
      try {
        audio.currentTime = Number.isFinite(audio.duration)
          ? Math.min(desiredTime, Math.max(0, audio.duration - 0.02))
          : desiredTime;
      } catch {
        audio.removeEventListener('seeked', resumeAfterSeek);
        waitingForSeek = false;
        resumeAfterSeek();
        return;
      }
      if (!audio.seeking) {
        audio.removeEventListener('seeked', resumeAfterSeek);
        waitingForSeek = false;
        resumeAfterSeek();
      }
    };

    if (audio.readyState >= 1) applyPosition();
    else audio.addEventListener('loadedmetadata', applyPosition, { once: true });
    return () => {
      cancelled = true;
      audio.removeEventListener('loadedmetadata', applyPosition);
      if (waitingForSeek) audio.removeEventListener('seeked', resumeAfterSeek);
    };
  }, [activeAudioSlot, audioEvent, audioSlots, audioSource, handleAudioUnavailable, seekSequence]);

  useEffect(() => {
    audioRefs.current.forEach((audio, slot) => {
      if (audio && slot !== activeAudioSlot) audio.pause();
    });
    const entry = activeAudioSlot >= 0 ? audioSlots[activeAudioSlot] : null;
    const audio = activeAudioSlot >= 0 ? audioRefs.current[activeAudioSlot] : null;
    if (!audio || !audioSource || !audioEvent || entry?.event?.id !== audioEvent.id) return undefined;
    if (endedAudioEventIdRef.current === audioEvent.id) {
      audio.pause();
      return undefined;
    }
    if (!playing) {
      audio.pause();
      return undefined;
    }
    if (audio.readyState < 1 || audio.seeking) return undefined;
    let cancelled = false;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((error) => {
        if (cancelled) return;
        const clock = audioClockRef.current;
        if (clock.slot !== activeAudioSlot || clock.event?.id !== audioEvent.id) return;
        if (endedAudioEventIdRef.current === audioEvent.id) return;
        setAudioBuffering(false);
        if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
          setPlaying(false);
        } else {
          handleAudioUnavailable(activeAudioSlot, entry);
        }
      });
    }
    return () => { cancelled = true; };
  }, [activeAudioSlot, audioEvent, audioSlots, audioSource, handleAudioUnavailable, playing]);

  useEffect(() => {
    if (!playing || activeAudioSlot < 0 || !audioEvent || !audioSource) return undefined;
    const entry = audioSlots[activeAudioSlot];
    const audio = audioRefs.current[activeAudioSlot];
    if (
      !entry
      || !audio
      || entry.event?.id !== audioEvent.id
      || endedAudioEventIdRef.current === audioEvent.id
      || (!audioBuffering && audio.readyState >= 2)
    ) {
      return undefined;
    }
    setAudioBuffering(true);
    const eventId = audioEvent.id;
    const timerId = window.setTimeout(() => {
      const clock = audioClockRef.current;
      const currentAudio = audioRefs.current[activeAudioSlot];
      if (
        !playingRef.current
        || clock.slot !== activeAudioSlot
        || clock.event?.id !== eventId
        || (!audioBuffering && currentAudio && currentAudio.readyState >= 2)
      ) return;
      handleAudioUnavailable(activeAudioSlot, entry);
    }, AUDIO_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timerId);
  }, [activeAudioSlot, audioBuffering, audioEvent, audioSlots, audioSource, handleAudioUnavailable, playing, seekSequence]);
  /* eslint-enable react-hooks/immutability */

  useEffect(() => {
    if (!playing || typeof window === 'undefined') return undefined;
    lastFrameAtRef.current = performance.now();
    const tick = (now) => {
      const delta = Math.max(0, now - lastFrameAtRef.current) * speed;
      lastFrameAtRef.current = now;
      const clock = audioClockRef.current;
      const audio = clock.slot >= 0 ? audioRefs.current[clock.slot] : null;
      const audioEnded = Boolean(
        clock.event?.id
        && endedAudioEventIdRef.current === clock.event.id
      );
      const audioCanDriveClock = Boolean(
        clock.event
        && audio
        && !audioEnded
        && !audio.paused
        && !audio.ended
        && !audio.seeking
        && audio.readyState >= 2
      );
      let next;
      if (audioCanDriveClock) {
        next = Number(clock.event.offsetMs) + (Math.max(0, audio.currentTime) * 1000);
        if (
          Number.isFinite(clock.nextAudioStart)
          && clock.nextAudioStart > Number(clock.event.offsetMs)
          && next >= clock.nextAudioStart
        ) next = clock.nextAudioStart;
      } else if (clock.event && !audioEnded) {
        // The audio element is loading or stalled. Keep board/code on the same
        // sample instead of skipping speech to catch a wall-clock timeline.
        next = positionRef.current;
      } else {
        next = positionRef.current + delta;
        const boundary = clock.event ? clock.nextAudioStart : clock.upcomingAudioStart;
        if (
          Number.isFinite(boundary)
          && boundary > positionRef.current
          && next >= boundary
        ) next = boundary;
      }
      next = Math.min(durationMs, Math.max(0, next));
      positionRef.current = next;
      const reachedAudioBoundary = next === clock.nextAudioStart || next === clock.upcomingAudioStart;
      if (next >= durationMs || reachedAudioBoundary || now - lastRenderedAtRef.current >= 80) {
        lastRenderedAtRef.current = now;
        setPositionMs(next);
      }
      if (next >= durationMs) { setPlaying(false); return; }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [durationMs, playing, speed]);

  const markers = events.length <= 120 ? events : events.filter((_, index) => index % Math.ceil(events.length / 120) === 0);
  const currentEvent = mode === 'free' ? state.current : (followedState.current || state.current);
  const currentLabel = getEventLabel(currentEvent);
  const actorName = currentEvent?.type === 'screen'
    ? (currentEvent?.payload?.sharedByName || currentEvent?.actor?.name || '')
    : (currentEvent?.actor?.name || '');

  if (events.length === 0) return null;

  const togglePlaying = () => {
    if (positionRef.current >= durationMs) seekReplayTo(0);
    setPlaying((current) => !current);
  };

  const openTimeMachine = () => {
    const nextSurface = resolvedActiveTab === 'code' ? 'code' : 'board';
    setTimeMachineSurface((current) => (timeMachineBranch ? current : nextSurface));
    setTimeMachineOpen(true);
  };

  const startTimeMachineBranch = () => {
    const anchorPositionMs = Math.min(durationMs, Math.max(0, Number(positionRef.current) || 0));
    setPlaying(false);
    seekReplayTo(anchorPositionMs);
    setTimeMachineBranchEpoch((current) => current + 1);
    setTimeMachineBranch(createLessonReplayBranch(replay, anchorPositionMs));
  };

  const updateTimeMachineCode = (patch, expectedRevision = null) => {
    setTimeMachineBranch((current) => (
      current && (expectedRevision === null || current.revision === expectedRevision)
        ? updateLessonReplayBranchCode(current, patch)
        : current
    ));
  };

  const updateTimeMachineBoard = (items) => {
    setTimeMachineBranch((current) => (
      current ? updateLessonReplayBranchBoard(current, items) : current
    ));
  };

  const resetTimeMachineBranch = () => {
    setTimeMachineBranchEpoch((current) => current + 1);
    setTimeMachineBranch((current) => (
      current ? createLessonReplayBranch(replay, current.metadata.positionMs) : current
    ));
  };

  return (
    <section
      ref={playerRef}
      className={`lesson-replay-player${isFullscreen ? ' is-fullscreen' : ''}${isFallbackFullscreen ? ' is-fullscreen-fallback' : ''}${timeMachineOpen ? ' is-time-machine' : ''}`}
      data-fullscreen-mode={isNativeFullscreen ? 'native' : (isFallbackFullscreen ? 'fallback' : 'inline')}
      aria-label="Воспроизведение хода занятия"
    >
      <header className="lesson-replay-player__header">
        <span className="lesson-replay-player__icon"><Play size={17} fill="currentColor" /></span>
        <div><span>Ход занятия</span><strong>Воспроизведение урока</strong></div>
        <button
          type="button"
          className={`lesson-replay-player__audio${audioEvents.length > 0 ? ' is-available' : ''}`}
          onClick={() => audioEvents.length > 0 && setAudioMuted((current) => !current)}
          disabled={audioEvents.length === 0}
        >
          {audioEvents.length > 0 && !audioMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
          {audioEvents.length > 0
            ? (audioEvent && audioBuffering && playing ? 'Загрузка звука…' : (audioMuted ? 'Звук выключен' : 'Со звуком'))
            : 'Без звука'}
        </button>
        <div className="lesson-replay-player__audio-elements" aria-hidden="true">
          {audioSlots.map((entry, slot) => (
            <audio
              key={`lesson-replay-audio-slot-${slot}`}
              ref={(node) => { audioRefs.current[slot] = node; }}
              src={entry?.source || undefined}
              preload="auto"
              muted={audioMuted}
              onWaiting={() => {
                if (audioClockRef.current.slot === slot && playing) setAudioBuffering(true);
              }}
              onStalled={() => {
                if (audioClockRef.current.slot === slot && playing) setAudioBuffering(true);
              }}
              onSeeking={() => {
                if (audioClockRef.current.slot === slot && playing) setAudioBuffering(true);
              }}
              onCanPlay={() => {
                if (audioClockRef.current.slot === slot) setAudioBuffering(false);
              }}
              onPlaying={() => {
                if (audioClockRef.current.slot === slot) setAudioBuffering(false);
              }}
              onEnded={(event) => handleAudioEnded(slot, entry, event.currentTarget)}
              onError={() => {
                if (audioClockRef.current.slot !== slot) return;
                handleAudioUnavailable(slot, entry);
              }}
            />
          ))}
        </div>
        <button
          type="button"
          className="lesson-replay-player__fullscreen"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть запись на весь экран'}
          aria-pressed={isFullscreen}
          title={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          <span>{isFullscreen ? 'Свернуть' : 'На весь экран'}</span>
        </button>
      </header>

      {timeMachineOpen ? (
        <TimeMachineWorkspace
          branch={timeMachineBranch}
          branchEpoch={timeMachineBranchEpoch}
          boardEvent={boardEvent}
          boardView={boardView}
          codeEvent={codeEvent}
          codeView={codeView}
          createPythonWorker={createPythonWorker}
          onBranchBoardChange={updateTimeMachineBoard}
          onBranchCodePatch={updateTimeMachineCode}
          onClose={() => setTimeMachineOpen(false)}
          onResetBranch={resetTimeMachineBranch}
          onStartBranch={startTimeMachineBranch}
          onSurfaceChange={setTimeMachineSurface}
          playing={playing}
          positionMs={positionMs}
          runEvent={runEvent}
          surface={timeMachineSurface}
        />
      ) : (
        <>
      <div className="lesson-replay-player__viewbar">
        <div className="lesson-replay-player__modes" role="group" aria-label="Режим просмотра">
          <button type="button" aria-pressed={mode === 'teacher'} className={mode === 'teacher' ? 'is-active' : ''} onClick={() => setMode('teacher')}><UserRound size={14} /> За учителем</button>
          <button type="button" aria-pressed={mode === 'student'} className={mode === 'student' ? 'is-active' : ''} onClick={() => setMode('student')}><UserRound size={14} /> За учеником</button>
          <button type="button" aria-pressed={mode === 'free'} className={mode === 'free' ? 'is-active' : ''} onClick={() => { setActiveTab(resolvedActiveTab); setMode('free'); }}><MousePointer2 size={14} /> Самостоятельно</button>
        </div>
        <span className="lesson-replay-player__mode-hint">
          {mode === 'free' ? 'Можно двигать доску и прокручивать код' : `Показываем перемещения ${followedRole === 'teacher' ? 'учителя' : 'ученика'}`}
        </span>
      </div>

      <div className="lesson-replay-player__chapter">
        <div className="lesson-replay-player__chapter-icon"><ListChecks size={17} /></div>
        <div><span>{formatClock(currentEvent?.offsetMs || 0)}{actorName ? ` · ${actorName}` : ''}</span><strong>{currentLabel}</strong></div>
      </div>

      {mode === 'free' ? (
        <div className="lesson-replay-player__split-stage">
          <section className="lesson-replay-player__split-pane lesson-replay-player__split-pane--code">
            <header><Code2 size={15} />{SURFACE_TABS.code.label}</header>
            <div className="lesson-replay-player__split-content">
              <ReplayCode event={codeEvent} runEvent={runEvent} recordedView={codeView} freeNavigation />
            </div>
          </section>
          <section className="lesson-replay-player__split-pane lesson-replay-player__split-pane--board">
            <header><PenTool size={15} />{SURFACE_TABS.board.label}</header>
            <div className="lesson-replay-player__split-content">
              <ReplayBoard key="free" items={boardEvent?.payload?.items} recordedView={boardView} freeNavigation />
            </div>
          </section>
        </div>
      ) : (
        <>
          <nav className="lesson-replay-player__tabs" aria-label="Содержимое записи">
            {availableTabs.map((tab) => {
              const Icon = SURFACE_TABS[tab].icon;
              return <button key={tab} type="button" className={resolvedActiveTab === tab ? 'is-active' : ''} onClick={() => { setActiveTab(tab); setMode('free'); }}><Icon size={15} />{SURFACE_TABS[tab].label}</button>;
            })}
          </nav>

          <div className="lesson-replay-player__stage" data-surface={resolvedActiveTab}>
            {resolvedActiveTab === 'screen' ? (
              <ReplayScreen event={screenEvent} occurrence={replay?.occurrence} />
            ) : resolvedActiveTab === 'board' ? (
              <ReplayBoard key={mode} items={boardEvent?.payload?.items} recordedView={boardView} freeNavigation={false} />
            ) : (
              <ReplayCode event={codeEvent} runEvent={runEvent} recordedView={codeView} freeNavigation={false} />
            )}
          </div>
        </>
      )}
        </>
      )}

      <div className="lesson-replay-player__timeline">
        <div className="lesson-replay-player__markers" aria-hidden="true">
          {markers.map((event) => <i key={event.id} data-type={event.type} style={{ left: `${Math.min(100, Math.max(0, (event.offsetMs / durationMs) * 100))}%` }} />)}
          {timeMachineBranch && <i className="is-time-machine-anchor" data-type="branch" style={{ left: `${Math.min(100, Math.max(0, (timeMachineBranch.metadata.positionMs / durationMs) * 100))}%` }} />}
        </div>
        <input
          type="range"
          min="0"
          max={Math.max(1, Math.round(durationMs))}
          step="100"
          value={Math.min(durationMs, Math.round(positionMs))}
          onChange={(event) => seekReplayTo(event.target.value)}
          aria-label="Позиция воспроизведения"
          aria-valuetext={`${formatClock(positionMs)} из ${formatClock(durationMs)}`}
        />
      </div>

      <footer className="lesson-replay-player__controls">
        <button type="button" className="lesson-replay-player__play" onClick={togglePlaying} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}<span>{playing ? 'Пауза' : 'Смотреть'}</span>
        </button>
        <button type="button" className="lesson-replay-player__restart" onClick={() => { seekReplayTo(0); setPlaying(false); }} aria-label="В начало"><RotateCcw size={16} /></button>
        <button
          type="button"
          className={`lesson-replay-player__time-machine-toggle${timeMachineOpen ? ' is-active' : ''}`}
          onClick={() => (timeMachineOpen ? setTimeMachineOpen(false) : openTimeMachine())}
          aria-pressed={timeMachineOpen}
        >
          <History size={16} /><span>{timeMachineOpen ? 'Закрыть копию' : 'Машина времени'}</span>
        </button>
        <span className="lesson-replay-player__time">{formatClock(positionMs)} <em>/</em> {formatClock(durationMs)}</span>
        <div className="lesson-replay-player__speeds" role="group" aria-label="Скорость воспроизведения">
          {[1, 2, 4].map((value) => <button key={value} type="button" className={speed === value ? 'is-active' : ''} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}
        </div>
      </footer>
    </section>
  );
};

export default LessonReplayPlayer;
