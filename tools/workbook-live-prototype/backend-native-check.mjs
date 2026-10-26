import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from '../../server/groupHomework.fixture.js';
import {BLANK_WORKBOOK_ODS} from '../../server/blankWorkbook.js';

// Runs the upgraded Windows helper against isolated real platform endpoints,
// with actual Excel and Calc. No production account or production data is used.
const directory=path.resolve(process.argv[2]||`output/workbook-live-native-backend-${Date.now()}`);
fs.mkdirSync(directory,{recursive:false});
const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
  const students=JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8'));
  write('students',[...students,{id:'student-d',teacherId:'teacher-a',name:'Индивидуальный тест',code:'student-d-code',grade:'11',createdAt:'2026-10-01T10:00:00Z'}]);
});
try{
  const teacher=f.tokens['teacher-a'],pupil=(await f.request('/api/login','',{code:'student-d-code'})).token;
  const upload=async(route,name,bytes,fields={})=>{
    const data=new FormData();data.append('file',new Blob([bytes]),name);for(const[key,value]of Object.entries(fields))data.append(key,String(value));
    const response=await fetch(f.base+route,{method:'POST',headers:{Authorization:`Bearer ${teacher}`},body:data});assert.ok(response.ok,await response.clone().text());return response.json();
  };
  const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer());
  const source=await upload('/api/files','book.ods',BLANK_WORKBOOK_ODS,{studentId:'student-d',taskNumber:18,category:'class'});
  const set=await f.request('/api/lesson-task-sets',teacher,{name:'Нативная синхронизация',taskNumber:18,tasks:[{images:[image.id],answers:['1','2'],attachments:[{sourceFileId:source.id}]}]},'POST',201);
  const {run}=await f.request('/api/lesson-task-runs',teacher,{room:'board-teacher-a-student-d',setId:set.id,x:0,y:0},'POST',201);
  const target={cardId:run.cards[0].id,assetId:run.cards[0].attachments[0].assetId},route=`/api/lesson-task-runs/${run.id}/live`;
  await f.request(route,teacher,{...target,enabled:true});
  const teacherTicket=(await f.request(route+'/helper',teacher,target,'POST',201)).ticket,pupilTicket=(await f.request(route+'/helper',pupil,target,'POST',201)).ticket;
  const configFile=path.join(directory,'config.json'),report=path.join(directory,'report.json');
  const [teacherEngine,pupilEngine]=(process.argv[3]||'excel-calc').split('-');
  assert.ok(['excel','calc'].includes(teacherEngine)&&['excel','calc'].includes(pupilEngine));
  fs.writeFileSync(configFile,JSON.stringify({origin:f.base,teacherTicket,pupilTicket,directory:path.join(directory,'work'),report,teacherEngine,pupilEngine}));
  const helper=path.resolve(process.env.WORKBOOK_NATIVE_CHECK_EXE||'tools/IvanEge.WorkbookHelper/bin/Release/net9.0-windows/win-x64/IvanEgeWorkbookHelper.exe');
  let output='';const child=spawn(helper,['--live-check',configFile],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',bytes=>{output+=bytes;});child.stderr.on('data',bytes=>{output+=bytes;});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  fs.writeFileSync(path.join(directory,'helper.log'),output);
  const result=JSON.parse(fs.readFileSync(report,'utf8'));
  assert.equal(code,0,JSON.stringify(result));assert.ok(result.ok);
  const current=(await f.request('/api/lesson-task-run?room='+encodeURIComponent(run.room),teacher)).run;
  assert.ok(current.cards[0].attachments[0].solution,'Merged result must appear on the board');
  console.log(JSON.stringify({ok:true,checks:result.checks,solution:current.cards[0].attachments[0].solution.name,directory}));
}finally{await f.stop();}
