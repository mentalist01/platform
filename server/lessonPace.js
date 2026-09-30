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

export function registerLessonPace(app, { store, lessons, groupById, canRead, canManage, studentName }) {
  const ended = lesson => lesson?.status === 'completed';
  app.get('/api/learning-lesson-feedback/pending', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.auth?.role !== 'student') return res.status(403).json({ error: 'Опрос доступен ученику' });
    const lesson = lessons().filter(lesson => ended(lesson)
      && lesson.participantIds.includes(req.auth.id)
      && canRead(req.auth, lesson, groupById(lesson.groupId))
      && !store.get(lesson.id, req.auth.id))
      .sort((a, b) => Date.parse(b.completedAt || b.startAt) - Date.parse(a.completedAt || a.startAt))[0];
    res.json({ lesson: lesson ? { id: lesson.id, groupId: lesson.groupId, topic: lesson.topic,
      groupName: groupById(lesson.groupId)?.name || 'Мини-группа', startAt: lesson.startAt } : null });
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
    if (req.auth?.role !== 'student' || !lesson.participantIds.includes(req.auth.id) || !canRead(req.auth, lesson, group)) {
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
    res.json({ responses, total: found.lesson.participantIds.length,
      pendingStudents: found.lesson.participantIds.filter(id => !responses.some(row => row.studentId === id))
        .map(studentId => ({ studentId, name: studentName(studentId) })) });
  });
}
