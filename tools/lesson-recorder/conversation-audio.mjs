const INPUT = 'IVAN100: Телемост';
const recentMs = 15_000;
const enabled = items => (items || []).filter(item => item.itemEnabled);
export const isTelemostWindow = item => /телемост|telemost/i.test(item?.itemName || '');

export function selectTelemostWindow(items, selected) {
  const calls = enabled(items).filter(isTelemostWindow);
  const exact = calls.find(item => item.itemValue === selected);
  if (exact) return exact.itemValue;
  return calls.length === 1 ? calls[0].itemValue : '';
}

export function conversationAudioHealth({ selected, items, signalAt, now = Date.now(), muted = false, volume = 1, track = true, intentionalMute = false }) {
  if (intentionalMute) return { status: 'off', message: 'Звук разговора в этом режиме отключён.', warning: '' };
  if (muted || volume <= 0 || !track) {
    const warning = 'Звук разговора выключен в OBS или не направлен на дорожку записи. Проверьте настройки звука.';
    return { status: 'muted', message: warning, warning };
  }
  const available = enabled(items).some(item => item.itemValue === selected);
  const recent = Number.isFinite(signalAt) && signalAt <= now && now - signalAt < recentMs;
  if (recent) return { status: 'receiving', message: available ? 'Звук разговора: OBS получает сигнал.' : 'Звук разговора: OBS получает сигнал, хотя сохранённое название окна изменилось. Проверьте шкалу «Разговор».', warning: '' };
  if (available) return { status: 'ready', message: 'Источник разговора выбран. Когда ученик говорит, должна двигаться шкала «Разговор».', warning: '' };
  const warning = 'Сохранённое окно разговора не найдено, свежий сигнал OBS не подтверждён. Откройте Телемост и проверьте шкалу «Разговор». Это не означает, что вся запись без звука.';
  return { status: 'unconfirmed', message: warning, warning };
}

// Only the conversation source may change. Never stop the file, alter the
// microphone, switch scenes, or take over a Python/manual fallback recording.
export async function checkConversationAudio({ obs, job, config, items, scene, now = Date.now() }) {
  const { inputSettings } = await obs.call('GetInputSettings', { inputName: INPUT });
  let selected = inputSettings.window || '';
  const actual = enabled(items).find(item => item.itemValue === selected);
  const target = selectTelemostWindow(items, selected);
  const wasTelemost = /телемост|telemost/i.test(selected);
  const defaultSource = selected === config.platform;
  const followsTelemost = job?.status === 'recording' && job.audioMode === 'telemost' && !job.pythonTheory && !job.mockReview && !job.fallbackMode;
  if (followsTelemost && scene !== 'IVAN100 — Перерыв'
    && target && target !== selected && (defaultSource || wasTelemost && !actual)) {
    await obs.assertCollection();
    const [recording, owner] = await Promise.all([
      obs.call('GetRecordStatus'),
      obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' }),
    ]);
    if (recording.outputActive && !recording.outputPaused && owner.parameterValue === `lesson-${job.id}`) {
      await obs.call('SetInputSettings', { inputName: INPUT, inputSettings: { window: target }, overlay: true });
      obs.audioWindow = target;
      selected = target;
    }
  }
  const [mute, volume, tracks] = await Promise.all([
    obs.call('GetInputMute', { inputName: INPUT }), obs.call('GetInputVolume', { inputName: INPUT }), obs.call('GetInputAudioTracks', { inputName: INPUT }),
  ]);
  const intentionalMute = scene === 'IVAN100 — Перерыв' || scene?.startsWith('IVAN100 Python —') || Boolean(job?.pythonTheory || job?.mockReview || job?.audioMode === 'teacher');
  if (!intentionalMute && followsTelemost && defaultSource && selected === config.platform && !isTelemostWindow(actual)) {
    const calls = enabled(items).filter(isTelemostWindow);
    const warning = calls.length > 1 ? 'Открыто несколько окон Телемоста. Выберите нужное окно разговора в настройках пульта.' : 'Окно Телемоста пока не найдено. Сейчас выбран звук платформы. Откройте Телемост: его звук подключится автоматически.';
    return { status: 'waiting', message: warning, warning };
  }
  return conversationAudioHealth({ selected, items, signalAt: obs.audioSignals?.[INPUT]?.at, now,
    muted: mute.inputMuted, volume: volume.inputVolumeMul, track: tracks.inputAudioTracks?.['1'] === true,
    intentionalMute,
  });
}
