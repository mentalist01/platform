import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('teacher cuts and undoes an image through immutable assets; pupils and other teachers cannot edit or see editing history',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{base,request,tokens}=f,a=tokens['teacher-a'];
  try{
    const form=new FormData();form.append('file',new Blob([await sharp({create:{width:600,height:400,channels:4,background:'white'}}).png().toBuffer()]),'condition.png');
    const response=await fetch(base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});assert.ok(response.ok);const original=await response.json();
    const cutRoute=`/api/lesson-task-images/${original.id}/remove-strip`,infoRoute=`/api/lesson-task-images/${original.id}/edit`;
    assert.equal((await request(infoRoute,a)).previous,null);
    await request(cutRoute,tokens['student-a'],{top:.3,bottom:.7},'POST',404);
    await request(cutRoute,tokens['teacher-b'],{top:.3,bottom:.7},'POST',404);
    await request(infoRoute,tokens['student-a'],undefined,'GET',404);
    await request(infoRoute,tokens['teacher-b'],undefined,'GET',404);
    await request(cutRoute,a,{top:0,bottom:1},'POST',400);
    const asset=await request(cutRoute,a,{top:.3,bottom:.7});assert.notEqual(asset.id,original.id);assert.equal(asset.width,600);assert.equal(asset.height,240);
    const bytes=await fetch(base+asset.url,{headers:{Authorization:`Bearer ${a}`}});assert.equal((await sharp(Buffer.from(await bytes.arrayBuffer())).metadata()).height,240);
    const old=await fetch(base+original.url,{headers:{Authorization:`Bearer ${a}`}});assert.equal((await sharp(Buffer.from(await old.arrayBuffer())).metadata()).height,400);
    const history=await request(`/api/lesson-task-images/${asset.id}/edit`,a);assert.equal(history.previous.id,original.id);assert.equal(history.original.id,original.id);
    const second=await request(`/api/lesson-task-images/${asset.id}/remove-strip`,a,{top:.25,bottom:.5});
    const secondHistory=await request(`/api/lesson-task-images/${second.id}/edit`,a);assert.equal(secondHistory.previous.id,asset.id);assert.equal(secondHistory.original.id,original.id);
    let set=await request('/api/lesson-task-sets',a,{name:'Условие без разрыва',taskNumber:4,tasks:[{images:[original.id],answers:['01']}]},'POST',201);
    const {run}=await request('/api/lesson-task-runs',a,{room:`board-group-${f.groupId}`,setId:set.id,x:0,y:0},'POST',201);
    set=await request(`/api/lesson-task-sets/${set.id}`,a,{...set,tasks:[{...set.tasks[0],images:[asset.id]}]},'PUT');
    const current=(await request('/api/lesson-task-run?room='+encodeURIComponent(run.room),tokens['student-a'])).run;
    assert.equal(current.cards[0].images[0].id,original.id,'Editing the library never changes already placed lesson conditions');
    assert.equal(set.tasks[0].images[0],asset.id);
    const undo=await request(`/api/lesson-task-sets/${set.id}`,a,{...set,tasks:[{...set.tasks[0],images:[history.previous.id]}]},'PUT');assert.equal(undo.tasks[0].images[0],original.id);
    const privateResponse=await fetch(base+`/api/lesson-task-images/${asset.id}/edit`,{headers:{Authorization:`Bearer ${a}`}});assert.match(privateResponse.headers.get('cache-control'),/private, no-store/);
  }finally{await f.stop();}
});
