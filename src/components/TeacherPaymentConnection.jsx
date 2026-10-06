import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react';
import { createPaymentConnection, getPaymentConnection, getPaymentNotificationHistory, paymentConnectionBody } from '../services/teacherPaymentConnection';
import './TeacherPaymentConnection.css';
import { getExternalApiOrigin } from '../utils/runtimeUrls';
import PaymentNotificationHistory from './PaymentNotificationHistory';

const statuses = { applied: 'Учтено', pending: 'Требует проверки', ignored: 'Не учтено', duplicate: 'Повтор', connected: 'Подключено' };
const date = (value) => value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function TeacherPaymentConnection({ teacherId }) {
  const [connection, setConnection] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState('');
  const [confirmRotation, setConfirmRotation] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const settings = await getPaymentConnection();
      const history = await getPaymentNotificationHistory();
      setConnection(settings.connection);
      setNotifications(history.notifications || []);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    setConnection(null);
    setNotifications([]);
    setRevealed(false);
    void refresh();
  }, [teacherId, refresh]);
  const create = async (rotate = false) => {
    setBusy(true);
    setError('');
    try {
      setConnection((await createPaymentConnection(rotate)).connection);
      setConfirmRotation(false);
      setRevealed(false);
      setCopied('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const copy = async (name, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(name); }
    catch { setError('Не удалось скопировать. Откройте тело запроса и выделите его вручную.'); }
  };
  const endpoint = `${getExternalApiOrigin()}/api/payment-notifications/tbank`;
  return <section className="payment-connection" aria-label="Автооплата">
    <header className="payment-connection__heading">
      <div><h2>Автооплата</h2><span className="payment-connection__status">{connection?.lastRequestAt ? 'Личный ключ подключён' : connection?.configured ? 'Ожидает запрос с телефона' : 'Не подключено'}</span></div>
      <button type="button" className="payment-connection__icon" title="Обновить статус и историю" aria-label="Обновить статус и историю" disabled={busy} onClick={refresh}>{busy ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={18} />}</button>
    </header>
    {error && <div className="payment-connection__error" role="alert">{error}</div>}
    {connection?.legacyActive && <p className="payment-connection__notice">Старый ключ временно активен. Он отключится после первого запроса с личным ключом.</p>}
    {connection?.legacyDisabledAt && <p className="payment-connection__success">Старый ключ отключён {date(connection.legacyDisabledAt)}.</p>}
    {!connection?.configured ? <button type="button" disabled={busy || !connection} onClick={() => create()}><KeyRound size={17} />Создать личный ключ</button> : <>
      <details className="payment-connection__setup"><summary>Настройка подключения с телефона</summary>
      <dl className="payment-connection__details">
        <div><dt>Метод</dt><dd>POST</dd></div>
        <div><dt>Тип сообщения</dt><dd>application/json</dd></div>
        <div className="payment-connection__url"><dt>URL</dt><dd><code>{endpoint}</code><button type="button" className="payment-connection__icon" title="Скопировать URL" aria-label="Скопировать URL" onClick={() => copy('url', endpoint)}>{copied === 'url' ? <Check size={17} /> : <Copy size={17} />}</button></dd></div>
      </dl>
      <div className="payment-connection__actions">
        <button type="button" onClick={() => copy('body', paymentConnectionBody(connection))}>{copied === 'body' ? <Check size={17} /> : <Copy size={17} />}{copied === 'body' ? 'Тело запроса скопировано' : 'Скопировать тело запроса'}</button>
        <button type="button" className="payment-connection__secondary" onClick={() => setRevealed(value => !value)}>{revealed ? <EyeOff size={17} /> : <Eye size={17} />}{revealed ? 'Скрыть' : 'Показать тело запроса'}</button>
        <button type="button" className="payment-connection__secondary" disabled={busy} onClick={() => setConfirmRotation(true)}><KeyRound size={17} />Заменить ключ</button>
      </div>
      {revealed && <pre className="payment-connection__body" tabIndex={0}>{paymentConnectionBody(connection)}</pre>}
      {confirmRotation && <div className="payment-connection__notice" role="alert"><p>Текущий личный ключ перестанет работать. Новое тело запроса потребуется установить на телефоне.</p><div className="payment-connection__actions"><button type="button" disabled={busy} onClick={() => create(true)}>Заменить ключ</button><button type="button" className="payment-connection__secondary" onClick={() => setConfirmRotation(false)}>Отмена</button></div></div>}
      </details>
      <dl className="payment-connection__details"><div><dt>Последний запрос с личным ключом</dt><dd>{date(connection.lastRequestAt)}</dd></div><div><dt>Результат</dt><dd>{statuses[connection.lastStatus] || 'Ожидает запрос'}</dd></div></dl>
      {connection.lastReason && <p className="payment-connection__reason">{connection.lastReason}</p>}
    </>}
    <PaymentNotificationHistory key={teacherId} notifications={notifications} loading={busy} />
  </section>;
}
