import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { availabilitySlots } from '../src/utils/groupAvailability.js';

const DURATIONS = new Set([30, 45, 60, 90, 120]);
const CHOICES = new Set(['yes', 'maybe', 'no']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && value.length > 0
  && !['__proto__', 'constructor', 'prototype'].includes(value);
const timestamp = value => typeof value === 'number' ? value : Date.parse(value);
const validTimestamp = value => Number.isFinite(value) && value > 0;

function slotsFor(config) {
  if (!object(config) || !DURATIONS.has(config.durationMinutes)
    || !Number.isInteger(config.startMinute) || !Number.isInteger(config.endMinute)
    || config.startMinute < 0 || config.endMinute > 1440 || config.startMinute % 30 || config.endMinute % 30
    || config.endMinute - config.startMinute < config.durationMinutes
    || !Array.isArray(config.days) || !config.days.length
    || config.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Invalid student availability configuration');
  }
  return availabilitySlots(config);
}

function validateStore(value) {
  if (!object(value) || value.version !== 1 || !object(value.teachers)
    || ![0, 1].includes(value.migrationVersion ?? 0)) throw new Error('Invalid student availability store');
  for (const [teacherId, students] of Object.entries(value.teachers)) {
    if (!identifier(teacherId) || !object(students)) throw new Error('Invalid student availability teacher');
    for (const [studentId, student] of Object.entries(students)) {
      if (!identifier(studentId) || !object(student) || !object(student.durations)) throw new Error('Invalid student availability student');
      for (const [duration, record] of Object.entries(student.durations)) {
        if (!DURATIONS.has(Number(duration)) || !object(record) || !object(record.slots)) throw new Error('Invalid student availability duration');
        for (const [slotId, slot] of Object.entries(record.slots)) {
          const match = /^([0-6])-(\d+)$/.exec(slotId);
          if (!match || `${Number(match[1])}-${Number(match[2])}` !== slotId
            || Number(match[2]) % 30 || Number(match[2]) + Number(duration) > 1440
            || !object(slot) || !CHOICES.has(slot.choice) || !validTimestamp(slot.updatedAt)) {
            throw new Error('Invalid student availability slot');
          }
        }
      }
    }
  }
  return value;
}

function writeDurable(file, value) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(value));
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, file);
    try {
      descriptor = fs.openSync(directory, 'r');
      fs.fsyncSync(descriptor);
    } catch (error) {
      if (!['EINVAL', 'EPERM', 'EISDIR', 'ENOTSUP'].includes(error.code)) throw error;
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function rememberIn(db, { teacherId, studentId, config, answer, blocked = {}, sourceGroupId = '', sourceRoundId = '' }) {
  if (!identifier(teacherId) || !identifier(studentId)) throw new Error('Invalid student availability owner');
  // A projection is not a fresh answer. Copying it into another group must
  // never promote old preferences above the pupil's more recent choices.
  if (answer?.importedPersonal === true) return false;
  const slots = slotsFor(config);
  const updatedAt = timestamp(answer?.updatedAt);
  if (!object(answer?.choices) || !validTimestamp(updatedAt)) throw new Error('Invalid student availability answer');
  const allowed = new Set(slots.map(slot => slot.id));
  if (answer.personalBlockedSlots !== undefined && (!Array.isArray(answer.personalBlockedSlots)
    || answer.personalBlockedSlots.some(slotId => !allowed.has(slotId)))) throw new Error('Invalid student availability blocked slots');
  const unavailable = { ...Object.fromEntries((answer.personalBlockedSlots || []).map(slotId => [slotId, true])), ...blocked };
  for (const [slotId, choice] of Object.entries(answer.choices)) {
    if (!allowed.has(slotId) || !['yes', 'maybe'].includes(choice)) throw new Error('Invalid student availability choice');
  }
  const previous = db.teachers[teacherId]?.[studentId]?.durations?.[String(config.durationMinutes)]?.slots || {};
  const changes = [];
  for (const slot of slots) {
    // A temporarily occupied lesson is hidden in free-hours mode; it is not
    // evidence that the pupil removed their personal availability there.
    if (unavailable[slot.id]) continue;
    const choice = answer.choices[slot.id] || 'no';
    const old = previous[slot.id];
    const newerVersion = old && old.updatedAt === updatedAt && old.sourceGroupId === sourceGroupId
      && old.sourceRoundId === sourceRoundId && Number(answer.version || 0) > Number(old.sourceVersion || 0);
    if (old && updatedAt <= old.updatedAt && !newerVersion) continue;
    changes.push([slot.id, { choice, updatedAt, sourceGroupId, sourceRoundId, sourceVersion: Number(answer.version || 0) }]);
  }
  if (!changes.length) return false;
  db.teachers[teacherId] ||= {};
  db.teachers[teacherId][studentId] ||= { durations: {} };
  const student = db.teachers[teacherId][studentId];
  student.durations[String(config.durationMinutes)] ||= { slots: {} };
  Object.assign(student.durations[String(config.durationMinutes)].slots, Object.fromEntries(changes));
  return true;
}

const listOf = value => value instanceof Map ? [...value.values()]
  : Array.isArray(value) ? value : object(value) ? Object.values(value) : [];

export function createStudentAvailabilityStore(file) {
  let db = fs.existsSync(file) ? validateStore(JSON.parse(fs.readFileSync(file, 'utf8')))
    : { version: 1, migrationVersion: 0, teachers: {} };
  const commit = next => { validateStore(next); writeDurable(file, next); db = next; };
  return {
    record({ teacherId, studentId, durationMinutes }) {
      if (!identifier(teacherId) || !identifier(studentId) || !DURATIONS.has(Number(durationMinutes))) throw new Error('Invalid student availability owner');
      return structuredClone(db.teachers[teacherId]?.[studentId]?.durations?.[String(durationMinutes)] || { slots: {} });
    },
    remember(input) {
      const next = structuredClone(db);
      const changed = rememberIn(next, input);
      if (changed) commit(next);
      return changed;
    },
    seed({ teacherId, studentId, config }) {
      if (!identifier(teacherId) || !identifier(studentId)) throw new Error('Invalid student availability owner');
      const slots = slotsFor(config);
      const saved = db.teachers[teacherId]?.[studentId]?.durations?.[String(config.durationMinutes)]?.slots;
      if (!saved) return null;
      const known = slots.filter(slot => own(saved, slot.id));
      if (!known.length) return null;
      const choices = Object.fromEntries(known.filter(slot => saved[slot.id].choice !== 'no')
        .map(slot => [slot.id, saved[slot.id].choice]));
      return { version: 1, choices, updatedAt: Math.max(...known.map(slot => saved[slot.id].updatedAt)), importedPersonal: true };
    },
    migrate({ groups, polls, students }) {
      if (db.migrationVersion === 1) return { migrated: false, remembered: 0 };
      const next = structuredClone(db);
      const groupById = new Map(listOf(groups).map(group => [group.id, group]));
      const studentById = new Map(listOf(students).filter(student => !student.deletedAt).map(student => [student.id, student]));
      const candidates = [];
      const add = (group, studentId, config, answer, sourceRoundId, includeBusyTimes = true) => {
        const student = studentById.get(studentId);
        if (!group || !student || student.teacherId !== group.teacherId
          || !group.members?.some(member => member.studentId === studentId) || answer?.importedPersonal) return;
        // Old free-hours answers did not retain which hours were occupied.
        // They prove selected positives, but cannot prove an omitted hour was
        // refused. Future answers retain personalBlockedSlots for that reason.
        let blocked = {};
        if (includeBusyTimes === false && !Array.isArray(answer?.personalBlockedSlots)) {
          try { blocked = Object.fromEntries(slotsFor(config).filter(slot => !answer?.choices?.[slot.id]).map(slot => [slot.id, true])); }
          catch { return; }
        }
        candidates.push({ teacherId: group.teacherId, studentId, config, answer, blocked, sourceGroupId: group.id, sourceRoundId });
      };
      for (const [groupId, poll] of Object.entries(polls || {})) {
        const group = groupById.get(groupId);
        if (!group || !object(poll)) continue;
        for (const [studentId, answer] of Object.entries(poll.answers || {})) {
          // Older explicit transfers manufactured an update timestamp. Their
          // retained source answer below is the authoritative original.
          if (String(answer?.teacherNotification?.id || '').startsWith(`group-availability:${poll.id}:${studentId}:transfer-`)) continue;
          add(group, studentId, poll.config, answer, poll.id, poll.includeBusyTimes);
        }
        const receipts = (studentId, receipt) => {
          if (!object(receipt)) return;
          const source = groupById.get(receipt.sourceGroupId);
          if (source?.teacherId === group.teacherId) {
            const sourcePoll = polls[source.id];
            const sourcePrefix = sourcePoll && `group-availability:${sourcePoll.id}:${studentId}:`;
            const verifiedRound = sourcePrefix && String(receipt.sourceAnswer?.teacherNotification?.id || '').startsWith(sourcePrefix);
            const config = receipt.sourceConfig || (verifiedRound ? sourcePoll.config : null);
            if (config) add(source, studentId, config, receipt.sourceAnswer, receipt.sourceRoundId || (verifiedRound ? sourcePoll.id : ''),
              receipt.sourceIncludeBusyTimes ?? (verifiedRound ? sourcePoll.includeBusyTimes : true));
          }
          for (const old of Array.isArray(receipt.history) ? receipt.history : []) receipts(studentId, old);
        };
        for (const [studentId, receipt] of Object.entries(poll.memberTransfers || {})) receipts(studentId, receipt);
      }
      candidates.sort((left, right) => timestamp(left.answer?.updatedAt) - timestamp(right.answer?.updatedAt));
      let remembered = 0;
      for (const candidate of candidates) {
        try { if (rememberIn(next, candidate)) remembered += 1; }
        catch { /* A malformed legacy record cannot invalidate other pupils' saved choices. */ }
      }
      next.migrationVersion = 1;
      commit(next);
      return { migrated: true, remembered };
    },
  };
}
