import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { createCollabCodePage, createEmptyCollabSolution } from '../src/utils/collabSolutions.js';

test('teacher sees authenticated private-code presence without joining private documents', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture(), connections = [];
  const teacher = f.tokens['teacher-a'];
  const wait = async predicate => { for (let n = 0; n < 160; n++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 30)); } throw Error('Presence timed out'); };
  try {
    const lesson = (await f.request(`/api/learning-groups/${f.groupId}/lessons`, teacher,
      { startAt: new Date(Date.now() - 60000).toISOString(), durationMinutes: 60, topic: 'Тест присутствия' }, 'POST', 201)).lesson;
    await f.request(`/api/learning-groups/${f.groupId}/lessons/${lesson.id}`, teacher, { status: 'active' }, 'PATCH');
    const endpoint = `/api/learning-groups/${f.groupId}/lessons/${lesson.id}/code-presence`;
    for (const id of ['teacher-b', 'student-a', 'student-c']) await f.request(endpoint, f.tokens[id], undefined, 'GET', 403);
    const connect = async (id, privateId) => {
      const doc = new Y.Doc(), room = `collab-lesson-${lesson.id}${privateId ? `~student~${privateId}` : ''}`;
      const provider = new WebsocketProvider(f.base.replace('http', 'ws') + '/collab', room, doc,
        { WebSocketPolyfill: WebSocket, params: { _auth: f.tokens[id] }, disableBc: true });
      connections.push({ doc, provider }); await wait(() => provider.synced); return { doc, provider };
    };
    const sharedTeacher = await connect('teacher-a', '');
    const a = await connect('student-a', 'student-a'), b = await connect('student-b', 'student-b');
    const page = createCollabCodePage(a.doc, { id: 'second', name: 'Python' });
    createEmptyCollabSolution(a.doc, { id: 'ninth', name: '9', pageId: page.id });
    a.doc.getText('monaco').insert(0, 'PRIVATE SOURCE MUST NOT LEAK');
    a.provider.awareness.setLocalState({ user: { id: 'student-b', name: 'Поддельное имя' }, solutionId: 'ninth' });
    b.provider.awareness.setLocalState({ user: { id: 'student-a' }, solutionId: 'main' });
    await wait(async () => (await f.request(endpoint, teacher)).participants.find(x => x.studentId === 'student-a')?.locations[0]?.solutionId === 'ninth');
    const result = await f.request(endpoint, teacher), anna = result.participants.find(x => x.studentId === 'student-a');
    assert.equal(anna.name, 'Анна · тест'); assert.equal(anna.locations[0].pageName, 'Python'); assert.equal(anna.locations[0].solutionName, '9');
    assert.equal(result.participants.filter(x => x.online).length, 2);
    assert.ok(!JSON.stringify(result).includes('PRIVATE SOURCE')); assert.equal(sharedTeacher.doc.getText('monaco').toString(), '');
    a.provider.destroy(); a.doc.destroy();
    await wait(async () => !(await f.request(endpoint, teacher)).participants.find(x => x.studentId === 'student-a').online);
    const common = await connect('student-a', ''); common.provider.awareness.setLocalStateField('solutionId', 'main');
    await wait(async () => (await f.request(endpoint, teacher)).participants.find(x => x.studentId === 'student-a')?.locations[0]?.shared === true);
  } finally { connections.forEach(({ provider, doc }) => { provider.destroy(); doc.destroy(); }); await f.stop(); }
});
