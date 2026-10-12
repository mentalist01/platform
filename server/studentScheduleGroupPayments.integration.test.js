import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { getStudentPaymentReminderItems } from '../src/utils/studentPaymentReminder.js';
import { participationOccurrence } from '../src/utils/groupParticipation.js';

test('past-week group payments agree in student reminders; real debts and participation exceptions survive', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'group-debt-regression-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  const dates = [10, 9].map(days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10));
  const createdAt = '2025-01-01T00:00:00Z';
  const members = ['paid', 'unpaid', 'parttime', 'former', 'waived'];
  const stamp = date => `${date.replaceAll('-', '')}T170000Z`;
  const ical = ['BEGIN:VCALENDAR', 'VERSION:2.0', ...dates.flatMap((date, i) => [
    'BEGIN:VEVENT', `UID:group-${i}`, `DTSTART:${stamp(date)}`, `DTEND:${stamp(date).replace('170000', '180000')}`,
    'SUMMARY:Group 2', 'END:VEVENT',
  ]), 'END:VCALENDAR', ''].join('\r\n');
  const calendar = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/calendar' }); res.end(ical); });
  await new Promise(resolve => calendar.listen(0, '127.0.0.1', resolve));
  const calendarUrl = `http://127.0.0.1:${calendar.address().port}/calendar.ics`;
  const lessons = dates.map((date, i) => ({
    id: `actual-${i}`, teacherId: 'teacher', groupId: 'group', startAt: `${date}T17:00:00.000Z`,
    durationMinutes: 60, topic: 'Group 2', source: 'availability-plan', status: 'completed',
    participantIds: members, participationOverrides: { waived: false }, createdAt, updatedAt: createdAt,
  }));
  const group = { id: 'group', teacherId: 'teacher', name: 'Group 2', pricePerLesson: 900,
    plannedStartDate: '2025-01-01', startedAt: createdAt, createdAt, updatedAt: createdAt, maxStudents: 10,
    members: members.map(studentId => ({ studentId, status: ['former', 'waived'].includes(studentId) ? 'removed' : 'active',
      joinedAt: createdAt, leftAt: ['former', 'waived'].includes(studentId) ? new Date().toISOString() : '',
      ...(studentId === 'parttime' ? { participationPlans: [{ from: '2025-01-01', mode: 'selected', slots: [participationOccurrence(lessons[0]).slot] }] } : {}),
    })), schedule: [],
  };
  const pupilId = (student, date, eventId) => `google-student-${crypto.createHash('sha1').update(`teacher:${student}:${eventId}:${date}:20:00`).digest('hex').slice(0, 18)}`;
  const oldRow = (student, date, i) => ({ id: pupilId(student, date, `group-${i}`), studentId: student, date, time: '20:00',
    durationMinutes: 60, subject: 'Занятие', source: 'google-calendar', isGoogleCalendarSync: true,
    externalEventId: `group-${i}`, groupId: 'group', isLearningGroupEvent: true, lessonId: `old-${i}`, createdAt,
  });
  const markKey = (student, i) => `teacher:learning-group-session-actual-${i}:${dates[i]}:${student}:20:00:paid`;
  const marks = { teacher: Object.fromEntries([
    ...dates.map((_date, i) => [markKey('paid', i), createdAt]), [markKey('parttime', 0), createdAt],
  ]) };
  write('teachers', [{ id: 'teacher', name: 'Teacher', code: 'teacher-code', createdAt }]);
  write('students', members.map(id => ({ id, teacherId: 'teacher', name: id, code: `${id}-code`, grade: '11', studyStatus: 'active', createdAt })));
  write('progress', Object.fromEntries(members.map(id => [id, { schedule: dates.map((date, i) => oldRow(id, date, i)), homeworks: [] }])));
  write('tests', {}); write('learning-groups', [group]); write('learning-lesson-sessions', lessons);
  write('teacher-calendar-sync', { teacher: { enabled: true, icalUrl: calendarUrl, updatedAt: createdAt } });
  write('teacher-calendar-marks', marks);
  write('teacher-finances', { teacher: { studentProfiles: Object.fromEntries(members.map(id => [id, { lessonPrice: 900 }])) } });
  const probe = http.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, PORT: String(port), NODE_ENV: 'test', TZ: 'Europe/Moscow', PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow',
    PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
    COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1', LEARNING_GROUP_RTC_ENABLED: '0',
  } });
  let logs = ''; child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
  const request = async (route, token, body) => {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  try {
    const deadline = Date.now() + 20000;
    while (true) {
      if (child.exitCode !== null || Date.now() > deadline) throw Error(logs);
      try { if ((await fetch(base + '/api/client-build-version')).ok) break; } catch { /* Starting. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const teacher = await request('/api/login', '', { code: 'teacher-code' });
    const teacherRows = await request('/api/teacher-schedule', teacher.token);
    assert.equal(teacherRows.filter(e => e.groupId === 'group' && dates.includes(e.date)).length, 2);
    for (const id of members) {
      const login = await request('/api/login', '', { code: `${id}-code` });
      const schedule = await request('/api/student-schedule', login.token);
      const reminders = getStudentPaymentReminderItems(schedule);
      if (['paid', 'parttime', 'waived'].includes(id)) {
        assert.deepEqual(reminders, [], `${id}: no false historical debt`);
        assert.ok(!schedule.some(e => e.isPaymentOverdueOccurrence), `${id}: no false overdue rows from the separate Google pass`);
      } else {
        assert.deepEqual(reminders.map(e => e.dateKey).sort(), [...dates].sort(), `${id}: genuinely unpaid lessons remain after group removal`);
      }
      if (id === 'paid') for (const date of dates) {
        const states = schedule.flatMap(e => e.payment?.statesByDate?.[date] || []);
        assert.ok(states.length > 0);
        assert.ok(states.every(state => state.status === 'paid'));
      }
    }
    const after = JSON.parse(fs.readFileSync(path.join(dataDir, 'teacher-calendar-marks.json')));
    for (const key of Object.keys(marks.teacher)) assert.equal(after.teacher[key], createdAt, 'existing payment marks are preserved');
  } finally {
    const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill();
    await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
    calendar.closeAllConnections(); await new Promise(resolve => calendar.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
