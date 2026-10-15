import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Pencil, Plus, Users } from 'lucide-react';
import { loadParentContacts, parentContactSnapshot, saveParentContact, subscribeParentContacts } from '../services/studentParentContacts';
import { copyParentMessage, normalizeStudentParentContact } from '../utils/studentParentContact';
import './StudentParentContact.css';

export default function StudentParentContact({ studentId, studentName = '', messageText = '', compact = false }) {
  const [contactState, setContactState] = useState(() => ({ studentId, value: parentContactSnapshot(studentId) }));
  const contact = contactState.studentId === studentId ? contactState.value : parentContactSnapshot(studentId);
  const [loading, setLoading] = useState(true), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: '', url: '' }), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  useEffect(() => {
    let disposed = false;
    const update = () => setContactState({ studentId, value: parentContactSnapshot(studentId) });
    update(); setLoading(true); setError(''); setEditing(false); setCopied(false);
    const unsubscribe = subscribeParentContacts(() => { if (!disposed) update(); });
    const load = () => loadParentContacts().then(() => { if (!disposed) { update(); setError(''); } })
      .catch(failure => { if (!disposed) setError(failure.message); }).finally(() => { if (!disposed) setLoading(false); });
    void load(); window.addEventListener('focus', load);
    return () => { disposed = true; unsubscribe(); window.removeEventListener('focus', load); };
  }, [studentId]);
  useEffect(() => { setCopied(false); }, [messageText]);
  if (!studentId) return null;
  const edit = () => { setDraft({ name: contact?.name || '', url: contact?.url || '' }); setEditing(true); setError(''); };
  const save = async (value) => {
    let normalized;
    try { normalized = normalizeStudentParentContact(value); } catch (failure) { setError(failure.message); return; }
    setBusy(true); setError('');
    try { await saveParentContact(studentId, normalized); setEditing(false); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  let safeContact;
  try { safeContact = normalizeStudentParentContact(contact || {}); } catch { safeContact = null; }
  let draftUrl = '';
  if (editing && draft.url.trim()) {
    try { draftUrl = normalizeStudentParentContact({ url: draft.url }).url; } catch { /* Show validation when the teacher saves. */ }
  }
  const hasMessage = Boolean(String(messageText || '').trim());
  return <section className={`student-parent-contact ${compact ? 'student-parent-contact--compact' : ''}`}
    aria-label={`Контакт родителя${studentName ? ` · ${studentName}` : ''}`} onClick={event => event.stopPropagation()}>
    {!compact && <strong className="student-parent-contact__heading"><Users size={16} />Контакт родителя{contact?.name ? ` · ${contact.name}` : ''}</strong>}
    <div className="student-parent-contact__actions">
      {safeContact?.url ? <>
        <a href={safeContact.url} target="_blank" rel="noopener noreferrer" className={hasMessage ? 'student-parent-contact__primary' : ''}
          onClick={() => { if (hasMessage) { setCopied(false); setError(''); void copyParentMessage(messageText).then(() => setCopied(true)).catch(failure => setError(failure.message)); } }}>
          {copied ? <Check size={14} /> : <ExternalLink size={14} />}
          {hasMessage ? 'Скопировать отчёт и открыть контакт' : 'Открыть контакт родителя'}
        </a>
        <button type="button" onClick={edit} aria-label={`Изменить контакт родителя${studentName ? ` · ${studentName}` : ''}`} title={contact?.name || 'Изменить контакт родителя'}><Pencil size={14} /><span>Изменить</span></button>
      </> : <button type="button" onClick={edit} disabled={loading}><Plus size={14} />{loading ? 'Контакт родителя…' : 'Добавить контакт родителя'}</button>}
    </div>
    {hasMessage && safeContact?.url && <small>{copied ? 'Текст скопирован. Вставьте его в переписку и отправьте.' : 'Откроется сохранённый контакт. Текст отчёта скопируется для вставки в сообщение.'}</small>}
    {error && <div role="alert" className="student-parent-contact__error">{error}{!editing && <button type="button" onClick={() => { setLoading(true); void loadParentContacts(true).then(() => setError('')).catch(failure => setError(failure.message)).finally(() => setLoading(false)); }}>Повторить</button>}</div>}
    {editing && contactState.studentId === studentId && <form onSubmit={event => { event.preventDefault(); void save(draft); }} className="student-parent-contact__editor">
      <label>Имя родителя · необязательно<input value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} maxLength={80} autoComplete="off" /></label>
      <label>Ссылка, @username или телефон<input value={draft.url} onChange={event => { setDraft(value => ({ ...value, url: event.target.value })); setError(''); }} maxLength={2048} placeholder="@username, +7 (999) 000-00-00 или ссылка" autoComplete="off" /></label>
      <small>Номер телефона и @username откроют Telegram. Для MAX и WhatsApp вставьте ссылку на контакт.</small>
      {draftUrl && <small className="student-parent-contact__preview">Будет сохранено: <span>{draftUrl}</span></small>}
      <small>Контакт виден только преподавателю.</small>
      <div className="student-parent-contact__actions"><button type="submit" disabled={busy} className="student-parent-contact__primary">{busy ? 'Сохраняем…' : 'Сохранить контакт'}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Отмена</button>
        {contact?.url && <button type="button" disabled={busy} onClick={() => { void save({ name: '', url: '' }); }}>Убрать контакт</button>}</div>
    </form>}
  </section>;
}
