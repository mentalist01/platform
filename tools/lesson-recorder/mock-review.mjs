import crypto from 'node:crypto';

export async function startMockReview({ api, engine, payload, now = Date.now }) {
  if (engine.active()) throw new Error('Сначала завершите текущую запись');
  const catalog = await api('/mock-review/catalog', {});
  const exam = catalog.exams.find(entry => entry.id === payload.examId);
  if (!exam || catalog.month !== payload.month) throw new Error('Назначение пробника изменилось. Обновите список пробников.');
  if (exam.existingUrl !== payload.expectedUrl) throw new Error('Видеоразбор изменился. Обновите список перед записью.');
  if (exam.existingUrl && payload.replaceExisting !== true) throw new Error('Подтвердите замену существующего разбора');
  const id = crypto.randomUUID();
  await engine.start({ id, title: `Разбор · ${exam.title}`.slice(0, 100), local: true, manual: true,
    autoPublish: true, audioMode: 'teacher', cutoffAt: now() + 3 * 60 * 60_000,
    mockReview: { teacherId: catalog.teacherId, examId: exam.id, month: catalog.month,
      expectedUrl: exam.existingUrl, replaceExisting: payload.replaceExisting === true },
  });
  return id;
}

export async function publishMockReview(job, { api, ready, save }) {
  if (!await ready(job.url)) { job.status = 'processing'; save(); return; }
  const material = await api('/mock-review/material', { ...job.mockReview, recordingId: job.id, url: job.url });
  job.mockReviewMaterial = material; job.status = 'ready'; job.error = ''; save();
}
