import { studentRosterGroups } from './studentRosterGroups.js';
const normalized = value => String(value || '').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
export function filterStudentDirectory(students, groups, filters) {
  const { memberships } = studentRosterGroups(students, groups);
  const query = normalized(filters.query);
  const result = students.filter(student => {
    const owned = memberships.get(String(student.id)) || [];
    if (filters.format === 'individual' && owned.length || filters.format === 'group' && !owned.length) return false;
    if (filters.group && !owned.some(group => group.id === filters.group)) return false;
    if (filters.grade && String(student.grade || '11') !== filters.grade) return false;
    return !query || normalized([student.name, student.nickname, ...owned.map(group => group.name)].join(' ')).includes(query);
  });
  return [...result].sort((a, b) => filters.sort === 'newest'
    ? (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || String(a.name).localeCompare(String(b.name), 'ru')
    : String(a.name).localeCompare(String(b.name), 'ru') || String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ru'));
}
