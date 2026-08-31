import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarDays, Clock3, Code2, ExternalLink, FileText, Image as ImageIcon, Loader2, RefreshCcw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { authenticatedUploadsFetch, resolveAuthenticatedUploadsUrl } from '../services/api';
import LessonReplayPlayer from './LessonReplayPlayer';

const isPythonFile = (file) => /\.py$/i.test(String(file?.name || '').trim());
const isImageFile = (file) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(file?.name || '').trim());

const formatMaterialCount = (value, one, few, many) => {
  const count = Math.abs(Number(value) || 0);
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`;
  if (mod10 === 1) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
};

const getMaterialSourceLabel = (file) => {
  const source = String(file?.source || file?.memory?.source || '').trim();
  if (source === 'collab-code') return 'Совместный код';
  if (source === 'notes-python') return 'Сохранённый код';
  if (source === 'notes-cheatsheet') return 'Шпаргалка';
  if (source === 'board-save') return 'Сохранение с доски';
  if (source === 'notes-upload') return 'Файл из конспектов';
  return 'Материал занятия';
};

const formatLessonDate = (dayKey) => {
  const date = new Date(`${String(dayKey || '').trim()}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Прошедшее занятие';
  return date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).replace(' г.', '');
};

const getLessonDurationMinutes = (lesson) => {
  const rawDuration = Number(lesson?.durationMinutes);
  return Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : 60;
};

const formatLessonTime = (lesson) => {
  const time = String(lesson?.time || '').trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return time || 'Время не указано';
  const [hours, minutes] = time.split(':').map(Number);
  if (hours > 23 || minutes > 59) return 'Время не указано';
  const duration = getLessonDurationMinutes(lesson);
  const endTotal = (hours * 60) + minutes + duration;
  return `${time}–${String(Math.floor((endTotal / 60) % 24)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
};

const formatSavedAt = (value) => {
  const date = new Date(String(value || '').trim());
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const withStudentAccess = (value, studentId) => {
  if (!value) return '';
  let url = resolveAuthenticatedUploadsUrl(value);
  if (studentId && !/[?&]studentId=/.test(url)) {
    url += `${url.includes('?') ? '&' : '?'}studentId=${encodeURIComponent(studentId)}`;
  }
  return url;
};

const StudentLessonDetailModal = ({
  open,
  lesson,
  materials = [],
  replay = null,
  createPythonWorker = null,
  renderLessonReplaySandbox = null,
  topicText = '',
  loading = false,
  error = '',
  studentId = '',
  formatTaskLabel,
  onClose,
  onRetry,
}) => {
  const dialogRef = useRef(null);
  const requestedCodeIdsRef = useRef(new Set());
  const [codeByFileId, setCodeByFileId] = useState({});

  const normalizedMaterials = useMemo(() => {
    const unique = new Map();
    (Array.isArray(materials) ? materials : []).forEach((entry) => {
      if (entry?.id && !unique.has(entry.id)) unique.set(entry.id, entry);
    });
    return [...unique.values()];
  }, [materials]);
  const hasMeaningfulReplay = useMemo(() => (
    Boolean(replay?.available)
    && Array.isArray(replay?.events)
    && replay.events.some((event) => event?.type && event.type !== 'session')
  ), [replay]);
  const groupedMaterials = useMemo(() => {
    const groups = new Map();
    normalizedMaterials.forEach((file) => {
      const taskNumber = Number(file?.taskNumber);
      const key = Number.isFinite(taskNumber) ? String(taskNumber) : 'other';
      const group = groups.get(key) || {
        key,
        taskNumber: Number.isFinite(taskNumber) ? taskNumber : null,
        items: [],
      };
      group.items.push(file);
      groups.set(key, group);
    });
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => (
          String(left?.savedAt || '').localeCompare(String(right?.savedAt || ''))
        )),
      }))
      .sort((left, right) => {
        if (left.taskNumber === null) return 1;
        if (right.taskNumber === null) return -1;
        return left.taskNumber - right.taskNumber;
      });
  }, [normalizedMaterials]);

  const resolveFileUrl = useCallback(
    (file, snapshot = false) => withStudentAccess(
      snapshot ? file?.memory?.boardSnapshot?.url : file?.url,
      studentId
    ),
    [studentId]
  );

  const loadCodeFile = useCallback(async (file, isCurrent = () => true) => {
    if (!file?.id || !isPythonFile(file)) return;
    requestedCodeIdsRef.current.add(file.id);
    setCodeByFileId((current) => ({
      ...current,
      [file.id]: { loading: true, content: '', error: '' },
    }));
    try {
      const response = await authenticatedUploadsFetch(resolveFileUrl(file));
      if (!response.ok) throw new Error('Не удалось загрузить код');
      const content = await response.text();
      if (!isCurrent()) return;
      setCodeByFileId((current) => ({
        ...current,
        [file.id]: { loading: false, content, error: '' },
      }));
    } catch (loadError) {
      if (!isCurrent()) return;
      setCodeByFileId((current) => ({
        ...current,
        [file.id]: {
          loading: false,
          content: '',
          error: loadError?.message || 'Не удалось загрузить код',
        },
      }));
    }
  }, [resolveFileUrl]);

  useEffect(() => {
    if (!open) {
      setCodeByFileId({});
      requestedCodeIdsRef.current.clear();
      return undefined;
    }
    let current = true;
    setCodeByFileId({});
    requestedCodeIdsRef.current.clear();
    const codeFiles = normalizedMaterials.filter(isPythonFile);
    if (codeFiles.length === 0) return () => { current = false; };

    const loadVisibleFile = (file) => {
      if (!current || requestedCodeIdsRef.current.has(file.id)) return;
      loadCodeFile(file, () => current);
    };
    const body = dialogRef.current?.querySelector('.student-lesson-capsule__body');
    const nodesById = new Map(
      Array.from(body?.querySelectorAll('[data-code-file-id]') || [])
        .map((node) => [node.dataset.codeFileId, node])
    );
    if (typeof IntersectionObserver === 'undefined' || !body) {
      codeFiles.forEach(loadVisibleFile);
      return () => { current = false; };
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const file = codeFiles.find((candidate) => String(candidate.id) === entry.target.dataset.codeFileId);
        if (file) loadVisibleFile(file);
        observer.unobserve(entry.target);
      });
    }, { root: body, rootMargin: '240px 0px' });
    codeFiles.forEach((file) => {
      const node = nodesById.get(String(file.id));
      if (node) observer.observe(node);
      else loadVisibleFile(file);
    });
    return () => {
      current = false;
      observer.disconnect();
    };
  }, [loadCodeFile, normalizedMaterials, open]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus({ preventScroll: true }), 0);
    const handleKeyDown = (event) => {
      const fullscreenPlayer = document.querySelector('.lesson-replay-player.is-fullscreen');
      const nativeFullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
      if (event.key === 'Escape') {
        if (nativeFullscreenElement || fullscreenPlayer) return;
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusScope = fullscreenPlayer || dialogRef.current;
      const focusable = Array.from(focusScope.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (activeElement === focusScope || !focusScope.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  const codeCount = normalizedMaterials.filter(isPythonFile).length;
  const boardCount = normalizedMaterials.filter((file) => (
    String(file?.source || '') === 'board-save'
    || isImageFile(file)
    || Boolean(file?.memory?.boardSnapshot?.url)
  )).length;
  const hasReplay = hasMeaningfulReplay;
  const hasTopic = Boolean(String(topicText || '').trim());

  const content = (
    <div
      className="student-lesson-capsule"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className="student-lesson-capsule__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-lesson-capsule-title"
        aria-describedby="student-lesson-capsule-topic"
        tabIndex={-1}
      >
        <header className="student-lesson-capsule__header">
          <div className="student-lesson-capsule__heading">
            <span className="student-lesson-capsule__hero-icon" aria-hidden="true">
              <BookOpen size={22} />
            </span>
            <div>
              <span className="student-lesson-capsule__eyebrow">Материалы прошедшего занятия</span>
              <h2 id="student-lesson-capsule-title">{formatLessonDate(lesson?.dayKey)}</h2>
              <div className="student-lesson-capsule__time">
                <Clock3 size={14} />
                <strong>{formatLessonTime(lesson)}</strong>
                <span>{`${getLessonDurationMinutes(lesson)} мин`}</span>
                <span
                  className={`student-lesson-capsule__status${hasReplay ? ' student-lesson-capsule__status--ready' : ' student-lesson-capsule__status--materials'}`}
                >
                  <i aria-hidden="true" />
                  {hasReplay ? 'Запись доступна' : 'Материалы занятия'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="student-lesson-capsule__close"
            onClick={onClose}
            aria-label="Закрыть материалы занятия"
            title="Закрыть"
          >
            <X size={19} />
          </button>
        </header>

        <div className="student-lesson-capsule__body">
          <section className={`student-lesson-capsule__topic${hasTopic ? '' : ' student-lesson-capsule__topic--empty'}`} id="student-lesson-capsule-topic">
            <span><BookOpen size={15} /> Тема занятия</span>
            <strong>{topicText || 'Тема не сохранилась'}</strong>
          </section>

          {!loading && !error && hasMeaningfulReplay && (
            <LessonReplayPlayer
              key={replay?.occurrence?.key || 'lesson-replay'}
              replay={replay}
              createPythonWorker={createPythonWorker}
              renderLessonReplaySandbox={renderLessonReplaySandbox}
            />
          )}

          {!loading && !error && normalizedMaterials.length > 0 && (
            <div className="student-lesson-capsule__summary" aria-label="Сводка материалов">
              <span><FileText size={14} /> {formatMaterialCount(normalizedMaterials.length, 'материал', 'материала', 'материалов')}</span>
              {codeCount > 0 && <span><Code2 size={14} /> {formatMaterialCount(codeCount, 'файл с кодом', 'файла с кодом', 'файлов с кодом')}</span>}
              {boardCount > 0 && <span><ImageIcon size={14} /> {formatMaterialCount(boardCount, 'сохранение с доски', 'сохранения с доски', 'сохранений с доски')}</span>}
            </div>
          )}

          {loading ? (
            <div className="student-lesson-capsule__state" role="status" aria-live="polite">
              <Loader2 size={20} className="animate-spin" />
              <div>
                <strong>Собираем материалы урока</strong>
                <span>Ищем сохранённый код, конспекты и снимки доски…</span>
              </div>
            </div>
          ) : error ? (
            <div className="student-lesson-capsule__state student-lesson-capsule__state--error" role="alert">
              <RefreshCcw size={19} />
              <div>
                <strong>Не удалось открыть занятие</strong>
                <span>{error}</span>
              </div>
              {typeof onRetry === 'function' && <button type="button" onClick={onRetry}>Повторить</button>}
            </div>
          ) : groupedMaterials.length === 0 ? (
            <div className="student-lesson-capsule__state">
              <CalendarDays size={21} />
              <div>
                <strong>Сохранений к этому занятию нет</strong>
                <span>Тема и время урока останутся в истории, а новые сохранения появятся здесь автоматически.</span>
              </div>
            </div>
          ) : (
            <div className="student-lesson-capsule__groups">
              {groupedMaterials.map((group) => (
                <section className="student-lesson-capsule__group" key={group.key}>
                  <div className="student-lesson-capsule__group-heading">
                    <span>{Number.isFinite(group.taskNumber) ? 'Материалы по заданию' : 'Другие материалы'}</span>
                    <h3>
                      {Number.isFinite(group.taskNumber)
                        ? (formatTaskLabel?.(group.taskNumber) || `Задание ${group.taskNumber}`)
                        : 'Без привязки к заданию'}
                    </h3>
                  </div>
                  <div className="student-lesson-capsule__materials">
                    {group.items.map((file) => {
                      const fileUrl = resolveFileUrl(file);
                      const snapshotUrl = resolveFileUrl(file, true);
                      const codeState = codeByFileId[file.id];
                      const showImage = isImageFile(file);
                      return (
                        <article className="student-lesson-capsule__material" key={file.id} data-code-file-id={isPythonFile(file) ? file.id : undefined}>
                          <div className="student-lesson-capsule__material-head">
                            <span className="student-lesson-capsule__material-icon" aria-hidden="true">
                              {isPythonFile(file) ? <Code2 size={17} /> : (showImage ? <ImageIcon size={17} /> : <FileText size={17} />)}
                            </span>
                            <div className="student-lesson-capsule__material-name">
                              <strong>{file.name || 'Материал'}</strong>
                              <span>
                                {getMaterialSourceLabel(file)}
                                {formatSavedAt(file.savedAt) ? ` · ${formatSavedAt(file.savedAt)}` : ''}
                              </span>
                            </div>
                            {fileUrl && (
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="student-lesson-capsule__open-file">
                                <ExternalLink size={14} />
                                <span>Открыть</span>
                              </a>
                            )}
                          </div>

                          {isPythonFile(file) && (
                            <div className="student-lesson-capsule__code">
                              {!codeState || codeState.loading ? (
                                <div className="student-lesson-capsule__inline-state"><Loader2 size={15} className="animate-spin" /> Загружаем код…</div>
                              ) : codeState?.error ? (
                                <div className="student-lesson-capsule__inline-state student-lesson-capsule__inline-state--error">
                                  <span>{codeState.error}</span>
                                  <button type="button" onClick={() => loadCodeFile(file)}>Повторить</button>
                                </div>
                              ) : (
                                <pre><code>{codeState?.content || '# Пустой файл'}</code></pre>
                              )}
                            </div>
                          )}

                          {showImage && fileUrl && (
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="student-lesson-capsule__board-image">
                              <img src={fileUrl} alt={`Сохранение с доски: ${file.name || 'изображение'}`} loading="lazy" />
                            </a>
                          )}

                          {snapshotUrl && (
                            <figure className="student-lesson-capsule__snapshot">
                              <figcaption>
                                <ImageIcon size={14} />
                                <span>Доска в момент сохранения кода</span>
                                {Number(file?.memory?.boardSnapshot?.itemCount) > 0 && (
                                  <em>{`${Number(file.memory.boardSnapshot.itemCount)} элементов`}</em>
                                )}
                              </figcaption>
                              <a href={snapshotUrl} target="_blank" rel="noopener noreferrer">
                                <img src={snapshotUrl} alt={`Снимок доски к файлу ${file.name || ''}`} loading="lazy" />
                              </a>
                            </figure>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(content, document.body);
};

export default StudentLessonDetailModal;
