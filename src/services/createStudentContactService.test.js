import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentContactService} from './createStudentContactService.js';

const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(t){
  const previousFetch=globalThis.fetch,previousStorage=globalThis.localStorage;
  let token='teacher-a';
  globalThis.localStorage={getItem:()=>JSON.stringify({authToken:token})};
  t.after(()=>{globalThis.fetch=previousFetch;globalThis.localStorage=previousStorage;});
  return {account:value=>{token=value;},service:()=>createStudentContactService({listRoute:'/api/student-contacts',itemRoute:id=>'/api/students/'+encodeURIComponent(id)+'/contact'})};
}

test('contact cache coalesces list reads and pupil writes never replace parent contacts',async t=>{
  const {service}=fixture(t),pupil=service(),parent=service(),calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return response(options.method==='PATCH'?{contact:JSON.parse(options.body)}:{contacts:{a:{url:'https://t.me/example_parent'}}});};
  await Promise.all([parent.load(),parent.load()]);
  assert.equal(calls.length,1);
  await pupil.save('a/b',{name:'Ученик',url:'https://t.me/example_pupil'});
  assert.equal(calls[1].url,'/api/students/a%2Fb/contact');
  assert.equal(parent.snapshot('a').url,'https://t.me/example_parent');
  assert.equal(pupil.snapshot('a/b').url,'https://t.me/example_pupil');
});

test('late list responses cannot expose a previous teacher contact after account switch',async t=>{
  const {account,service}=fixture(t),cache=service(),old=deferred();let count=0;
  globalThis.fetch=async()=>++count===1?old.promise:response({contacts:{new:{url:'https://t.me/new_teacher'}}});
  const oldLoad=cache.load();
  account('teacher-b');
  assert.equal(cache.snapshot('old'),null);
  await cache.load();
  old.resolve(response({contacts:{old:{url:'https://t.me/old_teacher'}}}));
  await oldLoad;
  assert.equal(cache.snapshot('old'),null);
  assert.equal(cache.snapshot('new').url,'https://t.me/new_teacher');
});

test('a write waiting for a list request aborts when the teacher account changes',async t=>{
  const {account,service}=fixture(t),cache=service(),list=deferred();let requests=0;
  globalThis.fetch=()=>{requests++;return list.promise;};
  const loading=cache.load(),saving=cache.save('a',{url:'https://t.me/example_pupil'});
  account('teacher-b');list.resolve(response({contacts:{a:{url:'https://t.me/old_teacher'}}}));
  await loading;
  await assert.rejects(saving,/Аккаунт изменился/);
  assert.equal(requests,1);
  assert.equal(cache.snapshot('a'),null);
});
