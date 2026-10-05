import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getMonthlyMockPublication, getMonthlyMockMonth, getAssignedMonthlyMockExam, isMonthlyMockPublished, normalizeMonthlyMockAssignments } from '../src/utils/monthlyMockExam.js';
import { monthlyReviewUrl } from '../server/monthlyMockReview.js';
const [mode, directory, dataDirectory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const files = fs.readdirSync(path.join(directory, 'assets')).filter(file => /\.(js|css)$/.test(file));
// Shared CSS can be emitted under the name of another importing component.
const styleFiles = files.filter(file => file.endsWith('.css') && fs.readFileSync(path.join(directory, 'assets', file), 'utf8').includes('.student-monthly-mock'));
const featureFiles = [...new Set([...files.filter(file => /^(?:ScheduleSection|ProgressSection|StudentMonthlyMockHomework|MonthlyMockAssignmentCheckbox|MonthlyMockReviewEditor|monthlyMockExam)-/.test(file)), ...styleFiles])];
const source = featureFiles.filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(directory, 'assets', file), 'utf8')).join('\n');
for (const marker of ['Пробник месяца', 'monthlyAssignment', 'monthlyAssignedMonths', 'monthlyPublicationDay', 'publicationPending', 'Публиковать с', '00:00 по Москве', 'Преподаватель ещё не назначил пробник', 'Продолжить пробник', 'Решите весь пробник до', 'reviewVideoUrl', 'Смотреть видеоразбор', 'Записать разбор в пульте', 'Разбор откроется после завершения этого пробника']) assert.ok(source.includes(marker), `Missing monthly mock feature: ${marker}`);
assert.ok(styleFiles.length, 'Monthly homework styles missing');
console.log('Monthly mock teacher designation and student homework UI verified.');
if (mode === 'verify') {
  const get = async (route, token) => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(25000) });
    assert.ok(response.ok, `${route.split('?')[0]}: HTTP ${response.status}`);
    return response;
  };
  const remoteHtml = await (await get('/')).text();
  assert.ok(initial.length && initial.every(asset => remoteHtml.includes(asset)), 'Production client differs from this build');
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  for (const asset of new Set([...initial, ...featureFiles.map(file => `/assets/${file}`)])) {
    assert.equal(digest(Buffer.from(await (await get(asset)).arrayBuffer())), digest(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published bundle differs: ${asset}`);
  }
  if (dataDirectory) {
    const read = (name, fallback) => fs.existsSync(path.join(dataDirectory, name)) ? JSON.parse(fs.readFileSync(path.join(dataDirectory, name))) : fallback;
    const session = read('auth-sessions.json', []).filter(entry => entry.user?.role === 'teacher' && (!entry.expiresAtMs || entry.expiresAtMs > Date.now())).sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0))[0];
    assert.ok(session?.token, 'An existing teacher session is required for read-only verification');
    const status = await (await get('/api/monthly-mock-status', session.token)).json();
    assert.ok(status.period?.month && Array.isArray(status.rows), 'Monthly status API unavailable');
    const exams = await (await get('/api/mock-exams', session.token)).json();
    const storedExams = read('mock-exams.json', []);
    for (const exam of exams) {
      assert.ok(!('monthlyAssignments' in exam), 'Internal teacher assignment map leaked');
      assert.ok(!('monthlyPublicationDays' in exam), 'Internal teacher publication map leaked');
      assert.ok(!('monthlyReviewVideos' in exam) && !('monthlyReviewPublications' in exam), 'Internal review metadata leaked');
      const stored = storedExams.find(entry => entry.id === exam.id);
      assert.deepEqual(exam.monthlyAssignedMonths, normalizeMonthlyMockAssignments(stored?.monthlyAssignments)[session.user.id] || []);
      assert.equal(exam.monthlyPublicationDay, getMonthlyMockPublication(stored, session.user.id)?.day || 1);
      assert.equal(exam.monthlyReviewVideoUrl, monthlyReviewUrl(stored, session.user.id));
    }
    if (exams[0]) {
      const review = await (await get(`/api/mock-exams/${encodeURIComponent(exams[0].id)}/monthly-review`, session.token)).json();
      assert.equal(review.url, exams[0].monthlyReviewVideoUrl);
    }
    const studentSession = read('auth-sessions.json', []).find(entry => entry.user?.role === 'student' && (!entry.expiresAtMs || entry.expiresAtMs > Date.now()));
    const student = read('students.json', []).find(entry => entry.id === studentSession?.user.id);
    if (student && studentSession?.token) {
      const studentExams = await (await get('/api/mock-exams', studentSession.token)).json();
      const monthly = await (await get('/api/monthly-mock-status', studentSession.token)).json();
      const assigned = getAssignedMonthlyMockExam(storedExams, student.teacherId);
      const pending = Boolean(assigned) && !isMonthlyMockPublished(assigned, student.teacherId, getMonthlyMockMonth());
      assert.equal(monthly.publicationPending, pending);
      if (pending) assert.equal(monthly.assignment, null, 'Scheduled exam appeared before publication');
      for (const exam of storedExams.filter(entry => !isMonthlyMockPublished(entry, student.teacherId))) {
        assert.ok(!studentExams.some(entry => entry.id === exam.id), 'Unpublished exam leaked into student list');
      }
      console.log('Student publication visibility verified with read-only requests.');
    }
    console.log('Published monthly API and teacher metadata verified without assigning real students.');
  }
  console.log('Exact published monthly mock bundles verified.');
}
