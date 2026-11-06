import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, Check, ClipboardCopy, Download, FileText, MessageSquare, Pencil, Plus, RefreshCcw, Search, Trash2, Users, X } from 'lucide-react';
import { preparedRequest } from '../services/preparedLessonTasks.js';
import { currentReviewMonth, fillMessageTemplate, MESSAGE_TEMPLATE_CATEGORIES, MESSAGE_TEMPLATE_VARIABLES, missingMessageVariables } from '../utils/messageTemplates.js';
import { renderCalendarAvailabilityPng } from '../utils/calendarAvailabilityShare.js';
import { copyParentMessage } from '../utils/studentParentContact.js';
import { studentContacts } from '../services/studentContacts.js';
import { parentContacts } from '../services/studentParentContacts.js';
import ReviewRequestStatus from './ReviewRequestStatus.jsx';
import MessageTemplateTelegram from './MessageTemplateTelegram.jsx';
import './MessageTemplates.css';

const emptyTemplate = () => ({ id: crypto.randomUUID(), name: '', body: '', category: 'other', attachAvailability: false, revision: '' });
const weekLabel = start => new Date(start + 'T12:00:00+03:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const releaseImage = image => { if (image?.url) URL.revokeObjectURL(image.url); };
const includesGroup = body => /\{\{\s*(?:группа|расписание|дни группы)\s*\}\}/.test(body || '');

export default function MessageTemplates({ students = [], initialStudentId = '', initialGroupId = '', initialCategory = '', parentRecipient = false, reviewMonth: initialReviewMonth, onClose }) {
  const [templates, setTemplates] = useState(null), [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState(''), [category, setCategory] = useState(initialCategory);
  const [editor, setEditor] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [studentId, setStudentId] = useState(initialStudentId), [recipient, setRecipient] = useState(parentRecipient ? 'parent' : 'student');
  const [groupId, setGroupId] = useState(initialGroupId), [lessonCount, setLessonCount] = useState('2–3');
  const [draftText, setDraftText] = useState(null), [attachmentOverride, setAttachmentOverride] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0), [context, setContext] = useState(null), [refresh, setRefresh] = useState(0);
  const [contextBusy, setContextBusy] = useState(false), [image, setImage] = useState(null), [imageError, setImageError] = useState('');
  const [contextError, setContextError] = useState('');
  const [contact, setContact] = useState(null);
  const [telegramSettings, setTelegramSettings] = useState(false);
  const [telegramRevision, setTelegramRevision] = useState(0);
  const [reviewMonth, setReviewMonth] = useState(initialReviewMonth || currentReviewMonth);
  const imageRef = useRef(null), messageInput = useRef(null), busyRef = useRef(false);
  const messageId = useId();
  const template = templates?.find(row => row.id === selectedId);
  const attachAvailability = attachmentOverride ?? Boolean(template?.attachAvailability);
  const needsGroups = includesGroup(template?.body);
  const needsLessonCount = /\{\{\s*занятия\s*\}\}/.test(template?.body || '');
  const student = students.find(row => row.id === studentId);
  const group = context?.groups.find(row => row.id === groupId) || (!groupId ? context?.groups[0] : null);
  const variables = { имя: recipient === 'parent' ? contact?.name : student?.name,
    группа: group?.name, расписание: group?.schedule, 'дни группы': group?.scheduleDays, занятия: lessonCount };
  const generatedText = fillMessageTemplate(template?.body, variables);
  const text = draftText ?? generatedText;
  const missing = missingMessageVariables(text);
  const staleContext = context?.weekOffset !== weekOffset || context?.refresh !== refresh;
  const validImage = attachAvailability && !contextBusy && !contextError && !staleContext && !context?.calendarError && image;

  const loadTemplates = async () => {
    const result = await preparedRequest('/api/message-templates');
    setTemplates(result.templates);
    setSelectedId(previous => result.templates.some(row => row.id === previous) ? previous
      : (result.templates.find(row => !initialCategory || row.category === initialCategory) || result.templates[0])?.id || '');
  };
  useEffect(() => {
    let disposed = false;
    preparedRequest('/api/message-templates').then(result => {
      if (disposed) return;
      setTemplates(result.templates);
      setSelectedId((result.templates.find(row => !initialCategory || row.category === initialCategory) || result.templates[0])?.id || '');
    }).catch(failure => { if (!disposed) setError(failure.message); });
    return () => { disposed = true; };
  }, [initialCategory]);
  useEffect(() => {
    if (!needsGroups && !attachAvailability) return;
    const controller = new AbortController();
    setContextBusy(true); setContextError('');
    preparedRequest('/api/message-templates/context?weekOffset=' + weekOffset, undefined, 'GET', controller.signal)
      .then(result => { if (!controller.signal.aborted) setContext({ ...result, weekOffset, refresh }); })
      .catch(failure => { if (!controller.signal.aborted) setContextError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setContextBusy(false); });
    return () => controller.abort();
  }, [needsGroups, attachAvailability, weekOffset, refresh]);
  useEffect(() => {
    if (!attachAvailability || !context || staleContext || context.calendarError) { setImage(null); return; }
    let disposed = false;
    setImage(null); setImageError('');
    renderCalendarAvailabilityPng({ weekStartDate: new Date(context.weekStart + 'T12:00:00'), events: context.events, timezoneLabel: 'Москва · UTC+3' })
      .then(next => {
        if (disposed) { releaseImage(next); return; }
        releaseImage(imageRef.current); imageRef.current = next; setImage(next);
        if (!next) setImageError('Не удалось подготовить картинку свободного времени.');
      }).catch(failure => { if (!disposed) setImageError(failure.message); });
    return () => { disposed = true; };
  }, [attachAvailability, context, staleContext]);
  useEffect(() => () => releaseImage(imageRef.current), []);
  useEffect(() => {
    const service = recipient === 'parent' ? parentContacts : studentContacts;
    let disposed = false;
    setContact(null);
    if (studentId) service.load().then(() => { if (!disposed) setContact(service.snapshot(studentId)); }).catch(() => {});
    return () => { disposed = true; };
  }, [studentId, recipient]);

  const execute = async action => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (failure) { setError(failure.message || 'Не удалось выполнить действие.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const choose = id => { setSelectedId(id); setEditor(null); setDraftText(null); setAttachmentOverride(null); setError(''); setNotice(''); };
  const saveTemplate = () => execute(async () => {
    const result = await preparedRequest('/api/message-templates/' + encodeURIComponent(editor.id), editor, 'PUT');
    setTemplates(result.templates); choose(result.template.id); setNotice('Шаблон сохранён на сервере.');
  });
  const deleteTemplate = () => execute(async () => {
    const result = await preparedRequest('/api/message-templates/' + encodeURIComponent(template.id), { revision: template.revision }, 'DELETE');
    setTemplates(result.templates); choose(result.templates[0]?.id || ''); setNotice('Шаблон удалён.');
  });
  const copyText = () => execute(async () => {
    await copyParentMessage(text);
    setNotice('Текст скопирован. Вставьте его в сообщение.');
  });
  const copyPacket = () => execute(async () => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw Error('Копирование картинки здесь недоступно. Скачайте PNG и скопируйте текст отдельно.');
    // One clipboard entry carries both formats. Messengers choose the supported format.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': image.blob, 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    setNotice('Скопированы текст и картинка. Если мессенджер вставит только картинку, добавьте подпись кнопкой «Копировать текст».');
  });
  const downloadImage = () => {
    const anchor = document.createElement('a');
    anchor.href = image.url; anchor.download = 'свободное-время-' + context.weekStart + '.png'; anchor.click();
    setNotice('Картинка скачана. Текст можно скопировать отдельно.');
  };
  const filtered = (templates || []).filter(row => (!category || row.category === category)
    && (row.name + ' ' + row.body).toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')));

  return <section className="message-templates" aria-label="Шаблоны сообщений">
    <header className="message-templates__header"><div><span>ПЕРЕПИСКА БЕЗ ПОВТОРНОГО НАБОРА</span><h2>Шаблоны сообщений</h2><p>Выберите шаблон, проверьте текст и подготовьте отправку.</p></div>
      <div className="message-templates__telegram-actions">
        <button type="button" aria-expanded={telegramSettings} onClick={() => {
          if (telegramSettings) setTelegramRevision(value => value + 1);
          setTelegramSettings(!telegramSettings);
        }}>{telegramSettings ? 'Закрыть настройки Telegram' : 'Настроить Telegram'}</button>
        {onClose && <button type="button" aria-label="Закрыть шаблоны" onClick={onClose}><X size={21} /></button>}
      </div>
    </header>
    {telegramSettings && <div className="message-templates__telegram-settings"><MessageTemplateTelegram mode="settings" /></div>}
    {error && <div role="alert" className="message-templates__error">{error}<button type="button" disabled={busy} onClick={() => execute(loadTemplates)}>Обновить список шаблонов</button></div>}
    {notice && <p role="status" className="message-templates__notice"><Check size={16} />{notice}</p>}
    <div className="message-templates__workspace">
      <aside className="message-templates__library">
        <button type="button" className="message-templates__primary" disabled={busy} onClick={() => { setEditor(emptyTemplate()); setError(''); }}><Plus size={16} />Создать шаблон</button>
        <label className="message-templates__search"><Search size={16} /><input type="search" aria-label="Найти шаблон" placeholder="Найти шаблон" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <select aria-label="Категория шаблонов" value={category} onChange={event => setCategory(event.target.value)}><option value="">Все шаблоны</option>{Object.entries(MESSAGE_TEMPLATE_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        {!templates && !error && <p role="status">Загружаем шаблоны…</p>}
        {filtered.map(row => <button type="button" disabled={busy} className={'message-templates__template' + (row.id === selectedId && !editor ? ' is-selected' : '')} aria-pressed={row.id === selectedId && !editor} key={row.id} onClick={() => choose(row.id)}><FileText size={18} /><span><strong>{row.name}</strong><small>{MESSAGE_TEMPLATE_CATEGORIES[row.category]}{row.attachAvailability ? ' · с занятостью' : ''}{row.telegramVideoId ? ' · с видео' : ''}</small></span></button>)}
        {templates && !filtered.length && <p>Подходящих шаблонов пока нет.</p>}
      </aside>
      {editor ? <form className="message-templates__editor" onSubmit={event => { event.preventDefault(); void saveTemplate(); }}>
        <h3>{editor.revision ? 'Изменить шаблон' : 'Новый шаблон'}</h3>
        <label>Название<input required maxLength={100} value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>
        <label>Категория<select value={editor.category} onChange={event => setEditor({ ...editor, category: event.target.value })}>{Object.entries(MESSAGE_TEMPLATE_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Текст шаблона<textarea ref={messageInput} required maxLength={10000} rows={12} value={editor.body} onChange={event => setEditor({ ...editor, body: event.target.value })} /></label>
        <div className="message-templates__variables"><span>Вставить подстановку</span>{MESSAGE_TEMPLATE_VARIABLES.map(name => <button type="button" key={name} onClick={() => { const node = messageInput.current, start = node.selectionStart, end = node.selectionEnd, value = '{{' + name + '}}'; setEditor({ ...editor, body: editor.body.slice(0, start) + value + editor.body.slice(end) }); requestAnimationFrame(() => { node.focus(); node.setSelectionRange(start + value.length, start + value.length); }); }}>{'{{' + name + '}}'}</button>)}</div>
        <label className="message-templates__check"><input type="checkbox" checked={editor.attachAvailability} onChange={event => setEditor({ ...editor, attachAvailability: event.target.checked })} />Прикреплять актуальную картинку свободного времени</label>
        {!telegramSettings && <MessageTemplateTelegram key={editor.id + '/' + telegramRevision} mode="edit" videoId={editor.telegramVideoId}
          onVideoChange={telegramVideoId => setEditor(previous => previous && { ...previous, telegramVideoId })} />}
        <footer><button type="button" disabled={busy} onClick={() => setEditor(null)}>Отмена</button><button type="submit" className="message-templates__primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить шаблон'}</button></footer>
      </form> : template ? <div className="message-templates__composer">
        <div className="message-templates__title"><h3>{template.name}</h3><div><button type="button" disabled={busy} onClick={() => setEditor({ ...template })}><Pencil size={15} />Изменить</button><button type="button" disabled={busy} aria-label="Удалить выбранный шаблон" onClick={() => { if (window.confirm('Удалить шаблон «' + template.name + '»?')) void deleteTemplate(); }}><Trash2 size={15} /></button></div></div>
        <div className="message-templates__fields"><label>Ученик<select value={studentId} onChange={event => {
          setStudentId(event.target.value);
          if (initialGroupId) setGroupId(event.target.value === initialStudentId ? initialGroupId : '');
        }}><option value="">Выберите ученика</option>{students.map(row => <option key={row.id} value={row.id}>{row.nickname || row.name}</option>)}</select></label><label>Кому<select value={recipient} onChange={event => setRecipient(event.target.value)}><option value="student">Ученику</option><option value="parent">Родителю</option></select></label></div>
        {template.category === 'review' && studentId && <><label>Месяц отчёта<input type="month" value={reviewMonth} onChange={event => { if (event.target.value) setReviewMonth(event.target.value); }} /></label><ReviewRequestStatus key={studentId + '/' + reviewMonth} studentId={studentId} month={reviewMonth} /></>}
        {needsGroups && <section className="message-templates__groups"><h4><Users size={16} />Группы от начального уровня Python</h4><p>По самой дальней теме, в которой есть решения участников группы. Прогресс учитывает задачи, решённые хотя бы одним участником.</p>
          {contextBusy && !context && <p role="status">Проверяем прогресс групп…</p>}
          {contextError && <p role="alert" className="message-templates__warning">{contextError}<button type="button" disabled={contextBusy} onClick={() => setRefresh(value => value + 1)}>Повторить загрузку</button></p>}
          {context?.groups.map(row => <button type="button" key={row.id} aria-pressed={group?.id === row.id} className={group?.id === row.id ? 'is-selected' : ''} onClick={() => setGroupId(row.id)}><span><strong>{row.name}</strong><small>{row.topicTitle} · решено {row.coveredCount}{!row.memberCount ? ' · нет участников' : ''}</small></span><small>{row.schedule || 'Расписание ещё не задано'}</small></button>)}
          {context && !context.groups.length && <p>Активных групп пока нет. Можно изменить готовый текст вручную.</p>}
          {needsLessonCount && <label>Занятий перед переходом<input value={lessonCount} maxLength={30} onChange={event => setLessonCount(event.target.value)} /></label>}
        </section>}
        <div className="message-templates__title"><label htmlFor={messageId}><strong>Готовое сообщение</strong></label>{draftText !== null && <button type="button" onClick={() => setDraftText(null)}><RefreshCcw size={14} />Обновить по шаблону</button>}</div>
        <textarea id={messageId} className="message-templates__message" value={text} rows={9} maxLength={20000} onChange={event => setDraftText(event.target.value)} />
        {draftText !== null && <small>Ваши правки сохранены в этом окне. Чтобы подставить новый выбор ученика или группы, нажмите «Обновить по шаблону».</small>}
        {missing.length > 0 && <p className="message-templates__warning">Дополните сообщение перед копированием — {missing.join(', ')}.</p>}
        <section className="message-templates__attachment"><label className="message-templates__check"><input type="checkbox" checked={attachAvailability} onChange={event => setAttachmentOverride(event.target.checked)} /><CalendarDays size={17} />Прикрепить свободное время</label>
          {attachAvailability && <><div className="message-templates__fields"><label>Неделя<select value={weekOffset} onChange={event => setWeekOffset(Number(event.target.value))}>{[0, 1, 2, 3, 4].map(offset => <option key={offset} value={offset}>{offset === 0 ? 'Текущая' : offset === 1 ? 'Следующая' : 'Через ' + offset + ' недели'}</option>)}</select></label><button type="button" disabled={contextBusy} onClick={() => setRefresh(value => value + 1)}><RefreshCcw size={15} />Обновить занятость</button></div>
            {contextBusy ? <p role="status">Проверяем календарь…</p> : (contextError || context?.calendarError || imageError) ? <p role="alert" className="message-templates__warning">{contextError || context?.calendarError || imageError}</p> : validImage ? <><small>С {weekLabel(context.weekStart)} · Москва · подготовлено {new Date(context.generatedAt).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })}</small><img src={image.url} alt="Свободное время для дополнительных занятий" /></> : <p role="status">Готовим картинку…</p>}</>}
        </section>
        {template.telegramVideoId && recipient === 'student' && !telegramSettings && <MessageTemplateTelegram
          key={template.id + '/' + studentId + '/' + telegramRevision} mode="send" student={student} template={template}
          caption={text} canSend={Boolean(text.trim() && !missing.length && (!attachAvailability || validImage))}
          availabilityPng={validImage ? image.blob : null} />}
        <footer><button type="button" disabled={busy || !text.trim() || missing.length > 0} onClick={copyText}><ClipboardCopy size={16} />Копировать текст</button>{attachAvailability && <><button type="button" disabled={!validImage} onClick={downloadImage}><Download size={16} />Скачать PNG</button><button type="button" className="message-templates__primary" disabled={busy || !validImage || !text.trim() || missing.length > 0} onClick={copyPacket}><ClipboardCopy size={16} />Текст и картинка</button></>}{contact?.url && <a href={contact.url} target="_blank" rel="noopener noreferrer">Открыть контакт {recipient === 'parent' ? 'родителя' : 'ученика'} ↗</a>}</footer>
      </div> : <div className="message-templates__empty"><MessageSquare size={34} /><h3>Выберите или создайте шаблон</h3><p>Он сохранится в вашем кабинете и будет доступен на других устройствах.</p></div>}
    </div>
  </section>;
}
