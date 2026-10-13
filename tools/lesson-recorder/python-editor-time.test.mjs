import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineLayout, clipAtTime, timeToPixel, pixelToTime, snapTime, trimmedRange, cursorEdit, remapPlayhead,zoomScale,zoomPosition,zoomLayout,fitTimelineScale } from './python-editor-time.mjs';
const clips=[{id:'long',start:20,end:30},{id:'short',start:0,end:.2},{id:'last',start:8,end:13}];

test('lower zoom range fits long lessons and hundreds of short clips while retaining cursor mapping',()=>{
  assert.equal(zoomScale(0),.01);assert.equal(zoomScale(100),30);assert.equal(zoomScale(-1),.01);
  for(const position of [0,10,30,70,100])assert.ok(Math.abs(zoomPosition(zoomScale(position))-position)<1e-9);
  assert.ok(zoomScale(25)<zoomScale(50)&&zoomScale(50)<zoomScale(75));
  for(const footage of [Array.from({length:61},(_,id)=>({id,start:id*48,end:id*48+48})),Array.from({length:300},(_,id)=>({id,start:id,end:id+.04}))]){
    for(const width of [320,970,1800]){
      const scale=fitTimelineScale(footage,width),layout=zoomLayout(footage,scale),last=layout.at(-1);
      assert.ok(last.x+last.width<=width+.001,`${footage.length} clips should fit ${width}px`);
      assert.ok(zoomLayout(footage,Math.min(30,scale+.001)).at(-1).x+zoomLayout(footage,Math.min(30,scale+.001)).at(-1).width>width||scale>=29.99);
      const time=last.time/2;assert.ok(Math.abs(pixelToTime(layout,timeToPixel(layout,time))-time)<1e-8);
    }
  }
  assert.equal(fitTimelineScale([],500),.01);
});

test('editing retains the current source frame when reordering, trimming, splitting or undoing a cut',()=>{
  const original=[{id:'one',takeNumber:1,start:10,end:20},{id:'two',takeNumber:2,start:40,end:50}];
  assert.equal(remapPlayhead(original,[original[1],original[0]],13),3);
  assert.equal(remapPlayhead(original,[{...original[0],end:15},original[1]],13),8);
  assert.equal(remapPlayhead(original,[{...original[0],start:12},original[1]],5),3);
  assert.equal(remapPlayhead(original,[{...original[0],start:17},original[1]],5),0);
  const split=[{...original[0],end:15},{...original[0],id:'half',start:15},original[1]];
  assert.equal(remapPlayhead(original,split,7),7);
  assert.equal(remapPlayhead(split,original,7),7);
  assert.equal(remapPlayhead(original,[original[0]],13),10);
  assert.equal(remapPlayhead(original,[],13),0);
  assert.equal(remapPlayhead([],original,NaN),0);
  assert.deepEqual(original,[{id:'one',takeNumber:1,start:10,end:20},{id:'two',takeNumber:2,start:40,end:50}]);
});

test('quick edits map the output cursor back into reordered, trimmed source ranges and reject cuts on boundaries', () => {
  const layout = timelineLayout(clips,8);
  assert.deepEqual(cursorEdit(layout,4,'split'),{clipId:'long',at:24});
  assert.deepEqual(cursorEdit(layout,12.2,'trim-start'),{clipId:'last',start:10,end:13});
  assert.deepEqual(cursorEdit(layout,12.2,'trim-end'),{clipId:'last',start:8,end:10});
  assert.equal(cursorEdit(layout,0,'split'),null);
  assert.equal(cursorEdit(layout,10,'split'),null);
  assert.equal(cursorEdit(layout,15.2,'split'),null);
  assert.equal(cursorEdit(layout,10.01,'trim-end'),null);
  assert.equal(cursorEdit([],0,'split'),null);
  assert.equal(cursorEdit(layout,NaN,'split'),null);
});
test('playhead maps output time to exact clip geometry after rearranging and across padded short clips',()=>{
  const layout=timelineLayout(clips,8); assert.deepEqual(layout.map(item=>item.time),[0,10,10.2]);
  for(const seconds of [0,1,9.99,10,10.1,10.199,10.2,11,15.2])assert.ok(Math.abs(pixelToTime(layout,timeToPixel(layout,seconds))-seconds)<1e-9);
  assert.equal(clipAtTime(layout,10).id,'short'); assert.equal(clipAtTime(layout,10.2).id,'last');
  assert.equal(pixelToTime(layout,82),10,'Gap maps to the cut'); assert.equal(pixelToTime(layout,-90),0);
  assert.equal(pixelToTime(layout,100000),15.2); assert.equal(timeToPixel([],1),0); assert.equal(pixelToTime([],1),0);
});
test('playhead and trim snapping choose nearest eligible point with an explicit bypass',()=>{
  assert.equal(snapTime(4.92,[0,5,10],.1),5); assert.equal(snapTime(4.92,[0,5,10],.05),4.92);
  assert.equal(snapTime(4.92,[0,5,10],.1,false),4.92); assert.equal(snapTime(4.92,[],.1),4.92);
});
test('mouse trim cannot remove the entire clip, grow beyond the original range, or use an invalid delta',()=>{
  const clip=clips[0]; assert.deepEqual(trimmedRange(clip,'in',3),{start:23,end:30});
  assert.deepEqual(trimmedRange(clip,'out',-2),{start:20,end:28});
  assert.deepEqual(trimmedRange(clip,'in',-2),{start:20,end:30});
  assert.deepEqual(trimmedRange(clip,'out',100),{start:20,end:30});
  assert.equal(trimmedRange(clip,'in',100).start,29.96); assert.equal(trimmedRange(clip,'out',-100).end,20.04);
  assert.deepEqual(trimmedRange(clip,'in',NaN),{start:20,end:30});
});
