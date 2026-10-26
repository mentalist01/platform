import {studySubjectBoard} from './studySubjects.js';
const normalize=value=>String(value||'').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
export const studyStudentLabel=student=>[student.name,normalize(student.nickname)!==normalize(student.name)&&student.nickname].filter(Boolean).join(' · ');
export function searchStudyStudents(students,query='') {
  const words=normalize(query).split(/\s+/).filter(Boolean);
  return students.filter(student=>!student.deletedAt&&words.every(word=>normalize(`${student.name||''} ${student.nickname||''} ${student.searchText||''}`).includes(word)))
    .slice().sort((a,b)=>studyStudentLabel(a).localeCompare(studyStudentLabel(b),'ru',{numeric:true}));
}
export function studyPreviewPage(data,teacherId,studentId,storage=globalThis.localStorage) {
  const book=studySubjectBoard(teacherId,studentId)+'~pages';
  let saved='';try{saved=storage?.getItem(`lesson-page:${book}:teacher:${teacherId}`)||storage?.getItem(`board-page:${book}:teacher:${teacherId}`);}catch{/* Optional preference. */}
  return [saved,data.record?.current?.pageId,data.pages.at(-1)?.id].find(id=>data.pages.some(page=>page.id===id))||'main';
}
