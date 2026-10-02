export const buildGroupAvailabilityAnswerNotification = (group, student, answer) => {
  const note = answer?.teacherNotification;
  if (!note?.id || !Number.isFinite(Date.parse(note.occurredAt))) return null;
  const choices = Object.values(answer.choices || {});
  return {
    id: note.id, source: 'group-availability', studentId: student.id,
    studentName: student.name, studentNickname: student.nickname || '',
    groupId: group.id, groupName: group.name,
    availabilityUpdated: Boolean(note.updated),
    convenientCount: choices.filter(value => value === 'yes').length,
    flexibleCount: choices.filter(value => value === 'maybe').length,
    solvedAt: note.occurredAt,
  };
};

export const groupAvailabilityAnswerNotifications = (polls, groups, students, teacherId) => {
  const roster = new Map(students.filter(student => !student.deletedAt && student.teacherId === teacherId)
    .map(student => [student.id, student]));
  const activeGroups = new Map(groups.filter(group => group.teacherId === teacherId && !group.deletedAt
    && !group.completedAt && group.status !== 'completed').map(group => [group.id, group]));
  return polls.flatMap(poll => {
    const group = activeGroups.get(poll.groupId);
    if (!group) return [];
    return (group.members || []).filter(member => member.status === 'active' && roster.has(member.studentId))
      .map(member => buildGroupAvailabilityAnswerNotification(group, roster.get(member.studentId), poll.answers?.[member.studentId]))
      .filter(Boolean);
  });
};
