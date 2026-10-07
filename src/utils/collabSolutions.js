export const DEFAULT_COLLAB_SOLUTION_ID = 'main';
export const COLLAB_SOLUTIONS_MAP_KEY = 'codeSolutions';
export const COLLAB_SOLUTIONS_DELETED_KEY = 'codeSolutionsDeleted';
export const COLLAB_SOLUTIONS_ORDER_KEY = 'codeSolutionsOrder';
export const MAX_COLLAB_SOLUTIONS = 20;
export const DEFAULT_COLLAB_CODE_PAGE_ID = 'page-main';
export const COLLAB_CODE_PAGES_KEY = 'codePages';
export const COLLAB_CODE_PAGES_DELETED_KEY = 'codePagesDeleted';
export const COLLAB_SOLUTION_PAGES_KEY = 'codeSolutionPages';
export const MAX_COLLAB_CODE_PAGES = 20;

export const DEFAULT_SOLUTION_NAME = 'Основной код';
const MAX_SOLUTION_NAME_LENGTH = 80;
export const COLLAB_CODE_EOL_NORMALIZATION_ORIGIN = 'collab-code:normalize-eol';

export const normalizeCollabCodeText = (value) => String(value ?? '').replace(/\r\n?/g, '\n');

// Monaco indexes line breaks as one character. Keeping CRLF inside Y.Text makes
// every position after the first Windows line break drift by one character.
// Run this on the server before a room is synchronized so there is one
// authoritative migration instead of competing client-side replacements.
export const normalizeCollabCodeDocument = (doc) => {
  if (!doc?.getText || !doc?.getMap || !doc?.transact) return [];
  const solutionIds = new Set([DEFAULT_COLLAB_SOLUTION_ID]);
  for (const id of doc.getMap(COLLAB_SOLUTIONS_MAP_KEY).keys()) {
    if (typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)) solutionIds.add(id);
  }
  const changes = [];
  for (const id of solutionIds) {
    const codeText = getCollabSolutionChannels(doc, id).codeText;
    const current = codeText.toString();
    const normalized = normalizeCollabCodeText(current);
    if (current !== normalized) changes.push({ id, codeText, normalized });
  }
  if (!changes.length) return [];
  doc.transact(() => {
    changes.forEach(({ codeText, normalized }) => {
      if (codeText.length) codeText.delete(0, codeText.length);
      if (normalized) codeText.insert(0, normalized);
    });
  }, COLLAB_CODE_EOL_NORMALIZATION_ORIGIN);
  return changes.map(({ id }) => id);
};

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

// Legacy channels and tab IDs stay intact on the virtual first page. A page
// only groups these channels; switching never copies or replaces their text.
export const getCollabSolutionPageId = (doc, id) => (
  doc.getMap(COLLAB_SOLUTION_PAGES_KEY).get(id) || DEFAULT_COLLAB_CODE_PAGE_ID
);

export const listCollabCodePages = (doc) => {
  const catalog = doc.getMap(COLLAB_CODE_PAGES_KEY);
  const deleted = doc.getMap(COLLAB_CODE_PAGES_DELETED_KEY);
  const main = { id: DEFAULT_COLLAB_CODE_PAGE_ID,
    name: typeof catalog.get(DEFAULT_COLLAB_CODE_PAGE_ID)?.name === 'string' && catalog.get(DEFAULT_COLLAB_CODE_PAGE_ID).name.trim()
      ? catalog.get(DEFAULT_COLLAB_CODE_PAGE_ID).name.trim() : 'Страница 1',
    mainSolutionId: DEFAULT_COLLAB_SOLUTION_ID, createdAt: 0 };
  const others = [];
  for (const [id, row] of catalog.entries()) {
    if (id === main.id || deleted.get(id) === true || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)
      || typeof row?.name !== 'string' || !row.name.trim() || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.mainSolutionId || '')) continue;
    others.push({ id, name: row.name.trim(), mainSolutionId: row.mainSolutionId, createdAt: normalizeCreatedAt(row.createdAt) });
  }
  return [main, ...others.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id, 'en'))];
};

export const listCollabPageSolutions = (doc, pageId = DEFAULT_COLLAB_CODE_PAGE_ID) => (
  listCollabSolutions(doc).filter(solution => getCollabSolutionPageId(doc, solution.id) === pageId)
);

const requirePage = (doc, id) => {
  const page = listCollabCodePages(doc).find(item => item.id === id);
  if (!page) throw new Error('Страница кода не найдена.');
  return page;
};

export const createCollabCodePage = (doc, { name, id = globalThis.crypto.randomUUID(), createdAt = Date.now() } = {}) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Некорректный идентификатор страницы.');
  const title = normalizeName(name);
  const catalog = doc.getMap(COLLAB_CODE_PAGES_KEY);
  if (id === DEFAULT_COLLAB_CODE_PAGE_ID || catalog.has(id)) throw new Error('Такая страница уже существует.');
  if (listCollabCodePages(doc).length >= MAX_COLLAB_CODE_PAGES) throw new Error(`Можно создать не больше ${MAX_COLLAB_CODE_PAGES} страниц кода.`);
  const mainSolutionId = `page-${id}`;
  const channels = getCollabSolutionChannels(doc, mainSolutionId);
  if (doc.getMap(COLLAB_SOLUTIONS_MAP_KEY).has(mainSolutionId) || channels.codeText.length || channels.testFileText.length || channels.runMap.size) {
    throw new Error('Данные этой страницы уже существуют.');
  }
  const page = { id, name: title, mainSolutionId, createdAt: normalizeCreatedAt(createdAt) };
  doc.transact(() => {
    catalog.set(id, page);
    createEmptyCollabSolution(doc, { id: mainSolutionId, name: DEFAULT_SOLUTION_NAME, pageId: id, createdAt });
  }, 'collab-pages:create');
  return page;
};

export const renameCollabCodePage = (doc, id, name) => {
  const page = requirePage(doc, id);
  doc.getMap(COLLAB_CODE_PAGES_KEY).set(id, { ...page, name: normalizeName(name) });
};

export const deleteCollabCodePage = (doc, id) => {
  requirePage(doc, id);
  if (id === DEFAULT_COLLAB_CODE_PAGE_ID) throw new Error('Первую страницу с прежними кодами удалить нельзя.');
  doc.getMap(COLLAB_CODE_PAGES_DELETED_KEY).set(id, true);
};

export const restoreCollabCodePage = (doc, id) => {
  if (!doc.getMap(COLLAB_CODE_PAGES_KEY).has(id)) throw new Error('Страница кода не найдена.');
  if (listCollabCodePages(doc).length >= MAX_COLLAB_CODE_PAGES) throw new Error(`Можно создать не больше ${MAX_COLLAB_CODE_PAGES} страниц кода.`);
  doc.getMap(COLLAB_CODE_PAGES_DELETED_KEY).set(id, false);
};

export const resolveCollabPageSelection = (doc, saved = {}) => {
  const page = listCollabCodePages(doc).find(item => item.id === saved?.pageId) || listCollabCodePages(doc)[0];
  const solutions = listCollabPageSolutions(doc, page.id);
  const preferred = saved?.byPage?.[page.id] || saved?.solutionId;
  return { pageId: page.id, solutionId: solutions.some(item => item.id === preferred) ? preferred : page.mainSolutionId };
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
  const available = [main, ...others];
  const byId = new Map(available.map((solution) => [solution.id, solution]));
  const ordered = [];
  const seen = new Set();
  for (const rawId of doc.getArray(COLLAB_SOLUTIONS_ORDER_KEY).toArray()) {
    const id = typeof rawId === 'string' ? rawId : '';
    const solution = byId.get(id);
    if (!solution || seen.has(id)) continue;
    seen.add(id);
    ordered.push(solution);
  }
  for (const solution of available) {
    if (seen.has(solution.id)) continue;
    ordered.push(solution);
  }
  return ordered;
};

export const reorderCollabSolutions = (doc, orderedIds, pageId) => {
  if (pageId) requirePage(doc, pageId);
  const all = listCollabSolutions(doc);
  const current = pageId ? listCollabPageSolutions(doc, pageId) : all;
  const currentIds = current.map((solution) => solution.id);
  const requested = Array.isArray(orderedIds)
    ? orderedIds.map((id) => normalizeId(id))
    : [];
  if (
    requested.length !== currentIds.length
    || new Set(requested).size !== requested.length
    || requested.some((id) => !currentIds.includes(id))
  ) {
    throw new Error('Некорректный порядок вкладок.');
  }
  const order = doc.getArray(COLLAB_SOLUTIONS_ORDER_KEY);
  let index = 0;
  const next = pageId ? all.map(item => currentIds.includes(item.id) ? requested[index++] : item.id) : requested;
  doc.transact(() => {
    if (order.length) order.delete(0, order.length);
    if (next.length) order.insert(0, next);
  }, 'collab-solutions:reorder');
  return listCollabSolutions(doc);
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
  pageId,
} = {}) => {
  const solutionId = normalizeId(id);
  const solutionName = normalizeName(name);
  const sourceSolutionId = sourceId === null ? null : requireSolution(doc, sourceId);
  const targetPageId = pageId || (sourceSolutionId ? getCollabSolutionPageId(doc, sourceSolutionId) : DEFAULT_COLLAB_CODE_PAGE_ID);
  requirePage(doc, targetPageId);
  const solutions = doc.getMap(COLLAB_SOLUTIONS_MAP_KEY);
  if (solutionId === DEFAULT_COLLAB_SOLUTION_ID || solutions.has(solutionId)) {
    throw new Error('Решение с таким идентификатором уже существует.');
  }
  if (listCollabPageSolutions(doc, targetPageId).length >= MAX_COLLAB_SOLUTIONS) {
    throw new Error(`Можно сохранить не больше ${MAX_COLLAB_SOLUTIONS} решений на одной странице.`);
  }

  const source = sourceSolutionId === null ? null : getCollabSolutionChannels(doc, sourceSolutionId);
  const code = normalizeCollabCodeText(source?.codeText.toString());
  const testFile = source?.testFileText.toString() || '';
  // A copied run is a snapshot, not an instruction to continue a live worker.
  // Deep-copy JSON so arrays/objects in file selections cannot alias the source.
  const runState = source ? JSON.parse(JSON.stringify(source.runMap.toJSON())) : {
    input: '',
    stdinDraft: '',
    output: '',
    error: '',
    status: 'idle',
    customFiles: [],
    debugBreakpoints: [],
  };
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
    if (targetPageId !== DEFAULT_COLLAB_CODE_PAGE_ID) doc.getMap(COLLAB_SOLUTION_PAGES_KEY).set(solutionId, targetPageId);
  }, 'collab-solutions:create');
  return metadata;
};

// A new section starts independently of the currently selected code and run.
// Retain the explicit clone helper for older callers and saved-room workflows.
export const createEmptyCollabSolution = (doc, options = {}) => (
  createCollabSolution(doc, { ...options, sourceId: null })
);

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
  const page = doc.getMap(COLLAB_CODE_PAGES_KEY).get(getCollabSolutionPageId(doc, solutionId));
  if (solutionId === DEFAULT_COLLAB_SOLUTION_ID || solutionId === page?.mainSolutionId) throw new Error('Основную вкладку удалить нельзя.');
  doc.getMap(COLLAB_SOLUTIONS_DELETED_KEY).set(solutionId, true);
};

export const restoreCollabSolution = (doc, id) => {
  const solutionId = normalizeId(id);
  if (!doc.getMap(COLLAB_SOLUTIONS_MAP_KEY).has(solutionId)) throw new Error('Вариант не найден.');
  const pageId = getCollabSolutionPageId(doc, solutionId);
  requirePage(doc, pageId);
  if (listCollabPageSolutions(doc, pageId).length >= MAX_COLLAB_SOLUTIONS) {
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
