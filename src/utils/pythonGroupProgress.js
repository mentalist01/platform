// Only current members and current Python questions contribute. This is a
// read-only view of personal results; shared code alone never awards a solve.
export function buildPythonGroupProgress({ group, students = [], progressDb = {}, testsDb = {} } = {}) {
  const byId = new Map(students.filter(student => !student.deletedAt && student.teacherId === group?.teacherId).map(student => [student.id, student]));
  const ids = [...new Set((group?.members || []).filter(member => member.status === 'active' && byId.has(member.studentId)).map(member => member.studentId))];
  const members = ids.map(studentId => ({ studentId, name: byId.get(studentId).name || 'Ученик' }));
  const topics = {};
  for (const [number, entry] of Object.entries(testsDb)) {
    if (!/^\d+$/.test(number) || !Array.isArray(entry?.python)) continue;
    const questionIds = [...new Set(entry.python.map((question, index) => String(question?.id ?? index).trim()).filter(Boolean))];
    const solvedSets = new Map(ids.map(id => [id, new Set((Array.isArray(progressDb[id]?.solvedByTask?.[number]?.python?.solved)
      ? progressDb[id].solvedByTask[number].python.solved : []).map(value => String(value).trim()))]));
    const questions = Object.fromEntries(questionIds.map(id => {
      const solvedStudentIds = ids.filter(studentId => solvedSets.get(studentId).has(id));
      return [id, { solvedCount: solvedStudentIds.length, totalCount: ids.length, solvedStudentIds }];
    }));
    const coveredCount = Object.values(questions).filter(question => question.solvedCount > 0).length;
    const completedCount = Object.values(questions).filter(question => question.totalCount > 0 && question.solvedCount === question.totalCount).length;
    topics[number] = { totalQuestions: questionIds.length, coveredCount, completedCount,
      percent: questionIds.length ? Math.round(coveredCount / questionIds.length * 100) : 0, questions };
  }
  return { groupId: group?.id || '', memberCount: members.length, members, topics };
}

export function pythonGroupQuestionStatus(progress, taskNumber, questionId) {
  const question = progress?.topics?.[taskNumber]?.questions?.[String(questionId)];
  if (!question) return null;
  const solved = new Set(question.solvedStudentIds);
  const unsolvedNames = (progress.members || []).filter(member => !solved.has(member.studentId)).map(member => member.name);
  const state = question.totalCount > 0 && question.solvedCount === question.totalCount ? 'complete' : question.solvedCount > 0 ? 'partial' : 'new';
  return { ...question, state, unsolvedNames,
    label: `${question.solvedCount} из ${question.totalCount}`,
    detail: !question.totalCount ? 'В группе нет активных учеников' : state === 'complete' ? 'Решили все ученики' : question.solvedCount ? `Ещё не решили: ${unsolvedNames.join(', ')}` : 'Пока никто не решил' };
}
