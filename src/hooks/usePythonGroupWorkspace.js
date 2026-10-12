import {useCallback,useEffect,useRef,useState} from 'react';
import {api,getStoredAuthToken} from '../services/api.js';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {boardPageBookRoom} from '../utils/boardPages.js';
import {buildLearningGroupTargetValue,parseLessonTargetValue} from '../utils/lessonTargets.js';
import {livePythonGroupTask,pythonGroupBoardRoom,PYTHON_GROUP_TASK_CONTROL} from '../utils/pythonGroupWorkspace.js';

export default function usePythonGroupWorkspace({role,userId,teacherId,groups:providedGroups,initialGroupId,activeStudentId,onSelectStudent}) {
  const [loadedGroups,setLoadedGroups]=useState([]),[error,setError]=useState('');
  const [target,setTarget]=useState(()=>initialGroupId?buildLearningGroupTargetValue(initialGroupId):'');
  const [hasSelected,setHasSelected]=useState(false);
  const [remoteTask,setRemoteTask]=useState(null),[connectedGroup,setConnectedGroup]=useState('');
  const runtime=useRef(null),pending=useRef(null),handled=useRef('');
  const groups=(providedGroups||loadedGroups).filter(group=>group.status!=='completed');
  const selection=parseLessonTargetValue(!hasSelected&&initialGroupId?buildLearningGroupTargetValue(initialGroupId):target);
  const group=selection.type==='group'?groups.find(g=>g.id===selection.id)||null:null;
  const groupId=group?.id||'',owner=group?.teacherId||teacherId,teacher=role==='teacher';
  useEffect(()=>{
    if(providedGroups)return undefined;
    let disposed=false;
    const refresh=()=>api.getLearningGroups({studentId:userId}).then(payload=>{
      if(disposed)return;
      const list=Array.isArray(payload)?payload:payload?.groups||[];
      setLoadedGroups(list.filter(g=>g.status!=='completed'&&(g.members||[]).some(m=>(m.studentId||m.id)===userId&&m.status==='active')));setError('');
    }).catch(e=>{if(!disposed)setError(e.message||'Не удалось загрузить группы');});
    void refresh();window.addEventListener('learning-groups-changed',refresh);window.addEventListener('focus',refresh);
    return()=>{disposed=true;window.removeEventListener('learning-groups-changed',refresh);window.removeEventListener('focus',refresh);};
  },[providedGroups,userId]);
  const selectTarget=useCallback(value=>{
    setHasSelected(true);const next=parseLessonTargetValue(value);setTarget(next.type==='group'?value:'');
    if(next.type==='student'&&teacher)onSelectStudent?.(next.id||null);
  },[teacher,onSelectStudent]);
  const publishTask=useCallback(state=>{
    const next={...state,groupId,teacherId:owner};pending.current=next;
    const live=runtime.current;if(!teacher||!groupId||live?.groupId!==groupId||!live.provider.synced)return;
    const previous=live.control.get(PYTHON_GROUP_TASK_CONTROL);
    if(previous&&JSON.stringify({...previous,id:undefined})===JSON.stringify({...next,id:undefined}))return;
    const command={...next,id:crypto.randomUUID()};live.control.set(PYTHON_GROUP_TASK_CONTROL,command);
    live.provider.awareness.setLocalStateField('pythonGroupTask',{id:command.id,userId,open:command.open});
  },[teacher,groupId,owner,userId]);
  useEffect(()=>{
    if(!groupId)return undefined;
    let disposed=false,cleanup;handled.current='';
    void loadYjsRuntime().then(({Y,WebsocketProvider})=>{
      if(disposed)return;const doc=new Y.Doc(),provider=new WebsocketProvider(getCollabWsUrl(),boardPageBookRoom(pythonGroupBoardRoom(groupId)),doc,{params:{_auth:getStoredAuthToken()||''},disableBc:true});
      const control=doc.getMap('pageControl');runtime.current={doc,provider,control,groupId};
      const update=()=>{
        if(disposed)return;setConnectedGroup(provider.wsconnected&&provider.synced?groupId:'');
        if(teacher){if(provider.synced&&pending.current?.groupId===groupId)publishTask(pending.current);return;}
        if(!provider.synced)return;
        const command=livePythonGroupTask(control.get(PYTHON_GROUP_TASK_CONTROL),Array.from(provider.awareness.getStates().values()),owner,groupId);
        if(command&&handled.current!==command.id){handled.current=command.id;setRemoteTask(command);}
      };
      control.observe(update);provider.on('sync',update);provider.on('status',update);provider.awareness.on('change',update);
      cleanup=()=>{
        control.unobserve(update);provider.off('sync',update);provider.off('status',update);provider.awareness.off('change',update);
        provider.destroy();doc.destroy();if(runtime.current?.doc===doc)runtime.current=null;
      };
    }).catch(e=>{if(!disposed)setError(e.message||'Не удалось подключить группу');});
    return()=>{disposed=true;cleanup?.();};
  },[groupId,owner,teacher,publishTask]);
  return {groups,group,groupId,targetValue:groupId?buildLearningGroupTargetValue(groupId):teacher?(activeStudentId||''):'',selectTarget,publishTask,
    remoteTask:remoteTask?.groupId===groupId?remoteTask:null,connected:!!groupId&&connectedGroup===groupId,error};
}
