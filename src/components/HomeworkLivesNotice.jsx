import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, MessageCircle, CalendarCheck, Handshake, Info } from 'lucide-react';
import './HomeworkLivesNotice.css';
import { ownParentContact } from '../services/studentParentContacts';
import { normalizeStudentParentContact } from '../utils/studentParentContact';

export default function HomeworkLivesNotice({ notice, resetsAt, onConfirm, preview = false, onClosePreview, parentContactAdded = false }) {
  const dialog = useRef(null), reading = useRef(null), firstControl = useRef(null), heading = useRef(null);
  const titleId = useId(), hintId = useId();
  const [step, setStep] = useState(0), [reachedEnd, setReachedEnd] = useState(false), [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [contactState, setContactState] = useState(preview ? parentContactAdded ? 'present' : 'missing' : 'loading');
  const [contact, setContact] = useState({ name: '', url: '' }), [contactLater, setContactLater] = useState(false), [contactRetry, setContactRetry] = useState(0);
  useEffect(() => {
    if (preview) return;
    let disposed = false; setContactState('loading');
    ownParentContact().then(value => { if (!disposed) setContactState(value.added ? 'present' : 'missing'); })
      .catch(() => { if (!disposed) setContactState('error'); });
    return () => { disposed = true; };
  }, [preview, contactRetry]);
  const checkEnd = () => {
    const node = reading.current;
    if (node && node.scrollTop + node.clientHeight >= node.scrollHeight - 8) setReachedEnd(true);
  };
  useLayoutEffect(() => {
    const node = dialog.current, previous = document.activeElement;
    const preventCancel = event => event.preventDefault();
    const keepOpen = () => { if (node.isConnected && !node.open) node.showModal(); };
    const preventEscape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); } };
    node.addEventListener('cancel', preventCancel);
    node.addEventListener('keydown', preventEscape, true);
    node.addEventListener('close', keepOpen);
    node.showModal(); heading.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      node.removeEventListener('cancel', preventCancel); node.removeEventListener('keydown', preventEscape, true); node.removeEventListener('close', keepOpen);
      node.close(); document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    if (step) return;
    checkEnd();
    const observer = new ResizeObserver(checkEnd);
    if (reading.current) { observer.observe(reading.current); if (reading.current.firstElementChild) observer.observe(reading.current.firstElementChild); }
    return () => observer.disconnect();
  }, [step]);
  useEffect(() => {
    if (step) firstControl.current?.focus({ preventScroll: true });
  }, [step]);
  const confirm = async event => {
    event.preventDefault();
    if (answer !== 'plan' || busy) return;
    setBusy(true); setError('');
    try {
      if (contactState === 'loading' || contactState === 'error') throw new Error('Не удалось проверить контакт родителя. Нажми «Повторить».');
      if (contactState === 'missing' && !contactLater) {
        const normalized = normalizeStudentParentContact(contact);
        if (!normalized.url) throw new Error('Укажи телефон или ссылку на контакт родителя.');
        if (!preview) await ownParentContact(normalized);
        setContactState('present');
      }
      await onConfirm(notice);
    }
    catch (failure) { setError(failure.message || 'Не удалось сохранить подтверждение. Попробуй ещё раз.'); }
    finally { setBusy(false); }
  };
  const resetDate = resetsAt && Number.isFinite(Date.parse(resetsAt))
    ? new Date(resetsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' }) : '1-го числа';
  return createPortal(<dialog ref={dialog} className="lives-notice" aria-labelledby={titleId} aria-describedby={hintId}
    onCancel={event => event.preventDefault()}>
    <div className="lives-notice__surface">
      {preview && <div className="lives-notice__preview"><span>Предпросмотр · так увидит ученик</span><button type="button" onClick={onClosePreview}>Закрыть просмотр</button></div>}
      <header className="lives-notice__header">
        <div className="lives-notice__eyebrow">ДОМАШНЯЯ РАБОТА · ЕГЭ</div>
        <div className="lives-notice__hearts" aria-label="Осталось 0 из 3 жизней">
          {[0, 1, 2].map(value => <span key={value} className="homework-pixel-life homework-pixel-life--empty" aria-hidden="true"><span className="homework-pixel-life__shape" /></span>)}<b>0 <span>/ 3</span></b>
        </div>
        <h2 id={titleId} ref={heading} tabIndex={-1}>{step ? 'Договоримся о следующем шаге' : 'Жизни на этот месяц закончились'}</h2>
        <p id={hintId}>{step ? 'Один важный момент, прежде чем вернуться к занятиям.' : 'Давай разберёмся, что мешает с домашкой, и вернёмся в рабочий ритм.'}</p>
      </header>
      {!step ? <>
        <div ref={reading} className="lives-notice__reading" onScroll={checkEnd} tabIndex={0} aria-label="Что произойдёт дальше" >
          <div>
            <div className="lives-notice__safe"><Info size={18} /><p><b>Занятия не прекращаются автоматически.</b> Сначала — разговор и понятный план, а не наказание без объяснения.</p></div>
            <ol className="lives-notice__steps">
              <li><span><MessageCircle size={20} /></span><div><h3>Сначала поговорим</h3><p>Преподаватель обсудит с тобой и родителями, почему домашка не получается. Можно честно сказать, если сложно, не хватает времени или непонятна тема.</p></div></li>
              <li><span><CalendarCheck size={20} /></span><div><h3>Составим посильный план</h3><p>Вместе договоритесь, что и к какому сроку делать в следующем месяце. Твоя задача — придерживаться этого плана и вовремя говорить о трудностях.</p></div></li>
              <li><span><Handshake size={20} /></span><div><h3>Если договорённости снова нарушаются</h3><p>При регулярном повторении ситуации преподаватель может предложить паузу в занятиях. Это обсуждается отдельно.</p></div></li>
            </ol>
            <p className="lives-notice__reset">Сердца восстановятся <b>{resetDate}</b>. Договорённости при этом сохраняются. Если списание ошибочное, попроси преподавателя его проверить.</p>
          </div>
        </div>
        <footer className="lives-notice__footer"><span>{reachedEnd ? 'Теперь — короткое подтверждение главного' : 'Прочитай объяснение до конца ↓'}</span><button ref={firstControl} className="lives-notice__primary" type="button" disabled={!reachedEnd} onClick={() => setStep(1)}>Что мне нужно сделать <ArrowRight size={17} /></button></footer>
      </> : <form onSubmit={confirm} className="lives-notice__confirmation">
        <fieldset disabled={busy}><legend>Что будет следующим шагом?</legend>
          <label className={answer === 'plan' ? 'is-selected' : ''}><input ref={firstControl} type="radio" name="next-step" value="plan" checked={answer === 'plan'} onChange={event => setAnswer(event.target.value)} /><span>Обсудить трудности с преподавателем и родителями и договориться о плане.</span>{answer === 'plan' && <Check size={20} />}</label>
          <label className={answer === 'wait' ? 'is-selected' : ''}><input type="radio" name="next-step" value="wait" checked={answer === 'wait'} onChange={event => setAnswer(event.target.value)} /><span>Просто дождаться новых сердец — больше ничего не нужно.</span></label>
        </fieldset>
        <p className="lives-notice__feedback" aria-live="polite">{answer === 'wait' ? 'Сердца восстановятся, но разговор и договорённости всё равно нужны. Вернись к объяснению или выбери следующий шаг.' : answer === 'plan' ? 'Верно. Сначала вместе разберётесь в причинах и выберете посильный план.' : 'Выбери ответ — кнопка подтверждения станет доступна.'}</p>
        {contactState === 'missing' && <section className="lives-notice__parent" aria-label="Контакт родителя"><h3>Как связаться с родителем?</h3><p>У преподавателя пока нет контакта твоего родителя. Передай его здесь — преподаватель свяжется с ним и обсудит, как помочь с занятиями.</p><label>Имя родителя<input value={contact.name} maxLength={80} disabled={busy || contactLater} autoComplete="off" onChange={event => setContact(value => ({ ...value, name: event.target.value }))} placeholder="Как обратиться к маме или папе" /></label><label>Телефон, @username или ссылка<input value={contact.url} maxLength={2048} disabled={busy || contactLater} required={!contactLater} autoComplete="off" onChange={event => setContact(value => ({ ...value, url: event.target.value }))} placeholder="+7 999 000-00-00 или ссылка на контакт" /></label><small>Данные увидит только твой преподаватель. Телефон и @username открываются в Telegram; для WhatsApp или MAX укажи ссылку.</small><label className="lives-notice__parent-later"><input type="checkbox" checked={contactLater} disabled={busy} onChange={event => setContactLater(event.target.checked)} />Сейчас не могу указать контакт — передам преподавателю на уроке.</label></section>}
        {contactState === 'loading' && <p className="lives-notice__feedback" role="status">Проверяем, есть ли контакт родителя…</p>}
        {contactState === 'error' && <p className="lives-notice__error" role="alert">Не удалось проверить контакт родителя. <button type="button" onClick={() => setContactRetry(value => value + 1)}>Повторить</button></p>}
        {contactState === 'present' && <p className="lives-notice__feedback">Контакт родителя уже есть у преподавателя — повторно вводить его не нужно.</p>}
        {error && <p role="alert" className="lives-notice__error">{error}</p>}
        <footer className="lives-notice__footer"><button className="lives-notice__back" type="button" disabled={busy} onClick={() => setStep(0)}><ArrowLeft size={16} /> Прочитать ещё раз</button><button type="submit" className="lives-notice__primary" disabled={answer !== 'plan' || busy || contactState === 'loading' || contactState === 'error'}>{busy ? 'Сохраняем…' : contactState === 'missing' && !contactLater ? 'Передать контакт и продолжить' : 'Я понял, что делать'}<Check size={17} /></button></footer>
      </form>}
    </div>
  </dialog>, document.body);
}
