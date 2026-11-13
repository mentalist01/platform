import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {ROOT,loadConfig,AssistantRunner,buildPrompt} from './runner.mjs';
import {loadToken,saveToken} from './token-store.mjs';
import {chatAllowed} from './inbox.mjs';

export async function serve({port=0,onReady=console.log,runner=new AssistantRunner(loadConfig()),stateDirectory=path.join(ROOT,'private')}={}) {
  const secret=randomBytes(32).toString('base64url');
  let expectedHost='';
  const styleCount=()=>{try{return JSON.parse(fs.readFileSync(path.join(stateDirectory,'style-examples.json'),'utf8')).examples.length;}catch{return 0;}};
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(req.headers.host!==expectedHost || (req.headers.origin && req.headers.origin!==`http://${expectedHost}`))return json(res,403,{error:'Local access only'});
    const url=new URL(req.url,`http://${expectedHost}`);
    if(req.method==='GET' && ['/','/ui.js','/ui.css'].includes(url.pathname)) {
      const name=url.pathname==='/'?'ui.html':url.pathname.slice(1);
      res.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
      return res.end(fs.readFileSync(path.join(ROOT,name)));
    }
    const supplied=Buffer.from(req.headers['x-assistant-key']||''),correct=Buffer.from(secret);
    if(supplied.length!==correct.length||!timingSafeEqual(supplied,correct))return json(res,403,{error:'Open the local panel link produced by this process'});
    try {
      if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,{status:runner.status,running:!!runner.controller,busy:runner.busy,styleCount:styleCount(),config:runner.config,connections:Object.values(runner.inbox.data.connections),peers:Object.values(runner.inbox.data.peers),cases:Object.values(runner.inbox.data.cases).filter(c=>chatAllowed(runner.config,c.chatId)&&runner.inbox.data.connections[c.connectionId]?.enabled&&runner.inbox.data.connections[c.connectionId]?.ownerId===runner.config.telegramOwnerId).map(c=>({key:c.key,name:c.name,revision:c.revision,status:c.status,updatedAt:c.updatedAt,draft:c.draft,error:c.error,technicalEscalation:c.technicalEscalation,latest:c.messages.filter(m=>!m.outgoing).at(-1)?.text||'Вложение'}))});
      if(req.method!=='POST')return json(res,404,{error:'Not found'});
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)return json(res,413,{error:'Request is too large'});chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
      if(url.pathname==='/api/start'){
        const token=body.token||process.env.IVAN100_ASSISTANT_BOT_TOKEN||await loadToken(path.join(ROOT,'private'));
        await runner.start(token);
        if(process.platform==='win32'&&token)await saveToken(path.join(ROOT,'private'),token);
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/stop'){await runner.stop();return json(res,200,{ok:true});}
      if(url.pathname==='/api/config') {
        const config={...runner.config,telegramOwnerId:body.telegramOwnerId,allowedChatIds:body.allowedChatIds,allPrivateChats:body.allPrivateChats===true,autoDraft:body.autoDraft===true};
        if(config.telegramOwnerId && !Object.values(runner.inbox.data.connections).some(c=>c.ownerId===config.telegramOwnerId && c.enabled))throw Error('Choose an account connected to this bot');
        runner.updateConfig(config);return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/context') {
        const item=runner.inbox.data.cases[body.key],connection=item&&runner.inbox.data.connections[item.connectionId];
        if(!item||!chatAllowed(runner.config,item.chatId)||!connection?.enabled||connection.ownerId!==runner.config.telegramOwnerId)throw Error('Choose a message in a selected chat');
        return json(res,200,{prompt:buildPrompt(item,[],[],runner.templates.context(),await runner.directoryClient.lookup({telegramUserId:item.chatId,username:item.telegramUsername}),runner.escalations.enabled(),runner.config.calendarAccess||null)});
      }
      if(url.pathname==='/api/draft') {
        const item=runner.inbox.data.cases[body.key];
        if(!item||item.status!=='pending'||!chatAllowed(runner.config,item.chatId)||!runner.controller||!runner.inbox.data.connections[item.connectionId]?.enabled||runner.inbox.data.connections[item.connectionId]?.ownerId!==runner.config.telegramOwnerId)throw Error('Choose a pending message in a selected chat');
        if(runner.busy)throw Error('A draft is already in progress');
        runner.prepare(item).catch(()=>{});return json(res,202,{ok:true});
      }
      return json(res,404,{error:'Not found'});
    } catch(error) {
      const allowed=/^(This bot|Enable Secretary|Telegram |Choose |A draft|Receiver |Select |Invalid |Maximum |The account)/.test(error.message);
      return json(res,400,{error:allowed?error.message:'Действие не выполнено. Проверьте подключение и локальные настройки.'});
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  expectedHost=`127.0.0.1:${server.address().port}`;
  const panelUrl=`http://${expectedHost}/#${secret}`;
  fs.mkdirSync(stateDirectory,{recursive:true});fs.writeFileSync(path.join(stateDirectory,'panel-url.txt'),panelUrl,{mode:0o600});
  onReady('Local assistant panel is ready. The private link is in tools/student-reply-assistant/private/panel-url.txt');
  const close=async()=>{process.removeListener('SIGINT',close);process.removeListener('SIGTERM',close);await runner.stop();await new Promise(resolve=>server.close(resolve));};
  process.once('SIGINT',close);process.once('SIGTERM',close);
  return {server,runner,panelUrl,close};
}
