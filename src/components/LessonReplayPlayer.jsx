import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Code2,
  ListChecks,
  MonitorUp,
  MousePointer2,
  Pause,
  PenTool,
  Play,
  RotateCcw,
  UserRound,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { api, resolveAuthenticatedUploadsUrl } from '../services/api';
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
  let imageY = y + 78;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="18" fill="#fff" stroke={status === 'idle' ? '#d8d2f4' : accent} strokeWidth={status === 'idle' ? 1.5 : 2.5} />
      <path d={`M ${x + 18} ${y + 1} H ${x + width - 18} Q ${x + width - 1} ${y + 1} ${x + width - 1} ${y + 18} V ${y + 62} H ${x + 1} V ${y + 18} Q ${x + 1} ${y + 1} ${x + 18} ${y + 1}`} fill="#f6f3ff" />
      <rect x={x + 18} y={y + 15} width="34" height="34" rx="10" fill={accent} />
      <text x={x + 35} y={y + 37} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800">{String(item.questionNumber || item.taskNumber || '?').slice(0, 4)}</text>
      <text x={x + 64} y={y + 34} fill="#211a35" fontSize="17" fontWeight="800">{String(item.heading || `Задание ${item.taskDisplayNumber || item.taskNumber || ''}`).slice(0, 72)}</text>
      {(item.screenshots || []).map((screenshot, index) => {
        const imageHeight = Math.max(40, Number(screenshot?.displayHeight) || 220);
        const currentY = imageY;
        imageY += imageHeight + 12;
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

const ReplayBoard = ({ items, recordedView, freeNavigation }) => {
  const normalizedItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const fitView = useMemo(() => getFitView(normalizedItems), [normalizedItems]);
  const [freeView, setFreeView] = useState(null);
  const pointerRef = useRef(null);
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
          setFreeView({
            ...origin.view,
            x: origin.view.x - ((event.clientX - origin.x) / Math.max(1, rect.width)) * origin.view.width,
            y: origin.view.y - ((event.clientY - origin.y) / Math.max(1, rect.height)) * origin.view.height,
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
          <marker id="lesson-replay-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        {normalizedItems.map((item) => {
          const key = item.id;
          if (item.type === 'stroke') {
            const points = (item.points || []).map((point) => `${Number(point?.x) || 0},${Number(point?.y) || 0}`).join(' ');
            return <polyline key={key} points={points} fill="none" stroke={item.color} strokeWidth={item.width || 3} strokeLinecap="round" strokeLinejoin="round" />;
          }
          if (item.type === 'line' || item.type === 'arrow') {
            return <line key={key} x1={item.start?.x || 0} y1={item.start?.y || 0} x2={item.end?.x || 0} y2={item.end?.y || 0} stroke={item.color} strokeWidth={item.width || 3} strokeLinecap="round" markerEnd={item.type === 'arrow' ? 'url(#lesson-replay-arrow)' : undefined} />;
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
          if (item.type === 'task') {
            return <ReplayBoardTask key={key} item={item} />;
          }
          if (item.type === 'image' && item.assetUrl) {
            const source = resolveAuthenticatedUploadsUrl(item.assetUrl);
            return <image key={key} href={source} x={item.x || 0} y={item.y || 0} width={item.width || 1} height={item.height || 1} preserveAspectRatio="none" transform={item.flipX ? `translate(${(item.x || 0) * 2 + (item.width || 1)} 0) scale(-1 1)` : undefined} />;
          }
          return null;
        })}
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

const LessonReplayPlayer = ({ replay }) => {
  const events = useMemo(() => (
    (Array.isArray(replay?.events) ? replay.events : [])
      .map((event) => ({ ...event, offsetMs: Math.max(0, Number(event?.offsetMs) || 0) }))
      .sort((left, right) => left.offsetMs - right.offsetMs || String(left.id).localeCompare(String(right.id)))
  ), [replay]);
  const durationMs = useMemo(() => Math.max(1000, Number(replay?.durationMs) || 0, ...events.map((event) => event.offsetMs)), [events, replay?.durationMs]);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState('teacher');
  const [activeTab, setActiveTab] = useState('board');
  const [audioMuted, setAudioMuted] = useState(false);
  const positionRef = useRef(0);
  const frameRef = useRef(null);
  const lastFrameAtRef = useRef(0);
  const lastRenderedAtRef = useRef(0);
  const audioRef = useRef(null);

  useEffect(() => { positionRef.current = positionMs; }, [positionMs]);

  useEffect(() => {
    if (!playing || typeof window === 'undefined') return undefined;
    lastFrameAtRef.current = performance.now();
    const tick = (now) => {
      const delta = Math.max(0, now - lastFrameAtRef.current) * speed;
      lastFrameAtRef.current = now;
      const next = Math.min(durationMs, positionRef.current + delta);
      positionRef.current = next;
      if (next >= durationMs || now - lastRenderedAtRef.current >= 80) {
        lastRenderedAtRef.current = now;
        setPositionMs(next);
      }
      if (next >= durationMs) { setPlaying(false); return; }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [durationMs, playing, speed]);

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

  const audioEvents = useMemo(() => events.filter((event) => (
    event.type === 'audio'
    && (event.payload?.audioId || event.payload?.playbackUrl || event.payload?.url)
  )), [events]);
  const audioEvent = useMemo(() => {
    let current = null;
    for (const event of audioEvents) {
      if (event.offsetMs > positionMs) break;
      const duration = Math.max(250, Number(event.payload?.durationMs) || 30_000);
      if (positionMs <= event.offsetMs + duration + 500) current = event;
    }
    return current;
  }, [audioEvents, positionMs]);
  const audioSource = audioEvent
    ? (audioEvent.payload?.audioId
      ? api.getLessonReplayAudioUrl(
        replay?.occurrence?.studentId,
        replay?.occurrence?.key,
        audioEvent.payload.audioId
      )
      : resolveAuthenticatedUploadsUrl(audioEvent.payload?.playbackUrl || audioEvent.payload?.url))
    : '';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSource || !audioEvent) return;
    audio.playbackRate = speed;
    audio.muted = audioMuted;
    const desiredTime = Math.max(0, (positionRef.current - audioEvent.offsetMs) / 1000);
    if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(desiredTime, Math.max(0, audio.duration - 0.05));
    else audio.currentTime = desiredTime;
    if (playing) audio.play().catch(() => undefined);
    else audio.pause();
  }, [audioEvent, audioMuted, audioSource, playing, speed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSource || !audioEvent) return;
    const desiredTime = Math.max(0, (positionMs - audioEvent.offsetMs) / 1000);
    if (Math.abs(audio.currentTime - desiredTime) > 0.8) audio.currentTime = desiredTime;
  }, [audioEvent, audioSource, positionMs]);

  const markers = events.length <= 120 ? events : events.filter((_, index) => index % Math.ceil(events.length / 120) === 0);
  const currentEvent = mode === 'free' ? state.current : (followedState.current || state.current);
  const currentLabel = getEventLabel(currentEvent);
  const actorName = currentEvent?.type === 'screen'
    ? (currentEvent?.payload?.sharedByName || currentEvent?.actor?.name || '')
    : (currentEvent?.actor?.name || '');

  if (events.length === 0) return null;

  const togglePlaying = () => {
    if (positionRef.current >= durationMs) { positionRef.current = 0; setPositionMs(0); }
    setPlaying((current) => !current);
  };

  return (
    <section className="lesson-replay-player" aria-label="Воспроизведение хода занятия">
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
          {audioEvents.length > 0 ? (audioMuted ? 'Звук выключен' : 'Со звуком') : 'Без звука'}
        </button>
        {audioSource && <audio ref={audioRef} key={audioSource} src={audioSource} preload="metadata" />}
      </header>

      <div className="lesson-replay-player__viewbar">
        <div className="lesson-replay-player__modes" role="group" aria-label="Режим просмотра">
          <button type="button" className={mode === 'teacher' ? 'is-active' : ''} onClick={() => setMode('teacher')}><UserRound size={14} /> За учителем</button>
          <button type="button" className={mode === 'student' ? 'is-active' : ''} onClick={() => setMode('student')}><UserRound size={14} /> За учеником</button>
          <button type="button" className={mode === 'free' ? 'is-active' : ''} onClick={() => { setActiveTab(resolvedActiveTab); setMode('free'); }}><MousePointer2 size={14} /> Самостоятельно</button>
        </div>
        <span className="lesson-replay-player__mode-hint">
          {mode === 'free' ? 'Можно двигать доску и прокручивать код' : `Показываем перемещения ${followedRole === 'teacher' ? 'учителя' : 'ученика'}`}
        </span>
      </div>

      <div className="lesson-replay-player__chapter">
        <div className="lesson-replay-player__chapter-icon"><ListChecks size={17} /></div>
        <div><span>{formatClock(currentEvent?.offsetMs || 0)}{actorName ? ` · ${actorName}` : ''}</span><strong>{currentLabel}</strong></div>
      </div>

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
          <ReplayBoard key={mode} items={boardEvent?.payload?.items} recordedView={boardView} freeNavigation={mode === 'free'} />
        ) : (
          <ReplayCode event={codeEvent} runEvent={runEvent} recordedView={codeView} freeNavigation={mode === 'free'} />
        )}
      </div>

      <div className="lesson-replay-player__timeline">
        <div className="lesson-replay-player__markers" aria-hidden="true">
          {markers.map((event) => <i key={event.id} data-type={event.type} style={{ left: `${Math.min(100, Math.max(0, (event.offsetMs / durationMs) * 100))}%` }} />)}
        </div>
        <input
          type="range"
          min="0"
          max={Math.max(1, Math.round(durationMs))}
          step="100"
          value={Math.min(durationMs, Math.round(positionMs))}
          onChange={(event) => { const next = Number(event.target.value) || 0; positionRef.current = next; setPositionMs(next); }}
          aria-label="Позиция воспроизведения"
        />
      </div>

      <footer className="lesson-replay-player__controls">
        <button type="button" className="lesson-replay-player__play" onClick={togglePlaying} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}<span>{playing ? 'Пауза' : 'Смотреть'}</span>
        </button>
        <button type="button" className="lesson-replay-player__restart" onClick={() => { positionRef.current = 0; setPositionMs(0); setPlaying(false); }} aria-label="В начало"><RotateCcw size={16} /></button>
        <span className="lesson-replay-player__time">{formatClock(positionMs)} <em>/</em> {formatClock(durationMs)}</span>
        <div className="lesson-replay-player__speeds" role="group" aria-label="Скорость воспроизведения">
          {[1, 2, 4].map((value) => <button key={value} type="button" className={speed === value ? 'is-active' : ''} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}
        </div>
      </footer>
    </section>
  );
};

export default LessonReplayPlayer;
