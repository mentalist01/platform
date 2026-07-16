export const MOCK_EXAM_MODE_CLASSIC = 'classic';
export const MOCK_EXAM_MODE_TIMER = 'timer';

export const isMockExamMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === MOCK_EXAM_MODE_CLASSIC || normalized === MOCK_EXAM_MODE_TIMER;
};

export const normalizeMockExamMode = (value, fallback = MOCK_EXAM_MODE_CLASSIC) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === MOCK_EXAM_MODE_TIMER) return MOCK_EXAM_MODE_TIMER;
  if (normalized === MOCK_EXAM_MODE_CLASSIC) return MOCK_EXAM_MODE_CLASSIC;
  return fallback;
};

export const normalizeAssignedMockExamMode = (value) => (
  normalizeMockExamMode(value, MOCK_EXAM_MODE_TIMER)
);

export const getMockExamRequiredMode = (exam) => (
  normalizeAssignedMockExamMode(exam?.requiredMode ?? exam?.access?.mode)
);

export const resolveMockExamAttemptMode = ({
  assignedMode,
  requestedMode,
  storedMode,
  locked = false,
} = {}) => {
  const requiredMode = normalizeAssignedMockExamMode(assignedMode);
  const previousMode = normalizeMockExamMode(storedMode, MOCK_EXAM_MODE_CLASSIC);
  const hasRequestedMode = requestedMode !== null
    && requestedMode !== undefined
    && String(requestedMode).trim() !== '';
  const requestedModeIsValid = !hasRequestedMode || isMockExamMode(requestedMode);
  const normalizedRequestedMode = hasRequestedMode
    ? normalizeMockExamMode(requestedMode, requiredMode)
    : null;
  const mode = locked ? previousMode : requiredMode;
  const requestAllowed = requestedModeIsValid
    && (!hasRequestedMode || normalizedRequestedMode === mode);

  return {
    mode,
    requiredMode,
    requestAllowed,
    requestedModeIsValid,
  };
};
