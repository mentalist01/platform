import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
export function readOdsPart(bytes, wanted) {
  for(let offset=0;bytes.readUInt32LE(offset)===0x04034b50;){
    const method=bytes.readUInt16LE(offset+8),size=bytes.readUInt32LE(offset+18),names=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+names).toString(),start=offset+30+names+extra,data=bytes.subarray(start,start+size);
    if(name===wanted){assert.ok([0,8].includes(method));return(method===8?inflateRawSync(data):data).toString();}
    offset=start+size;
  }
  assert.fail('Missing ODS part '+wanted);
}
