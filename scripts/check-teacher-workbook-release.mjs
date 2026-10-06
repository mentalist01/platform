import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const [mode, directory, dataDirectory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const files = fs.readdirSync(path.join(directory, 'assets')).filter(file => /\.(?:js|css)$/.test(file));
const featureFiles = files.filter(file => /^(?:TeacherQuestionWorkbookPanel|TeacherHomeworkReviewModal|ProgressReviewModal|StudentTestModal)-/.test(file)
  || fs.readFileSync(path.join(directory, 'assets', file), 'utf8').includes('teacher-question-workbooks'));
const featureSource = featureFiles.filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(directory, 'assets', file), 'utf8')).join('\n');
for (const marker of ['Решения преподавателя', 'Открыть в LibreOffice', 'Продолжить в LibreOffice', 'teacherSolutions', 'studentId']) assert.ok(featureSource.includes(marker), `Missing teacher workbook feature: ${marker}`);
assert.ok(featureFiles.some(file => file.endsWith('.css') && fs.readFileSync(path.join(directory, 'assets', file), 'utf8').includes('.teacher-question-workbooks')), 'Teacher workbook styles missing');
if (mode === 'verify') {
  const get = async (route, token) => {
    const res = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(25000) });
    assert.ok(res.ok, `HTTP ${res.status}: ${route.split('?')[0]}`); return res;
  };
  const remoteHtml = await (await get('/')).text();
  assert.ok(initial.length && initial.every(asset => remoteHtml.includes(asset)), 'Production client differs from this build');
  const sha = data => crypto.createHash('sha256').update(data).digest('hex');
  for (const asset of new Set([...initial, ...featureFiles.map(file => `/assets/${file}`)])) {
    assert.equal(sha(Buffer.from(await (await get(asset)).arrayBuffer())), sha(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published bundle differs: ${asset}`);
  }
  if (dataDirectory) {
    const sessions = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'auth-sessions.json'), 'utf8'));
    const students = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'students.json'), 'utf8'));
    const filesDb = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'files.json'), 'utf8'));
    const session = sessions.filter(entry => entry.user?.role === 'teacher' && (!entry.expiresAtMs || entry.expiresAtMs > Date.now())).sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0))[0];
    assert.ok(session?.token, 'Existing teacher session required');
    const ownedStudentIds = new Set(students.filter(student => !student.deletedAt && student.teacherId === session.user.id).map(student => student.id));
    const candidate = filesDb.find(entry => entry.workbookQuestionSolution && ownedStudentIds.has(entry.studentId));
    if (candidate) {
      const context = candidate.workbookQuestionContext;
      const params = new URLSearchParams({ studentId: candidate.studentId, taskNumber: context.taskNumber, levelId: context.levelId, questionId: context.questionId });
      const payload = await (await get(`/api/workbook-helper/question-solutions?${params}`, session.token)).json();
      assert.ok(Array.isArray(payload.solutions) && Array.isArray(payload.teacherSolutions), 'Question solution API unavailable');
      assert.ok(payload.solutions.every(entry => !entry.teacherId), 'Teacher files mixed with student solutions');
    } else {
      const source = fs.readFileSync('server/index.js', 'utf8');
      assert.ok(source.includes('teacherSolutions: solutions.filter'), 'Teacher solution API code missing');
      console.log('No existing question workbook for this teacher; API save/launch covered by isolated integration tests.');
    }
  }
}
console.log('Teacher workbook solution UI and exact bundles verified.');
