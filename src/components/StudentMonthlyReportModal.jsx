import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  Check,
  ClipboardCopy,
  Download,
  ImageDown,
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

const capitalizeFirst = (value) => {
  const text = String(value || '').trim();
  return text ? `${text[0].toLocaleUpperCase('ru-RU')}${text.slice(1)}` : '';
};

const addRoundedRect = (context, x, y, width, height, radius) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
};

const wrapCanvasText = (context, value, maxWidth) => {
  const paragraphs = String(value || '').replace(/\r/g, '').split('\n');
  const result = [];
  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/u).filter(Boolean);
    if (words.length === 0) {
      result.push('');
      return;
    }
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        result.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) result.push(line);
  });
  while (result.at(-1) === '') result.pop();
  return result;
};

const downloadReportImage = async ({ report, text, studentName, month }) => {
  if (!String(text || '').trim()) return;
  try { await document.fonts?.ready; } catch { /* system fonts are enough */ }

  const width = 1440;
  const cardX = 48;
  const cardWidth = width - cardX * 2;
  const contentX = cardX + 58;
  const contentWidth = cardWidth - 116;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');

  context.font = '500 28px Inter, Arial, sans-serif';
  const lines = wrapCanvasText(context, text, contentWidth);
  const lineHeight = 43;
  const bodyHeight = lines.reduce((height, line) => height + (line ? lineHeight : 25), 0);
  const height = Math.max(1120, 610 + bodyHeight + 150);
  canvas.width = width;
  canvas.height = height;

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#f4f1ff');
  background.addColorStop(0.48, '#eef8ff');
  background.addColorStop(1, '#f8f5ff');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.18;
  context.fillStyle = '#a78bfa';
  context.beginPath();
  context.arc(width - 80, 70, 235, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#7dd3fc';
  context.beginPath();
  context.arc(30, height - 40, 190, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.shadowColor = 'rgba(30, 41, 59, 0.14)';
  context.shadowBlur = 42;
  context.shadowOffsetY = 16;
  addRoundedRect(context, cardX, 46, cardWidth, height - 92, 34);
  context.fillStyle = '#ffffff';
  context.fill();
  context.restore();

  const accent = context.createLinearGradient(contentX, 92, contentX + 260, 190);
  accent.addColorStop(0, '#7c3aed');
  accent.addColorStop(1, '#9333ea');
  addRoundedRect(context, contentX, 92, 76, 76, 22);
  context.fillStyle = accent;
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = '800 36px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('✦', contentX + 38, 132);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';

  context.fillStyle = '#7c3aed';
  context.font = '800 18px Inter, Arial, sans-serif';
  context.fillText('ИТОГИ МЕСЯЦА', contentX + 100, 112);
  context.fillStyle = '#111827';
  context.font = '800 44px Inter, Arial, sans-serif';
  context.fillText(studentName || 'Ученик', contentX + 100, 157);
  context.fillStyle = '#64748b';
  context.font = '500 22px Inter, Arial, sans-serif';
  context.fillText(capitalizeFirst(report?.monthLabel || month), contentX + 100, 190);

  const metricTop = 235;
  const metricGap = 20;
  const metricWidth = (contentWidth - metricGap * 2) / 3;
  const metricData = [
    {
      label: 'ЗАНЯТИЯ',
      value: String(report?.metrics?.lessons?.count ?? 0),
      note: formatTopicCount(report?.metrics?.lessons?.topics?.length ?? 0),
      color: '#0284c7',
      fill: '#f0f9ff',
    },
    {
      label: 'ДОМАШНЯЯ РАБОТА',
      value: report?.metrics?.homework?.averagePercent == null ? '—' : `${report.metrics.homework.averagePercent}%`,
      note: report?.metrics?.homework?.averagePercent == null ? 'пока нет результата' : 'среднее выполнение',
      color: '#059669',
      fill: '#ecfdf5',
    },
    {
      label: 'ПРОБНИК',
      value: report?.metrics?.mocks?.latestScore == null ? '—' : String(report.metrics.mocks.latestScore),
      note: report?.metrics?.mocks?.latestScore == null ? 'нет результата' : 'баллов',
      color: '#7c3aed',
      fill: '#f5f3ff',
    },
  ];
  metricData.forEach((metric, index) => {
    const x = contentX + index * (metricWidth + metricGap);
    addRoundedRect(context, x, metricTop, metricWidth, 154, 23);
    context.fillStyle = metric.fill;
    context.fill();
    context.strokeStyle = `${metric.color}38`;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = metric.color;
    context.font = '800 17px Inter, Arial, sans-serif';
    context.fillText(metric.label, x + 28, metricTop + 37);
    context.fillStyle = '#111827';
    context.font = '800 45px Inter, Arial, sans-serif';
    context.fillText(metric.value, x + 28, metricTop + 91);
    context.fillStyle = '#64748b';
    context.font = '500 18px Inter, Arial, sans-serif';
    context.fillText(metric.note, x + 28, metricTop + 124);
  });

  context.fillStyle = '#111827';
  context.font = '800 27px Inter, Arial, sans-serif';
  context.fillText('Как прошёл месяц', contentX, 455);
  context.fillStyle = '#7c3aed';
  addRoundedRect(context, contentX, 474, 86, 5, 3);
  context.fill();

  context.fillStyle = '#334155';
  context.font = '500 28px Inter, Arial, sans-serif';
  let y = 532;
  lines.forEach((line) => {
    if (!line) {
      y += 25;
      return;
    }
    context.fillText(line, contentX, y);
    y += lineHeight;
  });

  const footerY = height - 92;
  context.strokeStyle = '#ede9fe';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(contentX, footerY - 30);
  context.lineTo(contentX + contentWidth, footerY - 30);
  context.stroke();
  context.fillStyle = '#94a3b8';
  context.font = '500 17px Inter, Arial, sans-serif';
  context.fillText(`Персональный отчёт за ${String(report?.monthLabel || month || '').toLocaleLowerCase('ru-RU')}`, contentX, footerY);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error('image export failed'))), 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Отчёт-${sanitizeFileName(studentName)}-${month}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const [imageState, setImageState] = useState('idle');
  const closeButtonRef = useRef(null);

  const loadReport = useCallback(async () => {
    const studentId = String(student?.id || '').trim();
    if (!studentId) return;
    setLoading(true);
    setError('');
    setCopyState('idle');
    setShareState('idle');
    setImageState('idle');
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

  const handleImageDownload = async () => {
    if (!text.trim() || imageState === 'loading') return;
    setImageState('loading');
    try {
      await downloadReportImage({
        report,
        text,
        studentName: String(student?.name || report?.student?.name || 'Ученик'),
        month,
      });
      setImageState('done');
      window.setTimeout(() => setImageState('idle'), 2200);
    } catch {
      setImageState('error');
    }
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
                label="Домашняя работа"
                value={homework.averagePercent == null ? '—' : `${homework.averagePercent}%`}
                note={homework.averagePercent == null ? 'пока нет результата' : 'среднее выполнение'}
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
                  <Download size={16} /> Текст
                </button>
                <button type="button" onClick={handleImageDownload} disabled={!text.trim() || imageState === 'loading'} data-primary="soft">
                  {imageState === 'done' ? <Check size={16} /> : <ImageDown size={16} />}
                  {imageState === 'loading' ? 'Готовим…' : (imageState === 'done' ? 'Скачано' : (imageState === 'error' ? 'Не удалось' : 'Картинка'))}
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
