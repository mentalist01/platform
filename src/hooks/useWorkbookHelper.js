import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../services/api';
import { getExternalApiOrigin } from '../utils/runtimeUrls';
import { getWorkbookHelperInstall, getWorkbookHelperUnsupportedMessage } from '../utils/workbookHelperInstall';

const FALLBACK_HINT_DELAY_MS = 1800;

const buildState = (status = 'idle', extra = {}) => ({
  sourceFileId: '',
  fileName: '',
  message: '',
  ...extra,
  status,
});

const useWorkbookHelper = () => {
  const fallbackTimerRef = useRef(null);
  const protocolObservationCleanupRef = useRef(null);
  const [state, setState] = useState(() => buildState());

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const clearProtocolObservation = useCallback(() => {
    protocolObservationCleanupRef.current?.();
    protocolObservationCleanupRef.current = null;
  }, []);

  const launchWorkbookHelper = useCallback(async ({ sourceFile, questionContext = null, studentId = '' } = {}) => {
    const sourceFileId = String(sourceFile?.id || '').trim();
    const fileName = String(sourceFile?.name || '').trim();
    const launchMode = questionContext?.startFresh === true ? 'fresh' : 'continue';
    const solutionFileId = String(questionContext?.solutionFileId || '').trim();
    if (!sourceFileId) {
      const error = new Error('Не удалось определить таблицу');
      setState(buildState('error', { message: error.message }));
      return { ok: false, error };
    }

    clearFallbackTimer();
    clearProtocolObservation();
    const helperInstall = getWorkbookHelperInstall();
    if (!helperInstall.supported) {
      setState(buildState('unsupported', { sourceFileId, fileName, message: getWorkbookHelperUnsupportedMessage() }));
      return { ok: false, unsupported: true };
    }
    setState(buildState('launching', {
      sourceFileId,
      fileName,
      launchMode,
      solutionFileId,
      message: 'Готовим файл для открытия…',
    }));
    try {
      const payload = questionContext
        ? await api.launchQuestionWorkbookHelper(questionContext)
        : await api.launchWorkbookHelper(sourceFileId, studentId);
      const ticket = String(payload?.ticket || '').trim();
      const origin = getExternalApiOrigin();
      if (!ticket || !origin) throw new Error('Сервер не выдал ссылку для помощника');

      const query = new URLSearchParams({ origin, ticket });
      const deepLink = `ivan-ege://workbook/open?${query.toString()}`;
      setState(buildState('opening', {
        sourceFileId,
        fileName: String(payload?.fileName || payload?.suggestedName || fileName).trim(),
        launchMode,
        solutionFileId,
        message: payload?.opensSourceText
          ? `Открываем текст в ${helperInstall.platform === 'mac' ? 'TextEdit' : 'Блокноте'} и пустую таблицу в Excel или LibreOffice…`
          : 'Открываем файл в Excel или LibreOffice…',
        expiresAt: String(payload?.expiresAt || ''),
      }));
      const markAsOpened = () => {
        if (document.visibilityState !== 'hidden') return;
        clearFallbackTimer();
        clearProtocolObservation();
        setState((current) => (
          current.sourceFileId === sourceFileId && current.status === 'opening'
            ? buildState('opened', {
                ...current,
                message: payload?.opensSourceText
                  ? `Текст открыт в ${helperInstall.platform === 'mac' ? 'TextEdit' : 'Блокноте'}, пустая таблица — в Excel или LibreOffice.`
                  : questionContext?.studentId
                    ? `Сохраняйте таблицу в Excel или LibreOffice (${helperInstall.saveShortcut}). Ваше решение появится под заданием и сразу будет доступно ученику.`
                  : 'Помощник открыт — сохранения будут появляться в конспектах автоматически.',
              })
            : current
        ));
      };
      document.addEventListener('visibilitychange', markAsOpened);
      protocolObservationCleanupRef.current = () => {
        document.removeEventListener('visibilitychange', markAsOpened);
      };
      fallbackTimerRef.current = window.setTimeout(() => {
        fallbackTimerRef.current = null;
        clearProtocolObservation();
        setState((current) => (
          current.sourceFileId === sourceFileId && current.status === 'opening'
            ? buildState('fallback', {
                ...current,
                message: questionContext?.studentId
                  ? 'Если таблица не открылась, установите помощник Excel и LibreOffice и попробуйте снова.'
                  : 'Не открылось? Установите помощник для вашего устройства или выберите «В браузере». Можно также скачать таблицу.',
              })
            : current
        ));
      }, FALLBACK_HINT_DELAY_MS);
      window.location.assign(deepLink);
      return { ok: true, deepLink, payload };
    } catch (error) {
      clearFallbackTimer();
      clearProtocolObservation();
      const message = String(error?.message || '').trim() || 'Не удалось открыть помощник';
      setState(buildState('error', {
        sourceFileId,
        fileName,
        launchMode,
        solutionFileId,
        message,
      }));
      return { ok: false, error };
    }
  }, [clearFallbackTimer, clearProtocolObservation]);

  useEffect(() => () => {
    clearFallbackTimer();
    clearProtocolObservation();
  }, [clearFallbackTimer, clearProtocolObservation]);

  return {
    workbookHelperState: state,
    launchWorkbookHelper,
  };
};

export default useWorkbookHelper;
