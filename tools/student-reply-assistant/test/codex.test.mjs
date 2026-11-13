import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexDraftClient} from '../codex.mjs';

test('Codex events accept only matching thread final answers',async()=>{
 const client=new CodexDraftClient('unused','unused','rules');client.threadId='wanted';let result;
 client.active={text:[],resolve:x=>{result=x;},reject:()=>assert.fail(),timer:null};
 client.receive({method:'item/completed',params:{threadId:'other',item:{type:'agentMessage',text:'WRONG PUPIL'}}});
 client.receive({method:'item/completed',params:{threadId:'wanted',item:{type:'agentMessage',phase:'commentary',text:'INTERNAL PROGRESS'}}});
 client.receive({method:'item/completed',params:{threadId:'wanted',item:{type:'agentMessage',phase:'final_answer',text:'Попроси условие'}}});
 client.receive({method:'turn/completed',params:{threadId:'wanted',turn:{status:'completed'}}});
 assert.equal(result,'Попроси условие');
});
test('Codex tool requests are not automatically approved',()=>{
 const client=new CodexDraftClient('unused','unused','rules');let response;client.send=x=>{response=x;};
 client.receive({id:8,method:'item/commandExecution/requestApproval',params:{command:'never run'}});
 assert.equal(response.id,8);assert.ok(response.error);assert.equal(response.result,undefined);
});
test('a failed turn cannot be presented as a completed reply',()=>{
 const client=new CodexDraftClient('unused','unused','rules');client.threadId='wanted';let error;
 client.active={text:['partial answer'],resolve:()=>assert.fail(),reject:e=>{error=e;},timer:null};
 client.receive({method:'turn/completed',params:{threadId:'wanted',turn:{status:'failed'}}});assert.match(error.message,/did not complete/);
});
