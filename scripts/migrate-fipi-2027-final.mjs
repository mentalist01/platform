import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {buildClassicTaskCatalogMutation, normalizeStoredClassicTaskCatalog} from '../server/classicTaskCatalogMutation.js';
import {buildMockTaskBankSnapshot} from '../server/mockExamTaskRouting.js';
import {serializeTaskCatalogForStore} from '../server/teacherTaskContent.js';
import {validateStudyPlan} from '../server/egeStudyPlan.js';
import {DEFAULT_CLASSIC_TASK_TITLES} from '../src/data/classicTaskCatalog.js';
import {createStudyPlan} from '../src/utils/egeStudyPlan.js';
import {getMockExamContentRevision} from '../src/utils/mockExamVersioning.js';
import {MOCK_PAIR_SCORING} from '../src/utils/mockExamScore.js';

const projectSlots = {10: 13, 13: 23, 23: 28};
const finalSlots = {10: 10, 13: 13, 23: 23};
const changedSlots = [10, 13, 23];
const hasMapping = (catalog, mapping) => {
  const snapshot = buildMockTaskBankSnapshot(catalog);
  return changedSlots.every((slot) => snapshot[slot] === mapping[slot]);
};

export function restoreClassicTaskOrder(stored) {
  const catalog = normalizeStoredClassicTaskCatalog(stored);
  if (!hasMapping(catalog, projectSlots)) return stored;
  const unaffected = catalog.activeTasks.filter(({slotNumber}) => !changedSlots.includes(slotNumber));
  const restored = changedSlots.map((number) => ({
    taskNumber: number,
    slotNumber: number,
    title: DEFAULT_CLASSIC_TASK_TITLES[number],
  }));
  return serializeTaskCatalogForStore(buildClassicTaskCatalogMutation(catalog, {
    tasks: [...unaffected, ...restored],
  }).catalog);
}

const readAttachment = (directory, name, mimeType, digest) => {
  const file = fs.readFileSync(path.join(directory, name));
  assert.equal(createHash('sha256').update(file).digest('hex'), digest, name);
  const storageName = `fipi-2027-${name}`;
  return {
    file,
    lookup: {
      id: storageName, name, mimeType, storageName, url: `/uploads/${storageName}`,
      size: `${(file.length / 1048576).toFixed(2)} MB`, sizeBytes: file.length,
    },
  };
};

const question10 = (attachment) => ({
  id: 'fipi-2027-final-10', sourceTaskNumber: 10,
  question: 'Откройте файл с текстом повести А. И. Куприна «Поединок» в текстовом редакторе. Сколько раз в главе II встречается отдельное слово «и» без учёта регистра? В ответе запишите число.',
  answer: '93', screenshots: [], files: [attachment],
});

const question27 = (attachment) => ({
  id: 'fipi-2027-final-27', sourceTaskNumber: 27,
  question: [
    'В файле описаны частицы. В каждой строке записаны координаты x и y, компоненты скорости Vx и Vy, масса m и признак от I до VII. Столбцы разделены пробелами или табуляцией. В файле до 10 000 строк. Модуль каждого числового значения не больше 100.',
    'Кинетическая энергия частицы равна E = m × (Vx² + Vy²) / 2. Все частицы можно единственным образом разделить на четыре непустых кластера. В каждом кластере разность энергий любой пары частиц по модулю не превышает 2.',
    'Центр кластера — частица, для которой сумма абсолютных разностей её энергии с энергиями остальных частиц кластера минимальна. В каждом кластере такой центр единственный.',
    'В первую ячейку запишите целую часть максимального расстояния между двумя частицами с признаком II из одного кластера, умноженного на 10 000. Расстояние вычисляйте по координатам x и y.',
    'Во вторую ячейку запишите целую часть наибольшей кинетической энергии среди четырёх центров, умноженной на 10 000.',
  ].join('\n\n'),
  answerCountOverride: 2, answerTable: {rows: 1, columns: 2}, scoring: MOCK_PAIR_SCORING,
  answers: ['539936', '100704'], screenshots: [], files: [attachment],
});

const insertBankQuestion = (tests, number, question) => {
  const bank = tests[number] || {};
  const basic = bank.basic || [];
  if (!basic.some((entry) => entry.id === question.id)) {
    tests[number] = {...bank, basic: [...basic, {...question, label: 'Демоверсия ФИПИ 2027'}]};
  }
};

const routeSlots = {'10': '13', '13': '23', '23': '10'};
const routeSlot = (slot) => routeSlots[slot] || slot;
const remapRouteRef = (ref) => ref && {...ref, blockId: routeSlot(ref.blockId)};
const preparedSlots = {10: 13, 13: 23};
const preparedName = (name, from, to) => typeof name === 'string' && new RegExp(`^${from}(?=\\s|$)`).test(name)
  ? name.replace(/^\d+/, String(to))
  : name;

function remapPreparedTasks(state, runFiles, homeworkFiles, teacherId) {
  const affectedSets = new Set();
  for (const set of Object.values(state.sets)) {
    const oldNumber = set.taskNumber;
    if (set.teacherId !== teacherId || !preparedSlots[oldNumber]) continue;
    affectedSets.add(set.id);
    set.taskNumber = preparedSlots[set.taskNumber];
    set.name = preparedName(set.name, oldNumber, set.taskNumber);
    set.version += 1;
  }
  const updateTask = (task) => {
    const number = preparedSlots[task.sourceTaskNumber];
    if (!affectedSets.has(task.sourceSetId) || !number) return;
    task.sourceSetName = preparedName(task.sourceSetName, task.sourceTaskNumber, number);
    task.sourceTaskNumber = number;
  };
  const updatedHomeworks = new Map();
  for (const snapshot of homeworkFiles) {
    if (snapshot.teacherId !== teacherId || !affectedSets.has(snapshot.task.sourceSetId)) continue;
    updateTask(snapshot.task);
    snapshot.taskNumber = preparedSlots[snapshot.taskNumber] ?? snapshot.taskNumber;
    updatedHomeworks.set(snapshot.id, snapshot.taskNumber);
  }
  for (const run of runFiles) {
    if (run.teacherId !== teacherId) continue;
    run.tasks.forEach(updateTask);
    for (const removed of run.detachedSets || []) (removed.tasks || []).forEach(updateTask);
    const number = affectedSets.has(run.setId) ? preparedSlots[run.taskNumber] : updatedHomeworks.get(run.homework?.snapshotId);
    if (number) {
      run.name = preparedName(run.name, run.taskNumber, number);
      run.taskNumber = number;
    }
  }
  return updatedHomeworks;
}

function remapPreparedHomeworkGoals(data, updatedHomeworks) {
  if (!updatedHomeworks.size) return;
  // Prepared homework snapshots and assignments share the stable preparedId.
  const seen = new Set();
  const visit = (item) => {
    if (!item || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (item.type === 'prepared' && updatedHomeworks.has(item.preparedId)) {
      item.taskNumber = updatedHomeworks.get(item.preparedId);
    }
    Object.values(item).forEach(visit);
  };
  visit(data);
}

function remapStudyPlan(plan) {
  if (plan.blocks?.['10']?.title !== 'IP-адреса и маски'
      || plan.blocks?.['13']?.title !== 'Подсчёт программ'
      || plan.blocks?.['23']?.title !== 'Алгоритмы на графах') return plan;
  assert.ok(!plan.order.includes('23') && !plan.blocks['23'].parts.length && !plan.blocks['23'].note,
    'A saved graph plan needs an explicit archival decision');
  const defaults = createStudyPlan().blocks;
  const next = {...plan, order: plan.order.map(routeSlot), blocks: {...plan.blocks}};
  for (const [previous, current] of Object.entries(routeSlots)) {
    next.blocks[current] = {...plan.blocks[previous], title: defaults[current].title};
  }
  if (next.stages) next.stages = next.stages.map((stage) => {
    const blockId = routeSlot(stage.blockId);
    return {...stage, blockId, id: blockId + stage.id.slice(stage.blockId.length)};
  });
  validateStudyPlan(next);
  return {...next, revision: (plan.revision || 0) + 1, updatedAt: new Date().toISOString()};
}

function remapStudyRecord(record) {
  const remapEntries = (value, transform) => Object.fromEntries(Object.entries(value || {}).map(transform));
  assert.ok(record.current?.blockId !== '23'
    && record.stageSetup?.blockId !== '23'
    && !Object.values(record.links || {}).some(({blockId}) => blockId === '23')
    && !Object.keys(record.completed || {}).some((key) => key.startsWith('23:')),
  'Graph study progress needs an explicit archival decision');
  const next = {
    ...record,
    current: remapRouteRef(record.current),
    ...(record.stageSetup ? {stageSetup: remapRouteRef(record.stageSetup)} : {}),
    links: remapEntries(record.links, ([key, link]) => [key, remapRouteRef(link)]),
    completed: remapEntries(record.completed, ([key, stamp]) => {
      const [block, part] = key.split(':');
      return [`${routeSlot(block)}:${part}`, stamp];
    }),
  };
  return JSON.stringify(record) === JSON.stringify(next) ? record : {...next, revision: (record.revision || 0) + 1};
}

function updateMock(exam, replacement10, replacement27) {
  assert.ok(hasMapping({tasks: Object.entries(exam.taskBankSnapshot).map(([number, taskNumber]) => ({number, taskNumber}))}, projectSlots));
  const tasks = {...exam.tasks};
  for (const number of changedSlots) {
    assert.equal(tasks[number].id, `mock2-import-20261113-${number}`);
    assert.ok(tasks[number].answer, `Missing key for task ${number}`);
  }
  assert.equal(tasks[25].answerTable?.rows, 12);
  assert.equal(tasks[25].answerTable?.columns, 2);
  assert.equal(tasks[25].id, 'mock2-import-20261113-25');
  tasks[25] = {
    ...tasks[25], screenshots: [],
    question: [
      'Перебирайте целые числа, большие 600 000, в порядке возрастания. Найдите первые пять чисел, у каждого из которых есть натуральный делитель, оканчивающийся на 7 и отличный от самого числа и от 7.',
      'Запишите найденные числа в первый столбец таблицы в порядке возрастания. Во второй столбец напротив каждого числа запишите его наименьший подходящий делитель. Лишние строки оставьте пустыми.',
    ].join('\n\n'),
  };
  tasks[23] = {
    ...tasks[13], sourceTaskNumber: 23, screenshots: [],
    question: 'Исполнитель умеет прибавлять 1 и менять местами цифры десятков и единиц, когда цифра десятков строго меньше цифры единиц. Программа — последовательность этих команд. Сколько программ переводят число 100 в число 140?',
  };
  tasks[13] = {
    ...tasks[10], sourceTaskNumber: 13, screenshots: [],
    question: 'Узел сети имеет IP-адрес 189.163.226.71. Маска сети — 255.255.255.240. Адрес сети получается поразрядной конъюнкцией IP-адреса и маски. Найдите адрес сети и запишите сумму значений его четырёх октетов.',
  };
  tasks[10] = replacement10;
  tasks[26] = {...tasks[26], scoring: MOCK_PAIR_SCORING};
  tasks[27] = replacement27;
  return {
    ...exam, tasks,
    taskBankSnapshot: {...exam.taskBankSnapshot, ...finalSlots},
    taskTitleSnapshot: {...exam.taskTitleSnapshot, ...Object.fromEntries(changedSlots.map((slot) => [slot, DEFAULT_CLASSIC_TASK_TITLES[slot]]))},
    contentRevision: getMockExamContentRevision(exam) + 1, updatedAt: new Date().toISOString(),
  };
}

function run([mode, dataDir, uploadsDir, assetDir, examId, backupDir]) {
  assert.ok(['check', 'apply'].includes(mode) && dataDir && uploadsDir && assetDir && examId && backupDir,
    'Usage: check|apply DATA_DIR UPLOADS_DIR ASSET_DIR EXAM_ID BACKUP_DIR');
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
  const changes = new Map();
  const stage = (name, previous, next) => {
    if (JSON.stringify(previous) !== JSON.stringify(next)) changes.set(name, next);
  };
  const odt = readAttachment(assetDir, 'demo_10.odt', 'application/vnd.oasis.opendocument.text',
    'c786e4dcffef5dcd9cf717a5f19c1698653fa6a91a67921357d8a68749828c42');
  const txt = readAttachment(assetDir, 'demo_27.txt', 'text/plain',
    'ad36710cf8a489ba6e1d79357974f6e6463b98b5225084be78352ab83407597b');
  const replacement10 = question10(odt.lookup);
  const replacement27 = question27(txt.lookup);
  const catalog = read('task-catalog.json');
  const restored = restoreClassicTaskOrder(catalog);
  assert.ok(hasMapping(restored, finalSlots), 'Unexpected global task catalog');
  stage('task-catalog.json', catalog, restored);
  const titles = read('task-titles.json');
  stage('task-titles.json', titles, {...titles, ...Object.fromEntries(changedSlots.map((slot) => [slot, DEFAULT_CLASSIC_TASK_TITLES[slot]]))});
  const exams = read('mock-exams.json');
  const exam = exams.find((item) => item.id === examId);
  assert.ok(exam?.teacherId && Object.keys(exam.tasks || {}).length === 27, 'Target exam missing');
  const migrated = exam.tasks['27']?.id === replacement27.id;
  const nextExam = migrated ? exam : updateMock(exam, replacement10, replacement27);
  stage('mock-exams.json', exams, exams.map((item) => item === exam ? nextExam : item));
  if (!migrated) {
    const stateName = 'prepared-lesson-tasks/state.json';
    const state = read(stateName);
    const nextState = structuredClone(state);
    const paths = (dir, pattern) => fs.existsSync(path.join(dataDir, dir))
      ? fs.readdirSync(path.join(dataDir, dir)).filter((filename) => pattern.test(filename)).map((filename) => dir + '/' + filename)
      : [];
    const runPaths = paths('prepared-lesson-tasks/runs', /^[a-f0-9-]{36}\.json$/);
    const homeworkPaths = paths('prepared-homework', /^snapshot-[a-f0-9-]{36}\.json$/);
    const runFiles = runPaths.map(read);
    const homeworkFiles = homeworkPaths.map(read);
    const nextRuns = structuredClone(runFiles);
    const nextHomeworks = structuredClone(homeworkFiles);
    const updatedHomeworks = remapPreparedTasks(nextState, nextRuns, nextHomeworks, exam.teacherId);
    stage(stateName, state, nextState);
    runPaths.forEach((name, index) => stage(name, runFiles[index], nextRuns[index]));
    homeworkPaths.forEach((name, index) => stage(name, homeworkFiles[index], nextHomeworks[index]));
    const progress = read('progress.json');
    const next = structuredClone(progress);
    remapPreparedHomeworkGoals(next, updatedHomeworks);
    for (const record of Object.values(next)) {
      const attempt = record.mockAttempts?.[examId];
      if (attempt && !attempt.examSnapshot) {
        attempt.examSnapshot = structuredClone(exam);
        attempt.examRevision = getMockExamContentRevision(exam);
      }
    }
    stage('progress.json', progress, next);
    for (const name of ['homework-drafts.json', 'learning-groups.json']) {
      if (!fs.existsSync(path.join(dataDir, name))) continue;
      const data = read(name);
      const nextData = structuredClone(data);
      remapPreparedHomeworkGoals(nextData, updatedHomeworks);
      stage(name, data, nextData);
    }
  }
  const tests = read('tests.json');
  const nextTests = structuredClone(tests);
  for (const [slot, question] of [[10, replacement10], [27, replacement27]]) insertBankQuestion(nextTests, slot, question);
  stage('tests.json', tests, nextTests);
  const personal = read('teacher-task-content.json');
  const nextPersonal = structuredClone(personal);
  for (const [teacherId, entry] of Object.entries(nextPersonal.teachers)) {
    if (entry.catalog) entry.catalog = restoreClassicTaskOrder(entry.catalog);
    if (teacherId !== exam.teacherId) continue;
    for (const [slot, question] of [[10, replacement10], [27, replacement27]]) {
      if (entry.tests?.[slot]) insertBankQuestion(entry.tests, slot, question);
    }
  }
  stage('teacher-task-content.json', personal, nextPersonal);
  const plansName = 'ege-study-plans.json';
  if (fs.existsSync(path.join(dataDir, plansName))) {
    const plans = read(plansName);
    const nextPlans = structuredClone(plans);
    const remappedTeachers = Object.keys(plans.plans).filter((id) => {
      nextPlans.plans[id] = remapStudyPlan(plans.plans[id]);
      return nextPlans.plans[id] !== plans.plans[id];
    });
    stage(plansName, plans, nextPlans);
    for (const name of ['student-study-progress.json', 'group-study-progress.json']) {
      if (!fs.existsSync(path.join(dataDir, name))) continue;
      const records = read(name);
      const nextRecords = structuredClone(records);
      for (const [key, record] of Object.entries(records.records)) {
        if (remappedTeachers.includes(key.split(':')[0])) nextRecords.records[key] = remapStudyRecord(record);
      }
      stage(name, records, nextRecords);
    }
  }

  for (const {file, lookup} of [odt, txt]) {
    const destination = path.join(uploadsDir, lookup.storageName);
    if (fs.existsSync(destination)) assert.ok(fs.readFileSync(destination).equals(file), 'Conflicting attachment');
  }
  console.log(mode.toUpperCase(), 'revision', nextExam.contentRevision, 'stores', [...changes.keys()].join(', '));
  if (mode === 'check' || changes.size === 0) return;
  fs.mkdirSync(backupDir, {mode: 0o700});
  for (const name of changes.keys()) {
    const backup = path.join(backupDir, name);
    fs.mkdirSync(path.dirname(backup), {recursive: true});
    fs.copyFileSync(path.join(dataDir, name), backup, fs.constants.COPYFILE_EXCL);
  }
  const paths = [];
  try {
    for (const {file, lookup} of [odt, txt]) {
      const destination = path.join(uploadsDir, lookup.storageName);
      if (!fs.existsSync(destination)) fs.writeFileSync(destination, file, {flag: 'wx'});
    }
    for (const [name, value] of changes) {
      const destination = path.join(dataDir, name);
      const temporary = `${destination}.${randomUUID()}.tmp`;
      paths.push([temporary, destination]);
      fs.writeFileSync(temporary, JSON.stringify(value), {mode: 0o600, flag: 'wx'});
    }
    paths.forEach(([temporary, destination]) => fs.renameSync(temporary, destination));
  } catch (error) {
    for (const name of changes.keys()) fs.copyFileSync(path.join(backupDir, name), path.join(dataDir, name));
    throw error;
  } finally {
    paths.forEach(([temporary]) => fs.rmSync(temporary, {force: true}));
  }
}

if (process.argv[2]) run(process.argv.slice(2));
