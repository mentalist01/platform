import crypto from 'node:crypto';
import { createLearningMaterial } from './learningGroups.js';
import { privateRutubeVideo } from './desktopRecording.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

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
  const material = createLearningMaterial(null, { title, url: video.url, kind: 'resource', visibility: 'group' },
    { id, teacherId, libraryScope: 'teacher' });
  write([material, ...materials]);
  return { material, created: true };
}
