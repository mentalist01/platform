import test from 'node:test';import assert from 'node:assert/strict';
import {pythonExportSpeed,pythonExportDuration,pythonTempoFilters,pythonPreviewSpeed} from './python-speed.mjs';
test('arbitrary decimal acceleration accepts comma or dot and never accepts invalid or injectable values',()=>{
 for(const [value,expected]of [[undefined,1],[1,1],['1,2',1.2],[' 1.35 ',1.35],[1.001,1.001],[3.6,3.6],[100,100]])assert.equal(pythonExportSpeed(value),expected);
 for(const value of ['',null,true,{},0,-1,.9,101,Infinity,NaN,'1,2,3','1;setpts=0'])assert.throws(()=>pythonExportSpeed(value),/скорость/);
 const timeline={speed:1.35,clips:[{start:2,end:7},{start:20,end:30}]},before=JSON.stringify(timeline);
 assert.equal(pythonExportDuration(timeline),15/1.35);assert.equal(JSON.stringify(timeline),before);
});
test('large accelerations preserve audio quality through bounded tempo stages, with an explicit normal-speed browser review',()=>{
 for(const speed of [1.2,1.35,2,3.6,8,100]){const factors=pythonTempoFilters(speed).split(',').map(s=>Number(s.split('=')[1]));assert.ok(factors.every(f=>f>=1&&f<=2));assert.ok(Math.abs(factors.reduce((a,b)=>a*b,1)-speed)<1e-10);}
 assert.equal(pythonPreviewSpeed({speed:1.35}),1.35);assert.equal(pythonPreviewSpeed({speed:100}),1);
});
