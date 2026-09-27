import crypto from 'node:crypto';
import { INPUTS } from './obs.mjs';

// Keep the current file and lesson binding. A new offline file is local-only.
export async function enterFallback({ engine, obs, payload, save, now = Date.now }) {
  const active = engine.active();
  if (active && (active.status !== 'recording' || active.pythonTheory)) throw Error('Сначала завершите текущую запись или дождитесь её запуска');
  const choices = await obs.choices();
  for (const [key, value] of [['platform', payload.window], ['telemost', payload.audio]]) {
    if (!value || !choices[key].some(item => item.itemEnabled && item.itemValue === value)) throw Error('Выберите открытые окна разговора и доски');
  }
  if (active) {
    await obs.assertCollection();
    const status = await obs.status();
    const { parameterValue } = await obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' });
    if (!status.outputActive || parameterValue !== `lesson-${active.id}`) throw Error('OBS сейчас не записывает этот урок');
    await obs.select('window', payload.window);
    await obs.call('SetInputSettings', { inputName: INPUTS.telemost, inputSettings: { window: payload.audio }, overlay: true });
    await obs.call('SetInputMute', { inputName: INPUTS.telemost, inputMuted: false });
    obs.audioWindow = payload.audio;
    active.fallbackMode = true;
    active.cutoffAt = active.fallbackStartedAt ? active.cutoffAt : now() + 3 * 60 * 60_000;
    active.fallbackStartedAt ||= now();
    active.captureConfig = { platform: payload.window, telemost: payload.audio };
    save();
  } else {
    const title = String(payload.title || '').trim();
    if (!title || title.length > 100) throw Error('Укажите название локальной записи');
    await engine.start({ id: crypto.randomUUID(), title, local: true, manual: true,
      fallbackMode: true, fallbackStartedAt: now(), cutoffAt: now() + 3 * 60 * 60_000,
      captureConfig: { platform: payload.window, telemost: payload.audio } });
    await obs.select('window', payload.window);
  }
}
