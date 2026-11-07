// A tests-only, content-only correction through the existing teacher editor API.
// No process restart, student regrading, task reorder or direct database write.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const taskId = 'py-expand-20261015-105-equal-adjacent';
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const legacyHash = 'd9d51220076df7e17d52b735540918cb0bf61b92980a49b0ae16365d44cfaaf9';
const cases = [
  [[3,-1,0,4], 0], [[0], 0], [[7,7,7], 2], [[5,5,2,3], 1],
  [[1,2,2], 1], [[1,2,1], 0], [[-1000,-1000,0,0,1000,1000], 3],
  [[0,0,1,0,0], 2], [Array(100).fill(7), 99], [Array.from({length:100}, (_,i) => i%2), 0],
];
export const correctedTests = cases.map(([numbers, output]) => ({
  input: [numbers.length, ...numbers].join('\n')+'\n', output: String(output),
}));

export function repairAdjacentPairsBank(before) {
  const questions = before?.['105']?.python;
  assert.ok(Array.isArray(questions), 'Python for topic is missing');
  const matches = questions.filter(q => q.id === taskId);
  assert.equal(matches.length, 1, 'Expected exactly one exercise with its stable ID');
  const question = matches[0];
  if (digest(question.tests) === digest(correctedTests)) return { bank: structuredClone(before), changed: false };
  assert.equal(digest(question.tests), legacyHash, 'Teacher changed these tests; inspect before replacing them');
  const bank = structuredClone(before);
  bank['105'].python.find(q => q.id === taskId).tests = structuredClone(correctedTests);
  return { bank, changed: true };
}

async function main() {
  const dataDir = process.env.ADJACENT_PAIRS_DATA_DIR || '/root/platform-data';
  const origin = process.env.ADJACENT_PAIRS_API || 'http://127.0.0.1:5175';
  const teacherId = '7ca28ea9-2f31-42f4-b76f-5d5cd452c40d';
  const sessions = JSON.parse(fs.readFileSync(path.join(dataDir,'auth-sessions.json'),'utf8'))
    .filter(s => s.user?.role === 'teacher' && s.user.id === teacherId && s.token && (s.expiresAtMs == null || Number(s.expiresAtMs) > Date.now()))
    .sort((a,b) => (b.lastSeenAtMs||0)-(a.lastSeenAtMs||0));
  let token, before;
  for (const session of sessions) {
    const response = await fetch(origin+'/api/tests', {headers:{Authorization:'Bearer '+session.token},signal:AbortSignal.timeout(20000)});
    if (response.ok) { token = session.token; before = await response.json(); break; }
  }
  assert.ok(token, 'Existing authorized teacher session required');
  const api = async (route, init={}) => {
    const response = await fetch(origin+route, {...init,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});
    const result = await response.json();
    assert.ok(response.ok, `API ${response.status}: ${result.error || 'request failed'}`);
    return result;
  };
  const {bank, changed} = repairAdjacentPairsBank(before);
  console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'preview',taskId,changed,tests:correctedTests.length}));
  if (!process.argv.includes('--apply')) return;
  let save;
  if (changed) {
    const backup = process.env.ADJACENT_PAIRS_BACKUP || '/root/python-adjacent-pairs-20261107-backup';
    fs.mkdirSync(backup,{recursive:true,mode:0o700});
    fs.writeFileSync(path.join(backup,'tests-before.private.json'),JSON.stringify(before),{mode:0o600,flag:'wx'});
    assert.equal(digest(await api('/api/tests')), digest(before), 'Bank changed during preparation; refresh before saving');
    save = await api('/api/tests',{method:'PUT',body:JSON.stringify(bank)});
    assert.equal(save.scope,'teacher');
    assert.deepEqual(save.changedTaskNumbers,['105']);
    assert.equal(save.remappedHomeworkReferences,0);
  }
  assert.deepEqual(await api('/api/tests'),bank,'Saved bank must match the tests-only change exactly');
  const student = JSON.parse(fs.readFileSync(path.join(dataDir,'students.json'),'utf8')).find(s => s.teacherId === teacherId && s.id);
  assert.ok(student,'Student preview required');
  const preview = await api('/api/tests?studentId='+encodeURIComponent(student.id));
  assert.deepEqual(preview['105'].python.find(q => q.id === taskId).tests,correctedTests);
  console.log('ADJACENT_PAIRS_VERIFIED: 10 balanced tests; task ID/order/content and other tasks preserved; no regrading or restart.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode=1; });
}
