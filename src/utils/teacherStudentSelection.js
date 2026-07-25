export const normalizeTeacherStudentId = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

export const resolveTeacherStudentSelection = ({
  currentId,
  storedId,
  students,
} = {}) => {
  const list = (Array.isArray(students) ? students : []).filter(isCurrentStudent);
  const availableIds = new Set(
    list
      .map((student) => normalizeTeacherStudentId(student?.id))
      .filter(Boolean)
  );
  const normalizedCurrentId = normalizeTeacherStudentId(currentId);
  if (normalizedCurrentId && availableIds.has(normalizedCurrentId)) {
    return normalizedCurrentId;
  }
  const normalizedStoredId = normalizeTeacherStudentId(storedId);
  if (normalizedStoredId && availableIds.has(normalizedStoredId)) {
    return normalizedStoredId;
  }
  return normalizeTeacherStudentId(list[0]?.id);
};
import { isCurrentStudent } from './studentStudyStatus.js';
