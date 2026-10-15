const text = value => String(value ?? '').trim();
const monthOf = timestamp => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit' }).format(date).slice(0, 7);
};

export function monthlyHomeworkPractice(entries = [], month, nowMs, taskTitles = {}) {
  const groups = new Map();
  const seen = new Set();
  for (const entry of entries) for (const goal of entry.goals || []) {
    const taskNumber = Number(goal.taskNumber);
    if (goal.type !== 'task' || !Number.isInteger(taskNumber) || taskNumber < 1) continue;
    for (const item of goal.items || []) {
      // A lifetime completion without a date cannot be assigned to this month.
      if (item.completedAt == null || !['clean', 'completed', 'with-errors'].includes(item.state)) continue;
      const timestamp = typeof item.completedAt === 'number' ? item.completedAt : Date.parse(item.completedAt);
      if (!Number.isFinite(timestamp) || timestamp > nowMs || monthOf(timestamp) !== month) continue;
      const key = `${taskNumber}|${goal.levelId}|${item.questionId || item.id}`;
      if ((!item.questionId && !item.id) || seen.has(key)) continue;
      seen.add(key);
      const group = groups.get(taskNumber) || { taskNumber, title: text(taskTitles[taskNumber]), solvedCount: 0 };
      group.solvedCount++; groups.set(taskNumber, group);
    }
  }
  return [...groups.values()].sort((a, b) => a.taskNumber - b.taskNumber);
}

export function homeworkPracticeText(groups = [], { studentName = 'Ученик', solved = 'решил', studentAudience = false } = {}) {
  if (!groups.length) return '';
  const taskWord = count => count % 100 >= 11 && count % 100 <= 14 ? 'задач' : count % 10 === 1 ? 'задачу' : count % 10 >= 2 && count % 10 <= 4 ? 'задачи' : 'задач';
  const join = values => values.length > 1 ? `${values.slice(0, -1).join(', ')} и ${values.at(-1)}` : values[0];
  const who = studentAudience ? 'ты' : studentName;
  const ege = groups.filter(group => group.taskNumber < 100), python = groups.filter(group => group.taskNumber >= 100);
  const lines = [];
  if (ege.length) lines.push(`Между уроками ${who} ${solved} ${join(ege.map(group => `${group.solvedCount} ${taskWord(group.solvedCount)} по заданию ЕГЭ №${group.taskNumber}${group.title ? ` («${group.title}»)` : ''}`))}.`);
  if (python.length) lines.push(`По Python ${who} ${solved} ${join(python.map(group => `${group.solvedCount} ${taskWord(group.solvedCount)}${group.title ? ` по теме «${group.title}»` : ''}`))}.`);
  if (groups.reduce((sum, group) => sum + group.solvedCount, 0) >= 20) lines.push('Это хороший объём самостоятельной практики.');
  return lines.join(' ');
}

export function lessonTopicWithNumbers(topic, taskTitles = {}) {
  const label = typeof topic === 'string' ? text(topic) : text(topic?.title || topic?.name || topic?.text || topic?.label);
  const numbers = [...new Set((Array.isArray(topic?.taskNumbers) ? topic.taskNumbers : []).map(Number).filter(number => Number.isInteger(number) && number > 0))];
  if (numbers.length) return numbers.map(number => number >= 100 ? `Python${taskTitles[number] ? `: ${taskTitles[number]}` : ''}` : `Задание №${number}${taskTitles[number] ? ` (${taskTitles[number]})` : ''}`).join('; ');
  // Only an exact catalog title is enough to attach a number to a named topic.
  const matches = Object.entries(taskTitles).filter(([, title]) => text(title).toLocaleLowerCase('ru-RU') === label.toLocaleLowerCase('ru-RU'));
  if (label && matches.length === 1) {
    const number = Number(matches[0][0]);
    return number >= 100 ? `Python: ${label}` : `Задание №${number} (${label})`;
  }
  return label;
}
