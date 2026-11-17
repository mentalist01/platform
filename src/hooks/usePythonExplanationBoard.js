import { useCallback, useEffect, useRef, useState } from 'react';
import { loadYjsRuntime } from '../utils/collaborationRuntime.js';
import { getCollabWsUrl } from '../utils/runtimeUrls.js';
import { getStoredAuthToken } from '../services/api.js';
import { boardPageBookRoom, boardPagesList, boardPageSummonTarget } from '../utils/boardPages.js';
import { observeLiveBoardCommand } from '../utils/boardCommandClock.js';
import { rememberSummonedCode } from '../utils/lessonSummonCode.js';
import { livePythonExplanation, PYTHON_EXPLANATION_CONTROL } from '../utils/pythonExplanationBoard.js';

export default function usePythonExplanationBoard({ roomId, teacherId, studentId, userId, role, groupId='', followTeacher=true }) {
  const [openedRoom, setOpenedRoom] = useState('');
  const [connectedRoom, setConnectedRoom] = useState('');
  const [error, setError] = useState('');
  const runtime = useRef(null), handled = useRef(''), handledCode = useRef('');
  const teacher = role === 'teacher';
  const connected = Boolean(roomId && connectedRoom === roomId);
  useEffect(() => {
    if (!roomId) return undefined;
    let disposed = false, cleanup;
    const start = async () => {
      const { Y, WebsocketProvider } = await loadYjsRuntime();
      if (disposed) return;
      const doc = new Y.Doc();
      const provider = new WebsocketProvider(getCollabWsUrl(), boardPageBookRoom(roomId), doc,
        { params: { _auth: getStoredAuthToken() || '' }, disableBc: true });
      const control = doc.getMap('pageControl');
      const pages = doc.getMap('pages');
      const codeCommandKeys = ['summonCode', 'summonCodeRecipient'];
      runtime.current = { doc, provider, control, roomId };
      const update = () => {
        if (disposed) return;
        setConnectedRoom(provider.wsconnected && provider.synced ? roomId : '');
        if (teacher || !provider.synced || !followTeacher) return;
        const command = livePythonExplanation(control.get(PYTHON_EXPLANATION_CONTROL),
          Array.from(provider.awareness.getStates().values()), teacherId, studentId, groupId);
        if (!command) return;
        if (handled.current !== command.id) {
          handled.current = command.id;
          setOpenedRoom(command.open ? roomId : '');
        }
        if (!command.open) return;
        const codeSummon = codeCommandKeys.map(key => control.get(key))
          .filter(item => item?.scope === 'code')
          .sort((a, b) => b.ts - a.ts)
          .map(item => boardPageSummonTarget(item, userId, boardPagesList(pages)))
          .find(Boolean);
        if (!codeSummon || handledCode.current === codeSummon.id) return;
        handledCode.current = codeSummon.id;
        rememberSummonedCode(codeSummon, boardPageBookRoom(roomId), userId);
        setOpenedRoom(roomId);
      };
      const onControlChange = event => {
        if (provider.synced) {
          for (const key of codeCommandKeys) {
            if (event.keysChanged.has(key)) observeLiveBoardCommand(control.get(key));
          }
        }
        update();
      };
      control.observe(onControlChange); pages.observe(update); provider.awareness.on('change', update);
      provider.on('status', update); provider.on('sync', update);
      cleanup = () => {
        const local = provider.awareness.getLocalState()?.pythonExplanation;
        const command = control.get(PYTHON_EXPLANATION_CONTROL);
        if (teacher && provider.synced && local?.open && command?.id === local.id) {
          control.set(PYTHON_EXPLANATION_CONTROL, { ...command, id: crypto.randomUUID(), open: false });
        }
        control.unobserve(onControlChange); pages.unobserve(update); provider.awareness.off('change', update);
        provider.off('status', update); provider.off('sync', update);
        provider.destroy(); doc.destroy(); runtime.current = null;
        setOpenedRoom(current => current === roomId ? '' : current);
      };
      if (disposed) cleanup();
    };
    void start().catch(failure => { if (!disposed) setError(failure.message || 'Не удалось подключить доску'); });
    return () => { disposed = true; cleanup?.(); };
  }, [roomId, teacher, teacherId, studentId, userId, groupId, followTeacher]);
  const change = useCallback(next => {
    const live = runtime.current;
    if (next && !connected) return;
    if (teacher && live?.roomId === roomId && live.provider.synced) {
      const command = { id: crypto.randomUUID(), open: next, teacherId, studentId, ...(groupId?{groupId}:{}) };
      live.control.set(PYTHON_EXPLANATION_CONTROL, command);
      live.provider.awareness.setLocalStateField('pythonExplanation', { id: command.id, open: next, userId });
    }
    setOpenedRoom(next ? roomId : '');
  }, [connected, roomId, teacher, teacherId, studentId, userId, groupId]);
  const openBoard = useCallback(() => change(true), [change]);
  const closeBoard = useCallback(() => change(false), [change]);
  return { roomId, open: Boolean(roomId && openedRoom === roomId), connected, error, openBoard, closeBoard };
}
