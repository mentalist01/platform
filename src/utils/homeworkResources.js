import { getPythonHomeworkTheoryDetails } from './pythonTheoryHomework.js';
import { getRutubeEmbedUrl } from './learningGroups.js';
import { currentHomeworkResourceEntries } from './homeworkResourcePresence.js';

export function homeworkResources(entries = [], tests = {}, now = Date.now()) {
  const theoryKeys = new Set();
  return currentHomeworkResourceEntries(entries, now).flatMap(entry => {
    const videos = (entry.learningMaterials || []).filter(material => material.kind === 'video').map(material => ({
      id: `${entry.id}:video:${material.id}`, title: material.title || 'Видео к домашке', type: 'rutube', content: material.url,
      chapters: material.chapters, available: Boolean(getRutubeEmbedUrl(material.url)), description: material.content,
      hasQuestions: Boolean(material.quizQuestions?.length), dueAt: entry.dueAt,
    }));
    const theories = (entry.goals || []).map((goal, index) => {
      const task = tests[String(goal.taskNumber)];
      const topicTitle = task?.title || tests.__pythonTaskCatalog?.find(item => Number(item.number) === Number(goal.taskNumber))?.title || `Тема Python ${goal.taskNumber}`;
      const details = getPythonHomeworkTheoryDetails(task, goal, goal.levelId || 'python', { defaultSectionTitle: topicTitle });
      if (!details) return null;
      const key = `${goal.taskNumber}:${details.key}`;
      if (theoryKeys.has(key)) return null;
      theoryKeys.add(key);
      return { ...details, source: 'theory', id: `${entry.id}:theory:${index}`, title: `Python · ${details.subsectionTitle}`, dueAt: entry.dueAt };
    }).filter(Boolean);
    return [...videos, ...theories];
  });
}
