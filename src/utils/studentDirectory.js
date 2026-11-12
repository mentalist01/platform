import { studentRosterGroups } from './studentRosterGroups.js';
import { normalizeStudentParentContact } from './studentParentContact.js';
const normalized = value => String(value || '').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();

export function hasParentContact(contact) {
  try { return Boolean(normalizeStudentParentContact(contact || {}).url); } catch { return false; }
}

export function filterStudentDirectory(students, groups, filters, parentContacts = {}) {
  const { memberships } = studentRosterGroups(students, groups);
  const query = normalized(filters.query);
  const result = students.filter(student => {
    const owned = memberships.get(String(student.id)) || [];
    if (filters.format === 'individual' && owned.length || filters.format === 'group' && !owned.length) return false;
    if (filters.group && !owned.some(group => group.id === filters.group)) return false;
    if (filters.grade && String(student.grade || '11') !== filters.grade) return false;
    if (filters.parentContact === 'missing' && hasParentContact(parentContacts[student.id])) return false;
    return !query || normalized([student.name, student.nickname, ...owned.map(group => group.name)].join(' ')).includes(query);
  });
  return [...result].sort((a, b) => {
    if (filters.sort === 'newest' || filters.sort === 'oldest') {
      const aDate = Date.parse(a.createdAt), bDate = Date.parse(b.createdAt);
      // Profiles with no known creation date belong at the end in both orders.
      if (Number.isFinite(aDate) !== Number.isFinite(bDate)) return Number.isFinite(aDate) ? -1 : 1;
      if (Number.isFinite(aDate) && aDate !== bDate) return filters.sort === 'newest' ? bDate - aDate : aDate - bDate;
    }
    return String(a.name).localeCompare(String(b.name), 'ru') || String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ru');
  });
}
