import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {EgeStudyPlans} from './egeStudyPlan.js';

test('study canvas persists per teacher, rejects stale revisions and invalid input, students cannot read or write',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens}=f,a=tokens['teacher-a'],b=tokens['teacher-b'];
  try{
    await request('/api/ege-study-plan','',undefined,'GET',401);
    await request('/api/ege-study-plan',tokens['student-a'],undefined,'GET',403);
    const initial=await request('/api/ege-study-plan',a);assert.equal(initial.revision,0);assert.equal(initial.order[0],'4');
    initial.blocks['26'].parts[0]='Сортировка';initial.blocks['26'].x=1050;
    const saved=await request('/api/ege-study-plan',a,initial,'PUT');assert.equal(saved.revision,1);
    await request('/api/ege-study-plan',tokens['student-a'],saved,'PUT',403);
    assert.equal((await request('/api/ege-study-plan',b)).revision,0);
    const stale=await request('/api/ege-study-plan',a,initial,'PUT',409);assert.equal(stale.current.blocks['26'].parts[0],'Сортировка');
    await request('/api/ege-study-plan',a,{...saved,order:['4','4']},'PUT',400);
    await request('/api/ege-study-plan',a,{...saved,blocks:{...saved.blocks,'4':{...saved.blocks['4'],x:-1}}},'PUT',400);
    await request('/api/ege-study-plan',a,{...saved,blocks:{...saved.blocks,'4':{...saved.blocks['4'],parts:Array(17).fill('a')}}},'PUT',400);
    const next=await request('/api/ege-study-plan',a,{...saved,title:'Мой маршрут'},'PUT');assert.equal(next.revision,2);
    const store=new EgeStudyPlans(f.data);assert.equal(store.get('teacher-a').title,'Мой маршрут');assert.equal(store.get('teacher-a').blocks['26'].x,1050);
    const cached=await fetch(f.base+'/api/ege-study-plan',{headers:{Authorization:`Bearer ${a}`}});assert.match(cached.headers.get('cache-control'),/private, no-store/);
    const file=path.join(f.data,'ege-study-plans.json'),bytes=fs.readFileSync(file);fs.writeFileSync(file,'broken');
    await request('/api/ege-study-plan',a, next,'PUT',500);assert.equal(fs.readFileSync(file,'utf8'),'broken','Never overwrite an unreadable account store');
    fs.writeFileSync(file,bytes);
  }finally{await f.stop();}
});
