import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Columns2, Layers3, MoreHorizontal, Pencil, Plus, Trash2, Presentation, X } from 'lucide-react';
import { DEFAULT_COLLAB_SOLUTION_ID } from '../utils/collabSolutions';
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
  onDelete,
  onCompare,
  canPresent = false,
  presenting = false,
  followingName = '',
  onPresent,
  compareId = null,
  disabled = false,
  readOnly = false,
  dark = false,
  peers = [],
}) {
  const inputId = useId();
  const formId = useId();
  const actionsId = useId();
  const tabsRef = useRef(null);
  const actionsRef = useRef(null);
  const actionsButtonRef = useRef(null);
  const [form, setForm] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [choosingComparison, setChoosingComparison] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const activeSolution = solutions.find((solution) => solution.id === activeId);
  const comparisonSolution = solutions.find((solution) => solution.id === compareId);
  const otherSolutions = solutions.filter((solution) => solution.id !== activeId);
  const canEdit = !disabled && !readOnly;
  const comparing = Boolean(compareId && comparisonSolution && compareId !== activeId);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return undefined;
    const updateTabs = () => {
      setTabsOverflow(tabs.scrollWidth > tabs.clientWidth + 2);
      const selected = tabs.querySelector('[aria-selected="true"]');
      if (!selected) return;
      const viewport = tabs.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      if (selectedRect.left < viewport.left) {
        tabs.scrollLeft += selectedRect.left - viewport.left - 4;
      } else if (selectedRect.right > viewport.right) {
        tabs.scrollLeft += selectedRect.right - viewport.right + 4;
      }
    };
    updateTabs();
    const observer = new ResizeObserver(updateTabs);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [activeId, solutions]);

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const closeOutside = (event) => {
      if (!actionsRef.current?.contains(event.target)) setActionsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setActionsOpen(false);
      actionsButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [actionsOpen]);

  const cancelForm = () => {
    setForm(null);
    setError('');
  };

  const openForm = (kind) => {
    setActionsOpen(false);
    setChoosingComparison(false);
    setName(kind === 'rename' ? activeSolution?.name || '' : nextSolutionName(solutions));
    setForm({ kind, id: activeId });
    setError('');
  };

  const selectSolution = (id) => {
    cancelForm();
    setActionsOpen(false);
    setChoosingComparison(false);
    onSelect?.(id);
  };

  const saveName = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!form || form.id !== activeId || (form.kind !== 'delete' && !trimmedName) || !canEdit || saving) return;
    setSaving(true);
    setError('');
    try {
      if (form.kind === 'delete') await onDelete?.(form.id);
      else if (form.kind === 'rename') await onRename?.(form.id, trimmedName);
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
    selectSolution(next.id);
    tabsRef.current?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <div className={`collab-solutions${dark ? ' collab-solutions--dark' : ''}`}>
      <div className="collab-solutions__row">
        <div className="collab-solutions__heading">
          <span className="collab-solutions__title"><Layers3 size={14} aria-hidden="true" />Варианты кода</span>
          {(solutions.length > 4 || tabsOverflow) && (
            <div className="collab-solutions__all">
              <select
                aria-label={`Все варианты кода (${solutions.length})`}
                value=""
                disabled={disabled}
                onChange={(event) => selectSolution(event.target.value)}
              >
                <option value="" disabled>Все · {solutions.length}</option>
                {solutions.map((solution) => <option key={solution.id} value={solution.id}>{solution.name}{solution.id === activeId ? ' (открыт)' : ''}</option>)}
              </select>
              <ChevronDown size={12} aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="collab-solutions__actions">
          {!readOnly && (
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
                <span>Создать копию</span>
              </button>
          )}
          <button
            type="button"
            className={`collab-solutions__button${comparing || choosingComparison ? ' is-active' : ''}`}
            onClick={() => {
              cancelForm();
              setActionsOpen(false);
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
          {!readOnly && (
            <div className="collab-solutions__more" ref={actionsRef}>
              <button
                ref={actionsButtonRef}
                type="button"
                className={`collab-solutions__button${actionsOpen ? ' is-active' : ''}`}
                onClick={() => { cancelForm(); setActionsOpen((open) => !open); }}
                disabled={!canEdit || !activeSolution || saving}
                aria-controls={actionsOpen ? actionsId : undefined}
                aria-expanded={actionsOpen}
                title={`Действия с вариантом «${activeSolution?.name || ''}»`}
              >
                <MoreHorizontal size={16} aria-hidden="true" />
                <span>Ещё</span>
              </button>
              {actionsOpen && canEdit && activeSolution && (
                <div id={actionsId} className="collab-solutions__menu">
                  <span className="collab-solutions__menu-label" title={activeSolution.name}>{activeSolution.name}</span>
                  <button type="button" className="collab-solutions__button" onClick={() => openForm('rename')}>
                    <Pencil size={14} aria-hidden="true" />Переименовать
                  </button>
                  {activeSolution.id !== DEFAULT_COLLAB_SOLUTION_ID && (
                    <button type="button" className="collab-solutions__button collab-solutions__delete" onClick={() => openForm('delete')}>
                      <Trash2 size={14} aria-hidden="true" />Удалить копию
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="collab-solutions__tabs-row">
        <div className="collab-solutions__tabs" role="tablist" aria-label="Варианты кода" ref={tabsRef}>
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
                onClick={() => selectSolution(solution.id)}
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
      </div>

      {form && form.id === activeId && !readOnly && solutions.some((item) => item.id === form.id) && (
        <form id={formId} className="collab-solutions__form" onSubmit={saveName}>
          {form.kind === 'delete' ? (
            <>
              <span>Удалить «{solutions.find((item) => item.id === form.id)?.name}» у всех участников?</span>
              <button type="submit" className="collab-solutions__button collab-solutions__delete" disabled={!canEdit || saving}>Удалить копию</button>
              <button type="button" className="collab-solutions__button" onClick={cancelForm} disabled={saving}>Отмена</button>
            </>
          ) : (
            <>
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
            </>
          )}
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
          {comparing && canPresent && (
            <button type="button" className={`collab-solutions__button${presenting ? ' is-active' : ''}`} onClick={onPresent} disabled={disabled}>
              <Presentation size={16} />
              {presenting ? 'Завершить показ' : 'Показать ученику'}
            </button>
          )}
          {comparing && <span className="collab-solutions__scope" role="status">
            {followingName ? `${followingName} показывает сравнение` : presenting ? 'Совместный показ включён' : 'Видно только вам'}
          </span>}
          <button
            type="button"
            className="collab-solutions__icon-button"
            aria-label={followingName ? 'Выйти из показа' : 'Закрыть сравнение'}
            title={followingName ? 'Выйти из показа' : 'Закрыть сравнение'}
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
