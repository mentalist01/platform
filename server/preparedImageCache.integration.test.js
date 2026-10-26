import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import http from 'node:http';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('immutable condition images revalidate with ETags after access checks; hidden tasks remain private', {timeout:60000}, async()=>{
  const f=await createGroupHomeworkFixture();
  const headers=id=>({Authorization:'Bearer '+f.tokens[id]});
  const upload=async color=>{
    const bytes=await sharp({create:{width:600,height:200,channels:4,background:color}}).png().toBuffer();
    const form=new FormData();form.append('file',new Blob([bytes]),'condition.png');
    const res=await fetch(f.base+'/api/lesson-task-images',{method:'POST',headers:headers('teacher-a'),body:form});assert.equal(res.status,201);return res.json();
  };
  try{
    const first=await upload('white'),second=await upload('black');
    const set=await f.request('/api/lesson-task-sets',f.tokens['teacher-a'],{name:'Кеш условий',taskNumber:4,tasks:[{title:'1',images:[first.id],answers:['1'],format:'exact'},{title:'2',images:[second.id],answers:['2'],format:'exact'}]},'POST',201);
    const {run}=await f.request('/api/lesson-task-runs',f.tokens['teacher-a'],{setId:set.id,room:`board-group-${f.groupId}`,x:0,y:0},'POST',201);
    const url=f.base+run.cards[0].images[0].url;
    const response=await fetch(url,{headers:headers('student-a')});assert.equal(response.status,200);await response.arrayBuffer();
    assert.equal(response.headers.get('cache-control'),'private, no-cache');
    const etag=response.headers.get('etag');assert.match(etag,/^"[a-f0-9]{64}"$/);
    const same=await new Promise((resolve,reject)=>{http.get(url,{headers:{...headers('student-a'),'If-None-Match':etag}},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,bytes:Buffer.concat(chunks).length}));}).on('error',reject);});assert.equal(same.status,304);assert.equal(same.bytes,0);
    assert.equal((await fetch(url,{headers:{...headers('student-c'),'If-None-Match':etag}})).status,403);
    assert.equal((await fetch(url,{headers:{'If-None-Match':etag}})).status,401);
    const hidden=f.base+`/api/lesson-task-assets/${second.id}?run=${run.id}`;
    assert.equal((await fetch(hidden,{headers:{...headers('student-a'),'If-None-Match':etag}})).status,403);
    const other=await fetch(hidden,{headers:{...headers('teacher-a'),'If-None-Match':etag}});assert.equal(other.status,200);assert.notEqual(other.headers.get('etag'),etag);await other.arrayBuffer();
  }finally{await f.stop();}
});
