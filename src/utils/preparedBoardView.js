// Focusing an exercise pans to its beginning. Its height must never shrink
// the text just to fit the entire exercise (and writing below it) on screen.
export function preparedBoardView(anchor, {width, zoom, initial = false, top = 76}) {
  const readable = Math.max(.45, Math.min(1, (width - 100) / anchor.width));
  const nextZoom = initial ? readable : zoom;
  const left = Math.max(72, (width - anchor.width * nextZoom + 60) / 2);
  return {zoom: nextZoom, offset: {x: anchor.x - left / nextZoom, y: anchor.y - top / nextZoom}};
}
