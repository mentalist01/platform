import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ownedRecording } from './storage.mjs';
import { concatList } from './segments.mjs';

// Native video playback uses byte ranges; it must not buffer an entire lesson
// as a Blob in the renderer. Each capability grants access to one preview only.
export function sendPreview(req, res, preview) {
  const size = fs.statSync(preview.file).size;
  const range = req.headers.range;
  let start = 0, end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || !match[1] && !match[2]) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (![start, end].every(Number.isSafeInteger) || start < 0 || start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
  }
  res.writeHead(range ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  const stream = fs.createReadStream(preview.file, { start, end });
  res.once('close', () => stream.destroy()); stream.on('error', () => res.destroy()); stream.pipe(res);
}

const command = (exe, args, timeout = 60 * 60_000) => new Promise((resolve, reject) => {
  const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '', errors = '';
  const timer = setTimeout(() => { child.kill(); reject(Error('Обработка заняла слишком много времени. Исходник сохранён.')); }, timeout);
  child.stdout.on('data', value => { text += value; });
  child.stderr.on('data', value => { errors = (errors + value).slice(-2000); });
  child.once('error', () => { clearTimeout(timer); reject(Error('Не найден ffmpeg/ffprobe. Исходник сохранён.')); });
  child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve(text) : reject(Error(`Не удалось подготовить монтаж (${code}). Исходник сохранён.`)); });
});
export class PythonEditMedia {
  constructor({ ffmpeg = 'ffmpeg', root }) {
    this.ffmpeg = ffmpeg; this.root = path.resolve(root); this.work = null; this.previews = new Map(); this.sourceWork = new Map();
    // Capabilities do not survive restart. Remove only their generated cache,
    // never recordings, final renders, or user files (and never follow links).
    if (fs.existsSync(this.root)) for (const folder of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!folder.isDirectory() || !/^[\da-f-]{36}$/i.test(folder.name)) continue;
      const directory = path.join(this.root, folder.name);
      for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
        if (file.isFile() && /^source-[\da-f-]{36}\.mp4(?:\.part\.mp4)?$/i.test(file.name)) {
          try { fs.unlinkSync(path.join(directory, file.name)); } catch { /* A locked cache can be retried after the next restart. */ }
        }
      }
    }
  }
  source(job, recordDirectory) { return ownedRecording(recordDirectory, job.id, job.file); }
  async duration(job, recordDirectory) {
    const ffprobe = this.ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
    const raw = await command(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', this.source(job, recordDirectory)], 30000);
    const duration = Number(JSON.parse(raw).format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw Error('Не удалось прочитать длительность записи');
    return duration;
  }
  async exclusive(job, operation) {
    if (this.work) throw Error('Дождитесь подготовки предыдущего видео');
    this.work = job.id;
    try { return await operation(); } finally { this.work = null; }
  }
  async preview(job, clips, recordDirectory) {
    const source = this.source(job, recordDirectory);
    const key = JSON.stringify([job.id, source, clips.map(({ start, end }) => [start, end])]);
    const cached = [...this.previews].find(([, item]) => item.key === key && fs.existsSync(item.file));
    if (cached) {
      const [id, item] = cached; this.previews.delete(id); this.previews.set(id, item);
      return id;
    }
    return this.exclusive(job, async () => {
      const id = crypto.randomUUID(); const folder = path.join(this.root, job.id);
      fs.mkdirSync(folder, { recursive: true });
      const output = path.join(folder, `preview-${id}.mp4`);
      await this.render(job, clips, recordDirectory, output, true);
      this.previews.set(id, { file: output, jobId: job.id, revision: job.pythonTimeline.revision, key, access: crypto.randomBytes(24).toString('hex') });
      // Temporary previews only: retain bounded disk use. Original MKV and exports are never removed.
      while (this.previews.size > 3) {
        const [oldId, old] = this.previews.entries().next().value;
        this.previews.delete(oldId); fs.unlink(old.file, () => {});
      }
      return id;
    });
  }
  // Playback reads reusable 30-second pieces of the original recording. A cut,
  // reorder or duplicate changes only the browser's play list, never the media.
  // Stream copy keeps the OBS picture/audio and avoids competing with its encoder.
  async playbackSource(job, at, recordDirectory) {
    if (!Number.isFinite(at) || at < 0 || at >= job.pythonTimeline.sourceEnd) throw Error('Выберите записанный фрагмент');
    const input = this.source(job, recordDirectory), slot = Math.floor(at / 30);
    const end = Math.min((slot + 1) * 30, job.pythonTimeline.sourceEnd);
    const key = JSON.stringify(['source', job.id, input, slot, end]);
    const cached = [...this.previews].find(([, item]) => item.key === key && fs.existsSync(item.file));
    if (cached) {
      const [id, item] = cached; this.previews.delete(id); this.previews.set(id, item);
      return { id, ...item };
    }
    if (this.sourceWork.has(key)) return this.sourceWork.get(key);
    if (this.sourceWork.size >= 2) throw Error('Подготавливаем ближайшие фрагменты. Попробуйте через секунду.');
    const pending = this.copyPlaybackSource(job, input, slot, end, key);
    this.sourceWork.set(key, pending);
    try { return await pending; } finally { this.sourceWork.delete(key); }
  }
  async copyPlaybackSource(job, input, slot, end, key) {
    const ffprobe = this.ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
    const from = Math.max(0, slot * 30 - 4);
    const id = crypto.randomUUID(), folder = path.join(this.root, job.id);
    fs.mkdirSync(folder, { recursive: true });
    const output = path.join(folder, `source-${id}.mp4`), temporary = `${output}.part.mp4`;
    try {
      // Preserve timestamps through the seek (including keyframe preroll),
      // then shift by a known offset. This is one remux, with no video encoder.
      await command(this.ffmpeg, ['-hide_banner','-loglevel','error','-y','-copyts','-start_at_zero','-ss',String(from),'-i',input,'-to',String(end),
        '-map','0:v:0','-map','0:a:0?','-c','copy','-output_ts_offset',String(-from),'-avoid_negative_ts','disabled','-movflags','+faststart',temporary], 30000);
      const copied = JSON.parse(await command(ffprobe, ['-v','error','-read_intervals','%+#1','-select_streams','v:0','-show_entries','packet=pts_time','-of','json',temporary], 30000));
      const firstOutput = Number(copied.packets?.[0]?.pts_time);
      if (!Number.isFinite(firstOutput)) throw Error('Фрагмент ещё не записан на диск. Повторите просмотр через секунду.');
      fs.renameSync(temporary, output);
      const item = { file: output, jobId: job.id, key, access: crypto.randomBytes(24).toString('hex'),
        sourceStart: firstOutput+from, sourceEnd: end, offset: -from };
      this.previews.set(id, item);
      while (this.previews.size > 8) {
        const [oldId, old] = this.previews.entries().next().value;
        this.previews.delete(oldId); fs.unlink(old.file, () => {});
      }
      return { id, ...item };
    } catch (error) { fs.unlink(temporary, () => {}); throw error; }
  }
  async render(job, clips, recordDirectory, output, preview = false) {
    if (!Array.isArray(clips) || !clips.length || clips.length > 300) throw Error('Выберите фрагменты для монтажа');
    const input = this.source(job, recordDirectory);
    const folder = path.join(this.root, job.id, crypto.randomUUID());
    fs.mkdirSync(folder, { recursive: true });
    const parts = [];
    try {
      for (const [index, clip] of clips.entries()) {
        if (![clip.start, clip.end].every(Number.isFinite) || clip.start < 0 || clip.end <= clip.start || clip.end > job.pythonTimeline.sourceEnd + .02) throw Error('Некорректные границы фрагмента');
        const part = path.join(folder, `${index}.mkv`);
        await command(this.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(clip.start), '-i', input, '-t', String(clip.end - clip.start),
          '-map', '0:v:0', '-map', '0:a:0?', ...(preview ? ['-vf', "scale='min(960,iw)':-2"] : []),
          '-c:v', 'libx264', '-threads', '2', '-bf', '0', '-preset', preview ? 'ultrafast' : 'veryfast', '-crf', preview ? '28' : '18', '-pix_fmt', 'yuv420p',
          '-c:a', 'pcm_s16le', '-ar', '48000', '-avoid_negative_ts', 'make_zero', part]);
        parts.push(part);
      }
      const list = path.join(folder, 'concat.txt'); fs.writeFileSync(list, concatList(parts));
      const temporary = `${output}.part.mp4`;
      await command(this.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', temporary]);
      fs.renameSync(temporary, output);
    } finally {
      // This UUID workspace is created here and contains only disposable render pieces.
      if (path.dirname(folder) === path.join(this.root, job.id)) fs.rmSync(folder, { recursive: true, force: true });
    }
    return output;
  }
}
