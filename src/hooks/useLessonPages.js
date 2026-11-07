import {useEffect,useState} from 'react';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {boardPagesList,boardPageSummonTarget} from '../utils/boardPages.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {getStoredAuthToken} from '../services/api.js';
import {requestLessonPages} from '../services/lessonPages.js';
import {lessonBookForCodeRoom} from '../utils/lessonPageSelection.js';
import {useLessonPageSelection} from './useLessonPageSelection.js';
import {observeLiveBoardCommand} from '../utils/boardCommandClock.js';
import {rememberSummonedCode} from '../utils/lessonSummonCode.js';
export function useLessonPages(room,role,userId) {
  const bookRoom=lessonBookForCodeRoom(room);
  const [selected,select]=useLessonPageSelection(bookRoom,role,userId);
  const [state,setState]=useState({pages:[],connected:false,canEdit:false,error:''});
  const [navigation,setNavigation]=useState(null);
  useEffect(()=>{
    if(!bookRoom)return undefined;
    const abort=new AbortController();let provider,doc,lastCommand='';
    setNavigation(null);
    Promise.all([loadYjsRuntime(),requestLessonPages(room,undefined,abort.signal)]).then(([runtime,result])=>{
      if(abort.signal.aborted)return;
      setState({pages:result.pages,connected:false,canEdit:result.canEdit,error:''});
      if(result.defaultPageId)select(current=>result.pages.some(p=>p.id===current)?current:result.defaultPageId);
      doc=new runtime.Y.Doc();provider=new runtime.WebsocketProvider(getCollabWsUrl(),bookRoom,doc,{params:{_auth:getStoredAuthToken()},disableBc:true});
      const changed=()=>{if(!provider.synced)return;const pages=boardPagesList(doc.getMap('pages'));setState(old=>({...old,pages,connected:provider.wsconnected&&provider.synced}));controls();};
      const controls=()=>{if(role==='teacher'||role==='admin')return;const target=boardPageSummonTarget(doc.getMap('pageControl').get('summon'),userId,boardPagesList(doc.getMap('pages')));if(target&&target.id!==lastCommand){lastCommand=target.id;rememberSummonedCode(target,bookRoom,userId);select(target.pageId);setNavigation(target);}};
      doc.getMap('pages').observe(changed);doc.getMap('pageControl').observe(()=>{if(provider.synced)observeLiveBoardCommand(doc.getMap('pageControl').get('summon'));controls();});
      provider.on('sync',()=>{changed();controls();});provider.on('status',()=>setState(old=>({...old,connected:provider.wsconnected&&provider.synced})));
    }).catch(error=>{if(!abort.signal.aborted)setState(old=>({...old,error:error.message,connected:false}));});
    return()=>{abort.abort();provider?.destroy();doc?.destroy();};
  },[room,bookRoom,role,userId,select]);
  useEffect(()=>{if(state.pages.length&&!state.pages.some(page=>page.id===selected))select(state.pages[0].id);},[state.pages,selected,select]);
  return {...state,selected,select,bookRoom,navigation,async change(input){const result=await requestLessonPages(room,input);setState(old=>({...old,pages:result.pages}));return result;}};
}
