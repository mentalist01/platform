import test from 'node:test';
import assert from 'node:assert/strict';
import { filterStudentDirectory } from './studentDirectory.js';
const students=[{id:'b',name:'Егор',nickname:'Егор М',grade:'10',createdAt:'2026-10-02'},{id:'a',name:'Анна',grade:'11',createdAt:'2026-10-01'},{id:'c',name:'Иван',grade:'graduate',createdAt:'2026-10-03'}];
const groups=[{id:'g',name:'Группа 2',members:[{studentId:'a',status:'active'},{studentId:'b',status:'active'},{studentId:'c',status:'left'}]}];
const filter=value=>filterStudentDirectory(students,groups,{query:'',grade:'',format:'',group:'',sort:'name',...value}).map(student=>student.id);
test('search combines group, name, second name and filters with current membership only',()=>{
  assert.deepEqual(filter({query:'группа 2'}),['a','b']);assert.deepEqual(filter({query:'Егор М'}),['b']);
  assert.deepEqual(filter({format:'group',grade:'10'}),['b']);assert.deepEqual(filter({format:'individual'}),['c']);
  assert.deepEqual(filter({group:'g',grade:'graduate'}),[]);assert.deepEqual(filter({sort:'newest'}),['c','b','a']);
});
