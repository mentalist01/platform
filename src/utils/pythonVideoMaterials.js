import { getPythonHomeworkTheoryChoices, getPythonHomeworkTheoryDetails } from './pythonTheoryHomework.js';
import { getRutubeEmbedUrl } from './learningGroups.js';

export const getPythonVideoMaterials = (tasks, testsDb, levelId = 'python') => (
  (Array.isArray(tasks) ? tasks : []).flatMap((task) => {
    const number = task.number ?? task.id;
    const entry = testsDb?.[String(number)];
    return getPythonHomeworkTheoryChoices(entry, levelId)
      .filter((choice) => choice.type === 'rutube')
      .flatMap((choice) => {
        const details = getPythonHomeworkTheoryDetails(entry, {
          pythonTheorySubsectionId: choice.subsectionId, pythonTheoryType: 'rutube',
        }, levelId);
        const url = getRutubeEmbedUrl(details?.content);
        if (!url) return [];
        return [{ id: `${number}:${choice.key}`, url,
          title: `${task.title || `Тема ${number}`} · ${choice.subsectionTitle}` }];
      });
  })
);
