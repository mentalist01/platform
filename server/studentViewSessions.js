export const STUDENT_VIEW_TTL_MS = 8 * 60 * 60_000;
export const isStudentViewToken = token => String(token || '').startsWith('sv_');

export function normalizeStudentView(value) {
  if (!value || typeof value !== 'object' || !/^[a-f0-9]{64}$/.test(value.parentToken || '')
    || !['teacher', 'admin'].includes(value.teacherRole) || !String(value.teacherId || '').trim()) return null;
  return { parentToken: value.parentToken, teacherId: String(value.teacherId), teacherRole: value.teacherRole,
    teacherName: String(value.teacherName || 'Преподаватель').slice(0, 200) };
}
export function studentViewExpiry(entry, now = Date.now()) {
  const expires = Number(entry.expiresAtMs), created = Number(entry.createdAtMs);
  return Number.isFinite(expires) && Number.isFinite(created) && expires > now
    && expires <= created + STUDENT_VIEW_TTL_MS ? expires : undefined;
}
export function canContinueStudentView(session, parent, student) {
  const view = normalizeStudentView(session?.studentView);
  return Boolean(view && parent && !parent.studentView && parent.user?.id === view.teacherId
    && parent.user.role === view.teacherRole && student?.role === 'student'
    && (view.teacherRole === 'admin' || student.teacherId === view.teacherId));
}
export function publicStudentView(session) {
  if (!session?.studentView) return undefined;
  return { teacherName: session.studentView.teacherName,
    expiresAt: new Date(session.expiresAtMs).toISOString() };
}

export function registerStudentViewRoutes(app, { findStudent, create, revoke }) {
  app.post('/api/students/:id/open-session', (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!['teacher', 'admin'].includes(req.auth?.role) || req.auth.studentView)
      return res.status(403).json({ error: 'Вход в кабинет ученика доступен его преподавателю.' });
    if (req.headers['x-student-view'] !== '1' || !req.is('application/json'))
      return res.status(403).json({ error: 'Откройте кабинет кнопкой в списке учеников.' });
    const student = findStudent(req.params.id);
    if (!student || req.auth.role !== 'admin' && student.teacherId !== req.auth.id)
      return res.status(404).json({ error: 'Ученик не найден.' });
    try { return res.status(201).json(create(req, student)); }
    catch (error) { console.error('[student-view] cannot create session:', error.message); return res.status(500).json({ error: 'Не удалось открыть кабинет. Попробуйте ещё раз.' }); }
  });
  app.post('/api/student-view/end', (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.auth.studentView) return res.status(403).json({ error: 'Эта вкладка не открыта от имени ученика.' });
    revoke(req.authToken);
    return res.json({ ok: true });
  });
}
