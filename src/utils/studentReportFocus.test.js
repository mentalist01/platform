import test from 'node:test';
import assert from 'node:assert/strict';
import { composeParentReportFocus, inferStudentReportFocus, studentReportFocusText, updateUntouchedReportDrafts } from './studentReportFocus.js';
import { buildStudentMonthlyReport } from './studentMonthlyReport.js';

const titles = { 4: 'Кодирование', 7: 'Изображения и звук', 103: 'Условия', 105: 'Цикл for' };
const topic = numbers => ({ topic: { taskNumbers: numbers, text: 'Сохранённая тема' } });

test('focus comes from sufficiently covered lesson topics and never from homework quantity', () => {
  assert.equal(inferStudentReportFocus([topic([103]), topic([105]), topic([7])], titles).inferred, 'mixed');
  const python = inferStudentReportFocus([topic([103]), topic([105]), topic([105]), topic([7])], titles);
  assert.equal(python.inferred, 'python');
  assert.deepEqual(python.pythonTopics, ['Условия', 'Цикл for']);
  assert.equal(inferStudentReportFocus([topic([7]), topic([4])], titles).inferred, 'ege');
  assert.equal(inferStudentReportFocus([topic([103])], titles).inferred, '');
  assert.equal(inferStudentReportFocus([topic([103]), topic([105]), {}, {}, {}], titles).inferred, '');
  assert.equal(inferStudentReportFocus([{ topic: 'Python: условия' }, { topic: 'Задание №7' }], titles).inferred, 'mixed');
  assert.equal(inferStudentReportFocus([{ subject: 'Python' }, { subject: 'Python' }], titles).inferred, '');
});

test('no new mock, first mock, unchanged and lower score receive distinct factual explanations', () => {
  const context = inferStudentReportFocus([topic([103]), topic([105])], titles);
  assert.match(studentReportFocusText(context), /Нового результата пробника.*пока нет/);
  assert.doesNotMatch(studentReportFocusText(context), /не показал прибавки|снизился/);
  const first = studentReportFocusText({ ...context, mockCount: 1, mockDelta: null });
  assert.match(first, /первый результат пробника/);
  const unchanged = studentReportFocusText({ ...context, mockCount: 1, mockDelta: 0 });
  assert.match(unchanged, /не показал прибавки/);
  assert.match(unchanged, /По одному общему баллу причину результата понять нельзя/);
  const lower = studentReportFocusText({ ...context, mockCount: 1, mockDelta: -5 });
  assert.match(lower, /результат снизился/);
  assert.doesNotMatch(lower, /из-за Python|потому что|обязательно выраст|освоил/);
  assert.doesNotMatch(studentReportFocusText({ ...context, mockCount: 1, mockDelta: 5 }), /не показал прибавки|снизился|первый результат/);
});

test('manual focus and a teacher plan can change the automatic message without changing facts', () => {
  const report = { texts: { parentBase: 'Здравствуйте!\n\nЕГЭ №7: 20 задач.\n\nПродолжаем подготовку.' }, focusContext: inferStudentReportFocus([topic([7]), topic([4])], titles, { count: 1, deltaFromPrevious: 0 }) };
  const changed = composeParentReportFocus(report, { focus: 'python', nextStep: 'применить циклы в задании №17' });
  assert.match(changed, /основной акцент.*Python/);
  assert.match(changed, /Дальше планируем: применить циклы в задании №17\./);
  assert.match(changed, /ЕГЭ №7: 20 задач/);
  assert.doesNotMatch(changed, /Продолжаем подготовку/);
  assert.doesNotMatch(composeParentReportFocus(report), /Дальше планируем:/);
  assert.match(composeParentReportFocus(report, { focus: 'mixed' }), /работали и с Python, и с заданиями ЕГЭ/);
  assert.match(composeParentReportFocus(report, { focus: 'ege' }), /основной акцент.*ЕГЭ/);
});

test('teacher edits survive contact or focus changes until the teacher explicitly restores auto text', () => {
  assert.deepEqual(updateUntouchedReportDrafts({ parent: 'Моя правка', student: 'student auto' }, { parent: 'old auto', student: 'student auto' }, { parent: 'new auto', student: 'student updated' }), { parent: 'Моя правка', student: 'student updated' });
  assert.deepEqual(updateUntouchedReportDrafts({ parent: 'old auto', student: 'student auto' }, { parent: 'old auto', student: 'student auto' }, { parent: 'new auto', student: 'student auto' }), { parent: 'new auto', student: 'student auto' });
});

test('generated reports include lesson focus but no inferred dominance from many Python solutions', () => {
  const report = buildStudentMonthlyReport({ student: { name: 'Егор' }, month: '2026-10', nowMs: Date.parse('2026-10-15T12:00:00Z'), taskTitles: titles,
    lessonEntries: [topic([7]), topic([4])].map((lesson, i) => ({ ...lesson, dayKey: `2026-10-0${i + 1}` })),
    homeworkEntries: [{ dueAt: '2026-10-03T12:00:00Z', percent: 100, goals: [{ type: 'task', taskNumber: 105, levelId: 'python', items: Array.from({ length: 50 }, (_, i) => ({ questionId: `python-${i}`, state: 'clean', completedAt: '2026-10-02T12:00:00Z' })) }] }],
  });
  assert.equal(report.focusContext.inferred, 'ege');
  assert.match(report.parentText, /чаще разбирали задания ЕГЭ/);
  assert.match(report.parentText, /50 задач/);
  assert.doesNotMatch(report.parentText, /основной акцент.*Python|чаще занимались Python/);
  assert.equal(report.parentText, composeParentReportFocus(report));
  assert.doesNotMatch(report.texts.parentBase, /Нового результата пробника/);
  assert.doesNotMatch(report.parentText, /Пробника в этом месяце пока не было/);
});

test('parent focus prose speaks as the teacher and never describes how the report was assembled', () => {
  for (const inferred of ['python', 'ege', 'mixed', '']) {
    for (const focus of ['auto', 'python', 'ege', 'mixed']) {
      for (const [mockCount, mockDelta] of [[0, null], [1, null], [1, 0], [1, -5], [1, 5]]) {
        const text = studentReportFocusText({ inferred, pythonTopics: ['Условия'], mockCount, mockDelta }, { focus });
        assert.doesNotMatch(text, /сохран[её]н|по данным|на платформе|источник данных|автоматически/iu);
        assert.doesNotMatch(text, /обязательно выраст|из-за Python|освоил/iu);
      }
    }
  }
});
