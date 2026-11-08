import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import {TEACHER_THEORY_LIMIT,teacherTheoryTags,teacherTheoryStyles} from '../src/utils/teacherTheoryFormat.js';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function sanitizeTeacherTheory(html){
  if(typeof html!=='string')fail(400,'Вставьте текст теории');
  if(Buffer.byteLength(html,'utf8')>TEACHER_THEORY_LIMIT)fail(413,'Текст слишком большой. Разделите его на несколько наборов.');
  return sanitizeHtml(html,{allowedTags:teacherTheoryTags,allowedAttributes:{'*':['style'],a:['href','title','target','rel'],td:['colspan','rowspan'],th:['colspan','rowspan'],ol:['start'],li:['value'],font:['color','face','size']},
    allowedStyles:{'*':teacherTheoryStyles},allowedSchemes:['https','http','mailto'],allowProtocolRelative:false,
    transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{...attrs,target:'_blank',rel:'noopener noreferrer'}})}});
}
export class PreparedTeacherTheory {
  constructor(store){this.store=store;this.directory=path.join(store.directory,'teacher-theory');}
  file(auth,id){
    if(!['teacher','admin'].includes(auth?.role)||!auth.id)fail(403,'Текст доступен только преподавателю');
    const set=this.store.data.sets[id];
    if(!set||set.teacherId!==auth.id)fail(404,'Набор не найден');
    const key=crypto.createHash('sha256').update(auth.id+'\0'+id).digest('hex');
    return {name:set.name,file:path.join(this.directory,key+'.json')};
  }
  read(auth,id){
    const {name,file}=this.file(auth,id);
    const note=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{html:'',version:0};
    return {name,html:sanitizeTeacherTheory(note.html),version:note.version,updatedAt:note.updatedAt||null};
  }
  save(auth,id,input){
    const {file}=this.file(auth,id),previous=this.read(auth,id);
    if(!Number.isInteger(input?.version)||input.version!==previous.version)fail(409,'Текст изменён в другом окне. Скопируйте свой текст и загрузите сохранённую версию.');
    const html=sanitizeTeacherTheory(input.html);
    if(html===previous.html)return previous;
    const note={html,version:previous.version+1,updatedAt:new Date(this.store.now()).toISOString()};
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    const temporary=file+'.'+crypto.randomUUID()+'.tmp';
    try{fs.writeFileSync(temporary,JSON.stringify(note),{mode:0o600});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    return {...note,name:previous.name};
  }
}
export function registerPreparedTeacherTheory(app,store,handler){
  const notes=new PreparedTeacherTheory(store),route='/api/lesson-task-sets/:id/teacher-theory';
  app.get(route,handler(async(req,res)=>{res.setHeader('Cache-Control','private, no-store');res.json(notes.read(req.auth,req.params.id));}));
  app.put(route,handler(async(req,res)=>{res.setHeader('Cache-Control','private, no-store');res.json(await store.lock(()=>notes.save(req.auth,req.params.id,req.body)));}));
}
