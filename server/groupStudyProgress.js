import path from 'node:path';
import {StudentStudyProgress} from './studentStudyProgress.js';
import {groupNotebookBoard} from '../src/utils/groupNotebook.js';
import {boardPageRoom} from '../src/utils/boardPages.js';
import {activeStudyGroupMembers,groupStudySubject,studySubjectGroup} from '../src/utils/studySubjects.js';

export class GroupStudyProgress extends StudentStudyProgress {
  constructor({groups,...dependencies}) {
    super({...dependencies,students:()=>groups().filter(group=>group.status==='active')});
    this.groups=groups;this.file=path.join(dependencies.dataDir,'group-study-progress.json');
  }
  owner(auth,id) {
    if(auth?.role!=='teacher'||!auth.id)throw Object.assign(Error('Маршрут доступен преподавателю'),{status:403});
    const group=this.groups().find(group=>group.id===id&&!group.deletedAt&&group.teacherId===auth.id&&group.status==='active');
    if(!group)throw Object.assign(Error('Активная группа не найдена'),{status:404});
    return group;
  }
  record(teacherId,id,data=this.read()) {return {...super.record(teacherId,id,data),studentId:groupStudySubject(id),groupId:id};}
  room(_auth,id,pageId) {return boardPageRoom(groupNotebookBoard(studySubjectGroup(id)||id),pageId);}
  matchesRun(auth,id,run) {return run.teacherId===auth.id&&run.groupId===(studySubjectGroup(id)||id)&&!run.homework;}
  list(auth) {
    if(auth?.role!=='teacher'||!auth.id)throw Object.assign(Error('Маршрут доступен преподавателю'),{status:403});
    const data=this.read(),groups=this.groups().filter(group=>!group.deletedAt&&group.teacherId===auth.id&&group.status==='active');
    return {records:Object.fromEntries(groups.map(group=>[groupStudySubject(group.id),this.record(auth.id,group.id,data)])),groups:groups.map(group=>({id:group.id,name:group.name,status:group.status,participantIds:activeStudyGroupMembers(group)})),plan:this.plans.get(auth.id)};
  }
  async detail(auth,id) {
    const group=this.owner(auth,id),detail=await super.detail(auth,id);
    return {...detail,group:{id:group.id,name:group.name,participantIds:activeStudyGroupMembers(group)}};
  }
}
export function registerGroupStudyProgressRoutes(app,dependencies) {
  const store=new GroupStudyProgress(dependencies);
  const route=handler=>async(req,res)=>{res.set('Cache-Control','private, no-store');res.vary('Authorization');try{res.json(await handler(req));}catch(error){res.status(error.status||500).json({error:error.status?error.message:'Не удалось загрузить маршрут группы. Попробуйте ещё раз.'});}};
  app.get('/api/group-study-progress',route(req=>store.list(req.auth)));
  app.get('/api/group-study-progress/:groupId',route(req=>store.detail(req.auth,req.params.groupId)));
  app.post('/api/group-study-progress/:groupId',route(req=>store.change(req.auth,req.params.groupId,req.body)));
  return store;
}
