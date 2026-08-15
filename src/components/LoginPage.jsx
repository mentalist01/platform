import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { LogoMark } from './Identity';
import { Button } from './ui';
import { api } from '../services/api';
import {
  clearRuntimeApiBaseUrl,
  getConfiguredApiBaseUrl,
  hasConfiguredApiBaseUrl,
  isNativeAppRuntime,
  saveRuntimeApiBaseUrl,
} from '../utils/runtimeUrls';

const MODE_CHOICE = 'choice';
const MODE_STUDENT = 'student';
const MODE_PARENT = 'parent';
const MODE_SIGNUP = 'signup';
const SIGNUP_GUEST_KEY_STORAGE = 'ege_signup_guest_key';

const generateSignupGuestKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const getOrCreateSignupGuestKey = () => {
  if (typeof localStorage === 'undefined') return '';
  try {
    const stored = localStorage.getItem(SIGNUP_GUEST_KEY_STORAGE);
    if (stored && typeof stored === 'string') {
      const normalized = stored.trim();
      if (normalized) return normalized;
    }
  } catch {
    // Local storage is optional in private browsing and embedded web views.
  }
  const next = generateSignupGuestKey();
  try {
    localStorage.setItem(SIGNUP_GUEST_KEY_STORAGE, next);
  } catch {
    // Local storage is optional in private browsing and embedded web views.
  }
  return next;
};

const getStoredSignupGuestKey = () => {
  if (typeof localStorage === 'undefined') return '';
  try {
    const stored = localStorage.getItem(SIGNUP_GUEST_KEY_STORAGE);
    return typeof stored === 'string' ? stored.trim() : '';
  } catch {
    return '';
  }
};

const LoginPage = ({ onLogin }) => {
  const nativeRuntime = isNativeAppRuntime();
  const initialApiBaseUrl = getConfiguredApiBaseUrl();
  const [mode, setMode] = useState(MODE_CHOICE);
  const [code, setCode] = useState('');
  const [isCodeVisible, setIsCodeVisible] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serverUrl, setServerUrl] = useState(initialApiBaseUrl);
  const [serverConfigError, setServerConfigError] = useState('');
  const [serverConfigMessage, setServerConfigMessage] = useState(
    nativeRuntime && !initialApiBaseUrl
      ? 'Для APK укажите публичный адрес сайта, на котором работает backend.'
      : ''
  );
  const hasStoredSignupGuestKey = Boolean(getStoredSignupGuestKey());
  const hasApiBaseUrl = hasConfiguredApiBaseUrl();

  const resetState = () => {
    setError('');
    setLoading(false);
  };

  const handleBack = () => {
    resetState();
    setCode('');
    setIsCodeVisible(false);
    setName('');
    setMode(MODE_CHOICE);
  };

  const handleStudentSubmit = async (event) => {
    event.preventDefault();
    if (nativeRuntime && !hasApiBaseUrl) {
      setError('Для APK сначала укажите адрес сервера ниже.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await api.login(code.trim());
      onLogin(user);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleParentSubmit = async (event) => {
    event.preventDefault();
    if (nativeRuntime && !hasApiBaseUrl) {
      setError('Для APK сначала укажите адрес сервера ниже.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await api.parentLogin(code.trim());
      onLogin(user);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (event) => {
    event.preventDefault();
    if (nativeRuntime && !hasApiBaseUrl) {
      setError('Для APK сначала укажите адрес сервера ниже.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const guestKey = getOrCreateSignupGuestKey();
      const user = await api.signupLogin(name.trim(), '', guestKey);
      onLogin(user);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignupChoice = async () => {
    resetState();
    if (nativeRuntime && !hasApiBaseUrl) {
      setError('Для APK сначала укажите адрес сервера ниже.');
      setMode(MODE_SIGNUP);
      return;
    }
    const guestKey = getStoredSignupGuestKey();
    if (!guestKey) {
      setMode(MODE_SIGNUP);
      return;
    }

    setLoading(true);
    try {
      const user = await api.signupLogin('', '', guestKey);
      onLogin(user);
    } catch {
      setMode(MODE_SIGNUP);
      setError('');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServerUrl = (event) => {
    event.preventDefault();
    setServerConfigError('');
    try {
      const normalized = saveRuntimeApiBaseUrl(serverUrl);
      setServerUrl(normalized);
      setError('');
      setServerConfigMessage(`Сервер сохранён: ${normalized}`);
    } catch (err) {
      setServerConfigMessage('');
      setServerConfigError(err?.message || 'Не удалось сохранить адрес сервера.');
    }
  };

  const handleResetServerUrl = () => {
    clearRuntimeApiBaseUrl();
    setServerUrl('');
    setServerConfigError('');
    setServerConfigMessage('Сохранённый адрес сервера очищен.');
  };

  return (
    <div className="app-min-h app-shell relative overflow-hidden flex items-center justify-center p-4 font-sans">
      <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-purple-200/40 blur-3xl" />
      <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="relative max-w-md w-full surface-card rounded-4xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-purple-100 text-purple-700 font-display text-lg font-bold tracking-tight mx-auto mb-4 floating md:hidden">
            100
          </div>
          <div className="hidden md:flex w-16 h-16 bg-purple-100 text-purple-700 rounded-2xl items-center justify-center mx-auto mb-4 floating font-display text-2xl font-bold tracking-tight">
            100
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            <span className="md:hidden"><LogoMark /></span>
            <span className="hidden md:inline">Иван на сотку</span>
          </h1>
          <p className="text-gray-500 mt-2">Выберите, как хотите зайти</p>
        </div>

        {mode === MODE_CHOICE && (
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full py-3"
              disabled={loading}
              onClick={() => {
                resetState();
                setIsCodeVisible(false);
                setMode(MODE_STUDENT);
              }}
            >
              Я ученик
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full py-3"
              disabled={loading}
              onClick={() => {
                resetState();
                setIsCodeVisible(false);
                setMode(MODE_PARENT);
              }}
            >
              Я родитель
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full py-3"
              disabled={loading}
              onClick={handleSignupChoice}
            >
              {loading ? 'Подключаем...' : (hasStoredSignupGuestKey ? 'Вернуться в чат' : 'Я хочу записаться')}
            </Button>
          </div>
        )}

        {(mode === MODE_STUDENT || mode === MODE_PARENT) && (
          <form
            onSubmit={mode === MODE_PARENT ? handleParentSubmit : handleStudentSubmit}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-purple-100 bg-purple-50/70 px-4 py-3 text-left">
              <p className="text-sm font-bold text-purple-900">
                {mode === MODE_PARENT ? 'Кабинет родителя' : 'Кабинет ученика'}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-purple-700/75">
                {mode === MODE_PARENT
                  ? 'Введите код, который вам отправил преподаватель.'
                  : 'Введите персональный код доступа, который выдал учитель.'}
              </p>
            </div>
            <div className="relative">
              <input
                type={isCodeVisible ? 'text' : 'password'}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                autoComplete="current-password"
                placeholder={mode === MODE_PARENT ? 'Код ученика' : 'Код доступа'}
                className="access-code-input w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-4 pr-12 outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onPointerDown={() => setIsCodeVisible(true)}
                onPointerUp={() => setIsCodeVisible(false)}
                onPointerCancel={() => setIsCodeVisible(false)}
                onPointerLeave={() => setIsCodeVisible(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setIsCodeVisible(true);
                }}
                onKeyUp={() => setIsCodeVisible(false)}
                onBlur={() => setIsCodeVisible(false)}
                onContextMenu={(event) => event.preventDefault()}
                className="absolute inset-y-0 right-2 my-auto grid h-8 w-8 place-items-center rounded-full bg-transparent text-gray-400 transition-colors hover:bg-purple-100 hover:text-purple-600 active:!translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                aria-label="Зажмите, чтобы показать код"
                aria-pressed={isCodeVisible}
                title="Зажмите, чтобы показать код"
              >
                {isCodeVisible ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
            <Button type="submit" className="w-full py-3" disabled={loading || !code.trim()}>
              {loading ? 'Вход...' : (mode === MODE_PARENT ? 'Открыть кабинет' : 'Войти')}
            </Button>
            <button
              type="button"
              className="w-full text-xs text-gray-500 hover:text-purple-600"
              onClick={handleBack}
            >
              Назад к выбору
            </button>
          </form>
        )}

        {mode === MODE_SIGNUP && (
          <form onSubmit={handleSignupSubmit} className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="Ваше имя"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
            />
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
            <Button type="submit" className="w-full py-3" disabled={loading || !name.trim()}>
              {loading ? 'Подключаем...' : 'Перейти в чат'}
            </Button>
            <button
              type="button"
              className="w-full text-xs text-gray-500 hover:text-purple-600"
              onClick={handleBack}
            >
              Назад к выбору
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          {mode === MODE_SIGNUP
            ? 'После входа вы сможете сразу написать преподавателю.'
            : (mode === MODE_PARENT ? 'Используйте тот же код, по которому входит ученик.' : 'Код доступа выдаёт учитель.')}
        </p>
        {nativeRuntime && (
          <form onSubmit={handleSaveServerUrl} className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-900">Адрес сервера для APK</p>
              <p className="text-xs text-gray-500">
                Укажи адрес сайта на Timeweb, например https://example.ru. Без этого APK будет обращаться в локальный /api.
              </p>
            </div>
            <input
              type="text"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="https://example.ru"
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
            />
            {serverConfigError && <div className="text-red-500 text-sm">{serverConfigError}</div>}
            {serverConfigMessage && <div className="text-emerald-600 text-sm">{serverConfigMessage}</div>}
            {!hasApiBaseUrl && !serverConfigError && !serverConfigMessage && (
              <div className="text-amber-600 text-sm">
                Сейчас адрес сервера не задан, поэтому вход из APK не сработает.
              </div>
            )}
            <div className="flex gap-3">
              <Button type="submit" className="flex-1 py-3">
                Сохранить адрес
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1 py-3"
                onClick={handleResetServerUrl}
              >
                Сбросить
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
