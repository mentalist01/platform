import { useId, useState } from 'react';
import { Check, ChevronDown, ClipboardCopy, RefreshCcw, Users } from 'lucide-react';
import { buildGroupSchedulesText, MESSAGE_GROUP_TOPIC_MIN_SOLVES } from '../utils/messageTemplates.js';
import { copyParentMessage } from '../utils/studentParentContact.js';

export default function GroupSchedulesShare({ groups = [], loading = false, error = '', onRefresh }) {
  const [selectedIds, setSelectedIds] = useState(null);
  const [notice, setNotice] = useState('');
  const [copying, setCopying] = useState(false);
  const titleId = useId();
  const availableIds = groups.filter(group => group.scheduleText).map(group => group.id);
  const selected = availableIds.filter(id => selectedIds === null || selectedIds.includes(id));
  const copy = async () => {
    if (loading || error || copying || !selected.length) return;
    setCopying(true); setNotice('');
    try {
      await copyParentMessage(buildGroupSchedulesText(groups, selected));
      setNotice('Скопированы только дни и время. Можно вставлять ученику.');
    } catch (failure) { setNotice(failure.message || 'Не удалось скопировать. Выделите расписания вручную.'); }
    finally { setCopying(false); }
  };
  const changeSelection = ids => { setSelectedIds(ids); setNotice(''); };
  const copySelection = event => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const ids = [...event.currentTarget.querySelectorAll('[data-group-schedule]')]
      .filter(node => selection.containsNode(node, true)).map(node => node.dataset.groupSchedule);
    const text = buildGroupSchedulesText(groups, ids);
    if (!text || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
  };

  return <details className="group-schedules-share" open aria-labelledby={titleId}>
    <summary><span><Users size={19} /><strong id={titleId}>Расписания групп для нового ученика</strong></span><ChevronDown size={18} /></summary>
    <div className="group-schedules-share__body">
      <p>От начальных тем Python к продвинутым. Учитываем тему, в которой участники решили хотя бы {MESSAGE_GROUP_TOPIC_MIN_SOLVES} разных задач. Серые пометки видны только вам.</p>
      <div className="group-schedules-share__tools">
        <button type="button" disabled={loading || !availableIds.length} onClick={() => changeSelection(availableIds)}>Выбрать все</button>
        <button type="button" disabled={loading || !selected.length} onClick={() => changeSelection([])}>Снять выбор</button>
        <button type="button" disabled={loading} onClick={onRefresh}><RefreshCcw size={14} />Обновить</button>
        <small>Время московское</small>
      </div>
      {loading && <p role="status">Проверяем расписания и прогресс групп…</p>}
      {error && <p className="message-templates__warning" role="alert">{error}</p>}
      {!loading && !error && !groups.length && <p>Активных групп пока нет.</p>}
      <div className="group-schedules-share__list" onCopy={copySelection} aria-busy={loading}>
        {groups.map((group, index) => <div className="group-schedules-share__row" key={group.id}>
          <label className="group-schedules-share__choice">
            <input type="checkbox" checked={selected.includes(group.id)} disabled={loading || Boolean(error) || !group.scheduleText}
              aria-label={'Включить расписание: ' + group.name}
              onChange={event => changeSelection(event.target.checked ? [...selected, group.id] : selected.filter(id => id !== group.id))} />
            <span className="group-schedules-share__group">{group.name}</span>
          </label>
          <div className="group-schedules-share__content">
            {group.scheduleText ? <span className="group-schedules-share__schedule" data-group-schedule={group.id}>{group.scheduleText}</span> : <span className="group-schedules-share__meta">Расписание ещё не задано</span>}
            <span className="group-schedules-share__meta" title={group.memberCount ? `Последняя тема с ${MESSAGE_GROUP_TOPIC_MIN_SOLVES}+ решениями. Решено в теме: ${group.topicCovered}.` : 'В группе нет активных учеников'}>
              ({group.memberCount ? group.topicTitle : 'Нет активных учеников'})
            </span>
          </div>
          <button type="button" className="group-schedules-share__through" disabled={loading || Boolean(error) || !group.scheduleText}
            onClick={() => changeSelection(groups.slice(0, index + 1).filter(row => row.scheduleText).map(row => row.id))}
            aria-label={'Выбрать расписания до ' + group.name + ' включительно'}>Выбрать до этой</button>
        </div>)}
      </div>
      <footer><button type="button" className="message-templates__primary" disabled={loading || Boolean(error) || copying || !selected.length} onClick={copy}>
        <ClipboardCopy size={16} />Копировать расписания{selected.length ? ' · ' + selected.length : ''}
      </button><span className="group-schedules-share__hint">В сообщении останутся только дни и время.</span></footer>
      {notice && <p role="status" className="group-schedules-share__status"><Check size={14} />{notice}</p>}
    </div>
  </details>;
}
