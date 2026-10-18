import {pythonExportDuration,pythonExportSpeed} from './python-speed.mjs';

const projectId=job=>job.pythonProjectId||job.id;
export function pythonProjects(jobs,kind='all'){
  const latest=new Map();
  for(const job of Object.values(jobs).filter(j=>j.pythonTimeline && (kind==='all'||(kind==='mock-review'?Boolean(j.mockReview):!j.mockReview)) && !(j.pythonContinuedFrom && j.status==='error' && !j.file))){
    const id=projectId(job),old=latest.get(id);
    if(!old||job.createdAt>old.createdAt||job.pythonContinuedFrom===old.id)latest.set(id,job);
  }
  return [...latest.values()].sort((a,b)=>b.createdAt-a.createdAt).map(job=>({
    kind:job.mockReview?'mock-review':'python',id:job.id,projectId:projectId(job),name:job.pythonDraftName||'',title:job.title,
    createdAt:job.createdAt,updatedAt:job.pythonDraftUpdatedAt||job.stoppedAt||job.createdAt,
    status:job.status,archivedAt:job.pythonArchivedAt||0,revision:job.pythonTimeline.revision,
    clips:job.pythonTimeline.clips.length,duration:pythonExportDuration(job.pythonTimeline),
    speed:pythonExportSpeed(job.pythonTimeline.speed),published:job.status==='ready',approved:Boolean(job.pythonTimeline.approved),
  }));
}
export function managePythonProject(jobs,payload,now=Date.now){
  const job=jobs[payload?.id];
  if(!job?.pythonTimeline)throw Error('Черновик не найден');
  const project=pythonProjects(jobs).find(p=>p.projectId===projectId(job));
  if(project.id!==job.id||payload.revision!==job.pythonTimeline.revision)throw Error('Черновик изменился. Обновите список');
  const family=Object.values(jobs).filter(j=>j.pythonTimeline&&projectId(j)===projectId(job));
  if(family.some(j=>['starting','recording','stopping','uploading','processing'].includes(j.status)))throw Error('Сначала завершите запись или отправку этого проекта');
  const action=payload.action;
  if(action==='rename'){
    const name=String(payload.name||'').trim();if(!name||name.length>100)throw Error('Название должно содержать от 1 до 100 символов');
    for(const part of family){part.pythonDraftName=name;part.pythonDraftUpdatedAt=now();}
  }else if(action==='archive'||action==='restore'){
    if(family.some(j=>j.pythonTimeline.approved)&&action==='archive')throw Error('Опубликованный проект сохраняется отдельно от черновиков');
    for(const part of family){if(action==='archive')part.pythonArchivedAt=now();else delete part.pythonArchivedAt;}
  }else if(action==='save')job.pythonDraftUpdatedAt=now();
  else throw Error('Неизвестное действие с черновиком');
  return job;
}
