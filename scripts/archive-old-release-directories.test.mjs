import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {releaseKind,chooseDirectories,inventory,assertUnchanged,assertRestored,recoveryRecord,storeRecoveryRecord} from './archive-old-release-directories.mjs';
import {eligible} from './archive-maintenance-to-s3.mjs';
const DAY=86400000;
test('only recognizable release directories are eligible',()=>{
 for(const name of ['app','platform-data','platform-uploads','ivan100-maintenance-archives','platform-collab','../old-stage','nested/old-backup','app;rm-stage'])assert.equal(releaseKind(name),null,name);
 assert.equal(releaseKind('python-drafts-chapters-stage-20261014'),'stage');
 assert.equal(releaseKind('workbook-borders-20261029-backup'),'backup');
 assert.equal(releaseKind('dist.before-python-20260926'),'backup');
});
test('retains two latest of each kind, recent directories and symbolic links',()=>{
 const now=20*DAY,rows=['stage','backup'].flatMap(kind=>[1,2,3,4].map(i=>({name:`release-${i}-${kind}`,mtimeMs:i*DAY})));
 rows.push({name:'fresh-stage',mtimeMs:now-1000},{name:'linked-backup',mtimeMs:DAY,link:true},{name:'platform-data',mtimeMs:DAY});
 const chosen=chooseDirectories(rows,{now});
 assert.deepEqual(chosen.map(x=>x.name),['release-1-backup','release-1-stage','release-2-backup','release-2-stage','release-3-stage']);
 assert.throws(()=>chooseDirectories(rows,{now,keep:1}));
});
test('source content changed with preserved size and time blocks removal',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan100-archive-check-'));
 try{
  const file=path.join(root,'data'),time=new Date('2026-01-01T00:00:00Z');fs.writeFileSync(file,'one');fs.utimesSync(file,time,time);
  const before=inventory(root);fs.writeFileSync(file,'two');fs.utimesSync(file,time,time);
  assert.throws(()=>assertUnchanged(root,before),/changed/);
 }finally{fs.rmSync(root,{recursive:true});}
});
test('actual restored content is compared independently of inode and creation time',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan100-archive-restore-'));
 try{
  const a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a);fs.mkdirSync(b);fs.writeFileSync(path.join(a,'file'),'original');fs.writeFileSync(path.join(b,'file'),'original');
  const source=inventory(a);assertRestored(b,source);
  fs.writeFileSync(path.join(b,'file'),'corrupt!');assert.throws(()=>assertRestored(b,source),/differs/);
 }finally{fs.rmSync(root,{recursive:true});}
});
test('later deletion receipt cannot hide the full recovery inventory',()=>{
 const full={directory:'old-backup',verified:true,phase:'verified-before-removal',inventory:[{name:'file'}]};
 const deleted={directory:'old-backup',verified:true,phase:'removed-local'};
 assert.equal(recoveryRecord([full,deleted],'old-backup'),full);
 assert.equal(recoveryRecord([deleted],'old-backup'),undefined);
});
test('nightly transfer still excludes fresh files; newly closed archive needs explicit zero age',()=>{
 const now=Date.now(),stat={isFile:()=>true,isSymbolicLink:()=>false,mtimeMs:now-1000};
 assert.equal(eligible('old.tar.gz',stat,now),false);
 assert.equal(eligible('old.tar.gz',stat,now,0),true);
 assert.equal(eligible('old.tar.gz',stat,now,-1),false);
});
test('recovery inventory is private and its complete readback must match before deletion',async()=>{
 const row={directory:'old-stage',bucket:'ivan100-lesson-recordings',key:'maintenance-archives/verified-v1/hash/file.tar.gz',inventory:[{name:'file',sha256:'abc'}]},calls=[];let body;
 const client={send:async command=>{calls.push(command.input);if(command.constructor.name==='PutObjectCommand'){assert.equal(command.input.ACL,'private');body=command.input.Body;return {};}return {Body:Readable.from([body])};}};
 await storeRecoveryRecord(row,client);
 assert.equal(calls[0].Key,row.key+'.inventory.json');assert.equal(calls[1].Key,calls[0].Key);
 const corrupt={send:async command=>command.constructor.name==='PutObjectCommand'?{}:{Body:Readable.from([Buffer.from('corrupt')])}};
 await assert.rejects(storeRecoveryRecord(row,corrupt),/checksum mismatch/);
});
