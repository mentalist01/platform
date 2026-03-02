export const PYTHON_DEFAULT_SUBSECTION_ID = '__default__';

const normalizeKey = (value) => String(value ?? '').trim();

const slugify = (value) => (
  normalizeKey(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
);

const createLegacySubsectionId = (title, index = 0) => {
  const slug = slugify(title);
  return `legacy:${slug || index + 1}`;
};

export const createPythonSubsectionId = (title, existingIds = []) => {
  const usedIds = new Set(
    (Array.isArray(existingIds) ? existingIds : [])
      .map((value) => normalizeKey(value))
      .filter(Boolean)
  );
  const slug = slugify(title) || `section-${Date.now()}`;
  let suffix = 1;
  let candidate = `sub-${slug}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `sub-${slug}-${suffix}`;
  }
  return candidate;
};

export const getPythonTaskEntry = (testDb, taskNumber) => {
  const taskKey = normalizeKey(taskNumber);
  if (!taskKey) return null;
  const entry = testDb?.[taskKey] ?? testDb?.[Number(taskNumber)];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  return entry;
};

export const getPythonTaskQuestions = (taskEntry, levelId) => {
  if (!taskEntry || typeof taskEntry !== 'object') return [];
  const list = taskEntry?.[String(levelId)];
  return Array.isArray(list) ? list : [];
};

const getNormalizedStoredSubsections = (taskEntry) => {
  const rawList = Array.isArray(taskEntry?.pythonSubsections) ? taskEntry.pythonSubsections : [];
  return rawList
    .map((item, index) => {
      const id = normalizeKey(item?.id);
      const title = normalizeKey(item?.title);
      if (!id || !title) return null;
      return {
        id,
        title,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      };
    })
    .filter(Boolean);
};

const createSectionItems = (questionItems, questionIndexes) => (
  questionIndexes.map((questionIndex, localIndex) => ({
    key: `${questionIndex}-${localIndex}`,
    questionIndex,
    localIndex,
    localNumber: localIndex + 1,
    globalNumber: questionIndex + 1,
    question: questionItems[questionIndex],
  }))
);

export const buildPythonSubsectionModel = (taskEntry, levelId, options = {}) => {
  const includeEmptySections = options?.includeEmptySections === true;
  const questions = getPythonTaskQuestions(taskEntry, levelId);
  const storedSections = getNormalizedStoredSubsections(taskEntry);
  const sectionsById = new Map();

  storedSections.forEach((section) => {
    sectionsById.set(section.id, {
      ...section,
      questionIndexes: [],
    });
  });

  const questionItems = questions.map((question, index) => {
    const explicitId = normalizeKey(question?.subsectionId);
    const explicitTitle = normalizeKey(question?.subsectionTitle);
    const derivedId = explicitId || (explicitTitle ? createLegacySubsectionId(explicitTitle, index) : PYTHON_DEFAULT_SUBSECTION_ID);
    if (derivedId !== PYTHON_DEFAULT_SUBSECTION_ID && !sectionsById.has(derivedId)) {
      sectionsById.set(derivedId, {
        id: derivedId,
        title: explicitTitle || 'Подраздел',
        order: storedSections.length + sectionsById.size,
        questionIndexes: [],
      });
    }
    if (derivedId !== PYTHON_DEFAULT_SUBSECTION_ID) {
      sectionsById.get(derivedId)?.questionIndexes.push(index);
    }
    return {
      ...question,
      _questionIndex: index,
      subsectionId: derivedId,
      subsectionTitle: derivedId === PYTHON_DEFAULT_SUBSECTION_ID
        ? ''
        : (sectionsById.get(derivedId)?.title || explicitTitle || ''),
    };
  });

  const visibleSections = Array.from(sectionsById.values())
    .map((section) => {
      const items = createSectionItems(questionItems, section.questionIndexes);
      return {
        id: section.id,
        title: normalizeKey(section.title) || 'Подраздел',
        order: section.order,
        items,
        count: items.length,
        questionIndexes: items.map((item) => item.questionIndex),
        isDefault: false,
      };
    })
    .filter((section) => includeEmptySections || section.count > 0)
    .sort((left, right) => {
      const orderDiff = left.order - right.order;
      if (orderDiff !== 0) return orderDiff;
      return left.title.localeCompare(right.title, 'ru');
    });

  const defaultQuestionIndexes = questionItems
    .filter((question) => question.subsectionId === PYTHON_DEFAULT_SUBSECTION_ID)
    .map((question) => question._questionIndex);
  const defaultItems = createSectionItems(questionItems, defaultQuestionIndexes);
  const defaultTitle = normalizeKey(options?.defaultSectionTitle)
    || (visibleSections.length > 0 ? 'Без подраздела' : 'Все задачи');

  if (includeEmptySections || defaultItems.length > 0 || visibleSections.length === 0) {
    visibleSections.push({
      id: PYTHON_DEFAULT_SUBSECTION_ID,
      title: defaultTitle,
      order: Number.MAX_SAFE_INTEGER,
      items: defaultItems,
      count: defaultItems.length,
      questionIndexes: defaultItems.map((item) => item.questionIndex),
      isDefault: true,
    });
  }

  const questionSectionByIndex = new Map();
  questionItems.forEach((question) => {
    questionSectionByIndex.set(question._questionIndex, question.subsectionId || PYTHON_DEFAULT_SUBSECTION_ID);
  });

  return {
    questions: questionItems,
    subsections: visibleSections,
    hasCustomSubsections: visibleSections.some((section) => !section.isDefault),
    questionSectionByIndex,
  };
};
