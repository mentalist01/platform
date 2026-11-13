import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,timingSafeEqual} from 'node:crypto';
import {buildDirectory} from './platform-directory.mjs';

// Separate read-only sidecar: no platform auth sessions, no write routes, no
// access codes, balances, notes or other teachers in the response.
export function createDirectoryServer({dataDir,teacherId,token,tokenHash,now}) {
  if(!teacherId||(!/^[a-f0-9]{64}$/.test(tokenHash||'')&&(typeof token!=='string'||token.length<40)))throw Error('Configure a scoped directory token');
  const digest=v=>createHash('sha256').update(v).digest(),expected=tokenHash?Buffer.from(tokenHash,'hex'):digest('Bearer '+token);
  const read=file=>JSON.parse(fs.readFileSync(path.join(dataDir,file),'utf8'));
  return http.createServer((req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
    if(!timingSafeEqual(digest(req.headers.authorization||''),expected)){res.writeHead(401);return res.end('{"error":"Unauthorized"}');}
    if(req.method!=='GET'||req.url!=='/api/reply-assistant/directory'){res.writeHead(404);return res.end('{"error":"Not found"}');}
    try{const data=buildDirectory({students:read('students.json'),groups:read('learning-groups.json'),studentContacts:read('student-contacts.json').contacts,parentContacts:read('student-parent-contacts.json').contacts},teacherId,now?.());res.end(JSON.stringify(data));}
    catch{res.writeHead(503);res.end('{"error":"Directory temporarily unavailable"}');}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  createDirectoryServer(config).listen(config.port||5713,'127.0.0.1');
}
