import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ownedRecording } from './storage.mjs';
import { concatList } from './segments.mjs';

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
  constructor({ ffmpeg = 'ffmpeg', root }) { this.ffmpeg = ffmpeg; this.root = path.resolve(root); this.work = null; this.previews = new Map(); }
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
    return this.exclusive(job, async () => {
      const id = crypto.randomUUID(); const folder = path.join(this.root, job.id);
      fs.mkdirSync(folder, { recursive: true });
      const output = path.join(folder, `preview-${id}.mp4`);
      await this.render(job, clips, recordDirectory, output, true);
      this.previews.set(id, { file: output, jobId: job.id, revision: job.pythonTimeline.revision });
      // Temporary previews only: retain bounded disk use. Original MKV and exports are never removed.
      while (this.previews.size > 3) {
        const [oldId, old] = this.previews.entries().next().value;
        this.previews.delete(oldId); fs.unlink(old.file, () => {});
      }
      return id;
    });
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
