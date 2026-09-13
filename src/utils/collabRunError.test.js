import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCollabRunError } from './collabRunError.js';

test('empty stderr has no summary', () => {
  for (const input of ['', ' \t\r\n ', null, undefined]) {
    assert.equal(summarizeCollabRunError(input), null);
  }
});

test('long recursive traceback gives the exception and the closest user frame', () => {
  const frames = Array.from({ length: 500 }, (_, i) => `  File "<collab>", line ${i % 2 ? 9 : 3}, in f`);
  const error = [
    'Traceback (most recent call last):',
    '  File "/lib/python3.12/site-packages/_pyodide/_base.py", line 99, in eval_code',
    ...frames,
    '  [Previous line repeated 997 more times]',
    'RecursionError: maximum recursion depth exceeded',
  ].join('\n');
  assert.deepEqual(summarizeCollabRunError(error), {
    title: 'Слишком много рекурсивных вызовов',
    detail: 'maximum recursion depth exceeded',
    lineNumber: 9,
  });
});

test('syntax errors retain the user line while ignoring the echoed source and caret', () => {
  assert.deepEqual(summarizeCollabRunError([
    '  File "<exec>", line 4',
    '    if x = 3:',
    '       ^^^^^',
    'SyntaxError: invalid syntax. Maybe you meant == or := instead of =?',
  ].join('\n')), {
    title: 'Ошибка в записи кода',
    detail: 'invalid syntax. Maybe you meant == or := instead of =?',
    lineNumber: 4,
  });
});

test('Pyodide JavaScript frames following the Python error are not a new error or line', () => {
  assert.deepEqual(summarizeCollabRunError([
    'PythonError: Traceback (most recent call last):',
    '  File "<collab>", line 7, in <module>',
    "NameError: name 'answer' is not defined",
    '    at new_error (https://cdn.example/pyodide.asm.js:10:125)',
    '    at Object.Error (https://cdn.example/pyodide.asm.js:42:109)',
  ].join('\n')), {
    title: 'Неизвестное имя',
    detail: "name 'answer' is not defined",
    lineNumber: 7,
  });
});

test('single-line Python errors also support the Pyodide wrapper', () => {
  assert.deepEqual(summarizeCollabRunError('PythonError: ZeroDivisionError: division by zero'), {
    title: 'Деление на ноль',
    detail: 'division by zero',
    lineNumber: null,
  });
});

test('chained exceptions use the final exception and its own traceback', () => {
  assert.deepEqual(summarizeCollabRunError([
    'Traceback (most recent call last):',
    '  File "<collab>", line 5, in f',
    'ValueError: bad value',
    '',
    'During handling of the above exception, another exception occurred:',
    '',
    'Traceback (most recent call last):',
    '  File "main.py", line 12, in <module>',
    '  File "/lib/python3.12/internal.py", line 909, in handle',
    'TypeError: invalid operation',
  ].join('\n')), {
    title: 'Неподходящий тип данных',
    detail: 'invalid operation',
    lineNumber: 12,
  });
});

test('an internal-only final traceback never inherits a previous exception user line', () => {
  assert.equal(summarizeCollabRunError([
    'Traceback (most recent call last):',
    '  File "<collab>", line 5, in f',
    'ValueError: first error',
    'Traceback (most recent call last):',
    '  File "/lib/python3.12/internal.py", line 909, in handle',
    'RuntimeError: final error',
  ].join('\n')).lineNumber, null);
});

test('a reverse stack reports the most recent user frame without guessing exception type', () => {
  assert.deepEqual(summarizeCollabRunError([
    'Stack (most recent call first):',
    '  File "/lib/python3.12/faulthandler.py", line 200, in dump',
    '  File "<collab>", line 9, in f',
    '  File "<collab>", line 9, in f',
    '  File "<collab>", line 2, in <module>',
    'Превышено время выполнения (10 сек).',
  ].join('\n')), {
    title: 'Сообщение выполнения',
    detail: 'Превышено время выполнения (10 сек).',
    lineNumber: 9,
  });
});

test('a stack-only dump is not labeled a recursion error', () => {
  assert.deepEqual(summarizeCollabRunError([
    'Stack (most recent call first):',
    '  File "<collab>", line 9, in f',
    '  File "<collab>", line 3, in <module>',
  ].join('\n')), {
    title: 'Сообщение выполнения',
    detail: 'Подробности выполнения доступны ниже.',
    lineNumber: 9,
  });
});

test('plain Russian runtime messages are preserved', () => {
  for (const detail of [
    'Прервано пользователем (Ctrl+C).',
    'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.',
  ]) {
    assert.deepEqual(summarizeCollabRunError(detail), {
      title: 'Сообщение выполнения', detail, lineNumber: null,
    });
  }
});

test('traceback source containing an error name cannot replace the exception', () => {
  assert.deepEqual(summarizeCollabRunError([
    'Traceback (most recent call last):',
    '  File "<string>", line 8, in <module>',
    '    raise ValueError("TypeError: pretend")',
    'ValueError: TypeError: pretend',
    '    NameError: echoed annotation, not an exception',
  ].join('\n')), {
    title: 'Неподходящее значение',
    detail: 'TypeError: pretend',
    lineNumber: 8,
  });
});

test('a source code string alone is not classified as a Python exception', () => {
  const detail = 'print("RecursionError: maximum recursion depth exceeded")';
  assert.deepEqual(summarizeCollabRunError(detail), {
    title: 'Сообщение выполнения', detail, lineNumber: null,
  });
});

test('bare and namespaced exception types remain informative', () => {
  assert.deepEqual(summarizeCollabRunError('AssertionError'), {
    title: 'Условие проверки не выполнено', detail: 'AssertionError', lineNumber: null,
  });
  assert.deepEqual(summarizeCollabRunError('custom.LessonError: custom failure'), {
    title: 'Ошибка выполнения Python', detail: 'custom failure', lineNumber: null,
  });
});

test('CRLF and Unicode messages are preserved without exposing internal lines', () => {
  assert.deepEqual(summarizeCollabRunError([
    'Traceback (most recent call last):',
    '  File "/lib/python3.12/main.py", line 808, in f',
    'ValueError: Неверное значение 🐍',
    '',
  ].join('\r\n')), {
    title: 'Неподходящее значение', detail: 'Неверное значение 🐍', lineNumber: null,
  });
});
