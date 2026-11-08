// Store a viewport in card-width units, never screen pixels or absolute board
// coordinates. The same shot follows the card when its position/scale changes.
export function normalizePreparedCardCamera(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw Error('Задайте область камеры в конструкторе');
  const frame = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, value[key]]));
  if (!Object.values(frame).every(number => typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= 10000)
    || frame.width < .001 || frame.height < .001) throw Error('Область камеры выходит за границы конструктора');
  return frame;
}

export function capturePreparedCardCamera(card, view, viewport) {
  return normalizePreparedCardCamera({
    x: (-view.x / view.scale - card.x) / card.width,
    y: (-view.y / view.scale - card.y) / card.width,
    width: viewport.width / view.scale / card.width,
    height: viewport.height / view.scale / card.width,
  });
}

export function preparedCardCameraFrame(card, camera) {
  if (!camera || !card || !(card.width > 0)) return null;
  return {x: card.x + camera.x * card.width, y: card.y + camera.y * card.width,
    width: camera.width * card.width, height: camera.height * card.width};
}

// Fit the whole saved shot, extending its shorter axis on other aspect ratios.
// No extra automatic margins or zoom cap: the teacher already framed the shot.
export function preparedCardCameraView(frame, {width, height, left = 0, top = 0, right = 0, bottom = 0}) {
  const availableWidth = Math.max(1, width - left - right), availableHeight = Math.max(1, height - top - bottom);
  const zoom = Math.min(availableWidth / frame.width, availableHeight / frame.height);
  return {zoom, offset: {
    x: frame.x - (left + (availableWidth - frame.width * zoom) / 2) / zoom,
    y: frame.y - (top + (availableHeight - frame.height * zoom) / 2) / zoom,
  }};
}
