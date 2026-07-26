export const COLLAB_TASK_FILE_CATEGORY_CLASS = 'class';
export const COLLAB_TASK_FILE_CATEGORY_HOME = 'home';
export const COLLAB_TASK_FILE_CATEGORY_TESTING = 'testing';

const COLLAB_TASK_FILE_CATEGORIES = new Set([
  COLLAB_TASK_FILE_CATEGORY_CLASS,
  COLLAB_TASK_FILE_CATEGORY_HOME,
  COLLAB_TASK_FILE_CATEGORY_TESTING,
]);

const TEST_LEVEL_LABELS = {
  basic: 'Обязательный',
  advanced: 'Продвинутый',
  expert: 'Чтоб наверняка',
  python: 'Python',
};

export const normalizeCollabTaskFileCategory = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return COLLAB_TASK_FILE_CATEGORIES.has(normalized)
    ? normalized
    : COLLAB_TASK_FILE_CATEGORY_CLASS;
};

const getTestingFileUrl = (file) => {
  const directUrl = String(file?.url || '').trim();
  if (directUrl) return directUrl;
  const storageName = String(file?.storageName || '').trim();
  return storageName ? `/uploads/${storageName}` : '';
};

const getTestingFileIdentity = (file, fallback) => (
  String(file?.id || file?.storageName || file?.url || file?.name || fallback).trim() || fallback
);

export const buildTestingRuntimeFiles = (testsDb) => {
  if (!testsDb || typeof testsDb !== 'object' || Array.isArray(testsDb)) return [];
  const result = [];

  Object.entries(testsDb).forEach(([taskKey, taskLevels]) => {
    const taskNumber = Number(taskKey);
    if (!Number.isFinite(taskNumber) || !taskLevels || typeof taskLevels !== 'object' || Array.isArray(taskLevels)) {
      return;
    }

    Object.entries(taskLevels).forEach(([levelId, questions]) => {
      if (!Array.isArray(questions)) return;
      const normalizedLevelId = String(levelId || '').trim().toLowerCase();
      const levelLabel = TEST_LEVEL_LABELS[normalizedLevelId] || String(levelId || 'Уровень').trim() || 'Уровень';

      questions.forEach((question, questionIndex) => {
        const files = Array.isArray(question?.files) ? question.files : [];
        const questionNumber = questionIndex + 1;
        const questionId = String(question?.id ?? questionIndex).trim() || String(questionIndex);
        const questionLabel = `Задача ${questionNumber}`;
        const folderPath = `${levelLabel}/${questionLabel}`;

        files.forEach((file, fileIndex) => {
          const name = String(file?.name || '').trim();
          const url = getTestingFileUrl(file);
          if (!name || !url) return;
          const fallbackIdentity = `${fileIndex}:${name}`;
          const fileIdentity = getTestingFileIdentity(file, fallbackIdentity);

          result.push({
            ...file,
            id: `testing:${taskNumber}:${normalizedLevelId}:${questionId}:${fileIdentity}`,
            name,
            originalName: name,
            url,
            taskNumber,
            category: COLLAB_TASK_FILE_CATEGORY_TESTING,
            sourceKind: COLLAB_TASK_FILE_CATEGORY_TESTING,
            levelId: normalizedLevelId,
            levelLabel,
            questionId,
            questionNumber,
            questionLabel,
            folderName: questionLabel,
            folderPath,
          });
        });
      });
    });
  });

  return result;
};
