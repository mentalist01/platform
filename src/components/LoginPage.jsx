import React, { useState } from 'react';
import { LogoMark } from './Identity';
import { Button } from './ui';
import { api } from '../services/api';

const MODE_CHOICE = 'choice';
const MODE_STUDENT = 'student';
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
  } catch {}
  const next = generateSignupGuestKey();
  try {
    localStorage.setItem(SIGNUP_GUEST_KEY_STORAGE, next);
  } catch {}
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
  const [mode, setMode] = useState(MODE_CHOICE);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const hasStoredSignupGuestKey = Boolean(getStoredSignupGuestKey());

  const resetState = () => {
    setError('');
    setLoading(false);
  };

  const handleBack = () => {
    resetState();
    setCode('');
    setName('');
    setMode(MODE_CHOICE);
  };

  const handleStudentSubmit = async (event) => {
    event.preventDefault();
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

  const handleSignupSubmit = async (event) => {
    event.preventDefault();
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
              onClick={handleSignupChoice}
            >
              {loading ? 'Подключаем...' : (hasStoredSignupGuestKey ? 'Вернуться в чат' : 'Я хочу записаться')}
            </Button>
          </div>
        )}

        {mode === MODE_STUDENT && (
          <form onSubmit={handleStudentSubmit} className="space-y-4">
            <input
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              placeholder="Код доступа"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
            />
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
            <Button type="submit" className="w-full py-3" disabled={loading || !code.trim()}>
              {loading ? 'Вход...' : 'Войти'}
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
            : 'Код доступа выдаёт учитель.'}
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
