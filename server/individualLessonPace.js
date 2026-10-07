import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const INDIVIDUAL_PACE_DISCONNECT_GRACE_MS = 3 * 60_000;
const timestamp = value => Number(value) || Date.parse(value) || 0;
const lessonId = (teacherId, key) => `individual:${crypto.createHash('sha256').update(`${teacherId}\n${key}`).digest('hex')}`;

// Track conducted lessons, including calls without a recording. Starting at
// activation avoids a backlog of surveys for old calendar entries or replays.
export class IndividualLessonPaceStore {
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
  observeLesson(teacherId, occurrence, startAt, endAt = 0) {
    if (!teacherId || !occurrence?.key || !occurrence.studentId || occurrence.groupId || occurrence.lessonId) return;
    const started = timestamp(startAt), ended = timestamp(endAt);
    if (!started) return;
    const id = lessonId(teacherId, occurrence.key), previous = this.data.lessons[id];
    if (!previous && started < this.data.since && ended < this.data.since) return;
    const resumed = previous && started > previous.lastStartAt;
    const next = { ...previous, id, teacherId, studentId: occurrence.studentId,
      occurrenceKey: occurrence.key, dayKey: occurrence.dayKey, time: occurrence.time,
      startAt: previous?.startAt || new Date(Number(occurrence.startMs) || started).toISOString(),
      startedAt: Math.min(previous?.startedAt || Infinity, started),
      lastStartAt: Math.max(previous?.lastStartAt || 0, started),
      endAt: ended >= Math.max(previous?.lastStartAt || 0, started) ? ended : resumed ? 0 : (previous?.endAt || 0),
      disconnectedAt: resumed ? 0 : previous?.disconnectedAt || 0 };
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    this.data.lessons[id] = next;
    this.save();
  }
  finishLesson(teacherId, occurrenceKey, endAt = this.now()) {
    const previous = this.data.lessons[lessonId(teacherId, occurrenceKey)];
    if (!previous) return;
    previous.endAt = Math.max(previous.lastStartAt, timestamp(endAt));
    previous.disconnectedAt = 0;
    this.save();
  }
  disconnectLesson(teacherId, occurrenceKey) {
    const previous = this.data.lessons[lessonId(teacherId, occurrenceKey)];
    if (!previous || previous.endAt || previous.disconnectedAt) return;
    previous.disconnectedAt = this.now();
    this.save();
  }
  list({ studentId, teacherId, studentById, isActive, topicFor = () => '' }) {
    let changed = false;
    const rows = [];
    for (const lesson of Object.values(this.data.lessons)) {
      if (studentId && lesson.studentId !== studentId || teacherId && lesson.teacherId !== teacherId) continue;
      const student = studentById(lesson.studentId);
      if (!student || student.deletedAt || student.teacherId !== lesson.teacherId) continue;
      if (isActive(lesson, student)) {
        if (lesson.endAt || lesson.disconnectedAt) {
          lesson.endAt = 0; lesson.disconnectedAt = 0; changed = true;
        }
        continue;
      }
      if (!lesson.endAt) {
        if (!lesson.disconnectedAt) { lesson.disconnectedAt = this.now(); changed = true; }
        if (this.now() - lesson.disconnectedAt < INDIVIDUAL_PACE_DISCONNECT_GRACE_MS) continue;
        lesson.endAt = lesson.disconnectedAt; changed = true;
      }
      if (lesson.endAt > this.now() || lesson.endAt - lesson.startedAt < 60_000) continue;
      rows.push({ id: lesson.id, kind: 'individual', teacherId: lesson.teacherId,
        participantIds: [lesson.studentId], occurrenceKey: lesson.occurrenceKey,
        status: 'completed', topic: topicFor(lesson) || 'Индивидуальный урок',
        startAt: lesson.startAt, completedAt: new Date(lesson.endAt).toISOString() });
    }
    if (changed) this.save();
    return rows;
  }
}
