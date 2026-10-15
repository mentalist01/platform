import { buildPythonSubsectionModel } from './pythonSubsections.js';

export function pythonHomeworkSections(taskEntry, levelId, targets = []) {
  const model = buildPythonSubsectionModel(taskEntry, levelId);
  const byId = new Map(model.questions.map((question, index) => [String(question.id || ''), index]));
  const groups = new Map(model.subsections.map(section => [section.id, { id: section.id, title: section.title, items: [] }]));
  for (const target of targets) {
    const id = String(target.questionId || '');
    const index = (id && byId.has(id)) ? byId.get(id) : Number(target.num) - 1;
    const question = model.questions[index];
    const sectionId = model.questionSectionByIndex.get(index) || '__missing__';
    if (!groups.has(sectionId)) groups.set(sectionId, { id: sectionId, title: 'Другие задания темы', items: [] });
    const label = question?.label;
    const title = String(typeof label === 'string' ? label : label?.text || '').trim() || String(question?.title || '').trim();
    groups.get(sectionId).items.push({ ...target, title: title || `Задача №${target.num}`, num: target.num });
  }
  return [...groups.values()].filter(section => section.items.length).map(section => ({
    ...section, completed: section.items.filter(item => item.solved).length,
  }));
}
