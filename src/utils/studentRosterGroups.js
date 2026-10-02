// Use current memberships only; removed members and finished groups are history.
export function studentRosterGroups(students, groups) {
  const studentsById = new Map(students.map(student => [String(student.id), student]));
  const memberships = new Map();
  for (const group of groups) {
    if (group.deletedAt || group.completedAt || group.status === 'completed') continue;
    const ids = [...new Set((group.members || [])
      .filter(member => member.status === 'active')
      .map(member => String(member.studentId)))];
    const members = ids.map(id => studentsById.get(id)).filter(Boolean);
    if (!members.length) continue;
    const entry = { ...group, students: members, totalMembers: ids.length };
    for (const student of members) {
      const id = String(student.id);
      memberships.set(id, [...(memberships.get(id) || []), entry]);
    }
  }
  // Keep the existing student order, placing each group at its first member.
  const entries = [];
  const seen = new Set();
  for (const student of students) {
    const memberGroups = memberships.get(String(student.id)) || [];
    if (!memberGroups.length) entries.push({ student });
    for (const group of memberGroups) {
      if (seen.has(group.id)) continue;
      seen.add(group.id);
      entries.push({ group });
    }
  }
  return { entries, memberships };
}
