import {randomBytes,createHash} from 'node:crypto';

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

export function createStudentViewHandoffs({now=Date.now,maxTickets=1000}={}) {
  const entries=new Map(),hash=value=>createHash('sha256').update(value).digest('hex');
  return {
    issue(parentToken,studentId) {
      for(const [key,value]of entries)if(value.expiresAt<=now())entries.delete(key);
      if(entries.size>=maxTickets)throw Error('Too many pending student windows');
      const ticket='svh_'+randomBytes(32).toString('hex'),expiresAt=now()+60_000;
      entries.set(hash(ticket),{parentToken,studentId,expiresAt});
      return {handoff:ticket,expiresAt:new Date(expiresAt).toISOString()};
    },
    take(ticket) {
      if(typeof ticket!=='string'||!/^svh_[a-f0-9]{64}$/.test(ticket))return null;
      const key=hash(ticket),entry=entries.get(key);entries.delete(key);
      return entry&&entry.expiresAt>now()?entry:null;
    },
  };
}

export function registerStudentViewRoutes(app, { findStudent, create, revoke, handoffs, resolveParent, publicRoutes=false }) {
  if(publicRoutes) {
    app.post('/api/student-view/redeem',(req,res)=>{
      res.set('Cache-Control','private, no-store');
      if(req.headers['x-student-view']!=='1'||!req.is('application/json'))
        return res.status(403).json({error:'Откройте кабинет из приложения преподавателя.'});
      const entry=handoffs.take(req.body?.handoff);
      const parent=entry&&resolveParent(entry.parentToken),student=entry&&findStudent(entry.studentId);
      if(!parent||parent.studentView||!['teacher','admin'].includes(parent.user?.role)||!student
        ||parent.user.role!=='admin'&&student.teacherId!==parent.user.id)
        return res.status(410).json({error:'Ссылка для входа истекла или уже использована. Откройте кабинет ученика из приложения ещё раз.'});
      try {
        // No browser cookie is read or changed. Only this tab receives the new
        // pupil-scoped session after the one-time handoff has been consumed.
        req.auth=parent.user;req.authToken=parent.token;
        return res.status(201).json(create(req,student));
      }catch(error){console.error('[student-view] cannot redeem handoff:',error.message);return res.status(500).json({error:'Не удалось открыть кабинет. Откройте его из приложения ещё раз.'});}
    });
    return;
  }
  app.post('/api/students/:id/open-session', (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!['teacher', 'admin'].includes(req.auth?.role) || req.auth.studentView)
      return res.status(403).json({ error: 'Вход в кабинет ученика доступен его преподавателю.' });
    if (req.headers['x-student-view'] !== '1' || !req.is('application/json'))
      return res.status(403).json({ error: 'Откройте кабинет кнопкой в списке учеников.' });
    const student = findStudent(req.params.id);
    if (!student || req.auth.role !== 'admin' && student.teacherId !== req.auth.id)
      return res.status(404).json({ error: 'Ученик не найден.' });
    try { return res.status(201).json(req.body?.external===true?handoffs.issue(req.authToken,student.id):create(req, student)); }
    catch (error) { console.error('[student-view] cannot create session:', error.message); return res.status(500).json({ error: 'Не удалось открыть кабинет. Попробуйте ещё раз.' }); }
  });
  app.post('/api/student-view/end', (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.auth.studentView) return res.status(403).json({ error: 'Эта вкладка не открыта от имени ученика.' });
    revoke(req.authToken);
    return res.json({ ok: true });
  });
}
