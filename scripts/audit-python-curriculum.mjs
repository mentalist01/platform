import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PYTHON_RUNNER_SCRIPT } from '../server/pythonRunnerSource.js';
import { pythonSandboxLaunch } from '../server/pythonSandbox.js';
import { migratePythonCoreCurriculaTestsDb } from '../server/pythonCoreCurriculaMigration.js';
import { referenceFor } from './python-curriculum-references.mjs';
import { infiniteReferenceFor } from './python-infinite-references.mjs';
import { mergePythonInfiniteTrainingTestsDb } from '../src/data/pythonInfiniteTrainingTasks.js';

const filename = process.argv[2];
if (!filename) throw new Error('Usage: node scripts/audit-python-curriculum.mjs bank.json [--repair]');
let bank = JSON.parse(fs.readFileSync(filename, 'utf8'));
if (process.argv.includes('--repair')) bank = migratePythonCoreCurriculaTestsDb(bank).testsDb;
if (process.argv.includes('--include-infinite')) bank = mergePythonInfiniteTrainingTestsDb(bank);
const runner = process.platform === 'win32' ? { command: 'py', baseArgs: ['-3'] } : { command: 'python3', baseArgs: [] };
const compare = (value) => String(value ?? '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
const report = { questions: 0, cases: 0, accepted: 0, negativeRejected: 0, failures: [], missingReferences: [] };
function run(code, input) {
  const launch = pythonSandboxLaunch(runner, PYTHON_RUNNER_SCRIPT, Buffer.from(code, 'utf8').toString('base64'));
  return spawnSync(launch.command, launch.args, { input, cwd: launch.cwd, encoding: 'utf8', timeout: 7000, maxBuffer: 1_000_000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
}
for (const [topic, entry] of Object.entries(bank)) {
  for (const q of entry.python || []) {
    report.questions++;
    const code = topic === '9001' ? infiniteReferenceFor(q) : referenceFor(topic, q);
    if (!code) { report.missingReferences.push({ topic, id: q.id, title: q.title }); continue; }
    for (const [index, t] of (q.tests || []).entries()) {
      report.cases++;
      const r = run(code, t.input);
      if (r.status === 0 && compare(r.stdout) === compare(t.output)) report.accepted++;
      else report.failures.push({ topic, id: q.id, title: q.title, test: index+1, input: t.input, expected: t.output, actual: r.stdout, error: r.stderr || r.error?.message || '' });
    }
    const negative = run('print("__incorrect_curriculum_answer__")', q.tests?.[0]?.input || '');
    if (negative.status === 0 && (q.tests || []).some(t => compare(negative.stdout) !== compare(t.output))) report.negativeRejected++;
    if (topic === '9001' && report.questions % 100 === 0) console.log(`Checked ${report.questions} tasks / ${report.cases} cases, ${report.failures.length} failures`);
  }
  console.log(`Topic ${topic}: checked ${report.questions} tasks / ${report.cases} cases, ${report.failures.length} failures`);
}
const out = path.join(path.dirname(filename), process.argv.includes('--repair') ? 'audit-repaired.json' : 'audit-original.json');
fs.writeFileSync(out, JSON.stringify(report,null,2));
console.log(JSON.stringify({ ...report, failures: report.failures.length, output: out }));
process.exitCode = report.failures.length || report.missingReferences.length || report.negativeRejected !== report.questions ? 1 : 0;
