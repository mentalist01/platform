import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_MESSAGE_TEMPLATES, MESSAGE_TEMPLATE_CATEGORIES } from '../src/utils/messageTemplates.js';
import { buildPythonGroupProgress } from '../src/utils/pythonGroupProgress.js';
import { normalizePythonTaskCatalog } from '../src/utils/pythonTaskCatalog.js';
import { addCalendarDays, moscowDay, weekdayIndex, AVAILABILITY_WEEKDAYS, AVAILABILITY_DAY_NAMES } from '../src/utils/groupAvailability.js';
import { isScheduleEntryInDateRange } from '../src/utils/scheduleDateRange.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const minuteOf = value => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
const cancelled = entry => entry.cancelled || entry.isCancelled || ['cancelled', 'canceled'].includes(entry.status);

export function messageAvailabilityWeek(entries, start, now = Date.now()) {
  const events = [];
  const weekStart = Date.parse(`${start}T00:00:00+03:00`);
  for (let dayIndex = -1; dayIndex < 7; dayIndex++) {
    const day = addCalendarDays(start, dayIndex);
    for (const entry of entries) {
      if (cancelled(entry) || entry.excludedDates?.includes(day) || entry.cancelledDates?.includes(day)
        || !isScheduleEntryInDateRange(entry, day)) continue;
      if (entry.date ? entry.date !== day : entry.weekdayKey !== AVAILABILITY_WEEKDAYS[weekdayIndex(day)]) continue;
      const minute = minuteOf(entry.time), duration = Number(entry.durationMinutes || 60);
      if (!Number.isFinite(minute) || !Number.isFinite(duration) || duration <= 0) continue;
      const from = dayIndex * 1440 + minute, until = from + duration;
      for (let target = Math.max(0, dayIndex); target < 7 && target * 1440 < until; target++) {
        if (until > target * 1440) events.push({ dayIndex: target, startMinutes: Math.max(0, from - target * 1440), endMinutes: Math.min(1440, until - target * 1440) });
      }
    }
  }
  // Past minutes are unavailable even when the calendar has no lesson there.
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const elapsed = (now - weekStart) / 60000 - dayIndex * 1440;
    if (elapsed > 0) events.push({ dayIndex, startMinutes: 0, endMinutes: Math.min(1440, Math.ceil(elapsed)) });
  }
  return events;
}

export function rankMessageGroups({ groups, students, progressDb, testsDb, catalog, entries = [], now = Date.now() }) {
  const topics = normalizePythonTaskCatalog(testsDb.__pythonTaskCatalog, catalog).filter(topic => topic.sectionId === 'topics' && topic.showInPath !== false);
  return groups.filter(group => !group.deletedAt && group.status !== 'completed').map(group => {
    const progress = buildPythonGroupProgress({ group, students, progressDb, testsDb });
    const covered = topics.map(topic => ({ ...topic, covered: progress.topics[topic.number]?.coveredCount || 0,
      total: progress.topics[topic.number]?.totalQuestions || 0 }));
    const lastTopic = covered.findLastIndex(topic => topic.covered > 0);
    const current = covered[lastTopic];
    const slots = [...(group.schedule || []), ...entries.filter(entry => entry.groupId === group.id && !entry.learningGroupMatchAmbiguous)]
      .filter(entry => !cancelled(entry) && (!entry.date || entry.date >= moscowDay(now)))
      .map(entry => ({ day: entry.date ? weekdayIndex(entry.date) : AVAILABILITY_WEEKDAYS.indexOf(entry.weekdayKey), time: entry.time }))
      .filter(entry => entry.day >= 0 && entry.day <= 6 && Number.isFinite(minuteOf(entry.time)));
    const schedule = [...new Map(slots.map(slot => [`${slot.day}/${slot.time}`, slot])).values()]
      .sort((a, b) => a.day - b.day || minuteOf(a.time) - minuteOf(b.time))
      .map(slot => `${AVAILABILITY_DAY_NAMES[slot.day].toLocaleLowerCase('ru-RU')} в ${slot.time}`).join(', ');
    return { id: group.id, name: group.name, memberCount: progress.memberCount, lastTopic,
      topicTitle: current?.title || 'Начало курса', coveredCount: covered.reduce((sum, row) => sum + row.covered, 0),
      topicCovered: current?.covered || 0, topicTotal: current?.total || 0, schedule };
  }).sort((a, b) => Number(!a.memberCount) - Number(!b.memberCount) || a.lastTopic - b.lastTopic
    || a.topicCovered - b.topicCovered || a.coveredCount - b.coveredCount || a.name.localeCompare(b.name, 'ru-RU'));
}

export function registerMessageTemplates(app, deps) {
  const filename = path.join(deps.dataDir, 'teacher-message-templates.json');
  const read = () => {
    if (!fs.existsSync(filename)) return {};
    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (data.version !== 1 || !data.teachers || typeof data.teachers !== 'object' || Array.isArray(data.teachers)) throw Error('Invalid message templates storage');
    return data.teachers;
  };
  const list = (data, teacherId) => data[teacherId] || DEFAULT_MESSAGE_TEMPLATES.map(template => ({ ...template, revision: 'default' }));
  deps.telegram?.register(app, (teacherId, templateId) => list(read(), teacherId).find(template => template.id === templateId));
  const write = data => {
    fs.mkdirSync(deps.dataDir, { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, teachers: data }, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  };
  const route = action => async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.auth?.role !== 'teacher') return res.status(403).json({ error: 'Шаблоны доступны преподавателю.' });
    try { res.json(await action(req)); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Не удалось загрузить или сохранить шаблоны. Попробуйте ещё раз.' }); }
  };
  const reviewFilename = path.join(deps.dataDir, 'teacher-review-requests.json');
  const reviewTarget = req => {
    const { studentId, month } = req.params;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Выберите месяц отчёта.');
    if (!deps.students().some(student => student.id === studentId && student.teacherId === req.auth.id)) fail('Ученик не найден.', 404);
    return `${studentId}/${month}`;
  };
  const readReviews = () => {
    if (!fs.existsSync(reviewFilename)) return {};
    const data = JSON.parse(fs.readFileSync(reviewFilename, 'utf8'));
    if (data.version !== 1 || !data.teachers || typeof data.teachers !== 'object' || Array.isArray(data.teachers)) throw Error('Invalid review request storage');
    return data.teachers;
  };
  const reviewRecord = (data, req, key) => data[req.auth.id]?.[key] || { status: 'not-asked', revision: '', updatedAt: '' };
  app.get('/api/message-templates/review-status/:studentId/:month', route(req => {
    const key = reviewTarget(req);
    return { record: reviewRecord(readReviews(), req, key) };
  }));
  app.put('/api/message-templates/review-status/:studentId/:month', route(req => {
    const key = reviewTarget(req), data = readReviews(), previous = reviewRecord(data, req, key);
    if (!['not-asked', 'asked', 'later', 'received'].includes(req.body?.status)) fail('Выберите отметку просьбы об отзыве.');
    if (req.body.revision !== previous.revision) fail('Отметка изменилась в другом окне. Обновите её и повторите действие.', 409);
    const record = { status: req.body.status, revision: randomUUID(), updatedAt: new Date().toISOString() };
    data[req.auth.id] = { ...data[req.auth.id], [key]: record };
    fs.mkdirSync(deps.dataDir, { recursive: true });
    const temporary = `${reviewFilename}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, teachers: data }, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, reviewFilename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return { record };
  }));
  app.get('/api/message-templates', route(req => ({ templates: list(read(), req.auth.id) })));
  app.put('/api/message-templates/:id', route(req => {
    const data = read(), templates = list(data, req.auth.id), index = templates.findIndex(row => row.id === req.params.id);
    const previous = templates[index], body = req.body;
    if (typeof body?.revision !== 'string' || body.revision !== (previous?.revision || '')) fail('Шаблон изменился в другом окне. Скопируйте свои правки и загрузите актуальную версию.', 409);
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100
      || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 10000
      || !Object.hasOwn(MESSAGE_TEMPLATE_CATEGORIES, body.category) || typeof body.attachAvailability !== 'boolean') fail('Укажите название, текст и категорию шаблона. Текст — до 10 000 символов.');
    if (!previous && (!/^[a-zA-Z0-9-]{1,80}$/.test(req.params.id) || templates.length >= 100)) fail('Можно сохранить до 100 шаблонов.');
    const telegramVideoId = body.telegramVideoId ?? previous?.telegramVideoId ?? '';
    if (telegramVideoId && (typeof telegramVideoId !== 'string'
      || (telegramVideoId !== previous?.telegramVideoId && !deps.telegram?.hasVideo(req.auth.id, telegramVideoId)))) {
      fail('Выберите видео из вашего Telegram-бота.');
    }
    const template = { id: req.params.id, name: body.name.trim(), body: body.body.trim(), category: body.category,
      attachAvailability: body.attachAvailability, ...(telegramVideoId ? { telegramVideoId } : {}),
      revision: randomUUID(), updatedAt: new Date().toISOString() };
    data[req.auth.id] = previous ? templates.map(row => row.id === template.id ? template : row) : [...templates, template];
    write(data);
    return { template, templates: data[req.auth.id] };
  }));
  app.delete('/api/message-templates/:id', route(req => {
    const data = read(), templates = list(data, req.auth.id), template = templates.find(row => row.id === req.params.id);
    if (!template) fail('Шаблон уже удалён. Обновите список.', 409);
    if (req.body?.revision !== template.revision) fail('Шаблон изменился в другом окне. Обновите список.', 409);
    data[req.auth.id] = templates.filter(row => row.id !== template.id);
    write(data);
    return { templates: data[req.auth.id] };
  }));
  app.get('/api/message-templates/context', route(async req => {
    const offset = Number(req.query.weekOffset || 0);
    if (![0, 1, 2, 3, 4].includes(offset)) fail('Выберите неделю в ближайший месяц.');
    const today = moscowDay(), start = addCalendarDays(today, -weekdayIndex(today) + offset * 7), end = addCalendarDays(start, 6);
    let entries = [], calendarError = '';
    try { entries = await deps.getEntries(req.auth.id, end, start); }
    catch { calendarError = 'Не удалось проверить календарь. Обновите занятость перед копированием картинки.'; }
    return { generatedAt: new Date().toISOString(), weekStart: start, weekEnd: end, calendarError,
      events: calendarError ? null : messageAvailabilityWeek(entries, start),
      groups: rankMessageGroups({ groups: deps.groups().filter(group => group.teacherId === req.auth.id), students: deps.students(),
        progressDb: deps.progress(), testsDb: deps.tests(req.auth.id), catalog: deps.catalog, entries }) };
  }));
}
