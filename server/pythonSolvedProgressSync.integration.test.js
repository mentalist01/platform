import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {watchPythonSolvedProgress} from '../src/utils/pythonSolvedProgressSync.js';

test('open teacher progress becomes solved only after the pupil result is saved; teacher solves reach the pupil too',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,write=>write('tests',{101:{python:['first','second'].map(id=>({id,question:'Выведите 1',tests:[{input:'',output:'1'}]}))}}));
  const clients=[];
  const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Progress update timeout');};
  const connect=async id=>{
    const abort=new AbortController(),listeners=new Set(),snapshots=[];
    const stream=await fetch(f.base+'/api/schedule-sync/stream',{headers:{Authorization:'Bearer '+f.tokens[id]},signal:abort.signal});
    assert.equal(stream.status,200);
    const reader=stream.body.getReader(),decoder=new TextDecoder();let buffer='';
    const sync=watchPythonSolvedProgress({studentId:'student-a',
      load:()=>f.request('/api/progress/solved?studentId=student-a&taskNumber=101&levelId=python&includeCode=1',f.tokens[id]),
      subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},onSnapshot:value=>snapshots.push(value)});
    const pump=(async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
      while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const type=/^event: (.+)$/m.exec(block)?.[1],data=/^data: (.+)$/m.exec(block)?.[1];if(type)for(const fn of listeners)fn({type,data});}
    }}catch(error){if(!abort.signal.aborted)throw error;}})();
    clients.push({sync,abort,pump});await wait(()=>snapshots.length>0);return snapshots;
  };
  try{
    const teacher=await connect('teacher-a'),pupil=await connect('student-a');
    const solve=(questionId,output,token)=>f.request('/api/progress/solve',f.tokens[token],{studentId:'student-a',taskNumber:101,levelId:'python',questionId,code:'print('+output+')',pythonResults:[{input:'',output,error:''}]},'POST',output==='1'?200:400);
    await solve('first','0','student-a');
    assert.deepEqual((await f.request('/api/progress/solved?studentId=student-a&taskNumber=101&levelId=python',f.tokens['teacher-a'])),[]);
    assert.deepEqual(teacher.at(-1).ids,[]);
    await solve('first','1','student-a');await wait(()=>teacher.at(-1).ids.includes('first'));
    assert.equal(teacher.at(-1).codeById.first,'print(1)');
    await solve('second','1','teacher-a');await wait(()=>pupil.at(-1).ids.includes('second'));
    assert.deepEqual(new Set(pupil.at(-1).ids),new Set(['first','second']));
    await f.request('/api/progress/solved?studentId=student-a&taskNumber=101&levelId=python',f.tokens['teacher-b'],undefined,'GET',403);
  }finally{for(const c of clients){c.sync.stop();c.abort.abort();await c.pump;}await f.stop();}
});
