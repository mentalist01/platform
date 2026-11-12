import {useCallback,useEffect,useRef,useState} from 'react';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {boardPagesList,boardPageSummonTarget} from '../utils/boardPages.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {getStoredAuthToken} from '../services/api.js';
import {requestLessonPages} from '../services/lessonPages.js';
import {lessonBookForCodeRoom} from '../utils/lessonPageSelection.js';
import {useLessonPageSelection} from './useLessonPageSelection.js';
import {observeLiveBoardCommand} from '../utils/boardCommandClock.js';
import {rememberSummonedCode,lessonSummonCodeRoom,normalizeSummonCode} from '../utils/lessonSummonCode.js';
import {createBoardSummonDelivery} from '../utils/boardSummonDelivery.js';
import {boardCommandNow} from '../utils/boardCommandClock.js';
import {summonRecipientIds} from '../utils/summonRecipients.js';
export function useLessonPages(room,role,userId) {
  const bookRoom=lessonBookForCodeRoom(room);
  const [selected,select]=useLessonPageSelection(bookRoom,role,userId,'main','code');
  const [state,setState]=useState({pages:[],connected:false,canEdit:false,error:''});
  const [navigation,setNavigation]=useState(null);
  const [summonState,setSummonState]=useState({phase:'idle'});
  const live=useRef(null);
  const cancelSummon=useCallback(()=>live.current?.delivery.cancel(),[]);
  const acknowledgeCode=useCallback(command=>{
    if(role!=='student'||!live.current||live.current.bookRoom!==bookRoom)return;
    live.current.provider.awareness.setLocalStateField('codeSummon',{userId,appliedId:command.id});
  },[bookRoom,role,userId]);
  const summonCode=useCallback(({solutionId,pageId,studentId='',recipientId=''},targetIds)=>{
    const current=live.current;
    if(!['teacher','admin'].includes(role)||!current?.canEdit||current.bookRoom!==bookRoom
      ||lessonSummonCodeRoom(bookRoom,studentId)!==room||!normalizeSummonCode({solutionId}))return;
    const recipients=summonRecipientIds(targetIds,recipientId);
    if(!recipients?.length||studentId&&recipients.some(id=>id!==studentId))return;
    current.delivery.request({id:crypto.randomUUID(),scope:'code',pageId,studentId,...(recipientId?{recipientIds:recipients}:{}),code:{solutionId}},recipients);
  },[room,bookRoom,role]);
  useEffect(()=>{
    if(!bookRoom)return undefined;
    const abort=new AbortController();let provider,doc,lastCommand='';
    Promise.all([loadYjsRuntime(),requestLessonPages(room,undefined,abort.signal)]).then(([runtime,result])=>{
      if(abort.signal.aborted)return;
      setNavigation(null);setSummonState({phase:'idle'});
      setState({pages:result.pages,connected:false,canEdit:result.canEdit,error:''});
      if(result.defaultPageId)select(current=>result.pages.some(p=>p.id===current)?current:result.defaultPageId);
      doc=new runtime.Y.Doc();provider=new runtime.WebsocketProvider(getCollabWsUrl(),bookRoom,doc,{params:{_auth:getStoredAuthToken()},disableBc:true});
      const control=doc.getMap('pageControl');
      const delivery=createBoardSummonDelivery({isReady:()=>provider.wsconnected&&provider.synced&&provider.ws?.readyState===1,
        send:command=>control.set(command.recipientIds?'summonCodeRecipient':'summonCode',command),onState:setSummonState,now:boardCommandNow});
      live.current={bookRoom,provider,delivery,canEdit:result.canEdit};
      const acknowledgements=()=>{for(const peer of provider.awareness.getStates().values()){
        const applied=peer?.codeSummon;if(applied?.userId)delivery.acknowledge(applied.userId,applied.appliedId);
      }};
      provider.awareness.on('change',acknowledgements);
      const changed=()=>{if(!provider.synced)return;const pages=boardPagesList(doc.getMap('pages'));setState(old=>({...old,pages,connected:provider.wsconnected&&provider.synced}));controls();};
      const controls=()=>{if(role==='teacher'||role==='admin')return;
        const target=['summon','summonCode','summonCodeRecipient'].map(key=>control.get(key)).filter(item=>item&&item.scope!=='board').sort((a,b)=>b.ts-a.ts)
          .map(command=>boardPageSummonTarget(command,userId,boardPagesList(doc.getMap('pages')))).find(Boolean);
        if(target&&target.id!==lastCommand){lastCommand=target.id;rememberSummonedCode(target,bookRoom,userId);select(target.pageId,{only:target.scope==='code'});setNavigation(target);}
      };
      doc.getMap('pages').observe(changed);control.observe(event=>{if(provider.synced){for(const key of ['summon','summonCode','summonCodeRecipient'])if(event.keysChanged.has(key))observeLiveBoardCommand(control.get(key));}controls();});
      provider.on('sync',()=>{changed();controls();delivery.flush();});provider.on('status',()=>{setState(old=>({...old,connected:provider.wsconnected&&provider.synced}));delivery.flush();});
    }).catch(error=>{if(!abort.signal.aborted)setState(old=>({...old,error:error.message,connected:false}));});
    return()=>{abort.abort();if(live.current?.provider===provider){live.current.delivery.dispose();live.current=null;}provider?.destroy();doc?.destroy();};
  },[room,bookRoom,role,userId,select]);
  useEffect(()=>{
    if(!['queued','waiting','confirmed','sent'].includes(summonState.phase))return undefined;
    const phase=summonState.phase;
    const timer=setTimeout(()=>{if(['queued','waiting'].includes(phase))live.current?.delivery.timeout();else setSummonState({phase:'idle'});},phase==='queued'?30000:phase==='waiting'?5000:3500);
    return()=>clearTimeout(timer);
  },[summonState.phase,summonState.id]);
  useEffect(()=>{if(state.pages.length&&!state.pages.some(page=>page.id===selected))select(state.pages[0].id);},[state.pages,selected,select]);
  return {...state,selected,select,bookRoom,navigation,summonCode,summonState,acknowledgeCode,cancelSummon,async change(input){const result=await requestLessonPages(room,input);setState(old=>({...old,pages:result.pages}));return result;}};
}
