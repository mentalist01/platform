import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {WebSocket} from 'ws';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {BLANK_WORKBOOK_ODS} from './blankWorkbook.js';

test('column geometry upgrades only idle saved books and fences incompatible helpers',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{const students=JSON.parse(fs.readFileSync(path.join(data,'students.json')));write('students',[...students,{id:'student-d',teacherId:'teacher-a',name:'Test',code:'student-d-code',grade:'11'}]);});let ws;
  try{
    const teacher=f.tokens['teacher-a'];
    const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const[k,v]of Object.entries(fields))form.append(k,v);const r=await fetch(f.base+route,{method:'POST',headers:{Authorization:'Bearer '+teacher},body:form});assert.ok(r.ok,await r.clone().text());return r.json();};
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:100,channels:4,background:'white'}}).png().toBuffer());
    const file=await upload('/api/files','book.ods',BLANK_WORKBOOK_ODS,{studentId:'student-d',taskNumber:'18',category:'class'});
    const set=await f.request('/api/lesson-task-sets',teacher,{name:'Columns',taskNumber:18,tasks:[{images:[image.id],answers:['1','2'],attachments:[{sourceFileId:file.id}]}]},'POST',201);
    const {run}=await f.request('/api/lesson-task-runs',teacher,{room:'board-teacher-a-student-d',setId:set.id,x:0,y:0},'POST',201);
    const target={cardId:run.cards[0].id,assetId:run.cards[0].attachments[0].assetId},route='/api/lesson-task-runs/'+run.id+'/live';
    const open=async(version,status=200)=>{const {ticket}=await f.request(route+'/helper',teacher,{...target,start:true},'POST',201);const r=await fetch(f.base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/'+version},body:JSON.stringify({ticket})});assert.equal(r.status,status,await r.clone().text());return r.json();};
    const legacy=await open('1.5.12');assert.equal(legacy.live.columnsSupported,false);
    const source={sheets:[{id:'sheet1',name:'Sheet1',cells:{}}]};
    const initialized=await fetch(f.base+'/workbook-helper/v1/live/initialize',{method:'POST',headers:{Authorization:'Workbook '+legacy.token,'Content-Type':'application/json'},body:JSON.stringify({book:source,sourceHash:legacy.contentHash})});assert.equal(initialized.status,200);
    ws=new WebSocket(f.base.replace('http','ws')+'/workbook-helper/v1/live/events',{headers:{Authorization:'Workbook '+legacy.token}});await new Promise((resolve,reject)=>{ws.once('message',resolve);ws.once('error',reject);});
    assert.equal((await open('1.5.13')).live.columnsSupported,false,'An older active lesson keeps its existing protocol');
    ws.close();await new Promise(resolve=>ws.once('close',resolve));await new Promise(resolve=>setTimeout(resolve,15500));
    const upgraded=await open('1.5.13');assert.equal(upgraded.live.columnsSupported,true);assert.notEqual(upgraded.live.epoch,legacy.live.epoch);
    const old=await fetch(f.base+'/workbook-helper/v1/live/state',{headers:{Authorization:'Workbook '+legacy.token}});assert.equal(old.status,410);
    const rejected=await open('1.5.12',426);assert.match(rejected.error,/1\.5\.13/);
    assert.equal((await open('1.5.13')).live.epoch,upgraded.live.epoch);
  }finally{ws?.terminate();await f.stop();}
});
