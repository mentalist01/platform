import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { achievementFacts, StudentAchievementStore } from './studentAchievements.js';
import { ACHIEVEMENT_CATALOG } from '../src/data/achievementCatalog.js';

const now = Date.parse('2026-10-23T10:00:00Z'), at = '2026-10-21T22:00:00Z';
const context = { now, tests: {101:{python:[{id:'p'}]}}, pythonTaskIds: [101], mockExams: [{id:'m1'},{id:'m2'},{id:'random',rewardsDisabled:true}] };
const level = (solved, answerHistory = {}) => ({ solved, answerHistory });
test('catalog has 148 unique, attainable rules, grouping game theory 19–21 correctly', () => {
  assert.equal(ACHIEVEMENT_CATALOG.length,148);
  assert.equal(new Set(ACHIEVEMENT_CATALOG.map(item=>item.id)).size,148);
  assert.equal(ACHIEVEMENT_CATALOG.some(item=>/^ege-task-(20|21)-/.test(item.id)),false);
  for(const item of ACHIEVEMENT_CATALOG) assert.ok(item.target>0 && item.title && item.description);
});
test('verified unique solutions count; XP, percentages, code drafts and mock task events do not', () => {
  const facts=achievementFacts({xpTotal:999999,progress:{1:100},solvedByTask:{4:{basic:level(['a','a','b'])},101:{python:level(['p'])},999:{basic:level(['draft'])}},solvedEvents:[{source:'mock-exam',taskNumber:4,questionId:'fake',solvedAt:at}]},context);
  assert.equal(facts.egeSolved,2);assert.equal(facts.pythonSolved,1);assert.equal(facts['pythonComplete:101'],1);assert.equal(facts.activeDays,0);
  assert.equal(achievementFacts({},context)['pythonComplete:101'],0);
});
test('only an error before success counts as a correction, once per task', () => {
  const history={a:[{correct:false,submittedAt:at},{correct:true,submittedAt:'2026-10-22T10:00Z'},{correct:true,submittedAt:'2026-10-23T09:00Z'}],b:[{correct:true,submittedAt:at},{correct:false,submittedAt:'2026-10-22T10:00Z'}],c:[{correct:false,submittedAt:at}]};
  assert.equal(achievementFacts({solvedByTask:{4:{basic:level(['a','a','b','c'],history)}}},context).corrected,1);
});
test('Moscow practice days use each first solve once; invalid/future timestamps and repeat events add no days',()=>{
  const facts=achievementFacts({solvedByTask:{4:{basic:level(['a'],{a:[{correct:true,submittedAt:'2026-10-22T10:00Z'}]})},101:{python:level(['p'])}},solvedEvents:[{taskNumber:4,levelId:'basic',questionId:'a',solvedAt:at},{taskNumber:4,levelId:'basic',questionId:'a',solvedAt:'2026-10-23T09:00Z'},{taskNumber:101,levelId:'python',questionId:'p',solvedAt:'2026-10-22T00:00Z'},{taskNumber:101,levelId:'python',questionId:'p',solvedAt:'2030-01-01'}]},context);
  assert.equal(facts.activeDays,1);assert.equal(facts.mixedDays,1);
});
test('completed distinct mocks award best scores; growth needs a different mock and retains first baseline',()=>{
  const make=(examId,secondaryScore,finishedAt)=>({examId,secondaryScore,finishedAt});
  const events=[make('m1',7,'2026-10-01'),make('m1',100,'2026-10-02'),make('random',100,'2026-10-03'),make('m2',88,'2026-10-20'),make('m2',null,'2026-10-21'),make('unknown',100,at),make('m2',100,'2030-01-01')];
  const facts=achievementFacts({mockCompletionEvents:events},context);assert.equal(facts.mockCount,2);assert.equal(facts.mockBest,100);assert.equal(facts.mockGrowth,81);
  assert.equal(achievementFacts({mockCompletionEvents:events.filter(e=>e.examId==='m1')},context).mockGrowth,0);
});
test('neutral homework percentages are not completion evidence; granted homework IDs deduplicate',()=>{
  const facts=achievementFacts({homeworks:[{id:'not-done',percent:100},{id:'done',homeworkChestId:'chest',homeworkChestGrantedAt:at},{id:'done',homeworkChestId:'chest',homeworkChestGrantedAt:at}]},context);assert.equal(facts.homeworkCompleted,1);
});
test('persistent awards backfill silently, claim once, isolate students and survive a later catalog/data change',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'achievement-store-'));
  const write=(file,contents)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents)};
  try{
    let store=new StudentAchievementStore(directory,{write,now:()=>now});
    const initial=store.evaluate('a',{egeSolved:10});assert.equal(initial.items.find(i=>i.id==='ege-solves-10').historical,true);assert.deepEqual(store.claim('a'),[]);
    store.evaluate('a',{egeSolved:25});const fresh=store.claim('a');assert.deepEqual(fresh.map(i=>i.id),['ege-solves-25']);assert.deepEqual(store.claim('a'),[]);
    store=new StudentAchievementStore(directory,{write,now:()=>now});assert.equal(store.evaluate('a',{}).items.find(i=>i.id==='ege-solves-25').unlocked,true);
    assert.equal(store.evaluate('b',{}).items.some(i=>i.unlocked),false);
    assert.equal(fs.readdirSync(directory).length,2);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('first real action awards against the before-state even before the collection was opened',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'achievement-baseline-'));
  try{
    const store=new StudentAchievementStore(directory,{write:(file,contents)=>fs.writeFileSync(file,contents),now:()=>now});
    store.evaluate('pupil',{egeSolved:1,activeDays:1},{baselineFacts:{}});
    assert.deepEqual(store.claim('pupil').map(i=>i.id).sort(),['active-days-1','ege-solves-1']);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
