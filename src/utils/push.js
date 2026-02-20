const PUSH_SW_URL = '/sw-push.js';
let pushRegistrationPromise = null;

export const isPushFeatureSupported = () => (
  typeof window !== 'undefined'
  && typeof navigator !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window
);

export const getPushPermission = () => {
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
  if (!isPushFeatureSupported()) {
    throw new Error('Push уведомления не поддерживаются в этом браузере.');
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
  if (!isPushFeatureSupported()) return null;
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
    return 'Разрешите уведомления в браузере для этого сайта.';
  }
  if (/service worker/i.test(message)) {
    return 'Не удалось инициализировать service worker для push.';
  }
  if (/push/i.test(message) && /настро/i.test(message)) {
    return message;
  }
  return message;
};
