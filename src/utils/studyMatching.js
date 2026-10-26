import {studyPlanSubjects} from './studySubjects.js';
import {studyPartKey,nextStudyStep,studyRouteParts,studyProgressLabel} from './studentStudyProgress.js';
import {studyStudentLabel} from './studyStudentSearch.js';

export function studyMatchProfiles(plan,records,students,groups=[]) {
  const eligible=studyPlanSubjects(students,groups).individuals;
  if(!plan)return eligible.map(student=>({student,known:false,reason:'План пока не загружен'}));
  // Use one shared sequence even when some older pupil pages have extra parts.
  const links=Object.fromEntries(Object.entries(records).flatMap(([id,record])=>Object.entries(record.links||{}).map(([page,link])=>[`${id}:${page}`,link])));
  const route=studyRouteParts(plan,{links}),index=new Map(route.map((part,i)=>[studyPartKey(part.blockId,part.partNumber),i]));
  return eligible.map(student=>{
    const record=records[student.id],current=record?.current;
    const position=current?.completed?nextStudyStep(plan,record):current;
    const at=position?index.get(studyPartKey(position.blockId,position.partNumber)):undefined;
    return {student,record,position,at,known:at!==undefined,label:studyProgressLabel(position?{blockId:position.blockId,partNumber:position.partNumber}:null,plan),updatedAt:current?.updatedAt||record?.updatedAt,reason:!current?'Тема пока не отмечена':!position?'Маршрут завершён':at===undefined?'Этап вне текущего плана':''};
  });
}

// Dynamic programming over the ordered route: cover as many selected pupils as
// possible, minimize their stage spread, and avoid chains of distant neighbours.
export function matchStudyStudents(profiles,{selectedIds,maxSize=2,tolerance=0}={}) {
  const selected=selectedIds?new Set(selectedIds):null;
  const chosen=profiles.filter(profile=>!selected||selected.has(profile.student.id));
  const known=chosen.filter(profile=>profile.known).sort((a,b)=>a.at-b.at||studyStudentLabel(a.student).localeCompare(studyStudentLabel(b.student),'ru'));
  const limit=Math.max(2,Math.min(8,Math.trunc(Number(maxSize)||2))),gap=Math.max(0,Math.min(1,Number(tolerance)||0));
  const best=Array(known.length+1);best[known.length]={covered:0,cost:0,groups:[],unmatched:[]};
  const better=(a,b)=>a.covered>b.covered||a.covered===b.covered&&(a.cost<b.cost||a.cost===b.cost&&a.groups.length<b.groups.length);
  for(let i=known.length-1;i>=0;i--){
    let result={...best[i+1],unmatched:[known[i],...best[i+1].unmatched]};
    for(let size=2;size<=limit&&i+size<=known.length;size++){
      const members=known.slice(i,i+size),spread=members.at(-1).at-members[0].at;if(spread>gap)break;
      const tail=best[i+size],candidate={covered:tail.covered+size,cost:tail.cost+spread*size,groups:[{members,spread,reason:spread?'Соседние этапы плана':'Одинаковая тема и часть'},...tail.groups],unmatched:tail.unmatched};
      if(better(candidate,result))result=candidate;
    }
    best[i]=result;
  }
  return {...best[0],unknown:chosen.filter(profile=>!profile.known)};
}
