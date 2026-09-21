import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export function recordingPath(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^[a-z]:[\\/]/i.test(candidate) || /[<>"|?*\x00-\x1f]/.test(candidate) || candidate.slice(2).includes(':')) {
    throw new Error('Укажите папку на локальном диске, например D:\\Видео\\Ivan100 Lessons');
  }
  const normalized = path.win32.normalize(candidate);
  for (const part of normalized.slice(3).split('\\').filter(Boolean)) {
    if (/[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw new Error('Недопустимое имя папки Windows');
  }
  return normalized;
}

export function writableRecordingDirectory(value) {
  const directory = recordingPath(value);
  if (!fs.existsSync(path.win32.parse(directory).root)) throw new Error('Выбранный диск недоступен. Подключите его или выберите другой.');
  fs.mkdirSync(directory, { recursive: true });
  const probe = path.join(directory, `.ivan100-write-test-${crypto.randomUUID()}`);
  try { fs.writeFileSync(probe, 'ok', { flag: 'wx' }); }
  catch { throw new Error('Не удаётся записывать в эту папку. Выберите другую папку или проверьте права доступа.'); }
  finally { if (fs.existsSync(probe)) fs.unlinkSync(probe); }
  return directory;
}

export async function recordingDrives() {
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); @(Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -in 2,3 } | Select-Object DeviceID,FreeSpace,Size) | ConvertTo-Json -Compress'],
  { windowsHide: true, timeout: 10000, encoding: 'utf8' });
  const result = JSON.parse(stdout.replace(/^\uFEFF/, '') || '[]');
  return (Array.isArray(result) ? result : [result]).map(drive => ({ root: `${drive.DeviceID}\\`, free: Number(drive.FreeSpace), size: Number(drive.Size) }));
}

export function setupFingerprint(config) {
  return crypto.createHash('sha256').update(JSON.stringify(['recordDirectory', 'platform', 'telemost', 'mic', 'screen'].map(key => config[key] || ''))).digest('hex');
}

export function assertSetupIdle({ active, uploadingId, queueBusy, outputActive }) {
  if (active || uploadingId || queueBusy || outputActive) throw new Error('Менять настройку можно после окончания записи и загрузки. Текущий урок продолжает записываться.');
}
