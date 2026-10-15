export const REPORT_FOCUS_LABELS = Object.freeze({ python: 'Python', ege: 'ЕГЭ', mixed: 'Смешанный' });
const clean = value => String(value ?? '').trim().replace(/\s+/gu, ' ');
const lessonLabel = topic => typeof topic === 'string' ? clean(topic) : clean(topic?.text || topic?.title || topic?.name || topic?.label);

export function inferStudentReportFocus(lessons = [], taskTitles = {}, mocks = {}) {
  const counts = { python: 0, ege: 0, mixed: 0, unknown: 0 };
  const pythonTopics = new Set();
  for (const lesson of lessons) {
    const label = lessonLabel(lesson?.topic);
    const numbers = new Set((Array.isArray(lesson?.topic?.taskNumbers) ? lesson.topic.taskNumbers : []).map(Number).filter(n => Number.isInteger(n) && n > 0));
    for (const [number, title] of Object.entries(taskTitles)) {
      if (label && label.toLocaleLowerCase('ru-RU') === clean(title).toLocaleLowerCase('ru-RU')) numbers.add(Number(number));
    }
    const python = [...numbers].some(n => n >= 100) || /\bpython\b|питон/iu.test(label);
    const ege = [...numbers].some(n => n < 100) || /егэ|задани[ея]\s*№?\s*\d/iu.test(label);
    counts[python && ege ? 'mixed' : python ? 'python' : ege ? 'ege' : 'unknown']++;
    if (python) for (const number of numbers) if (number >= 100 && taskTitles[number]) pythonTopics.add(clean(taskTitles[number]));
  }
  const known = counts.python + counts.ege + counts.mixed;
  const sufficient = known >= 2 && known >= lessons.length * 0.6;
  let inferred = '';
  if (sufficient) {
    if (counts.python >= known * 0.75) inferred = 'python';
    else if (counts.ege >= known * 0.75) inferred = 'ege';
    else inferred = 'mixed';
  }
  return { inferred, counts, lessonCount: lessons.length, pythonTopics: [...pythonTopics],
    mockCount: Number(mocks.count) || 0,
    mockDelta: mocks.deltaFromPrevious == null ? null : Number(mocks.deltaFromPrevious),
  };
}

export function studentReportFocusText(context = {}, { focus = 'auto', nextStep = '' } = {}) {
  const chosen = REPORT_FOCUS_LABELS[focus] ? focus : context.inferred || '';
  const manual = Boolean(REPORT_FOCUS_LABELS[focus]);
  const parts = [];
  if (chosen === 'python') {
    parts.push(manual ? 'В этом месяце основной акцент на занятиях сделали на Python.' : 'По сохранённым темам занятий в этом месяце чаще работали над Python.');
    const topicNames = (context.pythonTopics || []).slice(0, 3);
    if (topicNames.length) parts.push(`В частности, разбирали ${topicNames.map(name => `«${name}»`).join(', ')}.`);
    parts.push('Эта работа связана с программированием в ЕГЭ: важно не только написать код на знакомом примере, но и применить его в экзаменационной задаче.');
  } else if (chosen === 'ege') {
    parts.push(manual ? 'В этом месяце основной акцент на занятиях сделали на заданиях ЕГЭ.' : 'По сохранённым темам занятий в этом месяце чаще работали над заданиями ЕГЭ.');
  } else if (chosen === 'mixed') {
    parts.push(manual ? 'В этом месяце на занятиях сочетали изучение Python и работу с заданиями ЕГЭ.' : 'В сохранённых темах занятий за месяц есть и Python, и задания ЕГЭ: работали в обоих направлениях.');
  }
  if (!context.mockCount) {
    parts.push('Свежего пробника за этот месяц пока нет, поэтому оценить изменение экзаменационного результата сейчас нельзя.');
  } else if (context.mockDelta === 0 || context.mockDelta < 0) {
    parts.push(context.mockDelta === 0 ? 'Последний пробник пока не показал прибавки в баллах.' : 'На последнем пробнике результат снизился.');
    if (chosen === 'python' || chosen === 'mixed') parts.push('Мы отдельно работали над программированием; по одному общему баллу результаты этой работы оценить трудно. Теперь важно посмотреть, как получается применять код в заданиях ЕГЭ и где ещё нужна помощь. Сам по себе акцент на Python не объясняет результат пробника.');
    else parts.push('По одному общему баллу причину определить нельзя: важно посмотреть, в каких заданиях возникли затруднения.');
  } else if (context.mockCount && context.mockDelta == null && (chosen === 'python' || chosen === 'mixed')) {
    parts.push('Сохранённый результат пробника пока даёт первую точку отсчёта; сравнения для оценки роста ещё нет.');
  }
  const plan = clean(nextStep).slice(0, 400);
  if (plan) parts.push(`Дальше планируем: ${plan.replace(/[.!?]+$/u, '')}.`);
  return parts.join(' ');
}

export function composeParentReportFocus(report = {}, options = {}) {
  let base = String(report?.texts?.parentBase ?? report?.texts?.parent ?? report?.parentText ?? report?.text ?? '');
  if (!report.focusContext) return base;
  const paragraph = studentReportFocusText(report.focusContext, options);
  if (!paragraph) return base;
  if (!report.focusContext.mockCount) base = base.replace('\n\nПробника в этом месяце пока не было.', '');
  const boundary = base.lastIndexOf('\n\n');
  if (clean(options.nextStep) && boundary >= 0) return `${base.slice(0, boundary)}\n\n${paragraph}`;
  return boundary < 0 ? `${base}\n\n${paragraph}` : `${base.slice(0, boundary)}\n\n${paragraph}${base.slice(boundary)}`;
}

// Changing focus or a late contact load must not discard reviewed teacher edits.
export function updateUntouchedReportDrafts(current, previous, next) {
  return Object.fromEntries(['parent', 'student'].map(key => [key, current[key] === previous[key] ? next[key] : current[key]]));
}
