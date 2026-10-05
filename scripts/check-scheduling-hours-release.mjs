import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { availabilitySlots, AVAILABILITY_END_MINUTE } from '../src/utils/groupAvailability.js';

const [mode,directory,dataDir] = process.argv.slice(2);
if (!['local','verify','preflight'].includes(mode) || !directory) throw Error('Usage: local|verify BUILD_DIR [DATA_DIR], or preflight DATA_DIR');
const read = (dir,name,fallback) => fs.existsSync(path.join(dir,name)) ? JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')) : fallback;
const get = async (route,session) => {
  const response = await fetch(`https://ivan100.ru${route}`,{headers:{'Cache-Control':'no-cache',...(session ? {Authorization:`Bearer ${session.token}`} : {})},signal:AbortSignal.timeout(25000)});
  if(!response.ok) throw Error(`GET ${route.split('?')[0]}: HTTP ${response.status}`);
  return response;
};
if(mode==='preflight') {
  const jobs=read(directory,'desktop-recordings.json',{}).jobs || {};
  if(Object.values(jobs).some(job=>job.desired==='record' && job.cutoffAt>Date.now())) throw Error('A lesson is recording; do not restart the server yet.');
  const sessions=read(directory,'auth-sessions.json',[]).filter(s=>s.user?.role==='teacher' && (!s.expiresAtMs || s.expiresAtMs>Date.now()));
  const teachers=new Map();
  for(const session of sessions.sort((a,b)=>(b.lastSeenAtMs||0)-(a.lastSeenAtMs||0))) if(!teachers.has(session.user.id)) teachers.set(session.user.id,session);
  const rooms=new Map(read(directory,'students.json',[]).filter(s=>!s.deletedAt && teachers.has(s.teacherId)).map(s=>[`rtc:${s.teacherId}:${s.id}`,teachers.get(s.teacherId)]));
  for(const lesson of read(directory,'learning-lesson-sessions.json',[])) if(lesson.rtcRoomId && teachers.has(lesson.teacherId) && ['scheduled','active'].includes(lesson.status)) rooms.set(lesson.rtcRoomId,teachers.get(lesson.teacherId));
  const candidates=[...rooms];
  for(let i=0;i<candidates.length;i+=8) await Promise.all(candidates.slice(i,i+8).map(async([room,session])=>{
    const response=await fetch(`https://ivan100.ru/api/rtc/presence?${new URLSearchParams({roomId:room})}`,{headers:{Authorization:`Bearer ${session.token}`},signal:AbortSignal.timeout(25000)});
    if(response.status===403) return; // Closed or unavailable rooms cannot host a call.
    if(!response.ok) throw Error(`Lesson presence: HTTP ${response.status}`);
    const presence=await response.json();
    if(presence.participants?.length) throw Error('A lesson call is active; do not restart the server yet.');
  }));
  console.log('No active lesson recording or call; server restart can proceed.');
} else {
  const html=fs.readFileSync(path.join(directory,'index.html'),'utf8');
  const entry=html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
  if(!entry) throw Error('Client entry missing');
  const entrySource=fs.readFileSync(path.join(directory,entry.slice(1)),'utf8');
  const groups=entrySource.match(/LearningGroupsSection-[A-Za-z0-9_-]+\.js/)?.[0];
  const transfer=entrySource.match(/LessonReschedule-[A-Za-z0-9_-]+\.js/)?.[0];
  if(!groups || !transfer) throw Error('Scheduling feature bundles missing');
  const groupSource=fs.readFileSync(path.join(directory,'assets',groups),'utf8');
  const transferSource=fs.readFileSync(path.join(directory,'assets',transfer),'utf8');
  for(const text of ['Ученики выбирают все удобные часы','Перенесите эти занятия перед утверждением','max:"23:00"','Какие часы видят ученики','Все часы, включая занятые','Только свободные часы']) if(!groupSource.includes(text)) throw Error(`Missing group feature: ${text}`);
  if(!transferSource.includes('17–23') || !transferSource.includes('с окончанием до 23:00')) throw Error('Late rescheduling UI missing');
  console.log('Group preferences, teacher conflict controls and 23:00 UI verified.');
  if(mode==='verify') {
    if(!(await (await get('/')).text()).includes(entry)) throw Error('Production serves a different client');
    const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
    for(const asset of [entry,`/assets/${groups}`,`/assets/${transfer}`]) if(digest(Buffer.from(await (await get(asset)).arrayBuffer()))!==digest(fs.readFileSync(path.join(directory,asset.slice(1))))) throw Error(`Published asset differs: ${asset}`);
    if(!dataDir) throw Error('DATA_DIR required for API verification');
    const sessions=read(dataDir,'auth-sessions.json',[]).filter(s=>s.user?.role==='student' && (!s.expiresAtMs || s.expiresAtMs>Date.now()));
    let individualVerified=false,groupVerified=false;
    for(const session of sessions) {
      if(!individualVerified) {
        const response=await fetch('https://ivan100.ru/api/weekly-schedules/availability',{headers:{Authorization:`Bearer ${session.token}`},signal:AbortSignal.timeout(25000)});
        if(response.ok) { const value=await response.json(); assert.equal(value.config.endMinute,AVAILABILITY_END_MINUTE); assert.ok(availabilitySlots(value.config).every(s=>s.minutes+value.config.durationMinutes<=AVAILABILITY_END_MINUTE)); individualVerified=true; }
        else if(response.status!==403) throw Error(`Individual availability: HTTP ${response.status}`);
      }
      if(!groupVerified) {
        const memberships=read(dataDir,'learning-groups.json',[]).filter(g=>!g.deletedAt && g.members?.some(m=>m.studentId===session.user.id && m.status==='active'));
        for(const group of memberships) {
          const value=await (await get(`/api/learning-groups/${encodeURIComponent(group.id)}/availability`,session)).json();
          if(value.poll) { assert.equal(typeof value.poll.includeBusyTimes,'boolean'); if(value.poll.includeBusyTimes) { assert.deepEqual(value.blocked,{}); assert.equal(value.calendarError,''); } if(value.poll.status==='open') assert.ok(value.poll.config.endMinute<=AVAILABILITY_END_MINUTE); groupVerified=true; break; }
        }
      }
      if(individualVerified && groupVerified) break;
    }
    if(!individualVerified || !groupVerified) throw Error('Current individual and group pupil sessions required to verify scheduling APIs');
    console.log('Exact published bundles, individual 23:00 limit and configurable group preferences verified.');
  }
}
