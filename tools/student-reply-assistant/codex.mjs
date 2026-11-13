import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

export class CodexDraftClient {
  constructor(command, cwd, instructions, timeoutMs = 240000) {
    this.command=command; this.cwd=cwd; this.instructions=instructions; this.timeoutMs=timeoutMs; this.requests=new Map(); this.nextId=1; this.active=null;
  }
  async start(threadId) {
    this.proc=spawn(this.command,['app-server','--listen','stdio://'],{cwd:this.cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.proc.stderr.resume(); // Never echo raw stderr: a provider may include private context.
    this.proc.on('error',()=>this.abort(Error('Codex could not start; check the configured executable')));
    this.proc.on('exit',()=>this.abort(Error('Codex stopped before completing the request')));
    this.lines=createInterface({input:this.proc.stdout}); this.lines.on('line',line=>{try{this.receive(JSON.parse(line));}catch{/* Non-protocol output is not a model response. */}});
    await this.rpc('initialize',{clientInfo:{name:'ivan100_student_drafts',title:'IVAN100 student drafts',version:'0.1.0'}});
    this.send({method:'initialized',params:{}});
    try {await this.rpc('thread/resume',{threadId,cwd:this.cwd,approvalPolicy:'never',sandbox:'read-only',developerInstructions:this.instructions,excludeTurns:true});}
    catch(error){this.close();throw error;}
    this.threadId=threadId;
  }
  send(message) {this.proc.stdin.write(JSON.stringify(message)+'\n');}
  rpc(method,params) {
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.requests.delete(id);reject(Error(`Codex ${method} timed out`));},this.timeoutMs);
      this.requests.set(id,{resolve,reject,timer,method});this.send({id,method,params});
    });
  }
  receive(message) {
    if(message.id!==undefined && (message.result!==undefined || message.error)) {
      const pending=this.requests.get(message.id);if(!pending)return;this.requests.delete(message.id);clearTimeout(pending.timer);
      if(message.error)pending.reject(Object.assign(Error('Codex rejected the request; it may be busy in the desktop app'),{rpcMethod:pending.method,rpcCode:message.error.code,rpcReason:message.error.message}));
      else pending.resolve(message.result);
      return;
    }
    if(message.id!==undefined && message.method) {
      // Do not auto-approve requests from tools, Telegram text or attachments.
      this.send({id:message.id,error:{code:-32601,message:'This receiver only prepares drafts; interactive actions are unavailable'}});return;
    }
    if(!this.active || message.params?.threadId!==this.threadId)return;
    if(message.method==='item/completed' && message.params.item?.type==='agentMessage' && (!message.params.item.phase || message.params.item.phase==='final_answer'))this.active.text.push(message.params.item.text || '');
    if(message.method==='turn/completed') {
      const active=this.active;this.active=null;clearTimeout(active.timer);
      if(message.params.turn?.status!=='completed')active.reject(Error('Codex did not complete the draft'));
      else if(!active.text.join('').trim())active.reject(Error('Codex returned no final answer'));
      else active.resolve(active.text.join('\n\n'));
    }
  }
  async draft(prompt,images=[]) {
    if(this.active)throw Error('Wait for the previous draft');
    let resolve,reject;const completed=new Promise((a,b)=>{resolve=a;reject=b;});completed.catch(()=>{});
    const active={resolve,reject,text:[],timer:null};
    active.timer=setTimeout(()=>{if(this.active===active){this.active=null;this.rpc('turn/interrupt',{threadId:this.threadId,turnId:active.turnId}).catch(()=>{});active.reject(Error('Draft time limit reached'));}},this.timeoutMs);
    this.active=active;
    try {
      const result=await this.rpc('turn/start',{threadId:this.threadId,cwd:this.cwd,approvalPolicy:'never',sandboxPolicy:{type:'readOnly',networkAccess:false},input:[{type:'text',text:prompt},...images.map(p=>({type:'localImage',path:p}))]});
      active.turnId=result.turn?.id;
      return await completed;
    } catch(error) {if(this.active===active){this.active=null;clearTimeout(active.timer);}completed.catch(()=>{});throw error;}
  }
  abort(error) {
    for(const pending of this.requests.values()){clearTimeout(pending.timer);pending.reject(error);}this.requests.clear();
    if(this.active){clearTimeout(this.active.timer);this.active.reject(error);this.active=null;}
  }
  close(){this.abort(Error('Assistant stopped'));this.lines?.close();this.proc?.stdin.end();this.proc?.kill();}
}
