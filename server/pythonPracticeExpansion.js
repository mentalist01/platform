const TOPICS = new Set(['101', '102', '103', '104', '105', '106', '107', '108']);
const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е');
const aliases = new Map([
  ['условия и счетчики', ['отбор и счетчики']],
  ['поиск и проверки', ['делители и простые числа']],
  ['генераторы списков', ['генераторы', 'list comprehensions']],
]);

// Append only. Existing indexes, IDs, theory, homework links and teacher edits
// stay intact; sections are matched to their existing identifiers by title.
export function appendPythonPracticeExpansion(testsDb, payload) {
  return appendExpansion(testsDb,payload,{topics:TOPICS,version:'20261015',count:152,prefix:'py-expand-20261015'});
}

export function appendPythonGeneratorExpansion(testsDb, payload) {
  const card = testsDb?.__pythonTaskCatalog?.find(t=>Number(t.number)===112);
  if (normalize(card?.title)!=='генераторы') throw Error('Expected existing Generators card 112');
  return appendExpansion(testsDb,payload,{topics:new Set(['112']),version:'20261015-generators',count:24,prefix:'py-gen-expand-20261015'});
}

function appendExpansion(testsDb, payload, {topics,version,count,prefix}) {
  if (!testsDb || typeof testsDb !== 'object' || Array.isArray(testsDb)) throw Error('Invalid tests database');
  if (payload?.version !== version || !Array.isArray(payload.questions) || payload.questions.length !== count) {
    throw Error('Unexpected Python expansion payload');
  }
  const next = structuredClone(testsDb);
  const summary = {};
  const ids = new Set();
  for (const item of payload.questions) {
    const topic = String(item.topic);
    const question = item.question;
    if (!topics.has(topic) || !String(question?.id || '').startsWith(`${prefix}-${topic}-`)
      || ids.has(question.id) || !item.sectionTitle || !question.title || !question.question || !question.starterCode
      || !Array.isArray(question.tests) || !question.tests.length
      || question.tests.some(t => typeof t.input !== 'string' || typeof t.output !== 'string')
      || Object.keys(question).some(k => !['id', 'title', 'question', 'starterCode', 'tests'].includes(k))) {
      throw Error(`Invalid exercise payload: ${topic} ${question?.id}`);
    }
    ids.add(question.id);
    const entry = next[topic];
    if (!entry || !Array.isArray(entry.python) || !entry.python.length) throw Error(`Existing Python topic required: ${topic}`);
    if (!Array.isArray(entry.pythonSubsections)) entry.pythonSubsections = [];
    const wanted = normalize(item.sectionTitle);
    const acceptedTitles = new Set([wanted, ...(aliases.get(wanted) || [])]);
    let section = entry.pythonSubsections.find(s => acceptedTitles.has(normalize(s.title)));
    if (!section) {
      // Some old banks store a section only on their questions.
      const existingQuestion = entry.python.find(q => q.subsectionId && acceptedTitles.has(normalize(q.subsectionTitle)));
      const id = existingQuestion?.subsectionId || `python-expansion-${topic}-${wanted.replace(/[^a-z0-9а-я]+/g, '-')}`;
      if (entry.pythonSubsections.some(s => s.id === id)) throw Error(`Section identifier conflict: ${id}`);
      const maxOrder = Math.max(-1, ...entry.pythonSubsections.map(s => Number.isFinite(Number(s.order)) ? Number(s.order) : -1));
      section = { id, title: item.sectionTitle, order: maxOrder + 1 };
      entry.pythonSubsections.push(section);
    }
    const added = { ...structuredClone(question), subsectionId: section.id, subsectionTitle: section.title };
    const existing = entry.python.find(q => String(q.id) === question.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(added)) throw Error(`Existing exercise differs; no overwrite: ${question.id}`);
      continue;
    }
    entry.python.push(added);
    summary[topic] = (summary[topic] || 0) + 1;
  }
  for (const topic of topics) {
    if (!summary[topic]) continue;
    const before = testsDb[topic];
    const after = next[topic];
    if (JSON.stringify(after.python.slice(0,before.python.length)) !== JSON.stringify(before.python)) {
      throw Error(`Existing question order changed: ${topic}`);
    }
    const withoutBank = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['python', 'pythonSubsections'].includes(key)));
    if (JSON.stringify(withoutBank(before)) !== JSON.stringify(withoutBank(after))) throw Error(`Topic metadata changed: ${topic}`);
  }
  return { testsDb: next, added: Object.values(summary).reduce((a,b) => a+b,0), topics: summary };
}
