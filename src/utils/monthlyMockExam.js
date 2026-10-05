export const MONTHLY_MOCK_TIME_ZONE = 'Europe/Moscow';

const text = (value) => String(value ?? '').trim();
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => {
  const input = text(value);
  if (!input) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
  if (dateOnly) {
    const parsed = new Date(`${input}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) return null;
  }
  const ms = Date.parse(dateOnly ? `${input}T00:00:00+03:00` : input);
  return Number.isFinite(ms) ? ms : null;
};

export const getMonthlyMockMonth = (now = Date.now()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MONTHLY_MOCK_TIME_ZONE, year: 'numeric', month: '2-digit',
  }).formatToParts(new Date(now));
  return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`;
};

export const getMonthlyMockPeriod = (month = getMonthlyMockMonth()) => {
  month = text(month);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split('-').map(Number);
  if (year < 2000 || year > 2100) return null;
  const nextMonth = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
  const startMs = Date.parse(`${month}-01T00:00:00+03:00`);
  const endMs = Date.parse(`${nextMonth}-01T00:00:00+03:00`);
  return {
    month, startMs, endMs,
    label: new Intl.DateTimeFormat('ru-RU', {
      timeZone: MONTHLY_MOCK_TIME_ZONE, month: 'long', year: 'numeric',
    }).format(new Date(startMs)).replace(/\s*г\.$/, ''),
    timeZone: MONTHLY_MOCK_TIME_ZONE,
  };
};

const answerPresent = (value) => Array.isArray(value)
  ? value.length > 0 && value.every(answerPresent)
  : value != null && text(value) !== '';

const fullExamScope = (attempt, exam) => {
  const keys = Object.keys(record(exam?.tasks) ? exam.tasks : {});
  const targets = Array.isArray(attempt?.targetTaskKeys) ? attempt.targetTaskKeys.map(text).filter(Boolean) : [];
  // A homework assignment containing only selected tasks is not a whole mock exam.
  if (targets.length && (!keys.length || keys.some((key) => !targets.includes(key)))) return false;
  return true;
};

export const normalizeMonthlyMockCompletions = (entries) => {
  const unique = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const finishedMs = timestamp(entry?.finishedAt);
    const examId = text(entry?.examId);
    const manualId = text(entry?.manualId);
    if (finishedMs == null || (!examId && !manualId)) return;
    const finishedAt = new Date(finishedMs).toISOString();
    const key = manualId ? `manual:${manualId}` : `${examId}:${finishedAt}`;
    if (unique.has(key)) return;
    unique.set(key, {
      examId, ...(manualId ? { manualId } : {}),
      attemptId: text(entry.attemptId), finishedAt,
      title: text(entry.title).slice(0, 240) || 'Пробник',
    });
  });
  return [...unique.values()].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
};

export const normalizeMonthlyMockExemptions = (value) => {
  if (!record(value)) return {};
  const normalized = {};
  Object.entries(value).forEach(([month, updatedAt]) => {
    if (!getMonthlyMockPeriod(month)) return;
    const updatedMs = timestamp(updatedAt);
    if (updatedMs == null) return;
    normalized[month] = new Date(updatedMs).toISOString();
  });
  return normalized;
};

// Derive older completions on read, so September attempts count without a migration.
// The small ledger keeps later completions even when a variant is restarted/deleted.
export const collectMonthlyMockCompletions = (studentData = {}, exams = []) => {
  const examById = new Map(exams.map((exam) => [text(exam.id), exam]));
  const completions = [...normalizeMonthlyMockCompletions(studentData.monthlyMockCompletions)];
  const collect = (examId, raw, historical = false) => {
    if (!record(raw)) return;
    const attempt = { ...(record(raw.attemptSnapshot) ? raw.attemptSnapshot : {}), ...raw };
    const exam = record(raw.examSnapshot) ? raw.examSnapshot : (examById.get(examId) || {});
    const scopedExam = record(raw.tasks) ? { ...exam, tasks: raw.tasks } : exam;
    if (!fullExamScope(attempt, scopedExam)) return;
    let finishedMs = timestamp(attempt.finishedAt) ?? timestamp(attempt.timerFinishedAt);
    if (finishedMs == null && text(attempt.status) === 'finished') finishedMs = timestamp(attempt.updatedAt);
    // Old untimed attempts had no finish action. Accept only a complete answer set,
    // never a modern active attempt, opening a variant, or just one solved task.
    if (finishedMs == null && !historical && !attempt.status && !attempt.timerStartedAt && attempt.mode !== 'timer') {
      const keys = Object.keys(record(scopedExam.tasks) ? scopedExam.tasks : {});
      if (keys.length && keys.every((key) => answerPresent(attempt.answers?.[key]))) {
        finishedMs = timestamp(attempt.updatedAt);
      }
    }
    if (finishedMs == null) return;
    completions.push({
      examId, attemptId: attempt.attemptId, finishedAt: new Date(finishedMs).toISOString(),
      title: raw.examTitle || raw.title || exam.title,
    });
  };
  (Array.isArray(studentData.mockAttemptResults) ? studentData.mockAttemptResults : [])
    .forEach((entry) => collect(text(entry?.examId), entry, true));
  Object.entries(record(studentData.mockAttempts) ? studentData.mockAttempts : {})
    .forEach(([examId, attempt]) => collect(examId, attempt));
  (Array.isArray(studentData.mocks) ? studentData.mocks : []).forEach((entry, index) => {
    if (entry?.score == null || text(entry.score) === '' || !Number.isFinite(Number(entry.score))) return;
    const finishedMs = timestamp(entry.date || entry.createdAt);
    if (finishedMs == null) return;
    completions.push({
      manualId: text(entry.id) || `${index}:${finishedMs}`,
      finishedAt: new Date(finishedMs).toISOString(), title: entry.title || 'Результат внесён преподавателем',
    });
  });
  return normalizeMonthlyMockCompletions(completions);
};

export const buildMonthlyMockStatus = (studentData = {}, exams = [], period = getMonthlyMockPeriod(), now = Date.now(), assignedExamId = '') => {
  if (!period) throw new TypeError('A valid month is required');
  const completions = collectMonthlyMockCompletions(studentData, exams).filter((entry) => {
    if (assignedExamId && entry.examId !== assignedExamId) return false;
    const ms = timestamp(entry.finishedAt);
    return ms >= period.startMs && ms < period.endMs && ms <= Number(now);
  });
  const examById = new Map(exams.map((exam) => [text(exam.id), exam]));
  const active = Object.entries(record(studentData.mockAttempts) ? studentData.mockAttempts : {})
    .filter(([examId, attempt]) => {
      if (assignedExamId && examId !== assignedExamId) return false;
      if (!record(attempt) || timestamp(attempt.finishedAt) != null || timestamp(attempt.timerFinishedAt) != null || attempt.status === 'finished') return false;
      if (!fullExamScope(attempt, examById.get(examId))) return false;
      const activity = timestamp(attempt.updatedAt) ?? timestamp(attempt.timerStartedAt) ?? timestamp(attempt.modeLockedAt);
      const hasAnswers = Object.values(record(attempt.answers) ? attempt.answers : {}).some(answerPresent);
      return activity != null && activity < period.endMs && activity <= Number(now)
        && (hasAnswers || timestamp(attempt.timerStartedAt) != null);
    })
    .sort((a, b) => (timestamp(b[1].updatedAt) || 0) - (timestamp(a[1].updatedAt) || 0));
  const currentMonth = getMonthlyMockMonth(now) === period.month;
  const exempt = Boolean(normalizeMonthlyMockExemptions(studentData.monthlyMockExemptions)[period.month]);
  return {
    month: period.month,
    status: completions.length ? 'completed' : (exempt ? 'exempt' : (currentMonth && active.length ? 'in_progress' : 'pending')),
    completedCount: completions.length,
    completion: completions[0] || null,
    activeExamId: currentMonth && active.length ? active[0][0] : '',
  };
};

export const prepareMonthlyMockHomeworkGoals = (goals, defaultMockGoal) => {
  const existing = Array.isArray(goals) ? [...goals] : [];
  const index = existing.findIndex((goal) => goal?.type === 'mock');
  if (index < 0) return [{ ...defaultMockGoal }, ...existing];
  const [mockGoal] = existing.splice(index, 1);
  return [mockGoal, ...existing];
};

export const normalizeMonthlyMockAssignments = (value) => {
  if (!record(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([teacherId, months]) => {
    const valid = [...new Set((Array.isArray(months) ? months : []).filter(month => typeof month === 'string' && getMonthlyMockPeriod(month)))].sort();
    return text(teacherId) && valid.length ? [[text(teacherId), valid]] : [];
  }));
};

export const normalizeMonthlyMockPublicationDay = (value, month = getMonthlyMockMonth()) => {
  const period = getMonthlyMockPeriod(month);
  const lastDay = period ? Math.round((period.endMs - period.startMs) / 86_400_000) : 0;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= lastDay ? value : null;
};

export const normalizeMonthlyMockPublicationDays = (value) => {
  if (!record(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([teacherId, months]) => {
    if (!text(teacherId) || !record(months)) return [];
    const days = Object.fromEntries(Object.entries(months).filter(([month, day]) => normalizeMonthlyMockPublicationDay(day, month) !== null));
    return Object.keys(days).length ? [[text(teacherId), days]] : [];
  }));
};

export const getMonthlyMockPublication = (exam, teacherId, month = getMonthlyMockMonth()) => {
  const period = getMonthlyMockPeriod(month);
  if (!period || !normalizeMonthlyMockAssignments(exam?.monthlyAssignments)[text(teacherId)]?.includes(month)) return null;
  const day = normalizeMonthlyMockPublicationDay(exam?.monthlyPublicationDays?.[text(teacherId)]?.[month], month) ?? 1;
  return { day, publishesAtMs: period.startMs + (day - 1) * 86_400_000 };
};

export const isMonthlyMockPublished = (exam, teacherId, month = getMonthlyMockMonth(), now = Date.now()) => {
  const publication = getMonthlyMockPublication(exam, teacherId, month);
  return !publication || Number(now) >= publication.publishesAtMs;
};

export const getAssignedMonthlyMockExam = (exams, teacherId, month = getMonthlyMockMonth()) => (
  (Array.isArray(exams) ? exams : []).find(exam => (
    normalizeMonthlyMockAssignments(exam?.monthlyAssignments)[text(teacherId)]?.includes(month)
    && exam?.access?.all === true
    && Object.keys(record(exam?.tasks) ? exam.tasks : {}).length > 0
  )) || null
);

// Replace only this teacher's designation for this month; keep earlier months.
export const updateMonthlyMockAssignment = (exams, { examId, teacherId, month, assigned, publicationDay }) => exams.map(exam => {
  const assignments = normalizeMonthlyMockAssignments(exam.monthlyAssignments);
  const previous = assignments[teacherId] || [];
  const months = assigned || exam.id === examId ? previous.filter(value => value !== month) : previous;
  if (assigned && exam.id === examId) months.push(month);
  if (months.length) assignments[teacherId] = [...new Set(months)].sort();
  else delete assignments[teacherId];
  const publications = normalizeMonthlyMockPublicationDays(exam.monthlyPublicationDays);
  const days = { ...publications[teacherId] };
  if (assigned || exam.id === examId) delete days[month];
  if (assigned && exam.id === examId) {
    days[month] = normalizeMonthlyMockPublicationDay(publicationDay, month)
      ?? getMonthlyMockPublication(exam, teacherId, month)?.day ?? 1;
  }
  if (Object.keys(days).length) publications[teacherId] = days;
  else delete publications[teacherId];
  return { ...exam, monthlyAssignments: assignments, monthlyPublicationDays: publications };
});
