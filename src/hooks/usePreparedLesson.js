import {useCallback,useSyncExternalStore} from 'react';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {getStoredAuthToken,ACHIEVEMENT_PROGRESS_EVENT} from '../services/api.js';
import {hasPreparedAchievementProgress} from '../utils/preparedAchievementProgress.js';
import {preparedRequest,preparedSelectionKey} from '../services/preparedLessonTasks.js';
import {createPreparedRefresh} from '../utils/preparedRefresh.js';
import {createPreparedSuccessFlow} from '../utils/preparedSuccessFlow.js';

const empty={run:null,selectedId:'',loading:false,error:'',codeVersion:0,busyCardId:'',celebrationCardId:''};
const entries=new Map(),resumeSelections=new Map();
const entryFor=room=>{if(!entries.has(room))entries.set(room,{state:empty,listeners:new Set(),users:0,sequence:0});return entries.get(room);};
function publish(entry,patch){entry.state={...entry.state,...patch};for(const listener of entry.listeners)listener();}
function apply(entry,run){const previous=entry.state.run;if(entry.state.run&&run?.id===entry.state.run.id&&run.version<entry.state.run.version)return;if(run?.changeOnly){publish(entry,{run:{...entry.state.run,version:run.version},codeVersion:entry.state.codeVersion+1});return;}const achievementProgress=hasPreparedAchievementProgress(entry.state.run,run);let selectedId=resumeSelections.get(entry.room)||entry.state.selectedId;try{selectedId=selectedId||localStorage.getItem(preparedSelectionKey(entry.room))||'';}catch{/* optional preference */}if(!run?.cards.some(c=>c.id===selectedId))selectedId=run?.cards.at(-1)?.id||'';if(run)resumeSelections.delete(entry.room);publish(entry,{run,selectedId,loading:false,error:''});entry.successFlow?.update(previous,run,selectedId);if(achievementProgress&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent(ACHIEVEMENT_PROGRESS_EVENT));}
function refresh(entry,signal){return entry.refresher?.refresh(signal);}
function connect(entry){entry.room=entry.room||'';let disposed=false;entry.successFlow=createPreparedSuccessFlow({current:()=>entry.state,onStart:cardId=>publish(entry,{celebrationCardId:cardId}),onStop:()=>publish(entry,{celebrationCardId:''}),onAdvance:id=>selectPreparedLessonCard(entry.room,id)});publish(entry,{loading:true});entry.refresher=createPreparedRefresh({read:async signal=>(await preparedRequest(`/api/lesson-task-run?room=${encodeURIComponent(entry.room)}`,undefined,'GET',signal)).run,apply:run=>apply(entry,run),current:()=>entry.state.run,onError:error=>publish(entry,{loading:false,error:error.message}),active:()=>entry.users>0});void refresh(entry);
  const book=entry.room.split('~page~')[0].split('~student~')[0]+'~pages';
  loadYjsRuntime().then(({Y,WebsocketProvider})=>{if(disposed)return;const doc=new Y.Doc(),provider=new WebsocketProvider(getCollabWsUrl(),book,doc,{params:{_auth:getStoredAuthToken()},disableBc:true});entry.runtime={doc,provider};const signals=doc.getMap('preparedTaskSignals');let timer;
    const update=()=>{const change=signals.get(entry.room);if(!change)return;if(change.kind==='code'){publish(entry,{codeVersion:entry.state.codeVersion+1});return;}clearTimeout(timer);timer=setTimeout(()=>void refresh(entry,change),90);};
    signals.observe(update);provider.on('sync',()=>{const change=signals.get(entry.room);if(provider.synced&&(change||entry.state.error))void refresh(entry,entry.state.error?undefined:change);});entry.cleanup=()=>{clearTimeout(timer);signals.unobserve(update);provider.destroy();doc.destroy();};
  }).catch(error=>{if(!disposed)publish(entry,{loading:false,error:error.message});});return()=>{disposed=true;entry.successFlow?.cancel();entry.refresher?.dispose();entry.refresher=null;entry.sequence++;entry.cleanup?.();entry.cleanup=null;entry.runtime=null;};
}
export function selectPreparedLessonCard(room,id){
  const entry=entries.get(room);
  if(entry?.state.busyCardId&&entry.state.busyCardId!==id)return false;
  if(entry&&entry.state.selectedId!==id)entry.successFlow?.cancel();
  resumeSelections.set(room,id);if(resumeSelections.size>100)resumeSelections.delete(resumeSelections.keys().next().value);
  try{localStorage.setItem(preparedSelectionKey(room),id);}catch{/* optional preference */}
  if(entry&&(!entry.state.run||entry.state.run.cards.some(card=>card.id===id)))publish(entry,{selectedId:id});
  return true;
}
export function usePreparedLesson(room){
  const subscribe=useCallback(listener=>{if(!room)return()=>{};const entry=entryFor(room);entry.room=room;entry.listeners.add(listener);if(entry.users++===0)entry.disconnect=connect(entry);return()=>{entry.listeners.delete(listener);if(--entry.users===0){entry.disconnect?.();entries.delete(room);}};},[room]);
  const snapshot=useCallback(()=>room?entryFor(room).state:empty,[room]);const state=useSyncExternalStore(subscribe,snapshot,snapshot);
  const action=useCallback(async(id,input)=>{const result=await preparedRequest(`/api/lesson-task-runs/${id}/action`,input);if(room&&entries.has(room))apply(entryFor(room),result.run);return result.run;},[room]);
  const select=useCallback(id=>{const entry=entryFor(room);if(entry.state.busyCardId&&entry.state.busyCardId!==id)return false;if(!entry.state.run?.cards.some(c=>c.id===id))return false;if(entry.state.selectedId!==id)entry.successFlow?.cancel();resumeSelections.delete(room);try{localStorage.setItem(preparedSelectionKey(room),id);}catch{/* optional */}publish(entry,{selectedId:id});return true;},[room]);
  const start=useCallback(async input=>{const result=await preparedRequest('/api/lesson-task-runs',{...input,room});apply(entryFor(room),result.run);return result.run;},[room]);
  const append=useCallback(async(setId,setVersion)=>{const entry=entryFor(room),result=await preparedRequest(`/api/lesson-task-runs/${entry.state.run.id}/sets`,{setId,setVersion});apply(entry,result.run);return result.run;},[room]);
  const setBusy=useCallback((cardId,busy)=>{const entry=entries.get(room);if(entry)publish(entry,{busyCardId:busy?cardId:''});},[room]);
  return {...state,action,select,start,append,setBusy,refresh:()=>room&&refresh(entryFor(room))};
}
