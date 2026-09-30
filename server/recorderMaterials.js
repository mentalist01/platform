import crypto from 'node:crypto';
import { createLearningMaterial, LearningGroupDomainError } from './learningGroups.js';
import { privateRutubeVideo } from './desktopRecording.js';

const fail = (message, status = 400) => {
  throw Object.assign(new LearningGroupDomainError(message, { statusCode: status, code: 'recording_material_error' }), { status });
};

// Device authentication supplies the owner. No caller-selected teacher, sharing,
// file path or group can grant access to another teacher's library.
export function addRecorderMaterial(teacherId, payload, { read, write }) {
  if (!teacherId) fail('Преподаватель не найден', 404);
  const clipId = String(payload?.clipId || '');
  const title = String(payload?.title || '').trim();
  const video = privateRutubeVideo(payload?.url);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(clipId)) fail('Некорректный фрагмент');
  if (!title || title.length > 100) fail('Укажите название длиной до 100 символов');
  if (!video) fail('Нужна закрытая ссылка Rutube с ключом p');
  const id = 'recorder-' + crypto.createHash('sha256').update(JSON.stringify([teacherId, clipId.toLowerCase()])).digest('hex');
  const materials = read();
  const existing = materials.find(m => m.id === id);
  if (existing) {
    if (existing.deletedAt) fail('Этот материал удалён на платформе. Создайте новый фрагмент.', 409);
    if (existing.teacherId !== teacherId || existing.title !== title || existing.url !== video.url) fail('Этот фрагмент уже добавлен с другими данными', 409);
    return { material: existing, created: false };
  }
  // A plain video resource does not invent quiz answers. The teacher can attach
  // the material to any group's homework using the existing shared library.
  const material = createLearningMaterial(null, { title, url: video.url, kind: 'video', visibility: 'group' },
    { id, teacherId, libraryScope: 'teacher', allowVideoWithoutQuiz: true, recordingSource: `archive:${clipId}`,
      durationSeconds: payload.durationSeconds });
  write([material, ...materials]);
  return { material, created: true };
}

export function recordingLibrary(teacherId, jobs, materials) {
  return jobs.filter(job => job.teacherId === teacherId && job.status === 'ready' && privateRutubeVideo(job.video?.url))
    .map(job => ({ id: job.id, title: `${job.title || job.lessonName || 'Запись урока'}${job.title && job.lessonName && !job.title.includes(job.lessonName) ? ` · ${job.lessonName}` : ''}`,
      date: job.occurrence?.dayKey || '', durationSeconds: Number(job.video?.durationMs || 0) / 1000
        || Number(job.occurrence?.durationMinutes || 0) * 60,
      url: privateRutubeVideo(job.video.url).url,
      material: materials.find(material => material.teacherId === teacherId && !material.deletedAt
        && material.kind === 'video' && material.url === privateRutubeVideo(job.video.url).url) || null,
    })).sort((a, b) => b.date.localeCompare(a.date));
}

export function addLessonRecordingMaterial(teacherId, jobId, payload, { jobs, read, write }) {
  const materials = read();
  const recording = recordingLibrary(teacherId, jobs, materials).find(job => job.id === jobId);
  if (!recording) fail('Готовая запись урока не найдена', 404);
  if (recording.material) return { material: recording.material, created: false };
  const title = String(payload.title || '').trim();
  if (!title || title.length > 100) fail('Укажите название длиной до 100 символов');
  const baseId = 'recorder-' + crypto.createHash('sha256').update(JSON.stringify([teacherId, 'lesson:' + jobId])).digest('hex');
  // Re-adding an explicitly deleted material creates a new identity; old
  // assignments and deletion history must not be revived by this action.
  const id = materials.some(material => material.id === baseId) ? `recorder-${crypto.randomUUID()}` : baseId;
  const material = createLearningMaterial(null, { title, url: recording.url, kind: 'video', visibility: 'group' },
    { id, teacherId, libraryScope: 'teacher', allowVideoWithoutQuiz: true,
      recordingSource: `lesson:${jobId}`, durationSeconds: recording.durationSeconds });
  write([material, ...materials]);
  return { material, created: true };
}
