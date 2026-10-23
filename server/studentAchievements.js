import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_PYTHON_TOPICS } from '../src/data/achievementCatalog.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const array = value => Array.isArray(value) ? value : [];
const id = value => String(value ?? '').trim();
const validTime = (value, now) => { const time = Date.parse(value); return Number.isFinite(time) && time <= now ? time : null; };
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const day = value => dayFormat.format(new Date(value));

// Only durable, server-checked solutions count. Never infer a solve from XP,
// a teacher-entered percentage, a login, saved code or an unfinished mock.
export function achievementFacts(data = {}, { tests = {}, pythonTaskIds = [], mockExams = [], now = Date.now() } = {}) {
  const facts = { egeSolved: 0, pythonSolved: 0, corrected: 0, activeDays: 0, mixedDays: 0, egeBreadth: 0, pythonBreadth: 0, mockCount: 0, mockBest: 0, mockGrowth: 0, homeworkCompleted: 0, streakBest: Math.max(0, Number(data.streak?.best) || 0) };
  const pythonIds = new Set([...pythonTaskIds.map(String), ...ACHIEVEMENT_PYTHON_TOPICS.map(([n]) => String(n))]);
  const solvedKeys = new Set(), firstTimes = new Map(), dated = new Map(), topicSolved = new Map();
  const addDay = (time, kind) => { if (time === null) return; const key = day(time), kinds = dated.get(key) || new Set(); kinds.add(kind); dated.set(key, kinds); };
  const rememberTime = (key, time, kind) => { if (time !== null && (!firstTimes.has(key) || time < firstTimes.get(key).time)) firstTimes.set(key, { time, kind }); };
  for (const [taskId, levels] of Object.entries(object(data.solvedByTask))) {
    for (const [levelId, level] of Object.entries(object(levels))) {
      if (!Array.isArray(level?.solved)) continue;
      const python = pythonIds.has(taskId) || levelId === 'python';
      const classic = !python && Number(taskId) >= 1 && Number(taskId) <= 27;
      if (!python && !classic) continue;
      for (const question of new Set(level.solved.map(id).filter(Boolean))) {
        const key = `${taskId}:${levelId}:${question}`;
        if (solvedKeys.has(key)) continue;
        solvedKeys.add(key);
        const metric = python ? 'pythonSolved' : 'egeSolved'; facts[metric]++;
        const taskMetric = `${python ? 'pythonTopic' : 'egeTask'}:${taskId}`; facts[taskMetric] = (facts[taskMetric] || 0) + 1;
        if (python) { const questions = topicSolved.get(taskId) || new Set(); questions.add(question); topicSolved.set(taskId, questions); }
        const history = array(level.answerHistory?.[question]).filter(entry => validTime(entry.submittedAt, now) !== null).sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
        const correctIndex = history.findIndex(entry => entry.correct === true);
        if (correctIndex >= 0 && history.slice(0, correctIndex).some(entry => entry.correct === false)) facts.corrected++;
        if (correctIndex >= 0) rememberTime(key, validTime(history[correctIndex].submittedAt, now), python ? 'python' : 'ege');
      }
    }
  }
  // Older histories can be capped. First-solve events preserve their dates.
  for (const event of array(data.solvedEvents)) {
    if (String(event.source || '').startsWith('mock')) continue;
    const key = `${id(event.taskNumber)}:${id(event.levelId)}:${id(event.questionId)}`;
    if (!solvedKeys.has(key)) continue;
    rememberTime(key, validTime(event.solvedAt, now), pythonIds.has(id(event.taskNumber)) || event.levelId === 'python' ? 'python' : 'ege');
  }
  firstTimes.forEach(({ time, kind }) => addDay(time, kind));
  for (const [topic] of ACHIEVEMENT_PYTHON_TOPICS) {
    const questions = array(tests?.[topic]?.python).map(entry => id(entry.id)).filter(Boolean);
    const solved = topicSolved.get(String(topic)) || new Set();
    facts[`pythonComplete:${topic}`] = questions.length > 0 && questions.every(question => solved.has(question)) ? 1 : 0;
  }
  facts.egeBreadth = Object.keys(facts).filter(key => key.startsWith('egeTask:') && facts[key] > 0).length;
  facts.pythonBreadth = ACHIEVEMENT_PYTHON_TOPICS.filter(([topic]) => facts[`pythonTopic:${topic}`] > 0).length;
  const examMap = new Map(mockExams.map(exam => [id(exam.id), exam]));
  const mocks = new Map();
  for (const completion of array(data.mockCompletionEvents)) {
    const examId = id(completion.examId), exam = examMap.get(examId), finishedAt = validTime(completion.finishedAt, now);
    if (!exam || exam.rewardsDisabled || exam.personalRandom || exam.isPersonalRandom || exam.source === 'personal-random' || finishedAt === null) continue;
    if (completion.secondaryScore === null || completion.secondaryScore === undefined || completion.secondaryScore === '') continue;
    const score = Number(completion.secondaryScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) continue;
    const previous = mocks.get(examId);
    mocks.set(examId, { firstAt: Math.min(previous?.firstAt ?? finishedAt, finishedAt), firstScore: !previous || finishedAt < previous.firstAt ? score : previous.firstScore, best: Math.max(previous?.best || 0, score) });
    addDay(finishedAt, 'mock');
  }
  const ordered = [...mocks.values()].sort((a, b) => a.firstAt - b.firstAt);
  facts.mockCount = ordered.length;
  facts.mockBest = Math.max(0, ...ordered.map(mock => mock.best));
  facts.mockGrowth = ordered.length > 1 ? Math.max(0, ...ordered.slice(1).map(mock => mock.best - ordered[0].firstScore)) : 0;
  facts.activeDays = dated.size;
  facts.mixedDays = [...dated.values()].filter(kinds => kinds.has('ege') && kinds.has('python')).length;
  facts.homeworkCompleted = new Set(array(data.homeworks).filter(homework => homework.homeworkChestId && validTime(homework.homeworkChestGrantedAt, now) !== null).map(homework => id(homework.id)).filter(Boolean)).size;
  return facts;
}

export class StudentAchievementStore {
  constructor(directory, { write, now = () => Date.now() } = {}) { this.directory = directory; this.write = write; this.now = now; }
  filename(studentId) { return path.join(this.directory, crypto.createHash('sha256').update(String(studentId)).digest('hex') + '.json'); }
  read(studentId) {
    try { return object(JSON.parse(fs.readFileSync(this.filename(studentId), 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  save(studentId, row) { this.write(this.filename(studentId), JSON.stringify(row), 'utf8'); }
  evaluate(studentId, facts, { baselineFacts } = {}) {
    let row = this.read(studentId); const initialized = Boolean(row);
    const now = new Date(this.now()).toISOString();
    if (!row) {
      row = { initializedAt: now, earned: {} };
      const baseline = baselineFacts || facts;
      for (const item of ACHIEVEMENT_CATALOG) if ((baseline[item.metric] || 0) >= item.target) row.earned[item.id] = { earnedAt: now, historical: true, seenAt: now };
    }
    let changed = !initialized;
    for (const item of ACHIEVEMENT_CATALOG) {
      if (!row.earned[item.id] && (facts[item.metric] || 0) >= item.target) { row.earned[item.id] = { earnedAt: now, historical: false }; changed = true; }
    }
    if (changed) this.save(studentId, row);
    return { initializedAt: row.initializedAt, items: ACHIEVEMENT_CATALOG.map(item => ({ ...item, value: Math.min(item.target, Math.max(0, facts[item.metric] || 0)), ...(row.earned[item.id] || {}), unlocked: Boolean(row.earned[item.id]) })) };
  }
  claim(studentId) {
    const row = this.read(studentId); if (!row) return [];
    const pending = ACHIEVEMENT_CATALOG.filter(item => row.earned[item.id] && !row.earned[item.id].seenAt);
    if (!pending.length) return [];
    const seenAt = new Date(this.now()).toISOString();
    const result = pending.map(item => ({ ...item, ...row.earned[item.id], unlocked: true }));
    for (const item of pending) row.earned[item.id].seenAt = seenAt;
    this.save(studentId, row); return result;
  }
}
