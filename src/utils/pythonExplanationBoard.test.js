import test from 'node:test';
import assert from 'node:assert/strict';
import { pythonExplanationBoardRoom, pythonExplanationCodeRoom, livePythonExplanation } from './pythonExplanationBoard.js';
import { lessonPageRooms } from '../../server/lessonPageCatalog.js';
import { authorizeLearningCollabUpgrade } from '../../server/learningLessonAccess.js';
const students = [{ id: 'student-a', teacherId: 'teacher-a' }, { id: 'student-b', teacherId: 'teacher-a' }];
const groups = [{ id: 'group-a', teacherId: 'teacher-a', status: 'active', members: students.map(s => ({ studentId: s.id, status: 'active' })) }];
const room = pythonExplanationBoardRoom('teacher-a', 'student-a');
const access = (auth, doc = room, list = students) => authorizeLearningCollabUpgrade({ auth, requestUrl: `/collab/${doc}`, students: list, groups });

test('explanation code has isolated, authorized rooms and shares its board page catalog', () => {
  const teacher={id:'teacher-a',role:'teacher'},pupil={id:'student-a',role:'student',teacherId:'teacher-a'};
  const code=pythonExplanationCodeRoom('teacher-a','student-a');
  assert.equal(code,'collab-python-teacher-a-student-a');
  assert.equal(pythonExplanationCodeRoom('teacher-a','../other'),'');
  assert.equal(pythonExplanationCodeRoom('teacher-a','','bad:group'),'');
  for(const doc of [code,pythonExplanationCodeRoom('teacher-a','','group-a')]) {
    assert.equal(access(teacher,doc).allowed,true);
    assert.equal(access(pupil,doc).allowed,true);
    assert.equal(access(pupil,doc).readOnly,false);
    assert.equal(access({id:'teacher-b',role:'teacher'},doc).allowed,false);
    assert.equal(access({id:'outsider',role:'student'},doc).allowed,false);
  }
  const codeScope=lessonPageRooms(access(teacher,code).target),boardScope=lessonPageRooms(access(teacher,room).target);
  assert.equal(codeScope.book,room+'~pages');
  assert.deepEqual(codeScope.codes,[code]);
  assert.equal(boardScope.book,codeScope.book);assert.deepEqual(boardScope.codes,codeScope.codes);
  assert.notEqual(codeScope.book,'board-teacher-a-student-a~pages');
});
test('Python explanation uses its own board and rejects malformed identities', () => {
  assert.equal(room, 'board-python-teacher-a-student-a');
  for (const id of ['', '../other', 'student~pages', 'with:separator', 'a'.repeat(161)]) assert.equal(pythonExplanationBoardRoom('teacher-a', id), '');
  assert.notEqual(room, pythonExplanationBoardRoom('teacher-a', 'student-b'));
});
test('group membership preserves Python explanations without reopening individual lesson boards', () => {
  const teacher = { id: 'teacher-a', role: 'teacher' }, pupil = { id: 'student-a', teacherId: 'teacher-a', role: 'student' };
  assert.equal(access(teacher).allowed, true); assert.equal(access(pupil).allowed, true);
  assert.equal(access(pupil, 'board-teacher-a-student-a').reason, 'group-workspace-required');
  assert.equal(access(teacher, `${room}~pages`).readOnly, false);
  assert.equal(access(pupil, `${room}~pages`).readOnly, true);
});
test('other pupils, other teachers, anonymous and deleted accounts cannot open explanations', () => {
  for (const auth of [null, { id: 'student-b', role: 'student', teacherId: 'teacher-a' }, { id: 'teacher-b', role: 'teacher' }, { id: 'student-a', role: 'student', teacherId: 'teacher-b' }]) assert.equal(access(auth).allowed, false);
  assert.equal(access({ id: 'student-a', role: 'student' }, room, [{ ...students[0], deletedAt: '2026-10-12' }]).allowed, false);
  assert.equal(access({ id: 'teacher-a', role: 'teacher' }, `${room}-unregistered`).allowed, false);
});
test('only a current teacher explanation summons the matching pupil; stored opens stay closed', () => {
  const command = { id: 'current', open: true, teacherId: 'teacher-a', studentId: 'student-a' };
  const peer = { pythonExplanation: { id: 'current', userId: 'teacher-a', open: true } };
  assert.equal(livePythonExplanation(command, [peer], 'teacher-a', 'student-a'), command);
  assert.equal(livePythonExplanation(command, [], 'teacher-a', 'student-a'), null);
  assert.equal(livePythonExplanation(command, [peer], 'teacher-a', 'student-b'), null);
  assert.equal(livePythonExplanation(command, [{ pythonExplanation: { ...peer.pythonExplanation, id: 'previous' } }], 'teacher-a', 'student-a'), null);
  assert.equal(livePythonExplanation(command, [{ pythonExplanation: { ...peer.pythonExplanation, userId: 'student-a' } }], 'teacher-a', 'student-a'), null);
  const closed = { ...command, id: 'closed', open: false };
  assert.equal(livePythonExplanation(closed, [], 'teacher-a', 'student-a'), closed);
});
