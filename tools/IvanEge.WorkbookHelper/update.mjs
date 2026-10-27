import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const HELPER_UPDATE_PRODUCT='ivan100-workbook-helper-windows-x64';
export const HELPER_UPDATE_MANIFEST='workbook-helper-update.json';
export const helperUpdateFile=version=>`updates/IvanEgeWorkbookHelper-${version}.exe`;

export async function verifyHelperUpdate(envelope,{version,executable,publicKey}={}){
  const bytes=Buffer.isBuffer(envelope)?envelope:Buffer.from(envelope);
  if(bytes.length>16*1024)throw Error('Update manifest too large');
  const trusted=publicKey??JSON.parse(await fs.readFile(new URL('update-public-key.json',import.meta.url),'utf8')).publicKeySpkiBase64;
  const key=crypto.createPublicKey({key:Buffer.from(trusted,'base64'),type:'spki',format:'der'});
  const signed=JSON.parse(bytes),payload=Buffer.from(signed.payload,'base64');
  if(!crypto.verify('sha256',payload,key,Buffer.from(signed.signature,'base64')))throw Error('Invalid update signature');
  const release=JSON.parse(payload);
  if(release.schema!==1||release.product!==HELPER_UPDATE_PRODUCT||!/^\d{1,4}\.\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(release.version)
    ||release.url!==`https://ivan100.ru/downloads/${helperUpdateFile(release.version)}`||!/^[a-f0-9]{64}$/.test(release.sha256)
    ||!Number.isSafeInteger(release.bytes)||release.bytes<256||release.bytes>250*1024*1024)throw Error('Invalid update release');
  if(version&&release.version!==version)throw Error('Update version does not match helper build');
  if(executable&&(release.bytes!==executable.length||release.sha256!==crypto.createHash('sha256').update(executable).digest('hex')))throw Error('Update hash does not match helper build');
  return release;
}

export async function signHelperUpdate(keyPath,{executablePath=path.join(root,'public/downloads/IvanEgeWorkbookHelper.exe'),output=path.join(root,'public/downloads',HELPER_UPDATE_MANIFEST)}={}){
  const project=await fs.readFile(new URL('IvanEge.WorkbookHelper.csproj',import.meta.url),'utf8');
  const version=project.match(/<FileVersion>([^<]+)<\/FileVersion>/)?.[1];
  const executable=await fs.readFile(executablePath);
  const payload=Buffer.from(JSON.stringify({schema:1,product:HELPER_UPDATE_PRODUCT,version,url:`https://ivan100.ru/downloads/${helperUpdateFile(version)}`,sha256:crypto.createHash('sha256').update(executable).digest('hex'),bytes:executable.length}));
  const key=crypto.createPrivateKey(await fs.readFile(keyPath));
  const envelope=Buffer.from(JSON.stringify({payload:payload.toString('base64'),signature:crypto.sign('sha256',payload,key).toString('base64')},null,2)+'\n');
  await verifyHelperUpdate(envelope,{version,executable});
  await fs.writeFile(output,envelope);
  return {version,manifest:output};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const keyAt=process.argv.indexOf('--key');
  if(keyAt<0||!process.argv[keyAt+1])throw Error('Usage: node tools/IvanEge.WorkbookHelper/update.mjs --key <private-key-outside-repository>');
  console.log(JSON.stringify(await signHelperUpdate(process.argv[keyAt+1])));
}
