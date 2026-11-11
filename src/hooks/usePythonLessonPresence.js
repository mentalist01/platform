import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {getStoredAuthToken} from '../services/api.js';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {pythonExplanationBoardRoom} from '../utils/pythonExplanationBoard.js';
import {boardPageBookRoom} from '../utils/boardPages.js';
import {PYTHON_PRESENCE, PYTHON_SUMMON, normalizePythonLocation, selectPythonPeer, pythonSummonTarget, samePythonTask} from '../utils/pythonLessonPresence.js';

// Lives in the dashboard, so a pupil can be called from homework or any other section.
export default function usePythonLessonPresence({enabled=true, role, userId, teacherId, studentId, userName, view, onOpenTask}) {
  const room = enabled ? boardPageBookRoom(pythonExplanationBoardRoom(teacherId, studentId)) : '';
  const teacher = role === 'teacher';
  const [state, setState] = useState({room:'', connected:false, peer:null, phase:'idle'});
  const local = useRef({}), live = useRef(null), current = useRef({}), requested = useRef(null);
  const [location, setLocation] = useState(null);
  useLayoutEffect(() => { current.current = {view, onOpenTask}; }, [view, onOpenTask]);
  const reportLocation = useCallback(value => setLocation(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value), []);
  useLayoutEffect(() => {
    if (view !== 'python' && location) setLocation(null);
    const nextLocation=normalizePythonLocation(location, view);
    if (teacher && requested.current && !samePythonTask(nextLocation,requested.current.location)) {
      requested.current=null; setState(previous=>({...previous,phase:'idle'}));
    }
    local.current = {...local.current, userId, role, name:userName, location:nextLocation};
    live.current?.publish();
  }, [userId, role, userName, location, view, teacher]);

  useEffect(() => {
    if (!room || !['teacher','student'].includes(role)) return undefined;
    let disposed=false, cleanup;
    setState({room, connected:false, peer:null, phase:'idle'});
    requested.current=null;
    void loadYjsRuntime().then(({Y, WebsocketProvider}) => {
      if (disposed) return;
      const doc=new Y.Doc(), provider=new WebsocketProvider(getCollabWsUrl(), room, doc,
        {params:{_auth:getStoredAuthToken() || ''}, disableBc:true});
      const control=doc.getMap('pageControl');
      let initialized=false, handled='', pending=null, timer;
      local.current={...local.current, summonId:'', appliedId:'', activityAt:Date.now()};
      const publish=() => {
        if (disposed) return;
        const previous=provider.awareness.getLocalState()?.[PYTHON_PRESENCE];
        const next={...local.current, focused:document.hasFocus(), visible:!document.hidden};
        if (JSON.stringify(previous)!==JSON.stringify(next)) provider.awareness.setLocalStateField(PYTHON_PRESENCE,next);
        if (pending && samePythonTask(next.location,pending.location)) {
          local.current.appliedId=pending.id; pending=null;
          provider.awareness.setLocalStateField(PYTHON_PRESENCE,{...next, appliedId:local.current.appliedId});
        }
      };
      const update=() => {
        if (disposed) return;
        const connected=provider.wsconnected && provider.synced;
        const peers=provider.awareness.getStates();
        const peer=connected ? selectPythonPeer(peers,{userId:teacher ? studentId : teacherId, role:teacher ? 'student' : 'teacher'}) : null;
        setState(previous => ({...previous, room, connected, peer,
          phase:!connected ? 'idle' : requested.current && peer?.appliedId===requested.current.id
            ? samePythonTask(peer.location,requested.current.location) ? 'confirmed' : 'idle' : previous.phase}));
        if (!connected) return;
        if (!initialized) { initialized=true; handled=control.get(PYTHON_SUMMON)?.id || ''; }
        if (!teacher) {
          const command=control.get(PYTHON_SUMMON);
          const target=pythonSummonTarget(command,{teacherId,studentId,clientId:doc.clientID,peers});
          if (target && command.id!==handled) {
            handled=command.id; pending={id:command.id,location:target};
            if (!samePythonTask(local.current.location,target)) current.current.onOpenTask?.(target);
            publish();
          }
        }
      };
      const active=() => {local.current.activityAt=Date.now(); publish();};
      live.current={room,provider,control,publish,summon:() => {
        const peer=selectPythonPeer(provider.awareness.getStates(),{userId:studentId,role:'student'});
        const target=local.current.location;
        if (!teacher || !provider.synced || !provider.wsconnected || !peer || !target?.taskNumber || target.groupMode) return;
        const id=crypto.randomUUID(); requested.current={id,location:target}; local.current.summonId=id; publish();
        setState(previous=>({...previous,phase:'waiting'}));
        control.set(PYTHON_SUMMON,{id,teacherId,studentId,clientId:peer.clientId,location:target});
        window.clearTimeout(timer); timer=window.setTimeout(()=>setState(previous=>({...previous,phase:previous.phase==='waiting'?'unconfirmed':previous.phase})),10000);
      }};
      control.observe(update); provider.awareness.on('change',update); provider.on('sync',update); provider.on('status',update);
      window.addEventListener('focus',active); window.addEventListener('blur',publish); document.addEventListener('visibilitychange',active);
      publish();
      cleanup=()=>{
        window.clearTimeout(timer); control.unobserve(update); provider.awareness.off('change',update); provider.off('sync',update); provider.off('status',update);
        window.removeEventListener('focus',active); window.removeEventListener('blur',publish); document.removeEventListener('visibilitychange',active);
        if (live.current?.provider===provider) live.current=null;
        provider.destroy(); doc.destroy();
      };
    }).catch(()=>{if(!disposed)setState({room,connected:false,peer:null,phase:'idle'});});
    return()=>{disposed=true; cleanup?.();};
  }, [room,role,teacher,userId,teacherId,studentId]);

  const summon=useCallback(()=>live.current?.summon(),[]);
  const goToPeer=useCallback(()=>{
    if(state.room===room && state.peer?.location?.taskNumber && !state.peer.location.groupMode
      && !samePythonTask(local.current.location,state.peer.location)) current.current.onOpenTask?.(state.peer.location);
  },[state.peer,state.room,room]);
  return {connected:state.room===room && state.connected, peer:state.room===room ? state.peer : null,
    phase:state.room===room ? state.phase : 'idle', reportLocation, summon, goToPeer};
}
