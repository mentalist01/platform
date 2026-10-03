import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const [mode, directory, dataDirectory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const entry = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
assert.ok(entry, 'Client entry missing');
const source = fs.readFileSync(path.join(directory, entry.slice(1)), 'utf8');
for (const marker of ['nav-schedule', 'nav-students', 'nav-materials', 'nav-management', 'teacher-students', 'teacher-settings', 'Разделы преподавателя', 'setRecordingPrivacy']) assert.ok(source.includes(marker), `Missing ${marker}`);
const panel = source.match(/TeacherPanel-[A-Za-z0-9_-]+\.js/)?.[0];
assert.ok(panel, 'Teacher panel missing');
const panelPath = `/assets/${panel}`;
const panelSource = fs.readFileSync(path.join(directory, panelPath.slice(1)), 'utf8');
for (const marker of ['База заданий и редактор тестов', 'Список учеников, мини-группы и результаты обучения', 'Уведомления и доступ к кабинету преподавателя']) assert.ok(panelSource.includes(marker), `Missing ${marker}`);
console.log('Five-section navigation, separate teacher pages and privacy bridge verified.');
if (mode === 'verify') {
  const get = async (route, token) => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, `GET ${route.split('?')[0]}: HTTP ${response.status}`); return response;
  };
  assert.ok((await (await get('/')).text()).includes(entry), 'Published entry is stale');
  const sha = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const asset of [entry, panelPath]) assert.equal(sha(Buffer.from(await (await get(asset)).arrayBuffer())), sha(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published ${asset} differs`);
  if (dataDirectory) {
    const sessions = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'auth-sessions.json'), 'utf8')).filter(session => session.user?.role === 'teacher' && (!session.expiresAtMs || session.expiresAtMs > Date.now()));
    const students = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'students.json'), 'utf8'));
    const session = sessions.find(session => students.some(student => !student.deletedAt && student.teacherId === session.user.id));
    assert.ok(session, 'A read-only teacher session is required to verify the report');
    const student = students.find(student => !student.deletedAt && student.teacherId === session.user.id);
    const report = await (await get(`/api/student-month-report?studentId=${encodeURIComponent(student.id)}&month=2026-09`, session.token)).json();
    assert.ok(report.parentText && report.studentText, 'Report text missing');
    assert.doesNotMatch(report.automaticConclusion, /пробник|слабые типы/u);
    assert.doesNotMatch(report.studentText.trim().split('\n').at(-1), /пробник|слабые типы/u);
    console.log('Published monthly report no longer adds a mock-review promise.');
  }
  console.log('Published navigation and teacher pages verified.');
}
