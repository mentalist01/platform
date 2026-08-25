const DEFAULT_WORKBOOK_HELPER_INSTALL_URL = '/downloads/IvanEgeWorkbookHelper.exe';

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

export const WORKBOOK_HELPER_INSTALL_URL = resolveWorkbookHelperInstallUrl(
  configuredInstallUrl === undefined ? DEFAULT_WORKBOOK_HELPER_INSTALL_URL : configuredInstallUrl
);

export const WORKBOOK_HELPER_INSTALL_IS_DOWNLOAD = /\.exe(?:$|[?#])/i.test(
  WORKBOOK_HELPER_INSTALL_URL
);
