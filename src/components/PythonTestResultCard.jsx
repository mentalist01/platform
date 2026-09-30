import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './PythonTestResultCard.css';

const showInvisibleCharacters = (value) => value
  .replace(/ /g, '·')
  .replace(/\t/g, '⇥\t')
  .replace(/\r/g, '␍')
  .replace(/\n/g, '↵\n');

const PythonTestResultCard = ({ index, input, expectedOutput, result, isDarkTheme, onExpand }) => {
  const [showWhitespace, setShowWhitespace] = useState(false);
  const inputText = String(input ?? '');
  const expectedText = String(expectedOutput ?? '');
  const outputText = String(result?.output ?? '');
  const errorText = String(result?.error ?? '');
  const passed = result?.passed;
  const statusLabel = passed === undefined
    ? (result ? 'Выполнен' : 'Не проверено')
    : (passed ? 'Пройден' : 'Ошибка');
  const actualPreview = errorText ? `Ошибка: ${errorText}` : (result ? outputText || 'Пустой вывод' : '—');
  const primaryTextClass = isDarkTheme ? 'text-slate-50' : 'text-slate-900';
  const secondaryTextClass = isDarkTheme ? 'text-slate-300' : 'text-slate-600';
  const mutedTextClass = isDarkTheme ? 'text-slate-400' : 'text-slate-500';
  const statusTextClass = passed === undefined
    ? mutedTextClass
    : (passed
        ? (isDarkTheme ? 'text-emerald-200' : 'text-emerald-700')
        : (isDarkTheme ? 'text-red-200' : 'text-red-600'));

  const renderFullValue = (value, emptyLabel) => value.length > 0 ? (
    <pre className="python-runtime-test-full-value">{showWhitespace ? showInvisibleCharacters(value) : value}</pre>
  ) : (
    <p className={`python-runtime-test-empty-value ${mutedTextClass}`}>{emptyLabel}</p>
  );

  return (
    <details
      className="python-runtime-test-card rounded-[14px] border px-2.5 py-2 text-[11px] md:text-xs"
      style={{ '--python-test-i': `${index}` }}
      data-result={passed === undefined ? 'idle' : (passed ? 'passed' : 'failed')}
      onToggle={(event) => {
        if (event.currentTarget.open) onExpand?.();
      }}
    >
      <summary className="python-runtime-test-toggle" aria-label={`Тест ${index + 1}: ${statusLabel}. Подробности`}>
        <div className="python-runtime-test-card-header flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border text-[9px] font-bold ${secondaryTextClass}`}>
              {index + 1}
            </span>
            <span className={`truncate font-bold ${primaryTextClass}`}>{`Тест ${index + 1}`}</span>
            <span className={`python-runtime-test-toggle-label inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold ${mutedTextClass}`}>
              <span className="python-runtime-test-expand-label">Подробнее</span>
              <span className="python-runtime-test-collapse-label">Свернуть</span>
              <ChevronDown size={12} className="python-runtime-test-chevron" aria-hidden="true" />
            </span>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusTextClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className="python-runtime-test-details python-runtime-test-preview mt-2 grid grid-cols-3 gap-1.5">
          {[
            ['Вход', inputText || '—'],
            ['Ожидалось', expectedText || 'Пустой вывод'],
            ['Результат', actualPreview],
          ].map(([label, value]) => (
            <div className="python-runtime-test-value min-w-0 rounded-[9px] border px-2 py-1.5" key={label}>
              <span className={`block text-[8px] font-bold uppercase tracking-[0.14em] ${mutedTextClass}`}>{label}</span>
              <code className={`mt-0.5 block truncate text-[10px] ${secondaryTextClass}`} title={value}>{value}</code>
            </div>
          ))}
        </div>
      </summary>
      <div className={`python-runtime-test-expanded ${secondaryTextClass}`}>
        <label className="python-runtime-test-whitespace flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={showWhitespace} onChange={(event) => setShowWhitespace(event.target.checked)} />
          Показать пробелы и переносы строк
        </label>
        {showWhitespace && (
          <p className={`mt-1 text-[11px] ${mutedTextClass}`}>· — пробел, ⇥ — табуляция, ↵ — перенос строки, ␍ — возврат каретки.</p>
        )}
        <div className="python-runtime-test-full-field">
          <div className="python-runtime-test-full-label">Входные данные</div>
          {renderFullValue(inputText, 'Нет входных данных.')}
        </div>
        <div className="python-runtime-test-output-comparison">
          <div className="python-runtime-test-full-field">
            <div className="python-runtime-test-full-label">Ожидаемый вывод</div>
            {renderFullValue(expectedText, 'Пустой вывод.')}
          </div>
          <div className="python-runtime-test-full-field">
            <div className="python-runtime-test-full-label">Фактический вывод</div>
            {result ? renderFullValue(outputText, 'Программа ничего не вывела.') : (
              <p className={`python-runtime-test-empty-value ${mutedTextClass}`}>Тест ещё не запускался.</p>
            )}
          </div>
        </div>
        {errorText && (
          <div className="python-runtime-test-full-field python-runtime-test-error">
            <div className="python-runtime-test-full-label">Ошибка выполнения</div>
            <pre className="python-runtime-test-full-value">{errorText}</pre>
          </div>
        )}
        {passed === false && !errorText && (
          <p className="python-runtime-test-mismatch">
            {showWhitespace
              ? 'Вывод отличается от ожидаемого. Сравните значения и отмеченные пробелы и переносы строк.'
              : 'Вывод отличается от ожидаемого. Сравните значения выше; для проверки форматирования включите показ пробелов и переносов строк.'}
          </p>
        )}
      </div>
    </details>
  );
};

export default PythonTestResultCard;
