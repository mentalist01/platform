import { listCollabCodePages, listCollabSolutions, getCollabSolutionPageId } from '../src/utils/collabSolutions.js';

// Identity comes from the authenticated socket, never from client awareness.
// Reading private-room presence must not join those rooms or expose their code.
export function groupCodePresence({ docs, lesson, students }) {
  const participants = new Map((lesson.participantIds || []).map(id => [id, {
    studentId: id, name: students.find(student => student.id === id)?.name || 'Ученик', online: false, locations: [],
  }]));
  const shared = `collab-lesson-${lesson.id}`;
  for (const [docName, doc] of docs) {
    const room = String(docName).split('/').pop();
    const owner = room === shared ? '' : room.startsWith(`${shared}~student~`) ? room.slice(`${shared}~student~`.length) : null;
    if (owner === null || (owner && !participants.has(owner))) continue;
    const pages = listCollabCodePages(doc), solutions = listCollabSolutions(doc);
    for (const [socket, clientIds] of doc.conns) {
      const auth = socket.learningCollabAuth;
      const participant = participants.get(auth?.id);
      if (socket.readyState !== 1 || !participant || auth.role !== 'student' || (owner && owner !== auth.id)) continue;
      participant.online = true;
      for (const clientId of clientIds) {
        const state = doc.awareness.getStates().get(clientId);
        const solution = solutions.find(row => row.id === state?.solutionId);
        const page = solution && pages.find(row => row.id === getCollabSolutionPageId(doc, solution.id));
        if (!page) continue;
        const location = { shared: !owner, pageId: page.id, pageName: page.name, solutionId: solution.id, solutionName: solution.name };
        if (!participant.locations.some(row => row.shared === location.shared && row.solutionId === solution.id)) participant.locations.push(location);
      }
    }
  }
  return { participants: [...participants.values()], observedAt: new Date().toISOString() };
}
