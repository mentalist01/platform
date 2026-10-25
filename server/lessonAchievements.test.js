import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LessonAchievementStore,lessonAchievementFacts,lessonAchievementContext,preparedSolveReceipt} from './lessonAchievements.js';
import {ACHIEVEMENT_CATALOG} from '../src/data/achievementCatalog.js';
import {planAchievementRewards} from './achievementRewards.js';

const now=Date.parse('2026-10-25T12:00:00Z');
const event=(n,extra={})=>({taskKey:'task-'+n,contentKey:'content-'+n,runId:'r',cardId:'c'+n,scopeKey:'t:student:s',teacherId:'t',taskNumber:17,partNumber:1,solvedAt:new Date(now+n*1000).toISOString(),participants:[{id:'s',name:'Ученик'}],...extra});
function storeFixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lesson-achievements-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,store:new LessonAchievementStore(dir,{now:()=>now+60000})};}

test('sixteen lesson achievements have unique rules and the agreed cumulative XP rewards',()=>{
  const items=ACHIEVEMENT_CATALOG.filter(item=>item.category==='lesson');assert.equal(items.length,16);
  assert.equal(new Set(items.map(item=>item.id)).size,16);
  const unlocked=items.filter(item=>item.metric==='lessonSolved').map(item=>({...item,unlocked:true}));
  assert.equal(planAchievementRewards(null,unlocked).xpGained,6000);
  const first=planAchievementRewards(null,[unlocked[1]]);
  assert.equal(first.xpGained,600);assert.equal(planAchievementRewards(first.rewards,[unlocked[2]]).xpGained,900);
});

test('presence uses authenticated current board connections, excludes absent, read-only and unrelated pupils',()=>{
  const run={teacherId:'t',groupId:'g',participantIds:['a','b']},students=['a','b','c'].map(id=>({id,teacherId:'t',name:id}));
  const connections=[{open:true,auth:{id:'a',role:'student'},target:{groupId:'g'}},{open:true,auth:{id:'b',role:'student'},target:{groupId:'g'},readOnly:true},{open:true,auth:{id:'c',role:'student'},target:{groupId:'g'}}];
  assert.deepEqual(lessonAchievementContext(run,{id:'t',role:'teacher'},{connections,students}).participants.map(p=>p.id),['a']);
  assert.equal(lessonAchievementContext(run,{id:'a',role:'student'},{connections,students}).participants.length,0,'Pupil alone is not a lesson');
  connections.push({open:true,auth:{id:'t',role:'teacher'},target:{groupId:'g'}});
  assert.equal(lessonAchievementContext(run,{id:'a',role:'student'},{connections,students}).participants.length,1);
});

test('a matching scheduled lesson ID groups pages but excludes cancelled or unrelated sessions',()=>{
  const run={teacherId:'t',studentId:'s',participantIds:[]},students=[{id:'s',teacherId:'t'}];
  const sessions=[{id:'cancelled',teacherId:'t',participantIds:['s'],startAt:new Date(now).toISOString(),status:'cancelled'},{id:'other',teacherId:'other',participantIds:['s'],startAt:new Date(now).toISOString()},{id:'scheduled',teacherId:'t',participantIds:['s'],startAt:new Date(now-60000).toISOString()}];
  assert.equal(lessonAchievementContext(run,{id:'t',role:'teacher'},{sessions,students,now}).lessonId,'scheduled');
});

test('durable first solves deduplicate task identity and copied conditions without upgrading later difficulty',t=>{
  const {dir,store}=storeFixture(t),first=store.record('s',event(1));
  assert.equal(first.before.lessonSolved,0);assert.equal(first.after.lessonSolved,1);
  assert.equal(store.record('s',event(1,{difficult:true})).changed,false);
  assert.equal(store.record('s',event(2,{contentKey:'content-1',difficult:true})).changed,false);
  assert.equal(store.facts('s').lessonDifficult,0);
  const restarted=new LessonAchievementStore(dir);assert.equal(restarted.facts('s').lessonSolved,1);
  assert.equal(restarted.facts('other').lessonSolved,0);
  assert.equal(store.record('absent',event(3)).changed,false);
});

test('lesson totals span pages and sets; a later date, scheduled ID or inactivity starts another lesson',t=>{
  const {store}=storeFixture(t);
  for(let i=1;i<=5;i++)store.record('s',event(i,{runId:'r'+i}));
  assert.equal(store.facts('s').lessonBest,5);
  store.record('s',event(6,{solvedAt:new Date(now+2*3600000).toISOString()}));
  store.record('s',event(7,{lessonId:'scheduled-2'}));
  assert.equal(store.read('s').events.at(-1).lessonKey,'scheduled:scheduled-2');
  assert.equal(store.facts('s').lessonBest,5);
});

test('all separate questions are one receipt; difficulty and condition identity come from the run snapshot',()=>{
  const run={id:'r',teacherId:'t',studentId:'s',participantIds:[],taskNumber:17,partNumber:1,tasks:[{id:'task',difficult:true,images:['image'],attachments:[],answers:['1','2','3']}]};
  const receipt=preparedSolveReceipt(run,{index:0,id:'card'},{image:{hash:'condition'}},{participants:[{id:'s'},{id:'outsider'}]},now);
  assert.equal(receipt.difficult,true);assert.deepEqual(receipt.participants.map(p=>p.id),['s']);
  assert.equal('answers' in receipt,false);assert.equal(receipt.solvedAt,new Date(now).toISOString());
});

test('independence and helper saves upgrade only the original completed card; copied repeats cannot farm evidence',t=>{
  const {store}=storeFixture(t);store.record('s',event(1));store.record('s',event(2));
  assert.equal(store.facts('s').lessonIndependentTransfer,0);
  store.record('s',event(2),{independent:true,tableSolution:true});
  assert.equal(store.facts('s').lessonIndependentTransfer,1);assert.equal(store.facts('s').lessonTables,1);
  store.record('s',event(3,{contentKey:'content-1'}),{independent:true,tableSolution:true});
  assert.equal(store.facts('s').lessonTables,1);
});

test('topic mastery needs distinct lessons, difficult breadth needs thirty solves, files need three numbers',()=>{
  const events=Array.from({length:30},(_,i)=>({...event(i),lessonKey:'l'+(i%3),taskNumber:1+i%5,difficult:true,inputFile:true}));
  let facts=lessonAchievementFacts(events);assert.equal(facts.lessonDifficultBreadth,5);assert.equal(facts.lessonFiles,30);
  assert.equal(lessonAchievementFacts(events.slice(0,29)).lessonDifficultBreadth,0);
  assert.equal(lessonAchievementFacts(events.map(e=>({...e,taskNumber:17}))).lessonFiles,19);
  facts=lessonAchievementFacts(events.map(e=>({...e,taskNumber:17})));assert.equal(facts.lessonTopicMastery,30);
  assert.equal(lessonAchievementFacts(events.map(e=>({...e,taskNumber:17,lessonKey:'one'}))).lessonTopicMastery,0);
});

test('special achievements count eight actual parts and only group lessons with three new solves',()=>{
  const events=Array.from({length:24},(_,i)=>({...event(i),taskNumber:26,partNumber:1+Math.floor(i/3),lessonKey:'l'+Math.floor(i/3),groupId:'g'}));
  const facts=lessonAchievementFacts(events);assert.equal(facts.lesson26Parts,8);assert.equal(facts.lessonGroupSessions,8);
  assert.equal(lessonAchievementFacts(events.slice(0,-1)).lesson26Parts,7);
});

test('return achievement requires a later Moscow date and a verified final solve',t=>{
  const {store}=storeFixture(t);store.record('s',event(1,{skippedAt:new Date(now-86400000).toISOString()}));store.record('s',event(2,{skippedAt:new Date(now-60000).toISOString()}));
  assert.equal(store.facts('s').lessonReturned,1);
});
