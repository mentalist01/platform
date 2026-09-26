import test from 'node:test';
import assert from 'node:assert/strict';
import { migratePythonCoreCurriculaTestsDb, migratePythonCoreCurriculaStore } from './pythonCoreCurriculaMigration.js';
import { PYTHON_IO_EXTRA_TASKS, PYTHON_IO_SEPARATOR_TESTS } from './pythonIoTestData.js';
import { PYTHON_CURRICULUM_TEST_REPAIRS } from './pythonCurriculumTestData.js';
const versions = {101:'pythonIoCurriculumVersion',102:'pythonVariablesCurriculumVersion',103:'pythonConditionsCurriculumVersion',104:'pythonCalculationsCurriculumVersion',105:'pythonForCurriculumVersion',106:'pythonStringsCurriculumVersion'};
function brokenBank() {
  const bank = Object.fromEntries(Object.entries(versions).map(([id,version])=>[id,{[version]:1,python:[]}]));
  for (const q of PYTHON_IO_EXTRA_TASKS) bank[101].python.push({...q, tests:q.tests.map(t=>({...t,input:''}))});
  bank[101].python.push({id:'python-io-separator',title:'Свой разделитель',tests:PYTHON_IO_SEPARATOR_TESTS.map(t=>({...t,input:t.input.trimEnd()}))});
  for (const r of PYTHON_CURRICULUM_TEST_REPAIRS) bank[r.topic].python.push({id:r.id,title:r.title,tests:r.tests.map(t=>({input:t.previousInput,output:t.previousOutput,hidden:true}))});
  return bank;
}
test('repairs known empty input and separator cases without changing ids, metadata or custom tests', () => {
  const bank = brokenBank();
  const first = bank[101].python[0];
  first.tests.push({input:'мой ввод',output:'мой ответ',hidden:true});
  const before = structuredClone(bank);
  const result = migratePythonCoreCurriculaTestsDb(bank);
  assert.equal(result.changed,true);
  assert.deepEqual(bank,before);
  assert.equal(result.testsDb[101].python[0].id,first.id);
  assert.deepEqual(result.testsDb[101].python[0].tests.at(-1),first.tests.at(-1));
  for (const entry of Object.values(result.testsDb)) for (const q of entry.python) for (const t of q.tests) assert.notEqual(t.input,'');
  assert.equal(result.testsDb[101].python[4].tests[2].input,'1\n2\n3\n\n');
  assert.equal(migratePythonCoreCurriculaTestsDb(result.testsDb).changed,false);
  const store={teachers:{a:{tests:bank,progress:{student:{score:42}}}}};
  const fixed=migratePythonCoreCurriculaStore(store);
  assert.deepEqual(fixed.store.teachers.a.progress,store.teachers.a.progress);
});
test('teacher changes and unrecognized tasks are retained', () => {
  const bank=brokenBank();
  bank[101].python[0].title='Своё условие';
  bank[102].python[0].tests[0]={input:'custom',output:'custom'};
  const fixed=migratePythonCoreCurriculaTestsDb(bank).testsDb;
  assert.deepEqual(fixed[101].python[0],bank[101].python[0]);
  assert.deepEqual(fixed[102].python[0].tests[0],bank[102].python[0].tests[0]);
});
