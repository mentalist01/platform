export const STUDIO_CAMERA_INPUT = 'IVAN100 Студия: веб-камера';
export const cameraCorners = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
export const cameraSizes = { small: .20, medium: .26, large: .32 };

export function studioCameraConfig(value = {}) {
  return {
    enabled: value?.enabled === true,
    device: typeof value?.device === 'string' ? value.device : '',
    corner: cameraCorners.includes(value?.corner) ? value.corner : 'bottom-right',
    size: Object.hasOwn(cameraSizes, value?.size) ? value.size : 'small',
  };
}

export function studioCameraReason(value, choices) {
  const camera = studioCameraConfig(value);
  if (!camera.enabled) return '';
  if (!camera.device) return 'Выберите веб-камеру для записи или выключите «Камера в углу».';
  if (choices && !choices.some(item => item.itemEnabled && item.itemValue === camera.device)) return 'Веб-камера недоступна. Подключите её и обновите список камер.';
  return '';
}

export function studioCameraTransform(value, { baseWidth, baseHeight }) {
  if (!(baseWidth > 0 && baseHeight > 0)) throw Error('Не удалось получить размер кадра OBS');
  const camera = studioCameraConfig(value), margin = Math.round(Math.min(baseWidth, baseHeight) * .022);
  const width = Math.round(baseWidth * cameraSizes[camera.size]), height = Math.round(width * 9 / 16);
  return {
    positionX: camera.corner.endsWith('right') ? baseWidth - width - margin : margin,
    positionY: camera.corner.startsWith('bottom') ? baseHeight - height - margin : margin,
    alignment: 5, rotation: 0, scaleX: 1, scaleY: 1,
    cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
    boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: width, boundsHeight: height, boundsAlignment: 0,
  };
}
