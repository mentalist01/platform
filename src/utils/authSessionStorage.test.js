import test from 'node:test';
import assert from 'node:assert/strict';
import {USER_SESSION_KEY,STUDENT_VIEW_SESSION_KEY,readStoredAuthUser,writeStoredAuthUser,removeStoredAuthUser,getStudentViewToken,withStudentViewAuth} from './authSessionStorage.js';

const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
test('pupil tab never changes or falls back to the teacher account, including after logout and reload',()=>{
  const original={window:globalThis.window,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage};
  try{
    globalThis.window={location:{pathname:'/',href:'https://school.example/',origin:'https://school.example'}};
    globalThis.localStorage=storage();globalThis.sessionStorage=storage();
    const teacher={id:'teacher',authToken:'teacher-secret'};writeStoredAuthUser(teacher);
    window.location.pathname='/student-view';window.location.href='https://school.example/student-view';
    assert.equal(readStoredAuthUser(),null,'must not fall back to teacher');
    const pupil={id:'pupil',authToken:'sv_pupil'};writeStoredAuthUser(pupil);
    assert.equal(readStoredAuthUser().id,'pupil');assert.equal(getStudentViewToken(),'sv_pupil');
    assert.equal(JSON.parse(localStorage.getItem(USER_SESSION_KEY)).id,'teacher');
    assert.ok(sessionStorage.getItem(STUDENT_VIEW_SESSION_KEY));
    assert.equal(new URL(withStudentViewAuth('/api/progress')).searchParams.get('_auth'),'sv_pupil');
    assert.equal(withStudentViewAuth('https://external.example/uploads/a.png'),'https://external.example/uploads/a.png');
    assert.equal(withStudentViewAuth('https://external.example/?next=/api/a'),'https://external.example/?next=/api/a');
    assert.equal(withStudentViewAuth('/assets/logo.svg'),'/assets/logo.svg');
    removeStoredAuthUser();assert.equal(readStoredAuthUser(),null);
    assert.equal(JSON.parse(localStorage.getItem(USER_SESSION_KEY)).authToken,'teacher-secret');
    window.location.pathname='/';assert.equal(readStoredAuthUser().id,'teacher');
  }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
