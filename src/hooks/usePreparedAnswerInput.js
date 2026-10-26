import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPreparedAnswerBuffer} from '../utils/preparedSharedAnswers.js';

export function usePreparedAnswerInput({card,runId,runVersion,auth,readOnly,action,onError}){
  const draftKey=`prepared-answer:${auth.role}:${auth.id}:${runId}:${card.id}`;
  const [buffer]=useState(()=>{let draft;try{draft=JSON.parse(localStorage.getItem(draftKey)||'null');}catch{/* Optional recovery. */}return createPreparedAnswerBuffer({...card,sharedVersion:runVersion},draft);});
  const view=useSyncExternalStore(buffer.subscribe,buffer.getSnapshot,buffer.getSnapshot);
  const latest=useRef({action,onError,readOnly});
  useEffect(()=>{latest.current={action,onError,readOnly};},[action,onError,readOnly]);
  const timer=useRef(null),serial=useRef(Promise.resolve());
  const backup=useCallback(()=>{try{const value=buffer.backup();if(value)localStorage.setItem(draftKey,JSON.stringify(value));else localStorage.removeItem(draftKey);}catch{/* Server save remains available. */}},[buffer,draftKey]);
  useEffect(()=>{buffer.receive({...card,sharedVersion:runVersion});backup();},[card,runVersion,buffer,backup]);
  const flush=useCallback(()=>{
    clearTimeout(timer.current);
    const job=serial.current.catch(()=>{}).then(async()=>{
      if(latest.current.readOnly)return buffer.current();
      const batch=buffer.batch();if(!batch)return buffer.current();
      const result=await latest.current.action(runId,{action:'answer',cardId:card.id,answerSchema:batch.answerSchema,patches:batch.edits.map(({index,value})=>({index,value}))});
      const next=result.cards.find(row=>row.id===card.id);
      if(!next)throw Error('Задача убрана с доски. Ваш ввод сохранён в черновике.');
      buffer.acknowledge({...next,sharedVersion:result.version},batch);backup();return buffer.current();
    });
    serial.current=job;return job;
  },[buffer,backup,card.id,runId]);
  useEffect(()=>()=>{clearTimeout(timer.current);if(!latest.current.readOnly)void flush().catch(()=>{});},[flush]);
  const change=patches=>{buffer.change(patches);backup();clearTimeout(timer.current);timer.current=setTimeout(()=>void flush().catch(error=>latest.current.onError(error.message)),600);};
  const restore=()=>{try{buffer.restore();backup();void flush().catch(error=>latest.current.onError(error.message));}catch(error){latest.current.onError(error.message);}};
  return {answers:view.answers,draftConflict:view.conflict,change,flush,restoreDraft:restore,discardDraft:()=>{buffer.discard();backup();}};
}
