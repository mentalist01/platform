import React, { useEffect, useId, useRef, useState } from 'react';
import { Clock3, Maximize2, Minus, PhoneCall, Users, X } from 'lucide-react';
import './TeacherLessonStartPrompt.css';

export default function TeacherLessonStartPromptCard({
  title, subject, subtitle, leadLabel, isGroup, onClose, onJoin, joinDisabled,
  secondaryAction, children,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const titleId = useId();
  const expandRef = useRef(null);
  const collapseRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    collapseRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const changeCollapsed = (value) => {
    setCollapsed(value);
    requestAnimationFrame(() => (value ? expandRef : collapseRef).current?.focus());
  };
  const handleKeys = (event) => {
    if (event.key === 'Escape' && !collapsed) {
      event.preventDefault();
      event.stopPropagation();
      changeCollapsed(true);
    }
    if (event.key !== 'Tab' || collapsed) return;
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  };
  const JoinIcon = isGroup ? Users : PhoneCall;
  return (
    <div className={`lesson-start-prompt ${collapsed ? 'is-collapsed' : ''}`}>
      <section className="lesson-start-prompt__card" role={collapsed ? 'region' : 'dialog'} aria-modal={collapsed ? undefined : true} aria-labelledby={titleId} onKeyDown={handleKeys}>
        <header className="lesson-start-prompt__header">
          <div className="lesson-start-prompt__heading">
            <span className="lesson-start-prompt__eyebrow">Перед уроком</span>
            <h2 id={titleId} title={title}>{title}</h2>
            {!collapsed && subject && subject !== title && <p className="lesson-start-prompt__muted">{subject}</p>}
            <div className="lesson-start-prompt__meta">
              <span className="lesson-start-prompt__countdown">{leadLabel}</span>
              {subtitle && <span className="lesson-start-prompt__muted"><Clock3 size={13} />{subtitle}</span>}
            </div>
          </div>
          <div className="lesson-start-prompt__header-actions">
            <button ref={collapsed ? expandRef : collapseRef} type="button" className="lesson-start-prompt__icon-button" onClick={() => changeCollapsed(!collapsed)} aria-label={collapsed ? 'Развернуть напоминание' : 'Свернуть напоминание'} title={collapsed ? 'Развернуть' : 'Свернуть'} aria-expanded={!collapsed}>
              {collapsed ? <Maximize2 size={17} /> : <Minus size={18} />}
            </button>
            <button type="button" className="lesson-start-prompt__icon-button" onClick={onClose} aria-label="Закрыть напоминание" title="Закрыть"><X size={17} /></button>
          </div>
        </header>
        <div className="lesson-start-prompt__actions">
          <button type="button" className="lesson-start-prompt__primary" onClick={onJoin} disabled={joinDisabled}>
            <JoinIcon size={20} />{isGroup ? 'Открыть занятие группы' : (collapsed ? 'Войти в звонок' : 'Присоединиться к созвону')}
          </button>
          {!collapsed && secondaryAction}
        </div>
        {!collapsed && <div className="lesson-start-prompt__body">{children}</div>}
      </section>
    </div>
  );
}
