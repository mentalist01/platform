import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from '../../server/groupHomework.fixture.js';

// Separate fixture/editor instances only; never touches a production workbook.
const directory=path.resolve(process.argv[2]||`output/workbook-capacity-${Date.now()}`);
fs.mkdirSync(directory,{recursive:false});
const fixture=path.join(directory,'large.xlsx');
execFileSync(process.env.WORKBOOK_NATIVE_CHECK_PYTHON||'python',['-c',`
import sys,zipfile
with zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
 z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
 with z.open('xl/worksheets/sheet1.xml','w') as f:
  f.write(b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>')
  for i in range(1,300002):f.write(('<row r="%d"><c r="A%d"><v>%d</v></c></row>'%(i,i,i)).encode())
  f.write(b'</sheetData></worksheet>')
`,fixture]);
const small=path.join(directory,'small.xlsx');
execFileSync(process.env.WORKBOOK_NATIVE_CHECK_PYTHON||'python',['-c',`
import sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as source,zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as target:
 for entry in source.infolist():
  data=source.read(entry.filename)
  if entry.filename=='xl/worksheets/sheet1.xml':data=b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>'
  target.writestr(entry.filename,data)
`,fixture,small]);
const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
 const students=JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8'));
 write('students',[...students,...['excel-large','excel-grow','calc-large','calc-grow'].map(name=>({id:'student-d-'+name,teacherId:'teacher-a',name:'Capacity '+name,code:'capacity-'+name,grade:'11',createdAt:'2026-10-01T10:00:00Z'}))]);
});
try{
 const teacher=f.tokens['teacher-a'];
 const upload=async(route,name,bytes,fields={})=>{
  const data=new FormData();data.append('file',new Blob([bytes]),name);for(const[key,value]of Object.entries(fields))data.append(key,String(value));
  const response=await fetch(f.base+route,{method:'POST',headers:{Authorization:`Bearer ${teacher}`},body:data});assert.ok(response.ok,await response.clone().text());return response.json();
 };
 const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer());
 const helper=path.resolve(process.env.WORKBOOK_NATIVE_CHECK_EXE||'tools/IvanEge.WorkbookHelper/bin/Release/net9.0-windows/win-x64/IvanEgeWorkbookHelper.exe');
 for(const engine of ['excel','calc'])for(const grow of [false,true]){
  const name=engine+(grow?'-grow':'-large'),work=path.join(directory,name);fs.mkdirSync(work);
  const studentId='student-d-'+name,pupil=(await f.request('/api/login','',{code:'capacity-'+name})).token;
  const source=await upload('/api/files',name+'.xlsx',fs.readFileSync(grow?small:fixture),{studentId,taskNumber:27,category:'class'});
  const set=await f.request('/api/lesson-task-sets',teacher,{name,taskNumber:27,tasks:[{images:[image.id],answers:['1','2'],answerCountOverride:2,attachments:[{sourceFileId:source.id}]}]},'POST',201);
  const room='board-teacher-a-'+studentId;
  const {run}=await f.request('/api/lesson-task-runs',teacher,{room,setId:set.id,x:0,y:0},'POST',201);
  const cardToTest=run.cards.at(-1),target={cardId:cardToTest.id,assetId:cardToTest.attachments[0].assetId};
  let {ticket:teacherTicket}=await f.request(`/api/lesson-task-runs/${run.id}/live/helper`,teacher,{...target,start:true},'POST',201);
  if(engine==='calc')({ticket:teacherTicket}=await f.request(`/api/lesson-task-runs/${run.id}/live/helper`,pupil,{...target},'POST',201));
  const config=path.join(work,'config.json'),report=path.join(work,'report.json'),result=path.join(work,'result.json');
  // Large initial books test row limits; growing books are exercised separately
  // by opening a small workbook in the same editor before adding many cells.
  fs.writeFileSync(config,JSON.stringify({origin:f.base,teacherTicket,directory:path.join(work,'native'),report,result,teacherEngine:engine,capacityCheck:true,grow}));
  const child=spawn(helper,['--live-check',config],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});fs.writeFileSync(path.join(work,'helper.log'),output);
  const checked=JSON.parse(fs.readFileSync(report,'utf8'));assert.equal(code,0,JSON.stringify(checked));assert.ok(checked.ok);
  const saved=JSON.parse(fs.readFileSync(result,'utf8'));
  const current=(await f.request('/api/lesson-task-run?room='+encodeURIComponent(run.room),teacher)).run;
  const card=current.cards.find(c=>c.id===target.cardId),solution=card.attachments.find(a=>a.assetId===target.assetId).solution;
  const download=await fetch(f.base+solution.url,{headers:{Authorization:`Bearer ${teacher}`}});
  assert.ok(download.ok);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),saved.savedHash,'Board must hold the complete latest native save');
  assert.ok(fs.statSync(saved.backup).size>100000,'Complete recovery copy must survive the transition');
  console.log(JSON.stringify({engine,grow,ok:true,checks:checked.checks.length,hash:saved.savedHash,bytes:fs.statSync(saved.backup).size}));
 }
}finally{await f.stop();}
