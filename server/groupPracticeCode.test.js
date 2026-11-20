import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {projectGroupPracticeCode,savedLegacyGroupCode,savedPracticeCode} from './groupPracticeCode.js';
import {createCollabCodePage,createEmptyCollabSolution,getCollabSolutionChannels,listCollabSolutions} from '../src/utils/collabSolutions.js';

const text=(doc,id)=>getCollabSolutionChannels(doc,id).codeText;

test('a practice page keeps the same task identities and only reports edits in its own document',()=>{
  const shared=new Y.Doc(),pairA=new Y.Doc(),pairB=new Y.Doc();
  try{
    const page=createCollabCodePage(shared,{name:'Условия',id:'lesson-work-page'});
    createEmptyCollabSolution(shared,{id:'task-one',name:'1',pageId:page.id});
    createEmptyCollabSolution(shared,{id:'task-two',name:'2',pageId:page.id});
    createEmptyCollabSolution(shared,{id:'another-task',name:'Другая страница'});
    text(shared,'task-two').insert(0,'print(1)');
    text(shared,page.mainSolutionId).insert(0,'# shared');
    projectGroupPracticeCode(pairA,shared,page.id);
    projectGroupPracticeCode(pairB,shared,page.id);
    assert.deepEqual(listCollabSolutions(pairA).map(row=>row.id),['main','task-one','task-two']);
    assert.deepEqual(savedPracticeCode(pairA,'task-two',page.mainSolutionId),[]);
    assert.equal(text(pairA,'main').toString(),'# shared');
    assert.equal(text(pairA,'task-two').toString(),'print(1)');

    text(pairA,'task-two').insert(0,'# answer A\n');
    text(pairB,'task-one').insert(0,'# answer B');
    text(pairA,'main').delete(0,text(pairA,'main').length);
    projectGroupPracticeCode(pairA,shared,page.id);
    assert.equal(text(shared,'task-two').toString(),'print(1)');
    assert.deepEqual(savedPracticeCode(pairA,'task-two',page.mainSolutionId),[{name:'2',text:'# answer A\nprint(1)'}]);
    assert.deepEqual(savedPracticeCode(pairA,'task-one',page.mainSolutionId),[]);
    assert.deepEqual(savedPracticeCode(pairB,'task-two',page.mainSolutionId),[]);
    assert.deepEqual(savedPracticeCode(pairA,page.mainSolutionId,page.mainSolutionId),[{name:'Основной код',text:''}]);
  }finally{
    for(const doc of [shared,pairA,pairB])doc.destroy();
  }
});

test('previous edits remain readable from cards without task links and from preexisting private code',()=>{
  const shared=new Y.Doc(),existing=new Y.Doc();
  try{
    createEmptyCollabSolution(shared,{id:'task-one',name:'1'});
    text(shared,'main').insert(0,'# common');
    text(existing,'main').insert(0,'# prior private');
    createEmptyCollabSolution(existing,{id:'custom-one',name:'Вариант'});
    text(existing,'custom-one').insert(0,'# prior option');
    assert.deepEqual(savedLegacyGroupCode(existing,'main','main','main').map(row=>row.text),['# prior private','# prior option']);
    projectGroupPracticeCode(existing,shared,'main');
    assert.deepEqual(savedPracticeCode(existing,'main','main').map(row=>row.text),['# prior private','# prior option']);
    assert.equal(text(existing,'main').toString(),'# prior private');
    assert.deepEqual(savedPracticeCode(existing,'task-one','main'),[]);
  }finally{shared.destroy();existing.destroy();}
});
