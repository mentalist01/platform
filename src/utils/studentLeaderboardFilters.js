import {
  STUDENT_STUDY_STATUS_ACTIVE,
  normalizeStudentStudyStatus,
} from './studentStudyStatus.js';

export const STUDENT_GRADE_GRADUATE = 'graduate';

export const normalizeLeaderboardGrade = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (
    normalized === STUDENT_GRADE_GRADUATE
    || normalized === 'graduates'
    || normalized === 'выпускник'
    || normalized === 'выпускники'
  ) {
    return STUDENT_GRADE_GRADUATE;
  }
  return Number(value) === 10 ? 10 : 11;
};

export const gradesMatch = (left, right) => (
  normalizeLeaderboardGrade(left) === normalizeLeaderboardGrade(right)
);

export const isLeaderboardRowGraduate = (row) => Boolean(
  row?.isGraduate || normalizeLeaderboardGrade(row?.grade) === STUDENT_GRADE_GRADUATE
);

export const isLeaderboardRowStudying = (row) => {
  if (typeof row?.isStudying === 'boolean') return row.isStudying;
  return normalizeStudentStudyStatus(row?.studyStatus, row?.grade) === STUDENT_STUDY_STATUS_ACTIVE;
};

export const filterStudentLeaderboardRows = (rows, options = {}) => {
  const source = Array.isArray(rows) ? rows : [];
  const audienceFilter = String(options.audienceFilter || 'students');
  let audienceRows;

  if (audienceFilter === 'all') {
    audienceRows = source;
  } else if (audienceFilter === 'grade') {
    audienceRows = source.filter((row) => gradesMatch(row?.grade, options.currentStudentGrade));
  } else if (audienceFilter === 'graduates') {
    audienceRows = source.filter(isLeaderboardRowGraduate);
  } else {
    audienceRows = source.filter(isLeaderboardRowStudying);
  }

  return options.onlineOnly
    ? audienceRows.filter((row) => Boolean(row?.isOnline))
    : audienceRows;
};
