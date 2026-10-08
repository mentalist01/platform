import crypto from 'node:crypto';
import { addLearningGroupMember, removeLearningGroupMember, getActiveLearningGroupMembers, LearningGroupDomainError } from './learningGroups.js';
import { currentAvailabilityConfig } from './groupAvailability.js';
import { withTeacherCalendarLock } from './calendarMutations.js';
import { availabilitySlots, addCalendarDays, moscowDay, AVAILABILITY_END_MINUTE } from '../src/utils/groupAvailability.js';

const fail = (message, code, statusCode = 409) => { throw new LearningGroupDomainError(message, { code, statusCode }); };
const activeMember = (group, studentId) => getActiveLearningGroupMembers(group).find(member => member.studentId === studentId);
const sameChoices = (left = {}, right = {}) => Object.keys(left).length === Object.keys(right).length
  && Object.entries(left).every(([id, value]) => right[id] === value);

export function prepareLearningGroupMemberTransfer({ groups, polls, sourceGroupId, targetGroupId, student,
  actorId, lateAddReason, replaceTargetAnswer = false, now = Date.now(), idFactory = crypto.randomUUID }) {
  const source = groups.find(group => group.id === sourceGroupId && !group.deletedAt);
  const target = groups.find(group => group.id === targetGroupId && !group.deletedAt);
  if (!source || !target) fail('Группа не найдена', 'group_not_found', 404);
  if (source.id === target.id) fail('Выберите другую группу', 'same_learning_group', 400);
  if (source.teacherId !== target.teacherId || student?.teacherId !== source.teacherId) {
    fail('Переводить ученика можно только между группами одного преподавателя', 'student_teacher_mismatch', 403);
  }
  if ([source, target].some(group => group.status === 'completed')) fail('Завершённую группу нельзя изменять', 'group_completed');
  const sourceMember = source.members.find(member => member.studentId === student.id);
  const targetMember = activeMember(target, student.id);
  const receipt = polls[target.id]?.memberTransfers?.[student.id];
  if (sourceMember?.status === 'removed' && targetMember && receipt?.sourceGroupId === source.id
    && receipt.sourceLeftAt === sourceMember.leftAt && receipt.targetJoinedAt === targetMember.joinedAt) {
    return { groups, polls, sourceGroup: source, targetGroup: target, availabilityTransfer: receipt.availabilityTransfer, alreadyTransferred: true };
  }
  if (!activeMember(source, student.id)) fail('Ученик не состоит в исходной группе', 'member_not_found', 404);
  if (targetMember) fail('Ученик уже состоит в выбранной группе', 'member_already_active');
  const conflict = groups.find(group => group.id !== source.id && !group.deletedAt && group.status !== 'completed'
    && group.teacherId === source.teacherId && activeMember(group, student.id));
  if (conflict) fail(`Ученик уже состоит в группе «${conflict.name}»`, 'student_already_in_learning_group');

  // Validate the full destination admission before constructing any persisted
  // changes. The existing domain rules require a reason after a group starts.
  const stamp = new Date(now).toISOString();
  const nextTarget = addLearningGroupMember(target, student, { actorId, lateAddReason, now: stamp });
  const nextSource = removeLearningGroupMember(source, student.id, { actorId, now: stamp });
  const sourcePoll = polls[source.id] ? structuredClone(polls[source.id]) : null;
  const sourceAnswer = sourcePoll?.answers?.[student.id];
  const createdPoll = !polls[target.id];
  const targetPoll = createdPoll ? {
    id: idFactory(), status: 'open', config: sourcePoll?.config ? currentAvailabilityConfig(structuredClone(sourcePoll.config), now) : {
      startDate: addCalendarDays(moscowDay(now), 1), durationMinutes: 60, startMinute: 600,
      endMinute: AVAILABILITY_END_MINUTE, days: [0, 1, 2, 3, 4, 5, 6], weeks: 8, timezone: 'Europe/Moscow',
    }, hoursVersion: 1, includeBusyTimes: sourcePoll?.includeBusyTimes !== false, answers: {}, proposal: null, plan: null,
  } : structuredClone(polls[target.id]);
  const choices = {};
  const targetSlots = new Map(availabilitySlots(targetPoll.config).map(slot => [`${slot.day}-${slot.minutes}`, slot.id]));
  const sourceSlots = new Map(availabilitySlots(sourcePoll?.config).map(slot => [slot.id, slot]));
  if (sourceAnswer && sourcePoll.config.durationMinutes === targetPoll.config.durationMinutes) {
    for (const [slotId, choice] of Object.entries(sourceAnswer.choices || {})) {
      const slot = sourceSlots.get(slotId);
      const mappedId = slot && targetSlots.get(`${slot.day}-${slot.minutes}`);
      if (mappedId && ['yes', 'maybe'].includes(choice)) choices[mappedId] = choice;
    }
  }
  const previousTargetAnswer = targetPoll.answers?.[student.id];
  if (sourceAnswer && previousTargetAnswer && !sameChoices(previousTargetAnswer.choices, choices) && !replaceTargetAnswer) {
    fail('В выбранной группе уже сохранён другой ответ этого ученика. Подтвердите замену его отметок.', 'availability_answer_conflict');
  }
  const copiedCount = Object.keys(choices).length;
  const skippedCount = Object.keys(sourceAnswer?.choices || {}).length - copiedCount;
  const availabilityTransfer = { copiedCount, skippedCount, createdPoll };
  targetPoll.answers ||= {};
  if (sourceAnswer && (!previousTargetAnswer || !sameChoices(previousTargetAnswer.choices, choices))) {
    targetPoll.answers[student.id] = { version: (previousTargetAnswer?.version || 0) + 1, choices,
      updatedAt: sourceAnswer.updatedAt, importedPersonal: true,
      teacherNotification: { id: `group-availability:${targetPoll.id}:${student.id}:transfer-${idFactory()}`,
        occurredAt: stamp, updated: Boolean(previousTargetAnswer) } };
  }
  // A vote belongs to its original roster and proposal, even when a former
  // participant's saved availability happens to match the transferred answer.
  if (targetPoll.proposal?.votes) delete targetPoll.proposal.votes[student.id];
  if (sourcePoll) {
    if (sourcePoll.answers) delete sourcePoll.answers[student.id];
    if (sourcePoll.proposal?.votes) delete sourcePoll.proposal.votes[student.id];
    sourcePoll.updatedAt = now;
  }
  targetPoll.memberTransfers ||= {};
  const previousReceipt = targetPoll.memberTransfers[student.id];
  const previousHistory = previousReceipt ? structuredClone(previousReceipt) : null;
  if (previousHistory) delete previousHistory.history;
  targetPoll.memberTransfers[student.id] = { sourceGroupId: source.id, sourceLeftAt: stamp, targetJoinedAt: stamp,
    actorId, availabilityTransfer, sideEffectsPending: true,
    ...(sourceAnswer ? { sourceAnswer: structuredClone(sourceAnswer), sourceConfig: structuredClone(sourcePoll.config),
      sourceRoundId: sourcePoll.id, sourceIncludeBusyTimes: sourcePoll.includeBusyTimes !== false } : {}),
    ...(previousTargetAnswer ? { previousTargetAnswer: structuredClone(previousTargetAnswer) } : {}),
    ...(previousHistory ? { history: [...(previousReceipt.history || []), previousHistory] } : {}) };
  targetPoll.updatedAt = now;
  const nextPolls = { ...polls, ...(sourcePoll ? { [source.id]: sourcePoll } : {}), [target.id]: targetPoll };
  return { groups: groups.map(group => group.id === source.id ? nextSource : group.id === target.id ? nextTarget : group),
    polls: nextPolls, sourceGroup: nextSource, targetGroup: nextTarget, availabilityTransfer, alreadyTransferred: false };
}

export function registerLearningGroupMemberTransfer(app, deps) {
  const retryTimers = new Map();
  const warn = error => console.warn('[group-member-transfer] deferred synchronization failed:', error?.message || error);
  const pendingResult = (targetGroupId, studentId) => {
    const receipt = deps.store.get(targetGroupId)?.memberTransfers?.[studentId];
    if (!receipt?.sideEffectsPending) return null;
    const groups = deps.readGroups();
    const sourceGroup = groups.find(group => group.id === receipt.sourceGroupId && !group.deletedAt);
    const targetGroup = groups.find(group => group.id === targetGroupId && !group.deletedAt);
    const student = deps.findStudent(studentId);
    const sourceMember = sourceGroup?.members.find(member => member.studentId === studentId);
    const targetMember = activeMember(targetGroup, studentId);
    // A later manual membership change must not replay an obsolete transfer.
    if (!sourceGroup || !targetGroup || !student || student.deletedAt
      || sourceGroup.teacherId !== targetGroup.teacherId || student.teacherId !== sourceGroup.teacherId
      || sourceMember?.status !== 'removed' || sourceMember.leftAt !== receipt.sourceLeftAt
      || !targetMember || targetMember.joinedAt !== receipt.targetJoinedAt) return null;
    return { sourceGroup, targetGroup, transferReceipt: receipt,
      availabilityTransfer: receipt.availabilityTransfer, alreadyTransferred: true };
  };
  const scheduleRetry = (result, studentId) => {
    const key = `${result.targetGroup.id}:${studentId}`;
    if (retryTimers.has(key)) return;
    const timer = setTimeout(() => {
      retryTimers.delete(key);
      withTeacherCalendarLock(result.sourceGroup.teacherId, async () => {
        const current = pendingResult(result.targetGroup.id, studentId);
        if (current) await finishSynchronization(current, studentId, false);
      }).catch(warn);
    }, deps.retryDelayMs ?? 15000);
    timer.unref?.();
    retryTimers.set(key, timer);
  };
  const finishSynchronization = async (result, studentId, retry = true) => {
    const current = pendingResult(result.targetGroup.id, studentId);
    if (!current) return false;
    try {
      await deps.afterTransfer?.(current, studentId);
      await deps.completeTransfer?.(current, studentId);
      return false;
    } catch (error) {
      warn(error);
      // The durable roster and answers already moved. Report that success;
      // leave the receipt pending so retries and startup can finish the rest.
      if (retry) scheduleRetry(current, studentId);
      return true;
    }
  };
  app.post('/api/learning-groups/:groupId/members/:studentId/transfer', deps.handle(async (req, res) => {
    const source = deps.manageGroup(req, res, req.params.groupId);
    if (!source) return;
    return withTeacherCalendarLock(source.teacherId, async () => {
      const currentSource = deps.manageGroup(req, res, req.params.groupId);
      const target = currentSource && deps.manageGroup(req, res, String(req.body?.targetGroupId || '').trim());
      if (!currentSource || !target) return;
      const student = deps.findStudent(req.params.studentId);
      if (!student || student.deletedAt) fail('Ученик не найден', 'student_not_found', 404);
      if (req.body?.replaceTargetAnswer !== undefined && typeof req.body.replaceTargetAnswer !== 'boolean') {
        fail('Подтвердите замену отметок', 'invalid_availability_replacement', 400);
      }
      const result = prepareLearningGroupMemberTransfer({ groups: deps.readGroups(), polls: deps.store.all(),
        sourceGroupId: currentSource.id, targetGroupId: target.id, student, actorId: req.auth.id,
        lateAddReason: req.body?.lateAddReason, replaceTargetAnswer: req.body?.replaceTargetAnswer === true });
      if (!result.alreadyTransferred) {
        // Preserve the unfiltered source choices before the durable transfer
        // removes them; a narrower target grid must not erase other hours.
        const sourcePoll = deps.store.get(currentSource.id);
        if (sourcePoll?.answers?.[student.id]) deps.rememberAnswer?.(currentSource, sourcePoll, student.id, sourcePoll.answers[student.id]);
        deps.commit(result.groups, result.polls);
      }
      const synchronizationPending = await finishSynchronization(result, student.id);
      return res.json({ sourceGroup: deps.serializeGroup(result.sourceGroup, req.auth),
        targetGroup: deps.serializeGroup(result.targetGroup, req.auth), availabilityTransfer: result.availabilityTransfer,
        alreadyTransferred: result.alreadyTransferred, ...(synchronizationPending ? { synchronizationPending: true } : {}) });
    });
  }));
  return {
    async recoverPending() {
      const summary = { recovered: 0, pending: 0, skipped: 0 };
      // Run once at startup, after the lesson/progress stores and RTC globals
      // exist. Ordinary GET requests never scan or rewrite transfer receipts.
      for (const [targetGroupId, poll] of Object.entries(deps.store.all())) {
        for (const [studentId, receipt] of Object.entries(poll.memberTransfers || {})) {
          if (!receipt.sideEffectsPending) continue;
          await withTeacherCalendarLock(deps.readGroups().find(group => group.id === targetGroupId)?.teacherId || '', async () => {
            const current = pendingResult(targetGroupId, studentId);
            if (!current) { summary.skipped += 1; return; }
            if (await finishSynchronization(current, studentId)) summary.pending += 1;
            else summary.recovered += 1;
          });
        }
      }
      return summary;
    },
    dispose() {
      for (const timer of retryTimers.values()) clearTimeout(timer);
      retryTimers.clear();
    },
  };
}
