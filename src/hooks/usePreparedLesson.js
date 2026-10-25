import {useCallback,useSyncExternalStore} from 'react';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {getStoredAuthToken} from '../services/api.js';
import {preparedRequest,preparedSelectionKey} from '../services/preparedLessonTasks.js';

const empty={run:null,selectedId:'',loading:false,error:'',codeVersion:0,busyCardId:''};
const entries=new Map();
const entryFor=room=>{if(!entries.has(room))entries.set(room,{state:empty,listeners:new Set(),users:0,sequence:0});return entries.get(room);};
function publish(entry,patch){entry.state={...entry.state,...patch};for(const listener of entry.listeners)listener();}
function apply(entry,run){if(entry.state.run&&run?.id===entry.state.run.id&&run.version<entry.state.run.version)return;if(run?.changeOnly){publish(entry,{run:{...entry.state.run,version:run.version},codeVersion:entry.state.codeVersion+1});return;}let selectedId=entry.state.selectedId;try{selectedId=selectedId||localStorage.getItem(preparedSelectionKey(entry.room))||'';}catch{/* optional preference */}if(!run?.cards.some(c=>c.id===selectedId))selectedId=run?.cards.at(-1)?.id||'';publish(entry,{run,selectedId,loading:false,error:''});}
async function refresh(entry){const sequence=++entry.sequence;try{const data=await preparedRequest(`/api/lesson-task-run?room=${encodeURIComponent(entry.room)}`);if(sequence===entry.sequence&&entry.users)apply(entry,data.run);}catch(error){if(entry.users)publish(entry,{loading:false,error:error.message});}}
function connect(entry){entry.room=entry.room||'';let disposed=false;publish(entry,{loading:true});void refresh(entry);
  const book=entry.room.split('~page~')[0].split('~student~')[0]+'~pages';
  loadYjsRuntime().then(({Y,WebsocketProvider})=>{if(disposed)return;const doc=new Y.Doc(),provider=new WebsocketProvider(getCollabWsUrl(),book,doc,{params:{_auth:getStoredAuthToken()},disableBc:true});entry.runtime={doc,provider};const signals=doc.getMap('preparedTaskSignals');let timer;
    const update=()=>{const change=signals.get(entry.room);if(!change)return;if(change.kind==='code'){publish(entry,{codeVersion:entry.state.codeVersion+1});return;}clearTimeout(timer);timer=setTimeout(()=>void refresh(entry),90);};
    signals.observe(update);provider.on('sync',()=>{if(provider.synced)void refresh(entry);});entry.cleanup=()=>{clearTimeout(timer);signals.unobserve(update);provider.destroy();doc.destroy();};
  }).catch(error=>{if(!disposed)publish(entry,{loading:false,error:error.message});});return()=>{disposed=true;entry.sequence++;entry.cleanup?.();entry.cleanup=null;entry.runtime=null;};
}
export function usePreparedLesson(room){
  const subscribe=useCallback(listener=>{if(!room)return()=>{};const entry=entryFor(room);entry.room=room;entry.listeners.add(listener);if(entry.users++===0)entry.disconnect=connect(entry);return()=>{entry.listeners.delete(listener);if(--entry.users===0){entry.disconnect?.();entries.delete(room);}};},[room]);
  const snapshot=useCallback(()=>room?entryFor(room).state:empty,[room]);const state=useSyncExternalStore(subscribe,snapshot,snapshot);
  const action=useCallback(async(id,input)=>{const result=await preparedRequest(`/api/lesson-task-runs/${id}/action`,input);if(room&&entries.has(room))apply(entryFor(room),result.run);return result.run;},[room]);
  const select=useCallback(id=>{const entry=entryFor(room);if(entry.state.busyCardId&&entry.state.busyCardId!==id)return false;if(!entry.state.run?.cards.some(c=>c.id===id))return false;try{localStorage.setItem(preparedSelectionKey(room),id);}catch{/* optional */}publish(entry,{selectedId:id});return true;},[room]);
  const start=useCallback(async input=>{const result=await preparedRequest('/api/lesson-task-runs',{...input,room});apply(entryFor(room),result.run);return result.run;},[room]);
  const append=useCallback(async(setId,setVersion)=>{const entry=entryFor(room),result=await preparedRequest(`/api/lesson-task-runs/${entry.state.run.id}/sets`,{setId,setVersion});apply(entry,result.run);return result.run;},[room]);
  const setBusy=useCallback((cardId,busy)=>{const entry=entries.get(room);if(entry)publish(entry,{busyCardId:busy?cardId:''});},[room]);
  return {...state,action,select,start,append,setBusy,refresh:()=>room&&refresh(entryFor(room))};
}
