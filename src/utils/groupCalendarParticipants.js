export const getLearningGroupCalendarParticipants = (entry, studentNameById = {}) => {
  if (!entry?.isLearningGroupEvent || !String(entry.groupId || '').trim()) return [];
  const byId = new Map();
  const addParticipant = value => {
    const studentId = String(value?.studentId || value?.id || value || '').trim();
    if (!studentId) return;
    const previous = byId.get(studentId) || {};
    const studentName = String(value?.studentName || value?.name || studentNameById[studentId]
      || previous.studentName || 'Ученик').trim();
    byId.set(studentId, {...previous, ...(value && typeof value === 'object' ? value : {}), studentId, studentName});
  };
  (Array.isArray(entry.participantIds) ? entry.participantIds : []).forEach(addParticipant);
  (Array.isArray(entry.participants) ? entry.participants : []).forEach(addParticipant);
  const payments = entry.memberPaymentStatuses;
  if (Array.isArray(payments)) {
    payments.forEach(addParticipant);
    // The server excludes inactive/deleted pupils from billing. A historical
    // participant ID alone must not create an extra unpaid pupil in this panel.
    const projectedIds = new Set(payments.map(row => String(row?.studentId || '').trim()).filter(Boolean));
    return [...byId.values()].filter(member => projectedIds.has(member.studentId));
  }
  return [...byId.values()];
};
