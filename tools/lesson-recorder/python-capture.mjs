export const pythonModes = ['platform', 'window', 'screen'];
const labels = { platform: 'окно платформы для Python', window: 'окно редактора для Python', screen: 'монитор для Python', mic: 'микрофон для Python' };
export function pythonCaptureConfig(value = {}) {
  return { mode: pythonModes.includes(value.mode) ? value.mode : 'window',
    ...Object.fromEntries(['platform', 'window', 'screen', 'mic'].map(key => [key, typeof value[key] === 'string' ? value[key] : ''])) };
}
export function pythonCaptureReason(value, choices) {
  const config = pythonCaptureConfig(value);
  for (const key of [config.mode, 'mic']) {
    if (!config[key]) return `Выберите ${labels[key]}.`;
    const list = choices?.[key === 'window' ? 'platform' : key];
    if (choices && !list?.some(item => item.itemEnabled && item.itemValue === config[key])) return `Недоступен ${labels[key]}. Откройте окно или подключите устройство и обновите список.`;
  }
  return '';
}
// Changes are local to the Python profile. A live lesson or a foreign OBS
// output must never be redirected by controls from this panel.
export async function configurePythonCapture({ obs, state, engine, save, payload, busy = false }) {
  if (busy) throw new Error('Дождитесь окончания загрузки, обработки или обновления пульта');
  const active = engine.active();
  if (active && (!active.pythonTheory || active.status !== 'recording')) throw new Error('Сначала завершите текущую запись');
  const status = await obs.status();
  if ((await obs.call('GetStreamStatus')).outputActive) throw new Error('Сначала завершите трансляцию OBS');
  if (status.outputActive) {
    const owner = await obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' });
    if (!active?.pythonTheory || owner.parameterValue !== `lesson-${active.id}`) throw new Error('В OBS идёт другая запись');
  } else if (active) throw new Error('OBS не подтверждает запись Python. Проверьте состояние записи.');
  if (payload.mode !== undefined && !pythonModes.includes(payload.mode)) throw new Error('Неизвестный режим записи Python');
  const previous = pythonCaptureConfig(state.config.pythonCapture);
  const next = pythonCaptureConfig({ ...previous, ...payload });
  const choices = await obs.choices();
  for (const key of ['platform', 'window', 'screen', 'mic']) {
    if (next[key] && next[key] !== previous[key] && !choices[key === 'window' ? 'platform' : key]?.some(item => item.itemEnabled && item.itemValue === next[key])) throw new Error(`Выберите доступный источник: ${labels[key]}`);
  }
  if (active) {
    const reason = pythonCaptureReason(next, choices);
    if (reason) throw new Error(reason);
  }
  await obs.ensurePythonSources();
  await obs.configurePython(next);
  if (active) await obs.selectPython(next.mode);
  state.config.pythonCapture = next;
  if (active) active.captureConfig = { ...next };
  save();
  return next;
}
