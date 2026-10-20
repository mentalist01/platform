import { withTeacherCalendarLock } from './calendarMutations.js';

// The approval is the opt-in. Legacy approved plans are only published when
// their teacher clicks the explicit sync button. Receipts survive restarts.
export function createGroupCalendarSync({ store, polls, getGroup, readLessons, materialize, connection, writeGoogle, bindLesson, notify = () => {}, now = Date.now }) {
  const running = new Map();
  const owners = new Map();
  const index = row => Object.entries(row.records || {}).forEach(([lessonId,record]) => {
    if (record.iCalUID) owners.set(`${row.teacherId}|${record.iCalUID}`,{groupId:row.id,lessonId});
  });
  store.all().forEach(index);
  const relevant = group => readLessons().filter(lesson => lesson.groupId === group.id && lesson.teacherId === group.teacherId
    && lesson.source === 'availability-plan' && Date.parse(lesson.startAt) > now());
  const status = (group, poll = polls.get(group.id)) => {
    if (!poll?.plan?.googleCalendarSync) return {status:'not_requested',synced:0,total:0};
    const row = store.get(group.id) || {records:{}};
    const lessons = relevant(group).filter(lesson => lesson.status === 'scheduled');
    const synced = lessons.filter(lesson => ['synced','existing'].includes(row.records[lesson.id]?.status)).length;
    const pendingCancellations = relevant(group).some(lesson => lesson.status === 'cancelled' && row.records[lesson.id]?.status === 'synced');
    return {status:running.has(group.id)?'syncing':row.error?'error':synced===lessons.length&&!pendingCancellations?'synced':'pending',synced,total:lessons.length,error:row.error || ''};
  };
  const sync = async groupId => {
    const initial = getGroup(groupId);
    if (!initial || initial.deletedAt || initial.status === 'completed' || !polls.get(groupId)?.plan?.googleCalendarSync) return;
    return withTeacherCalendarLock(initial.teacherId, async () => {
      const group = getGroup(groupId);
      if (!group || group.deletedAt || group.status === 'completed' || !polls.get(groupId)?.plan?.googleCalendarSync) return;
      materialize();
      let row = store.get(groupId) || {id:groupId,teacherId:group.teacherId,records:{}};
      const save = patch => { row = {...row,...patch,updatedAt:now()};store.put(row);index(row); };
      try {
        const targets = relevant(group).filter(lesson => lesson.status === 'scheduled' && !['synced','existing'].includes(row.records[lesson.id]?.status)
          || lesson.status === 'cancelled' && ['synced','pending'].includes(row.records[lesson.id]?.status));
        if (!targets.length) { save({error:''}); return; }
        const selected = await connection(group.teacherId);
        for (const target of targets) {
          const currentGroup = getGroup(groupId);
          if (!currentGroup || currentGroup.deletedAt || currentGroup.status === 'completed') break;
          // Re-read each occurrence after network waits: never publish a stale
          // cancellation, moved lesson or changed plan from an old snapshot.
          const lesson = relevant(group).find(value => value.id === target.id);
          if (!lesson || !['scheduled','cancelled'].includes(lesson.status)) continue;
          const previous = row.records[lesson.id];
          if (lesson.externalEventId && !previous) {
            save({records:{...row.records,[lesson.id]:{status:'existing'}}}); continue;
          }
          if (previous?.calendarId && previous.calendarId !== selected.calendarId) throw Error('Для этих занятий выбран другой Google Calendar. Верните прежний календарь перед повторной синхронизацией.');
          save({records:{...row.records,[lesson.id]:{...previous,calendarId:selected.calendarId,status:previous?.status || 'pending'}}});
          const result = await writeGoogle({...selected,teacherId:group.teacherId,group,lesson,cancelled:lesson.status === 'cancelled'});
          if (lesson.status !== 'cancelled') bindLesson(lesson.id,result);
          save({error:'',records:{...row.records,[lesson.id]:{...result,status:lesson.status === 'cancelled'?'cancelled':'synced'}}});
        }
        save({error:''}); notify(group);
      } catch (error) {
        save({error:error.status === 429 ? 'Google ограничил частоту запросов. Повторите синхронизацию позже.' : error.message || 'Google Calendar временно недоступен. Повторите синхронизацию.'});
        notify(group);
      }
    });
  };
  const enqueue = group => {
    if (running.has(group.id)) return;
    // Delay until the approval releases its existing teacher calendar lock.
    const task = new Promise(resolve => setImmediate(resolve)).then(()=>sync(group.id)).finally(()=>running.delete(group.id));
    running.set(group.id,task); task.catch(error=>console.warn('[group-calendar-sync]',error.message));
  };
  return {status,enqueue,ownerForEvent:(teacherId,uid)=>owners.get(`${teacherId}|${uid}`),idle:()=>Promise.allSettled([...running.values()]),resume:()=>polls.plans().filter(plan=>plan.googleCalendarSync).forEach(plan=>{
    const group=getGroup(plan.groupId);if(group)enqueue(group);
  })};
}
