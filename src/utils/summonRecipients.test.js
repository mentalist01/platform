import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {summonRecipientIds} from './summonRecipients.js';
import {boardPageSummonTarget} from './boardPages.js';
import {summonedCodeSelection,rememberSummonedCode} from './lessonSummonCode.js';

const command=patch=>({id:'target',ts:Date.now(),pageId:'main',studentId:'',zoom:1.2,offset:{x:30,y:40},...patch});
const pages=[{id:'main'}];

test('one pupil can be called to the shared board or code while other pupils keep their selections',()=>{
  for(const scope of ['board','code']){
    const c=command({scope,recipientIds:['anna'],...(scope==='code'?{code:{solutionId:'example'}}:{})});
    const accepted=boardPageSummonTarget(c,'anna',pages);
    assert.ok(accepted);assert.equal(accepted.studentId,'','Recipient is not a private destination');
    assert.equal(boardPageSummonTarget(c,'boris',pages),null);
    if(scope==='code'){
      assert.equal(summonedCodeSelection(accepted,'board-group-demo~pages','anna').room,'collab-group-demo');
      assert.equal(summonedCodeSelection(c,'board-group-demo~pages','boris'),null);
      const writes=[];rememberSummonedCode(c,'board-group-demo~pages','boris',{setItem:(...args)=>writes.push(args),getItem:()=>null});
      assert.equal(writes.length,0,'Cold listeners must not change an unaddressed pupil either');
    }
  }
});

test('everyone remains compatible; malformed or empty explicit recipients fail closed and private ownership remains enforced',()=>{
  for(const user of ['anna','boris'])assert.ok(boardPageSummonTarget(command({scope:'board'}),user,pages));
  for(const recipientIds of [[],null,'anna',[17],['anna','../bad']])assert.equal(boardPageSummonTarget(command({scope:'board',recipientIds}),'anna',pages),null);
  assert.equal(boardPageSummonTarget(command({scope:'board',studentId:'anna',recipientIds:['boris']}),'boris',pages),null);
  assert.deepEqual(summonRecipientIds(['anna','boris','anna'],'anna'),['anna']);
  assert.deepEqual(summonRecipientIds(['anna','boris']),['anna','boris']);
  assert.equal(summonRecipientIds(['anna','boris'],'former-pupil'),null,'Removed selection cannot silently turn into everyone');
});

test('targeted commands use separate channels so older pages cannot accidentally summon everyone',()=>{
  const teacher=new Y.Doc(),pupil=new Y.Doc(),map=teacher.getMap('pageControl');
  map.set('summonBoardRecipient',command({scope:'board',recipientIds:['anna']}));
  map.set('summonCodeRecipient',command({scope:'code',recipientIds:['anna'],code:{solutionId:'example'}}));
  Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  const received=pupil.getMap('pageControl');
  assert.equal(received.get('summon'),undefined);assert.equal(received.get('summonCode'),undefined);
  assert.ok(boardPageSummonTarget(received.get('summonBoardRecipient'),'anna',pages));
  assert.equal(boardPageSummonTarget(received.get('summonCodeRecipient'),'boris',pages),null);
  teacher.destroy();pupil.destroy();
});
