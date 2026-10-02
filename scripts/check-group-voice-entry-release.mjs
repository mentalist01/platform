import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [mode, directory, dataDir] = process.argv.slice(2);
assert.ok(['local', 'verify', 'preflight'].includes(mode) && directory, 'Usage: local BUILD_DIR | verify BUILD_DIR DATA_DIR | preflight DATA_DIR');
const read = (dir, name, fallback = []) => fs.existsSync(path.join(dir, name)) ? JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) : fallback;
const get = async (route, token = '') => {
  const response = await fetch(`https://ivan100.ru${route}`, {
    headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(25000),
  });
  assert.ok(response.ok, `GET ${route.split('?')[0]}: HTTP ${response.status}`);
  return response;
};
const sessionsFor = dir => read(dir, 'auth-sessions.json').filter(s => !s.expiresAtMs || s.expiresAtMs > Date.now())
  .sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0));

if (mode === 'preflight') {
  const sessions = sessionsFor(directory);
  const groups = read(directory, 'learning-groups.json').filter(g => !g.deletedAt && g.status !== 'completed');
  const lessons = read(directory, 'learning-lesson-sessions.json').filter(l => !l.deletedAt && ['scheduled', 'active'].includes(l.status));
  const targets = lessons.flatMap(lesson => {
    const group = groups.find(g => g.id === lesson.groupId);
    const session = sessions.find(s => s.user?.role === 'teacher' && s.user.id === group?.teacherId);
    return session ? [{ group, lesson, session }] : [];
  });
  for (let offset = 0; offset < targets.length; offset += 8) await Promise.all(targets.slice(offset, offset + 8).map(async ({ group, lesson, session }) => {
    const value = await (await get(`/api/learning-groups/${encodeURIComponent(group.id)}/lessons/${encodeURIComponent(lesson.id)}/voice-channels`, session.token)).json();
    assert.ok(!value.channels?.some(channel => channel.participants?.length), 'A group voice channel is occupied; do not restart the server.');
  }));
  // When filesystem presence is enabled, also cover lesson calls whose owner
  // no longer has a current browser session.
  const presenceDir = path.join(directory, 'rtc-presence');
  if (fs.existsSync(presenceDir)) for (const file of fs.readdirSync(presenceDir).filter(name => name.endsWith('.json'))) {
    const entry = read(presenceDir, file, null);
    assert.ok(!entry?.roomId || Date.now() - Number(entry.heartbeatAt) > 120_000, 'A recent voice connection is present; do not restart the server.');
  }
  console.log('All scheduled and active group voice channels are empty.');
} else {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const entry = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
  assert.ok(entry, 'Client entry missing');
  const source = fs.readFileSync(path.join(directory, entry.slice(1)), 'utf8');
  const chunk = source.match(/GroupVoiceChannels-[A-Za-z0-9_-]+\.js/)?.[0];
  assert.ok(chunk, 'Voice channel bundle missing');
  const chunkPath = `/assets/${chunk}`;
  const voiceSource = fs.readFileSync(path.join(directory, chunkPath.slice(1)), 'utf8');
  for (const text of ['canStartLesson', 'lessonStatus', 'Вы в голосовом канале вне времени занятия']) assert.ok(voiceSource.includes(text), `Voice entry fix missing: ${text}`);
  if (mode === 'verify') {
    assert.ok((await (await get('/')).text()).includes(entry), 'Production serves a different client');
    const digest = value => crypto.createHash('sha256').update(value).digest('hex');
    for (const file of [entry, chunkPath]) assert.equal(digest(Buffer.from(await (await get(file)).arrayBuffer())), digest(fs.readFileSync(path.join(directory, file.slice(1)))), `Published bundle differs: ${file}`);
    assert.ok(dataDir, 'Data directory required');
    const sessions = sessionsFor(dataDir);
    const groups = read(dataDir, 'learning-groups.json');
    const lessons = read(dataDir, 'learning-lesson-sessions.json');
    const group = groups.find(g => !g.deletedAt && g.status !== 'completed' && sessions.some(s => s.user?.role === 'teacher' && s.user.id === g.teacherId));
    const lesson = lessons.find(l => l.groupId === group?.id && !l.deletedAt && ['scheduled', 'active'].includes(l.status));
    assert.ok(group && lesson, 'A current group and lesson are required');
    const teacher = sessions.find(s => s.user?.role === 'teacher' && s.user.id === group.teacherId);
    const route = `/api/learning-groups/${encodeURIComponent(group.id)}/lessons/${encodeURIComponent(lesson.id)}/voice-channels`;
    const value = await (await get(route, teacher.token)).json();
    assert.equal(value.lessonStatus, lesson.status);
    assert.equal(typeof value.canStartLesson, 'boolean');
    assert.equal(value.canJoin, true);
    const student = sessions.find(s => s.user?.role === 'student' && lesson.participantIds?.includes(s.user.id)
      && group.members?.some(m => m.studentId === s.user.id && m.status === 'active'));
    if (student) {
      const pupil = await (await get(route, student.token)).json();
      assert.equal(pupil.canJoin, true);
      assert.equal(pupil.canStartLesson, false);
    }
    console.log(`Published client and voice API verified for teacher${student ? ' and pupil' : ''}; no calls or lessons were started.`);
  } else console.log('Voice entry client bundle verified.');
}
