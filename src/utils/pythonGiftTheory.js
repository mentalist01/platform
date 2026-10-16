import { PYTHON_DEFAULT_SUBSECTION_ID } from './pythonSubsections.js';

// The editor stores topic-wide videos under __default__, even when every
// question belongs to a named subsection. They must not become an empty task.
export const pythonGiftTopicTheory = entry => ({
  ...entry?.pythonTheory,
  ...entry?.pythonTheoryBySubsection?.[PYTHON_DEFAULT_SUBSECTION_ID],
});
export function pythonGiftTheoryStart(model, sectionId = '') {
  const section = model.subsections.find(item => item.id === sectionId);
  const index = section?.questionIndexes[0] ?? 0;
  return { index, subsectionId: model.questionSectionByIndex.get(index) || PYTHON_DEFAULT_SUBSECTION_ID };
}
