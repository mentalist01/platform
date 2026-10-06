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
// OBS does not render or meter sources in an inactive scene. Keep a short
// preview lease only while this panel is visible and the recorder is idle.
// A real output always has priority; releasing a lease never redirects it.
export class PythonPreviewSession {
  constructor({ obs, now = Date.now }) { this.obs = obs; this.now = now; }
  async image(mode, { idle, ownRecording } = {}) {
    if (!pythonModes.includes(mode)) throw new Error('Выберите источник изображения для Python');
    const status = await this.obs.status();
    if ((await this.obs.call('GetStreamStatus')).outputActive) throw new Error('Предпросмотр Python недоступен во время трансляции');
    if (status.outputActive) {
      this.lease = null;
      if (!ownRecording) throw new Error('Во время другого урока предпросмотр Python недоступен');
      return this.obs.preview(status.scene);
    }
    if (!idle) throw new Error('Дождитесь окончания текущей операции');
    if (this.lease && status.scene !== this.lease.scene) this.lease = null;
    const previous = this.lease?.previous || status.scene;
    await this.obs.selectPython(mode);
    const scene = (await this.obs.status()).scene;
    this.lease = { previous, scene, expiresAt: this.now() + 12000 };
    return this.obs.preview(scene);
  }
  async release() {
    const lease = this.lease; this.lease = null;
    if (!lease) return;
    const status = await this.obs.status();
    if (status.outputActive || (await this.obs.call('GetStreamStatus')).outputActive || status.scene !== lease.scene) return;
    await this.obs.call('SetCurrentProgramScene', { sceneName: lease.previous });
  }
  async expire() { if (this.lease && this.now() >= this.lease.expiresAt) await this.release(); }
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
