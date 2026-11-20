import { useEffect, useRef, useState } from 'react';
import { Check, Hand, Headphones, PenLine, Users, X } from 'lucide-react';
import { api } from '../services/api.js';
import { boardPageBookRoom, boardPageRoom } from '../utils/boardPages.js';
import { groupNotebookBoard } from '../utils/groupNotebook.js';
import { buildPracticeAssignments, practiceVoiceChannelId } from '../utils/groupPractice.js';
import { lessonPageSelectionKey, readLessonPageSelection } from '../utils/lessonPageSelection.js';
import './GroupLessonPractice.css';

const labels = { working: 'Решают', help: 'Нужна помощь', ready: 'Готово' };

const readPrompt = (lesson, user) => {
  const board = groupNotebookBoard(lesson.groupId);
  const pageId = readLessonPageSelection(lessonPageSelectionKey(boardPageBookRoom(board), user.role, user.id));
  try {
    const viewport = JSON.parse(localStorage.getItem(`board-viewport-v1:${boardPageRoom(board,pageId)}:${user.role}:${user.id}`));
    return { pageId, viewport };
  } catch {
    return { pageId };
  }
};

export default function GroupLessonPractice({ lesson, user, students, selectedRoomId, voiceChannelId, onOpen, theme }) {
  const { groupId, lessonId } = lesson;
  const teacher = user.role === 'teacher' || user.role === 'admin';
  const [practice, setPractice] = useState(null);
  const [setup, setSetup] = useState(false);
  const [mode, setMode] = useState('pairs');
  const [chosenIds, setChosenIds] = useState(null);
  const [pairOrder, setPairOrder] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const inFlight = useRef(false);
  const lastPlacement = useRef(null);
  const roster = lesson.participantIds || [];
  const ids = (chosenIds || roster).filter(id => roster.includes(id));
  const members = new Map(students.map(student => [student.id, student.name]));
  const order = [...new Set([...pairOrder,...ids])].filter(id => ids.includes(id));
  const assignments = buildPracticeAssignments(order, mode);
  const swapPartner = (outgoing, incoming) => {
    setPairOrder(order.map(id => id === outgoing ? incoming : id === incoming ? outgoing : id));
  };
  const rounds = practice?.rounds || [];
  const active = rounds.find(round => round.id === practice?.activeRoundId);
  const roomTarget = (room) => ({ roomId:room.id, pageId:active.pageId, viewport:active.viewport, roundId:active.id });

  useEffect(() => {
    let disposed = false;
    let timer;
    async function refresh() {
      const startedAt = revision.current;
      try {
        const payload = await api.getLearningLessonPractice(groupId,lessonId);
        if (!disposed && startedAt === revision.current && !inFlight.current) setPractice(payload);
      } catch {
        // The live workspace stays usable while polling retries.
      } finally {
        if (!disposed) timer = window.setTimeout(refresh, 2500);
      }
    }
    void refresh();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [groupId,lessonId]);

  useEffect(() => {
    if (!practice) return;
    const current = teacher ? active?.rooms.find(room => room.id === selectedRoomId) : active?.rooms[0];
    const previous = lastPlacement.current;
    if (current) {
      if (previous?.roundId === active.id && previous?.roomId === current.id) return;
      const target = { roomId: current.id, pageId: active.pageId, viewport: active.viewport, roundId: active.id };
      lastPlacement.current = target;
      if (!teacher) onOpen(target);
    } else if (previous || selectedRoomId) {
      lastPlacement.current = null;
      onOpen({ pageId: previous?.pageId });
    }
  }, [active, onOpen, practice, selectedRoomId, teacher]);

  const change = async (action, fields = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    revision.current += 1;
    setBusy(true);
    setError('');
    try {
      const next = await api.changeLearningLessonPractice(groupId,lessonId,{action,...fields});
      setPractice(next);
      if (action === 'start') {
        setSetup(false);
        const round = next.rounds.find(entry => entry.id === next.activeRoundId);
        if (round) onOpen({ pageId: round.pageId });
      } else if (action === 'finish') {
        lastPlacement.current = null;
        onOpen({ pageId: active?.pageId });
      }
    } catch (cause) {
      setError(cause.message || 'Не удалось обновить практику.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!practice) return null;
  const ownRoom = !teacher && voiceChannelId && active?.rooms.find(room =>
    room.id === selectedRoomId && practiceVoiceChannelId(room.id) === voiceChannelId);
  if (teacher ? !practice.canManage && !active : !ownRoom) return null;
  return (
    <section className="group-practice" data-theme={theme} aria-label="Режим работы на уроке">
      {teacher && !active && (
        <button type="button" className="group-practice__primary" aria-expanded={setup} onClick={() => setSetup(open => !open)}>
          <Users size={16} aria-hidden="true" /> Распределить участников
        </button>
      )}
      {teacher && setup && !active && practice.canManage && (
        <form className="group-practice__setup" onSubmit={event => {
          event.preventDefault();
          void change('start',{assignments,...readPrompt(lesson,user)});
        }}>
          <div className="group-practice__setup-title"><strong>Распределить участников</strong><button type="button" aria-label="Закрыть распределение" onClick={() => setSetup(false)}><X size={16} /></button></div>
          <div className="group-practice__modes" aria-label="Как решаем">
            <button type="button" aria-pressed={mode === 'pairs'} onClick={() => setMode('pairs')}>В парах</button>
            <button type="button" aria-pressed={mode === 'solo'} onClick={() => setMode('solo')}>По одному</button>
          </div>
          <fieldset>
            <legend>Кто решает</legend>
            {roster.map(id => (
              <label key={id}><input type="checkbox" checked={ids.includes(id)} onChange={event =>
                setChosenIds(event.target.checked ? roster.filter(member => member === id || ids.includes(member)) : ids.filter(member => member !== id))} />
                {members.get(id) || 'Ученик'}
              </label>
            ))}
          </fieldset>
          {mode === 'pairs' && assignments.length > 0 && <ul className="group-practice__preview">
            {assignments.map(([first,second]) => (
              <li key={first}>
                <span>{members.get(first) || 'Ученик'}</span>
                {second && (
                  <select aria-label={`Напарник для ${members.get(first) || 'ученика'}`} value={second}
                    onChange={event => swapPartner(second,event.target.value)}>
                    {ids.filter(id => id !== first).map(id => <option key={id} value={id}>{members.get(id) || 'Ученик'}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>}
          <button type="submit" className="group-practice__primary" disabled={!assignments.length || busy}>{busy ? 'Распределяем…' : 'Распределить'}</button>
        </form>
      )}
      {teacher && active && (
        <>
          <div className="group-practice__rooms">
            {active.rooms.map(room => (
              <button key={room.id} type="button" className="group-practice__room" aria-pressed={room.id === selectedRoomId}
                onClick={() => { const target = roomTarget(room); lastPlacement.current = target; onOpen(target, { visit: true }); }}>
                <Headphones size={15} aria-hidden="true" />
                <span>{room.students.map(student => student.name).join(" и ")}</span>
                {room.status !== "working" && <small data-status={room.status}>{labels[room.status]}</small>}
              </button>
            ))}
          </div>
          {practice.canManage && <button type="button" className="group-practice__primary" disabled={busy} onClick={() => void change("finish")}>Собрать всех</button>}
        </>
      )}
      {ownRoom && (
        <>
          <span className="group-practice__current">
            {ownRoom.studentIds.length === 2 ? <><Users size={15} aria-hidden="true" /> {ownRoom.students.map(student => student.name).join(" и ")}</>
              : <><PenLine size={15} aria-hidden="true" /> Самостоятельная работа</>}
          </span>
          <div className="group-practice__status-actions">
            <button type="button" aria-pressed={ownRoom.status === "help"} disabled={busy} onClick={() =>
              void change("status",{roomId:ownRoom.id,status:ownRoom.status === "help" ? "working" : "help"})}><Hand size={15} /> Нужна помощь</button>
            <button type="button" aria-pressed={ownRoom.status === "ready"} disabled={busy} onClick={() =>
              void change("status",{roomId:ownRoom.id,status:ownRoom.status === "ready" ? "working" : "ready"})}><Check size={15} /> Готово</button>
          </div>
        </>
      )}
      {error && <p className="group-practice__error" role="alert">{error}</p>}
    </section>
  );
}
