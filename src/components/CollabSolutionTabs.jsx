import { useEffect, useId, useRef, useState } from 'react';
import { Check, Columns2, MoreHorizontal, Pencil, Plus, Trash2, Presentation, X } from 'lucide-react';
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
  onReorder,
  canReorder = false,
  participants = [],
  activeParticipantId = '',
  onSelectParticipant,
  onReorderParticipants,
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
  const dragSessionRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [form, setForm] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [choosingComparison, setChoosingComparison] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [dragging, setDragging] = useState(null);
  const hasParticipantTabs = participants.length > 0;
  const visibleSolutionTabs = hasParticipantTabs
    ? solutions.filter((solution) => solution.id !== DEFAULT_COLLAB_SOLUTION_ID)
    : solutions;
  const tabEntries = [
    ...participants.map((participant) => ({ ...participant, key: `participant:${participant.id}`, kind: 'participant' })),
    ...visibleSolutionTabs.map((solution) => ({ ...solution, key: `solution:${solution.id}`, kind: 'solution' })),
  ];
  const activeSolution = solutions.find((solution) => solution.id === activeId);
  const comparisonSolution = solutions.find((solution) => solution.id === compareId);
  const otherSolutions = solutions.filter((solution) => solution.id !== activeId);
  const canEdit = !disabled && !readOnly;
  const comparing = Boolean(compareId && comparisonSolution && compareId !== activeId);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return undefined;
    const updateTabs = () => {
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

  useEffect(() => () => {
    const session = dragSessionRef.current;
    if (session?.timer) window.clearTimeout(session.timer);
  }, []);

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

  const selectTabEntry = (entry) => {
    if (!entry) return;
    if (entry.kind === 'participant') onSelectParticipant?.(entry.id);
    else selectSolution(entry.id);
  };

  const moveTabFocus = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabEntries.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index + tabEntries.length - 1) % tabEntries.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabEntries.length - 1;
    else return;
    event.preventDefault();
    const next = tabEntries[nextIndex];
    if (!next || disabled) return;
    selectTabEntry(next);
    tabsRef.current?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };

  const finishTabDrag = (event, cancelled = false) => {
    const session = dragSessionRef.current;
    if (!session || (event?.pointerId != null && event.pointerId !== session.pointerId)) return;
    dragSessionRef.current = null;
    if (session.timer) window.clearTimeout(session.timer);
    window.removeEventListener('pointermove', session.handleMove, true);
    window.removeEventListener('pointerup', session.handleUp, true);
    window.removeEventListener('pointercancel', session.handleCancel, true);
    const currentDrag = session.dragging;
    setDragging(null);
    if (!currentDrag || cancelled || !currentDrag.overKey || currentDrag.overKey === currentDrag.key) return;
    const source = currentDrag.kind === 'participant'
      ? participants.map((item) => item.id)
      : visibleSolutionTabs.map((item) => item.id);
    const draggedId = currentDrag.key.split(':').slice(1).join(':');
    const overId = currentDrag.overKey.split(':').slice(1).join(':');
    const next = source.filter((id) => id !== draggedId);
    const overIndex = next.indexOf(overId);
    if (overIndex < 0) return;
    next.splice(overIndex + (currentDrag.side === 'after' ? 1 : 0), 0, draggedId);
    if (currentDrag.kind === 'participant') onReorderParticipants?.(next);
    else if (hasParticipantTabs) onReorder?.([DEFAULT_COLLAB_SOLUTION_ID, ...next]);
    else onReorder?.(next);
  };

  const startTabLongPress = (event, entry) => {
    const entryCanReorder = canReorder && (
      entry.kind === 'participant' ? typeof onReorderParticipants === 'function' : typeof onReorder === 'function'
    );
    if (!entryCanReorder || disabled || event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const session = {
      pointerId: event.pointerId,
      entry,
      dragging: null,
      timer: null,
      handleMove: null,
      handleUp: null,
      handleCancel: null,
    };
    session.timer = window.setTimeout(() => {
      if (dragSessionRef.current !== session) return;
      suppressClickRef.current = true;
      session.dragging = { key: entry.key, kind: entry.kind, overKey: entry.key, side: 'before' };
      setDragging(session.dragging);
      try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* no-op */ }
    }, 320);
    session.handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== session.pointerId) return;
      if (!session.dragging) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 8) {
          window.clearTimeout(session.timer);
          session.timer = null;
        }
        return;
      }
      moveEvent.preventDefault();
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.('[data-collab-tab-key]');
      const overKey = target?.dataset?.collabTabKey || '';
      const overKind = target?.dataset?.collabTabKind || '';
      if (!overKey || overKind !== entry.kind) return;
      const rect = target.getBoundingClientRect();
      const nextDrag = {
        ...session.dragging,
        overKey,
        side: moveEvent.clientX >= rect.left + rect.width / 2 ? 'after' : 'before',
      };
      session.dragging = nextDrag;
      setDragging(nextDrag);
    };
    session.handleUp = (upEvent) => finishTabDrag(upEvent, false);
    session.handleCancel = (cancelEvent) => finishTabDrag(cancelEvent, true);
    dragSessionRef.current = session;
    window.addEventListener('pointermove', session.handleMove, { capture: true, passive: false });
    window.addEventListener('pointerup', session.handleUp, true);
    window.addEventListener('pointercancel', session.handleCancel, true);
  };

  const renderTab = (entry, index) => {
    const isParticipant = entry.kind === 'participant';
    const selected = isParticipant
      ? entry.id === activeParticipantId && activeId === DEFAULT_COLLAB_SOLUTION_ID
      : entry.id === activeId;
    const viewers = (!isParticipant || entry.id === activeParticipantId)
      ? peers.filter((peer) => peer.solutionId === (isParticipant ? DEFAULT_COLLAB_SOLUTION_ID : entry.id))
      : [];
    const viewerNames = viewers.map((peer) => peer.name || 'Участник').join(', ');
    const isDragged = dragging?.key === entry.key;
    const isDropTarget = dragging?.overKey === entry.key && dragging?.key !== entry.key;
    return (
      <button
        key={entry.key}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-grabbed={isDragged || undefined}
        tabIndex={selected ? 0 : -1}
        data-collab-tab-key={entry.key}
        data-collab-tab-kind={entry.kind}
        className={`collab-solutions__tab${selected ? ' is-active' : ''}${isParticipant ? ' is-participant' : ''}${isDragged ? ' is-dragging' : ''}${isDropTarget ? ` is-drop-${dragging.side}` : ''}`}
        disabled={disabled}
        onPointerDown={(event) => startTabLongPress(event, entry)}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          selectTabEntry(entry);
        }}
        onKeyDown={(event) => moveTabFocus(event, index)}
        onContextMenu={(event) => { if (canReorder) event.preventDefault(); }}
        title={`${viewerNames ? `${entry.name} · Смотрят: ${viewerNames}` : entry.name}${canReorder ? ' · Удерживайте, чтобы переместить' : ''}`}
      >
        <span className="collab-solutions__name">{entry.name}</span>
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
  };

  return (
    <div className={`collab-solutions${dark ? ' collab-solutions--dark' : ''}`}>
      <div className="collab-solutions__row">
        <div className="collab-solutions__tabs-row">
          <div className="collab-solutions__tabs" role="tablist" aria-label="Варианты кода" ref={tabsRef}>
            {tabEntries.map(renderTab)}
          </div>
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
            aria-label="Сравнить варианты кода"
            aria-expanded={comparing || choosingComparison}
            title={otherSolutions.length ? 'Сравнить код двух вариантов' : 'Создайте ещё один вариант для сравнения'}
          >
            <Columns2 size={15} />
            <span>Сравнить</span>
          </button>
          {!readOnly && (!hasParticipantTabs || activeSolution?.id !== DEFAULT_COLLAB_SOLUTION_ID) && (
            <div className="collab-solutions__more" ref={actionsRef}>
              <button
                ref={actionsButtonRef}
                type="button"
                className={`collab-solutions__button${actionsOpen ? ' is-active' : ''}`}
                onClick={() => { cancelForm(); setActionsOpen((open) => !open); }}
                disabled={!canEdit || !activeSolution || saving}
                aria-label="Действия с выбранным вариантом"
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
                  {(!hasParticipantTabs || activeSolution.id !== DEFAULT_COLLAB_SOLUTION_ID) && (
                    <button type="button" className="collab-solutions__button" onClick={() => openForm('rename')}>
                      <Pencil size={14} aria-hidden="true" />Переименовать
                    </button>
                  )}
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
