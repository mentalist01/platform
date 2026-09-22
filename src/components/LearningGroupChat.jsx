import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  CheckCircle2,
  Circle,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Square,
  SquareCheckBig,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../services/api';

const POLL_REFRESH_MS = 3500;

const formatTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const mergeMessages = (messages) => (
  Array.from(new Map((Array.isArray(messages) ? messages : []).map((message) => [message.id, message])).values())
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
);

const PollCard = ({ message, isTeacher, busy, onVote, onToggleClosed }) => {
  const poll = message.poll || {};
  const [selected, setSelected] = useState(() => new Set(poll.myOptionIds || []));
  const totalVoters = Number(poll.totalVoters) || 0;

  const toggle = (optionId) => {
    if (poll.closed || busy) return;
    if (!poll.allowMultiple) {
      const next = poll.myOptionIds?.[0] === optionId ? [] : [optionId];
      setSelected(new Set(next));
      onVote(message.id, next);
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  };

  return (
    <div className="mt-2 min-w-[260px] max-w-xl rounded-2xl border border-violet-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
          <BarChart3 size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-600">
            {poll.closed ? 'Опрос завершён' : (poll.allowMultiple ? 'Можно выбрать несколько' : 'Один вариант')}
          </div>
          <div className="mt-0.5 text-sm font-extrabold text-slate-900">{poll.question}</div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {(poll.options || []).map((option) => {
          const checked = selected.has(option.id);
          const votes = Number(option.voteCount) || 0;
          const percent = totalVoters > 0 ? Math.round((votes / totalVoters) * 100) : 0;
          const ChoiceIcon = poll.allowMultiple ? (checked ? SquareCheckBig : Square) : (checked ? CheckCircle2 : Circle);
          return (
            <button
              key={option.id}
              type="button"
              disabled={poll.closed || busy}
              onClick={() => toggle(option.id)}
              className={`relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left transition ${
                checked
                  ? 'border-violet-400 bg-violet-50 text-violet-950'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-violet-300'
              } disabled:cursor-default`}
            >
              <span className="absolute inset-y-0 left-0 bg-violet-100/70 transition-all" style={{ width: `${percent}%` }} />
              <span className="relative flex items-center gap-2">
                <ChoiceIcon size={17} className={checked ? 'text-violet-700' : 'text-slate-400'} />
                <span className="min-w-0 flex-1 text-sm font-semibold">{option.text}</span>
                <span className="shrink-0 text-xs font-bold text-slate-500">{votes} · {percent}%</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{totalVoters} {totalVoters === 1 ? 'участник' : 'участников'} проголосовало</span>
        <div className="flex items-center gap-2">
          {poll.allowMultiple && !poll.closed && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onVote(message.id, Array.from(selected))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Сохранить выбор
            </button>
          )}
          {isTeacher && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggleClosed(message.id, !poll.closed)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-60"
            >
              {poll.closed ? 'Открыть снова' : 'Завершить'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const PollComposer = ({ sending, onCancel, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const validOptions = options.map((entry) => entry.trim()).filter(Boolean);

  const updateOption = (index, value) => setOptions((current) => (
    current.map((entry, entryIndex) => entryIndex === index ? value : entry)
  ));

  return (
    <form
      className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!question.trim() || validOptions.length < 2) return;
        onSubmit({
          type: 'poll',
          poll: {
            question: question.trim(),
            allowMultiple,
            options: validOptions.map((text, index) => ({ id: `option-${index + 1}`, text })),
          },
        });
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-extrabold text-violet-950"><BarChart3 size={17} /> Новый опрос</div>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-500 hover:bg-white"><X size={16} /></button>
      </div>
      <input
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Вопрос"
        maxLength={600}
        className="mt-3 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-violet-500"
      />
      <div className="mt-2 space-y-2">
        {options.map((option, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={option}
              onChange={(event) => updateOption(index, event.target.value)}
              placeholder={`Вариант ${index + 1}`}
              maxLength={240}
              className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500"
            />
            {options.length > 2 && (
              <button type="button" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl border border-rose-200 bg-white p-2 text-rose-500 hover:bg-rose-50">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {options.length < 10 && (
            <button type="button" onClick={() => setOptions((current) => [...current, ''])} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-violet-700 hover:bg-white">
              <Plus size={14} /> Добавить вариант
            </button>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={allowMultiple} onChange={(event) => setAllowMultiple(event.target.checked)} className="accent-violet-600" />
            Несколько ответов
          </label>
        </div>
        <button
          type="submit"
          disabled={sending || !question.trim() || validOptions.length < 2}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Опубликовать
        </button>
      </div>
    </form>
  );
};

const LearningGroupChat = ({ groupId, groupName = '', role = 'student', userId = '', readOnly = false }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [busyMessageId, setBusyMessageId] = useState('');
  const [serverReadOnly, setServerReadOnly] = useState(false);
  const listRef = useRef(null);
  const lastMessageIdRef = useRef('');
  const isTeacher = role === 'teacher' || role === 'admin';
  const effectiveReadOnly = readOnly || serverReadOnly;

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!groupId) return;
    if (!silent) setLoading(true);
    try {
      const result = await api.getLearningGroupChat(groupId);
      setMessages(mergeMessages(result?.messages));
      setServerReadOnly(Boolean(result?.readOnly));
      setError('');
    } catch (loadError) {
      if (!silent) setError(loadError?.message || 'Не удалось загрузить чат мини-группы');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    setMessages([]);
    setError('');
    setPollComposerOpen(false);
    setText('');
    void load();
    const timer = window.setInterval(() => void load({ silent: true }), POLL_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const latestMessageId = messages[messages.length - 1]?.id || '';
  useEffect(() => {
    if (!latestMessageId || latestMessageId === lastMessageIdRef.current) return;
    lastMessageIdRef.current = latestMessageId;
    window.requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, [latestMessageId]);

  const replaceMessage = (message) => {
    if (!message?.id) return;
    setMessages((current) => mergeMessages([...current.filter((entry) => entry.id !== message.id), message]));
  };

  const sendPayload = async (payload) => {
    if (sending || effectiveReadOnly) return;
    setSending(true);
    setError('');
    try {
      const result = await api.sendLearningGroupChatMessage(groupId, payload);
      replaceMessage(result?.message);
      setText('');
      setPollComposerOpen(false);
    } catch (sendError) {
      setError(sendError?.message || 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  };

  const vote = async (messageId, optionIds) => {
    if (busyMessageId || effectiveReadOnly) return;
    setBusyMessageId(messageId);
    setError('');
    try {
      const result = await api.voteLearningGroupChatPoll(groupId, messageId, optionIds);
      replaceMessage(result?.message);
    } catch (voteError) {
      setError(voteError?.message || 'Не удалось сохранить голос');
    } finally {
      setBusyMessageId('');
    }
  };

  const togglePollClosed = async (messageId, closed) => {
    if (busyMessageId || effectiveReadOnly) return;
    setBusyMessageId(messageId);
    setError('');
    try {
      const result = await api.setLearningGroupChatPollClosed(groupId, messageId, closed);
      replaceMessage(result?.message);
    } catch (pollError) {
      setError(pollError?.message || 'Не удалось изменить опрос');
    } finally {
      setBusyMessageId('');
    }
  };

  const participantCount = useMemo(() => new Set(messages.map((message) => message.senderId).filter(Boolean)).size, [messages]);

  return (
    <section className="flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200"><MessageCircle size={20} /></span>
          <div className="min-w-0">
            <div className="truncate text-base font-black text-slate-900">Чат · {groupName || 'Мини-группа'}</div>
            <div className="text-xs font-semibold text-slate-500">{messages.length} сообщений · {participantCount} участников в переписке</div>
          </div>
        </div>
        {effectiveReadOnly && <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">Только чтение</span>}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4">
        {loading ? (
          <div className="grid min-h-[300px] place-items-center text-sm font-semibold text-slate-500"><span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Загружаем чат...</span></div>
        ) : messages.length === 0 ? (
          <div className="grid min-h-[300px] place-items-center text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700"><MessageCircle size={23} /></span>
              <div className="mt-3 font-extrabold text-slate-800">Здесь начнётся общение мини-группы</div>
              <div className="mt-1 text-sm text-slate-500">Сообщения и опросы сохраняются для всех участников.</div>
            </div>
          </div>
        ) : messages.map((message) => {
          const mine = String(message.senderId || '') === String(userId || '');
          return (
            <article key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                mine ? 'rounded-br-md bg-violet-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
              } ${message.type === 'poll' ? '!max-w-[96%] bg-transparent !p-0 shadow-none' : ''}`}>
                <div className={`flex flex-wrap items-center gap-x-2 text-[11px] font-bold ${message.type === 'poll' ? 'px-1 text-slate-500' : (mine ? 'text-violet-100' : 'text-slate-500')}`}>
                  <span>{message.senderName}</span>
                  {message.senderRole === 'teacher' && <span className={mine ? 'text-white' : 'text-violet-600'}>Учитель</span>}
                  <span>{formatTime(message.createdAt)}</span>
                </div>
                {message.type === 'poll' ? (
                  <PollCard
                    key={`${message.id}:${(message.poll?.myOptionIds || []).join(',')}`}
                    message={message}
                    isTeacher={isTeacher}
                    busy={busyMessageId === message.id}
                    onVote={vote}
                    onToggleClosed={togglePollClosed}
                  />
                ) : (
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <footer className="space-y-2 border-t border-slate-200 bg-white p-3">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>}
        {effectiveReadOnly ? (
          <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-center text-sm font-semibold text-slate-500">Группа завершена, история чата сохранена.</div>
        ) : pollComposerOpen ? (
          <PollComposer sending={sending} onCancel={() => setPollComposerOpen(false)} onSubmit={sendPayload} />
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) void sendPayload({ type: 'text', text: text.trim() });
            }}
          >
            {isTeacher && (
              <button type="button" onClick={() => setPollComposerOpen(true)} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100" title="Создать опрос">
                <BarChart3 size={17} /> <span className="hidden sm:inline">Опрос</span>
              </button>
            )}
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (text.trim()) void sendPayload({ type: 'text', text: text.trim() });
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Написать мини-группе..."
              className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:bg-white"
            />
            <button type="submit" disabled={sending || !text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-50">
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        )}
      </footer>
    </section>
  );
};

export default LearningGroupChat;
