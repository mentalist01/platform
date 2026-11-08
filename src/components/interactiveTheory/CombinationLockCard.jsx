import { useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Code2, EyeOff, Lock, LockOpen, RotateCcw } from 'lucide-react';
import { LOCK_CODE_LIMIT, lockDigits, lockExample, lockWord, normalizeLockParams, parseCombinationLock, turnLockWheel, visitLockIndex } from '../../utils/combinationLock.js';
import './CombinationLockCard.css';

function LockWheel({ wheel, digit, direction, disabled, onTurn }) {
  const alphabet = wheel.symbols.join('');
  const [roll, setRoll] = useState({ alphabet, digit, from: digit, direction: 0, id: 0 });
  if (roll.digit !== digit || roll.alphabet !== alphabet) {
    setRoll({ alphabet, digit, from: roll.alphabet === alphabet ? roll.digit : digit, direction, id: roll.id + 1 });
  }
  const moving = roll.direction !== 0 && roll.from !== digit;
  const symbol = offset => wheel.symbols[(offset + wheel.symbols.length * 3) % wheel.symbols.length];
  const letters = [-2, -1, 0, 1, 2].map(offset => {
    // The outgoing and incoming symbols share one moving strip, including wraparound.
    if (moving && offset * roll.direction > 0) return symbol(digit + offset - roll.direction);
    return symbol((moving ? roll.from : digit) + offset);
  });
  return <div className="combination-lock__wheel">
    <span className="combination-lock__wheel-name" title={wheel.name}>{wheel.name}</span>
    <button type="button" className="combination-lock__turn" disabled={disabled} aria-label={`Прокрутить вверх: ${wheel.name}`} onClick={() => onTurn(1)}><ChevronUp size={19} /></button>
    <div className="combination-lock__reel" role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label={`Колёсико ${wheel.name}`} aria-valuemin={1} aria-valuemax={wheel.symbols.length} aria-valuenow={digit + 1} aria-valuetext={wheel.symbols[digit]} aria-disabled={disabled} onKeyDown={event => {
      if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); onTurn(event.key === 'ArrowUp' ? 1 : -1); }
    }}>
      <div className="combination-lock__reel-window" aria-hidden="true"><div key={roll.id} className={`combination-lock__reel-strip${moving ? ` is-rolling-${roll.direction > 0 ? 'up' : 'down'}` : ''}`} onAnimationEnd={() => setRoll(current => current.id === roll.id ? { ...current, direction: 0 } : current)}>
        {letters.map((letter, index) => <b key={index} className="combination-lock__letter">{letter}</b>)}
      </div></div>
      <b className="combination-lock__reduced-letter" aria-hidden="true">{wheel.symbols[digit]}</b>
    </div>
    <button type="button" className="combination-lock__turn" disabled={disabled} aria-label={`Прокрутить вниз: ${wheel.name}`} onClick={() => onTurn(-1)}><ChevronDown size={19} /></button>
  </div>;
}

export default function CombinationLockCard({ state, onChange, disabled = false, canManage = false }) {
  const model = parseCombinationLock(state.code), digits = lockDigits(model, state.index), visited = new Set(state.visited);
  const [draft, setDraft] = useState(state.code), [error, setError] = useState('');
  const [previousCode, setPreviousCode] = useState(state.code);
  const editor = useRef(null), hintId = useId(), codeId = useId(), complete = visited.size === model.total;
  if (previousCode !== state.code) { setPreviousCode(state.code); setDraft(state.code); setError(''); }
  const apply = (code = draft) => {
    if (disabled) return;
    try {
      const next = normalizeLockParams({ code });
      setError(''); setDraft(next.code);
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
  const variants = Array.from({ length: model.total }, (_, index) => index);
  return <section className={`combination-lock${complete ? ' is-complete' : ''}${state.codeVisible ? ' is-code-visible' : ''}`} aria-label="Кодовый замок: вложенные циклы for">
    <header className="combination-lock__heading"><span className="combination-lock__emblem">{complete ? <LockOpen size={25} /> : <Lock size={25} />}</span><div><small>МИССИЯ · ЕГЭ №8</small><h3>Кодовый замок</h3></div><span className="combination-lock__formula">{model.wheels.map(wheel => wheel.symbols.length).join(' × ')}<b>= {model.total}</b></span></header>
    <div className="combination-lock__code-control">{canManage && <button type="button" disabled={disabled} aria-expanded={Boolean(state.codeVisible)} aria-controls={codeId} onClick={() => onChange({ codeVisible: !state.codeVisible })}>{state.codeVisible ? <EyeOff size={14} /> : <Code2 size={14} />}{state.codeVisible ? 'Скрыть циклы' : 'Показать циклы'}</button>}</div>
    {state.codeVisible && <div id={codeId} className="combination-lock__code">
      <div className="combination-lock__code-top"><strong><Code2 size={15} />Ваши циклы</strong><div aria-label="Примеры вложенности">{[1, 2, 3].map(count => <button key={count} type="button" disabled={disabled} onClick={() => apply(lockExample(count))} aria-label={`Пример: ${count} ${count === 1 ? 'цикл' : 'вложенных цикла'}`}>{count} for</button>)}</div></div>
      <textarea ref={editor} aria-label="Python-код для замка" aria-describedby={hintId} aria-invalid={Boolean(error)} value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} onKeyDown={codeKey} spellCheck={false} autoComplete="off" maxLength={LOCK_CODE_LIMIT} disabled={disabled} />
      <div className="combination-lock__build"><small id={hintId}>{error ? <span role="alert">{error}</span> : draft !== state.code ? 'Код изменён. Перестройте замок.' : 'Один вложенный for — одно колёсико.'}</small><button type="button" disabled={disabled} onClick={() => apply()}>Построить замок<ArrowRight size={14} /></button></div>
    </div>}
    <div className="combination-lock__stage">
      <div className="combination-lock__hardware">
        <div className="combination-lock__shackle" aria-hidden="true" />
        <div className="combination-lock__body"><i className="combination-lock__screw is-left" aria-hidden="true" /><i className="combination-lock__screw is-right" aria-hidden="true" />
          {model.wheels.map((wheel, index) => <LockWheel key={`${index}:${wheel.name}`} wheel={wheel} digit={digits[index]} direction={state.direction || 1} disabled={disabled} onTurn={delta => turn(index, delta)} />)}
        </div>
      </div>
      <span className="combination-lock__current" aria-live="polite">Сейчас <strong>{lockWord(model, state.index)}</strong><small>вариант {state.index + 1} из {model.total}</small></span>
    </div>
    <div className="combination-lock__progress"><div><strong>{complete ? 'Все комбинации перебраны!' : `Перебрали ${visited.size} из ${model.total}`}</strong><span>Осталось {model.total - visited.size}</span></div><div className="combination-lock__track" role="progressbar" aria-label="Перебранные комбинации" aria-valuenow={visited.size} aria-valuemin={0} aria-valuemax={model.total}><span style={{ width: `${visited.size / model.total * 100}%` }} /></div></div>
    <div className="combination-lock__variants-heading"><strong>Возможные пароли</strong></div>
    <div className="combination-lock__variants" role="group" aria-label="Все комбинации замка" style={{gridTemplateColumns:`repeat(${model.total<=4?model.total:model.total<=16?4:6},minmax(0,1fr))`}}>
      {variants.map(index => <button type="button" key={index} className={`${visited.has(index) ? 'is-visited' : ''}${index === state.index ? ' is-current' : ''}`} aria-label={`${lockWord(model, index)}: ${index === state.index ? 'текущий вариант' : visited.has(index) ? 'уже перебрали' : 'ещё не перебрали'}`} aria-pressed={index === state.index} disabled={disabled} onClick={() => jump(index)}>{visited.has(index) && <Check size={11} />}<span>{lockWord(model, index)}</span></button>)}
    </div>
    <footer className="combination-lock__actions"><button type="button" disabled={disabled} onClick={() => onChange({ index: 0, visited: [0], direction: -1 })}><RotateCcw size={15} />Сначала</button><button type="button" className="combination-lock__next" disabled={disabled || state.index === model.total - 1} onClick={() => jump(state.index + 1)}>Следующий вариант<ArrowRight size={16} /></button></footer>
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
