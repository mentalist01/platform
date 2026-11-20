import {createHash} from 'node:crypto';
import {
  COLLAB_SOLUTIONS_MAP_KEY, COLLAB_SOLUTION_PAGES_KEY, DEFAULT_COLLAB_SOLUTION_ID,
  getCollabSolutionChannels, listCollabCodePages, listCollabPageSolutions, listCollabSolutions,
} from '../src/utils/collabSolutions.js';
import {lessonCodePageId} from '../src/utils/lessonPageSelection.js';

const origin = 'group-practice:code';
const sourceKey = 'practiceCodeSources';
const hash = text => createHash('sha256').update(text).digest('base64url');
const emptyHash = hash('');

export function projectGroupPracticeCode(target, shared, boardPageId) {
  const page = listCollabCodePages(shared).find(entry => entry.id === lessonCodePageId(boardPageId));
  if (!page) return;
  const sources = target.getMap(sourceKey);
  const catalog = target.getMap(COLLAB_SOLUTIONS_MAP_KEY);
  const existing = sources.size > 0 || listCollabSolutions(target).some(solution => {
    const channels = getCollabSolutionChannels(target,solution.id);
    return solution.id !== DEFAULT_COLLAB_SOLUTION_ID || channels.codeText.length || channels.testFileText.length;
  });
  target.transact(() => {
    for (const solution of listCollabPageSolutions(shared,page.id)) {
      const id = solution.id === page.mainSolutionId ? DEFAULT_COLLAB_SOLUTION_ID : solution.id;
      if (sources.has(id)) continue;
      const channels = getCollabSolutionChannels(target,id);
      const starter = existing ? '' : getCollabSolutionChannels(shared,solution.id).codeText.toString();
      if (starter && !channels.codeText.length) channels.codeText.insert(0,starter);
      if (id !== DEFAULT_COLLAB_SOLUTION_ID && !catalog.has(id)) {
        catalog.set(id,{...solution,id});
      }
      sources.set(id,{id:solution.id,baseline:starter ? hash(starter) : emptyHash});
    }
  },origin);
}

// Custom tabs and old standalone pair work belong to the page's main tab.
export function savedPracticeCode(doc, sharedSolutionId, sharedMainId) {
  const sources = doc.getMap(sourceKey);
  return listCollabSolutions(doc).flatMap(solution => {
    const link = sources.get(solution.id);
    if ((link?.id || sharedMainId) !== sharedSolutionId) return [];
    const text = getCollabSolutionChannels(doc,solution.id).codeText.toString();
    return hash(text) === (link?.baseline || emptyHash) ? [] : [{name:solution.name,text}];
  });
}

export function savedLegacyGroupCode(doc, pageId, sharedSolutionId, sharedMainId) {
  return listCollabPageSolutions(doc,lessonCodePageId(pageId)).flatMap(solution => {
    if (sharedSolutionId !== sharedMainId && solution.id !== sharedSolutionId) return [];
    const text = getCollabSolutionChannels(doc,solution.id).codeText.toString();
    return text ? [{name:solution.name,text}] : [];
  });
}
