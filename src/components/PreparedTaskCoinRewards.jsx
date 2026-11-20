import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Coins, X} from 'lucide-react';
import './PreparedTaskCoinRewards.css';

const amounts = [5, 10, 20];

export default function PreparedTaskCoinRewards({participants, rewards = [], disabled, onAward}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [amount, setAmount] = useState('5');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const inFlight = useRef(false);
  const titleId = useId();
  const awarded = new Map(rewards.map(reward => [reward.id, reward.amount]));
  const eligible = participants.filter(student => !awarded.has(student.id));
  const selectedIds = eligible.filter(student => selected.includes(student.id)).map(student => student.id);
  const coins = Number(amount);
  const validAmount = Number.isSafeInteger(coins) && coins > 0;

  useEffect(() => {
    if (!open) return undefined;
    const current = dialog.current;
    current.showModal();
    return () => current.close();
  }, [open]);

  function show() {
    setSelected(eligible.length === 1 ? [eligible[0].id] : []);
    setError('');
    setOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || !selectedIds.length || !validAmount) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await onAward(selectedIds, coins);
      setOpen(false);
    } catch (failure) {
      setError(failure.message || 'Не удалось начислить монеты.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (!participants.length && !rewards.length) return null;
  return <div className="prepared-coin-rewards">
    {eligible.length > 0 && <button type="button" className="prepared-coin-award" disabled={disabled} onClick={show}>
      <Coins size={15} aria-hidden="true"/> Наградить
    </button>}
    <div className="prepared-coin-receipts" aria-live="polite">
      {rewards.map(({id, name, amount}) => <span key={id} className="prepared-coin-receipt">
        <span>{name}</span><strong>+{amount.toLocaleString('ru-RU')} <Coins size={12} aria-label="монет"/></strong>
      </span>)}
    </div>
    {open && createPortal(<dialog ref={dialog} className="prepared-coin-dialog" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); if (!inFlight.current) setOpen(false); }}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <form onSubmit={submit}>
        <header>
          <h2 id={titleId}><Coins size={21} aria-hidden="true"/> Наградить за задачу</h2>
          <button type="button" className="prepared-coin-close" aria-label="Закрыть" disabled={pending} onClick={() => setOpen(false)}>
            <X size={19} aria-hidden="true"/>
          </button>
        </header>
        <fieldset disabled={pending}>
          <legend>Кому начислить</legend>
          <div className="prepared-coin-students">
            {participants.map(student => {
              const previous = awarded.get(student.id);
              return <label key={student.id}>
                <input type="checkbox" checked={previous !== undefined || selected.includes(student.id)}
                  disabled={previous !== undefined} onChange={() => setSelected(ids =>
                    ids.includes(student.id) ? ids.filter(id => id !== student.id) : [...ids, student.id])}/>
                <span>{student.name}</span>
                {previous !== undefined && <small>Начислено +{previous.toLocaleString('ru-RU')}</small>}
              </label>;
            })}
          </div>
        </fieldset>
        <fieldset disabled={pending}>
          <legend>Монет каждому</legend>
          <div className="prepared-coin-amount">
            {amounts.map(value => <button key={value} type="button" aria-pressed={coins === value}
              onClick={() => setAmount(String(value))}>{value}</button>)}
            <input type="number" aria-label="Монет каждому" inputMode="numeric" min="1" step="1"
              value={amount} onChange={event => setAmount(event.target.value)} required/>
          </div>
        </fieldset>
        {error && <p className="prepared-coin-error" role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={pending} onClick={() => setOpen(false)}>Отмена</button>
          <button type="submit" className="prepared-coin-submit" disabled={pending || !selectedIds.length || !validAmount}>
            {pending ? 'Начисляем…' : 'Начислить'}
          </button>
        </footer>
      </form>
    </dialog>, document.fullscreenElement || document.body)}
  </div>;
}
