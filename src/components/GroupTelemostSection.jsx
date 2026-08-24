import {
  ArrowLeft,
  CalendarClock,
  Code2,
  ExternalLink,
  LayoutDashboard,
  Mic,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const formatLessonDate = (value) => {
  const timestamp = Date.parse(String(value || '').trim());
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const GroupTelemostSection = ({
  role,
  groupName = '',
  topic = '',
  startsAt = '',
  participantCount = 0,
  telemostUrl = '',
  readOnly = false,
  notStarted = false,
  lessonStatus = '',
  audioCaptureStatus = 'idle',
  audioCaptureMessage = '',
  onOpenTelemost,
  onOpenBoard,
  onOpenCollab,
  onBack,
}) => {
  const isTeacher = role === 'teacher';
  const meetingUrl = String(telemostUrl || '').trim();
  const lessonDate = formatLessonDate(startsAt);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const startMs = Date.parse(String(startsAt || '').trim());
  const status = String(lessonStatus || '').trim().toLowerCase();

  // The lesson card can stay mounted while the clock crosses the start time.
  // Refreshing the whole group is unnecessary: wake the card at the exact
  // moment when the permanent Telemost link becomes usable.
  useEffect(() => {
    if (status === 'active' || !Number.isFinite(startMs) || startMs <= clockMs) return undefined;
    const delay = Math.max(250, Math.min(startMs - clockMs, 2_147_000_000));
    const timerId = window.setTimeout(() => setClockMs(Date.now()), delay);
    return () => window.clearTimeout(timerId);
  }, [clockMs, startMs, status]);

  const timeNotStarted = status !== 'active'
    && Number.isFinite(startMs)
    && startMs > clockMs;
  const effectiveNotStarted = timeNotStarted || (Boolean(notStarted) && !Number.isFinite(startMs));
  const effectiveReadOnly = Boolean(readOnly) && !effectiveNotStarted;

  return (
    <div className="animate-fadeIn flex min-h-0 flex-1 flex-col gap-4 pb-3">
      <section className="overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-700 via-purple-700 to-fuchsia-700 p-5 text-white shadow-xl shadow-violet-200/50 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-violet-100">
              <Video size={16} /> {effectiveReadOnly ? 'Архив группового занятия' : 'Групповой звонок'}
            </div>
            <h2 className="mt-3 truncate text-2xl font-black sm:text-3xl">
              {groupName || 'Мини-группа'}
            </h2>
            <p className="mt-2 text-sm font-semibold text-violet-100 sm:text-base">
              {topic || 'Групповое занятие'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-violet-50">
              {lessonDate && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                  <CalendarClock size={14} /> {lessonDate}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                <Users size={14} /> {Math.max(0, Number(participantCount) || 0)} учеников
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
          >
            <ArrowLeft size={16} /> К мини-группе
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-rose-200">
              <Video size={30} />
            </span>
            <h3 className="mt-5 text-xl font-black text-slate-900 sm:text-2xl">
              Видеозвонок проходит в Яндекс Телемосте
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
              У всех участников одна ссылка. Платформа остаётся открытой для общей доски,
              материалов, заданий и личных ответов.
            </p>

            {!effectiveReadOnly && !effectiveNotStarted && meetingUrl ? (
              <button
                type="button"
                onClick={() => onOpenTelemost?.(meetingUrl)}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3.5 text-base font-black text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-700"
              >
                <ExternalLink size={19} /> Войти в Телемост
              </button>
            ) : effectiveNotStarted ? (
              <div className="mt-6 w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">
                Занятие ещё не началось. Ссылка на Телемост станет доступна в момент начала.
              </div>
            ) : effectiveReadOnly ? (
              <div className="mt-6 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700">
                Занятие завершено. Его общая доска и код сохранены и доступны только для просмотра.
              </div>
            ) : (
              <div className="mt-6 w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">
                {isTeacher
                  ? 'Ссылка ещё не указана. Добавьте её в карточке занятия в разделе мини-группы.'
                  : 'Преподаватель ещё не добавил ссылку Телемоста. Она появится здесь перед занятием.'}
              </div>
            )}
            {!effectiveReadOnly && !effectiveNotStarted && meetingUrl && isTeacher && (
              <div className={`mt-4 flex max-w-xl items-start gap-2 rounded-2xl border px-4 py-3 text-left text-xs font-semibold ${
                audioCaptureStatus === 'recording'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : (audioCaptureStatus === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-violet-200 bg-violet-50 text-violet-700')
              }`}>
                <Mic size={16} className="mt-0.5 shrink-0" />
                <span>
                  {audioCaptureMessage || 'При входе браузер попросит выбрать вкладку Телемоста с включённым звуком и разрешить микрофон.'}
                </span>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
                <ShieldCheck size={19} />
              </span>
              <div>
                <h3 className="font-black">Без нагрузки видеопотоками</h3>
                <p className="mt-1 text-sm leading-relaxed text-emerald-800">
                  Видеосвязь не проходит через сервер платформы. Посещаемость преподаватель отмечает в карточке занятия.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="font-black text-slate-900">Рабочее пространство урока</h3>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={onOpenBoard}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-700"
              >
                <LayoutDashboard size={17} /> Общая доска
              </button>
              <button
                type="button"
                onClick={onOpenCollab}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
              >
                <Code2 size={17} /> Общий редактор
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default GroupTelemostSection;
