import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import WebSocket from 'ws';
import {WebsocketProvider} from 'y-websocket';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {pythonExplanationBoardRoom,pythonExplanationCodeRoom} from '../src/utils/pythonExplanationBoard.js';
import {pythonGroupBoardRoom} from '../src/utils/pythonGroupWorkspace.js';
import {getCollabSolutionChannels,listCollabCodePages} from '../src/utils/collabSolutions.js';

test('Python explanation board pages project to shared code without changing task solutions or lesson boards',{timeout:60_000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,undefined,{persistCollab:true}),connections=[];
  const wait=async check=>{for(let i=0;i<160;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Synchronization timeout');};
  const connect=async(room,token)=>{
    const doc=new Y.Doc(),provider=new WebsocketProvider(f.base.replace('http','ws')+'/collab',room,doc,{WebSocketPolyfill:WebSocket,params:{_auth:token},disableBc:true});
    connections.push({doc,provider});await wait(()=>provider.synced);return doc;
  };
  const pages=(room,token,body,expected=200)=>f.request('/api/lesson-pages'+(body?'':`?room=${encodeURIComponent(room)}`),token,body?{room,...body}:undefined,body?'POST':'GET',expected);
  try{
    for(const groupId of ['',f.groupId]){
      const board=groupId?pythonGroupBoardRoom(groupId):pythonExplanationBoardRoom('teacher-a','student-a');
      const code=pythonExplanationCodeRoom('teacher-a','student-a',groupId),teacher=f.tokens['teacher-a'],pupil=f.tokens['student-a'];
      const oldBoard=await connect(board,teacher);oldBoard.getArray('items').push([{id:'old-drawing',type:'text',text:'Прежние объяснения'}]);
      const catalog=await pages(code,teacher);assert.equal(catalog.bookRoom,board+'~pages');
      const t=await connect(code,teacher),s=await connect(code,pupil);
      getCollabSolutionChannels(t).codeText.insert(0,'print("example")');
      await wait(()=>getCollabSolutionChannels(s).codeText.toString()==='print("example")');
      const second=await pages(board+'~pages',teacher,{action:'create',name:'Цикл for'});
      await wait(()=>listCollabCodePages(s).length===2);
      const page=listCollabCodePages(s).find(page=>page.id===second.id);
      assert.equal(page.name,'Цикл for');
      const channels=getCollabSolutionChannels(s,page.mainSolutionId);
      channels.codeText.insert(0,'print(2 + 3)');channels.runMap.set('output','5\n');channels.runMap.set('stdinDraft','7');
      await wait(()=>getCollabSolutionChannels(t,page.mainSolutionId).runMap.get('output')==='5\n');
      assert.equal(getCollabSolutionChannels(t).codeText.toString(),'print("example")');
      assert.equal(oldBoard.getArray('items').get(0).text,'Прежние объяснения');
      await pages(code,pupil,{action:'create',name:'Not allowed'},403);
      await pages(code,f.tokens['teacher-b'],undefined,403);
      await pages(code,f.tokens['student-c'],undefined,403);
      await pages(code,teacher,{action:'delete',id:second.id});await wait(()=>listCollabCodePages(s).length===1);
      await pages(code,teacher,{action:'restore',id:second.id});await wait(()=>listCollabCodePages(s).length===2);
      assert.equal(getCollabSolutionChannels(t,page.mainSolutionId).codeText.toString(),'print(2 + 3)');
    }
    for(const{doc,provider}of connections.splice(0)){provider.destroy();doc.destroy();}
    await new Promise(resolve=>setTimeout(resolve,300));
    const resumed=await connect(pythonExplanationCodeRoom('teacher-a','student-a',f.groupId),f.tokens['teacher-a']);
    assert.equal(listCollabCodePages(resumed).length,2);
    assert.equal(getCollabSolutionChannels(resumed).codeText.toString(),'print("example")');
    const savedPage=listCollabCodePages(resumed).find(page=>page.name==='Цикл for');
    assert.equal(getCollabSolutionChannels(resumed,savedPage.mainSolutionId).codeText.toString(),'print(2 + 3)');
    const upload=async(token,extra={})=>{
      const form=new FormData();form.append('file',new Blob(['2 3\n']),'example.txt');form.append('taskNumber','101');form.append('category','class');
      form.append('learningGroupId',f.groupId);form.append('pythonExplanationGroup','1');
      for(const[k,v]of Object.entries(extra))form.set(k,v);
      const response=await fetch(f.base+'/api/files',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
      return {response,data:await response.json()};
    };
    const saved=await upload(f.tokens['teacher-a']);assert.equal(saved.response.status,200,JSON.stringify(saved.data));
    assert.equal(saved.data.groupId,f.groupId);assert.equal(saved.data.sharedScope,'learning-group-notes');
    for(const id of ['teacher-a','student-a','student-b']){
      const files=await f.request(`/api/files?learningGroupId=${f.groupId}`,f.tokens[id]);
      assert.ok(files.some(file=>file.id===saved.data.id));
    }
    await f.request(`/api/files?learningGroupId=${f.groupId}`,f.tokens['teacher-b'],undefined,'GET',403);
    await f.request(`/api/files?learningGroupId=${f.groupId}`,f.tokens['student-c'],undefined,'GET',403);
    assert.equal((await upload(f.tokens['student-a'])).response.status,403);
    assert.equal((await upload(f.tokens['teacher-b'])).response.status,403);
    assert.equal((await upload(f.tokens['teacher-a'],{pythonExplanationGroup:'0'})).response.status,400);
  }finally{for(const {doc,provider}of connections){provider.destroy();doc.destroy();}await f.stop();}
});
