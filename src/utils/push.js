import { Capacitor, registerPlugin } from '@capacitor/core';

const PUSH_SW_URL = '/sw-push.js';
const NATIVE_PUSH_STATUS_TIMEOUT_MS = 8000;
const NATIVE_PUSH_PERMISSION_TIMEOUT_MS = 15000;
const NATIVE_PUSH_ENABLE_TIMEOUT_MS = 20000;
const NATIVE_PUSH_DISABLE_TIMEOUT_MS = 12000;
const NATIVE_PUSH_LAUNCH_URL_TIMEOUT_MS = 5000;
let pushRegistrationPromise = null;
const RuStorePush = registerPlugin('RuStorePush');

const withNativePluginTimeout = async (promise, timeoutMs, fallbackMessage) => {
  let timerId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timerId = window.setTimeout(() => {
          reject(new Error(fallbackMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timerId) {
      window.clearTimeout(timerId);
    }
  }
};

export const isNativeAndroidPushEnvironment = () => (
  Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === 'android'
);

const isBrowserPushSupported = () => (
  typeof window !== 'undefined'
  && typeof navigator !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window
);

const normalizeNativePermission = (value) => {
  const permission = String(value || '').trim().toLowerCase();
  if (permission === 'granted' || permission === 'denied') return permission;
  return 'default';
};

export const getNativePushStatus = async () => {
  if (!isNativeAndroidPushEnvironment()) {
    return {
      supported: false,
      configured: false,
      available: false,
      permission: 'default',
      token: '',
      reason: '',
      lastError: '',
      messageData: null,
      launchUrl: '',
    };
  }
  const status = await withNativePluginTimeout(
    RuStorePush.getStatus(),
    NATIVE_PUSH_STATUS_TIMEOUT_MS,
    'RuStore Push слишком долго отвечает. Закройте и откройте приложение ещё раз.',
  );
  return {
    supported: Boolean(status?.supported),
    configured: Boolean(status?.configured),
    available: Boolean(status?.available),
    permission: normalizeNativePermission(status?.permission),
    token: typeof status?.token === 'string' ? status.token.trim() : '',
    reason: typeof status?.reason === 'string' ? status.reason.trim() : '',
    lastError: typeof status?.lastError === 'string' ? status.lastError.trim() : '',
    messageData: status?.messageData && typeof status.messageData === 'object'
      ? status.messageData
      : null,
    launchUrl: typeof status?.launchUrl === 'string' ? status.launchUrl.trim() : '',
  };
};

export const requestNativePushPermission = async () => {
  if (!isNativeAndroidPushEnvironment()) {
    return { permission: 'default' };
  }
  const result = await withNativePluginTimeout(
    RuStorePush.requestPermissions(),
    NATIVE_PUSH_PERMISSION_TIMEOUT_MS,
    'Android слишком долго подтверждает разрешение на уведомления. Попробуйте ещё раз.',
  );
  return {
    permission: normalizeNativePermission(result?.permission),
  };
};

export const enableNativePush = async () => {
  if (!isNativeAndroidPushEnvironment()) {
    throw new Error('RuStore Push доступен только в Android APK.');
  }
  const result = await withNativePluginTimeout(
    RuStorePush.enable(),
    NATIVE_PUSH_ENABLE_TIMEOUT_MS,
    'RuStore слишком долго выдаёт push-токен. Откройте RuStore, проверьте вход в аккаунт и попробуйте ещё раз.',
  );
  return {
    token: typeof result?.token === 'string' ? result.token.trim() : '',
    permission: normalizeNativePermission(result?.permission),
  };
};

export const disableNativePush = async () => {
  if (!isNativeAndroidPushEnvironment()) {
    return { token: '', previousToken: '', warning: '' };
  }
  const result = await withNativePluginTimeout(
    RuStorePush.disable(),
    NATIVE_PUSH_DISABLE_TIMEOUT_MS,
    'RuStore слишком долго отключает push. Попробуйте ещё раз.',
  );
  return {
    token: typeof result?.token === 'string' ? result.token.trim() : '',
    previousToken: typeof result?.previousToken === 'string' ? result.previousToken.trim() : '',
    warning: typeof result?.warning === 'string' ? result.warning.trim() : '',
  };
};

export const consumeNativePushLaunchUrl = async () => {
  if (!isNativeAndroidPushEnvironment()) {
    return '';
  }
  const result = await withNativePluginTimeout(
    RuStorePush.consumeLaunchUrl(),
    NATIVE_PUSH_LAUNCH_URL_TIMEOUT_MS,
    'Не удалось получить ссылку запуска из push.',
  );
  return typeof result?.url === 'string' ? result.url.trim() : '';
};

export const isPushFeatureSupported = () => (
  isNativeAndroidPushEnvironment()
  || isBrowserPushSupported()
);

export const getPushPermission = () => {
  if (isNativeAndroidPushEnvironment()) return 'default';
  if (typeof Notification === 'undefined') return 'default';
  return Notification.permission || 'default';
};

export const urlBase64ToUint8Array = (base64String) => {
  const padded = `${base64String}${'='.repeat((4 - base64String.length % 4) % 4)}`;
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
};

export const getPushServiceWorkerRegistration = async () => {
  if (!isBrowserPushSupported()) {
    throw new Error('Push-уведомления не поддерживаются в этом браузере.');
  }
  if (!pushRegistrationPromise) {
    pushRegistrationPromise = navigator.serviceWorker.register(PUSH_SW_URL, { scope: '/' })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        return registration;
      })
      .catch((error) => {
        pushRegistrationPromise = null;
        throw error;
      });
  }
  return pushRegistrationPromise;
};

export const getBrowserPushSubscription = async () => {
  if (!isBrowserPushSupported()) return null;
  try {
    const registration = await getPushServiceWorkerRegistration();
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
};

export const normalizePushErrorMessage = (error, fallback = 'Не удалось настроить push-уведомления.') => {
  const message = String(error?.message || '').trim();
  if (!message) return fallback;
  if (/permission|denied|разреш/i.test(message)) {
    return 'Разрешите уведомления в браузере или Android для этого приложения.';
  }
  if (/service worker/i.test(message)) {
    return 'Не удалось инициализировать service worker для push.';
  }
  if (/push/i.test(message) && /настро/i.test(message)) {
    return message;
  }
  return message;
};
