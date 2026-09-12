export const DEFAULT_COLLAB_SOLUTION_ID = 'main';
export const COLLAB_SOLUTIONS_MAP_KEY = 'codeSolutions';
export const COLLAB_SOLUTIONS_DELETED_KEY = 'codeSolutionsDeleted';
export const MAX_COLLAB_SOLUTIONS = 20;

export const DEFAULT_SOLUTION_NAME = 'Основной код';
const MAX_SOLUTION_NAME_LENGTH = 80;

const normalizeId = (id) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    throw new Error('Некорректный идентификатор решения.');
  }
  return id;
};

const normalizeName = (name) => {
  const normalized = typeof name === 'string' ? name.trim() : '';
  if (!normalized) throw new Error('Введите название решения.');
  if (normalized.length > MAX_SOLUTION_NAME_LENGTH) {
    throw new Error(`Название решения должно быть не длиннее ${MAX_SOLUTION_NAME_LENGTH} символов.`);
  }
  return normalized;
};

const normalizeCreatedAt = (value) => (
  Number.isFinite(value) && value >= 0 ? value : 0
);

export const getCollabSolutionChannels = (doc, id = DEFAULT_COLLAB_SOLUTION_ID) => {
  const solutionId = normalizeId(id);
  const isDefault = solutionId === DEFAULT_COLLAB_SOLUTION_ID;
  return {
    codeText: doc.getText(isDefault ? 'monaco' : `solution:${solutionId}:code`),
    testFileText: doc.getText(isDefault ? 'collab-test-file' : `solution:${solutionId}:testFile`),
    runMap: doc.getMap(isDefault ? 'collabRun' : `solution:${solutionId}:run`),
  };
};

export const listCollabSolutions = (doc) => {
  const solutions = doc.getMap(COLLAB_SOLUTIONS_MAP_KEY);
  const mainName = solutions.get(DEFAULT_COLLAB_SOLUTION_ID)?.name;
  const main = {
    id: DEFAULT_COLLAB_SOLUTION_ID,
    name: typeof mainName === 'string' && mainName.trim() ? mainName.trim() : DEFAULT_SOLUTION_NAME,
    createdAt: 0,
  };
  const others = [];
  const deleted = doc.getMap(COLLAB_SOLUTIONS_DELETED_KEY);
  for (const [id, metadata] of solutions.entries()) {
    if (id === DEFAULT_COLLAB_SOLUTION_ID || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) continue;
    if (deleted.get(id) === true) continue;
    if (!metadata || typeof metadata.name !== 'string' || !metadata.name.trim()) continue;
    others.push({ id, name: metadata.name.trim(), createdAt: normalizeCreatedAt(metadata.createdAt) });
  }
  others.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [main, ...others];
};

const requireSolution = (doc, id) => {
  const solutionId = normalizeId(id);
  if (!listCollabSolutions(doc).some((solution) => solution.id === solutionId)) {
    throw new Error('Решение не найдено.');
  }
  return solutionId;
};

export const createCollabSolution = (doc, {
  sourceId = DEFAULT_COLLAB_SOLUTION_ID,
  name,
  id = globalThis.crypto.randomUUID(),
  createdAt = Date.now(),
} = {}) => {
  const solutionId = normalizeId(id);
  const solutionName = normalizeName(name);
  const sourceSolutionId = requireSolution(doc, sourceId);
  const solutions = doc.getMap(COLLAB_SOLUTIONS_MAP_KEY);
  if (solutionId === DEFAULT_COLLAB_SOLUTION_ID || solutions.has(solutionId)) {
    throw new Error('Решение с таким идентификатором уже существует.');
  }
  if (listCollabSolutions(doc).length >= MAX_COLLAB_SOLUTIONS) {
    throw new Error(`Можно сохранить не больше ${MAX_COLLAB_SOLUTIONS} решений.`);
  }

  const source = getCollabSolutionChannels(doc, sourceSolutionId);
  const code = source.codeText.toString().replace(/\r\n?/g, '\n');
  const testFile = source.testFileText.toString();
  // A copied run is a snapshot, not an instruction to continue a live worker.
  // Deep-copy JSON so arrays/objects in file selections cannot alias the source.
  const runState = JSON.parse(JSON.stringify(source.runMap.toJSON()));
  // A copy has not itself been saved to notes. Do not replay a recent
  // notification belonging to the source solution when opening the new tab.
  for (const key of Object.keys(runState)) {
    if (key.startsWith('saveNotice')) delete runState[key];
  }
  runState.auxPanelMode ??= 'input';
  runState.taskFilesSelectedIds ??= [];
  runState.taskFilesTaskNumber ??= '';
  runState.taskFilesCategory ??= 'class';
  runState.taskFilesPanelOpen ??= false;
  runState.stdinDraft ??= runState.input ?? '';
  if (runState.status === 'running') runState.status = 'idle';
  Object.assign(runState, {
    running: false,
    debugActive: false,
    debugPlaying: false,
    debugTrace: [],
    debugTraceTruncated: false,
    debugStepIndex: -1,
    debugSource: '',
  });
  const destination = getCollabSolutionChannels(doc, solutionId);
  if (destination.codeText.length || destination.testFileText.length || destination.runMap.size) {
    throw new Error('Данные этого решения уже существуют.');
  }
  const metadata = { id: solutionId, name: solutionName, createdAt: normalizeCreatedAt(createdAt) };
  doc.transact(() => {
    if (code) destination.codeText.insert(0, code);
    if (testFile) destination.testFileText.insert(0, testFile);
    for (const [key, value] of Object.entries(runState)) destination.runMap.set(key, value);
    // Publish the tab only after all of its content has been initialized.
    solutions.set(solutionId, metadata);
  }, 'collab-solutions:create');
  return metadata;
};

export const renameCollabSolution = (doc, id, name) => {
  const solutionId = requireSolution(doc, id);
  const solutionName = normalizeName(name);
  const current = listCollabSolutions(doc).find((solution) => solution.id === solutionId);
  const metadata = { ...current, name: solutionName };
  doc.getMap(COLLAB_SOLUTIONS_MAP_KEY).set(solutionId, metadata);
  return metadata;
};

// A separate tombstone wins over a simultaneous rename from an offline peer.
// Keep the channels intact so late edits merge safely and deletion can be undone.
export const deleteCollabSolution = (doc, id) => {
  const solutionId = requireSolution(doc, id);
  if (solutionId === DEFAULT_COLLAB_SOLUTION_ID) throw new Error('Основную вкладку удалить нельзя.');
  doc.getMap(COLLAB_SOLUTIONS_DELETED_KEY).set(solutionId, true);
};

export const restoreCollabSolution = (doc, id) => {
  const solutionId = normalizeId(id);
  if (!doc.getMap(COLLAB_SOLUTIONS_MAP_KEY).has(solutionId)) throw new Error('Вариант не найден.');
  if (listCollabSolutions(doc).length >= MAX_COLLAB_SOLUTIONS) {
    throw new Error(`Можно сохранить не больше ${MAX_COLLAB_SOLUTIONS} решений.`);
  }
  doc.getMap(COLLAB_SOLUTIONS_DELETED_KEY).set(solutionId, false);
};

export const getCollabSolutionSnapshot = (doc, id) => {
  const solutionId = requireSolution(doc, id);
  const solution = listCollabSolutions(doc).find((item) => item.id === solutionId);
  return { ...solution, code: getCollabSolutionChannels(doc, solutionId).codeText.toString() };
};

export const getSharedCollabComparison = (states, localClientId, solutions) => {
  const ids = new Set(solutions.map((item) => item.id));
  for (const [clientId, state] of [...states.entries()].sort(([a], [b]) => a - b)) {
    if (clientId === localClientId || state?.user?.role !== 'teacher') continue;
    const pair = state?.codeComparison;
    if (!pair || typeof pair.id !== 'string' || !pair.id || pair.activeId === pair.compareId) continue;
    if (!ids.has(pair.activeId) || !ids.has(pair.compareId)) continue;
    return { id: `${clientId}:${pair.id}`, activeId: pair.activeId, compareId: pair.compareId,
      name: state.user.name || 'Учитель' };
  }
  return null;
};
