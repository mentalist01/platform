import React, { useState } from 'react';
import { Bell, Volume2, X } from 'lucide-react';
import './LessonAlarmControls.css';

export function LessonAlarmNotice({ alarm }) {
  if (!alarm?.enabled) return null;
  const blocked = alarm.audioState !== 'running';
  if (!blocked && !alarm.ringing && !alarm.error) return null;
  return <div className="lesson-alarm-notice" role="status" data-ringing={Boolean(alarm.ringing)}>
    <Bell size={16} aria-hidden="true" />
    <span>{alarm.ringing
      ? `Через несколько минут занятие: ${alarm.ringing.title} · ${new Date(alarm.ringing.startMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}${alarm.ringing.simultaneousCount > 1 ? ` · сигналов: ${alarm.ringing.simultaneousCount}` : ''}`
      : blocked ? 'Будильник за 5 минут: включите звук в этой вкладке.' : alarm.error}</span>
    {blocked && <button type="button" onClick={alarm.test}><Volume2 size={14} />Включить и проверить звук</button>}
    {alarm.ringing && <button type="button" onClick={alarm.stop}><X size={14} />Остановить</button>}
  </div>;
}

export function LessonAlarmSettings({ alarm }) {
  const [urlDraft, setUrlDraft] = useState(null);
  const savedUrl = alarm?.url || '';
  const url = urlDraft?.savedUrl === savedUrl ? urlDraft.value : savedUrl;
  if (!alarm) return null;
  return <div className="lesson-alarm-settings">
    <div className="lesson-alarm-settings__row">
      <button type="button" aria-pressed={alarm.enabled} onClick={() => alarm.setEnabled(!alarm.enabled)}><Bell size={14} />{alarm.enabled ? 'Будильник: за 5 минут' : 'Будильник выключен'}</button>
      <button type="button" onClick={alarm.test}><Volume2 size={14} />Проверить звук</button>
      <button type="button" onClick={alarm.stop}>Остановить звук</button>
      <span>{!alarm.enabled ? '' : !alarm.loaded ? 'Загружаем расписание…' : alarm.audioState === 'running' ? 'Звук готов' : 'Нажмите «Проверить звук»'}</span>
    </div>
    <p>Работает во всех разделах платформы и в фоновой вкладке. Сигнал повторяется до отключения или начала занятия.</p>
    {alarm.next && <p>Сигнал по расписанию: {new Date(alarm.next.dueMs).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {alarm.next.title}</p>}
    <details><summary>Своя мелодия</summary><div className="lesson-alarm-settings__row">
      <label>Файл до 5 МБ<input type="file" accept="audio/*" onChange={(event) => { void alarm.setFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      {alarm.fileName && <button type="button" onClick={() => void alarm.setFile(null)}>Убрать: {alarm.fileName}</button>}
      <label>Ссылка на аудио<input type="url" value={url} placeholder="https://…/alarm.mp3" onChange={(e) => setUrlDraft({ savedUrl, value: e.target.value })} /></label>
      <button type="button" onClick={() => alarm.setUrl(url)}>Сохранить ссылку</button>
    </div></details>
    {alarm.soundNote && <p role="status">{alarm.soundNote}</p>}
    <p>Если браузер заблокировал звук, вкладка выгружена или компьютер спит, сигнал может не прозвучать. Проверка звука помогает убедиться, что вкладка готова.</p>
  </div>;
}
