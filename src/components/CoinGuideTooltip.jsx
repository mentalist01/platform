import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ivanCoin from '../assets/ivan-coin-badge.png';

const COIN_GUIDE_ITEMS = [
  {
    title: 'Решай Python-задачи',
    text: 'За новые решённые задачи из раздела Python начисляются монеты. Чем сложнее тема, тем выше награда.',
  },
  {
    title: 'Решай пробники',
    text: 'В пробниках есть рубежи наград: 30 баллов = 30 монет, 50 = 50, 80 = 80, 100 = 100. Улучшай результат и забирай новые рубежи.',
  },
  {
    title: 'Получай от учителя',
    text: 'Учитель может выдать монеты вручную, если захочет наградить тебя отдельно.',
  },
  {
    title: 'Используй артефакты',
    text: 'Некоторые артефакты сразу дают монеты или усиливают монетную награду за Python-задачи.',
  },
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getViewportSize = () => {
  if (typeof window === 'undefined') return { width: 1024, height: 768 };
  return {
    width: window.innerWidth || document.documentElement?.clientWidth || 1024,
    height: window.innerHeight || document.documentElement?.clientHeight || 768,
  };
};

export const CoinGuideTrigger = ({
  children,
  className = '',
  dataTour,
}) => {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const updatePosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect?.();
    if (!triggerRect) return;

    const margin = 12;
    const gap = 10;
    const { width: viewportWidth, height: viewportHeight } = getViewportSize();
    const panelWidth = Math.min(420, Math.max(280, viewportWidth - (margin * 2)));
    const panelHeight = panelRef.current?.offsetHeight || 260;
    const centeredLeft = triggerRect.left + (triggerRect.width / 2);
    const left = clamp(
      centeredLeft,
      margin + (panelWidth / 2),
      viewportWidth - margin - (panelWidth / 2)
    );
    const shouldUseTop = (
      triggerRect.bottom + gap + panelHeight > viewportHeight - margin
      && triggerRect.top - gap - panelHeight > margin
    );

    setPosition({
      left,
      top: shouldUseTop ? triggerRect.top - gap : triggerRect.bottom + gap,
      width: panelWidth,
      placement: shouldUseTop ? 'top' : 'bottom',
    });
  }, []);

  const showTooltip = useCallback(() => {
    setOpen(true);
    updatePosition();
  }, [updatePosition]);

  const hideTooltip = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const frameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const tooltip = open && position && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        id={tooltipId}
        role="tooltip"
        className="coin-guide-tooltip-panel"
        data-placement={position.placement}
        style={{
          '--coin-guide-left': `${position.left}px`,
          '--coin-guide-top': `${position.top}px`,
          '--coin-guide-width': `${position.width}px`,
        }}
      >
        <div className="coin-guide-tooltip-panel__header">
          <img src={ivanCoin} alt="" aria-hidden="true" draggable="false" />
          <div className="coin-guide-tooltip-panel__title">Где взять монеты</div>
        </div>
        <div className="coin-guide-tooltip-panel__grid">
          {COIN_GUIDE_ITEMS.map((item) => (
            <div key={item.title} className="coin-guide-tooltip-panel__card">
              <div className="coin-guide-tooltip-panel__card-title">{item.title}</div>
              <div className="coin-guide-tooltip-panel__card-text">{item.text}</div>
            </div>
          ))}
        </div>
      </div>,
      document.body
    )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        className={`coin-guide-trigger${className ? ` ${className}` : ''}`}
        data-tour={dataTour || undefined}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </span>
      {tooltip}
    </>
  );
};

const CoinGuideIcon = ({
  className = '',
  triggerClassName = '',
  dataTour,
  draggable = false,
  ...props
}) => (
  <CoinGuideTrigger className={triggerClassName} dataTour={dataTour}>
    <img
      {...props}
      src={ivanCoin}
      alt=""
      aria-hidden="true"
      draggable={draggable}
      className={className}
    />
  </CoinGuideTrigger>
);

export default CoinGuideIcon;
