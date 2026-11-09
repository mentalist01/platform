import { useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Code2, EyeOff, GripVertical, Lock, LockOpen, RotateCcw, Shuffle } from 'lucide-react';
import { LOCK_CODE_LIMIT, combinationLockModel, lockCommands, lockDigits, lockMatches, lockProgram, lockWord, normalizeLockParams, parseCombinationLock, turnLockWheel, visitLockIndex } from '../../utils/combinationLock.js';
import './CombinationLockCard.css';

function LockWheel({ wheel, digit, direction, disabled, onTurn, position, showNames, active }) {
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
  return <div className={`combination-lock__wheel${active ? ' is-active-loop' : ''}`}>
    <span className="combination-lock__wheel-name" title={wheel.name}>{showNames ? wheel.name : `${position + 1}-я буква`}</span>
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

function RussianCommands({ state, model, changed, onChange, disabled, canManage, onTranslate }) {
  const order = state.commandOrder, correct = order.every((id, index) => id === lockCommands(model.wheels.length, state.mission)[index]);
  const text = id => id.startsWith('for:') ? `Для каждой ${['первой', 'второй', 'третьей'][Number(id.slice(4))]} буквы из ${model.wheels[Number(id.slice(4))].symbols.join('')}:` : id === 'if' ? `Если число букв ${model.filter?.symbol || (model.wheels.some(w => w.symbols.includes('А')) ? 'А' : 'A')} равно ${model.filter?.count ?? 1}:` : 'Показать пароль';
  const move = (id, target) => {
    if (disabled || !order.includes(id)) return;
    const next = order.filter(value => value !== id); next.splice(target, 0, id); onChange({ commandOrder: next });
  };
  return <>
    <ol className="combination-lock__commands" aria-label="Команды программы на русском">{order.map((id, index) => <li key={`${id}:${state.index}`} className={id.startsWith('for:') && changed.includes(Number(id.slice(4))) ? 'is-active-loop' : ''} draggable={!disabled} onDragStart={event => event.dataTransfer.setData('application/x-ivan-lock-command', id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); move(event.dataTransfer.getData('application/x-ivan-lock-command'), index); }} style={{ paddingLeft: 8 + index * 12 }}>
      <GripVertical size={12} aria-hidden="true"/><span>{text(id)}</span><div><button type="button" disabled={disabled || index === 0} aria-label={`Поднять команду ${index + 1}`} onClick={() => move(id, index - 1)}><ChevronUp size={12}/></button><button type="button" disabled={disabled || index === order.length - 1} aria-label={`Опустить команду ${index + 1}`} onClick={() => move(id, index + 1)}><ChevronDown size={12}/></button></div>
    </li>)}</ol>
    <div className="combination-lock__build">{canManage ? <button type="button" disabled={disabled} onClick={() => onChange({ commandOrder: [...order].reverse() })}><Shuffle size={12}/>Перемешать</button> : <small>{correct ? 'Команды готовы' : 'Переставьте команды'}</small>}<button type="button" disabled={disabled || !correct} onClick={onTranslate}>Перевести на Python<ArrowRight size={14}/></button></div>
  </>;
}

export default function CombinationLockCard({ state, onChange, disabled = false, canManage = false }) {
  const model = combinationLockModel(state), digits = lockDigits(model, state.index), visited = new Set(state.visited);
  const changed = lockDigits(model, state.previousIndex).flatMap((digit, index) => digit === digits[index] ? [] : [index]);
  const condition = model.filter || (state.mission === 'single-a' ? { symbol: model.wheels.some(w => w.symbols.includes('А')) ? 'А' : 'A', count: 1 } : null);
  const found = state.visited.filter(index => lockMatches(model, index, state.mission)).length;
  const [draft, setDraft] = useState(state.code), [error, setError] = useState('');
  const [previousCode, setPreviousCode] = useState(state.code);
  const [editorScroll, setEditorScroll] = useState(0);
  const editor = useRef(null), hintId = useId(), codeId = useId(), complete = visited.size === model.total;
  if (previousCode !== state.code) { setPreviousCode(state.code); setDraft(state.code); setError(''); }
  const apply = (code = draft) => {
    if (disabled) return;
    try {
      const next = normalizeLockParams({ code, wheelCount: model.wheels.length });
      setError(''); setDraft(next.code);
      if (next.code !== state.code) onChange({ ...next, index: 0, previousIndex: 0, visited: [], mission: code && parseCombinationLock(code).filter ? 'single-a' : 'enumerate', commandOrder: [] });
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
    <header className="combination-lock__heading"><span className="combination-lock__emblem">{complete ? <LockOpen size={25} /> : <Lock size={25} />}</span><div><small>{condition ? 'МИССИЯ 2 · СЕКРЕТНАЯ ПОДСКАЗКА' : 'МИССИЯ · ЕГЭ №8'}</small><h3>Кодовый замок</h3></div>{state.formulaVisible ? <span className="combination-lock__formula">{model.wheels.map(wheel => wheel.symbols.length).join(' × ')}<b>= {model.total}</b></span> : canManage && <button className="combination-lock__reveal-count" type="button" disabled={disabled} onClick={() => onChange({ formulaVisible: true })}>Сколько паролей?</button>}</header>
    <div className="combination-lock__code-control">{canManage && <><div className="combination-lock__positions" role="group" aria-label="Число позиций замка">{[1, 2, 3].map(count => <button key={count} type="button" aria-pressed={model.wheels.length === count} disabled={disabled} onClick={() => { setDraft(''); setError(''); onChange({ code: '', wheelCount: count, index: 0, previousIndex: 0, visited: [], mission: 'enumerate', commandOrder: [] }); }}>{count} {count === 1 ? 'буква' : 'буквы'}</button>)}</div><button type="button" disabled={disabled} aria-expanded={Boolean(state.codeVisible)} aria-controls={codeId} onClick={() => onChange({ codeVisible: !state.codeVisible })}>{state.codeVisible ? <EyeOff size={14} /> : <Code2 size={14} />}{state.codeVisible ? 'Скрыть циклы' : 'Показать циклы'}</button></>}</div>
    {state.codeVisible && <div id={codeId} className="combination-lock__code">
      <div className="combination-lock__code-top"><strong><Code2 size={15} />Программа</strong><div role="group" aria-label="Язык программы"><button type="button" aria-pressed={state.codeMode === 'commands'} disabled={disabled} onClick={() => onChange({ codeMode: 'commands' })}>Команды</button><button type="button" aria-pressed={state.codeMode === 'python'} disabled={disabled} onClick={() => onChange({ codeMode: 'python' })}>Python</button></div></div>
      {state.codeMode === 'commands' ? <RussianCommands state={state} model={model} changed={changed} onChange={onChange} disabled={disabled} canManage={canManage} onTranslate={() => onChange({ code: lockProgram(state), codeMode: 'python' })}/> : <>
      <div className="combination-lock__editor"><div className="combination-lock__line-activity" style={{ transform: `translateY(${-editorScroll}px)` }} aria-hidden="true">{draft.split('\n').map((line, index, lines) => <span key={`${index}:${state.index}`} className={draft === state.code && /^\s*for\s/.test(line) && changed.includes(lines.slice(0, index).filter(value => /^\s*for\s/.test(value)).length) ? 'is-active-loop' : ''}/>)}</div><textarea ref={editor} aria-label="Python-код для замка" aria-describedby={hintId} aria-invalid={Boolean(error)} value={draft} onScroll={event => setEditorScroll(event.currentTarget.scrollTop)} onChange={event => { setDraft(event.target.value); setError(''); }} onKeyDown={codeKey} spellCheck={false} autoComplete="off" maxLength={LOCK_CODE_LIMIT} disabled={disabled} /></div>
      <div className="combination-lock__build"><small id={hintId}>{error ? <span role="alert">{error}</span> : draft !== state.code ? 'Код изменён. Перестройте замок.' : 'Один вложенный for — одно колёсико.'}</small><button type="button" disabled={disabled} onClick={() => apply()}>Построить замок<ArrowRight size={14} /></button></div>
      </>}
    </div>}
    <div className="combination-lock__stage">
      <div className="combination-lock__hardware">
        <div className="combination-lock__shackle" aria-hidden="true" />
        <div className="combination-lock__body"><i className="combination-lock__screw is-left" aria-hidden="true" /><i className="combination-lock__screw is-right" aria-hidden="true" />
          {model.wheels.map((wheel, index) => <LockWheel key={`${index}:${wheel.name}`} wheel={wheel} digit={digits[index]} direction={state.direction || 1} disabled={disabled} position={index} showNames={state.codeVisible && state.codeMode === 'python'} active={state.codeVisible && changed.includes(index)} onTurn={delta => turn(index, delta)} />)}
        </div>
      </div>
      <span className="combination-lock__current" aria-live="polite">Сейчас <strong>{lockWord(model, state.index)}</strong>{condition && <small className="combination-lock__clue">Число букв {condition.symbol}: {condition.count}</small>}{visited.has(state.index) && condition && <small>{lockMatches(model, state.index, state.mission) ? 'Подходит!' : 'Не подходит'}</small>}</span>
    </div>
    <div className="combination-lock__progress"><div><strong>{complete ? condition ? `Перебрали всё · подходит ${found}` : 'Все комбинации перебраны!' : `Перебрали ${visited.size}${state.formulaVisible ? ` из ${model.total}` : ''}`}</strong>{state.formulaVisible && <span>Осталось {model.total - visited.size}</span>}</div><div className="combination-lock__track" role="progressbar" aria-label="Перебранные комбинации" aria-valuenow={visited.size} aria-valuemin={0} aria-valuemax={model.total}><span style={{ width: `${visited.size / model.total * 100}%` }} /></div></div>
    <div className="combination-lock__variants-heading"><strong>{condition ? `Подходящие пароли: ${found}` : 'Найденные комбинации'}</strong>{canManage && complete && !condition && model.wheels.length > 1 && <button type="button" className="combination-lock__mission" onClick={() => onChange({ mission: 'single-a', code: '', wheelCount: model.wheels.length, index: 0, previousIndex: 0, visited: [], commandOrder: [] })}>Миссия 2<ArrowRight size={12}/></button>}{canManage && condition && <button type="button" onClick={() => onChange({ mission: 'enumerate', code: '', wheelCount: model.wheels.length, index: 0, previousIndex: 0, visited: [], commandOrder: [] })}>К перебору</button>}</div>
    <div className="combination-lock__variants" role="group" aria-label="Все комбинации замка" style={{gridTemplateColumns:`repeat(${model.total<=4?model.total:model.total<=16?4:6},minmax(0,1fr))`}}>
      {variants.map(index => <button type="button" key={index} className={`${visited.has(index) ? lockMatches(model, index, state.mission) ? 'is-visited' : 'is-rejected' : 'is-unknown'}${index === state.index ? ' is-current' : ''}`} aria-label={visited.has(index) ? `${lockWord(model, index)}: ${lockMatches(model, index, state.mission) ? 'найденный пароль' : 'не подходит'}` : `Ещё не найденный пароль ${index + 1}`} aria-pressed={index === state.index} disabled={disabled || !visited.has(index)} onClick={() => jump(index)}>{visited.has(index) && lockMatches(model, index, state.mission) && <Check size={11} />}<span>{visited.has(index) ? lockWord(model, index) : '???'}</span></button>)}
    </div>
    <footer className="combination-lock__actions"><button type="button" disabled={disabled} onClick={() => onChange({ index: 0, previousIndex: 0, visited: [], direction: -1 })}><RotateCcw size={15} />Сначала</button><button type="button" className="combination-lock__next" disabled={disabled || (state.index === model.total - 1 && visited.has(state.index))} onClick={() => jump(visited.has(state.index) ? state.index + 1 : state.index)}>{visited.has(state.index) ? 'Следующий пароль' : 'Попробовать пароль'}<ArrowRight size={16} /></button></footer>
  </section>;
}

export function CombinationLockSettings({ params, onChange, disabled }) {
  const [draft, setDraft] = useState(params.code), [error, setError] = useState('');
  const [previousCode, setPreviousCode] = useState(params.code);
  if (previousCode !== params.code) { setPreviousCode(params.code); setDraft(params.code); setError(''); }
  return <div className="combination-lock-settings"><label>Начальные позиции<select aria-label="Начальные позиции замка" value={params.wheelCount || combinationLockModel(params).wheels.length} disabled={disabled} onChange={event => { setDraft(''); onChange({ code: '', wheelCount: Number(event.target.value) }); }}>{[1,2,3].map(count => <option key={count} value={count}>{count} {count === 1 ? 'буква' : 'буквы'} · без готового кода</option>)}</select></label><label>Начальный Python-код · можно оставить пустым<textarea aria-label="Начальные циклы кодового замка" value={draft} disabled={disabled} spellCheck={false} maxLength={LOCK_CODE_LIMIT} onChange={event => setDraft(event.target.value)} /></label>
    <button type="button" disabled={disabled} onClick={() => { try { onChange(normalizeLockParams({ code: draft, wheelCount: params.wheelCount })); setError(''); } catch (failure) { setError(failure.message); } }}>Сохранить начало</button>{error && <small role="alert">{error}</small>}
  </div>;
}
