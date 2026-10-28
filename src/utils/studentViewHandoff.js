import {apiFetch,parseApiError} from '../services/api.js';
import {getStudentViewToken,isStudentViewTab,writeStoredAuthUser} from './authSessionStorage.js';

export const isStudentViewHandoff = value => typeof value==='string'&&/^svh_[a-f0-9]{64}$/.test(value);
export function studentViewHandoffUrl(origin,handoff) {
  if(!isStudentViewHandoff(handoff))throw Error('Не удалось подготовить вход за ученика.');
  const url=new URL('/student-view',origin);url.hash='handoff='+handoff;return url.href;
}

// A module-scoped promise also covers React's development effect replay. A
// one-time ticket must never be redeemed twice or overwrite a normal login.
let bootstrap;
export function bootstrapStudentViewHandoff() {
  if(!isStudentViewTab())return Promise.resolve(false);
  if(getStudentViewToken())return Promise.resolve(true);
  if(bootstrap)return bootstrap;
  const params=new URLSearchParams(window.location.hash.slice(1)),handoff=params.get('handoff');
  if(!handoff)return Promise.resolve(false);
  window.history.replaceState(null,'',window.location.pathname+window.location.search);
  if(!isStudentViewHandoff(handoff))return Promise.reject(Error('Ссылка входа некорректна. Откройте кабинет из приложения ещё раз.'));
  bootstrap=(async()=>{
    const response=await apiFetch('/api/student-view/redeem',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json','X-Student-View':'1'},body:JSON.stringify({handoff})});
    if(!response.ok)throw Error(await parseApiError(response));
    const session=await response.json();
    if(!isStudentViewTab()||session.role!=='student'||!session.studentView||!String(session.token||'').startsWith('sv_'))
      throw Error('Не удалось подтвердить вход в кабинет ученика.');
    writeStoredAuthUser(session);
    return true;
  })();
  return bootstrap;
}
