import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_DARK } from '../utils/theme';

const ThemeToggleButton = ({ theme, onToggle, className = '' }) => {
  const isDarkTheme = theme === THEME_DARK;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`theme-toggle ${className}`.trim()}
      aria-label={isDarkTheme ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
      title={isDarkTheme ? 'Светлая тема' : 'Тёмная тема'}
    >
      <span className="theme-toggle__icon-wrap">
        {isDarkTheme ? <Sun size={16} /> : <Moon size={16} />}
      </span>
      <span className="theme-toggle__label">
        {isDarkTheme ? 'Светлая' : 'Тёмная'}
      </span>
    </button>
  );
};

export default ThemeToggleButton;
