// Read-only deployment check using existing sessions, without printing credentials.
import fs from 'node:fs';
import path from 'node:path';
const read = name => JSON.parse(fs.readFileSync(path.join(process.argv[2], name), 'utf8'));
const sessions = read('auth-sessions.json').filter(s => !s.expiresAtMs || s.expiresAtMs > Date.now());
const students = read('students.json');
for (const role of ['teacher', 'student']) {
  const session = sessions.find(s => s.user?.role === role && (role !== 'student' || students.some(p => p.id === s.user.id && p.teacherId && !p.deletedAt)));
  if (!session) throw new Error(`No active ${role} session for verification`);
  for (const route of ['/weekly-schedules', ...(role === 'student' ? ['/weekly-schedules/availability'] : [])]) {
    const response = await fetch(`https://ivan100.ru/api${route}`, {headers:{Authorization:`Bearer ${session.token}`}, signal:AbortSignal.timeout(25000)});
    if (!response.ok) throw new Error(`${role} ${route}: HTTP ${response.status}`);
    const data = await response.json();
    if (route.endsWith('availability') ? !data.config || typeof data.baseSignature !== 'string' : !Array.isArray(data.requests)) throw new Error('Invalid response');
    console.log(`${role} ${route}: OK`);
  }
}
