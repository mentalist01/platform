import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ExternalLink, Gift, X } from 'lucide-react';
import { apiFetch, parseApiError } from '../services/api';
import './PythonGiftCourse.css';

export default function PythonCourseGiftShare() {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const request = async enabled => {
    const response = await apiFetch('/api/python-course-gift', enabled === undefined ? {} : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    if (!response.ok) throw Error(await parseApiError(response));
    return response.json();
  };
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setBusy(true); setError(''); setCopied(false); setShare(null);
    request().then(value => { if (!cancelled) setShare(value); }).catch(err => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setBusy(false); });
    dialogRef.current?.focus();
    const keys = event => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
      if (event.key === 'Tab') {
        const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), a[href], input')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keys, true);
    return () => { cancelled = true; document.removeEventListener('keydown', keys, true); };
  }, [open]);
  const update = async enabled => {
    setBusy(true); setError(''); setCopied(false);
    try { setShare(await request(enabled)); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const url = share?.path ? `https://ivan100.ru${share.path}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setError(''); }
    catch { inputRef.current?.focus(); inputRef.current?.select(); setError('Выделил ссылку — скопируйте её сочетанием Ctrl+C.'); }
  };
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  return <><button ref={triggerRef} className="gift-share-trigger" onClick={() => setOpen(true)}><Gift size={18} /> Подарить курс</button>{open && createPortal(<div className="gift-share-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section ref={dialogRef} tabIndex={-1} className="gift-share-dialog" role="dialog" aria-modal="true" aria-labelledby="gift-share-title"><button className="gift-share-close" aria-label="Закрыть" onClick={close}><X size={21} /></button><span className="gift-share-icon"><Gift size={29} /></span><span className="gift-eyebrow">ПОДЕЛИТЕСЬ ЗНАНИЯМИ</span><h2 id="gift-share-title">Python в подарок</h2><p>По ссылке человек сможет без регистрации смотреть объяснения и решать все задачи курса. Его код и прогресс будут сохраняться в его браузере.</p>
      {busy && <p role="status">Готовим ссылку…</p>}
      {share?.path && <><label htmlFor="gift-course-link">Ваша подарочная ссылка</label><div className="gift-share-link"><input id="gift-course-link" ref={inputRef} readOnly value={url} onFocus={event => event.target.select()} /><button disabled={busy || !share.enabled} onClick={copy} aria-label="Скопировать подарочную ссылку">{copied ? <Check size={19} /> : <Copy size={19} />}</button></div><div className="gift-share-state" role="status">{copied ? 'Ссылка скопирована — можно отправлять.' : share.enabled ? 'Ссылка работает. Её можно отправить нескольким людям.' : 'Доступ по ссылке приостановлен.'}</div></>}
      {error && <p className="gift-share-error" role="alert">{error}</p>}
      <div className="gift-share-actions">{share?.enabled ? <><button className="gift-primary" disabled={busy} onClick={copy}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button><a href={url} target="_blank" rel="noopener noreferrer">Посмотреть курс <ExternalLink size={16} /></a><button className="gift-share-pause" disabled={busy} onClick={() => update(false)}>Приостановить доступ по ссылке</button></> : <button className="gift-primary" disabled={busy || (!share && !error)} onClick={() => update(true)}><Gift size={18} />{share?.path ? 'Возобновить доступ' : 'Создать подарочную ссылку'}</button>}</div><small className="gift-share-footnote">Создавать ссылку и управлять доступом можете только вы. Личные данные учеников и ваш кабинет в курс не входят.</small>
    </section></div>, document.body)}</>;
}
