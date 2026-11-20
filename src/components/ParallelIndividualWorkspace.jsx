import {memo, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Download, Users, X} from 'lucide-react';
import {api} from '../services/api.js';
import {createParallelLessonVideo, getParallelVideoMimeType, openParallelVideoStore} from '../utils/parallelLessonVideo.js';
import './ParallelIndividualWorkspace.css';

const nameFor = student => student.nickname || student.name || 'Ученик';
const idle = {};
const stopRoom = room => {
  room.active = false;
  room.applyMedia?.();
  room.video.setActive(false);
};

const ParallelSurface = memo(function ParallelSurface({room,sessionId,render}) {
  return render({room,sessionId,onStatusChange:room.onStatusChange});
});

const ParallelRoom = memo(function ParallelRoom({room,sessionId,view,selected,visible,renderCall,renderBoard,renderCode}) {
  const surfaces = [['call',renderCall],['board',renderBoard],['collab',renderCode]];
  return surfaces.map(([surface,render]) => {
    const show = selected && visible && view === surface;
    return <div key={surface} className={`parallel-lesson-surface${show ? ' is-visible' : ''}`}
      inert={!show} aria-hidden={!show}>
      <ParallelSurface room={room} sessionId={sessionId} render={render} />
    </div>;
  });
});

export default function ParallelIndividualWorkspace({
  teacherId, students, initialStudentId, view, visible, renderCall, renderBoard, renderCode, onClose, setReloadBlocked,
}) {
  const [chosen, setChosen] = useState(initialStudentId ? [initialStudentId] : []);
  const [session, setSession] = useState(null);
  const [selected, setSelected] = useState('');
  const [statuses, setStatuses] = useState(idle);
  const [recording, setRecording] = useState('');
  const [speaking, setSpeaking] = useState(idle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]);
  const [savedVideos, setSavedVideos] = useState([]);
  const resources = useRef(null);
  const lastGroupView = useRef('call');
  const updateStatus = (id,status) => setStatuses(previous => previous[id] === status ? previous : {...previous,[id]:status});
  const reportError = failure => setError(failure?.message || 'Не удалось сохранить видео.');
  const toggle = id => setChosen(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous,id]);

  useEffect(() => {
    if (session || files.length) return;
    let disposed = false;
    void openParallelVideoStore().then(async store => {
      try { const videos = await store.list(teacherId); if (!disposed) setSavedVideos(videos); }
      finally { store.close(); }
    }).catch(() => {});
    return () => { disposed = true; };
  }, [files.length,session,teacherId]);

  useLayoutEffect(() => {
    if (visible) lastGroupView.current = view;
    if (!session || session.ending) return;
    for (const room of session.rooms) room.surface = visible ? lastGroupView.current : 'call';
    const room = session.rooms.find(item => item.id === selected);
    if (room && !room.active) {
      room.active = true;
      room.applyMedia?.();
    }
    if (room?.readCall?.()?.hasStudent && room.video.setActive(true)) setRecording(room.id);
  }, [selected,session,view,visible]);

  useEffect(() => {
    if (!session) return;
    const key = 'parallel-individual-lessons:' + teacherId;
    setReloadBlocked(key,true);
    const protect = event => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload',protect);
    const updateRecording = () => {
      const room = session.rooms.find(item => item.active && item.readCall?.()?.hasStudent);
      let recordingId = '';
      for (const item of session.rooms) if (item.video.setActive(item === room)) recordingId = item.id;
      setRecording(recordingId);
    };
    updateRecording();
    const timer = window.setInterval(updateRecording,150);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload',protect);
      setReloadBlocked(key,false);
    };
  }, [session,teacherId,setReloadBlocked]);

  useEffect(() => () => {
    const current = resources.current;
    if (!current) return;
    for (const room of current.rooms) stopRoom(room);
    void Promise.allSettled(current.rooms.map(room => room.video.finish())).then(() => {
      current.store.close();
      void current.audioContext.close().catch(() => {});
      void api.finishParallelIndividualLessons(current.id).catch(() => {});
    });
  }, []);

  async function start() {
    if (busy || chosen.length < 2) return;
    setBusy(true);
    setError('');
    let store, audioContext, response;
    const rooms = [];
    try {
      const mimeType = getParallelVideoMimeType();
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!mimeType || !Audio || !HTMLCanvasElement.prototype.captureStream) {
        throw new Error('Этот браузер не поддерживает видеозапись параллельных уроков.');
      }
      audioContext = new Audio();
      await audioContext.resume();
      store = await openParallelVideoStore();
      response = await api.startParallelIndividualLessons(chosen,crypto.randomUUID());
      for (const id of response.studentIds) {
        const student = students.find(item => item.id === id);
        const room = {id,name:student ? nameFor(student) : 'Ученик',active:false,surface:view,
          onStatusChange: status => updateStatus(id,status),
          onSpeakingChange: value => setSpeaking(previous => Boolean(previous[id]) === value ? previous : {...previous,[id]:value}),
        };
        room.video = createParallelLessonVideo({store,audioContext,room,name:room.name,mimeType,teacherId,reportError});
        rooms.push(room);
        await room.video.prepare();
      }
      const next = {id:response.id,rooms,store,audioContext};
      resources.current = next;
      setSelected(rooms[0].id);
      setSession(next);
    } catch (failure) {
      await Promise.allSettled(rooms.map(room => room.video.finish()));
      if (response) await api.finishParallelIndividualLessons(response.id).catch(() => {});
      store?.close();
      void audioContext?.close().catch(() => {});
      reportError(failure);
    } finally {setBusy(false);}
  }

  function select(id) {
    if (busy || session.ending) return;
    const previous = session.rooms.find(room => room.active);
    if (id === previous?.id) return;
    if (previous) stopRoom(previous);
    const next = session.rooms.find(room => room.id === id);
    next.active = true;
    next.applyMedia?.();
    const recordingStarted = next.readCall?.()?.hasStudent && next.video.setActive(true);
    setRecording(recordingStarted ? next.id : '');
    setSelected(id);
  }

  async function finish() {
    if (busy || !session) return;
    setBusy(true);
    setError('');
    session.ending = true;
    for (const room of session.rooms) stopRoom(room);
    try {
      const results = await Promise.allSettled(session.rooms.map(room => room.video.finish()));
      setFiles(results.map((result,index) => ({id:session.rooms[index].id,name:session.rooms[index].name,
        file:result.status === 'fulfilled' ? result.value : null})));
      if (results.some(result => result.status === 'rejected')) reportError(new Error('Некоторые записи не удалось собрать.'));
      await api.finishParallelIndividualLessons(session.id);
      session.store.close();
      void session.audioContext.close().catch(() => {});
      resources.current = null;
      setSession(null);
    } catch (failure) {reportError(failure);}
    finally {setBusy(false);}
  }

  function download(file) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(file);
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url),60_000);
  }

  async function downloadSaved(info) {
    try {
      const store = await openParallelVideoStore();
      try {
        const file = await store.file(info);
        if (!file) throw new Error('Фрагменты записи не найдены.');
        download(file);
      } finally {store.close();}
    } catch (failure) {reportError(failure);}
  }

  return <section className="parallel-lessons" hidden={!visible} aria-label="Параллельные уроки">
    {error && <p className="parallel-lesson-error" role="alert">{error}</p>}
    {session ? <>
      <div className="parallel-lesson-toolbar">
        <div className="parallel-lesson-students" role="group" aria-label="Комнаты учеников">
          {session.rooms.map(room => <button key={room.id} type="button" aria-pressed={selected === room.id}
            disabled={busy || session.ending} onClick={() => select(room.id)}>
            <strong>{room.name}</strong>
            <small>{speaking[room.id] ? 'Говорит' : recording === room.id ? 'Идёт запись' : statuses[room.id] === 'connected'
              ? selected === room.id ? 'Ученик ещё не вошёл' : 'Самостоятельная работа' : 'Подключение'}</small>
          </button>)}
        </div>
        <button type="button" disabled={busy} onClick={() => void finish()}>{busy ? 'Собираем видео…' : 'Завершить уроки'}</button>
      </div>
      <div className="parallel-lesson-workspace">
        {session.rooms.map(room => <ParallelRoom key={room.id} room={room} sessionId={session.id} view={view}
          selected={selected === room.id} visible={visible} renderCall={renderCall} renderBoard={renderBoard} renderCode={renderCode} />)}
      </div>
    </> : <div className="parallel-lesson-setup">
      <div className="parallel-lesson-toolbar">
        <h2><Users size={18} aria-hidden="true" />Параллельные уроки</h2>
        <button type="button" disabled={busy} onClick={onClose} aria-label="Закрыть параллельные уроки"><X size={17} /></button>
      </div>
      {files.length ? <ul className="parallel-lesson-files">
        {files.map(({id,name,file}) => <li key={id}><strong>{name}</strong>
          {file ? <button type="button" onClick={() => download(file)}><Download size={16} aria-hidden="true" /> Скачать видео</button>
            : <span>Видео не записалось</span>}</li>)}
      </ul> : <>
        <fieldset className="parallel-lesson-pick">
          <legend>Выбери учеников</legend>
          {students.map(student => <label key={student.id}><input type="checkbox"
            checked={chosen.includes(student.id)} disabled={busy} onChange={() => toggle(student.id)} />
            {nameFor(student)}</label>)}
        </fieldset>
        <button type="button" className="parallel-lesson-start" disabled={busy || chosen.length < 2} onClick={() => void start()}>
          {busy ? 'Готовим комнаты…' : 'Открыть комнаты'}
        </button>
        {savedVideos.length > 0 && <details><summary>Сохранённые видео</summary>
          <ul className="parallel-lesson-files">{savedVideos.map(info => <li key={info.id}>
            <span>{info.name} · {info.date}</span>
            <button type="button" onClick={() => void downloadSaved(info)}><Download size={16} aria-hidden="true" /> Скачать</button>
          </li>)}</ul>
        </details>}
      </>}
    </div>}
  </section>;
}
