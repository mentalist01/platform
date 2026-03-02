import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import {
  formatRecordingDuration,
  normalizeTheoryRecording,
  THEORY_RECORDING_EVENT_CODE,
  THEORY_RECORDING_EVENT_RUN_OUTPUT,
  THEORY_RECORDING_EVENT_SELECTION,
} from '../utils/theoryRecording';

const PLAYER_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  readOnly: true,
  fontSize: 21,
  lineNumbers: 'on',
  wordWrap: 'on',
  automaticLayout: true,
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  glyphMargin: false,
  mouseWheelZoom: true,
  fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  smoothScrolling: true,
  cursorSmoothCaretAnimation: 'on',
  padding: { top: 18, bottom: 26 },
};

const THEORY_PLAYER_EDITOR_THEME = 'theory-player-vivid-dark';
const FALLBACK_EMPTY_STATE_TEXT = 'Видеоразбор пока не готов.';

const clampSelectionToModel = (model, selection) => {
  if (!model || !selection || typeof selection !== 'object') return null;
  const lineCount = Math.max(1, Number(model.getLineCount?.()) || 1);
  const clampLine = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return 1;
    return Math.min(lineCount, Math.floor(num));
  };
  const clampColumn = (lineNumber, value) => {
    const maxColRaw = Number(model.getLineMaxColumn?.(lineNumber));
    const maxCol = Number.isFinite(maxColRaw) && maxColRaw > 0 ? Math.floor(maxColRaw) : 1;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return 1;
    return Math.min(maxCol, Math.floor(num));
  };
  const startLineNumber = clampLine(selection.startLineNumber);
  const endLineNumber = clampLine(selection.endLineNumber);
  const startColumn = clampColumn(startLineNumber, selection.startColumn);
  const endColumn = clampColumn(endLineNumber, selection.endColumn);
  if (endLineNumber < startLineNumber || (endLineNumber === startLineNumber && endColumn < startColumn)) {
    return {
      startLineNumber: endLineNumber,
      startColumn: endColumn,
      endLineNumber: startLineNumber,
      endColumn: startColumn,
    };
  }
  return { startLineNumber, startColumn, endLineNumber, endColumn };
};

const clampSelectionsToModel = (model, selections) => (
  (Array.isArray(selections) ? selections : [])
    .map((item) => clampSelectionToModel(model, item))
    .filter(Boolean)
);

const asEditorSelection = (selection) => {
  if (!selection || typeof selection !== 'object') return null;
  const startLineNumber = Number(selection.startLineNumber);
  const startColumn = Number(selection.startColumn);
  const endLineNumber = Number(selection.endLineNumber);
  const endColumn = Number(selection.endColumn);
  if (
    !Number.isFinite(startLineNumber)
    || !Number.isFinite(startColumn)
    || !Number.isFinite(endLineNumber)
    || !Number.isFinite(endColumn)
  ) {
    return null;
  }
  return {
    selectionStartLineNumber: startLineNumber,
    selectionStartColumn: startColumn,
    positionLineNumber: endLineNumber,
    positionColumn: endColumn,
  };
};

const TheoryRecordingPlayer = ({ recording, className = '' }) => {
  const normalized = useMemo(() => normalizeTheoryRecording(recording), [recording]);
  const modelPath = useMemo(() => {
    const source = String(normalized?.updatedAt || normalized?.createdAt || 'draft');
    const safeId = source.replace(/[^0-9a-zA-Z_-]/g, '_');
    return `inmemory://theory-recording/player-${safeId}`;
  }, [normalized?.createdAt, normalized?.updatedAt]);

  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerHovered, setIsPlayerHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [runOutputFrame, setRunOutputFrame] = useState(null);
  const [supportsHover, setSupportsHover] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(hover: hover)').matches;
  });

  const playerContainerRef = useRef(null);
  const editorRef = useRef(null);
  const audioRef = useRef(null);
  const lastAppliedIndexRef = useRef(-1);
  const lastAppliedMsRef = useRef(0);
  const rafRef = useRef(null);

  const resetCursorToStart = useCallback((editor) => {
    if (!editor) return;
    try {
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.revealPosition({ lineNumber: 1, column: 1 });
    } catch {
      // Ignore cursor reset failures.
    }
  }, []);

  const stopFrameLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const applyEvent = useCallback((event) => {
    const editor = editorRef.current;
    if (!editor || !event) return;
    if (event.type === THEORY_RECORDING_EVENT_CODE) {
      const model = editor.getModel();
      if (model && model.getValue() !== event.code) {
        try {
          model.setValue(typeof event.code === 'string' ? event.code : String(event.code ?? ''));
        } catch {
          // Ignore malformed code frame.
        }
      }
      return;
    }
    if (event.type === THEORY_RECORDING_EVENT_SELECTION) {
      if (Array.isArray(event.selections) && event.selections.length > 0) {
        const model = editor.getModel();
        const safeSelections = clampSelectionsToModel(model, event.selections)
          .map((selection) => asEditorSelection(selection))
          .filter(Boolean);
        if (safeSelections.length > 0) {
          try {
            editor.setSelections(safeSelections);
          } catch {
            // Ignore bad timeline selection frames to keep playback alive.
          }
        }
      }
      return;
    }
    if (event.type === THEORY_RECORDING_EVENT_RUN_OUTPUT) {
      setRunOutputFrame({
        input: String(event.input ?? ''),
        output: String(event.output ?? ''),
        error: String(event.error ?? ''),
      });
    }
  }, []);

  const rebuildTo = useCallback((targetMs) => {
    const editor = editorRef.current;
    if (!normalized || !editor) return;
    const model = editor.getModel();
    if (model && model.getValue() !== normalized.initialCode) {
      try {
        model.setValue(normalized.initialCode);
      } catch {
        // Ignore malformed initial code frame.
      }
    }
    lastAppliedIndexRef.current = -1;
    setRunOutputFrame(null);
    const events = normalized.events || [];
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.t > targetMs) break;
      applyEvent(event);
      lastAppliedIndexRef.current = index;
    }
    lastAppliedMsRef.current = targetMs;
    setCurrentMs(targetMs);
  }, [applyEvent, normalized]);

  const syncTo = useCallback((targetMsRaw) => {
    if (!normalized) return;
    const targetMs = Math.max(0, Math.round(targetMsRaw));
    if (targetMs < lastAppliedMsRef.current) {
      rebuildTo(targetMs);
      return;
    }
    const events = normalized.events || [];
    let nextIndex = lastAppliedIndexRef.current + 1;
    while (nextIndex < events.length && events[nextIndex].t <= targetMs) {
      applyEvent(events[nextIndex]);
      lastAppliedIndexRef.current = nextIndex;
      nextIndex += 1;
    }
    lastAppliedMsRef.current = targetMs;
    setCurrentMs(targetMs);
  }, [applyEvent, normalized, rebuildTo]);

  const runFrameLoop = useCallback(function frameLoop() {
    const audio = audioRef.current;
    if (!audio || audio.paused || audio.ended) {
      stopFrameLoop();
      return;
    }
    syncTo(audio.currentTime * 1000);
    rafRef.current = requestAnimationFrame(frameLoop);
  }, [stopFrameLoop, syncTo]);

  const recordingResetKey = useMemo(() => (
    [
      String(normalized?.updatedAt || ''),
      String(normalized?.createdAt || ''),
      String(normalized?.audio?.url || ''),
      String(normalized?.durationMs || 0),
      String(Number(normalized?.events?.length || 0)),
      String(normalized?.initialCode || ''),
    ].join('|')
  ), [
    normalized?.updatedAt,
    normalized?.createdAt,
    normalized?.audio?.url,
    normalized?.durationMs,
    normalized?.events?.length,
    normalized?.initialCode,
  ]);
  const hasNormalizedRecording = Boolean(normalized);
  const normalizedDurationMs = Math.max(0, Math.round(normalized?.durationMs || 0));
  const normalizedInitialCode = String(normalized?.initialCode || '');

  useEffect(() => () => stopFrameLoop(), [stopFrameLoop]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const hoverMedia = window.matchMedia('(hover: hover)');
    const updateHoverSupport = () => setSupportsHover(hoverMedia.matches);
    updateHoverSupport();
    if (typeof hoverMedia.addEventListener === 'function') {
      hoverMedia.addEventListener('change', updateHoverSupport);
      return () => hoverMedia.removeEventListener('change', updateHoverSupport);
    }
    hoverMedia.addListener(updateHoverSupport);
    return () => hoverMedia.removeListener(updateHoverSupport);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const getCurrentFullscreenElement = () => (
      document.fullscreenElement
      || document.webkitFullscreenElement
      || null
    );
    const handleFullscreenChange = () => {
      setIsFullscreen(getCurrentFullscreenElement() === playerContainerRef.current);
    };
    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!hasNormalizedRecording) {
      setCurrentMs(0);
      setDurationMs(0);
      setIsPlaying(false);
      setHasPlaybackStarted(false);
      return;
    }
    setCurrentMs(0);
    setDurationMs(normalizedDurationMs);
    setIsPlaying(false);
    setHasPlaybackStarted(false);
    setIsFullscreen(false);
    setRunOutputFrame(null);
    lastAppliedIndexRef.current = -1;
    lastAppliedMsRef.current = 0;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        try {
          model.setValue(normalizedInitialCode);
        } catch {
          // no-op
        }
      }
      resetCursorToStart(editorRef.current);
    }
  }, [hasNormalizedRecording, normalizedDurationMs, normalizedInitialCode, recordingResetKey, resetCursorToStart]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [isMuted, volume]);

  const handleEditorBeforeMount = useCallback((monaco) => {
    try {
      monaco.editor.defineTheme(THEORY_PLAYER_EDITOR_THEME, {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '86EFAC', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'C084FC' },
          { token: 'number', foreground: 'FB923C' },
          { token: 'string', foreground: 'FDE047' },
          { token: 'type.identifier', foreground: '7DD3FC' },
          { token: 'delimiter', foreground: 'E2E8F0' },
          { token: 'operator', foreground: '818CF8' },
          { token: 'function', foreground: '34D399' },
        ],
        colors: {
          'editor.background': '#050d1f',
          'editor.foreground': '#dbe7ff',
          'editorLineNumber.foreground': '#62708a',
          'editorLineNumber.activeForeground': '#f8fafc',
          'editorCursor.foreground': '#38bdf8',
          'editor.selectionBackground': '#6366f15a',
          'editor.inactiveSelectionBackground': '#33415580',
          'editor.wordHighlightBackground': '#14b8a633',
          'editor.wordHighlightStrongBackground': '#a78bfa33',
          'editorBracketMatch.background': '#22d3ee2b',
          'editorBracketMatch.border': '#22d3ee9c',
          'editorWhitespace.foreground': '#334155',
        },
      });
    } catch {
      // Keep default theme if custom theme registration fails.
    }
  }, []);

  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;
    if (!normalized) return;
    const model = editor.getModel();
    if (model) {
      try {
        model.setValue(normalized.initialCode || '');
      } catch {
        // no-op
      }
    }
    resetCursorToStart(editor);
  }, [normalized, resetCursorToStart]);

  const safeDurationMs = Math.max(
    1,
    Math.round(normalized?.durationMs || 0),
    Math.round(durationMs || 0),
    Math.round(currentMs || 0),
  );
  const clampedCurrentMs = Math.min(Math.max(0, Math.round(currentMs || 0)), safeDurationMs);
  const isAtStart = clampedCurrentMs <= 120;
  const isPrePlaybackState = !isPlaying && isAtStart;
  const playbackProgressPercent = Math.max(0, Math.min(100, (clampedCurrentMs / safeDurationMs) * 100));
  const normalizedVolume = isMuted ? 0 : volume;
  const volumeProgressPercent = Math.max(0, Math.min(100, normalizedVolume * 100));
  const seekTrackStyle = useMemo(() => ({
    background: `linear-gradient(90deg, rgba(37,99,235,0.96) 0%, rgba(34,211,238,0.92) ${playbackProgressPercent}%, rgba(71,85,105,0.55) ${playbackProgressPercent}%, rgba(71,85,105,0.55) 100%)`,
  }), [playbackProgressPercent]);
  const volumeTrackStyle = useMemo(() => ({
    background: `linear-gradient(90deg, rgba(226,232,240,0.94) 0%, rgba(226,232,240,0.94) ${volumeProgressPercent}%, rgba(148,163,184,0.3) ${volumeProgressPercent}%, rgba(148,163,184,0.3) 100%)`,
  }), [volumeProgressPercent]);
  const centerButtonVisibilityClass = isPlaying
    ? (
      supportsHover
        ? (isPlayerHovered ? 'opacity-95 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none')
        : 'opacity-0 scale-90 pointer-events-none'
    )
    : 'opacity-100 scale-100 pointer-events-auto';
  const timelineControlsVisibilityClass = isPlaying && supportsHover
    ? (isPlayerHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none')
    : 'opacity-100 translate-y-0';
  const topLabelVisibilityClass = supportsHover && isPlayerHovered
    ? 'opacity-100 translate-y-0'
    : 'opacity-0 -translate-y-1';
  const centerPlaybackToneClass = isPlaying
    ? 'bg-slate-900/78 text-white shadow-[0_14px_32px_rgba(2,6,23,0.62)]'
    : 'bg-gradient-to-br from-sky-500/40 via-indigo-500/34 to-violet-500/28 text-white shadow-[0_14px_30px_rgba(37,99,235,0.32)]';
  const transportPlaybackToneClass = isPlaying
    ? 'bg-gradient-to-br from-violet-500/44 via-indigo-500/38 to-sky-500/34 text-white shadow-[0_10px_22px_rgba(79,70,229,0.48),inset_0_1px_0_rgba(255,255,255,0.24)] hover:from-violet-400/52 hover:via-indigo-400/46 hover:to-sky-400/42'
    : 'bg-gradient-to-br from-sky-500/30 via-blue-500/28 to-indigo-500/26 text-sky-100 shadow-[0_8px_18px_rgba(14,116,144,0.34),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-sky-400/40 hover:via-blue-400/36 hover:to-indigo-400/34';
  const fullscreenButtonToneClass = isFullscreen
    ? 'bg-gradient-to-br from-fuchsia-500/86 via-violet-500/84 to-indigo-500/84 text-white shadow-[0_0_0_1px_rgba(196,181,253,0.42),0_12px_24px_rgba(124,58,237,0.52)] hover:from-fuchsia-400/92 hover:via-violet-400/90 hover:to-indigo-400/90'
    : 'bg-gradient-to-br from-sky-500/28 via-indigo-500/34 to-violet-500/30 text-sky-100 shadow-[0_10px_20px_rgba(79,70,229,0.3),inset_0_1px_0_rgba(255,255,255,0.18)] hover:from-sky-400/42 hover:via-indigo-400/46 hover:to-violet-400/42';
  const fullscreenIndicatorClass = isFullscreen ? 'opacity-100 scale-100' : 'opacity-0 scale-75';
  const hasRunOutputFrame = Boolean(
    runOutputFrame
    && (runOutputFrame.input || runOutputFrame.output || runOutputFrame.error)
  );
  const playbackActionLabel = isPlaying ? 'Пауза' : 'Воспроизвести';
  const soundActionLabel = isMuted ? 'Включить звук' : 'Выключить звук';

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused || audio.ended) {
        await audio.play();
        return;
      }
      audio.pause();
    } catch {
      // Ignore autoplay and playback policy errors.
    }
  }, []);

  const handleSeek = useCallback((event) => {
    const nextMs = Math.max(0, Math.round(Number(event.target?.value) || 0));
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = nextMs / 1000;
    }
    syncTo(nextMs);
  }, [syncTo]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleVolumeChange = useCallback((event) => {
    const nextVolume = Math.max(0, Math.min(1, Number(event.target?.value) || 0));
    setVolume(nextVolume);
    setIsMuted(nextVolume <= 0);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const playerElement = playerContainerRef.current;
    if (!playerElement) return;
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
    try {
      if (fullscreenElement === playerElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
        return;
      }
      if (typeof playerElement.requestFullscreen === 'function') {
        await playerElement.requestFullscreen();
      } else if (typeof playerElement.webkitRequestFullscreen === 'function') {
        playerElement.webkitRequestFullscreen();
      }
    } catch {
      // Ignore fullscreen API rejections and unsupported environments.
    }
  }, []);

  const fullscreenActionLabel = isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть полноэкранный режим';
  const editorHeight = isFullscreen ? '100vh' : '360px';

  if (!normalized || !normalized.audio?.url || normalized.events.length === 0) {
    return (
      <div
        className={`mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-white via-violet-50/65 to-fuchsia-50/45 px-4 py-4 text-xs text-slate-600 shadow-[0_10px_24px_rgba(124,58,237,0.09)] ${className}`}
      >
        {FALLBACK_EMPTY_STATE_TEXT}
      </div>
    );
  }

  return (
    <div className={`mt-3 ${className}`}>
      <div
        ref={playerContainerRef}
        className={`group relative overflow-hidden bg-gradient-to-br from-[#06122d] via-[#050d1f] to-[#030816] p-[2px] shadow-[0_22px_46px_rgba(15,23,42,0.42)] ${isFullscreen ? 'h-full w-full rounded-none' : 'rounded-[1.4rem]'}`}
        onMouseEnter={() => setIsPlayerHovered(true)}
        onMouseLeave={() => setIsPlayerHovered(false)}
      >
        <div className="pointer-events-none absolute -left-14 -top-16 h-44 w-44 rounded-full bg-sky-400/14 blur-3xl" />

        <div className={`relative overflow-hidden bg-[#030817] ${isFullscreen ? 'h-full rounded-none' : 'rounded-[1.1rem]'}`}>
          <audio
            ref={audioRef}
            className="sr-only"
            preload="metadata"
            src={normalized.audio.url}
            onPlay={() => {
              setIsPlaying(true);
              setHasPlaybackStarted(true);
              stopFrameLoop();
              rafRef.current = requestAnimationFrame(runFrameLoop);
            }}
            onPause={() => {
              setIsPlaying(false);
              stopFrameLoop();
            }}
            onEnded={() => {
              setIsPlaying(false);
              stopFrameLoop();
              syncTo(safeDurationMs);
            }}
            onTimeUpdate={(event) => syncTo((event.currentTarget?.currentTime || 0) * 1000)}
            onSeeked={(event) => syncTo((event.currentTarget?.currentTime || 0) * 1000)}
            onLoadedMetadata={(event) => {
              const duration = Number(event.currentTarget?.duration);
              if (Number.isFinite(duration) && duration > 0) {
                const durationFromAudio = Math.round(duration * 1000);
                setDurationMs((prev) => Math.max(prev, durationFromAudio));
              }
            }}
          />

          <Editor
            height={editorHeight}
            language="python"
            theme={THEORY_PLAYER_EDITOR_THEME}
            defaultValue={normalized.initialCode || ''}
            path={modelPath}
            saveViewState={false}
            beforeMount={handleEditorBeforeMount}
            onMount={handleEditorMount}
            options={PLAYER_EDITOR_OPTIONS}
          />

          <div className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${(!hasPlaybackStarted && isPrePlaybackState) ? 'opacity-100' : 'opacity-0'}`}>
            <div
              className={`absolute inset-0 transition-colors duration-300 ${
                isPrePlaybackState ? 'bg-slate-950/78' : 'bg-slate-950/48'
              }`}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(56,189,248,0.09),transparent_52%)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/8 via-transparent to-slate-950/82" />
          </div>

          <div className={`pointer-events-none absolute right-4 top-3 z-20 inline-flex items-center gap-2 rounded-full bg-slate-900/56 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200/90 backdrop-blur-md transition-all duration-200 ${topLabelVisibilityClass}`}>
            <span>Видеоразбор</span>
            <span className="h-1 w-1 rounded-full bg-violet-300/80" />
            <span>{formatRecordingDuration(safeDurationMs)}</span>
          </div>

          {hasRunOutputFrame && (
            <div className="absolute inset-x-3 bottom-24 z-20 md:left-4 md:right-auto md:w-[min(680px,calc(100%-2rem))]">
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/94 px-3 py-2 shadow-[0_12px_30px_rgba(2,6,23,0.55)] backdrop-blur-md">
                {runOutputFrame?.input && (
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">stdin</div>
                    <pre className="mt-1 max-h-[78px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/80 px-2 py-1 font-mono text-[11px] leading-5 text-slate-200">{runOutputFrame.input}</pre>
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">stdout</div>
                  <pre className="mt-1 max-h-[126px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/75 px-2 py-1 font-mono text-[11px] leading-5 text-slate-100">{runOutputFrame?.output || 'Пусто'}</pre>
                </div>
                {runOutputFrame?.error && (
                  <div className="mt-2 border-t border-slate-800 pt-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-300">stderr</div>
                    <pre className="mt-1 max-h-[108px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-rose-950/30 px-2 py-1 font-mono text-[11px] leading-5 text-rose-200">{runOutputFrame.error}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={togglePlayback}
            className={`absolute left-1/2 top-1/2 z-20 flex h-16 w-16 items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 ${isPlaying ? 'hover:bg-slate-800/90 hover:opacity-100' : 'hover:opacity-95'} ${centerPlaybackToneClass} ${centerButtonVisibilityClass}`}
            style={{ transform: 'translate(-50%, -50%)' }}
            aria-label={playbackActionLabel}
          >
            <span className="relative block h-6 w-6 drop-shadow-[0_2px_8px_rgba(15,23,42,0.42)]">
              <Play
                size={24}
                className={`absolute inset-0 m-auto transition-all duration-200 ${isPlaying ? 'scale-75 opacity-0' : 'scale-100 opacity-100'}`}
              />
              <Pause
                size={24}
                className={`absolute inset-0 m-auto transition-all duration-200 ${isPlaying ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
              />
            </span>
          </button>

          <div className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#020617]/95 via-[#020617]/72 to-transparent px-3 pb-3 pt-14 transition-all duration-300 md:px-4 ${timelineControlsVisibilityClass}`}>
            <div className="pointer-events-none absolute inset-x-10 bottom-[66px] h-8 bg-gradient-to-r from-transparent via-violet-500/14 to-transparent blur-2xl" />
            <div className="pointer-events-none absolute inset-x-16 bottom-[64px] h-5 bg-gradient-to-r from-transparent via-sky-400/16 to-transparent blur-xl" />
            <div className="rounded-2xl bg-slate-900/58 p-2.5 shadow-[0_10px_28px_rgba(2,6,23,0.46)] backdrop-blur-xl md:p-3">
              <div className="flex items-center gap-2.5 md:gap-3">
                <button
                  type="button"
                  onClick={togglePlayback}
                  className={`group relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all duration-200 ${transportPlaybackToneClass}`}
                  aria-label={playbackActionLabel}
                >
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  {isPlaying ? (
                    <Pause size={16} className="relative z-10 drop-shadow-[0_1px_4px_rgba(15,23,42,0.45)]" />
                  ) : (
                    <Play size={16} className="relative z-10 translate-x-[1px] drop-shadow-[0_1px_4px_rgba(15,23,42,0.45)]" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <input
                    type="range"
                    min={0}
                    max={safeDurationMs}
                    step={100}
                    value={clampedCurrentMs}
                    onChange={handleSeek}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-sky-400"
                    style={seekTrackStyle}
                    aria-label="Перемотка"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold tracking-wide text-slate-300/90">
                    <span>{formatRecordingDuration(clampedCurrentMs)}</span>
                    <span>{formatRecordingDuration(safeDurationMs)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-slate-100 transition hover:bg-white/16"
                  aria-label={soundActionLabel}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={normalizedVolume}
                  onChange={handleVolumeChange}
                  className="hidden h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-transparent accent-white sm:block"
                  style={volumeTrackStyle}
                  aria-label="Громкость"
                />
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className={`group relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-xl transition-all duration-200 hover:scale-[1.04] ${fullscreenButtonToneClass}`}
                  aria-label={fullscreenActionLabel}
                >
                  <span className="pointer-events-none absolute -inset-1 rounded-[0.95rem] bg-gradient-to-br from-violet-400/24 via-fuchsia-400/20 to-sky-400/22 opacity-80 blur-sm transition-opacity duration-200 group-hover:opacity-100" />
                  <span className={`pointer-events-none absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] transition-all duration-200 ${fullscreenIndicatorClass}`} />
                  {isFullscreen ? (
                    <Minimize2 size={16} className="relative z-10 drop-shadow-[0_1px_4px_rgba(15,23,42,0.45)]" />
                  ) : (
                    <Maximize2 size={16} className="relative z-10 drop-shadow-[0_1px_4px_rgba(15,23,42,0.45)]" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TheoryRecordingPlayer;
