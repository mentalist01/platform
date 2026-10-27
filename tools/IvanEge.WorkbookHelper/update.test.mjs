import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyHelperUpdate,HELPER_UPDATE_PRODUCT,helperUpdateFile} from './update.mjs';

const {privateKey,publicKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const trusted=publicKey.export({type:'spki',format:'der'}).toString('base64');
const executable=Buffer.alloc(1024,7),version='1.5.2.0';
const release={schema:1,product:HELPER_UPDATE_PRODUCT,version,url:`https://ivan100.ru/downloads/${helperUpdateFile(version)}`,sha256:crypto.createHash('sha256').update(executable).digest('hex'),bytes:executable.length};
const sign=(data,key=privateKey)=>{const payload=Buffer.from(JSON.stringify(data));return Buffer.from(JSON.stringify({payload:payload.toString('base64'),signature:crypto.sign('sha256',payload,key).toString('base64')}));};

test('update authentication binds the exact product, version and executable bytes',async()=>{
  assert.deepEqual(await verifyHelperUpdate(sign(release),{publicKey:trusted,version,executable}),release);
  await assert.rejects(verifyHelperUpdate(sign(release),{publicKey:trusted,version:'1.5.3.0',executable}),/version/);
  await assert.rejects(verifyHelperUpdate(sign(release),{publicKey:trusted,version,executable:Buffer.alloc(1024,8)}),/hash/);
});
test('a modified payload, unknown signing key or unsigned envelope is rejected',async()=>{
  const envelope=JSON.parse(sign(release));envelope.payload=Buffer.from(JSON.stringify({...release,sha256:'0'.repeat(64)})).toString('base64');
  await assert.rejects(verifyHelperUpdate(Buffer.from(JSON.stringify(envelope)),{publicKey:trusted}),/signature/);
  const stranger=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey;
  await assert.rejects(verifyHelperUpdate(sign(release,stranger),{publicKey:trusted}),/signature/);
  await assert.rejects(verifyHelperUpdate(Buffer.from(JSON.stringify(release)),{publicKey:trusted}));
});
test('even a signed manifest cannot redirect execution or request unbounded downloads',async()=>{
  for(const patch of [
    {product:'another-program'},{schema:2},{version:'../installer'},
    {url:'http://ivan100.ru/downloads/update.exe'},
    {url:'https://ivan100.ru@evil.example/update.exe'},
    {url:release.url+'?redirect=https://evil.example'},
    {url:'https://ivan100.ru/uploads/student.exe'},
    {bytes:-1},{bytes:251*1024*1024},{sha256:'0'.repeat(63)},
  ])await assert.rejects(verifyHelperUpdate(sign({...release,...patch}),{publicKey:trusted}),/Invalid update release/);
  await assert.rejects(verifyHelperUpdate(Buffer.alloc(16385),{publicKey:trusted}),/too large/);
});
