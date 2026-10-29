import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {S3Client,GetObjectCommand,PutObjectCommand,DeleteObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';
import {digest,verifiedTransfer} from './archive-maintenance-to-s3.mjs';

const ROOT='/root',ARCHIVES='/root/ivan100-maintenance-archives';
const JOURNAL='/root/ivan100-release-directory-transfers.jsonl';
const DAY=86400000;
export function releaseKind(name){
 if(!/^[-a-zA-Z0-9_.]+$/.test(name)||['app','platform-data','platform-uploads','ivan100-maintenance-archives'].includes(name))return null;
 if(/(?:^|-)backup(?:-|$)/.test(name)||/^dist\.before-/.test(name))return 'backup';
 if(/(?:^|-)stage(?:-|$)/.test(name))return 'stage';
 return null;
}
export function chooseDirectories(rows,{now=Date.now(),keep=2}={}){
 if(!Number.isInteger(keep)||keep<2)throw Error('At least two local releases must be retained');
 const retained=new Set();
 for(const kind of ['stage','backup']){
  const sorted=rows.filter(r=>releaseKind(r.name)===kind&&!r.link).sort((a,b)=>b.mtimeMs-a.mtimeMs||a.name.localeCompare(b.name));
  sorted.slice(0,keep).forEach(r=>retained.add(r.name));
 }
 return rows.filter(r=>releaseKind(r.name)&&!r.link&&!retained.has(r.name)&&r.mtimeMs<now-DAY).sort((a,b)=>a.name.localeCompare(b.name));
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function inventory(directory){
 if(fs.realpathSync(directory)!==directory||!fs.lstatSync(directory).isDirectory())throw Error('Invalid directory');
 const result=[];
 function walk(file,name){
  const s=fs.lstatSync(file),common={name,mode:s.mode&0o7777,mtimeMs:s.mtimeMs,dev:s.dev,ino:s.ino};
  if(s.isSymbolicLink())result.push({...common,type:'link',target:fs.readlinkSync(file)});
  else if(s.isFile())result.push({...common,type:'file',size:s.size,sha256:sha(fs.readFileSync(file))});
  else if(s.isDirectory()){result.push({...common,type:'directory'});for(const n of fs.readdirSync(file).sort())walk(path.join(file,n),name?name+'/'+n:n);}
  else throw Error('Special file in release directory');
 }
 walk(directory,'');return result;
}
export function assertUnchanged(directory,expected){
 const actual=inventory(directory);
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Release changed since archive inventory');
 return actual;
}
export function assertRestored(directory,expected){
 const content=rows=>rows.map(({name,type,mode,target,size,sha256})=>({name,type,mode,target,size,sha256}));
 if(JSON.stringify(content(inventory(directory)))!==JSON.stringify(content(expected)))throw Error('Restored directory differs');
}
export function recoveryRecord(rows,name){return rows.findLast(row=>row.directory===name&&row.verified&&Array.isArray(row.inventory));}
export async function storeRecoveryRecord(row,client){
 const body=Buffer.from(JSON.stringify(row)),hash=sha(body),key=row.key+'.inventory.json';
 await client.send(new PutObjectCommand({Bucket:row.bucket,Key:key,Body:body,ACL:'private',ContentType:'application/json',ContentMD5:crypto.createHash('md5').update(body).digest('base64'),Metadata:{sha256:hash}}));
 const r=await client.send(new GetObjectCommand({Bucket:row.bucket,Key:key}));
 if(await digest(r.Body)!==hash)throw Error('Remote recovery inventory checksum mismatch');
}
async function remoteRecoveryRecord(name,client,bucket){
 const found=[];let continuation;
 do{
  const page=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:'maintenance-archives/verified-v1/',ContinuationToken:continuation}));
  for(const o of page.Contents||[])if(o.Key?.includes('/release-directory__'+name+'__')&&o.Key.endsWith('.tar.gz.inventory.json'))found.push(o);
  continuation=page.IsTruncated?page.NextContinuationToken:undefined;
 }while(continuation);
 found.sort((a,b)=>Number(b.LastModified)-Number(a.LastModified));
 for(const o of found){const r=await client.send(new GetObjectCommand({Bucket:bucket,Key:o.Key})),body=await r.Body.transformToByteArray();if(sha(body)!==r.Metadata?.sha256)throw Error('Recovery inventory checksum mismatch');const row=JSON.parse(Buffer.from(body));if(row.directory===name&&row.verified&&Array.isArray(row.inventory))return row;}
 return null;
}
function runtimeUses(directory){
 for(const name of fs.readdirSync('/proc')){
  if(!/^\d+$/.test(name))continue;
  const root='/proc/'+name;
  try{const cmd=fs.readFileSync(root+'/cmdline','utf8').split('\0');if(cmd.some(arg=>arg===directory||arg.startsWith(directory+'/')))return true;}catch{}
  for(const part of ['cwd','exe'])try{const p=fs.readlinkSync(root+'/'+part);if(p===directory||p.startsWith(directory+'/'))return true;}catch{}
  let entries=[];try{entries=fs.readdirSync(root+'/fd');}catch{}
  for(const fd of entries)try{const p=fs.readlinkSync(root+'/fd/'+fd);if(p===directory||p.startsWith(directory+'/'))return true;}catch{}
 }
 return false;
}
const run=(exe,args)=>new Promise((resolve,reject)=>{let error='';const child=spawn(exe,args,{stdio:['ignore','ignore','pipe']});child.stderr.on('data',x=>error=(error+x).slice(-2500));child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(exe+' failed: '+error)));});
function appendJournal(row){const fd=fs.openSync(JOURNAL,'a',0o600);try{fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function validateSource(directory){if(path.dirname(directory)!==ROOT||!releaseKind(path.basename(directory))||fs.realpathSync(directory)!==directory)throw Error('Protected source path');}
function configuration(){
 const env=JSON.parse(execFileSync('pm2',['jlist'],{maxBuffer:8*1024*1024})).find(p=>p.name==='ege')?.pm2_env;
 if(!env)throw Error('Running platform not found');
 const config={endpoint:env.LESSON_REPLAY_S3_ENDPOINT,region:env.LESSON_REPLAY_S3_REGION||'ru-1',bucket:env.LESSON_REPLAY_S3_BUCKET,accessKeyId:env.LESSON_REPLAY_S3_ACCESS_KEY_ID,secretAccessKey:env.LESSON_REPLAY_S3_SECRET_ACCESS_KEY};
 if(new URL(config.endpoint).protocol!=='https:'||config.bucket!=='ivan100-lesson-recordings'||!config.accessKeyId||!config.secretAccessKey)throw Error('Unexpected S3 configuration');
 return config;
}
async function privateCheck(client,config){
 const key='maintenance-archives/verified-v1/privacy-probe-'+crypto.randomUUID(),body=crypto.randomBytes(48);
 try{
  await client.send(new PutObjectCommand({Bucket:config.bucket,Key:key,Body:body,ACL:'private'}));
  const url=new URL(config.endpoint);url.pathname='/'+config.bucket+'/'+key;
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});await response.body?.cancel();
  if(![403,404].includes(response.status))throw Error('Archive privacy check failed');
  const r=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:key}));if(await digest(r.Body)!==sha(body))throw Error('S3 readback failed');
 }finally{await client.send(new DeleteObjectCommand({Bucket:config.bucket,Key:key}));}
}
async function restore(row,client,destination){
 if(row.bucket!=='ivan100-lesson-recordings'||!row.key.startsWith('maintenance-archives/verified-v1/')||!/^[-a-zA-Z0-9_.]+$/.test(row.directory))throw Error('Invalid recovery record');
 if(fs.existsSync(destination))throw Error('Recovery destination already exists');
 fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
 const temporary=fs.mkdtempSync(path.join(path.dirname(destination),'.restore-'));
 const file=path.join(temporary,'release.tar.gz');
 const fd=fs.openSync(file,'wx',0o600),h=crypto.createHash('sha256');let count=0;
 try{
  const r=await client.send(new GetObjectCommand({Bucket:row.bucket,Key:row.key}));
  for await(const chunk of r.Body){fs.writeSync(fd,chunk);h.update(chunk);count+=chunk.length;}
  fs.fsyncSync(fd);
 }finally{fs.closeSync(fd);}
 if(count!==row.bytes||h.digest('hex')!==row.sha256)throw Error('Recovery archive checksum mismatch');
 await run('tar',['-xzf',file,'--no-same-owner','-C',temporary]);
 assertRestored(path.join(temporary,row.directory),row.inventory);
 fs.renameSync(path.join(temporary,row.directory),destination);
 fs.rmSync(temporary,{recursive:true});
 return destination;
}
async function main(){
 if(process.platform!=='linux')throw Error('Production Linux server only');
 const config=configuration(),client=new S3Client({...config,credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
 const args=process.argv.slice(2);
 if(args.includes('--sync-index')){
  const rows=fs.readFileSync(JOURNAL,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)),latest=new Map();
  for(const row of rows)if(row.verified&&Array.isArray(row.inventory))latest.set(row.directory,row);
  let count=0;for(const row of latest.values()){await storeRecoveryRecord(row,client);count++;}
  console.log(JSON.stringify({recoveryInventoriesStored:count,verified:true}));client.destroy();return;
 }
 if(args.includes('--restore')){
  const name=args[args.indexOf('--restore')+1];if(!releaseKind(name))throw Error('Invalid release name');
  const rows=fs.existsSync(JOURNAL)?fs.readFileSync(JOURNAL,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
  const row=(!args.includes('--remote-index')&&recoveryRecord(rows,name))||await remoteRecoveryRecord(name,client,config.bucket);
  if(!row)throw Error('No recovery record');
  const destination='/root/ivan100-release-restore/'+name;await restore(row,client,destination);console.log(JSON.stringify({restored:destination,verified:true}));return;
 }
 const rows=fs.readdirSync(ROOT,{withFileTypes:true}).filter(e=>e.isDirectory()&&releaseKind(e.name)).map(e=>({name:e.name,mtimeMs:fs.statSync(path.join(ROOT,e.name)).mtimeMs,link:false}));
 const limit=args.includes('--limit')?Number(args[args.indexOf('--limit')+1]):Infinity;
 if(limit!==Infinity&&(!Number.isInteger(limit)||limit<1))throw Error('Invalid directory limit');
 const chosen=chooseDirectories(rows).slice(0,limit),apply=args.includes('--apply');
 console.log(JSON.stringify({mode:apply?'apply':'audit',retained:rows.filter(r=>!chosen.includes(r)).map(r=>r.name),candidates:chosen.map(r=>r.name)}));
 if(!apply)return;
 const lock='/root/.ivan100-old-releases.lock';let lockFd;
 if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));if(!Number.isInteger(pid)||pid<2)throw Error('Invalid archive lock');try{process.kill(pid,0);throw Error('Another release archive process is running');}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}
 lockFd=fs.openSync(lock,'wx',0o600);fs.writeSync(lockFd,String(process.pid));
 let removed=0,sourceBytes=0,archiveBytes=0;
 try{
  await privateCheck(client,config);
  let existing=0,continuation;do{const page=await client.send(new ListObjectsV2Command({Bucket:config.bucket,ContinuationToken:continuation}));for(const o of page.Contents||[])existing+=o.Size||0;continuation=page.IsTruncated?page.NextContinuationToken:undefined;}while(continuation);
  for(const {name}of chosen){
   const directory=path.join(ROOT,name);validateSource(directory);
   const before=inventory(directory),bytes=before.reduce((n,r)=>n+(r.size||0),0);
   if(bytes<1024*1024||before.some(r=>r.mtimeMs>Date.now()-DAY)||runtimeUses(directory)){console.log(JSON.stringify({skipped:name,reason:'small, recent or in use'}));continue;}
   const fingerprint=sha(Buffer.from(JSON.stringify(before))),base='release-directory__'+name+'__'+fingerprint.slice(0,16)+'.tar.gz',archive=path.join(ARCHIVES,base);
   if(existing+bytes>85*1024**3)throw Error('Conservative S3 capacity limit');
   if(!fs.existsSync(archive)){
    const temporary=archive+'.partial';if(fs.existsSync(temporary))throw Error('Inspect unfinished local archive first');
    await run('tar',['-czf',temporary,'-C',ROOT,'--',name]);fs.chmodSync(temporary,0o600);
    await run('tar',['-dzf',temporary,'-C',ROOT]);assertUnchanged(directory,before);fs.renameSync(temporary,archive);
   }else{await run('tar',['-dzf',archive,'-C',ROOT]);assertUnchanged(directory,before);}
   const uploaded=await verifiedTransfer({file:archive,client,bucket:config.bucket,journal:path.join(ARCHIVES,'s3-verified-transfers.jsonl'),keepLocal:true,minimumAgeMs:0});
   const row={...uploaded,directory:name,sourceBytes:bytes,inventory:before,verified:true};
   await storeRecoveryRecord(row,client);
   // Exercise an actual download and extraction before relying on S3 alone.
   const recovery='/root/ivan100-release-restore/check-'+crypto.randomUUID();await restore(row,client,recovery);
   assertRestored(recovery,before);fs.rmSync(recovery,{recursive:true});
   assertUnchanged(directory,before);if(runtimeUses(directory))throw Error('Release directory became active');
   appendJournal({...row,phase:'verified-before-removal'});
   validateSource(directory);fs.rmSync(directory,{recursive:true});fs.unlinkSync(archive);
   appendJournal({...row,inventory:undefined,phase:'removed-local'});
   removed++;sourceBytes+=bytes;archiveBytes+=uploaded.bytes;existing+=uploaded.bytes;
   console.log(JSON.stringify({removed:name,verified:true,restorationVerified:true,done:removed,sourceGB:sourceBytes/1e9,archiveGB:archiveBytes/1e9}));
  }
  console.log(JSON.stringify({complete:true,directories:removed,sourceGB:sourceBytes/1e9,archiveGB:archiveBytes/1e9}));
 }finally{if(lockFd!==undefined)fs.closeSync(lockFd);if(fs.existsSync(lock))fs.unlinkSync(lock);client.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(JSON.stringify({error:e.name,message:e.message}));process.exitCode=1;});
