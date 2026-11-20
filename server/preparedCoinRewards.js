
import {isActiveLearningGroupMember} from './learningLessonAccess.js';

export function preparedCoinRewardRoster(run, access, students) {
  const target = access.target;
  const session = target?.session || target?.trialSession;
  const ids = target?.practiceRoom?.studentIds
    ?? (run.studentId ? [run.studentId] : session?.participantIdsSnapshot ?? session?.participantIds)
    ?? target?.group?.members?.filter(isActiveLearningGroupMember).map(member =>
      typeof member === 'string' ? member : member.studentId || member.id)
    ?? access.participantIds ?? run.participantIds ?? [];
  const byId = new Map(students.filter(student => !student.deletedAt && student.teacherId === run.teacherId)
    .map(student => [student.id, student]));
  return [...new Set(ids)].flatMap(id => {
    const student = byId.get(id);
    return student ? [{id, name: student.nickname || student.name || 'Ученик'}] : [];
  });
}

const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };

export function createPreparedCoinRewards({read, write, roster, credit, onGranted}) {
  return {
    roster,
    forRun(runId) {
      const byCard = new Map();
      for (const [studentId, data] of Object.entries(read())) {
        for (const [cardId, reward] of Object.entries(data?.preparedTaskCoinRewards?.[runId] || {})) {
          const list = byCard.get(cardId) || [];
          list.push({id: studentId, name: reward.name, amount: reward.amount});
          byCard.set(cardId, list);
        }
      }
      return byCard;
    },
    grant(run, card, access, {studentIds, amount}) {
      if (!Number.isSafeInteger(amount) || amount < 1) fail(400, 'Введите целое количество монет больше нуля.');
      if (!Array.isArray(studentIds) || !studentIds.length || studentIds.some(id => typeof id !== 'string')) {
        fail(400, 'Выберите хотя бы одного ученика.');
      }
      const participants = new Map(roster(run, access).map(student => [student.id, student]));
      const ids = [...new Set(studentIds)];
      if (ids.some(id => !participants.has(id))) fail(403, 'Награду можно выдать только участникам этого урока.');

      const current = read();
      const next = {...current};
      const awarded = [];
      for (const id of ids) {
        const rewards = current[id]?.preparedTaskCoinRewards || {};
        const cardRewards = rewards[run.id] || {};
        if (Object.hasOwn(cardRewards, card.id)) continue;
        const payload = credit(id, amount, current);
        next[id] = {...payload, preparedTaskCoinRewards: {
          ...rewards, [run.id]: {...cardRewards, [card.id]: {name: participants.get(id).name, amount}},
        }};
        awarded.push(id);
      }
      if (!awarded.length) return false;

      // Receipts and balances are committed in the same progress write.
      write(next);
      for (const id of awarded) onGranted?.(run.teacherId, id, amount, next[id].coinsTotal);
      return true;
    },
  };
}
