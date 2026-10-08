import { buildDownloadUrl } from './downloadUrl.js';

// Fetch through the existing authenticated file API, then save its exact bytes.
// Keep the Blob URL alive long enough for Safari to start the download.
export const downloadAuthenticatedFile = async ({
  url,
  name,
  fetchFile,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  schedule = globalThis.setTimeout,
}) => {
  const downloadUrl = buildDownloadUrl(url);
  if (!downloadUrl || typeof fetchFile !== 'function') throw new Error('Не удалось определить файл для скачивания.');
  const response = await fetchFile(downloadUrl);
  if (!response.ok) throw new Error(`Не удалось скачать файл (${response.status}). Попробуйте снова.`);
  const blob = await response.blob();
  const objectUrl = urlApi.createObjectURL(blob);
  const link = documentRef.createElement('a');
  const fileName = [...String(name || 'Файл').split(/[\\/]/).pop()].filter(character => character.charCodeAt(0) >= 32).join('').trim() || 'Файл';
  try {
    link.href = objectUrl;
    link.download = fileName;
    link.rel = 'noopener';
    documentRef.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    schedule(() => urlApi.revokeObjectURL(objectUrl), 60_000);
  }
};
