export const STUDENT_STUDY_STATUS_ACTIVE = 'active';
export const STUDENT_STUDY_STATUS_INACTIVE = 'inactive';

const GRADUATE_GRADES = new Set([
  'graduate',
  'graduates',
  'alumni',
  'alumnus',
  'выпускник',
  'выпускники',
]);

const INACTIVE_STUDY_STATUSES = new Set([
  STUDENT_STUDY_STATUS_INACTIVE,
  'former',
  'paused',
  'archive',
  'archived',
  'not-studying',
  'not_studying',
  'не учится',
]);

const ACTIVE_STUDY_STATUSES = new Set([
  STUDENT_STUDY_STATUS_ACTIVE,
  'current',
  'studying',
  'учится',
]);

export const isGraduateStudentGrade = (value) => (
  GRADUATE_GRADES.has(String(value ?? '').trim().toLowerCase())
);

export const parseStudentStudyStatus = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (ACTIVE_STUDY_STATUSES.has(normalized)) return STUDENT_STUDY_STATUS_ACTIVE;
  if (INACTIVE_STUDY_STATUSES.has(normalized)) return STUDENT_STUDY_STATUS_INACTIVE;
  return null;
};

export const normalizeStudentStudyStatus = (value, grade = null) => {
  if (isGraduateStudentGrade(grade)) return STUDENT_STUDY_STATUS_INACTIVE;
  return parseStudentStudyStatus(value) || STUDENT_STUDY_STATUS_ACTIVE;
};

export const isCurrentStudent = (student) => Boolean(
  student
  && !student.deletedAt
  && normalizeStudentStudyStatus(
    student.studyStatus ?? student.studentStudyStatus ?? student.enrollmentStatus,
    student.grade ?? student.studentGrade ?? student.className ?? student.class
  ) === STUDENT_STUDY_STATUS_ACTIVE
);

export const isInactiveStudent = (student) => Boolean(
  student
  && !student.deletedAt
  && !isCurrentStudent(student)
);
