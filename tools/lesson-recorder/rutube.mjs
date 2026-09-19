import path from 'node:path';

export function privateVideo(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/(?:video\/private|play\/embed)\/([a-f0-9]{32})\/?$/i);
    const p = url.searchParams.get('p');
    if (url.protocol !== 'https:' || !['rutube.ru', 'www.rutube.ru'].includes(url.hostname)
      || url.username || url.password || url.port || !match || !/^[a-z0-9_-]{1,256}$/i.test(p || '')) return null;
    return { id: match[1], p, url: `https://rutube.ru/video/private/${match[1]}/?p=${encodeURIComponent(p)}` };
  } catch { return null; }
}

export async function videoReady(value) {
  const video = privateVideo(value);
  if (!video) throw new Error('Нужна полная ссылка «только по ссылке», включая ?p=');
  const response = await fetch(`https://rutube.ru/api/play/options/${video.id}/?p=${encodeURIComponent(video.p)}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) return false;
  const payload = await response.json();
  return Boolean(payload.video_balancer && Object.values(payload.video_balancer).some((entry) => typeof entry === 'string' && entry.startsWith('https://')));
}

// Uses a separate browser profile. No passwords or browser cookies are copied from other apps.
// On uncertain upload outcomes the queue stops for review instead of uploading a second copy.
export class RutubeUploader {
  constructor(directory) { this.directory = directory; }
  async browser() {
    if (this.context) return this.context;
    const { chromium } = await import('playwright');
    this.context = await chromium.launchPersistentContext(path.join(this.directory, 'rutube-browser'), {
      channel: 'msedge', headless: false, viewport: { width: 1280, height: 850 },
    });
    this.context.on('close', () => { this.context = null; this.page = null; });
    this.page = this.context.pages()[0] || await this.context.newPage();
    this.page.setDefaultTimeout(15000);
    return this.context;
  }
  async login() {
    await this.browser(); await this.page.goto('https://studio.rutube.ru/videos'); await this.page.bringToFront();
  }
  async upload(job, persist) {
    await this.browser();
    const page = this.page;
    await page.goto('https://studio.rutube.ru/videos');
    await page.getByTestId('header-add-button').waitFor({ timeout: 30000 }).catch(() => {
      throw new Error('Войдите в Rutube в окне помощника, затем нажмите «Продолжить загрузку»');
    });
    const title = `${job.title.slice(0, 55)} [${job.id}]`;
    // Rutube renders clickable <a> titles without href, so they have no Playwright link role.
    const existing = page.getByText(title, { exact: true }).or(
      page.getByText(path.basename(job.mp4, '.mp4').slice(0, 100), { exact: true })
    );
    // The header appears before the video list. Wait for a prior upload to render.
    if (job.uploadStarted) await existing.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {
      throw new Error('Загрузка уже начиналась. Найдите ролик в Rutube и вставьте его закрытую ссылку в пульт; повторная копия не создаётся.');
    });
    if (await existing.count()) {
      await existing.click();
    } else {
      if (job.uploadStarted) throw new Error('Загрузка уже начиналась. Проверьте ролик в Rutube и вставьте его закрытую ссылку в пульт; повторная копия не создаётся.');
      await page.getByTestId('header-add-button').click();
      await page.getByText('Загрузить видео или Shorts', { exact: true }).click();
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Выбрать файлы', exact: true }).first().click();
      const chooser = await chooserPromise;
      job.uploadStarted = true; persist();
      await chooser.setFiles(job.mp4);
    }
    const editor = page.getByTestId('video-editor-layout');
    await editor.waitFor({ state: 'visible', timeout: 60000 });
    await editor.getByRole('textbox', { name: 'Название', exact: true }).fill(title);
    // The UI defaults can change. Require explicit private selection before saving.
    const access = editor.getByRole('combobox', { name: 'Доступ', exact: true });
    if ((await access.innerText()).trim() !== 'Только по ссылке') {
      await access.click();
      await page.getByRole('list').getByText('Только по ссылке', { exact: true }).click();
    }
    if ((await access.innerText()).trim() !== 'Только по ссылке') throw new Error('Не удалось установить доступ «только по ссылке». Проверьте окно Rutube.');
    const link = editor.locator('a[href*="rutube.ru/video/private/"]');
    await link.waitFor({ timeout: 60000 });
    const video = privateVideo(await link.getAttribute('href'));
    if (!video) throw new Error('Rutube не выдал закрытую ссылку. Файл сохранён, проверьте окно загрузки.');
    job.candidateUrl = video.url; persist();
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click({ timeout: 4 * 3600_000 });
    await editor.waitFor({ state: 'hidden', timeout: 60000 });
    job.url = video.url; job.status = 'processing'; job.error = ''; persist();
    return video.url;
  }
}
