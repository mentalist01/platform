import { useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Code2, Lock, LockOpen, RotateCcw } from 'lucide-react';
import { LOCK_CODE_LIMIT, lockDigits, lockExample, lockWord, normalizeLockParams, parseCombinationLock, turnLockWheel, visitLockIndex } from '../../utils/combinationLock.js';
import './CombinationLockCard.css';

export default function CombinationLockCard({ state, onChange, disabled = false }) {
  const model = parseCombinationLock(state.code), digits = lockDigits(model, state.index), visited = new Set(state.visited);
  const [draft, setDraft] = useState(state.code), [error, setError] = useState('');
  const [previousCode, setPreviousCode] = useState(state.code);
  const [filter, setFilter] = useState('all');
  const editor = useRef(null), hintId = useId(), complete = visited.size === model.total;
  if (previousCode !== state.code) { setPreviousCode(state.code); setDraft(state.code); setError(''); }
  const apply = (code = draft) => {
    if (disabled) return;
    try {
      const next = normalizeLockParams({ code });
      setError(''); setDraft(next.code); setFilter('all');
      if (next.code !== state.code) onChange({ code: next.code, index: 0, visited: [0] });
    } catch (failure) { setError(failure.message); }
  };
  const turn = (index, delta) => { if (!disabled) onChange(turnLockWheel(state, index, delta)); };
  const jump = index => { if (!disabled) onChange(visitLockIndex(state, index)); };
  const codeKey = event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); apply(); }
    if (event.key !== 'Tab' || event.shiftKey) return;
    event.preventDefault();
    const { selectionStart: from, selectionEnd: to } = event.currentTarget;
    setDraft(draft.slice(0, from) + '    ' + draft.slice(to));
    requestAnimationFrame(() => editor.current?.setSelectionRange(from + 4, from + 4));
  };
  const variants = Array.from({ length: model.total }, (_, index) => index).filter(index => filter === 'all' || (filter === 'seen' ? visited.has(index) : !visited.has(index)));
  return <section className={`combination-lock${complete ? ' is-complete' : ''}`} aria-label="Кодовый замок: вложенные циклы for">
    <header className="combination-lock__heading"><span className="combination-lock__emblem">{complete ? <LockOpen size={25} /> : <Lock size={25} />}</span><div><small>МИССИЯ · ЕГЭ №8</small><h3>Кодовый замок</h3></div><span className="combination-lock__formula">{model.wheels.map(wheel => wheel.symbols.length).join(' × ')}<b>= {model.total}</b></span></header>
    <div className="combination-lock__code">
      <div className="combination-lock__code-top"><strong><Code2 size={15} />Ваши циклы</strong><div aria-label="Примеры вложенности">{[1, 2, 3].map(count => <button key={count} type="button" disabled={disabled} onClick={() => apply(lockExample(count))} aria-label={`Пример: ${count} ${count === 1 ? 'цикл' : 'вложенных цикла'}`}>{count} for</button>)}</div></div>
      <textarea ref={editor} aria-label="Python-код для замка" aria-describedby={hintId} aria-invalid={Boolean(error)} value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} onKeyDown={codeKey} spellCheck={false} autoComplete="off" maxLength={LOCK_CODE_LIMIT} disabled={disabled} />
      <div className="combination-lock__build"><small id={hintId}>{error ? <span role="alert">{error}</span> : draft !== state.code ? 'Код изменён. Перестройте замок.' : 'Один вложенный for — одно колёсико.'}</small><button type="button" disabled={disabled} onClick={() => apply()}>Построить замок<ArrowRight size={14} /></button></div>
    </div>
    <div className="combination-lock__stage">
      <div className="combination-lock__hardware">
        <div className="combination-lock__shackle" aria-hidden="true" />
        <div className="combination-lock__body"><i className="combination-lock__screw is-left" aria-hidden="true" /><i className="combination-lock__screw is-right" aria-hidden="true" />
          {model.wheels.map((wheel, index) => <div className="combination-lock__wheel" key={`${index}:${wheel.name}`}>
            <span className="combination-lock__wheel-name" title={wheel.name}>{wheel.name}</span>
            <button type="button" className="combination-lock__turn" disabled={disabled} aria-label={`Предыдущий символ: ${wheel.name}`} onClick={() => turn(index, -1)}><ChevronUp size={19} /></button>
            <div className="combination-lock__reel" role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label={`Колёсико ${index + 1}: ${wheel.name}`} aria-valuemin={1} aria-valuemax={wheel.symbols.length} aria-valuenow={digits[index] + 1} aria-valuetext={wheel.symbols[digits[index]]} aria-disabled={disabled} onKeyDown={event => {
              if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); turn(index, event.key === 'ArrowDown' ? 1 : -1); }
            }}>
              <span className="combination-lock__peek" aria-hidden="true">{wheel.symbols[(digits[index] + wheel.symbols.length - 1) % wheel.symbols.length]}</span>
              <b className="combination-lock__letter" key={wheel.symbols[digits[index]]}>{wheel.symbols[digits[index]]}</b>
              <span className="combination-lock__peek" aria-hidden="true">{wheel.symbols[(digits[index] + 1) % wheel.symbols.length]}</span>
            </div>
            <button type="button" className="combination-lock__turn" disabled={disabled} aria-label={`Следующий символ: ${wheel.name}`} onClick={() => turn(index, 1)}><ChevronDown size={19} /></button>
          </div>)}
        </div>
      </div>
      <span className="combination-lock__current" aria-live="polite">Сейчас <strong>{lockWord(model, state.index)}</strong><small>вариант {state.index + 1} из {model.total}</small></span>
    </div>
    <div className="combination-lock__progress"><div><strong>{complete ? 'Все комбинации перебраны!' : `Перебрали ${visited.size} из ${model.total}`}</strong><span>Осталось {model.total - visited.size}</span></div><div className="combination-lock__track" role="progressbar" aria-label="Перебранные комбинации" aria-valuenow={visited.size} aria-valuemin={0} aria-valuemax={model.total}><span style={{ width: `${visited.size / model.total * 100}%` }} /></div></div>
    <div className="combination-lock__variants-heading"><strong>Возможные пароли</strong><div aria-label="Какие варианты показать">{[['all', 'Все'], ['seen', 'Перебрали'], ['remaining', 'Остались']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <div className="combination-lock__variants" role="group" aria-label="Все комбинации замка" style={{gridTemplateColumns:`repeat(${model.total<=4?model.total:model.total<=16?4:6},minmax(0,1fr))`}}>
      {variants.map(index => <button type="button" key={index} className={`${visited.has(index) ? 'is-visited' : ''}${index === state.index ? ' is-current' : ''}`} aria-label={`${lockWord(model, index)}: ${index === state.index ? 'текущий вариант' : visited.has(index) ? 'уже перебрали' : 'ещё не перебрали'}`} aria-pressed={index === state.index} disabled={disabled} onClick={() => jump(index)}>{visited.has(index) && <Check size={11} />}<span>{lockWord(model, index)}</span></button>)}
      {!variants.length && <p>Неперебранных вариантов не осталось.</p>}
    </div>
    <footer className="combination-lock__actions"><button type="button" disabled={disabled} onClick={() => { setFilter('all'); onChange({ index: 0, visited: [0] }); }}><RotateCcw size={15} />Сначала</button><button type="button" className="combination-lock__next" disabled={disabled || state.index === model.total - 1} onClick={() => jump(state.index + 1)}>Следующий вариант<ArrowRight size={16} /></button></footer>
  </section>;
}

export function CombinationLockSettings({ params, onChange, disabled }) {
  const [draft, setDraft] = useState(params.code), [error, setError] = useState('');
  const [previousCode, setPreviousCode] = useState(params.code);
  if (previousCode !== params.code) { setPreviousCode(params.code); setDraft(params.code); setError(''); }
  return <div className="combination-lock-settings"><label>Начальный Python-код<textarea aria-label="Начальные циклы кодового замка" value={draft} disabled={disabled} spellCheck={false} maxLength={LOCK_CODE_LIMIT} onChange={event => setDraft(event.target.value)} /></label>
    <button type="button" disabled={disabled} onClick={() => { try { onChange(normalizeLockParams({ code: draft })); setError(''); } catch (failure) { setError(failure.message); } }}>Сохранить начальные циклы</button>{error && <small role="alert">{error}</small>}
  </div>;
}
