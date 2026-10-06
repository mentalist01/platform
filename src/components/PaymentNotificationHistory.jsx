import React, { useMemo, useState } from 'react';
import { Download, Search, X, Users, List, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { buildPaymentHistoryReport, paymentHistoryCsv, paymentHistoryPeriod } from '../utils/paymentHistory.js';
import './PaymentNotificationHistory.css';

const initialFilters = { query: '', period: 'all', from: '', to: '', status: '', authMode: '', minAmount: '', maxAmount: '', sort: 'newest', personId: '' };
const statuses = { applied: 'Учтено', pending: 'Требует проверки', ignored: 'Не учтено', duplicate: 'Повтор' };
const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value || 0);
const date = value => {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) : '—';
};
const day = value => value ? value.split('-').reverse().join('.') : '—';
const auth = mode => mode === 'personal-key' ? 'Личный ключ' : mode === 'legacy-key' ? 'Старый ключ' : 'Неизвестно';
const count = (value, forms) => {
  const last = value % 10, lastTwo = value % 100;
  return `${value} ${forms[lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2]}`;
};
const payments = value => count(value, ['платёж', 'платежа', 'платежей']);
const messages = value => count(value, ['уведомление', 'уведомления', 'уведомлений']);

export default function PaymentNotificationHistory({ notifications, loading }) {
  const [filters, setFilters] = useState(initialFilters);
  const [view, setView] = useState('payments');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [exportError, setExportError] = useState('');
  const report = useMemo(() => buildPaymentHistoryReport(notifications, filters), [notifications, filters]);
  const change = patch => { setFilters(previous => ({ ...previous, ...patch })); setPage(1); };
  const reset = () => { setFilters(initialFilters); setPage(1); };
  const selectPeriod = period => change({ period, ...paymentHistoryPeriod(period) });
  const items = view === 'payments' ? report.rows : view === 'people' ? report.people : report.months;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedPerson = report.people.find(person => person.id === filters.personId);
  const filtered = Object.entries(filters).some(([key, value]) => !['period', 'sort'].includes(key) && value) || filters.period !== 'all';
  const exportCsv = () => {
    setExportError('');
    try {
      const url = URL.createObjectURL(new Blob([paymentHistoryCsv(report.rows)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'istorija-oplat.csv';
      document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setExportError('Не удалось выгрузить историю. Попробуйте ещё раз.'); }
  };
  return <section className="payment-history" aria-label="Поиск и статистика оплат" aria-busy={loading}>
    <header className="payment-history__heading"><div><h3>Уведомления об оплате</h3><p>Все сохранённые уведомления · {report.total.notifications}{report.earliestDay && ` · с ${day(report.earliestDay)}`}</p></div>
      <button type="button" className="payment-history__export" disabled={!report.rows.length} onClick={exportCsv}><Download size={16} />Выгрузить CSV</button></header>
    <div className="payment-history__filters">
      <label className="payment-history__search"><Search size={18} /><span className="sr-only">Поиск по плательщику или ученику</span><input type="search" value={filters.query} onChange={event => change({ query: event.target.value, personId: '' })} placeholder="Имя плательщика или ученика" />{filters.query && <button type="button" aria-label="Очистить поиск" onClick={() => change({ query: '', personId: '' })}><X size={14} /></button>}</label>
      <label>Период<select aria-label="Период" value={filters.period} onChange={event => selectPeriod(event.target.value)}><option value="all">Вся история</option><option value="month">Этот месяц</option><option value="previous">Прошлый месяц</option><option value="week">Последние 7 дней</option><option value="30days">Последние 30 дней</option><option value="custom">Выбрать даты</option></select></label>
      <label>Результат<select aria-label="Результат" value={filters.status} onChange={event => change({ status: event.target.value })}><option value="">Все результаты</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {filtered && <button type="button" className="payment-history__reset" onClick={reset}>Сбросить фильтры</button>}
    </div>
    <details className="payment-history__advanced" open={filters.period === 'custom' || undefined}><summary>Даты, сумма и подключение</summary><div>
      <label>С даты (Москва)<input type="date" value={filters.from} onChange={event => change({ from: event.target.value, period: 'custom' })} /></label>
      <label>По дату (включительно)<input type="date" value={filters.to} onChange={event => change({ to: event.target.value, period: 'custom' })} /></label>
      <label>Сумма от, ₽<input type="text" inputMode="decimal" value={filters.minAmount} onChange={event => change({ minAmount: event.target.value })} placeholder="Без ограничения" /></label>
      <label>Сумма до, ₽<input type="text" inputMode="decimal" value={filters.maxAmount} onChange={event => change({ maxAmount: event.target.value })} placeholder="Без ограничения" /></label>
      <label>Подключение<select aria-label="Подключение" value={filters.authMode} onChange={event => change({ authMode: event.target.value })}><option value="">Все подключения</option><option value="personal-key">Личный ключ</option><option value="legacy-key">Старый ключ</option><option value="unknown">Старые записи</option></select></label>
    </div></details>
    {filters.personId && <div className="payment-history__person-filter">История: {selectedPerson?.name || 'выбранный человек'}<button type="button" onClick={() => change({ personId: '' })} aria-label="Снять выбор человека"><X size={14} /></button></div>}
    {(report.invalidRange || report.invalidAmount) && <p className="payment-history__error" role="alert">{report.invalidRange ? 'Начало периода должно быть не позже его окончания.' : 'Проверьте диапазон сумм: укажите положительные числа, нижняя граница не должна превышать верхнюю.'}</p>}
    <div className="payment-history__summary" aria-label="Итоги текущей выборки" aria-live="polite">
      <article><span>Поступления по уведомлениям</span><strong>{money(report.summary.received)}</strong><small>{payments(report.summary.payments)} · средний {money(report.summary.average)}</small></article>
      <article data-tone="good"><span>Учтено автоматически</span><strong>{money(report.summary.applied)}</strong><small>{messages(report.summary.counts.applied)}</small></article>
      <article data-tone="review"><span>Требуют проверки</span><strong>{money(report.summary.pending)}</strong><small>{messages(report.summary.counts.pending)}</small></article>
      <article><span>Ученики с оплатой</span><strong>{report.summary.students}</strong><small>Имена плательщиков из банка: {report.summary.payerNames}</small></article>
      <article><span>Оплачено занятий</span><strong>{report.summary.lessons}</strong><small>по уникальным отметкам{report.summary.missingLessons ? ` · ${report.summary.missingLessons} оплат без списка занятий` : ''}</small></article>
      <article><span>Не учтено / повторы</span><strong>{report.summary.counts.ignored} / {report.summary.counts.duplicate}</strong><small>не включены в суммы поступлений</small></article>
    </div>
    {filtered && <div className="payment-history__lifetime"><div><span>По поиску за всю историю</span><strong>{money(report.searchLifetime.received)}</strong></div><p>{payments(report.searchLifetime.payments)} · учтено {money(report.searchLifetime.applied)} · на проверке {money(report.searchLifetime.pending)}<br />Полная история найденных учеников: {money(report.lifetime.received)}, включая других плательщиков.</p></div>}
    <p className="payment-history__note">Суммы — в рублях, по сохранённым входящим уведомлениям. «Требует проверки» ещё не означает оплату занятий. Совпадающие имена учеников с разными профилями учитываются отдельно.{report.summary.foreignCurrency > 0 && ` ${report.summary.foreignCurrency} уведомлений в другой валюте не включены в рублёвые суммы.`}</p>
    <div className="payment-history__toolbar"><div className="payment-history__views" aria-label="Представление истории">{[['payments', <List size={15} />, 'Платежи'], ['people', <Users size={15} />, 'По людям'], ['months', <CalendarDays size={15} />, 'По месяцам']].map(([key, icon, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => { setView(key); setPage(1); }}>{icon}{label}</button>)}</div>
      {view === 'payments' && <label><span className="sr-only">Сортировка платежей</span><select aria-label="Сортировка платежей" value={filters.sort} onChange={event => change({ sort: event.target.value })}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="largest">Сначала крупные</option><option value="smallest">Сначала небольшие</option></select></label>}
    </div>
    {exportError && <p className="payment-history__error" role="alert">{exportError}</p>}
    {!items.length ? <div className="payment-history__empty">{loading ? 'Загружаем историю…' : report.total.notifications ? 'По этим фильтрам ничего не найдено.' : 'Уведомлений пока нет.'}{filtered && <button type="button" onClick={reset}>Показать всю историю</button>}</div> : <>
      <div className="payment-history__table" tabIndex={0} aria-label="История уведомлений"><table>
        {view === 'payments' ? <><thead><tr><th>Получено (Москва)</th><th>Плательщик / ученик</th><th>Сумма</th><th>Результат / занятия</th><th>Подключение</th></tr></thead><tbody>{visible.map(entry => <tr key={entry.id}><td>{date(entry.receivedAt || entry.createdAt)}</td><td><strong>{entry.senderName || 'Без имени'}</strong><span>{entry.studentName || 'Ученик не определён'}</span><button type="button" className="payment-history__text-button" onClick={() => { change({ personId: entry.personId }); setView('people'); }}>Статистика по человеку</button></td><td className="payment-history__amount">{entry.currency === 'RUB' ? money(entry.amount) : `${entry.amount} ${entry.currency}`}</td><td><span className="payment-history__badge" data-status={entry.status}>{statuses[entry.status]}</span>{entry.status === 'applied' && <p>{entry.markKeys.length ? `Отмечено ${count(entry.markKeys.length, ['занятие', 'занятия', 'занятий'])}` : 'Список занятий не сохранён'}</p>}<p className="payment-history__reason">{entry.reason}</p><details><summary>Уведомление и отметки</summary><p>{entry.title}</p><p>{entry.text}</p>{entry.markKeys.map(key => <code key={key}>{key}</code>)}<small>ID: {entry.id}</small></details></td><td>{auth(entry.authMode)}</td></tr>)}</tbody></>
          : view === 'people' ? <><thead><tr><th>Ученик / плательщики</th><th>По выборке</th><th>Вся история ученика</th><th>Учтено / на проверке</th><th>Оплачено занятий</th><th>Последняя оплата</th></tr></thead><tbody>{visible.map(person => <tr key={person.id}><td><strong>{person.name}</strong><span>{person.senders.join(', ') || 'Имя плательщика не сохранено'}</span>{!person.studentId && <small>Без привязки к ученику</small>}<button type="button" className="payment-history__text-button" onClick={() => { change({ personId: person.id }); setView('payments'); }}>Показать платежи</button><button type="button" className="payment-history__text-button" onClick={() => { setFilters({ ...initialFilters, personId: person.id }); setPage(1); setView('payments'); }}>Вся история</button></td><td className="payment-history__amount">{money(person.summary.received)}<small>{payments(person.summary.payments)}</small></td><td className="payment-history__amount">{money(person.lifetime.received)}<small>{payments(person.lifetime.payments)} · с {day(person.firstDay)}</small></td><td>{money(person.summary.applied)}<small>На проверке: {money(person.summary.pending)}</small></td><td>{person.summary.lessons}<small>{person.summary.counts.ignored} не учтено · {person.summary.counts.duplicate} повторов</small></td><td>{day(person.lastPaymentDay)}</td></tr>)}</tbody></>
            : <><thead><tr><th>Месяц (Москва)</th><th>Поступления</th><th>Учтено</th><th>На проверке</th><th>Платежей / учеников</th><th>Занятий</th></tr></thead><tbody>{visible.map(month => <tr key={month.month}><td><strong>{new Date(`${month.month}-01T12:00:00Z`).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', month: 'long', year: 'numeric' })}</strong></td><td>{money(month.received)}</td><td>{money(month.applied)}</td><td>{money(month.pending)}</td><td>{month.payments} / {month.students}</td><td>{month.lessons}</td></tr>)}</tbody></>}
      </table></div>
      <footer className="payment-history__pagination"><span>Показано {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, items.length)} из {items.length}</span><label>На странице<select aria-label="На странице" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option>25</option><option>50</option><option>100</option></select></label><div><button type="button" aria-label="Предыдущая страница оплат" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>{currentPage} / {pages}</span><button type="button" aria-label="Следующая страница оплат" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></footer>
    </>}
    <p className="payment-history__coverage">История уведомлений не заменяет выписку банка. Старые записи, удалённые до этого обновления, в итогах отсутствуют. Уведомления без привязки группируются по имени плательщика и имени ученика, поэтому это не подтверждённое число уникальных людей.</p>
  </section>;
}
