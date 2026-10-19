import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, Code2, Gift, Play, ShieldCheck } from 'lucide-react';
import PythonTestModal from './PythonTestModal';
import PythonGiftTheoryCard from './PythonGiftTheoryCard';
import { buildPythonSubsectionModel } from '../utils/pythonSubsections.js';
import { pythonGiftTopicTheory, pythonGiftTheoryStart } from '../utils/pythonGiftTheory.js';
import { createPythonGiftSession } from '../utils/pythonGiftProgress.js';
import { createPyodideWorker } from '../python/createPyodideWorker.js';
import './PythonGiftCourse.css';

// ANSI escape sequences may be printed by a program, but don't change its answer.
// eslint-disable-next-line no-control-regex
const normalizeOutput = value => String(value ?? '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
const runtimeProps = {
  PYTHON_LEVEL_ID: 'python', PYODIDE_RUN_TIMEOUT_MS: 40000, ALLOW_MAIN_THREAD_PYTHON_FALLBACK: false,
  createPyodideWorker, ensurePyodideReady: async () => { throw Error('Откройте курс в современном браузере с поддержкой Web Worker.'); },
  mergeRuntimeErrorText: (base, next) => [base, next].filter(Boolean).join('\n'),
  withStudentId: url => url, normalizeOutputForComparison: normalizeOutput,
  normalizeRuntimeErrorForCheck: value => String(value ?? '').trim(), normalizeXpTotal: () => 0,
  getLocalDayKey: () => new Date().toLocaleDateString('en-CA'),
  isGoogleDocEmbedUrl: url => /docs\.google\.com\/document/.test(url || ''),
  buildGoogleDocFullUrl: url => String(url || '').replace(/\/(?:preview|pub)(?=[?#]|$)/, '/edit'),
};
const hasTheory = (entry, sectionId) => Object.keys(entry.pythonTheoryBySubsection?.[sectionId] || {}).length > 0;
const plural = (count, forms) => forms[count % 100 >= 11 && count % 100 <= 14 ? 2 : count % 10 === 1 ? 0 : count % 10 >= 2 && count % 10 <= 4 ? 1 : 2];

export default function PythonGiftCoursePage() {
  const token = window.location.pathname.split('/')[2] || '';
  const [course, setCourse] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [activeNumber, setActiveNumber] = useState(null);
  const [launch, setLaunch] = useState(null);
  const [, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/python-course-gifts/${encodeURIComponent(token)}`, { credentials: 'omit', cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error || 'Не удалось открыть курс.'); return data; })
      .then(data => { if (!controller.signal.aborted) { setCourse(data); setActiveNumber(data.tasks[0]?.number); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [token, retry]);
  const session = useMemo(() => {
    if (!course) return null;
    let storage; try { storage = window.localStorage; } catch { /* The editor will explain if saving is unavailable. */ }
    return createPythonGiftSession(course, storage);
  }, [course]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  const progress = session?.getProgressSnapshot() || {};
  const testDb = useMemo(() => Object.fromEntries((course?.tasks || []).map(item => [item.number, item.entry])), [course]);
  const task = course?.tasks.find(item => item.number === activeNumber);
  const model = useMemo(() => buildPythonSubsectionModel(task?.entry, 'python', { includeEmptySections: true }), [task]);
  const solved = session?.getSolvedIds(task?.number) || [];
  const topicTheory = pythonGiftTopicTheory(task?.entry);
  const openTheory = (sectionId = '') => {
    const start = pythonGiftTheoryStart(model, sectionId);
    open(task, start.index, start.subsectionId, true, sectionId ? task.entry.pythonTheoryBySubsection[sectionId] : topicTheory);
  };
  const total = course?.tasks.reduce((sum, item) => sum + item.questionCount, 0) || 0;
  const done = course?.tasks.reduce((sum, item) => sum + session.getSolvedIds(item.number).length, 0) || 0;
  const open = (item, index, sectionId, theory = false, theorySource = null) => setLaunch({ task: item, index, sectionId, theory, theorySource });
  const resume = () => {
    const next = course.tasks.find(item => item.entry.python.some(question => !session.getSolvedIds(item.number).includes(String(question.id)))) || course.tasks[0];
    if (!next) return;
    const index = Math.max(0, next.entry.python.findIndex(question => !session.getSolvedIds(next.number).includes(String(question.id))));
    setActiveNumber(next.number); open(next, index);
  };
  return <main className="python-gift-page">
    <meta name="referrer" content="no-referrer" />
    <title>Python в подарок · Иван на сотку</title>
    <header className="gift-topbar"><span className="gift-brand"><Code2 size={23} /> ИВАН100</span><span><Gift size={16} /> Курс в подарок</span></header>
    {error ? <section className="gift-message" role="alert"><Gift size={38} /><h1>Курс пока недоступен</h1><p>{error}</p><button onClick={() => { setError(''); setRetry(value => value + 1); }}>Попробовать ещё раз</button></section>
      : !course ? <section className="gift-message" role="status"><Code2 className="animate-pulse" size={40} /><h1>Открываем курс Python…</h1></section>
      : <>
        <section className="gift-hero">
          <div><span className="gift-eyebrow">ПОДАРОК, КОТОРЫЙ ОСТАНЕТСЯ С ТОБОЙ</span><h1>Твой первый<br /><span>уверенный код.</span></h1><p>Изучай Python в своём темпе. Смотри объяснения, пробуй, ошибайся и находи решение — прямо здесь.</p><button className="gift-primary" onClick={resume}>{done ? 'Продолжить обучение' : 'Начать учиться'}<ArrowRight size={19} /></button></div>
          <div className="gift-hero-code" aria-hidden="true"><div><i /><i /><i /><span>hello.py</span></div><pre><span># всё начинается с одной строки</span>{'\n'}<b>print</b>(<em>"У меня получится!"</em>){'\n\n'}<span>› У меня получится!</span><strong>✓ Первый шаг сделан</strong></pre></div>
        </section>
        <div className="gift-facts"><span><BookOpen size={18} /><b>{course.tasks.length}</b> {plural(course.tasks.length, ['тема', 'темы', 'тем'])}</span><span><Code2 size={18} /><b>{total}</b> {plural(total, ['задача', 'задачи', 'задач'])} с проверкой</span><span><ShieldCheck size={18} /> Без регистрации</span></div>
        <section className="gift-course" aria-label="Программа курса">
          <aside className="gift-navigation"><div className="gift-navigation-title">ТВОЙ МАРШРУТ <span>{done} / {total}</span></div><div className="gift-overall-progress"><span style={{ width: `${total ? 100 * done / total : 0}%` }} /></div><nav aria-label="Темы Python">{course.tasks.map((item, index) => <button key={item.number} className={item.number === task?.number ? 'is-active' : ''} aria-current={item.number === task?.number ? 'step' : undefined} onClick={() => setActiveNumber(item.number)}><span className="gift-topic-number">{progress[item.id] === 100 ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span><span><b>{item.title.replace(/^Python\s*/i, '')}</b><small>{session.getSolvedIds(item.number).length} из {item.questionCount} задач</small></span><ChevronRight size={16} /></button>)}</nav><p className="gift-save-note">Код и прогресс сохраняются в этом браузере. Возвращайся по этой же ссылке на этом устройстве.</p></aside>
          <div className="gift-content">
            {task ? <><header className="gift-topic-header"><span className="gift-eyebrow">ШАГ {course.tasks.indexOf(task) + 1} ИЗ {course.tasks.length}</span><h2>{task.title.replace(/^Python\s*/i, '')}</h2><p>Разбери тему и закрепи её на практике. Задачи можно открывать в любом порядке.</p></header>
              {Object.keys(topicTheory).length > 0 && <PythonGiftTheoryCard key={task.number} theory={topicTheory} title={task.title.replace(/^Python\s*/i, '')} onOpen={() => openTheory()} />}
              {model.subsections.filter(section => section.count || (!section.isDefault && hasTheory(task.entry, section.id))).map(section => <section className="gift-subsection" key={section.id}><header><div><Code2 size={18} /><h3>{section.isDefault ? 'Практика' : section.title}</h3></div><span>{section.items.filter(item => solved.includes(String(item.question.id))).length} / {section.count}</span></header><div className="gift-subsection-body">{!section.isDefault && hasTheory(task.entry, section.id) && <button className="gift-theory" onClick={() => openTheory(section.id)}><span><Play size={18} /><b>Сначала разберёмся в теме</b></span><span>Открыть объяснение <ArrowRight size={16} /></span></button>}<div className="gift-questions">{section.items.map(item => <button key={item.key} className={solved.includes(String(item.question.id)) ? 'is-solved' : ''} onClick={() => open(task, item.questionIndex, section.id)}><span>{solved.includes(String(item.question.id)) ? <Check size={17} /> : `№${item.globalNumber}`}</span><b>{item.question.title || `Задача ${item.globalNumber}`}</b><ArrowRight size={16} /></button>)}</div></div></section>)}</> : <div className="gift-message"><h2>Преподаватель скоро добавит материалы</h2></div>}
          </div>
        </section>
        <footer className="gift-footer">Иван на сотку <span>Маленькие шаги. Настоящие навыки.</span></footer>
      </>}
    {launch && <PythonTestModal {...runtimeProps} guestSession={session} guestTheoryOverride={launch.theorySource} task={launch.task} testDb={testDb} progress={progress} studentId={`gift-${course.id}`} userName="Участник курса" initialQuestionIndex={launch.index} initialSubsectionId={launch.sectionId} initialShowTheory={launch.theory} onComplete={() => setRevision(value => value + 1)} onClose={() => { setLaunch(null); setRevision(value => value + 1); }} />}
  </main>;
}
