import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

export const createHomeworkReviewFixture = fixedPort => createGroupHomeworkFixture(fixedPort, write => {
  const now = Date.now(), at = hours => new Date(now + hours * 3600000).toISOString();
  const groupId = 'review-group', ids = ['clean', 'fixed', 'wrong', 'todo', 'old'];
  const task = { type: 'task', taskNumber: 4, levelId: 'basic', targetQuestions: [1, 2, 3, 4, 5], targetQuestionIds: ids };
  const python = { type: 'task', taskNumber: 101, levelId: 'python', targetQuestions: [1], targetQuestionIds: ['python-question'] };
  const assignments = [{ id: 'review-ege', title: 'Домашняя работа · ЕГЭ', goals: [task], recipients: ['student-a'], studyTrack: 'ege' },
    { id: 'review-python', title: 'Домашняя работа · Python', goals: [python], recipients: ['student-a', 'student-b'], studyTrack: 'python' },
    { id: 'review-multi', title: 'Два ответа', goals: [{ type: 'task', taskNumber: 26, levelId: 'basic', targetQuestions: [1], targetQuestionIds: ['two'] }], recipients: ['student-a'], studyTrack: 'ege' }];
  write('learning-groups', [{ id: groupId, teacherId: 'teacher-a', name: 'Группа 2', status: 'active', createdAt: at(-72),
    members: [...['student-a', 'student-b'].map(studentId => ({ studentId, status: 'active', joinedAt: at(-72) })),
      { studentId: 'student-c', status: 'removed', joinedAt: at(-96), leftAt: at(-72) }] }]);
  write('learning-assignments', assignments.map(a => ({ ...a, groupId, teacherId: 'teacher-a', status: 'assigned',
    recipientIds: a.recipients, recipientMode: 'selected', createdAt: at(-48), publishedAt: at(-48), dueAt: at(24),
    homework: { studyTrack: a.studyTrack, goals: a.goals } })));
  write('tests', { 4: { basic: ['todo', 'wrong', 'fixed', 'clean', 'old'].map(id => ({ id, question: `Задание ${id}: укажите число 17.`, answer: '17' })) },
    101: { python: [{ id: 'python-question', question: 'Выведите число 1.', answer: '1' }] },
    26: { basic: [{ id: 'two', question: 'Укажите два числа.', answer: '1', answer2: '2' }] } });
  const answer = (correct, hours, value) => ({ correct, submittedAt: at(hours), answers: [value], solveDurationMs: 30000 });
  write('progress', Object.fromEntries(['student-a', 'student-b'].map(id => [id, { progress: {},
    homeworks: assignments.filter(a => a.recipients.includes(id)).map(a => ({ id: `learning-group-${a.id}`, source: 'learning-group',
      learningGroupId: groupId, learningAssignmentId: a.id, learningAssignmentStatus: 'assigned', issuedAt: at(-48), dueAt: at(24),
      studyTrack: a.studyTrack, goals: a.goals, homeWork: 'Подготовьтесь к разбору на уроке.' })),
    solvedByTask: id === 'student-a' ? { 4: { basic: { solved: ['clean', 'fixed'], answerHistory: {
      clean: [answer(true, -24, '17')], fixed: [answer(false, -23, '5'), answer(true, -22, '17')],
      wrong: [answer(false, -21, '8')], old: [answer(false, -60, '2')],
    } } } } : {},
  }])));
}, { existingGroupId: 'review-group' });
