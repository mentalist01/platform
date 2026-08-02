import { useCallback, useEffect, useRef, useState } from 'react';

import { api, authenticatedUploadsFetch } from '../services/api';

const CHECK_INTERVAL_MS = 3000;
const FILE_STABLE_MS = 1600;
const SOLVED_FOLDER_NAME = 'Решённые задания';

const normalizeFolderName = (value) => String(value || '')
  .trim()
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е');

const getFileFingerprint = (file) => `${Number(file?.lastModified) || 0}:${Number(file?.size) || 0}`;

const getWorkbookExtension = (name) => {
  const match = String(name || '').trim().match(/(\.[^.\\/]+)$/);
  return match ? match[1].toLowerCase() : '';
};

const buildSolutionName = (name) => {
  const sourceName = String(name || '').trim() || 'Таблица.ods';
  const extension = getWorkbookExtension(sourceName);
  const base = extension ? sourceName.slice(0, -extension.length) : sourceName;
  if (/решен/i.test(base)) return sourceName;
  return `${base} — решение${extension}`;
};

const getPickerTypes = (name) => {
  const extension = getWorkbookExtension(name);
  if (!extension) return [];
  const mime = extension === '.ods' || extension === '.ots' || extension === '.fods'
    ? 'application/vnd.oasis.opendocument.spreadsheet'
    : 'application/vnd.ms-excel';
  return [{
    description: 'Таблица Excel или LibreOffice',
    accept: { [mime]: [extension] },
  }];
};

const ensureSolvedFolder = async ({ taskNumber, category, studentId }) => {
  const findFolder = (items) => (Array.isArray(items) ? items : []).find((folder) => (
    String(folder?.studentId || '').trim() === String(studentId || '').trim()
    && !String(folder?.parentFolderId || '').trim()
    && normalizeFolderName(folder?.name) === normalizeFolderName(SOLVED_FOLDER_NAME)
  ));
  const folders = await api.getFolders(taskNumber, category, studentId);
  const existing = findFolder(folders);
  if (existing?.id) return existing;
  try {
    return await api.createFolder(taskNumber, category, SOLVED_FOLDER_NAME, studentId);
  } catch (error) {
    const refreshed = await api.getFolders(taskNumber, category, studentId);
    const concurrent = findFolder(refreshed);
    if (concurrent?.id) return concurrent;
    throw error;
  }
};

const buildState = (session, status, message, extra = {}) => ({
  active: Boolean(session),
  status,
  message,
  sourceFileId: String(session?.sourceFileId || ''),
  fileName: String(session?.localName || session?.remoteName || ''),
  remoteFileId: String(session?.remoteFileId || ''),
  lastSyncedAt: String(session?.lastSyncedAt || ''),
  ...extra,
});

const useWorkbookAutoSync = () => {
  const sessionRef = useRef(null);
  const [state, setState] = useState(() => buildState(null, 'idle', ''));

  const stopWorkbookAutoSync = useCallback(() => {
    sessionRef.current = null;
    setState(buildState(null, 'idle', ''));
  }, []);

  const checkWorkbook = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !session.handle || session.checking) return;
    session.checking = true;
    try {
      const localFile = await session.handle.getFile();
      const fingerprint = getFileFingerprint(localFile);
      if (fingerprint === session.lastUploadedFingerprint) {
        session.pendingFingerprint = '';
        session.pendingSince = 0;
        return;
      }
      if (fingerprint !== session.pendingFingerprint) {
        session.pendingFingerprint = fingerprint;
        session.pendingSince = Date.now();
        setState(buildState(session, 'watching', 'Изменения найдены — ждём завершения сохранения…'));
        return;
      }
      if (Date.now() - session.pendingSince < FILE_STABLE_MS) return;

      setState(buildState(session, 'syncing', 'Отправляем сохранение в конспекты…'));
      const bytes = await localFile.arrayBuffer();
      const uploadFile = new File([bytes], session.remoteName, {
        type: localFile.type || session.mimeType || 'application/octet-stream',
        lastModified: localFile.lastModified,
      });
      let storedFile;
      if (session.remoteFileId) {
        storedFile = await api.replaceFileContent(session.remoteFileId, uploadFile, {
          source: 'workbook-auto-sync',
          memory: {
            kind: 'workbook-solution',
            title: session.solutionTitle,
            description: 'Автосохранение из Excel или LibreOffice',
          },
        });
      } else {
        const folder = await ensureSolvedFolder(session);
        storedFile = await api.uploadFile(
          uploadFile,
          session.taskNumber,
          session.category,
          folder.id,
          session.studentId,
          {
            source: 'workbook-auto-sync',
            memory: {
              kind: 'workbook-solution',
              title: session.solutionTitle,
              description: 'Автосохранение из Excel или LibreOffice',
              tags: ['Таблица', 'Автосохранение'],
            },
          }
        );
      }
      if (sessionRef.current !== session) return;
      session.remoteFileId = String(storedFile?.id || session.remoteFileId || '').trim();
      session.lastUploadedFingerprint = fingerprint;
      session.pendingFingerprint = '';
      session.pendingSince = 0;
      session.lastSyncedAt = new Date().toISOString();
      setState(buildState(session, 'saved', 'Сохранено в конспекты'));
    } catch (error) {
      if (sessionRef.current !== session) return;
      const message = String(error?.message || '').trim();
      setState(buildState(
        session,
        'error',
        /permission|разреш|notallowed/i.test(message)
          ? 'Нет доступа к файлу. Подключите его заново.'
          : (message || 'Не удалось синхронизировать файл')
      ));
    } finally {
      session.checking = false;
    }
  }, []);

  const startWorkbookAutoSync = useCallback(async ({
    sourceFile,
    sourceUrl,
    studentId,
    taskNumber,
    category,
  } = {}) => {
    if (typeof window === 'undefined' || typeof window.showSaveFilePicker !== 'function') {
      setState(buildState(null, 'unsupported', 'Для быстрого запуска используйте Chrome или Edge.'));
      return { ok: false, unsupported: true };
    }
    const normalizedTaskNumber = Number(taskNumber);
    const normalizedStudentId = String(studentId || '').trim();
    const normalizedCategory = String(category || 'class').trim() || 'class';
    const sourceName = String(sourceFile?.name || '').trim() || 'Таблица.ods';
    const normalizedSourceUrl = String(sourceUrl || '').trim();
    if (!normalizedSourceUrl || !normalizedStudentId || !Number.isFinite(normalizedTaskNumber)) {
      const error = new Error('Не удалось определить файл или задание');
      setState(buildState(null, 'error', error.message));
      return { ok: false, error };
    }

    const suggestedName = buildSolutionName(sourceName);
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        id: 'ivan-ege-workbook-desktop',
        startIn: 'desktop',
        suggestedName,
        types: getPickerTypes(suggestedName),
        excludeAcceptAllOption: false,
      });
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, cancelled: true };
      setState(buildState(null, 'error', error?.message || 'Не удалось сохранить рабочий файл'));
      return { ok: false, error };
    }
    const localName = String(handle?.name || suggestedName).trim() || suggestedName;
    const preparingSession = {
      handle,
      sourceFileId: String(sourceFile?.id || '').trim(),
      sourceName,
      localName,
      remoteName: localName,
      solutionTitle: localName.replace(/\.[^.]+$/, ''),
      sourceUrl: normalizedSourceUrl,
      studentId: normalizedStudentId,
      taskNumber: normalizedTaskNumber,
      category: normalizedCategory,
      mimeType: String(sourceFile?.type || '').trim(),
      remoteFileId: '',
      lastSyncedAt: '',
      lastUploadedFingerprint: '',
      pendingFingerprint: '',
      pendingSince: 0,
      checking: true,
    };
    sessionRef.current = preparingSession;
    setState(buildState(preparingSession, 'preparing', 'Готовим рабочий файл…'));
    try {
      const response = await authenticatedUploadsFetch(preparingSession.sourceUrl);
      if (!response.ok) throw new Error('Не удалось скачать исходный файл');
      const sourceBlob = await response.blob();
      preparingSession.mimeType = sourceBlob.type || preparingSession.mimeType;
      if (sessionRef.current !== preparingSession) return { ok: false, cancelled: true };
      const writable = await handle.createWritable();
      try {
        await writable.write(sourceBlob);
      } finally {
        await writable.close();
      }
      const localFile = await handle.getFile();
      if (sessionRef.current !== preparingSession) return { ok: false, cancelled: true };
      preparingSession.lastUploadedFingerprint = getFileFingerprint(localFile);
      preparingSession.checking = false;
      setState(buildState(
        preparingSession,
        'watching',
        'Файл сохранён. Откройте его с Рабочего стола — сохранения загрузятся сами.'
      ));
      return { ok: true, fileName: preparingSession.localName };
    } catch (error) {
      if (sessionRef.current === preparingSession) {
        sessionRef.current = null;
        setState(buildState(null, 'error', error?.message || 'Не удалось подготовить рабочий файл'));
      }
      return { ok: false, error };
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => void checkWorkbook(), CHECK_INTERVAL_MS);
    const checkNow = () => void checkWorkbook();
    window.addEventListener('focus', checkNow);
    document.addEventListener('visibilitychange', checkNow);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkNow);
      document.removeEventListener('visibilitychange', checkNow);
      sessionRef.current = null;
    };
  }, [checkWorkbook]);

  return {
    workbookAutoSyncState: state,
    startWorkbookAutoSync,
    stopWorkbookAutoSync,
  };
};

export default useWorkbookAutoSync;
