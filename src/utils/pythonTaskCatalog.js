export const PYTHON_TASK_SECTION_META = {
  topics: {
    title: 'Темы Python',
    description: 'Базовые темы курса и последовательное изучение синтаксиса.',
  },
  'exam-prep': {
    title: 'Подготовка к заданиям',
    description: 'Отдельные карточки для точечной тренировки задач ЕГЭ на Python.',
  },
};

export const PYTHON_TASKS_CATALOG_KEY = '__pythonTaskCatalog';
export const PYTHON_TASK_SECTION_IDS = ['topics', 'exam-prep'];

export const normalizePythonTaskSectionId = (value) => {
  const sectionId = String(value || 'topics').trim();
  return sectionId === 'exam-prep' ? 'exam-prep' : 'topics';
};

const PYTHON_DISPLAY_NUMBER_COLLATOR = new Intl.Collator('ru', {
  numeric: true,
  sensitivity: 'base',
});

export const comparePythonTaskDisplayNumber = (left, right) => {
  const leftDisplay = String(left?.displayNumber || left?.number || '').trim();
  const rightDisplay = String(right?.displayNumber || right?.number || '').trim();
  if (!leftDisplay && !rightDisplay) return 0;
  if (!leftDisplay) return 1;
  if (!rightDisplay) return -1;
  const byDisplay = PYTHON_DISPLAY_NUMBER_COLLATOR.compare(leftDisplay, rightDisplay);
  if (byDisplay !== 0) return byDisplay;
  return Number(left?.number || 0) - Number(right?.number || 0);
};

export const normalizePythonTaskCatalog = (value, fallback = []) => {
  const source = Array.isArray(value) ? value : (Array.isArray(fallback) ? fallback : []);
  const usedNumbers = new Set();
  const normalized = [];
  source.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const numberRaw = Number(item.number ?? item.id);
    if (!Number.isFinite(numberRaw)) return;
    const number = Math.max(100, Math.floor(numberRaw));
    if (usedNumbers.has(number)) return;
    const title = String(item.title || '').trim();
    if (!title) return;
    const sectionId = normalizePythonTaskSectionId(item.sectionId);
    const displayNumber = String(item.displayNumber || '').trim() || String(number);
    const showInPath = sectionId === 'topics' ? item.showInPath !== false : false;
    const task = {
      id: number,
      number,
      title,
      displayNumber,
      sectionId,
    };
    if (!showInPath) task.showInPath = false;
    normalized.push(task);
    usedNumbers.add(number);
  });
  normalized.sort((left, right) => {
    const leftSectionOrder = PYTHON_TASK_SECTION_IDS.indexOf(left.sectionId);
    const rightSectionOrder = PYTHON_TASK_SECTION_IDS.indexOf(right.sectionId);
    const leftSafeOrder = leftSectionOrder === -1 ? Number.MAX_SAFE_INTEGER : leftSectionOrder;
    const rightSafeOrder = rightSectionOrder === -1 ? Number.MAX_SAFE_INTEGER : rightSectionOrder;
    if (leftSafeOrder !== rightSafeOrder) return leftSafeOrder - rightSafeOrder;
    return comparePythonTaskDisplayNumber(left, right);
  });
  return normalized;
};

export const pythonTaskCatalogsEqual = (left, right) => {
  try {
    return JSON.stringify(left || []) === JSON.stringify(right || []);
  } catch {
    return false;
  }
};
