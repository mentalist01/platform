import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, LogOut, MonitorSmartphone, Settings } from 'lucide-react';
import './AccountProfileMenu.css';

export default function AccountProfileMenu({
  user, avatar, avatarError, avatarSaving, onAvatar, onSessions, onLogout, mobile = false,
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const cardRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const initialFocusRef = useRef('first');
  const roleLabel = user.role === 'admin' ? 'Администратор' : user.role === 'teacher' ? 'Преподаватель' : 'Ученик';
  const canEditAvatar = user.role === 'teacher' || user.role === 'student';

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const card = cardRef.current;
    const menu = menuRef.current;
    const place = () => {
      const rect = card.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16);
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${Math.max(80, window.innerHeight - 16)}px`;
      const height = menu.getBoundingClientRect().height;
      const above = rect.top - height - 8;
      const top = above >= 8 ? above : Math.min(rect.bottom + 8, window.innerHeight - height - 8);
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
      menu.style.top = `${Math.max(8, top)}px`;
    };
    place();
    const items = menu.querySelectorAll('[role="menuitem"]:not(:disabled)');
    const index = initialFocusRef.current === 'last' ? items.length - 1 : 0;
    items[index]?.focus({ preventScroll: true });
    const dismissOutside = (event) => {
      if (!menu.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    const resize = () => {
      if (!card.getClientRects().length) setOpen(false);
      else place();
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissOnEscape, true);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissOnEscape, true);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const handleMenuKey = (event) => {
    if (event.key === 'Tab') {
      // Leave the menu through its trigger, then let the browser advance focus normally.
      close(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)'));
    const current = items.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[index]?.focus({ preventScroll: true });
  };
  const runAction = (action) => {
    close(true);
    action?.();
  };

  return (
    <div ref={cardRef} className={`account-profile ${mobile ? 'account-profile--mobile' : 'sidebar-profile-card'}`}>
      <div className="account-profile__row">
        <span className="account-profile__avatar">{avatar}</span>
        <div className="account-profile__identity">
          <p className="account-profile__name" title={user.name}>{user.name}</p>
          <span className="account-profile__role">{roleLabel}</span>
        </div>
        <button
          ref={triggerRef}
          type="button"
          className={`account-profile__settings ${open ? 'is-open' : ''}`}
          aria-label="Настройки аккаунта"
          title="Настройки аккаунта"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => { initialFocusRef.current = 'first'; setOpen((value) => !value); }}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
            event.preventDefault();
            initialFocusRef.current = event.key === 'ArrowUp' ? 'last' : 'first';
            setOpen(true);
          }}
        >
          <Settings size={18} />
        </button>
      </div>
      {avatarError && <div className="account-profile__error" role="alert">{avatarError}</div>}
      {open && createPortal(
        <div ref={menuRef} id={menuId} role="menu" aria-label="Действия аккаунта" className="account-actions" onKeyDown={handleMenuKey}>
          <div className="account-actions__heading" role="presentation">Настройки аккаунта</div>
          {canEditAvatar && (
            <button type="button" role="menuitem" className="account-actions__item" disabled={avatarSaving} onClick={() => runAction(onAvatar)}>
              <Camera size={17} /><span>{avatarSaving ? 'Сохраняем аватарку…' : 'Сменить аватарку'}</span>
            </button>
          )}
          <button type="button" role="menuitem" className="account-actions__item" onClick={() => runAction(onSessions)}>
            <MonitorSmartphone size={17} /><span>Активные сессии<small>Безопасность и устройства</small></span>
          </button>
          <div className="account-actions__divider" role="separator" />
          <button type="button" role="menuitem" className="account-actions__item account-actions__item--logout" onClick={() => runAction(onLogout)}>
            <LogOut size={17} /><span>Выйти</span>
          </button>
        </div>, document.body,
      )}
    </div>
  );
}
