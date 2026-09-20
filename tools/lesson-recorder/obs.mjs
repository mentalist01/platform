import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const SCENES = { platform: 'IVAN100 — Платформа', window: 'IVAN100 — Программа', screen: 'IVAN100 — Экран', pause: 'IVAN100 — Перерыв' };
export const INPUTS = { platform: 'IVAN100: платформа', window: 'IVAN100: программа', screen: 'IVAN100: монитор', mic: 'IVAN100: микрофон', telemost: 'IVAN100: Телемост' };
const COLLECTION = 'IVAN100 Lessons';
const sha = (text) => crypto.createHash('sha256').update(text).digest('base64');

export class ObsClient {
  constructor({ configDir = path.join(process.env.APPDATA || '', 'obs-studio'), executable = 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' } = {}) {
    this.configDir = configDir; this.executable = executable; this.pending = new Map();
  }
  async connect() {
    if (this.connected && this.socket?.readyState === 1) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async open() {
    const config = JSON.parse(fs.readFileSync(path.join(this.configDir, 'plugin_config', 'obs-websocket', 'config.json'), 'utf8'));
    if (!config.server_enabled) throw new Error('Откройте настройку OBS в пульте');
    const socket = new WebSocket(`ws://127.0.0.1:${config.server_port || 4455}`);
    this.socket = socket;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('OBS не отвечает')); }, 5000);
      const failed = () => { clearTimeout(timer); reject(new Error('Нет подключения к OBS')); };
      socket.addEventListener('error', failed, { once: true });
      socket.addEventListener('close', () => {
        this.connected = false;
        for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('OBS отключился')); }
        this.pending.clear(); failed();
      });
      socket.addEventListener('message', (event) => {
        let message; try { message = JSON.parse(event.data); } catch { return; }
        const { op, d } = message;
        if (op === 0) {
          const auth = d.authentication;
          socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 1 | 64 | 65536,
            ...(auth ? { authentication: sha(sha(config.server_password + auth.salt) + auth.challenge) } : {}) } }));
        }
        if (op === 2) { clearTimeout(timer); this.connected = true; resolve(); }
        if (op === 5 && d.eventType === 'InputVolumeMeters') this.meters = d.eventData.inputs;
        if (op === 7) {
          const request = this.pending.get(d.requestId);
          if (!request) return;
          this.pending.delete(d.requestId); clearTimeout(request.timer);
          if (d.requestStatus.result) request.resolve(d.responseData || {});
          else request.reject(Object.assign(new Error(`${d.requestType}: ${d.requestStatus.comment || d.requestStatus.code}`), { code: d.requestStatus.code }));
        }
      });
    });
  }
  async call(requestType, requestData = {}, attempt = 0) {
    await this.connect();
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`OBS: ${requestType} — время ожидания истекло`)); }, 10000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    }).catch(async (error) => {
      if (error.code !== 207 || attempt >= 20) throw error;
      await delay(200); return this.call(requestType, requestData, attempt + 1);
    });
  }
  async launch() {
    try { await this.connect(); return; } catch { /* not running */ }
    if (!fs.existsSync(this.executable)) throw new Error('OBS Studio не найден');
    const child = spawn(this.executable, ['--minimize-to-tray', '--disable-shutdown-check', '--profile', COLLECTION, '--collection', COLLECTION], { cwd: path.dirname(this.executable), detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {}); child.unref();
    for (let i = 0; i < 15; i++) { await delay(1000); try { await this.connect(); return; } catch { /* starting */ } }
    throw new Error('OBS не запустился. Проверьте его окно.');
  }
  async assertCollection() {
    const value = await this.call('GetSceneCollectionList');
    if (value.currentSceneCollectionName !== COLLECTION) throw new Error('В OBS выбрана другая коллекция. Нажмите «Настроить OBS».');
    const profile = await this.call('GetProfileList');
    if (profile.currentProfileName !== COLLECTION) throw new Error('В OBS выбран другой профиль. Нажмите «Настроить OBS».');
  }
  async prepare(config, recordDirectory, audioMode) {
    await this.launch();
    const recording = await this.call('GetRecordStatus');
    const stream = await this.call('GetStreamStatus');
    if (recording.outputActive || stream.outputActive) throw new Error('В OBS уже идёт запись или трансляция');
    const profiles = await this.call('GetProfileList');
    const collections = await this.call('GetSceneCollectionList');
    if (!profiles.profiles.includes(COLLECTION) || !collections.sceneCollections.includes(COLLECTION)) throw new Error('Сначала настройте OBS в пульте');
    if (profiles.currentProfileName !== COLLECTION) await this.call('SetCurrentProfile', { profileName: COLLECTION });
    if (collections.currentSceneCollectionName !== COLLECTION) await this.call('SetCurrentSceneCollection', { sceneCollectionName: COLLECTION });
    await delay(400);
    await this.setRecordDirectory(recordDirectory);
    const choices = await this.choices();
    config = { ...config };
    if (audioMode === 'platform') config.telemost = config.platform;
    if (audioMode === 'telemost') {
      const call = choices.telemost.find((item) => item.itemEnabled && /телемост/i.test(item.itemName));
      if (call) config.telemost = call.itemValue;
    }
    for (const [key, label] of [['platform', 'платформы'], ['telemost', 'звука разговора'], ['mic', 'микрофона']]) {
      if (!choices[key].some((item) => item.itemEnabled && item.itemValue === config[key])) {
        throw new Error(`Не найден источник ${label}. Откройте нужное окно и проверьте выбор в пульте.`);
      }
    }
    await this.configure(config);
  }
  async setRecordDirectory(recordDirectory) {
    await this.assertCollection();
    if (!recordDirectory || !path.isAbsolute(recordDirectory)) throw new Error('Выберите абсолютный путь к папке записей');
    // Never fall back to another drive if the configured drive is unavailable.
    fs.mkdirSync(recordDirectory, { recursive: true });
    for (const [parameterCategory, parameterName] of [['SimpleOutput', 'FilePath'], ['AdvOut', 'RecFilePath']]) {
      await this.call('SetProfileParameter', { parameterCategory, parameterName, parameterValue: recordDirectory });
    }
  }
  async setup(recordDirectory) {
    await this.launch();
    const recording = await this.call('GetRecordStatus');
    const stream = await this.call('GetStreamStatus');
    if (recording.outputActive || stream.outputActive) throw new Error('Сначала завершите текущую запись или трансляцию OBS');
    let profiles = await this.call('GetProfileList');
    if (!profiles.profiles.includes(COLLECTION)) {
      await this.call('CreateProfile', { profileName: COLLECTION });
      for (let i = 0; i < 30; i++) {
        profiles = await this.call('GetProfileList');
        if (profiles.profiles.includes(COLLECTION)) break;
        await delay(200);
      }
    }
    if (profiles.currentProfileName !== COLLECTION) await this.call('SetCurrentProfile', { profileName: COLLECTION });
    const collections = await this.call('GetSceneCollectionList');
    if (!collections.sceneCollections.includes(COLLECTION)) await this.call('CreateSceneCollection', { sceneCollectionName: COLLECTION });
    else if (collections.currentSceneCollectionName !== COLLECTION) await this.call('SetCurrentSceneCollection', { sceneCollectionName: COLLECTION });
    for (let i = 0; i < 30; i++) {
      const selected = await this.call('GetSceneCollectionList');
      if (selected.currentSceneCollectionName === COLLECTION) break;
      await delay(200);
    }
    await this.assertCollection();
    await this.call('SetVideoSettings', { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080, fpsNumerator: 30, fpsDenominator: 1 });
    await this.setRecordDirectory(recordDirectory);
    for (const [category, parameterName, parameterValue] of [
      ['Output', 'Mode', 'Simple'], ['SimpleOutput', 'RecFormat2', 'mkv'],
      ['SimpleOutput', 'RecEncoder', 'x264'], ['SimpleOutput', 'RecQuality', 'Small'], ['SimpleOutput', 'ABitrate', '160'],
      ['Output', 'FilenameFormatting', '%CCYY-%MM-%DD %hh-%mm-%ss'],
    ]) await this.call('SetProfileParameter', { parameterCategory: category, parameterName, parameterValue });
    const special = await this.call('GetSpecialInputs');
    for (const name of Object.values(special).filter(Boolean)) await this.call('SetInputMute', { inputName: name, inputMuted: true });
    const scenes = (await this.call('GetSceneList')).scenes.map((s) => s.sceneName);
    for (const sceneName of Object.values(SCENES)) if (!scenes.includes(sceneName)) await this.call('CreateScene', { sceneName });
    const inputs = (await this.call('GetInputList')).inputs.map((i) => i.inputName);
    for (const [inputName, inputKind, inputSettings, sceneName] of [
      [INPUTS.platform, 'window_capture', { priority: 0, method: 2, client_area: true, cursor: true, capture_audio: false }, SCENES.platform],
      [INPUTS.window, 'window_capture', { priority: 0, method: 2, client_area: true, cursor: true, capture_audio: false }, SCENES.window],
      [INPUTS.screen, 'monitor_capture', { monitor: 0, capture_cursor: true }, SCENES.screen],
      [INPUTS.mic, 'wasapi_input_capture', { device_id: 'default' }, SCENES.platform],
      [INPUTS.telemost, 'wasapi_process_output_capture', { priority: 0 }, SCENES.platform],
    ]) {
      if (!inputs.includes(inputName)) await this.call('CreateInput', { sceneName, inputName, inputKind, inputSettings, sceneItemEnabled: true });
    }
    for (const sceneName of [SCENES.window, SCENES.screen]) {
      const items = (await this.call('GetSceneItemList', { sceneName })).sceneItems;
      for (const sourceName of [INPUTS.mic, INPUTS.telemost]) {
        if (!items.some((item) => item.sourceName === sourceName)) await this.call('CreateSceneItem', { sceneName, sourceName, sceneItemEnabled: true });
      }
    }
    for (const inputName of [INPUTS.mic, INPUTS.telemost]) {
      await this.call('SetInputAudioMonitorType', { inputName, monitorType: 'OBS_MONITORING_TYPE_NONE' });
      await this.call('SetInputAudioTracks', { inputName, inputAudioTracks: { '1': true, '2': false, '3': false, '4': false, '5': false, '6': false } });
    }
    await this.select('platform');
  }
  async choices() {
    await this.assertCollection();
    const result = {};
    for (const [key, propertyName] of [['platform', 'window'], ['telemost', 'window'], ['mic', 'device_id'], ['screen', 'monitor_id']]) {
      try { result[key] = (await this.call('GetInputPropertiesListPropertyItems', { inputName: INPUTS[key], propertyName })).propertyItems; }
      catch { result[key] = []; }
    }
    return result;
  }
  async configure({ platform, telemost, mic, screen }) {
    await this.assertCollection();
    for (const [key, value, property] of [['platform', platform, 'window'], ['telemost', telemost, 'window'], ['mic', mic, 'device_id'], ['screen', screen, 'monitor_id']]) {
      if (value) await this.call('SetInputSettings', { inputName: INPUTS[key], inputSettings: { [property]: value }, overlay: true });
    }
    await this.fit('platform'); await this.fit('screen');
    this.audioWindow = telemost;
  }
  async fit(mode) {
    const sceneName = SCENES[mode]; const sourceName = INPUTS[mode];
    const { sceneItemId } = await this.call('GetSceneItemId', { sceneName, sourceName });
    await this.call('SetSceneItemTransform', { sceneName, sceneItemId, sceneItemTransform: {
      positionX: 0, positionY: 0, rotation: 0, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1920, boundsHeight: 1080, boundsAlignment: 0,
    } });
  }
  async select(mode, window) {
    await this.assertCollection();
    if (!SCENES[mode]) throw new Error('Неизвестный источник');
    if (mode === 'window') {
      if (!window) throw new Error('Сначала выберите окно программы в пульте');
      const choices = await this.choices();
      if (!choices.platform.some((item) => item.itemEnabled && item.itemValue === window)) throw new Error('Окно программы закрыто или свёрнуто. Откройте его и обновите список окон.');
      await this.call('SetInputSettings', { inputName: INPUTS.window, inputSettings: { window, priority: 0 }, overlay: true });
    }
    if (INPUTS[mode]) await this.fit(mode);
    await this.call('SetCurrentProgramScene', { sceneName: SCENES[mode] });
  }
  async preview() {
    const { currentProgramSceneName } = await this.call('GetCurrentProgramScene');
    return (await this.call('GetSourceScreenshot', { sourceName: currentProgramSceneName, imageFormat: 'jpeg', imageWidth: 640, imageCompressionQuality: 60 })).imageData;
  }
  async status() {
    await this.assertCollection();
    const recording = await this.call('GetRecordStatus');
    const scene = await this.call('GetCurrentProgramScene');
    return { ...recording, scene: scene.currentProgramSceneName, meters: (this.meters || []).filter((m) => [INPUTS.mic, INPUTS.telemost].includes(m.inputName)) };
  }
  async start(id) {
    await this.assertCollection();
    if ((await this.call('GetRecordStatus')).outputActive) throw new Error('В OBS уже идёт запись. Завершите её или восстановите текущую запись в пульте.');
    await this.select('platform');
    await this.call('SetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting', parameterValue: `lesson-${id}` });
    await this.call('StartRecord');
  }
  async stop() { await this.assertCollection(); return (await this.call('StopRecord')).outputPath; }
}
