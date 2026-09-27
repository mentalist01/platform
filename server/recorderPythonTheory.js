import { normalizePythonTaskCatalog, PYTHON_TASKS_CATALOG_KEY } from '../src/utils/pythonTaskCatalog.js';
import { buildPythonSubsectionModel, PYTHON_DEFAULT_SUBSECTION_ID } from '../src/utils/pythonSubsections.js';
import { getPythonHomeworkTheoryDetails } from '../src/utils/pythonTheoryHomework.js';
import { privateRutubeVideo } from './desktopRecording.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const currentVideo = (entry, subsectionId) => getPythonHomeworkTheoryDetails(entry, {
  pythonTheorySubsectionId: subsectionId, pythonTheoryType: 'rutube',
})?.content || '';

export function recorderPythonCatalog(tests, defaults) {
  return normalizePythonTaskCatalog(tests[PYTHON_TASKS_CATALOG_KEY], defaults).map(task => ({
    number: task.number, title: task.title, sectionId: task.sectionId,
    subsections: buildPythonSubsectionModel(tests[String(task.number)], 'python', {
      includeEmptySections: true, defaultSectionTitle: 'Вся тема',
    }).subsections.map(section => ({ id: section.id, title: section.title,
      existingUrl: currentVideo(tests[String(task.number)], section.id) })),
  }));
}

// Mutate only one teacher's theory slot. A recording never rewrites exercises,
// other theory formats or another teacher's material. Expected URL protects edits
// made while the recording was being uploaded.
export function attachRecorderPythonTheory(tests, defaults, teacherId, payload) {
  const { recordingId, taskNumber, subsectionId, expectedUrl, url } = payload || {};
  if (!teacherId || payload?.teacherId !== teacherId) fail('Пульт подключён к другому преподавателю', 403);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(recordingId || '')) fail('Некорректная запись');
  const title = String(payload.title || '').trim();
  if (!title || title.length > 100) fail('Укажите название длиной до 100 символов');
  const video = privateRutubeVideo(url);
  if (!video) fail('Нужна закрытая ссылка Rutube с ключом p');
  const task = recorderPythonCatalog(tests, defaults).find(t => t.number === Number(taskNumber));
  const section = task?.subsections.find(s => s.id === subsectionId);
  if (!section) fail('Тема или подраздел больше не существует', 404);
  const key = String(task.number);
  const entry = tests[key] || {};
  const receipts = entry.pythonRecorderPublications || {};
  const receipt = receipts[recordingId];
  if (receipt) {
    if (receipt.subsectionId !== subsectionId || receipt.url !== video.url || receipt.title !== title
      || section.existingUrl !== video.url) fail('Эта запись уже прикреплена или материал был изменён на сайте', 409);
    return { tests, created: false, title, taskNumber: task.number, subsectionId };
  }
  if (typeof expectedUrl !== 'string' || section.existingUrl !== expectedUrl) fail('Видео в выбранном подразделе изменилось. Файл сохранён; проверьте материал на сайте.', 409);
  if (expectedUrl && payload.replaceExisting !== true) fail('Подтвердите замену существующего видео', 409);
  const stored = entry.pythonTheoryBySubsection?.[subsectionId]
    || (subsectionId === PYTHON_DEFAULT_SUBSECTION_ID ? entry.pythonTheory : null);
  const variants = stored?.type ? { [stored.type]: stored } : { ...(stored?.variants || stored || {}) };
  const next = { ...entry,
    pythonTheoryBySubsection: { ...entry.pythonTheoryBySubsection, [subsectionId]: {
      ...variants, rutube: { type: 'rutube', content: video.url, title },
    } },
    pythonRecorderPublications: { ...receipts, [recordingId]: { subsectionId, url: video.url, title } },
  };
  return { tests: { ...tests, [key]: next }, created: true, title, taskNumber: task.number, subsectionId };
}
