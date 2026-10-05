import { getRutubeEmbedUrl, getRutubeWatchUrl } from '../src/utils/learningGroups.js';
import { collectMonthlyMockCompletions, getMonthlyMockMonth, getMonthlyMockPeriod, normalizeMonthlyMockAssignments } from '../src/utils/monthlyMockExam.js';
import { privateRutubeVideo } from './desktopRecording.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const monthlyReviewUrl = (exam, teacherId) => exam?.monthlyReviewVideos?.[teacherId]?.url || '';

export function normalizeMonthlyReviewUrl(value) {
  if (typeof value !== 'string' || value.length > 3000) fail('Вставьте ссылку на видеоразбор Rutube');
  if (!value.trim()) return '';
  const url = getRutubeWatchUrl(value);
  if (!url || !getRutubeEmbedUrl(url)) fail('Вставьте полную ссылку на видео Rutube, включая ключ ?p= для закрытого видео');
  return url;
}

export function setMonthlyReviewVideo(exam, teacherId, value, now = Date.now()) {
  const url = normalizeMonthlyReviewUrl(value);
  const videos = { ...exam.monthlyReviewVideos };
  if (url) videos[teacherId] = { url, updatedAt: new Date(now).toISOString() };
  else delete videos[teacherId];
  return { ...exam, monthlyReviewVideos: videos };
}

export function monthlyReviewForStudent(exam, teacherId, studentData, month, now = Date.now()) {
  const url = monthlyReviewUrl(exam, teacherId);
  if (!url) return { hasReviewVideo: false };
  const period = getMonthlyMockPeriod(month);
  const completed = period && collectMonthlyMockCompletions(studentData, [exam]).some(entry => (
    entry.examId === exam.id && Date.parse(entry.finishedAt) >= period.startMs && Date.parse(entry.finishedAt) <= now
  ));
  // Late completion still unlocks this variant's review; exemptions and partial
  // homework attempts never count. The URL is omitted while the exam is locked.
  return { hasReviewVideo: true, ...(completed ? { reviewVideoUrl: url } : {}) };
}

export function recorderMockReviewCatalog(exams, teacherId, month = getMonthlyMockMonth()) {
  return { teacherId, month, exams: exams.filter(exam => (
    normalizeMonthlyMockAssignments(exam.monthlyAssignments)[teacherId]?.includes(month)
    && exam.access?.all === true && Object.keys(exam.tasks || {}).length
  )).map(exam => ({ id: exam.id, title: exam.title, existingUrl: monthlyReviewUrl(exam, teacherId) })) };
}

export function attachRecorderMockReview(exams, teacherId, payload) {
  if (!teacherId || payload?.teacherId !== teacherId) fail('Пульт подключён к другому преподавателю', 403);
  const { recordingId, examId, month, expectedUrl, replaceExisting } = payload;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(recordingId || '')) fail('Некорректная запись');
  if (!getMonthlyMockPeriod(month)) fail('Некорректный месяц пробника');
  const video = privateRutubeVideo(payload.url);
  if (!video) fail('Нужна закрытая ссылка Rutube с ключом p');
  const index = exams.findIndex(exam => exam.id === examId);
  if (index < 0) fail('Пробник больше не существует. Запись сохранена на компьютере.', 404);
  const exam = exams[index];
  const receipt = exam.monthlyReviewPublications?.[teacherId]?.[recordingId];
  const current = monthlyReviewUrl(exam, teacherId);
  if (receipt) {
    if (receipt.url !== video.url || receipt.month !== month || current !== video.url) fail('Разбор был изменён на платформе. Проверьте ссылку перед прикреплением.', 409);
    return { exams, created: false, examId, month, url: video.url };
  }
  if (!normalizeMonthlyMockAssignments(exam.monthlyAssignments)[teacherId]?.includes(month) || exam.access?.all !== true) fail('Назначение пробника изменилось. Запись сохранена; проверьте пробник на платформе.', 409);
  if (typeof expectedUrl !== 'string' || expectedUrl !== current) fail('Видеоразбор изменился во время записи. Файл сохранён; проверьте ссылку на платформе.', 409);
  if (current && replaceExisting !== true) fail('Подтвердите замену существующего разбора', 409);
  const next = setMonthlyReviewVideo(exam, teacherId, video.url);
  next.monthlyReviewPublications = { ...exam.monthlyReviewPublications, [teacherId]: {
    ...exam.monthlyReviewPublications?.[teacherId], [recordingId]: { url: video.url, month },
  } };
  return { exams: exams.map((entry, i) => i === index ? next : entry), created: true, examId, month, url: video.url };
}
