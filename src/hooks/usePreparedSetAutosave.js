import {useCallback,useEffect,useRef,useState} from 'react';
import {preparedRequest} from '../services/preparedLessonTasks.js';
import {mergePreparedSetSave} from '../utils/preparedSetSave.js';
import {upsertPreparedSet} from '../utils/preparedSetLibrary.js';

// Each editor session has its own queue and optimistic server version. A late
// response may acknowledge a snapshot, but never replace edits made after it.
export function usePreparedSetAutosave({edit,savedSnapshot,setEdit,setSavedSnapshot,setSets}){
  const session=useRef(null),latest=useRef(edit);
  useEffect(()=>{latest.current=edit;},[edit]);
  const [status,setStatus]=useState(''),[saveError,setSaveError]=useState('');
  const begin=useCallback(value=>{session.current={id:value.id,version:value.version||0,tail:Promise.resolve(),blocked:false};latest.current=value;setStatus('');setSaveError('');},[]);
  const persist=useCallback((autosave=false)=>{
    const current=session.current;if(!current)return Promise.resolve(null);
    const job=current.tail.catch(()=>{}).then(async()=>{
      if(session.current!==current||!latest.current)return null;
      if(current.blocked)throw Error('Набор изменён в другом окне. Откройте актуальную версию; ваш черновик сохранён на устройстве.');
      const submitted=latest.current,signature=JSON.stringify(submitted);
      if(autosave&&signature===current.acknowledged)return null;
      setStatus('saving');setSaveError('');
      try{
        const value=await preparedRequest(current.version?`/api/lesson-task-sets/${current.id}`:'/api/lesson-task-sets',{...submitted,id:current.id,version:current.version,autosave},current.version?'PUT':'POST');
        current.id=value.id;current.version=value.version;current.acknowledged=JSON.stringify(value);
        setSets(old=>upsertPreparedSet(old,value));
        if(session.current===current){
          setSavedSnapshot(JSON.stringify(value));
          setEdit(old=>{
            if(session.current!==current||!old)return old;
            if(JSON.stringify(old)===signature){latest.current=value;return value;}
            const merged=mergePreparedSetSave(old,submitted,value);latest.current=merged;return merged;
          });
          setStatus(value.draft?'draft':'saved');
        }
        return value;
      }catch(error){if(session.current===current){if(error.status===409)current.blocked=true;setSaveError(error.message);setStatus(error.status===409?'conflict':'offline');}throw error;}
    });
    current.tail=job;return job;
  },[setEdit,setSavedSnapshot,setSets]);
  useEffect(()=>{if(!edit||JSON.stringify(edit)===savedSnapshot)return;const timer=setTimeout(()=>{void persist(true).catch(()=>{});},900);return()=>clearTimeout(timer);},[edit,savedSnapshot,persist]);
  useEffect(()=>{const online=()=>{if(latest.current)void persist(true).catch(()=>{});};window.addEventListener('online',online);return()=>window.removeEventListener('online',online);},[persist]);
  return {begin,persist,status,saveError};
}
