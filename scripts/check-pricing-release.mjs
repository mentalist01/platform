import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const mode = process.argv[2];
const dataDir = process.argv[3];
if (!['preflight', 'verify'].includes(mode) || !dataDir) throw new Error('Usage: preflight|verify DATA_DIR');
const recordingsFile = path.join(dataDir, 'desktop-recordings.json');
if (mode === 'preflight') {
  const recordings = fs.existsSync(recordingsFile) ? JSON.parse(fs.readFileSync(recordingsFile, 'utf8')) : {};
  const active = Object.values(recordings.jobs || {}).filter(job => job.desired === 'record' && job.cutoffAt > Date.now());
  if (active.length) throw new Error('Recording is active. Finish the lesson before restarting the application.');
  console.log('No active recording requests.');
} else {
  const sessions = JSON.parse(fs.readFileSync(path.join(dataDir, 'auth-sessions.json'), 'utf8'));
  const session = sessions.find(entry => entry.user?.role === 'teacher' && (!entry.expiresAtMs || entry.expiresAtMs > Date.now()));
  if (!session) throw new Error('Teacher session required for release verification.');
  // An invalid request verifies the new route without creating a payment.
  const response = await fetch('https://ivan100.ru/api/teacher-lesson-payment', {
    method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(20000),
  });
  if (response.status !== 400) throw new Error(`New billing route returned HTTP ${response.status}, expected 400`);
  const error = await response.json();
  if (error.error !== 'Укажите занятие и состояние оплаты') throw new Error('Unexpected billing API version');
  const localIndex = fs.readFileSync('dist/index.html', 'utf8');
  const script = localIndex.match(/<script[^>]*src="(\/assets\/[^" ]+\.js)"/)?.[1];
  if (!script) throw new Error('Client entry bundle not found');
  const remoteIndex = await fetch('https://ivan100.ru/', { signal: AbortSignal.timeout(20000) });
  if (!remoteIndex.ok || !(await remoteIndex.text()).includes(script)) throw new Error('Production still serves a different client');
  const bundle = await fetch(`https://ivan100.ru${script}`, { signal: AbortSignal.timeout(20000) });
  if (!bundle.ok) throw new Error('Client bundle unavailable');
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  if (digest(Buffer.from(await bundle.arrayBuffer())) !== digest(fs.readFileSync(path.join('dist', script.slice(1))))) {
    throw new Error('Client bundle checksum mismatch');
  }
  console.log('New billing API and exact production client bundle verified.');
}
