import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import WebSocket from 'ws';

test('real platform routes isolate devices and expose one group recording to its participants', { timeout: 60000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-platform-integration-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const now = Date.now(); const old = new Date(now - 86400000).toISOString();
  const participants = Array.from({ length: 8 }, (_, index) => `s${index + 1}`);
  write('tests', { 101: { python: [{ id: 'exercise', answer: '42' }], pythonTheory: { type: 'text', content: 'Original theory' } } });
  write('teachers', [{ id: 't1', name: 'Test teacher' }, { id: 't2', name: 'Other teacher' }]);
  write('students', [...participants, 'outside', 'late'].map(id => ({ id, name: id, teacherId: 't1', telemostUrl: `https://telemost.yandex.ru/j/fixture-${id}`, createdAt: id === 'late' ? new Date(now).toISOString() : old })));
  write('auth-sessions', ['t1', 't2', ...participants, 'outside', 'late'].map(id => ({
    token: `fixture-${id}`, user: { id, name: id, role: id.startsWith('t') ? 'teacher' : 'student', teacherId: 't1' },
    createdAtMs: now, expiresAtMs: now + 3600000,
  })));
  write('learning-groups', [{ id: 'g1', name: 'Test group', telemostUrl: 'https://telemost.yandex.ru/j/fixture-group', teacherId: 't1', startedAt: old, createdAt: old,
    members: participants.map(studentId => ({ studentId, joinedAt: old, status: 'active' })) }]);
  write('learning-lesson-sessions', [{ id: 'legacy', groupId: 'g1', teacherId: 't1', participantIds: participants,
    startAt: new Date(now - 121 * 60000).toISOString(), durationMinutes: 120, status: 'active', createdAt: old },
    { id: 'lesson1', groupId: 'g1', teacherId: 't1', participantIds: participants,
    startAt: new Date(now - 61 * 60000).toISOString(), durationMinutes: 60, status: 'active', createdAt: old }]);
  const reserve = net.createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LEGACY_LESSON_RECORDING_ENABLED: '1', PORT: String(port), PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
      PLATFORM_COLLAB_DIR: path.join(root, 'collab'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), ADMIN_CODE: 'fixture-admin-only' },
  });
  let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    // This is the unique fixture directory created above, never platform data.
    fs.rmSync(root, { recursive: true, force: true });
  });
  const request = async (route, { actor = 't1', body, method, token, status = 200 } = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}/api${route}`, { method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || `fixture-${actor}`}` },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
    const value = await r.json(); assert.equal(r.status, status, `${route}: ${JSON.stringify(value)}`); return value;
  };
  let started = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Fixture server exited: ${logs}`);
    try { await request('/session'); started = true; break; } catch { await delay(200); }
  }
  assert.ok(started, `Fixture server did not start: ${logs}`);
  await request('/desktop-recording/download', { actor: 's1', status: 403 });
  const download = await fetch(`http://127.0.0.1:${port}/api/desktop-recording/download`, { headers: { Authorization: 'Bearer fixture-t1' } });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/zip');
  assert.equal(Buffer.from(await download.arrayBuffer()).readUInt32LE(0), 0x04034b50);
  const legacySession = await request('/lesson-replay/session', { body: { learningLessonId: 'legacy', via: 'telemost' } });
  await request('/lesson-replay/finish', { body: { sessionId: legacySession.sessionId, events: [{
    id: 'legacy-code', type: 'code', occurredAt: new Date(now).toISOString(), payload: { code: 'print(42)', language: 'python' },
  }] } });
  await request('/learning-groups/g1/lessons/legacy', { method: 'PATCH', body: { status: 'completed' } });
  await request('/desktop-recording/pair', { actor: 's1', body: {}, status: 403 });
  const { code } = await request('/desktop-recording/pair', { body: {} });
  const { token } = await request('/desktop-recorder/pair', { body: { code, name: 'Fixture PC' } });
  assert.equal((await request('/availability', { token: 'invalid' })).available, true);
  const studentLinks = (await request('/lesson-fallback', { actor: 's1' })).links;
  assert.deepEqual(studentLinks.map(l => l.id).sort(), ['group:g1', 'student:s1']);
  assert.equal((await request('/lesson-fallback', { actor: 't2' })).links.length, 0);
  assert.equal((await request('/lesson-fallback', { actor: 'outside' })).links.length, 1);
  await request('/desktop-recorder/python/catalog', { actor: 's1', body: {}, status: 401 });
  const catalog = await request('/desktop-recorder/python/catalog', { token, body: {} });
  assert.equal(catalog.teacherId, 't1'); assert.ok(catalog.tasks.some(t => t.number === 101));
  const pythonVideo = { recordingId: '00000000-0000-4000-8000-000000000089', teacherId: 't1', taskNumber: 101,
    subsectionId: '__default__', expectedUrl: '', title: 'Python input', url: 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Fixture_Key' };
  await request('/desktop-recorder/python/material', { token, body: { ...pythonVideo, teacherId: 't2' }, status: 403 });
  await request('/desktop-recorder/python/material', { token, body: pythonVideo, status: 201 });
  assert.equal((await request('/desktop-recorder/python/material', { token, body: pythonVideo })).created, false);
  const ownTests = await request('/tests');
  assert.equal(ownTests[101].pythonTheoryBySubsection.__default__.rutube.content, pythonVideo.url);
  assert.equal(ownTests[101].pythonTheoryBySubsection.__default__.text.content, 'Original theory');
  assert.equal(ownTests[101].python[0].answer, '42');
  assert.equal((await request('/tests', { actor: 's1' }))[101].pythonTheoryBySubsection.__default__.rutube.content, pythonVideo.url);
  assert.equal((await request('/tests', { actor: 't2' }))[101].pythonTheoryBySubsection, undefined);
  assert.equal((await request('/desktop-recorder/archive/status', { token, body: {} })).teacherId, 't1');
  await request('/desktop-recorder/archive/status', { actor: 's1', body: {}, status: 401 });
  const theory = { clipId: '00000000-0000-4000-8000-000000000012', title: 'Задание 7: звук / теория', url: 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Fixture_Key', teacherId: 't2', sharedTeacherIds: ['t2'], groupId: 'other-group' };
  const created = await request('/desktop-recorder/archive/material', { token, body: theory, status: 201 });
  assert.equal(created.material.teacherId, 't1'); assert.equal(created.material.title, theory.title);
  assert.equal(created.material.scope, 'teacher'); assert.deepEqual(created.material.sharedTeacherIds, []);
  assert.equal((await request('/desktop-recorder/archive/material', { token, body: theory })).material.id, created.material.id);
  await request('/desktop-recorder/archive/material', { token, body: { ...theory, title: 'Changed' }, status: 409 });
  await request('/desktop-recorder/archive/material', { token, body: { ...theory, url: 'https://example.com/' }, status: 400 });
  assert.equal((await request('/learning-materials')).materials.filter(m => m.id === created.material.id).length, 1);
  assert.equal((await request('/learning-materials', { actor: 't2' })).materials.length, 0);
  await request('/learning-materials/' + created.material.id, { method: 'DELETE' });
  await request('/desktop-recorder/archive/material', { token, body: theory, status: 409 });
  await request('/desktop-recorder/poll', { token, body: { ready: true } });
  await request('/session', { token, status: 401 });
  await request('/desktop-recording/settings', { method: 'PUT', body: { enabled: true } });
  const legacy = await request('/lesson-replay/session', { actor: 's1', body: { learningLessonId: 'lesson1' }, status: 409 });
  assert.equal(legacy.code, 'DESKTOP_RECORDING_ENABLED');
  await request('/desktop-recording/start', { actor: 't2', body: { learningLessonId: 'lesson1' }, status: 403 });
  const job = await request('/desktop-recording/start', { body: { learningLessonId: 'lesson1', audioMode: 'platform' } });
  assert.equal(job.audioMode, 'platform', 'Voice channels record platform audio rather than the Telemost window');
  assert.equal((await request('/desktop-recording/start', { body: { learningLessonId: 'lesson1' } })).id, job.id);
  await request(`/desktop-recorder/jobs/${job.id}`, { token, body: { status: 'recording' } });
  const liveRecording = await request('/learning-groups/g1/lessons/lesson1/replay', { actor: 's1' });
  assert.equal(liveRecording.replay.status, 'recording');
  await request('/learning-groups/g1/lessons/lesson1', { method: 'PATCH', body: { status: 'completed' } });
  assert.equal((await request('/learning-lesson-feedback/pending', { actor: 's1' })).lesson.id, 'lesson1');
  assert.equal((await request('/learning-lesson-feedback/pending', { actor: 's1' })).lesson.id, 'lesson1');
  await request('/learning-groups/g1/lessons/lesson1/pace', { actor: 's1', method: 'PUT', body: { value: 15 } });
  await request('/learning-groups/g1/lessons/lesson1/pace', { actor: 's8', method: 'PUT', body: { value: 85 } });
  const pace = await request('/learning-groups/g1/lessons/lesson1/pace');
  assert.deepEqual(pace.responses.map(row => [row.studentId, row.value]), [['s1', 15], ['s8', 85]]);
  assert.equal(pace.pendingStudents.length, 6);
  await request('/learning-groups/g1/lessons/lesson1/pace', { actor: 't2', status: 403 });
  assert.equal((await request('/desktop-recorder/poll', { token, body: { ready: true } })).jobs[0].desired, 'stop');
  await request(`/desktop-recorder/jobs/${job.id}`, { token, body: { status: 'saved' } });
  const url = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Fixture_Key';
  await request(`/desktop-recorder/jobs/${job.id}`, { token, body: { status: 'ready', url } });
  assert.equal((await request('/desktop-recorder/poll',{token,body:{ready:true}})).jobs.length,0,'Ready jobs no longer appear in poll');
  await request('/desktop-recorder/archive/lesson-topic',{actor:'s1',body:{jobId:job.id},status:401});
  const topicPayload={jobId:job.id,text:'Задание №7 · Кодирование звука',source:'transcript'};
  assert.equal((await request('/desktop-recorder/archive/lesson-topic',{token,body:topicPayload})).topic.source,'transcript');
  const storedTopics=fs.readFileSync(path.join(data,'lesson-topics.json'),'utf8');
  await request('/desktop-recorder/archive/lesson-topic',{token,body:topicPayload});
  assert.equal(fs.readFileSync(path.join(data,'lesson-topics.json'),'utf8'),storedTopics);
  for (const actor of ['s1', 's8']) {
    const history = await request(`/lesson-history?studentId=${actor}`, { actor });
    const lesson = history.items.find(item => item.lessonId === 'lesson1');
    assert.ok(lesson, `Missing group lesson for ${actor}: ${JSON.stringify(history)}`);
    assert.equal(lesson.topic.text,topicPayload.text);assert.equal(lesson.topic.source,'transcript');
    const detail = await request(`/lesson-history/detail?studentId=${actor}&occurrenceKey=${encodeURIComponent(lesson.key)}`, { actor });
    assert.equal(detail.replay.provider, 'rutube'); assert.equal(detail.replay.available, true);
    assert.equal(detail.replay.video.url, url);
    const groupReplay = await request('/learning-groups/g1/lessons/lesson1/replay', { actor });
    assert.equal(groupReplay.replay.occurrence.key, detail.replay.occurrence.key);
    assert.equal(groupReplay.replay.video.url, url);
    const groupLessons = await request('/learning-groups/g1/lessons', { actor });
    assert.equal(groupLessons.lessons.find(l => l.id === 'lesson1').recording.available, true);
    await request(`/lesson-history/detail?studentId=${actor}&occurrenceKey=${encodeURIComponent(lesson.key)}`, { actor: 'outside', status: 404 });
  }
  await request('/learning-groups/g1/lessons/lesson1/replay', { actor: 'outside', status: 403 });
  await request('/learning-groups/g1/lessons/lesson1/replay', { actor: 't2', status: 403 });
  const codeReplay = await request('/learning-groups/g1/lessons/legacy/replay', { actor: 's1' });
  assert.ok(codeReplay.replay.events.some(event => event.type === 'code' && event.payload.code === 'print(42)'));
  assert.equal((await request('/lesson-history?studentId=late', { actor: 'late' })).items.length, 0);
  await request('/learning-groups/g1/members', { body: { studentId: 'late', lateAddReason: 'Joined after these lessons' } });
  const lateHistory = await request('/lesson-history?studentId=late', { actor: 'late' });
  for (const lessonId of ['lesson1', 'legacy']) {
    const lesson = lateHistory.items.find(item => item.lessonId === lessonId);
    assert.ok(lesson, `New member must receive ${lessonId}`);
    const detail = await request(`/lesson-history/detail?studentId=late&occurrenceKey=${encodeURIComponent(lesson.key)}`, { actor: 'late' });
    if (lessonId === 'lesson1') assert.equal(detail.replay.video.url, url);
    else assert.ok(detail.replay.events.some(event => event.type === 'code' && event.payload.code === 'print(42)'));
    const savedLesson = JSON.parse(fs.readFileSync(path.join(data, 'learning-lesson-sessions.json'), 'utf8')).find(item => item.id === lessonId);
    assert.ok(!savedLesson.participantIds.includes('late'), 'Do not rewrite historical attendance');
  }
  const mediaRoute = `/lesson-replay/snapshot/00000000-0000-4000-8000-000000000001?occurrenceKey=${encodeURIComponent(legacySession.occurrenceKey)}`;
  await request(mediaRoute, { actor: 'late', status: 404 }); // Authorized, but this snapshot does not exist.
  await request(mediaRoute, { actor: 'outside', status: 403 });
  assert.equal((await request('/lesson-history?studentId=outside', { actor: 'outside' })).items.length, 0);
  await request('/learning-groups/g1/members/late', { method: 'DELETE' });
  assert.equal((await request('/lesson-history?studentId=late', { actor: 'late' })).items.length, 0, 'Cached shared archives must be revoked after leaving');
  await request(mediaRoute, { actor: 'late', status: 403 });
  // Real RTC leave messages distinguish a button press from a refresh/outage.
  const sockets = [];
  t.after(() => sockets.forEach(ws => ws.terminate()));
  const connectRtc = async actor => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/rtc?_auth=fixture-${actor}`);
    sockets.push(ws); await once(ws, 'open'); return ws;
  };
  const sendRtc = (ws, payload, expected) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(Error(`Missing RTC ${expected}`)); }, 4000);
    const listener = raw => { const result = JSON.parse(String(raw)); if (result.type === expected || result.type === 'error') {
      clearTimeout(timer); ws.off('message', listener); result.type === 'error' ? reject(Error(result.error)) : resolve(result);
    } };
    ws.on('message', listener); ws.send(JSON.stringify(payload));
  });
  const roomId = 'rtc:t1:s1';
  const teacherRtc = await connectRtc('t1'), pupilRtc = await connectRtc('s1'), outsiderRtc = await connectRtc('t2');
  await sendRtc(teacherRtc, {type:'join',roomId}, 'joined');
  await sendRtc(pupilRtc, {type:'join',roomId}, 'joined');
  const individual = await request('/desktop-recording/start', {body:{studentId:'s1'}});
  await request(`/desktop-recorder/jobs/${individual.id}`, {token,body:{status:'recording'}});
  const desired = async () => (await request('/desktop-recorder/poll', {token,body:{ready:true}})).jobs.find(j => j.id === individual.id).desired;
  await sendRtc(outsiderRtc, {type:'leave',roomId,endRecording:true}, 'left');
  assert.equal(await desired(), 'record', 'Forged room IDs cannot end another teacher recording');
  await sendRtc(teacherRtc, {type:'leave',roomId}, 'left');
  assert.equal(await desired(), 'record', 'Navigation retains reconnect grace');
  await sendRtc(teacherRtc, {type:'join',roomId}, 'joined');
  await sendRtc(pupilRtc, {type:'leave',roomId,endRecording:true}, 'left');
  assert.equal(await desired(), 'record', 'Teacher can finish explaining after pupil leaves');
  const teacherOtherTab = await connectRtc('t1');
  await sendRtc(teacherOtherTab, {type:'join',roomId}, 'joined');
  await sendRtc(teacherRtc, {type:'leave',roomId,endRecording:true}, 'left');
  assert.equal(await desired(), 'record', 'Another teacher tab is still in the call');
  await sendRtc(teacherOtherTab, {type:'leave',roomId,endRecording:true}, 'left');
  assert.equal(await desired(), 'stop', 'Intentional final teacher hangup stops immediately');
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'desktop-recordings.json'))).jobs[individual.id].stopReason,'explicit-hangup');

});
