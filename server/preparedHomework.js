import fs from 'node:fs';
import {preparedTaskSource} from '../src/utils/preparedRunSources.js';
import path from 'node:path';
import crypto from 'node:crypto';
import {getCollabSolutionChannels} from '../src/utils/collabSolutions.js';
import {isPreparedHomeworkGoal,normalizePreparedHomeworkGoal} from '../src/utils/preparedHomework.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const staff=auth=>['teacher','admin'].includes(auth?.role);
const clone=value=>structuredClone(value);
const cleanBoard=value=>JSON.parse(JSON.stringify(value,(key,item)=>['_auth','authToken','access_token'].includes(key)?undefined:typeof item==='string'?item.replace(/([?&])(?:_auth|authToken|access_token)=[^&#]*/g,'$1').replace(/\?&/g,'?').replace(/&&/g,'&').replace(/[?&]$/,''):item));
const scopeKey=({studentId,groupId})=>groupId?`group:${groupId}`:`student:${studentId}`;
const goalRefs=entry=>(Array.isArray(entry?.goals)?entry.goals:[]).filter(isPreparedHomeworkGoal);
const sourceAssets=task=>new Set([...task.images,...task.attachments.map(file=>file.assetId)]);

// The library and lesson remain immutable sources. A published reference opens
// one private prepared run per pupil; all answer checks use the existing server.
export class PreparedHomework {
  constructor({directory,prepared,student,homeworks,writable=({homework})=>homework.learningAssignmentStatus!=='closed',now=Date.now}){
    this.directory=directory;this.prepared=prepared;this.student=student;this.homeworks=homeworks;this.writable=writable;this.now=now;
    fs.mkdirSync(directory,{recursive:true});this.file=path.join(directory,'state.json');
    this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,snapshots:{},baskets:{},workspaces:{}};
    if(this.data.version!==1||!this.data.snapshots||!this.data.workspaces)throw Error('Неподдерживаемое хранилище домашних задач');
    for(const [id,snapshot]of Object.entries(this.data.snapshots))if(snapshot.stored)this.data.snapshots[id]=JSON.parse(fs.readFileSync(path.join(directory,'snapshot-'+id+'.json'),'utf8'));
    this.links=new Map(Object.values(this.data.workspaces).map(row=>[`${row.studentId}:${row.snapshotId}`,row]));
  }
  save(){const snapshots=Object.fromEntries(Object.values(this.data.snapshots).map(snapshot=>[snapshot.id,{id:snapshot.id,stored:true}]));this.prepared.atomic(this.file,{...this.data,snapshots});}
  goal(snapshot){return normalizePreparedHomeworkGoal({type:'prepared',preparedId:snapshot.id,title:snapshot.task.title||`Задача ${snapshot.sourceIndex+1}`,taskNumber:snapshot.taskNumber,partNumber:snapshot.partNumber});}
  basket(auth,scope){
    if(!staff(auth))fail(403,'Выдаёт домашку преподаватель');
    return (this.data.baskets[`${auth.id}:${scopeKey(scope)}`]||[]).map(id=>this.data.snapshots[id]).filter(Boolean).map(snapshot=>this.goal(snapshot));
  }
  async queue(auth,input){return this.prepared.lock(async()=>{
    const {run}=await this.prepared.getRun(auth,input.runId,true);
    if(!staff(auth)||run.teacherId!==auth.id||run.homework)fail(403,'Выберите свою задачу на уроке');
    const card=run.cards.find(card=>card.id===input.cardId);if(!card)fail(404,'Задача не найдена');
    if(run.tasks[card.index].kind==='theory')fail(400,'Теория — вступление к набору. Выберите задачу для домашней работы.');
    const key=`${auth.id}:${scopeKey(run)}`,basket=this.data.baskets[key]||[];
    const duplicate=basket.map(id=>this.data.snapshots[id]).find(snapshot=>snapshot.sourceRunId===run.id&&snapshot.sourceCardId===card.id);
    if(duplicate)return {goal:this.goal(duplicate),alreadyQueued:true};
    if(basket.length>=60)fail(400,'В черновике уже 60 задач с урока. Сначала выдайте домашку.');
    const task=clone(run.tasks[card.index]),doc=await this.prepared.board(run.room),all=doc.getArray('items').toArray(),anchor=all.find(item=>item.id===card.anchorId);
    if(!anchor)fail(409,'Сначала верните карточку на доску');
    const codeDoc=await this.prepared.code(run.room.split('~page~')[0].replace(/^board-/,'collab-')),channels=getCollabSolutionChannels(codeDoc,card.codeId);
    const other=run.cards.map(row=>all.find(item=>item.id===row.anchorId)).filter(item=>item&&item.y>anchor.y&&Math.abs(item.x-anchor.x)<anchor.width+120).sort((a,b)=>a.y-b.y)[0];
    const bottom=other?.y??anchor.y+Math.max(anchor.height+600,1800);
    const notes=all.filter(item=>{
      if(run.cards.some(card=>card.anchorId===item.id))return false;
      const points=item.points||[item.start,item.end].filter(Boolean),x=points.length?Math.min(...points.map(p=>p.x)):Number(item.x),y=points.length?Math.min(...points.map(p=>p.y)):Number(item.y);
      return Number.isFinite(x)&&Number.isFinite(y)&&x>=anchor.x-150&&x<=anchor.x+anchor.width+150&&y>=anchor.y&&y<bottom;
    }).map(cleanBoard);
    // Geometry comes from the teacher's visible card; IDs and asset bytes are
    // resolved only from the authorized source task, never from supplied URLs.
    const geometry=Array.isArray(input.images)?input.images:[],scale=anchor.width/card.width;
    let fallbackY=anchor.y+100*scale;
    const images=task.images.map(id=>{
      const asset=this.prepared.data.assets[id],supplied=geometry.find(row=>row.id===id),height=Math.min(900,600*asset.height/asset.width)*scale;
      const box=supplied&&['x','y','width','height'].every(key=>Number.isFinite(supplied[key])&&Math.abs(supplied[key])<1e6)&&supplied.width>0&&supplied.height>0?supplied:{x:anchor.x+18*scale,y:fallbackY,width:600*scale,height};
      fallbackY=box.y+box.height+12*scale;
      return {id:'homework-condition-'+crypto.randomUUID(),type:'image',preparedAssetId:id,x:box.x,y:box.y,width:box.width,height:box.height};
    });
    const source=preparedTaskSource(run,task,card.index);
    const id=crypto.randomUUID(),snapshot={id,initialAnswers:card.status==='solved'?task.answers.map(()=>''):clone(card.answers),initialFieldResults:card.status==='solved'?[]:clone(card.fieldResults||[]),teacherId:auth.id,studentId:run.studentId||'',groupId:run.groupId||'',sourceRunId:run.id,sourceCardId:card.id,sourceIndex:card.index,taskNumber:source.taskNumber,partNumber:source.partNumber,task,board:{items:[...images,...notes],viewport:{zoom:Math.min(.65,320/anchor.width),offset:{x:anchor.x-40,y:anchor.y-30}}},code:{code:channels.codeText.toString()||card.code?.text||'',input:channels.runMap.get('stdinDraft')||channels.runMap.get('input')||card.code?.input||'',testFile:channels.testFileText.toString(),output:'',error:'',status:'idle'},createdAt:new Date(this.now()).toISOString()};
    // A partially solved spreadsheet is copied as an initial private version.
    snapshot.solutions={};
    for(const file of task.attachments){const solution=card.solutions?.[file.assetId];if(solution)snapshot.solutions[file.assetId]=clone(solution);}
    this.prepared.atomic(path.join(this.directory,'snapshot-'+id+'.json'),snapshot);
    this.data.snapshots[id]=snapshot;this.data.baskets[key]=[...basket,id];
    try{this.save();}catch(error){delete this.data.snapshots[id];this.data.baskets[key]=basket;throw error;}
    return {goal:this.goal(snapshot),alreadyQueued:false};
  });}
  validateGoals(auth,scope,goals){
    if((goals||[]).length>50)fail(400,'В одной домашке можно выдать до 50 целей.');
    return (goals||[]).map(goal=>{
      if(!isPreparedHomeworkGoal(goal))return goal;
      const snapshot=this.data.snapshots[goal.preparedId];
      if(!snapshot||snapshot.teacherId!==auth.id||scopeKey(snapshot)!==scopeKey(scope))fail(404,'Задача с урока недоступна этому получателю');
      return {...this.goal(snapshot),assignmentTier:goal.assignmentTier==='optional'?'optional':'required'};
    });
  }
  consume(auth,scope,goals){
    const ids=new Set(goalRefs({goals}).map(goal=>goal.preparedId)),key=`${auth.id}:${scopeKey(scope)}`;
    this.data.baskets[key]=(this.data.baskets[key]||[]).filter(id=>!ids.has(id));this.save();
  }
  assigned(auth,snapshotId,studentId){
    const snapshot=this.data.snapshots[snapshotId],pupil=this.student(studentId);
    if(!snapshot||!pupil||pupil.teacherId!==snapshot.teacherId||!(auth?.role==='student'&&auth.id===studentId||staff(auth)&&auth.id===snapshot.teacherId))fail(404,'Домашняя задача не найдена');
    const homework=this.homeworks(studentId).find(entry=>goalRefs(entry).some(goal=>goal.preparedId===snapshotId));
    if(!homework)fail(404,'Эта задача ещё не выдана ученику');
    return {snapshot,pupil,homework};
  }
  access(auth,room,{write=false}={}){
    const id=String(room).replace(/^prepared-homework-/,'');const entry=this.data.workspaces[id];if(!entry)return {allowed:false};
    try{const {homework}=this.assigned(auth,entry.snapshotId,entry.studentId);const readOnly=Boolean(!staff(auth)&&(homework.learningHomeworkCancelledAt||homework.learningMembershipEndedAt||!this.writable({studentId:entry.studentId,homework})));return {allowed:!write||!readOnly,readOnly,auth,studentId:entry.studentId,participantIds:[]};}catch{return {allowed:false};}
  }
  workspaceFile(id){return path.join(this.directory,id+'.json');}
  async open(auth,id,studentId){return this.prepared.lock(async()=>{
    const {snapshot,homework}=this.assigned(auth,id,studentId);
    let entry=this.links.get(`${studentId}:${id}`),run=entry&&this.prepared.data.runs[entry.runId];
    if(!run){
      const runId=crypto.randomUUID(),cardId=crypto.randomUUID(),task=clone(snapshot.task);
      const card={id:cardId,index:0,anchorId:'prepared-'+crypto.randomUUID(),codeId:'prepared-'+crypto.randomUUID(),x:0,y:0,width:640,height:300,status:'active',answers:clone(snapshot.initialAnswers||task.answers.map(()=>'')),fieldResults:clone(snapshot.initialFieldResults||[]),answerRevision:0,code:{text:snapshot.code.code,input:snapshot.code.input,output:'',revision:0},solutions:{}};
      for(const [assetId,source]of Object.entries(snapshot.solutions)){card.solutions[assetId]={...clone(source),id:crypto.randomUUID(),revision:0,attemptId:'',attemptNumber:1};}
      run={id:runId,room:'prepared-homework-'+runId,teacherId:snapshot.teacherId,studentId,groupId:'',participantIds:[],name:snapshot.task.title,taskNumber:snapshot.taskNumber,partNumber:snapshot.partNumber,setId:'',tasks:[task],cards:[card],version:1,mode:'prepared',auto:false,createdAt:new Date(this.now()).toISOString(),homework:{snapshotId:id,studentId,homeworkId:homework.id}};
      entry={runId,snapshotId:id,studentId};this.prepared.data.runs[runId]=run;this.data.workspaces[runId]=entry;this.links.set(`${studentId}:${id}`,entry);
      this.prepared.save(run);this.prepared.data.active[run.room]=runId;this.prepared.save();this.save();
    }
    const file=this.workspaceFile(entry.runId),workspace=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{revision:0,code:clone(snapshot.code),board:clone(snapshot.board)};
    const access=this.access(auth,run.room);
    const view=this.prepared.publicRun(run,access);
    // Shared lesson solutions are immutable seeds; downloads remain authorized
    // by the source snapshot until this pupil makes their first private save.
    for(const file of view.cards[0].attachments){const solution=run.cards[0].solutions[file.assetId];if(solution&&snapshot.solutions[file.assetId]?.storage===solution.storage&&solution.revision===0)file.solution.url=`/api/prepared-homework/${id}/solution/${file.assetId}?studentId=${encodeURIComponent(studentId)}`;}
    return {snapshotId:id,studentId,run:view,workspace,readOnly:access.readOnly||staff(auth),title:this.goal(snapshot).title};
  });}
  async saveWorkspace(auth,id,studentId,input){return this.prepared.lock(()=>{
    this.assigned(auth,id,studentId);if(auth.role!=='student')fail(403,'Личную копию редактирует ученик');
    const entry=this.links.get(`${studentId}:${id}`);if(!entry||!this.access(auth,'prepared-homework-'+entry.runId,{write:true}).allowed)fail(403,'Эта домашняя работа закрыта');
    const filename=this.workspaceFile(entry.runId),old=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):{revision:0};
    if(input.revision!==old.revision)fail(409,'Копия изменена в другом окне. Сохраните локальный черновик и откройте актуальную версию.');
    if(!input.code||typeof input.code!=='object'||!input.board||!Array.isArray(input.board.items)||input.board.items.length>10000||JSON.stringify(input).length>8*1024*1024)fail(400,'Некорректная копия решения');
    const workspace={revision:old.revision+1,code:Object.fromEntries(['code','input','testFile','output','error','status'].map(key=>[key,String(input.code[key]||'').slice(0,key==='code'?100000:200000)])),board:cleanBoard(input.board),updatedAt:new Date(this.now()).toISOString()};
    this.prepared.atomic(filename,workspace);return workspace;
  });}
  result(studentId,id){
    const entry=this.links.get(`${studentId}:${id}`),card=entry&&this.prepared.data.runs[entry.runId]?.cards[0];
    return {completedAt:card?.status==='solved'?new Date(card.lastCheckAt).toISOString():null,attempts:card?.attempts||0,lastResult:card?.lastResult||'',wrongCount:card?.homeworkWrongCount||0};
  }
  projectEntry(studentId,entry){return entry&&{...entry,goals:(entry.goals||[]).map(goal=>isPreparedHomeworkGoal(goal)?{...goal,preparedResult:this.result(studentId,goal.preparedId)}:goal)};}
}

const route=fn=>async(req,res)=>{res.set('Cache-Control','private, no-store');res.vary('Authorization');try{await fn(req,res);}catch(error){res.status(error.status||500).json({error:error.status?error.message:'Не удалось открыть задачу с урока'});}};
export function registerPreparedHomeworkRoutes(app,store){
  app.get('/api/prepared-homework/basket',route((req,res)=>res.json({goals:store.basket(req.auth,req.query)})));
  app.post('/api/prepared-homework/basket',route(async(req,res)=>res.status(201).json(await store.queue(req.auth,req.body))));
  app.delete('/api/prepared-homework/basket/:id',route(async(req,res)=>{if(!staff(req.auth))fail(403,'Нет доступа');await store.prepared.lock(()=>store.consume(req.auth,req.query,[{type:'prepared',preparedId:req.params.id}]));res.json({ok:true});}));
  app.get('/api/prepared-homework/:id/preview',route((req,res)=>{const snapshot=store.data.snapshots[req.params.id];if(!staff(req.auth)||snapshot?.teacherId!==req.auth.id)fail(404,'Задача не найдена');res.json({goal:store.goal(snapshot),images:snapshot.task.images.map(id=>store.prepared.assetView(id)),files:snapshot.task.attachments.map(file=>store.prepared.assetView(file.assetId))});}));
  app.post('/api/prepared-homework/:id/open',route(async(req,res)=>res.json(await store.open(req.auth,req.params.id,req.auth.role==='student'?req.auth.id:String(req.body.studentId||'')))));
  app.put('/api/prepared-homework/:id/workspace',route(async(req,res)=>res.json(await store.saveWorkspace(req.auth,req.params.id,req.auth.id,req.body))));
  app.get('/api/prepared-homework/:id/assets/:assetId',route((req,res)=>{
    const id=req.auth.role==='student'?req.auth.id:String(req.query.studentId||'');const {snapshot}=store.assigned(req.auth,req.params.id,id);
    if(!sourceAssets(snapshot.task).has(req.params.assetId))fail(404,'Файл не найден');const asset=store.prepared.data.assets[req.params.assetId];if(!asset)fail(404,'Файл недоступен');res.type(asset.mime);if(!asset.mime.startsWith('image/'))res.attachment(asset.name);res.sendFile(store.prepared.assetFile(asset));
  }));
  app.get('/api/prepared-homework/:id/solution/:assetId',route((req,res)=>{
    const {snapshot}=store.assigned(req.auth,req.params.id,req.auth.role==='student'?req.auth.id:String(req.query.studentId||'')),solution=snapshot.solutions[req.params.assetId];if(!solution)fail(404,'Решение не найдено');res.attachment(solution.name);res.sendFile(store.prepared.assetFile(solution));
  }));
}
