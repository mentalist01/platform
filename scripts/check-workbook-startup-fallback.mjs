import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from '../server/groupHomework.fixture.js';
import {BLANK_WORKBOOK_ODS} from '../server/blankWorkbook.js';

const directory=path.resolve(process.argv[2]);
fs.mkdirSync(directory,{recursive:false});
for(const engine of ['excel','calc']) {
const fixture=await createGroupHomeworkFixture(undefined,(write,data)=>{
  const students=JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8'));
  write('students',[...students,{id:'student-fallback',teacherId:'teacher-a',name:'Fallback fixture',code:'student-fallback-code',grade:'11'}]);
});
try {
  const teacher=fixture.tokens['teacher-a'];
  const upload=async(route,name,bytes,fields={})=>{
    const form=new FormData();form.append('file',new Blob([bytes]),name);
    for(const [key,value]of Object.entries(fields))form.append(key,String(value));
    const response=await fetch(fixture.base+route,{method:'POST',headers:{Authorization:'Bearer '+teacher},body:form});
    assert.ok(response.ok,await response.clone().text());return response.json();
  };
  const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:100,channels:4,background:'white'}}).png().toBuffer());
    const source=await upload('/api/files','original.ods',BLANK_WORKBOOK_ODS,{studentId:'student-fallback',taskNumber:9,category:'class'});
    const set=await fixture.request('/api/lesson-task-sets',teacher,{name:'Native startup fallback '+engine,taskNumber:9,tasks:[{images:[image.id],answers:['1'],attachments:[{sourceFileId:source.id}]}]},'POST',201);
    const {run}=await fixture.request('/api/lesson-task-runs',teacher,{room:'board-teacher-a-student-fallback',setId:set.id,x:0,y:0},'POST',201);
    const target={cardId:run.cards[0].id,assetId:run.cards[0].attachments[0].assetId},route='/api/lesson-task-runs/'+run.id+'/live';
    const {ticket}=await fixture.request(route+'/helper',teacher,{...target,start:true},'POST',201);
    const config={origin:fixture.base,teacherTicket:ticket,teacherEngine:engine,directory:path.join(directory,engine),report:path.join(directory,engine+'-report.json'),result:path.join(directory,engine+'-result.json'),startupFallbackCheck:true};
    const configPath=path.join(directory,engine+'-config.json');fs.writeFileSync(configPath,JSON.stringify(config));
    const executable=path.resolve(process.env.WORKBOOK_NATIVE_CHECK_EXE||'tools/IvanEge.WorkbookHelper/bin/Release/net9.0-windows/win-x64/IvanEgeWorkbookHelper.exe');
    const child=spawn(executable,['--live-check',configPath],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',bytes=>{output+=bytes;});child.stderr.on('data',bytes=>{output+=bytes;});
    const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    fs.writeFileSync(path.join(directory,engine+'-helper.log'),output);
    const report=JSON.parse(fs.readFileSync(config.report,'utf8'));
    assert.equal(exit,0,JSON.stringify(report));assert.ok(report.ok);
    const result=JSON.parse(fs.readFileSync(config.result,'utf8'));
    const current=(await fixture.request('/api/lesson-task-run?room='+encodeURIComponent(run.room),teacher)).run;
    const card=current.cards.find(c=>c.id===target.cardId),asset=card.attachments.find(a=>a.assetId===target.assetId);
    assert.ok(asset.live.ordinaryFallback);assert.ok(asset.solution);
    const saved=await fetch(fixture.base+asset.solution.url,{headers:{Authorization:'Bearer '+teacher}});
    assert.ok(saved.ok);assert.equal(crypto.createHash('sha256').update(Buffer.from(await saved.arrayBuffer())).digest('hex'),result.savedHash);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(result.directory,'source.ods'))).digest('hex'),crypto.createHash('sha256').update(BLANK_WORKBOOK_ODS).digest('hex'),'Original source changed');
    const {ticket:next}=await fixture.request(route+'/helper',teacher,{...target,start:true},'POST',201);
    const exchange=await fetch(fixture.base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/1.5.15'},body:JSON.stringify({ticket:next})});
    assert.ok(exchange.ok);assert.equal((await exchange.json()).live,null,'Next open must retain the fallback for this file');
    console.log(JSON.stringify({engine,ok:true,checks:report.checks}));
} finally { await fixture.stop(); }
}
