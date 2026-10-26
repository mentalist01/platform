import {isCurrentStudent} from './studentStudyStatus.js';
import {groupNotebookBoard} from './groupNotebook.js';

export const groupStudySubject=id=>`group:${id}`;
export const studySubjectGroup=id=>typeof id==='string'&&id.startsWith('group:')?id.slice(6):'';
export const studySubjectBoard=(teacherId,id)=>studySubjectGroup(id)?groupNotebookBoard(studySubjectGroup(id)):`board-${teacherId}-${id}`;
export const mergeStudyGroups=(...sources)=>[...new Map(sources.flat().map(group=>[group.id,group])).values()];
export function activeStudyGroupMembers(group) {
  if(Array.isArray(group.members))return [...new Set(group.members.filter(member=>member.status==='active').map(member=>member.studentId).filter(Boolean))];
  return [...new Set(group.participantIds||[])];
}
export function studyPlanSubjects(students,groups=[]) {
  const active=groups.filter(group=>!group.deletedAt&&group.status==='active'),grouped=new Set(active.flatMap(activeStudyGroupMembers));
  const individuals=students.filter(student=>isCurrentStudent(student)&&!grouped.has(student.id));
  return {individuals,subjects:[...active.map(group=>({id:groupStudySubject(group.id),groupId:group.id,kind:'group',name:group.name,participantIds:activeStudyGroupMembers(group),searchText:activeStudyGroupMembers(group).map(id=>students.find(student=>student.id===id)).filter(Boolean).map(student=>`${student.name||''} ${student.nickname||''}`).join(' ')})),...individuals]};
}
