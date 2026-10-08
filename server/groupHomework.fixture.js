import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

export async function createGroupHomeworkFixture(fixedPort) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan100-concurrent-homework-'));
  const data = path.join(root, 'data'), uploads = path.join(root, 'uploads');
  fs.mkdirSync(data); fs.mkdirSync(uploads);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  write('teachers', [{ id: 'teacher-a', name: 'Преподаватель А', code: 'teacher-a-code' }, { id: 'teacher-b', name: 'Другой преподаватель', code: 'teacher-b-code' }]);
  write('students', ['a', 'b', 'c'].map((id, index) => ({ id: `student-${id}`, name: ['Анна · тест', 'Дарья · тест', 'Другой ученик'][index], code: `student-${id}-code`, teacherId: id === 'c' ? 'teacher-b' : 'teacher-a', grade: '11', createdAt: '2026-10-01T10:00:00Z' })));
  write('progress', {}); write('mock-exams', []);
  write('tests', { 4: { basic: [{ id: 'ege-question', question: 'Тестовое задание ЕГЭ', answer: '17' }] }, 101: {
    python: [{ id: 'python-question', question: 'Напишите print(1)', answer: '1', subsectionId: 'input-output' }],
    pythonSubsections: [{ id: 'input-output', title: 'Ввод и вывод данных', order: 0 }],
    pythonTheoryBySubsection: { 'input-output': { rutube: { type: 'rutube', content: 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/' }, text: { type: 'text', content: 'print() выводит данные.' } } },
  } });
  const port = fixedPort || await new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(import.meta.dirname, '..'), windowsHide: true,
    env: { ...process.env, CORS_ALLOWED_ORIGINS: fixedPort ? 'http://127.0.0.1:5599' : '', PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: uploads,
      PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'json-backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1', LEARNING_GROUP_RTC_ENABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  const stop = async () => { if (child.exitCode !== null) return; const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended; };
  const request = async (route, token, body, method = body ? 'POST' : 'GET', expected = 200) => {
    const r = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await r.text(); assert.equal(r.status, expected, `${route}: ${text}`); return text ? JSON.parse(text) : null;
  };
  try {
    const deadline = Date.now() + 30000;
    while (true) {
      try { if ((await fetch(base + '/api/client-build-version')).ok) break; } catch {}
      if (Date.now() > deadline || child.exitCode !== null) throw Error(logs || 'Server startup timeout');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const tokens = {};
    for (const id of ['teacher-a', 'teacher-b', 'student-a', 'student-b', 'student-c']) tokens[id] = (await request('/api/login', '', { code: `${id}-code` })).token;
    const group = (await request('/api/learning-groups', tokens['teacher-a'], { name: 'Группа 2 · тест', studentIds: ['student-a', 'student-b'] }, 'POST', 201)).group;
    await request(`/api/learning-groups/${group.id}/start`, tokens['teacher-a'], {});
    await request(`/api/learning-groups/${group.id}/schedule`, tokens['teacher-a'], { schedule: [
      { weekdayKey: 'wednesday', time: '20:00', durationMinutes: 60, subject: 'ЕГЭ' }, { weekdayKey: 'friday', time: '20:00', durationMinutes: 60, subject: 'Python' } ] }, 'PUT');
    return { root, data, child, base, tokens, groupId: group.id, request, stop };
  } catch (error) { await stop(); throw error; }
}
