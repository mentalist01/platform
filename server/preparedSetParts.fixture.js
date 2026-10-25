import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
export async function partFixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-parts-')),docs=new Map(),auth={id:'t',role:'teacher'};
  const document=async room=>{if(!docs.has(room))docs.set(room,new Y.Doc());return docs.get(room);};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor,studentId:'p',participantIds:[]}),board:document,code:document,sourceFiles:async()=>[]};
  const prepared=new PreparedLessonTasks(deps),image=prepared.putAsset(auth,Buffer.from('image'),'condition.png','image/png',{width:800,height:140});
  const file=prepared.putAsset(auth,Buffer.from('1\n2\n'),'9.txt','application/octet-stream');
  const set=await prepared.saveSet(auth,{name:'9 обе части',taskNumber:9,partNumber:1,tasks:['1','2','1','2'].map((title,index)=>({title,startsPart:index===2,images:[image.id],answers:[String(index+10)],attachments:[{assetId:file.id,runtime:true,runtimeName:`9_${index+1}.txt`}]}))});
  t.after(()=>{docs.forEach(doc=>doc.destroy());fs.rmSync(directory,{recursive:true,force:true});});
  return {directory,docs,auth,document,deps,prepared,image,file,set};
}
