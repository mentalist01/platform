import crypto from 'node:crypto';
import { SCENES, INPUTS } from './obs.mjs';

export class ShareBridge {
  constructor({ obs, api, active, enabled, now = Date.now, origin = 'http://127.0.0.1:18765' }) {
    Object.assign(this, { obs, api, active, enabled, now, origin });
    this.key = crypto.randomBytes(32).toString('base64url');
    this.offer = null; this.readyAt = 0; this.lastSuccess = 0; this.initialized = false;
  }
  async setup() {
    await this.obs.assertCollection();
    const scenes = (await this.obs.call('GetSceneList')).scenes;
    if (!scenes.some(s => s.sceneName === SCENES.share)) await this.obs.call('CreateScene', { sceneName: SCENES.share });
    const { baseWidth: width, baseHeight: height } = await this.obs.call('GetVideoSettings');
    const inputs = (await this.obs.call('GetInputList')).inputs;
    const inputSettings = { url: `${this.origin}/share-view#${this.key}`, width, height, fps: 30, reroute_audio: false, shutdown: false, restart_when_active: false };
    if (!inputs.some(i => i.inputName === INPUTS.share)) await this.obs.call('CreateInput', { sceneName: SCENES.share, inputName: INPUTS.share, inputKind: 'browser_source', inputSettings, sceneItemEnabled: true });
    else await this.obs.call('SetInputSettings', { inputName: INPUTS.share, inputSettings, overlay: true });
    const items = (await this.obs.call('GetSceneItemList', { sceneName: SCENES.share })).sceneItems;
    for (const sourceName of [INPUTS.mic, INPUTS.telemost]) {
      if (!items.some(i => i.sourceName === sourceName)) await this.obs.call('CreateSceneItem', { sceneName: SCENES.share, sourceName, sceneItemEnabled: true });
    }
    // An inactive Browser Source can suspend rendering. Keep it active outside
    // the platform canvas while negotiating, then show the dedicated scene.
    const platformItems = (await this.obs.call('GetSceneItemList', { sceneName: SCENES.platform })).sceneItems;
    let warm = platformItems.find(i => i.sourceName === INPUTS.share);
    if (!warm) warm = await this.obs.call('CreateSceneItem', { sceneName: SCENES.platform, sourceName: INPUTS.share, sceneItemEnabled: true });
    await this.obs.call('SetSceneItemTransform', { sceneName: SCENES.platform, sceneItemId: warm.sceneItemId, sceneItemTransform: { positionX: width + 10, positionY: height + 10 } });
    await this.obs.call('SetInputMute', { inputName: INPUTS.share, inputMuted: true });
    await this.obs.fit('share'); this.initialized = true;
  }
  async receive(payload) {
    if (!this.offer || payload.id !== this.offer.id) return;
    if (payload.answer) await this.api('/share', { id: payload.id, answer: payload.answer });
    if (payload.ready === true) this.readyAt = this.now();
    if (payload.ready === false) this.readyAt = 0;
  }
  async tick() {
    if (this.busy) return; this.busy = true;
    try {
      const active = this.active();
      if (active && !this.initialized && this.enabled()) await this.setup();
      if (!this.initialized) return;
      try {
        const next = active && this.enabled() ? await this.api('/share', {}) : null;
        this.lastSuccess = this.now();
        if (next?.id !== this.offer?.id) this.readyAt = 0;
        this.offer = next && next.jobId === (active.remoteJobId || active.id) ? next : null;
      } catch { if (this.now() - this.lastSuccess > 10000 && this.now() - this.readyAt >= 4000) { this.offer = null; this.readyAt = 0; } }
      const scene = (await this.obs.call('GetCurrentProgramScene')).currentProgramSceneName;
      const live = this.enabled() && active && this.offer && this.readyAt && this.now() - this.readyAt < 4000;
      // Pause and deliberate manual scene choices always take precedence.
      if (live && scene === SCENES.platform) await this.obs.select('share');
      if (!live && scene === SCENES.share) await this.obs.select('platform');
      this.message = this.offer && !live ? 'Подключаем демонстрацию к записи…' : live ? 'Записывается ваша демонстрация' : '';
    } finally { this.busy = false; }
  }
}
