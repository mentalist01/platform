import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveState,applyLiveBatch,liveResponse,normalizeLiveLayout} from './workbookLiveState.js';

test('column geometry is canonical, survives cell changes and supports undo',()=>{
  const book={sheets:[{id:'sheet1',name:'Лист1',cells:{A1:{content:{kind:'number',value:5},fill:null}}}]};
  const columns=[[1,3,80],[4,54,18],[55,16384,80]];
  let state=createLiveState(book,'source');
  state=applyLiveBatch(state,'student',{id:'autofit',type:'patch',changes:[{sheetId:'sheet1',address:'@',property:'layout',value:{columns},baseVersion:0}]}).state;
  state=applyLiveBatch(state,'teacher',{id:'typing',type:'patch',changes:[{sheetId:'sheet1',address:'B2',property:'content',value:{kind:'number',value:9},baseVersion:0}]}).state;
  assert.deepEqual(liveResponse(state).book.sheets[0].layout,{columns});
  state=applyLiveBatch(state,'student',{id:'undo-width',type:'undo',targetId:'autofit'}).state;
  assert.equal(state.book.sheets[0].layout,undefined);assert.equal(state.book.sheets[0].cells.B2.content.value,9);
  assert.deepEqual(normalizeLiveLayout({merges:[],columns:[[1,3,80],[4,16384,80]]}),{columns:[[1,16384,80]]});
});

test('column ranges reject gaps, overlaps, invalid dimensions and excessive payloads',()=>{
  for(const columns of [[],[[2,16384,80]],[[1,100,80]],[[1,100,80],[100,16384,80]],[[1,16385,80]],[[1,16384,-1]],[[1,16384,NaN]],[[1,16384,Infinity]],[[1,16384,80.5]],[[1,16384,100001]],[[1,16384,80,'extra']]])assert.throws(()=>normalizeLiveLayout({columns}));
  assert.deepEqual(normalizeLiveLayout({merges:['C1:E1'],columns:[[1,3,0],[4,16384,10]]}),{merges:['C1:E1'],columns:[[1,3,0],[4,16384,10]]});
});
