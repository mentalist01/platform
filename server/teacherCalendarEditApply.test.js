import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeacherCalendarEditApplier } from './teacherCalendarEditApply.js';
const source={id:'weekly',weekdayKey:'tuesday',date:'2026-10-20',time:'12:00',durationMinutes:60,studentId:'a'};
const row={id:'request-apply-0001',teacherId:'t',source,target:{date:'2026-10-21',time:'13:00',durationMinutes:60,studentId:'a',title:'Анна'},googleResult:{iCalUID:'uid'}};
function fixture(){
  const state={a:{schedule:[{...source,date:undefined}]},b:{schedule:[]},teachers:[{id:'t',calendarSchedule:[]}],lessons:[],rosters:[],paymentMoves:[]};
  const apply=createTeacherCalendarEditApplier({
    getStudent:id=>({id,teacherId:'t'}),getGroup:id=>({id}),getStudentData:id=>structuredClone(state[id]),
    buildStudentGoogle:(entry,student)=>({...entry,id:`${entry.id}-${student.id}`,studentId:student.id}),setStudentSchedule:(id,_data,schedule)=>{state[id]={schedule};},
    readTeachers:()=>structuredClone(state.teachers),writeTeachers:value=>{state.teachers=value;},readLessons:()=>structuredClone(state.lessons),writeLessons:value=>{state.lessons=value;},
    updateLesson:(lesson,update)=>({...lesson,...update}),createLesson:(_group,data,meta)=>({...data,id:meta.id,groupId:'g',participantIds:['a','b']}),normalizeLesson:value=>value,
    createRoster:lesson=>({lessonId:lesson.id}),writeRoster:roster=>state.rosters.push(roster),movePaymentMarks:async(...args)=>state.paymentMoves.push(args),invalidate:()=>{},
  });return{state,apply};
}
test('moving one weekly lesson excludes its old day, preserves other dates and is repeatable',async()=>{
  const{state,apply}=fixture();await apply(row);await apply(row);
  assert.equal(state.a.schedule.length,2);assert.deepEqual(state.a.schedule[0].excludedDates,['2026-10-20']);
  assert.equal(state.a.schedule[1].time,'13:00');assert.equal(state.paymentMoves.length,2);
});
test('group moves retain lesson identity, participants, board metadata and homework, never add another lesson',async()=>{
  const{state,apply}=fixture();
  state.lessons=[{id:'lesson-g',groupId:'g',startAt:'2026-10-20T09:00:00.000Z',participantIds:['a','b'],boardId:'notebook',homeworkId:'hw-7',status:'scheduled'}];
  const groupRow={...row,source:{...source,id:'learning-group-session-lesson-g',studentId:'',groupId:'g',lessonId:'lesson-g'},target:{...row.target,studentId:'',groupId:'g',title:'Группа 2'}};
  await apply(groupRow);await apply(groupRow);assert.equal(state.lessons.length,1);assert.equal(state.lessons[0].id,'lesson-g');assert.equal(state.lessons[0].boardId,'notebook');assert.equal(state.lessons[0].homeworkId,'hw-7');
  assert.equal(state.lessons[0].startAt,'2026-10-21T10:00:00.000Z');assert.equal(state.b.schedule.length,1);assert.equal(state.b.schedule[0].studentId,'b');
});
test('personal event mirrors are hidden from duplicate local display and retain custom titles',async()=>{
  const{state,apply}=fixture();const personal={...row,source:null,target:{...row.target,studentId:'',title:'Встреча'}};
  await apply(personal);await apply(personal);assert.equal(state.teachers[0].calendarSchedule.length,1);assert.equal(state.teachers[0].calendarSchedule[0].subject,'Встреча');assert.equal(state.teachers[0].calendarSchedule[0].calendarEditGoogleMirror,true);
});
