import {useEffect, useState} from 'react';
import {Check, Copy, Link2, Send} from 'lucide-react';
import {api} from '../services/api';
import {studentContacts} from '../services/studentContacts';
import {copyParentMessage, normalizeStudentContact} from '../utils/studentParentContact';
import {DEFAULT_TRIAL_INVITATION, normalizeTrialMeetingUrl, normalizeTrialInvitationTemplate, trialInvitationMessage} from '../utils/trialInvitation.js';
import ContactMessengerIcon from './ContactMessengerIcon.jsx';

export function TrialInvitationButton({person, message, disabled}) {
  const [contact,setContact]=useState(()=>studentContacts.snapshot(person.id)),[copied,setCopied]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let disposed=false;
    const update=()=>{if(!disposed)setContact(studentContacts.snapshot(person.id));};
    update();const unsubscribe=studentContacts.subscribe(update);
    void studentContacts.load().then(update).catch(()=>{});
    return ()=>{disposed=true;unsubscribe();};
  },[person.id]);
  useEffect(()=>{setCopied(false);setError('');},[message,contact]);
  let url='';
  try{url=normalizeStudentContact(contact || {}).url;}catch{/* The Contacts editor can repair an incomplete record. */}
  if(!message || !url)return null;
  return <div className="trial-invitation__send">
    <a href={url} target="_blank" rel="noopener noreferrer" aria-disabled={disabled || undefined} className="trial-invitation__send-link"
      aria-label={`Отправить ссылку ученику: ${person.name}`} title="Скопировать сообщение и открыть чат ученика"
      onClick={event=>{if(disabled){event.preventDefault();return;}setCopied(false);setError('');void copyParentMessage(message).then(()=>setCopied(true)).catch(failure=>setError(failure.message));}}>
      {copied?<Check size={14}/>:<Send size={14}/>}Отправить ссылку<ContactMessengerIcon url={url} size={15}/>
    </a>
    {copied&&<small role="status">Текст скопирован — вставьте в чат и отправьте.</small>}
    {error&&<small role="alert">Не удалось скопировать текст. Скопируйте его из предпросмотра сообщения.</small>}
  </div>;
}

export default function TrialInvitation({teacherId,plan,selection,booking,busy,onBusyChange,onSaved}) {
  const [link,setLink]=useState(booking?.meetingUrl || ''),[template,setTemplate]=useState(plan.invitationTemplate || DEFAULT_TRIAL_INVITATION);
  const [editingTemplate,setEditingTemplate]=useState(false),[saving,setSaving]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const savedTemplate=plan.invitationTemplate || DEFAULT_TRIAL_INVITATION;
  const preview=trialInvitationMessage(savedTemplate,booking?.meetingUrl || '');
  const save=async kind=>{
    if(busy)return;
    let value;
    try{value=kind==='link'?normalizeTrialMeetingUrl(link):normalizeTrialInvitationTemplate(template);}catch(failure){setError(failure.message);return;}
    setSaving(kind);onBusyChange(true);setError('');setNotice('');
    try{
      const result=kind==='link'
        ?await api.saveTrialMeeting(teacherId,selection.slotId,selection.date,{meetingUrl:value,revision:booking?.revision || 0})
        :await api.saveTrialInvitationTemplate(teacherId,{template:value,revision:plan.revision});
      onSaved(result);
      if(kind==='link'){setLink(value);setNotice(value?'Ссылка сохранена для этого пробного.':'Ссылка убрана.');}
      else{setTemplate(value);setEditingTemplate(false);setNotice('Шаблон сохранён для всех ваших пробных.');}
    }catch(failure){setError(failure.message);}
    finally{setSaving('');onBusyChange(false);}
  };
  return <section className="trial-invitation" aria-label="Ссылка и сообщение для пробного">
    <label><span><Link2 size={15}/>Ссылка Телемоста для этого пробного</span><input type="url" value={link} disabled={busy} aria-label="Ссылка Телемоста для пробного" placeholder="https://telemost.yandex.ru/j/…" maxLength={2048} onChange={event=>{setLink(event.target.value);setError('');setNotice('');}}/></label>
    <div className="trial-invitation__tools"><button type="button" disabled={busy || link===(booking?.meetingUrl || '')} className="trial-slots__primary" onClick={()=>void save('link')}>{saving==='link'?'Сохраняем…':'Сохранить ссылку'}</button>
      <button type="button" disabled={busy} aria-expanded={editingTemplate} onClick={()=>{setEditingTemplate(value=>!value);setTemplate(savedTemplate);setError('');}}>Изменить шаблон сообщения</button>
    </div>
    {editingTemplate&&<div className="trial-invitation__template">
      <label>Общий шаблон для всех ваших пробных<textarea aria-label="Шаблон приглашения на пробное" rows={3} maxLength={4000} value={template} disabled={busy} onChange={event=>{setTemplate(event.target.value);setError('');}}/></label>
      <small>Вместо {'{ссылка}'} подставится ссылка выбранного пробного.</small>
      <button type="button" disabled={busy} onClick={()=>void save('template')}>{saving==='template'?'Сохраняем…':'Сохранить шаблон для всех пробных'}</button>
    </div>}
    {preview&&<details className="trial-invitation__preview"><summary>Текст сообщения</summary><p>{preview}</p><button type="button" onClick={()=>{setError('');void copyParentMessage(preview).then(()=>setNotice('Сообщение скопировано.')).catch(failure=>setError(failure.message));}}><Copy size={14}/>Скопировать текст</button></details>}
    {!booking?.meetingUrl&&<small>Сохраните ссылку — у участников с контактом ученика появится кнопка «Отправить ссылку».</small>}
    {notice&&<small role="status" className="trial-invitation__notice"><Check size={13}/>{notice}</small>}
    {error&&<p role="alert" className="trial-slots__error">{error} <button type="button" disabled={busy} onClick={()=>{onBusyChange(true);void api.getTrialSlots(teacherId).then(result=>{onSaved(result);setLink(result.bookings.find(row=>row.slotId===selection.slotId&&row.date===selection.date)?.meetingUrl || '');setTemplate(result.invitationTemplate || DEFAULT_TRIAL_INVITATION);setError('');}).catch(failure=>setError(failure.message)).finally(()=>onBusyChange(false));}}>Обновить окно</button></p>}
  </section>;
}
