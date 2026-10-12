import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {api, getStoredAuthToken} from '../services/api.js';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {boardPageBookRoom} from '../utils/boardPages.js';
import {buildLearningGroupTargetValue, parseLessonTargetValue, LEARNING_GROUP_LESSON_OVERRUN_GRACE_MS} from '../utils/lessonTargets.js';
import {pythonExplanationBoardRoom} from '../utils/pythonExplanationBoard.js';
import {
  livePythonLessonTask, pythonGroupBoardRoom, pythonLessonTaskControl,
  pythonLessonTeacherPresent,
} from '../utils/pythonGroupWorkspace.js';
import {resolvePythonWorkspaceMode} from '../utils/pythonWorkspaceMode.js';

export default function usePythonLessonWorkspace({role, userId, teacherId, groups:providedGroups, initialGroupId, lesson, personalTask=false, activeStudentId, onSelectStudent}) {
  const teacher = role === 'teacher';
  const [loadedGroups, setLoadedGroups] = useState([]);
  const [error, setError] = useState('');
  const [manual, setManual] = useState(null);
  const [clock, setClock] = useState(Date.now);
  const [remoteTask, setRemoteTask] = useState(null);
  const [connectedRoom, setConnectedRoom] = useState('');
  const [teacherRoom, setTeacherRoom] = useState('');
  const runtime = useRef(null), pending = useRef(null);
  const groups = useMemo(() => (providedGroups || loadedGroups).filter(group => group.status !== 'completed'), [providedGroups, loadedGroups]);
  const mode = resolvePythonWorkspaceMode({teacher, initialGroupId, lesson, studentId:userId, now:clock, manual, personalTask});
  const selection = parseLessonTargetValue(mode.target);
  const group = selection.type === 'group' ? groups.find(item => item.id === selection.id) || null : null;
  const groupId = group?.id || '', owner = group?.teacherId || teacherId;
  const studentId = teacher ? activeStudentId : userId;
  const roomId = groupId ? pythonGroupBoardRoom(groupId) : pythonExplanationBoardRoom(owner, studentId);
  const controlKey = pythonLessonTaskControl(groupId);

  useEffect(() => {
    if (teacher || !lesson) return undefined;
    const start = Date.parse(lesson.startsAt || lesson.startAt || '');
    const end = start + Math.max(15, Number(lesson.durationMinutes) || 60) * 60_000;
    const extra = lesson.status === 'active' || lesson.replayActive ? LEARNING_GROUP_LESSON_OVERRUN_GRACE_MS : 0;
    let timer;
    const refresh = () => {
      const now = Date.now();
      setClock(now);
      const boundary = [start, end + extra].find(time => Number.isFinite(time) && time > now);
      if (boundary) timer = window.setTimeout(refresh, Math.min(boundary - now + 1, 2_147_000_000));
    };
    timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [teacher, lesson]);

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

  const selectTarget = useCallback(value => {
    const next = parseLessonTargetValue(value);
    setManual({scope:mode.scope, target:next.type === 'group' ? value : '', personalWork:!teacher && next.type !== 'group'});
    if (next.type === 'student' && teacher) onSelectStudent?.(next.id || null);
  }, [teacher, onSelectStudent, mode.scope]);
  const joinLesson = useCallback(() => setManual(null), []);

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
        if (!provider.synced || !provider.wsconnected || mode.personalWork) { setTeacherRoom(''); return; }
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
  }, [roomId, groupId, owner, studentId, teacher, publishTask, controlKey, mode.personalWork]);

  return {groups, group, groupId, targetValue:groupId ? buildLearningGroupTargetValue(groupId) : teacher ? activeStudentId || '' : '',
    selectTarget, joinLesson, publishTask, remoteTask:!mode.personalWork && remoteTask?.workspaceRoom === roomId ? remoteTask : null,
    personalWork:mode.personalWork, lessonGroupId:mode.lessonGroupId,
    connected:Boolean(roomId && connectedRoom === roomId), teacherPresent:Boolean(!mode.personalWork && roomId && teacherRoom === roomId), error};
}
