import fs from 'node:fs';
import {preparedTaskSource} from '../src/utils/preparedRunSources.js';
import path from 'node:path';
import crypto from 'node:crypto';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const moscowDay = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Moscow', year:'numeric', month:'2-digit', day:'2-digit'});
const topic = event => `${event.taskNumber}:${event.partNumber}`;

export function lessonAchievementContext(run,auth,{target,connections=[],sessions=[],students=[],now=Date.now()}={}) {
  const sameScope = value => run.groupId
    ? (value?.groupId||value?.session?.groupId||value?.group?.id)===run.groupId
    : value?.studentId===run.studentId;
  const connected=connections.filter(connection=>{
    const target=connection.target;
    const archived=target?.session?.status==='completed'||target?.group?.status==='completed';
    // The page index and shared code are intentionally read-only for pupils
    // during a live lesson. Their authenticated connections still prove presence.
    const presentSurface=!connection.readOnly||!archived&&(target?.boardPagesBook||target?.kind==='collab');
    return connection.open&&!archived&&presentSurface&&sameScope(target);
  });
  const teacherPresent=['teacher','admin'].includes(auth.role)||connected.some(connection=>['teacher','admin'].includes(connection.auth?.role)&&connection.auth.id===run.teacherId);
  const online=new Set(connected.filter(connection=>connection.auth?.role==='student').map(connection=>connection.auth.id));
  if(auth.role==='student')online.add(auth.id);
  const eligible=run.studentId?[run.studentId]:run.participantIds;
  const participants=teacherPresent?students.filter(student=>eligible.includes(student.id)&&online.has(student.id)&&student.teacherId===run.teacherId).map(student=>({id:student.id,name:student.name})):[];
  const candidates=sessions.filter(session=>session.status!=='cancelled'&&session.teacherId===run.teacherId&&(run.groupId?session.groupId===run.groupId:!session.groupId&&(session.participantIdsSnapshot||session.participantIds||[]).includes(run.studentId))).filter(session=>{
    const start=Date.parse(session.startAt);return Number.isFinite(start)&&now>=start-5*60000&&now<=start+(Math.max(15,Number(session.durationMinutes)||60)+30)*60000;
  }).sort((a,b)=>Math.abs(now-Date.parse(a.startAt))-Math.abs(now-Date.parse(b.startAt)));
  return {participants,lessonId:target?.session?.id||candidates[0]?.id||''};
}

// Only this server-owned ledger supplies lesson facts. Client progress payloads,
// saved code, partial answers and old cards without a completion receipt do not.
export function lessonAchievementFacts(events = []) {
  const facts = {lessonSolved:events.length, lessonBest:0, lessonBreadth:0, lessonTopicMastery:0, lessonDifficult:0, lessonDifficultBreadth:0, lessonReturned:0, lessonIndependentTransfer:0, lesson26Parts:0, lessonFiles:0, lessonTables:0, lessonGroupSessions:0};
  const lessons = new Map(), topics = new Map(), numbers = new Set(), difficultNumbers = new Set(), fileNumbers = new Set(), parts26 = new Map();
  for (const event of events) {
    numbers.add(event.taskNumber);
    const lesson = lessons.get(event.lessonKey) || {count:0, group:0};
    lesson.count++; if(event.groupId)lesson.group++; lessons.set(event.lessonKey,lesson);
    const entry = topics.get(topic(event)) || {count:0, lessons:new Set()};
    entry.count++; entry.lessons.add(event.lessonKey); topics.set(topic(event),entry);
    if(event.difficult){facts.lessonDifficult++;difficultNumbers.add(event.taskNumber);}
    if(event.returned)facts.lessonReturned++;
    if(event.inputFile){facts.lessonFiles++;fileNumbers.add(event.taskNumber);}
    if(event.tableSolution)facts.lessonTables++;
    if(event.taskNumber===26)parts26.set(event.partNumber,(parts26.get(event.partNumber)||0)+1);
    if(event.independentAt && events.some(previous => previous!==event && topic(previous)===topic(event) && Date.parse(previous.solvedAt)<Date.parse(event.solvedAt) && (!previous.independentAt || Date.parse(previous.independentAt)>Date.parse(event.solvedAt))))facts.lessonIndependentTransfer++;
  }
  facts.lessonBest = Math.max(0,...[...lessons.values()].map(lesson=>lesson.count));
  facts.lessonGroupSessions = [...lessons.values()].filter(lesson=>lesson.group>=3).length;
  facts.lessonBreadth = numbers.size;
  facts.lessonTopicMastery = Math.max(0,...[...topics.values()].filter(entry=>entry.lessons.size>=3).map(entry=>entry.count));
  facts.lessonDifficultBreadth = facts.lessonDifficult>=30 ? difficultNumbers.size : 0;
  facts.lesson26Parts = [...parts26.values()].filter(count=>count>=3).length;
  if(fileNumbers.size<3)facts.lessonFiles=Math.min(19,facts.lessonFiles);
  return facts;
}

export function preparedSolveReceipt(run,card,assets,{participants=[],lessonId=''}={},now=Date.now()) {
  const task=run.tasks[card.index],source=preparedTaskSource(run,task,card.index);
  const ids=[...new Set(participants.map(row=>row.id).filter(id=>typeof id==='string'&&(run.studentId===id||run.participantIds.includes(id))))];
  return {
    taskKey:hash(`${run.teacherId}:${source.taskId}`),
    contentKey:hash(JSON.stringify([run.teacherId,source.taskNumber,task.images.map(id=>assets[id]?.hash||id),task.attachments.map(file=>assets[file.assetId]?.hash||file.assetId)])),
    runId:run.id,cardId:card.id,teacherId:run.teacherId,taskNumber:source.taskNumber,partNumber:source.partNumber,
    scopeKey:`${run.teacherId}:${run.groupId?'group:'+run.groupId:'student:'+run.studentId}`,
    lessonId,groupId:run.groupId||'',solvedAt:new Date(now).toISOString(),difficult:task.difficult===true,
    inputFile:task.attachments.some(file=>file.runtime!==false && /\.(txt|csv|tsv|dat)$/i.test(file.name)),
    skippedAt:card.skippedAt||'',
    participants:ids.map(id=>({id,name:String(participants.find(row=>row.id===id)?.name||'Ученик').slice(0,160)})),
  };
}

export class LessonAchievementStore {
  constructor(directory,{write,now=()=>Date.now()}={}) {
    this.directory=directory;this.write=write;this.now=now;this.cache=new Map();
    fs.mkdirSync(directory,{recursive:true});
  }
  filename(studentId){return path.join(this.directory,hash(String(studentId))+'.json');}
  read(studentId){
    if(this.cache.has(studentId))return this.cache.get(studentId);
    let row;
    try{row=JSON.parse(fs.readFileSync(this.filename(studentId),'utf8'));if(row.version!==1||!Array.isArray(row.events))throw Error('Unsupported lesson achievement ledger');}
    catch(error){if(error.code!=='ENOENT')throw error;row={version:1,events:[]};}
    this.cache.set(studentId,row);return row;
  }
  facts(studentId){return lessonAchievementFacts(this.read(studentId).events);}
  record(studentId,receipt,{independent=false,tableSolution=false}={}) {
    const previous=this.read(studentId),before=lessonAchievementFacts(previous.events),row=structuredClone(previous);
    if(!receipt?.participants.some(person=>person.id===studentId))return {before,after:before,changed:false};
    let event=row.events.find(entry=>entry.taskKey===receipt.taskKey||entry.contentKey===receipt.contentKey);
    if(!event){
      const day=moscowDay.format(new Date(receipt.solvedAt));
      // Scheduled lesson IDs take precedence. Unscheduled lessons continue across
      // notebook pages, and split after 90 minutes of inactivity or a Moscow day.
      const recent=row.events.filter(entry=>entry.scopeKey===receipt.scopeKey&&moscowDay.format(new Date(entry.solvedAt))===day).at(-1);
      const continuation=recent&&Date.parse(receipt.solvedAt)-Date.parse(recent.solvedAt)<90*60000;
      const lessonKey=receipt.lessonId?`scheduled:${receipt.lessonId}`:continuation?recent.lessonKey:`${receipt.scopeKey}:${receipt.solvedAt}`;
      const {participants:_participants,...saved}=receipt;
      event={...saved,lessonKey,returned:Boolean(receipt.skippedAt&&moscowDay.format(new Date(receipt.skippedAt))!==day)};
      row.events.push(event);
    }
    // Extra evidence only upgrades this exact completed card; repeating an old
    // task in another lesson cannot turn an old ordinary solve into a hard one.
    if(event.runId===receipt.runId&&event.cardId===receipt.cardId){
      if(independent&&!event.independentAt)event.independentAt=new Date(this.now()).toISOString();
      if(tableSolution)event.tableSolution=true;
    }
    if(JSON.stringify(previous)===JSON.stringify(row))return {before,after:before,changed:false};
    const file=this.filename(studentId);
    if(this.write)this.write(file,JSON.stringify(row),'utf8');
    else{const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(row),{mode:0o600});fs.renameSync(temp,file);}
    this.cache.set(studentId,row);
    return {before,after:lessonAchievementFacts(row.events),changed:true};
  }
}
