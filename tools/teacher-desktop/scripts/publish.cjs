'use strict';
// Publish the immutable installer first; advance the update feed only after verification.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const yaml = createRequire(require.resolve('electron-updater'))('js-yaml');
const { UPDATE_FEED } = require('../updates.cjs');
const pkg = require('../package.json');
const repo = 'mentalist01/platform';
const tag = `teacher-desktop-v${pkg.version}`;
const directory = path.resolve(__dirname, '../../../output/teacher-desktop/release');
const installer = `IVAN100-Teacher-${pkg.version}-Setup.exe`;
const assetUrl = `https://github.com/${repo}/releases/download/${tag}/${installer}`;
const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const exists = releaseTag => { try { return JSON.parse(gh(['release', 'view', releaseTag, '--repo', repo, '--json', 'isDraft,assets'])); } catch { return null; } };

async function main() {
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Only explicit release versions can be published');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'tools/teacher-desktop', 'src/components/TeacherDesktopNotice.jsx']);
  const bytes = fs.readFileSync(path.join(directory, installer));
  const metadata = yaml.load(fs.readFileSync(path.join(directory, 'latest.yml'), 'utf8'));
  const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
  if (metadata.version !== pkg.version || metadata.files?.length !== 1 || metadata.files[0].url !== installer
    || metadata.files[0].sha512 !== sha512 || metadata.files[0].size !== bytes.length) throw new Error('Build metadata differs from installer');
  const notes = path.join(directory, 'release-notes.md');
  fs.writeFileSync(notes, `IVAN100 Учитель ${pkg.version} для Windows.\n\nАвтоматическая проверка новых версий, загрузка после урока и установка при обычном закрытии приложения. Запись и загрузка видео откладывают установку. Входы, настройки и файлы записей сохраняются.\n\nДля версий 0.1.0–0.1.1 нужно один раз установить эту версию вручную. Последующие выпуски будут приходить автоматически.\n`);
  let release = exists(tag);
  if (!release) {
    gh(['release', 'create', tag, '--repo', repo, '--target', revision, '--draft', '--prerelease', '--title', `IVAN100 Учитель ${pkg.version} — автоматические обновления`, '--notes-file', notes]);
    release = exists(tag);
  }
  if (release.isDraft) {
    gh(['release', 'upload', tag, '--repo', repo, path.join(directory, installer), path.join(directory, `${installer}.blockmap`), path.join(directory, 'latest.yml'), '--clobber']);
    gh(['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest=false']);
  }
  const response = await fetch(assetUrl, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Published installer unavailable: HTTP ${response.status}`);
  const downloaded = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('sha512').update(downloaded).digest('base64') !== sha512) throw new Error('Published installer checksum differs');
  const feed = path.join(directory, 'feed/latest.yml');
  fs.mkdirSync(path.dirname(feed), { recursive: true });
  fs.writeFileSync(feed, JSON.stringify({ ...metadata, path: assetUrl, files: [{ ...metadata.files[0], url: assetUrl }] }, null, 2) + '\n');
  const feedTag = 'teacher-desktop-updates';
  if (!exists(feedTag)) gh(['release', 'create', feedTag, '--repo', repo, '--target', revision, '--prerelease', '--latest=false', '--title', 'IVAN100 Учитель — канал обновлений', '--notes', 'Служебный канал автоматического обновления приложения. Установщик находится в выпуске с номером версии.']);
  gh(['release', 'upload', feedTag, '--repo', repo, feed, '--clobber']);
  const published = await fetch(`${UPDATE_FEED}/latest.yml`, { signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } });
  const actual = yaml.load(await published.text());
  if (!published.ok || actual.version !== pkg.version || actual.files?.[0]?.sha512 !== sha512 || actual.files[0].url !== assetUrl) throw new Error('Update feed verification failed');
  console.log(`Desktop ${pkg.version}: installer checksum and public update feed verified.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
