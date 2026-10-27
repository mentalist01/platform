import {useEffect,useState} from 'react';
import {ExternalLink,LogOut,UserRound} from 'lucide-react';
import {apiFetch,parseApiError} from '../services/api.js';
import {getStudentViewToken,readStoredAuthUser,removeStoredAuthUser,writeStoredAuthUser,STUDENT_VIEW_SESSION_KEY} from '../utils/authSessionStorage.js';
import './StudentViewSession.css';

export function OpenStudentSessionButton({student}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const open=async event=>{
    event.stopPropagation();
    if(busy)return;
    // Open synchronously within the click, before waiting for the API, so
    // popup blocking never leaves a pupil credential without a destination.
    const tab=window.open('about:blank','_blank');
    if(!tab){setError('Разрешите открытие новой вкладки для этого сайта.');return;}
    tab.opener=null;
    tab.document.title='Открываем кабинет ученика…';
    tab.document.body.textContent='Открываем кабинет ученика…';
    setBusy(true);setError('');
    let session;
    try{
      const response=await apiFetch('/api/students/'+encodeURIComponent(student.id)+'/open-session',{
        method:'POST',headers:{'Content-Type':'application/json','X-Student-View':'1'},body:'{}',
      });
      if(!response.ok)throw Error(await parseApiError(response));
      session=await response.json();
      if(tab.closed)throw Error('Новая вкладка была закрыта.');
      tab.sessionStorage.setItem(STUDENT_VIEW_SESSION_KEY,JSON.stringify(session));
      tab.location.replace('/student-view');
    }catch(e){
      if(session?.token)void apiFetch('/api/student-view/end',{method:'POST',headers:{Authorization:'Bearer '+session.token,'X-Ege-Auth-Token':session.token}}).catch(()=>{});
      if(!tab.closed)tab.close();
      setError(e.message||'Не удалось открыть кабинет ученика.');
    }finally{setBusy(false);}
  };
  return <span className="student-view-launch"><button type="button" className="student-view-launch__button" disabled={busy} onClick={open} title="Открыть кабинет ученика в новой вкладке"><ExternalLink size={14}/>{busy?'Открываем…':'Войти как ученик'}</button>{error&&<small role="alert">{error}</small>}</span>;
}

export function StudentViewClosed(){
  return <div className="student-view-closed"><UserRound size={30}/><h1>Вход за ученика завершён</h1><p>Кабинет учителя остаётся в исходной вкладке. Чтобы снова войти, нажмите «Войти как ученик» в списке учеников.</p><button type="button" onClick={()=>window.close()}>Закрыть вкладку</button></div>;
}

export default function StudentViewSession({children}){
  const [state,setState]=useState('loading'),[name,setName]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    const check=async()=>{
      if(!getStudentViewToken()){setState('closed');return;}
      try{
        const response=await apiFetch('/api/session');
        if(!response.ok)throw Object.assign(Error(await parseApiError(response)),{status:response.status});
        const user=await response.json();
        if(user.role!=='student'||!user.studentView)throw Object.assign(Error('Вкладка ученика больше недоступна.'),{status:401});
        if(!active)return;
        writeStoredAuthUser(user);setName(user.name);setState('ready');
        document.title=user.name+' · Кабинет ученика';
      }catch(e){if(!active)return;if(e.status===401||e.status===403){removeStoredAuthUser();setState('closed');}else{setError(e.message);setState('error');}}
    };
    void check();return()=>{active=false;};
  },[attempt]);
  const close=async()=>{
    setState('closing');
    try{await apiFetch('/api/student-view/end',{method:'POST'});}catch{/* Expiring scoped session never logs out the teacher. */}
    removeStoredAuthUser();setState('closed');window.close();
  };
  if(state==='closed')return <StudentViewClosed/>;
  if(state==='error')return <div className="student-view-closed" role="alert"><p>{error}</p><button type="button" onClick={()=>{setState('loading');setAttempt(value=>value+1);}}>Попробовать снова</button></div>;
  if(state!=='ready')return <div className="student-view-closed" role="status">{state==='closing'?'Завершаем вход…':'Открываем кабинет ученика…'}</div>;
  return <div className="student-view-session"><header className="student-view-banner"><UserRound size={18}/><span>Вы вошли как <strong>{name||readStoredAuthUser()?.name}</strong><small>Действия сохраняются в аккаунте ученика</small></span><button type="button" onClick={close}><LogOut size={16}/>Закрыть вход</button></header>{children}</div>;
}
