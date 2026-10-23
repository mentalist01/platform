import test from 'node:test';import assert from 'node:assert/strict';
import {createAchievementSound} from './achievementSound.js';
test('original chime plays three short notes, releases nodes and closes its own context',()=>{
  const previous=globalThis.AudioContext,notes=[],nodes=[];let closes=0;
  class Context {
    constructor(){this.currentTime=1;this.state='running';this.destination={};}
    resume(){return Promise.resolve();}close(){closes++;return Promise.resolve();}
    createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},disconnect(){}};}
    createOscillator(){const node={frequency:{value:0},connect(){return this;},disconnect(){node.disconnected=true;},start(at){notes.push([node.frequency.value,at]);},stop(at){node.stopped=at;}};nodes.push(node);return node;}
  }
  globalThis.AudioContext=Context;
  try{const sound=createAchievementSound();assert.equal(sound.play(),true);assert.deepEqual(notes.map(n=>n[0]),[523.25,659.25,1046.5]);assert.ok(nodes.every(n=>n.stopped<2));nodes.forEach(n=>n.onended());assert.ok(nodes.every(n=>n.disconnected));sound.dispose();assert.equal(closes,1);}
  finally{globalThis.AudioContext=previous;}
});
test('lack of Web Audio is silent and never blocks a reward',()=>{
  const previous=globalThis.AudioContext;globalThis.AudioContext=undefined;
  try{const sound=createAchievementSound();assert.equal(sound.play(),false);sound.dispose();}finally{globalThis.AudioContext=previous;}
});
