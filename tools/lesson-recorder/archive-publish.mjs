import { privateVideo } from './rutube.mjs';

// Called again only after a persisted checkpoint. An uncertain upload is left
// for explicit recovery; a platform retry always uses the same clip id.
export async function publishArchiveClip(clip, { persist, upload, ready, attach, now = Date.now }) {
  if (clip.materialId) { clip.materialStatus = 'done'; return; }
  try {
    if (!clip.url) {
      clip.materialStatus = 'uploading'; clip.status = 'uploading'; persist();
      await upload(clip, persist);
    }
    if (!privateVideo(clip.url)) throw new Error('Rutube не подтвердил закрытую ссылку. Проверьте загрузку.');
    clip.materialStatus = 'processing'; clip.status = 'processingVideo'; persist();
    if (!await ready(clip.url)) { clip.nextPublishAt = now() + 30000; persist(); return; }
    clip.materialStatus = 'attaching'; clip.status = 'ready'; persist();
    const result = await attach({ clipId: clip.id, title: clip.title, url: clip.url, durationSeconds: Number(clip.durationMs || 0) / 1000 });
    if (!result?.material?.id) throw new Error('Платформа не подтвердила добавление материала');
    clip.materialId = result.material.id; clip.materialStatus = 'done'; clip.error = ''; clip.nextPublishAt = 0; persist();
  } catch (error) {
    clip.materialStatus = 'error'; clip.error = String(error.message).slice(-600); persist();
  }
}
