import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  Check,
  ClipboardCopy,
  Download,
  RefreshCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../services/api';

const getCurrentMoscowMonth = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}`;
};

const writeTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.focus();
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('copy failed');
};

const sanitizeFileName = (value) => String(value || 'ученик')
  .trim()
  .replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'ученик';

const formatTopicCount = (value) => {
  const count = Math.max(0, Math.trunc(Number(value) || 0));
  const mod100 = count % 100;
  const mod10 = count % 10;
  const label = mod100 >= 11 && mod100 <= 14
    ? 'тем'
    : (mod10 === 1 ? 'тема' : (mod10 >= 2 && mod10 <= 4 ? 'темы' : 'тем'));
  return `${count} ${label}`;
};

const MetricCard = ({ icon, label, value, note, tone }) => (
  <div className="student-month-report__metric" data-tone={tone}>
    <span className="student-month-report__metric-icon">{React.createElement(icon, { size: 18 })}</span>
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  </div>
);

const StudentMonthlyReportModal = ({ student, onClose }) => {
  const currentMonth = useMemo(getCurrentMoscowMonth, []);
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState('idle');
  const [shareState, setShareState] = useState('idle');
  const closeButtonRef = useRef(null);

  const loadReport = useCallback(async () => {
    const studentId = String(student?.id || '').trim();
    if (!studentId) return;
    setLoading(true);
    setError('');
    setCopyState('idle');
    setShareState('idle');
    try {
      const next = await api.getStudentMonthlyReport(studentId, month);
      setReport(next);
      setText(String(next?.text || ''));
    } catch (loadError) {
      setError(loadError?.message || 'Не удалось собрать отчёт.');
    } finally {
      setLoading(false);
    }
  }, [month, student?.id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
    };
  }, [onClose]);

  const handleCopy = async () => {
    if (!text.trim()) return;
    try {
      await writeTextToClipboard(text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2200);
    } catch {
      setCopyState('error');
    }
  };

  const handleShare = async () => {
    if (!text.trim()) return;
    if (!navigator.share) {
      await handleCopy();
      setShareState('copied');
      return;
    }
    try {
      await navigator.share({
        title: `Отчёт за ${report?.monthLabel || month}`,
        text,
      });
      setShareState('shared');
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') setShareState('error');
    }
  };

  const handleDownload = () => {
    if (!text.trim()) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Отчёт-${sanitizeFileName(student?.name)}-${month}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const metrics = report?.metrics || {};
  const homework = metrics.homework || {};
  const lessons = metrics.lessons || {};
  const mocks = metrics.mocks || {};
  const modal = (
    <div className="student-month-report" role="dialog" aria-modal="true" aria-labelledby="student-month-report-title">
      <button className="student-month-report__backdrop" type="button" onClick={onClose} aria-label="Закрыть отчёт" />
      <section className="student-month-report__dialog">
        <header className="student-month-report__header">
          <div className="student-month-report__heading">
            <span className="student-month-report__hero-icon"><Sparkles size={21} /></span>
            <div>
              <span>Автоматический отчёт</span>
              <h2 id="student-month-report-title">{student?.name || 'Ученик'}</h2>
              <p>Данные из календаря, домашних заданий и пробников уже собраны.</p>
            </div>
          </div>
          <button ref={closeButtonRef} className="student-month-report__close" type="button" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="student-month-report__toolbar">
          <label>
            <span>Месяц отчёта</span>
            <input type="month" value={month} max={currentMonth} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <button type="button" onClick={loadReport} disabled={loading}>
            <RefreshCcw size={15} className={loading ? 'is-spinning' : ''} />
            Обновить данные
          </button>
          {report?.generatedAt && <small>Собран по актуальным данным платформы</small>}
        </div>

        {error ? (
          <div className="student-month-report__error" role="alert">
            <strong>Не удалось собрать отчёт</strong>
            <span>{error}</span>
            <button type="button" onClick={loadReport}>Попробовать ещё раз</button>
          </div>
        ) : loading ? (
          <div className="student-month-report__loading" role="status">
            <Sparkles size={24} />
            <strong>Собираю отчёт…</strong>
            <span>Проверяю занятия, сроки домашних заданий и результаты пробников.</span>
          </div>
        ) : (
          <>
            <div className="student-month-report__metrics">
              <MetricCard
                icon={CalendarDays}
                tone="lessons"
                label="Занятия"
                value={lessons.count ?? 0}
                note={(lessons.topics?.length ?? 0) > 0
                  ? formatTopicCount(lessons.topics.length)
                  : (lessons.count > 0 ? 'по календарю' : 'нет занятий')}
              />
              <MetricCard
                icon={BookOpenCheck}
                tone="homework"
                label="ДЗ в срок"
                value={`${homework.onTimeCount ?? 0}/${homework.assignedCount ?? 0}`}
                note={(homework.incompleteCount ?? 0) > 0 ? `${homework.incompleteCount} просрочено` : 'без просрочек'}
              />
              <MetricCard
                icon={BarChart3}
                tone="mocks"
                label="Пробник"
                value={mocks.latestScore == null ? '—' : mocks.latestScore}
                note={mocks.latestScore == null
                  ? 'нет результата'
                  : (mocks.deltaFromPrevious == null
                    ? 'первый результат'
                    : `${mocks.deltaFromPrevious > 0 ? '+' : ''}${mocks.deltaFromPrevious} к предыдущему`)}
              />
            </div>

            {report?.coverage?.homeworkFullyReliable === false && (
              <p className="student-month-report__coverage">
                Для старых домашних заданий часть истории сроков могла ещё не сохраняться на платформе.
              </p>
            )}

            <div className="student-month-report__editor-head">
              <div>
                <strong>Текст для родителя</strong>
                <span>Можно изменить любую формулировку перед отправкой.</span>
              </div>
              {text !== String(report?.text || '') && (
                <button type="button" onClick={() => setText(String(report?.text || ''))}>Вернуть автотекст</button>
              )}
            </div>
            <textarea
              className="student-month-report__editor"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck="true"
              aria-label="Текст отчёта для родителя"
            />

            <footer className="student-month-report__footer">
              <span>Отчёт не отправляется сам — вы сначала видите и проверяете готовый текст.</span>
              <div>
                <button type="button" onClick={handleDownload} disabled={!text.trim()}>
                  <Download size={16} /> Скачать
                </button>
                <button type="button" onClick={handleCopy} disabled={!text.trim()} data-primary="soft">
                  {copyState === 'copied' ? <Check size={16} /> : <ClipboardCopy size={16} />}
                  {copyState === 'copied' ? 'Скопировано' : (copyState === 'error' ? 'Не удалось' : 'Копировать')}
                </button>
                <button type="button" onClick={handleShare} disabled={!text.trim()} data-primary="strong">
                  <Send size={16} />
                  {shareState === 'shared' ? 'Отправлено' : (shareState === 'copied' ? 'Скопировано' : 'Отправить')}
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

export default StudentMonthlyReportModal;
