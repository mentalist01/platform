import {
  buildPythonSubsectionModel,
  PYTHON_DEFAULT_SUBSECTION_ID,
} from './pythonSubsections.js';

export const PYTHON_HOMEWORK_THEORY_TYPES = ['recording', 'text', 'gdoc'];

const normalizeText = (value) => String(value ?? '').trim();

export const normalizePythonHomeworkTheoryType = (value) => {
  const type = normalizeText(value).toLowerCase();
  return PYTHON_HOMEWORK_THEORY_TYPES.includes(type) ? type : '';
};

export const getPythonHomeworkTheoryTypeLabel = (type) => {
  if (type === 'recording') return 'Видео-теория';
  if (type === 'gdoc') return 'Теория в Google Docs';
  return 'Текстовая теория';
};

const hasTheoryContent = (value, type) => {
  if (type === 'recording') {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
  return Boolean(normalizeText(value));
};

const normalizeTheoryItem = (value, fallbackType = '') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = normalizePythonHomeworkTheoryType(value.type || fallbackType || 'text');
  if (!type || !hasTheoryContent(value.content, type)) return null;
  return { type, content: value.content };
};

const normalizeTheoryVariants = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const single = normalizeTheoryItem(value);
  if (single) return { [single.type]: single };
  const source = value.variants && typeof value.variants === 'object' && !Array.isArray(value.variants)
    ? value.variants
    : value;
  return Object.entries(source).reduce((result, [rawType, rawValue]) => {
    const type = normalizePythonHomeworkTheoryType(rawType);
    if (!type) return result;
    const item = normalizeTheoryItem(
      rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue
        : { type, content: rawValue },
      type,
    );
    if (item) result[type] = item;
    return result;
  }, {});
};

const getTheoryBySubsection = (taskEntry) => {
  const source = taskEntry?.pythonTheoryBySubsection;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  return Object.entries(source).reduce((result, [rawId, value]) => {
    const subsectionId = normalizeText(rawId) || PYTHON_DEFAULT_SUBSECTION_ID;
    const variants = normalizeTheoryVariants(value);
    if (Object.keys(variants).length > 0) result[subsectionId] = variants;
    return result;
  }, {});
};

export const getPythonHomeworkTheoryChoices = (taskEntry, levelId = 'python') => {
  if (!taskEntry || typeof taskEntry !== 'object' || Array.isArray(taskEntry)) return [];
  const subsectionModel = buildPythonSubsectionModel(taskEntry, levelId, { includeEmptySections: true });
  const titleById = new Map(
    subsectionModel.subsections.map((subsection) => [subsection.id, subsection.title]),
  );
  const variantsBySubsection = getTheoryBySubsection(taskEntry);
  const legacyVariants = normalizeTheoryVariants(taskEntry.pythonTheory);
  if (Object.keys(legacyVariants).length > 0 && !variantsBySubsection[PYTHON_DEFAULT_SUBSECTION_ID]) {
    variantsBySubsection[PYTHON_DEFAULT_SUBSECTION_ID] = legacyVariants;
  }
  return Object.entries(variantsBySubsection).flatMap(([subsectionId, variants]) => {
    const subsectionTitle = titleById.get(subsectionId)
      || (subsectionId === PYTHON_DEFAULT_SUBSECTION_ID ? 'Вся тема' : 'Подраздел');
    return PYTHON_HOMEWORK_THEORY_TYPES
      .filter((type) => Boolean(variants?.[type]))
      .map((type) => ({
        key: `${encodeURIComponent(subsectionId)}::${type}`,
        subsectionId,
        subsectionTitle,
        type,
        typeLabel: getPythonHomeworkTheoryTypeLabel(type),
      }));
  });
};

export const getPythonHomeworkTheorySelection = (goal) => {
  const subsectionId = normalizeText(goal?.pythonTheorySubsectionId);
  const type = normalizePythonHomeworkTheoryType(goal?.pythonTheoryType);
  return subsectionId && type ? { subsectionId, type } : null;
};

export const getPythonHomeworkTheoryDetails = (taskEntry, goal, levelId = 'python') => {
  const selection = getPythonHomeworkTheorySelection(goal);
  if (!selection) return null;
  const matchingChoice = getPythonHomeworkTheoryChoices(taskEntry, levelId)
    .find((choice) => choice.subsectionId === selection.subsectionId && choice.type === selection.type);
  if (matchingChoice) return { ...matchingChoice, available: true };
  const subsectionModel = buildPythonSubsectionModel(taskEntry, levelId, { includeEmptySections: true });
  const subsection = subsectionModel.subsections.find((item) => item.id === selection.subsectionId);
  return {
    key: `${encodeURIComponent(selection.subsectionId)}::${selection.type}`,
    ...selection,
    subsectionTitle: subsection?.title
      || (selection.subsectionId === PYTHON_DEFAULT_SUBSECTION_ID ? 'Вся тема' : 'Подраздел'),
    typeLabel: getPythonHomeworkTheoryTypeLabel(selection.type),
    available: false,
  };
};
