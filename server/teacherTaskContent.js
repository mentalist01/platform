const isPlainObject = (value) => Boolean(
  value && typeof value === 'object' && !Array.isArray(value)
);

const isSafeKey = (value) => {
  const key = String(value || '').trim();
  return Boolean(key && key !== '__proto__' && key !== 'constructor' && key !== 'prototype');
};

const clonePlainObject = (value) => (
  isPlainObject(value) ? structuredClone(value) : {}
);

const normalizeTeacherEntry = (value) => {
  const source = isPlainObject(value) ? value : {};
  const tests = {};
  Object.entries(isPlainObject(source.tests) ? source.tests : {}).forEach(([taskNumber, bank]) => {
    if (!isSafeKey(taskNumber) || !isPlainObject(bank)) return;
    tests[String(taskNumber)] = structuredClone(bank);
  });
  return {
    ...(isPlainObject(source.catalog) ? { catalog: structuredClone(source.catalog) } : {}),
    tests,
  };
};

export const normalizeTeacherTaskContentStore = (value) => {
  const source = isPlainObject(value) ? value : {};
  const teachers = {};
  Object.entries(isPlainObject(source.teachers) ? source.teachers : {}).forEach(([teacherId, entry]) => {
    if (!isSafeKey(teacherId)) return;
    teachers[String(teacherId).trim()] = normalizeTeacherEntry(entry);
  });
  const rawNext = Number(source.nextTaskNumber);
  return {
    version: 1,
    nextTaskNumber: Number.isInteger(rawNext) && rawNext >= 28 ? rawNext : 28,
    teachers,
  };
};

export const mergeTeacherTestsDb = (globalTestsDb, teacherEntry) => ({
  ...clonePlainObject(globalTestsDb),
  ...clonePlainObject(teacherEntry?.tests),
});

const jsonEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const getChangedTestTaskKeys = (previousTestsDb, nextTestsDb) => {
  const previous = isPlainObject(previousTestsDb) ? previousTestsDb : {};
  const next = isPlainObject(nextTestsDb) ? nextTestsDb : {};
  return Array.from(new Set([...Object.keys(previous), ...Object.keys(next)]))
    .filter(isSafeKey)
    .filter((key) => !jsonEqual(previous[key], next[key]));
};

export const applyTeacherTestsUpdate = (storeValue, teacherId, globalTestsDb, submittedTestsDb) => {
  const id = String(teacherId || '').trim();
  if (!isSafeKey(id)) throw new Error('teacherId required');
  const store = normalizeTeacherTaskContentStore(storeValue);
  const previousEntry = store.teachers[id] || normalizeTeacherEntry(null);
  const previousMerged = mergeTeacherTestsDb(globalTestsDb, previousEntry);
  const submitted = clonePlainObject(submittedTestsDb);
  const changedTaskKeys = getChangedTestTaskKeys(previousMerged, submitted);
  const nextTests = { ...previousEntry.tests };
  changedTaskKeys.forEach((key) => {
    if (Object.hasOwn(submitted, key) && isPlainObject(submitted[key])) {
      if (Object.hasOwn(globalTestsDb, key) && jsonEqual(submitted[key], globalTestsDb[key])) {
        delete nextTests[key];
      } else {
        nextTests[key] = structuredClone(submitted[key]);
      }
    } else {
      nextTests[key] = { basic: [], advanced: [], expert: [] };
    }
  });
  store.teachers[id] = { ...previousEntry, tests: nextTests };
  return { store, previousMerged, nextMerged: mergeTeacherTestsDb(globalTestsDb, store.teachers[id]), changedTaskKeys };
};

export const applyGlobalTestsUpdate = (storeValue, previousGlobalTestsDb, submittedTestsDb) => {
  const store = normalizeTeacherTaskContentStore(storeValue);
  const nextGlobal = clonePlainObject(submittedTestsDb);
  const changedTaskKeys = getChangedTestTaskKeys(previousGlobalTestsDb, nextGlobal);
  if (changedTaskKeys.length > 0) {
    Object.values(store.teachers).forEach((entry) => {
      changedTaskKeys.forEach((key) => delete entry.tests[key]);
    });
  }
  return { store, nextGlobal, changedTaskKeys };
};

const getCatalogEntries = (catalog) => [
  ...(Array.isArray(catalog?.activeTasks) ? catalog.activeTasks : []),
  ...(Array.isArray(catalog?.archivedTasks) ? catalog.archivedTasks : []),
];

export const getSharedNextTaskNumber = (storeValue, globalCatalog, maximum = 99) => {
  const store = normalizeTeacherTaskContentStore(storeValue);
  let highest = 27;
  getCatalogEntries(globalCatalog).forEach((task) => {
    const number = Number(task?.taskNumber);
    if (Number.isInteger(number)) highest = Math.max(highest, number);
  });
  Object.values(store.teachers).forEach((entry) => {
    const catalog = entry?.catalog;
    const entries = [
      ...(Array.isArray(catalog?.tasks) ? catalog.tasks : []),
      ...(Array.isArray(catalog?.activeTasks) ? catalog.activeTasks : []),
      ...(Array.isArray(catalog?.archivedTasks) ? catalog.archivedTasks : []),
    ];
    entries.forEach((task) => {
      const number = Number(task?.taskNumber ?? task?.id);
      if (Number.isInteger(number)) highest = Math.max(highest, number);
    });
  });
  return Math.min(maximum + 1, Math.max(store.nextTaskNumber, highest + 1, 28));
};

export const serializeTaskCatalogForStore = (catalog) => ({
  version: 1,
  nextTaskNumber: Number(catalog?.nextTaskNumber) || 28,
  tasks: (Array.isArray(catalog?.activeTasks) ? catalog.activeTasks : []).map((task) => ({
    taskNumber: Number(task.taskNumber),
    number: Number(task.slotNumber),
    title: String(task.title || '').trim(),
    xpReward: Number(task.xpReward) || 100,
  })),
  archivedTasks: (Array.isArray(catalog?.archivedTasks) ? catalog.archivedTasks : []).map((task) => ({
    ...structuredClone(task),
    taskNumber: Number(task.taskNumber),
    slotNumber: Number(task.slotNumber ?? task.lastSlotNumber),
  })),
});

export const applyGlobalCatalogToTeacherStores = (storeValue, globalCatalog, teacherIds = []) => {
  const store = normalizeTeacherTaskContentStore(storeValue);
  const globalIds = new Set(getCatalogEntries(globalCatalog).map((task) => Number(task?.taskNumber)));
  const globalStored = serializeTaskCatalogForStore(globalCatalog);
  const ids = new Set([
    ...Object.keys(store.teachers),
    ...(Array.isArray(teacherIds) ? teacherIds.map((id) => String(id || '').trim()) : []),
  ]);
  ids.forEach((teacherId) => {
    if (!isSafeKey(teacherId)) return;
    const current = store.teachers[teacherId] || normalizeTeacherEntry(null);
    const nextCatalog = structuredClone(globalStored);
    const personalCatalog = current.catalog;
    const personalEntries = [
      ...(Array.isArray(personalCatalog?.tasks) ? personalCatalog.tasks : []),
      ...(Array.isArray(personalCatalog?.archivedTasks) ? personalCatalog.archivedTasks : []),
    ];
    const personalOnlyArchives = personalEntries
      .filter((task) => !globalIds.has(Number(task?.taskNumber)))
      .map((task) => ({
        taskNumber: Number(task.taskNumber),
        slotNumber: Number(task.slotNumber ?? task.number ?? task.lastSlotNumber),
        title: String(task.title || '').trim(),
        xpReward: Number(task.xpReward) || 100,
        archived: true,
        archivedAt: String(task.archivedAt || new Date().toISOString()),
      }));
    const archiveIds = new Set(nextCatalog.archivedTasks.map((task) => Number(task.taskNumber)));
    personalOnlyArchives.forEach((task) => {
      if (!archiveIds.has(task.taskNumber)) {
        archiveIds.add(task.taskNumber);
        nextCatalog.archivedTasks.push(task);
      }
    });
    store.teachers[teacherId] = {
      ...current,
      catalog: nextCatalog,
    };
  });
  store.nextTaskNumber = Math.max(store.nextTaskNumber, Number(globalCatalog?.nextTaskNumber) || 28);
  return store;
};
