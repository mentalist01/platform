import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {api, getStoredAuthToken} from '../services/api.js';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {boardPageBookRoom} from '../utils/boardPages.js';
import {buildLearningGroupTargetValue, parseLessonTargetValue} from '../utils/lessonTargets.js';
import {pythonExplanationBoardRoom} from '../utils/pythonExplanationBoard.js';
import {
  livePythonLessonTask, pythonGroupBoardRoom, pythonLessonTaskControl,
  pythonLessonTeacherPresent,
} from '../utils/pythonGroupWorkspace.js';

export default function usePythonLessonWorkspace({role, userId, teacherId, groups:providedGroups, initialGroupId, activeStudentId, onSelectStudent}) {
  const teacher = role === 'teacher';
  const [loadedGroups, setLoadedGroups] = useState([]);
  const [error, setError] = useState('');
  const [target, setTarget] = useState('');
  const [hasSelected, setHasSelected] = useState(false);
  const [automaticGroupId, setAutomaticGroupId] = useState('');
  const [remoteTask, setRemoteTask] = useState(null);
  const [connectedRoom, setConnectedRoom] = useState('');
  const [teacherRoom, setTeacherRoom] = useState('');
  const runtime = useRef(null), pending = useRef(null);
  const groups = useMemo(() => (providedGroups || loadedGroups).filter(group => group.status !== 'completed'), [providedGroups, loadedGroups]);
  const selection = parseLessonTargetValue(hasSelected ? target : buildLearningGroupTargetValue(initialGroupId || automaticGroupId));
  const group = selection.type === 'group' ? groups.find(item => item.id === selection.id) || null : null;
  const groupId = group?.id || '', owner = group?.teacherId || teacherId;
  const studentId = teacher ? activeStudentId : userId;
  const roomId = groupId ? pythonGroupBoardRoom(groupId) : pythonExplanationBoardRoom(owner, studentId);
  const controlKey = pythonLessonTaskControl(groupId);

  useEffect(() => {
    if (providedGroups) return undefined;
    let disposed = false;
    const refresh = () => api.getLearningGroups({studentId:userId}).then(payload => {
      if (disposed) return;
      const list = Array.isArray(payload) ? payload : payload?.groups || [];
      setLoadedGroups(list.filter(item => item.status !== 'completed' && (item.members || []).some(member => (
        (member.studentId || member.id) === userId && member.status === 'active'
      ))));
      setError('');
    }).catch(failure => { if (!disposed) setError(failure.message || 'Не удалось загрузить группы'); });
    void refresh();
    window.addEventListener('learning-groups-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => { disposed = true; window.removeEventListener('learning-groups-changed', refresh); window.removeEventListener('focus', refresh); };
  }, [providedGroups, userId]);

  // A pupil entering Python directly discovers a live lesson only in their
  // current groups. Saved tasks from an absent teacher never start a lesson.
  const discoveryGroups = !teacher && !hasSelected && !initialGroupId
    ? groups.map(item => ({id:item.id, teacherId:item.teacherId || teacherId})) : [];
  const discoverySignature = JSON.stringify(discoveryGroups);
  useEffect(() => {
    const candidates = JSON.parse(discoverySignature);
    if (!candidates.length) return undefined;
    let disposed = false;
    const cleanups = [], liveGroups = new Set();
    void loadYjsRuntime().then(({Y, WebsocketProvider}) => {
      if (disposed) return;
      for (const candidate of candidates) {
        const doc = new Y.Doc();
        const provider = new WebsocketProvider(getCollabWsUrl(), boardPageBookRoom(pythonGroupBoardRoom(candidate.id)), doc,
          {params:{_auth:getStoredAuthToken() || ''}, disableBc:true});
        const control = doc.getMap('pageControl');
        const update = () => {
          if (disposed) return;
          const peers = Array.from(provider.awareness.getStates().values());
          const command = provider.synced && provider.wsconnected ? livePythonLessonTask(control.get(pythonLessonTaskControl(candidate.id)), peers,
            {teacherId:candidate.teacherId, studentId:userId, groupId:candidate.id}) : null;
          if (command?.open && pythonLessonTeacherPresent(command, peers, candidate.teacherId, candidate.id)) liveGroups.add(candidate.id);
          else liveGroups.delete(candidate.id);
          setAutomaticGroupId(current => liveGroups.has(current) ? current : candidates.find(item => liveGroups.has(item.id))?.id || '');
        };
        control.observe(update); provider.on('sync', update); provider.on('status', update); provider.awareness.on('change', update);
        cleanups.push(() => { control.unobserve(update); provider.off('sync', update); provider.off('status', update); provider.awareness.off('change', update); provider.destroy(); doc.destroy(); });
      }
    }).catch(failure => { if (!disposed) setError(failure.message || 'Не удалось найти урок группы'); });
    return () => { disposed = true; cleanups.forEach(cleanup => cleanup()); };
  }, [discoverySignature, userId]);

  const selectTarget = useCallback(value => {
    setHasSelected(true);
    const next = parseLessonTargetValue(value);
    setTarget(next.type === 'group' ? value : '');
    if (next.type === 'student' && teacher) onSelectStudent?.(next.id || null);
  }, [teacher, onSelectStudent]);

  const publishTask = useCallback(state => {
    const next = {...state, active:true, teacherId:owner, ...(groupId ? {groupId} : {studentId})};
    pending.current = {roomId, command:next};
    const live = runtime.current;
    if (!teacher || !roomId || live?.roomId !== roomId || !live.provider.synced) return;
    const previous = live.control.get(controlKey);
    if (previous && JSON.stringify({...previous, id:undefined}) === JSON.stringify({...next, id:undefined})) return;
    const command = {...next, id:crypto.randomUUID()};
    live.control.set(controlKey, command);
    live.provider.awareness.setLocalStateField(controlKey, {id:command.id, userId, open:command.open});
  }, [teacher, roomId, groupId, owner, studentId, controlKey, userId]);

  useEffect(() => {
    if (!roomId) return undefined;
    let disposed = false, cleanup, handled = '';
    void loadYjsRuntime().then(({Y, WebsocketProvider}) => {
      if (disposed) return;
      const doc = new Y.Doc(), provider = new WebsocketProvider(getCollabWsUrl(), boardPageBookRoom(roomId), doc,
        {params:{_auth:getStoredAuthToken() || ''}, disableBc:true});
      const control = doc.getMap('pageControl');
      runtime.current = {doc, provider, control, roomId};
      const update = () => {
        if (disposed) return;
        setConnectedRoom(provider.wsconnected && provider.synced ? roomId : '');
        if (teacher) { if (provider.synced && pending.current?.roomId === roomId) publishTask(pending.current.command); return; }
        if (!provider.synced || !provider.wsconnected) { setTeacherRoom(''); return; }
        const peers = Array.from(provider.awareness.getStates().values());
        const command = livePythonLessonTask(control.get(controlKey), peers, {teacherId:owner, studentId, groupId});
        const present = pythonLessonTeacherPresent(command, peers, owner, groupId);
        setTeacherRoom(present ? roomId : '');
        // An old close command must not dismiss personal homework on entry.
        if (command && handled !== command.id && (present || handled)) {
          handled = command.id;
          setRemoteTask({...command, workspaceRoom:roomId});
        }
      };
      control.observe(update); provider.on('sync', update); provider.on('status', update); provider.awareness.on('change', update);
      cleanup = () => {
        const local = provider.awareness.getLocalState()?.[controlKey];
        const command = control.get(controlKey);
        if (teacher && provider.synced && local?.id === command?.id) {
          control.set(controlKey, {...command, id:crypto.randomUUID(), active:false, open:false});
        }
        control.unobserve(update); provider.off('sync', update); provider.off('status', update); provider.awareness.off('change', update);
        provider.destroy(); doc.destroy();
        if (runtime.current?.doc === doc) runtime.current = null;
      };
    }).catch(failure => { if (!disposed) setError(failure.message || 'Не удалось подключить совместный урок'); });
    return () => { disposed = true; cleanup?.(); };
  }, [roomId, groupId, owner, studentId, teacher, publishTask, controlKey]);

  return {groups, group, groupId, targetValue:groupId ? buildLearningGroupTargetValue(groupId) : teacher ? activeStudentId || '' : '',
    selectTarget, publishTask, remoteTask:remoteTask?.workspaceRoom === roomId ? remoteTask : null,
    connected:Boolean(roomId && connectedRoom === roomId), teacherPresent:Boolean(roomId && teacherRoom === roomId), error};
}
