import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTeacherNavigation, getTeacherNavigationGroup } from './teacherNavigation.js';

test('every teacher route belongs to one of five sections; lesson stays a direct action', () => {
  const routes = ['schedule', 'teacher-calendar', 'groups', 'meetings', 'teacher-students', 'progress', 'rating', 'teacher-comms', 'python', 'teacher', 'notes', 'recording', 'finance', 'teacher-settings'];
  const nav = routes.map(id => ({ id, label: id }));
  const sections = buildTeacherNavigation(nav);
  assert.deepEqual(sections.map(section => section.label), ['Расписание', 'Урок', 'Ученики', 'Материалы', 'Управление']);
  const children = sections.flatMap(section => section.children);
  assert.equal(children.length, routes.length);
  assert.equal(new Set(children.map(item => item.id)).size, routes.length);
  for (const route of routes) assert.ok(getTeacherNavigationGroup(route));
  for (const route of ['call', 'board', 'collab']) assert.equal(getTeacherNavigationGroup(route), 'lesson');
  assert.deepEqual(sections.find(section => section.id === 'lesson').children, []);
  assert.equal(sections.find(section => section.id === 'nav-materials').children.find(item => item.id === 'recording'), nav.find(item => item.id === 'recording'));
});
test('disabled or unavailable features do not produce empty navigation links', () => {
  const sections = buildTeacherNavigation([{ id: 'teacher-students', label: 'Список учеников' }]);
  assert.equal(sections.flatMap(section => section.children).length, 1);
  assert.equal(sections.find(section => section.id === 'nav-students').children[0].id, 'teacher-students');
  assert.equal(getTeacherNavigationGroup('admin'), undefined);
});
