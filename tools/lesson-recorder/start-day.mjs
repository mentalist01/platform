export function refreshDaySources(config, choices) {
  const next = { ...config };
  const available = (key) => (choices[key] || []).filter(item => item.itemEnabled);
  const saved = (key) => available(key).some(item => item.itemValue === config[key]);
  if (!saved('platform')) {
    const matches = available('platform').filter(item => /платформа|ivan100\.ru/i.test(item.itemName));
    if (matches.length !== 1) throw new Error(matches.length ? 'Открыто несколько окон платформы. Выберите нужное окно в настройке.' : 'Откройте платформу в отдельном окне браузера и нажмите «Начать сегодняшний день» ещё раз.');
    next.platform = matches[0].itemValue;
  }
  // The call mode selects Telemost when the lesson starts. A closed Telemost
  // must not prevent preparing the day for calls inside the platform.
  if (!saved('telemost')) next.telemost = next.platform;
  if (!saved('mic')) throw new Error('Подключите сохранённый микрофон или выберите его в настройке звука.');
  if (config.screen && !saved('screen')) throw new Error('Сохранённый монитор недоступен. Выберите монитор в настройке.');
  return next;
}

export async function startDay({ config, obs, checkDirectory, platform, save }) {
  if (!config.token) throw new Error('Сначала подключите свой аккаунт в пошаговой настройке.');
  checkDirectory(config.recordDirectory);
  await obs.launch();
  if ((await obs.status()).outputActive) throw new Error('OBS уже записывает. Текущую запись не меняем.');
  await obs.setup(config.recordDirectory);
  const selected = refreshDaySources(config, await obs.choices());
  await obs.configure(selected);
  Object.assign(config, selected, { configured: true }); save();
  await platform();
  config.dayStartedAt = Date.now(); save();
}
