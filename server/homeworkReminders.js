import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const HOMEWORK_REMINDER_DELAY_MS = 2 * 60_000;
const DISCONNECT_GRACE_MS = 3 * 60_000;
const keyFor = (teacherId, occurrenceKey) => crypto.createHash('sha256').update(`${teacherId}\n${occurrenceKey}`).digest('hex');
const time = value => Number(value) || Date.parse(value) || 0;

// Observe actual lesson sessions, rather than every past calendar entry. The
// activation timestamp prevents old recovered replays from creating reminders.
export class HomeworkReminderStore {
  constructor(file, { now = Date.now } = {}) {
    this.file = file;
    this.now = now;
    this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { since: now(), lessons: {} };
    if (!fs.existsSync(file)) this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  observeReplay(replay) {
    const occurrence = replay?.occurrence;
    if (!occurrence?.key || (!occurrence.studentId && !occurrence.groupId)) return;
    const sessions = (replay.events || []).filter(event => event.type === 'session' && event.actor?.role === 'teacher');
    let changed = false;
    for (const teacherId of new Set(sessions.map(event => event.actor.id).filter(Boolean))) {
      const events = sessions.filter(event => event.actor.id === teacherId);
      const starts = events.filter(event => event.payload?.action === 'start').map(event => time(event.occurredAt)).filter(Boolean);
      if (!starts.length) continue;
      const id = keyFor(teacherId, occurrence.key);
      const previous = this.data.lessons[id];
      const recentStarts = starts.filter(start => start >= this.data.since);
      if (!previous && !recentStarts.length) continue;
      const startAt = Math.min(previous?.startAt || Infinity, ...recentStarts);
      const latestStartAt = Math.max(...starts);
      const endAt = Math.max(0, ...events.filter(event => event.payload?.action === 'end').map(event => time(event.occurredAt)));
      const lastEventAt = Math.max(latestStartAt, endAt);
      if (previous && lastEventAt <= previous.lastEventAt) continue;
      this.data.lessons[id] = {
        ...previous, id, teacherId, occurrenceKey: occurrence.key,
        studentId: occurrence.studentId || '', groupId: occurrence.groupId || '', lessonId: occurrence.lessonId || '',
        participantIds: occurrence.participantIds || [], dayKey: occurrence.dayKey, lessonTime: occurrence.time,
        startAt, lastEventAt, endAt: endAt >= latestStartAt ? endAt : 0, disconnectedAt: 0,
      };
      changed = true;
    }
    if (changed) this.save();
  }

  observeLesson(teacherId, occurrence, startAt, endAt = 0) {
    this.observeReplay({ occurrence, events: [
      { type: 'session', actor: { role: 'teacher', id: teacherId }, occurredAt: new Date(startAt).toISOString(), payload: { action: 'start' } },
      ...(endAt ? [{ type: 'session', actor: { role: 'teacher', id: teacherId }, occurredAt: new Date(endAt).toISOString(), payload: { action: 'end' } }] : []),
    ] });
  }

  finishLesson(teacherId, occurrence, endAt = this.now()) {
    const previous = this.data.lessons[keyFor(teacherId, occurrence.key)];
    if (previous) this.observeLesson(teacherId, occurrence, previous.startAt, endAt);
  }

  list(teacherId, { isActive, getTarget, getHomeworks }, now = this.now()) {
    const result = [];
    let changed = false;
    for (const lesson of Object.values(this.data.lessons)) {
      if (lesson.teacherId !== teacherId || lesson.dismissedAt || lesson.satisfiedAt) continue;
      const target = getTarget(lesson);
      if (!target) continue;
      if (isActive(lesson)) {
        if (lesson.endAt || lesson.disconnectedAt) {
          lesson.endAt = 0;
          lesson.disconnectedAt = 0;
          changed = true;
        }
        continue;
      }
      if (!lesson.endAt) {
        if (!lesson.disconnectedAt) { lesson.disconnectedAt = now; changed = true; }
        if (now - lesson.disconnectedAt < DISCONNECT_GRACE_MS) continue;
        lesson.endAt = lesson.disconnectedAt;
        changed = true;
      }
      // A short connection test is not a conducted lesson.
      if (lesson.endAt - lesson.startAt < 60_000 || now - lesson.endAt < HOMEWORK_REMINDER_DELAY_MS) continue;
      const homework = getHomeworks(lesson, target);
      const recipients = lesson.groupId ? target.participantIds : [lesson.studentId];
      const covered = new Set();
      for (const entry of homework || []) {
        if (entry.deletedAt || entry.status === 'draft' || time(entry.publishedAt || entry.issuedAt) < lesson.startAt) continue;
        if (!lesson.groupId && ![
          entry.homeWork, entry.lessonLink, entry.boardLink, entry.taskNumber,
          ...(entry.goals || []), ...(entry.materialIds || []), ...(entry.checklistItems || []),
        ].some(Boolean)) continue;
        if (!lesson.groupId || entry.recipientMode !== 'selected') recipients.forEach(id => covered.add(id));
        else (entry.recipientIds || []).forEach(id => covered.add(id));
      }
      if (!recipients.length || recipients.every(id => covered.has(id))) {
        lesson.satisfiedAt = now; changed = true; continue;
      }
      result.push({ id: lesson.id, studentId: lesson.studentId, groupId: lesson.groupId, lessonId: lesson.lessonId,
        name: target.name, endedAt: new Date(lesson.endAt).toISOString(), dayKey: lesson.dayKey, lessonTime: lesson.lessonTime });
    }
    if (changed) this.save();
    return result.sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
  }

  dismiss(teacherId, id) {
    const lesson = this.data.lessons[id];
    if (!lesson || lesson.teacherId !== teacherId) return false;
    if (!lesson.dismissedAt) { lesson.dismissedAt = this.now(); this.save(); }
    return true;
  }
}

export const registerHomeworkReminderRoutes = (app, store, options) => {
  const teacher = (req, res) => {
    if (req.auth?.role !== 'teacher') { res.status(403).json({ error: 'Доступно только преподавателю' }); return ''; }
    return String(req.auth.id || '');
  };
  app.get('/api/teacher-homework-reminders', (req, res) => {
    const id = teacher(req, res);
    if (id) {
      options.observe?.(id);
      res.json({ reminders: store.list(id, options) });
    }
  });
  app.post('/api/teacher-homework-reminders/:id/dismiss', (req, res) => {
    const id = teacher(req, res);
    if (!id) return;
    if (!store.dismiss(id, req.params.id)) return res.status(404).json({ error: 'Напоминание не найдено' });
    res.json({ ok: true });
  });
};
