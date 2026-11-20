import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {api, getStoredAuthToken} from '../services/api.js';
import {loadYjsRuntime} from '../utils/collaborationRuntime.js';
import {getCollabWsUrl} from '../utils/runtimeUrls.js';
import {boardPageBookRoom} from '../utils/boardPages.js';
import {buildLearningGroupTargetValue, parseLessonTargetValue, selectLearningGroupWorkspaceLesson, LEARNING_GROUP_LESSON_OVERRUN_GRACE_MS} from '../utils/lessonTargets.js';
import {pythonExplanationBoardRoom} from '../utils/pythonExplanationBoard.js';
import {
  flushPythonLessonTask, livePythonLessonTask, pythonGroupBoardRoom, pythonLessonTaskControl,
  pythonLessonTeacherPresent,
} from '../utils/pythonGroupWorkspace.js';
import {pythonGroupLessonTiming, resolvePythonWorkspaceMode} from '../utils/pythonWorkspaceMode.js';

export default function usePythonLessonWorkspace({role, userId, teacherId, groups:providedGroups, initialGroupId, lesson, recordingJobs, personalTask=false, activeStudentId, onSelectStudent}) {
  const teacher = role === 'teacher';
  const [loadedGroups, setLoadedGroups] = useState([]);
  const [error, setError] = useState('');
  const [manual, setManual] = useState(null);
  const [clock, setClock] = useState(Date.now);
  const [selectedGroupLesson, setSelectedGroupLesson] = useState(null);
  const [remoteTask, setRemoteTask] = useState(null);
  const [connectedRoom, setConnectedRoom] = useState('');
  const [teacherRoom, setTeacherRoom] = useState('');
  const runtime = useRef(null), pending = useRef(null);
  const groups = useMemo(() => (providedGroups || loadedGroups).filter(group => group.status !== 'completed'), [providedGroups, loadedGroups]);
  const mode = resolvePythonWorkspaceMode({teacher, initialGroupId, lesson, studentId:userId, now:clock, manual, personalTask});
  const selection = parseLessonTargetValue(mode.target);
  const group = selection.type === 'group' ? groups.find(item => item.id === selection.id) || null : null;
  const groupId = group?.id || '', owner = group?.teacherId || teacherId;
  const openedGroupLesson = lesson?.groupId === groupId && groupId && !['completed','cancelled'].includes(lesson.status) ? lesson : null;
  const displayedGroupLesson = openedGroupLesson || (selectedGroupLesson?.groupId === groupId ? selectedGroupLesson.lesson : null);
  const clockLesson = teacher ? displayedGroupLesson : lesson;
  const recording = recordingJobs?.find(job => job.desired === 'record' && job.occurrence?.lessonId === (displayedGroupLesson?.lessonId || displayedGroupLesson?.id));
  const lessonTiming = groupId && pythonGroupLessonTiming(displayedGroupLesson, clock, recording);
  const studentId = teacher ? activeStudentId : userId;
  const roomId = groupId ? pythonGroupBoardRoom(groupId) : pythonExplanationBoardRoom(owner, studentId);
  const controlKey = pythonLessonTaskControl(groupId);

  useEffect(() => {
    if (!clockLesson) return undefined;
    const start = Date.parse(clockLesson.startsAt || clockLesson.startAt || '');
    const end = start + Math.max(15, Number(clockLesson.durationMinutes) || 60) * 60_000;
    const timedEnd = recording?.endControl?.mode === 'timed' ? recording.endControl.untilMs : null;
    let timer;
    const refresh = () => {
      const now = Date.now();
      setClock(now);
      const boundary = Math.min(...[start, end, end + LEARNING_GROUP_LESSON_OVERRUN_GRACE_MS, timedEnd]
        .filter(time => Number.isFinite(time) && time > now));
      if (Number.isFinite(boundary)) timer = window.setTimeout(refresh, Math.min(boundary - now + 1, 2_147_000_000));
    };
    timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [clockLesson, recording?.endControl?.mode, recording?.endControl?.untilMs]);

  useEffect(() => {
    if (!teacher || !groupId || openedGroupLesson) return undefined;
    let disposed = false;
    const refresh = async () => {
      const now = Date.now();
      try {
        const {lessons} = await api.getLearningGroupLessons(groupId, {
          from:new Date(now - 6 * 3600_000).toISOString(), to:new Date(now + 3600_000).toISOString(),
        });
        if (disposed) return;
        const available = lessons.filter(entry => !['completed','cancelled'].includes(entry.status));
        setSelectedGroupLesson({groupId, lesson:selectLearningGroupWorkspaceLesson(available, now)});
      } catch {
        // Keep the last known time during a temporary interruption.
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [teacher, groupId, openedGroupLesson]);

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

  const flushTask = useCallback(() => {
    flushPythonLessonTask(pending, runtime.current, roomId, controlKey, userId);
  }, [roomId, controlKey, userId]);

  const publishTask = useCallback(state => {
    if (!teacher || !roomId) return;
    const next = {...state, active:true, teacherId:owner, ...(groupId ? {groupId} : {studentId})};
    pending.current = {roomId, command:next};
    flushTask();
  }, [teacher, roomId, groupId, owner, studentId, flushTask]);

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
        if (teacher) return;
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
      const sync = () => {
        update();
        if (teacher) flushTask();
      };
      if (!teacher) {
        control.observe(update);
        provider.awareness.on('change', update);
      }
      provider.on('sync', sync);
      provider.on('status', update);
      cleanup = () => {
        const local = provider.awareness.getLocalState()?.[controlKey];
        const command = control.get(controlKey);
        if (teacher && provider.synced && local?.id === command?.id) {
          control.set(controlKey, {...command, id:crypto.randomUUID(), active:false, open:false});
        }
        if (!teacher) {
          control.unobserve(update);
          provider.awareness.off('change', update);
        }
        provider.off('sync', sync);
        provider.off('status', update);
        provider.destroy(); doc.destroy();
        if (runtime.current?.doc === doc) runtime.current = null;
      };
    }).catch(failure => { if (!disposed) setError(failure.message || 'Не удалось подключить совместный урок'); });
    return () => { disposed = true; cleanup?.(); };
  }, [roomId, groupId, owner, studentId, teacher, flushTask, controlKey, mode.personalWork]);

  return {groups, group, groupId, targetValue:groupId ? buildLearningGroupTargetValue(groupId) : teacher ? activeStudentId || '' : '',
    selectTarget, joinLesson, publishTask, lessonTiming, remoteTask:!mode.personalWork && remoteTask?.workspaceRoom === roomId ? remoteTask : null,
    personalWork:mode.personalWork, lessonGroupId:mode.lessonGroupId,
    connected:Boolean(roomId && connectedRoom === roomId), teacherPresent:Boolean(!mode.personalWork && roomId && teacherRoom === roomId), error};
}
