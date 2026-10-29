import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {eligible,verifiedTransfer} from './archive-maintenance-to-s3.mjs';
const temp=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan100-s3-maint-'));const file=path.join(root,'closed-backup.tar.gz');fs.writeFileSync(file,Buffer.alloc(17*1024*1024+97,23));fs.utimesSync(file,new Date(0),new Date(0));return{root,file,journal:path.join(root,'journal.jsonl')};};
function fake({corrupt=false,failPart=false}={}){
 let body,metadata,aborted=false,privateUpload=false;const parts=[];
 return{get aborted(){return aborted;},get privateUpload(){return privateUpload;},async send(command){const p=command.input;
  switch(command.constructor.name){
   case'HeadObjectCommand':if(!body)throw Object.assign(Error('missing'),{name:'NotFound'});return{ContentLength:body.length,Metadata:metadata};
   case'CreateMultipartUploadCommand':metadata=p.Metadata;privateUpload=p.ACL==='private';return{UploadId:'test'};
   case'UploadPartCommand':if(failPart)throw Error('network failed');assert.equal(p.ContentMD5,createHash('md5').update(p.Body).digest('base64'));parts[p.PartNumber-1]=Buffer.from(p.Body);return{ETag:'part'+p.PartNumber};
   case'CompleteMultipartUploadCommand':assert.equal(p.MultipartUpload.Parts.length,2);body=Buffer.concat(parts);return{};
   case'GetObjectCommand':return{Body:Readable.from([corrupt?Buffer.from('wrong'):body])};
   case'AbortMultipartUploadCommand':aborted=true;return{};
   default:throw Error(command.constructor.name);
  }
 }};
}
test('only closed normal maintenance archive files are eligible',()=>{const d=temp();try{const s=fs.lstatSync(d.file);assert.ok(eligible(d.file,s));assert.ok(!eligible(d.file,{...s,isFile:()=>true,isSymbolicLink:()=>true}));assert.ok(!eligible(d.file,{...s,isFile:()=>true,isSymbolicLink:()=>false,mtimeMs:Date.now()}));assert.ok(!eligible(d.file.replace('.tar.gz','.json'),s));}finally{fs.rmSync(d.root,{recursive:true});}});
test('full remote byte verification and durable recovery journal precede local removal',async()=>{const d=temp(),client=fake();try{const expected=createHash('sha256').update(fs.readFileSync(d.file)).digest('hex');const row=await verifiedTransfer({...d,client,bucket:'test'});assert.equal(row.sha256,expected);assert.equal(row.removedLocal,true);assert.ok(client.privateUpload);assert.ok(!fs.existsSync(d.file));assert.equal(JSON.parse(fs.readFileSync(d.journal)).sha256,expected);}finally{fs.rmSync(d.root,{recursive:true});}});
test('a mismatching downloaded archive leaves original untouched',async()=>{const d=temp();try{await assert.rejects(verifiedTransfer({...d,client:fake({corrupt:true}),bucket:'test'}),/SHA-256/);assert.ok(fs.existsSync(d.file));assert.ok(!fs.existsSync(d.journal));}finally{fs.rmSync(d.root,{recursive:true});}});
test('failed multipart upload is aborted and source remains intact',async()=>{const d=temp(),client=fake({failPart:true});try{await assert.rejects(verifiedTransfer({...d,client,bucket:'test'}),/network/);assert.ok(client.aborted);assert.ok(fs.existsSync(d.file));assert.ok(!fs.existsSync(d.journal));}finally{fs.rmSync(d.root,{recursive:true});}});
