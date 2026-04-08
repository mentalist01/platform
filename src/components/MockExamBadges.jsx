import React, { useMemo } from 'react';
import { getMockExamBadgeTheme, normalizeMockExamBadges } from '../utils/mockExamBadges';

const SIZE_CLASSNAMES = {
  sm: 'px-2.5 py-1 text-[10px]',
  md: 'px-3 py-1.5 text-[11px]',
  lg: 'px-3.5 py-2 text-xs',
};

const STICKER_PATH = 'M35 20C50 6 73 18 90 12C110 5 129 16 147 14C166 12 189 4 202 19C216 35 204 58 211 76C218 94 229 116 209 126C190 136 165 125 144 129C122 133 109 151 89 144C70 137 64 115 45 107C28 99 4 103 9 81C14 61 32 51 28 33C25 24 28 26 35 20Z';
const STICKER_ROTATION_CLASSNAMES = ['-rotate-[7deg]', 'rotate-[6deg]', '-rotate-[4deg]', 'rotate-[8deg]'];
const STICKER_SIZE_CLASSNAMES = {
  sm: 'min-h-[76px] min-w-[118px] max-w-[150px] px-5 py-4 text-[13px]',
  md: 'min-h-[94px] min-w-[144px] max-w-[186px] px-6 py-5 text-[15px]',
  lg: 'min-h-[112px] min-w-[166px] max-w-[214px] px-7 py-6 text-[17px]',
};
const STICKER_PAPER_FILL = 'rgba(255,255,255,0.82)';
const STICKER_PAPER_STROKE = 'rgba(255,255,255,0.9)';
const STICKER_DARK_CORE_FILL = 'rgba(15,23,42,0.32)';
const STICKER_DARK_CORE_STROKE = 'rgba(255,255,255,0.08)';

const renderBadgePill = (item, index, size) => {
  const theme = getMockExamBadgeTheme(item.themeId);
  const sizeClassName = SIZE_CLASSNAMES[size] || SIZE_CLASSNAMES.sm;
  return (
    <span
      key={`${item.themeId}-${item.label}-${index}`}
      className={`inline-flex items-center rounded-full border font-semibold ${sizeClassName} ${theme.badgeClassName}`}
    >
      {item.label}
    </span>
  );
};

export const MockExamBadgeSticker = ({ badge, size = 'md', className = '', surface = 'light' }) => {
  const item = useMemo(() => normalizeMockExamBadges(badge ? [badge] : [])[0] || null, [badge]);
  if (!item) return null;

  const theme = getMockExamBadgeTheme(item.themeId);
  const sizeClassName = STICKER_SIZE_CLASSNAMES[size] || STICKER_SIZE_CLASSNAMES.md;
  const rotationIndex = (item.label.length + item.themeId.length) % STICKER_ROTATION_CLASSNAMES.length;
  const rotationClassName = STICKER_ROTATION_CLASSNAMES[rotationIndex];
  const isDarkSurface = String(surface || '').trim().toLowerCase() === 'dark';
  const stickerFill = isDarkSurface
    ? (theme.stickerFillDark || theme.stickerFill || 'rgba(255, 255, 255, 0.12)')
    : (theme.stickerFill || 'rgba(255, 255, 255, 0.12)');
  const stickerTextClassName = isDarkSurface
    ? (theme.stickerTextClassNameDark || theme.stickerTextClassName || 'text-white')
    : (theme.stickerTextClassName || 'text-white');
  const textShadow = isDarkSurface
    ? '0 1px 0 rgba(15,23,42,0.72), 0 0 14px rgba(255,255,255,0.08)'
    : '0 1px 0 rgba(255,255,255,0.32)';

  return (
    <div
      className={`relative isolate inline-flex w-full max-w-max items-center justify-center ${rotationClassName} ${className}`.trim()}
      style={{ filter: `drop-shadow(${theme.stickerShadow || '0 14px 28px rgba(15, 23, 42, 0.16)'})` }}
    >
      <svg
        viewBox="0 0 220 150"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <path
          d={STICKER_PATH}
          fill={stickerFill}
          stroke={theme.stickerStroke || '#ffffff'}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {isDarkSurface ? (
          <path
            d={STICKER_PATH}
            fill={STICKER_DARK_CORE_FILL}
            stroke={STICKER_DARK_CORE_STROKE}
            strokeWidth="1.4"
            strokeLinejoin="round"
            transform="translate(7 6) scale(0.92)"
          />
        ) : (
          <>
            <path
              d={STICKER_PATH}
              fill={STICKER_PAPER_FILL}
              stroke={STICKER_PAPER_STROKE}
              strokeWidth="1.8"
              strokeLinejoin="round"
              transform="translate(7 6) scale(0.92)"
            />
            <path
              d={STICKER_PATH}
              fill="none"
              stroke="rgba(255,255,255,0.34)"
              strokeWidth="1.6"
              strokeDasharray="8 11"
              strokeLinecap="round"
              transform="translate(7 6) scale(0.92)"
            />
          </>
        )}
      </svg>

      <div
        className={`relative flex min-h-full min-w-full items-center justify-center text-center font-display font-bold uppercase leading-[1.05] tracking-[0.14em] ${sizeClassName} ${stickerTextClassName}`}
        style={{ textShadow }}
      >
        <span className="max-w-[11ch] text-balance">{item.label}</span>
      </div>
    </div>
  );
};

const MockExamBadges = ({ badges, size = 'sm', className = '' }) => {
  const items = useMemo(() => normalizeMockExamBadges(badges), [badges]);
  if (items.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      {items.map((item, index) => renderBadgePill(item, index, size))}
    </div>
  );
};

export default MockExamBadges;
