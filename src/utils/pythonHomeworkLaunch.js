export function normalizePythonHomeworkNumbers(numbers, questionCount = Infinity) {
  return [...new Set((Array.isArray(numbers) ? numbers : []).map(Number)
    .filter(number => Number.isInteger(number) && number > 0 && number <= questionCount))].sort((a, b) => a - b);
}

export function firstUnsolvedPythonHomeworkIndex(questions, numbers, solvedIds = new Set()) {
  const assigned = normalizePythonHomeworkNumbers(numbers, questions.length);
  const pending = assigned.find(number => !solvedIds.has(String(questions[number - 1]?.id ?? '')));
  return (pending ?? assigned[0] ?? 0) - 1;
}
