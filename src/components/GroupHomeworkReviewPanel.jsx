import PreparedHomeworkGoal from './PreparedHomeworkGoal.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, RefreshCcw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { api } from '../services/api.js';
import { subscribeScheduleSync } from '../services/scheduleSync.js';
const ReviewModal = React.lazy(() => import('./TeacherHomeworkReviewModal.jsx'));

const labels = { excellent: 'Всё сделано', complete: 'Сделано с исправлениями', attention: 'Есть ошибки',
  'in-progress': 'В процессе', 'not-started': 'Не приступал', 'not-assigned': 'Не назначено',
  excluded: 'Не требуется по плану', unavailable: 'Нет данных', 'no-data': 'Нет заданий для проверки' };
const name = row => row.student?.name || row.student?.nickname || 'Ученик';

export default function GroupHomeworkReviewPanel({ groupId, assignment }) {
  const [state, setState] = useState({ members: [], loading: true, error: '' });
  const [detail, setDetail] = useState(null), [opening, setOpening] = useState('');
  const revision = useRef(0), detailRevision = useRef(0);
  const load = useCallback(async () => {
    const request = ++revision.current;
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const payload = await api.getLearningGroupHomeworkReview(groupId, assignment.id);
      if (revision.current === request) setState({ members: payload.members || [], loading: false, error: '' });
    } catch (error) {
      if (revision.current === request) setState(current => ({ ...current, loading: false, error: error.message || 'Не удалось загрузить выполнение' }));
    }
  }, [groupId, assignment.id]);
  useEffect(() => {
    const requests = revision, details = detailRevision;
    void load(); return () => { requests.current++; details.current++; };
  }, [load, assignment.updatedAt]);
  useEffect(() => {
    let timer;
    const unsubscribe = subscribeScheduleSync(event => {
      let update; try { update = JSON.parse(event.data); } catch { return; }
      if (update.scope !== 'homework-progress') return;
      clearTimeout(timer); timer = setTimeout(() => void load(), 500);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [load]);
  const open = async (member, filter) => {
    const request = ++detailRevision.current; setOpening(member.studentId);
    try {
      const payload = await api.getLearningGroupHomeworkReview(groupId, assignment.id, member.studentId);
      if (request === detailRevision.current) setDetail({ ...payload, filter });
    } catch (error) {
      if (request === detailRevision.current) setState(current => ({ ...current, error: error.message || 'Не удалось открыть работу' }));
    } finally { if (request === detailRevision.current) setOpening(''); }
  };
  return <section aria-label="Выполнение домашки участниками" className="space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="font-bold text-slate-900">Кто как выполнил домашку</h4>
        <p className="mt-1 text-xs text-slate-500">Откройте работу ученика или сразу задания с ошибками. Вы останетесь в группе.</p></div>
      <button type="button" onClick={() => void load()} disabled={state.loading} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-50">
        <RefreshCcw size={14} className={state.loading ? 'animate-spin' : ''}/> Обновить выполнение
      </button>
    </div>
    {state.error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
    {state.loading && !state.members.length && <p role="status" className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/> Загружаем работы учеников…</p>}
    {state.members.map(member => {
      const s = member.summary, disabled = !s || opening !== '';
      return <article key={member.studentId} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h5 className="font-bold text-slate-900">{name(member)}</h5>
            <p className={`mt-1 text-xs font-semibold ${s?.wrong ? 'text-rose-600' : s?.percent === 100 ? 'text-emerald-600' : 'text-slate-500'}`}>{labels[member.status] || 'В процессе'}</p></div>
          {s && <strong className="text-sm text-violet-700">Сделано {s.completed} из {s.total}{s.percent != null ? ` · ${s.percent}%` : ''}</strong>}
        </div>
        {s && <>
          <div className="my-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${s.percent || 0}%` }}/></div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">Верно сразу: {s.clean}</span>
            <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700">Исправлено после ошибок: {s.corrected}</span>
            <span className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700">Пока неверно: {s.wrong}</span>
            <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">Не начато: {s.untouched}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.errors > 0 && <button type="button" disabled={disabled} onClick={() => void open(member, 'errors')} className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><AlertCircle size={14}/> Разобрать ошибки · {s.errors}</button>}
            <button type="button" disabled={disabled} onClick={() => void open(member, 'all')} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              {opening === member.studentId ? <Loader2 size={14} className="animate-spin"/> : <ChevronRight size={14}/>} Открыть работу
            </button>
          </div>
        </>}
      </article>;
    })}
    {detail?.preparedGoals?.length>0?<PreparedGroupReviewDetail detail={detail} assignment={assignment} onClose={()=>setDetail(null)}/>:detail && (detail.items?.length ? <React.Suspense fallback={<p role="status">Открываем задания…</p>}>
      <ReviewModal key={detail.studentId} open studentId={detail.studentId} studentLabel={`${name(detail)} · ${assignment.title}`}
        items={detail.items} refreshProgress={false} initialFilter={detail.filter} gameTheoryTask={19} onClose={() => setDetail(null)}/>
    </React.Suspense> : createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Работа · ${name(detail)}`}>
      <div className="w-full max-w-xl rounded-3xl bg-white p-6"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">{name(detail)} · {assignment.title}</h3><button type="button" aria-label="Закрыть работу" onClick={() => setDetail(null)}><X size={20}/></button></div>
        <ul className="mt-4 space-y-3">{detail.checklist?.map(item => <li key={item.id} className="flex items-center gap-2 text-sm"><CheckCircle2 size={16} className={item.completedAt ? 'text-emerald-600' : 'text-slate-300'}/>{item.label} · {item.completedAt ? 'Сделано' : 'Не сделано'}</li>)}</ul>
        {!detail.checklist?.length && <p className="mt-4 text-sm text-slate-500">В этой работе нет заданий для автоматической проверки.</p>}
      </div>
    </div>, document.body))}
  </section>;
}


function PreparedGroupReviewDetail({detail,assignment,onClose}){
  const [bank,setBank]=useState(false);
  if(bank)return <React.Suspense fallback={<p role="status">Открываем задания…</p>}><ReviewModal open studentId={detail.studentId} studentLabel={`${name(detail)} · ${assignment.title}`} items={detail.items} refreshProgress={false} initialFilter={detail.filter} gameTheoryTask={19} onClose={()=>setBank(false)}/></React.Suspense>;
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Работа · ${name(detail)}`}><div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-3xl bg-white p-6"><header className="flex items-center justify-between gap-3"><h3 className="font-bold">{name(detail)} · {assignment.title}</h3><button type="button" aria-label="Закрыть работу" onClick={onClose}><X size={20}/></button></header>{detail.preparedGoals.map(goal=><PreparedHomeworkGoal key={goal.preparedId} goal={goal} studentId={detail.studentId} role="teacher"/>)}{detail.items?.length>0&&<button type="button" className="rounded-xl bg-violet-600 px-4 py-2 text-white text-sm" onClick={()=>setBank(true)}>Открыть задания из тестирования</button>}{detail.checklist?.map(item=><p key={item.id} className="mt-2 text-sm">{item.completedAt?'✓':'○'} {item.label}</p>)}</div></div>,document.body);
}
