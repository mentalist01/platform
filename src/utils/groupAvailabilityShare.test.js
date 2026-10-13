import test from 'node:test';
import assert from 'node:assert/strict';
import {unanimousGroupSlots,groupAvailabilityShareCards} from './groupAvailabilityShare.js';
const group={id:'g',name:'Группа 2',members:['a','b','c'].map(studentId=>({studentId,status:'active'}))};
const config={days:[0,1],startMinute:600,endMinute:780,durationMinutes:60};
const answer=choices=>({choices});
const poll={config,answers:{a:answer({'0-600':'yes','0-630':'yes','0-660':'yes'}),b:answer({'0-600':'maybe','0-630':'yes','0-660':'yes'}),c:answer({'0-600':'yes','0-630':'no'})}};
test('only every current member counts; maybe is accepted and missing answers never count',()=>{
  const slots=unanimousGroupSlots(group,poll);assert.deepEqual(slots.map(slot=>slot.id),['0-600']);assert.equal(slots[0].memberCount,3);assert.equal(slots[0].flexibleCount,1);
  assert.deepEqual(unanimousGroupSlots(group,{...poll,answers:{a:poll.answers.a,b:poll.answers.b}}),[]);
  assert.deepEqual(unanimousGroupSlots({...group,members:[]},poll),[]);assert.deepEqual(unanimousGroupSlots(group,null),[]);
  assert.deepEqual(unanimousGroupSlots({...group,members:group.members.map(member=>member.studentId==='c'?{...member,status:'left'}:member)},poll).map(slot=>slot.id),['0-600','0-630','0-660']);
});
test('archived choices, no, invalid slots and participants outside the group do not create matches',()=>{
  const changed={...poll,answers:{...poll.answers,c:answer({'0-600':'maybe','0-750':'yes'}),former:answer({'0-750':'yes'})}};
  assert.deepEqual(unanimousGroupSlots(group,changed).map(slot=>slot.id),['0-600']);
});
test('image cards merge only consecutive start times in the same group and conflict state',()=>{
  const entries=[600,630,660,720].map((minutes,index)=>({day:0,minutes,durationMinutes:60,busy:index===2}));
  const groups=[{groupId:'g',groupName:'Группа 2',config:{startDate:'2026-10-14',weeks:8},slots:entries},{groupId:'other',groupName:'Группа 3',slots:[{...entries[0],busy:false}]}];
  const cards=groupAvailabilityShareCards(groups);assert.equal(cards[0].length,4);
  assert.equal(cards[0][0].count,2);assert.equal(cards[0][0].lastStart,630);assert.equal(cards[0][0].durationMinutes,60);
  assert.equal(cards[0][1].groupId,'other');assert.equal(cards[0][2].busy,true);assert.equal(cards[0][3].firstStart,720);
  const free=groupAvailabilityShareCards(groups,'free');assert.equal(free[0].length,3);assert.ok(free[0].every(card=>!card.busy));assert.equal(free[0].find(card=>card.firstStart===720).count,1,'Busy gaps are not filled by compression');
});
test('unknown teacher conflicts cannot be presented as free, while all matches remain available',()=>{
  const groups=[{groupId:'g',groupName:'Группа 2',slots:[{day:2,minutes:600,durationMinutes:45,busy:null}]}];
  assert.equal(groupAvailabilityShareCards(groups,'all')[2].length,1);assert.equal(groupAvailabilityShareCards(groups,'free')[2].length,0);
});
