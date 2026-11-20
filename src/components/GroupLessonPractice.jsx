import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Code2, Hand, LayoutGrid, PenLine, Users } from 'lucide-react';
import { api } from '../services/api.js';
import { boardPageBookRoom, boardPageRoom } from '../utils/boardPages.js';
import { groupNotebookBoard } from '../utils/groupNotebook.js';
import { buildPracticeAssignments } from '../utils/groupPractice.js';
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

function RoomCard({ room, selected, archived = false, onBoard, onCode }) {
  return (
    <div className="practice-room" data-selected={selected}>
      <button type="button" className="practice-room__main" onClick={onBoard} aria-pressed={selected}>
        <span className="practice-room__icon">{room.studentIds.length === 2 ? <Users size={17} /> : <PenLine size={17} />}</span>
        <span className="practice-room__text"><strong>{room.students.map(student => student.name).join(' и ')}</strong><small>{room.name}</small></span>
        <ArrowRight size={15} className="practice-room__arrow" />
      </button>
      <div className="practice-room__foot">
        <span className="practice-room__status" data-status={room.status}>{archived ? 'Сохранено' : labels[room.status]}</span>
        <button type="button" onClick={onCode} title={`Код · ${room.name}`} className="practice-room__code"><Code2 size={14} /> Код</button>
      </div>
    </div>
  );
}

export default function GroupLessonPractice({ lesson, user, students, selectedRoomId, onOpen }) {
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
  const lastRound = active || rounds.at(-1);
  const openRoom = (room, round, surface = 'board') =>
    onOpen({ roomId: room.id, pageId: round.pageId, viewport: round.viewport, readOnly: round.id !== practice?.activeRoundId }, surface);
  const openNotes = (round = lastRound) => onOpen({ pageId: round?.pageId }, 'board');

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
    if (teacher || !practice) return;
    const current = active?.rooms[0];
    const previous = lastPlacement.current;
    if (current) {
      if (previous?.roomId === current.id) return;
      lastPlacement.current = { roomId: current.id, pageId: active.pageId };
      onOpen({ roomId: current.id, pageId: active.pageId, viewport: active.viewport, readOnly: false }, 'board');
    } else if (previous) {
      lastPlacement.current = null;
      onOpen({ pageId: previous.pageId }, 'board');
    }
  }, [active, onOpen, practice, teacher]);

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
        if (round) onOpen({ pageId: round.pageId }, 'board');
      } else if (action === 'finish') {
        openNotes();
      }
    } catch (cause) {
      setError(cause.message || 'Не удалось обновить практику.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!practice || (!teacher && !lastRound?.rooms.length)) return null;
  if (teacher && !practice.canManage && !lastRound) return null;
  const ownRoom = active?.rooms[0];
  const date = Number.isFinite(Date.parse(lesson.startsAt)) && new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' }).format(new Date(lesson.startsAt));
  return (
    <section className="group-practice" aria-label={teacher ? 'Практика на уроке' : 'Моя работа'}>
      <header className="group-practice__header">
        <span className="group-practice__header-icon"><LayoutGrid size={19} /></span>
        <div><h2>{teacher ? 'Практика' : 'Моя работа'}</h2>{date && <p>{date}</p>}</div>
      </header>
      {lesson.topic && <div className="group-practice__topic">{lesson.topic}</div>}
      {lastRound && (
        <button className="group-practice__notes" type="button" onClick={() => openNotes()}>
          <BookOpen size={17} /><span>Общий конспект</span><ArrowRight size={15} />
        </button>
      )}
      {teacher && practice.canManage && !active && !setup && (
        <button type="button" className="group-practice__primary" onClick={() => setSetup(true)}>Распределить учеников</button>
      )}
      {teacher && setup && !active && practice.canManage && (
        <form className="group-practice__setup" onSubmit={event => {
          event.preventDefault();
          void change('start',{assignments,...readPrompt(lesson,user)});
        }}>
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
          <p className="group-practice__hint">Задание берётся с открытой страницы общей доски.</p>
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
          <button type="submit" className="group-practice__primary" disabled={!assignments.length || busy}>{busy ? 'Открываем…' : 'Начать практику'}</button>
          <button type="button" className="group-practice__cancel" onClick={() => setSetup(false)} disabled={busy}>Отмена</button>
        </form>
      )}
      {active && (
        <div className="group-practice__rooms">
          {teacher && practice.canManage && <button type="button" className="group-practice__primary" disabled={busy} onClick={() => void change('finish')}>Собрать всех</button>}
          {active.rooms.map(room => <RoomCard key={room.id} room={room} selected={room.id === selectedRoomId}
            onBoard={() => openRoom(room,active)} onCode={() => openRoom(room,active,'collab')} />)}
          {!teacher && ownRoom && (
            <div className="group-practice__status-actions">
              <button type="button" aria-pressed={ownRoom.status === 'help'} disabled={busy} onClick={() =>
                void change('status',{roomId:ownRoom.id,status:ownRoom.status === 'help' ? 'working' : 'help'})}><Hand size={15} /> Нужна помощь</button>
              <button type="button" aria-pressed={ownRoom.status === 'ready'} disabled={busy} onClick={() =>
                void change('status',{roomId:ownRoom.id,status:ownRoom.status === 'ready' ? 'working' : 'ready'})}><Check size={15} /> Готово</button>
            </div>
          )}
        </div>
      )}
      {rounds.filter(round => round !== active && round.rooms.length).length > 0 && (
        <details className="group-practice__archive" open={!active}>
          <summary>Работы с урока</summary>
          {rounds.filter(round => round !== active).flatMap(round => round.rooms.map(room =>
            <RoomCard key={room.id} room={room} archived selected={room.id === selectedRoomId} onBoard={() => openRoom(room,round)} onCode={() => openRoom(room,round,'collab')} />))}
        </details>
      )}
      {error && <p className="group-practice__error" role="alert">{error}</p>}
    </section>
  );
}
