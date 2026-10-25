import {validStudyStages} from '../src/utils/studyPlanStages.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createStudyPlan,STUDY_PLAN_IDS} from '../src/utils/egeStudyPlan.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max)=>typeof value==='string' && value.length<=max && [...value].every(char=>char.charCodeAt(0)>=32 || '\n\t\r'.includes(char));
export function validateStudyPlan(value) {
  if(!value || value.year!==2027 || !text(value.title,120) || !value.title.trim()) fail(400,'Укажите название плана, до 120 символов');
  if(!Array.isArray(value.order) || value.order.length>25 || new Set(value.order).size!==value.order.length || value.order.some(id=>!STUDY_PLAN_IDS.includes(id))) fail(400,'Некорректный список заданий');
  const blocks={};
  for(const id of STUDY_PLAN_IDS) {
    const block=value.blocks?.[id];
    if(!block || !text(block.title,100) || !block.title.trim() || !text(block.note,1000) || !Array.isArray(block.parts) || block.parts.length>16 || block.parts.some(part=>!text(part,100))) fail(400,'Проверьте название, части и заметку задания');
    if(!Number.isFinite(block.x) || !Number.isFinite(block.y) || block.x<0 || block.y<0 || block.x>15000 || block.y>15000) fail(400,'Блок выходит за пределы холста');
    blocks[id]={title:block.title,parts:[...block.parts],note:block.note,x:Math.round(block.x),y:Math.round(block.y)};
  }
  const result={year:2027,title:value.title,order:[...value.order],blocks};
  if(value.stages!==undefined){result.stages=value.stages;if(!validStudyStages(result))fail(400,'Проверьте этапы: части темы должны идти по порядку, без пропусков и повторов');result.stages=value.stages.map(({id,blockId,fromPart,toPart,x,y})=>({id,blockId,fromPart,toPart,x:Math.round(x),y:Math.round(y)}));}
  return result;
}
export class EgeStudyPlans {
  constructor(dataDir) {this.file=path.join(dataDir,'ege-study-plans.json');}
  read() {
    if(!fs.existsSync(this.file)) return {plans:{}};
    const data=JSON.parse(fs.readFileSync(this.file,'utf8'));
    if(!data || !data.plans || typeof data.plans!=='object' || Array.isArray(data.plans)) throw new Error('Invalid study plan store');
    return data;
  }
  get(id) {return this.read().plans[id] || {...createStudyPlan(),revision:0,updatedAt:null};}
  put(id,input) {
    const data=this.read(), current=data.plans[id] || {...createStudyPlan(),revision:0,updatedAt:null};
    if(!Number.isInteger(input?.revision) || input.revision<0) fail(400,'Некорректная версия плана');
    if(input.revision!==current.revision) throw Object.assign(new Error('План изменён в другом окне. Ваши изменения сохранены на этом устройстве.'),{status:409,current});
    const next={...validateStudyPlan(input),revision:current.revision+1,updatedAt:new Date().toISOString()};
    data.plans[id]=next;
    const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';
    try {fs.writeFileSync(tmp,JSON.stringify(data));fs.renameSync(tmp,this.file);} finally {if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
    return next;
  }
}
export function registerEgeStudyPlanRoutes(app,{dataDir}) {
  const store=new EgeStudyPlans(dataDir);
  const route=fn=>(req,res)=>{
    res.set('Cache-Control','private, no-store');res.vary('Authorization');
    try {
      if(req.auth?.role!=='teacher' || !req.auth.id) fail(403,'План доступен преподавателю');
      return fn(req,res);
    } catch(error) {res.status(error.status||500).json({error:error.status?error.message:'Не удалось сохранить план. Попробуйте ещё раз.',...(error.current?{current:error.current}:{})});}
  };
  app.get('/api/ege-study-plan',route((req,res)=>res.json(store.get(req.auth.id))));
  app.put('/api/ege-study-plan',route((req,res)=>res.json(store.put(req.auth.id,req.body))));
  return store;
}
