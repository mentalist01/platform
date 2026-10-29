import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand,CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';

const SOURCE='/root/ivan100-maintenance-archives',PREFIX='maintenance-archives/verified-v1/';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export async function digest(stream){const h=crypto.createHash('sha256');for await(const chunk of stream)h.update(chunk);return h.digest('hex');}
export function eligible(file,stat,now=Date.now()){
 return /^[-a-zA-Z0-9_.]+\.(?:tar\.gz|tgz)$/.test(path.basename(file))&&stat.isFile()&&!stat.isSymbolicLink()&&stat.mtimeMs<now-24*3600000;
}
export async function verifiedTransfer({file,client,bucket,journal,now=Date.now,keepLocal=false}){
 const before=fs.lstatSync(file);if(!eligible(file,before,now()))throw Error('Not a closed maintenance archive');
 const sha=await digest(fs.createReadStream(file)),name=path.basename(file),key=PREFIX+sha+'/'+name;
 let exists=false;
 try{const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));if(head.ContentLength!==before.size||head.Metadata?.sha256!==sha)throw Error('Stored object differs');exists=true;}catch(e){if(e.$metadata?.httpStatusCode!==404&&e.name!=='NotFound'&&e.name!=='NoSuchKey')throw e;}
 if(!exists){
  const created=await client.send(new CreateMultipartUploadCommand({Bucket:bucket,Key:key,ACL:'private',ContentType:'application/gzip',Metadata:{sha256:sha,'source-name':name}}));
  const id=created.UploadId;if(!id)throw Error('No multipart upload ID');
  const handle=await fs.promises.open(file,'r'),parts=[];let completed=false;
  try{
   const size=16*1024*1024;
   for(let offset=0,n=1;offset<before.size;offset+=size,n++){
    const body=Buffer.alloc(Math.min(size,before.size-offset));let read=0;
    while(read<body.length){const r=await handle.read(body,read,body.length-read,offset+read);if(!r.bytesRead)throw Error('Source shortened');read+=r.bytesRead;}
    const r=await client.send(new UploadPartCommand({Bucket:bucket,Key:key,UploadId:id,PartNumber:n,Body:body,ContentLength:body.length,ContentMD5:crypto.createHash('md5').update(body).digest('base64')}));
    if(!r.ETag)throw Error('Missing part receipt');parts.push({ETag:r.ETag,PartNumber:n});
   }
   await client.send(new CompleteMultipartUploadCommand({Bucket:bucket,Key:key,UploadId:id,MultipartUpload:{Parts:parts}}));completed=true;
  }finally{await handle.close();if(!completed)await client.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:key,UploadId:id})).catch(()=>{});}
 }
 const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));if(head.ContentLength!==before.size||head.Metadata?.sha256!==sha)throw Error('Uploaded metadata mismatch');
 const remote=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));if(await digest(remote.Body)!==sha)throw Error('Downloaded archive SHA-256 mismatch; source retained');
 const after=fs.lstatSync(file);if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Error('Source changed; source retained');
 const row={at:new Date(now()).toISOString(),name,bytes:before.size,sha256:sha,bucket,key,verified:true};
 const fd=fs.openSync(journal,'a',0o600);try{fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 if(!keepLocal)fs.unlinkSync(file);
 return {...row,removedLocal:!keepLocal};
}
async function main(){
 if(process.platform!=='linux')throw Error('Production maintenance runs on the Linux server only');
 const root=fs.realpathSync(SOURCE);if(root!==SOURCE)throw Error('Unexpected archive root');
 const args=process.argv.slice(2),apply=args.includes('--apply');
 const env=JSON.parse(execFileSync('pm2',['jlist'],{maxBuffer:8*1024*1024})).find(p=>p.name==='ege')?.pm2_env;
 if(!env)throw Error('Platform process not found');
 const config={endpoint:env.LESSON_REPLAY_S3_ENDPOINT,region:env.LESSON_REPLAY_S3_REGION||'ru-1',bucket:env.LESSON_REPLAY_S3_BUCKET,accessKeyId:env.LESSON_REPLAY_S3_ACCESS_KEY_ID,secretAccessKey:env.LESSON_REPLAY_S3_SECRET_ACCESS_KEY};
 if(new URL(config.endpoint).protocol!=='https:'||!config.bucket||!config.accessKeyId||!config.secretAccessKey)throw Error('S3 is not configured');
 const client=new S3Client({...config,credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
 const journal=path.join(root,'s3-verified-transfers.jsonl');
 if(args.includes('--restore')){
  const name=args[args.indexOf('--restore')+1];if(!/^[-a-zA-Z0-9_.]+\.(?:tar\.gz|tgz)$/.test(name))throw Error('Invalid archive name');
  const row=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line)).findLast(row=>row.name===name&&row.verified);
  if(!row||row.bucket!==config.bucket||!row.key.startsWith(PREFIX))throw Error('No verified recovery record');
  const destination=path.join(root,name),fd=fs.openSync(destination,'wx',0o600);let ok=false;
  try{const object=await client.send(new GetObjectCommand({Bucket:row.bucket,Key:row.key})),h=crypto.createHash('sha256');let bytes=0;for await(const chunk of object.Body){fs.writeSync(fd,chunk);h.update(chunk);bytes+=chunk.length;}fs.fsyncSync(fd);if(bytes!==row.bytes||h.digest('hex')!==row.sha256)throw Error('Recovery checksum mismatch');ok=true;}finally{fs.closeSync(fd);if(!ok)fs.unlinkSync(destination);}
  console.log(JSON.stringify({restored:name,bytes:row.bytes}));return;
 }
 const files=fs.readdirSync(root).map(n=>path.join(root,n)).filter(p=>eligible(p,fs.lstatSync(p))).sort((a,b)=>fs.statSync(a).size-fs.statSync(b).size);
 let total=0,continuation;
 do{const page=await client.send(new ListObjectsV2Command({Bucket:config.bucket,ContinuationToken:continuation}));for(const object of page.Contents||[])total+=object.Size||0;continuation=page.IsTruncated?page.NextContinuationToken:undefined;}while(continuation);
 const bytes=files.reduce((n,p)=>n+fs.statSync(p).size,0);console.log(JSON.stringify({mode:apply?'apply':'audit',bucket:config.bucket,existingS3GiB:total/1073741824,candidates:files.length,archiveGiB:bytes/1073741824}));
 if(total+bytes>85*1024**3)throw Error('Conservative 85 GiB capacity guard exceeded');if(!apply)return;
 const lock=path.join(root,'.s3-transfer.lock');
 if(fs.existsSync(lock)){
  const pid=Number(fs.readFileSync(lock,'utf8'));if(!Number.isInteger(pid)||pid<=1)throw Error('Invalid maintenance lock');
  try{process.kill(pid,0);throw Error('Archive transfer is already running');}catch(e){if(e.code!=='ESRCH')throw e;}
  fs.unlinkSync(lock);
 }
 const lockFd=fs.openSync(lock,'wx',0o600);fs.writeSync(lockFd,String(process.pid));
 try{
  // A synthetic probe verifies public access is denied before any backup upload.
  const probe=PREFIX+'privacy-probe-'+crypto.randomUUID(),body=crypto.randomBytes(64);
  try{
   await client.send(new PutObjectCommand({Bucket:config.bucket,Key:probe,Body:body,ACL:'private',ContentMD5:crypto.createHash('md5').update(body).digest('base64')}));
   const url=new URL(config.endpoint);url.pathname='/'+config.bucket+'/'+probe;
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});await response.body?.cancel();if(![403,404].includes(response.status))throw Error('Anonymous access not denied');
   const result=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:probe}));if(await digest(result.Body)!==hash(body))throw Error('Probe read failed');
  }finally{await client.send(new DeleteObjectCommand({Bucket:config.bucket,Key:probe}));}
  let freed=0,count=0;
  for(const file of files){const row=await verifiedTransfer({file,client,bucket:config.bucket,journal});freed+=row.bytes;count++;console.log(JSON.stringify({name:row.name,verified:true,freedGiB:freed/1073741824,done:count,total:files.length}));}
  console.log(JSON.stringify({complete:true,freedGiB:freed/1073741824,archives:count}));
 }finally{fs.closeSync(lockFd);fs.unlinkSync(lock);client.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(JSON.stringify({error:e.name,message:e.message}));process.exitCode=1;});
