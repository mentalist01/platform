// Gift learners use a separate local namespace. No platform account, API or XP.
export const pythonGiftProgressKey = id => `python-gift:v1:${id}:progress`;
export const pythonGiftDraftKey = (id, task, question) => `python-gift:v1:${id}:draft:${task}:${encodeURIComponent(question)}`;
const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export function createPythonGiftSession(course, storage) {
  const tasks = new Map(course.tasks.map(task => [String(task.number), task]));
  const key = pythonGiftProgressKey(course.id);
  const read = () => {
    try { const value = JSON.parse(storage?.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch { return {}; }
  };
  const write = (name, value) => {
    try { if (!storage) throw Error(); storage.setItem(name, JSON.stringify(value)); }
    catch { throw Error('Браузер не смог сохранить прогресс. Скопируйте код перед закрытием и разрешите сохранение данных для этого сайта.'); }
  };
  const question = (task, id) => {
    const result = tasks.get(String(task))?.entry.python.find(item => String(item.id) === String(id));
    if (!result) throw Error('Задача не найдена в этом курсе.');
    return result;
  };
  const solved = task => {
    const value = read()[task]?.ids;
    const ids = Array.isArray(value) ? value : [];
    return (tasks.get(String(task))?.entry.python || []).map(item => String(item.id)).filter(id => ids.includes(id));
  };
  const getDraft = (task, id) => {
    const item = question(task, id);
    let draft;
    try { draft = JSON.parse(storage?.getItem(pythonGiftDraftKey(course.id, task, id)) || 'null'); } catch { /* Use the starter if a draft is damaged. */ }
    return { code: typeof draft?.code === 'string' ? draft.code : item.starterCode || '', input: typeof draft?.input === 'string' ? draft.input : '', starterCode: item.starterCode || '', updatedAt: draft?.updatedAt || '' };
  };
  const session = {
    getProgressSnapshot() {
      return Object.fromEntries(course.tasks.map(task => [task.id, task.questionCount ? Math.round(100 * solved(task.number).length / task.questionCount) : 0]));
    },
    getSolvedIds: solved,
    async getQuestionDifficulties() { return {}; },
    async getAnswerHistory() { return {}; },
    async getSolvedQuestions(_student, task) {
      const ids = solved(task);
      return { ids, codeById: Object.fromEntries(ids.map(id => [id, getDraft(task, id).code])) };
    },
    async getQuestionCode(_student, task, _level, id) { return getDraft(task, id); },
    async saveQuestionCode(_student, task, _level, id, draft) {
      question(task, id);
      const result = { code: String(draft.code ?? ''), input: String(draft.input ?? ''), updatedAt: new Date().toISOString() };
      write(pythonGiftDraftKey(course.id, task, id), result);
      return result;
    },
    async solveQuestion(payload) {
      const { taskNumber: task, questionId: id, pythonResults: results, code } = payload;
      const item = question(task, id);
      const tests = item.tests || [];
      const passed = tests.length > 0 && Array.isArray(results) && tests.length === results.length && tests.every((test, index) => (
        !String(results[index].error || '').trim()
        && normalize(results[index].input) === normalize(test.input)
        && (test.output === undefined || normalize(results[index].output) === normalize(test.output))
      ));
      if (!passed) return {};
      await session.saveQuestionCode('', task, 'python', id, { code, input: getDraft(task, id).input });
      const value = read();
      value[task] = { ids: [...new Set([...solved(task), String(id)])] };
      write(key, value);
      return { taskProgress: Math.round(100 * solved(task).length / tasks.get(String(task)).questionCount) };
    },
  };
  return session;
}
