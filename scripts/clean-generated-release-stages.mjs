import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const digest=(bytes,algorithm='sha256')=>crypto.createHash(algorithm).update(bytes).digest('hex');
const generated=name=>/^(?:assets\/[a-zA-Z0-9_.-]+|downloads\/(?:updates\/)?[a-zA-Z0-9_.-]+|workbook-helper\/index\.html(?:\.gz)?|(?:index\.html|sw-push\.js)(?:\.gz)?)$/.test(name);
export function stageFiles(directory,manifest,tree){
 const files=[],source=path.join(directory,'source'),walk=(dir)=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name),relative=path.relative(source,p).split(path.sep).join('/');
  if(item.isSymbolicLink()){if(relative!=='node_modules'||fs.realpathSync(p)!=='/root/app/node_modules')throw Error('Unrecognized source symlink');files.push({path:p,link:true});}
  else if(item.isDirectory())walk(p);
  else if(item.isFile()){const bytes=fs.readFileSync(p);if(tree.get(relative)!==digest(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes]),'sha1'))throw Error('Source differs from archived Git revision');files.push({path:p,sha256:digest(bytes),bytes:bytes.length});}
  else throw Error('Unexpected source item');
 }};
 if(!/^[0-9a-f]{40}$/.test(manifest.commit)||!manifest.files||Array.isArray(manifest.files))throw Error('Invalid release manifest');
 for(const [name,hash]of Object.entries(manifest.files)){
  if(!generated(name)||!/^[0-9a-f]{64}$/.test(hash))throw Error('Unrecognized release file');
  const p=path.resolve(directory,name);if(!fs.existsSync(p))continue;
  if(fs.realpathSync(p)!==p||!fs.lstatSync(p).isFile())throw Error('Unexpected release symlink');
  const bytes=fs.readFileSync(p);if(digest(bytes)!==hash)throw Error('Staged artifact was modified');files.push({path:p,sha256:hash,bytes:bytes.length});
 }
 if(fs.existsSync(source)){if(fs.realpathSync(source)!==source||!fs.lstatSync(source).isDirectory())throw Error('Invalid source root');walk(source);}
 for(const name of ['frontend.zip','frontend.enc']){const p=path.join(directory,name);if(!fs.existsSync(p))continue;if(fs.realpathSync(p)!==p||!fs.lstatSync(p).isFile())throw Error('Invalid temporary archive');const bytes=fs.readFileSync(p),sha=digest(bytes);if(name.endsWith('.enc')&&sha!==manifest.encryptedSha256)throw Error('Encrypted archive was modified');files.push({path:p,sha256:sha,bytes:bytes.length});}
 return files;
}
export function removeVerifiedFiles(files,journal){
 let bytes=0;
 for(const item of files){
  if(item.link){if(!fs.lstatSync(item.path).isSymbolicLink()||fs.realpathSync(item.path)!=='/root/app/node_modules')throw Error('Source link changed');}
  else{if(!fs.lstatSync(item.path).isFile()||fs.realpathSync(item.path)!==item.path||digest(fs.readFileSync(item.path))!==item.sha256)throw Error('File changed after inventory');}
 }
 // A complete, recoverable inventory is durable before cache removal.
 const fd=fs.openSync(journal,'wx',0o600);try{fs.writeSync(fd,JSON.stringify({at:new Date().toISOString(),files},null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 for(const item of files){fs.unlinkSync(item.path);bytes+=item.bytes||0;}return bytes;
}
function main(){
 if(process.platform!=='linux')throw Error('Run on the production Linux server only');const apply=process.argv.includes('--apply'),root='/root',repo='/root/app';
 const stages=fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name.endsWith('-stage')).map(d=>path.join(root,d.name)).filter(p=>fs.existsSync(path.join(p,'manifest.json'))&&fs.realpathSync(p)===p).sort((a,b)=>fs.statSync(path.join(b,'manifest.json')).mtimeMs-fs.statSync(path.join(a,'manifest.json')).mtimeMs);
 let total=0,count=0;const skipped=[];
 for(const directory of stages.slice(2)){
  if(fs.statSync(path.join(directory,'manifest.json')).mtimeMs>Date.now()-86400000)continue;
  if(fs.existsSync(path.join(directory,'cache-removal.json')))continue;
  try{
   const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),raw=execFileSync('git',['ls-tree','-rz','--full-tree',manifest.commit],{cwd:repo,maxBuffer:16*1024*1024}).toString(),tree=new Map(raw.split('\0').filter(Boolean).map(line=>{const i=line.indexOf('\t');return[line.slice(i+1),line.slice(0,i).split(' ')[2]];}));
   const files=stageFiles(directory,manifest,tree),bytes=files.reduce((n,f)=>n+(f.bytes||0),0);
   if(apply)removeVerifiedFiles(files,path.join(directory,'cache-removal.json'));
   total+=bytes;count++;console.log(JSON.stringify({stage:path.basename(directory),files:files.length,gib:bytes/1073741824,removed:apply}));
  }catch(error){skipped.push({stage:path.basename(directory),reason:error.message});}
 }
 console.log(JSON.stringify({complete:true,mode:apply?'apply':'audit',stages:count,gib:total/1073741824,skipped}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
