import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '..');

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    probe.close((error) => (error ? reject(error) : resolve(port)));
  });
});

const waitForServer = async (baseUrl, child, getLogs) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before startup.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/client-build-version`);
      if (response.ok) return;
    } catch {
      // The socket is expected to refuse connections while the server boots.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start in time.\n${getLogs()}`);
};

const stopServer = async (child) => {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const jsonRequest = async (baseUrl, pathname, options = {}) => {
  const method = options.method || 'GET';
  const headers = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (Object.prototype.hasOwnProperty.call(options, 'body')) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    ...(Object.prototype.hasOwnProperty.call(options, 'body')
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const rawBody = await response.text();
  const expectedStatus = options.status ?? 200;
  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${pathname} returned ${response.status}.\n${rawBody}`
  );
  return rawBody ? JSON.parse(rawBody) : null;
};

const login = async (baseUrl, code) => (
  jsonRequest(baseUrl, '/api/login', {
    method: 'POST',
    body: { code },
  })
);


import { PYTHON_IO_EXTRA_TASKS, PYTHON_IO_SEPARATOR_TESTS } from './pythonIoTestData.js';
import { PYTHON_CURRICULUM_TEST_REPAIRS } from './pythonCurriculumTestData.js';
import { referenceFor } from '../scripts/python-curriculum-references.mjs';

test('student API repairs damaged cases, passes correct Python and rejects incorrect source', { timeout: 90_000 }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-python-repair-'));
  const dataDir = path.join(tempRoot, 'data');
  fs.mkdirSync(dataDir);
  const createdAt = '2026-09-26T00:00:00.000Z';
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{id:'audit-teacher',name:'Audit',code:'119001',createdAt}]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{id:'audit-student',name:'Audit student',teacherId:'audit-teacher',code:'119101',grade:'11',createdAt,deletedAt:null}]));
  fs.writeFileSync(path.join(dataDir, 'progress.json'), '{}');
  fs.writeFileSync(path.join(dataDir, 'mock-exams.json'), '[]');
  const bank = Object.fromEntries(Object.entries({101:'pythonIoCurriculumVersion',102:'pythonVariablesCurriculumVersion',103:'pythonConditionsCurriculumVersion',104:'pythonCalculationsCurriculumVersion',105:'pythonForCurriculumVersion',106:'pythonStringsCurriculumVersion'}).map(([id,version])=>[id,{[version]:1,python:[]}]));
  bank[101].python = PYTHON_IO_EXTRA_TASKS.map(q=>({...q,tests:q.tests.map(t=>({...t,input:''}))}));
  bank[101].python.push({id:'python-io-separator',title:'Свой разделитель',tests:PYTHON_IO_SEPARATOR_TESTS.map(t=>({...t,input:t.input.trimEnd()}))});
  for(const q of PYTHON_CURRICULUM_TEST_REPAIRS) bank[q.topic].python.push({id:q.id,title:q.title,tests:q.tests.map(t=>({input:t.previousInput,output:t.previousOutput}))});
  fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify(bank));
  const port=await getFreePort();
  const baseUrl=`http://127.0.0.1:${port}`;
  let logs='';
  const child=spawn(process.execPath,['server/index.js'],{cwd:workspaceDir,env:{...process.env,PORT:String(port),NODE_ENV:'test',PLATFORM_DATA_DIR:dataDir,PLATFORM_UPLOADS_DIR:path.join(tempRoot,'uploads'),PLATFORM_JSON_BACKUPS_DIR:path.join(tempRoot,'backups'),COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1',PYTHON_RUN_RATE_LIMIT:'1000'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{logs+=d;});child.stderr.on('data',d=>{logs+=d;});
  try {
    await waitForServer(baseUrl,child,()=>logs);
    const student=await login(baseUrl,'119101');
    assert.equal(student.role,'student');
    const served=await jsonRequest(baseUrl,'/api/tests',{token:student.token});
    let passed=0;
    for(const [topic,entry] of Object.entries(bank)) for(const q of entry.python) {
      const live=served[topic].python.find(item=>String(item.id)===String(q.id));
      assert(live, q.title);
      assert(live.tests.every(t=>t.input!==''), q.title+' still has missing input');
      const body={taskNumber:Number(topic),levelId:'python',questionId:q.id};
      await jsonRequest(baseUrl,'/api/progress/solve',{method:'POST',token:student.token,body:{...body,code:'print("__incorrect_answer__")'},status:400});
      const code=referenceFor(topic,q); assert(code,q.title);
      await jsonRequest(baseUrl,'/api/progress/solve',{method:'POST',token:student.token,body:{...body,code}});
      passed++;
    }
    assert.equal(passed,25);
    const separator=served[101].python.find(q=>q.id==='python-io-separator');
    assert.equal(separator.tests[1].input,'один\nдва\nтри\n | \n');
    assert.equal(separator.tests[2].input,'1\n2\n3\n\n');
    const solved=await jsonRequest(baseUrl,'/api/progress/solved?studentId=audit-student&taskNumber=101&levelId=python',{token:student.token});
    assert.equal(solved.length,5);
  } finally {
    await stopServer(child);
    const resolved=fs.realpathSync(tempRoot);
    assert(path.dirname(resolved).toLowerCase()===fs.realpathSync(os.tmpdir()).toLowerCase());
    assert(path.basename(resolved).startsWith('ivan-python-repair-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
});
