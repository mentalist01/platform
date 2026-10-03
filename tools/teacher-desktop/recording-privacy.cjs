'use strict';
const SCENE = 'IVAN100 — Подготовка материалов';
const TEXT = 'IVAN100: подготовка материалов';
const MESSAGE = 'Преподаватель готовит материалы';
const AUDIO = ['IVAN100: микрофон', 'IVAN100: Телемост'];
const CAPTURES = ['IVAN100: платформа', 'IVAN100: программа', 'IVAN100: монитор', 'IVAN100: LibreOffice', 'IVAN100: демонстрация'];
const FILTER = 'IVAN100: скрыть личные разделы';
const http = require('node:http');

function readRecording() {
  return new Promise((resolve, reject) => {
    const request = http.get('http://127.0.0.1:18765/state', response => {
      let text = '';
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Неизвестное состояние записи')); return; }
      response.on('data', chunk => { text += chunk; if (text.length > 1024 * 1024) request.destroy(new Error('Некорректное состояние записи')); });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const state = JSON.parse(text);
          if (!Array.isArray(state.jobs)) throw new Error('Неизвестное состояние записи');
          resolve(Boolean(state.obs?.outputActive || state.jobs.some(job => ['starting', 'recording', 'stopping'].includes(job.status))));
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(1500, () => request.destroy(new Error('Пульт не отвечает')));
    request.on('error', error => error.code === 'ECONNREFUSED' ? resolve(false) : reject(error));
  });
}

// OBS alone changes; capture filters prevent another automatic scene from revealing a private window.
class RecordingPrivacy {
  constructor({ getObs, isRecording }) {
    Object.assign(this, { getObs, isRecording });
    this.reasons = new Set(); this.queue = Promise.resolve(); this.restoreScene = null; this.maskedSources = new Set();
  }
  set(reason, hidden) {
    const action = this.queue.catch(() => {}).then(() => this.change(reason, hidden));
    this.queue = action;
    return action;
  }
  async change(reason, hidden) {
    if (hidden) {
      // Confirm on every entry, even if another private panel is already open.
      const recording = await this.isRecording();
      let obs;
      try { obs = await this.getObs(); await obs.assertCollection(); }
      catch (error) {
        if (recording) throw error;
        this.reasons.add(reason); this.watch();
        return { hidden: true, recording: false };
      }
      const current = (await obs.call('GetCurrentProgramScene')).currentProgramSceneName;
      if (current === SCENE && this.maskedSources.size) {
        this.reasons.add(reason); this.watch(); return { hidden: true, recording };
      }
      await this.maskCaptures(obs);
      if (current !== SCENE && current !== 'IVAN100 — Перерыв') {
        await this.prepare(obs);
        await this.switchScene(obs, SCENE);
        this.restoreScene = current;
      } else if (!this.restoreScene) this.restoreScene = current === SCENE ? 'IVAN100 — Платформа' : current;
      this.reasons.add(reason);
      this.watch();
      return { hidden: true, recording };
    }
    this.reasons.delete(reason);
    if (!this.reasons.size) { clearInterval(this.timer); this.timer = null; }
    if (this.reasons.size || (!this.restoreScene && !this.maskedSources.size)) return { hidden: this.reasons.size > 0 };
    const obs = await this.getObs();
    await obs.assertCollection();
    const { inputs } = await obs.call('GetInputList');
    for (const sourceName of CAPTURES.filter(name => inputs.some(input => input.inputName === name))) {
      const { filters } = await obs.call('GetSourceFilterList', { sourceName });
      if (filters.some(filter => filter.filterName === FILTER) || this.maskedSources.has(sourceName)) await obs.call('SetSourceFilterEnabled', { sourceName, filterName: FILTER, filterEnabled: false });
    }
    this.maskedSources.clear();
    // A deliberate manual choice in the recorder takes precedence over restoration.
    if ((await obs.call('GetCurrentProgramScene')).currentProgramSceneName === SCENE) {
      await this.switchScene(obs, this.restoreScene);
    }
    this.restoreScene = null;
    return { hidden: false };
  }
  watch() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.watching || !this.reasons.size) return;
      this.watching = true;
      const action = this.queue.catch(() => {}).then(async () => {
        const reason = this.reasons.values().next().value;
        if (reason) await this.change(reason, true);
      });
      this.queue = action;
      void action.catch(() => {}).finally(() => { this.watching = false; });
    }, 500);
    this.timer.unref?.();
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  async maskCaptures(obs) {
    const { inputs } = await obs.call('GetInputList');
    for (const sourceName of CAPTURES.filter(name => inputs.some(input => input.inputName === name))) {
      const { filters } = await obs.call('GetSourceFilterList', { sourceName });
      this.maskedSources.add(sourceName);
      if (!filters.some(filter => filter.filterName === FILTER)) {
        await obs.call('CreateSourceFilter', { sourceName, filterName: FILTER, filterKind: 'color_filter_v2', filterSettings: { opacity: 0 } });
      } else await obs.call('SetSourceFilterSettings', { sourceName, filterName: FILTER, filterSettings: { opacity: 0 }, overlay: true });
      await obs.call('SetSourceFilterEnabled', { sourceName, filterName: FILTER, filterEnabled: true });
      const result = await obs.call('GetSourceFilter', { sourceName, filterName: FILTER });
      if (!result.filterEnabled || Number(result.filterSettings?.opacity) !== 0) throw new Error('OBS не подтвердил скрытие источника');
    }
  }
  async switchScene(obs, sceneName) {
    const list = await obs.call('GetSceneTransitionList');
    const cut = list.transitions.find(transition => transition.transitionKind === 'cut_transition');
    if (!cut) throw new Error('В OBS недоступно мгновенное переключение');
    await obs.call('SetCurrentSceneTransition', { transitionName: cut.transitionName });
    try {
      if (sceneName === SCENE) await obs.call('SetSceneSceneTransitionOverride', { sceneName, transitionName: cut.transitionName });
      await obs.call('SetCurrentProgramScene', { sceneName });
      const confirmed = (await obs.call('GetCurrentProgramScene')).currentProgramSceneName;
      if (confirmed !== sceneName) throw new Error('OBS не подтвердил защиту записи');
    } finally {
      if (list.currentSceneTransitionName && list.currentSceneTransitionName !== cut.transitionName) await obs.call('SetCurrentSceneTransition', { transitionName: list.currentSceneTransitionName });
    }
  }
  async prepare(obs) {
    const scenes = (await obs.call('GetSceneList')).scenes;
    if (!scenes.some(scene => scene.sceneName === SCENE)) await obs.call('CreateScene', { sceneName: SCENE });
    const inputs = (await obs.call('GetInputList')).inputs;
    const settings = { text: MESSAGE, font: { face: 'Segoe UI', size: 48, flags: 0 }, color: 0x00ffffff, opacity: 100, bk_opacity: 0, outline: false };
    if (!inputs.some(input => input.inputName === TEXT)) {
      const { inputKinds } = await obs.call('GetInputKindList', { unversioned: false });
      const inputKind = ['text_gdiplus_v3', 'text_gdiplus_v2', 'text_gdiplus'].find(kind => inputKinds.includes(kind));
      if (!inputKind) throw new Error('В OBS недоступен текст заглушки');
      await obs.call('CreateInput', { sceneName: SCENE, inputName: TEXT, inputKind, inputSettings: settings, sceneItemEnabled: true });
    } else await obs.call('SetInputSettings', { inputName: TEXT, inputSettings: settings, overlay: true });
    const items = (await obs.call('GetSceneItemList', { sceneName: SCENE })).sceneItems;
    for (const item of items) await obs.call('SetSceneItemEnabled', { sceneName: SCENE, sceneItemId: item.sceneItemId, sceneItemEnabled: [TEXT, ...AUDIO].includes(item.sourceName) });
    for (const name of [TEXT, ...AUDIO]) {
      if (name !== TEXT && !inputs.some(input => input.inputName === name)) throw new Error('Звук урока не настроен в OBS');
      if (!items.some(item => item.sourceName === name)) await obs.call('CreateSceneItem', { sceneName: SCENE, sourceName: name, sceneItemEnabled: true });
    }
    const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName: SCENE, sourceName: TEXT });
    const { baseWidth, baseHeight } = await obs.call('GetVideoSettings');
    await obs.call('SetSceneItemTransform', { sceneName: SCENE, sceneItemId, sceneItemTransform: {
      positionX: baseWidth / 2, positionY: baseHeight / 2, alignment: 0,
      boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: baseWidth * .8, boundsHeight: baseHeight * .2, boundsAlignment: 0,
    } });
    // No window/browser/screen source is ever added to this scene.
    await obs.call('SetSceneItemEnabled', { sceneName: SCENE, sceneItemId, sceneItemEnabled: true });
  }
}
module.exports = { RecordingPrivacy, SCENE, MESSAGE, readRecording };
