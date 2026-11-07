import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { correctedTests, repairAdjacentPairsBank, taskId } from '../scripts/repair-python-adjacent-pairs.mjs';
import { PYTHON_RUNNER_SCRIPT } from './pythonRunnerSource.js';
import { pythonSandboxLaunch } from './pythonSandbox.js';

const payload = JSON.parse(fs.readFileSync(new URL('./pythonPracticeExpansionData.json', import.meta.url),'utf8'));
const task = payload.questions.find(item => item.question.id === taskId).question;
const oldTests = [[3,-1,0,4],[0],[-5],[7],[-4,-3,-2],[1,1,1,1],[5,0,-5,0],[9,-20,3,8],[19,25,-6],[-20]]
  .map((numbers,i) => ({input:[numbers.length,...numbers].join('\n')+'\n',output:i===5?'3':'0'}));
const correct = 'n=int(input())\nprevious=int(input())\ncount=0\nfor i in range(1,n):\n    num=int(input())\n    if num == previous:\n        count+=1\n    previous=num\nprint(count)';
const runner = process.platform === 'win32' ? {command:'py',baseArgs:['-3']} : {command:'python3',baseArgs:[]};
function passed(code, tests) {
  return tests.map(check => {
    const launch = pythonSandboxLaunch(runner,PYTHON_RUNNER_SCRIPT,Buffer.from(code).toString('base64'));
    const result = spawnSync(launch.command,launch.args,{input:check.input,encoding:'utf8',cwd:launch.cwd,timeout:10000});
    assert.ifError(result.error);
    return result.status===0 && result.stdout.trim()===check.output;
  });
}
test('authored cases use varied repetitions, boundaries and an independent run-length oracle', () => {
  assert.deepEqual(task.tests,correctedTests);
  for (const check of task.tests) {
    const [n,...numbers] = check.input.trim().split(/\s+/).map(Number);
    assert.equal(numbers.length,n); assert.ok(n>=1 && n<=100);
    assert.ok(numbers.every(x => x>=-1000 && x<=1000));
    let answer=0, start=0;
    for(let end=1;end<=n;end++) if(end===n || numbers[end]!==numbers[start]) { answer+=end-start-1; start=end; }
    assert.equal(check.output,String(answer));
  }
});
test('correct screenshot solution and a different correct algorithm pass the actual platform runner', () => {
  assert.ok(passed(correct,task.tests).every(Boolean));
  assert.ok(passed('n=int(input())\na=[int(input()) for _ in range(n)]\nprint(sum(a[i]==a[i-1] for i in range(1,n)))',task.tests).every(Boolean));
});
test('tests reject realistic wrong algorithms which all old cases accepted', () => {
  for (const bad of [correct.replace('    previous=num\n',''),correct.replace('    previous=num','        previous=num')]) {
    assert.ok(passed(bad,oldTests).every(Boolean),'Reproduce the old false positive');
    assert.ok(passed(bad,task.tests).some(result => !result),'Require updates of previous even after unequal values');
  }
  for (const bad of ['n=int(input())\na=[int(input()) for _ in range(n)]\nprint(n-len(set(a)))',
    'n=int(input())\na=[int(input()) for _ in range(n)]\ni=0\ns=0\nwhile i<n-1:\n    if a[i]==a[i+1]:\n        s+=1\n        i+=1\n    i+=1\nprint(s)',
    correct.replace('range(1,n)','range(1,n-1)'),correct.replace('count=0','count=1'),
    correct.replace('num == previous','num != previous'), 'print(0)']) {
    assert.ok(passed(bad,task.tests).some(result => !result));
  }
});
test('repair changes tests only; preserves IDs, order and teacher content; is idempotent and rejects unexpected edits', () => {
  const before={'105':{python:[{id:'before'}, {...task,tests:oldTests,teacherNote:'unchanged'}, {id:'after'}],pythonTheory:{text:'theory'}},'9':{basic:[{id:'ege'}]}};
  const original=structuredClone(before), expected=structuredClone(before);
  expected['105'].python[1].tests=structuredClone(correctedTests);
  assert.deepEqual(repairAdjacentPairsBank(before),{bank:expected,changed:true});
  assert.deepEqual(before,original);
  assert.deepEqual(repairAdjacentPairsBank(expected),{bank:expected,changed:false});
  before['105'].python[1].tests.push({input:'2\n1\n1\n',output:'1'});
  assert.throws(()=>repairAdjacentPairsBank(before),/Teacher changed/);
});
