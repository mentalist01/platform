const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKLY_TASK_PRACTICE_TARGET = 10;
export const WEEKLY_TASK_PRACTICE_REFRESH_TARGET = 5;
export const WEEKLY_TASK_PRACTICE_WINDOW_DAYS = 7;
export const WEEKLY_TASK_PRACTICE_SRS_INTERVALS = Object.freeze([30, 60, 90, 120]);
export const WEEKLY_TASK_PRACTICE_WEAK_INTERVAL_DAYS = 14;

const isObjectRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseTimestamp = (value) => {
  const timestamp = typeof value === 'string' || value instanceof Date
    ? new Date(value).getTime()
    : (typeof value === 'number' ? value : Number.NaN);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getLocalDayNumber = (value) => {
  const timestamp = parseTimestamp(value);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
};

const getDayNumberFromDayKey = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return Math.floor(timestamp / DAY_MS);
};

const normalizeTaskNumber = (value, gameTheoryTask) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = Math.trunc(numeric);
  if (normalized === 20 || normalized === 21) return Math.trunc(Number(gameTheoryTask) || 19);
  return normalized;
};

const getQuestionPracticeKey = (levelId, questionId) => {
  const levelKey = String(levelId || '').trim();
  const questionKey = String(questionId ?? '').trim();
  if (!levelKey || !questionKey) return '';
  return `${levelKey}\u001f${questionKey}`;
};

const getHistoricalSolvedQuestionKeysByTask = (studentData, gameTheoryTask) => {
  const result = new Map();
  const solvedByTask = isObjectRecord(studentData?.solvedByTask) ? studentData.solvedByTask : {};

  Object.entries(solvedByTask).forEach(([rawTaskNumber, rawLevels]) => {
    const taskNumber = normalizeTaskNumber(rawTaskNumber, gameTheoryTask);
    if (!Number.isFinite(taskNumber) || !isObjectRecord(rawLevels)) return;
    const taskKey = String(taskNumber);
    const questionKeys = result.get(taskKey) || new Set();

    Object.entries(rawLevels).forEach(([levelId, rawLevel]) => {
      const solvedQuestionIds = Array.isArray(rawLevel?.solved) ? rawLevel.solved : [];
      solvedQuestionIds.forEach((questionId) => {
        const questionKey = getQuestionPracticeKey(levelId, questionId);
        if (questionKey) questionKeys.add(questionKey);
      });
    });

    if (questionKeys.size > 0) result.set(taskKey, questionKeys);
  });

  return result;
};

const getAnswerAttemptsByTask = (studentData, gameTheoryTask, referenceDay) => {
  const result = new Map();
  const solvedByTask = isObjectRecord(studentData?.solvedByTask) ? studentData.solvedByTask : {};

  Object.entries(solvedByTask).forEach(([rawTaskNumber, rawLevels]) => {
    const taskNumber = normalizeTaskNumber(rawTaskNumber, gameTheoryTask);
    if (!Number.isFinite(taskNumber) || !isObjectRecord(rawLevels)) return;
    const taskKey = String(taskNumber);
    const attempts = result.get(taskKey) || [];

    Object.entries(rawLevels).forEach(([levelId, rawLevel]) => {
      if (String(levelId || '').startsWith('_') || !isObjectRecord(rawLevel?.answerHistory)) return;
      Object.entries(rawLevel.answerHistory).forEach(([questionId, rawEntries]) => {
        const questionKey = getQuestionPracticeKey(levelId, questionId);
        if (!questionKey || !Array.isArray(rawEntries)) return;
        rawEntries.forEach((entry) => {
          const timestamp = parseTimestamp(entry?.submittedAt);
          const storedDayNumber = getDayNumberFromDayKey(entry?.localDay);
          const dayNumber = Number.isFinite(storedDayNumber)
            ? storedDayNumber
            : getLocalDayNumber(timestamp);
          if (!Number.isFinite(timestamp) || !Number.isFinite(dayNumber) || dayNumber > referenceDay) return;
          attempts.push({
            questionKey,
            timestamp,
            dayNumber,
            iso: new Date(timestamp).toISOString(),
            correct: entry?.correct === true,
          });
        });
      });
    });

    if (attempts.length > 0) result.set(taskKey, attempts);
  });

  return result;
};

const normalizeIsoTimestamp = (value) => {
  const timestamp = parseTimestamp(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
};

const normalizeDayNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const normalizeSrsLevel = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(
    0,
    Math.min(WEEKLY_TASK_PRACTICE_SRS_INTERVALS.length - 1, Math.trunc(numeric))
  );
};

const getSrsIntervalForLevel = (level) => (
  WEEKLY_TASK_PRACTICE_SRS_INTERVALS[normalizeSrsLevel(level)]
  || WEEKLY_TASK_PRACTICE_SRS_INTERVALS[0]
);

const inferSrsLevel = (rawLevel, rawIntervalDays) => {
  if (Number.isFinite(Number(rawLevel))) return normalizeSrsLevel(rawLevel);
  const intervalDays = Number(rawIntervalDays);
  if (!Number.isFinite(intervalDays)) return 0;
  let closestLevel = 0;
  WEEKLY_TASK_PRACTICE_SRS_INTERVALS.forEach((candidate, index) => {
    if (Math.abs(candidate - intervalDays) < Math.abs(
      WEEKLY_TASK_PRACTICE_SRS_INTERVALS[closestLevel] - intervalDays
    )) closestLevel = index;
  });
  return closestLevel;
};

const getQualificationDay = (qualifiedAt, rawDayNumber) => {
  const dayNumber = normalizeDayNumber(rawDayNumber);
  return Number.isFinite(dayNumber) ? dayNumber : getLocalDayNumber(qualifiedAt);
};

const getLatestQualification = (...candidates) => {
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  let latestAt = '';
  let latestDay = null;

  candidates.forEach((candidate) => {
    const qualifiedAt = normalizeIsoTimestamp(candidate?.qualifiedAt);
    const timestamp = parseTimestamp(qualifiedAt);
    if (!Number.isFinite(timestamp)) return;
    const dayNumber = getQualificationDay(qualifiedAt, candidate?.qualifiedDay);
    if (
      timestamp < latestTimestamp
      || (
        timestamp === latestTimestamp
        && Number.isFinite(latestDay)
        && !Number.isFinite(dayNumber)
      )
    ) return;
    latestTimestamp = timestamp;
    latestAt = qualifiedAt;
    latestDay = dayNumber;
  });

  return {
    qualifiedAt: latestAt,
    qualifiedDay: Number.isFinite(latestDay) ? latestDay : null,
  };
};

export const normalizeWeeklyTaskPracticeMilestones = (
  rawMilestones,
  { gameTheoryTask = 19 } = {}
) => {
  if (!isObjectRecord(rawMilestones)) return {};
  const result = {};

  Object.entries(rawMilestones).forEach(([rawTaskNumber, rawMilestone]) => {
    const taskNumber = normalizeTaskNumber(rawTaskNumber, gameTheoryTask);
    if (!Number.isFinite(taskNumber) || !isObjectRecord(rawMilestone)) return;
    const initialQualifiedAt = normalizeIsoTimestamp(rawMilestone.initialQualifiedAt);
    const initialQualifiedDay = getQualificationDay(
      initialQualifiedAt,
      rawMilestone.initialQualifiedDay
    );
    const latestQualification = getLatestQualification(
      {
        qualifiedAt: initialQualifiedAt,
        qualifiedDay: initialQualifiedDay,
      },
      {
        qualifiedAt: rawMilestone.qualifiedAt || rawMilestone.lastQualifiedAt,
        qualifiedDay: rawMilestone.qualifiedDay ?? rawMilestone.lastQualifiedDay,
      }
    );
    const qualifiedAt = latestQualification.qualifiedAt;
    const legacy = Boolean(rawMilestone.legacy);
    const established = Boolean(
      rawMilestone.established
      || legacy
      || initialQualifiedAt
      || qualifiedAt
    );
    const tracked = Boolean(rawMilestone.tracked || established);
    if (!tracked) return;
    const srsLevel = inferSrsLevel(rawMilestone.srsLevel, rawMilestone.intervalDays);
    const rawIntervalDays = Number(rawMilestone.intervalDays);
    const intervalDays = established && Number.isFinite(rawIntervalDays) && rawIntervalDays > 0
      ? Math.max(1, Math.trunc(rawIntervalDays))
      : getSrsIntervalForLevel(srsLevel);
    const rawNextDueDay = normalizeDayNumber(rawMilestone.nextDueDay);
    const nextDueDay = established && Number.isFinite(rawNextDueDay)
      ? rawNextDueDay
      : (established && Number.isFinite(latestQualification.qualifiedDay)
          ? latestQualification.qualifiedDay + intervalDays
          : null);
    const hasLastReviewScore = rawMilestone.lastReviewScore !== null
      && typeof rawMilestone.lastReviewScore !== 'undefined'
      && String(rawMilestone.lastReviewScore).trim() !== '';
    const rawLastReviewScore = Number(rawMilestone.lastReviewScore);
    const lastReviewScore = hasLastReviewScore && Number.isFinite(rawLastReviewScore)
      ? Math.max(0, Math.min(WEEKLY_TASK_PRACTICE_REFRESH_TARGET, Math.trunc(rawLastReviewScore)))
      : null;
    const lastReviewRating = ['strong', 'medium', 'weak'].includes(rawMilestone.lastReviewRating)
      ? rawMilestone.lastReviewRating
      : '';
    result[String(taskNumber)] = {
      tracked: true,
      established,
      legacy: established && legacy,
      initialQualifiedAt,
      initialQualifiedDay: Number.isFinite(initialQualifiedDay) ? initialQualifiedDay : null,
      qualifiedAt,
      qualifiedDay: latestQualification.qualifiedDay,
      ...(established ? {
        srsLevel,
        intervalDays,
        nextDueDay: Number.isFinite(nextDueDay) ? nextDueDay : null,
        reviewCount: Math.max(0, Math.trunc(Number(rawMilestone.reviewCount) || 0)),
        lastReviewScore,
        lastReviewRating,
      } : {}),
    };
  });

  return result;
};

const addEvent = (
  eventsByTask,
  rawTaskNumber,
  gameTheoryTask,
  questionKey,
  rawTimestamp,
  source,
  rawDayNumber = null
) => {
  const taskNumber = normalizeTaskNumber(rawTaskNumber, gameTheoryTask);
  const timestamp = parseTimestamp(rawTimestamp);
  if (!Number.isFinite(taskNumber) || !questionKey || !Number.isFinite(timestamp)) return;
  const dayNumber = Number.isFinite(rawDayNumber)
    ? rawDayNumber
    : getLocalDayNumber(timestamp);
  if (!Number.isFinite(dayNumber)) return;
  const taskKey = String(taskNumber);
  const current = eventsByTask.get(taskKey) || [];
  current.push({
    questionKey,
    timestamp,
    dayNumber,
    iso: new Date(timestamp).toISOString(),
    source,
  });
  eventsByTask.set(taskKey, current);
};

const removeQuestionFromWindow = (questionCounts, questionKey) => {
  const nextCount = (questionCounts.get(questionKey) || 0) - 1;
  if (nextCount > 0) questionCounts.set(questionKey, nextCount);
  else questionCounts.delete(questionKey);
};

const getStatsForEvents = (
  rawEvents,
  rawAttempts,
  referenceDay,
  initialTarget,
  refreshTarget,
  windowDays,
  historicalQuestionKeys = new Set(),
  storedMilestone = null,
  hasLegacyProgressFallback = false
) => {
  const events = rawEvents
    .filter((event) => event.dayNumber <= referenceDay)
    .sort((left, right) => left.timestamp - right.timestamp);
  const questionCounts = new Map();
  let windowStart = 0;
  let computedInitialQualifiedAt = '';
  let computedInitialQualifiedDay = null;

  events.forEach((event, eventIndex) => {
    questionCounts.set(event.questionKey, (questionCounts.get(event.questionKey) || 0) + 1);
    while (
      windowStart <= eventIndex
      && event.dayNumber - events[windowStart].dayNumber >= windowDays
    ) {
      removeQuestionFromWindow(questionCounts, events[windowStart].questionKey);
      windowStart += 1;
    }
    if (!computedInitialQualifiedAt && questionCounts.size >= initialTarget) {
      computedInitialQualifiedAt = event.iso;
      computedInitialQualifiedDay = event.dayNumber;
    }
  });

  const currentWindowStart = referenceDay - windowDays + 1;
  const currentQuestionKeys = new Set(
    events
      .filter((event) => event.dayNumber >= currentWindowStart)
      .map((event) => event.questionKey)
  );
  const recordedQuestionKeys = new Set(events.map((event) => event.questionKey));
  const normalizedHistoricalQuestionKeys = historicalQuestionKeys instanceof Set
    ? historicalQuestionKeys
    : new Set();
  const legacyQuestionCount = [...normalizedHistoricalQuestionKeys]
    .filter((questionKey) => !recordedQuestionKeys.has(questionKey))
    .length;
  const normalizedStoredMilestone = isObjectRecord(storedMilestone)
    ? storedMilestone
    : {};
  const storedInitialQualifiedAt = normalizeIsoTimestamp(
    normalizedStoredMilestone.initialQualifiedAt
  );
  const storedInitialQualifiedDay = getQualificationDay(
    storedInitialQualifiedAt,
    normalizedStoredMilestone.initialQualifiedDay
  );
  const storedQualification = getLatestQualification(
    {
      qualifiedAt: normalizedStoredMilestone.qualifiedAt
        || normalizedStoredMilestone.lastQualifiedAt,
      qualifiedDay: normalizedStoredMilestone.qualifiedDay
        ?? normalizedStoredMilestone.lastQualifiedDay,
    }
  );
  const storedQualifiedAt = storedQualification.qualifiedAt;
  const hasStoredEstablishedPractice = Boolean(
    normalizedStoredMilestone.established
    || storedInitialQualifiedAt
    || storedQualifiedAt
  );
  const hasStoredTrackedPractice = Boolean(
    normalizedStoredMilestone.tracked
    || hasStoredEstablishedPractice
  );
  const hasLegacyPractice = Boolean(normalizedStoredMilestone.legacy)
    || (
      !hasStoredTrackedPractice
      && (legacyQuestionCount > 0 || Boolean(hasLegacyProgressFallback))
    );
  const hasEstablishedPractice = hasStoredEstablishedPractice
    || hasLegacyPractice
    || Boolean(computedInitialQualifiedAt);
  const storedReviewCount = Math.max(
    0,
    Math.trunc(Number(normalizedStoredMilestone.reviewCount) || 0)
  );
  const storedInitialCompletionIsCurrent = !hasLegacyPractice
    && storedReviewCount === 0
    && Number.isFinite(storedInitialQualifiedDay)
    && storedInitialQualifiedDay >= currentWindowStart
    && currentQuestionKeys.size >= initialTarget;
  const isReviewPhase = (hasStoredEstablishedPractice && !storedInitialCompletionIsCurrent)
    || hasLegacyPractice
    || (
      Number.isFinite(computedInitialQualifiedDay)
      && computedInitialQualifiedDay < currentWindowStart
    );
  const hasTrackedPractice = hasStoredTrackedPractice
    || events.length > 0
    || hasEstablishedPractice;
  const initialQualifiedAt = storedInitialQualifiedAt || computedInitialQualifiedAt;
  const initialQualifiedDay = storedInitialQualifiedAt
    ? storedInitialQualifiedDay
    : computedInitialQualifiedDay;
  const qualification = hasEstablishedPractice
    ? getLatestQualification(
        storedQualification,
        { qualifiedAt: initialQualifiedAt, qualifiedDay: initialQualifiedDay }
      )
    : { qualifiedAt: '', qualifiedDay: null };
  const srsLevel = inferSrsLevel(
    normalizedStoredMilestone.srsLevel,
    normalizedStoredMilestone.intervalDays
  );
  const storedIntervalDays = Number(normalizedStoredMilestone.intervalDays);
  const intervalDays = Number.isFinite(storedIntervalDays) && storedIntervalDays > 0
    ? Math.max(1, Math.trunc(storedIntervalDays))
    : getSrsIntervalForLevel(srsLevel);
  const storedNextDueDay = normalizeDayNumber(normalizedStoredMilestone.nextDueDay);
  const nextDueDay = Number.isFinite(storedNextDueDay)
    ? storedNextDueDay
    : (Number.isFinite(qualification.qualifiedDay)
        ? qualification.qualifiedDay + intervalDays
        : null);
  const earliestAttemptDay = (Array.isArray(rawAttempts) ? rawAttempts : []).reduce(
    (earliest, attempt) => (
      Number.isFinite(attempt?.dayNumber) ? Math.min(earliest, attempt.dayNumber) : earliest
    ),
    Number.POSITIVE_INFINITY
  );
  const reviewDueDay = Number.isFinite(nextDueDay)
    ? nextDueDay
    : (hasLegacyPractice && Number.isFinite(earliestAttemptDay) ? earliestAttemptDay : null);
  const reviewAttempts = Array.isArray(rawAttempts) ? [...rawAttempts] : [];
  const attemptQuestionKeys = new Set(reviewAttempts.map((attempt) => attempt.questionKey));
  events.forEach((event) => {
    if (attemptQuestionKeys.has(event.questionKey)) return;
    reviewAttempts.push({ ...event, correct: true });
  });
  const reviewStats = isReviewPhase
    ? getSrsReviewStats(
        reviewAttempts,
        reviewDueDay,
        referenceDay,
        refreshTarget,
        windowDays
      )
    : { currentCount: 0, qualifiedAt: '', qualifiedDay: null, score: null, rating: '' };
  const effectiveQualification = getLatestQualification(
    qualification,
    { qualifiedAt: reviewStats.qualifiedAt, qualifiedDay: reviewStats.qualifiedDay }
  );

  return {
    target: initialTarget,
    initialTarget,
    refreshTarget,
    windowDays,
    referenceDay,
    currentCount: isReviewPhase ? reviewStats.currentCount : currentQuestionKeys.size,
    initialCurrentCount: currentQuestionKeys.size,
    initialQualifiedAt,
    initialQualifiedDay,
    refreshQualifiedAt: reviewStats.qualifiedAt,
    refreshQualifiedDay: reviewStats.qualifiedDay,
    qualifiedAt: effectiveQualification.qualifiedAt,
    qualifiedDay: effectiveQualification.qualifiedDay,
    srsLevel,
    intervalDays,
    nextDueDay,
    pendingReviewScore: reviewStats.score,
    pendingReviewRating: reviewStats.rating,
    reviewCount: storedReviewCount,
    lastReviewScore: normalizedStoredMilestone.lastReviewScore !== null
      && typeof normalizedStoredMilestone.lastReviewScore !== 'undefined'
      && String(normalizedStoredMilestone.lastReviewScore).trim() !== ''
      && Number.isFinite(Number(normalizedStoredMilestone.lastReviewScore))
      ? Number(normalizedStoredMilestone.lastReviewScore)
      : null,
    lastReviewRating: normalizedStoredMilestone.lastReviewRating || '',
    lastSolvedAt: events.length > 0 ? events[events.length - 1].iso : '',
    recordedSolutionCount: events.length,
    recordedQuestionCount: recordedQuestionKeys.size,
    historicalQuestionCount: normalizedHistoricalQuestionKeys.size,
    legacyQuestionCount,
    hasLegacyPractice,
    hasEstablishedPractice,
    hasTrackedPractice,
  };
};

const getSrsReviewStats = (rawAttempts, dueDay, referenceDay, target, windowDays) => {
  if (!Number.isFinite(dueDay) || referenceDay < dueDay) {
    return { currentCount: 0, qualifiedAt: '', qualifiedDay: null, score: null, rating: '' };
  }
  const attempts = rawAttempts
    .filter((entry) => entry.dayNumber >= dueDay && entry.dayNumber <= referenceDay)
    .sort((left, right) => left.timestamp - right.timestamp);
  let windowStart = 0;
  const windowAttemptsByQuestion = new Map();
  let qualification = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const questionAttempts = windowAttemptsByQuestion.get(attempt.questionKey) || [];
    questionAttempts.push(attempt);
    windowAttemptsByQuestion.set(attempt.questionKey, questionAttempts);
    while (
      windowStart <= index
      && attempt.dayNumber - attempts[windowStart].dayNumber >= windowDays
    ) {
      const expiredAttempt = attempts[windowStart];
      const currentQuestionAttempts = windowAttemptsByQuestion.get(expiredAttempt.questionKey) || [];
      if (currentQuestionAttempts[0] === expiredAttempt) currentQuestionAttempts.shift();
      if (currentQuestionAttempts.length > 0) {
        windowAttemptsByQuestion.set(expiredAttempt.questionKey, currentQuestionAttempts);
      } else {
        windowAttemptsByQuestion.delete(expiredAttempt.questionKey);
      }
      windowStart += 1;
    }
    if (windowAttemptsByQuestion.size >= target) {
      const evaluated = [...windowAttemptsByQuestion.values()]
        .map(([firstAttempt]) => firstAttempt)
        .filter(Boolean)
        .sort((left, right) => left.timestamp - right.timestamp)
        .slice(0, target);
      const score = evaluated.reduce(
        (total, entry) => total + (entry.correct === true ? 1 : 0),
        0
      );
      qualification = {
        qualifiedAt: attempt.iso,
        qualifiedDay: attempt.dayNumber,
        score,
        rating: score >= 4 ? 'strong' : (score === 3 ? 'medium' : 'weak'),
      };
      break;
    }
  }

  const currentWindowStart = Math.max(dueDay, referenceDay - windowDays + 1);
  return {
    currentCount: new Set(
      attempts
        .filter((entry) => entry.dayNumber >= currentWindowStart)
        .map((entry) => entry.questionKey)
    ).size,
    qualifiedAt: qualification?.qualifiedAt || '',
    qualifiedDay: qualification?.qualifiedDay ?? null,
    score: qualification?.score ?? null,
    rating: qualification?.rating || '',
  };
};

/**
 * Builds per-task practice stats from successful answer submissions.
 * A new topic becomes fresh after 10 different correct solutions during any
 * rolling seven local calendar days. Once established, a review evaluates
 * the first attempt on five different questions in the active seven-day window.
 */
export const buildWeeklyTaskPracticeStats = (
  studentData,
  {
    gameTheoryTask = 19,
    referenceDate = new Date(),
    referenceDayKey = '',
    target = WEEKLY_TASK_PRACTICE_TARGET,
    refreshTarget = WEEKLY_TASK_PRACTICE_REFRESH_TARGET,
    windowDays = WEEKLY_TASK_PRACTICE_WINDOW_DAYS,
  } = {}
) => {
  const safeTarget = Math.max(1, Math.trunc(Number(target) || WEEKLY_TASK_PRACTICE_TARGET));
  const safeRefreshTarget = Math.min(
    safeTarget,
    Math.max(
      1,
      Math.trunc(Number(refreshTarget) || WEEKLY_TASK_PRACTICE_REFRESH_TARGET)
    )
  );
  const safeWindowDays = Math.max(1, Math.trunc(Number(windowDays) || WEEKLY_TASK_PRACTICE_WINDOW_DAYS));
  const referenceTimestamp = parseTimestamp(referenceDate);
  const storedReferenceDay = getDayNumberFromDayKey(referenceDayKey);
  const referenceDay = Number.isFinite(storedReferenceDay)
    ? storedReferenceDay
    : getLocalDayNumber(referenceDate);
  if (!Number.isFinite(referenceDay)) return {};

  const eventsByTask = new Map();
  const firstEventByQuestion = new Map();
  let earliestRecordedAt = '';
  let earliestRecordedTimestamp = Number.POSITIVE_INFINITY;

  // solvedEvents is created only when a question is solved correctly for the first
  // time. It drives the initial ten-question qualification; answerHistory above is
  // used for SRS reviews, including repeated and incorrect attempts.
  // Mock exams belong to a separate product flow and are intentionally not mixed into
  // the student's weekly practice for the topic cards.
  const solvedEvents = Array.isArray(studentData?.solvedEvents) ? studentData.solvedEvents : [];
  solvedEvents.forEach((event) => {
    const source = String(event?.source || '').trim().toLowerCase();
    if (source === 'mock-exam' || source === 'mock-exam-task') return;
    const normalizedTask = normalizeTaskNumber(event?.taskNumber, gameTheoryTask);
    const questionKey = getQuestionPracticeKey(event?.levelId, event?.questionId);
    const timestamp = parseTimestamp(event?.solvedAt);
    if (!Number.isFinite(normalizedTask) || !questionKey || !Number.isFinite(timestamp)) return;
    const storedLocalDayNumber = getDayNumberFromDayKey(event?.localDay);
    const dayNumber = Number.isFinite(storedLocalDayNumber)
      ? storedLocalDayNumber
      : getLocalDayNumber(timestamp);
    if (!Number.isFinite(dayNumber) || dayNumber > referenceDay) return;

    const dedupeKey = `${normalizedTask}\u001e${questionKey}`;
    const previous = firstEventByQuestion.get(dedupeKey);
    if (!previous || timestamp < previous.timestamp) {
      firstEventByQuestion.set(dedupeKey, {
        normalizedTask,
        questionKey,
        timestamp,
        dayNumber,
      });
    }
    if (timestamp < earliestRecordedTimestamp) {
      earliestRecordedTimestamp = timestamp;
      earliestRecordedAt = new Date(timestamp).toISOString();
    }
  });

  firstEventByQuestion.forEach(({ normalizedTask, questionKey, timestamp, dayNumber }) => {
    addEvent(
      eventsByTask,
      normalizedTask,
      gameTheoryTask,
      questionKey,
      timestamp,
      'solved-event',
      dayNumber
    );
  });

  const historicalQuestionKeysByTask = getHistoricalSolvedQuestionKeysByTask(
    studentData,
    gameTheoryTask
  );
  const answerAttemptsByTask = getAnswerAttemptsByTask(
    studentData,
    gameTheoryTask,
    referenceDay
  );
  const storedMilestones = normalizeWeeklyTaskPracticeMilestones(
    studentData?.weeklyTaskPracticeMilestones,
    { gameTheoryTask }
  );
  const positiveProgressByTask = new Map();
  const rawProgress = isObjectRecord(studentData?.progress) ? studentData.progress : {};
  Object.entries(rawProgress).forEach(([rawTaskNumber, rawProgressValue]) => {
    const taskNumber = normalizeTaskNumber(rawTaskNumber, gameTheoryTask);
    if (!Number.isFinite(taskNumber) || Number(rawProgressValue) <= 0) return;
    positiveProgressByTask.set(String(taskNumber), Number(rawProgressValue));
  });
  const statsByTask = {};
  const taskKeys = new Set([
    ...eventsByTask.keys(),
    ...answerAttemptsByTask.keys(),
    ...historicalQuestionKeysByTask.keys(),
    ...Object.keys(storedMilestones),
    ...positiveProgressByTask.keys(),
  ]);
  taskKeys.forEach((taskKey) => {
    const events = eventsByTask.get(taskKey) || [];
    const historicalQuestionKeys = historicalQuestionKeysByTask.get(taskKey) || new Set();
    const hasLegacyProgressFallback = positiveProgressByTask.has(taskKey)
      && historicalQuestionKeys.size <= 0;
    statsByTask[taskKey] = getStatsForEvents(
      events,
      answerAttemptsByTask.get(taskKey) || [],
      referenceDay,
      safeTarget,
      safeRefreshTarget,
      safeWindowDays,
      historicalQuestionKeys,
      storedMilestones[taskKey] || null,
      hasLegacyProgressFallback
    );
  });
  Object.defineProperty(statsByTask, '__meta', {
    value: {
      target: safeTarget,
      refreshTarget: safeRefreshTarget,
      windowDays: safeWindowDays,
      referenceDay,
      referenceTimestamp,
      earliestRecordedAt,
    },
    enumerable: false,
  });
  return statsByTask;
};

export const buildWeeklyTaskPracticeMilestones = (
  statsByTask,
  previousMilestones = {},
  { gameTheoryTask = 19 } = {}
) => {
  const result = normalizeWeeklyTaskPracticeMilestones(previousMilestones, {
    gameTheoryTask,
  });

  Object.entries(isObjectRecord(statsByTask) ? statsByTask : {}).forEach(([
    rawTaskNumber,
    stats,
  ]) => {
    const taskNumber = normalizeTaskNumber(rawTaskNumber, gameTheoryTask);
    if (!Number.isFinite(taskNumber) || !isObjectRecord(stats)) return;
    const taskKey = String(taskNumber);
    const previous = result[taskKey] || {};
    const reviewTarget = Math.max(
      1,
      Math.trunc(Number(stats.refreshTarget) || WEEKLY_TASK_PRACTICE_REFRESH_TARGET)
    );
    const established = Boolean(
      stats.hasEstablishedPractice
      || previous.established
    );
    const tracked = Boolean(
      stats.hasTrackedPractice
      || previous.tracked
      || established
    );
    if (!tracked) return;
    const initialQualifiedAt = normalizeIsoTimestamp(
      previous.initialQualifiedAt || stats.initialQualifiedAt
    );
    const initialQualifiedDay = previous.initialQualifiedAt
      ? getQualificationDay(initialQualifiedAt, previous.initialQualifiedDay)
      : getQualificationDay(initialQualifiedAt, stats.initialQualifiedDay);
    const previousQualification = getLatestQualification(
      {
        qualifiedAt: previous.qualifiedAt,
        qualifiedDay: previous.qualifiedDay,
      },
      {
        qualifiedAt: initialQualifiedAt,
        qualifiedDay: initialQualifiedDay,
      }
    );
    const qualification = getLatestQualification(
      previousQualification,
      {
        qualifiedAt: stats.qualifiedAt,
        qualifiedDay: stats.qualifiedDay,
      },
      {
        qualifiedAt: initialQualifiedAt,
        qualifiedDay: initialQualifiedDay,
      }
    );
    const previousLevel = inferSrsLevel(previous.srsLevel, previous.intervalDays);
    const reviewQualifiedAt = normalizeIsoTimestamp(stats.refreshQualifiedAt);
    const reviewQualifiedDay = getQualificationDay(
      reviewQualifiedAt,
      stats.refreshQualifiedDay
    );
    const previousQualifiedTimestamp = parseTimestamp(previousQualification.qualifiedAt);
    const reviewQualifiedTimestamp = parseTimestamp(reviewQualifiedAt);
    const hasNewReview = established
      && Number.isFinite(reviewQualifiedTimestamp)
      && (!Number.isFinite(previousQualifiedTimestamp)
        || reviewQualifiedTimestamp > previousQualifiedTimestamp);
    let srsLevel = previousLevel;
    let intervalDays = Number(previous.intervalDays) > 0
      ? Math.max(1, Math.trunc(Number(previous.intervalDays)))
      : getSrsIntervalForLevel(srsLevel);
    let nextQualification = qualification;
    let reviewCount = Math.max(0, Math.trunc(Number(previous.reviewCount) || 0));
    let lastReviewScore = previous.lastReviewScore !== null
      && typeof previous.lastReviewScore !== 'undefined'
      && String(previous.lastReviewScore).trim() !== ''
      && Number.isFinite(Number(previous.lastReviewScore))
      ? Math.max(0, Math.min(reviewTarget, Math.trunc(Number(previous.lastReviewScore))))
      : null;
    let lastReviewRating = ['strong', 'medium', 'weak'].includes(previous.lastReviewRating)
      ? previous.lastReviewRating
      : '';

    if (hasNewReview) {
      const rating = stats.pendingReviewRating;
      if (rating === 'strong') {
        srsLevel = Math.min(
          WEEKLY_TASK_PRACTICE_SRS_INTERVALS.length - 1,
          srsLevel + 1
        );
        intervalDays = getSrsIntervalForLevel(srsLevel);
      } else if (rating === 'weak') {
        srsLevel = Math.max(0, srsLevel - 1);
        intervalDays = WEEKLY_TASK_PRACTICE_WEAK_INTERVAL_DAYS;
      }
      nextQualification = {
        qualifiedAt: reviewQualifiedAt,
        qualifiedDay: reviewQualifiedDay,
      };
      reviewCount += 1;
      lastReviewScore = Math.max(
        0,
        Math.min(reviewTarget, Math.trunc(Number(stats.pendingReviewScore) || 0))
      );
      lastReviewRating = rating;
    }
    const storedNextDueDay = normalizeDayNumber(previous.nextDueDay);
    const nextDueDay = hasNewReview && Number.isFinite(reviewQualifiedDay)
      ? reviewQualifiedDay + intervalDays
      : (Number.isFinite(storedNextDueDay)
          ? storedNextDueDay
          : (Number.isFinite(nextQualification.qualifiedDay)
              ? nextQualification.qualifiedDay + intervalDays
              : null));
    result[taskKey] = {
      tracked: true,
      established,
      legacy: established && Boolean(previous.legacy || stats.hasLegacyPractice),
      initialQualifiedAt,
      initialQualifiedDay: Number.isFinite(initialQualifiedDay) ? initialQualifiedDay : null,
      qualifiedAt: nextQualification.qualifiedAt,
      qualifiedDay: nextQualification.qualifiedDay,
      ...(established ? {
        srsLevel,
        intervalDays,
        nextDueDay: Number.isFinite(nextDueDay) ? nextDueDay : null,
        reviewCount,
        lastReviewScore,
        lastReviewRating,
      } : {}),
    };
  });

  return result;
};

export const getWeeklyTaskPracticeStats = (statsByTask, taskNumber, gameTheoryTask = 19) => {
  const normalizedTask = normalizeTaskNumber(taskNumber, gameTheoryTask);
  const stored = Number.isFinite(normalizedTask) ? statsByTask?.[String(normalizedTask)] : null;
  const meta = isObjectRecord(statsByTask?.__meta) ? statsByTask.__meta : {};
  const shared = {
    referenceTimestamp: parseTimestamp(meta.referenceTimestamp),
    earliestRecordedAt: typeof meta.earliestRecordedAt === 'string' ? meta.earliestRecordedAt : '',
  };
  if (stored) return { ...stored, ...shared };
  const initialTarget = Math.max(1, Number(meta.target) || WEEKLY_TASK_PRACTICE_TARGET);
  const refreshTarget = Math.min(
    initialTarget,
    Math.max(1, Number(meta.refreshTarget) || WEEKLY_TASK_PRACTICE_REFRESH_TARGET)
  );
  return {
    target: initialTarget,
    initialTarget,
    refreshTarget,
    windowDays: Math.max(1, Number(meta.windowDays) || WEEKLY_TASK_PRACTICE_WINDOW_DAYS),
    referenceDay: Number.isFinite(Number(meta.referenceDay))
      ? Number(meta.referenceDay)
      : getLocalDayNumber(new Date()),
    currentCount: 0,
    initialCurrentCount: 0,
    initialQualifiedAt: '',
    initialQualifiedDay: null,
    refreshQualifiedAt: '',
    refreshQualifiedDay: null,
    qualifiedAt: '',
    qualifiedDay: null,
    srsLevel: 0,
    intervalDays: WEEKLY_TASK_PRACTICE_SRS_INTERVALS[0],
    nextDueDay: null,
    pendingReviewScore: null,
    pendingReviewRating: '',
    reviewCount: 0,
    lastReviewScore: null,
    lastReviewRating: '',
    lastSolvedAt: '',
    recordedSolutionCount: 0,
    recordedQuestionCount: 0,
    historicalQuestionCount: 0,
    legacyQuestionCount: 0,
    hasLegacyPractice: false,
    hasEstablishedPractice: false,
    hasTrackedPractice: false,
    ...shared,
  };
};

const pluralizeRu = (value, one, few, many) => {
  const absolute = Math.abs(Math.trunc(value));
  const mod100 = absolute % 100;
  const mod10 = absolute % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const getElapsedParts = (days) => {
  if (days < 14) {
    return {
      value: days,
      unit: pluralizeRu(days, 'день', 'дня', 'дней'),
      agoUnit: pluralizeRu(days, 'день', 'дня', 'дней'),
    };
  }
  if (days < 60) {
    const value = Math.max(1, Math.floor(days / 7));
    return {
      value,
      unit: pluralizeRu(value, 'неделю', 'недели', 'недель'),
      agoUnit: pluralizeRu(value, 'неделю', 'недели', 'недель'),
    };
  }
  if (days < 365) {
    const value = Math.max(1, Math.floor(days / 30));
    return {
      value,
      unit: pluralizeRu(value, 'месяц', 'месяца', 'месяцев'),
      agoUnit: pluralizeRu(value, 'месяц', 'месяца', 'месяцев'),
    };
  }
  const value = Math.max(1, Math.floor(days / 365));
  return {
    value,
    unit: pluralizeRu(value, 'год', 'года', 'лет'),
    agoUnit: pluralizeRu(value, 'год', 'года', 'лет'),
  };
};

const formatElapsed = (days) => {
  const parts = getElapsedParts(days);
  return `${parts.value} ${parts.unit}`;
};

const formatElapsedLowerBound = (days) => {
  const safeDays = Math.max(1, Math.floor(Number(days) || 0));
  if (safeDays < 14) return `${safeDays} ${safeDays === 1 ? 'дня' : 'дней'}`;
  if (safeDays < 60) {
    const weeks = Math.max(1, Math.floor(safeDays / 7));
    return `${weeks} ${weeks === 1 ? 'недели' : 'недель'}`;
  }
  if (safeDays < 365) {
    const months = Math.max(1, Math.floor(safeDays / 30));
    return `${months} ${months === 1 ? 'месяца' : 'месяцев'}`;
  }
  const years = Math.max(1, Math.floor(safeDays / 365));
  return `${years} ${years === 1 ? 'года' : 'лет'}`;
};

const formatAgo = (days) => {
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  const parts = getElapsedParts(days);
  return `${parts.value} ${parts.agoUnit} назад`;
};

const formatExactDate = (value) => {
  const timestamp = parseTimestamp(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getWeeklyTaskPracticeIndicator = (
  stats,
  { progress = 0, availableQuestionCount = null } = {}
) => {
  const initialTarget = Math.max(
    1,
    Number(stats?.initialTarget ?? stats?.target) || WEEKLY_TASK_PRACTICE_TARGET
  );
  const refreshTarget = Math.min(
    initialTarget,
    Math.max(1, Number(stats?.refreshTarget) || WEEKLY_TASK_PRACTICE_REFRESH_TARGET)
  );
  const windowDays = Math.max(1, Number(stats?.windowDays) || WEEKLY_TASK_PRACTICE_WINDOW_DAYS);
  const currentCount = Math.max(0, Number(stats?.currentCount) || 0);
  const rawQualifiedAt = typeof stats?.qualifiedAt === 'string' ? stats.qualifiedAt : '';
  const initialQualifiedAt = typeof stats?.initialQualifiedAt === 'string'
    ? stats.initialQualifiedAt
    : '';
  const refreshQualifiedAt = typeof stats?.refreshQualifiedAt === 'string'
    ? stats.refreshQualifiedAt
    : '';
  const recordedSolutionCount = Math.max(0, Number(stats?.recordedSolutionCount) || 0);
  const earliestRecordedAt = typeof stats?.earliestRecordedAt === 'string'
    ? stats.earliestRecordedAt
    : '';
  const referenceDay = Number.isFinite(Number(stats?.referenceDay))
    ? Number(stats.referenceDay)
    : getLocalDayNumber(new Date());
  const hasLegacyProgressFallback = recordedSolutionCount <= 0 && Number(progress) > 0;
  const hasTrackedPractice = Boolean(stats?.hasTrackedPractice);
  const hasLegacyPractice = Boolean(stats?.hasLegacyPractice)
    || (
      !hasTrackedPractice
      && (Number(stats?.legacyQuestionCount) > 0 || hasLegacyProgressFallback)
    );
  const hasEstablishedPractice = Boolean(
    stats?.hasEstablishedPractice
    || initialQualifiedAt
    || rawQualifiedAt
    || hasLegacyPractice
  );
  const currentWindowStart = referenceDay - windowDays + 1;
  const storedInitialQualifiedDay = normalizeDayNumber(stats?.initialQualifiedDay);
  const initialQualifiedDay = Number.isFinite(storedInitialQualifiedDay)
    ? storedInitialQualifiedDay
    : getLocalDayNumber(initialQualifiedAt);
  const isInitialCompletionCurrent = !hasLegacyPractice
    && Number.isFinite(initialQualifiedDay)
    && initialQualifiedDay >= currentWindowStart
    && currentCount >= initialTarget;
  const target = !hasEstablishedPractice || isInitialCompletionCurrent
    ? initialTarget
    : refreshTarget;
  const qualifiedAt = rawQualifiedAt
    || (hasEstablishedPractice ? refreshQualifiedAt : '');
  const phase = target === initialTarget ? 'initial' : 'refresh';
  const base = {
    currentCount,
    target,
    phase,
    dateTime: qualifiedAt,
  };

  if (currentCount >= target) {
    return {
      ...base,
      key: 'current',
      label: `${currentCount} ${pluralizeRu(currentCount, 'задание', 'задания', 'заданий')} за ${windowDays} ${pluralizeRu(windowDays, 'день', 'дня', 'дней')}`,
      detail: phase === 'initial' ? 'Недельная норма выполнена' : 'Тема освежена',
      compactLabel: `${currentCount} за ${windowDays} дней`,
      ariaLabel: phase === 'initial'
        ? `Полноценная практика выполнена: ${currentCount} разных заданий за последние ${windowDays} дней при норме ${target}`
        : `Тема освежена: ${currentCount} разных заданий за последние ${windowDays} дней при норме повторения ${target}`,
      title: phase === 'initial'
        ? `За последние ${windowDays} дней правильно решено ${currentCount} разных заданий при норме ${target}. Недельная практика выполнена.`
        : `За последние ${windowDays} дней правильно решено ${currentCount} разных заданий при норме повторения ${target}. Тема освежена.`,
    };
  }

  const normalizedAvailableCount = availableQuestionCount === null
    ? null
    : Math.max(0, Math.trunc(Number(availableQuestionCount) || 0));
  const solvedQuestionCount = Math.max(
    0,
    Number(stats?.historicalQuestionCount) || 0,
    Number(stats?.recordedQuestionCount) || 0
  );
  const remainingUnseenQuestionCount = normalizedAvailableCount === null
    ? null
    : Math.max(0, normalizedAvailableCount - solvedQuestionCount);
  const maximumReachableCurrentCount = normalizedAvailableCount === null
    ? null
    : (phase === 'refresh'
        ? normalizedAvailableCount
        : currentCount + remainingUnseenQuestionCount);
  if (
    maximumReachableCurrentCount !== null
    && maximumReachableCurrentCount < target
  ) {
    return {
      ...base,
      key: 'unavailable',
      label: phase === 'initial' ? 'Норма пока недоступна' : 'Повторение пока недоступно',
      detail: '',
      compactLabel: 'Без оценки',
      ariaLabel: `Пока недостаточно новых заданий: можно набрать максимум ${maximumReachableCurrentCount} из ${target}`,
      title: `Для этой нормы нужны новые задания, решённые впервые. Сейчас можно набрать максимум ${maximumReachableCurrentCount} из ${target}.`,
    };
  }

  if (currentCount > 0) {
    const progressRatio = currentCount / target;
    const key = progressRatio <= 0.3
      ? 'building-low'
      : (progressRatio <= 0.6 ? 'building-mid' : 'building-high');
    const exactPreviousPractice = qualifiedAt ? formatExactDate(qualifiedAt) : '';
    return {
      ...base,
      key,
      label: `${currentCount} из ${target} заданий за ${windowDays} дней`,
      detail: phase === 'initial'
        ? `Ещё ${target - currentCount} ${pluralizeRu(target - currentCount, 'разное задание', 'разных задания', 'разных заданий')} до нормы`
        : `Ещё ${target - currentCount} ${pluralizeRu(target - currentCount, 'задание', 'задания', 'заданий')}, чтобы освежить тему`,
      compactLabel: `${currentCount}/${target} · ${windowDays} дней`,
      ariaLabel: phase === 'initial'
        ? `За последние ${windowDays} дней правильно решено ${currentCount} из ${target} разных заданий`
        : `Чтобы освежить тему, за последние ${windowDays} дней решено ${currentCount} из ${target} разных заданий`,
      title: phase === 'initial'
        ? `За последние ${windowDays} дней правильно решено ${currentCount} из ${target} разных заданий. До недельной нормы осталось ${target - currentCount}.`
        : `За последние ${windowDays} дней правильно решено ${currentCount} из ${target} разных заданий. Чтобы освежить тему, осталось ${target - currentCount}.${exactPreviousPractice ? ` Предыдущая полноценная практика: ${exactPreviousPractice}.` : ''}`,
    };
  }

  if (!qualifiedAt) {
    if (hasLegacyPractice) {
      const earliestRecordedTimestamp = parseTimestamp(earliestRecordedAt);
      const referenceTimestamp = parseTimestamp(stats?.referenceTimestamp) ?? Date.now();
      const elapsedLowerBoundDays = Number.isFinite(earliestRecordedTimestamp)
        && Number.isFinite(referenceTimestamp)
        && referenceTimestamp >= earliestRecordedTimestamp
        ? Math.floor((referenceTimestamp - earliestRecordedTimestamp) / DAY_MS)
        : 0;

      if (elapsedLowerBoundDays >= 30) {
        const elapsedLowerBound = formatElapsedLowerBound(elapsedLowerBoundDays);
        const exactBoundary = formatExactDate(earliestRecordedAt);
        const staleByLowerBound = elapsedLowerBoundDays >= 60;
        return {
          ...base,
          key: staleByLowerBound ? 'stale' : 'due',
          label: staleByLowerBound ? 'Давно без практики' : 'Пора повторить тему',
          detail: `Новых решений нет более ${elapsedLowerBound}`,
          compactLabel: `Более ${elapsedLowerBound}`,
          ariaLabel: `По теме не было новых правильных решений более ${elapsedLowerBound}`,
          title: `Точная дата старых решений не сохранилась. Новые решения по теме были раньше ${exactBoundary} — самой ранней сохранившейся даты решения этого ученика.`,
        };
      }

      return {
        ...base,
        key: 'unknown',
        label: 'Считаем с новых решений',
        detail: '',
        compactLabel: 'Нет данных',
        ariaLabel: 'Для старых решений не сохранились даты недельной практики',
        title: 'Прогресс есть, но даты старых решений не сохранились. Новая практика начнёт считаться автоматически.',
      };
    }
    if (
      recordedSolutionCount > 0
      || (hasTrackedPractice && Number(stats?.historicalQuestionCount) > 0)
    ) {
      return {
        ...base,
        key: 'below',
        label: `За ${windowDays} дней: 0 из ${target}`,
        detail: '',
        compactLabel: `Нет ${target} за неделю`,
        ariaLabel: `Пока не было недели с ${target} разными правильно решёнными заданиями`,
        title: `Есть отдельные решения, но ещё не было ${target} разных правильных решений за любые ${windowDays} дней.`,
      };
    }
    return {
      ...base,
      key: 'new',
      label: 'Пока без практики',
      detail: '',
      compactLabel: `0/${target} · ${windowDays} дней`,
      ariaLabel: `По теме ещё нет правильных решений за последние ${windowDays} дней`,
      title: `Полноценная практика появится после ${target} разных правильных решений за ${windowDays} дней.`,
    };
  }

  const storedQualifiedDay = normalizeDayNumber(stats?.qualifiedDay);
  const qualifiedDay = Number.isFinite(storedQualifiedDay)
    ? storedQualifiedDay
    : getLocalDayNumber(qualifiedAt);
  const storedNextDueDay = normalizeDayNumber(stats?.nextDueDay);
  const intervalDays = Math.max(
    1,
    Math.trunc(Number(stats?.intervalDays) || WEEKLY_TASK_PRACTICE_SRS_INTERVALS[0])
  );
  const nextDueDay = Number.isFinite(storedNextDueDay)
    ? storedNextDueDay
    : (Number.isFinite(qualifiedDay) ? qualifiedDay + intervalDays : null);
  const elapsedDays = Number.isFinite(referenceDay) && Number.isFinite(qualifiedDay)
    ? Math.max(0, referenceDay - qualifiedDay)
    : 0;
  const overdueDays = Number.isFinite(referenceDay) && Number.isFinite(nextDueDay)
    ? referenceDay - nextDueDay
    : Number.NEGATIVE_INFINITY;
  const exactDate = formatExactDate(qualifiedAt);
  const sharedTitle = phase === 'initial'
    ? `Последняя полноценная практика: ${exactDate}. Тогда за ${windowDays} дней было решено не менее ${target} разных заданий. Сейчас: ${currentCount} из ${target}.`
    : `Последнее освежение темы: ${exactDate}. Тогда за ${windowDays} дней было решено не менее ${target} разных заданий. Сейчас: ${currentCount} из ${target}.`;
  const completedPracticeDetail = phase === 'initial'
    ? `Недельная норма выполнена ${formatAgo(elapsedDays)}`
    : `Тема освежена ${formatAgo(elapsedDays)}`;

  if (overdueDays >= 30) {
    const elapsed = formatElapsed(Math.max(1, overdueDays));
    return {
      ...base,
      key: 'stale',
      label: 'Давно без практики',
      detail: completedPracticeDetail,
      compactLabel: `Просрочено · ${elapsed}`,
      ariaLabel: `Повторение темы просрочено на ${elapsed}`,
      title: sharedTitle,
    };
  }
  if (overdueDays >= 0) {
    const elapsed = overdueDays > 0 ? formatElapsed(overdueDays) : 'сегодня';
    return {
      ...base,
      key: 'due',
      label: 'Пора повторить тему',
      detail: completedPracticeDetail,
      compactLabel: overdueDays > 0 ? `Повторить · ${elapsed}` : 'Повторить сегодня',
      ariaLabel: overdueDays > 0
        ? `Пора повторить тему: срок наступил ${formatAgo(overdueDays)}`
        : 'Пора повторить тему сегодня',
      title: sharedTitle,
    };
  }
  return {
    ...base,
    key: 'recent',
    label: 'Тема ещё свежая',
    detail: completedPracticeDetail,
    compactLabel: formatAgo(elapsedDays),
    ariaLabel: `Полноценная практика была ${formatAgo(elapsedDays)}`,
    title: sharedTitle,
  };
};
