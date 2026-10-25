import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('teacher connects existing board pages; progress remains private and follows custom shared plan',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
    write('teachers',[...JSON.parse(fs.readFileSync(path.join(data,'teachers.json'))),{id:'t',name:'Учитель маршрута',code:'study-teacher'}]);
    write('students',[...JSON.parse(fs.readFileSync(path.join(data,'students.json'))),...['p','q'].map(id=>({id,teacherId:'t',name:id,code:'study-'+id,grade:'11'}))]);
  }),{request,tokens}=f,a=(await request('/api/login','',{code:'study-teacher'})).token,b=tokens['teacher-b'],url='/api/student-study-progress/p';
  try{
    await request(url,'',undefined,'GET',401);
    await request(url,tokens['student-a'],undefined,'GET',403);
    await request(url,b,undefined,'GET',404);
    assert.deepEqual(Object.keys((await request('/api/student-study-progress',a)).records).sort(),['p','q']);
    const plan=await request('/api/ege-study-plan',a);plan.order=['17','4','7'];await request('/api/ege-study-plan',a,plan,'PUT');
    let detail=await request(url,a);assert.deepEqual(detail.next,{blockId:'17',partNumber:1});
    const page=await request('/api/lesson-pages',a,{room:'board-t-p~pages',action:'create',name:'17'});
    const current=await request(url,a,{revision:0,action:'current',pageId:page.id,blockId:'17',partNumber:1});
    assert.equal(current.record.current.pageId,page.id);
    await request(url,a,{revision:0,action:'complete',pageId:page.id},'POST',409);
    await request(url,b,{revision:1,action:'current',pageId:page.id,blockId:'17',partNumber:1},'POST',404);
    await request(url,a,{revision:1,action:'link',pageId:'not-the-pupils-page',blockId:'17',partNumber:1},'POST',404);
    const completed=await request(url,a,{revision:1,action:'complete',pageId:page.id});assert.deepEqual(completed.next,{blockId:'4',partNumber:1});
    assert.equal((await request('/api/student-study-progress/q',a)).record.current,null);
    await request('/api/lesson-pages',a,{room:'board-t-p~pages',action:'rename',id:page.id,name:'17 · решаем файлы'});
    assert.equal((await request(url,a)).record.current.pageTitle,'17 · решаем файлы');
    const response=await fetch(f.base+url,{headers:{Authorization:`Bearer ${a}`}});assert.match(response.headers.get('cache-control'),/private, no-store/);
    await request('/api/lesson-pages',a,{room:'board-t-p~pages',action:'delete',id:page.id});
    assert.equal((await request(url,a)).record.current.pageMissing,true);
  }finally{await f.stop();}
});
