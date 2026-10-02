import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const [mode, dataDir, name = 'Егор'] = process.argv.slice(2);
assert.ok(['inspect', 'verify'].includes(mode) && dataDir, 'Usage: inspect|verify DATA_DIR [NAME]');
const read = file => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
const students = read('students.json');
const groups = read('learning-groups.json');
const selected = students.filter(student => !student.deletedAt && student.name === name);
assert.ok(selected.length >= 2, 'Expected namesakes for the ownership check');
const progressBefore = read('progress.json');
const historyBefore = read('lesson-history.json');
const sessions = read('auth-sessions.json').filter(session => session.user?.role === 'teacher'
  && (!session.expiresAtMs || session.expiresAtMs > Date.now()))
  .sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0));
const get = async (route, session) => {
  const response = await fetch(`https://ivan100.ru${route}`, {
    headers: { Authorization: `Bearer ${session.token}`, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200, `GET ${route.split('?')[0]}: HTTP ${response.status}`);
  return response.json();
};
const key = entry => JSON.stringify([entry.externalEventId, entry.date, entry.time]);
const summary = entry => ({ date: entry.date, time: entry.time, durationMinutes: entry.durationMinutes,
  title: entry.googleCalendarTitle || entry.subject, studentId: entry.studentId,
  groupName: entry.groupName || '', overdue: Boolean(entry.payment?.overdue
    || Object.values(entry.payment?.statesByDate || {}).some(state => state.overdue)) });

for (const teacherId of new Set(selected.map(student => student.teacherId))) {
  const session = sessions.find(candidate => candidate.user.id === teacherId);
  assert.ok(session, 'Current owner teacher session required');
  const calendar = await get('/api/teacher-schedule', session);
  const individual = calendar.filter(entry => entry.source === 'google-ical' && entry.studentId && !entry.isLearningGroupEvent);
  const owners = new Map(individual.map(entry => [key(entry), entry.studentId]));
  const affected = new Set();
  const wrongSourcesByStudent = new Map();
  let wrongCount = 0;
  let wrongHistoryCount = 0;
  for (const student of students.filter(student => !student.deletedAt && student.teacherId === teacherId)) {
    const wrongSources = new Set();
    for (const entry of individual.filter(entry => entry.studentId !== student.id)) {
      wrongSources.add(`google-student-${crypto.createHash('sha1')
        .update(`${teacherId}:${student.id}:${entry.externalEventId}:${entry.date}:${entry.time}`).digest('hex').slice(0, 18)}`);
      wrongSources.add(entry.id);
    }
    wrongSourcesByStudent.set(student.id, wrongSources);
    for (const entry of progressBefore[student.id]?.schedule || []) {
      if (entry.source !== 'google-calendar' && !entry.isGoogleCalendarSync) continue;
      const owner = owners.get(key(entry));
      if (owner && owner !== student.id) { affected.add(student.id); wrongCount += 1; }
    }
    for (const entry of Object.values(historyBefore.occurrences || {})) {
      if (entry.studentId === student.id && ['google-calendar', 'google-ical'].includes(entry.source)
        && wrongSources.has(entry.sourceEntryId)) { affected.add(student.id); wrongHistoryCount += 1; }
    }
  }
  console.log(`Stored imports attributed to another pupil: ${wrongCount}; affected pupils: ${affected.size}.`);
  console.log(`Stored history snapshots attributed to another pupil: ${wrongHistoryCount}.`);
  const targets = students.filter(student => student.teacherId === teacherId && !student.deletedAt
    && (affected.has(student.id) || selected.some(target => target.id === student.id)));
  for (const student of targets) {
    const memberships = groups.filter(group => group.teacherId === teacherId && !group.deletedAt && !group.completedAt
      && group.status !== 'completed' && group.members?.some(member => member.studentId === student.id && member.status === 'active'));
    if (mode === 'inspect') {
      console.log(JSON.stringify({ pupil: student.nickname || student.name, groups: memberships.map(group => group.name),
        schedule: (progressBefore[student.id]?.schedule || []).filter(entry => entry.date >= '2026-09-28' && entry.date <= '2026-10-04').map(summary) }));
      continue;
    }
    // The ordinary teacher schedule read runs the normal import reconciliation.
    // It does not delete or mark paid any Google event or payment record.
    const schedule = await get(`/api/student-schedule?studentId=${encodeURIComponent(student.id)}`, session);
    const history = await get(`/api/lesson-history?studentId=${encodeURIComponent(student.id)}&limit=50`, session);
    const wrongSources = wrongSourcesByStudent.get(student.id);
    for (const entry of [...history.items, ...Object.values(read('lesson-history.json').occurrences || {})]) {
      assert.ok(entry.studentId !== student.id || !['google-calendar', 'google-ical'].includes(entry.source)
        || !wrongSources.has(entry.sourceEntryId), 'A history snapshot still belongs to a different pupil');
    }
    const stored = read('progress.json')[student.id]?.schedule || [];
    for (const entry of [...schedule, ...stored]) {
      const owner = owners.get(key(entry));
      assert.ok(!owner || owner === student.id || entry.isLearningGroupEvent,
        'A schedule still contains another student\'s individual calendar event');
    }
    for (const entry of individual.filter(entry => entry.studentId === student.id && entry.date === '2026-10-03')) {
      assert.ok(schedule.some(row => key(row) === key(entry)), 'The correct owner lost the real lesson');
    }
    console.log(JSON.stringify({ pupil: student.nickname || student.name, groups: memberships.map(group => group.name),
      schedule: schedule.filter(entry => entry.date >= '2026-09-28' && entry.date <= '2026-10-04').map(summary), ownershipVerified: true }));
  }
}
console.log(mode === 'verify' ? 'CALENDAR_STUDENT_OWNERSHIP_VERIFIED' : 'CALENDAR_STUDENT_OWNERSHIP_INSPECTED');
