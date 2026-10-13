import test from 'node:test';import assert from 'node:assert/strict';
import {pythonProjects,managePythonProject} from './python-projects.mjs';
const job=(id,createdAt,extra={})=>({id,title:'Цикл for',status:'saved',createdAt,file:`lesson-${id}.mkv`,pythonTimeline:{revision:4,speed:1.4,clips:[{start:0,end:14}],finalized:true},...extra});
test('project list includes old drafts beyond the recent-job limit and groups continuations once',()=>{
 const jobs=Object.fromEntries(Array.from({length:75},(_,i)=>[String(i),job(String(i),i)]));
 jobs.next=job('next',100,{pythonContinuedFrom:'0',pythonProjectId:'0'});
 const list=pythonProjects(jobs);assert.equal(list.length,75);assert.equal(list[0].id,'next');assert.equal(list[0].duration,10);assert.equal(list[0].projectId,'0');assert.ok(list.some(j=>j.id==='1'));
 assert.ok(list.every(j=>!('file'in j)&&!('url'in j)&&!('pythonTimeline'in j)));
});
test('rename and recoverable deletion preserve footage, edits, publication metadata and an entire continuation family',()=>{
 const jobs={one:job('one',1),two:job('two',2,{pythonProjectId:'one',pythonContinuedFrom:'one'})};
 const clips=JSON.stringify(jobs.two.pythonTimeline),files=[jobs.one.file,jobs.two.file];
 managePythonProject(jobs,{id:'two',revision:4,action:'rename',name:'  Урок про range  '},()=>10);
 assert.equal(jobs.one.pythonDraftName,'Урок про range');assert.equal(jobs.two.title,'Цикл for');
 managePythonProject(jobs,{id:'two',revision:4,action:'archive'},()=>11);assert.equal(jobs.one.pythonArchivedAt,11);assert.equal(pythonProjects(jobs)[0].archivedAt,11);
 managePythonProject(jobs,{id:'two',revision:4,action:'restore'});assert.equal(jobs.one.pythonArchivedAt,undefined);assert.equal(jobs.two.pythonArchivedAt,undefined);
 assert.equal(JSON.stringify(jobs.two.pythonTimeline),clips);assert.deepEqual([jobs.one.file,jobs.two.file],files);
});
test('live, stale, superseded and published projects cannot be removed, and invalid names do not mutate state',()=>{
 for(const status of ['recording','starting','stopping','uploading','processing'])assert.throws(()=>managePythonProject({one:job('one',1,{status})},{id:'one',revision:4,action:'archive'}),/завершите/);
 const jobs={one:job('one',1),two:job('two',2,{pythonContinuedFrom:'one',pythonProjectId:'one'})};
 for(const payload of [{id:'one',revision:4,action:'archive'},{id:'two',revision:3,action:'rename',name:'OK'},{id:'two',revision:4,action:'rename',name:''},{id:'two',revision:4,action:'rename',name:'x'.repeat(101)}]){const before=JSON.stringify(jobs);assert.throws(()=>managePythonProject(jobs,payload));assert.equal(JSON.stringify(jobs),before);}
 const published={one:job('one',1,{status:'ready',pythonTimeline:{revision:4,approved:true,clips:[]},url:'private'})};assert.throws(()=>managePythonProject(published,{id:'one',revision:4,action:'archive'}),/Опубликованный/);
});
