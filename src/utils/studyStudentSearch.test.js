import test from 'node:test';
import assert from 'node:assert/strict';
import {searchStudyStudents,studyStudentLabel,studyPreviewPage} from './studyStudentSearch.js';
test('pupil search matches Russian names/nicknames, ё, several words and hides deleted pupils',()=>{
  const students=[{id:'1',name:'Семён Иванов',nickname:'Сёма 11 класс'},{id:'2',name:'Елисей',nickname:'Елисей'},{id:'3',name:'Семён',deletedAt:'today'}];
  assert.equal(studyStudentLabel(students[1]),'Елисей');assert.deepEqual(searchStudyStudents(students,'СЕМА 11').map(s=>s.id),['1']);assert.deepEqual(searchStudyStudents(students,'семен иван').map(s=>s.id),['1']);assert.equal(searchStudyStudents(students,'нет').length,0);assert.equal(students[0].id,'1');
});
test('preview restores a real remembered page, then current progress, then last existing page',()=>{
  const data={record:{current:{pageId:'current'}},pages:[{id:'main'},{id:'current'},{id:'last'}]},storage={getItem:key=>key.startsWith('lesson-page:')?'main':null};
  assert.equal(studyPreviewPage(data,'t','p',storage),'main');storage.getItem=()=> 'deleted';assert.equal(studyPreviewPage(data,'t','p',storage),'current');data.record.current=null;assert.equal(studyPreviewPage(data,'t','p',storage),'last');assert.equal(studyPreviewPage({...data,pages:[]},'t','p',storage),'main');
});
