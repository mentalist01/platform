import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CalendarDays, CheckCircle2, CreditCard, Plus, RefreshCcw, Sparkles, WalletCards, X } from 'lucide-react';
import { subscriptionApi } from '../services/learningSubscriptions';
import './LearningSubscriptions.css';

const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2 }).format(value);
const date = value => new Date(value).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });
const day = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date(value));
const clock = value => new Date(value).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
const labels = { active: 'Оплачено', scheduled: 'Следующий блок оплачен', awaiting_payment: 'Ожидает оплаты', expired: 'Нужно продлить', cancelled: 'Отменён' };

function SubscriptionModal({ title, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, select, button')?.focus();
    const key = event => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const controls = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="learning-subscriptions learning-subscriptions__modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="learning-subscriptions__card learning-subscriptions__modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      <div className="learning-subscriptions__row"><h3>{title}</h3><button type="button" aria-label="Закрыть" onClick={onClose}><X size={18} /></button></div>{children}
    </section></div>, document.body);
}

export function SubscriptionCard({ block, name, teacher = false, onPay, onRenew, onConsult, onUndo, onCancel, busy }) {
  return <article className="learning-subscriptions__card">
    <div className="learning-subscriptions__card-top"><span className="learning-subscriptions__eyebrow">{block.groupName}</span>
      <span className="learning-subscriptions__badge" data-status={block.status}>{block.payment && <CheckCircle2 size={13} />}{labels[block.status]}</span></div>
    <h3>{teacher ? name : block.tariff.title}</h3>{teacher && <p>{block.tariff.title}</p>}
    <span className="learning-subscriptions__price">{money(block.tariff.price)} <small style={{ fontSize: 13, color: 'var(--sub-muted)', fontWeight: 500 }}>за {block.tariff.lessonCount} {block.tariff.kind === 'recordings' ? 'записей' : 'уроков'}</small></span>
    <div className="learning-subscriptions__row"><strong>{block.tariff.kind === 'recordings' ? 'Доступно записей' : 'Проведено'} {block.completed} из {block.tariff.lessonCount}</strong><span>Осталось {block.remaining}</span></div>
    <div className="learning-subscriptions__progress" role="progressbar" aria-label="Проведённые занятия" aria-valuemin={0} aria-valuemax={block.tariff.lessonCount} aria-valuenow={block.completed}><span style={{ width: `${100 * block.completed / block.tariff.lessonCount}%` }} /></div>
    <p><CalendarDays size={14} style={{ display: 'inline', marginRight: 5 }} />{date(block.startsAt)} — {date(block.endsAt)}</p>
    {block.remaining > 0 && <p style={{ fontSize: 12 }}>Если уроки перенесут, срок доступа продлится.</p>}
    {!teacher && !block.payment && <p>Для активации нужна полная оплата блока. Реквизиты можно уточнить у преподавателя.</p>}
    {block.tariff.consultationCount > 0 && <p>Консультации: {block.consultationUsed} из {block.tariff.consultationCount} · по {block.tariff.consultationMinutes} минут</p>}
    {block.renewalRequestedAt && <div className="learning-subscriptions__notice">{teacher ? 'Ученик попросил продлить абонемент' : 'Преподаватель получил запрос на продление'}</div>}
    <div className="learning-subscriptions__actions">
      {teacher && !block.payment && block.status !== 'cancelled' && <button className="subscription-primary" disabled={busy} onClick={() => onPay(block)}><CreditCard size={15} />Подтвердить оплату</button>}
      {teacher && !block.payment && block.status !== 'cancelled' && <button disabled={busy} onClick={() => onCancel(block)}>Отменить</button>}
      {block.payment && <button disabled={busy || (!teacher && Boolean(block.renewalRequestedAt))} onClick={() => onRenew(block)}><ArrowRight size={15} />{teacher ? 'Следующий блок' : 'Продлить'}</button>}
      {teacher && block.status === 'active' && block.consultationUsed < block.tariff.consultationCount && <button disabled={busy} onClick={() => onConsult(block)}><Plus size={15} />Отметить консультацию</button>}
    </div>
    {teacher && block.consultations.filter(entry => !entry.cancelledAt).map(entry => <p key={entry.id} style={{ fontSize: 12 }}>{date(entry.heldAt)} · {entry.minutes} мин <button disabled={busy} onClick={() => onUndo(block, entry)}>Отменить отметку</button></p>)}
  </article>;
}

export default function TeacherSubscriptions({ teacherId, onChanged }) {
  const [data, setData] = useState(null); const [tab, setTab] = useState('blocks'); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [modal, setModal] = useState(null); const [draft, setDraft] = useState({}); const [filter, setFilter] = useState('');
  useEffect(() => { let stopped = false; subscriptionApi.list().then(value => { if (!stopped) { setData(value); setError(''); } }).catch(err => { if (!stopped) setError(err.message); }); return () => { stopped = true; }; }, [teacherId]);
  const run = async fn => { setBusy(true); setError(''); try { const value = await fn(); setData(value); setModal(null); onChanged?.(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const names = Object.fromEntries((data?.students || []).map(student => [student.id, student.name]));
  const group = data?.groups.find(entry => entry.id === draft.groupId);
  const tariff = data?.tariffs.find(entry => entry.id === draft.tariffId);
  const price = draft.price === '' || draft.price == null ? (draft.keepCurrentPrice && tariff?.id === 'group-main' ? (group?.pricePerLesson || 0) * 8 : tariff?.price || 0) : Number(draft.price);
  const openCreate = block => {
    const startsAt = new Date(Date.now() + 60_000).toISOString();
    const end = day(Date.now() + 28 * 86400_000);
    const lastStart = Math.max(0, ...(block?.lessons || []).map(lesson => Date.parse(lesson.startAt)));
    const nextDay = lastStart ? day(lastStart + 86400_000) : day(startsAt);
    setDraft({ studentId: block?.studentId || '', groupId: block?.groupId || '', tariffId: block?.tariff.id || 'group-main', startsAt: '', accessUntil: lastStart ? day(lastStart + 29 * 86400_000) : end, keepCurrentPrice: block ? Boolean(block.agreedLessonPrice) : true, price: block?.tariff.price ?? '', fallbackStart: nextDay });
    setError(''); setModal({ type: 'create', block });
  };
  const visible = (data?.blocks || []).filter(block => block.status !== 'cancelled' && (!filter || `${names[block.studentId]} ${block.groupName}`.toLocaleLowerCase('ru').includes(filter.toLocaleLowerCase('ru'))));
  const reminders = (data?.blocks || []).filter(block => block.status !== 'cancelled' && (block.status === 'awaiting_payment' || block.renewalNeeded || block.renewalRequestedAt)
    && !(data.blocks.some(next => next.studentId === block.studentId && next.groupId === block.groupId && Date.parse(next.startsAt) > Date.parse(block.startsAt) && next.status !== 'cancelled')));
  return <section className="learning-subscriptions">
    <div className="learning-subscriptions__hero"><span className="learning-subscriptions__eyebrow"><Sparkles size={14} style={{ display: 'inline', marginRight: 6 }} />Обучение блоками</span>
      <div className="learning-subscriptions__row"><div><h2>Абонементы и тарифы</h2><p>Один блок — восемь занятий. Оплата заранее, переносы сохраняют занятия.</p></div>
        <button className="subscription-primary" disabled={!data || busy} onClick={() => openCreate()}><Plus size={16} />Назначить абонемент</button></div>
      <div className="learning-subscriptions__notice">Действующие ставки сохраняются. Для группы за 900 ₽ блок стоит 7 200 ₽. Индивидуальные уроки продолжают учитываться по ставке ученика.</div>
      <div className="learning-subscriptions__tabs">{[['blocks', 'Абонементы'], ['payments', 'Платежи'], ['tariffs', 'Тарифы для нового набора']].map(([id, label]) => <button key={id} data-active={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    </div>
    {error && <div className="learning-subscriptions__error" role="alert">{error}</div>}
    {!data && !error && <p role="status">Загружаем абонементы…</p>}
    {!data && error && <button onClick={() => run(subscriptionApi.list)}><RefreshCcw size={15} />Повторить</button>}
    {data && tab === 'blocks' && <>
      {reminders.length > 0 && <div className="learning-subscriptions__notice"><strong>Требуют внимания: {reminders.length}</strong><p>Ожидают оплаты или заканчиваются блоки. {reminders.slice(0, 4).map(block => names[block.studentId]).join(', ')}.</p></div>}
      <label style={{ margin: '18px 0' }}>Поиск ученика или группы<input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Имя или название группы" /></label>
      <div className="learning-subscriptions__grid">{visible.map(block => <SubscriptionCard key={block.id} block={block} name={names[block.studentId]} teacher busy={busy}
        onPay={value => { setDraft({ amount: value.tariff.price, note: '', receivedAt: day(Date.now()) }); setError(''); setModal({ type: 'pay', block: value }); }}
        onRenew={openCreate} onConsult={value => { setDraft({ heldAt: day(Date.now()), requestId: crypto.randomUUID() }); setModal({ type: 'consultation', block: value }); }}
        onUndo={(value, entry) => { setDraft({ consultationId: entry.id }); setModal({ type: 'undo-consultation', block: value }); }}
        onCancel={value => { setDraft({}); setModal({ type: 'cancel', block: value }); }} />)}</div>
      {!visible.length && <div className="learning-subscriptions__card"><WalletCards size={26} color="#863ff3" /><h3 style={{ marginTop: 10 }}>Начните со следующего блока</h3><p>Назначьте абонемент ученику и подтвердите полную оплату. Нынешние занятия и платежи сохранятся.</p></div>}
    </>}
    {data && tab === 'tariffs' && <div className="learning-subscriptions__grid" style={{ marginTop: 18 }}>{data.tariffs.map(entry => <article className="learning-subscriptions__card" key={entry.id}>
      <span className="learning-subscriptions__eyebrow">{entry.kind === 'individual' ? 'Поурочная оплата' : entry.kind === 'recordings' ? 'Без живых занятий' : 'Мини-группа'}</span><h3>{entry.title}</h3><span className="learning-subscriptions__price">{money(entry.price)}</span>
      <p>{entry.kind === 'individual' ? 'Один урок · 60 минут' : `${entry.lessonCount} ${entry.kind === 'recordings' ? 'записей' : 'уроков'} · обычно четыре недели`}</p>{entry.consultationCount > 0 && <p>+ {entry.consultationCount} консультации по {entry.consultationMinutes} минут</p>}
      <p>Домашка, материалы, пробник месяца и отчёты.</p><button style={{ marginTop: 16 }} onClick={() => { setDraft({ title: entry.title, price: entry.price }); setError(''); setModal({ type: 'tariff', tariff: entry }); }}>Изменить тариф</button>
      {entry.kind === 'individual' && <button style={{ marginTop: 8 }} onClick={() => { setDraft({ studentId: '', price: entry.price }); setError(''); setModal({ type: 'individual', tariff: entry }); }}>Назначить ученику</button>}
    </article>)}</div>}
    {data && tab === 'payments' && <div className="learning-subscriptions__card" style={{ marginTop: 18 }}><span className="learning-subscriptions__eyebrow">Подтверждённые поступления</span>
      <h3>Оплаты абонементов</h3><p>Оплата учитывается один раз за весь блок. Повторно отмечать её как поурочный платёж не нужно.</p>
      <div style={{ overflowX: 'auto' }}><table className="learning-subscriptions__table"><thead><tr><th>Дата</th><th>Ученик</th><th>Абонемент</th><th>Сумма</th></tr></thead><tbody>{data.blocks.filter(block => block.payment).sort((a, b) => b.payment.receivedAt.localeCompare(a.payment.receivedAt)).map(block => <tr key={block.id}><td>{date(block.payment.receivedAt)}</td><td>{names[block.studentId]}</td><td>{block.tariff.title}<p>{block.groupName}</p></td><td>{money(block.payment.amount)}</td></tr>)}</tbody></table></div>
      {!data.blocks.some(block => block.payment) && <p>Подтверждённых оплат пока нет.</p>}</div>}
    {modal && <SubscriptionModal title={{ create: 'Новый блок занятий', pay: 'Подтверждение оплаты', tariff: 'Тариф для нового набора', individual: 'Индивидуальные условия ученика', consultation: 'Проведённая консультация', 'undo-consultation': 'Отменить отметку?', cancel: 'Отменить неоплаченный блок?' }[modal.type]} onClose={() => { if (!busy) setModal(null); }}>
      {error && <div className="learning-subscriptions__error" role="alert">{error}</div>}
      <form className="learning-subscriptions__form" onSubmit={event => { event.preventDefault();
        if (modal.type === 'create') run(() => subscriptionApi.create({ ...draft, price, startsAt: draft.startsAt || (draft.fallbackStart === day(Date.now()) ? new Date().toISOString() : `${draft.fallbackStart}T00:00:00+03:00`) }));
        else if (modal.type === 'tariff') run(() => subscriptionApi.tariff(modal.tariff.id, draft));
        else if (modal.type === 'individual') run(async () => { await subscriptionApi.individual(draft.studentId, Number(draft.price), day(Date.now()).slice(0, 7)); return subscriptionApi.list(); });
        else run(() => subscriptionApi.action(modal.block.id, modal.type, { ...draft, receivedAt: `${draft.receivedAt}T00:00:00+03:00`, heldAt: draft.heldAt === day(Date.now()) ? new Date().toISOString() : `${draft.heldAt}T12:00:00+03:00` }));
      }}>
        {modal.type === 'create' && <>
          <label>Ученик<select required value={draft.studentId} onChange={event => setDraft({ ...draft, studentId: event.target.value, groupId: '', startsAt: '' })}><option value="">Выберите ученика</option>{data.students.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
          <label>Группа<select required value={draft.groupId} onChange={event => setDraft({ ...draft, groupId: event.target.value, startsAt: '', price: '' })}><option value="">Выберите группу</option>{data.groups.filter(entry => entry.status !== 'completed' && entry.members.some(member => member.studentId === draft.studentId && member.status === 'active')).map(entry => <option key={entry.id} value={entry.id}>{entry.name} · {money(entry.pricePerLesson)} за урок</option>)}</select></label>
          <label>Тариф<select value={draft.tariffId} onChange={event => setDraft({ ...draft, tariffId: event.target.value, price: '' })}>{data.tariffs.filter(entry => entry.kind !== 'individual').map(entry => <option key={entry.id} value={entry.id}>{entry.title} · {money(entry.price)}</option>)}</select></label>
          {tariff?.id === 'group-main' && <label className="learning-subscriptions__checkbox"><input type="checkbox" checked={draft.keepCurrentPrice} onChange={event => setDraft({ ...draft, keepCurrentPrice: event.target.checked, price: '' })} />Сохранить нынешнюю ставку группы{group && `: ${money(group.pricePerLesson)} × 8`}</label>}
          <label>Первое занятие блока<select value={draft.startsAt} onChange={event => {
            const start = event.target.value; setDraft({ ...draft, startsAt: start, accessUntil: start ? day(Date.parse(start) + 28 * 86400_000) : draft.accessUntil });
          }}><option value="">По дате начала</option>{data.lessons.filter(lesson => lesson.groupId === draft.groupId && lesson.status !== 'cancelled' && Date.parse(lesson.startAt) > Date.now() && !data.blocks.some(block => block.studentId === draft.studentId && !block.cancelledAt && block.lessonIds.includes(lesson.id))).sort((a, b) => a.startAt.localeCompare(b.startAt)).map(lesson => <option key={lesson.id} value={lesson.startAt}>{date(lesson.startAt)} · {clock(lesson.startAt)} · {lesson.topic || 'Занятие'}</option>)}</select></label>
          {!draft.startsAt && <label>Дата начала<input type="date" required value={draft.fallbackStart} min={day(Date.now())} onChange={event => setDraft({ ...draft, fallbackStart: event.target.value, accessUntil: event.target.value ? day(Date.parse(`${event.target.value}T12:00:00+03:00`) + 28 * 86400_000) : draft.accessUntil })} /></label>}
          <label>Доступ до<input type="date" required value={draft.accessUntil} min={draft.startsAt ? day(draft.startsAt) : draft.fallbackStart} onChange={event => setDraft({ ...draft, accessUntil: event.target.value })} /></label>
          <label>Цена всего блока, ₽<input type="number" required min="1" step="0.01" value={price} onChange={event => setDraft({ ...draft, price: event.target.value, keepCurrentPrice: false })} /></label>
          <div className="learning-subscriptions__notice">{money(price)} за восемь {tariff?.kind === 'recordings' ? 'записей' : 'занятий'}. Блок активируется после подтверждения оплаты. Старые платежи и индивидуальная ставка не пересчитываются.</div>
        </>}
        {modal.type === 'pay' && <><p>{names[modal.block.studentId]} · {modal.block.groupName}</p><strong style={{ fontSize: 26 }}>{money(modal.block.tariff.price)}</strong><p>Подтверждайте только фактически полученную полную оплату.</p><label>Дата поступления<input type="date" required max={day(Date.now())} value={draft.receivedAt} onChange={event => setDraft({ ...draft, receivedAt: event.target.value })} /></label><label>Примечание<input maxLength={500} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label></>}
        {modal.type === 'tariff' && <><label>Название<input required maxLength={100} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><label>Стоимость, ₽<input type="number" required min={1} step="0.01" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} /></label><p>Новая цена применяется к будущим назначениям. Купленные блоки сохраняют свою цену.</p></>}
        {modal.type === 'individual' && <><label>Ученик<select required value={draft.studentId} onChange={event => setDraft({ ...draft, studentId: event.target.value })}><option value="">Выберите ученика</option>{data.students.map(student => <option key={student.id} value={student.id}>{student.name} · сейчас {student.individualPrice ? money(student.individualPrice) : 'ставка не указана'}</option>)}</select></label>
          <label>Стоимость урока, ₽<input type="number" required min={1} step="0.01" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} /></label><div className="learning-subscriptions__notice">Вы явно меняете ставку выбранного ученика на {money(draft.price)}. Прошедшие и уже оплаченные уроки сохраняют старую цену. Действующим ученикам за 2 000 ₽ назначать новый тариф не нужно.</div></>}
        {modal.type === 'consultation' && <><p>{names[modal.block.studentId]} · {modal.block.tariff.consultationMinutes} минут</p><label>Дата проведённой консультации<input type="date" required min={day(modal.block.startsAt)} max={day(Date.now())} value={draft.heldAt} onChange={event => setDraft({ ...draft, heldAt: event.target.value })} /></label></>}
        {modal.type === 'cancel' && <p>Неоплаченный блок будет отменён. Прежние ставки, занятия и оплаты останутся в истории.</p>}
        {modal.type === 'undo-consultation' && <p>Консультация снова станет доступна в этом абонементе.</p>}
        <div className="learning-subscriptions__actions"><button type="submit" className="subscription-primary" disabled={busy}>{busy ? 'Сохраняем…' : modal.type === 'pay' ? 'Оплата получена' : modal.type === 'create' ? 'Назначить блок' : 'Сохранить'}</button><button type="button" disabled={busy} onClick={() => setModal(null)}>Назад</button></div>
      </form>
    </SubscriptionModal>}
  </section>;
}

export function StudentSubscriptions({ studentId }) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false;
    const load = () => subscriptionApi.list().then(value => { if (!stopped) { setData(value); setError(''); } }).catch(err => { if (!stopped) setError(err.message); });
    load(); const timer = setInterval(load, 60_000); return () => { stopped = true; clearInterval(timer); };
  }, [studentId]);
  if (!data?.blocks.length) return error ? <p className="learning-subscriptions__error" role="status">Не удалось проверить абонемент. {error}</p> : null;
  const byGroup = new Map();
  data.blocks.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)).forEach(block => {
    byGroup.set(block.groupId, [...(byGroup.get(block.groupId) || []), block]);
  });
  const visible = [...byGroup.values()].flatMap(blocks => {
    const active = blocks.filter(block => block.status === 'active');
    const upcoming = blocks.filter(block => ['scheduled', 'awaiting_payment'].includes(block.status));
    return [...active, ...upcoming].length ? [...active, ...upcoming] : [blocks.at(-1)];
  });
  return <section className="learning-subscriptions learning-subscriptions__student" aria-label="Мой абонемент">
    <div className="learning-subscriptions__row" style={{ marginBottom: 12 }}><h3>Мой абонемент</h3><span className="learning-subscriptions__badge">Обучение блоками</span></div>
    {error && <div className="learning-subscriptions__error" role="alert">{error}</div>}
    <div className="learning-subscriptions__grid">{visible.map(block => <SubscriptionCard key={block.id} block={block} busy={busy} onRenew={async value => {
      setBusy(true); try { await subscriptionApi.action(value.id, 'renewal-request'); setData(await subscriptionApi.list()); setError(''); } catch (err) { setError(err.message); } finally { setBusy(false); }
    }} />)}</div>
  </section>;
}

export function TeacherSubscriptionReminder({ teacherId, paused, onOpen }) {
  const [data, setData] = useState(null); const [dismissed, setDismissed] = useState('');
  useEffect(() => {
    let stopped = false;
    const load = () => subscriptionApi.list().then(value => { if (!stopped) setData(value); }).catch(() => {});
    load(); const timer = setInterval(load, 5 * 60_000); return () => { stopped = true; clearInterval(timer); };
  }, [teacherId]);
  const reminders = (data?.blocks || []).filter(block => !block.cancelledAt && (block.renewalNeeded || block.renewalRequestedAt || block.status === 'awaiting_payment')
    && !data.blocks.some(next => next.studentId === block.studentId && next.groupId === block.groupId && !next.cancelledAt && Date.parse(next.startsAt) > Date.parse(block.startsAt)));
  const key = reminders.map(block => `${block.id}:${block.remaining}:${block.status}:${block.renewalRequestedAt}`).join('|');
  if (paused || !key || dismissed === key) return null;
  return <aside className="learning-subscriptions" aria-label="Продление абонементов"><div className="learning-subscriptions__notice learning-subscriptions__row">
    <div><strong>Абонементы требуют внимания: {reminders.length}</strong><p>Проверьте оплату и подготовьте следующие блоки занятий.</p></div>
    <div className="learning-subscriptions__actions"><button onClick={onOpen}>Открыть абонементы <ArrowRight size={15} /></button><button aria-label="Скрыть напоминание" onClick={() => setDismissed(key)}><X size={15} /></button></div>
  </div></aside>;
}
