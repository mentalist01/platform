import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,CloudCheck,Loader2} from 'lucide-react';
import {PreparedTaskCard} from './PreparedLessonBoard.jsx';
import {preparedRequest} from '../services/preparedLessonTasks.js';
import './PreparedHomework.css';

const Sandbox=React.lazy(()=>import('../App.jsx').then(module=>({default:module.LessonReplaySandboxSurface})));
const serial=value=>JSON.stringify({code:value.code,board:value.board});
const withoutTokens=value=>JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==='string'?item.replace(/([?&])(?:_auth|authToken)=[^&#]*/g,'$1').replace(/\?&/g,'?').replace(/[?&]$/,''):item));

function Workspace({request,user,theme,onClose}){
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[error,setError]=useState(''),[status,setStatus]=useState('loading'),[conflict,setConflict]=useState(null);
  const current=useRef(null),version=useRef(0),saved=useRef(''),timer=useRef(null),queue=useRef(Promise.resolve()),alive=useRef(true),persistRef=useRef(null);
  const studentId=user.role==='student'?user.id:request.studentId;
  const key=`prepared-homework-draft:${user.id}:${studentId}:${request.snapshotId}`;
  const keepLocal=useCallback(()=>{if(!current.current||user.role!=='student')return;try{localStorage.setItem(key,JSON.stringify({revision:version.current,...current.current}));}catch{/* Server autosave remains available. */}},[key,user.role]);
  const load=useCallback(()=>preparedRequest(`/api/prepared-homework/${request.snapshotId}/open`,{studentId}),[request.snapshotId,studentId]);
  useEffect(()=>{
    alive.current=true;let cancelled=false;
    load().then(value=>{
      if(cancelled)return;setData(value);version.current=value.workspace.revision;saved.current=serial(value.workspace);
      let local;try{local=JSON.parse(localStorage.getItem(key)||'null');}catch{/* Optional recovery. */}
      const initial=local&&serial(local)!==saved.current&&local.revision===value.workspace.revision?local:value.workspace;
      current.current=initial;setDraft(initial);setStatus('saved');if(initial===local&&user.role==='student'&&!value.readOnly){setStatus('pending');timer.current=setTimeout(()=>void persistRef.current?.().catch(()=>{}),650);}if(local&&local.revision!==value.workspace.revision&&serial(local)!==saved.current)setConflict({local,remote:value.workspace});
    }).catch(e=>{if(!cancelled)setError(e.message);});
    return()=>{cancelled=true;alive.current=false;clearTimeout(timer.current);};
  },[load,key,user.role]);
  const persist=useCallback(()=>{
    clearTimeout(timer.current);keepLocal();
    const job=queue.current.catch(()=>{}).then(async()=>{
      while(current.current&&serial(current.current)!==saved.current){
        const snapshot=current.current,serialized=serial(snapshot);if(alive.current)setStatus('saving');
        try{const result=await preparedRequest(`/api/prepared-homework/${request.snapshotId}/workspace`,{revision:version.current,code:snapshot.code,board:withoutTokens(snapshot.board)},'PUT');version.current=result.revision;saved.current=serialized;}
        catch(e){keepLocal();if(alive.current){setError(e.message+' Черновик остаётся на этом устройстве.');setStatus('error');if(e.status===409){const fresh=await load();if(alive.current)setConflict({local:current.current,remote:fresh.workspace});}}throw e;}
      }
      if(alive.current){setStatus('saved');setError('');}try{localStorage.removeItem(key);}catch{/* Optional recovery. */}
    });queue.current=job;return job;
  },[request.snapshotId,keepLocal,key,load]);
  useEffect(()=>{persistRef.current=persist;},[persist]);
  const change=useCallback(patch=>{
    if(!current.current||user.role!=='student'||data?.readOnly||conflict)return;
    const next={...current.current,...patch};if(serial(next)===serial(current.current))return;
    current.current=next;setDraft(next);setStatus('pending');clearTimeout(timer.current);timer.current=setTimeout(()=>void persistRef.current().catch(()=>{}),650);
  },[user.role,data?.readOnly,conflict]);
  const changeCode=useCallback(patch=>{if(current.current)change({code:{...current.current.code,...patch}});},[change]);
  const changeBoard=useCallback(items=>{if(current.current)change({board:{...current.current.board,items:withoutTokens(items)}});},[change]);
  useEffect(()=>{
    const hidden=()=>{keepLocal();if(document.visibilityState==='hidden'&&!conflict&&user.role==='student')void persistRef.current?.().catch(()=>{});};
    window.addEventListener('beforeunload',keepLocal);document.addEventListener('visibilitychange',hidden);
    return()=>{keepLocal();window.removeEventListener('beforeunload',keepLocal);document.removeEventListener('visibilitychange',hidden);};
  },[keepLocal,conflict,user.role]);
  const refresh=useCallback(async()=>{try{const result=await load();if(alive.current)setData(previous=>previous?{...previous,run:result.run,readOnly:result.readOnly}:result);}catch(e){if(alive.current)setError(e.message);}},[load]);
  const runId=data?.run.id;
  useEffect(()=>{if(!runId)return;const timer=setInterval(()=>void refresh(),15000),focus=()=>void refresh();window.addEventListener('focus',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);};},[runId,refresh]);
  const action=useCallback(async(id,input)=>{const result=await preparedRequest(`/api/lesson-task-runs/${id}/action`,input);if(alive.current)setData(previous=>({...previous,run:result.run}));return result.run;},[]);
  const close=async()=>{keepLocal();if(user.role==='student'&&!conflict&&!data?.readOnly)try{await persist();}catch{/* A local recovery copy remains. */}window.dispatchEvent(new Event('prepared-homework-progress'));onClose();};
  let references=true;try{references=localStorage.getItem(`prepared-reference-visibility:${user.role}:${user.id}`)!=='hidden';}catch{/* Optional preference. */}
  const card=data?.run.cards[0];
  const images=(draft?.board.items||[]).map(item=>item.preparedAssetId?{...item,assetUrl:`/api/prepared-homework/${request.snapshotId}/assets/${item.preparedAssetId}?studentId=${encodeURIComponent(studentId)}`}:item);
  const branch=data&&draft?{branchId:data.run.id,metadata:{studentId},code:draft.code,board:{...draft.board,items:images}}:null;
  return <section className={`prepared-homework-workspace${theme==='dark'?' prepared-dark':''}`} role="dialog" aria-modal="true" aria-label="Дорешать задачу с урока">
    <header><div><small>{user.role==='student'?'Домашняя работа · личная копия':'Домашняя работа · решение ученика'}</small><h2>{data?.title||'Задача с урока'}</h2></div><span role="status">{status==='saving'?<><Loader2 size={15} className="animate-spin"/>Сохраняем…</>:status==='pending'?'Есть изменения':status==='saved'?<><CloudCheck size={15}/>Сохранено</>:''}</span><button type="button" aria-label="Закрыть домашнюю задачу" onClick={()=>void close()}><X size={21}/></button></header>
    {data?.readOnly&&user.role==='student'&&<p className="prepared-homework-readonly">Приём этой домашней работы завершён. Сохранённое решение доступно для просмотра.</p>}
    {error&&<p role="alert" className="prepared-error">{error}</p>}
    {conflict&&<aside className="prepared-homework-conflict"><p>Серверная версия отличается от черновика на этом устройстве. Выберите, что продолжить.</p><button type="button" onClick={()=>{version.current=conflict.remote.revision;saved.current=serial(conflict.remote);current.current=conflict.local;setDraft(conflict.local);setConflict(null);setError('');setStatus('pending');timer.current=setTimeout(()=>void persistRef.current?.().catch(()=>{}),650);}}>Восстановить локальный черновик</button><button type="button" onClick={()=>{version.current=conflict.remote.revision;saved.current=serial(conflict.remote);current.current=conflict.remote;setDraft(conflict.remote);setConflict(null);setError('');setStatus('saved');try{localStorage.removeItem(key);}catch{/* Optional recovery. */}}}>Открыть серверную версию</button></aside>}
    {data&&draft&&<div className="prepared-homework-columns"><aside className="prepared-homework-condition prepared-board-layer"><PreparedTaskCard key={card.id} card={card} run={data.run} auth={{id:user.id,role:user.role}} context={{action,select:()=>{},refresh}} readOnly={data.run.readOnly||Boolean(conflict)} showReferenceAnswers={references} style={{position:'relative',width:'100%',transform:'none'}}/></aside><main className="prepared-homework-sandbox"><React.Suspense fallback={<p>Открываем код и доску…</p>}><Sandbox key={data.run.id+Boolean(conflict)} branch={branch} branchEpoch={0} surface="lesson" sandboxSessionId={'prepared-homework-'+data.run.id} user={user} theme={theme} tasks={[]} students={[]} readOnly={data.readOnly||Boolean(conflict)} onBoardChange={changeBoard} onCodeChange={changeCode} runtimeFiles={card.attachments}/></React.Suspense></main></div>}
    {!data&&!error&&<p>Открываем условие и начатое решение…</p>}
  </section>;
}

export default function PreparedHomeworkHost({user,theme}){
  const [request,setRequest]=useState(null);
  useEffect(()=>{const open=event=>{if(event.detail?.snapshotId)setRequest(event.detail);};window.addEventListener('prepared-homework-open',open);return()=>window.removeEventListener('prepared-homework-open',open);},[]);
  useEffect(()=>{if(!request)return;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=overflow;};},[request]);
  return request?createPortal(<div className="prepared-homework-backdrop"><Workspace key={`${request.snapshotId}:${request.studentId}`} request={request} user={user} theme={theme} onClose={()=>setRequest(null)}/></div>,document.fullscreenElement||document.body):null;
}
