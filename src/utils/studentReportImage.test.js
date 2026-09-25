import assert from 'node:assert/strict';
import test from 'node:test';
import { getStudentReportImageContent, wrapReportText } from './studentReportImage.js';
import { buildStudentMonthlyReport } from './studentMonthlyReport.js';

test('automatic report moves goals into their own block without losing lesson facts', () => {
  const report = buildStudentMonthlyReport({
    student: { id: 'qa', name: 'Олег' }, month: '2026-09', nowMs: Date.parse('2026-09-25T09:00:00Z'),
    lessonEntries: [{ dayKey: '2026-09-02', topic: { text: 'Задание №8' }, startMs: 1 }],
    homeworkEntries: [{ dueAt: '2026-09-20T09:00:00Z', percent: 86, withErrorsCount: 1 }],
  });
  const { body, goals } = getStudentReportImageContent({ report, text: report.studentText });
  assert.match(body, /86%/);
  assert.match(body, /№8/);
  assert.match(body, /Пробника в этом месяце пока не было/);
  assert.ok(goals.length > 0);
  const paragraphs = report.studentText.split('\n\n');
  assert.equal(body, paragraphs.slice(1, -1).join('\n\n'));
  assert.equal(goals.join(' '), paragraphs.at(-1));
});

test('teacher edits, greetings and last paragraph are always preserved verbatim', () => {
  const text = 'Олег, важное уточнение!\n\nРезультат 0 — тоже результат.\n\nВстретимся 2 октября.';
  assert.deepEqual(getStudentReportImageContent({ report: { studentText: 'Другой текст' }, text }), {
    body: text, goals: [],
  });
  assert.deepEqual(getStudentReportImageContent({ report: {}, text: 'Короткий отчёт' }), {
    body: 'Короткий отчёт', goals: [],
  });
});

test('wrapping cannot overflow even with a long pasted word or a hyphenated name', () => {
  const context = { measureText: text => ({ width: Array.from(text).length * 10 }) };
  const word = 'ОченьДлинноеСловоБезПробелов🐱';
  const lines = wrapReportText(context, `Иван\n\n${word}`, 70);
  assert.ok(lines.includes(''));
  assert.ok(lines.every(line => context.measureText(line).width <= 70));
  assert.equal(lines.slice(2).join(''), word);
});
