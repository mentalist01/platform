import { getPythonHomeworkTheoryDetails } from './pythonTheoryHomework.js';
import { getRutubeEmbedUrl } from './learningGroups.js';
import { currentHomeworkResourceEntries } from './homeworkResourcePresence.js';

export function homeworkResources(entries = [], tests = {}, now = Date.now()) {
  return currentHomeworkResourceEntries(entries, now).flatMap(entry => {
    const videos = (entry.learningMaterials || []).filter(material => material.kind === 'video').map(material => ({
      id: `${entry.id}:video:${material.id}`, title: material.title || 'Видео к домашке', type: 'rutube', content: material.url,
      chapters: material.chapters, available: Boolean(getRutubeEmbedUrl(material.url)), description: material.content,
      hasQuestions: Boolean(material.quizQuestions?.length), dueAt: entry.dueAt,
    }));
    const theories = (entry.goals || []).map((goal, index) => {
      const details = getPythonHomeworkTheoryDetails(tests[String(goal.taskNumber)], goal, goal.levelId || 'python');
      return details && { ...details, id: `${entry.id}:theory:${index}`, title: `Python · ${details.subsectionTitle}`, dueAt: entry.dueAt };
    }).filter(Boolean);
    return [...videos, ...theories];
  });
}
