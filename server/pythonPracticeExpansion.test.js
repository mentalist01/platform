import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appendPythonPracticeExpansion, appendPythonGeneratorExpansion, appendPythonSecondExpansion } from './pythonPracticeExpansion.js';
import { buildPythonSubsectionModel } from '../src/utils/pythonSubsections.js';
import { createTeacherTestsDbReader } from './teacherTaskContent.js';
import { remapProgressQuestionTargets } from './questionTargetRemap.js';

const payload = JSON.parse(fs.readFileSync(new URL('./pythonPracticeExpansionData.json', import.meta.url),'utf8'));
const generators = JSON.parse(fs.readFileSync(new URL('./pythonGeneratorExpansionData.json', import.meta.url),'utf8'));
const second = JSON.parse(fs.readFileSync(new URL('./pythonSecondExpansionData.json', import.meta.url),'utf8'));
const fixture = () => Object.fromEntries([
  ...Object.keys(payload.topics).map(topic => [topic, {
    python: [{id:`old-${topic}`,title:'Задание учителя',question:'Своё условие',tests:[{input:'1\n',output:'2'}],subsectionId:'custom',subsectionTitle:'Мои задачи'}],
    pythonSubsections:[{id:'custom',title:'Мои задачи',order:0}],
    pythonTheory:{type:'rutube',content:'https://example.com/video',chapters:[{time:0,title:'Старт'}]},
    pythonTheoryBySubsection:{custom:{note:'Конспект'}},
  }]),
  ['109',{python:[{id:'tuple',title:'Кортежи'}]}],
  ['110',{python:[{id:'function',title:'Функции'}]}],
  ['112',{python:[{id:'original-generator',title:'1',tests:[{input:'',output:'1'}]}],pythonTheory:{type:'text',content:'Теория учителя'}}],
  ['__pythonTaskCatalog',[{number:112,title:'Генераторы',displayNumber:'10',sectionId:'topics'}]],
  ['7',{basic:[{id:'ege',question:'ЕГЭ'}]}],
]);

test('adds all 152 tasks without changing old questions, theory or other topics', () => {
  const source = fixture();
  const saved = structuredClone(source);
  const result = appendPythonPracticeExpansion(source,payload);
  assert.deepEqual(source,saved);
  assert.equal(result.added,152);
  for (const topic of Object.keys(payload.topics)) {
    assert.equal(result.topics[topic],topic==='108'?40:16);
    assert.deepEqual(result.testsDb[topic].python[0],source[topic].python[0]);
    assert.deepEqual(result.testsDb[topic].pythonTheory,source[topic].pythonTheory);
    const model = buildPythonSubsectionModel(result.testsDb[topic],'python');
    assert.equal(model.questions.length,source[topic].python.length+result.topics[topic]);
    assert.ok(model.questions.every(q=>q.subsectionTitle));
  }
  for (const topic of ['109','110','7']) assert.deepEqual(result.testsDb[topic],source[topic]);
  assert.equal(result.testsDb[108].python.filter(q=>q.subsectionTitle==='Генераторы списков').length,24);
});

test('reuses existing and legacy subsection identifiers, retains customized section order', () => {
  const source = fixture();
  source[108].pythonSubsections.push({id:'teacher-generators',title:'Генераторы',order:37});
  source[105].pythonSubsections.push({id:'old-filter',title:'Отбор и счётчики',order:12});
  source[106].python.push({id:'old-access',title:'Срезы',subsectionId:'legacy-access',subsectionTitle:'Индексы и срезы'});
  const result = appendPythonPracticeExpansion(source,payload).testsDb;
  const generators = result[108].python.filter(q=>q.id.includes('-comp-'));
  assert.ok(generators.every(q=>q.subsectionId==='teacher-generators'));
  assert.equal(result[108].pythonSubsections.find(s=>s.id==='teacher-generators').order,37);
  assert.equal(result[105].python.find(q=>q.id.endsWith('-first-negative')).subsectionId,'old-filter');
  assert.equal(result[106].python.find(q=>q.id.endsWith('-middle')).subsectionId,'legacy-access');
});

test('safe to repeat, but never silently overwrites a subsequent teacher edit', () => {
  const first = appendPythonPracticeExpansion(fixture(),payload);
  const second = appendPythonPracticeExpansion(first.testsDb,payload);
  assert.equal(second.added,0);
  assert.deepEqual(second.testsDb,first.testsDb);
  first.testsDb[101].python.at(-1).question='Учитель изменил условие';
  assert.throws(()=>appendPythonPracticeExpansion(first.testsDb,payload),/no overwrite/);
});

test('refuses absent topics, out-of-scope topics, duplicate identifiers and leaked reference fields', () => {
  const source = fixture();
  delete source[104];
  assert.throws(()=>appendPythonPracticeExpansion(source,payload),/Existing Python topic required/);
  for (const mutate of [
    p=>{p.questions[0].topic='109';},
    p=>{p.questions[1]=structuredClone(p.questions[0]);},
    p=>{p.questions[0].question.reference='print(42)';},
  ]) {
    const bad = structuredClone(payload); mutate(bad);
    assert.throws(()=>appendPythonPracticeExpansion(fixture(),bad),/Invalid exercise payload/);
  }
});

test('teacher snapshot reader observes appended content without changing other teacher snapshots', () => {
  const global = fixture();
  const first = {tests:{}};
  const read = createTeacherTestsDbReader();
  const old = read(global,first);
  const expanded = appendPythonPracticeExpansion(old,payload).testsDb;
  const updated = {tests:Object.fromEntries(Object.keys(payload.topics).map(k=>[k,expanded[k]]))};
  const next = read(global,updated);
  assert.equal(next[101].python.length,17);
  assert.equal(old[101].python.length,1);
  assert.equal(read(global,first),old);
});

test('existing homework targets and solved progress need no remapping after expansion', () => {
  const source = fixture();
  const next = appendPythonPracticeExpansion(source,payload).testsDb;
  const goals = Object.keys(payload.topics).map(topic=>({type:'task',taskNumber:Number(topic),levelId:'python',targetQuestions:[1]}));
  const progress = {student:{homeworks:[{id:'previous',goals}],nextLesson:{goals},
    solved:{'101-python-0':true},drafts:{'101-python-0':'print("saved")'}}};
  const result = remapProgressQuestionTargets(progress,source,next);
  assert.equal(result.changed,false);
  assert.equal(result.changedReferences,0);
  assert.equal(result.db,progress);
});

test('standalone generators append after the existing task, with all other banks and references preserved',()=>{
  const before = appendPythonPracticeExpansion(fixture(),payload).testsDb;
  const result = appendPythonGeneratorExpansion(before,generators);
  assert.equal(result.added,24);
  assert.equal(result.testsDb[112].python.length,25);
  assert.deepEqual(result.testsDb[112].python[0],before[112].python[0]);
  assert.deepEqual(result.testsDb[112].pythonTheory,before[112].pythonTheory);
  for (const key of Object.keys(before).filter(k=>k!=='112')) assert.deepEqual(result.testsDb[key],before[key]);
  assert.deepEqual(appendPythonGeneratorExpansion(result.testsDb,generators).testsDb,result.testsDb);
  const progress = {student:{nextLesson:{goals:[{type:'task',taskNumber:112,levelId:'python',targetQuestions:[1]}]},
    solved:{'112-python-0':true},drafts:{'112-python-0':'print(1)'}}};
  assert.equal(remapProgressQuestionTargets(progress,before,result.testsDb).changedReferences,0);
  assert.equal(buildPythonSubsectionModel(result.testsDb[112],'python').questions.length,25);
});

test('standalone generator release refuses another card or changes to existing exercises',()=>{
  const before = fixture();
  before.__pythonTaskCatalog[0].title='Кортежи';
  assert.throws(()=>appendPythonGeneratorExpansion(before,generators),/Expected existing Generators/);
  const saved = appendPythonGeneratorExpansion(fixture(),generators).testsDb;
  saved[112].python.at(-1).question='Условие изменил учитель';
  assert.throws(()=>appendPythonGeneratorExpansion(saved,generators),/no overwrite/);
});

test('second batch adds 120 distinct exercises after both previous expansions without remapping homework', () => {
  const old = appendPythonGeneratorExpansion(appendPythonPracticeExpansion(fixture(), payload).testsDb, generators).testsDb;
  const saved = structuredClone(old);
  const result = appendPythonSecondExpansion(old, second);
  assert.equal(result.added, 120);
  assert.deepEqual(old, saved);
  for (const [topic, count] of Object.entries(result.topics)) {
    assert.equal(count, topic === '112' ? 24 : 12);
    assert.deepEqual(result.testsDb[topic].python.slice(0, old[topic].python.length), old[topic].python);
    assert.deepEqual(result.testsDb[topic].pythonTheory, old[topic].pythonTheory);
  }
  for (const key of ['109', '110', '7']) assert.deepEqual(result.testsDb[key], old[key]);
  assert.equal(appendPythonSecondExpansion(result.testsDb, second).added, 0);
  const progress = { student: { homeworks: [{id:'existing', goals:[{type:'task',taskNumber:108,levelId:'python',targetQuestions:[1,18,41]}]}], solved:{'108-python-0':true}, drafts:{'108-python-0':'saved'} } };
  assert.equal(remapProgressQuestionTargets(progress, old, result.testsDb).changedReferences, 0);
  result.testsDb[101].python.at(-1).title = 'Правка учителя';
  assert.throws(() => appendPythonSecondExpansion(result.testsDb, second), /no overwrite/);
});
