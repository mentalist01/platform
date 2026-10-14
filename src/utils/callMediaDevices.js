export const normalizeCallDevice = (value) => ({
  deviceId: typeof value?.deviceId === 'string' ? value.deviceId : '',
  label: typeof value?.label === 'string' ? value.label : '',
});

export const readCallDevices = (storage, key) => {
  try {
    const saved = JSON.parse(storage?.getItem(key) || '{}');
    return { camera: normalizeCallDevice(saved.camera), microphone: normalizeCallDevice(saved.microphone) };
  } catch {
    return { camera: normalizeCallDevice(), microphone: normalizeCallDevice() };
  }
};

// An explicit selection must never silently fall back to a different camera/mic.
export const selectCallMediaConstraints = (constraints, devices) => {
  const selected = { ...constraints };
  for (const [kind, preference] of [['video', devices.camera], ['audio', devices.microphone]]) {
    if (constraints[kind] && preference?.deviceId) {
      selected[kind] = { ...(constraints[kind] === true ? {} : constraints[kind]), deviceId: { exact: preference.deviceId } };
    }
  }
  return selected;
};

export const requestCallMedia = async (mediaDevices, constraints, devices) => {
  try {
    return await mediaDevices.getUserMedia(selectCallMediaConstraints(constraints, devices));
  } catch (error) {
    if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
      const names = [];
      if (constraints.video && devices.camera?.deviceId) names.push(devices.camera.label || 'камера');
      if (constraints.audio && devices.microphone?.deviceId) names.push(devices.microphone.label || 'микрофон');
      if (names.length) throw new Error(`Не удалось подключить выбранное устройство (${names.join(', ')}). Проверьте подключение или выберите другое в настройках звонка.`, { cause: error });
    }
    throw error;
  }
};
