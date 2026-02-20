import React from 'react';

export const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
  const baseStyle = 'px-4 py-2.5 sm:py-2 rounded-xl font-semibold text-sm sm:text-[15px] leading-tight transition-all duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200 hover:-translate-y-[1px]',
    secondary: 'bg-white/80 text-gray-700 border border-slate-200 hover:bg-white',
    ghost: 'text-gray-500 hover:bg-purple-50 hover:text-purple-700',
    danger: 'bg-rose-50 text-rose-600 hover:bg-rose-100',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };
  return <button className={`${baseStyle} ${variants[variant]} ${className}`} onClick={onClick} {...props}>{children}</button>;
};

export const Card = ({ children, className = '', onClick, ...props }) => (
  <div
    onClick={onClick}
    className={`surface-card rounded-3xl p-4 sm:p-5 transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-purple-200 hover:shadow-lift hover:-translate-y-1 active:translate-y-0' : ''} ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const ProgressBar = ({ value }) => {
  let color = 'bg-gray-200';
  if (value > 0) color = 'bg-blue-400';
  if (value >= 70) color = 'bg-purple-500';
  if (value >= 90) color = 'bg-green-500';
  return (
    <div className="w-full bg-slate-100/80 rounded-full h-2.5 overflow-hidden mt-2 ring-1 ring-slate-200/70">
      <div className={`h-2.5 rounded-full ${color} transition-all duration-700 ease-out`} style={{ width: `${value}%` }} />
    </div>
  );
};
