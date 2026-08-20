import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  RefreshCcw,
  UserRound,
} from 'lucide-react';
import { api } from '../services/api';
import HomeworkStatsSection from './HomeworkStatsSection';

const getHomeworkMockExamIds = (studentData) => {
  const ids = new Set();
  const homeworks = Array.isArray(studentData?.homeworks) ? studentData.homeworks : [];

  homeworks.forEach((homework) => {
    const goals = Array.isArray(homework?.goals) ? homework.goals : [];
    goals.forEach((goal) => {
      const mockExamId = String(goal?.mockExamId || '').trim();
      if (mockExamId) ids.add(mockExamId);
    });
  });

  return ids;
};

const HomeworkStatsPage = ({
  studentId,
  student,
  role = 'student',
  theme = '',
  onClose,
}) => {
  const dark = String(theme || '').trim().toLowerCase() === 'dark';
  const [studentData, setStudentData] = useState(null);
  const [testsDb, setTestsDb] = useState(null);
  const [mockExams, setMockExams] = useState([]);
  const [mockAttemptsByExam, setMockAttemptsByExam] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataWarning, setDataWarning] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const pageRef = useRef(null);
  const closeButtonRef = useRef(null);
  const currentRequestKey = `${role}:${String(studentId || 'self')}:${reloadToken}`;
  const pageLoading = loading || loadedRequestKey !== currentRequestKey;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previouslyFocusedElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !pageRef.current) return;

      const focusableElements = Array.from(pageRef.current.querySelectorAll(
        'button:not([disabled]), select:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element instanceof HTMLElement && element.offsetParent !== null);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedElement instanceof HTMLElement) {
        previouslyFocusedElement.focus({ preventScroll: true });
      }
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      api.getStudentData(role === 'student' ? null : studentId),
      api.getTests(),
      api.getMockExams(role === 'student' ? null : studentId),
    ])
      .then(async ([studentResult, testsResult, mockExamsResult]) => {
        if (studentResult.status === 'rejected') throw studentResult.reason;

        const nextStudentData = studentResult.value;
        const nextTestsDb = testsResult.status === 'fulfilled' ? testsResult.value : {};
        const nextMockExams = mockExamsResult.status === 'fulfilled' ? mockExamsResult.value : [];
        const safeStudentData = nextStudentData && typeof nextStudentData === 'object'
          ? nextStudentData
          : {};
        const safeMockExams = Array.isArray(nextMockExams) ? nextMockExams : [];
        const relevantMockExamIds = getHomeworkMockExamIds(safeStudentData);
        const attemptedMockExams = safeStudentData.mockAttempts
          && typeof safeStudentData.mockAttempts === 'object'
          ? safeStudentData.mockAttempts
          : {};
        Object.keys(attemptedMockExams).forEach((examId) => {
          const normalizedExamId = String(examId || '').trim();
          if (normalizedExamId) relevantMockExamIds.add(normalizedExamId);
        });
        const relevantMockExams = safeMockExams.filter((exam) => (
          relevantMockExamIds.has(String(exam?.id || '').trim())
        ));
        const attempts = await Promise.all(
          relevantMockExams.map((exam) => (
            api.getMockAttempt(role === 'student' ? null : studentId, exam.id).catch(() => null)
          ))
        );
        const nextAttemptsByExam = {};
        relevantMockExams.forEach((exam, index) => {
          const attempt = attempts[index];
          if (attempt && typeof attempt === 'object') {
            nextAttemptsByExam[exam.id] = attempt;
          }
        });

        if (cancelled) return;
        setError('');
        setDataWarning('');
        setStudentData(safeStudentData);
        setTestsDb(nextTestsDb && typeof nextTestsDb === 'object' ? nextTestsDb : {});
        setMockExams(safeMockExams);
        setMockAttemptsByExam(nextAttemptsByExam);
        if (
          testsResult.status === 'rejected'
          || mockExamsResult.status === 'rejected'
          || attempts.some((attempt) => attempt == null)
        ) {
          setDataWarning(
            'Часть подробностей временно недоступна. Доступная статистика показана по сохранённым данным.'
          );
        }
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError?.message || 'Не удалось загрузить статистику по ДЗ.');
        setDataWarning('');
        setStudentData(null);
        setTestsDb({});
        setMockExams([]);
        setMockAttemptsByExam({});
      })
      .finally(() => {
        if (!cancelled) {
          setLoadedRequestKey(currentRequestKey);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentRequestKey, role, studentId]);

  const studentName = String(student?.name || '').trim() || 'Ученик';
  const studentNickname = String(student?.nickname || '').trim();
  const reloadStatistics = () => {
    setLoading(true);
    setError('');
    setDataWarning('');
    setReloadToken((value) => value + 1);
  };

  return (
    <div
      ref={pageRef}
      className={`homework-stats-page fixed inset-0 z-[120] overflow-y-auto ${
        dark
          ? 'homework-stats-page--dark bg-slate-950 text-slate-100'
          : 'bg-slate-50 text-slate-900'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="homework-stats-title"
      aria-busy={pageLoading}
    >
      <header className={`sticky top-0 z-10 border-b shadow-[0_8px_30px_rgba(79,70,229,0.06)] backdrop-blur-xl ${
        dark
          ? 'border-slate-800 bg-slate-950/90'
          : 'border-purple-100 bg-white/90'
      }`}>
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 ${
                dark
                  ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-purple-200 hover:text-purple-700'
              }`}
              aria-label="Вернуться назад"
            >
              <ArrowLeft size={17} />
              <span className="hidden sm:inline">Назад</span>
            </button>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-purple-500/20">
              <BarChart3 size={20} />
            </span>
            <div className="min-w-0">
              <h1 id="homework-stats-title" className="truncate text-lg font-black md:text-xl">
                Статистика по ДЗ
              </h1>
              <div className={`flex min-w-0 items-center gap-1.5 text-xs font-semibold ${
                dark ? 'text-slate-400' : 'text-slate-500'
              }`}>
                <UserRound size={13} />
                <span className="truncate">{studentName}</span>
                {studentNickname && (
                  <span className="truncate text-purple-500">{`• ${studentNickname}`}</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={reloadStatistics}
            disabled={pageLoading}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
              dark
                ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                : 'border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:text-purple-700'
            }`}
            aria-label={pageLoading ? 'Статистика обновляется' : 'Обновить статистику'}
          >
            <RefreshCcw size={16} className={pageLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{pageLoading ? 'Обновляем' : 'Обновить'}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-5 md:px-7 md:py-7">
        {pageLoading ? (
          <section className={`animate-pulse rounded-[28px] border p-5 shadow-sm ${
            dark ? 'border-slate-700 bg-slate-900/75' : 'border-slate-200 bg-white/90'
          }`} role="status" aria-label="Загружаем статистику по домашним работам">
            <div className={`h-7 w-52 rounded-xl ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} />
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className={`h-20 rounded-2xl ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}
                />
              ))}
            </div>
            <div className={`mt-4 h-64 rounded-3xl ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} />
          </section>
        ) : error ? (
          <section className={`rounded-[28px] border p-6 text-center shadow-sm ${
            dark
              ? 'border-rose-900/70 bg-rose-950/30'
              : 'border-rose-200 bg-white'
          }`} role="alert">
            <h2 className={`text-base font-black ${dark ? 'text-rose-200' : 'text-rose-700'}`}>
              Не удалось открыть статистику
            </h2>
            <p className={`mx-auto mt-1 max-w-xl text-sm ${dark ? 'text-rose-300/80' : 'text-rose-600'}`}>
              {error}
            </p>
            <button
              type="button"
              onClick={reloadStatistics}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2"
            >
              <RefreshCcw size={16} />
              Повторить
            </button>
          </section>
        ) : (
          <>
            {dataWarning && (
              <div className={`mb-3 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-xs leading-relaxed ${
                dark
                  ? 'border-amber-800/70 bg-amber-950/35 text-amber-200'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`} role="status">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>{dataWarning}</span>
              </div>
            )}
            <HomeworkStatsSection
              homeworks={studentData?.homeworks || []}
              studentData={studentData || {}}
              testsDb={testsDb}
              mockExams={mockExams}
              mockAttemptsByExam={mockAttemptsByExam}
              role={role}
              theme={theme}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default HomeworkStatsPage;
