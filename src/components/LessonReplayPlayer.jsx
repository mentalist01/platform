import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, ListChecks, Pause, PenTool, Play, RotateCcw, VolumeX } from 'lucide-react';

import { resolveAuthenticatedUploadsUrl } from '../services/api';
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
  board: 'Доска',
  run: 'Запуск',
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
  if (event.type === 'board') return 'Изменение на доске';
  if (event.type === 'run') return 'Запуск программы';
  if (event.type === 'session') return event.payload?.action === 'end' ? 'Занятие завершено' : 'Занятие началось';
  return EVENT_LABELS[event.type] || 'Действие';
};

const buildStateAt = (events, positionMs) => {
  const state = {
    current: null,
    navigation: null,
    task: null,
    code: null,
    board: null,
    run: null,
  };
  for (const event of events) {
    if (event.offsetMs > positionMs) break;
    state.current = event;
    if (event.type === 'task' && event.payload?.active === false) state.task = null;
    else if (Object.prototype.hasOwnProperty.call(state, event.type)) state[event.type] = event;
  }
  return state;
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

const ReplayBoard = ({ items }) => {
  const normalizedItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const viewBox = useMemo(() => {
    const bounds = normalizedItems.map(getItemBounds).filter(Boolean);
    if (bounds.length === 0) return '-20 -20 900 520';
    const minX = Math.min(...bounds.map((entry) => entry.minX));
    const minY = Math.min(...bounds.map((entry) => entry.minY));
    const maxX = Math.max(...bounds.map((entry) => entry.maxX));
    const maxY = Math.max(...bounds.map((entry) => entry.maxY));
    const padding = Math.max(28, Math.min(100, Math.max(maxX - minX, maxY - minY) * 0.08));
    return `${minX - padding} ${minY - padding} ${Math.max(240, maxX - minX + padding * 2)} ${Math.max(140, maxY - minY + padding * 2)}`;
  }, [normalizedItems]);

  if (normalizedItems.length === 0) {
    return <div className="lesson-replay-player__empty-surface"><PenTool size={25} /><span>На этом моменте доска пустая</span></div>;
  }

  return (
    <svg className="lesson-replay-player__board" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-label="Состояние доски">
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
          return (
            <line
              key={key}
              x1={item.start?.x || 0}
              y1={item.start?.y || 0}
              x2={item.end?.x || 0}
              y2={item.end?.y || 0}
              stroke={item.color}
              strokeWidth={item.width || 3}
              strokeLinecap="round"
              markerEnd={item.type === 'arrow' ? 'url(#lesson-replay-arrow)' : undefined}
            />
          );
        }
        if (item.type === 'shape') {
          if (item.shape === 'ellipse') {
            return <ellipse key={key} cx={(item.x || 0) + (item.width || 1) / 2} cy={(item.y || 0) + (item.height || 1) / 2} rx={(item.width || 1) / 2} ry={(item.height || 1) / 2} fill="none" stroke={item.color} strokeWidth={item.strokeWidth || 3} />;
          }
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
        if (item.type === 'image' && item.assetUrl) {
          const source = resolveAuthenticatedUploadsUrl(item.assetUrl);
          return <image key={key} href={source} x={item.x || 0} y={item.y || 0} width={item.width || 1} height={item.height || 1} preserveAspectRatio="none" transform={item.flipX ? `translate(${(item.x || 0) * 2 + (item.width || 1)} 0) scale(-1 1)` : undefined} />;
        }
        return null;
      })}
    </svg>
  );
};

const ReplayCode = ({ event, runEvent }) => {
  const payload = event?.payload || {};
  const runPayload = runEvent && Number(runEvent.offsetMs) >= Number(event?.offsetMs || 0)
    ? (runEvent.payload || {})
    : {};
  const error = runPayload.error || payload.error;
  const output = error || runPayload.output || payload.output;
  return (
    <div className="lesson-replay-player__code-layout">
      <pre className="lesson-replay-player__code"><code>{payload.code || '# Код пока не появился'}</code></pre>
      {(payload.input || payload.testFile || output) && (
        <div className="lesson-replay-player__console-grid">
          {(payload.input || payload.testFile) && (
            <section><span>Ввод</span><pre>{payload.input || payload.testFile}</pre></section>
          )}
          {output && (
            <section className={error ? 'is-error' : ''}><span>{error ? 'Ошибка' : 'Результат'}</span><pre>{output}</pre></section>
          )}
        </div>
      )}
    </div>
  );
};

const LessonReplayPlayer = ({ replay }) => {
  const events = useMemo(() => (
    (Array.isArray(replay?.events) ? replay.events : [])
      .map((event) => ({ ...event, offsetMs: Math.max(0, Number(event?.offsetMs) || 0) }))
      .sort((left, right) => left.offsetMs - right.offsetMs || String(left.id).localeCompare(String(right.id)))
  ), [replay]);
  const durationMs = useMemo(() => Math.max(
    1000,
    Number(replay?.durationMs) || 0,
    ...events.map((event) => event.offsetMs)
  ), [events, replay?.durationMs]);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const positionRef = useRef(0);
  const frameRef = useRef(null);
  const lastFrameAtRef = useRef(0);
  const lastRenderedAtRef = useRef(0);

  useEffect(() => {
    positionRef.current = positionMs;
  }, [positionMs]);

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
      if (next >= durationMs) {
        setPlaying(false);
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [durationMs, playing, speed]);

  const state = useMemo(() => buildStateAt(events, positionMs), [events, positionMs]);
  const currentView = state.navigation?.payload?.view || '';
  const navigationOffsetMs = Number(state.navigation?.offsetMs) || 0;
  const latestSurfaceEvent = [state.code, state.board, state.run]
    .filter(Boolean)
    .sort((left, right) => right.offsetMs - left.offsetMs)[0] || null;
  const surfaceEventIsCurrent = latestSurfaceEvent && latestSurfaceEvent.offsetMs >= navigationOffsetMs;
  const surface = surfaceEventIsCurrent
    ? (latestSurfaceEvent.type === 'board' ? 'board' : 'code')
    : 'context';
  const markers = events.length <= 120
    ? events
    : events.filter((_, index) => index % Math.ceil(events.length / 120) === 0);
  const currentLabel = getEventLabel(state.current);
  const actorName = state.current?.actor?.name || '';

  if (events.length === 0) return null;

  const togglePlaying = () => {
    if (positionRef.current >= durationMs) {
      positionRef.current = 0;
      setPositionMs(0);
    }
    setPlaying((current) => !current);
  };

  return (
    <section className="lesson-replay-player" aria-label="Воспроизведение хода занятия">
      <header className="lesson-replay-player__header">
        <span className="lesson-replay-player__icon"><Play size={17} fill="currentColor" /></span>
        <div>
          <span>Ход занятия</span>
          <strong>Воспроизведение действий</strong>
        </div>
        <span className="lesson-replay-player__silent"><VolumeX size={14} /> Без звука</span>
      </header>

      <div className="lesson-replay-player__chapter">
        <div className="lesson-replay-player__chapter-icon">
          {surface === 'board' ? <PenTool size={17} /> : (surface === 'code' ? <Code2 size={17} /> : <ListChecks size={17} />)}
        </div>
        <div>
          <span>{formatClock(state.current?.offsetMs || 0)}{actorName ? ` · ${actorName}` : ''}</span>
          <strong>{currentLabel}</strong>
        </div>
      </div>

      <div className="lesson-replay-player__stage" data-surface={surface}>
        {surface === 'board' && state.board ? (
          <ReplayBoard items={state.board.payload?.items} />
        ) : surface === 'code' && state.code ? (
          <ReplayCode event={state.code} runEvent={state.run} />
        ) : (
          <div className="lesson-replay-player__context">
            <span>{currentView ? (VIEW_LABELS[currentView] || state.navigation?.payload?.label || currentView) : 'Занятие началось'}</span>
            <strong>{state.task ? getEventLabel(state.task) : 'Перемотай таймлайн — здесь появятся задания, код и доска'}</strong>
          </div>
        )}
      </div>

      <div className="lesson-replay-player__timeline">
        <div className="lesson-replay-player__markers" aria-hidden="true">
          {markers.map((event) => (
            <i
              key={event.id}
              data-type={event.type}
              style={{ left: `${Math.min(100, Math.max(0, (event.offsetMs / durationMs) * 100))}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          min="0"
          max={Math.max(1, Math.round(durationMs))}
          step="100"
          value={Math.min(durationMs, Math.round(positionMs))}
          onChange={(event) => {
            const next = Number(event.target.value) || 0;
            positionRef.current = next;
            setPositionMs(next);
          }}
          aria-label="Позиция воспроизведения"
        />
      </div>

      <footer className="lesson-replay-player__controls">
        <button type="button" className="lesson-replay-player__play" onClick={togglePlaying} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          <span>{playing ? 'Пауза' : 'Смотреть'}</span>
        </button>
        <button
          type="button"
          className="lesson-replay-player__restart"
          onClick={() => {
            positionRef.current = 0;
            setPositionMs(0);
            setPlaying(false);
          }}
          aria-label="В начало"
        >
          <RotateCcw size={16} />
        </button>
        <span className="lesson-replay-player__time">{formatClock(positionMs)} <em>/</em> {formatClock(durationMs)}</span>
        <div className="lesson-replay-player__speeds" role="group" aria-label="Скорость воспроизведения">
          {[1, 2, 4].map((value) => (
            <button key={value} type="button" className={speed === value ? 'is-active' : ''} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>
          ))}
        </div>
      </footer>
    </section>
  );
};

export default LessonReplayPlayer;
