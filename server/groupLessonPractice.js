import { randomUUID } from 'node:crypto';
import { boardItemBounds } from '../src/utils/boardRenderIndex.js';
import {
  MAX_PRACTICE_ROOMS, canAccessPracticeRoom, getActivePracticeRound, isPracticePageId, isPracticeWorkId, normalizePracticeViewport, practiceWorkspaceRoom,
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

export function groupPracticeBoardObstacles(lessons, {groupId,pageId,readItems}) {
  const rooms = new Set();
  for (const lesson of lessons) {
    if (lesson.deletedAt || lesson.groupId !== groupId) continue;
    for (const round of lesson.practice?.rounds || []) {
      if (round.pageId !== pageId) continue;
      for (const room of round.rooms) {
        const key = practiceWorkspaceRoom(lesson.id,room.id);
        if (key) rooms.add(key);
      }
    }
  }
  const boxes = [];
  for (const room of rooms) {
    for (const item of readItems(room)) {
      const bounds = boardItemBounds(item);
      if (!bounds || !Object.values(bounds).every(Number.isFinite)) continue;
      const strokeWidth = Number(item.strokeWidth ?? (['stroke','line','arrow'].includes(item.type) ? item.width : 0));
      const padding = Number.isFinite(strokeWidth) ? Math.max(2,strokeWidth) : 2;
      boxes.push({ x:bounds.minX-padding, y:bounds.minY-padding,
        width:bounds.maxX-bounds.minX+2*padding, height:bounds.maxY-bounds.minY+2*padding });
    }
  }
  return boxes;
}

// Archived layers are returned once as a snapshot. Only the current writing
// layer uses a live connection, even when a page contains work from many lessons.
export function savedGroupBoardRooms(lessons, {studentId,pageId,roomId,isLive}) {
  const rooms = savedGroupPracticeRooms(lessons,{studentId,pageId,roomId,isLive});
  return rooms ? [...new Set(rooms.map(({lesson,room})=>practiceWorkspaceRoom(lesson.id,room.id)).filter(Boolean))] : null;
}

export function savedGroupPracticeRooms(lessons, {studentId,pageId,roomId,isLive}) {
  const candidates = lessons.slice().sort((a,b) => Date.parse(a.startAt)-Date.parse(b.startAt))
    .flatMap(lesson => (lesson.practice?.rounds || []).filter(round => round.pageId === pageId)
      .flatMap(round => round.rooms.filter(room => room.studentIds.includes(studentId))
        .map(room => ({lesson,round,room}))));
  const target = roomId ? candidates.find(entry => entry.room.id === roomId) : null;
  if (roomId && !target) return null;
  const comparable = room => !target || (target.room.studentIds.length === room.studentIds.length
    && target.room.studentIds.every(id => room.studentIds.includes(id)));
  return candidates.filter(({lesson,round,room})=>room.id!==roomId && comparable(room)
    && (round.id!==lesson.practice.activeRoundId || !isLive(lesson)));
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
