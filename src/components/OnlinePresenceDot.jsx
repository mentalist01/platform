import React from 'react';

const SIZE_CLASSES = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

const OnlinePresenceDot = ({
  size = 'md',
  className = '',
  label = 'Сейчас онлайн',
}) => (
  <span
    role="img"
    aria-label={label}
    title={label}
    className={`inline-flex shrink-0 rounded-full bg-emerald-500 ring-2 ring-white shadow-[0_0_7px_rgba(16,185,129,0.72)] ${
      SIZE_CLASSES[size] || SIZE_CLASSES.md
    } ${className}`}
  />
);

export default OnlinePresenceDot;
