import React, { useEffect } from 'react';
import {
  Bell,
  BellOff,
  FileText,
  Image as ImageIcon,
  Link,
  MessageSquare,
  Pin,
  Search,
  Users,
  X,
} from 'lucide-react';

const FILTER_ROWS = Object.freeze([
  { id: 'media', label: 'Медиа', Icon: ImageIcon },
  { id: 'files', label: 'Файлы', Icon: FileText },
  { id: 'links', label: 'Ссылки', Icon: Link },
]);

const getInitials = (value) => {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
};

const ChatInfoAvatar = ({ info }) => {
  const avatarDataUrl = String(info?.avatarDataUrl || '').trim();
  const title = String(info?.title || info?.avatarLabel || '').trim();
  const AvatarIcon = info?.avatarIcon || (info?.kind === 'group' ? Users : null);

  return (
    <div className="student-chat-info-avatar">
      {avatarDataUrl ? (
        <img src={avatarDataUrl} alt={title || 'Чат'} />
      ) : AvatarIcon ? (
        <AvatarIcon size={31} />
      ) : (
        <span>{getInitials(title)}</span>
      )}
    </div>
  );
};

const ChatInfoActionButton = ({ action }) => {
  const ActionIcon = action.Icon || MessageSquare;
  return (
    <button
      type="button"
      className={`student-chat-info-action ${action.danger ? 'student-chat-info-action--danger' : ''}`}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      <ActionIcon size={18} />
      <span>{action.label}</span>
    </button>
  );
};

const ChatInfoDrawer = ({
  open,
  onClose,
  info = {},
  counts = {},
  pinnedMessage = null,
  menuActions = [],
  onFilterSelect = null,
  onPinnedOpen = null,
  onOpenSearch = null,
}) => {
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const title = String(info?.title || 'Чат').trim();
  const subtitle = String(info?.subtitle || '').trim();
  const status = String(info?.status || '').trim();
  const primaryMenuActions = (Array.isArray(menuActions) ? menuActions : []).filter(Boolean);
  const quickActions = [
    {
      id: 'search',
      label: 'Поиск',
      Icon: Search,
      onClick: () => {
        onOpenSearch?.();
        onClose?.();
      },
    },
    ...primaryMenuActions.slice(0, 2).map((action) => ({
      ...action,
      onClick: (event) => {
        action.onClick?.(event);
        onClose?.();
      },
    })),
  ];

  return (
    <div className="student-chat-info-overlay" onClick={onClose} role="presentation">
      <aside
        className="student-chat-info-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Информация о чате"
      >
        <button
          type="button"
          className="student-chat-info-close"
          onClick={onClose}
          aria-label="Закрыть"
          title="Закрыть"
        >
          <X size={20} />
        </button>

        <div className="student-chat-info-profile">
          <ChatInfoAvatar info={info} />
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
          {status && <span>{status}</span>}
        </div>

        <div className="student-chat-info-actions">
          {quickActions.map((action) => (
            <ChatInfoActionButton key={action.id || action.label} action={action} />
          ))}
        </div>

        <div className="student-chat-info-section">
          <button
            type="button"
            className="student-chat-info-row"
            onClick={() => {
              onFilterSelect?.('all');
              onClose?.();
            }}
          >
            <MessageSquare size={18} />
            <span>Сообщения</span>
            <strong>{counts?.all || 0}</strong>
          </button>
          {pinnedMessage && (
            <button
              type="button"
              className="student-chat-info-row"
              onClick={() => {
                onPinnedOpen?.(pinnedMessage);
                onClose?.();
              }}
            >
              <Pin size={18} />
              <span>Закреп</span>
              <strong>1</strong>
            </button>
          )}
          {FILTER_ROWS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="student-chat-info-row"
              onClick={() => {
                onFilterSelect?.(id);
                onClose?.();
              }}
            >
              {React.createElement(Icon, { size: 18 })}
              <span>{label}</span>
              <strong>{counts?.[id] || 0}</strong>
            </button>
          ))}
        </div>

        {primaryMenuActions.length > 0 && (
          <div className="student-chat-info-section student-chat-info-section--actions">
            {primaryMenuActions.map((action) => {
              const ActionIcon = action.Icon || (action.danger ? BellOff : Bell);
              return (
                <button
                  key={action.id || action.label}
                  type="button"
                  className={`student-chat-info-row ${action.danger ? 'student-chat-info-row--danger' : ''}`}
                  onClick={(event) => {
                    action.onClick?.(event);
                    onClose?.();
                  }}
                  disabled={action.disabled}
                >
                  <ActionIcon size={18} />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
};

export default ChatInfoDrawer;
