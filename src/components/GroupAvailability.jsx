import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCheck, ChevronLeft, Clock3, Heart, Loader2, LockKeyhole, MessageCircle, Plus, RefreshCw, Send, Sparkles, Users, X } from 'lucide-react';
import { api } from '../services/api';
import { AVAILABILITY_DAYS, AVAILABILITY_DAY_NAMES, availabilitySlots, clockTime, moscowDay, addCalendarDays, rankedSlots, slotLabel, slotPeople, suggestedPair } from '../utils/groupAvailability';
import './GroupAvailability.css';

const labels = { yes: 'Удобно', maybe: 'Могу подстроиться', no: 'Не подходит', pending: 'Ждём ответ' };
const initials = name => name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const dateLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const defaultConfig = () => ({ startDate: addCalendarDays(moscowDay(), 1), durationMinutes: 60, startMinute: 600, endMinute: 1260, days: [0, 1, 2, 3, 4, 5, 6] });
const Avatar = ({ member, index = 0 }) => <span className={`ga-avatar ga-avatar-${index % 5}`} title={member.name}>{initials(member.name)}</span>;

export default function GroupAvailability({ groupId, userId, isTeacher, onApproved, transport = api.groupAvailability }) {
  const [data, setData] = useState(null); const dataRef = useRef(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); const alive = useRef(true); const loading = useRef(false);
  const generation = useRef(0); const proposalRef = useRef('');
  const composeBase = useRef(''); const refreshFailed = useRef(false);
  const [setup, setSetup] = useState(false); const [config, setConfig] = useState(defaultConfig);
  const [draft, setDraft] = useState({}); const dirty = useRef(false); const [changed, setChanged] = useState(false);
  const myVersion = useRef(0); const round = useRef('');
  const [brush, setBrush] = useState('yes'); const [day, setDay] = useState(0); const [focusSlot, setFocusSlot] = useState('');
  const [composing, setComposing] = useState(false); const [pair, setPair] = useState([]); const [comment, setComment] = useState(''); const [voteComment, setVoteComment] = useState('');
  const apply = useCallback(next => {
    dataRef.current = next; setData(next);
    const poll = next.poll;
    if (poll?.status === 'approved') { dirty.current = false; setChanged(false); }
    if (proposalRef.current !== (poll?.proposal?.id || '')) {
      proposalRef.current = poll?.proposal?.id || ''; setVoteComment(poll?.proposal?.votes[userId]?.comment || '');
    }
    if (round.current !== (poll?.id || '')) {
      round.current = poll?.id || ''; dirty.current = false; setChanged(false); setComposing(false); setPair([]); setFocusSlot('');
      if (poll) setDay(poll.config.days[0]);
    }
    if (!dirty.current) { setDraft(poll?.answers[userId]?.choices || {}); myVersion.current = poll?.answers[userId]?.version || 0; }
  }, [userId]);
  const refresh = useCallback(async () => {
    if (loading.current || busyRef.current) return;
    loading.current = true;
    const version = generation.current;
    try { const next = await transport(groupId); if (alive.current && !busyRef.current && version === generation.current) {
      apply(next); if (refreshFailed.current) { refreshFailed.current = false; setError(''); }
    } }
    catch (e) { if (alive.current && version === generation.current) { refreshFailed.current = true; setError(e.message); } }
    finally { loading.current = false; }
  }, [apply, groupId, transport]);
  useEffect(() => {
    alive.current = true; void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    return () => { alive.current = false; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    const warn = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const act = async (action, body, success) => {
    if (busyRef.current) return;
    generation.current++;
    refreshFailed.current = false;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await transport(groupId, action, body);
      if (!alive.current) return;
      if (['answer', 'open'].includes(action)) { dirty.current = false; setChanged(false); }
      apply(result); setNotice(success || 'Сохранено');
      if (action === 'open') setSetup(false);
      if (action === 'propose') { setComposing(false); setPair([]); setComment(''); }
      if (action === 'approve') onApproved?.();
    } catch (e) { if (alive.current) setError(e.message); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const poll = data?.poll; const manage = data?.canManage ?? isTeacher;
  const open = poll?.status === 'open' && !data?.closed; const blocked = data?.blocked || {};
  const slots = availabilitySlots(poll?.config); const rows = [...new Set(slots.map(s => s.minutes))];
  const members = poll?.members || []; const answered = members.filter(m => poll.answers[m.id]).length;
  const results = rankedSlots(poll, blocked); const proposal = poll?.proposal;
  const agreed = members.filter(m => ['yes', 'maybe'].includes(proposal?.votes[m.id]?.choice)).length;
  const canChoose = open && !data.calendarError && !busy;
  const selected = slots.find(s => s.id === focusSlot);
  const choose = slot => {
    setFocusSlot(slot.id);
    if (!canChoose) return;
    if (blocked[slot.id]) {
      if (!manage && !composing && draft[slot.id]) {
        setDraft(previous => { const next = { ...previous }; delete next[slot.id]; return next; });
        dirty.current = true; setChanged(true);
      }
      return;
    }
    if (composing || manage) {
      if (!composing) composeBase.current = proposal?.id || '';
      setComposing(true);
      setPair(previous => previous.includes(slot.id) ? previous.filter(id => id !== slot.id) : previous.length < 2 ? [...previous, slot.id] : [previous[0], slot.id]);
      return;
    }
    setDraft(previous => { const next = { ...previous }; if (brush === 'erase' || next[slot.id] === brush) delete next[slot.id]; else next[slot.id] = brush; return next; });
    dirty.current = true; setChanged(true); setNotice('');
  };
  const beginProposal = () => { composeBase.current = proposal?.id || ''; setComposing(true); setPair(suggestedPair(poll, blocked)); setComment(''); };
  const discardDraft = () => {
    dirty.current = false; setChanged(false); setError('');
    if (dataRef.current) apply(dataRef.current);
    void refresh();
  };
  const openSetup = () => { setConfig(poll ? { ...poll.config, startDate: poll.config.startDate < moscowDay() ? addCalendarDays(moscowDay(), 1) : poll.config.startDate } : defaultConfig()); setSetup(true); };

  if (!data) return <section className="ga-shell ga-loading">{error ? <><p role="alert">{error}</p><button onClick={refresh}><RefreshCw size={16} /> Попробовать ещё раз</button></> : <><Loader2 className="ga-spin" size={24} /><p>Собираем календарь группы…</p></>}</section>;
  return <section className="ga-shell">
    <header className="ga-hero"><div className="ga-hero-icon"><CalendarDays size={28} /></div><div className="ga-hero-copy"><span className="ga-eyebrow">ВРЕМЯ ДЛЯ ВАШЕЙ ГРУППЫ</span><h2>Давайте найдём время вместе</h2><p>Выберите <strong>всё время, когда удобно заниматься.</strong><br />Чем больше вариантов, тем легче собраться всей группой.</p></div><span className="ga-zone"><Clock3 size={15} /> Москва · UTC+3</span></header>
    <div className="ga-body">
      {error && <div className="ga-alert" role="alert">{error}<button onClick={refresh} disabled={busy}>Обновить</button></div>}
      {notice && <div className="ga-notice" role="status"><CheckCheck size={18} />{notice}</div>}
      {data.closed && <div className="ga-note">Группа завершена. Подбор времени доступен только для просмотра.</div>}
      {!poll && !setup && <div className="ga-empty"><div className="ga-empty-illustration"><CalendarDays size={44} /><span><Users size={22} /></span></div><h3>{manage ? 'Два занятия. Одно общее расписание.' : 'Здесь договоримся о занятиях'}</h3><p>{manage ? 'Укажите рабочие часы. Мы закроем занятое время, а ребята увидят свободные варианты и выбор друг друга.' : 'Преподаватель откроет календарь, и каждый сможет отметить удобные часы. Ответы будут видны всей вашей группе.'}</p>{manage && !data.closed && <button className="ga-primary" onClick={openSetup}><Plus size={18} /> Открыть подбор времени</button>}</div>}
      {setup && <form className="ga-setup" onSubmit={e => { e.preventDefault(); void act('open', { ...config, previousRoundId: poll?.id || '' }, 'Календарь открыт. Ученики могут выбирать удобное время.'); }}>
        <div className="ga-section-heading"><div><span className="ga-eyebrow">ШАГ 1 · УСЛОВИЯ ЗАНЯТИЙ</span><h3>Когда вы готовы преподавать?</h3></div><button type="button" className="ga-icon-button" aria-label="Закрыть настройку" onClick={() => setSetup(false)}><X size={20} /></button></div>
        <div className="ga-form-grid"><label>Начать заниматься с<input required type="date" min={moscowDay()} max={addCalendarDays(moscowDay(), 90)} value={config.startDate} onChange={e => setConfig({ ...config, startDate: e.target.value })} /></label><label>Длительность занятия<select value={config.durationMinutes} onChange={e => setConfig({ ...config, durationMinutes: Number(e.target.value) })}>{[30, 45, 60, 90, 120].map(n => <option key={n} value={n}>{n} минут</option>)}</select></label><label>Можно начинать с<input required type="time" step="1800" value={clockTime(config.startMinute)} onChange={e => setConfig({ ...config, startMinute: Number(e.target.value.slice(0, 2)) * 60 + Number(e.target.value.slice(3)) })} /></label><label>Нужно закончить до<input required type="time" step="1800" value={clockTime(config.endMinute)} onChange={e => setConfig({ ...config, endMinute: Number(e.target.value.slice(0, 2)) * 60 + Number(e.target.value.slice(3)) })} /></label></div>
        <div className="ga-weekdays" aria-label="Рабочие дни">{AVAILABILITY_DAYS.map((label, i) => <button type="button" key={i} aria-pressed={config.days.includes(i)} className={config.days.includes(i) ? 'selected' : ''} onClick={() => setConfig({ ...config, days: config.days.includes(i) ? config.days.filter(d => d !== i) : [...config.days, i].sort() })}>{label}</button>)}</div>
        <p className="ga-note">Два занятия в неделю, в разные дни. Занятость проверяется на 8 недель с выбранной даты; проверка повторится перед утверждением. Регулярное расписание продолжится и после этого периода.</p>
        {poll && <p className="ga-note ga-note-amber">Начнётся новый подбор: ответы и предложение потребуется заполнить заново. Уже утверждённое расписание пока продолжит действовать.</p>}
        <button className="ga-primary" disabled={busy || config.days.length < 2}>{busy ? <Loader2 className="ga-spin" size={18} /> : <ArrowRight size={18} />} {poll ? 'Начать новый подбор' : 'Открыть календарь группе'}</button>
      </form>}
      {poll && !setup && <>
        <div className="ga-progress"><div className="ga-avatar-stack">{members.slice(0, 6).map((m, i) => <Avatar key={m.id} member={m} index={i} />)}</div><div><strong>{poll.status === 'approved' ? 'Расписание согласовано' : `Ответили ${answered} из ${members.length}`}</strong><span>{poll.status === 'approved' ? 'Занятия появились в календаре группы' : 'Выбор участников обновляется автоматически'}</span></div><div className="ga-progress-actions"><button className="ga-icon-button" onClick={refresh} disabled={busy} aria-label="Обновить календарь"><RefreshCw size={17} /></button>{manage && !data.closed && <button onClick={openSetup}>Новый подбор</button>}</div></div>
        <div className="ga-meta"><span><CalendarDays size={15} /> С {dateLabel(poll.config.startDate)}</span><span><Clock3 size={15} /> {poll.config.durationMinutes} минут</span><span><Users size={15} /> 2 раза в неделю</span></div>
        {poll.status === 'approved' && <div className="ga-approved"><span className="ga-approved-icon"><CheckCheck size={28} /></span><div><span className="ga-eyebrow">ДОГОВОРИЛИСЬ!</span><h3>Встречаемся каждую неделю</h3><div className="ga-pair-chips">{poll.plan.slots.map(id => <span key={id}>{slotLabel(id, poll.plan.config)}</span>)}</div><p>Расписание действует с {dateLabel(poll.plan.config.startDate)}. Занятия видны в группе и в календарях участников.</p></div></div>}
        {data.calendarError && <div className="ga-alert" role="alert">{data.calendarError}</div>}
        {open && <>
          <div className="ga-workspace"><div className="ga-calendar-card">
            <div className="ga-section-heading"><div><span className="ga-eyebrow">{composing || manage ? 'ПРЕДЛОЖИТЕ ПАРУ ЗАНЯТИЙ' : 'ВАША ОБЫЧНАЯ НЕДЕЛЯ'}</span><h3>{composing || manage ? 'Выберите два времени' : 'В какие часы вы свободны?'}</h3></div>{!manage && <button onClick={() => { if (composing) setComposing(false); else beginProposal(); }} disabled={changed || busy}>{composing ? <ChevronLeft size={16} /> : <Plus size={16} />}{composing ? 'Моя доступность' : 'Предложить расписание'}</button>}</div>
            <p className="ga-hint">Каждая ячейка — начало целого занятия на {poll.config.durationMinutes} минут. Выберите все подходящие варианты.</p>
            {!manage && !composing && <div className="ga-brushes" aria-label="Как отметить время">{[['yes', 'Удобно', Check], ['maybe', 'Могу подстроиться', Heart], ['erase', 'Убрать отметку', X]].map(([value, label, Icon]) => <button key={value} className={`ga-brush-${value} ${brush === value ? 'selected' : ''}`} aria-pressed={brush === value} onClick={() => setBrush(value)}>{React.createElement(Icon, { size: 16 })}{label}</button>)}</div>}
            <nav className="ga-mobile-days" aria-label="День недели">{poll.config.days.map(i => <button key={i} className={day === i ? 'selected' : ''} onClick={() => setDay(i)}>{AVAILABILITY_DAYS[i]}</button>)}</nav>
            <div className="ga-grid-scroll"><div className="ga-grid" style={{ '--ga-days': poll.config.days.length }}>
              <div className="ga-grid-corner">МСК</div>{poll.config.days.map(i => <div key={`day-${i}`} className={`ga-day-head ${day === i ? 'ga-mobile-active' : ''}`}>{AVAILABILITY_DAYS[i]}<small>{AVAILABILITY_DAY_NAMES[i]}</small></div>)}
              {rows.map(minutes => <React.Fragment key={minutes}><div className="ga-hour">{clockTime(minutes)}</div>{poll.config.days.map(i => {
                const slot = slots.find(s => s.day === i && s.minutes === minutes); if (!slot) return null;
                const people = slotPeople(slot.id, members, poll.answers); const can = people.filter(p => ['yes', 'maybe'].includes(p.choice)); const mine = draft[slot.id]; const all = can.length > 0 && can.length === members.length;
                const taken = !!blocked[slot.id]; const pairSelected = pair.includes(slot.id);
                const description = `${AVAILABILITY_DAY_NAMES[i]}, ${slot.time}–${slot.end}. ${taken ? 'Учитель занят' : `${can.length} из ${members.length} могут. ${mine ? `Ваш выбор: ${labels[mine]}` : ''}`}`;
                return <button key={slot.id} type="button" className={`ga-slot ${day === i ? 'ga-mobile-active' : ''} ${taken ? 'ga-taken' : all ? 'ga-unanimous' : ''} ${!manage && !composing && mine ? `ga-mine-${mine}` : ''} ${pairSelected && (composing || manage) ? 'ga-pair-selected' : ''} ${focusSlot === slot.id ? 'ga-focused' : ''}`} aria-label={description} aria-pressed={composing || manage ? pairSelected : !!mine} disabled={!canChoose} onClick={() => choose(slot)} title={taken ? `Учитель занят: ${blocked[slot.id].map(dateLabel).join(', ')}` : people.map(p => `${p.name}: ${labels[p.choice]}`).join('\n')}>
                  {taken ? <><LockKeyhole size={12} /><span>Занято</span></> : <><span className="ga-slot-count">{all ? <CheckCheck size={14} /> : can.length ? <Users size={12} /> : null}{can.length ? `${can.length}/${members.length}` : 'Свободно'}</span><span className="ga-slot-mine">{composing || manage ? pairSelected ? 'Выбрано' : '' : mine === 'yes' ? '✓ Удобно' : mine === 'maybe' ? '♡ Могу' : ''}</span><span className="ga-slot-people">{can.slice(0, 2).map(p => p.name.split(' ')[0]).join(', ')}{can.length > 2 ? ` +${can.length - 2}` : ''}</span></>}
                </button>;
              })}</React.Fragment>)}
            </div></div>
            <div className="ga-legend"><span><i className="ga-legend-common" /> Подходит всем</span><span><i className="ga-legend-busy" /> Учитель занят</span><span>Не отмечено = не подходит после сохранения ответа</span></div>
            {!manage && !composing && <div className="ga-savebar"><div><strong>{Object.keys(draft).length ? `Выбрано вариантов: ${Object.keys(draft).length}` : 'Пока без подходящих вариантов'}</strong><small>{changed ? 'Есть несохранённые изменения' : poll.answers[userId] ? 'Ваш ответ виден группе' : 'Сохраните ответ, чтобы его увидела группа'}</small>{changed && <button className="ga-discard" disabled={busy} onClick={discardDraft}>Отменить мои изменения</button>}</div><button className="ga-primary" disabled={!canChoose || (!changed && !!poll.answers[userId])} onClick={() => act('answer', { roundId: poll.id, version: myVersion.current, choices: draft }, 'Ваш выбор сохранён и виден всей группе.')}><Check size={18} />{busy ? 'Сохраняем…' : 'Сохранить мой выбор'}</button></div>}
          </div>
          <aside className="ga-sidebar"><div className="ga-side-card"><span className="ga-eyebrow">СОВПАДЕНИЯ ГРУППЫ</span><h3>Ближе к общему времени <Sparkles size={18} /></h3>{results.filter(s => s.yes + s.maybe > 0).slice(0, 4).map(s => <button className="ga-match" key={s.id} onClick={() => { setFocusSlot(s.id); setDay(s.day); }}><span><strong>{slotLabel(s.id, poll.config)}</strong><small>{s.yes + s.maybe === members.length ? 'Подходит всем!' : `Могут ${s.yes + s.maybe} из ${members.length}`}{s.pending ? ` · ждём ${s.pending}` : ''}</small></span><span className="ga-match-count">{s.yes + s.maybe}<small>/{members.length}</small></span></button>)}{!results.some(s => s.yes + s.maybe > 0) && <p>Здесь появятся лучшие варианты, когда ребята сохранят свой выбор.</p>}{members.some(m => !poll.answers[m.id]) && <p className="ga-waiting">Ждём: {members.filter(m => !poll.answers[m.id]).map(m => m.name).join(', ')}.</p>}{!composing && <button className="ga-soft" onClick={beginProposal} disabled={!canChoose || changed}><Plus size={16} /> Предложить два занятия</button>}</div>
            {selected && <div className="ga-side-card ga-detail"><span className="ga-eyebrow">КТО МОЖЕТ В ЭТО ВРЕМЯ</span><h3>{slotLabel(selected.id, poll.config)}</h3>{blocked[selected.id] ? <p>Учитель занят {blocked[selected.id].map(dateLabel).join(', ')}. Выберите другое время.</p> : slotPeople(selected.id, members, poll.answers).map((m, i) => <div className="ga-person" key={m.id}><Avatar member={m} index={i} /><span>{m.name}</span><small className={`ga-choice-${m.choice}`}>{labels[m.choice]}</small></div>)}</div>}
            {(composing || (manage && pair.length > 0)) && <div className="ga-side-card ga-compose"><span className="ga-eyebrow">ВАШЕ ПРЕДЛОЖЕНИЕ</span><h3>Два занятия в неделю</h3><button onClick={() => { setComposing(false); setPair([]); }}>Отменить предложение</button>{proposal && <p>Новое предложение заменит предыдущее. Всем нужно будет подтвердить время заново.</p>}{[0, 1].map(i => <div className="ga-pair-place" key={i}><span>{i + 1}</span>{pair[i] ? slotLabel(pair[i], poll.config) : 'Выберите время в календаре'}</div>)}<label>Комментарий группе<textarea value={comment} maxLength={400} onChange={e => setComment(e.target.value)} placeholder="Например: между занятиями успеем сделать домашку" /></label><button className="ga-primary" disabled={!canChoose || pair.length !== 2 || pair[0]?.split('-')[0] === pair[1]?.split('-')[0] || changed || pair.some(id => blocked[id])} onClick={() => act('propose', { roundId: poll.id, previousProposalId: composeBase.current, slots: pair, comment }, 'Предложение отправлено группе. Теперь каждый может подтвердить время.')}><Send size={16} /> Предложить группе</button><p>Участники подтвердят оба занятия. Преподаватель утвердит расписание после общего согласия.</p></div>}
          </aside></div>
          {proposal && <section className="ga-proposal"><div className="ga-section-heading"><div><span className="ga-eyebrow">ШАГ 2 · ДОГОВОРИМСЯ</span><h3>Как вам такое расписание?</h3><p>Предлагает {proposal.authorName}</p></div><span className="ga-consensus">{agreed} из {members.length} согласны</span></div><div className="ga-pair-chips">{proposal.slots.map(id => <span key={id}><CalendarDays size={17} />{slotLabel(id, poll.config)}</span>)}</div>{proposal.comment && <p className="ga-quote"><MessageCircle size={17} />{proposal.comment}</p>}
            {proposal.slots.some(id => blocked[id]) && <div className="ga-alert">Время стало недоступно. Нужно предложить другую пару занятий.</div>}
            <div className="ga-votes">{members.map((m, i) => { const vote = proposal.votes[m.id]; return <div className="ga-person ga-vote" key={m.id}><Avatar member={m} index={i} /><div><strong>{m.name}</strong>{vote?.comment && <p>{vote.comment}</p>}</div><small className={`ga-choice-${vote?.choice || 'pending'}`}>{vote ? { yes: 'Подходит', maybe: 'Подстроюсь', no: 'Не могу' }[vote.choice] : 'Ждём ответ'}</small></div>; })}</div>
            {!manage && <div className="ga-your-vote"><label>Хотите что-то уточнить?<input value={voteComment} maxLength={400} onChange={e => setVoteComment(e.target.value)} placeholder="Например: в пятницу могу только после 18:00" /></label><div className="ga-vote-buttons">{[['yes', 'Подходит', Check], ['maybe', 'Могу подстроиться', Heart], ['no', 'Не могу', X]].map(([choice, label, Icon]) => <button key={choice} className={`ga-vote-${choice} ${proposal.votes[userId]?.choice === choice ? 'selected' : ''}`} disabled={busy || changed} onClick={() => act('vote', { roundId: poll.id, proposalId: proposal.id, choice, comment: voteComment }, 'Ваш ответ на предложение сохранён.')}>{React.createElement(Icon, { size: 17 })}{label}</button>)}</div>{changed && <p>Сначала сохраните выбор в календаре.</p>}</div>}
            {manage && <div className="ga-approve"><p>{agreed === members.length && members.length ? 'Все согласны. Проверим занятость ещё раз и добавим занятия в расписание.' : 'Когда все участники согласятся, здесь можно будет утвердить расписание.'}</p><button className="ga-primary" disabled={!canChoose || !members.length || agreed !== members.length || proposal.slots.some(id => blocked[id])} onClick={() => act('approve', { roundId: poll.id, proposalId: proposal.id }, 'Расписание утверждено. Занятия добавлены в календарь группы.')}><CheckCheck size={18} /> Утвердить расписание</button></div>}
          </section>}
        </>}
        <p className="ga-footnote"><LockKeyhole size={14} /> Выбор виден только вашей группе и преподавателю. Занятость проверяется до {dateLabel(addCalendarDays(poll.config.startDate, 55))}. События из Google и отдельно созданные занятия сохраняются; новый подбор заменяет только ранее согласованное здесь расписание.</p>
      </>}
    </div>
  </section>;
}
