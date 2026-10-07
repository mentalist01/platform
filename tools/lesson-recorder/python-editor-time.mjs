// Shared by the browser and its tests. Short clips have wider hit targets;
// all conversions use their actual geometry rather than pretending zoom is linear.
export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export function timelineLayout(clips, scale, minimumWidth = 40, gap = 4) {
  let time = 0, x = 0;
  return clips.map(clip => {
    const duration = clip.end - clip.start, width = Math.max(minimumWidth, duration * scale);
    const item = { ...clip, time, duration, x, width };
    time += duration; x += width + gap; return item;
  });
}
export function clipAtTime(layout, seconds) {
  return layout.find(item => seconds >= item.time && seconds < item.time + item.duration) || layout.at(-1);
}
export function timeToPixel(layout, seconds) {
  const item = clipAtTime(layout, Math.max(0, seconds));
  return item ? item.x + clamp((seconds - item.time) / item.duration, 0, 1) * item.width : 0;
}
export function pixelToTime(layout, pixel) {
  const item = layout.find(part => pixel <= part.x + part.width) || layout.at(-1);
  return item ? item.time + clamp((pixel - item.x) / item.width, 0, 1) * item.duration : 0;
}
export function snapTime(seconds, points, tolerance, enabled = true) {
  if (!enabled) return seconds;
  const closest = points.reduce((best, value) => Math.abs(value - seconds) < Math.abs(best - seconds) ? value : best, Infinity);
  return Math.abs(closest - seconds) <= tolerance ? closest : seconds;
}
export function trimmedRange(clip, edge, delta, minimum = .04) {
  return edge === 'in'
    ? { start: clamp(clip.start + delta, clip.start, clip.end - minimum), end: clip.end }
    : { start: clip.start, end: clamp(clip.end + delta, clip.start + minimum, clip.end) };
}
