import fs from 'node:fs';
import path from 'node:path';

export function createLessonPaceStore(file) {
  let rows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const list = lessonId => rows.filter(row => row.lessonId === lessonId);
  return {
    list,
    get: (lessonId, studentId) => list(lessonId).find(row => row.studentId === studentId),
    put(row) {
      const next = [...rows.filter(old => old.lessonId !== row.lessonId || old.studentId !== row.studentId), row];
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
      fs.renameSync(`${file}.tmp`, file);
      rows = next;
      return row;
    },
  };
}

export function registerLessonPace(app, { store, lessons, groupById, canRead, canManage, studentName, requiresFeedback = () => true,
  individualLessons = () => [], canReadIndividual = () => false, teacherStudents = () => [] }) {
  const ended = lesson => lesson?.status === 'completed';
  const eligible = (lesson, id) => lesson.participantIds.includes(id)
    && (lesson.kind === 'individual' || requiresFeedback(lesson, id));
  const readable = (auth, lesson) => lesson.kind === 'individual' ? canReadIndividual(auth, lesson)
    : canRead(auth, lesson, groupById(lesson.groupId));
  const allLessons = auth => [...lessons(), ...individualLessons(auth)];
  const context = lesson => ({ id: lesson.id, kind: lesson.kind || 'group', groupId: lesson.groupId,
    topic: typeof lesson.topic === 'object' ? lesson.topic?.text : lesson.topic,
    groupName: lesson.kind === 'individual' ? 'Индивидуальный урок' : groupById(lesson.groupId)?.name || 'Мини-группа',
    startAt: lesson.startAt });
  app.get('/api/learning-lesson-feedback/pending', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.auth?.role !== 'student') return res.status(403).json({ error: 'Опрос доступен ученику' });
    const lesson = allLessons(req.auth).filter(lesson => ended(lesson)
      && eligible(lesson, req.auth.id)
      && readable(req.auth, lesson)
      && !store.get(lesson.id, req.auth.id))
      .sort((a, b) => Date.parse(b.completedAt || b.startAt) - Date.parse(a.completedAt || a.startAt))[0];
    res.json({ lesson: lesson ? context(lesson) : null });
  });
  app.put('/api/individual-lessons/:lessonId/pace', (req, res) => {
    if (req.auth?.role !== 'student') return res.status(403).json({ error: 'Опрос доступен ученику' });
    const lesson = individualLessons(req.auth).find(item => item.id === req.params.lessonId);
    if (!lesson || !eligible(lesson, req.auth.id) || !readable(req.auth, lesson)) {
      return res.status(403).json({ error: 'Нет доступа к оценке этого занятия' });
    }
    if (!ended(lesson)) return res.status(409).json({ error: 'Оценить темп можно после окончания занятия' });
    const value = req.body?.value;
    if (!Number.isInteger(value) || value < 0 || value > 100) return res.status(400).json({ error: 'Выберите темп на шкале от 0 до 100' });
    res.json({ feedback: store.put({ lessonId: lesson.id, kind: 'individual', teacherId: lesson.teacherId,
      studentId: req.auth.id, value, updatedAt: new Date().toISOString() }) });
  });
  const teacherRows = req => allLessons(req.auth).filter(lesson => ended(lesson)
    && (lesson.kind === 'individual' ? lesson.teacherId === req.auth.id
      : canManage(req.auth, groupById(lesson.groupId))));
  const studentLesson = (lesson, studentId) => ({ ...context(lesson),
    feedback: store.get(lesson.id, studentId) || null });
  app.get('/api/lesson-pace/students', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.auth?.role !== 'teacher') return res.status(403).json({ error: 'Ответы доступны преподавателю' });
    const rows = teacherRows(req).sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
    res.json({ students: teacherStudents(req.auth).map(student => {
      const conducted = rows.filter(lesson => eligible(lesson, student.id));
      return { studentId: student.id, latest: conducted[0] ? studentLesson(conducted[0], student.id) : null,
        pendingCount: conducted.filter(lesson => !store.get(lesson.id, student.id)).length };
    }) });
  });
  app.get('/api/lesson-pace/students/:studentId', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.auth?.role !== 'teacher') return res.status(403).json({ error: 'Ответы доступны преподавателю' });
    const student = teacherStudents(req.auth).find(item => item.id === req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Ученик не найден' });
    const rows = teacherRows(req).filter(lesson => eligible(lesson, student.id))
      .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
    const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
    const page = rows.slice(offset, offset + 30);
    res.json({ lessons: page.map(lesson => studentLesson(lesson, student.id)), total: rows.length,
      nextOffset: offset + page.length < rows.length ? offset + page.length : null });
  });
  const target = (req, res) => {
    const group = groupById(req.params.groupId);
    const lesson = lessons().find(item => item.id === req.params.lessonId && item.groupId === group?.id);
    if (!lesson || !group || group.deletedAt) { res.status(404).json({ error: 'Занятие не найдено' }); return null; }
    return { group, lesson };
  };
  app.put('/api/learning-groups/:groupId/lessons/:lessonId/pace', (req, res) => {
    const found = target(req, res); if (!found) return;
    const { lesson, group } = found;
    if (req.auth?.role !== 'student' || !lesson.participantIds.includes(req.auth.id) || !canRead(req.auth, lesson, group) || !requiresFeedback(lesson,req.auth.id)) {
      return res.status(403).json({ error: 'Нет доступа к оценке этого занятия' });
    }
    if (!ended(lesson)) return res.status(409).json({ error: 'Оценить темп можно после окончания занятия' });
    const value = req.body?.value;
    if (!Number.isInteger(value) || value < 0 || value > 100) return res.status(400).json({ error: 'Выберите темп на шкале от 0 до 100' });
    const feedback = store.put({ lessonId: lesson.id, groupId: group.id, studentId: req.auth.id,
      value, updatedAt: new Date().toISOString() });
    res.json({ feedback });
  });
  app.get('/api/learning-groups/:groupId/lessons/:lessonId/pace', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const found = target(req, res); if (!found) return;
    if (!canManage(req.auth, found.group)) return res.status(403).json({ error: 'Ответы доступны преподавателю' });
    const responses = store.list(found.lesson.id).map(row => ({ ...row, name: studentName(row.studentId) }));
    const participants = found.lesson.participantIds.filter(id=>requiresFeedback(found.lesson,id));
    res.json({ responses, total: new Set([...participants,...responses.map(r=>r.studentId)]).size,
      pendingStudents: participants.filter(id => !responses.some(row => row.studentId === id))
        .map(studentId => ({ studentId, name: studentName(studentId) })) });
  });
}
