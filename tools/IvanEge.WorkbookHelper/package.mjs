import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const WINDOWS_HELPER_ZIP='IvanEgeWorkbookHelper.zip';
const executableName='IvanEgeWorkbookHelper.exe';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const crcTable=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;};

// Ordinary ZIP/DEFLATE with public filenames, no password, scripts or self-extracting wrapper.
function zip(files){
  const local=[],central=[];let offset=0;
  for(const [filename,data]of files){
    const name=Buffer.from(filename),compressed=deflateRawSync(data,{level:6}),crc=crc32(data);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);h.writeUInt16LE(33,12);
    h.writeUInt32LE(crc,14);h.writeUInt32LE(compressed.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);h.copy(c,8,6,28);c.writeUInt32LE(offset,42);
    local.push(h,name,compressed);central.push(c,name);offset+=h.length+name.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}

export function inspectHelperExecutable(bytes,version){
  if(bytes.length<256||bytes.length>250*1024*1024||bytes.toString('ascii',0,2)!=='MZ')throw Error('Invalid workbook helper executable');
  const pe=bytes.readUInt32LE(0x3c);
  if(pe+160>=bytes.length||bytes.readUInt32LE(pe)!==0x4550)throw Error('Invalid PE header');
  const magic=bytes.readUInt16LE(pe+24);
  if(![0x10b,0x20b].includes(magic))throw Error('Unsupported PE format');
  const certificate=pe+24+(magic===0x20b?112:96)+4*8;
  const certOffset=bytes.readUInt32LE(certificate),certSize=bytes.readUInt32LE(certificate+4);
  if((certOffset===0)!==(certSize===0)||certOffset+certSize>bytes.length)throw Error('Invalid Authenticode table');
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(version)||!bytes.includes(Buffer.from(version+'\0','utf16le')))throw Error('Executable version does not match helper project');
  return{embeddedSignature:certSize>0,verification:certSize>0?'requires-trust-verification':'not-signed'};
}

export async function packageWorkbookHelperWindows(outputDirectory,{executablePath=path.join(root,'public/downloads',executableName)}={}){
  const project=await fs.readFile(new URL('IvanEge.WorkbookHelper.csproj',import.meta.url),'utf8');
  const version=project.match(/<FileVersion>([^<]+)<\/FileVersion>/)?.[1];
  const executable=await fs.readFile(executablePath),authenticode=inspectHelperExecutable(executable,version);
  const instructions=Buffer.from((await fs.readFile(new URL('Download-README.txt',import.meta.url),'utf8')).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n'));
  const executableSha256=sha(executable);
  const release={product:'Иван на сотку — помощник таблиц',version,platform:'windows-x64',website:'https://ivan100.ru/workbook-helper/',executable:executableName,executableSha256,authenticode};
  const bytes=zip([[executableName,executable],['Прочитать.txt',Buffer.concat([Buffer.from([239,187,191]),instructions])],['SHA256SUMS.txt',Buffer.from(`${executableSha256}  ${executableName}\r\n`)]]);
  await fs.mkdir(outputDirectory,{recursive:true});
  await fs.writeFile(path.join(outputDirectory,WINDOWS_HELPER_ZIP),bytes);
  const manifest={...release,archive:WINDOWS_HELPER_ZIP,archiveSha256:sha(bytes),archiveBytes:bytes.length};
  await fs.writeFile(path.join(outputDirectory,'workbook-helper-release.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(outputDirectory,'IvanEgeWorkbookHelper.sha256'),`${executableSha256}  ${executableName}\n${manifest.archiveSha256}  ${WINDOWS_HELPER_ZIP}\n`);
  return manifest;
}
