import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import {isWorkbookFileName, parseWorkbookHelperAuthorization} from './workbookHelper.js';
import {BLANK_WORKBOOK_ODS, workbookSolutionFormatAllowed} from './blankWorkbook.js';
import {preparedFileSync} from '../src/utils/preparedFileSync.js';
import {projectPreparedCode} from './preparedCodeProjection.js';
import {preparedRuntimeFiles} from '../src/utils/preparedRuntimeFiles.js';
import {preparedAnswerTask, splitLegacyPreparedAnswer} from '../src/utils/egeAnswerFields.js';

const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const text=(value,max=160)=>String(value??'').replace(/\0/g,'').trim().slice(0,max);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const teacher=auth=>['teacher','admin'].includes(auth?.role);
const actorKey=auth=>`${auth?.role}:${auth?.id}`;
const LEASE_MS=90_000;
const WRITER_MS=60*60*1000;
const textWorkbook=(run,name)=>[26,27].includes(Number(run.taskNumber))&&/\.(txt|csv|tsv)$/i.test(name);
const helperSupported=(run,name)=>isWorkbookFileName(name)||textWorkbook(run,name);
const helperName=(run,asset)=>textWorkbook(run,asset.name)?asset.name.replace(/\.[^.]+$/, '')+' — решение.ods':asset.name;
const helperHash=(run,asset)=>textWorkbook(run,asset.name)?digest(BLANK_WORKBOOK_ODS):asset.hash;
export function preparedAnswerMatches(expected,actual,format='exact') {
  const values=value=>(Array.isArray(value)?value:[value]).map(v=>String(v??'').trim());
  const e=values(expected),a=values(actual);
  if(format==='manual')return false;
  if(format==='number') {
    const number=v=>/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(v)?Number(v.replace(',','.')):NaN;
    return e.length===a.length&&e.every((v,i)=>Number.isFinite(number(v))&&number(v)===number(a[i]));
  }
  const split=arr=>arr.flatMap(v=>v.split(/[;\s]+/).filter(Boolean));
  if(format==='sequence'||format==='unordered') {const x=split(e),y=split(a);if(format==='unordered'){x.sort();y.sort();}return JSON.stringify(x)===JSON.stringify(y);}
  return e.length===a.length&&e.every((v,i)=>v===a[i]);
}
export function preparedNextPoint(items,anchor,width=680) {
  let bottom=anchor.y+anchor.height+220;
  for(const item of items) {
    const points=Array.isArray(item.points)?item.points:item.start&&item.end?[item.start,item.end]:null;
    const box=points?.length?{x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))}:{x:Number(item.x),y:Number(item.y),right:Number(item.x)+Number(item.width),bottom:Number(item.y)+Number(item.height)};
    if(!Object.values(box).every(Number.isFinite)||box.bottom<anchor.y)continue;
    if(box.right>=anchor.x-120&&box.x<=anchor.x+width+120)bottom=Math.max(bottom,box.bottom+100);
  }
  if(bottom>900_000)fail(409,'На этой странице мало места. Создайте следующую страницу.');
  return {x:anchor.x,y:bottom};
}

// Secrets and future conditions live here, never in the collaborative scene.
// Every mutation is serialized per store; persisted state precedes notification.
export class PreparedLessonTasks {
  constructor({directory,authorize,board,code,sourceFiles,saveNotes,now=()=>Date.now()}) {
    this.directory=directory;this.authorize=authorize;this.board=board;this.code=code;this.sourceFiles=sourceFiles;this.saveNotes=saveNotes;this.now=now;
    fs.mkdirSync(directory,{recursive:true});this.assetsDir=path.join(directory,'assets');fs.mkdirSync(this.assetsDir,{recursive:true});
    this.file=path.join(directory,'state.json');
    this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,sets:{},assets:{},runs:{},active:{},sessions:{}};
    if(this.data.version!==1||!this.data.runs||!this.data.sets)throw Error('Неподдерживаемое хранилище заданий к уроку');
    this.runsDir=path.join(directory,'runs');fs.mkdirSync(this.runsDir,{recursive:true});
    for(const filename of fs.readdirSync(this.runsDir).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name))){const run=JSON.parse(fs.readFileSync(path.join(this.runsDir,filename),'utf8'));for(const card of run.cards){const codeFile=path.join(this.runsDir,`${run.id}-${card.id}.code.json`);card.code=fs.existsSync(codeFile)?JSON.parse(fs.readFileSync(codeFile,'utf8')):{text:'',input:'',output:'',revision:0};}this.data.runs[run.id]=run;}
    this.tail=Promise.resolve();this.tickets=new Map();
    this.migrateLegacyAnswers();
  }
  migrateLegacyAnswers(){
    const sets=Object.values(this.data.sets).filter(set=>set.tasks.some(task=>splitLegacyPreparedAnswer(task,set.taskNumber)));
    const runs=Object.values(this.data.runs).filter(run=>run.tasks.some(task=>splitLegacyPreparedAnswer(task,run.taskNumber)));
    if(!sets.length&&!runs.length)return;
    const backup=path.join(this.directory,'answers-backup-'+crypto.randomUUID());fs.mkdirSync(backup,{mode:0o700});
    if(fs.existsSync(this.file))fs.copyFileSync(this.file,path.join(backup,'state.json'));
    for(const run of runs){const file=path.join(this.runsDir,run.id+'.json');if(fs.existsSync(file))fs.copyFileSync(file,path.join(backup,run.id+'.json'));}
    for(const set of sets){set.tasks=set.tasks.map(task=>splitLegacyPreparedAnswer(task,set.taskNumber)||task);set.version++;}
    for(const run of runs){run.tasks=run.tasks.map((task,index)=>{const migrated=splitLegacyPreparedAnswer(task,run.taskNumber);if(!migrated)return task;const card=run.cards.find(c=>c.index===index);if(card){card.answers=preparedAnswerTask({answers:card.answers},run.taskNumber).answers;card.answerRevision++;card.lease=null;}return migrated;});run.version++;this.save(run);}
    this.save();
  }
  atomic(filename,data){const tmp=filename+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,filename);}
  save(run){if(run){this.atomic(path.join(this.runsDir,run.id+'.json'),{...run,cards:run.cards.map(card=>({...card,code:{revision:card.code.revision}}))});return;}const {version,sets,assets,active,sessions}=this.data;this.atomic(this.file,{version,sets,assets,runs:{},active,sessions});}
  lock(fn){const job=this.tail.catch(()=>{}).then(fn);this.tail=job;return job;}
  async access(auth,room,write=false){const access=await this.authorize(auth,room,{write});if(!access?.allowed||write&&access.readOnly)fail(403,'Нет доступа к этой доске');return access;}
  async getRun(auth,id,write=false){const run=this.data.runs[id];if(!run)fail(404,'Прохождение не найдено');const access=await this.access(auth,run.room,write);return {run,access};}
  assetFile(asset){return path.join(this.assetsDir,path.basename(asset.storage));}
  putAsset(auth,buffer,name,mime,dimensions={}) {
    if(!teacher(auth))fail(403,'Подготовка доступна преподавателю');
    const id=crypto.randomUUID(),hash=digest(buffer),storage=hash+path.extname(name).replace(/[^.a-z0-9]/gi,'').slice(0,12);
    const destination=path.join(this.assetsDir,storage);if(!fs.existsSync(destination))fs.writeFileSync(destination,buffer,{flag:'wx',mode:0o600});
    const asset={id,teacherId:auth.id,name:text(name,240)||'Файл',mime,storage,size:buffer.length,hash,...dimensions};this.data.assets[id]=asset;this.save();return asset;
  }
  async image(auth,file,crop) {
    if(!file?.buffer?.length||file.buffer.length>8*1024*1024)fail(413,'Изображение должно быть не больше 8 МБ');
    const processor=sharp(file.buffer,{limitInputPixels:40_000_000}).rotate();let buffer=await processor.png().toBuffer();
    if(crop){const info=await sharp(buffer).metadata(),v=key=>Math.max(0,Math.min(0.95,Number(crop[key])||0));const l=v('left'),t=v('top'),r=v('right'),b=v('bottom');if(l+r>=.98||t+b>=.98)fail(400,'Оставьте видимую часть условия');buffer=await sharp(buffer).extract({left:Math.floor(l*info.width),top:Math.floor(t*info.height),width:Math.max(1,Math.floor((1-l-r)*info.width)),height:Math.max(1,Math.floor((1-t-b)*info.height))}).png().toBuffer();}
    const info=await sharp(buffer).metadata();return this.putAsset(auth,buffer,file.originalname||'Условие.png','image/png',{width:info.width,height:info.height});
  }
  async saveSet(auth,input,id) {
    if(!teacher(auth))fail(403,'Подготовка доступна преподавателю');
    const previous=id?this.data.sets[id]:null;if(id&&(!previous||previous.teacherId!==auth.id))fail(404,'Набор не найден');
    if(previous&&input.version!==undefined&&Number(input.version)!==previous.version)fail(409,'Набор уже изменён в другом окне. Черновик сохранён на устройстве; откройте актуальный набор перед заменой.');
    const name=text(input.name,80),taskNumber=Number(input.taskNumber),part=Number(input.partNumber)||1;
    if(!name||!Number.isInteger(taskNumber)||taskNumber<1||taskNumber>27||!Number.isInteger(part)||part<1||part>20)fail(400,'Укажите название, номер ЕГЭ и часть');
    if(!Array.isArray(input.tasks)||!input.tasks.length||input.tasks.length>100)fail(400,'Добавьте от 1 до 100 заданий');
    const sources=await this.sourceFiles(auth),tasks=[];
    for(const [index,raw] of input.tasks.entries()) {
      const normalized=preparedAnswerTask(raw,taskNumber);
      if(raw.answerCountOverride!==undefined&&(!Number.isInteger(Number(raw.answerCountOverride))||Number(raw.answerCountOverride)<1||Number(raw.answerCountOverride)>50))fail(400,'Допустимо от 1 до 50 ячеек ответа');
      const title=text(raw.title,120),format=['exact','number','sequence','unordered','fields','manual'].includes(normalized.format)?normalized.format:'exact';
      const answers=normalized.answers.slice(0,50).map(v=>text(v,500));
      if(format==='manual'&&!answers.length)answers.push('');
      const imageIds=[...new Set(Array.isArray(raw.images)?raw.images:[])].slice(0,8);
      if(!imageIds.length)fail(400,`Добавьте условие задачи ${index+1}`);
      for(const imageId of imageIds){const asset=this.data.assets[imageId];if(!asset||asset.teacherId!==auth.id||!asset.mime.startsWith('image/'))fail(403,'Нет доступа к изображению');}
      if(format!=='manual'&&(!answers.length||answers.some(v=>!v)))fail(400,`Укажите ответ к задаче ${index+1}`);
      if(format==='number'&&!preparedAnswerMatches(answers,answers,'number'))fail(400,`Ответ задачи ${index+1} должен быть числом`);
      const attachments=[];
      for(const ref of (raw.attachments||[]).slice(0,8)) {
        const runtime={runtime:ref.runtime!==false,runtimeName:text(ref.runtimeName,180)};
        const known=this.data.assets[ref.assetId];
        if(known&&known.teacherId===auth.id){attachments.push({assetId:known.id,sourceFileId:text(ref.sourceFileId),name:known.name,...runtime});continue;}
        const source=sources.find(f=>f.id===ref.sourceFileId);if(!source?.path||!fs.existsSync(source.path))fail(404,'Выбранный файл из конспектов недоступен');
        const stat=fs.statSync(source.path);if(stat.size>64*1024*1024)fail(413,'Вложение больше 64 МБ');
        const asset=this.putAsset(auth,fs.readFileSync(source.path),source.name,'application/octet-stream');attachments.push({assetId:asset.id,sourceFileId:source.id,name:source.name,...runtime});
      }
      try{preparedRuntimeFiles(attachments);}catch(error){fail(400,`Задача ${index+1}: ${error.message}`);}
      tasks.push({id:raw.id&&previous?.tasks.some(t=>t.id===raw.id)?raw.id:crypto.randomUUID(),title,format,answers,...(raw.answerCountOverride?{answerCountOverride:Number(raw.answerCountOverride)}:{}),images:imageIds,attachments});
    }
    const set={id:previous?.id||crypto.randomUUID(),teacherId:auth.id,name,taskNumber,partNumber:part,tasks,version:(previous?.version||0)+1,updatedAt:new Date(this.now()).toISOString()};
    this.data.sets[set.id]=set;this.save();return set;
  }
  assetView(assetId,runId=''){const a=this.data.assets[assetId];return a?{id:a.id,name:a.name,sizeBytes:a.size,mime:a.mime,width:a.width,height:a.height,url:`/api/lesson-task-assets/${a.id}${runId?'?run='+encodeURIComponent(runId):''}`} : null;}
  setView(set){return {...set,tasks:set.tasks.map(t=>({...t,imageFiles:t.images.map(id=>this.assetView(id)),attachments:t.attachments.map(a=>({...a,...this.assetView(a.assetId)}))}))};}
  publicRun(run,access) {
    if(!run)return null;
    return {id:run.id,room:run.room,groupId:run.groupId,name:run.name,setId:run.setId,taskNumber:run.taskNumber,partNumber:run.partNumber,mode:run.mode,auto:run.auto,version:run.version,total:run.tasks.length,canManage:teacher(access.auth)&&!access.readOnly,filesUpdateAvailable:teacher(access.auth)&&Boolean(this.data.sets[run.setId]&&preparedFileSync(run.tasks,this.data.sets[run.setId].tasks).changed),setVersion:this.data.sets[run.setId]?.version||run.setVersion,readOnly:access.readOnly,teacherCardId:run.teacherCardId||'',cards:run.cards.map(c=>{
      const task=run.tasks[c.index];return {id:c.id,index:c.index,title:task.title,anchorId:c.anchorId,codeId:c.codeId,width:c.width,height:c.height,status:c.status,lastResult:c.lastResult,answers:c.answers,answerRevision:c.answerRevision,format:task.format,answerCount:task.answers.length||1,lease:c.lease&&c.lease.until>this.now()?{name:c.lease.name,until:c.lease.until,actor:c.lease.actor}:null,images:task.images.map(id=>this.assetView(id,run.id)),attachments:task.attachments.map(a=>({...this.assetView(a.assetId,run.id),assetId:a.assetId,runtime:a.runtime!==false,runtimeName:a.runtimeName||a.name,helper:helperSupported(run,a.name),helperText:textWorkbook(run,a.name),solution:this.solutionView(c.solutions?.[a.assetId])})),codeRevision:c.code?.revision||0};})};
  }
  solutionView(solution){return solution?{id:solution.id,name:solution.name,revision:solution.revision,sizeBytes:solution.size,updatedAt:solution.updatedAt,savedBy:solution.savedBy,url:`/api/lesson-task-solutions/${solution.id}`} : null;}
  async projectCode(run){if(this.code)projectPreparedCode(await this.code(run.room.split('~page~')[0].replace(/^board-/,'collab-')),run);}
  async notify(run,kind='run',cardId=''){await this.projectCode(run);const change={runId:run.id,version:run.version,mode:run.mode,kind,cardId,at:this.now()};const doc=await this.board(run.room);doc.getMap('preparedTaskState').set('change',change);const book=await this.board(run.room.split('~page~')[0].split('~student~')[0]+'~pages');book.getMap('preparedTaskSignals').set(run.room,change);}
  async start(auth,input){return this.lock(async()=>{
    const access=await this.access(auth,input.room,true);if(!teacher(auth))fail(403,'Начать набор может преподаватель');
    const set=this.data.sets[input.setId];if(!set||set.teacherId!==auth.id)fail(404,'Набор не найден');
    const old=this.data.runs[this.data.active[input.room]];if(old){if(old.setId!==set.id)fail(409,'На этой странице уже есть другой набор. Создайте новую страницу.');await this.recover(old);old.mode='prepared';old.version++;this.save(old);await this.notify(old);return this.publicRun(old,access);}
    const x=Number(input.x),y=Number(input.y);if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>900_000||Math.abs(y)>900_000)fail(400,'Укажите место на доске');
    const run={id:crypto.randomUUID(),room:input.room,teacherId:set.teacherId,name:set.name,taskNumber:set.taskNumber,partNumber:set.partNumber,setId:set.id,setVersion:set.version,tasks:structuredClone(set.tasks),cards:[],version:1,mode:'prepared',auto:false,participantIds:access.participantIds||[],studentId:access.studentId||'',groupId:access.groupId||'',start:{x,y},createdAt:new Date(this.now()).toISOString()};
    this.data.runs[run.id]=run;this.data.active[run.room]=run.id;this.save(run);this.save();await this.addCard(run);await this.notify(run);return this.publicRun(run,access);
  });}
  async addCard(run) {
    if(run.cards.length>=run.tasks.length)return;
    const doc=await this.board(run.room),items=doc.getArray('items'),all=items.toArray();if(all.length>=10_000)fail(409,'На доске слишком много объектов');
    const previous=run.cards.at(-1);const anchor=previous&&all.find(i=>i.id===previous.anchorId);if(previous&&!anchor)fail(409,'Предыдущее задание удалено с доски. Восстановите его перед продолжением.');
    // Include unfinished strokes announced by connected writers, not just the
    // last committed scene. A check arriving during a stroke must leave room.
    const previews=Array.from(doc.awareness?.getStates?.().values()||[]).map(s=>s?.drawing).filter(Boolean);
    const point=anchor?preparedNextPoint([...all,...previews],anchor):run.start,index=run.cards.length,task=run.tasks[index];
    const height=124+Math.max(0,Math.ceil(task.answers.length/2)-1)*44+task.images.reduce((sum,id)=>{const a=this.data.assets[id];return sum+Math.min(900,Math.max(60,600*a.height/a.width))+12;},0)+task.attachments.length*230;
    const card={id:crypto.randomUUID(),index,anchorId:'prepared-'+crypto.randomUUID(),codeId:'prepared-'+crypto.randomUUID(),x:point.x,y:point.y,width:640,height,status:'active',answers:task.answers.map(()=>''),answerRevision:0,code:{text:'',input:'',output:'',revision:0},solutions:{}};
    run.cards.push(card);run.teacherCardId=card.id;
    // Canonical card identity is persisted before projection. Reconnecting repairs
    // an interrupted projection, rather than adding another card.
    card.projectionPending=true;this.save(run);doc.transact(()=>items.push([{id:card.anchorId,type:'shape',shape:'rectangle',x:point.x,y:point.y,width:card.width,height:card.height,color:'#ddd6ee',strokeWidth:1,authorId:run.teacherId}]),'prepared-lesson:place');card.projectionPending=false;this.save(run);
    card.x=point.x;card.y=point.y;
  }
  async recover(run){if(!run.cards.length){await this.addCard(run);return;}if(run.cards.some(c=>c.projectionPending)){await this.repair(run,true);this.save(run);}await this.projectCode(run);}
  async repair(run,pendingOnly=false){const doc=await this.board(run.room),items=doc.getArray('items');for(const c of run.cards){if(pendingOnly&&!c.projectionPending)continue;if(!items.toArray().some(i=>i.id===c.anchorId)&&!c.deleted&&Number.isFinite(c.x))doc.transact(()=>items.push([{id:c.anchorId,type:'shape',shape:'rectangle',x:c.x,y:c.y,width:c.width,height:c.height,color:'#ddd6ee',strokeWidth:1,authorId:run.teacherId}]),'prepared-lesson:repair');c.projectionPending=false;}}
  async action(auth,id,input){return this.lock(async()=>{
    const {run,access}=await this.getRun(auth,id,true),manage=teacher(auth),card=run.cards.find(c=>c.id===input.cardId),now=this.now();
    const requireCard=()=>{if(!card)fail(404,'Задача не найдена');};
    const lease=(kind='lease')=>{requireCard();const previous=card[kind];if(!previous||previous.until<now||previous.actor!==actorKey(auth)||previous.key!==input.leaseKey)fail(409,`${previous?.name||'Другой участник'} редактирует поле либо время ввода истекло. Возьмите ввод заново.`);};
    if(['mode','auto','next','skip','focus','restore','layout','sync-files'].includes(input.action)&&!manage)fail(403,'Очередью управляет преподаватель');
    if(input.action==='mode')run.mode=input.mode==='prepared'?'prepared':'plain';
    else if(input.action==='auto')run.auto=input.value===true;
    else if(input.action==='focus'){requireCard();run.teacherCardId=card.id;}
    else if(input.action==='sync-files') {
      const set=this.data.sets[run.setId];if(!set||set.teacherId!==auth.id)fail(404,'Набор не найден');
      if(Number(input.setVersion)!==set.version)fail(409,'Набор изменён. Обновите список и повторите подключение файлов.');
      const update=preparedFileSync(run.tasks,set.tasks);
      for(const task of update.tasks){if(task.attachments.length>16)fail(409,'Слишком много вложений. Используйте новую страницу.');try{preparedRuntimeFiles(task.attachments);}catch(error){fail(409,error.message);}}
      run.tasks=update.tasks;run.filesVersion=set.version;
    }
    else if(input.action==='layout') {
      if(!Array.isArray(input.cards)||input.cards.length>100)fail(400,'Неверные размеры карточек');
      const doc=await this.board(run.room),items=doc.getArray('items');let changed=false;
      const updates=input.cards.map(value=>{const entry=run.cards.find(c=>c.id===value.id),height=Math.ceil(Number(value.height));if(!entry||!Number.isFinite(height)||height<80||height>15000)fail(400,'Неверная высота карточки');return {entry,height};});
      doc.transact(()=>{for(const {entry,height} of updates){
        if(Math.abs(entry.height-height)<2)continue;
        const index=items.toArray().findIndex(item=>item.id===entry.anchorId),anchor=index>=0?items.get(index):null;
        if(anchor){const next={...anchor,height:height*(anchor.height/entry.height)};items.delete(index,1);items.insert(index,[next]);}
        entry.height=height;entry.layoutVersion=2;changed=true;
      }},'prepared-lesson:layout');
      if(!changed)return this.publicRun(run,access);
    }
    else if(input.action==='restore')await this.repair(run);
    else if(input.action==='next'||input.action==='skip'){
      if(input.expectedCount!==run.cards.length)return this.publicRun(run,access);
      const last=run.cards.at(-1);if(input.action==='skip'&&last.status!=='solved')last.status='skipped';
      else if(last.status!=='solved'&&last.status!=='skipped')fail(409,'Сначала проверьте ответ или пропустите задачу');await this.addCard(run);
    } else if(input.action==='claim'||input.action==='claim-code') {
      requireCard();const kind=input.action==='claim'?'lease':'codeLease',previous=card[kind];
      if(previous&&previous.until>now&&(previous.actor!==actorKey(auth)||previous.key!==input.leaseKey)&&!(manage&&input.force===true))fail(409,`${previous.name||'Участник'} сейчас вводит ${kind==='lease'?'ответ':'код'}`);
      card[kind]={actor:actorKey(auth),name:text(auth.name)||'Участник',key:text(input.leaseKey,80),until:now+LEASE_MS};if(!card[kind].key)fail(400,'Не удалось начать редактирование');
    } else if(input.action==='answer') {
      lease();if(Number(input.revision)!==card.answerRevision)fail(409,'Ответ уже изменён. Ваш ввод сохранён на экране; обновите данные перед повтором.');
      if(card.status==='solved')fail(409,'Задача уже решена');if(!Array.isArray(input.answers)||input.answers.length!==(run.tasks[card.index].answers.length||1)||input.answers.some(v=>typeof v!=='string'||v.length>500))fail(400,'Неверный формат полей ответа');card.answers=input.answers.map(v=>v.replace(/\0/g,''));card.answerRevision++;if(card.lease)card.lease.until=now+LEASE_MS;
    } else if(input.action==='check') {
      requireCard();if(card.status==='solved')return this.publicRun(run,access);lease();
      if(Number(input.revision)!==card.answerRevision)fail(409,'Ответ успел измениться. Проверьте актуальный ответ.');
      if(!card.answers.some(v=>v.trim())&&!(manage&&input.accept))fail(400,'Сначала введите ответ');
      const task=run.tasks[card.index];if(task.format==='manual'&&!manage)fail(409,'Это задание проверяет преподаватель');
      card.lastCheckAt=now;card.attempts=(card.attempts||0)+1;
      const correct=(manage&&input.accept===true)||preparedAnswerMatches(task.answers,card.answers,task.format);
      card.lastResult=correct?'correct':'wrong';card.lease=null;if(correct){card.status='solved';card.solvedBy=actorKey(auth);if(run.auto&&card===run.cards.at(-1))await this.addCard(run);}
    } else if(input.action==='release') {requireCard();for(const kind of ['lease','codeLease'])if(card[kind]?.key===input.leaseKey)card[kind]=null;}
    else if(input.action==='code') {
      lease('codeLease');if(Number(input.revision)!==card.code.revision)fail(409,'Код обновлён другим участником. Ваш текст сохранён локально.');
      card.code={...card.code,text:String(input.code??card.code.text).slice(0,20000),input:String(input.input??card.code.input).slice(0,10000),output:String(input.output??card.code.output).slice(0,100000),revision:card.code.revision+1};if(card.codeLease)card.codeLease.until=now+LEASE_MS;
    } else if(input.action==='release-file') {requireCard();const b=card.bindings?.[input.assetId];if(b&&(manage||b.actor===actorKey(auth))){b.until=0;b.generation++;}}
    else fail(400,'Неизвестное действие');
    run.version++;if(input.action==='code')this.atomic(path.join(this.runsDir,`${run.id}-${card.id}.code.json`),card.code);this.save(run);await this.notify(run,input.action==='code'||input.action==='claim-code'?'code':'run',card?.id||'');
    if(input.action==='code'||input.action==='claim-code')return {id:run.id,room:run.room,version:run.version,changeOnly:'code'};
    return {...this.publicRun(run,access),result:card?.lastResult};
  });}
  async startHelper(auth,id,cardId,assetId){return this.lock(async()=>{
    const {run}=await this.getRun(auth,id,true),card=run.cards.find(c=>c.id===cardId),attachment=card&&run.tasks[card.index].attachments.find(a=>a.assetId===assetId);
    if(!attachment||!helperSupported(run,attachment.name))fail(400,'Для этого файла помощник таблиц недоступен');
    card.bindings||={};let binding=card.bindings[assetId];const now=this.now();
    if(binding&&binding.until>now&&binding.actor!==actorKey(auth))fail(409,`${binding.name} редактирует общий файл. Дождитесь сохранения и передачи работы.`);
    binding={id:binding?.id||digest(run.id+card.id+assetId),actor:actorKey(auth),name:text(auth.name)||'Участник',until:now+WRITER_MS,generation:(binding?.generation||0)+1};card.bindings[assetId]=binding;
    const ticket='pt_'+crypto.randomBytes(32).toString('base64url');for(const [key,t]of this.tickets)if(t.expires<now)this.tickets.delete(key);if(this.tickets.size>1000)fail(429,'Слишком много запусков помощника');
    this.tickets.set(digest(ticket),{runId:id,cardId,assetId,auth:{id:auth.id,role:auth.role,name:auth.name},generation:binding.generation,expires:now+180000});this.save(run);
    return {ticket,expiresAt:new Date(now+180000).toISOString(),fileName:card.solutions[assetId]?.name||helperName(run,this.data.assets[assetId]),requiresName:false};
  });}
  async exchange(ticket,userAgent='') {const key=digest(ticket),entry=this.tickets.get(key);if(!entry||entry.expires<this.now())fail(410,'Ссылка запуска истекла');const {run}=await this.getRun(entry.auth,entry.runId,true),card=run.cards.find(c=>c.id===entry.cardId);if(card.bindings?.[entry.assetId]?.generation!==entry.generation)fail(409,'Право редактирования файла уже передано');for(const [id,s]of Object.entries(this.data.sessions))if(s.expires<this.now())delete this.data.sessions[id];if(Object.keys(this.data.sessions).length>=5000)fail(429,'Слишком много открытых таблиц');const sourceAsset=this.data.assets[entry.assetId],isText=textWorkbook(run,sourceAsset.name);if(isText&&sourceAsset.size>16*1024*1024)fail(413,'Текстовый файл больше допустимых 16 МБ');const helperVersion=userAgent.match(/IvanEgeWorkbookHelper\/(\d+)\.(\d+)/i);if(isText&&helperVersion&&(Number(helperVersion[1])<1||Number(helperVersion[1])===1&&Number(helperVersion[2])<2))fail(426,'Для заданий с текстом нужен помощник версии 1.2 или новее.');const token='pt_'+crypto.randomBytes(32).toString('base64url'),session={...entry,expires:this.now()+30*86400000};this.data.sessions[digest(token)]=session;this.tickets.delete(key);this.save();const asset=this.data.assets[entry.assetId],solution=card.solutions[entry.assetId];return {token,workbookKey:card.bindings[entry.assetId].id,fileName:solution?.name||helperName(run,asset),solutionName:solution?.name||helperName(run,asset),requiresName:false,nameRequired:false,revision:solution?.revision||0,contentHash:solution?.hash||helperHash(run,asset),expiresAt:new Date(session.expires).toISOString(),sourceText:isText?{fileName:asset.name,contentHash:asset.hash,sizeBytes:asset.size,contentPath:'/workbook-helper/v1/source-text'}:null};}
  async helperSession(token){const session=this.data.sessions[digest(token)];if(!session||session.expires<this.now())fail(401,'Привязка помощника истекла');const {run}=await this.getRun(session.auth,session.runId,true),card=run.cards.find(c=>c.id===session.cardId);if(!card)fail(410,'Задача недоступна');return {session,run,card};}
  async saveSolution({auth,run,card,assetId,buffer,name,revision,generation,hash}){
    const binding=card.bindings?.[assetId];if(!binding||binding.actor!==actorKey(auth)||binding.generation!==generation)fail(409,'Право записи передано другому участнику. Сохраните локальную копию.');
    const asset=this.data.assets[assetId],previous=card.solutions[assetId],actualHash=digest(buffer);
    if(!isWorkbookFileName(name)||!workbookSolutionFormatAllowed(path.extname(helperName(run,asset)).toLowerCase(),path.extname(name).toLowerCase()))fail(415,'Сохраните решение в формате исходной таблицы');
    if(hash&&actualHash!==hash)fail(400,'Контрольная сумма файла не совпала');
    if(Number(revision)!==(previous?.revision||0)) {if(previous?.hash===actualHash)return previous;const storage='conflict-'+crypto.randomUUID()+path.extname(name);fs.writeFileSync(path.join(this.assetsDir,storage),buffer,{mode:0o600});card.conflicts||=[];card.conflicts.push({storage,name,actor:actorKey(auth),at:this.now()});this.save(run);fail(409,'На сервере более новая версия. Локальная и конфликтная копии сохранены; откройте актуальное решение.');}
    const storage=actualHash+path.extname(name).toLowerCase();if(!fs.existsSync(path.join(this.assetsDir,storage)))fs.writeFileSync(path.join(this.assetsDir,storage),buffer,{mode:0o600});
    const now=new Date(this.now()).toISOString(),solution={id:previous?.id||'prepared-'+crypto.randomUUID(),name:text(name,240)||asset.name,storage,hash:actualHash,size:buffer.length,revision:(previous?.revision||0)+1,savedBy:{id:auth.id,role:auth.role,name:text(auth.name)},updatedAt:now};
    card.solutions[assetId]=solution;binding.until=this.now()+WRITER_MS;run.version++;this.save(run);await this.saveNotes?.(run,solution);await this.notify(run,'file',card.id);return solution;
  }
  notesForStudent(studentId){const files=[];for(const run of Object.values(this.data.runs)){if(run.studentId!==studentId&&!run.participantIds.includes(studentId))continue;for(const card of run.cards)for(const solution of Object.values(card.solutions||{})){const folder=solution.folders?.[studentId];files.push({id:solution.id,studentId,teacherId:run.teacherId,name:solution.name,taskNumber:run.taskNumber,category:'class',folderId:folder?.id||null,folderName:folder?.name||'Решённые задания',workbookPartNumber:run.partNumber,sizeBytes:solution.size,date:new Date(solution.updatedAt).toLocaleDateString('ru-RU'),createdAt:solution.updatedAt,updatedAt:solution.updatedAt,url:`/api/lesson-task-solutions/${solution.id}`,preparedRunId:run.id,preparedCardId:card.id,savedBy:solution.savedBy});}}return files;}
}

const handler=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(error){if(res.headersSent)return next(error);res.status(error.status||500).json({error:error.status?error.message:'Не удалось выполнить действие с заданием. Данные не удалены.'});}};
const workbookUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:64*1024*1024}});
export function registerPreparedHelperRoutes(app,store,{allowExchange=()=>true,allowContent=()=>true}={}){
  app.post('/workbook-helper/v1/exchange',handler(async(req,res,next)=>{if(!String(req.body?.ticket||'').startsWith('pt_'))return next();if(!allowExchange(req))fail(429,'Слишком много запусков помощника. Повторите через минуту.');res.setHeader('Cache-Control','no-store');res.json(await store.lock(()=>store.exchange(req.body.ticket,String(req.headers['user-agent']||''))));}));
  const intercept=handler(async(req,res,next)=>{const token=parseWorkbookHelperAuthorization(req.headers.authorization);if(!token.startsWith('pt_'))return next();if(!allowContent(req))fail(429,'Слишком много запросов к таблице. Повторите через минуту.');req.preparedHelper=await store.helperSession(token);next();});
  app.get('/workbook-helper/v1/source-text',intercept,handler(async(req,res,next)=>{if(!req.preparedHelper)return next();const {session,run}=req.preparedHelper,asset=store.data.assets[session.assetId];if(!textWorkbook(run,asset.name))fail(404,'Исходный текст недоступен');if(asset.size>16*1024*1024)fail(413,'Текстовый файл больше допустимых 16 МБ');res.setHeader('Cache-Control','no-store');res.setHeader('X-Source-Text-Content-Hash',asset.hash);res.attachment(asset.name);res.sendFile(store.assetFile(asset));}));
  app.get('/workbook-helper/v1/content',intercept,handler(async(req,res,next)=>{if(!req.preparedHelper)return next();const {session,run,card}=req.preparedHelper,solution=card.solutions[session.assetId],asset=store.data.assets[session.assetId];res.setHeader('Cache-Control','no-store');res.setHeader('X-Workbook-Key',card.bindings[session.assetId].id);res.setHeader('X-Workbook-Revision',String(solution?.revision||0));res.setHeader('X-Workbook-Content-Hash',solution?.hash||helperHash(run,asset));res.attachment(solution?.name||helperName(run,asset));if(!solution&&textWorkbook(run,asset.name))res.send(BLANK_WORKBOOK_ODS);else res.sendFile(store.assetFile(solution||asset));}));
  app.put('/workbook-helper/v1/content',intercept,(req,res,next)=>req.preparedHelper?workbookUpload.single('file')(req,res,next):next(),handler(async(req,res,next)=>{if(!req.preparedHelper)return next();if(!req.file)fail(400,'Файл не найден');const {session,run,card}=req.preparedHelper;const solution=await store.lock(()=>store.saveSolution({auth:session.auth,run,card,assetId:session.assetId,generation:session.generation,buffer:req.file.buffer,name:req.body.solutionName||req.file.originalname,revision:req.body.revision??req.headers['x-workbook-revision'],hash:req.body.contentHash||req.headers['x-workbook-content-hash']}));res.json({ok:true,revision:solution.revision,contentHash:solution.hash,fileName:solution.name,solutionName:solution.name,workbookKey:card.bindings[session.assetId].id,requiresName:false,nameRequired:false});}));
}
export function registerPreparedTaskRoutes(app,store){
  app.get('/api/lesson-task-sets',handler(async(req,res)=>{if(!teacher(req.auth))fail(403,'Подготовка доступна преподавателю');res.json({sets:Object.values(store.data.sets).filter(s=>s.teacherId===req.auth.id&&(!req.query.taskNumber||s.taskNumber===Number(req.query.taskNumber))).map(s=>store.setView(s))});}));
  app.post('/api/lesson-task-sets',handler(async(req,res)=>res.status(201).json(await store.lock(()=>store.saveSet(req.auth,req.body)))));
  app.put('/api/lesson-task-sets/:id',handler(async(req,res)=>res.json(await store.lock(()=>store.saveSet(req.auth,req.body,req.params.id)))));
  app.get('/api/lesson-task-sources',handler(async(req,res)=>{if(!teacher(req.auth))fail(403,'Нет доступа');const sources=await store.sourceFiles(req.auth);res.json({files:sources.filter(f=>!req.query.taskNumber||f.taskNumber===Number(req.query.taskNumber)).map(file=>({id:file.id,name:file.name,taskNumber:file.taskNumber,category:file.category,folderName:file.folderName}))});}));
  app.post('/api/lesson-task-images',workbookUpload.single('file'),handler(async(req,res)=>res.status(201).json(store.assetView((await store.lock(()=>store.image(req.auth,req.file))).id))));
  app.post('/api/lesson-task-images/:id/crop',handler(async(req,res)=>{const asset=store.data.assets[req.params.id];if(!teacher(req.auth)||asset?.teacherId!==req.auth.id)fail(404,'Изображение не найдено');res.json(store.assetView((await store.lock(()=>store.image(req.auth,{buffer:fs.readFileSync(store.assetFile(asset)),originalname:asset.name},req.body))).id));}));
  app.get('/api/lesson-task-run',handler(async(req,res)=>{const access=await store.access(req.auth,text(req.query.room,760)),run=store.data.runs[store.data.active[req.query.room]];if(run)await store.lock(()=>store.recover(run));res.json({run:store.publicRun(run,access)});}));
  app.post('/api/lesson-task-runs',handler(async(req,res)=>res.status(201).json({run:await store.start(req.auth,req.body)})));
  app.post('/api/lesson-task-runs/:id/action',handler(async(req,res)=>res.json({run:await store.action(req.auth,req.params.id,req.body)})));
  app.get('/api/lesson-task-runs/:id/cards/:cardId/code',handler(async(req,res)=>{const {run}=await store.getRun(req.auth,req.params.id),card=run.cards.find(c=>c.id===req.params.cardId);if(!card)fail(404,'Задача не найдена');res.json({...card.code,lease:card.codeLease&&card.codeLease.until>store.now()?{actor:card.codeLease.actor,name:card.codeLease.name,until:card.codeLease.until}:null});}));
  app.post('/api/lesson-task-runs/:id/helper',handler(async(req,res)=>res.status(201).json(await store.startHelper(req.auth,req.params.id,req.body.cardId,req.body.assetId))));
  app.post('/api/lesson-task-runs/:id/solution',workbookUpload.single('file'),handler(async(req,res)=>{const {run}=await store.getRun(req.auth,req.params.id,true),card=run.cards.find(c=>c.id===req.body.cardId),assetId=req.body.assetId;if(!card||!run.tasks[card.index].attachments.some(a=>a.assetId===assetId)||!req.file)fail(400,'Выберите задачу и файл');await store.startHelper(req.auth,run.id,card.id,assetId);const binding=card.bindings[assetId];const solution=await store.lock(()=>store.saveSolution({auth:req.auth,run,card,assetId,generation:binding.generation,buffer:req.file.buffer,name:req.file.originalname,revision:Number(req.body.revision)}));res.json({solution:store.solutionView(solution)});}));
  app.get('/api/lesson-task-assets/:id',handler(async(req,res)=>{const asset=store.data.assets[req.params.id];if(!asset)fail(404,'Файл не найден');if(asset.teacherId!==req.auth.id||!teacher(req.auth)){const {run}=await store.getRun(req.auth,text(req.query.run));if(!run.cards.some(c=>{const task=run.tasks[c.index];return task.images.includes(asset.id)||task.attachments.some(a=>a.assetId===asset.id);}))fail(403,'Файл ещё не добавлен на доску');}res.setHeader('Cache-Control','private, no-store');res.type(asset.mime);if(!asset.mime.startsWith('image/'))res.attachment(asset.name);res.sendFile(store.assetFile(asset));}));
  app.get('/api/lesson-task-solutions/:id',handler(async(req,res)=>{let found;for(const run of Object.values(store.data.runs)){for(const card of run.cards){const solution=Object.values(card.solutions).find(s=>s.id===req.params.id);if(solution){found={run,solution};break;}}if(found)break;}if(!found)fail(404,'Решение не найдено');await store.access(req.auth,found.run.room);res.setHeader('Cache-Control','private, no-store');res.attachment(found.solution.name);res.sendFile(store.assetFile(found.solution));}));
}
