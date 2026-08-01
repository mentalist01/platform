export const HOMEWORK_ASSIGNMENT_TIER_REQUIRED = 'required';
export const HOMEWORK_ASSIGNMENT_TIER_OPTIONAL = 'optional';

export const normalizeHomeworkAssignmentTier = (value) => (
  String(value || '').trim().toLowerCase() === HOMEWORK_ASSIGNMENT_TIER_OPTIONAL
    ? HOMEWORK_ASSIGNMENT_TIER_OPTIONAL
    : HOMEWORK_ASSIGNMENT_TIER_REQUIRED
);

export const getHomeworkGoalAssignmentTier = (goal) => (
  normalizeHomeworkAssignmentTier(goal?.assignmentTier)
);

export const isOptionalHomeworkGoal = (goal) => (
  getHomeworkGoalAssignmentTier(goal) === HOMEWORK_ASSIGNMENT_TIER_OPTIONAL
);
