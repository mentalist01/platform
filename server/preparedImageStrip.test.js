import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {removeImageStrip} from './preparedImageStrip.js';
import {imageStripGeometry} from '../src/utils/imageStrip.js';

test('removing the middle joins exact top and bottom pixels without resizing text or changing the source',async()=>{
  const width=13,height=12,raw=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const offset=(y*width+x)*4;raw[offset]=y*15;raw[offset+1]=x*15;raw[offset+2]=255-y*12;raw[offset+3]=255;}
  const input=await sharp(raw,{raw:{width,height,channels:4}}).png().toBuffer(),original=Buffer.from(input);
  const result=await removeImageStrip(input,{top:3/12,bottom:8/12});
  assert.equal(result.width,width);assert.equal(result.height,7);assert.deepEqual(input,original);
  const decoded=await sharp(result.buffer).ensureAlpha().raw().toBuffer();
  assert.deepEqual(decoded,Buffer.concat([raw.subarray(0,width*3*4),raw.subarray(width*8*4)]));
  const second=await removeImageStrip(result.buffer,{top:2/7,bottom:4/7});assert.equal(second.height,5);
});
test('invalid boundaries fail before cutting, with the same pixel rounding in preview and output',async()=>{
  const input=await sharp({create:{width:40,height:30,channels:4,background:'white'}}).png().toBuffer();
  for(const selection of [null,{}, {top:'0.3',bottom:.7},{top:0,bottom:.5},{top:.4,bottom:1},{top:.8,bottom:.2},{top:NaN,bottom:.7},{top:.5,bottom:.50001}]){
    await assert.rejects(removeImageStrip(input,selection),error=>error.status===400);
  }
  const geometry=imageStripGeometry(40,30,.31,.69),result=await removeImageStrip(input,{top:.31,bottom:.69});
  assert.equal(result.height,geometry.outputHeight);assert.equal(geometry.from,9);assert.equal(geometry.to,21);
});
