import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLearningGroupChatMessage,
  normalizeLearningGroupChatMessages,
  serializeLearningGroupChatMessage,
  setLearningGroupPollClosed,
  voteInLearningGroupPoll,
} from './learningGroupChat.js';

const poll = createLearningGroupChatMessage({
  id: 'poll-1',
  groupId: 'group-1',
  senderId: 'teacher-1',
  senderRole: 'teacher',
  senderName: 'Иван',
  type: 'poll',
  poll: {
    question: 'Какую тему повторить?',
    options: [{ id: 'a', text: 'Цикл for' }, { id: 'b', text: 'Строки' }],
  },
  createdAt: '2026-09-22T10:00:00.000Z',
});

test('poll votes can be changed and voter identities stay private', () => {
  const afterFirstVote = voteInLearningGroupPoll(poll, 'student-a', ['a'], '2026-09-22T10:01:00.000Z');
  const afterSecondVote = voteInLearningGroupPoll(afterFirstVote, 'student-b', ['a'], '2026-09-22T10:02:00.000Z');
  const afterChangedVote = voteInLearningGroupPoll(afterSecondVote, 'student-a', ['b'], '2026-09-22T10:03:00.000Z');
  const result = serializeLearningGroupChatMessage(afterChangedVote, 'student-a');
  assert.deepEqual(result.poll.myOptionIds, ['b']);
  assert.equal(result.poll.totalVoters, 2);
  assert.deepEqual(result.poll.options.map(({ id, voteCount }) => [id, voteCount]), [['a', 1], ['b', 1]]);
  assert.equal(Object.hasOwn(result.poll, 'votesByUserId'), false);
});

test('multiple choice, vote removal and closing are normalized', () => {
  const multiple = createLearningGroupChatMessage({
    ...poll,
    id: 'poll-2',
    poll: { ...poll.poll, allowMultiple: true },
  });
  const voted = voteInLearningGroupPoll(multiple, 'student-a', ['a', 'b']);
  assert.deepEqual(serializeLearningGroupChatMessage(voted, 'student-a').poll.myOptionIds, ['a', 'b']);
  const removed = voteInLearningGroupPoll(voted, 'student-a', []);
  assert.equal(serializeLearningGroupChatMessage(removed, 'student-a').poll.totalVoters, 0);
  const closed = setLearningGroupPollClosed(removed, true);
  assert.throws(() => voteInLearningGroupPoll(closed, 'student-a', ['a']), /завершён/);
});

test('invalid messages are rejected and duplicate ids keep the latest copy', () => {
  const text = createLearningGroupChatMessage({
    id: 'message-1', groupId: 'group-1', senderId: 'student-a', senderRole: 'student', text: 'Привет',
  });
  assert.equal(normalizeLearningGroupChatMessages([text, { ...text, text: 'Новый текст' }, { id: 'bad' }])[0].text, 'Новый текст');
  assert.throws(() => createLearningGroupChatMessage({ type: 'text', text: '  ' }), /Введите сообщение/);
  assert.throws(() => createLearningGroupChatMessage({ ...poll, id: 'bad-poll', poll: { question: 'Один?', options: ['Да'] } }), /два варианта/);
});
