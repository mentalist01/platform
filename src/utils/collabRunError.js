const EXCEPTION_TITLES = {
  RecursionError: 'Слишком много рекурсивных вызовов',
  SyntaxError: 'Ошибка в записи кода',
  IndentationError: 'Ошибка отступов',
  TabError: 'Смешаны пробелы и табуляция',
  NameError: 'Неизвестное имя',
  UnboundLocalError: 'Переменная ещё не получила значение',
  ZeroDivisionError: 'Деление на ноль',
  TypeError: 'Неподходящий тип данных',
  ValueError: 'Неподходящее значение',
  IndexError: 'Индекс за пределами последовательности',
  KeyError: 'Ключ не найден в словаре',
  AttributeError: 'Свойство или метод не найден',
  FileNotFoundError: 'Файл не найден',
  ModuleNotFoundError: 'Модуль не найден',
  ImportError: 'Не удалось подключить модуль',
  EOFError: 'Не хватает входных данных',
  MemoryError: 'Недостаточно памяти',
  OverflowError: 'Слишком большое число',
  AssertionError: 'Условие проверки не выполнено',
  KeyboardInterrupt: 'Выполнение остановлено',
};

// Traceback source lines have indentation. Only an unindented exception line
// can finish a traceback, so a displayed `raise ValueError(...)` is not a result.
const EXCEPTION_LINE = /^((?:[A-Za-z_]\w*\.)*(?:[A-Za-z_]\w*(?:Error|Exception)|Exception|BaseException|ExceptionGroup|BaseExceptionGroup|KeyboardInterrupt|SystemExit|StopIteration|StopAsyncIteration|GeneratorExit))(?::[ \t]*(.*)|[ \t]*)$/;
const USER_FRAME = /^\s*File ["'](?:<collab>|<exec>|<string>|main\.py)["'], line ([1-9]\d*)\b/;
const TRACE_HEADER = /^(?:PythonError: )?(Traceback \(most recent call last\)|Stack \(most recent call first\))/;

/** Present stderr without changing, discarding, or rewriting the raw output. */
export function summarizeCollabRunError(error) {
  const text = String(error ?? '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return null;

  let mostRecentFirst = false;
  let lineNumber = null;
  let exception = null;
  const lines = text.split('\n');

  for (const rawLine of lines) {
    const header = rawLine.match(TRACE_HEADER);
    if (header) {
      mostRecentFirst = header[1].startsWith('Stack');
      lineNumber = null;
      continue;
    }

    const frame = rawLine.match(USER_FRAME);
    if (frame && (!mostRecentFirst || lineNumber === null)) {
      const candidate = Number(frame[1]);
      if (Number.isSafeInteger(candidate)) lineNumber = candidate;
    }

    // Pyodide sometimes prefixes a one-line Python exception with its own type.
    const line = rawLine.replace(/^PythonError: (?=[A-Za-z_])/, '');
    const match = line.match(EXCEPTION_LINE);
    if (match) {
      const type = match[1].split('.').at(-1);
      exception = {
        title: EXCEPTION_TITLES[type] || 'Ошибка выполнения Python',
        detail: match[2]?.trim() || match[1],
        lineNumber,
      };
    }
  }

  if (exception) return exception;

  // A watchdog dump can contain frames without any exception. Do not guess
  // RecursionError from repeated frames, or offer an internal Python line.
  const message = lines.find((line) => (
    line.trim()
    && !/^\s/.test(line)
    && !TRACE_HEADER.test(line)
    && !/^\[Previous line repeated /.test(line)
  ));
  return {
    title: 'Сообщение выполнения',
    detail: message?.trim() || 'Подробности выполнения доступны ниже.',
    lineNumber,
  };
}
