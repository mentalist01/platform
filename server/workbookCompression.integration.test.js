import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { BLANK_WORKBOOK_ODS } from './blankWorkbook.js';

test('old FODS solution can be saved as ODS with correct extension, revision and unchanged source', {timeout:60000},async()=>{
 const original=Buffer.from('<office:document/>');
 const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
  // Upload fixture stays inside the fixture root and uses the existing file-binding API.
  const upload=data.replace(/data$/, 'uploads');
  // Fixture creation runs in a temporary directory; no production files are touched.
  // The source content is intentionally small; this test checks identity and upload format rules.
  write('files',[{id:'legacy',studentId:'student-a',taskNumber:26,category:'class',name:'Таблица.fods',storageName:'legacy.fods',url:'/uploads/legacy.fods',sizeBytes:original.length,createdAt:new Date().toISOString()}]);
  // Filesystem writes are synchronous seed operations before the server starts.
  seedUpload(upload,original);
 });
 try{
  const teacher=f.tokens['teacher-a'];
  const launched=await f.request('/api/workbook-helper/launch',teacher,{studentId:'student-a',fileId:'legacy'} , 'POST',201);
  const grant=await f.request('/workbook-helper/v1/exchange','',{ticket:launched.ticket});
  const send=async(revision,name='Таблица.ods')=>{
   const body=new FormData();body.append('file',new Blob([BLANK_WORKBOOK_ODS]),name);body.append('revision',String(revision));
   body.append('contentHash',crypto.createHash('sha256').update(BLANK_WORKBOOK_ODS).digest('hex'));body.append('solutionName','Моё решение');
   return fetch(f.base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:'Workbook '+grant.token},body});
  };
  const response=await send(0);assert.equal(response.status,200,await response.clone().text());
  const saved=await response.json();assert.equal(saved.file.name,'Моё решение.ods');assert.equal(saved.revision,1);
  const again=await send(1);assert.equal(again.status,200);assert.equal((await again.json()).unchanged,true);
  assert.equal((await send(1,'Таблица.xlsx')).status,415);
  const files=readFiles(f.data);assert.equal(files.find(x=>x.id==='legacy').name,'Таблица.fods');
 }finally{await f.stop();}
});
import fs from 'node:fs';import path from 'node:path';
function seedUpload(dir,bytes){fs.writeFileSync(path.join(dir,'legacy.fods'),bytes);}
function readFiles(dir){return JSON.parse(fs.readFileSync(path.join(dir,'files.json'),'utf8'));}
