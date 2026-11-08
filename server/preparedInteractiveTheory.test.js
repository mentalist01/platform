import test from 'node:test';
import assert from 'node:assert/strict';
import {partFixture} from './preparedSetParts.fixture.js';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {PreparedSetExchange} from './preparedSetExchange.js';
import {IP_SUBNET_CARD} from '../src/utils/interactiveTheoryCatalog.js';
import {preparedSetSequence} from '../src/utils/preparedRunSources.js';
import {preparedLayoutKey} from '../src/utils/preparedSetLayout.js';

const interactive=(id='subnet')=>({id,kind:'interactive',typeId:IP_SUBNET_CARD,params:{ip:'192.168.1.70',prefix:26}});
test('mixed image/interactive theory persists, plays in order, uses existing placement/camera, and never becomes an exercise',async t=>{
  const f=await partFixture(t),{prepared,auth,image,set:original}=f;
  const image2=prepared.putAsset(auth,Buffer.from('another-image'),'second.png','image/png',{width:600,height:300});
  const tasks=original.tasks.slice(0,2);
  let set=await prepared.saveSet(auth,{name:'Сеть',taskNumber:10,tasks,theoryMode:'steps',theoryItems:[{id:image.id,kind:'image',assetId:image.id},interactive(),{id:image2.id,kind:'image',assetId:image2.id}],
    theoryPlacements:{[image2.id]:tasks[1].id},boardLayout:{'theory:subnet':{placement:'right',relativeTo:`theory:${image.id}`,scalePercent:75,focus:'pair'}}});
  assert.equal(set.draft,undefined);assert.equal(set.theoryImages.length,2);assert.equal(set.theoryItems.length,3);
  const sequence=preparedSetSequence(set);assert.deepEqual(sequence.map(row=>row.kind),['theory','theory',undefined,'theory',undefined]);
  assert.equal(preparedLayoutKey(sequence[1]),'theory:subnet');
  let run=await prepared.start(auth,{room:'board-a',setId:set.id,x:20,y:30,deferFirstCard:true});
  assert.equal(run.cards.length,0);
  run=await prepared.action(auth,run.id,{action:'begin'});const first=run.cards[0];
  run=await prepared.action(auth,run.id,{action:'next',expectedCount:1,fromCardId:first.id});
  const live=run.cards[1];assert.equal(live.kind,'theory');assert.equal(live.interactive.typeId,IP_SUBNET_CARD);assert.equal(live.answerCount,0);assert.equal(live.status,'theory');assert.equal(live.focusAnchorId,first.anchorId);
  const doc=await f.document('board-a'),anchors=doc.getArray('items').toArray();assert.ok(anchors[1].x>anchors[0].x+anchors[0].width);
  await assert.rejects(prepared.action(auth,run.id,{action:'check',cardId:live.id}),/Теория не требует/);
  run=await prepared.action(auth,run.id,{action:'next',expectedCount:2,fromCardId:live.id});assert.equal(run.cards[2].kind,'task');
  const reopened=new PreparedLessonTasks(f.deps);assert.deepEqual(reopened.setView(reopened.data.sets[set.id]).theoryItems,set.theoryItems);
  assert.equal(reopened.data.runs[run.id].tasks[1].interactive.params.prefix,26);
  const pupil={id:'p',role:'student'};await assert.rejects(prepared.taskCatalog(pupil,run.id),/преподавателю/);
});

test('interactive-only sets and mixed together mode work; copies remap instances/layout and preserve initial parameters',async t=>{
  const {prepared,auth,image}=await partFixture(t);
  const set=await prepared.saveSet(auth,{name:'IP',taskNumber:10,tasks:[],theoryItems:[interactive('one'),interactive('two')],theoryMode:'together',theoryPlacements:{two:'end'},boardLayout:{'theory:two':{relativeTo:'theory:one',placement:'below',scalePercent:50}}});
  assert.equal(preparedSetSequence(set).length,2);assert.equal(set.draft,undefined);
  const exchange=new PreparedSetExchange(prepared,()=>[{id:auth.id},{id:'other'}]);exchange.publish(auth,set.id,{version:0,recipientIds:['other']});
  assert.equal(exchange.preview({id:'other',role:'teacher'},set.id).set.theoryItems.length,2);
  const {set:copy}=exchange.copy({id:'other',role:'teacher'},set.id,{version:1});
  assert.notEqual(copy.theoryItems[0].id,'one');assert.deepEqual(copy.theoryItems[0].params,set.theoryItems[0].params);
  assert.equal(copy.boardLayout[`theory:${copy.theoryItems[1].id}`].relativeTo,`theory:${copy.theoryItems[0].id}`);
  const mixed=await prepared.saveSet(auth,{name:'Вместе',taskNumber:10,tasks:[],theoryMode:'together',theoryItems:[{id:image.id,kind:'image',assetId:image.id},interactive()]});
  assert.equal(preparedSetSequence(mixed).length,2);
});

test('legacy image theory stays stable and an interactive card can be added without replacing annotated sheets',async t=>{
  const {prepared,auth,image}=await partFixture(t);
  let set=await prepared.saveSet(auth,{name:'Старая теория',taskNumber:10,tasks:[],theoryMode:'together',theoryImages:[image.id]});
  assert.equal(set.theoryItems,undefined);
  let run=await prepared.start(auth,{room:'legacy-board',setId:set.id,x:10,y:20});const first=run.cards[0];
  set=await prepared.saveSet(auth,{...set,theoryItems:[{id:image.id,kind:'image',assetId:image.id},interactive()]},set.id);
  run=await prepared.action(auth,run.id,{action:'sync-set',setId:set.id,setVersion:set.version});
  assert.equal(run.cards[0].id,first.id);assert.equal(run.cards[0].anchorId,first.anchorId);assert.equal(run.total,2);
  run=await prepared.action(auth,run.id,{action:'next',expectedCount:1,fromCardId:first.id});assert.equal(run.cards[1].interactive.typeId,IP_SUBNET_CARD);
});

test('unknown code types, arbitrary parameters and other owners image assets cannot enter sets',async t=>{
  const {prepared,auth,image}=await partFixture(t);
  await assert.rejects(prepared.saveSet(auth,{name:'Bad',taskNumber:10,tasks:[],theoryItems:[{...interactive(),typeId:'https://evil/code.js'}]}),/Неизвестный/);
  await assert.rejects(prepared.saveSet(auth,{name:'Bad',taskNumber:10,tasks:[],theoryItems:[{...interactive(),params:{ip:'256.1.1.1',prefix:26}}]}),/IPv4/);
  await assert.rejects(prepared.saveSet({id:'other',role:'teacher'},{name:'Bad',taskNumber:10,tasks:[],theoryItems:[{id:image.id,kind:'image',assetId:image.id}]}),/Нет доступа/);
});
