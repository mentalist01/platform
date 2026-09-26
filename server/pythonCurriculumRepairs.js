import { PYTHON_CURRICULUM_TEST_REPAIRS } from './pythonCurriculumTestData.js';

export function repairPythonCurriculumTests(testsDb) {
  let changed = false;
  for (const repair of PYTHON_CURRICULUM_TEST_REPAIRS) {
    const q = testsDb?.[repair.topic]?.python?.find(item => String(item.id) === repair.id);
    if (!q || q.title !== repair.title || !Array.isArray(q.tests)) continue;
    repair.tests.forEach((fixed, index) => {
      const actual = q.tests[index];
      if (!actual || actual.input !== fixed.previousInput || actual.output !== fixed.previousOutput) return;
      actual.input = fixed.input;
      actual.output = fixed.output;
      changed = true;
    });
    if (repair.id === 'py105-filter-by-length' && typeof q.question === 'string') {
      const wrongExample = '4\nдом\nмашина\nкод\nцикл\nВывод:\n2';
      const question = q.question.replace(wrongExample, '4\nдом\nмашина\nкод\nцикл\nВывод:\n1');
      if (question !== q.question) { q.question = question; changed = true; }
    }
  }
  return changed;
}
