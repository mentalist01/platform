import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Code2, Headphones, LayoutDashboard, Loader2, LogOut, Megaphone, Mic, Plus, Users } from 'lucide-react';
import { api } from '../services/api';
import CallSection from './CallSection';
import './GroupVoiceChannels.css';

export default function GroupVoiceChannels({ lesson, user, students, theme, visible, onOpenCall, onOpenBoard, onOpenCollab, onBack }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [connectionKey, setConnectionKey] = useState(0);
  const [callStatus, setCallStatus] = useState('idle');
  const [channelName, setChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState('');
  const micPreferenceRef = useRef(true);
  const [notice, setNotice] = useState('');
  const refreshRef = useRef(null);
  const isTeacher = user.role === 'teacher' || user.role === 'admin';
  const { groupId, lessonId } = lesson;

  useEffect(() => {
    let active = true;
    let timeout;
    let pending = false;
    const refresh = async () => {
      if (pending || !active) return;
      pending = true;
      clearTimeout(timeout);
      try {
        const next = await api.getLearningVoiceChannels(groupId, lessonId);
        if (!active) return;
        setSnapshot(next);
        setLoadError('');
        setSelectedId((current) => (next.canJoin && next.channels?.some((channel) => channel.id === current) ? current : ''));
      } catch (error) {
        if (active) setLoadError(error?.message || 'Не удалось обновить голосовые каналы.');
      } finally {
        pending = false;
        if (active) timeout = setTimeout(refresh, 3000);
      }
    };
    refreshRef.current = refresh;
    void refresh();
    return () => {
      active = false;
      clearTimeout(timeout);
      refreshRef.current = null;
    };
  }, [groupId, lessonId]);

  const leave = useCallback(() => {
    setSelectedId('');
    setCallStatus('idle');
    setNotice('Вы вышли из голосового канала.');
  }, []);

  const join = (channelId) => {
    if (!snapshot?.canJoin) return;
    if (selectedId === channelId && callStatus !== 'idle') return;
    setSelectedId(channelId);
    setConnectionKey((key) => key + 1);
    setCallStatus('connecting');
    setNotice('');
  };

  const createChannel = async (event) => {
    event.preventDefault();
    if (!channelName.trim() || creating) return;
    setCreating(true);
    setActionError('');
    try {
      await api.createLearningVoiceChannel(groupId, lessonId, channelName.trim());
      setChannelName('');
      setNotice('Канал создан. Он будет доступен и на следующих занятиях группы.');
      await refreshRef.current?.();
    } catch (error) {
      setActionError(error?.message || 'Не удалось создать канал.');
    } finally {
      setCreating(false);
    }
  };

  const rememberMic = useCallback((enabled) => { micPreferenceRef.current = enabled; }, []);
  const onChannelMove = useCallback(({ channelId, mode, micEnabled }) => {
    micPreferenceRef.current = micEnabled;
    setSelectedId(channelId);
    setConnectionKey(key => key + 1);
    setCallStatus('connecting');
    setNotice(mode === 'general' ? 'Преподаватель собрал группу в общем канале.' : 'Преподаватель перевёл вас в ваш канал.');
    void refreshRef.current?.();
  }, []);
  const moveAll = async (mode) => {
    if (moving) return;
    setMoving(mode);
    setActionError('');
    try {
      const result = await (mode === 'general' ? api.gatherLearningVoiceChannels : api.distributeLearningVoiceChannels)(groupId, lessonId);
      if (mode === 'general') join('general');
      setNotice(`Переключаем учеников: ${result.movedCount}. ${mode === 'general' ? 'Собираемся в общем канале.' : 'Каждый переходит в канал со своим именем.'}`);
      await refreshRef.current?.();
    } catch (error) {
      setActionError(error?.message || 'Не удалось переключить каналы.');
    } finally {
      setMoving('');
    }
  };

  const channels = snapshot?.channels || [];
  const selected = channels.find((channel) => channel.id === selectedId);
  const canConnect = snapshot?.canJoin;
  const statusLabel = callStatus === 'connected' ? 'Вы в канале' : callStatus === 'connecting' ? 'Подключение…' : 'Связь отключена';

  return (
    <div className="group-voice" data-theme={theme}>
      <div hidden={!visible}>
        <header className="group-voice__header">
          <div>
            <span className="group-voice__eyebrow"><Headphones size={16} /> Голосовые каналы</span>
            <h2>{lesson.groupName || 'Групповое занятие'}</h2>
            <p>{lesson.topic || 'Совместная практика'} · {lesson.participantIds?.length || 0} учеников</p>
          </div>
          <div className="group-voice__tools">
            <button type="button" onClick={onOpenBoard}><LayoutDashboard size={17} /> Доска</button>
            <button type="button" onClick={onOpenCollab}><Code2 size={17} /> Редактор</button>
            <button type="button" onClick={onBack}><ArrowLeft size={17} /> Выйти из занятия</button>
          </div>
        </header>
        {(loadError || actionError) && <p className="group-voice__error" role="alert">{actionError || loadError}</p>}
        {notice && <p className="group-voice__notice" role="status">{notice}</p>}
        {snapshot && !canConnect && <p className="group-voice__notice">{snapshot.joinError || 'Голосовая связь недоступна для завершённого занятия.'}</p>}
        <div className="group-voice__layout">
          <aside className="group-voice__sidebar" aria-label="Голосовые каналы занятия">
            <div className="group-voice__sidebar-title"><Users size={17} /> Каналы группы</div>
            {!snapshot && !loadError && <p className="group-voice__loading"><Loader2 size={18} className="animate-spin" /> Загружаем каналы…</p>}
            <div className="group-voice__channels">
              {channels.map((channel) => {
                const active = selectedId === channel.id;
                const participants = channel.participants || [];
                return (
                  <div className={`group-voice__channel ${active ? 'is-active' : ''}`} key={channel.id}>
                    <button type="button" disabled={!canConnect} onClick={() => join(channel.id)} aria-pressed={active} aria-label={`Войти в канал ${channel.name}`}>
                      <Mic size={18} />
                      <span><strong>{channel.name}</strong><small>{active ? statusLabel : channel.studentId === user.id ? 'Ваш канал' : 'Нажмите, чтобы войти'}</small></span>
                      <span className="group-voice__count">{participants.length}</span>
                    </button>
                    {participants.length > 0 && <ul>{participants.map((participant) => (
                      <li key={participant.userId}><i />{participant.name || 'Участник'}{participant.role === 'teacher' ? ' · преподаватель' : ''}{participant.isScreenSharing ? ' · экран' : ''}</li>
                    ))}</ul>}
                  </div>
                );
              })}
            </div>
            {isTeacher && canConnect && (
              <>
                <button type="button" className="group-voice__gather" onClick={() => moveAll('individual')} disabled={Boolean(moving)}>
                  <Users size={17} /> {moving === 'individual' ? 'Переключаем…' : 'Распределить по каналам'}
                </button>
                <button type="button" className="group-voice__gather" onClick={() => moveAll('general')} disabled={Boolean(moving)}>
                  <Megaphone size={17} /> {moving === 'general' ? 'Собираем…' : 'Собрать в общий'}
                </button>
                <p className="group-voice__hint">Переключаются ученики, уже подключённые к голосу. Выключенный микрофон останется выключенным.</p>
                <form onSubmit={createChannel} className="group-voice__create">
                  <label htmlFor="voice-channel-name">Дополнительный канал</label>
                  <input id="voice-channel-name" value={channelName} onChange={(event) => setChannelName(event.target.value)} maxLength={60} placeholder="Например, работа в паре" />
                  <button type="submit" disabled={creating || !channelName.trim()}><Plus size={17} /> {creating ? 'Создаём…' : 'Создать канал'}</button>
                </form>
              </>
            )}
            <p className="group-voice__hint">Слышны только участники выбранного канала. Все участники занятия могут переходить между каналами.</p>
          </aside>
          <main className="group-voice__main">
            {selected && canConnect ? (
              <div className="group-voice__current">
                <span><Headphones size={18} /><strong>{selected.name}</strong></span>
                <button type="button" onClick={leave}><LogOut size={17} /> Выйти из канала</button>
              </div>
            ) : (
              <div className="group-voice__empty">
                <Headphones size={42} />
                <h3>Выберите голосовой канал</h3>
                <p>Соберитесь в общем канале для разбора или перейдите в отдельный для работы с преподавателем.</p>
                <button type="button" disabled={!canConnect} onClick={() => join('general')}>Войти в общий канал</button>
                <small>Микрофон включится после подключения. Камера — по желанию.</small>
              </div>
            )}
            {/* Keep the call mounted when opening the board or editor. A channel
                change remounts it so all old media tracks and peers are closed. */}
            {selected && canConnect && (
              <CallSection
                key={`${selected.id}:${connectionKey}`}
                role={user.role} userId={user.id} userName={user.name} userAvatarDataUrl={user.avatarDataUrl}
                teacherId={user.role === 'teacher' ? user.id : user.teacherId}
                students={students} lessonId={lessonId} groupId={groupId} channelId={selected.id}
                participantIds={lesson.participantIds} hideStudentPicker theme={theme}
                autoStartToken={1} onStatusChange={setCallStatus}
                initialMicEnabled={micPreferenceRef.current} onMicStateChange={rememberMic} onChannelMove={onChannelMove}
                uiMode={visible ? 'full' : 'collapsed'} onRequestOpenCall={onOpenCall}
              />
            )}
          </main>
        </div>
      </div>
      {!visible && selected && canConnect && (
        <div className="group-voice__dock">
          <Headphones size={18} /><span>{selected.name}<small>{statusLabel}</small></span>
          <button type="button" onClick={onOpenCall}>Каналы</button>
          <button type="button" onClick={leave} aria-label="Выйти из голосового канала"><LogOut size={18} /></button>
        </div>
      )}
    </div>
  );
}
