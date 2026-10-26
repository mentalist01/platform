import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {partFixture} from './preparedSetParts.fixture.js';
import {GroupStudyProgress} from './groupStudyProgress.js';
import {createStudyPlan} from '../src/utils/egeStudyPlan.js';
import {boardPagesList} from '../src/utils/boardPages.js';
import {mutateLessonPage} from './lessonPageCatalog.js';

test('group route is private, shared by the group, and transitions in its permanent notebook',async t=>{
  const f=await partFixture(t),book=await f.document('board-group-g~pages'),groups=[{id:'g',teacherId:'t',name:'Группа 2',status:'active',members:[{studentId:'p',status:'active'}]}];
  f.prepared.authorize=async auth=>({allowed:true,auth,groupId:'g',teacherId:'t',participantIds:['p']});
  const store=new GroupStudyProgress({dataDir:f.directory,groups:()=>groups,plans:{get:createStudyPlan},prepared:f.prepared,pages:async()=>boardPagesList(book.getMap('pages')),createPage:async(_group,input)=>({id:mutateLessonPage(book,input)})});
  assert.throws(()=>store.owner({id:'other',role:'teacher'},'g'),e=>e.status===404);assert.throws(()=>store.owner({id:'p',role:'student'},'g'),e=>e.status===403);
  const change=input=>store.change(f.auth,'g',{revision:store.record('t','g').revision,...input});
  await change({action:'current',pageId:'main',blockId:'18',partNumber:1});await change({action:'complete',pageId:'main'});
  const preview=(await store.detail(f.auth,'g')).transition;assert.deepEqual(preview.next,{blockId:'9',partNumber:1});
  const result=await change({action:'transition',operationId:crypto.randomUUID(),blockId:'9',partNumber:1,name:'Задание №9',parts:preview.parts.map(p=>({partNumber:p.partNumber,name:p.name,setId:f.set.id,version:f.set.version,sourcePartNumber:p.partNumber}))});
  assert.equal(result.record.studentId,'group:g');assert.equal(result.record.groupId,'g');assert.ok(result.record.current.runId);assert.ok(result.group.participantIds.includes('p'));
  const runs=Object.values(f.prepared.data.runs);assert.equal(runs.length,2);assert.ok(runs.every(run=>run.room.startsWith('board-group-g~page~')&&run.groupId==='g'));
  assert.ok(f.docs.has('collab-group-g'));assert.equal([...f.docs.keys()].some(room=>room.startsWith('collab-t-g')),false);
  const next=await change({action:'position',pageId:result.record.current.pageId,runId:result.record.current.runId,cardId:result.record.current.cardId});assert.equal(next.record.current.blockId,'9');
  groups[0].members.push({studentId:'q',status:'active'});assert.deepEqual((await store.detail(f.auth,'g')).group.participantIds,['p','q']);
  groups[0].status='completed';assert.equal(Object.keys(store.list(f.auth).records).length,0);assert.throws(()=>store.owner(f.auth,'g'),e=>e.status===404);
});
