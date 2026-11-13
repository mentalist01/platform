import crypto from 'node:crypto';

const clone = value => structuredClone(value);
const idFor = (examId, teacherId) => {
  const h = crypto.createHash('sha256').update(`mock-owner-v1:${examId}:${teacherId}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
};

// Materialize independent copies once. Shared attachment bytes are immutable;
// keys, content, publication settings and subsequent edits belong to each copy.
export function copyLegacyMockExams({exams, teacherIds, primaryTeacherId, studentTeachers = {}}) {
  const teachers = [...new Set(teacherIds.filter(Boolean))];
  if (!teachers.includes(primaryTeacherId)) throw Error('The primary teacher must exist');
  const mappings = Object.fromEntries(teachers.map(id => [id, {}]));
  const used = new Set(exams.map(exam => exam.id));
  const result = [];
  for (const exam of exams) {
    if (exam.teacherId) { result.push(clone(exam)); continue; }
    for (const teacherId of teachers) {
      const id = teacherId === primaryTeacherId ? exam.id : idFor(exam.id, teacherId);
      if (id !== exam.id && used.has(id)) throw Error('Duplicate destination exam');
      used.add(id); mappings[teacherId][exam.id] = id;
      const copy = {...clone(exam), id, teacherId, legacyTemplateId: exam.id};
      copy.access = {...copy.access, students: (copy.access?.students || []).filter(id => studentTeachers[id] === teacherId)};
      for (const field of ['monthlyAssignments','monthlyPublicationDays','monthlyReviewVideos','monthlyReviewPublications']) {
        if (copy[field]) copy[field] = Object.hasOwn(copy[field], teacherId) ? {[teacherId]: copy[field][teacherId]} : {};
      }
      result.push(copy);
    }
  }
  return {exams: result, mappings};
}

// Student ledgers are keyed by pupil id, teacher preferences by teacher id,
// and other records carry a teacher, pupil or group reference. Remap both
// dictionary keys and exact id values without changing text or file paths.
export function remapScopedMockReferences(value, {mappings, studentTeachers = {}, groupTeachers = {}}, inheritedTeacher = '') {
  if (typeof value === 'string') return mappings[inheritedTeacher]?.[value] || value;
  if (Array.isArray(value)) return value.map(entry => remapScopedMockReferences(entry, {mappings,studentTeachers,groupTeachers}, inheritedTeacher));
  if (!value || typeof value !== 'object') return value;
  const teacher = (mappings[value.teacherId] && value.teacherId)
    || studentTeachers[value.studentId] || groupTeachers[value.groupId] || inheritedTeacher;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    const context = studentTeachers[key] || (mappings[key] && key) || groupTeachers[key] || teacher;
    return [mappings[teacher]?.[key] || key, remapScopedMockReferences(entry, {mappings,studentTeachers,groupTeachers}, context)];
  }));
}
