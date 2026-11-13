import fs from 'node:fs';
import path from 'node:path';
import {protect} from './token-store.mjs';

const username=v=>typeof v==='string'&&/^[a-z][a-z0-9_]{4,31}$/i.test(v)?v.toLowerCase():null;
export function telegramIdentity(raw) {
  if(typeof raw!=='string')return null;
  const value=raw.trim();if(value.startsWith('@')){const u=username(value.slice(1));return u?{username:u}:null;}
  let url;try{url=new URL(value);}catch{return null;}
  if(url.protocol==='tg:') {
    if(url.hostname==='user'&&/^[1-9]\d{0,15}$/.test(url.searchParams.get('id')||'')){const id=Number(url.searchParams.get('id'));return Number.isSafeInteger(id)?{userId:id}:null;}
    if(url.hostname==='resolve'){const u=username(url.searchParams.get('domain'));return u?{username:u}:null;}return null;
  }
  if(!['https:','http:'].includes(url.protocol))return null;
  if(['t.me','www.t.me','telegram.me','www.telegram.me'].includes(url.hostname)) {
    const parts=url.pathname.split('/').filter(Boolean);if(parts.length!==1||['share','proxy','joinchat','addstickers','addemoji','login','iv','s','c','boost'].includes(parts[0]))return null;
    const u=username(parts[0]);return u?{username:u}:null;
  }
  if(url.hostname==='web.telegram.org'&&/^\/?(?:a|k)\/?$/.test(url.pathname)&&/^#[1-9]\d{0,15}$/.test(url.hash)) {
    const id=Number(url.hash.slice(1));return Number.isSafeInteger(id)?{userId:id}:null;
  }
  return null;
}
export function buildDirectory({students,groups,studentContacts,parentContacts},teacherId,at=new Date().toISOString()) {
  if(!teacherId||!Array.isArray(students)||!Array.isArray(groups)||!Array.isArray(studentContacts)||!Array.isArray(parentContacts))throw Error('Invalid platform directory sources');
  const own=students.filter(s=>s.teacherId===teacherId&&!s.deletedAt),byId=new Map(own.map(s=>[s.id,s]));
  const members=own.map(s=>({studentId:s.id,name:String(s.name||'').slice(0,180),groups:groups.filter(g=>g.teacherId===teacherId&&!g.deletedAt&&['active','ready','forming'].includes(g.status)&&g.members?.some(m=>m.studentId===s.id&&m.status==='active')).map(g=>({id:g.id,name:String(g.name||'').slice(0,180)})),contacts:[]}));
  const targets=new Map(members.map(s=>[s.studentId,s]));
  for(const [role,records] of [['student',studentContacts],['parent',parentContacts]])for(const record of records) {
    if(record.teacherId!==teacherId||!byId.has(record.studentId))continue;
    const contactValues=[record.url,...(Array.isArray(record.contacts)?record.contacts.flatMap(c=>[c.url,c.value]):[])];
    const seen=new Set();for(const raw of contactValues){const telegram=telegramIdentity(raw);if(!telegram)continue;const key=JSON.stringify(telegram);if(seen.has(key))continue;seen.add(key);targets.get(record.studentId).contacts.push({role,name:String(record.name||'').slice(0,180),telegram});}
  }
  return {version:1,teacherId,generatedAt:at,members};
}
export function matchDirectory(directory,sender,teacherId,now=Date.now(),maxAgeMs=20*60000) {
  if(directory?.version!==1||directory.teacherId!==teacherId||!Array.isArray(directory.members)||directory.members.length>10000)return {status:'unavailable',reason:'Справочник платформы недоступен'};
  const age=now-Date.parse(directory.generatedAt);
  if(!Number.isFinite(age)||age< -60000||age>maxAgeMs)return {status:'stale',checkedAt:directory.generatedAt,reason:'Справочник устарел; текущая привязка не подтверждена'};
  const u=username(sender.username),id=sender.telegramUserId;
  const matches=[];
  for(const s of directory.members)for(const c of (s.contacts||[])) {
    const byId=Number.isSafeInteger(id)&&c.telegram?.userId===id,byUsername=u&&c.telegram?.username===u;
    if(!byId&&!byUsername)continue;
    matches.push({studentId:s.studentId,studentName:s.name,role:c.role,contactName:c.name,groups:s.groups,evidence:byId?'telegram_user_id':'telegram_username'});
  }
  const unique=[...new Map(matches.map(m=>[m.studentId+':'+m.role,m])).values()];
  return {status:unique.length===1?'matched':unique.length?'ambiguous':'not_found',checkedAt:directory.generatedAt,matches:unique};
}
export class PlatformDirectory {
  constructor(config,{directory,fetcher=fetch,loadSecret=async file=>protect(fs.readFileSync(file,'utf8'),true),now=()=>Date.now()}={}) {this.config=config;this.directory=directory;this.fetcher=fetcher;this.loadSecret=loadSecret;this.now=now;this.lastAttempt=0;}
  async lookup(sender) {
    const source=this.config.platformDirectory;if(!source)return {status:'unavailable',reason:'Источник контактов не подключён'};
    const cache=path.join(this.directory,'platform-directory.json');
    let data;try{data=JSON.parse(fs.readFileSync(cache,'utf8'));}catch{}
    if(this.now()-Date.parse(data?.generatedAt||'')>5*60000||['unavailable','stale'].includes(matchDirectory(data,sender,source.teacherId,this.now()).status)) {
      if(this.now()-this.lastAttempt>30000) {
        this.lastAttempt=this.now();
        try {
          const url=new URL(source.url);
          if(url.protocol!=='https:'||url.hostname!=='ivan100.ru'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/reply-assistant/directory')throw Error('Invalid directory endpoint');
          const token=await this.loadSecret(path.join(this.directory,'directory-token.dpapi'));
          const response=await this.fetcher(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(6000)});
          if(!response.ok)throw Error('Directory unavailable');
          const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>1048576)throw Error('Directory too large');chunks.push(chunk);}
          const candidate=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(['unavailable','stale'].includes(matchDirectory(candidate,sender,source.teacherId,this.now()).status))throw Error('Invalid directory');
          data=candidate;fs.mkdirSync(this.directory,{recursive:true});const tmp=cache+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,cache);
        } catch{/* Keep the last verified snapshot, with a strict freshness limit. */}
      }
    }
    return matchDirectory(data,sender,source.teacherId,this.now());
  }
}
