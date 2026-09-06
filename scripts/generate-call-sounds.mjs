import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Original, deterministic notification sounds. No external samples.
// Run: node scripts/generate-call-sounds.mjs (requires ffmpeg on PATH).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public/sounds/call');
const masterDir = path.join(root, 'output/call-sounds-masters');
const sampleRate = 48_000;
const peakLevel = 0.26;
const tau = 2 * Math.PI;
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

const cues = [
  {
    name: 'soft-join-v1', duration: 0.76,
    notes: [[67, 0.012, 0.38, 0.72], [72, 0.145, 0.48, 1]],
  },
  {
    name: 'soft-leave-v1', duration: 0.70,
    notes: [[72, 0.012, 0.34, 0.72], [67, 0.15, 0.41, 0.9]],
  },
  {
    name: 'soft-screen-on-v1', duration: 0.90,
    notes: [[72, 0.012, 0.37, 0.66], [76, 0.125, 0.41, 0.76], [79, 0.24, 0.48, 0.86]],
  },
  {
    name: 'soft-screen-off-v1', duration: 0.78,
    notes: [[76, 0.012, 0.34, 0.66], [72, 0.14, 0.46, 0.84]],
  },
];

const renderCue = ({ duration, notes }) => {
  const samples = new Float64Array(Math.round(duration * sampleRate));
  for (const [midi, start, length, gain] of notes) {
    const hz = frequency(midi);
    const startSample = Math.round(start * sampleRate);
    const noteSamples = Math.round(length * sampleRate);
    const attack = 0.024;
    for (let index = 0; index < noteSamples; index++) {
      const t = index / sampleRate;
      // Rounded mallet, with a soft attack and no percussive/noise transient.
      const fadeIn = Math.sin(Math.min(1, t / attack) * Math.PI / 2) ** 2;
      const fadeOut = Math.cos((t / length) * Math.PI / 2) ** 2;
      const envelope = gain * fadeIn * fadeOut * Math.exp(-2.3 * t / length);
      const fundamental = Math.sin(tau * hz * t);
      const warmth = 0.10 * Math.sin(tau * hz * 2 * t) * Math.exp(-9 * t);
      const softOvertone = 0.012 * Math.sin(tau * hz * 3 * t) * Math.exp(-14 * t);
      samples[startSample + index] += envelope * (fundamental + warmth + softOvertone);
    }
  }
  const dry = samples.slice();
  // Short, quiet reflections give the tail space without a long echo.
  for (const [delay, gain] of [[0.031, 0.065], [0.057, 0.036], [0.089, 0.020]]) {
    const offset = Math.round(delay * sampleRate);
    for (let index = offset; index < samples.length; index++) samples[index] += dry[index - offset] * gain;
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const normalization = peakLevel / peak;
  for (let index = 0; index < samples.length; index++) {
    const remaining = (samples.length - 1 - index) / sampleRate;
    const fadeOut = Math.sin(Math.min(1, remaining / 0.028) * Math.PI / 2) ** 2;
    samples[index] *= normalization * fadeOut;
  }
  return samples;
};

const encodeWav = (samples) => {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => {
    if (!Number.isFinite(sample) || Math.abs(sample) > 0.27) throw new Error('Invalid audio level');
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  });
  return buffer;
};

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(masterDir, { recursive: true });
for (const cue of cues) {
  const samples = renderCue(cue);
  if (samples[0] !== 0 || samples.at(-1) !== 0) throw new Error('Cue must start and end at zero');
  const wav = encodeWav(samples);
  const masterPath = path.join(masterDir, `${cue.name}.wav`);
  const playbackPath = path.join(outputDir, `${cue.name}.mp3`);
  await fs.writeFile(masterPath, wav);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', masterPath, '-map_metadata', '-1',
    '-codec:a', 'libmp3lame', '-b:a', '96k', '-ar', String(sampleRate), playbackPath]);
  const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  console.log(`${cue.name}: ${cue.duration.toFixed(2)} s, master peak -11.7 dBFS, RMS ${(20 * Math.log10(rms)).toFixed(1)} dBFS, ${(await fs.stat(playbackPath)).size} bytes MP3`);
}
