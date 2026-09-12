import { useId, useRef, useState } from 'react';
import { Check, Columns2, Pencil, Plus, X } from 'lucide-react';
import './CollabSolutionTabs.css';

const MAX_NAME_LENGTH = 48;

function nextSolutionName(solutions) {
  const names = new Set(solutions.map(({ name }) => name.trim().toLocaleLowerCase('ru')));
  if (!names.has('мой вариант')) return 'Мой вариант';
  let index = 1;
  while (names.has(`черновик ${index}`)) index += 1;
  return `Черновик ${index}`;
}

export default function CollabSolutionTabs({
  solutions = [],
  activeId,
  onSelect,
  onCreate,
  onRename,
  onCompare,
  compareId = null,
  disabled = false,
  readOnly = false,
  dark = false,
  peers = [],
}) {
  const inputId = useId();
  const formId = useId();
  const tabsRef = useRef(null);
  const [form, setForm] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [choosingComparison, setChoosingComparison] = useState(false);
  const activeSolution = solutions.find((solution) => solution.id === activeId);
  const comparisonSolution = solutions.find((solution) => solution.id === compareId);
  const otherSolutions = solutions.filter((solution) => solution.id !== activeId);
  const canEdit = !disabled && !readOnly;
  const comparing = Boolean(compareId && comparisonSolution && compareId !== activeId);

  const cancelForm = () => {
    setForm(null);
    setError('');
  };

  const openForm = (kind) => {
    setName(kind === 'rename' ? activeSolution?.name || '' : nextSolutionName(solutions));
    setForm({ kind, id: activeId });
    setError('');
  };

  const saveName = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!form || !trimmedName || !canEdit || saving) return;
    setSaving(true);
    setError('');
    try {
      if (form.kind === 'rename') await onRename?.(form.id, trimmedName);
      else await onCreate?.(trimmedName);
      setForm(null);
    } catch (cause) {
      setError(cause?.message || 'Не удалось сохранить название. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  const moveTabFocus = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % solutions.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index + solutions.length - 1) % solutions.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = solutions.length - 1;
    else return;
    event.preventDefault();
    const next = solutions[nextIndex];
    if (!next || disabled) return;
    cancelForm();
    onSelect?.(next.id);
    tabsRef.current?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <div className={`collab-solutions${dark ? ' collab-solutions--dark' : ''}`}>
      <div className="collab-solutions__row">
        <div className="collab-solutions__tabs" role="tablist" aria-label="Варианты решения" ref={tabsRef}>
          {solutions.map((solution, index) => {
            const selected = solution.id === activeId;
            const viewers = peers.filter((peer) => peer.solutionId === solution.id);
            const viewerNames = viewers.map((peer) => peer.name || 'Участник').join(', ');
            return (
              <button
                key={solution.id}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`collab-solutions__tab${selected ? ' is-active' : ''}`}
                disabled={disabled}
                onClick={() => { cancelForm(); onSelect?.(solution.id); }}
                onKeyDown={(event) => moveTabFocus(event, index)}
                title={viewerNames ? `${solution.name} · Смотрят: ${viewerNames}` : solution.name}
              >
                <span className="collab-solutions__name">{solution.name}</span>
                {viewers.length > 0 && (
                  <span className="collab-solutions__peers" aria-label={`Смотрят: ${viewerNames}`}>
                    {viewers.slice(0, 2).map((peer) => (
                      <span className="collab-solutions__peer" key={peer.id} aria-hidden="true">
                        {(peer.name || 'У')[0].toLocaleUpperCase('ru')}
                      </span>
                    ))}
                    {viewers.length > 2 && <span className="collab-solutions__peer-more" aria-hidden="true">+{viewers.length - 2}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="collab-solutions__actions">
          {!readOnly && (
            <>
              <button
                type="button"
                className="collab-solutions__icon-button"
                onClick={() => openForm('rename')}
                disabled={!canEdit || !activeSolution || saving}
                title="Переименовать текущий вариант"
                aria-label="Переименовать текущий вариант"
                aria-controls={form?.kind === 'rename' ? formId : undefined}
                aria-expanded={form?.kind === 'rename'}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                className="collab-solutions__button collab-solutions__create"
                onClick={() => openForm('create')}
                disabled={!canEdit || !activeSolution || saving}
                title="Создать копию текущего решения, ввода и результата"
                aria-label="Создать копию текущего решения"
                aria-controls={form?.kind === 'create' ? formId : undefined}
                aria-expanded={form?.kind === 'create'}
              >
                <Plus size={16} />
                <span>Копия</span>
              </button>
            </>
          )}
          <button
            type="button"
            className={`collab-solutions__button${comparing || choosingComparison ? ' is-active' : ''}`}
            onClick={() => {
              if (comparing || choosingComparison) {
                onCompare?.(null);
                setChoosingComparison(false);
              } else setChoosingComparison(true);
            }}
            disabled={disabled || otherSolutions.length === 0}
            aria-expanded={comparing || choosingComparison}
            title={otherSolutions.length ? 'Сравнить код двух вариантов' : 'Создайте ещё один вариант для сравнения'}
          >
            <Columns2 size={15} />
            <span>Сравнить</span>
          </button>
        </div>
      </div>

      {form && !readOnly && (
        <form id={formId} className="collab-solutions__form" onSubmit={saveName}>
          <label htmlFor={inputId}>{form.kind === 'create' ? 'Название копии' : 'Название варианта'}</label>
          <input
            key={`${form.kind}-${form.id}`}
            id={inputId}
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !saving) {
                event.preventDefault();
                cancelForm();
              }
            }}
            ref={(element) => {
              if (element && element.dataset.initialFocus !== 'true') {
                element.dataset.initialFocus = 'true';
                element.focus();
                element.select();
              }
            }}
            disabled={!canEdit || saving}
            autoComplete="off"
            required
          />
          <button type="submit" className="collab-solutions__button is-active" disabled={!name.trim() || !canEdit || saving}>
            <Check size={15} />
            {saving ? 'Сохраняем…' : form.kind === 'create' ? 'Создать' : 'Сохранить'}
          </button>
          <button type="button" className="collab-solutions__icon-button" onClick={cancelForm} disabled={saving} aria-label="Отменить ввод названия" title="Отмена (Esc)">
            <X size={16} />
          </button>
          {error && <span role="alert" className="collab-solutions__error">{error}</span>}
        </form>
      )}

      {(comparing || choosingComparison) && (
        <div className="collab-solutions__comparison">
          <span className="collab-solutions__comparison-label">«{activeSolution?.name || 'Текущий вариант'}» сравнить с</span>
          <select
            aria-label="Вариант для сравнения"
            value={comparing ? compareId : ''}
            disabled={disabled}
            onChange={(event) => {
              onCompare?.(event.target.value || null);
              setChoosingComparison(true);
            }}
          >
            <option value="">Выберите вариант</option>
            {otherSolutions.map((solution) => <option key={solution.id} value={solution.id}>{solution.name}</option>)}
          </select>
          <button
            type="button"
            className="collab-solutions__icon-button"
            aria-label="Закрыть сравнение"
            title="Закрыть сравнение"
            onClick={() => {
              onCompare?.(null);
              setChoosingComparison(false);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
