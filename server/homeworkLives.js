import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isOptionalHomeworkGoal } from '../src/utils/homeworkAssignmentTier.js';
import { buildHomeworkStatistics } from '../src/utils/homeworkStats.js';
import { isMockAttemptForHomework } from '../src/utils/homeworkComposer.js';
import { filterCancelledGroupEgeGoals } from '../src/utils/groupHomeworkCancellations.js';
import { hasPythonHomeworkPractice, isPythonHomeworkGoal, isPythonPracticeHomework } from '../src/utils/homeworkAssessment.js';

export const MAX_HOMEWORK_LIVES = 3;
export const MONTHLY_HOMEWORK_DAMAGE = 8;
const text = value => String(value ?? '').trim();
const time = value => Date.parse(text(value));
const round = value => Math.round(value * 1e6) / 1e6;
const monthFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit' });
export const livesMonth = value => monthFormatter.format(new Date(value));
export const nextLivesMonth = month => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7);
};
const monthStart = month => Date.parse(`${month}-01T00:00:00+03:00`);
const key = (teacherId, studentId) => createHash('sha256').update(`${teacherId}\n${studentId}`).digest('hex');
const validCount = value => Number.isInteger(value) && value >= 1 && value <= 60;
const homeworkTitle = homework => text(homework.title || homework.homeWork).split(/\r?\n/)[0].slice(0, 140) || 'Домашняя работа';

// Frequency is a plan, not attendance: cancelled occurrences do not make the
// remaining assignments harsher. A teacher can set an explicit monthly quota.
export function estimateHomeworkPlan(schedule = [], month, isAssigned = () => true) {
  const weekly = new Set(), dated = new Set();
  for (const entry of schedule) {
    if (entry?.isTrial || entry?.trial || !isAssigned(entry, month)) continue;
    if (isPythonPracticeHomework(entry) || /^(?:python|питон)$/iu.test(text(entry?.subject))) continue;
    if (entry.repeatUntil && entry.repeatUntil < `${month}-01`) continue;
    if (entry.repeatFrom && entry.repeatFrom.slice(0, 7) > month) continue;
    if (entry.date) {
      if (entry.date.startsWith(month + '-')) dated.add(`${entry.date}|${entry.time}`);
    } else if (entry.weekdayKey || entry.weekdayOrder || entry.day) {
      weekly.add(`${entry.weekdayKey || entry.weekdayOrder || entry.day}|${entry.time || ''}`);
    }
  }
  return Math.min(60, Math.max(4, weekly.size * 4, dated.size));
}

// Resolve each assignment separately: another Python/EGE homework must never
// truncate its completion window. Untimestamped legacy successes need a human
// check rather than inventing a deadline result.
export function homeworkDeadlineResult(homework, data, testsDb, mockExams, nowMs) {
  if (homework.learningEgeCarryover === true || isPythonPracticeHomework(homework)) return null;
  const allGoals = Array.isArray(homework.goals) ? homework.goals : [];
  const goals = filterCancelledGroupEgeGoals(homework).filter(goal => !isOptionalHomeworkGoal(goal) && !isPythonHomeworkGoal(goal));
  if (allGoals.length && !goals.length) return null;
  if (goals.some(goal => goal.type !== 'mock' && !text(goal.mockExamId)
    && !(Array.isArray(goal.targetQuestionIds) && goal.targetQuestionIds.some(Boolean)))) {
    return { reliable: false, reason: 'Нет сохранённого состава обязательных заданий' };
  }
  const taskGoals = goals.filter(goal => !text(goal.mockExamId));
  const [stats] = buildHomeworkStatistics({
    homeworks: [{ ...homework, goals: taskGoals, ...(goals.length ? { checklistItems: [] } : {}) }],
    studentData: data, testsDb, mockExams, nowMs,
  });
  const due = time(homework.dueAt);
  for (const goal of taskGoals) {
    const measured = stats?.goals.find(g=>g.taskNumber===Number(goal.taskNumber)&&g.levelId===goal.levelId);
    const snapshotIds = [...new Set(goal.targetQuestionIds.filter(Boolean))];
    if (!measured || measured.items.length !== snapshotIds.length) return { reliable:false, reason:'Состав задания изменился — нужна проверка' };
    for (const item of measured.items.filter(item=>item.estimated)) {
      const history = data.solvedByTask?.[goal.taskNumber]?.[goal.levelId]?.answerHistory?.[item.questionId] || [];
      const hasDatedSuccess = history.some(a=>a.correct&&time(a.submittedAt)<=due)
        || (data.solvedEvents||[]).some(e=>Number(e.taskNumber)===Number(goal.taskNumber)&&e.levelId===goal.levelId&&e.questionId===item.questionId&&time(e.solvedAt)<=due);
      if (!hasDatedSuccess) return { reliable:false, reason:'Нужно проверить результат к сроку сдачи' };
    }
  }
  let totalCount=stats?.totalCount||0, completedCount=stats?.checkpointCompletedCount||0;
  const hasAnswer = value => Array.isArray(value) ? value.some(hasAnswer) : Boolean(text(value));
  for (const goal of goals.filter(goal=>text(goal.mockExamId))) {
    const targetKeys = goal.targetTaskKeys?.length ? goal.targetTaskKeys : Object.keys(mockExams.find(e=>e.id===goal.mockExamId)?.tasks||{});
    if (!targetKeys.length) return {reliable:false,reason:'Не сохранён состав пробника'};
    totalCount += targetKeys.length;
    const attempt=data.mockAttempts?.[goal.mockExamId];
    if (!attempt) continue;
    const matches=isMockAttemptForHomework(attempt,{...homework,continuationOfHomeworkId:goal.continuationOfHomeworkId});
    if (!matches) {
      if (time(attempt.updatedAt || attempt.finishedAt)>time(homework.issuedAt)) return {reliable:false,reason:'Нужно проверить сохранённую попытку пробника'};
      continue;
    }
    const finished=time(attempt.finishedAt || attempt.timerFinishedAt);
    if (!Number.isFinite(finished) || finished>due) continue;
    if (time(attempt.updatedAt)>due) return {reliable:false,reason:'Пробник изменён после дедлайна — нужна проверка'};
    completedCount += targetKeys.filter(k=>hasAnswer(attempt.answers?.[k])).length;
  }
  if (!totalCount) return null;
  return { reliable: true, totalCount, completedCount, percent: 100 * completedCount / totalCount };
}

export class HomeworkLivesStore {
  constructor(file, { now = Date.now } = {}) {
    this.file = file; this.now = now; this.error = '';
    this.data = { version: 1, teachers: {}, students: {} };
    try {
      if (fs.existsSync(file)) {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (saved.version !== 1 || !saved.teachers || !saved.students) throw Error('Invalid lives data');
        this.data = saved;
      }
    } catch { this.error = 'Не удалось прочитать историю жизней. Нужна проверка преподавателя.'; }
    this.persistedData = structuredClone(this.data);
  }
  ready() { if (this.error) throw Object.assign(Error(this.error), { status: 503 }); }
  save() {
    if (this.batching) { this.dirty = true; return; }
    this.ready(); fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600 }); fs.renameSync(temporary, this.file);
      this.persistedData = structuredClone(this.data);
    } catch (error) { this.data = structuredClone(this.persistedData); throw error; }
  }
  batch(operation) {
    this.batching = true; this.dirty = false;
    try { const result = operation(); this.batching = false; if (this.dirty) this.save(); return result; }
    catch (error) { this.batching = false; this.data = structuredClone(this.persistedData); throw error; }
    finally { this.dirty = false; }
  }
  settings(teacherId) { this.ready(); return this.data.teachers[key(teacherId, '')] || { enabled: false, activatedAt: '' }; }
  configure(teacherId, enabled) {
    const previous = this.settings(teacherId);
    this.data.teachers[key(teacherId, '')] = { ...previous, enabled, activatedAt: previous.enabled
      ? previous.activatedAt : new Date(this.now()).toISOString() };
    this.save(); return this.settings(teacherId);
  }
  record(student) {
    const id = key(student.teacherId, student.id);
    return this.data.students[id] ||= { plans: {}, months: {} };
  }
  effectiveSince(student) {
    const activated = time(this.settings(student.teacherId).activatedAt);
    const created = time(student.createdAt);
    // A newly enrolled pupil gets the remainder of the first month to settle in.
    return Number.isFinite(created) && created >= activated
      ? monthStart(nextLivesMonth(livesMonth(created))) : activated;
  }
  balance(period) {
    const remaining = round(Math.max(0, MAX_HOMEWORK_LIVES - Object.values(period?.events || {})
      .filter(event => !event.waivedAt && event.reliable)
      .reduce((sum, event) => sum + event.loss, 0)));
    return remaining < 1e-5 ? 0 : remaining;
  }
  plannedCount(row, month, context) {
    return Object.entries(row.plans).filter(([from])=>from<=month).sort(([a],[b])=>a.localeCompare(b)).at(-1)?.[1]
      || context.estimatePlan(month);
  }
  reconcile(student, context) {
    const settings = this.settings(student.teacherId);
    if (!settings.enabled) return;
    const now = this.now(), since = this.effectiveSince(student), row = this.record(student);
    let changed = false;
    for (const homework of (context.homeworks || []).slice().sort((a, b) => time(a.dueAt) - time(b.dueAt))) {
      if (homework.learningEgeCarryover === true) continue;
      const issued = time(homework.issuedAt), due = time(homework.dueAt), id = text(homework.id);
      const practiceOnly = isPythonPracticeHomework(homework);
      if (practiceOnly || context.isHomeworkRequired?.(homework) === false) {
        // Correct a stale post-transfer check as well as preventing a new one.
        // Use current membership, even if the personal homework projection
        // has not been refreshed yet. Keep the event for the audit history.
        const period = Object.values(row.months).find(period => period.events[id]);
        if (period && !period.events[id].waivedAt) {
          Object.assign(period.events[id], { waivedAt: new Date(now).toISOString(),
            waiverReason: practiceOnly ? 'Python — практика для разбора на уроке, без списания сердец' : context.homeworkExemptionReason?.(homework) || 'Задание прежней группы отменено при выходе до срока сдачи', waivedById: practiceOnly ? 'python-practice-policy' : context.homeworkExemptionReason?.(homework) ? 'group-homework-track' : 'group-membership' });
          if (period.review && this.balance(period) > 1e-5) period.review.cancelledAt = new Date(now).toISOString();
          changed = true;
        }
        continue;
      }
      if (!id || !Number.isFinite(issued) || issued < since || !Number.isFinite(due) || due < since || due > now
        || homework.deletedAt || ['draft', 'cancelled', 'voided'].includes(homework.status) || homework.assignmentTier === 'optional') continue;
      const month = livesMonth(due);
      let period = row.months[month];
      const existing = period?.events[id];
      const correctMixedAssessment = existing && !existing.waivedAt
        && hasPythonHomeworkPractice(homework) && existing.assessmentPolicy !== 'ege-only-v1';
      if (existing && !correctMixedAssessment) continue;
      const result = context.evaluate(homework);
      if (!result) continue;
      if (!period) {
        const plannedCount = this.plannedCount(row, month, context);
        period = row.months[month] = { plannedCount: validCount(plannedCount) ? plannedCount : 4, events: {} };
      }
      const percent = Math.max(0, Math.min(100, Number(result.percent) || 0));
      if (correctMixedAssessment) {
        const loss = result.reliable ? round((1 - percent / 100) * MONTHLY_HOMEWORK_DAMAGE / period.plannedCount) : 0;
        Object.assign(existing, {
          previousAssessment: { percent: existing.percent, loss: existing.loss, reliable: existing.reliable,
            totalCount: existing.totalCount, completedCount: existing.completedCount },
          assessmentPolicy: 'ege-only-v1', correctedAt: new Date(now).toISOString(),
          correctionReason: 'Python исключён из оценки домашней работы; прежнее списание не увеличивается',
          percent: result.reliable ? percent : null, reliable: result.reliable === true,
          totalCount: result.totalCount || 0, completedCount: result.completedCount || 0,
          loss: Math.min(Number(existing.loss) || 0, loss), reason: result.reason || '',
        });
        if (period.review && this.balance(period) > 1e-5) period.review.cancelledAt = new Date(now).toISOString();
        changed = true;
        continue;
      }
      period.events[id] = { id, assessmentPolicy: 'ege-only-v1', title: homeworkTitle(homework), dueAt: new Date(due).toISOString(),
        sequence: Object.keys(period.events).length,
        recordedAt: new Date(now).toISOString(), reliable: result.reliable === true,
        percent: result.reliable ? percent : null, totalCount: result.totalCount || 0, completedCount: result.completedCount || 0,
        loss: result.reliable ? round((1 - percent / 100) * MONTHLY_HOMEWORK_DAMAGE / period.plannedCount) : 0,
        reason: result.reason || '' };
      if (this.balance(period) === 0 && (!period.review || period.review.cancelledAt)) period.review = { createdAt: new Date(now).toISOString(), month };
      changed = true;
    }
    if (changed) this.save();
  }
  status(student, context) {
    this.reconcile(student, context);
    const settings = this.settings(student.teacherId), now = this.now(), month = livesMonth(now), row = this.record(student);
    const period = row.months[month];
    const plannedCount = period?.plannedCount || this.plannedCount(row, month, context);
    const history = Object.entries(row.months).flatMap(([eventMonth, p]) => {
      let remaining = MAX_HOMEWORK_LIVES;
      return Object.values(p.events).sort((a,b) => time(a.dueAt)-time(b.dueAt)||(a.sequence||0)-(b.sequence||0)).map(event => {
        const deducted = !event.waivedAt && event.reliable ? Math.min(remaining, event.loss) : 0;
        remaining = round(remaining - deducted);
        return { ...event, month: eventMonth, deducted: round(deducted), plannedCount: p.plannedCount };
      });
    }).sort((a,b) => time(b.dueAt)-time(a.dueAt)||(b.sequence||0)-(a.sequence||0)).slice(0, 60);
    const pendingReviews = Object.values(row.months).map(p => p.review)
      .filter(review => review && !review.handledAt && !review.cancelledAt);
    return { enabled: settings.enabled, activatedAt: settings.activatedAt, effectiveSince: new Date(this.effectiveSince(student) || now).toISOString(), adapting: this.effectiveSince(student) > now,
      studentId: student.id, month, maxLives: MAX_HOMEWORK_LIVES, remaining: period ? this.balance(period) : MAX_HOMEWORK_LIVES,
      plannedCount, nextPlannedCount: this.plannedCount(row, nextLivesMonth(month), context), planLocked: Boolean(period && Object.keys(period.events).length), maxLossPerHomework: MONTHLY_HOMEWORK_DAMAGE / plannedCount,
      resetsAt: new Date(monthStart(nextLivesMonth(month))).toISOString(), history, pendingReviews,
      needsReview: history.some(e=>!e.reliable&&!e.waivedAt) };
  }
  setPlan(student, count, month) {
    this.ready(); const current = livesMonth(this.now());
    if (!validCount(count) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < current || month > nextLivesMonth(current)) {
      throw Object.assign(Error('Укажите от 1 до 60 работ для текущего или следующего месяца.'), { status: 400 });
    }
    const row = this.record(student);
    if (row.months[month] && Object.keys(row.months[month].events).length) throw Object.assign(Error('Расчёт за месяц уже начался. Измените план следующего месяца.'), { status: 409 });
    row.plans[month] = count; this.save();
  }
  waive(student, eventId, reason, actorId) {
    this.ready(); if (!text(reason)) throw Object.assign(Error('Укажите причину отмены списания.'), { status: 400 });
    const row = this.record(student);
    const period = Object.values(row.months).find(p=>p.events[eventId]);
    if (!period) throw Object.assign(Error('Списание не найдено.'), { status: 404 });
    Object.assign(period.events[eventId], { waivedAt: new Date(this.now()).toISOString(), waiverReason: text(reason).slice(0, 300), waivedById: actorId });
    if (period.review && this.balance(period) > 1e-5) period.review.cancelledAt = new Date(this.now()).toISOString();
    this.save();
  }
  handleReview(student, month, actorId) {
    const review = this.record(student).months[month]?.review;
    if (!review) throw Object.assign(Error('Уведомление не найдено.'), { status: 404 });
    review.handledAt = new Date(this.now()).toISOString(); review.handledById = actorId; this.save();
  }
}

export function registerHomeworkLives(app, store, options) {
  const wrap = handler => (req,res) => { try { handler(req,res); } catch(error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Не удалось обновить жизни. Повторите позже.' }); } };
  const teacher = (req,res,write=false) => {
    if (req.auth?.role !== 'teacher') {res.status(403).json({error:'Доступно только преподавателю'});return '';}
    if(write && options.staff && !options.staff(req,res))return '';
    return req.auth.id;
  };
  const status = (student,batch={}) => store.status(student, options.context(student,batch));
  app.get('/api/homework-lives', wrap((req,res) => {
    if(req.auth?.role==='student' && text(req.query.studentId) && text(req.query.studentId)!==req.auth.id)return res.status(403).json({error:'Доступ запрещён'});
    const student=options.student(req,res,req.query.studentId);if(student){res.setHeader('Cache-Control','no-store');res.json(status(student));}
  }));
  app.get('/api/teacher-homework-lives', wrap((req,res) => {
    const id=teacher(req,res);if(!id)return;
    const settings=store.settings(id);
    const batch={};
    const students=settings.enabled ? store.batch(()=>options.students(id).map(student=>{
      const value=status(student,batch);
      return {studentId:student.id,name:student.name || 'Ученик',remaining:value.remaining,pendingReviews:value.pendingReviews,needsReview:value.needsReview};
    })) : [];
    res.setHeader('Cache-Control','no-store');res.json({settings,students});
  }));
  app.patch('/api/homework-lives/settings', wrap((req,res) => {
    const id=teacher(req,res,true);if(!id)return;
    if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'Укажите состояние системы жизней.'});
    res.json(store.configure(id,req.body.enabled));
  }));
  for (const action of ['plan','waive','review']) app.post(`/api/homework-lives/:studentId/${action}`,wrap((req,res) => {
    const id=teacher(req,res,true);if(!id)return;
    const student=options.student(req,res,req.params.studentId);if(!student)return;
    if(action==='plan')store.setPlan(student,req.body?.count,text(req.body?.month));
    if(action==='waive')store.waive(student,text(req.body?.eventId),text(req.body?.reason),id);
    if(action==='review')store.handleReview(student,text(req.body?.month),id);
    res.json(status(student));
  }));
}
