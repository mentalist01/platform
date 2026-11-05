import { getCollabSolutionPageId, listCollabCodePages, listCollabSolutions } from '../src/utils/collabSolutions.js';

export const LESSON_CODE_FOCUS_MS = 2 * 60 * 60 * 1000;

export function findStudentCodeLocation(docs, rooms, studentId) {
  const candidates = [];
  for (const room of rooms) {
    const doc = docs?.get('collab/' + room);
    if (!doc?.awareness || !doc.conns) continue;
    const solutions = listCollabSolutions(doc);
    const pages = listCollabCodePages(doc);
    for (const [socket, clientIds] of doc.conns) {
      if (socket.readyState !== 1 || socket.learningCollabReadOnly
        || socket.learningCollabAuth?.role !== 'student' || socket.learningCollabAuth.id !== studentId) continue;
      for (const clientId of clientIds) {
        const state = doc.awareness.getStates().get(clientId);
        const solution = solutions.find(row => row.id === state?.solutionId);
        if (!solution) continue;
        const page = pages.find(row => row.id === getCollabSolutionPageId(doc, solution.id));
        if (!page) continue;
        candidates.push({
          location: { room, solutionId: solution.id, solutionName: solution.name, pageId: page.id },
          focused: state.codeTabFocused === true,
          seenAt: doc.awareness.meta.get(clientId)?.lastUpdated || 0,
        });
      }
    }
  }
  candidates.sort((a, b) => Number(b.focused) - Number(a.focused) || b.seenAt - a.seenAt);
  return candidates[0]?.location || null;
}

export function isSavedLessonCode(file) {
  const source = file?.source || file?.memory?.source;
  const kind = file?.memory?.kind;
  return Boolean(file && (['collab-code', 'notes-python', 'notes-cheatsheet'].includes(source)
    || ['code', 'cheatsheet'].includes(kind) || /\.py$/i.test(file.name || '')));
}
