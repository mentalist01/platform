import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudyMatchGroup} from './studyMatching.js';

test('lost creation response recovers only the same unstarted group and exact participants',async()=>{
  const previous=globalThis.fetch;
  let group={id:'g',name:'Пара 17',status:'ready',teacherId:'t',members:[{studentId:'a',status:'active'},{studentId:'b',status:'active'}]},posts=0;
  globalThis.fetch=async(_url,options)=>{if(options?.method==='POST'){posts++;throw Error('Lost response');}return Response.json({groups:[group]});};
  try{
    assert.equal((await createStudyMatchGroup('t','Пара 17',['b','a'])).group.id,'g');assert.equal(posts,1);
    await assert.rejects(createStudyMatchGroup('t','Пара 17',['a','c']),/Lost response/);
    group={...group,status:'active'};await assert.rejects(createStudyMatchGroup('t','Пара 17',['a','b']),/Lost response/);
    group={...group,status:'completed'};await assert.rejects(createStudyMatchGroup('t','Пара 17',['a','b']),/Lost response/);
  }finally{globalThis.fetch=previous;}
});
