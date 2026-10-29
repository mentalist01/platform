import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PreparedWorkbookHistory,currentWorkbookSolution} from './preparedWorkbookHistory.js';

const solution=(revision,hash='file-a',attemptId='',attemptNumber=1)=>({id:'prepared-test',revision,hash,storage:hash+'.ods',name:'Решение.ods',size:9,updatedAt:'2026-10-29T10:00:00Z',savedBy:{id:'pupil',name:'Ученик',role:'student'},attemptId,attemptNumber});
test('history persists immutable versions, deduplicates identical saves and separates attempts',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workbook-history-')),h=new PreparedWorkbookHistory(dir),key=h.key('run','card','asset');
  assert.equal(h.archive(key,solution(1)),1);assert.equal(h.archive(key,solution(2)),1);
  assert.equal(h.archive(key,solution(3,'file-b')),2);assert.equal(h.archive(key,solution(4,'file-a','attempt-2',2)),3);
  const again=new PreparedWorkbookHistory(dir);assert.deepEqual(again.list(key).map(v=>[v.hash,v.attemptNumber]),[['file-a',1],['file-b',1],['file-a',2]]);
  assert.equal(fs.readdirSync(dir).length,1,'Only a metadata journal is written, no duplicate file copies');
  assert.equal(again.list(key)[0].revision,1,'An old download identity is immutable after later identical saves');
});
test('legacy current saves are readable without mutating their metadata',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workbook-legacy-')),h=new PreparedWorkbookHistory(dir),key=h.key('r','c','a'),old=solution(12);
  assert.equal(h.list(key,old).length,1);assert.equal(fs.readdirSync(dir).length,0);assert.equal(h.archive(key,old),1);
  assert.equal(h.list(key,old).length,1);
});
test('an incomplete unacknowledged journal tail is discarded before a durable append',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workbook-torn-')),h=new PreparedWorkbookHistory(dir),key=h.key('r','c','a');
  h.archive(key,solution(1));fs.appendFileSync(path.join(dir,key+'.jsonl'),'{"interrupted":');
  const again=new PreparedWorkbookHistory(dir);assert.equal(again.list(key).length,1);again.archive(key,solution(2,'b'));
  assert.equal(new PreparedWorkbookHistory(dir).list(key).length,2);
});
test('new attempts keep the last saved solution while selecting original bytes for a new opening',()=>{
  const old=solution(1),card={solutions:{asset:old}};assert.equal(currentWorkbookSolution(card,'asset'),old);
  card.workbookAttempts={asset:{id:'new',number:2}};assert.equal(currentWorkbookSolution(card,'asset'),null);assert.equal(card.solutions.asset,old);
  const next=solution(2,'new-bytes','new',2);card.solutions.asset=next;assert.equal(currentWorkbookSolution(card,'asset'),next);
});
