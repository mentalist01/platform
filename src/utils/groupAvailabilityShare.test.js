import test from 'node:test';
import assert from 'node:assert/strict';
import {unanimousGroupSlots,groupAvailabilityShareCards,groupAvailabilityCandidates,selectGroupAvailabilityParticipants} from './groupAvailabilityShare.js';
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
test('image cards show each full lesson choice without merging overlapping alternatives or gaps',()=>{
  const entries=[600,630,660,720].map((minutes,index)=>({day:0,minutes,durationMinutes:60,busy:index===2}));
  const groups=[{groupId:'g',groupName:'Группа 2',config:{startDate:'2026-10-14',weeks:8},slots:entries},{groupId:'other',groupName:'Группа 3',slots:[{...entries[0],busy:false}]}];
  const cards=groupAvailabilityShareCards(groups);assert.equal(cards[0].length,5);
  assert.deepEqual(cards[0].map(card=>[card.groupId,card.firstStart,card.firstStart+card.durationMinutes]),[['g',600,660],['other',600,660],['g',630,690],['g',660,720],['g',720,780]]);
  assert.equal(cards[0][3].busy,true);
  const free=groupAvailabilityShareCards(groups,'free');assert.equal(free[0].length,4);assert.ok(free[0].every(card=>!card.busy));assert.deepEqual(free[0].filter(card=>card.groupId==='g').map(card=>card.firstStart),[600,630,720]);
});
test('unknown teacher conflicts cannot be presented as free, while all matches remain available',()=>{
  const groups=[{groupId:'g',groupName:'Группа 2',slots:[{day:2,minutes:600,durationMinutes:45,busy:null}]}];
  assert.equal(groupAvailabilityShareCards(groups,'all')[2].length,1);assert.equal(groupAvailabilityShareCards(groups,'free')[2].length,0);
});

const previewFixture=()=>({groups:[{groupId:'g',groupName:group.name,memberCount:3,answeredCount:3,
  members:group.members.map(member=>({id:member.studentId,name:`PRIVATE ${member.studentId}`,answered:true})),
  candidates:groupAvailabilityCandidates(group,poll).map(slot=>({...slot,busy:slot.id==='0-660'})),
  slots:unanimousGroupSlots(group,poll).map(slot=>({...slot,busy:false}))}]});
test('temporarily excluding a restrictive pupil reveals other matches, keeps maybe and teacher conflicts',()=>{
  const data=previewFixture(),before=JSON.stringify(data);
  const all=selectGroupAvailabilityParticipants(data);assert.deepEqual(all.groups[0].slots.map(slot=>slot.id),['0-600']);
  const partial=selectGroupAvailabilityParticipants(data,{g:['c']});
  assert.deepEqual(partial.groups[0].slots.map(slot=>slot.id),['0-600','0-630','0-660']);
  assert.equal(partial.groups[0].includedMemberCount,2);assert.equal(partial.groups[0].excludedMemberCount,1);
  assert.equal(partial.groups[0].memberCount,3);assert.equal(partial.groups[0].slots[0].flexibleCount,1);
  assert.equal(groupAvailabilityShareCards(partial.groups,'free')[0].length,2);
  assert.equal(groupAvailabilityShareCards(partial.groups,'all')[0].length,3);
  assert.equal(groupAvailabilityShareCards(partial.groups,'all')[0][0].includedMemberCount,2);
  assert.equal(JSON.stringify(data),before,'Preview never mutates the source responses');
  assert.deepEqual(selectGroupAvailabilityParticipants(data,{}).groups[0].slots.map(slot=>slot.id),['0-600']);
});
test('multiple exclusions, zero included pupils, unknown IDs and refreshed membership remain safe',()=>{
  const data=previewFixture();
  assert.deepEqual(selectGroupAvailabilityParticipants(data,{g:['b','c']}).groups[0].slots.map(slot=>slot.id),['0-600','0-630','0-660']);
  const empty=selectGroupAvailabilityParticipants(data,{g:['a','b','c']});assert.deepEqual(empty.groups[0].slots,[]);assert.equal(empty.groups[0].includedMemberCount,0);
  const unrelated=selectGroupAvailabilityParticipants(data,{g:['outsider'],other:['c']});assert.equal(unrelated.groups[0].excludedMemberCount,0);
  const updated=structuredClone(data);updated.groups[0].members[2]={id:'new',name:'New pupil',answered:false};
  const newPupil=selectGroupAvailabilityParticipants(updated,{g:['c']});assert.deepEqual(newPupil.groups[0].slots,[]);assert.equal(newPupil.groups[0].excludedMemberCount,0);
  assert.equal(newPupil.groups[0].includedAnsweredCount,2);
});
