import crypto from 'node:crypto';
import { pythonCaptureConfig, pythonCaptureReason } from './python-capture.mjs';

export async function startPythonTheory({ api, engine, payload, captureConfig, now = Date.now }) {
  if (engine.active()) throw new Error('Сначала завершите текущую запись');
  const catalog = await api('/python/catalog', {});
  const task = catalog.tasks.find(t => t.number === Number(payload.taskNumber));
  const section = task?.subsections.find(s => s.id === payload.subsectionId);
  if (!section) throw new Error('Обновите список и выберите тему и подраздел');
  if (section.existingUrl !== payload.expectedUrl) throw new Error('Материал изменился. Обновите список тем перед записью.');
  if (section.existingUrl && payload.replaceExisting !== true) throw new Error('Подтвердите замену существующего видео');
  const title = String(payload.title || '').trim();
  if (!title || title.length > 100) throw new Error('Укажите название длиной до 100 символов');
  const selected = pythonCaptureConfig(captureConfig);
  const reason = pythonCaptureReason(selected);
  if (reason) throw new Error(reason);
  const id = crypto.randomUUID();
  await engine.start({ id, title, local: true, manual: true, autoPublish: true, audioMode: 'teacher',
    captureProfile: 'python', captureConfig: selected,
    cutoffAt: now() + 3 * 60 * 60_000,
    pythonTheory: { teacherId: catalog.teacherId, taskNumber: task.number, subsectionId: section.id,
      taskTitle: task.title, subsectionTitle: section.title, expectedUrl: section.existingUrl,
      replaceExisting: payload.replaceExisting === true },
  });
  return id;
}

export async function publishPythonTheory(job, { api, ready, save }) {
  if (!await ready(job.url)) { job.status = 'processing'; save(); return; }
  const material = await api('/python/material', { ...job.pythonTheory,
    recordingId: job.id, title: job.title, url: job.url });
  job.pythonMaterial = material; job.status = 'ready'; job.error = ''; save();
}
