import { randomUUID } from 'node:crypto';
import {
  MAX_PRACTICE_ROOMS, canAccessPracticeRoom, getActivePracticeRound, isPracticePageId, isPracticeWorkId, normalizePracticeViewport,
} from '../src/utils/groupPractice.js';

const STATUSES = ['working', 'help', 'ready'];
const clean = (value, length) => typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, length) : '';

export function normalizeGroupLessonPractice(value) {
  if (!Array.isArray(value?.rounds)) return null;
  const rounds = value.rounds.flatMap((round) => {
    if (!isPracticeWorkId(round?.id) || !isPracticePageId(round.pageId) || !Array.isArray(round.rooms)) return [];
    const rooms = round.rooms.flatMap((room) => {
      if (!isPracticeWorkId(room?.id) || !Array.isArray(room.studentIds)) return [];
      const studentIds = [...new Set(room.studentIds.map(id => clean(id, 180)).filter(Boolean))];
      if (!studentIds.length || studentIds.length > 2) return [];
      return [{ id: room.id, studentIds, name: clean(room.name, 80), status: STATUSES.includes(room.status) ? room.status : 'working' }];
    }).slice(0, MAX_PRACTICE_ROOMS);
    const viewport = normalizePracticeViewport(round.viewport);
    return [{ id: round.id, pageId: round.pageId, rooms, startedAt: clean(round.startedAt, 40), ...(viewport ? {viewport} : {}) }];
  });
  if (!rounds.length) return null;
  const activeRoundId = rounds.some(round => round.id === value.activeRoundId) ? value.activeRoundId : '';
  return { rounds, activeRoundId };
}

export function validatePracticeAssignments(rooms, allowedIds) {
  if (!Array.isArray(rooms) || !rooms.length || rooms.length > MAX_PRACTICE_ROOMS) return false;
  const allowed = new Set(allowedIds);
  const assigned = new Set();
  return rooms.every(room => Array.isArray(room) && room.length >= 1 && room.length <= 2 && room.every(id => {
    if (!allowed.has(id) || assigned.has(id)) return false;
    assigned.add(id);
    return true;
  }));
}

export function startPracticeRound(practice, pageId, assignments, initialViewport) {
  const id = randomUUID();
  let pair = 0;
  let solo = 0;
  const countSolo = assignments.filter(room => room.length === 1).length;
  const rooms = assignments.map(studentIds => ({
    id: randomUUID(),
    studentIds,
    name: studentIds.length === 2 ? `Пара ${++pair}` : (countSolo > 1 ? `Самостоятельно ${++solo}` : 'Самостоятельно'),
    status: 'working',
  }));
  const viewport = normalizePracticeViewport(initialViewport);
  return {
    rounds: [...(practice?.rounds || []), { id, pageId, startedAt:new Date().toISOString(), rooms, ...(viewport ? {viewport} : {}) }],
    activeRoundId: id,
  };
}

export function setPracticeRoomStatus(practice, roomId, status, auth) {
  const round = getActivePracticeRound(practice);
  if (!round || !STATUSES.includes(status)) return null;
  const room = round.rooms.find(entry => entry.id === roomId);
  if (!room || !canAccessPracticeRoom(auth, room)) return null;
  return { ...practice, rounds: practice.rounds.map(entry => entry.id === round.id
    ? { ...entry, rooms: entry.rooms.map(item => item.id === roomId ? { ...item, status } : item) }
    : entry) };
}

export function practiceForViewer(practice, auth, active, students = []) {
  const byId = new Map(students.map(student => [student.id, student.name]));
  return {
    activeRoundId: active ? practice?.activeRoundId || '' : '',
    rounds: (practice?.rounds || []).map(round => ({
      ...round,
      rooms: round.rooms.filter(room => canAccessPracticeRoom(auth, room)).map(room => ({
        ...room,
        students: room.studentIds.map(id => ({ id, name: byId.get(id) || 'Ученик' })),
      })),
    })).filter(round => round.rooms.length),
  };
}
