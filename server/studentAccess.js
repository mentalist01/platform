const normalizeId = (value) => String(value || '').trim();

export const resolveStudentAccessId = ({
  role = '',
  authenticatedStudentId = '',
  requestedStudentId = '',
  strictStudentId = false,
} = {}) => {
  const requestedId = normalizeId(requestedStudentId);
  if (role !== 'student' || strictStudentId) return requestedId;
  return normalizeId(authenticatedStudentId);
};

export const canAccessStudentRecord = (auth, student, options = {}) => {
  if (!auth || !student) return false;
  const allowDeleted = Boolean(options.allowDeleted);
  if (!allowDeleted && student.deletedAt) return false;
  if (auth.role === 'admin') return true;
  if (auth.role === 'teacher') return student.teacherId === auth.id;
  if (auth.role === 'student') return !student.deletedAt && student.id === auth.id;
  return false;
};
