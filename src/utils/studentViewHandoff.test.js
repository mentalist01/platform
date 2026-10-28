import test from 'node:test';
import assert from 'node:assert/strict';

const ticket='svh_'+'a'.repeat(64);
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
test('browser handoff isolates the pupil, removes the URL ticket and consumes it once',async()=>{
  globalThis.localStorage=storage();globalThis.sessionStorage=storage();
  localStorage.setItem('ege_user_session',JSON.stringify({token:'real-browser-teacher',role:'teacher'}));
  globalThis.window={location:new URL('https://ivan100.ru/student-view#handoff='+ticket),history:{replaceState:(_state,_title,url)=>{window.location=new URL(url,window.location);}}};
  const originalFetch=globalThis.fetch;let requests=0;
  globalThis.fetch=async(url,init)=>{
    requests++;assert.match(String(url),/\/api\/student-view\/redeem$/);
    assert.equal(window.location.hash,'');assert.equal(init.credentials,'omit');
    assert.equal(init.referrerPolicy,'no-referrer');assert.equal(init.headers.get('Authorization'),null);
    assert.equal(init.headers.get('X-Student-View'),'1');assert.equal(JSON.parse(init.body).handoff,ticket);
    return Response.json({role:'student',name:'Test pupil',token:'sv_test',studentView:{teacherName:'Teacher'}});
  };
  try{
    const module=await import('./studentViewHandoff.js?isolated');
    assert.equal(module.studentViewHandoffUrl('https://ivan100.ru',ticket),'https://ivan100.ru/student-view#handoff='+ticket);
    assert.throws(()=>module.studentViewHandoffUrl('https://ivan100.ru','bad'));
    await Promise.all([module.bootstrapStudentViewHandoff(),module.bootstrapStudentViewHandoff()]);
    assert.equal(requests,1);assert.equal(JSON.parse(sessionStorage.getItem('ege_student_view_session')).token,'sv_test');
    assert.equal(JSON.parse(localStorage.getItem('ege_user_session')).token,'real-browser-teacher');
    sessionStorage.removeItem('ege_student_view_session');window.location=new URL('https://ivan100.ru/#handoff='+ticket);
    assert.equal(await module.bootstrapStudentViewHandoff(),false);assert.equal(requests,1);
  }finally{globalThis.fetch=originalFetch;delete globalThis.window;delete globalThis.localStorage;delete globalThis.sessionStorage;}
});
