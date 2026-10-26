import test from 'node:test';
import assert from 'node:assert/strict';
import {continueStudentStudy,STUDY_CONTINUE_EVENT} from './studentStudyProgress.js';
import {lessonPageSelectionKey,LESSON_PAGE_SELECTION_EVENT} from '../utils/lessonPageSelection.js';
import {preparedSelectionKey} from './preparedLessonTasks.js';

test('group Continue uses the permanent notebook and group event without a pupil room',async()=>{
  const previous={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch},values=new Map(),events=[],requests=[];
  const record={studentId:'group:g',groupId:'g',revision:1,links:{},completed:{},current:{blockId:'18',partNumber:1,pageId:'group-page',cardId:'group-card'}};
  try{
    globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
    globalThis.window={localStorage:globalThis.localStorage,location:{protocol:'https:',hostname:'example.test',href:'https://example.test/'},dispatchEvent:event=>events.push(event)};
    globalThis.fetch=async(url,options)=>{requests.push({url,options});return Response.json({record,plan:{order:['18'],blocks:{'18':{parts:[]}}},pages:[],group:{id:'g'}});};
    await continueStudentStudy('group-teacher','group:g');
    assert.match(requests[0].url,/\/api\/group-study-progress\/g$/);assert.equal(values.get(lessonPageSelectionKey('board-group-g~pages','teacher','group-teacher')),'group-page');
    assert.equal(values.get(preparedSelectionKey('board-group-g~page~group-page')),'group-card');assert.ok(events.some(event=>event.type===STUDY_CONTINUE_EVENT&&event.detail.groupId==='g'));
    assert.ok([...values.keys()].every(key=>!key.includes('board-group-teacher-group:')));
  }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('Continue opens the saved pupil, board/code page and prepared card; missing pages never redirect silently',async()=>{
  const previous={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
  const values=new Map(),events=[],requests=[];
  const record={studentId:'pupil',revision:1,links:{},completed:{},current:{blockId:'17',partNumber:1,pageId:'page-specific',runId:'run',cardId:'card-specific',taskTitle:'5'}};
  try{
    globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
    globalThis.window={localStorage:globalThis.localStorage,location:{protocol:'https:',hostname:'example.test',href:'https://example.test/'},dispatchEvent:event=>events.push(event)};
    globalThis.fetch=async(url,options)=>{requests.push({url,options});return Response.json({record,plan:{order:['17'],blocks:{'17':{parts:[]}}},pages:[]});};
    await continueStudentStudy('teacher','pupil');
    assert.match(requests[0].url,/\/api\/student-study-progress\/pupil$/);
    assert.equal(values.get(lessonPageSelectionKey('board-teacher-pupil~pages','teacher','teacher')),'page-specific');
    assert.equal(values.get(preparedSelectionKey('board-teacher-pupil~page~page-specific')),'card-specific');
    assert.equal(events[0].type,LESSON_PAGE_SELECTION_EVENT);assert.equal(events.at(-1).type,STUDY_CONTINUE_EVENT);
    assert.deepEqual(events.at(-1).detail,{studentId:'pupil',pageId:'page-specific'});
    record.current.pageMissing=true;record.revision++;events.length=0;
    await assert.rejects(continueStudentStudy('teacher','pupil'),/страница убрана/);assert.equal(events.length,0);
    record.current=null;record.revision++;
    await assert.rejects(continueStudentStudy('teacher','pupil'),/Сначала отметьте/);assert.equal(events.length,0);
  }finally{for(const [key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
