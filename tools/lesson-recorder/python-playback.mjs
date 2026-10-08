// A virtual timeline over original media. No montage is rendered for playback.
export function playbackPosition(clips, seconds) {
  let time = 0;
  for (const [index, clip] of clips.entries()) {
    const duration = clip.end - clip.start;
    if (seconds < time + duration || index === clips.length - 1) return { index, time, source: clip.start + Math.max(0, Math.min(duration, seconds - time)) };
    time += duration;
  }
  return null;
}
export class SourceTimelinePlayer {
  constructor(video, resolveSource, onTime, onError) {
    this.videos = [video, video.cloneNode(false)]; video.after(this.videos[1]);
    this.resolveSource = resolveSource; this.onTime = onTime; this.onError = onError;
    this.active = video; this.clips = []; this.generation = 0; this.playing = false; this.time = 0;
    for (const element of this.videos) {
      element.controls = false; element.preload = 'auto'; element.hidden = true;
      element.addEventListener('timeupdate', () => {if(element===this.active)this.tick();});
      element.addEventListener('ended', () => {if(element===this.active)this.tick(true);});
      element.addEventListener('error', () => { if (element === this.active && this.clips.length) { this.pause(); this.onError('Не удалось открыть исходник. Повторите просмотр.'); } });
    }
  }
  configure(clips) { this.stop(); this.clips = clips.map(clip => ({...clip})); }
  stop() { this.generation++; this.pause(); this.clips = []; this.next = null; this.source = null; this.loading = false; }
  pause() { this.playing = false; for (const video of this.videos) video.pause(); }
  async ready(video, source, at, generation) {
    const changed = video.getAttribute('src') !== source.videoUrl;
    if (changed || video.readyState < 1 || !Number.isFinite(video.duration)) {
      await new Promise((resolve, reject) => {
        const clear = () => { clearTimeout(timer); video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); };
        const loaded = () => { clear(); resolve(); }, failed = () => { clear(); reject(Error('Не удалось открыть исходник')); };
        const timer = setTimeout(failed, 15000); video.addEventListener('loadedmetadata', loaded); video.addEventListener('error', failed);
        if(changed){video.src = source.videoUrl; video.load();}
      });
    }
    if (generation !== this.generation) return false;
    const target = Math.max(0, Math.min(video.duration - .01, at + source.offset));
    if (Math.abs(video.currentTime - target) > .015) {
      await new Promise((resolve, reject) => {
        const clear = () => { clearTimeout(timer); video.removeEventListener('seeked', done); video.removeEventListener('error', failed); };
        const done = () => { clear(); resolve(); }, failed = () => { clear(); reject(Error('Не удалось перейти к фрагменту')); };
        const timer = setTimeout(failed, 15000); video.addEventListener('seeked', done); video.addEventListener('error', failed); video.currentTime = target;
      });
    }
    return generation === this.generation;
  }
  async seek(seconds, play = false) {
    const position = playbackPosition(this.clips, seconds); if (!position) return;
    const generation = ++this.generation; this.pause(); this.next = null; this.loading = true;
    try {
      const source = await this.resolveSource(Math.min(position.source, this.clips[position.index].end - .001));
      if (generation !== this.generation || !await this.ready(this.active, source, position.source, generation)) return;
      this.source = source; this.index = position.index; this.clipTime = position.time; this.time = seconds; this.loading = false;
      this.onTime(seconds); this.active.hidden = false;
      if (play) await this.play(); else void this.preloadNext();
    } catch(error) { if(generation===this.generation)this.onError(error.message); throw error; }
    finally { if(generation===this.generation)this.loading=false; }
  }
  async play() {
    if (!this.clips.length || this.loading) return;
    let generation = this.generation;
    if (this.time >= this.duration() - .02) {
      const reset = this.seek(0); generation = this.generation; await reset;
    }
    if (generation !== this.generation || !this.clips.length || this.loading) return;
    this.playing = true; await this.active.play();
    if (generation !== this.generation || !this.playing) return;
    this.frame(); void this.preloadNext();
  }
  duration() { return this.clips.reduce((sum, clip) => sum + clip.end - clip.start, 0); }
  frame() {
    if (!this.playing) return;
    cancelAnimationFrame(this.frameId);
    this.frameId = requestAnimationFrame(() => { this.tick(); this.frame(); });
  }
  nextPosition() {
    const clip = this.clips[this.index]; if (!clip || !this.source) return null;
    const boundary = Math.min(clip.end, this.source.sourceEnd);
    if (boundary < clip.end - .001) return { index: this.index, source: boundary, time: this.clipTime + boundary - clip.start };
    const next = this.clips[this.index + 1];
    return next ? { index: this.index + 1, source: next.start, time: this.clipTime + clip.end - clip.start } : null;
  }
  async preloadNext() {
    const position = this.nextPosition(); if (!position || this.next) return;
    const generation = this.generation, video = this.videos.find(item => item !== this.active);
    const entry = { position, video, ready: false }; this.next = entry;
    try {
      const source = await this.resolveSource(position.source);
      if (generation !== this.generation || this.next !== entry) return;
      entry.source = source; entry.ready = await this.ready(video, source, position.source, generation);
    } catch { if (generation === this.generation && this.next === entry) this.next = null; }
  }
  tick(ended = false) {
    if (this.loading || !this.clips.length || !this.source) return;
    const clip = this.clips[this.index], sourceTime = this.active.currentTime - this.source.offset;
    this.time = Math.min(this.clipTime + clip.end - clip.start, this.clipTime + Math.max(0, sourceTime - clip.start)); this.onTime(this.time);
    if (!this.playing || !ended && sourceTime < Math.min(clip.end, this.source.sourceEnd) - .012) return;
    const position = this.nextPosition();
    if (!position) { this.time = this.duration(); this.pause(); this.onTime(this.time); return; }
    if (this.next?.ready) {
      const next = this.next, old = this.active;
      old.pause(); old.hidden = true; old.before(next.video); this.active = next.video; this.active.hidden = false;
      this.source = next.source; this.index = next.position.index; this.clipTime = next.position.time - (next.position.source - this.clips[this.index].start);
      this.time = next.position.time; this.next = null;
      this.active.playbackRate = old.playbackRate; this.active.volume = old.volume; this.active.muted = old.muted;
      void this.active.play().catch(error => { this.pause(); this.onError(error.message); }); void this.preloadNext();
    } else { this.pause(); void this.seek(position.time, true).catch(error => this.onError(error.message)); }
  }
}
