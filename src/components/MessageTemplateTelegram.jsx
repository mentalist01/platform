import { useEffect, useRef, useState } from 'react';
import { Film, RefreshCcw, Send } from 'lucide-react';
import { preparedRequest } from '../services/preparedLessonTasks.js';
import { copyParentMessage } from '../utils/studentParentContact.js';

const api = '/api/message-templates/telegram';
const chatLabel = chat => [chat.name, chat.username && '@' + chat.username].filter(Boolean).join(' · ') || 'Аккаунт Telegram';

const encodePng = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(Error('Не удалось подготовить картинку свободного времени.'));
  reader.readAsDataURL(blob);
});

export default function MessageTemplateTelegram({ mode, videoId, onVideoChange, student, template, caption, canSend, availabilityPng }) {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [link, setLink] = useState('');
  const [videoImport, setVideoImport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const running = useRef(false);
  const previousSend = useRef(null);
  const studentId = student?.id || '';
  const settings = mode === 'settings' || mode === 'edit';
  const target = settings ? 'owner' : studentId;
  const requestPath = api + (studentId ? '?studentId=' + encodeURIComponent(studentId) : '');

  useEffect(() => {
    const controller = new AbortController();
    preparedRequest(requestPath, undefined, 'GET', controller.signal)
      .then(value => { if (!controller.signal.aborted) setStatus(value); })
      .catch(error => { if (!controller.signal.aborted) setFeedback({ error: true, text: error.message }); });
    return () => controller.abort();
  }, [requestPath]);

  const perform = async action => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFeedback(null);
    try { await action(); }
    catch (error) { setFeedback({ error: true, text: error.message }); }
    finally { running.current = false; setBusy(false); }
  };
  const refresh = async () => {
    const current = await preparedRequest(requestPath);
    setStatus(current);
    if (current.lastVideoId && videoImport?.importId === current.importId) {
      onVideoChange?.(current.lastVideoId);
      setVideoImport(null);
      setFeedback({ text: 'Видео добавлено.' });
    } else if (videoImport && (!current.waitingForVideo || videoImport.importId !== current.importId)) {
      setVideoImport(null);
      setFeedback({ error: true, text: 'Загрузка видео закрыта. Начните её ещё раз или выберите видео из библиотеки.' });
    }
  };
  const connect = () => perform(async () => {
    await preparedRequest(api, { token }, 'PUT');
    setToken('');
    await refresh();
  });
  const disconnect = () => perform(async () => {
    await preparedRequest(api, {}, 'DELETE');
    setLink('');
    setVideoImport(null);
    await refresh();
  });
  const invite = () => perform(async () => {
    const result = await preparedRequest(api + '/invite', { target });
    setLink(result.url);
    await refresh();
  });
  const chat = settings ? status?.owner : status?.student;
  const candidate = settings ? status?.ownerCandidate : status?.studentCandidate;
  const chosen = status?.videos?.find(video => video.id === (videoId || template?.telegramVideoId));

  return <section className="message-templates__telegram" aria-label="Telegram">
    <div className="message-templates__title">
      <h4>{settings ? <Film size={17} /> : <Send size={17} />} {mode === 'edit' ? 'Видео для шаблона' : 'Telegram'}</h4>
      {status?.connected && <small>@{status.username}</small>}
    </div>
    {!status && !feedback && <p role="status">Проверяем подключение…</p>}
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'message-templates__warning' : ''}>{feedback.text}</p>}
    {status && !status.connected && (mode === 'settings' ? <>
      <p>Создайте отдельного бота в <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> и вставьте токен сюда.</p>
      <div className="message-templates__fields">
        <label>Токен бота<input type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" maxLength={128} /></label>
        <button type="button" disabled={busy || !token.trim()} onClick={connect}>Подключить бота</button>
      </div>
    </> : <p>Подключите бота через «Настроить Telegram».</p>)}
    {status?.connected && target && <>
      {chat ? <p>Привязан {chatLabel(chat)}</p> : <p>{settings ? 'Привяжите свой аккаунт, чтобы добавлять видео.' : 'Дайте ученику ссылку привязки. В Telegram ему нужно нажать «Запустить».'}</p>}
      {!chat && !candidate && <div className="message-templates__telegram-actions">
        <button type="button" disabled={busy} onClick={invite}>{link ? 'Новая ссылка' : 'Создать ссылку привязки'}</button>
        <button type="button" disabled={busy} onClick={() => perform(refresh)}><RefreshCcw size={14} />Проверить привязку</button>
      </div>}
      {link && !candidate && !chat && <div className="message-templates__telegram-actions">
        {settings && <a href={link} target="_blank" rel="noopener noreferrer">Запустить бота ↗</a>}
        <button type="button" disabled={busy} onClick={() => perform(async () => {
          await copyParentMessage(link);
          setFeedback({ text: 'Ссылка скопирована. Она действует 24 часа и подходит для одной привязки.' });
        })}>Копировать ссылку</button>
      </div>}
      {candidate && <div className="message-templates__telegram-actions">
        <p>Проверьте аккаунт для привязки. <strong>{chatLabel(candidate)}</strong></p>
        <button type="button" disabled={busy} onClick={() => perform(async () => {
          await preparedRequest(api + '/recipient', { target, revision: candidate.revision }, 'PUT');
          setLink('');
          await refresh();
        })}>Подтвердить привязку</button>
      </div>}
      {(chat || candidate) && <div className="message-templates__telegram-actions">
        <button type="button" disabled={busy} onClick={() => perform(async () => {
          await preparedRequest(api + '/recipient', { target }, 'DELETE');
          setLink('');
          setVideoImport(null);
          await refresh();
        })}>{chat ? 'Отвязать аккаунт' : 'Отклонить привязку'}</button>
      </div>}
    </>}
    {status?.connected && settings && chat && <>
      <div className="message-templates__telegram-actions">
        <button type="button" disabled={busy} onClick={() => perform(async () => {
          const result = await preparedRequest(api + '/import', {});
          setVideoImport(result);
        })}><Film size={15} />Добавить видео из Telegram</button>
        {(videoImport || status.waitingForVideo) && <button type="button" disabled={busy} onClick={() => perform(refresh)}><RefreshCcw size={14} />Проверить видео</button>}
      </div>
      {(videoImport || status.waitingForVideo) && <p>Перешлите боту одно видео в течение 15 минут, затем нажмите «Проверить видео». <a href={videoImport?.url || 'https://t.me/' + status.username} target="_blank" rel="noopener noreferrer">Открыть бота ↗</a></p>}
    </>}
    {mode === 'edit' && (status?.connected || videoId) && <label>Видео в шаблоне
      <select value={videoId || ''} onChange={event => onVideoChange(event.target.value)}>
        <option value="">Без видео</option>
        {videoId && !chosen && <option value={videoId}>Ранее прикреплённое видео</option>}
        {status?.videos?.map(video => <option key={video.id} value={video.id}>{video.name}{video.duration ? ' · ' + video.duration + ' сек.' : ''}</option>)}
      </select>
    </label>}
    {mode === 'settings' && status?.connected && <div className="message-templates__telegram-actions">
      <small>Видео в библиотеке: {status.videos.length}</small>
      <button type="button" disabled={busy} onClick={() => {
        if (window.confirm('Отключить бота для отправки шаблонов?')) void disconnect();
      }}>Отключить бота</button>
    </div>}
    {mode === 'send' && status?.connected && <>
      <p>{chosen ? 'Видео · ' + chosen.name : 'Выберите доступное видео в редакторе шаблона.'}</p>
      {!studentId && <p>Выберите ученика для отправки.</p>}
      {caption.length > 1024 && <p className="message-templates__warning">Сократите подпись к видео до 1024 символов.</p>}
      <div className="message-templates__telegram-actions">
        <button type="button" className="message-templates__primary" disabled={busy || !chosen || !chat || !canSend || caption.length > 1024}
          onClick={() => perform(async () => {
            const image = availabilityPng ? await encodePng(availabilityPng) : '';
            const signature = JSON.stringify([chat.revision, template.revision, caption, image]);
            if (previousSend.current && previousSend.current.signature !== signature
              && !window.confirm('Прошлая отправка не подтверждена. Проверьте чат. Отправить изменённое сообщение?')) return;
            const requestId = previousSend.current?.signature === signature ? previousSend.current.requestId : crypto.randomUUID();
            previousSend.current = { requestId, signature };
            await preparedRequest(api + '/send', {
              studentId, recipientRevision: chat.revision, templateId: template.id, templateRevision: template.revision, requestId,
              caption, ...(image ? { availabilityPng: image } : {}),
            }).catch(error => {
              if (error.status && error.status < 500 && !error.message.includes('не подтвердил эту отправку')) previousSend.current = null;
              throw error;
            });
            previousSend.current = null;
            setFeedback({ text: 'Видео и сообщение отправлены ученику в Telegram.' });
          })}><Send size={15} />{busy ? 'Подождите…' : 'Отправить в Telegram'}</button>
        {chat && student && <small>Получатель · {student.nickname || student.name}</small>}
      </div>
    </>}
  </section>;
}
