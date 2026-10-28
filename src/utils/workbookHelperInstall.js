export const WORKBOOK_HELPER_WINDOWS_ZIP_URL = '/downloads/IvanEgeWorkbookHelper.zip?v=1.5.5.0';
export const WORKBOOK_HELPER_INFORMATION_URL = '/workbook-helper/';
const DEFAULT_WORKBOOK_HELPER_INSTALL_URL = WORKBOOK_HELPER_WINDOWS_ZIP_URL;
export const WORKBOOK_HELPER_MAC_INSTALL_URL = '/assets/IVAN100-WorkbookHelper-Mac-0.1.0.zip';

export const resolveWorkbookHelperInstallUrl = (value) => {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (/^\/(?!\/)/.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const configuredInstallUrl = typeof import.meta !== 'undefined'
  ? import.meta.env?.VITE_WORKBOOK_HELPER_INSTALL_URL
  : undefined;

export const resolveWorkbookHelperWindowsInstallUrl = (value) => resolveWorkbookHelperInstallUrl(
  value === undefined || ['/downloads/IvanEgeWorkbookHelper.exe', '/downloads/IvanEgeWorkbookHelper.zip'].includes(value) ? DEFAULT_WORKBOOK_HELPER_INSTALL_URL : value
);

export const WORKBOOK_HELPER_INSTALL_URL = resolveWorkbookHelperWindowsInstallUrl(configuredInstallUrl);

export const WORKBOOK_HELPER_INSTALL_IS_DOWNLOAD = /\.(?:exe|zip)(?:$|[?#])/i.test(
  WORKBOOK_HELPER_INSTALL_URL
);

export const getWorkbookHelperPlatform = (device = typeof navigator === 'undefined' ? {} : navigator) => {
  const platform = String(device.userAgentData?.platform || device.platform || '').toLowerCase();
  const userAgent = String(device.userAgent || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent) || /mac/.test(platform) && Number(device.maxTouchPoints) > 1) return 'ios';
  if (/android/.test(userAgent) || /android/.test(platform)) return 'android';
  if (/win/.test(platform) || /windows/.test(userAgent)) return 'windows';
  if (/mac/.test(platform) || /macintosh|mac os x/.test(userAgent)) return 'mac';
  if (/linux/.test(platform) || /linux/.test(userAgent)) return 'linux';
  return 'unknown';
};

export const isWorkbookHelperSupported = (device) => ['windows', 'mac'].includes(getWorkbookHelperPlatform(device));

export const getWorkbookHelperInstall = (device) => {
  const platform = getWorkbookHelperPlatform(device);
  if (platform === 'mac') return {
    platform,
    supported: true,
    url: WORKBOOK_HELPER_MAC_INSTALL_URL,
    isDownload: true,
    label: 'Скачать помощник для Mac',
    badge: 'Тестовая версия macOS',
    saveShortcut: 'Cmd+S',
    instructions: 'Распакуйте ZIP и запустите «Установить.command». Подтвердите запуск средствами macOS, затем нажмите «Excel / LibreOffice» на платформе. Нужен установленный Excel или LibreOffice. Можно также просто скачать таблицу.',
  };
  if (platform === 'windows') return {
    platform,
    supported: true,
    url: WORKBOOK_HELPER_INSTALL_URL,
    isDownload: WORKBOOK_HELPER_INSTALL_IS_DOWNLOAD,
    label: WORKBOOK_HELPER_INSTALL_IS_DOWNLOAD
      ? /\.zip(?:$|[?#])/i.test(WORKBOOK_HELPER_INSTALL_URL) ? 'Скачать помощник · ZIP' : 'Установить помощник'
      : 'Установить из Microsoft Store',
    badge: 'Для Windows',
    saveShortcut: 'Ctrl+S',
    informationUrl: WORKBOOK_HELPER_INFORMATION_URL,
    instructions: WORKBOOK_HELPER_INSTALL_IS_DOWNLOAD
      ? /\.zip(?:$|[?#])/i.test(WORKBOOK_HELPER_INSTALL_URL)
        ? 'Скачайте ZIP, нажмите «Извлечь всё» и запустите IvanEgeWorkbookHelper.exe. Перед обновлением сохраните таблицу и выберите «Выход» в значке старого помощника возле часов. Подробности установки и сведения о подписи — на странице помощника.'
        : 'Запустите установщик помощника. Сведения об установке и подписи доступны на странице помощника.'
      : 'Установка и обновления выполняются через Microsoft Store.',
  };
  return { platform, supported: false, url: '', isDownload: false, label: '', badge: 'Скачать и открыть', saveShortcut: '', instructions: '' };
};

export const getWorkbookHelperUnsupportedMessage = (device) => (
  getWorkbookHelperPlatform(device) === 'mac'
    ? 'На Mac можно установить тестовую версию помощника или нажать «Скачать», открыть таблицу в Excel или LibreOffice, сохранить через Cmd+S и загрузить готовый файл в конспекты.'
    : 'Помощник доступен для Windows и macOS. На этом устройстве скачайте файл, откройте его в приложении для таблиц и загрузите сохранённое решение в конспекты.'
);
