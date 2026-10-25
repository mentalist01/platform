import {useCallback,useEffect,useRef,useState} from 'react';
import {studyPlanRequest} from '../services/egeStudyPlan.js';
import {isStudyPlanDraft,studyPlanFingerprint} from '../utils/egeStudyPlan.js';

export default function useEgeStudyPlan(teacherId) {
  const key=`ege-study-plan:2027:${teacherId}`;
  const [plan,setPlan]=useState(null),[status,setStatus]=useState('loading'),[error,setError]=useState('');
  const [conflict,setConflict]=useState(null),[recovery,setRecovery]=useState(null);
  const session=useRef({plan:null,revision:0,fingerprint:'',saving:false,conflict:false,active:true});
  const saveRef=useRef(null);
  const loadGeneration=useRef(0);
  const local=useCallback((value,revision)=>{
    try{localStorage.setItem(key,JSON.stringify({plan:value,revision,dirty:studyPlanFingerprint(value)!==session.current.fingerprint}));}catch{/* Server save still works if storage is full. */}
  },[key]);
  const save=useCallback(async()=>{
    const state=session.current;
    if(!state.plan || state.saving || state.conflict || studyPlanFingerprint(state.plan)===state.fingerprint) return;
    const snapshot=state.plan;
    state.saving=true;
    if(state.active){setStatus('saving');setError('');}
    try {
      const saved=await studyPlanRequest({...snapshot,revision:state.revision});
      state.revision=saved.revision;state.fingerprint=studyPlanFingerprint(snapshot);
      local(state.plan,state.revision);
      if(state.active)setStatus(studyPlanFingerprint(state.plan)===state.fingerprint?'saved':'dirty');
    }catch(caught){
      if(caught.status===409 && caught.current){
        state.conflict=true;
        if(state.active)setConflict(caught.current);
      }
      if(state.active){setStatus('error');setError(caught.message);}
    }finally{
      state.saving=false;
      // Serial saves: an older response never replaces edits made during a request.
      if(!state.conflict && studyPlanFingerprint(state.plan)!==state.fingerprint) {
        // Retrying network failures is an explicit action or the next edit / online event.
        if(studyPlanFingerprint(snapshot)===state.fingerprint)void saveRef.current?.();
      }
    }
  },[local]);
  useEffect(()=>{saveRef.current=save;},[save]);
  const load=useCallback(async()=>{
    const generation=++loadGeneration.current;
    setStatus('loading');setError('');
    try{
      const saved=await studyPlanRequest();
      if(!session.current.active || generation!==loadGeneration.current)return;
      Object.assign(session.current,{plan:saved,revision:saved.revision,fingerprint:studyPlanFingerprint(saved),conflict:false});
      setPlan(saved);setStatus('saved');setConflict(null);
      try{
        const draft=JSON.parse(localStorage.getItem(key));
        if(draft?.dirty && isStudyPlanDraft(draft.plan)
          && studyPlanFingerprint(draft.plan)!==studyPlanFingerprint(saved))setRecovery(draft);
      }catch{/* A damaged local draft does not replace the account copy. */}
    }catch(caught){if(session.current.active && generation===loadGeneration.current){setStatus('error');setError(caught.message);}}
  },[key]);
  useEffect(()=>{
    const state=session.current;
    state.active=true;
    void load();
    const online=()=>void saveRef.current?.();
    const beforeUnload=event=>{
      const state=session.current;
      if(state.plan && studyPlanFingerprint(state.plan)!==state.fingerprint){event.preventDefault();event.returnValue='';}
    };
    window.addEventListener('online',online);window.addEventListener('beforeunload',beforeUnload);
    return ()=>{
      state.active=false;
      void saveRef.current?.();
      window.removeEventListener('online',online);window.removeEventListener('beforeunload',beforeUnload);
    };
  },[load]);
  const change=useCallback(next=>{
    session.current.plan=next;setPlan(next);local(next,session.current.revision);
    setStatus('dirty');
  },[local]);
  useEffect(()=>{
    if(status!=='dirty')return;
    const timer=setTimeout(()=>void save(),650);
    return ()=>clearTimeout(timer);
  },[status,plan,save]);
  const recover=()=>{if(recovery){change(recovery.plan);setRecovery(null);}};
  const discardRecovery=()=>{setRecovery(null);local(session.current.plan,session.current.revision);};
  const resolveConflict=keepLocal=>{
    const current=conflict;
    if(!current)return;
    Object.assign(session.current,{revision:current.revision,fingerprint:studyPlanFingerprint(current),conflict:false});
    setConflict(null);setError('');
    if(keepLocal){setStatus('dirty');void saveRef.current?.();}
    else{session.current.plan=current;setPlan(current);local(current,current.revision);setStatus('saved');}
  };
  return {plan,change,status,error,save,load,recovery,recover,discardRecovery,conflict,resolveConflict};
}
