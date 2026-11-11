import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Pencil, Plus, Users, User } from 'lucide-react';
import { parentContacts } from '../services/studentParentContacts';
import { studentContacts } from '../services/studentContacts';
import { copyParentMessage, normalizeStudentParentContact, normalizeStudentContact, studentContactDraft, studentContactLinks } from '../utils/studentParentContact';
import StudentContactFields from './StudentContactFields';
import './StudentParentContact.css';

export default function StudentContact({ studentId, studentName = '', messageText = '', compact = false, kind = 'student' }) {
  const service = kind === 'parent' ? parentContacts : studentContacts;
  const person = kind === 'parent' ? 'родителя' : 'ученика';
  const normalizeValue = kind === 'parent' ? normalizeStudentParentContact : normalizeStudentContact;
  const ContactIcon = kind === 'parent' ? Users : User;
  const [contactState, setContactState] = useState(() => ({ studentId, kind, value: service.snapshot(studentId) }));
  const contact = contactState.studentId === studentId && contactState.kind === kind ? contactState.value : service.snapshot(studentId);
  const [loading, setLoading] = useState(true), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(()=>studentContactDraft()), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  useEffect(() => {
    let disposed = false;
    const update = () => setContactState({ studentId, kind, value: service.snapshot(studentId) });
    update(); setLoading(true); setError(''); setEditing(false); setCopied(false);
    const unsubscribe = service.subscribe(() => { if (!disposed) update(); });
    const load = () => service.load().then(() => { if (!disposed) { update(); setError(''); } })
      .catch(failure => { if (!disposed) setError(failure.message); }).finally(() => { if (!disposed) setLoading(false); });
    void load(); window.addEventListener('focus', load);
    return () => { disposed = true; unsubscribe(); window.removeEventListener('focus', load); };
  }, [studentId, kind, service]);
  useEffect(() => { setCopied(false); }, [messageText]);
  if (!studentId) return null;
  const edit = () => { setDraft(studentContactDraft(contact)); setEditing(true); setError(''); };
  const save = async (value) => {
    let normalized;
    try { normalized = normalizeValue(value); } catch (failure) { setError(failure.message); return; }
    setBusy(true); setError('');
    try { await service.save(studentId, normalized); setEditing(false); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  let safeContact;
  try { safeContact = normalizeValue(contact || {}); } catch { safeContact = null; }
  const links=studentContactLinks(safeContact);
  const hasMessage = Boolean(String(messageText || '').trim());
  return <section className={`student-parent-contact ${compact ? 'student-parent-contact--compact' : ''} ${kind === 'student' ? 'student-parent-contact--student' : ''}`}
    aria-label={`Контакт ${person}${studentName ? ` · ${studentName}` : ''}`} onClick={event => event.stopPropagation()}>
    {!compact && <strong className="student-parent-contact__heading"><ContactIcon size={16} />Контакт {person}{contact?.name ? ` · ${contact.name}` : ''}</strong>}
    <div className="student-parent-contact__actions">
      {safeContact?.url ? <>
        <a href={safeContact.url} target="_blank" rel="noopener noreferrer" className={hasMessage ? 'student-parent-contact__primary' : ''}
          onClick={() => { if (hasMessage) { setCopied(false); setError(''); void copyParentMessage(messageText).then(() => setCopied(true)).catch(failure => setError(failure.message)); } }}>
          {copied ? <Check size={14} /> : <ExternalLink size={14} />}
          {hasMessage ? 'Скопировать отчёт и открыть контакт' : `Открыть контакт ${person}`}
        </a>
        <button type="button" onClick={edit} aria-label={`Изменить контакт ${person}${studentName ? ` · ${studentName}` : ''}`} title={contact?.name || `Изменить контакт ${person}`}><Pencil size={14} /><span>Изменить</span></button>
      </> : <button type="button" onClick={edit} disabled={loading}><Plus size={14} />{loading ? `Контакт ${person}…` : `Добавить контакт ${person}`}</button>}
    </div>
    {(links.length>1||safeContact?.notes)&&<details className="student-parent-contact__more"><summary>{links.length>1?`Все контакты ${person} · ${links.length}`:`Заметка ${kind==='parent'?'о родителе':'об ученике'}`}</summary>
      <div className="student-parent-contact__channels">{links.map((link,index)=><a key={index} href={link.url} target="_blank" rel="noopener noreferrer" onClick={()=>{if(hasMessage)void copyParentMessage(messageText).then(()=>setCopied(true)).catch(failure=>setError(failure.message));}}><ExternalLink size={12}/><span>{link.label || `Контакт ${index+1}`}<small>{link.value || link.url}</small></span></a>)}</div>
      {safeContact?.notes&&<p className="student-parent-contact__notes">{safeContact.notes}</p>}
    </details>}
    {contact?.providedByStudent && <small>Контакт передал ученик.</small>}
    {hasMessage && safeContact?.url && <small>{copied ? 'Текст скопирован. Вставьте его в переписку и отправьте.' : 'Откроется сохранённый контакт. Текст отчёта скопируется для вставки в сообщение.'}</small>}
    {error && <div role="alert" className="student-parent-contact__error">{error}{!editing && <button type="button" onClick={() => { setLoading(true); void service.load(true).then(() => setError('')).catch(failure => setError(failure.message)).finally(() => setLoading(false)); }}>Повторить</button>}</div>}
    {editing && contactState.studentId === studentId && contactState.kind === kind && <form onSubmit={event => { event.preventDefault(); void save(draft); }} className="student-parent-contact__editor">
      <StudentContactFields value={draft} onChange={value=>{setDraft(value);setError('');}} kind={kind} busy={busy}/>
      <small>Для номера выберите Telegram или WhatsApp. Для MAX, VK и других соцсетей вставьте ссылку.</small>
      <small>Контакт виден только преподавателю.</small>
      <div className="student-parent-contact__actions"><button type="submit" disabled={busy} className="student-parent-contact__primary">{busy ? 'Сохраняем…' : 'Сохранить контакт'}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Отмена</button>
        {(contact?.url||contact?.notes||contact?.name) && <button type="button" disabled={busy} onClick={() => { void save({ name: '', url: '' }); }}>Убрать все контакты</button>}</div>
    </form>}
  </section>;
}
