import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { workbookPartState } from './workbookParts.js';

test('part state preserves legacy files and destinations when settings change',()=>{
  assert.deepEqual(workbookPartState(null,1),{workbookPartNumber:1,workbookPartPending:false});
  assert.deepEqual(workbookPartState(null,2),{workbookPartPending:true});
  assert.deepEqual(workbookPartState({folderId:'legacy'},2),{});
  assert.deepEqual(workbookPartState({workbookPartNumber:3},1),{workbookPartNumber:3,workbookPartPending:false});
  assert.deepEqual(workbookPartState({workbookPartPending:true},1),{workbookPartNumber:1,workbookPartPending:false});
});

test('old workbook helpers save first, then parts separate files and persist across repeated Ctrl+S', {timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
    const uploads=path.join(data,'../uploads');fs.writeFileSync(path.join(uploads,'source.ods'),'original');
    write('files',['a','b','c'].map(id=>({id:`source-${id}`,studentId:`student-${id}`,taskNumber:9,category:'class',name:'Таблица.ods',storageName:'source.ods',url:'/uploads/source.ods',sizeBytes:8,createdAt:'2026-10-01T10:00:00Z'})));write('folders',[]);
  });
  const teacher=f.tokens['teacher-a'],student=f.tokens['student-a'];
  const launch=async(actor=student,fileId='source-a',studentId='student-a')=>{
    const ticket=await f.request('/api/workbook-helper/launch',actor,{fileId,studentId},'POST',201);
    const response=await fetch(f.base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/1.2'},body:JSON.stringify({ticket:ticket.ticket})});
    assert.equal(response.status,200);return response.json();
  };
  const save=async(grant,text,revision=0,name='Задание 1')=>{
    const body=new FormData();body.append('file',new Blob([text]),'Таблица.ods');body.append('revision',String(revision));body.append('contentHash',crypto.createHash('sha256').update(text).digest('hex'));if(name)body.append('solutionName',name);
    const response=await fetch(f.base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:`Workbook ${grant.token}`},body});assert.equal(response.status,200,await response.clone().text());return response.json();
  };
  const choose=(id,part,token=student)=>f.request(`/api/workbook-parts/files/${id}`,token,{partNumber:part,pendingOnly:true});
  const pending=token=>f.request('/api/workbook-parts/pending',token);
  try{
    assert.equal((await f.request('/api/workbook-parts/9',student)).count,1);
    await f.request('/api/workbook-parts/9',student,{count:2},'PUT',403);
    await f.request('/api/workbook-parts/9',teacher,{count:0},'PUT',400);
    await f.request('/api/workbook-parts/9',teacher,{count:2.5},'PUT',400);
    await f.request('/api/workbook-parts/9',teacher,{count:13},'PUT',400);
    const legacy=await save(await launch(),'legacy bytes',0,'Старое решение');
    const originalFolder=legacy.file.folderId;
    assert.equal(legacy.file.workbookPartPending,false);assert.deepEqual((await pending(student)).items,[]);
    await f.request('/api/workbook-parts/9',teacher,{count:2},'PUT');
    assert.equal((await f.request('/api/workbook-parts/9?studentId=student-a',teacher)).count,2);
    assert.equal((await f.request('/api/workbook-parts/9',f.tokens['student-b'])).count,2);
    assert.equal((await f.request('/api/workbook-parts/9',f.tokens['student-c'])).count,1);
    await f.request('/api/workbook-parts/9?studentId=student-a',f.tokens['teacher-b'],undefined,'GET',403);
    const grant1=await launch(),first=await save(grant1,'part one bytes');
    assert.equal(first.file.workbookPartPending,true);assert.equal(first.file.folderId,originalFolder);
    assert.equal(fs.readFileSync(path.join(f.root,'uploads',first.file.storageName),'utf8'),'part one bytes');
    assert.equal((await pending(student)).items[0].id,first.file.id);
    assert.deepEqual((await pending(teacher)).items,[]);assert.deepEqual((await pending(f.tokens['student-b'])).items,[]);
    await f.request(`/api/workbook-parts/files/${first.file.id}`,f.tokens['student-b'],{partNumber:1},'POST',404);
    await f.request(`/api/workbook-parts/files/${first.file.id}`,f.tokens['teacher-b'],{partNumber:1},'POST',404);
    await f.request(`/api/workbook-parts/files/${first.file.id}`,student,{partNumber:3},'POST',400);
    const selected=await choose(first.file.id,1);
    assert.equal(selected.file.workbookPartPending,false);assert.equal(selected.file.name,'Задание 1.ods');
    const folders=JSON.parse(fs.readFileSync(path.join(f.data,'folders.json')));
    assert.equal(folders.find(folder=>folder.id===selected.file.folderId).parentFolderId,originalFolder);
    assert.equal(selected.file.folderName,'Часть 1');
    const lateTab=await choose(first.file.id,2);assert.equal(lateTab.file.folderId,selected.file.folderId,'a stale second tab cannot move a file already assigned');
    const updated=await save(grant1,'updated part one',first.revision,null);
    assert.equal(updated.file.folderId,selected.file.folderId);assert.equal(updated.file.workbookPartPending,false);
    const grant2=await launch(),second=await save(grant2,'part two bytes');
    assert.equal(second.file.name,first.file.name,'same names in separate parts need no manual suffix');
    const [assigned,simultaneous]=await Promise.all([choose(second.file.id,2),save(grant2,'newest part two',second.revision,null)]);
    assert.equal(assigned.file.workbookPartNumber,2);assert.equal(simultaneous.file.id,second.file.id);
    const savedFiles=JSON.parse(fs.readFileSync(path.join(f.data,'files.json'))),secondFinal=savedFiles.find(file=>file.id===second.file.id);
    assert.equal(secondFinal.folderName,'Часть 2');assert.equal(secondFinal.workbookPartPending,false);
    assert.equal(fs.readFileSync(path.join(f.root,'uploads',secondFinal.storageName),'utf8'),'newest part two');
    const teacherGrant=await launch(teacher),teacherFile=await save(teacherGrant,'teacher work',0,'Разбор учителя');
    assert.equal((await pending(teacher)).items[0].id,teacherFile.file.id);assert.deepEqual((await pending(student)).items,[]);
    await choose(teacherFile.file.id,2,teacher);
    const legacyAfter=await save(await launch(student,legacy.file.id),'legacy update',legacy.revision,null);
    assert.equal(legacyAfter.file.folderId,originalFolder);assert.equal(legacyAfter.file.workbookPartPending,false);
    await f.request('/api/workbook-parts/9',teacher,{count:1},'PUT');
    const oneAgain=await save(await launch(),'one part again',0,'Одна часть');
    assert.equal(oneAgain.file.workbookPartPending,false);assert.equal(oneAgain.file.folderId,originalFolder);
    const continued=await save(grant2,'continued after reducing parts',secondFinal.workbookRevision,null);
    assert.equal(continued.file.folderName,'Часть 2');assert.equal(continued.file.workbookPartNumber,2);
    assert.ok(fs.existsSync(path.join(f.data,'workbook-parts.json')));
  }finally{await f.stop();}
});
