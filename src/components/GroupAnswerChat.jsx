import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send, X } from 'lucide-react';
import { api } from '../services/api';
import './GroupAnswerChat.css';

const formatMessageTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

export default function GroupAnswerChat({
  groupId,
  lessonId,
  role,
  userId,
  readOnly = false,
  dark = false,
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(0);
  const initializedRef = useRef(false);
  const knownIdsRef = useRef(new Set());
  const openRef = useRef(false);
  const listRef = useRef(null);
  openRef.current = open;

  const loadMessages = useCallback(async () => {
    try {
      const payload = await api.getLearningGroupLessonAnswerChat(groupId, lessonId);
      const next = Array.isArray(payload?.messages) ? payload.messages : [];
      if (initializedRef.current && !openRef.current) {
        const additions = next.filter((message) => (
          !knownIdsRef.current.has(message.id) && message.senderId !== userId
        ));
        if (additions.length) setUnread((count) => count + additions.length);
      }
      knownIdsRef.current = new Set(next.map((message) => message.id));
      initializedRef.current = true;
      setMessages(next);
      setError('');
    } catch (cause) {
      setError(cause?.message || 'Не удалось загрузить ответы.');
    } finally {
      setLoading(false);
    }
  }, [groupId, lessonId, userId]);

  useEffect(() => {
    initializedRef.current = false;
    knownIdsRef.current = new Set();
    setMessages([]);
    setUnread(0);
    setLoading(true);
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const intervalId = window.setInterval(() => { void loadMessages(); }, open ? 1600 : 3000);
    return () => window.clearInterval(intervalId);
  }, [loadMessages, open]);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    const frameId = window.requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [messages, open]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || readOnly) return;
    setSending(true);
    setError('');
    try {
      const payload = await api.sendLearningGroupLessonAnswerChat(groupId, lessonId, text);
      setDraft('');
      if (payload?.message) {
        knownIdsRef.current.add(payload.message.id);
        setMessages((current) => current.some((message) => message.id === payload.message.id)
          ? current
          : [...current, payload.message]);
      }
      void loadMessages();
    } catch (cause) {
      setError(cause?.message || 'Не удалось отправить ответ.');
    } finally {
      setSending(false);
    }
  };

  const isTeacher = role === 'teacher';

  return (
    <div className={`group-answer-chat${dark ? ' group-answer-chat--dark' : ''}${open ? ' is-open' : ''}`}>
      {open && (
        <section className="group-answer-chat__panel" aria-label="Ответы группы">
          <header className="group-answer-chat__header">
            <div>
              <strong>Ответы группы</strong>
              <span>{isTeacher ? 'Все ответы по времени' : 'Ваш ответ видит только учитель'}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть ответы группы">
              <X size={18} />
            </button>
          </header>
          <div className="group-answer-chat__messages" ref={listRef} aria-live="polite">
            {loading && messages.length === 0 ? (
              <div className="group-answer-chat__empty"><Loader2 className="animate-spin" size={20} />Загружаем ответы…</div>
            ) : messages.length === 0 ? (
              <div className="group-answer-chat__empty">
                <MessageCircle size={24} />
                {isTeacher ? 'Задайте вопрос группе здесь.' : 'Напишите ответ учителю.'}
              </div>
            ) : messages.map((message) => {
              const own = message.senderId === userId;
              return (
                <article key={message.id} className={`group-answer-chat__message${own ? ' is-own' : ''}${message.senderRole === 'teacher' ? ' is-teacher' : ''}`}>
                  <div className="group-answer-chat__message-meta">
                    <strong>{own ? 'Вы' : message.senderName}</strong>
                    <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                  </div>
                  <p>{message.text}</p>
                </article>
              );
            })}
          </div>
          <div className="group-answer-chat__composer">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 1200))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={readOnly ? 'Занятие завершено' : (isTeacher ? 'Вопрос или сообщение группе' : 'Ваш ответ')}
              aria-label={isTeacher ? 'Сообщение группе' : 'Ответ учителю'}
              disabled={readOnly || sending}
              rows={2}
            />
            <button type="button" onClick={() => void send()} disabled={!draft.trim() || sending || readOnly} aria-label="Отправить">
              {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
          {error && <div className="group-answer-chat__error" role="alert">{error}</div>}
        </section>
      )}
      <button
        type="button"
        className="group-answer-chat__toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? 'Закрыть ответы группы' : 'Открыть ответы группы'}
        data-tooltip="Ответы группы"
      >
        <MessageCircle size={21} />
        {unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
      </button>
    </div>
  );
}
