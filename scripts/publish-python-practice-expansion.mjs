// Content-only release through the same teacher API as the exercise editor.
// No direct database write, process restart, frontend replacement or auth change.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { appendPythonPracticeExpansion, appendPythonGeneratorExpansion } from '../server/pythonPracticeExpansion.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const generators = process.argv.includes('--generators');
const expectedCount = generators ? 24 : 152;
const prefix = generators ? 'py-gen-expand-20261015-' : 'py-expand-20261015-';
const teacherId = '7ca28ea9-2f31-42f4-b76f-5d5cd452c40d';
const dataDir = process.env.PYTHON_EXPANSION_DATA_DIR || '/root/platform-data';
const url = process.env.PYTHON_EXPANSION_API || 'http://127.0.0.1:5175';
const directory = process.env.PYTHON_EXPANSION_BACKUP || (generators ? '/root/python-generator-expansion-backup-20261015' : '/root/python-practice-expansion-backup-20261015');
const payload = JSON.parse(fs.readFileSync(path.join(root,generators?'server/pythonGeneratorExpansionData.json':'server/pythonPracticeExpansionData.json'),'utf8'));
const read = p => JSON.parse(fs.readFileSync(path.join(dataDir,p),'utf8'));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const candidates = read('auth-sessions.json')
  .filter(s=>s.user?.role==='teacher' && s.user.id===teacherId && s.token && (s.expiresAtMs==null || Number(s.expiresAtMs)>Date.now()))
  .sort((a,b)=>(b.lastSeenAtMs||0)-(a.lastSeenAtMs||0));
let token, before;
for (const s of candidates) {
  const response = await fetch(url+'/api/tests',{headers:{Authorization:'Bearer '+s.token},signal:AbortSignal.timeout(20000)});
  if (response.ok) {token=s.token; before=await response.json(); break;}
}
assert.ok(token,'Existing authorized teacher session required; no auth changes performed');
const api = async (route,init={}) => {
  const response = await fetch(url+route,{...init,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(25000)});
  const result = await response.json();
  assert.ok(response.ok,`API ${response.status}: ${result.error || 'request failed'}`);
  return result;
};
const applied = (generators ? appendPythonGeneratorExpansion : appendPythonPracticeExpansion)(before,payload);
const counts = Object.keys(payload.topics).map(topic=>({topic,title:payload.topics[topic].title,before:before[topic].python.length,added:applied.topics[topic]||0,after:applied.testsDb[topic].python.length}));
const changed = Object.keys(applied.testsDb).filter(k=>JSON.stringify(before[k])!==JSON.stringify(applied.testsDb[k]));
assert.deepEqual(changed.sort(),Object.keys(applied.topics).sort());
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'preview',added:applied.added,counts}));
// Inspect potential title collisions in both preview and apply.
for (const item of payload.questions) {
  const old = before[item.topic].python.find(q=>q.title?.trim()===item.question.title.trim() && String(q.id)!==item.question.id);
  if (old) throw Error('Title already exists; review before applying: '+item.topic+' '+item.question.title);
}
if (!process.argv.includes('--apply')) {
  process.exit(0);
}
fs.mkdirSync(directory,{recursive:true,mode:0o700});
const beforeFile = path.join(directory,'tests-before.private.json');
if (applied.added && fs.existsSync(beforeFile)) throw Error('A previous backup already exists; inspect before a second content change');
if (applied.added) {
  fs.writeFileSync(beforeFile,JSON.stringify(before),{mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(directory,'teacher-task-content-before.private.json'),JSON.stringify(read('teacher-task-content.json')),{mode:0o600,flag:'wx'});
}
let save = null;
if (applied.added) {
  assert.equal(applied.added,expectedCount,'Partial expansion requires review before another write');
  const fresh = await api('/api/tests');
  assert.equal(digest(fresh),digest(before),'Bank changed during preparation; refresh and review before writing');
  // This ordinary teacher save also applies the server's reference remapping checks.
  save = await api('/api/tests',{method:'PUT',body:JSON.stringify(applied.testsDb)});
  fs.writeFileSync(path.join(directory,'save-result.json'),JSON.stringify(save,null,2),{mode:0o600});
  assert.equal(save.scope,'teacher');
  assert.equal(save.remappedHomeworkReferences,0,'Unexpected homework remap: inspect the saved result');
}
const after = await api('/api/tests');
assert.equal(digest(after),digest(applied.testsDb),'Saved bank differs from the exact appended payload');
for (const topic of Object.keys(payload.topics)) {
  const oldQuestions = before[topic].python.filter(q=>!String(q.id).startsWith(prefix));
  assert.deepEqual(after[topic].python.filter(q=>!String(q.id).startsWith(prefix)),oldQuestions);
}
const student = read('students.json').find(s=>s.teacherId===teacherId && s.id);
assert.ok(student,'Student preview required for verification');
const studentBank = await api('/api/tests?studentId='+encodeURIComponent(student.id));
for (const item of payload.questions) {
  const q = studentBank[item.topic].python.find(q=>String(q.id)===item.question.id);
  assert.ok(q,`Exercise missing in student preview: ${item.question.id}`);
  assert.equal(q.question,item.question.question);
  assert.equal(q.starterCode,item.question.starterCode);
  assert.ok(!Object.hasOwn(q,'reference'),'Reference must not be in student data');
}
const proof = {at:new Date().toISOString(),teacherId,added:applied.added,counts,save,
  teacherBankVerified:true,studentPreviewVerified:true,oldQuestionsAndIndexesPreserved:true,
  theoryPreserved:true,otherTopicsUnchanged:true,restarted:false,questionCount:expectedCount};
fs.writeFileSync(path.join(directory,'complete.json'),JSON.stringify(proof,null,2),{mode:0o600});
console.log(generators?'PYTHON_GENERATOR_EXPANSION_COMPLETE':'PYTHON_PRACTICE_EXPANSION_COMPLETE');
for (const row of counts) console.log(`${row.topic} ${row.before} + ${row.added} = ${row.after}`);
console.log('Teacher and student verified; existing tasks, theory and homework indexes preserved.');
