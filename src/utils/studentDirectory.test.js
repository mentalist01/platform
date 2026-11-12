import test from 'node:test';
import assert from 'node:assert/strict';
import { filterStudentDirectory, hasParentContact } from './studentDirectory.js';
const students=[{id:'b',name:'Егор',nickname:'Егор М',grade:'10',createdAt:'2026-10-02'},{id:'a',name:'Анна',grade:'11',createdAt:'2026-10-01'},{id:'c',name:'Иван',grade:'graduate',createdAt:'2026-10-03'}];
const groups=[{id:'g',name:'Группа 2',members:[{studentId:'a',status:'active'},{studentId:'b',status:'active'},{studentId:'c',status:'left'}]}];
const filter=value=>filterStudentDirectory(students,groups,{query:'',grade:'',format:'',group:'',sort:'name',...value}).map(student=>student.id);
test('search combines group, name, second name and filters with current membership only',()=>{
  assert.deepEqual(filter({query:'группа 2'}),['a','b']);assert.deepEqual(filter({query:'Егор М'}),['b']);
  assert.deepEqual(filter({format:'group',grade:'10'}),['b']);assert.deepEqual(filter({format:'individual'}),['c']);
  assert.deepEqual(filter({group:'g',grade:'graduate'}),[]);assert.deepEqual(filter({sort:'newest'}),['c','b','a']);
});

test('missing parent contacts include absent, name-only and notes-only records but exclude saved chat links',()=>{
  for (const contact of [null, undefined, {}, {name:'Мама'}, {name:'Мама',contacts:[],notes:'Попросить номер'}, {url:'javascript:alert(1)'}]) {
    assert.equal(hasParentContact(contact),false);
  }
  for (const contact of [{url:'https://web.telegram.org/a/#123'}, {contacts:[{label:'Мама',value:'+7 999 000-00-00',url:'https://wa.me/79990000000'}]}, {url:'https://web.max.ru/123'}]) {
    assert.equal(hasParentContact(contact),true);
  }
  const contacts={a:{url:'https://t.me/example_parent'},b:{name:'Мама',contacts:[],notes:'Контакт ещё не получен'}};
  const missing=(extra={})=>filterStudentDirectory(students,groups,{parentContact:'missing',...extra},contacts).map(student=>student.id);
  assert.deepEqual(missing(),['b','c']);
  assert.deepEqual(missing({group:'g'}),['b']);
  assert.deepEqual(missing({query:'Иван',format:'individual'}),['c']);
  contacts.b={url:'https://wa.me/79990000000'};
  assert.deepEqual(missing(),['c'],'saved contact removes the pupil from the filtered list');
  contacts.a=null;
  assert.deepEqual(missing(),['a','c'],'removing a contact returns the pupil to the list');
});

test('creation date sorting works in both directions and keeps undated profiles last',()=>{
  const directory=[...students,{id:'unknown',name:'Адам'},{id:'invalid',name:'Борис',createdAt:'not-a-date'},{id:'same',name:'Алексей',createdAt:'2026-10-02'}];
  const ordered=sort=>filterStudentDirectory(directory,[],{sort}).map(student=>student.id);
  assert.deepEqual(ordered('newest'),['c','same','b','a','unknown','invalid']);
  assert.deepEqual(ordered('oldest'),['a','same','b','c','unknown','invalid']);
});
