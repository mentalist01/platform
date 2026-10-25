import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {STUDY_PLAN_IDS} from '../src/utils/egeStudyPlan.js';
import {studyPartKey,studyPartCount,nextStudyStep,studyPageSuggestion,studyTopic} from '../src/utils/studentStudyProgress.js';
import {boardPageRoom} from '../src/utils/boardPages.js';
import {preparedTaskSource} from '../src/utils/preparedRunSources.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export class StudentStudyProgress {
  constructor({dataDir,students,pages,plans,prepared}) {
    Object.assign(this,{students,pages,plans,prepared});
    this.file=path.join(dataDir,'student-study-progress.json');this.serial=Promise.resolve();
  }
  read() {
    if(!fs.existsSync(this.file))return {records:{}};
    const data=JSON.parse(fs.readFileSync(this.file,'utf8'));
    if(!data?.records||typeof data.records!=='object'||Array.isArray(data.records))throw Error('Invalid study progress store');
    return data;
  }
  owner(auth,id) {
    if(auth?.role!=='teacher'||!auth.id)fail(403,'Маршрут доступен преподавателю');
    const student=this.students().find(student=>student.id===id&&!student.deletedAt&&student.teacherId===auth.id);
    if(!student)fail(404,'Ученик не найден');
    return student;
  }
  record(teacherId,studentId,data=this.read()) {return data.records[`${teacherId}:${studentId}`]||{studentId,revision:0,current:null,links:{},completed:{},updatedAt:null};}
  list(auth) {
    if(auth?.role!=='teacher'||!auth.id)fail(403,'Маршрут доступен преподавателю');
    const data=this.read(),records={};
    for(const student of this.students())if(!student.deletedAt&&student.teacherId===auth.id)records[student.id]=this.record(auth.id,student.id,data);
    return {records,plan:this.plans.get(auth.id)};
  }
  position(auth,studentId,pageId,runId,cardId) {
    const room=boardPageRoom(`board-${auth.id}-${studentId}`,pageId);
    const active=this.prepared?.data.active[room],run=this.prepared?.data.runs[active];
    if(!run||run.homework||run.groupId||run.teacherId!==auth.id||run.studentId!==studentId||(runId&&run.id!==runId))return null;
    const card=run.cards.find(card=>card.id===(cardId||run.teacherCardId))||(!cardId?run.cards.at(-1):null);
    if(!card)return null;
    const task=run.tasks[card.index],source=preparedTaskSource(run,task,card.index),topic=studyTopic(source.taskNumber,source.partNumber);
    return topic?{...topic,runId:run.id,cardId:card.id,taskTitle:String(task.title||source.index+1).slice(0,120),kind:task.kind||'task'}:null;
  }
  async detail(auth,id) {
    const student=this.owner(auth,id),pages=await this.pages(student),record=this.record(auth.id,id),plan=this.plans.get(auth.id);
    const current=record.current?{...record.current,pageTitle:pages.find(page=>page.id===record.current.pageId)?.title||record.current.pageTitle,pageMissing:!pages.some(page=>page.id===record.current.pageId)}:null;
    return {record:{...record,current},plan,next:nextStudyStep(plan,record),pages:pages.map(page=>({...page,suggestion:this.position(auth,id,page.id)||studyPageSuggestion(page,pages)}))};
  }
  change(auth,id,input) {
    const pending=this.serial.catch(()=>{}).then(()=>this.mutate(auth,id,input));this.serial=pending;return pending;
  }
  async mutate(auth,id,input) {
    const student=this.owner(auth,id),data=this.read(),previous=this.record(auth.id,id,data);
    if(!Number.isInteger(input?.revision)||input.revision<0)fail(400,'Некорректная версия маршрута');
    if(input.revision!==previous.revision)fail(409,'Маршрут изменён в другом окне. Обновите данные и повторите действие.');
    const record=structuredClone(previous),plan=this.plans.get(auth.id),now=new Date().toISOString();
    const pages=await this.pages(student),page=pages.find(page=>page.id===input.pageId);
    if(['link','current','position'].includes(input.action)&&!page)fail(404,'Страница убрана. Выберите другую страницу доски.');
    if(['link','current'].includes(input.action)) {
      if(!STUDY_PLAN_IDS.includes(input.blockId)||!Number.isInteger(input.partNumber)||input.partNumber<1||input.partNumber>20)fail(400,'Выберите задание и часть');
      if(!plan.order.includes(input.blockId))fail(400,'Сначала добавьте это задание в общий план');
      const link={blockId:input.blockId,partNumber:input.partNumber};record.links[page.id]=link;
      if(input.action==='current') {
        const position=this.position(auth,id,page.id,input.runId,input.cardId);
        record.current={...link,pageId:page.id,pageTitle:page.title,completed:false,updatedAt:now,...(position?.blockId===link.blockId&&position.partNumber===link.partNumber?position:{})};
        delete record.completed[studyPartKey(link.blockId,link.partNumber)];
      }
    } else if(input.action==='position') {
      if(!record.current||record.current.pageId!==page.id||record.current.completed)fail(409,'Эта страница не отмечена как текущая');
      const position=this.position(auth,id,page.id,input.runId,input.cardId);
      if(!position||position.blockId!==record.current.blockId||position.partNumber!==record.current.partNumber)fail(409,'Задача относится к другой теме. Отметьте её кнопкой «Сейчас проходим».');
      if(record.current.runId===position.runId&&record.current.cardId===position.cardId&&record.current.taskTitle===position.taskTitle)return this.detail(auth,id);
      record.current={...record.current,...position,pageTitle:page.title,updatedAt:now};
    } else if(input.action==='complete') {
      if(input.wholeTopic!==undefined&&typeof input.wholeTopic!=='boolean')fail(400,'Некорректный способ завершения темы');
      if(!record.current||record.current.pageId!==input.pageId)fail(409,'Откройте текущую страницу перед завершением темы');
      const {blockId,partNumber}=record.current,count=input.wholeTopic?studyPartCount(plan,record,blockId):partNumber;
      for(let part=input.wholeTopic?1:partNumber;part<=count;part++)record.completed[studyPartKey(blockId,part)]=now;
      record.current={...record.current,completed:true,updatedAt:now};
    } else fail(400,'Неизвестное действие');
    record.revision++;record.updatedAt=now;data.records[`${auth.id}:${id}`]=record;
    const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';
    try{fs.writeFileSync(tmp,JSON.stringify(data));fs.renameSync(tmp,this.file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
    return this.detail(auth,id);
  }
}
export function registerStudentStudyProgressRoutes(app,dependencies) {
  const store=new StudentStudyProgress(dependencies);
  const route=handler=>async(req,res)=>{
    res.set('Cache-Control','private, no-store');res.vary('Authorization');
    try{res.json(await handler(req));}catch(error){res.status(error.status||500).json({error:error.status?error.message:'Не удалось загрузить маршрут. Попробуйте ещё раз.'});}
  };
  app.get('/api/student-study-progress',route(req=>store.list(req.auth)));
  app.get('/api/student-study-progress/:studentId',route(req=>store.detail(req.auth,req.params.studentId)));
  app.post('/api/student-study-progress/:studentId',route(req=>store.change(req.auth,req.params.studentId,req.body)));
  return store;
}
