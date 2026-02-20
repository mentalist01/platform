import React, { useState } from 'react';
import { LogoMark } from './Identity';
import { Button } from './ui';
import { api } from '../services/api';

const LoginPage = ({ onLogin }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await api.login(code.trim());
      onLogin(user);
    } catch (err) {
      setError(err?.message || err);
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
          <p className="text-gray-500 mt-2">Вход в платформу</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            placeholder="Код доступа"
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <Button type="submit" className="w-full py-3" disabled={loading}>{loading ? 'Вход...' : 'Войти'}</Button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">Код доступа выдаёт учитель</p>
      </div>
    </div>
  );
};

export default LoginPage;
