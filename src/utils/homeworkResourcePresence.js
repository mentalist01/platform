export function currentHomeworkResourceEntries(entries = [], now = Date.now()) {
  return entries.filter(entry => {
    const due = Date.parse(entry?.dueAt || '');
    return entry && entry.learningAssignmentStatus !== 'closed' && (!Number.isFinite(due) || due > now);
  });
}

export function hasHomeworkResources(entries = [], now = Date.now()) {
  return currentHomeworkResourceEntries(entries, now).some(entry =>
    entry.learningMaterials?.some(material => material.kind === 'video')
    || entry.goals?.some(goal => goal.pythonTheorySubsectionId && goal.pythonTheoryType));
}
