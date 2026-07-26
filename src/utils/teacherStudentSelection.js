export const normalizeTeacherStudentId = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

export const resolveTeacherStudentSelection = ({
  currentId,
  storedId,
  students,
  rosterLoaded = true,
} = {}) => {
  const normalizedCurrentId = normalizeTeacherStudentId(currentId);
  const normalizedStoredId = normalizeTeacherStudentId(storedId);
  if (!rosterLoaded) {
    return normalizedCurrentId || normalizedStoredId;
  }

  const list = (Array.isArray(students) ? students : []).filter(isCurrentStudent);
  const availableIds = new Set(
    list
      .map((student) => normalizeTeacherStudentId(student?.id))
      .filter(Boolean)
  );
  if (normalizedCurrentId && availableIds.has(normalizedCurrentId)) {
    return normalizedCurrentId;
  }
  if (normalizedStoredId && availableIds.has(normalizedStoredId)) {
    return normalizedStoredId;
  }
  return normalizeTeacherStudentId(list[0]?.id);
};
import { isCurrentStudent } from './studentStudyStatus.js';
