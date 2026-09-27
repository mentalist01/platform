// Run on the application host. Reuses an existing owner's session for GETs;
// never creates accounts, prints credentials, or changes lesson content.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node scripts/check-learning-release.mjs DATA_DIR [GROUP_NAME]');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const groups = read('learning-groups.json');
const group = groups.find(g => !g.deletedAt && g.name === (process.argv[3] || 'Группа 1'));
if (!group) throw new Error('Verification group not found');
const sessions = read('auth-sessions.json').filter(s => s.user?.id === group.teacherId
  && s.user?.role === 'teacher' && (!s.expiresAtMs || s.expiresAtMs > Date.now()))
  .sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0));
if (!sessions.length) throw new Error('No current owner session available; sign in through the platform');
const token = sessions[0].token;
const get = async route => {
  const response = await fetch(`https://ivan100.ru/api${route}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Verification GET failed: HTTP ${response.status}`);
  return response.json();
};
const lessons = read('learning-lesson-sessions.json').filter(l => l.groupId === group.id && !l.deletedAt)
  .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
const lesson = lessons.find(l => ['active', 'scheduled'].includes(l.status)) || lessons[0];
if (lesson) {
  const voice = await get(`/learning-groups/${encodeURIComponent(group.id)}/lessons/${encodeURIComponent(lesson.id)}/voice-channels`);
  console.log(JSON.stringify({ voice: { enabled: voice.enabled, canJoin: voice.canJoin,
    joinError: voice.joinError, channels: voice.channels?.length, lessonStatus: lesson.status } }));
}
const availability = await get(`/learning-groups/${encodeURIComponent(group.id)}/availability`);
console.log(JSON.stringify({ availability: { startDate: availability.poll?.config?.startDate,
  status: availability.poll?.status, blocked: Object.keys(availability.blocked || {}).length,
  blockedDays: Array.from({ length: 7 }, (_, day) => Object.keys(availability.blocked || {}).filter(key => key.startsWith(`${day}-`)).length) } }));
console.log(JSON.stringify({ materials: (await get('/learning-materials')).materials?.length }));
const completed = lessons.find(l => l.status === 'completed');
if (completed) {
  const pace = await get(`/learning-groups/${encodeURIComponent(group.id)}/lessons/${encodeURIComponent(completed.id)}/pace`);
  console.log(JSON.stringify({ pace: { responses: pace.responses?.length, total: pace.total } }));
}
